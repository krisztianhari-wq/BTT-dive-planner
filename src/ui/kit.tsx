import { ReactNode, useEffect } from 'react';
import { DivePlan, gasName } from '../engine';
import { NumInput } from './NumInput';

/* ---------- icons (2 px stroke line icons) ---------- */
export const IconShare = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
  </svg>
);
export const IconSliders = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" />
  </svg>
);
export const Chevron = ({ open }: { open?: boolean }) => (
  <svg className={open ? 'chev open' : 'chev'} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 5l7 7-7 7" />
  </svg>
);

/* ---------- layout ---------- */
export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <section className={`card ${className}`}>{children}</section>;
export const Label = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <div className="sec-label"><span>{children}</span>{right && <span className="sec-right">{right}</span>}</div>
);
export const Note = ({ children }: { children: ReactNode }) => <p className="note">{children}</p>;

export const Stats = ({ children }: { children: ReactNode }) => <div className="stats">{children}</div>;
export const Stat = ({ v, l, tone }: { v: ReactNode; l: ReactNode; tone?: 'mode' | 'ok' | 'bad' }) => (
  <div className="card stat"><div className={`stat-v ${tone ?? ''}`}>{v}</div><div className="stat-l">{l}</div></div>
);

/* ---------- controls ---------- */
export function Seg<T extends string | number | boolean>({ value, options, onChange, label, variant = 'card' }: {
  value: T; options: { v: T; l: ReactNode; cls?: string }[]; onChange: (v: T) => void; label?: string; variant?: 'card' | 'sheet';
}) {
  return (
    <div className={`seg2 ${variant === 'sheet' ? 'on-sheet' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={o.v === value} className={`${o.v === value ? 'on' : ''} ${o.cls ?? ''}`} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

/** Big stepper: label left, large editable value, − / + buttons. */
export function Stepper({ label, value, onChange, min, max, step = 1, decimals }: {
  label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; decimals?: number;
}) {
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  return (
    <div className="card stepper">
      <div className="stepper-text">
        <div className="stepper-l">{label}</div>
        <div className="stepper-v"><NumInput value={value} onChange={onChange} min={min} max={max} decimals={decimals} /></div>
      </div>
      <div className="stepper-btns">
        <button aria-label="−" onClick={() => onChange(clamp(Math.ceil(value / step - 1e-9) * step - step))}>−</button>
        <button aria-label="+" onClick={() => onChange(clamp(Math.floor(value / step + 1e-9) * step + step))}>+</button>
      </div>
    </div>
  );
}

/** List row with a native select laid over it: label, current value and a chevron. */
export function SelectRow<T extends string | number>({ label, value, options, onChange, disabled }: {
  label: ReactNode; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  const cur = options.find((o) => o.v === value)?.l ?? '';
  return (
    <label className={`row sel ${disabled ? 'disabled' : ''}`}>
      <span className="row-l">{label}</span>
      <span className="row-v">{cur}</span>
      {!disabled && <Chevron />}
      <select value={String(value)} disabled={disabled} onChange={(e) => {
        const o = options.find((x) => String(x.v) === e.target.value);
        if (o) onChange(o.v);
      }}>
        {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
      </select>
    </label>
  );
}

/** List row with a compact numeric field on the right. */
export function NumRow({ label, value, onChange, min, max, step, decimals }: {
  label: ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; decimals?: number;
}) {
  return (
    <label className="row num">
      <span className="row-l">{label}</span>
      <span className="row-field"><NumInput value={value} onChange={onChange} min={min} max={max} step={step} decimals={decimals} /></span>
    </label>
  );
}

/** Read-only label / value row. */
export const KV = ({ l, v, sub, tone }: { l: ReactNode; v: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' }) => (
  <div className="row kv"><span className="row-l">{l}{sub && <span className="row-sub">{sub}</span>}</span><span className={`row-kv ${tone ?? ''}`}>{v}</span></div>
);

export const Chip = ({ children, kind = 'back' }: { children: ReactNode; kind?: 'back' | 'deco' | 'mode' }) => <span className={`chip2 ${kind}`}>{children}</span>;
export const Toggle = ({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) => (
  <button className={`tchip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{children}</button>
);

export const Primary = ({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) => <button className="btn-primary" onClick={onClick} disabled={disabled}>{children}</button>;
export const Secondary = ({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) => <button className="btn-secondary" onClick={onClick} disabled={disabled}>{children}</button>;

/* ---------- feedback ---------- */
export function Verdict({ tone, title, children, icon }: { tone: 'ok' | 'bad' | 'warn' | 'brave'; title: ReactNode; children?: ReactNode; icon?: string }) {
  const ico = icon ?? (tone === 'ok' ? '✓' : tone === 'bad' ? '✕' : '!');
  return (
    <div className={`verdict2 ${tone}`}>
      <div className="v-ico">{ico}</div>
      <div className="v-body"><div className="v-title">{title}</div>{children && <div className="v-text">{children}</div>}</div>
    </div>
  );
}
export const Disclaimer = ({ text }: { text: string }) => (
  <div className="card disclaimer2"><span className="d-badge">!</span><span>{text}</span></div>
);
export const Warnings = ({ items }: { items: { text: string; bad: boolean }[] }) => items.length === 0 ? null : (
  <ul className="warn-list">{items.map((w, i) => <li key={i} className={w.bad ? 'bad' : ''}>{w.text}</li>)}</ul>
);

/* ---------- itinerary timeline ---------- */
export interface TimelineRow { min: number; action: ReactNode; sub?: ReactNode; kind?: 'hl' | 'switch' | 'muted' }
export function Timeline({ rows, minLabel }: { rows: TimelineRow[]; minLabel: string }) {
  return (
    <Card className="timeline">
      {rows.map((r, i) => (
        <div className={`tl-row ${r.kind ?? ''}`} key={i}>
          <div className="tl-min">{r.min}<span>{minLabel}</span></div>
          <div className="tl-rail"><span className="tl-dot" /></div>
          <div className="tl-act">{r.action}{r.sub && <div className="tl-sub">{r.sub}</div>}</div>
        </div>
      ))}
    </Card>
  );
}

/* ---------- decompression stop rows ---------- */
export function StopRows({ stops, unit, minLabel, leaveAt, chip = 'deco' }: {
  stops: { depth: number; minutes: number; runtime: number; gas: string }[]; unit: string; minLabel: string; leaveAt: (rt: number) => string; chip?: 'deco' | 'mode';
}) {
  return (
    <Card className="list">
      {stops.map((s, i) => (
        <div className="stop-row" key={i}>
          <div className="stop-d">{s.depth}<span> {unit}</span></div>
          <div><div className="stop-t">{s.minutes} {minLabel}</div><div className="stop-rt">{leaveAt(s.runtime)}</div></div>
          <Chip kind={chip}>{s.gas}</Chip>
        </div>
      ))}
    </Card>
  );
}

/* ---------- profile chart (screen) ---------- */
function niceMax(v: number, steps: number): number {
  const raw = v / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  return step * steps;
}
export function ProfileCard({ plan, title, axes, depthScale = 1 }: { plan: DivePlan; title: string; axes: string; depthScale?: number }) {
  const maxT = Math.max(10, Math.ceil(plan.runtime / 10) * 10);
  const maxD = niceMax(Math.max(3, plan.maxDepth * depthScale), 4);
  const X = (t: number) => (t / maxT) * 300;
  const Y = (d: number) => ((d * depthScale) / maxD) * 150;
  let t = 0;
  const pts: [number, number][] = [[0, 0]];
  for (const s of plan.segments) { t += s.duration; pts.push([X(t), Y(s.endDepth)]); }
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const xStep = maxT <= 60 ? 10 : maxT <= 120 ? 20 : maxT <= 240 ? 40 : 60;
  const xs: number[] = []; for (let x = 0; x <= maxT; x += xStep) xs.push(x);
  const ys = [0, 1, 2, 3, 4].map((i) => Math.round((maxD * i) / 4));
  const switches = plan.segments.filter((s) => s.kind === 'switch');
  return (
    <Card className="profile-card">
      <div className="pc-head"><span className="sec-label inline">{title}</span><span className="pc-axes">{axes}</span></div>
      <div className="pc-body">
        <div className="pc-y">{ys.map((y) => <span key={y}>{y}</span>)}</div>
        <div className="pc-plot">
          <svg viewBox="0 0 300 150" preserveAspectRatio="none" aria-hidden="true">
            {[0, 37.5, 75, 112.5, 150].map((y, i) => <line key={y} x1="0" x2="300" y1={y} y2={y} className={i === 0 ? 'g0' : 'g'} vectorEffect="non-scaling-stroke" />)}
            <path d={`${path} Z`} className="pc-area" />
            <path d={path} className="pc-line" vectorEffect="non-scaling-stroke" />
          </svg>
          {switches.map((s, i) => (
            <div className="pc-sw" key={i} style={{ left: `${(X(s.runtime) / 300) * 100}%`, top: `${(Y(s.startDepth) / 150) * 100}%` }}>
              <span className="pc-dot" /><span className="pc-swl">{gasName(s.gas)}</span>
            </div>
          ))}
          <div className="pc-x">{xs.map((x) => <span key={x} style={{ left: `${(x / maxT) * 100}%` }}>{x}</span>)}</div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- bottom sheet + toast ---------- */
export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap">
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grabber" />
        {children}
      </div>
    </div>
  );
}
export const Toast = ({ text }: { text: string | null }) => text ? <div className="toast" role="status">✓ {text}</div> : null;
