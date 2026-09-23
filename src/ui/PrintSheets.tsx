import { DecoGasRequirement, PenEvent, PenetrationInput, PenetrationPlan, RecEvent, RecInput, RecPlan, gasName, stopTable, recreationalProfile } from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { GasDot, PBig, PCard, PItinerary, PKV, PLabel, PPacking, PStops, PTiles, PVerdict, PrintFrame, PrintProfile, gasColorsFor, gasOrder } from './PrintSheet';

const fmtFor = (lang: 'hu' | 'en') => (v: number, dg = 0) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: dg, minimumFractionDigits: dg });

/* ---------------- Recreational ---------------- */
export function RecPrintSheet({ t, u, lang, input, plan, events, cylinderName }: { t: Dict; u: Units; lang: 'hu' | 'en'; input: RecInput; plan: RecPlan; events: RecEvent[]; cylinderName: string }) {
  const fmt = fmtFor(lang);
  const profile = recreationalProfile(input, plan);
  const colors = gasColorsFor(gasOrder(profile));
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
    <PrintFrame t={t} lang={lang} env="rec" subtitle={t.printSubtitleRec(u)}>
      <div className="ps-row">
        <PCard className="pb">
          <div className="ps-label inline">{t.dive}</div>
          <PBig items={[{ v: u.depthN(input.maxDepth), l: t.maxDepth(u) }, { v: input.bottomTime, l: t.bottomTime }]} />
          <PKV rows={[
            { l: t.bottomGas, v: gasName(input.gas) },
            { l: t.backCylinder, v: `${cylinderName.split(' (')[0]} · ${u.pressure(input.startBar)}` },
            { l: t.penSac(u), v: u.sacS(input.sacLpm) },
            { l: 'GF high', v: Math.round(input.gfHigh * 100) },
          ]} />
        </PCard>
        <div className="ps-col">
          <div className="ps-label">{t.recPlan}</div>
          <PTiles items={[
            { v: plan.ndlMinutes >= 999 ? '∞' : plan.ndlMinutes, l: t.recNdl },
            { v: fmt(plan.runtime), l: t.runtime },
            { v: u.pressureN(plan.turnBar), l: `${t.recTurn} (${u.p})` },
            { v: u.pressureN(plan.surfaceBar), l: t.recSurfaceKpi(u) },
          ]} />
          <PVerdict ok={plan.feasible} title={plan.feasible ? t.recFeasible : t.feasibleNo}
            blockers={[...plan.blockers.map((b) => t.msg(b, u)), t.recMaxBottom(plan.maxBottomTime)]} warnings={plan.warnings.map((w) => t.msg(w, u))} />
        </div>
      </div>
      <PrintProfile plan={profile} colors={colors} t={t} u={u} env="rec" />
      <p className="ps-note pb">{t.recSafetyStop(u.depth(5), 3)}</p>
      <div className="ps-row two">
        <div className="ps-col">
          <PItinerary t={t} u={u} colors={colors} rows={events.map((e) => ({ min: Math.round(e.runtime), depth: String(u.depthN(e.depth)), text: evText(e), strong: e.kind === 'safetyStop', hl: e.kind === 'safetyStop' }))} />
        </div>
        <PCard className="pb">
          <div className="ps-label inline">{t.gasPlan}</div>
          <PKV rows={[
            { l: t.recSurfaceWith(u.pressure(plan.surfaceReserveBar)), v: u.pressure(plan.surfaceReserveBar) },
            { l: t.recGasUsed, v: `${u.pressure(plan.gasUsedBar)} · ${u.volume(plan.gasUsedLitres)}` },
            { l: t.recSurfaceBar, v: u.pressure(plan.surfaceBar), tone: plan.gasOk ? undefined : 'bad' },
            { l: t.recTurn, v: u.pressure(plan.turnBar) },
            { l: <>{t.recRockBottom}<small>{t.recRockBottomDesc}</small></>, v: `${u.pressure(plan.rockBottomBar)} · ${u.volume(plan.rockBottomLitres)}` },
            { l: t.recGasOk, v: plan.gasOk ? t.yes : t.no, tone: plan.gasOk ? 'pill-ok' : 'pill-bad' },
          ]} />
        </PCard>
      </div>
    </PrintFrame>
  );
}

