/**
 * Recreational (no-decompression) planning: the dive must stay within the no-deco limit,
 * with a direct ascent and a safety stop. Rock-bottom gas reserve for two divers.
 */
import { ndl } from './buhlmann';
import { Gas, depthToAmbient, end, gasName, ppO2 } from './gas';
import { Cylinder, roundBar } from './gasPlan';
import { Msg, msg } from './messages';

export interface RecInput {
  maxDepth: number;
  /** planned bottom time incl. descent, minutes */
  bottomTime: number;
  gas: Gas;
  cylinder: Cylinder;
  startBar: number;
  sacLpm: number;
  gfHigh: number;
  descentRateMpm?: number;
  ascentRateMpm?: number;
  safetyStopDepth?: number;
  safetyStopMinutes?: number;
  /** recreational depth limit, m */
  maxDepthLimit?: number;
}

export interface RecPlan {
  ndlMinutes: number;
  /** longest bottom time (incl. descent) that stays within the NDL */
  maxBottomTime: number;
  feasible: boolean;
  blockers: Msg[];
  warnings: Msg[];
  ascentMinutes: number;
  runtime: number;
  /** gas used for descent + bottom + ascent + safety stop, litres */
  gasUsedLitres: number;
  gasUsedBar: number;
  /** rock bottom reserve (2 divers, stressed SAC, 1 min problem solving, ascent, safety stop), litres and bar */
  rockBottomLitres: number;
  rockBottomBar: number;
  /** pressure at which the dive must be turned/ended to keep rock bottom, bar */
  turnBar: number;
  gasOk: boolean;
  /** bar missing when not ok */
  shortBar: number;
}

export function planRecreational(i: RecInput): RecPlan {
  const descentRate = i.descentRateMpm ?? 20;
  const ascentRate = i.ascentRateMpm ?? 9;
  const ssDepth = i.safetyStopDepth ?? 5;
  const ssMin = i.safetyStopMinutes ?? 3;
  const limit = i.maxDepthLimit ?? 40;
  const blockers: Msg[] = []; const warnings: Msg[] = [];

  // NDL at depth on this gas; bottom time includes the descent (loading during descent is smaller, so this is conservative)
  const n = ndl(i.gas, i.maxDepth, i.gfHigh);
  const ndlMinutes = Number.isFinite(n) ? n : 999;
  const maxBottomTime = ndlMinutes;
  if (i.bottomTime > ndlMinutes) blockers.push(msg('recOverNdl', { bottom: i.bottomTime, ndl: ndlMinutes, over: i.bottomTime - ndlMinutes }));
  if (i.maxDepth > limit) blockers.push(msg('recDepthLimit', { depth: i.maxDepth, limit }));
  const p = ppO2(i.gas, i.maxDepth);
  if (p > 1.4) blockers.push(msg('ppo2AboveMax', { gas: gasName(i.gas), ppo2: p.toFixed(2), depth: i.maxDepth, mod: '', limit: 1.4 }));
  const e = end(i.gas, i.maxDepth);
  if (e > 30) warnings.push(msg('endHigh', { gas: gasName(i.gas), end: e.toFixed(0), limit: 30 }));

  // profile gas: descent + bottom at max depth, ascent to safety stop, stop, ascent to surface
  const descentMin = i.maxDepth / descentRate;
  const bottomMin = Math.max(0, i.bottomTime - descentMin);
  const a1 = Math.max(0, (i.maxDepth - ssDepth) / ascentRate);
  const a2 = ssDepth / ascentRate;
  const ascentMinutes = a1 + ssMin + a2;
  const avg = (d1: number, d2: number) => (depthToAmbient(d1) + depthToAmbient(d2)) / 2;
  const gasUsedLitres = i.sacLpm * (avg(0, i.maxDepth) * descentMin + depthToAmbient(i.maxDepth) * bottomMin + avg(i.maxDepth, ssDepth) * a1 + depthToAmbient(ssDepth) * ssMin + avg(ssDepth, 0) * a2);
  const gasUsedBar = gasUsedLitres / i.cylinder.volumeL;

  // rock bottom: 2 divers × 20 l/min: 1 min at depth + ascent + safety stop
  const stressed = 20 * 2;
  const rockBottomLitres = stressed * (depthToAmbient(i.maxDepth) * 1 + avg(i.maxDepth, ssDepth) * a1 + depthToAmbient(ssDepth) * ssMin + avg(ssDepth, 0) * a2);
  const rockBottomBar = roundBar(rockBottomLitres / i.cylinder.volumeL);
  const turnBar = rockBottomBar;
  const availableBar = i.startBar - rockBottomBar;
  const gasOk = gasUsedBar <= availableBar;
  const shortBar = Math.max(0, gasUsedBar - availableBar);
  if (!gasOk) blockers.push(msg('recGasShort', { short: Math.ceil(shortBar), shortL: Math.round(shortBar * i.cylinder.volumeL) }));

  return {
    ndlMinutes, maxBottomTime, feasible: blockers.length === 0, blockers, warnings,
    ascentMinutes, runtime: i.bottomTime + ascentMinutes, gasUsedLitres, gasUsedBar,
    rockBottomLitres, rockBottomBar, turnBar, gasOk, shortBar,
  };
}
