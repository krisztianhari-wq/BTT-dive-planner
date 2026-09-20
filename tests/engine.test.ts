import { describe, expect, it } from 'vitest';
import {
  GUE_DECO_GASES, ceilingDepth, end, gasName, initialTissues, loadSegment, minimumGas, mod, ndl,
  planDive, ppO2, recommendedDecoGasesFor, standardBottomGasFor, stopTable, CYLINDERS, planConsumption,
} from '../src/engine';

const AIR = { o2: 0.21, he: 0 };
const EAN32 = { o2: 0.32, he: 0 };
const T2135 = { o2: 0.21, he: 0.35 };
const EAN50 = GUE_DECO_GASES[1];
const O2 = GUE_DECO_GASES[0];

describe('gas maths', () => {
  it('MOD of EAN32 at pO2 1.4 is ~33.7 m, of O2 at 1.6 is ~5.9 m', () => {
    expect(mod(EAN32, 1.4)).toBeCloseTo(33.6, 0);
    expect(mod({ o2: 1, he: 0 }, 1.6)).toBeCloseTo(5.9, 0);
  });
  it('END of 21/35 at 45 m is ~26 m (below GUE 30 m limit)', () => {
    expect(end(T2135, 45)).toBeLessThan(30);
    expect(end(T2135, 45)).toBeCloseTo(25.7, 0);
  });
  it('pO2 of 18/45 at 60 m is 1.26', () => {
    expect(ppO2({ o2: 0.18, he: 0.45 }, 60)).toBeCloseTo(1.26, 2);
  });
  it('picks GUE standard bottom gas by depth', () => {
    expect(standardBottomGasFor(25)?.gas.name).toBe('EAN32');
    expect(standardBottomGasFor(45)?.gas.name).toBe('21/35');
    expect(standardBottomGasFor(60)?.gas.name).toBe('18/45');
    expect(standardBottomGasFor(130)).toBeUndefined();
  });
  it('recommends EAN50 only for Tech 1 range, EAN50+O2 deeper', () => {
    expect(recommendedDecoGasesFor(45).map((g) => g.gas.name)).toEqual(['EAN50']);
    expect(recommendedDecoGasesFor(60).map((g) => g.gas.name)).toEqual(['EAN50', 'O2']);
  });
});

describe('Bühlmann tissues', () => {
  it('starts saturated with air at the surface, no ceiling', () => {
    const t = initialTissues();
    expect(ceilingDepth(t, 1.0)).toBe(0);
    expect(t.n2[0]).toBeCloseTo(0.751, 2);
  });
  it('long exposure saturates towards inspired pressure', () => {
    const t = initialTissues();
    loadSegment(t, AIR, 30, 30, 20000);
    expect(t.n2[15]).toBeCloseTo(0.79 * (4.01325 - 0.0627), 2);
  });
  it('NDL on air at 30 m with GF 100 is in the classic Bühlmann range (15–22 min)', () => {
    const n = ndl(AIR, 30, 1.0);
    expect(n).toBeGreaterThanOrEqual(15);
    expect(n).toBeLessThanOrEqual(22);
  });
  it('NDL on EAN32 is longer than on air', () => {
    expect(ndl(EAN32, 30, 0.85)).toBeGreaterThan(ndl(AIR, 30, 0.85));
  });
  it('NDL is monotone in GF high', () => {
    expect(ndl(AIR, 30, 0.7)).toBeLessThanOrEqual(ndl(AIR, 30, 0.85));
    expect(ndl(AIR, 30, 0.85)).toBeLessThanOrEqual(ndl(AIR, 30, 1.0));
  });
});

