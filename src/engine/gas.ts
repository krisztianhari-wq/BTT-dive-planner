import { BAR_PER_METER_SW, SURFACE_PRESSURE_BAR } from './constants';

export interface Gas {
  /** oxygen fraction 0..1 */
  o2: number;
  /** helium fraction 0..1 */
  he: number;
  name?: string;
}

export const n2Fraction = (g: Gas): number => Math.max(0, 1 - g.o2 - g.he);

export const gasName = (g: Gas): string => {
  if (g.name) return g.name;
  const o2 = Math.round(g.o2 * 100);
  const he = Math.round(g.he * 100);
  if (he === 0) {
    if (o2 === 21) return 'Air';
    if (o2 === 100) return 'O2';
    return `EAN${o2}`;
  }
  return `${o2}/${he}`;
};

export const depthToAmbient = (depthM: number, surface = SURFACE_PRESSURE_BAR): number =>
  surface + depthM * BAR_PER_METER_SW;

export const ambientToDepth = (pBar: number, surface = SURFACE_PRESSURE_BAR): number =>
  Math.max(0, (pBar - surface) / BAR_PER_METER_SW);

export const ppO2 = (g: Gas, depthM: number): number => g.o2 * depthToAmbient(depthM);

/** Maximum operating depth for a given pO2 limit, metres. */
export const mod = (g: Gas, maxPpO2: number): number => ambientToDepth(maxPpO2 / g.o2);

/**
 * Equivalent narcotic depth, metres. GUE convention: oxygen counts as narcotic,
 * only helium is treated as non-narcotic (END based on total non-helium fraction).
 */
export const end = (g: Gas, depthM: number): number => ambientToDepth(depthToAmbient(depthM) * (1 - g.he));

/** Equivalent air depth (nitrogen only), metres. */
export const ead = (g: Gas, depthM: number): number => ambientToDepth((depthToAmbient(depthM) * n2Fraction(g)) / 0.79);

/* ---------- GUE standard gases ---------- */

export interface StandardBottomGas {
  gas: Gas;
  /** depth range in metres where this is the standard bottom gas */
  minDepth: number;
  maxDepth: number;
  /** selectable, but never picked automatically (not a standard gas of the agency, e.g. air under GUE) */
  optional?: boolean;
}

export const GUE_BOTTOM_GASES: StandardBottomGas[] = [
  { gas: { o2: 0.32, he: 0.0, name: 'EAN32' }, minDepth: 0, maxDepth: 30 },
  // air: selectable (clubs dive it in shallow water and caves); limited to 30 m by the GUE END limit
  { gas: { o2: 0.21, he: 0.0, name: 'Air' }, minDepth: 0, maxDepth: 30, optional: true },
  { gas: { o2: 0.30, he: 0.30, name: '30/30' }, minDepth: 30, maxDepth: 40 },
  { gas: { o2: 0.21, he: 0.35, name: '21/35' }, minDepth: 40, maxDepth: 51 },
  { gas: { o2: 0.18, he: 0.45, name: '18/45' }, minDepth: 51, maxDepth: 60 },
  { gas: { o2: 0.15, he: 0.55, name: '15/55' }, minDepth: 60, maxDepth: 75 },
  { gas: { o2: 0.12, he: 0.65, name: '12/65' }, minDepth: 75, maxDepth: 90 },
  { gas: { o2: 0.10, he: 0.70, name: '10/70' }, minDepth: 90, maxDepth: 120 },
];

export interface StandardDecoGas {
  gas: Gas;
  /** standard switch depth in metres (pO2 ≈ 1.6) */
  switchDepth: number;
}

export const GUE_DECO_GASES: StandardDecoGas[] = [
  { gas: { o2: 1.0, he: 0.0, name: 'O2' }, switchDepth: 6 },
  { gas: { o2: 0.5, he: 0.0, name: 'EAN50' }, switchDepth: 21 },
  { gas: { o2: 0.35, he: 0.25, name: '35/25' }, switchDepth: 36 },
  { gas: { o2: 0.21, he: 0.35, name: '21/35' }, switchDepth: 57 },
];

/** GUE operational limits */
export const GUE_LIMITS = {
  maxEndM: 30,
  bottomPpO2Working: 1.2,
  bottomPpO2Max: 1.4,
  decoPpO2Max: 1.6,
  minPpO2: 0.18,
};

export function standardBottomGasFor(maxDepthM: number): StandardBottomGas | undefined {
  return GUE_BOTTOM_GASES.find((g) => !g.optional && maxDepthM > g.minDepth && maxDepthM <= g.maxDepth) ??
    (maxDepthM <= 0 ? GUE_BOTTOM_GASES[0] : undefined);
}

/**
 * Recommended deco gases for a given max depth, deepest first.
 * Heuristic mirroring GUE course structure: Tech 1 (≤51 m) → EAN50 only,
 * deeper → EAN50 + O2, 35/25 from ~70 m, 21/35 from ~90 m.
 */
export function recommendedDecoGasesFor(maxDepthM: number): StandardDecoGas[] {
  const out: StandardDecoGas[] = [];
  if (maxDepthM > 90) out.push(GUE_DECO_GASES[3]);
  if (maxDepthM > 70) out.push(GUE_DECO_GASES[2]);
  if (maxDepthM > 24) out.push(GUE_DECO_GASES[1]);
  if (maxDepthM > 51) out.push(GUE_DECO_GASES[0]);
  return out;
}
