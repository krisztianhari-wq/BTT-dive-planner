/**
 * Sidemount: two independent cylinders breathed alternately. The diver switches regulators
 * so that the cylinders stay within one "step" of each other (TDI practice: first switch after
 * 1/6 of the start pressure, then every 1/3, i.e. within ~35 bar / 500 psi), and either cylinder
 * alone must still be able to bring the diver to the exit / surface.
 */
import { depthToAmbient } from './gas';
import { Segment } from './planner';

export type SmCyl = 'L' | 'R';

export interface SmSwitch {
  /** cylinder switched TO */
  to: SmCyl;
  /** pressure of the cylinder just left, bar */
  atBar: number;
  /** cumulative litres consumed at the switch */
  litres: number;
  /** runtime, minutes (when computed over a segment list) */
  runtime?: number;
  depth?: number;
}

export interface SmState {
  left: number;
  right: number;
  breathing: SmCyl;
  switches: SmSwitch[];
}

/** Default switch step: 1/6 of the start pressure rounded to 10 bar (200 bar → 30 bar). */
export const defaultSwitchStep = (startBar: number) => Math.max(10, Math.round(startBar / 6 / 10) * 10);

/**
 * Consume `litres` from a sidemount pair (single cylinder volume `volumeL`, both starting at `startBar`),
 * switching regulators whenever the breathed cylinder falls `stepBar` below the other.
 * Returns the end pressures and the switch list (litres-indexed).
 */
export function simulateSidemount(startBar: number, volumeL: number, litres: number, stepBar = defaultSwitchStep(startBar)): SmState {
  const st: SmState = { left: startBar, right: startBar, breathing: 'L', switches: [] };
  let remaining = litres;
  let consumed = 0;
  let guard = 0;
  while (remaining > 1e-9 && guard++ < 10000) {
    const cur = st.breathing === 'L' ? st.left : st.right;
    const other = st.breathing === 'L' ? st.right : st.left;
    const target = Math.max(0, other - stepBar); // switch when we are one step below the other cylinder
    const roomL = Math.max(0, (cur - target) * volumeL);
    if (roomL <= 1e-9) {
      if (cur <= 0 && other <= 0) break;
      // switch
      st.breathing = st.breathing === 'L' ? 'R' : 'L';
      st.switches.push({ to: st.breathing, atBar: cur, litres: consumed });
      continue;
    }
    const take = Math.min(roomL, remaining);
    if (st.breathing === 'L') st.left -= take / volumeL; else st.right -= take / volumeL;
    remaining -= take; consumed += take;
    if (remaining > 1e-9) {
      st.breathing = st.breathing === 'L' ? 'R' : 'L';
      st.switches.push({ to: st.breathing, atBar: st.breathing === 'L' ? st.right : st.left, litres: consumed });
    }
  }
  return st;
}

/** Litres available if one cylinder is lost: the remaining content of the fuller cylinder (worst case: lose the fuller one → the emptier). */
export const worstSingleCylinderLitres = (s: SmState, volumeL: number) => Math.min(s.left, s.right) * volumeL;

/**
 * Regulator switches placed on the timeline of a segment list, using the given SAC rates
 * (bottom SAC for descent/bottom, deco SAC for the rest). Only segments breathing `gasName`
 * (the back gas) consume from the pair.
 */
export function sidemountSwitchesOnProfile(
  segments: Segment[], isBackGas: (seg: Segment) => boolean, bottomSac: number, decoSac: number,
  startBar: number, volumeL: number, stepBar = defaultSwitchStep(startBar),
): { switches: SmSwitch[]; end: SmState } {
  // build cumulative litres → time mapping piecewise, then run the simulation and place switches
  let total = 0;
  const pieces: { l0: number; l1: number; t0: number; t1: number; d0: number; d1: number }[] = [];
  for (const seg of segments) {
    if (seg.duration <= 0 || !isBackGas(seg)) continue;
    const sac = seg.kind === 'descent' || seg.kind === 'bottom' ? bottomSac : decoSac;
    const l = sac * ((depthToAmbient(seg.startDepth) + depthToAmbient(seg.endDepth)) / 2) * seg.duration;
    pieces.push({ l0: total, l1: total + l, t0: seg.runtime - seg.duration, t1: seg.runtime, d0: seg.startDepth, d1: seg.endDepth });
    total += l;
  }
  const end = simulateSidemount(startBar, volumeL, total, stepBar);
  const at = (litres: number) => {
    const p = pieces.find((x) => litres >= x.l0 - 1e-9 && litres <= x.l1 + 1e-9) ?? pieces[pieces.length - 1];
    if (!p) return { runtime: 0, depth: 0 };
    const f = p.l1 > p.l0 ? (litres - p.l0) / (p.l1 - p.l0) : 0;
    return { runtime: p.t0 + f * (p.t1 - p.t0), depth: p.d0 + f * (p.d1 - p.d0) };
  };
  return { switches: end.switches.map((s) => ({ ...s, ...at(s.litres) })), end };
}