describe('planner', () => {
  it('a short shallow dive needs no stops', () => {
    const p = planDive({ maxDepth: 18, bottomTime: 30, bottomGas: EAN32, decoGases: [] });
    expect(stopTable(p)).toHaveLength(0);
    expect(p.firstStopDepth).toBeNull();
    expect(p.runtime).toBeGreaterThan(30);
  });

  it('45 m / 25 min on 21/35 with EAN50 produces a plausible schedule', () => {
    const p = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50] });
    const stops = stopTable(p);
    expect(stops.length).toBeGreaterThan(0);
    // all stops on 3 m multiples, none shallower than 6 m
    for (const s of stops) { expect(s.depth % 3).toBe(0); expect(s.depth).toBeGreaterThanOrEqual(6); }
    // deepest stop first, monotone shallower
    for (let i = 1; i < stops.length; i++) expect(stops[i].depth).toBeLessThan(stops[i - 1].depth);
    // EAN50 used at 21 m and shallower
    for (const s of stops) if (s.depth <= 21) expect(s.gas).toBe('EAN50');
    // total deco somewhere in the range typical planners give for this profile with GF 20/85 (~20–45 min)
    expect(p.decoTime).toBeGreaterThan(15);
    expect(p.decoTime).toBeLessThan(50);
    // runtime consistent
    const last = p.segments[p.segments.length - 1];
    expect(last.endDepth).toBe(0);
    expect(Math.abs(last.runtime - p.runtime)).toBeLessThan(1e-6);
  });

  it('longer bottom time never gives shorter deco', () => {
    let prev = 0;
    for (const bt of [15, 20, 25, 30, 40]) {
      const p = planDive({ maxDepth: 45, bottomTime: bt, bottomGas: T2135, decoGases: [EAN50] });
      expect(p.decoTime).toBeGreaterThanOrEqual(prev);
      prev = p.decoTime;
    }
  });

  it('more conservative GF never gives less deco', () => {
    const loose = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50], settings: { gf: { low: 0.4, high: 0.95 } } });
    const tight = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50], settings: { gf: { low: 0.2, high: 0.75 } } });
    expect(tight.decoTime).toBeGreaterThanOrEqual(loose.decoTime);
  });

  it('adding O2 at 6 m shortens deco', () => {
    const one = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50] });
    const two = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50, O2] });
    expect(two.decoTime).toBeLessThan(one.decoTime);
  });

  it('surfacing GF never exceeds GF high (tolerance for 1-min stop granularity)', () => {
    const p = planDive({ maxDepth: 51, bottomTime: 30, bottomGas: T2135, decoGases: [EAN50] });
    expect(ceilingDepth(p.tissuesAtSurface, 0.85)).toBeLessThanOrEqual(0.01);
  });

  it('warns when bottom gas pO2 exceeds limits', () => {
    const p = planDive({ maxDepth: 40, bottomTime: 10, bottomGas: EAN32, decoGases: [] });
    expect(p.warnings.some((w) => w.code === 'ppo2AboveMax' || w.code === 'ppo2AboveWorking')).toBe(true);
  });
});

describe('gas planning', () => {
  it('minimum gas for 30 m on D12/200 is around 50–60 bar', () => {
    const d12 = CYLINDERS[0];
    const mg = minimumGas(30, d12);
    // 40 l/min × (1 min @4 bar + 2.67 min @ avg 2.8 bar + 2 min @ avg 1.3 bar) ≈ 40 × (4 + 7.5 + 2.6) ≈ 564 L ≈ 23.5 bar in 24 L
    expect(mg.litres).toBeGreaterThan(500);
    expect(mg.litres).toBeLessThan(650);
    expect(mg.bar).toBeCloseTo(mg.litres / 24, 5);
  });
  it('consumption sums across gases and is positive', () => {
    const p = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50] });
    const use = planConsumption(p, 20, 15);
    expect(use.map((u) => u.name).sort()).toEqual(['21/35', 'EAN50']);
    for (const u of use) expect(u.litres).toBeGreaterThan(0);
  });
});

