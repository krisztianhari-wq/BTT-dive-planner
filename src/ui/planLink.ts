/**
 * Shareable plan link: the full input state in the URL hash, `#plan=<base64url(JSON)>`, schema version 1.
 * The napló generates links in exactly this format (see docs/plan-link.md). Everything is validated and clamped on
 * load; unknown fields are ignored; the "brave" (outside the gas rules) override can never be switched on by a link.
 */
import { CYLINDERS } from '../engine';
import type { PenState } from './PenetrationView';

export interface PlanGasV1 { o2: number; he: number }
export interface PlanDecoGasV1 extends PlanGasV1 { switchDepth: number }
export interface PlanLinkV1 {
  v: 1;
  env: 'rec' | 'open' | 'pen';
  maxDepth: number;
  bottomTime: number;
  bottomGas: PlanGasV1;
  decoGases: PlanDecoGasV1[];
  gfLow: number;
  gfHigh: number;
  lastStop: number;
  sacBottom: number;
  sacDeco: number;
  altitudeM?: number;
  std?: 'gue' | 'generic';
  unit?: 'metric' | 'imperial';
  name?: string;
  /** penetration state (env 'pen'), PenState subset */
  pen?: Partial<PenState>;
}

export const PLAN_HASH = '#plan=';

/* ---------------- base64url (UTF-8) ---------------- */
export function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* ---------------- validation ---------------- */
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const numOr = (v: unknown, def: number, lo: number, hi: number, round = false) => {
  if (!isNum(v)) return def;
  const x = clamp(v, lo, hi);
  return round ? Math.round(x) : x;
};
/** Gas fractions 0–1 (a value above 1 is read as percent). O2 5–100 %, He 0…(100 − O2) %. */
function gas(v: unknown): PlanGasV1 | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.o2)) return null;
  const f = (x: number) => (x > 1 ? x / 100 : x);
  const o2 = clamp(f(o.o2), 0.05, 1);
  const he = clamp(isNum(o.he) ? f(o.he) : 0, 0, 1 - o2);
  return { o2: Math.round(o2 * 1000) / 1000, he: Math.round(he * 1000) / 1000 };
}
const cleanName = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 80) : undefined);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? v as T : undefined);

function penSubset(v: unknown, maxIdx: { cyl: number; sm: number }): Partial<PenState> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: Partial<PenState> = { brave: false }; // never from a link
  const a = oneOf(o.agency, ['gue', 'tdi', 'iantd'] as const); if (a) out.agency = a;
  const e = oneOf(o.environment, ['cave', 'mine', 'wreck'] as const); if (e) out.environment = e;
  const fl = oneOf(o.flow, ['outflow', 'none', 'siphon'] as const); if (fl) out.flow = fl;
  if (isNum(o.avgDepth)) out.avgDepth = clamp(o.avgDepth, 3, 60);
  if (isNum(o.maxDepth)) out.maxDepth = clamp(o.maxDepth, 3, 60);
  if (isNum(o.swimSpeed)) out.swimSpeed = clamp(o.swimSpeed, 1, 60);
  if (isNum(o.descentMinutes)) out.descentMinutes = clamp(o.descentMinutes, 0, 30);
  if (isNum(o.plannedMinutes)) out.plannedMinutes = Math.round(clamp(o.plannedMinutes, 0, 300));
  if (isNum(o.teamSize)) out.teamSize = Math.round(clamp(o.teamSize, 1, 4));
  if (typeof o.sameForAll === 'boolean') out.sameForAll = o.sameForAll;
  const c = oneOf(o.config, ['backmount', 'sidemount'] as const); if (c) out.config = c;
  if (isNum(o.smCylIdx)) out.smCylIdx = Math.round(clamp(o.smCylIdx, 0, maxIdx.sm));
  if (o.smStep === null || isNum(o.smStep)) out.smStep = o.smStep === null ? null : clamp(o.smStep as number, 5, 100);
  if (o.shared && typeof o.shared === 'object') {
    const s = o.shared as Record<string, unknown>;
    out.shared = { cylIdx: Math.round(numOr(s.cylIdx, 0, 0, maxIdx.cyl)), startBar: numOr(s.startBar, 200, 50, 300), sac: numOr(s.sac, 18, 5, 60) };
  }
  if (Array.isArray(o.members)) {
    out.members = o.members.slice(0, 4).map((m, i) => {
      const x = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
      return {
        name: cleanName(x.name)?.slice(0, 12) || `B${i + 1}`,
        gasIdx: x.gasIdx === 'team' ? 'team' as const : Math.round(numOr(x.gasIdx, 0, 0, 20)),
        startBar: numOr(x.startBar, 200, 50, 300), sac: numOr(x.sac, 18, 5, 60),
        config: oneOf(x.config, ['team', 'backmount', 'sidemount'] as const) ?? 'team',
        cylIdx: Math.round(numOr(x.cylIdx, 0, 0, maxIdx.cyl)), smCylIdx: Math.round(numOr(x.smCylIdx, 0, 0, maxIdx.sm)),
      };
    });
    while (out.members.length < 4) out.members.push({ name: `B${out.members.length + 1}`, gasIdx: 'team', startBar: 200, sac: 18, config: 'team', cylIdx: 0, smCylIdx: 0 });
  }
  if (o.bottomGasIdx === 'auto' || isNum(o.bottomGasIdx)) out.bottomGasIdx = o.bottomGasIdx === 'auto' ? 'auto' : Math.round(clamp(o.bottomGasIdx as number, 0, 20));
  if (isNum(o.stageCount)) out.stageCount = Math.round(clamp(o.stageCount, 0, 4));
  if (isNum(o.stageCylIdx)) out.stageCylIdx = Math.round(clamp(o.stageCylIdx, 0, maxIdx.cyl));
  if (o.stageBar === null || isNum(o.stageBar)) out.stageBar = o.stageBar === null ? null : clamp(o.stageBar as number, 50, 300);
  const sr = oneOf(o.stageRule, ['thirds', 'halfPlus'] as const); if (sr) out.stageRule = sr;
  if (isNum(o.stageReserveBar)) out.stageReserveBar = clamp(o.stageReserveBar, 0, 100);
  if (o.stageGasIdx === 'bottom' || isNum(o.stageGasIdx)) out.stageGasIdx = o.stageGasIdx === 'bottom' ? 'bottom' : Math.round(clamp(o.stageGasIdx as number, 0, 20));
  if (o.decoOn && typeof o.decoOn === 'object') {
    out.decoOn = Object.fromEntries(Object.entries(o.decoOn as Record<string, unknown>).filter(([k, b]) => typeof b === 'boolean' && /^[\w/ ]{1,12}$/.test(k)).slice(0, 8)) as Record<string, boolean>;
  }
  return out;
}

