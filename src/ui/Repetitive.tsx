import { LoggedDive, TissueState, leadingGf, initialTissues } from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { Card, Label, Note, NumRow, Seg } from './kit';
import { HOME_URL, LOG_URL } from './host';

export interface RepDive { depth: number; bt: number; o2: number; he: number; si: number }
export interface RepState {
  on: boolean;
  source: 'manual' | 'log';
  /** manual previous dives, oldest first; `si` = surface interval after the dive (min) */
  dives: RepDive[];
  /** planned start of the new dive (datetime-local string) – used with logged dives */
  plannedStart: string;
}
export const defaultRepState = (): RepState => ({ on: false, source: 'manual', dives: [{ depth: 30, bt: 30, o2: 32, he: 0, si: 120 }], plannedStart: localNow() });

/** Napló: GET /api/planner/context */
export interface PlannerContext {
  user: { display_name: string } | null;
  sac: { bottom: number; deco: number } | null;
  recent: LoggedDive[];
}
export type LogStatus = { status: 'idle' | 'loading' | 'login' | 'error' } | { status: 'ok'; data: PlannerContext };

export function localNow(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const epochOfLocal = (s: string): number => { const ms = new Date(s).getTime(); return Number.isFinite(ms) ? ms / 1000 : Date.now() / 1000; };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Defensive parse of the napló context (unknown fields ignored, sizes capped). */
export function parsePlannerContext(j: unknown): PlannerContext | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  const user = o.user && typeof o.user === 'object' && typeof (o.user as Record<string, unknown>).display_name === 'string'
    ? { display_name: String((o.user as Record<string, unknown>).display_name).slice(0, 80) } : null;
  let sac: PlannerContext['sac'] = null;
  if (o.sac && typeof o.sac === 'object') {
    const b = num((o.sac as Record<string, unknown>).bottom), d = num((o.sac as Record<string, unknown>).deco);
    if (b !== null && d !== null && b > 0 && d > 0) sac = { bottom: b, deco: d };
  }
  const recent: LoggedDive[] = [];
  for (const r of Array.isArray(o.recent) ? o.recent.slice(0, 20) : []) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    const samples = (Array.isArray(x.samples) ? x.samples.slice(0, 20000) : [])
      .map((s) => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
      .filter((s) => num(s.t) !== null && num(s.d) !== null)
      .map((s) => ({ t: s.t as number, d: Math.min(200, Math.max(0, s.d as number)), ...(num(s.gas) !== null ? { gas: Math.max(0, Math.round(s.gas as number)) } : {}) }));
    const gases = (Array.isArray(x.gases) ? x.gases.slice(0, 10) : [])
      .map((g) => (g && typeof g === 'object' ? g as Record<string, unknown> : {}))
      .map((g) => ({ o2: num(g.o2) ?? 21, he: num(g.he) ?? 0 }));
    recent.push({
      id: typeof x.id === 'string' || typeof x.id === 'number' ? x.id : undefined,
      start_local: typeof x.start_local === 'string' ? x.start_local : undefined,
      start_utc_epoch: num(x.start_utc_epoch),
      duration_s: Math.max(0, num(x.duration_s) ?? 0),
      samples, gases,
      surface_mbar: num(x.surface_mbar), salinity: num(x.salinity),
    });
  }
  return { user, sac, recent };
}

export const contextUrl = () => `${(HOME_URL ?? '/').replace(/\/$/, '')}/api/planner/context`;

/** Surface supersaturation and slow-tissue excess of the start tissues, for the summary line. */
export function startSummary(t: TissueState, surfaceBar: number) {
  const g = leadingGf(t, surfaceBar);
  const sat = initialTissues(surfaceBar);
  const slow = 15; // slowest compartment (635 min N2 half-time)
  const excess = (t.n2[slow] + t.he[slow]) / (sat.n2[slow] + sat.he[slow]) - 1;
  return { gf: g.gf, lead: g.lead, slowExcess: excess };
}