describe('inventory mode', () => {
  const D12 = CYLINDERS[0];
  const S80 = CYLINDERS.find((c) => c.name.startsWith('AL80'))!;
  const S40 = CYLINDERS.find((c) => c.name.startsWith('AL40'))!;

  it('standard Tech 1 kit is feasible for 45 m / 25 min', async () => {
    const { evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([
      { id: 'a', cylinder: D12, count: 1, gas: T2135, pressureBar: 200, role: 'back' },
      { id: 'b', cylinder: S80, count: 1, gas: EAN50.gas, pressureBar: 200, role: 'deco' },
    ], 45, 25, 20, 15, {});
    expect(v.blockers).toEqual([]);
    expect(v.feasible).toBe(true);
    expect(v.decoGasesUsed[0].switchDepth).toBe(21);
  });

  it('EAN32 at 50 m is blocked by pO2 and END', async () => {
    const { evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([{ id: 'a', cylinder: D12, count: 1, gas: EAN32, pressureBar: 200, role: 'back' }], 50, 20, 20, 15, {});
    expect(v.feasible).toBe(false);
    expect(v.blockers.some((b) => b.code === 'ppo2AboveMax')).toBe(true);
    expect(v.blockers.some((b) => b.code === 'backEndAboveLimit')).toBe(true);
  });

  it('too little back gas is blocked and a shorter feasible bottom time is suggested', async () => {
    const { evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([
      { id: 'a', cylinder: D12, count: 1, gas: T2135, pressureBar: 120, role: 'back' },
      { id: 'b', cylinder: S40, count: 1, gas: EAN50.gas, pressureBar: 200, role: 'deco' },
    ], 45, 40, 20, 15, {});
    expect(v.feasible).toBe(false);
    expect(v.maxBottomTime).not.toBeNull();
    expect(v.maxBottomTime!).toBeLessThan(40);
  });

  it('custom deco gas gets a MOD-based switch depth on a 3 m step', async () => {
    const { switchDepthFor } = await import('../src/engine');
    expect(switchDepthFor({ o2: 0.5, he: 0 })).toBe(21);
    expect(switchDepthFor({ o2: 0.4, he: 0 })).toBe(27); // MOD 1.6 → 29.9 m → 27
  });

  it('packing list has one back gas item and one item per deco gas', async () => {
    const { packingList, minimumGas, roundBar } = await import('../src/engine');
    const p = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50, O2] });
    const use = planConsumption(p, 20, 15);
    const mg = roundBar(minimumGas(60, D12, { toDepth: 21 }).bar);
    const list = packingList(p, use, D12, mg, 20, 15, CYLINDERS);
    expect(list.filter((i) => i.role === 'back')).toHaveLength(1);
    expect(list.filter((i) => i.role === 'deco').map((i) => i.gasLabel).sort()).toEqual(['EAN50', 'O2']);
    // 60 m on a D12/200 does not fit: the back gas item must be flagged as overfill
    expect(list[0].overfill).toBe(true);
    for (const i of list.filter((x) => x.role === 'deco')) expect(i.fillBar).toBeLessThanOrEqual(i.cylinder.workingPressureBar);
  });
});

describe('gas standards', () => {
  it('generic standard picks best nitrox mix at pO2 1.4 for recreational depths', async () => {
    const { GENERIC_STANDARD } = await import('../src/engine');
    expect(GENERIC_STANDARD.bottomGasFor(18)?.gas.name).toBe('EAN40');
    expect(GENERIC_STANDARD.bottomGasFor(30)?.gas.name).toBe('EAN32');
    expect(GENERIC_STANDARD.bottomGasFor(40)?.gas.name).toBe('Air');
    expect(GENERIC_STANDARD.bottomGasFor(50)?.gas.name).toBe('21/35');
  });
  it('generic standard has no hard END limit but warns above 40 m END', async () => {
    const { GENERIC_STANDARD, evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([{ id: 'a', cylinder: CYLINDERS[0], count: 1, gas: AIR, pressureBar: 230, role: 'back' }], 45, 15, 20, 15, {}, 1.5, GENERIC_STANDARD);
    expect(v.blockers.some((b) => b.code === 'backEndAboveLimit')).toBe(false);
    expect(v.warnings.some((w) => w.code === 'endHigh')).toBe(true);
  });
  it('GUE standard blocks the same dive on END', async () => {
    const { GUE_STANDARD, evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([{ id: 'a', cylinder: CYLINDERS[0], count: 1, gas: AIR, pressureBar: 230, role: 'back' }], 45, 15, 20, 15, {}, 1.5, GUE_STANDARD);
    expect(v.blockers.some((b) => b.code === 'backEndAboveLimit')).toBe(true);
  });
  it('EAN80 gets its standard 9 m switch depth in the generic standard', async () => {
    const { GENERIC_STANDARD, switchDepthFor } = await import('../src/engine');
    expect(switchDepthFor({ o2: 0.8, he: 0 }, GENERIC_STANDARD)).toBe(9);
  });
});

describe('itinerary', () => {
  it('lists events chronologically from t=0 to the surface with switches and stops', async () => {
    const { itinerary } = await import('../src/engine');
    const p = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50] });
    const ev = itinerary(p);
    expect(ev[0].kind).toBe('start');
    expect(ev[0].runtime).toBe(0);
    expect(ev[ev.length - 1].kind).toBe('surface');
    expect(Math.abs(ev[ev.length - 1].runtime - p.runtime)).toBeLessThan(1e-6);
    for (let i = 1; i < ev.length; i++) expect(ev[i].runtime).toBeGreaterThanOrEqual(ev[i - 1].runtime - 1e-9);
    expect(ev.filter((e) => e.kind === 'stop').length).toBe(stopTable(p).length);
    const sw = ev.find((e) => e.kind === 'switch')!;
    expect(sw.depth).toBe(21);
    expect(sw.gas.name).toBe('EAN50');
    expect(sw.fromGas && gasName(sw.fromGas)).toBe('21/35');
    expect(ev.filter((e) => e.kind === 'arriveBottom')).toHaveLength(1);
    expect(ev.filter((e) => e.kind === 'leaveBottom')).toHaveLength(1);
  });
});

