import { ReactNode, useEffect } from 'react';
import { Dict } from './i18n';

/** Read-only one-screen summary for a team briefing (phone). */
export interface BriefData {
  title: string;
  envLabel: string;
  verdict: { ok: boolean; title: string };
  pills: string[];
  kpis: { v: ReactNode; l: string }[];
  gases: { name: string; role: string; detail: string; tone?: 'ok' | 'warn' | 'bad' }[];
  stops: { depth: string; minutes: number; runtime: number; gas: string }[];
  stopsEmpty?: string;
  gasRows: { l: string; v: string; tone?: 'ok' | 'bad' | 'warn' }[];
  lostGas: { name: string; text: string; status: 'ok' | 'noReserve' | 'short'; statusText: string }[];
  warnings: { text: string; bad: boolean }[];
  notes: string[];
}

export function Brief({ t, data, onClose }: { t: Dict; data: BriefData; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    document.body.classList.add('brief-open');
    return () => { window.removeEventListener('keydown', k); document.body.classList.remove('brief-open'); };
  }, [onClose]);
  return (
    <div className="brief" role="dialog" aria-modal="true" aria-label={t.briefTitle}>
      <div className="brief-inner">
        <div className="brief-head">
          <div className="brief-ttl"><span className="brief-env">{data.envLabel} · {t.briefTitle}</span><h2>{data.title}</h2></div>
          <button className="pill" onClick={onClose}>{t.briefClose}</button>
        </div>
        <div className={`brief-verdict ${data.verdict.ok ? 'ok' : 'bad'}`}>{data.verdict.ok ? '✓' : '✕'} {data.verdict.title}</div>
        {data.pills.length > 0 && <div className="ctx-pills">{data.pills.map((p, i) => <span key={i} className="ctx-pill warn">{p}</span>)}</div>}
        <div className="brief-kpis">{data.kpis.map((k, i) => <div key={i}><b>{k.v}</b><span>{k.l}</span></div>)}</div>
        <section>
          <h3>{t.briefGases}</h3>
          {data.gases.map((g, i) => (
            <div className="brief-row" key={i}><span><b>{g.name}</b> <em>{g.role}</em></span><span className={g.tone ?? ''}>{g.detail}</span></div>
          ))}
        </section>
        <section>
          <h3>{t.stops}</h3>
          {data.stops.length === 0 ? <p className="brief-note">{data.stopsEmpty}</p> : (
            <table className="brief-stops">
              <thead><tr><th>{t.briefDepth}</th><th>{t.minutes}</th><th>{t.runtimeCol}</th><th>{t.gas}</th></tr></thead>
              <tbody>{data.stops.map((s, i) => <tr key={i}><td><b>{s.depth}</b></td><td><b>{s.minutes}</b></td><td>{s.runtime}</td><td>{s.gas}</td></tr>)}</tbody>
            </table>
          )}
        </section>
        <section>
          <h3>{t.gasPlan}</h3>
          {data.gasRows.map((r, i) => <div className="brief-row" key={i}><span>{r.l}</span><span className={r.tone ?? ''}><b>{r.v}</b></span></div>)}
        </section>
        {data.lostGas.length > 0 && (
          <section>
            <h3>{t.lostGasTitle}</h3>
            {data.lostGas.map((l, i) => <div className="brief-row" key={i}><span><b>{l.name}</b> · {l.text}</span><span className={`st ${l.status}`}>{l.statusText}</span></div>)}
          </section>
        )}
        {data.warnings.length > 0 && (
          <ul className="warn-list">{data.warnings.map((w, i) => <li key={i} className={w.bad ? 'bad' : ''}>{w.text}</li>)}</ul>
        )}
        {data.notes.map((n, i) => <p className="brief-note" key={i}>{n}</p>)}
      </div>
    </div>
  );
}
