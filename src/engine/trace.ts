/**
 * Supersaturation trace: replays a plan on the tissues and samples the leading-tissue gradient factor
 * ("GF99"-style: (Pt − Pamb) / (M − Pamb), M = Bühlmann M-value at the current ambient pressure) along the dive.
 * Display only; the schedule itself comes from planDive.
 */
import { COMPARTMENTS, HE_A, HE_B, N2_A, N2_B, SURFACE_PRESSURE_BAR } from './constants';
import { TissueState, cloneTissues, initialTissues, loadSegment } from './buhlmann';
import { depthToAmbient } from './gas';
import { DivePlan } from './planner';

export interface TracePoint {
  /** runtime, minutes */
  t: number;
  depth: number;
  /** leading-tissue gradient factor, 1.0 = at the M-value (can be negative when every tissue is undersaturated) */
  gf: number;
  /** index (0-based) of the leading compartment */
  lead: number;
}

/** Leading compartment's gradient factor at an ambient pressure (bar). */
export function leadingGf(t: TissueState, ambientBar: number): { gf: number; lead: number } {
  let gf = -Infinity; let lead = 0;
  for (let i = 0; i < COMPARTMENTS; i++) {
    const p = t.n2[i] + t.he[i];
    if (p <= 0) continue;
    const a = (N2_A[i] * t.n2[i] + HE_A[i] * t.he[i]) / p;
    const b = (N2_B[i] * t.n2[i] + HE_B[i] * t.he[i]) / p;
    const m = ambientBar / b + a;
    const g = (p - ambientBar) / (m - ambientBar);
    if (g > gf) { gf = g; lead = i; }
  }
  return { gf, lead };
}

/**
 * Samples every ≤ `stepMin` minutes (and at every segment end). `fromRuntime` limits the output to points at or after
 * that runtime (e.g. the start of the ascent); the replay itself always starts at t = 0.
 */
export function supersaturationTrace(plan: DivePlan, opts: { initialTissues?: TissueState; surfacePressureBar?: number; stepMin?: number; fromRuntime?: number } = {}): TracePoint[] {
  const surface = opts.surfacePressureBar ?? SURFACE_PRESSURE_BAR;
  const t = opts.initialTissues ? cloneTissues(opts.initialTissues) : initialTissues(surface);
  const step = opts.stepMin ?? 0.5;
  const from = opts.fromRuntime ?? 0;
  const out: TracePoint[] = [];
  const sample = (rt: number, d: number) => { if (rt >= from - 1e-9) out.push({ t: rt, depth: d, ...leadingGf(t, depthToAmbient(d, surface)) }); };
  let rt = 0;
  sample(0, plan.segments[0]?.startDepth ?? 0);
  for (const s of plan.segments) {
    if (s.duration <= 0) continue;
    const n = Math.max(1, Math.ceil(s.duration / step - 1e-9));
    for (let i = 0; i < n; i++) {
      const d0 = s.startDepth + ((s.endDepth - s.startDepth) * i) / n;
      const d1 = s.startDepth + ((s.endDepth - s.startDepth) * (i + 1)) / n;
      loadSegment(t, s.gas, d0, d1, s.duration / n, surface);
      rt += s.duration / n;
      sample(rt, d1);
    }
  }
  return out;
}

/** Runtime at which the ascent starts (end of the bottom phase). */
export const ascentStart = (plan: DivePlan): number => {
  const i = plan.segments.findIndex((s) => s.kind !== 'descent' && s.kind !== 'bottom');
  return i <= 0 ? 0 : plan.segments[i - 1].runtime;
};