describe('calculation method', () => {
  it('conservative (gfEvalAt=current) never gives less deco than standard', () => {
    for (const [d, bt, gas, deco] of [[45, 25, T2135, [EAN50]], [60, 25, { o2: 0.18, he: 0.45 }, [EAN50, O2]], [75, 20, { o2: 0.15, he: 0.55 }, [GUE_DECO_GASES[2], EAN50, O2]]] as const) {
      const std = planDive({ maxDepth: d, bottomTime: bt, bottomGas: gas, decoGases: [...deco], settings: { gfEvalAt: 'next' } });
      const con = planDive({ maxDepth: d, bottomTime: bt, bottomGas: gas, decoGases: [...deco], settings: { gfEvalAt: 'current' } });
      expect(con.decoTime).toBeGreaterThanOrEqual(std.decoTime);
      expect(con.firstStopDepth ?? 0).toBeGreaterThanOrEqual(std.firstStopDepth ?? 0);
    }
  });
});

describe('gas switch hold', () => {
  it('each gas switch adds a timed segment at the switch depth on the new gas', () => {
    const p = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50, O2] });
    const sw = p.segments.filter((s) => s.kind === 'switch');
    expect(sw).toHaveLength(2);
    for (const s of sw) { expect(s.duration).toBe(1); expect(s.startDepth).toBe(s.endDepth); }
    expect(sw[0].startDepth).toBe(21); expect(gasName(sw[0].gas)).toBe('EAN50');
    expect(sw[1].startDepth).toBe(6); expect(gasName(sw[1].gas)).toBe('O2');
    // the hold counts as deco time at that depth, so the total can only stay equal or grow
    const p0 = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50, O2], settings: { gasSwitchMinutes: 0 } });
    expect(p.runtime).toBeGreaterThanOrEqual(p0.runtime);
    // the minute spent at the switch depth off-gasses too, so later stops may shrink by the same amount
    const b = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50] });
    const b0 = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50], settings: { gasSwitchMinutes: 0 } });
    expect(b.runtime).toBeGreaterThanOrEqual(b0.runtime);
    expect(b.segments.find((s) => s.kind === 'switch')?.duration).toBe(1);
    expect(b.segments.filter((s) => s.kind === 'switch' || s.kind === 'stop').reduce((a, s) => a + s.duration, 0))
      .toBeGreaterThanOrEqual(b0.segments.filter((s) => s.kind === 'stop').reduce((a, s) => a + s.duration, 0));
  });
});

