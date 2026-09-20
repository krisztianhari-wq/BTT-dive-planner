import { SURFACE_PRESSURE_BAR } from './constants';
import { Gas, depthToAmbient, gasName, mod, ppO2 } from './gas';
import { GradientFactors, TissueState, ceilingBar, cloneTissues, initialTissues, loadSegment } from './buhlmann';
import { Msg, msg } from './messages';

export interface DecoGasSpec {
  gas: Gas;
  /** depth at which the diver switches to this gas (m) */
  switchDepth: number;
}

export interface PlanSettings {
  gf: GradientFactors;
  descentRateMpm: number; // e.g. 20
  ascentRateMpm: number;  // to first stop, e.g. 9
  ascentRateShallowMpm: number; // between stops, e.g. 3 (GUE style) or 9
  /** last stop depth, 3 or 6 m */
  lastStopDepth: number;
  stopIncrementM: number; // 3
  /** minimum deco stop length increment in minutes (1) */
  stopStepMin: number;
  /** time spent at the switch depth for every gas switch, minutes (team confirms and switches) */
  gasSwitchMinutes: number;
  /**
   * Where the GF slope is evaluated when deciding whether a stop can be left:
   * 'next' (default; Subsurface / Shearwater convention) at the next stop depth,
   * 'current' (more conservative, dive-deco convention) at the current stop depth.
   */
  gfEvalAt: 'next' | 'current';
  /** pO2 thresholds used for warnings */
  ppO2Working: number;
  ppO2Max: number;
  decoPpO2Max: number;
}

export const DEFAULT_SETTINGS: PlanSettings = {
  gf: { low: 0.2, high: 0.85 },
  descentRateMpm: 20,
  ascentRateMpm: 9,
  ascentRateShallowMpm: 3,
  lastStopDepth: 6,
  stopIncrementM: 3,
  stopStepMin: 1,
  gasSwitchMinutes: 1,
  gfEvalAt: 'next',
  ppO2Working: 1.2,
  ppO2Max: 1.4,
  decoPpO2Max: 1.6,
};

export type SegmentKind = 'descent' | 'bottom' | 'ascent' | 'stop' | 'switch';

export interface Segment {
  kind: SegmentKind;
  startDepth: number;
  endDepth: number;
  /** duration in minutes */
  duration: number;
  /** runtime at end of segment, minutes */
  runtime: number;
  gas: Gas;
}

export interface DivePlan {
  segments: Segment[];
  /** total runtime, minutes */
  runtime: number;
  /** total decompression time (stops + ascent from first stop), minutes */
  decoTime: number;
  bottomTime: number;
  maxDepth: number;
  firstStopDepth: number | null;
  tissuesAtSurface: TissueState;
  warnings: Msg[];
}

export interface DiveInput {
  maxDepth: number;
  /** bottom time including descent, GUE convention */
  bottomTime: number;
  bottomGas: Gas;
  decoGases: DecoGasSpec[];
  settings?: Partial<PlanSettings>;
}

const roundUpTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

/** Which gas to breathe at a given depth on ascent: deepest-switch-first ordering. */
export function gasAtDepth(depth: number, bottomGas: Gas, decoGases: DecoGasSpec[]): Gas {
  const sorted = [...decoGases].sort((a, b) => a.switchDepth - b.switchDepth);
  for (const d of sorted) if (depth <= d.switchDepth + 1e-9) return d.gas;
  return bottomGas;
}

/**
 * Generate a decompression schedule with Bühlmann ZH-L16C + gradient factors.
 * GF low is applied at the first stop, GF high at the surface, linearly interpolated in between.
 */
