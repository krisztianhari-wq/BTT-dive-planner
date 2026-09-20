/**
 * Penetration (overhead) dive planning: caves, mines, wrecks.
 * Gas rules follow GUE / TDI / IANTD teaching: thirds (or sixths), gas matching for
 * dissimilar cylinders, stage cylinders (thirds or "half + reserve"), exit check with gas sharing.
 * The engine stays metric; the UI converts.
 */
import { Cylinder } from './gasPlan';
import { Gas, depthToAmbient, end, gasName, ppO2 } from './gas';
import { Msg, msg } from './messages';
import { DecoGasSpec, DivePlan, PlanSettings, planDive } from './planner';

export type Agency = 'gue' | 'tdi' | 'iantd';
export type Environment = 'cave' | 'mine' | 'wreck';
export type Flow = 'outflow' | 'none' | 'siphon';
export type StageRule = 'thirds' | 'halfPlus';

export interface TeamMember {
  id: string;
  name: string;
  cylinder: Cylinder;
  startBar: number;
  sacLpm: number;
}

export interface StageSpec {
  cylinder: Cylinder;
  gas: Gas;
  startBar: number;
  /** stages carried per diver */
  count: number;
}

export interface PenetrationInput {
  agency: Agency;
  environment: Environment;
  flow: Flow;
  team: TeamMember[];
  bottomGas: Gas;
  stages: StageSpec[];
  stageRule: StageRule;
  /** reserve kept in a stage under the half-plus rule, bar (GUE: 15 bar / 200 psi) */
  stageReserveBar: number;
  /** average depth of the penetration, m */
  avgDepth: number;
  /** maximum depth reached, m */
  maxDepth: number;
  /** swim speed for distance estimates, m/min */
  swimSpeedMpm: number;
  /** descent from the surface to the entrance, minutes (0 for a dry entry) */
  descentMinutes: number;
  /** planned one-way penetration time, minutes; 0 / undefined = as far as the gas rule allows */
  plannedPenetrationMinutes?: number;
  decoGases: DecoGasSpec[];
  settings?: Partial<PlanSettings>;
}

export interface AgencyRules {
  /** penetration fraction of the total gas supply */
  fraction: number;
  fractionLabel: '1/3' | '1/6';
  maxDepthM: number;
  /** minimum total gas to start, litres (0 = no rule) */
  minStartLitres: number;
  defaultStageRule: StageRule;
  /** pressure rounding step for turn pressures, bar */
  roundBar: number;
}

/** Full-cave level rules; sixths only when exiting against the flow (siphon). */
export function agencyRules(agency: Agency, flow: Flow): AgencyRules {
  const sixths = flow === 'siphon';
  const base: AgencyRules = {
    fraction: sixths ? 1 / 6 : 1 / 3,
    fractionLabel: sixths ? '1/6' : '1/3',
    maxDepthM: 40,
    minStartLitres: 0,
    defaultStageRule: 'thirds',
    roundBar: 10,
  };
  if (agency === 'gue') return { ...base, maxDepthM: 30, minStartLitres: 4000, defaultStageRule: 'halfPlus' };
  return base; // tdi, iantd: 40 m, thirds
}

export interface MemberPlan {
  member: TeamMember;
  totalLitres: number;
  /** penetration gas this diver may use on back gas, litres (matched to the weakest diver) */
  penetrationLitres: number;
  /** pressure at which this diver must turn the dive, bar (rounded conservatively) */
  turnBar: number;
  /** minutes until this diver reaches turn pressure at the average depth */
  penetrationMinutes: number;
  /** back gas left when back at the entrance after a normal exit, litres */
  exitRemainingLitres: number;
  /** back gas left after exiting while sharing with a team mate (both on this diver's gas), litres; negative = not enough */
  sharedExitRemainingLitres: number;
}

export interface StagePlan {
  stage: StageSpec;
  usableInLitres: number;
  /** pressure at which the stage is dropped, bar */
  dropBar: number;
  /** minutes of penetration covered by this stage */
  minutes: number;
  /** gas left in the dropped stage, litres */
  remainingLitres: number;
}

export interface PenetrationPlan {
  rules: AgencyRules;
  members: MemberPlan[];
  /** the diver whose gas limits the team */
  limiting: TeamMember;
  stages: StagePlan[];
  /** penetration time actually planned (planned time capped by the gas rule), minutes */
  penetrationMinutes: number;
  /** longest penetration the gas rule allows, minutes */
  maxPenetrationMinutes: number;
  /** estimated one-way penetration distance, m */
  penetrationDistanceM: number;
  /** total time in the overhead (in + out + stage handling), minutes */
  overheadMinutes: number;
  /** total bottom time used for deco (descent + overhead), minutes */
  bottomTime: number;
  deco: DivePlan;
  /** deco gas volumes needed, litres, by gas name */
  warnings: Msg[];
  blockers: Msg[];
  feasible: boolean;
}

const ata = (d: number) => depthToAmbient(d);
const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