/* ---------------- Penetration ---------------- */
export function PenPrintSheet({ t, u, lang, input, plan, events, agencyLabel, envLabel, flowLabel, evText, packing }: {
  t: Dict; u: Units; lang: 'hu' | 'en'; input: PenetrationInput; plan: PenetrationPlan; events: PenEvent[];
  agencyLabel: string; envLabel: string; flowLabel: string; evText: (e: PenEvent) => string; decoStages?: DecoGasRequirement[];
  packing?: { count: number; cylinder: string; gas: string; fillBar: number; role: 'back' | 'stage' | 'deco'; divers?: string }[];
}) {
  const fmt = fmtFor(lang);
  const vol = (l: number) => fmt(u.volumeN(l), u.sys === 'metric' ? 0 : 1);
  const stops = stopTable(plan.deco);
  const limiting = plan.members.find((m) => m.member.id === plan.limiting.id) ?? plan.members[0];
  const colors = gasColorsFor([...plan.members.map((m) => gasName(m.member.gas ?? input.bottomGas)), ...plan.stages.map((s) => gasName(s.stage.gas)), ...gasOrder(plan.deco)]);
  const teamDies = plan.blockers.some((b) => b.code === 'penSharedExitShort');
  const title = teamDies ? t.penTeamDies : plan.overridden ? t.penBraveActive : !plan.feasible ? t.feasibleNo : plan.unsupported ? t.penUnsupported(agencyLabel) : t.penFeasible;
  const gf = input.settings?.gf;
  const shift = plan.bottomTime - plan.deco.bottomTime;
  return (
    <PrintFrame t={t} lang={lang} env="pen" subtitle={t.printSubtitlePen(envLabel, agencyLabel, u)}>
      <div className="ps-row">
        <PCard className="pb">
          <div className="ps-label inline">{t.penEnvironment}</div>
          <PBig items={[{ v: u.depthN(input.avgDepth), l: t.penAvgDepth(u) }, { v: u.depthN(input.maxDepth), l: t.penMaxDepth(u) }]} />
          <PKV rows={[
            { l: `${t.penType} · ${t.penAgency}`, v: `${envLabel} · ${agencyLabel}` },
            { l: t.penFlow, v: `${flowLabel} · ${plan.rules.fractionLabel}` },
            { l: t.bottomGas, v: gasName(input.bottomGas) },
            { l: t.decoGases, v: input.decoGases.length ? input.decoGases.map((g) => `${gasName(g.gas)} @ ${u.stopDepth(g.switchDepth)}`).join(', ') : '—' },
            { l: t.penStages, v: input.stages.length ? `${input.stages[0].count} × ${input.stages[0].cylinder.name.split(' (')[0]} · ${input.stageRule === 'halfPlus' ? t.penRuleHalfPlus : t.penRuleThirds}` : '—' },
            { l: t.penSwimSpeed(u), v: u.depthN(input.swimSpeedMpm) },
            ...(gf ? [{ l: 'GF', v: `${Math.round(gf.low * 100)}/${Math.round(gf.high * 100)}` }] : []),
          ]} />
        </PCard>
        <div className="ps-col">
          <div className="ps-label">{t.penPlan}</div>
          <PTiles cols={3} items={[
            { v: u.pressureN(limiting.turnBar), l: t.penKpiTurn(u) },
            { v: fmt(plan.penetrationMinutes), l: t.penKpiPenMin },
            { v: u.depthN(plan.penetrationDistanceM), l: t.penKpiDistance(u) },
            { v: fmt(plan.bottomTime), l: t.penKpiBottom },
            { v: fmt(plan.deco.decoTime), l: t.decoTotal },
            { v: fmt(plan.deco.runtime), l: t.runtime },
          ]} />
          <PVerdict ok={plan.feasible && !plan.overridden && !plan.unsupported} title={title}
            blockers={[...plan.blockers.map((b) => t.msg(b, u)), t.penRuleSummary(plan.rules.fractionLabel, agencyLabel, u.depth(plan.rules.maxDepthM))]}
            warnings={plan.warnings.map((w) => t.msg(w, u))} />
        </div>
      </div>

      <PrintProfile plan={plan.deco} colors={colors} t={t} u={u} env="pen" />

      <PLabel>{t.penGasMatching}</PLabel>
      <table className="ps-table zebra dense">
        <thead><tr className="pb"><th>{t.penDiver}</th><th>{t.gas}</th><th>{t.cylinder}</th><th className="num">{t.penStart(u)}</th><th className="num">{t.penTurn(u)}</th><th className="num">{t.penPenGas(u)}</th><th className="num">{t.penExitLeft(u)}</th><th className="num">{t.penSharedLeft(u)}</th></tr></thead>
        <tbody>{plan.members.map((m) => (
          <tr key={m.member.id} className="pb">
            <td className="b">{m.member.name}{m.member.id === plan.limiting.id && <span className="ps-chip mode">{t.penLimiting}</span>}</td>
            <td><GasDot name={gasName(m.member.gas ?? input.bottomGas)} colors={colors} /></td>
            <td>{m.member.cylinder.name.split(' (')[0]}{m.sidemount ? ` · ${u.pressureN(m.sidemount.leftBar)}/${u.pressureN(m.sidemount.rightBar)}` : ''}</td>
            <td className="num">{u.pressureN(m.member.startBar)}</td>
            <td className="num b mode">{u.pressureN(m.turnBar)}</td>
            <td className="num">{vol(m.penetrationLitres)}</td>
            <td className="num">{vol(m.exitRemainingLitres)}</td>
            <td className={`num b ${m.sharedExitRemainingLitres < 0 ? 'bad' : 'ok'}`}>{vol(m.sharedExitRemainingLitres)}</td>
          </tr>
        ))}</tbody>
      </table>

      {plan.stages.length > 0 && (
        <>
          <PLabel>{t.penStagePlan}</PLabel>
          <table className="ps-table zebra">
            <thead><tr className="pb"><th className="num">#</th><th>{t.cylinder}</th><th>{t.gas}</th><th className="num">{t.penDropAt(u)}</th><th className="num">{t.penUsableIn(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.penDropDistance(u)}</th></tr></thead>
            <tbody>{plan.stages.map((st, i) => {
              const cum = plan.stages.slice(0, i + 1).reduce((a, x) => a + x.minutes, 0);
              return <tr key={i} className="pb"><td className="num b">{i + 1}</td><td>{st.stage.cylinder.name.split(' (')[0]}</td><td><GasDot name={gasName(st.stage.gas)} colors={colors} /></td><td className="num b">{u.pressureN(st.dropBar)}</td><td className="num">{vol(st.usableInLitres)}</td><td className="num">{fmt(st.minutes)}</td><td className="num">{u.depthN(cum * input.swimSpeedMpm)}</td></tr>;
            })}</tbody>
          </table>
        </>
      )}

      <PStops t={t} u={u} colors={colors} empty={t.noStops(true, u)} rows={stops.map((s) => ({ ...s, runtime: Math.round(s.runtime + shift) }))} />
      <p className="ps-note pb">{t.penDecoNote(u.depth(input.maxDepth))}</p>

      <PItinerary t={t} u={u} colors={colors} rows={events.map((e) => ({
        min: Math.round(e.runtime),
        depth: String(e.kind === 'decoStop' || e.kind === 'switch' ? u.stopDepthN(e.depth) : u.depthN(e.depth)),
        text: evText(e), gas: gasName(e.gas),
        hl: e.kind === 'switch' || e.kind === 'stageDrop' || e.kind === 'stagePickup', strong: e.kind === 'turn',
      }))} />

      <PPacking title={`${t.packing} · ${t.penTeamSize.toLowerCase()} ${input.team.length}`} colors={colors} fillLabel={t.minFill}
        rows={(packing ?? []).map((p) => ({
          count: p.count, cylinder: p.cylinder.split(' (')[0], gas: p.gas,
          role: p.role === 'back' ? t.roleBackShort : p.role === 'stage' ? t.penStageShort : t.roleDecoShort,
          sub: p.divers, fill: u.pressure(p.fillBar), note: p.role === 'back' ? t.startPressure(u) : undefined,
        }))} />
    </PrintFrame>
  );
}
