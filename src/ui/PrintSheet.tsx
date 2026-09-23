import {
  Cylinder, DivePlan, Gas, GasUsage, ItineraryEvent, StopRow, BackGasPlan, MinimumGasResult, PackingItem, InventoryVerdict, gasName,
} from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import type React from 'react';
import logoUrl from '../assets/btt-logo.png';

/* ================================================================ shared print building blocks ================================================================ */

export type PrintEnv = 'rec' | 'open' | 'pen';
const MODE: Record<PrintEnv, { color: string; soft: string }> = {
  rec: { color: '#1a7f37', soft: '#e4f3e8' },
  open: { color: '#0a66d6', soft: '#e3eefc' },
  pen: { color: '#b85c00', soft: '#fbeede' },
};
/** Gas colours in order of use on the dive (bottom gas first). */
const GAS_PALETTE = ['#0a66d6', '#5b3fc4', '#0f8a80', '#d97706', '#1a7f37', '#c2185b', '#6b7180'];
export type GasColors = (name: string) => string;
export function gasColorsFor(names: string[]): GasColors {
  const order: string[] = [];
  for (const n of names) if (!order.includes(n)) order.push(n);
  return (n) => GAS_PALETTE[Math.max(0, order.indexOf(n)) % GAS_PALETTE.length];
}
/** Gas names in the order they are breathed on a plan. */
export const gasOrder = (plan: DivePlan) => plan.segments.map((s) => gasName(s.gas));

/** Shared A4 frame: header with the mode pill, content, centred footer with the disclaimer. */
export function PrintFrame({ t, lang, env, subtitle, children }: { t: Dict; lang: 'hu' | 'en'; env: PrintEnv; subtitle: string; children: React.ReactNode }) {
  const date = new Date().toLocaleDateString(lang === 'hu' ? 'hu-HU' : 'en-GB');
  const envLabel = env === 'rec' ? t.envRec : env === 'open' ? t.envOpen : t.envPen;
  return (
    <div className="print-sheet" style={{ ['--pm' as string]: MODE[env].color, ['--pm-soft' as string]: MODE[env].soft }}>
      <header className="ps-head pb">
        <img src={logoUrl} alt="" />
        <div className="ps-head-txt">
          <div className="ps-title">{t.appTitle}</div>
          <div className="ps-sub">{subtitle}</div>
        </div>
        <div className="ps-meta">
          <span className="ps-pill">{envLabel}</span>
          <div className="ps-date">{t.printDate}: {date}</div>
          <div className="ps-gen">{t.printGenerated}</div>
        </div>
      </header>
      {children}
      <footer className="ps-foot pb">
        <div className="ps-motto-row"><img src={logoUrl} alt="" /><span className="ps-motto">Mindig van lejjebb!!!</span></div>
        <div className="ps-foot-line">BTT Explorers Hungary · 2018 · made by sadrobot · v{__APP_VERSION__}</div>
        <div className="ps-disclaimer">{t.printDisclaimer}</div>
      </footer>
    </div>
  );
}

export const PLabel = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="ps-label pb pb-label"><span>{children}</span>{right && <span>{right}</span>}</div>
);
export const PCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => <section className={`ps-card ${className}`}>{children}</section>;
export const PBig = ({ items }: { items: { v: React.ReactNode; l: string }[] }) => (
  <div className="ps-big">{items.map((x, i) => <div key={i}><b>{x.v}</b><span>{x.l}</span></div>)}</div>
);
export const PKV = ({ rows }: { rows: { l: React.ReactNode; v: React.ReactNode; tone?: 'ok' | 'bad' | 'pill-ok' | 'pill-bad' }[] }) => (
  <div className="ps-kv">
    {rows.map((r, i) => (
      <div className="ps-kv-row pb" key={i}>
        <span className="ps-kv-l">{r.l}</span>
        <span className={`ps-kv-v ${r.tone ?? ''}`}>{r.v}</span>
      </div>
    ))}
  </div>
);
export const PTiles = ({ items, cols = 4 }: { items: { v: React.ReactNode; l: string }[]; cols?: number }) => (
  <div className="ps-tiles" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
    {items.map((x, i) => <div className="ps-tile" key={i}><b>{x.v}</b><span>{x.l}</span></div>)}
  </div>
);
export function PBanner({ tone, title, lines }: { tone: 'ok' | 'bad' | 'warn'; title?: string; lines?: string[] }) {
  return (
    <div className={`ps-banner ${tone} pb`}>
      <span className="ps-banner-ico">{tone === 'ok' ? '✓' : tone === 'bad' ? '✕' : '!'}</span>
      <div>
        {title && <div className="ps-banner-title">{title}</div>}
        {lines?.map((l, i) => <div key={i} className={title ? 'ps-banner-line' : 'ps-banner-title'}>{l}</div>)}
      </div>
    </div>
  );
}
/** Plan verdict banner plus the non-blocking warnings, in the right-hand column under the tiles. */
export function PVerdict({ ok, title, blockers, warnings }: { ok: boolean; title: string; blockers: string[]; warnings: string[] }) {
  return (
    <div className="ps-banners">
      <PBanner tone={ok ? 'ok' : 'bad'} title={title} lines={blockers} />
      {warnings.map((w, i) => <PBanner key={i} tone="warn" lines={[w]} />)}
    </div>
  );
}
export const GasDot = ({ name, colors, bold = true, suffix }: { name: string; colors: GasColors; bold?: boolean; suffix?: string }) => (
  <span className={`ps-gas ${bold ? 'b' : ''}`}><i style={{ background: colors(name) }} />{name}{suffix && <em> {suffix}</em>}</span>
);

