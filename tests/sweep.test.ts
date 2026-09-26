/**
 * Variation sweep: runs every mode over a wide grid of inputs and checks the results against
 * independent physical and rule invariants (not against the engine's own numbers).
 */
import { describe, expect, it } from 'vitest';
import {
  CYLINDERS, Cylinder, DEFAULT_SETTINGS, DecoGasSpec, DivePlan, GENERIC_STANDARD, GUE_STANDARD, Gas, GasStandard, PlanSettings,
  SURFACE_PRESSURE_BAR, backGasPlan, ceilingBar, gradientFactorNow, depthToAmbient, gasName, initialTissues, loadSegment, minimumGas, ndl,
  planConsumption, planDive, planPenetration, planRecreational, ppO2, recreationalProfile, simulateSidemount, stopTable,
  TeamMember, Agency, Flow, StageRule,
} from '../src/engine';

const amb = depthToAmbient;
const cyl = (prefix: string): Cylinder => CYLINDERS.find((c) => c.name.startsWith(prefix))!;
const D12 = cyl('D12 (2×12 L, 200'), S12 = cyl('Single 12'), S15 = cyl('Single 15'), S80 = cyl('AL80'), D10 = cyl('D10');

interface Worst { value: number; where: string }
const worst = (): Worst => ({ value: -Infinity, where: '' });
const note = (w: Worst, v: number, where: string) => { if (v > w.value) { w.value = v; w.where = where; } };

/**
 * Replays a profile on fresh tissues, sampling linear segments in ≤ 0.5 m slices. Returns the worst
 * excess of the ceiling over the current depth (m) for a GF-at-depth function, and the surfacing GF check.
 */
function replay(plan: DivePlan, gfAt: (d: number) => number) {
  const t = initialTissues();
  let worstExcess = -Infinity;
  for (const s of plan.segments) {
    if (s.duration <= 0) continue;
    const steps = Math.max(1, Math.ceil(Math.abs(s.endDepth - s.startDepth) / 0.5), s.startDepth === s.endDepth ? Math.ceil(s.duration) : 0);
    for (let i = 0; i < steps; i++) {
      const d0 = s.startDepth + ((s.endDepth - s.startDepth) * i) / steps;
      const d1 = s.startDepth + ((s.endDepth - s.startDepth) * (i + 1)) / steps;
      loadSegment(t, s.gas, d0, d1, s.duration / steps);
      // only ascending / level segments matter for the obligation; descent onloads below ambient
      if (s.kind !== 'descent') worstExcess = Math.max(worstExcess, (ceilingBar(t, gfAt(d1)) - amb(d1)) / 0.1);
    }
  }
  return { worstExcess, tissues: t };
}

/** Air as listed by a standard (GUE lists it as an optional, never auto-picked bottom gas). */
const std0Air = () => (std: GasStandard): Gas => std.bottomGases.find((b) => b.gas.o2 === 0.21 && b.gas.he === 0)!.gas;