/** Validates and clamps a decoded object; null if it is not a v1 plan. */
export function validatePlan(raw: unknown): PlanLinkV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const env = oneOf(o.env, ['rec', 'open', 'pen'] as const) ?? 'rec';
  const bottomGas = gas(o.bottomGas) ?? { o2: 0.21, he: 0 };
  const maxDepthLimit = env === 'open' ? 120 : 60;
  const decoGases: PlanDecoGasV1[] = (Array.isArray(o.decoGases) ? o.decoGases.slice(0, 6) : [])
    .map((d) => { const g = gas(d); const sd = d && typeof d === 'object' ? (d as Record<string, unknown>).switchDepth : undefined; return g && isNum(sd) ? { ...g, switchDepth: Math.round(clamp(sd, 1, 120)) } : null; })
    .filter((d): d is PlanDecoGasV1 => d !== null);
  let gfLow = numOr(o.gfLow, 20, 5, 100, true);
  const gfHigh = numOr(o.gfHigh, 85, 5, 100, true);
  if (gfLow > gfHigh) gfLow = gfHigh;
  const out: PlanLinkV1 = {
    v: 1, env,
    maxDepth: numOr(o.maxDepth, env === 'rec' ? 18 : 45, 3, maxDepthLimit),
    bottomTime: numOr(o.bottomTime, env === 'rec' ? 30 : 25, 1, 300, true),
    bottomGas, decoGases, gfLow, gfHigh,
    lastStop: o.lastStop === 3 ? 3 : 6,
    sacBottom: numOr(o.sacBottom, 20, 5, 60),
    sacDeco: numOr(o.sacDeco, 15, 5, 60),
  };
  if (isNum(o.altitudeM)) out.altitudeM = Math.round(clamp(o.altitudeM, 0, 4500));
  const std = oneOf(o.std, ['gue', 'generic'] as const); if (std) out.std = std;
  const unit = oneOf(o.unit, ['metric', 'imperial'] as const); if (unit) out.unit = unit;
  const name = cleanName(o.name); if (name) out.name = name;
  if (env === 'pen') {
    const smCount = CYLINDERS.filter((c) => c.name.startsWith('Single') || c.name.startsWith('AL80')).length;
    const pen = penSubset(o.pen, { cyl: CYLINDERS.length - 1, sm: smCount - 1 });
    if (pen) out.pen = pen;
  }
  return out;
}

export function encodePlan(p: PlanLinkV1): string { return toBase64Url(JSON.stringify(p)); }

/** Parses `#plan=…` (or a full URL containing it); null when absent or invalid. */
export function decodePlanHash(hash: string): PlanLinkV1 | null {
  const i = hash.indexOf(PLAN_HASH);
  if (i < 0) return null;
  const payload = hash.slice(i + PLAN_HASH.length).split('&')[0];
  if (!payload || payload.length > 20000) return null;
  try { return validatePlan(JSON.parse(fromBase64Url(payload))); } catch { return null; }
}

/** Public web address used for links made in the native apps (tauri:// is not shareable). */
export const PUBLIC_URL = 'https://krisztianhari-wq.github.io/BTT-dive-planner/';
export function planUrl(p: PlanLinkV1): string {
  const base = '__TAURI_INTERNALS__' in window ? PUBLIC_URL : `${location.origin}${location.pathname}${location.search}`;
  return `${base}${PLAN_HASH}${encodePlan(p)}`;
}
