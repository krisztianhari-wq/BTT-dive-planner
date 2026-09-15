export type UnitSystem = 'metric' | 'imperial';

const FT = 3.28084;
const PSI = 14.5038;
const CUFT = 0.0353147;

export interface Units {
  sys: UnitSystem;
  /** unit labels */
  d: string; p: string; v: string; sac: string; rate: string;
  /** metric → display number */
  depthN(m: number): number;
  pressureN(bar: number): number;
  volumeN(l: number): number;
  sacN(lpm: number): number;
  /** metric → formatted string with unit */
  depth(m: number, digits?: number): string;
  pressure(bar: number, digits?: number): string;
  volume(l: number): string;
  sacS(lpm: number): string;
  /** display → metric */
  toM(v: number): number;
  toBar(v: number): number;
  toLpm(v: number): number;
  /** input steps */
  sacStep: number;
}

export function makeUnits(sys: UnitSystem, locale: string): Units {
  const f = (v: number, digits = 0) => v.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  if (sys === 'metric') {
    return {
      sys, d: 'm', p: 'bar', v: 'L', sac: 'l/min', rate: 'm/min',
      depthN: (m) => Math.round(m), pressureN: (b) => Math.round(b), volumeN: (l) => Math.round(l), sacN: (s) => s,
      depth: (m, digits = 0) => `${f(m, digits)} m`,
      pressure: (b, digits = 0) => `${f(b, digits)} bar`,
      volume: (l) => `${f(l)} L`,
      sacS: (s) => `${f(s)} l/min`,
      toM: (v) => v, toBar: (v) => v, toLpm: (v) => v, sacStep: 1,
    };
  }
  return {
    sys, d: 'ft', p: 'psi', v: 'cu ft', sac: 'cu ft/min', rate: 'ft/min',
    depthN: (m) => Math.round(m * FT), pressureN: (b) => Math.round(b * PSI), volumeN: (l) => Math.round(l * CUFT * 10) / 10,
    sacN: (s) => Math.round(s * CUFT * 100) / 100,
    depth: (m, digits = 0) => `${f(m * FT, digits)} ft`,
    pressure: (b, digits = 0) => `${f(b * PSI, digits)} psi`,
    volume: (l) => `${f(l * CUFT, 1)} cu ft`,
    sacS: (s) => `${f(s * CUFT, 2)} cu ft/min`,
    toM: (v) => v / FT, toBar: (v) => v / PSI, toLpm: (v) => v / CUFT, sacStep: 0.05,
  };
}