/* ---------------------------------------------------------------- technical ---------------------------------------------------------------- */
describe('technical (open water deco) sweep', () => {
  const depths = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110, 120];
  const times = [10, 20, 30, 45, 60];
  const gfs: [number, number][] = [[0.2, 0.85], [0.3, 0.7], [0.5, 0.8], [0.85, 0.85], [1, 1]];
  const stds: GasStandard[] = [GUE_STANDARD, GENERIC_STANDARD];
  const decoSets = (std: GasStandard, d: number): [string, DecoGasSpec[]][] => [
    ['recommended', std.recommendedDecoGasesFor(d).map((x) => ({ gas: x.gas, switchDepth: x.switchDepth }))],
    ['none', []],
    ['all', std.decoGases.filter((x) => x.switchDepth < d).map((x) => ({ gas: x.gas, switchDepth: x.switchDepth }))],
  ];

  it('profiles are consistent, never violate the GF-scaled M-values, gases are within limits, gas maths add up', () => {
    let n = 0;
    const excess = worst(), surfGf = worst(), sumErr = worst(), gasErr = worst(), minGasErr = worst(), stopSumErr = worst();
    const problems: string[] = [];
    const impossible: string[] = [];
    const AIR = std0Air();
    for (const std of stds) for (const d of depths) for (const bottom of [std.bottomGasFor(d)?.gas ?? std.bottomGases[std.bottomGases.length - 1].gas, ...(d <= 40 ? [AIR(std)] : [])]) {
      for (const bt of times) for (const [low, high] of gfs) for (const [setName, deco] of decoSets(std, d)) for (const last of [3, 6]) for (const at of ['next', 'current'] as const) {
        const settings: Partial<PlanSettings> = { ...DEFAULT_SETTINGS, gf: { low, high }, lastStopDepth: last, gfEvalAt: at, ascentRateShallowMpm: std.ascentRateShallowMpm, ppO2Working: std.limits.bottomPpO2Working, ppO2Max: std.limits.bottomPpO2Max, decoPpO2Max: std.limits.decoPpO2Max };
        const where = `${std.id} ${d}m/${bt}min ${gasName(bottom)} GF${low * 100}/${high * 100} deco:${setName} last${last} ${at}`;
        const p = planDive({ maxDepth: d, bottomTime: bt, bottomGas: bottom, decoGases: deco, settings });
        n++;
        // 1. profile integrity
        let rt = 0, prevEnd = 0;
        for (const s of p.segments) {
          if (!Number.isFinite(s.duration) || s.duration < 0) problems.push(`bad duration ${where}`);
          if (Math.abs(s.startDepth - prevEnd) > 1e-6) problems.push(`gap ${where}`);
          rt += s.duration; prevEnd = s.endDepth;
          if (Math.abs(rt - s.runtime) > 1e-6) problems.push(`runtime drift ${where}`);
        }
        note(sumErr, Math.abs(rt - p.runtime), where);
        if (Math.abs(prevEnd) > 1e-9) problems.push(`does not surface ${where}`);
        if (p.warnings.some((w) => w.code === 'stopTooLong')) {
          // physically impossible ascent (e.g. hypoxic trimix at the last stop, no deco gas): the app blocks it
          impossible.push(where);
          continue;
        }
        // 2. decompression safety, independent replay: the M-values scaled by GF high are never exceeded, and the
        //    diver surfaces within GF high
        const r = replay(p, () => high);
        note(excess, r.worstExcess, where);
        note(surfGf, gradientFactorNow(r.tissues, SURFACE_PRESSURE_BAR) - high, where);
        // 3. every stop is breathed on the richest carried gas that is allowed at that depth, within the deco pO2 limit
        for (const s of p.segments) {
          if (s.kind !== 'stop' && s.kind !== 'switch') continue;
          const allowed = deco.filter((x) => x.switchDepth + 1e-9 >= s.startDepth).sort((a, b) => a.switchDepth - b.switchDepth)[0];
          const expected = allowed?.gas ?? bottom;
          if (s.gas !== expected) problems.push(`wrong gas at ${s.startDepth} m (${gasName(s.gas)} vs ${gasName(expected)}) ${where}`);
          if (s.gas !== bottom && ppO2(s.gas, s.startDepth) > std.limits.decoPpO2Max + 0.02) problems.push(`deco pO2 ${ppO2(s.gas, s.startDepth).toFixed(2)} ${where}`);
        }
        // 4. pO2 warning matches the bottom gas
        const hasMax = p.warnings.some((w) => w.code === 'ppo2AboveMax');
        if (hasMax !== ppO2(bottom, d) > std.limits.bottomPpO2Max) problems.push(`ppO2 warning mismatch ${where}`);
        // 5. stop table adds up to the stop + timed switch segments
        const segStops = p.segments.filter((s) => s.kind === 'stop' || (s.kind === 'switch' && s.startDepth > 0)).reduce((a, s) => a + s.duration, 0);
        note(stopSumErr, Math.abs(stopTable(p).reduce((a, s) => a + s.minutes, 0) - segStops), where);
        // 6. consumption = Σ SAC × mean ambient × minutes (bottom SAC on descent/bottom, deco SAC after)
        const us = planConsumption(p, 20, 15);
        let indep = 0;
        for (const s of p.segments) indep += (s.kind === 'descent' || s.kind === 'bottom' ? 20 : 15) * ((amb(s.startDepth) + amb(s.endDepth)) / 2) * s.duration;
        note(gasErr, Math.abs(us.reduce((a, u) => a + u.litres, 0) - indep), where);
        // 7. minimum gas (2 divers × 20 l/min, 1 min at depth, 9 m/min to the first switch or 6 m, then 3 m/min)
        const firstSwitch = deco.length ? Math.max(...deco.map((x) => x.switchDepth)) : 0;
        const to = Math.min(firstSwitch, d);
        const mg = minimumGas(d, D12, { toDepth: to });
        const fast = Math.max(to, 6);
        let mgL = 40 * amb(d);
        if (d > fast) mgL += 40 * ((amb(d) + amb(fast)) / 2) * ((d - fast) / 9);
        if (to < 6) { const f = Math.min(d, 6); mgL += 40 * ((amb(f) + amb(to)) / 2) * ((f - to) / 3); }
        note(minGasErr, Math.abs(mg.litres - mgL), where);
        // 8. back gas verdict is exactly "bottom phase + ascent on back gas ≤ start − minimum gas"
        const bgp = backGasPlan(p, D12, 200, 20, 15, Math.ceil(mg.bar / 10) * 10);
        if (bgp.ok !== (bgp.bottomPhaseBar + bgp.ascentOnBackGasBar <= 200 - Math.ceil(mg.bar / 10) * 10)) problems.push(`back gas verdict ${where}`);
      }
    }
    console.log(`technical: ${impossible.length} plans cannot be finished (blocked as stopTooLong), e.g. ${impossible.slice(0, 3).join(' | ')}; deco sets: ${[...new Set(impossible.map((w) => w.split('deco:')[1].split(' ')[0]))].join(',')}`);
    const byKind = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((a, x) => { const k = x.split(/ (gue|generic|tdi|iantd) /)[0]; a[k] = (a[k] ?? 0) + 1; return a; }, {}));
    console.log('technical problems by kind:', JSON.stringify(byKind(problems)));
    console.log(`technical: ${n} plans; worst ceiling over depth at GF high ${excess.value.toFixed(3)} m (${excess.where}); worst surfacing GF over GF high ${(surfGf.value * 100).toFixed(3)} % (${surfGf.where}); runtime err ${sumErr.value.toExponential(1)}; stop-table err ${stopSumErr.value.toFixed(2)} min (${stopSumErr.where}); gas err ${gasErr.value.toExponential(1)} L; min gas err ${minGasErr.value.toExponential(1)} L`);
    expect(problems.slice(0, 20)).toEqual([]);
    expect(excess.value).toBeLessThan(0.01);
    expect(surfGf.value).toBeLessThanOrEqual(1e-6);
    expect(sumErr.value).toBeLessThan(1e-6);
    expect(gasErr.value).toBeLessThan(1e-6);
    expect(minGasErr.value).toBeLessThan(1e-6);
  }, 600_000);

  it('longer bottom time never shortens the dive; a more conservative GF high never shortens the deco', () => {
    const problems: string[] = [];
    for (const std of stds) for (const d of depths) {
      const bottom = std.bottomGasFor(d)?.gas ?? std.bottomGases[std.bottomGases.length - 1].gas;
      const deco = std.recommendedDecoGasesFor(d).map((x) => ({ gas: x.gas, switchDepth: x.switchDepth }));
      const base = { ascentRateShallowMpm: std.ascentRateShallowMpm, lastStopDepth: std.lastStopDepth };
      let prev = 0;
      for (let bt = 5; bt <= 60; bt += 5) {
        const p = planDive({ maxDepth: d, bottomTime: bt, bottomGas: bottom, decoGases: deco, settings: base });
        if (p.runtime + 1e-9 < prev) problems.push(`${std.id} ${d} m: runtime fell ${prev.toFixed(1)} → ${p.runtime.toFixed(1)} at ${bt} min`);
        prev = p.runtime;
      }
      for (const bt of [20, 40]) {
        let prevDeco = -1;
        for (const high of [1, 0.9, 0.85, 0.8, 0.7]) {
          const p = planDive({ maxDepth: d, bottomTime: bt, bottomGas: bottom, decoGases: deco, settings: { ...base, gf: { low: 0.3, high } } });
          if (p.decoTime + 1e-9 < prevDeco) problems.push(`${std.id} ${d} m/${bt}: deco fell at GF high ${high}`);
          prevDeco = p.decoTime;
        }
        const next = planDive({ maxDepth: d, bottomTime: bt, bottomGas: bottom, decoGases: deco, settings: { ...base, gfEvalAt: 'next' } });
        const cur = planDive({ maxDepth: d, bottomTime: bt, bottomGas: bottom, decoGases: deco, settings: { ...base, gfEvalAt: 'current' } });
        if (cur.runtime + 1e-9 < next.runtime) problems.push(`${std.id} ${d} m/${bt}: conservative method shorter`);
      }
    }
    expect(problems).toEqual([]);
  }, 600_000);
});