export function planDive(input: DiveInput): DivePlan {
  const s: PlanSettings = { ...DEFAULT_SETTINGS, ...input.settings };
  const warnings: Msg[] = [];
  const segments: Segment[] = [];
  const t = initialTissues();
  let runtime = 0;
  let depth = 0;

  const push = (kind: SegmentKind, from: number, to: number, duration: number, gas: Gas) => {
    if (duration > 0) loadSegment(t, gas, from, to, duration);
    runtime += duration;
    segments.push({ kind, startDepth: from, endDepth: to, duration, runtime, gas });
    depth = to;
  };

  // Descent
  const descentTime = input.maxDepth / s.descentRateMpm;
  push('descent', 0, input.maxDepth, descentTime, input.bottomGas);
  // Bottom (bottom time includes descent)
  const levelTime = Math.max(0, input.bottomTime - descentTime);
  if (input.bottomTime < descentTime) warnings.push(msg('bottomTimeShorterThanDescent'));
  push('bottom', input.maxDepth, input.maxDepth, levelTime, input.bottomGas);

  // Determine first stop with GF low
  const firstStopCandidate = (): number => {
    const c = ceilingBar(t, s.gf.low);
    const cDepth = Math.max(0, (c - SURFACE_PRESSURE_BAR) / 0.1);
    if (cDepth <= 0) return 0;
    return Math.max(s.lastStopDepth, roundUpTo(cDepth, s.stopIncrementM));
  };

  let firstStop = firstStopCandidate();
  // Ascend towards first stop, re-evaluating (ascent itself off-gasses fast tissues, may deepen/shallow the ceiling)
  let decoStart = runtime;
  let firstStopDepth: number | null = null;

  const gfAt = (d: number): number => {
    if (firstStopDepth === null || firstStopDepth <= 0) return s.gf.high;
    const frac = Math.min(1, Math.max(0, d / firstStopDepth));
    return s.gf.high - (s.gf.high - s.gf.low) * frac;
  };

  // Ascent loop: move up in stopIncrement steps, checking ceiling at each candidate depth.
  let currentGas = input.bottomGas;
  // Initial ascent to the first stop candidate (or surface if none)
  let target = firstStop > 0 ? firstStop : 0;

  const ascendTo = (to: number) => {
    // handle gas switches on the way: switch at deco gas switch depths crossed
    let from = depth;
    const switches = [...input.decoGases].sort((a, b) => b.switchDepth - a.switchDepth)
      .filter((d) => d.switchDepth < from && d.switchDepth >= to);
    for (const sw of switches) {
      const rate = from > (firstStopDepth ?? Infinity) ? s.ascentRateMpm : (firstStopDepth === null ? s.ascentRateMpm : s.ascentRateShallowMpm);
      push('ascent', from, sw.switchDepth, (from - sw.switchDepth) / rate, currentGas);
      currentGas = sw.gas;
      push('switch', sw.switchDepth, sw.switchDepth, s.gasSwitchMinutes, currentGas);
      from = sw.switchDepth;
    }
    if (from > to) {
      const rate = firstStopDepth === null ? s.ascentRateMpm : s.ascentRateShallowMpm;
      push('ascent', from, to, (from - to) / rate, currentGas);
    }
  };

  // First ascent: go to first stop candidate; if during ascent the ceiling drops, keep going.
  if (target === 0) {
    // No deco expected; ascend straight, but verify ceiling never exceeds depth (GF high at surface)
    ascendTo(0);
  } else {
    ascendTo(target);
    // Re-check: maybe no stop needed now at GF low
    firstStop = firstStopCandidate();
    while (firstStop < depth && depth > 0) {
      // ceiling shallower than where we are; ascend further to the new candidate
      const next = firstStop > 0 ? firstStop : 0;
      ascendTo(next);
      if (next === 0) break;
      firstStop = firstStopCandidate();
    }
    if (depth > 0) firstStopDepth = depth;
  }

  decoStart = segments.find((sg) => sg.kind === 'ascent')?.runtime ?? runtime;
  decoStart -= segments.find((sg) => sg.kind === 'ascent')?.duration ?? 0;

  // Stop loop
  let guard = 0;
  while (depth > 0 && guard++ < 10000) {
    const nextDepth = Math.max(0, depth - s.stopIncrementM);
    const nextTarget = depth <= s.lastStopDepth ? 0 : nextDepth;
    // Can we ascend to nextTarget now? Check ceiling at GF for nextTarget.
    const canAscend = () => ceilingBar(t, gfAt(s.gfEvalAt === 'current' ? depth : nextTarget)) <= depthToAmbient(nextTarget) + 1e-9;
    let stopMinutes = 0;
    // Ensure gas at this stop depth is correct (switch if we are at a switch depth)
    const gasHere = gasAtDepth(depth, input.bottomGas, input.decoGases);
    if (gasHere !== currentGas) {
      currentGas = gasHere;
      push('switch', depth, depth, s.gasSwitchMinutes, currentGas);
    }
    while (!canAscend()) {
      // Simulate one more minute at this depth
      loadSegment(t, currentGas, depth, depth, s.stopStepMin);
      runtime += s.stopStepMin;
      stopMinutes += s.stopStepMin;
      if (stopMinutes > 600) { warnings.push(msg('stopTooLong')); break; }
    }
    if (stopMinutes > 0) {
      segments.push({ kind: 'stop', startDepth: depth, endDepth: depth, duration: stopMinutes, runtime, gas: currentGas });
    }
    ascendTo(nextTarget);
  }

  // Merge consecutive ascent segments with the same gas for readability (keeps switches)
  const merged = mergeSegments(segments);

  const maxDepth = input.maxDepth;
  const totalRuntime = runtime;
  const decoTime = Math.max(0, totalRuntime - decoStart);

  // Warnings: pO2 / MOD
  const bottomPpO2 = ppO2(input.bottomGas, maxDepth);
  if (bottomPpO2 > s.ppO2Max) warnings.push(msg('ppo2AboveMax', { gas: gasName(input.bottomGas), ppo2: bottomPpO2.toFixed(2), depth: maxDepth, mod: mod(input.bottomGas, s.ppO2Max).toFixed(0), limit: s.ppO2Max }));
  else if (bottomPpO2 > s.ppO2Working) warnings.push(msg('ppo2AboveWorking', { gas: gasName(input.bottomGas), ppo2: bottomPpO2.toFixed(2), limit: s.ppO2Working }));
  if (bottomPpO2 < 0.18) warnings.push(msg('hypoxicBottomGas', { gas: gasName(input.bottomGas), ppo2: bottomPpO2.toFixed(2) }));
  for (const d of input.decoGases) {
    const m = mod(d.gas, s.decoPpO2Max);
    if (d.switchDepth > m + 0.5) warnings.push(msg('decoSwitchExceedsMod', { gas: gasName(d.gas), depth: d.switchDepth, mod: m.toFixed(1), limit: s.decoPpO2Max }));
  }

  const actualStops = merged.filter((sg) => sg.kind === 'stop');
  const reportedFirstStop = actualStops.length ? actualStops[0].startDepth : null;

  return {
    segments: merged,
    runtime: totalRuntime,
    decoTime: reportedFirstStop === null ? 0 : decoTime,
    bottomTime: input.bottomTime,
    maxDepth,
    firstStopDepth: reportedFirstStop,
    tissuesAtSurface: cloneTissues(t),
    warnings,
  };
}

function mergeSegments(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const sg of segs) {
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'ascent' && sg.kind === 'ascent' && prev.gas === sg.gas && prev.endDepth === sg.startDepth) {
      prev.endDepth = sg.endDepth;
      prev.duration += sg.duration;
      prev.runtime = sg.runtime;
    } else {
      out.push({ ...sg });
    }
  }
  return out;
}

/** Human-readable stop table: depth, minutes, runtime, gas. */
export interface StopRow { depth: number; minutes: number; runtime: number; gas: string }
export function stopTable(plan: DivePlan): StopRow[] {
  return plan.segments
    .filter((s) => s.kind === 'stop')
    .map((s) => ({ depth: s.startDepth, minutes: Math.round(s.duration), runtime: Math.round(s.runtime), gas: gasName(s.gas) }));
}
