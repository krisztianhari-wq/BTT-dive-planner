import { Gas, depthToAmbient, gasName } from './gas';
import { DivePlan, Segment } from './planner';

export interface Cylinder {
  name: string;
  /** total water volume in litres (doubles: both cylinders) */
  volumeL: number;
  /** rated working pressure, bar */
  workingPressureBar: number;
}

export const CYLINDERS: Cylinder[] = [
  { name: 'D12 (2×12 L, 200 bar)', volumeL: 24, workingPressureBar: 200 },
  { name: 'D12 (2×12 L, 232 bar)', volumeL: 24, workingPressureBar: 232 },
  { name: 'D10 (2×10 L, 232 bar)', volumeL: 20, workingPressureBar: 232 },
  { name: 'Single 12 L, 232 bar', volumeL: 12, workingPressureBar: 232 },
  { name: 'Single 15 L, 232 bar', volumeL: 15, workingPressureBar: 232 },
  { name: 'AL80 / S80 (11.1 L, 207 bar)', volumeL: 11.1, workingPressureBar: 207 },
  { name: 'AL40 / S40 (5.7 L, 207 bar)', volumeL: 5.7, workingPressureBar: 207 },
];

export interface GasUsage {
  gas: Gas;
  name: string;
  /** litres at surface pressure */
  litres: number;
}

/** Average ambient pressure over a linear depth change. */
const avgAmbient = (a: number, b: number) => (depthToAmbient(a) + depthToAmbient(b)) / 2;

/** Gas consumed per segment: SAC (l/min surface) × avg ambient × minutes. */
export function segmentConsumption(seg: Segment, sacLpm: number): number {
  return sacLpm * avgAmbient(seg.startDepth, seg.endDepth) * seg.duration;
}

/** Total consumption per gas for a plan. Bottom SAC applies to descent/bottom; deco SAC to ascent/stops. */
export function planConsumption(plan: DivePlan, bottomSacLpm: number, decoSacLpm: number): GasUsage[] {
  const map = new Map<string, GasUsage>();
  for (const seg of plan.segments) {
    if (seg.duration <= 0) continue;
    const sac = seg.kind === 'descent' || seg.kind === 'bottom' ? bottomSacLpm : decoSacLpm;
    const key = gasName(seg.gas);
    const cur = map.get(key) ?? { gas: seg.gas, name: key, litres: 0 };
    cur.litres += segmentConsumption(seg, sac);
    map.set(key, cur);
  }
  return [...map.values()];
}

export interface MinimumGasResult {
  litres: number;
  bar: number;
  /** minutes used in the calculation */
  ascentMinutes: number;
  /** depth to which the ascent is planned (surface or first gas switch) */
  toDepth: number;
  /** inputs, for display */
  divers: number;
  sacLpm: number;
  problemMinutes: number;
  fromDepth: number;
}

/**
 * GUE Minimum Gas: enough for two stressed divers (default 20 l/min each) to ascend
 * from max depth to the surface (or the first deco gas switch), including 1 minute
 * of problem solving at depth, ascending at 9 m/min to the first stop then 3 m/min
 * through the last 6 m (simplified: 9 m/min to 6 m, then 3 m/min to surface).
 */
export function minimumGas(
  maxDepthM: number,
  cylinder: Cylinder,
  opts: { stressedSacLpm?: number; divers?: number; toDepth?: number; problemMinutes?: number; ascentRate?: number } = {},
): MinimumGasResult {
  const sac = opts.stressedSacLpm ?? 20;
  const divers = opts.divers ?? 2;
  const toDepth = opts.toDepth ?? 0;
  const problem = opts.problemMinutes ?? 1;
  const rate = opts.ascentRate ?? 9;

  let litres = 0;
  let minutes = 0;
  // problem solving at depth
  litres += sac * divers * depthToAmbient(maxDepthM) * problem;
  minutes += problem;
  // ascent at `rate` to max(toDepth, 6)
  const fastTo = Math.max(toDepth, 6);
  if (maxDepthM > fastTo) {
    const m = (maxDepthM - fastTo) / rate;
    litres += sac * divers * avgAmbient(maxDepthM, fastTo) * m;
    minutes += m;
  }
  // slow ascent 6 m → surface at 3 m/min if we go all the way up
  if (toDepth < 6) {
    const from = Math.min(maxDepthM, 6);
    const m = (from - toDepth) / 3;
    litres += sac * divers * avgAmbient(from, toDepth) * m;
    minutes += m;
  }
  const bar = litres / cylinder.volumeL;
  return {
    litres,
    bar,
    ascentMinutes: minutes,
    toDepth,
    divers,
    sacLpm: sac,
    problemMinutes: problem,
    fromDepth: maxDepthM,
  };
}

/** Round minimum gas bar up to the next 10 bar, as taught in practice. */
export const roundBar = (bar: number, step = 10) => Math.ceil(bar / step) * step;

export interface BackGasPlan {
  startBar: number;
  minimumGasBar: number;
  usableBar: number;
  /** bar needed for the planned bottom phase (descent+bottom) */
  bottomPhaseBar: number;
  /** bar needed for ascent phases breathed from back gas */
  ascentOnBackGasBar: number;
  turnPressureBar: number;
  ok: boolean;
  litresAvailable: number;
}

export function backGasPlan(plan: DivePlan, cylinder: Cylinder, startBar: number, bottomSac: number, decoSac: number, minGasBar: number): BackGasPlan {
  const bottomGas = plan.segments[0].gas;
  let bottomL = 0;
  let ascentL = 0;
  for (const seg of plan.segments) {
    if (seg.gas !== bottomGas || seg.duration <= 0) continue;
    if (seg.kind === 'descent' || seg.kind === 'bottom') bottomL += segmentConsumption(seg, bottomSac);
    else ascentL += segmentConsumption(seg, decoSac);
  }
  const bottomPhaseBar = bottomL / cylinder.volumeL;
  const ascentOnBackGasBar = ascentL / cylinder.volumeL;
  const usableBar = startBar - minGasBar;
  // Turn pressure for a simple "all usable gas" plan: start minus half of usable (out and back), here we assume
  // a non-penetration dive so turn pressure = start − bottom phase (informational).
  const turnPressureBar = startBar - bottomPhaseBar;
  const ok = bottomPhaseBar + ascentOnBackGasBar <= usableBar;
  return { startBar, minimumGasBar: minGasBar, usableBar, bottomPhaseBar, ascentOnBackGasBar, turnPressureBar, ok, litresAvailable: cylinder.volumeL * startBar };
}

export interface DecoGasRequirement {
  name: string;
  litresNeeded: number;
  /** with reserve factor applied (GUE: plan ×1.5 or lost-gas contingency) */
  litresWithReserve: number;
  suggestedCylinder: Cylinder;
  barNeeded: number;
  fits: boolean;
}

export function decoGasRequirements(usage: GasUsage[], bottomGas: Gas, reserveFactor = 1.5): DecoGasRequirement[] {
  return usage
    .filter((u) => u.gas !== bottomGas)
    .map((u) => {
      const withReserve = u.litres * reserveFactor;
      const s40 = CYLINDERS.find((c) => c.name.startsWith('AL40'))!;
      const s80 = CYLINDERS.find((c) => c.name.startsWith('AL80'))!;
      const cyl = withReserve <= s40.volumeL * s40.workingPressureBar * 0.9 ? s40 : s80;
      const barNeeded = withReserve / cyl.volumeL;
      return { name: u.name, litresNeeded: u.litres, litresWithReserve: withReserve, suggestedCylinder: cyl, barNeeded, fits: barNeeded <= cyl.workingPressureBar };
    });
}