/* ---------------------------------------------------------------- recreational ---------------------------------------------------------------- */
describe('recreational sweep', () => {
  it('feasible plans need no stop at any moment, gas and turn maths add up, limits block', () => {
    const gases: Gas[] = [{ o2: 0.21, he: 0, name: 'Air' }, { o2: 0.28, he: 0, name: 'EAN28' }, { o2: 0.32, he: 0, name: 'EAN32' }, { o2: 0.36, he: 0, name: 'EAN36' }, { o2: 0.4, he: 0, name: 'EAN40' }];
    const problems: string[] = [];
    let n = 0, feasible = 0;
    const excess = worst();
    for (const d of [5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30, 33, 35, 38, 40, 42, 45]) for (const bt of [5, 10, 20, 30, 45, 60, 90, 120]) for (const gas of gases)
      for (const gfHigh of [0.7, 0.85, 1]) for (const cy of [S12, S15]) for (const startBar of [180, 232]) for (const sac of [12, 18, 25]) {
        const input = { maxDepth: d, bottomTime: bt, gas, cylinder: cy, startBar, sacLpm: sac, gfHigh };
        const p = planRecreational(input);
        n++;
        const where = `${d}m/${bt}min ${gasName(gas)} GF${gfHigh * 100} ${cy.volumeL}L ${startBar}bar SAC${sac}`;
        // NDL: the planned bottom time must fit; independently at depth, NDL minutes allow a direct ascent, NDL+1 does not
        const nd = ndl(gas, d, gfHigh);
        if (Number.isFinite(nd)) {
          const t = initialTissues(); loadSegment(t, gas, d, d, nd);
          if (ceilingBar(t, gfHigh) > SURFACE_PRESSURE_BAR + 1e-9) problems.push(`NDL too long ${where}`);
          loadSegment(t, gas, d, d, 1);
          if (ceilingBar(t, gfHigh) <= SURFACE_PRESSURE_BAR) problems.push(`NDL too short ${where}`);
        }
        const overNdl = bt > (Number.isFinite(nd) ? nd : 999);
        if (overNdl !== p.blockers.some((b) => b.code === 'recOverNdl')) problems.push(`NDL blocker mismatch ${where}`);
        if ((d > 40) !== p.blockers.some((b) => b.code === 'recDepthLimit')) problems.push(`depth blocker mismatch ${where}`);
        if ((ppO2(gas, d) > 1.4) !== p.blockers.some((b) => b.code === 'ppo2AboveMax')) problems.push(`pO2 blocker mismatch ${where}`);
        // gas: descent 20 m/min, bottom, 9 m/min to 5 m, 3 min, 9 m/min up
        const dm = d / 20, bm = Math.max(0, bt - dm), a1 = Math.max(0, (d - 5) / 9), a2 = 5 / 9;
        const av = (x: number, y: number) => (amb(x) + amb(y)) / 2;
        const asc = sac * (av(d, 5) * a1 + amb(5) * 3 + av(5, 0) * a2);
        const used = sac * (av(0, d) * dm + amb(d) * bm) + asc;
        if (Math.abs(used - p.gasUsedLitres) > 1e-6) problems.push(`gas used ${where}`);
        if (Math.abs(p.surfaceBar - (startBar - used / cy.volumeL)) > 1e-6) problems.push(`surface bar ${where}`);
        const rb = Math.ceil((40 * (amb(d) + av(d, 5) * a1 + amb(5) * 3 + av(5, 0) * a2)) / cy.volumeL / 10) * 10;
        if (rb !== p.rockBottomBar) problems.push(`rock bottom ${where}`);
        const turn = Math.max(Math.ceil((50 + asc / cy.volumeL) / 10) * 10, rb);
        if (turn !== p.turnBar) problems.push(`turn ${where}`);
        const leaveBar = startBar - (used - asc) / cy.volumeL;
        if (p.gasOk !== (p.surfaceBar >= 50 && leaveBar >= turn)) problems.push(`gasOk ${where}`);
        if (Math.abs(p.runtime - (bt + a1 + 3 + a2)) > 1e-9) problems.push(`runtime ${where}`);
        if (p.feasible !== (!overNdl && d <= 40 && ppO2(gas, d) <= 1.4 && p.gasOk)) problems.push(`feasible flag ${where}`);
        // a feasible plan never carries a stop obligation, at any point of the real profile
        if (p.feasible) {
          feasible++;
          const r = replay(recreationalProfile(input, p), () => gfHigh);
          const surfaceObligation = (ceilingBar(r.tissues, gfHigh) - SURFACE_PRESSURE_BAR) / 0.1;
          note(excess, surfaceObligation, where);
          // at any moment a direct ascent must be possible: ceiling above the surface
          const t = initialTissues();
          for (const s of recreationalProfile(input, p).segments) {
            if (s.duration <= 0) continue;
            loadSegment(t, gas, s.startDepth, s.endDepth, s.duration);
            note(excess, (ceilingBar(t, gfHigh) - SURFACE_PRESSURE_BAR) / 0.1, `${where} after ${s.kind}`);
          }
        }
      }
    console.log('recreational problems by kind:', JSON.stringify(Object.entries(problems.reduce<Record<string, number>>((a, x) => { const k = x.replace(/ \d.*$/, ''); a[k] = (a[k] ?? 0) + 1; return a; }, {}))));
    console.log(`recreational: ${n} plans, ${feasible} feasible; worst stop obligation on a feasible plan ${excess.value.toFixed(3)} m (${excess.where})`);
    expect(problems.slice(0, 20)).toEqual([]);
    expect(excess.value).toBeLessThanOrEqual(1e-9);
  }, 600_000);
});