export function planPenetration(input: PenetrationInput): PenetrationPlan {
  const rules = agencyRules(input.agency, input.flow);
  const warnings: Msg[] = [];
  const blockers: Msg[] = [];
  const team = input.team;
  if (team.length === 0) blockers.push(msg('penNoTeam'));

  const pAvg = ata(input.avgDepth);

  // ---- gas matching: the weakest diver's fraction, in litres, is everyone's penetration budget ----
  const totals = team.map((m) => m.cylinder.volumeL * m.startBar);
  const limitingIdx = totals.length ? totals.indexOf(Math.min(...totals)) : 0;
  const limiting = team[limitingIdx] ?? { id: '', name: '', cylinder: { name: '', volumeL: 1, workingPressureBar: 0 }, startBar: 0, sacLpm: 20 };
  const penetrationLitres = Math.min(...totals, Infinity) * rules.fraction;

  // ---- stages: breathed first, in order ----
  const stagePlans: StagePlan[] = [];
  let stageMinutes = 0;
  const maxSac = Math.max(...team.map((m) => m.sacLpm), 1);
  for (const st of input.stages) {
    for (let i = 0; i < st.count; i++) {
      const vol = st.cylinder.volumeL;
      let usableIn: number; let dropBar: number;
      if (input.stageRule === 'halfPlus') {
        dropBar = ceilTo(st.startBar / 2 + input.stageReserveBar, rules.roundBar);
        usableIn = Math.max(0, (st.startBar - dropBar) * vol);
      } else {
        dropBar = ceilTo(st.startBar * (2 / 3), rules.roundBar);
        usableIn = Math.max(0, (st.startBar - dropBar) * vol);
      }
      const minutes = usableIn / (maxSac * pAvg); // the team moves at the pace of the heaviest breather
      stageMinutes += minutes;
      stagePlans.push({ stage: st, usableInLitres: usableIn, dropBar, minutes, remainingLitres: dropBar * vol });
    }
  }

  // ---- back gas penetration: the team turns when the first diver reaches turn pressure ----
  const members: MemberPlan[] = team.map((m) => {
    const total = m.cylinder.volumeL * m.startBar;
    const penL = Math.min(penetrationLitres, total * rules.fraction);
    const turnBar = ceilTo(m.startBar - penL / m.cylinder.volumeL, rules.roundBar);
    const usableL = (m.startBar - turnBar) * m.cylinder.volumeL;
    const penetrationMinutes = usableL / (m.sacLpm * pAvg);
    return { member: m, totalLitres: total, penetrationLitres: usableL, turnBar, penetrationMinutes, exitRemainingLitres: 0, sharedExitRemainingLitres: 0 };
  });
  const backGasMax = members.length ? Math.min(...members.map((x) => x.penetrationMinutes)) : 0;
  const maxPenetrationMinutes = stageMinutes + backGasMax;
  const planned = input.plannedPenetrationMinutes && input.plannedPenetrationMinutes > 0 ? input.plannedPenetrationMinutes : maxPenetrationMinutes;
  const penetrationMinutes = Math.min(planned, maxPenetrationMinutes);
  // a shorter planned penetration shortens the stage legs first, then the back-gas leg
  let remaining = penetrationMinutes;
  for (const st of stagePlans) { const m = Math.min(st.minutes, remaining); st.minutes = m; remaining -= m; }
  const backGasMinutes = Math.max(0, remaining);
  if (planned > maxPenetrationMinutes + 1e-9) blockers.push(msg('penTimeOverGas', { planned: Math.round(planned), max: Math.floor(maxPenetrationMinutes) }));

  // exit: same time back at the same pace; stages are picked up and breathed on the way out where they were dropped
  // (exit gas on back gas = back-gas penetration minutes × SAC; the stage covers its own leg on the way out)
  for (const x of members) {
    const exitBackL = backGasMinutes * x.member.sacLpm * pAvg;
    const usedInL = backGasMinutes * x.member.sacLpm * pAvg;
    const afterTurn = x.totalLitres - usedInL;
    x.exitRemainingLitres = afterTurn - exitBackL;
    // sharing: a team mate breathes from this diver's gas for the whole exit
    const mate = team.filter((t) => t.id !== x.member.id).sort((a, b) => b.sacLpm - a.sacLpm)[0];
    const mateExitL = mate ? backGasMinutes * mate.sacLpm * pAvg : 0;
    x.sharedExitRemainingLitres = afterTurn - exitBackL - mateExitL;
  }

  const stageHandling = stagePlans.length * 2 * 1; // 1 min per drop and per pickup
  const overheadMinutes = 2 * penetrationMinutes + stageHandling;
  const bottomTime = input.descentMinutes + overheadMinutes;
  const penetrationDistanceM = penetrationMinutes * input.swimSpeedMpm;

  // ---- deco for the whole exposure, conservatively at max depth ----
  const deco = planDive({ maxDepth: input.maxDepth, bottomTime: Math.max(bottomTime, 1), bottomGas: input.bottomGas, decoGases: input.decoGases, settings: input.settings });

  // ---- checks ----
  if (input.maxDepth > rules.maxDepthM) blockers.push(msg('penDepthLimit', { depth: input.maxDepth, limit: rules.maxDepthM, agency: input.agency.toUpperCase() }));
  const totalStart = totals.reduce((a, b) => a + b, 0) / Math.max(team.length, 1);
  if (rules.minStartLitres && team.some((m) => m.cylinder.volumeL * m.startBar < rules.minStartLitres)) blockers.push(msg('penMinStartGas', { min: rules.minStartLitres, have: Math.round(Math.min(...totals)) }));
  for (const x of members) if (x.sharedExitRemainingLitres < 0) blockers.push(msg('penSharedExitShort', { diver: x.member.name, short: Math.round(-x.sharedExitRemainingLitres) }));
  const p = ppO2(input.bottomGas, input.maxDepth);
  if (p > 1.4) blockers.push(msg('ppo2AboveMax', { gas: gasName(input.bottomGas), ppo2: p.toFixed(2), depth: input.maxDepth, mod: '', limit: 1.4 }));
  else if (p > 1.2) warnings.push(msg('ppo2AboveWorking', { gas: gasName(input.bottomGas), ppo2: p.toFixed(2), limit: 1.2 }));
  const e = end(input.bottomGas, input.maxDepth);
  if (e > 30) warnings.push(msg('endHigh', { gas: gasName(input.bottomGas), end: e.toFixed(0), limit: 30 }));
  if (input.flow === 'siphon') warnings.push(msg('penSiphon'));
  const vols = new Set(team.map((m) => m.cylinder.volumeL));
  if (vols.size > 1) warnings.push(msg('penDissimilar', { diver: limiting.name }));
  if (input.stageRule !== rules.defaultStageRule) warnings.push(msg('penStageRuleDiffers', { agency: input.agency.toUpperCase(), rule: rules.defaultStageRule }));
  if (deco.decoTime > 0 && input.decoGases.length === 0) warnings.push(msg('penDecoNoGas', { deco: Math.round(deco.decoTime) }));
  void totalStart;

  return {
    rules, members, limiting, stages: stagePlans, penetrationMinutes, maxPenetrationMinutes, penetrationDistanceM, overheadMinutes, bottomTime, deco,
    warnings, blockers, feasible: blockers.length === 0,
  };
}

