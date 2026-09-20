import {
  Cylinder, DivePlan, Gas, GasUsage, ItineraryEvent, StopRow, BackGasPlan, MinimumGasResult, PackingItem, InventoryVerdict, gasName,
} from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { ProfileChart, PRINT_PALETTE } from './ProfileChart';
import logoUrl from '../assets/btt-logo.png';

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
}

export function PrintSheet(d: PrintData) {
  const { t, u } = d;
  const fmt = (v: number, dg = 0) => v.toLocaleString(d.lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: dg, minimumFractionDigits: dg });
  const date = new Date().toLocaleDateString(d.lang === 'hu' ? 'hu-HU' : 'en-GB');
  return (
    <div className="print-sheet">
      <header className="ps-head">
        <img src={logoUrl} alt="" />
        <div>
          <div className="ps-title">{t.appTitle}</div>
          <div className="ps-sub">{t.printSubtitle(d.standardName, d.methodName, u)}</div>
        </div>
        <div className="ps-meta">
          <div>{t.printDate}: {date}</div>
          <div>{t.printGenerated}</div>
        </div>
      </header>

      <div className="ps-grid">
        {/* Dive */}
        <section>
          <h3>{t.dive}</h3>
          <table className="kv">
            <tbody>
              <tr><td>{t.maxDepth(u)}</td><td>{u.depthN(d.maxDepth)}</td></tr>
              <tr><td>{t.bottomTime}</td><td>{d.bottomTime}</td></tr>
              <tr><td>{t.bottomGas}</td><td>{gasName(d.bottomGas)}</td></tr>
              <tr><td>{t.decoGases}</td><td>{d.decoGases.length ? d.decoGases.map((g) => `${gasName(g.gas)} @ ${u.stopDepth(g.switchDepth)}`).join(', ') : '—'}</td></tr>
              <tr><td>GF</td><td>{d.gfLow}/{d.gfHigh} · {t.lastStop(u)}: {u.stopDepthN(d.lastStopDepth)}</td></tr>
            </tbody>
          </table>
        </section>

        {/* Plan */}
        <section>
          <h3>{t.plan}</h3>
          <div className="ps-kpis">
            <div><b>{fmt(d.plan.runtime)}</b><span>{t.runtime}</span></div>
            <div><b>{fmt(d.plan.decoTime)}</b><span>{t.decoTotal}</span></div>
            <div><b>{d.plan.firstStopDepth === null ? '—' : u.stopDepthN(d.plan.firstStopDepth)}</b><span>{t.firstStop(u)}</span></div>
            <div><b>{d.stops.length}</b><span>{t.stopCount}</span></div>
          </div>
          <div className="ps-chart"><ProfileChart plan={d.plan} unitLabel={d.lang === 'hu' ? 'perc' : 'min'} depthLabel={u.d} depthScale={u.sys === 'metric' ? 1 : 3.28084} palette={PRINT_PALETTE} /></div>
          {d.warnings.length > 0 && <ul className="ps-warn">{d.warnings.map((w, i) => <li key={i} className={w.bad ? 'bad' : ''}>{w.text}</li>)}</ul>}
        </section>

        {/* Stops */}
        <section>
          <h3>{t.stops}</h3>
          {d.stops.length === 0 ? <p className="ps-note">{t.noStops(d.standardName === 'GUE', u)}</p> : (
            <table>
              <thead><tr><th className="num">{t.depth(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.runtimeCol}</th><th>{t.gas}</th></tr></thead>
              <tbody>{d.stops.map((s, i) => <tr key={i}><td className="num">{u.stopDepthN(s.depth)}</td><td className="num">{s.minutes}</td><td className="num">{s.runtime}</td><td>{s.gas}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        {/* Itinerary */}
        <section className="ps-span">
          <h3>{t.itinerary}</h3>
          <table>
            <thead><tr><th className="num">{t.itTime}</th><th className="num">{t.itDepth(u)}</th><th>{t.itAction}</th><th>{t.itGas}</th></tr></thead>
            <tbody>
              {d.events.map((e, i) => (
                <tr key={i} className={`ev-${e.kind}`}>
                  <td className="num">{Math.round(e.runtime)}</td>
                  <td className="num">{e.kind === 'stop' || e.kind === 'switch' ? u.stopDepthN(e.depth) : u.depthN(e.depth)}</td>
                  <td>{d.eventText(e)}</td>
                  <td>{gasName(e.gas)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Gas plan */}
        <section>
          <h3>{t.gasPlan}</h3>
          <table className="kv">
            <tbody>
              <tr><td>{t.minGas}</td><td><b>{u.pressure(d.minGasBar)}</b> · {u.volume(d.minGas.litres)}</td></tr>
              <tr><td>{t.usableBackGas(d.backCyl.name.split(' (')[0], d.backStart, u)}</td><td>{u.pressure(d.bg.usableBar)}</td></tr>
              <tr><td>{t.bottomPhaseNeed}</td><td>{u.pressure(d.bg.bottomPhaseBar)}</td></tr>
              <tr><td>{t.ascentOnBackGas}</td><td>{u.pressure(d.bg.ascentOnBackGasBar)}</td></tr>
              <tr><td>{t.turnPressure}</td><td>{u.pressure(d.bg.turnPressureBar)}</td></tr>
              <tr><td>{t.backGasEnough}</td><td className={d.bg.ok ? 'ok' : 'bad'}><b>{d.bg.ok ? t.yes : t.no}</b></td></tr>
            </tbody>
          </table>
          <table>
            <thead><tr><th>{t.gas}</th><th className="num">{t.litres(u)}</th></tr></thead>
            <tbody>{d.usage.map((x) => <tr key={x.name}><td>{x.name} <small>({x.gas === d.bottomGas ? t.roleBackShort : t.roleDecoShort})</small></td><td className="num">{fmt(u.volumeN(x.litres), u.sys === 'metric' ? 0 : 1)}</td></tr>)}</tbody>
          </table>
        </section>

        {/* What to bring / feasibility */}
        <section>
          <h3>{d.mode === 'standard' ? t.packing : t.feasibleTitle}</h3>
          {d.mode === 'standard' ? (
            <table>
              <thead><tr><th className="num">#</th><th>{t.cylinder}</th><th>{t.gas}</th><th className="num">{t.minFill}</th></tr></thead>
              <tbody>
                {d.pack.map((p, i) => (
                  <tr key={i}><td className="num">{p.count}×</td><td>{p.cylinder.name}</td><td>{p.gasLabel} <small>({p.role === 'back' ? t.roleBackShort : t.roleDecoShort})</small></td>
                    <td className={`num ${p.overfill ? 'bad' : ''}`}>{u.pressure(p.fillBar)}{p.overfill ? ' !' : ''}</td></tr>
                ))}
              </tbody>
            </table>
          ) : d.verdict && (
            <>
              <p className={`ps-verdict ${d.verdict.feasible ? 'ok' : 'bad'}`}>{d.verdict.feasible ? t.feasibleYes : t.feasibleNo}</p>
              {!d.verdict.feasible && <ul className="ps-warn">{d.verdict.blockers.map((b, i) => <li key={i} className="bad">{t.msg(b, u)}</li>)}</ul>}
              <table>
                <thead><tr><th>{t.gas}</th><th className="num">{t.haveL(u)}</th><th className="num">{t.needL(u)}</th><th className="num">{t.reserveL(u)}</th></tr></thead>
                <tbody>{d.verdict.balance.map((b) => <tr key={b.item.id}><td>{gasName(b.item.gas)} <small>({b.item.role === 'back' ? t.roleBackShort : t.roleDecoShort})</small></td>
                  <td className={`num ${b.ok ? '' : 'bad'}`}>{fmt(u.volumeN(b.availableL), u.sys === 'metric' ? 0 : 1)}</td><td className="num">{fmt(u.volumeN(b.neededL), u.sys === 'metric' ? 0 : 1)}</td><td className="num">{fmt(u.volumeN(b.reserveL), u.sys === 'metric' ? 0 : 1)}</td></tr>)}</tbody>
              </table>
            </>
          )}
        </section>
      </div>

      <footer className="ps-foot">
        <img src={logoUrl} alt="" />
        <div className="ps-motto">Mindig van lejjebb!!!</div>
        <div className="ps-foot-line">BTT Explorers Hungary · 2018 · made by sadrobot · v{__APP_VERSION__}</div>
        <div className="ps-foot-line">{t.printDisclaimer}</div>
      </footer>
    </div>
  );
}
