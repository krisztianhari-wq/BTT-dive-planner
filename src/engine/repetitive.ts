/**
 * Repetitive dives: tissue tensions at the start of a new dive after earlier dives and surface intervals.
 * Two sources: manually entered square profiles (re-planned with planDive, deco on the bottom gas = conservative),
 * or the actual depth samples of logged dives (napló), loaded segment by segment with the Schreiner equation.
 */
import { SURFACE_PRESSURE_BAR } from './constants';
import { TissueState, cloneTissues, initialTissues, loadSegment } from './buhlmann';
import { Gas } from './gas';
import { PlanSettings, planDive } from './planner';

const AIR: Gas = { o2: 0.21, he: 0 };

export interface PreviousDive {
  maxDepth: number;
  /** bottom time incl. descent, minutes */
  bottomTime: number;
  gas: Gas;
  /** surface interval after this dive (until the next one, or the new dive), minutes */
  surfaceIntervalMin: number;
}

/**
 * Manually entered previous dives, oldest first. Each is planned with planDive on its own gas only (no deco gas:
 * a longer, richer-in-inert-gas deco than reality = conservative), then the surface interval is breathed on air.
 */
export function tissuesAfterDives(dives: PreviousDive[], opts: { settings?: Partial<PlanSettings>; surfacePressureBar?: number; start?: TissueState } = {}): TissueState {
  const surface = opts.surfacePressureBar ?? opts.settings?.surfacePressureBar ?? SURFACE_PRESSURE_BAR;
  let t = opts.start ? cloneTissues(opts.start) : initialTissues(surface);
  for (const d of dives) {
    if (d.maxDepth > 0 && d.bottomTime > 0) {
      const p = planDive({ maxDepth: d.maxDepth, bottomTime: d.bottomTime, bottomGas: d.gas, decoGases: [], settings: { ...opts.settings, surfacePressureBar: surface }, initialTissues: t });
      t = cloneTissues(p.tissuesAtSurface);
    }
    loadSegment(t, AIR, 0, 0, Math.max(0, d.surfaceIntervalMin), surface);
  }
  return t;
}

/* ---------------- logged dives (napló: GET /api/planner/context) ---------------- */

export interface LoggedSample { t: number; d: number; gas?: number }
export interface LoggedDive {
  id?: string | number;
  start_local?: string;
  start_utc_epoch: number | null;
  duration_s: number;
  samples: LoggedSample[];
  /** percent */
  gases: { o2: number; he: number }[];
  surface_mbar?: number | null;
  salinity?: number | null;
}

export interface LogTissuesResult {
  tissues: TissueState;
  /** dives actually applied, oldest first */
  used: { id?: string | number; startEpochS: number; endEpochS: number; maxDepth: number; durationMin: number; timeUnknown: boolean }[];
  /** dives whose start time could not be determined: assumed to end right before the planned dive (conservative) */
  unknownTime: (string | number | undefined)[];
  /** dives that start after the planned start (ignored) */
  future: number;
}

/** Water density in kg/L from a salinity field given as kg/L, g/L or g/10 L (Subsurface); unknown → sea water. */
export function salinityKgL(s: number | null | undefined): number {
  if (!s || !Number.isFinite(s) || s <= 0) return 1.03;
  if (s > 5000) return s / 10000;
  if (s > 500) return s / 1000;
  if (s > 0.5 && s < 2) return s;
  return 1.03;
}

/**
 * Depth scale so that the planner's 1 bar / 10 m convention never under-states the real hydrostatic pressure:
 * sea water (1.03 kg/L) → ×1.0101; fresh water is not scaled down (conservative).
 */
export const depthScaleFor = (salinity: number | null | undefined) => Math.max(1, (salinityKgL(salinity) * 9.80665 / 100) / 0.1);

const gasOf = (gases: { o2: number; he: number }[], i: number | undefined): Gas => {
  const g = gases[i ?? 0] ?? gases[0];
  if (!g) return AIR;
  const o2 = Math.min(1, Math.max(0.05, (Number(g.o2) || 21) / 100));
  const he = Math.min(1 - o2, Math.max(0, (Number(g.he) || 0) / 100));
  return { o2, he };
};

const startEpoch = (d: LoggedDive): number | null => {
  if (typeof d.start_utc_epoch === 'number' && Number.isFinite(d.start_utc_epoch)) return d.start_utc_epoch;
  if (d.start_local) {
    const ms = new Date(d.start_local.replace(' ', 'T')).getTime(); // no zone → local time
    if (Number.isFinite(ms)) return ms / 1000;
  }
  return null;
};

