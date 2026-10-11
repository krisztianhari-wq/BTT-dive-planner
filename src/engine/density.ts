/**
 * Breathing-gas density at depth (ideal gas). High gas density raises the work of breathing and the risk of CO2
 * retention regardless of narcosis or oxygen toxicity.
 * Limits: Anthony G, Mitchell SJ. "Respiratory physiology of rebreather diving", Rebreathers and Scientific
 * Diving (2016): ≤ 5.2 g/L recommended maximum, 6.2 g/L absolute (critical) maximum.
 */
import { Gas, depthToAmbient, gasName, n2Fraction } from './gas';
import { Msg, msg } from './messages';

/** molar masses, g/mol */
export const M_O2 = 32;
export const M_N2 = 28.0134;
export const M_HE = 4.0026;
/** universal gas constant, J/(mol·K) */
export const R_GAS = 8.314462618;
/** default gas temperature: 20 °C (no water temperature setting yet) */
export const DEFAULT_GAS_TEMP_K = 293.15;

/** recommended maximum (amber) and critical (red) density, g/L */
export const DENSITY_WARN_GL = 5.2;
export const DENSITY_CRIT_GL = 6.2;

/** Molar mass of a mix, g/mol. */
export const molarMass = (g: Gas): number => g.o2 * M_O2 + g.he * M_HE + n2Fraction(g) * M_N2;

/**
 * Gas density in g/L at the given depth: ρ = P·M / (R·T), with P in Pa (bar × 100 000), giving g/m³ → ÷ 1000.
 * The surface pressure defaults to sea level, which is the conservative (denser) choice at altitude.
 */
export function gasDensity(g: Gas, depthM: number, opts: { surfaceBar?: number; tempK?: number } = {}): number {
  const p = depthToAmbient(depthM, opts.surfaceBar);
  const tK = opts.tempK ?? DEFAULT_GAS_TEMP_K;
  return (p * 100000 * molarMass(g)) / (R_GAS * tK) / 1000;
}

export type DensityLevel = 'ok' | 'warn' | 'crit';
export const densityLevel = (gL: number): DensityLevel => (gL >= DENSITY_CRIT_GL ? 'crit' : gL >= DENSITY_WARN_GL ? 'warn' : 'ok');

/** Engine message for the density of `g` at `depthM` (null below the recommended maximum). */
export function densityMsg(g: Gas, depthM: number): Msg | null {
  const d = gasDensity(g, depthM);
  const lvl = densityLevel(d);
  if (lvl === 'ok') return null;
  return msg(lvl === 'crit' ? 'densityCritical' : 'densityHigh', { gas: gasName(g), density: d.toFixed(1), depth: depthM, limit: lvl === 'crit' ? DENSITY_CRIT_GL : DENSITY_WARN_GL });
}
