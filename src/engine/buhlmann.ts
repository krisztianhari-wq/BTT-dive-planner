import {
  COMPARTMENTS, HE_A, HE_B, HE_HALFTIMES, N2_A, N2_B, N2_HALFTIMES,
  AIR_N2, SURFACE_PRESSURE_BAR, WATER_VAPOUR_BAR,
} from './constants';
import { Gas, depthToAmbient, n2Fraction } from './gas';

const LN2 = Math.LN2;

export interface TissueState {
  /** inert gas tensions in bar, per compartment */
  n2: number[];
  he: number[];
}

export interface GradientFactors {
  /** GF low, e.g. 0.20 */
  low: number;
  /** GF high, e.g. 0.85 */
  high: number;
}

export function initialTissues(surfacePressure = SURFACE_PRESSURE_BAR): TissueState {
  const pN2 = AIR_N2 * (surfacePressure - WATER_VAPOUR_BAR);
  return {
    n2: new Array(COMPARTMENTS).fill(pN2),
    he: new Array(COMPARTMENTS).fill(0),
  };
}

export const cloneTissues = (t: TissueState): TissueState => ({ n2: [...t.n2], he: [...t.he] });

/** Inspired inert gas partial pressure at a given ambient pressure. */
function inspired(fraction: number, ambientBar: number): number {
  return Math.max(0, fraction * (ambientBar - WATER_VAPOUR_BAR));
}

/**
 * Schreiner equation: load tissues for a segment where depth changes linearly
 * from startDepth to endDepth over `minutes` breathing `gas`.
 * Mutates and returns `t`.
 */
export function loadSegment(t: TissueState, gas: Gas, startDepthM: number, endDepthM: number, minutes: number): TissueState {
  if (minutes <= 0) return t;
  const pStart = depthToAmbient(startDepthM);
  const pEnd = depthToAmbient(endDepthM);
  const rate = (pEnd - pStart) / minutes; // bar/min
  const fN2 = n2Fraction(gas);
  const fHe = gas.he;
  for (let i = 0; i < COMPARTMENTS; i++) {
    t.n2[i] = schreiner(t.n2[i], inspired(fN2, pStart), fN2 * rate, N2_HALFTIMES[i], minutes);
    t.he[i] = schreiner(t.he[i], inspired(fHe, pStart), fHe * rate, HE_HALFTIMES[i], minutes);
  }
  return t;
}

function schreiner(p0: number, pi0: number, r: number, halftime: number, tMin: number): number {
  const k = LN2 / halftime;
  return pi0 + r * (tMin - 1 / k) - (pi0 - p0 - r / k) * Math.exp(-k * tMin);
}

/**
 * Tolerated ambient pressure (bar) for compartment i at gradient factor gf.
 * Uses a/b weighted by the N2/He mix in the compartment.
 */
export function toleratedAmbient(t: TissueState, i: number, gf: number): number {
  const pN2 = t.n2[i];
  const pHe = t.he[i];
  const pTotal = pN2 + pHe;
  if (pTotal <= 0) return 0;
  const a = (N2_A[i] * pN2 + HE_A[i] * pHe) / pTotal;
  const b = (N2_B[i] * pN2 + HE_B[i] * pHe) / pTotal;
  // Bühlmann with GF: P_amb_tol = (P_tissue - a*gf) / (gf/b + 1 - gf)
  return (pTotal - a * gf) / (gf / b + 1 - gf);
}

/** Ceiling in bar (max over compartments) at gradient factor gf. */
export function ceilingBar(t: TissueState, gf: number): number {
  let c = 0;
  for (let i = 0; i < COMPARTMENTS; i++) c = Math.max(c, toleratedAmbient(t, i, gf));
  return c;
}

/** Ceiling in metres, never negative. */
export function ceilingDepth(t: TissueState, gf: number, surface = SURFACE_PRESSURE_BAR): number {
  return Math.max(0, (ceilingBar(t, gf) - surface) / 0.1);
}

/**
 * Supersaturation as a fraction of the M-value gradient (GF 1.0 = at M-value),
 * evaluated at the given ambient pressure. Useful for display/validation.
 */
export function gradientFactorNow(t: TissueState, ambientBar: number): number {
  let worst = 0;
  for (let i = 0; i < COMPARTMENTS; i++) {
    const pTotal = t.n2[i] + t.he[i];
    if (pTotal <= 0) continue;
    const a = (N2_A[i] * t.n2[i] + HE_A[i] * t.he[i]) / pTotal;
    const b = (N2_B[i] * t.n2[i] + HE_B[i] * t.he[i]) / pTotal;
    const mValue = ambientBar / b + a;
    const gf = (pTotal - ambientBar) / (mValue - ambientBar);
    worst = Math.max(worst, gf);
  }
  return worst;
}

/**
 * No-decompression limit in minutes at constant depth for a gas, at GF high
 * (direct ascent to the surface must be possible). Returns Infinity if never limited (within 999 min).
 */
export function ndl(gas: Gas, depthM: number, gfHigh: number, start?: TissueState): number {
  const t = start ? cloneTissues(start) : initialTissues();
  for (let m = 0; m < 999; m++) {
    const probe = cloneTissues(t);
    loadSegment(probe, gas, depthM, depthM, 1);
    if (ceilingBar(probe, gfHigh) > SURFACE_PRESSURE_BAR) return m;
    loadSegment(t, gas, depthM, depthM, 1);
  }
  return Infinity;
}
