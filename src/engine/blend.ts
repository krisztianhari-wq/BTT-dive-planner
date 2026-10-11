/**
 * Partial-pressure gas blending (nitrox / trimix), ideal gas.
 * Order: (drain if needed) → add helium → add oxygen → top up with air or a nitrox top gas.
 * Real gases deviate (compressibility Z ≠ 1, especially He and O2 above ~200 bar): the blender must analyse the
 * result and correct; the numbers here are a starting point, not a substitute for analysis.
 */
import { Gas, mod } from './gas';

export interface BlendInput {
  /** target mix (fractions 0..1) and pressure */
  target: Gas;
  targetBar: number;
  /** what is already in the cylinder */
  start: Gas;
  startBar: number;
  /** top-up gas (air or nitrox, no helium) */
  top: Gas;
}

export interface BlendResult {
  feasible: boolean;
  /** why not feasible */
  reason?: 'unreachable' | 'badInput';
  /** drain the start gas down to this pressure first (null = no draining needed) */
  drainToBar: number | null;
  /** start pressure actually used (after draining) */
  startUsedBar: number;
  heBar: number;
  o2Bar: number;
  topBar: number;
  /** cylinder pressure after each step */
  afterHeBar: number;
  afterO2Bar: number;
  /** resulting mix (recomputed from the partial pressures) */
  result: Gas;
  mod14: number;
  mod16: number;
}

const EPS = 1e-9;

/** Additions as linear functions of the start pressure p (bar). */
function additions(i: BlendInput, p: number) {
  const f = i.top.o2;
  // helium: target He partial pressure minus what is there (top gas has none, enforced by the caller)
  const he = i.targetBar * i.target.he - p * i.start.he;
  // oxygen: O2 balance with the remaining top-up of fraction f
  const o2 = (i.targetBar * i.target.o2 - p * i.start.o2 - f * (i.targetBar - p - he)) / (1 - f);
  const top = i.targetBar - p - he - o2;
  return { he, o2, top };
}

export function planBlend(i: BlendInput): BlendResult {
  const bad = (reason: BlendResult['reason']): BlendResult => ({ feasible: false, reason, drainToBar: null, startUsedBar: i.startBar, heBar: 0, o2Bar: 0, topBar: 0, afterHeBar: i.startBar, afterO2Bar: i.startBar, result: i.target, mod14: mod(i.target, 1.4), mod16: mod(i.target, 1.6) });
  const valid = (g: Gas) => g.o2 > 0 && g.o2 <= 1 && g.he >= 0 && g.o2 + g.he <= 1 + EPS;
  if (!valid(i.target) || !valid(i.start) || !valid(i.top) || i.top.he > 0 || i.top.o2 >= 1 || i.targetBar <= 0 || i.startBar < 0 || i.startBar > i.targetBar + EPS) return bad('badInput');
  // every addition is linear in the start pressure p: a(p) = A + B·p; feasible p is an interval in [0, startBar]
  let lo = 0; let hi = i.startBar;
  const a0 = additions(i, 0); const a1 = additions(i, 1);
  for (const k of ['he', 'o2', 'top'] as const) {
    const A = a0[k]; const B = a1[k] - a0[k];
    if (Math.abs(B) < EPS) { if (A < -EPS) return bad('unreachable'); continue; }
    const root = -A / B; // a(p) ≥ 0 ⇔ p ≤ root (B < 0) or p ≥ root (B > 0)
    if (B < 0) hi = Math.min(hi, root); else lo = Math.max(lo, root);
  }
  if (lo > hi + EPS) return bad('unreachable');
  const p = Math.max(0, Math.min(hi, i.startBar)); // keep as much of the start gas as possible
  const add = additions(i, p);
  const he = Math.max(0, add.he); const o2 = Math.max(0, add.o2); const top = Math.max(0, add.top);
  const total = p + he + o2 + top;
  const result: Gas = {
    o2: (p * i.start.o2 + o2 + top * i.top.o2) / total,
    he: (p * i.start.he + he) / total,
  };
  return {
    feasible: true, drainToBar: p < i.startBar - 1e-6 ? p : null, startUsedBar: p,
    heBar: he, o2Bar: o2, topBar: top, afterHeBar: p + he, afterO2Bar: p + he + o2,
    result, mod14: mod(result, 1.4), mod16: mod(result, 1.6),
  };
}