describe('penetration planning', () => {
  const D12 = CYLINDERS[0]; // 24 L, 200 bar
  const D10 = CYLINDERS.find((c) => c.name.startsWith('D10'))!; // 20 L
  const S80 = CYLINDERS.find((c) => c.name.startsWith('AL80'))!;
  const base = {
    agency: 'gue' as const, environment: 'cave' as const, flow: 'outflow' as const,
    bottomGas: EAN32, stages: [], stageRule: 'halfPlus' as const, stageReserveBar: 15,
    avgDepth: 18, maxDepth: 24, swimSpeedMpm: 15, descentMinutes: 1, decoGases: [],
  };
  const two = [
    { id: 'a', name: 'A', cylinder: D12, startBar: 200, sacLpm: 18 },
    { id: 'b', name: 'B', cylinder: D12, startBar: 200, sacLpm: 18 },
  ];

  it('equal cylinders: thirds → turn at 2/3 of start pressure, rounded up to 10 bar', async () => {
    const { planPenetration } = await import('../src/engine');
    const p = planPenetration({ ...base, team: two });
    expect(p.rules.fractionLabel).toBe('1/3');
    for (const m of p.members) expect(m.turnBar).toBe(140); // 200 - 66.7 = 133.3 → 140
    expect(p.feasible).toBe(true);
    expect(p.penetrationMinutes).toBeGreaterThan(20);
    expect(p.penetrationDistanceM).toBeCloseTo(p.penetrationMinutes * 15, 5);
  });

  it('dissimilar cylinders: the smaller supply sets everyone\'s budget, larger diver turns earlier in pressure terms', async () => {
    const { planPenetration } = await import('../src/engine');
    const p = planPenetration({ ...base, team: [
      { id: 'a', name: 'A', cylinder: D12, startBar: 200, sacLpm: 18 },
      { id: 'b', name: 'B', cylinder: D10, startBar: 200, sacLpm: 18 },
    ] });
    expect(p.limiting.name).toBe('B');
    const a = p.members.find((m) => m.member.name === 'A')!; const b = p.members.find((m) => m.member.name === 'B')!;
    // B's third: 4000/3 = 1333 L → A may use 1333 L = 55.6 bar of 24 L → turn at 150 (rounded up); B turns at 140
    expect(a.turnBar).toBe(150); expect(b.turnBar).toBe(140);
    expect(p.warnings.some((w) => w.code === 'penDissimilar')).toBe(true);
  });

  it('siphons use sixths', async () => {
    const { planPenetration } = await import('../src/engine');
    const siphon = planPenetration({ ...base, team: two, flow: 'siphon' });
    expect(siphon.rules.fractionLabel).toBe('1/6');
    expect(siphon.members[0].turnBar).toBe(170); // 200 - 33.3 = 166.7 → 170
    expect(siphon.warnings.some((w) => w.code === 'penSiphon')).toBe(true);
  });

  it('GUE depth limit and minimum start gas are enforced as blockers', async () => {
    const { planPenetration } = await import('../src/engine');
    const deep = planPenetration({ ...base, team: two, maxDepth: 35 });
    expect(deep.blockers.some((b) => b.code === 'penDepthLimit')).toBe(true);
    const small = planPenetration({ ...base, team: [{ id: 'a', name: 'A', cylinder: CYLINDERS.find((c) => c.name.startsWith('Single 12'))!, startBar: 200, sacLpm: 18 }] });
    expect(small.blockers.some((b) => b.code === 'penMinStartGas')).toBe(true);
    const tdi = planPenetration({ ...base, team: two, agency: 'tdi', maxDepth: 35, stageRule: 'thirds' });
    expect(tdi.blockers.some((b) => b.code === 'penDepthLimit')).toBe(false);
  });

  it('a stage extends penetration; half-plus drop pressure is half + reserve rounded up', async () => {
    const { planPenetration } = await import('../src/engine');
    const noStage = planPenetration({ ...base, team: two });
    const withStage = planPenetration({ ...base, team: two, stages: [{ cylinder: S80, gas: EAN32, startBar: 200, count: 1 }] });
    expect(withStage.penetrationMinutes).toBeGreaterThan(noStage.penetrationMinutes);
    expect(withStage.stages[0].dropBar).toBe(120); // 100 + 15 = 115 → 120
    expect(withStage.overheadMinutes).toBeGreaterThan(2 * withStage.penetrationMinutes); // drop + pickup minutes
    const thirds = planPenetration({ ...base, team: two, agency: 'tdi', stageRule: 'thirds', stages: [{ cylinder: S80, gas: EAN32, startBar: 200, count: 1 }] });
    expect(thirds.stages[0].dropBar).toBe(140); // 2/3 of 200 = 133.3 → 140
  });

  it('shared exit is covered by thirds; the team turns at the heaviest breather\'s pace', async () => {
    const { planPenetration } = await import('../src/engine');
    const ok = planPenetration({ ...base, team: two });
    for (const m of ok.members) expect(m.sharedExitRemainingLitres).toBeGreaterThanOrEqual(0);
    const heavy = planPenetration({ ...base, team: [
      { id: 'a', name: 'A', cylinder: D12, startBar: 200, sacLpm: 12 },
      { id: 'b', name: 'B', cylinder: D12, startBar: 200, sacLpm: 40 },
    ] });
    const b = heavy.members.find((m) => m.member.name === 'B')!;
    expect(heavy.penetrationMinutes).toBeCloseTo(b.penetrationMinutes, 5); // B reaches turn pressure first
    for (const m of heavy.members) expect(m.sharedExitRemainingLitres).toBeGreaterThanOrEqual(0);
    expect(heavy.feasible).toBe(true);
  });
});

