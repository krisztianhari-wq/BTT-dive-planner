import {
  Gas, GUE_BOTTOM_GASES, GUE_DECO_GASES, GUE_LIMITS, StandardBottomGas, StandardDecoGas, mod,
} from './gas';

export type StandardId = 'gue' | 'generic';

export interface GasLimits {
  /** END above this is a hard blocker (m); null = no hard END limit */
  maxEndM: number | null;
  /** END above this only warns (m) */
  warnEndM: number;
  bottomPpO2Working: number;
  bottomPpO2Max: number;
  decoPpO2Max: number;
  minPpO2: number;
}

export interface GasStandard {
  id: StandardId;
  bottomGases: StandardBottomGas[];
  decoGases: StandardDecoGas[];
  limits: GasLimits;
  /** default last stop depth (m) */
  lastStopDepth: number;
  /** ascent rate between stops (m/min) */
  ascentRateShallowMpm: number;
  bottomGasFor(maxDepthM: number): StandardBottomGas | undefined;
  recommendedDecoGasesFor(maxDepthM: number): StandardDecoGas[];
}

/* ---------------- GUE ---------------- */

export const GUE_STANDARD: GasStandard = {
  id: 'gue',
  bottomGases: GUE_BOTTOM_GASES,
  decoGases: GUE_DECO_GASES,
  limits: { ...GUE_LIMITS, maxEndM: GUE_LIMITS.maxEndM, warnEndM: GUE_LIMITS.maxEndM },
  lastStopDepth: 6,
  ascentRateShallowMpm: 3,
  bottomGasFor(maxDepthM) {
    return GUE_BOTTOM_GASES.find((g) => !g.optional && maxDepthM > g.minDepth && maxDepthM <= g.maxDepth) ??
      (maxDepthM <= 0 ? GUE_BOTTOM_GASES[0] : undefined);
  },
  recommendedDecoGasesFor(maxDepthM) {
    const out: StandardDecoGas[] = [];
    if (maxDepthM > 90) out.push(GUE_DECO_GASES[3]);
    if (maxDepthM > 70) out.push(GUE_DECO_GASES[2]);
    if (maxDepthM > 24) out.push(GUE_DECO_GASES[1]);
    if (maxDepthM > 51) out.push(GUE_DECO_GASES[0]);
    return out;
  },
};

/* ---------------- Generic (PADI / SSI / TDI style) ---------------- */

const g = (o2: number, he: number, name: string): Gas => ({ o2, he, name });

/**
 * Commonly used gases outside GUE. Recreational nitrox blends by MOD at pO2 1.4,
 * air to the 40 m recreational limit (tech agencies allow it deeper, we warn), then
 * normoxic/hypoxic trimix blends typical in TDI/PADI Tec courses.
 */
export const GENERIC_BOTTOM_GASES: StandardBottomGas[] = [
  { gas: g(0.40, 0, 'EAN40'), minDepth: 0, maxDepth: 24 },
  { gas: g(0.36, 0, 'EAN36'), minDepth: 0, maxDepth: 28 },
  { gas: g(0.32, 0, 'EAN32'), minDepth: 0, maxDepth: 33 },
  { gas: g(0.28, 0, 'EAN28'), minDepth: 0, maxDepth: 39 },
  { gas: g(0.21, 0, 'Air'), minDepth: 0, maxDepth: 40 },
  { gas: g(0.21, 0.35, '21/35'), minDepth: 40, maxDepth: 55 },
  { gas: g(0.18, 0.45, '18/45'), minDepth: 50, maxDepth: 65 },
  { gas: g(0.15, 0.55, '15/55'), minDepth: 60, maxDepth: 80 },
  { gas: g(0.12, 0.60, '12/60'), minDepth: 75, maxDepth: 95 },
  { gas: g(0.10, 0.70, '10/70'), minDepth: 90, maxDepth: 120 },
];

export const GENERIC_DECO_GASES: StandardDecoGas[] = [
  { gas: g(1.0, 0, 'O2'), switchDepth: 6 },
  { gas: g(0.8, 0, 'EAN80'), switchDepth: 9 },
  { gas: g(0.5, 0, 'EAN50'), switchDepth: 21 },
  { gas: g(0.35, 0.25, '35/25'), switchDepth: 36 },
];

export const GENERIC_LIMITS: GasLimits = {
  maxEndM: null,
  warnEndM: 40,
  bottomPpO2Working: 1.4,
  bottomPpO2Max: 1.6,
  decoPpO2Max: 1.6,
  minPpO2: 0.18,
};

export const GENERIC_STANDARD: GasStandard = {
  id: 'generic',
  bottomGases: GENERIC_BOTTOM_GASES,
  decoGases: GENERIC_DECO_GASES,
  limits: GENERIC_LIMITS,
  lastStopDepth: 3,
  ascentRateShallowMpm: 9,
  bottomGasFor(maxDepthM) {
    if (maxDepthM <= 40) {
      // richest standard nitrox whose MOD at pO2 1.4 covers the depth ("best mix", rounded down to a standard blend)
      const nitrox = GENERIC_BOTTOM_GASES.filter((b) => b.gas.he === 0);
      return nitrox.find((b) => mod(b.gas, 1.4) >= maxDepthM) ?? nitrox[nitrox.length - 1];
    }
    const tmx = GENERIC_BOTTOM_GASES.filter((b) => b.gas.he > 0);
    return tmx.find((b) => maxDepthM > b.minDepth && maxDepthM <= b.maxDepth) ?? undefined;
  },
  recommendedDecoGasesFor(maxDepthM) {
    const out: StandardDecoGas[] = [];
    if (maxDepthM > 70) out.push(GENERIC_DECO_GASES[3]);
    if (maxDepthM > 30) out.push(GENERIC_DECO_GASES[2]);
    if (maxDepthM > 45) out.push(GENERIC_DECO_GASES[0]);
    return out;
  },
};

export const STANDARDS: Record<StandardId, GasStandard> = { gue: GUE_STANDARD, generic: GENERIC_STANDARD };