/** Print profile: area in the mode tint, the line coloured by the gas breathed, legend of gases. */
export function PrintProfile({ plan, colors, t, u, env }: { plan: DivePlan; colors: GasColors; t: Dict; u: Units; env: PrintEnv }) {
  const W = 700, H = 250, L = 36, R = 6, T = 8, B = 26;
  const scale = u.sys === 'metric' ? 1 : 3.28084;
  const maxT = Math.max(1, plan.runtime);
  const maxD = niceMax(Math.max(3, plan.maxDepth * scale));
  const X = (m: number) => L + (m / maxT) * (W - L - R);
  const Y = (d: number) => T + ((d * scale) / maxD) * (H - T - B);
  const pts: { x: number; y: number; gas: string }[] = [{ x: X(0), y: Y(0), gas: gasName(plan.segments[0]?.gas ?? { o2: 0.21, he: 0 }) }];
  let tm = 0;
  for (const s of plan.segments) { tm += s.duration; pts.push({ x: X(tm), y: Y(s.endDepth), gas: gasName(s.gas) }); }
  // one polyline per run of the same gas
  const runs: { gas: string; d: string }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const last = runs[runs.length - 1];
    if (last && last.gas === pts[i].gas) last.d += ` L${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
    else runs.push({ gas: pts[i].gas, d: `M${pts[i - 1].x.toFixed(1)} ${pts[i - 1].y.toFixed(1)} L${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}` });
  }
  const area = `M${X(0)} ${Y(0)} ` + pts.slice(1).map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
  const yStep = niceStep(Math.max(3, plan.maxDepth * scale) / 4);
  const yTicks: number[] = []; for (let d = 0; d <= maxD + 1e-9; d += yStep) yTicks.push(d);
  const xStep = niceStep(maxT / 4);
  const xTicks: number[] = []; for (let x = 0; x <= maxT + 1e-9; x += xStep) xTicks.push(x);
  const gases = [...new Set(runs.map((r) => r.gas))];
  const minUnit = t.minUnit;
  return (
    <PCard className="ps-profile pb">
      <div className="ps-profile-head">
        <span className="ps-label inline">{t.profile}</span>
        <span className="ps-legend">{gases.map((g) => <span key={g}><i style={{ background: colors(g) }} />{g}</span>)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
        {yTicks.map((d, i) => (
          <g key={i}>
            <line x1={L} x2={W - R} y1={T + (d / maxD) * (H - T - B)} y2={T + (d / maxD) * (H - T - B)} stroke="#e4e6eb" strokeWidth="1" />
            <text x={L - 8} y={T + (d / maxD) * (H - T - B) + 4} fontSize="11" textAnchor="end" fill="#8a909c">{Math.round(d)}</text>
          </g>
        ))}
        <text x={L - 8} y={H - B + 17} fontSize="11" textAnchor="end" fill="#8a909c">{u.d}</text>
        <path d={area} fill={MODE[env].soft} />
        {runs.map((r, i) => <path key={i} d={r.d} fill="none" stroke={colors(r.gas)} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />)}
        {xTicks.map((x, i) => (
          <text key={i} x={X(x)} y={H - 6} fontSize="11" fill="#8a909c" textAnchor={i === 0 ? 'start' : 'middle'}>
            {Math.round(x)}{i === xTicks.length - 1 && x + xStep > maxT ? ` ${minUnit}` : ''}
          </text>
        ))}
      </svg>
    </PCard>
  );
}
function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
}
function niceMax(v: number): number {
  const step = niceStep(v / 4);
  return Math.ceil(v / step - 1e-9) * step;
}

/** Decompression stop table (depth, time, runtime, gas). */
export function PStops({ t, u, rows, colors, empty }: { t: Dict; u: Units; rows: { depth: number; minutes: number; runtime: number; gas: string }[]; colors: GasColors; empty: string }) {
  return (
    <>
      <PLabel>{t.stops}</PLabel>
      {rows.length === 0 ? <p className="ps-note pb">{empty}</p> : (
        <table className="ps-table zebra">
          <thead><tr className="pb"><th className="num">{t.depth(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.runtimeCol}</th><th className="gascol">{t.gas}</th></tr></thead>
          <tbody>{rows.map((s, i) => (
            <tr key={i} className="pb"><td className="num b">{u.stopDepthN(s.depth)}</td><td className="num b">{s.minutes}</td><td className="num muted">{s.runtime}</td><td className="gascol"><GasDot name={s.gas} colors={colors} /></td></tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

/** Itinerary table; `hl` rows (gas switches, stage handling) get the amber band, `strong` rows are bold. */
export function PItinerary({ t, u, rows, colors }: { t: Dict; u: Units; rows: { min: number; depth: string; text: string; gas?: string; hl?: boolean; strong?: boolean }[]; colors: GasColors }) {
  const withGas = rows.some((r) => r.gas);
  return (
    <>
      <PLabel>{t.itinerary}</PLabel>
      <table className="ps-table itin">
        <thead><tr className="pb"><th className="num">{t.itTime}</th><th className="num">{t.itDepth(u)}</th><th>{t.itAction}</th>{withGas && <th className="gascol">{t.itGas}</th>}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i} className={`pb ${r.hl ? 'hl' : ''} ${r.strong ? 'strong' : ''}`}>
            <td className="num b">{r.min}</td><td className="num">{r.depth}</td><td>{r.text}</td>
            {withGas && <td className="gascol">{r.gas && <GasDot name={r.gas} colors={colors} />}</td>}
          </tr>
        ))}</tbody>
      </table>
    </>
  );
}

/** "What to bring" rows: quantity badge, cylinder, gas and role, fill pressure. */
export function PPacking({ title, rows, colors, fillLabel }: {
  title: string; colors: GasColors; fillLabel: string;
  rows: { count: number; cylinder: string; gas: string; role: string; fill: string; sub?: string; bad?: boolean; note?: string }[];
}) {
  return (
    <>
      <PLabel>{title}</PLabel>
      <div className="ps-pack">
        {rows.map((p, i) => (
          <div className={`ps-pack-row pb ${p.bad ? 'bad' : ''}`} key={i}>
            <span className="ps-qty">{p.count}×</span>
            <span className="ps-pack-name">{p.cylinder}{p.sub && <small>{p.sub}</small>}</span>
            <span className="ps-pack-gas"><GasDot name={p.gas} colors={colors} bold={false} suffix={`(${p.role})`} /></span>
            <span className="ps-pack-fill"><b>{p.fill}{p.bad ? ' !' : ''}</b><small>{p.note ?? fillLabel}</small></span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ================================================================ technical sheet ================================================================ */

export interface PrintData {
  t: Dict; u: Units; lang: 'hu' | 'en';
  mode: 'standard' | 'inventory';
  standardName: string; methodName: string;
  maxDepth: number; bottomTime: number; bottomGas: Gas; decoGases: { gas: Gas; switchDepth: number }[];
  gfLow: number; gfHigh: number; lastStopDepth: number;
  plan: DivePlan; stops: StopRow[]; events: ItineraryEvent[];
  usage: GasUsage[]; bg: BackGasPlan; minGas: MinimumGasResult; minGasBar: number; backCyl: Cylinder; backStart: number;
  pack: PackingItem[]; verdict: InventoryVerdict | null;
  eventText: (e: ItineraryEvent) => string;
  warnings: { text: string; bad: boolean }[];
  /** plan verdict under the selected gas standard */
  planOk: boolean; planTitle: string; blockers: string[];
}

export function PrintSheet(d: PrintData) {
  const { t, u } = d;
  const fmt = (v: number, dg = 0) => v.toLocaleString(d.lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: dg, minimumFractionDigits: dg });
  const vol = (l: number) => fmt(u.volumeN(l), u.sys === 'metric' ? 0 : 1);
  const colors = gasColorsFor([...gasOrder(d.plan), ...d.usage.map((x) => x.name)]);
  const role = (back: boolean) => (back ? t.roleBackShort : t.roleDecoShort);
  return (
    <PrintFrame t={t} lang={d.lang} env="open" subtitle={t.printSubtitle(d.standardName, d.methodName, u)}>
      <div className="ps-row">
        <PCard className="pb">
          <div className="ps-label inline">{t.dive}</div>
          <PBig items={[{ v: u.depthN(d.maxDepth), l: t.maxDepth(u) }, { v: d.bottomTime, l: t.bottomTime }]} />
          <PKV rows={[
            { l: t.bottomGas, v: gasName(d.bottomGas) },
            { l: t.decoGases, v: d.decoGases.length ? d.decoGases.map((g) => `${gasName(g.gas)} @ ${u.stopDepth(g.switchDepth)}`).join(', ') : '—' },
            { l: 'GF', v: `${d.gfLow}/${d.gfHigh} · ${t.lastStop(u)}: ${u.stopDepthN(d.lastStopDepth)}` },
          ]} />
        </PCard>
        <div className="ps-col">
          <div className="ps-label">{t.plan}</div>
          <PTiles items={[
            { v: fmt(d.plan.runtime), l: t.runtime },
            { v: fmt(d.plan.decoTime), l: t.decoTotal },
            { v: d.plan.firstStopDepth === null ? '—' : u.stopDepthN(d.plan.firstStopDepth), l: t.firstStop(u) },
            { v: d.stops.length, l: t.stopCount },
          ]} />
          <PVerdict ok={d.planOk} title={d.planTitle} blockers={d.blockers} warnings={d.warnings.filter((w) => !w.bad).map((w) => w.text)} />
        </div>
      </div>

      <PrintProfile plan={d.plan} colors={colors} t={t} u={u} env="open" />

      <PStops t={t} u={u} rows={d.stops} colors={colors} empty={t.noStops(d.standardName === 'GUE', u)} />

      <PItinerary t={t} u={u} colors={colors} rows={d.events.map((e) => ({
        min: Math.round(e.runtime),
        depth: String(e.kind === 'stop' || e.kind === 'switch' ? u.stopDepthN(e.depth) : u.depthN(e.depth)),
        text: d.eventText(e), gas: gasName(e.gas), hl: e.kind === 'switch',
      }))} />

      <div className="ps-row two">
        <PCard className="pb">
          <div className="ps-label inline">{t.gasPlan}</div>
          <PKV rows={[
            { l: t.minGas, v: `${u.pressure(d.minGasBar)} · ${u.volume(d.minGas.litres)}` },
            { l: t.usableBackGas(d.backCyl.name.split(' (')[0], d.backStart, u), v: u.pressure(d.bg.usableBar) },
            { l: t.bottomPhaseNeed, v: u.pressure(d.bg.bottomPhaseBar) },
            { l: t.ascentOnBackGas, v: u.pressure(d.bg.ascentOnBackGasBar) },
            { l: t.turnPressure, v: u.pressure(d.bg.turnPressureBar), tone: d.bg.turnPressureBar < 0 ? 'bad' : undefined },
            { l: t.backGasEnough, v: d.bg.ok ? t.yes : t.no, tone: d.bg.ok ? 'pill-ok' : 'pill-bad' },
          ]} />
        </PCard>
        <PCard className="pb">
          <div className="ps-label inline split"><span>{t.gas}</span><span>{t.litres(u)}</span></div>
          <div className="ps-kv">
            {d.usage.map((x) => (
              <div className="ps-kv-row pb" key={x.name}>
                <span className="ps-kv-l"><GasDot name={x.name} colors={colors} /> <span className={`ps-chip ${x.gas === d.bottomGas ? 'back' : 'deco'}`}>{role(x.gas === d.bottomGas)}</span></span>
                <span className="ps-kv-v">{vol(x.litres)}</span>
              </div>
            ))}
          </div>
        </PCard>
      </div>

      {d.mode === 'standard' ? (
        <PPacking title={t.packing} colors={colors} fillLabel={t.minFill}
          rows={d.pack.map((p) => ({ count: p.count, cylinder: p.cylinder.name, gas: p.gasLabel, role: role(p.role === 'back'), fill: u.pressure(p.fillBar), bad: p.overfill,
            note: p.overfill ? `${t.overfill}, ${t.overfillBy(Math.ceil(p.shortBar), u)}` : undefined }))} />
      ) : d.verdict && (
        <>
          <PLabel>{t.feasibleTitle}</PLabel>
          <table className="ps-table zebra">
            <thead><tr className="pb"><th>{t.gas}</th><th className="num">{t.haveL(u)}</th><th className="num">{t.needL(u)}</th><th className="num">{t.reserveL(u)}</th></tr></thead>
            <tbody>{d.verdict.balance.map((b) => (
              <tr key={b.item.id} className="pb">
                <td><GasDot name={gasName(b.item.gas)} colors={colors} /> <span className={`ps-chip ${b.item.role === 'back' ? 'back' : 'deco'}`}>{role(b.item.role === 'back')}</span></td>
                <td className={`num b ${b.ok ? 'ok' : 'bad'}`}>{vol(b.availableL)}</td><td className="num">{vol(b.neededL)}</td><td className="num">{vol(b.reserveL)}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
    </PrintFrame>
  );
}