/* ---------------------------------------------------------------- penetration ---------------------------------------------------------------- */
describe('penetration sweep', () => {
  it('gas rules, matching, stages, exits and deco hold for every team and rule combination', () => {
    const problems: string[] = [];
    let n = 0, feas = 0;
    const excess = worst();
    const EAN32: Gas = { o2: 0.32, he: 0, name: 'EAN32' }, T3030: Gas = { o2: 0.3, he: 0.3, name: '30/30' }, AIR: Gas = { o2: 0.21, he: 0, name: 'Air' };
    const teams: [string, (start: number) => TeamMember[]][] = [
      ['solo D12', (s) => [{ id: '0', name: 'B1', cylinder: D12, startBar: s, sacLpm: 18 }]],
      ['2×D12', (s) => [0, 1].map((i) => ({ id: String(i), name: `B${i + 1}`, cylinder: D12, startBar: s, sacLpm: 18 }))],
      ['D12+D10 mixed SAC', (s) => [{ id: '0', name: 'B1', cylinder: D12, startBar: s, sacLpm: 15 }, { id: '1', name: 'B2', cylinder: D10, startBar: s, sacLpm: 25 }]],
      ['3 mixed gases', (s) => [{ id: '0', name: 'B1', cylinder: D12, startBar: s, sacLpm: 18, gas: EAN32 }, { id: '1', name: 'B2', cylinder: D12, startBar: s - 20, sacLpm: 20, gas: T3030 }, { id: '2', name: 'B3', cylinder: S15, startBar: s, sacLpm: 16 }]],
      ['4 sidemount', (s) => [0, 1, 2, 3].map((i) => ({ id: String(i), name: `B${i + 1}`, cylinder: { name: '2× S12', volumeL: 24, workingPressureBar: 232 }, startBar: s, sacLpm: 16 + i * 2, sidemount: { singleVolumeL: 12 } }))],
    ];
    for (const agency of ['gue', 'tdi', 'iantd'] as Agency[]) for (const flow of ['outflow', 'none', 'siphon'] as Flow[]) for (const [teamName, mk] of teams)
      for (const start of [180, 232]) for (const [avg, max] of [[10, 15], [18, 24], [25, 30], [35, 45]]) for (const planned of [0, 10, 25, 60])
        for (const stageCount of [0, 1, 2]) for (const rule of ['halfPlus', 'thirds'] as StageRule[]) for (const brave of [false, true]) {
          const team = mk(start);
          const deco: DecoGasSpec[] = max > 24 ? [{ gas: GUE_STANDARD.decoGases[1].gas, switchDepth: 21 }] : [];
          const input = {
            agency, environment: 'cave' as const, flow, team, bottomGas: max > 30 ? T3030 : EAN32,
            stages: stageCount ? [{ cylinder: S80, gas: AIR, startBar: 200, count: stageCount }] : [], stageRule: rule, stageReserveBar: 15,
            avgDepth: avg, maxDepth: max, swimSpeedMpm: 15, descentMinutes: 1, plannedPenetrationMinutes: planned, overrideGasRule: brave, decoGases: deco,
            settings: { gf: { low: 0.2, high: 0.85 } },
          };
          const p = planPenetration(input);
          n++;
          const where = `${agency} ${flow} ${teamName} ${start}bar ${avg}/${max}m plan${planned} stages${stageCount} ${rule}${brave ? ' brave' : ''}`;
          const f = flow === 'siphon' ? 1 / 6 : 1 / 3;
          if (Math.abs(p.rules.fraction - f) > 1e-12) problems.push(`fraction ${where}`);
          const totals = team.map((m) => m.cylinder.volumeL * m.startBar);
          const minTotal = Math.min(...totals);
          if (p.limiting.cylinder.volumeL * p.limiting.startBar !== minTotal) problems.push(`limiting diver ${where}`);
          const pAvg = amb(avg);
          // stages: drop pressure by rule, the gas left in a dropped stage always covers the way out on it
          for (const st of p.stages) {
            const drop = rule === 'halfPlus' ? Math.ceil((200 / 2 + 15) / 10 - 1e-9) * 10 : Math.ceil((200 * 2) / 3 / 10 - 1e-9) * 10;
            if (st.dropBar !== drop) problems.push(`stage drop ${st.dropBar} vs ${drop} ${where}`);
            const outUse = Math.max(...team.map((m) => m.sacLpm)) * pAvg * st.minutes;
            if (st.remainingLitres - outUse < -1e-6) problems.push(`stage cannot cover the exit ${where}`);
          }
          const backMin = p.penetrationMinutes - p.stages.reduce((a, s) => a + s.minutes, 0);
          for (const m of p.members) {
            const v = m.member.cylinder.volumeL;
            // back gas used on the way in and out at the same pace
            const inL = backMin * m.member.sacLpm * pAvg;
            if (Math.abs(m.exitRemainingLitres - (m.totalLitres - 2 * inL)) > 1e-6) problems.push(`exit remaining ${where}`);
            if (!p.overridden) {
              // the rule: nobody turns later than their share of the weakest supply allows
              if ((m.member.startBar - m.turnBar) * v > f * minTotal + 1e-6) problems.push(`${m.member.name} penetrates past the rule ${where}`);
              if ((m.member.startBar - m.turnBar) * v > f * m.totalLitres + 1e-6) problems.push(`${m.member.name} over own fraction ${where}`);
              if (m.turnBar % 10 !== 0) problems.push(`turn not rounded ${where}`);
              if (inL > (m.member.startBar - m.turnBar) * v + 1e-6) problems.push(`${m.member.name} breathes past the turn ${where}`);
            }
            if (p.feasible && m.sharedExitRemainingLitres < -1e-6) problems.push(`feasible with a failing shared exit ${where}`);
            if (m.sidemount && inL <= m.totalLitres) {
              const sm = simulateSidemount(m.member.startBar, 12, inL);
              if (Math.abs(sm.left + sm.right - (2 * m.member.startBar - inL / 12)) > 1e-6) problems.push(`sidemount balance ${where}`);
            }
          }
          const planWanted = planned > 0 ? planned : p.maxPenetrationMinutes;
          if (!p.overridden && p.penetrationMinutes > p.maxPenetrationMinutes + 1e-9) problems.push(`over max without override ${where}`);
          if (p.overridden !== (brave && planWanted > p.maxPenetrationMinutes + 1e-9)) problems.push(`override flag ${where}`);
          if (!brave && planWanted > p.maxPenetrationMinutes + 1e-9 && p.feasible) problems.push(`over the rule but feasible ${where}`);
          if (Math.abs(p.bottomTime - (1 + 2 * p.penetrationMinutes + 2 * p.stages.length)) > 1e-9) problems.push(`bottom time ${where}`);
          if (p.unsupported !== (max > (agency === 'gue' ? 30 : 40))) problems.push(`unsupported flag ${where}`);
          if (agency === 'gue' && totals.some((t) => t < 4000) !== p.blockers.some((b) => b.code === 'penMinStartGas')) problems.push(`GUE min start gas ${where}`);
          const r = replay(p.deco, () => 0.85);
          note(excess, r.worstExcess, where);
          if (gradientFactorNow(r.tissues, SURFACE_PRESSURE_BAR) > 0.85 + 1e-6) problems.push(`deco surfaces above GF high ${where}`);
          if (p.feasible) feas++;
        }
    console.log('penetration problems by kind:', JSON.stringify(Object.entries(problems.reduce<Record<string, number>>((a, x) => { const k = x.split(/ (gue|tdi|iantd) /)[0]; a[k] = (a[k] ?? 0) + 1; return a; }, {}))));
    console.log(`penetration: ${n} plans, ${feas} feasible; worst deco ceiling over depth at GF high ${excess.value.toFixed(3)} m`);
    expect(problems.slice(0, 20)).toEqual([]);
    expect(excess.value).toBeLessThan(0.01);
  }, 600_000);
});