/** Loads one logged dive's samples into `t` (mutates). Returns its max depth and duration in seconds. */
export function loadLoggedDive(t: TissueState, d: LoggedDive, surfaceBar: number): { maxDepth: number; durationS: number } {
  const k = depthScaleFor(d.salinity);
  const samples = [...(d.samples ?? [])].filter((s) => Number.isFinite(s.t) && Number.isFinite(s.d)).sort((a, b) => a.t - b.t);
  if (samples.length === 0 || samples[0].t > 0) samples.unshift({ t: 0, d: 0 });
  let gasIdx = samples[0].gas ?? 0;
  let maxDepth = 0;
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i], b = samples[i + 1];
    if (a.gas !== undefined) gasIdx = a.gas;
    const dt = (b.t - a.t) / 60;
    if (dt <= 0) continue;
    const d0 = Math.max(0, a.d) * k, d1 = Math.max(0, b.d) * k;
    loadSegment(t, gasOf(d.gases, gasIdx), d0, d1, dt, surfaceBar);
    maxDepth = Math.max(maxDepth, a.d, b.d);
  }
  let end = samples[samples.length - 1];
  // still below the surface at the last sample: finish with a 9 m/min ascent
  if (end.d > 0) {
    if (end.gas !== undefined) gasIdx = end.gas;
    const dt = end.d / 9;
    loadSegment(t, gasOf(d.gases, gasIdx), Math.max(0, end.d) * k, 0, dt, surfaceBar);
    end = { t: end.t + dt * 60, d: 0 };
  }
  return { maxDepth, durationS: Math.max(Number(d.duration_s) || 0, end.t) };
}

/**
 * Tissues at `untilEpochS` (the planned start) after the logged dives: each dive's samples, then the surface
 * intervals on air. Surface intervals are breathed at the higher of the dive-site and the planning surface pressure
 * (higher inspired N2 = slower off-gassing = conservative).
 */
export function tissuesFromLog(dives: LoggedDive[], untilEpochS: number, opts: { surfacePressureBar?: number; start?: TissueState } = {}): LogTissuesResult {
  const planSurface = opts.surfacePressureBar ?? SURFACE_PRESSURE_BAR;
  const t = opts.start ? cloneTissues(opts.start) : initialTissues(planSurface);
  const known: { d: LoggedDive; start: number }[] = [];
  const unknown: LoggedDive[] = [];
  let future = 0;
  for (const d of dives) {
    const s = startEpoch(d);
    if (s === null) unknown.push(d);
    else if (s >= untilEpochS) future++;
    else known.push({ d, start: s });
  }
  known.sort((a, b) => a.start - b.start);
  const used: LogTissuesResult['used'] = [];
  let lastEnd: number | null = null;
  let lastSurface = planSurface;
  const siTo = (epoch: number) => {
    if (lastEnd !== null) loadSegment(t, AIR, 0, 0, Math.max(0, epoch - lastEnd) / 60, Math.max(lastSurface, planSurface));
  };
  for (const { d, start } of known) {
    siTo(start);
    const surf = d.surface_mbar && d.surface_mbar > 500 && d.surface_mbar < 1100 ? d.surface_mbar / 1000 : planSurface;
    const r = loadLoggedDive(t, d, surf);
    const end = Math.max(start + r.durationS, lastEnd ?? -Infinity);
    used.push({ id: d.id, startEpochS: start, endEpochS: end, maxDepth: r.maxDepth, durationMin: r.durationS / 60, timeUnknown: false });
    lastEnd = end; lastSurface = surf;
  }
  // unknown start time: assume the dive ended right before the planned dive (no surface interval) – conservative
  if (unknown.length) {
    siTo(untilEpochS);
    for (const d of unknown) {
      const surf = d.surface_mbar && d.surface_mbar > 500 && d.surface_mbar < 1100 ? d.surface_mbar / 1000 : planSurface;
      const r = loadLoggedDive(t, d, surf);
      used.push({ id: d.id, startEpochS: untilEpochS, endEpochS: untilEpochS, maxDepth: r.maxDepth, durationMin: r.durationS / 60, timeUnknown: true });
    }
    lastEnd = null;
  } else {
    siTo(untilEpochS);
  }
  return { tissues: t, used, unknownTime: unknown.map((d) => d.id), future };
}
