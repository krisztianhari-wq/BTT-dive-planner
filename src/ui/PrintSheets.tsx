import { PenEvent, PenetrationInput, PenetrationPlan, RecEvent, RecInput, RecPlan, gasName, stopTable } from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { PrintFrame } from './PrintSheet';
import { ProfileChart, PRINT_PALETTE } from './ProfileChart';

const fmtFor = (lang: 'hu' | 'en') => (v: number, dg = 0) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: dg, minimumFractionDigits: dg });

/* ---------------- Recreational ---------------- */
export function RecPrintSheet({ t, u, lang, input, plan, events, cylinderName }: { t: Dict; u: Units; lang: 'hu' | 'en'; input: RecInput; plan: RecPlan; events: RecEvent[]; cylinderName: string }) {
  const fmt = fmtFor(lang);
  const evText = (e: RecEvent) => {
    switch (e.kind) {
      case 'start': return t.itStart(gasName(input.gas));
      case 'arriveBottom': return t.itArrive;
      case 'leaveBottom': return t.recEvLeave;
      case 'safetyStop': return t.recEvSafety(Math.round(e.duration ?? 0), u.depth(e.depth));
      case 'surface': return t.itSurface;
    }
  };
  return (
    <PrintFrame t={t} lang={lang} subtitle={t.printSubtitleRec(u)}>
      <section>
        <h3>{t.dive}</h3>
        <table className="kv"><tbody>
          <tr><td>{t.maxDepth(u)}</td><td>{u.depthN(input.maxDepth)}</td></tr>
          <tr><td>{t.bottomTime}</td><td>{input.bottomTime}</td></tr>
          <tr><td>{t.bottomGas}</td><td>{gasName(input.gas)}</td></tr>
          <tr><td>{t.backCylinder}</td><td>{cylinderName} · {u.pressure(input.startBar)}</td></tr>
          <tr><td>{t.penSac(u)}</td><td>{u.sacS(input.sacLpm)}</td></tr>
          <tr><td>GF high</td><td>{Math.round(input.gfHigh * 100)}</td></tr>
        </tbody></table>
      </section>
      <section className="ps-half">
        <h3>{t.recPlan}</h3>
        <p className={`ps-verdict ${plan.feasible ? 'ok' : 'bad'}`}>{plan.feasible ? t.recFeasible : t.feasibleNo}</p>
        {!plan.feasible && <ul className="ps-warn">{plan.blockers.map((b, i) => <li key={i} className="bad">{t.msg(b, u)}</li>)}</ul>}
        <div className="ps-kpis">
          <div><b>{plan.ndlMinutes >= 999 ? '∞' : plan.ndlMinutes}</b><span>{t.recNdl}</span></div>
          <div><b>{fmt(input.bottomTime)}</b><span>{t.bottomTime}</span></div>
          <div><b>{fmt(plan.runtime)}</b><span>{t.runtime}</span></div>
          <div><b>{u.pressureN(plan.turnBar)}</b><span>{t.recTurn} ({u.p})</span></div>
        </div>
        <p className="ps-note">{t.recMaxBottom(plan.maxBottomTime)} {t.recSafetyStop(u.depth(5), 3)}</p>
        {plan.warnings.length > 0 && <ul className="ps-warn">{plan.warnings.map((w, i) => <li key={i}>{t.msg(w, u)}</li>)}</ul>}
      </section>
      <section className="ps-span">
        <h3>{t.itinerary}</h3>
        <table>
          <thead><tr><th className="num">{t.itTime}</th><th className="num">{t.itDepth(u)}</th><th>{t.itAction}</th></tr></thead>
          <tbody>{events.map((e, i) => <tr key={i} className={e.kind === 'safetyStop' ? 'ev-stop' : ''}><td className="num">{Math.round(e.runtime)}</td><td className="num">{u.depthN(e.depth)}</td><td>{evText(e)}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="ps-span">
        <h3>{t.gasPlan}</h3>
        <table className="kv"><tbody>
          <tr><td>{t.recSurfaceWith(u.pressure(plan.surfaceReserveBar))}</td><td>{u.pressure(plan.surfaceReserveBar)}</td></tr>
          <tr><td>{t.recGasUsed}</td><td>{u.pressure(plan.gasUsedBar)} · {u.volume(plan.gasUsedLitres)}</td></tr>
          <tr><td>{t.recSurfaceBar}</td><td className={plan.gasOk ? 'ok' : 'bad'}>{u.pressure(plan.surfaceBar)}</td></tr>
          <tr><td>{t.recTurn}</td><td>{u.pressure(plan.turnBar)}</td></tr>
          <tr><td>{t.recRockBottom} – {t.recRockBottomDesc}</td><td>{u.pressure(plan.rockBottomBar)} · {u.volume(plan.rockBottomLitres)}</td></tr>
          <tr><td>{t.recGasOk}</td><td className={plan.gasOk ? 'ok' : 'bad'}>{plan.gasOk ? t.yes : t.no}</td></tr>
        </tbody></table>
      </section>
    </PrintFrame>
  );
}

/* ---------------- Penetration ---------------- */
export function PenPrintSheet({ t, u, lang, input, plan, events, agencyLabel, envLabel, flowLabel, evText }: {
  t: Dict; u: Units; lang: 'hu' | 'en'; input: PenetrationInput; plan: PenetrationPlan; events: PenEvent[];
  agencyLabel: string; envLabel: string; flowLabel: string; evText: (e: PenEvent) => string;
}) {
  const fmt = fmtFor(lang);
  const vol = (l: number) => fmt(u.volumeN(l), u.sys === 'metric' ? 0 : 1);
  const stops = stopTable(plan.deco);
  const limiting = plan.members.find((m) => m.member.id === plan.limiting.id) ?? plan.members[0];
  return (
    <PrintFrame t={t} lang={lang} subtitle={t.printSubtitlePen(envLabel, agencyLabel, u)}>
      <section>
        <h3>{t.penEnvironment}</h3>
        <table className="kv"><tbody>
          <tr><td>{t.penType} · {t.penAgency}</td><td>{envLabel} · {agencyLabel}</td></tr>
          <tr><td>{t.penFlow}</td><td>{flowLabel} · {plan.rules.fractionLabel}</td></tr>
          <tr><td>{t.penAvgDepth(u)} / {t.penMaxDepth(u)}</td><td>{u.depthN(input.avgDepth)} / {u.depthN(input.maxDepth)}</td></tr>
          <tr><td>{t.bottomGas}</td><td>{gasName(input.bottomGas)}</td></tr>
          <tr><td>{t.decoGases}</td><td>{input.decoGases.length ? input.decoGases.map((g) => `${gasName(g.gas)} @ ${u.stopDepth(g.switchDepth)}`).join(', ') : '—'}</td></tr>
          <tr><td>{t.penSwimSpeed(u)}</td><td>{u.depthN(input.swimSpeedMpm)}</td></tr>
        </tbody></table>
      </section>
      <section className="ps-half">
        <h3>{t.penPlan}</h3>
        <p className={`ps-verdict ${plan.feasible ? 'ok' : 'bad'}`}>{plan.feasible ? t.penFeasible : t.feasibleNo}</p>
        <div className="ps-kpis">
          <div><b>{u.pressureN(limiting.turnBar)}</b><span>{t.penKpiTurn(u)}</span></div>
          <div><b>{fmt(plan.penetrationMinutes)}</b><span>{t.penKpiPenMin}</span></div>
          <div><b>{u.depthN(plan.penetrationDistanceM)}</b><span>{t.penKpiDistance(u)}</span></div>
          <div><b>{fmt(plan.bottomTime)}</b><span>{t.penKpiBottom}</span></div>
        </div>
        <div className="ps-chart"><ProfileChart plan={plan.deco} unitLabel={lang === 'hu' ? 'perc' : 'min'} depthLabel={u.d} depthScale={u.sys === 'metric' ? 1 : 3.28084} palette={PRINT_PALETTE} /></div>
        {(plan.blockers.length + plan.warnings.length) > 0 && <ul className="ps-warn">{plan.blockers.map((b, i) => <li key={`b${i}`} className="bad">{t.msg(b, u)}</li>)}{plan.warnings.map((w, i) => <li key={`w${i}`}>{t.msg(w, u)}</li>)}</ul>}
      </section>
      <section className="ps-span">
        <h3>{t.penGasMatching}</h3>
        <table>
          <thead><tr><th>{t.penDiver}</th><th>{t.cylinder}</th><th className="num">{t.penStart(u)}</th><th className="num">{t.penTurn(u)}</th><th className="num">{t.penPenGas(u)}</th><th className="num">{t.penExitLeft(u)}</th><th className="num">{t.penSharedLeft(u)}</th></tr></thead>
          <tbody>{plan.members.map((m) => <tr key={m.member.id}><td>{m.member.name}{m.member.id === plan.limiting.id ? ` (${t.penLimiting})` : ''}</td><td>{m.member.cylinder.name.split(' (')[0]}</td><td className="num">{u.pressureN(m.member.startBar)}</td><td className="num"><b>{u.pressureN(m.turnBar)}</b></td><td className="num">{vol(m.penetrationLitres)}</td><td className="num">{vol(m.exitRemainingLitres)}</td><td className={`num ${m.sharedExitRemainingLitres < 0 ? 'bad' : ''}`}>{vol(m.sharedExitRemainingLitres)}</td></tr>)}</tbody>
        </table>
      </section>
      {plan.stages.length > 0 && (
        <section className="ps-span">
          <h3>{t.penStagePlan}</h3>
          <table>
            <thead><tr><th>#</th><th>{t.cylinder}</th><th>{t.gas}</th><th className="num">{t.penDropAt(u)}</th><th className="num">{t.penUsableIn(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.penDropDistance(u)}</th></tr></thead>
            <tbody>{plan.stages.map((st, i) => { const cum = plan.stages.slice(0, i + 1).reduce((a, x) => a + x.minutes, 0); return <tr key={i}><td>{i + 1}</td><td>{st.stage.cylinder.name.split(' (')[0]}</td><td>{gasName(st.stage.gas)}</td><td className="num"><b>{u.pressureN(st.dropBar)}</b></td><td className="num">{vol(st.usableInLitres)}</td><td className="num">{fmt(st.minutes)}</td><td className="num">{u.depthN(cum * input.swimSpeedMpm)}</td></tr>; })}</tbody>
          </table>
        </section>
      )}
      <section className="ps-span">
        <h3>{t.itinerary}</h3>
        <table>
          <thead><tr><th className="num">{t.itTime}</th><th className="num">{t.itDepth(u)}</th><th>{t.itAction}</th><th>{t.itGas}</th></tr></thead>
          <tbody>{events.map((e, i) => <tr key={i} className={e.kind === 'switch' || e.kind === 'stageDrop' || e.kind === 'stagePickup' ? 'ev-switch' : e.kind === 'decoStop' || e.kind === 'turn' ? 'ev-stop' : ''}><td className="num">{Math.round(e.runtime)}</td><td className="num">{e.kind === 'decoStop' || e.kind === 'switch' ? u.stopDepthN(e.depth) : u.depthN(e.depth)}</td><td>{evText(e)}</td><td>{gasName(e.gas)}</td></tr>)}</tbody>
        </table>
      </section>
      <section className="ps-half">
        <h3>{t.stops}</h3>
        {stops.length === 0 ? <p className="ps-note">{t.noStops(true, u)}</p> : (
          <table><thead><tr><th className="num">{t.depth(u)}</th><th className="num">{t.minutes}</th><th>{t.gas}</th></tr></thead>
            <tbody>{stops.map((s, i) => <tr key={i}><td className="num">{u.stopDepthN(s.depth)}</td><td className="num">{s.minutes}</td><td>{s.gas}</td></tr>)}</tbody></table>
        )}
        <p className="ps-note">{t.penDecoNote(u.depth(input.maxDepth))}</p>
      </section>
      <section className="ps-half">
        <h3>{t.penTeam}</h3>
        <table className="kv"><tbody>
          <tr><td>{t.penTeamSize}</td><td>{input.team.length}</td></tr>
          <tr><td>{t.penStages}</td><td>{input.stages.length ? `${input.stages[0].count} × ${input.stages[0].cylinder.name.split(' (')[0]} · ${input.stageRule === 'halfPlus' ? t.penRuleHalfPlus : t.penRuleThirds}` : '—'}</td></tr>
          <tr><td>{t.decoTotal}</td><td>{fmt(plan.deco.decoTime)}</td></tr>
          <tr><td>{t.runtime}</td><td>{fmt(plan.deco.runtime)}</td></tr>
        </tbody></table>
      </section>
    </PrintFrame>
  );
}