export type PenEventKind = 'start' | 'enter' | 'stageDrop' | 'turn' | 'stagePickup' | 'exit' | 'decoStop' | 'switch' | 'surface';
export interface PenEvent { kind: PenEventKind; runtime: number; depth: number; gas: Gas; note?: string; duration?: number; until?: number; fromGas?: Gas }

/** Chronological event list for a penetration plan, from t=0 to the surface. */
export function penetrationItinerary(input: PenetrationInput, plan: PenetrationPlan): PenEvent[] {
  const ev: PenEvent[] = [];
  let t = 0;
  ev.push({ kind: 'start', runtime: 0, depth: 0, gas: input.bottomGas });
  t += input.descentMinutes;
  ev.push({ kind: 'enter', runtime: t, depth: input.avgDepth, gas: plan.stages[0]?.stage.gas ?? input.bottomGas });
  for (const st of plan.stages) {
    t += st.minutes;
    ev.push({ kind: 'stageDrop', runtime: t, depth: input.avgDepth, gas: input.bottomGas, note: gasName(st.stage.gas), duration: 1 });
    t += 1;
  }
  const backIn = plan.penetrationMinutes - plan.stages.reduce((a, s) => a + s.minutes, 0);
  t += backIn;
  ev.push({ kind: 'turn', runtime: t, depth: input.avgDepth, gas: input.bottomGas });
  t += backIn;
  for (const st of [...plan.stages].reverse()) {
    ev.push({ kind: 'stagePickup', runtime: t, depth: input.avgDepth, gas: st.stage.gas, note: gasName(st.stage.gas), duration: 1 });
    t += 1 + st.minutes;
  }
  ev.push({ kind: 'exit', runtime: t, depth: input.avgDepth, gas: input.bottomGas });
  // deco from the open-water plan: everything after its bottom segment, shifted so the ascent starts at the exit
  const segs = plan.deco.segments;
  const bottomEnd = segs.find((sg) => sg.kind === 'bottom')?.runtime ?? t;
  const shift = t - bottomEnd;
  for (let i = 0; i < segs.length; i++) {
    const sg = segs[i];
    if (sg.runtime <= bottomEnd + 1e-9 && sg.kind !== 'switch') continue;
    if (sg.kind === 'switch') ev.push({ kind: 'switch', runtime: sg.runtime - sg.duration + shift, depth: sg.startDepth, gas: sg.gas, fromGas: segs[i - 1]?.gas, duration: sg.duration });
    if (sg.kind === 'stop') ev.push({ kind: 'decoStop', runtime: sg.runtime - sg.duration + shift, depth: sg.startDepth, gas: sg.gas, duration: sg.duration, until: sg.runtime + shift });
  }
  const last = segs[segs.length - 1];
  ev.push({ kind: 'surface', runtime: (last?.runtime ?? bottomEnd) + shift, depth: 0, gas: last?.gas ?? input.bottomGas });
  return ev;
}