describe('penetration itinerary', () => {
  it('runs start → enter → drop → turn → pickup → exit → surface in order', async () => {
    const { planPenetration, penetrationItinerary } = await import('../src/engine');
    const S80 = CYLINDERS.find((c) => c.name.startsWith('AL80'))!;
    const input = {
      agency: 'tdi' as const, environment: 'mine' as const, flow: 'none' as const, bottomGas: T2135,
      stages: [{ cylinder: S80, gas: T2135, startBar: 200, count: 1 }], stageRule: 'thirds' as const, stageReserveBar: 15,
      avgDepth: 35, maxDepth: 40, swimSpeedMpm: 12, descentMinutes: 2, decoGases: [EAN50],
      team: [{ id: 'a', name: 'A', cylinder: CYLINDERS[0], startBar: 200, sacLpm: 18 }, { id: 'b', name: 'B', cylinder: CYLINDERS[0], startBar: 200, sacLpm: 18 }],
    };
    const plan = planPenetration(input);
    const ev = penetrationItinerary(input, plan);
    const kinds = ev.map((e) => e.kind);
    expect(kinds.slice(0, 3)).toEqual(['start', 'enter', 'stageDrop']);
    expect(kinds).toContain('turn'); expect(kinds).toContain('stagePickup'); expect(kinds).toContain('exit');
    expect(kinds[kinds.length - 1]).toBe('surface');
    for (let i = 1; i < ev.length; i++) expect(ev[i].runtime).toBeGreaterThanOrEqual(ev[i - 1].runtime - 1e-6);
    expect(ev.find((e) => e.kind === 'exit')!.runtime).toBeCloseTo(input.descentMinutes + plan.overheadMinutes, 5);
    expect(ev[ev.length - 1].runtime).toBeCloseTo(plan.deco.runtime, 5);
  });
});

describe('recreational planning', () => {
  it('flags a dive beyond the NDL and reports the maximum bottom time', async () => {
    const { planRecreational } = await import('../src/engine');
    const single12 = CYLINDERS.find((c) => c.name.startsWith('Single 12'))!;
    const single15 = CYLINDERS.find((c) => c.name.startsWith('Single 15'))!;
    const ok = planRecreational({ maxDepth: 18, bottomTime: 40, gas: EAN32, cylinder: single15, startBar: 230, sacLpm: 18, gfHigh: 0.85 });
    expect(ok.feasible).toBe(true);
    expect(ok.ndlMinutes).toBeGreaterThan(40);
    const over = planRecreational({ maxDepth: 30, bottomTime: 40, gas: AIR, cylinder: single12, startBar: 200, sacLpm: 18, gfHigh: 0.85 });
    expect(over.feasible).toBe(false);
    expect(over.blockers.some((b) => b.code === 'recOverNdl')).toBe(true);
    expect(over.maxBottomTime).toBe(over.ndlMinutes);
    expect(over.maxBottomTime).toBeLessThan(40);
  });
  it('enforces the 40 m recreational limit and rock bottom gas', async () => {
    const { planRecreational } = await import('../src/engine');
    const single12 = CYLINDERS.find((c) => c.name.startsWith('Single 12'))!;
    const deep = planRecreational({ maxDepth: 45, bottomTime: 5, gas: AIR, cylinder: single12, startBar: 200, sacLpm: 18, gfHigh: 0.85 });
    expect(deep.blockers.some((b) => b.code === 'recDepthLimit')).toBe(true);
    const lowGas = planRecreational({ maxDepth: 30, bottomTime: 15, gas: EAN32, cylinder: single12, startBar: 80, sacLpm: 25, gfHigh: 0.85 });
    expect(lowGas.blockers.some((b) => b.code === 'recGasShort')).toBe(true);
    expect(lowGas.rockBottomBar).toBeGreaterThan(0);
    expect(lowGas.runtime).toBeGreaterThan(15 + 3);
    // surface reserve rule: a plan that would surface below 50 bar is blocked, one that surfaces above it passes
    const single15 = CYLINDERS.find((c) => c.name.startsWith('Single 15'))!;
    const tight = planRecreational({ maxDepth: 20, bottomTime: 40, gas: EAN32, cylinder: single15, startBar: 200, sacLpm: 20, gfHigh: 0.85 });
    expect(tight.surfaceReserveBar).toBe(50);
    expect(tight.gasOk).toBe(tight.surfaceBar >= 50 && tight.surfaceBar >= 0);
    const fine = planRecreational({ maxDepth: 20, bottomTime: 25, gas: EAN32, cylinder: single15, startBar: 200, sacLpm: 20, gfHigh: 0.85 });
    expect(fine.surfaceBar).toBeGreaterThanOrEqual(50);
    expect(fine.gasOk).toBe(true);
    expect(fine.turnBar).toBeGreaterThanOrEqual(50);
  });
});