export function RepetitiveCard({ t, u, lang, state: s, setState, log, onLoadLog, onApplySac, summary, used, unknownCount, futureCount }: {
  t: Dict; u: Units; lang: 'hu' | 'en'; state: RepState; setState: (s: RepState) => void;
  log: LogStatus; onLoadLog: () => void; onApplySac: () => void;
  summary: { gf: number; lead: number; slowExcess: number } | null;
  used: { startEpochS: number; maxDepth: number; durationMin: number; timeUnknown: boolean }[];
  unknownCount: number; futureCount: number;
}) {
  const set = (p: Partial<RepState>) => setState({ ...s, ...p });
  const setDive = (i: number, p: Partial<RepDive>) => { const ds = [...s.dives]; ds[i] = { ...ds[i], ...p }; set({ dives: ds }); };
  const fmt = (v: number, d = 0) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const when = (e: number) => new Date(e * 1000).toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <>
      <Label>{t.repTitle}</Label>
      <Card className="list">
        <div className="row stack">
          <Seg value={s.on} onChange={(v) => set({ on: v })} options={[{ v: false, l: t.repOff }, { v: true, l: t.repOn }]} />
        </div>
        {s.on && HOME_URL && (
          <div className="row stack">
            <Seg value={s.source} onChange={(v) => set({ source: v })} options={[{ v: 'manual' as const, l: t.repManual }, { v: 'log' as const, l: t.repFromLog }]} />
          </div>
        )}
        {s.on && s.source === 'log' && HOME_URL && (
          <>
            <div className="row stack">
              <button className="btn-secondary" disabled={log.status === 'loading'} onClick={onLoadLog}>{log.status === 'loading' ? '…' : t.repLoadLog}</button>
              {log.status === 'login' && <span className="row-sub bad">{t.repLogin} {LOG_URL && <a href={LOG_URL}>{t.navLog} →</a>}</span>}
              {log.status === 'error' && <span className="row-sub bad">{t.repLogError}</span>}
              {log.status === 'ok' && (
                <span className="row-sub">{t.repLoaded(log.data.user?.display_name ?? '', log.data.recent.length)}</span>
              )}
            </div>
            {log.status === 'ok' && (
              <>
                <label className="row num">
                  <span className="row-l">{t.repPlannedStart}</span>
                  <span className="row-field wide"><input type="datetime-local" value={s.plannedStart} onChange={(e) => set({ plannedStart: e.target.value })} /></span>
                </label>
                {used.map((d, i) => (
                  <div className="row info" key={i}>{d.timeUnknown ? t.repTimeUnknown : when(d.startEpochS)} · {u.depth(d.maxDepth)} · {fmt(d.durationMin)} {t.minUnit}</div>
                ))}
                {unknownCount > 0 && <div className="row info warn">{t.repUnknownNote}</div>}
                {futureCount > 0 && <div className="row info">{t.repFutureNote(futureCount)}</div>}
                {log.data.sac && (
                  <div className="row stack">
                    <button className="btn-field" onClick={onApplySac}>{t.repApplySac(u.sacS(log.data.sac.bottom), u.sacS(log.data.sac.deco))}</button>
                  </div>
                )}
                <div className="row info"><b>{t.repFromLogNote}</b></div>
              </>
            )}
          </>
        )}
      </Card>
      {s.on && s.source === 'manual' && (
        <>
          {s.dives.map((d, i) => (
            <Card className="list" key={i}>
              <div className="row"><span className="row-l"><b>{t.repDiveN(i + 1)}</b></span>
                {s.dives.length > 1 && <button className="link-bad" onClick={() => set({ dives: s.dives.filter((_, j) => j !== i) })}>{t.remove}</button>}</div>
              <NumRow label={t.maxDepth(u)} min={u.depthN(3)} max={u.depthN(120)} value={u.depthN(d.depth)} onChange={(v) => setDive(i, { depth: Math.max(1, Math.min(120, u.toM(v))) })} />
              <NumRow label={t.bottomTime} min={1} max={300} value={d.bt} onChange={(v) => setDive(i, { bt: Math.max(1, Math.min(300, Math.round(v))) })} />
              <NumRow label="O2 %" min={5} max={100} value={d.o2} onChange={(v) => setDive(i, { o2: v, he: Math.min(d.he, 100 - v) })} />
              <NumRow label="He %" min={0} max={95} value={d.he} onChange={(v) => setDive(i, { he: Math.min(v, 100 - d.o2) })} />
              <NumRow label={i === s.dives.length - 1 ? t.repSiLast : t.repSi} min={0} max={4320} value={d.si} onChange={(v) => setDive(i, { si: Math.max(0, Math.min(4320, Math.round(v))) })} />
            </Card>
          ))}
          {s.dives.length < 4 && (
            <div className="btn-row one"><button className="btn-field" onClick={() => set({ dives: [...s.dives, { depth: 20, bt: 30, o2: 32, he: 0, si: 120 }] })}>{t.repAdd}</button></div>
          )}
          <Note>{t.repManualNote}</Note>
        </>
      )}
      {s.on && summary && (
        <Card className="list">
          <div className="row info">{summary.gf > 0 ? t.repSummaryGf(fmt(summary.gf * 100), summary.lead + 1) : t.repSummaryNoGf}{' '}{t.repSummarySlow(fmt(summary.slowExcess * 100))}</div>
        </Card>
      )}
    </>
  );
}
