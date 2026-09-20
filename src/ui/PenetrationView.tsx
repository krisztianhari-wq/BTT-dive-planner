import { useMemo, useState } from 'react';
import {
  Agency, CYLINDERS, DecoGasSpec, Environment, Flow, Gas, GasStandard, PenEvent, PlanSettings, StageRule, TeamMember,
  gasName, penetrationItinerary, planPenetration, stagesNeeded, stopTable, planConsumption, decoGasRequirements, DecoGasRequirement,
} from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { NumInput } from './NumInput';
import { ProfileChart } from './ProfileChart';

interface Props {
  t: Dict; u: Units; lang: 'hu' | 'en'; std: GasStandard; settings: Partial<PlanSettings>;
  /** rendered inside the left column */
  side: 'left' | 'right';
  state: PenState; setState: (s: PenState) => void;
}

export interface PenState {
  agency: Agency; environment: Environment; flow: Flow;
  avgDepth: number; maxDepth: number; swimSpeed: number; descentMinutes: number; plannedMinutes: number; brave: boolean;
  teamSize: number; sameForAll: boolean;
  shared: { cylIdx: number; startBar: number; sac: number };
  members: { name: string; gasIdx: number | 'team'; startBar: number; sac: number }[];
  bottomGasIdx: number | 'auto';
  stageCount: number; stageCylIdx: number; stageBar: number | null; stageRule: StageRule; stageReserveBar: number; stageGasIdx: number | 'bottom';
  decoOn: Record<string, boolean>;
}

export const S80_IDX = CYLINDERS.findIndex((c) => c.name.startsWith('AL80'));

export const defaultPenState = (): PenState => ({
  agency: 'gue', environment: 'cave', flow: 'outflow',
  avgDepth: 18, maxDepth: 24, swimSpeed: 15, descentMinutes: 1, plannedMinutes: 20, brave: false,
  teamSize: 2, sameForAll: true,
  shared: { cylIdx: 0, startBar: 200, sac: 18 },
  members: [1, 2, 3, 4].map((i) => ({ name: `B${i}`, gasIdx: 'team' as const, startBar: 200, sac: 18 })),
  bottomGasIdx: 'auto',
  stageCount: 0, stageCylIdx: S80_IDX, stageBar: null, stageRule: 'halfPlus', stageReserveBar: 15, stageGasIdx: 'bottom',
  decoOn: {},
});

const AIR: Gas = { o2: 0.21, he: 0, name: 'Air' };
/** Bottom gas options: the standard's gases plus Air (GUE lists no air, but clubs dive it in shallow caves). */
export function penBottomGases(std: GasStandard) {
  return std.bottomGases.some((g) => Math.abs(g.gas.o2 - 0.21) < 0.005 && g.gas.he === 0) ? std.bottomGases : [{ gas: AIR, minDepth: 0, maxDepth: 30 }, ...std.bottomGases];
}
/** Stage gas options: bottom gases first, then the standard deco gases (EAN50, O2, ...). */
export function penStageGases(std: GasStandard): Gas[] {
  const out: Gas[] = penBottomGases(std).map((g) => g.gas);
  for (const d of std.decoGases) if (!out.some((g) => gasName(g) === gasName(d.gas))) out.push(d.gas);
  return out;
}

export function usePenetrationPlan(s: PenState, std: GasStandard, settings: Partial<PlanSettings>) {
  return useMemo(() => {
    const auto = std.bottomGasFor(s.maxDepth);
    const bottomList = penBottomGases(std);
    const bottomGas: Gas = s.bottomGasIdx === 'auto' || !bottomList[s.bottomGasIdx] ? (auto?.gas ?? bottomList[0].gas) : bottomList[s.bottomGasIdx].gas;
    const cylinder = CYLINDERS[s.shared.cylIdx] ?? CYLINDERS[0]; // one cylinder type for the whole team; divers differ by gas, pressure and SAC
    const team: TeamMember[] = Array.from({ length: s.teamSize }, (_, i) => {
      if (s.sameForAll) return { id: String(i), name: `B${i + 1}`, cylinder, startBar: s.shared.startBar, sacLpm: s.shared.sac };
      const m = s.members[i];
      const g = typeof m.gasIdx === 'number' && bottomList[m.gasIdx] ? bottomList[m.gasIdx].gas : bottomGas;
      return { id: String(i), name: m.name, cylinder, startBar: m.startBar, sacLpm: m.sac, gas: g };
    });
    const decoGases: DecoGasSpec[] = std.decoGases.filter((d) => s.decoOn[d.gas.name!]).map((d) => ({ gas: d.gas, switchDepth: d.switchDepth }));
    const stageList = penStageGases(std);
    const stageGas: Gas = typeof s.stageGasIdx === 'number' && stageList[s.stageGasIdx] ? stageList[s.stageGasIdx] : bottomGas;
    const stageBar = s.stageBar ?? (s.sameForAll ? s.shared.startBar : Math.min(...team.map((m) => m.startBar)));
    const stageTemplate = { cylinder: CYLINDERS[s.stageCylIdx] ?? CYLINDERS[S80_IDX], gas: stageGas, startBar: stageBar };
    const stages = s.stageCount > 0 ? [{ ...stageTemplate, count: s.stageCount }] : [];
    const input = {
      agency: s.agency, environment: s.environment, flow: s.flow, team, bottomGas, stages, stageRule: s.stageRule, stageReserveBar: s.stageReserveBar,
      avgDepth: s.avgDepth, maxDepth: s.maxDepth, swimSpeedMpm: s.swimSpeed, descentMinutes: s.descentMinutes, plannedPenetrationMinutes: s.plannedMinutes, overrideGasRule: s.brave, decoGases, settings,
    };
    const plan = team.length ? planPenetration(input) : null;
    const events: PenEvent[] = plan ? penetrationItinerary(input, plan) : [];
    const suggestedStages = plan && !plan.overridden && plan.blockers.some((b) => b.code === 'penTimeOverGas') ? stagesNeeded(input, stageTemplate) : null;
    // deco stages derived from the selected deco gases: volume per diver from the deco schedule, ×1.5 reserve
    const sac = s.sameForAll ? s.shared.sac : Math.max(...team.map((m) => m.sacLpm), 1);
    const decoStages: DecoGasRequirement[] = plan ? decoGasRequirements(planConsumption(plan.deco, sac, sac), bottomGas) : [];
    return { input, plan, events, bottomGas, autoBottom: auto, stageTemplate, stageBar, suggestedStages, decoStages, bottomList, stageList };
  }, [s, std, settings]);
}

export function PenetrationView({ t, u, lang, std, settings, side, state: s, setState }: Props) {
  const set = (patch: Partial<PenState>) => setState({ ...s, ...patch });
  const { input, plan, events, autoBottom, stageBar, suggestedStages, decoStages, bottomList, stageList } = usePenetrationPlan(s, std, settings);
  const vol0 = (l: number) => (u.volumeN(l)).toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: u.sys === 'metric' ? 0 : 1 });
  const fmt = (v: number, d = 0) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const vol = (l: number) => fmt(u.volumeN(l), u.sys === 'metric' ? 0 : 1);
  const [_, setTick] = useState(0); void _; void setTick;

  if (side === 'left') {
    return (
      <>
        <section className="panel pen">
          <h2>{t.penEnvironment}</h2>
          <div className="row3">
            <div><label>{t.penType}</label>
              <select value={s.environment} onChange={(e) => set({ environment: e.target.value as Environment, flow: e.target.value === 'cave' ? 'outflow' : 'none' })}>
                <option value="cave">{t.penCave}</option><option value="mine">{t.penMine}</option><option value="wreck">{t.penWreck}</option>
              </select></div>
            <div><label>{t.penAgency}</label>
              <select value={s.agency} onChange={(e) => { const a = e.target.value as Agency; set({ agency: a, stageRule: a === 'gue' ? 'halfPlus' : 'thirds' }); }}>
                <option value="gue">GUE</option><option value="tdi">TDI</option><option value="iantd">IANTD</option>
              </select></div>
            <div><label>{t.penFlow}</label>
              <select value={s.flow} onChange={(e) => set({ flow: e.target.value as Flow })}>
                <option value="outflow">{t.penFlowOut}</option><option value="none">{t.penFlowNone}</option><option value="siphon">{t.penFlowSiphon}</option>
              </select></div>
          </div>
          <div className="row">
            <div><label>{t.penAvgDepth(u)}</label><NumInput min={u.depthN(3)} max={u.depthN(60)} value={u.depthN(s.avgDepth)} onChange={(v) => set({ avgDepth: u.toM(v) })} /></div>
            <div><label>{t.penMaxDepth(u)}</label><NumInput min={u.depthN(3)} max={u.depthN(60)} value={u.depthN(s.maxDepth)} onChange={(v) => set({ maxDepth: u.toM(v) })} /></div>
          </div>
          <div className="row">
            <div><label>{t.penPlannedTime}</label><NumInput min={0} max={300} value={s.plannedMinutes} onChange={(v) => set({ plannedMinutes: v })} /></div>
            <div><label>{t.penDescent}</label><NumInput min={0} max={30} value={s.descentMinutes} onChange={(v) => set({ descentMinutes: v })} /></div>
          </div>
          <div className="row">
            <div><label>{t.penSwimSpeed(u)}</label><NumInput min={1} value={u.depthN(s.swimSpeed)} onChange={(v) => set({ swimSpeed: u.toM(v) })} /></div>
            <div />
          </div>
          <label>{t.bottomGas}</label>
          <select value={s.bottomGasIdx} onChange={(e) => set({ bottomGasIdx: e.target.value === 'auto' ? 'auto' : +e.target.value })}>
            <option value="auto">{t.autoBottomGas(autoBottom?.gas.name ?? '—')}</option>
            {bottomList.map((g, i) => <option key={g.gas.name} value={i}>{g.gas.name}</option>)}
          </select>
          <label>{t.decoGases}</label>
          <div className="chips">
            {std.decoGases.map((d) => {
              const on = !!s.decoOn[d.gas.name!];
              return <span key={d.gas.name} className={`chip ${on ? 'on' : ''}`} onClick={() => set({ decoOn: { ...s.decoOn, [d.gas.name!]: !on } })}><span className="dot" /> {d.gas.name} · {u.stopDepth(d.switchDepth)}</span>;
            })}
          </div>
        </section>

        <section className="panel pen">
          <h2>{t.penTeam}</h2>
          <div className="row">
            <div><label>{t.penTeamSize}</label>
              <select value={s.teamSize} onChange={(e) => set({ teamSize: +e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label>{t.penSameForAll}</label>
              <div className="seg" style={{ display: 'flex' }}>
                <button style={{ flex: 1 }} className={s.sameForAll ? 'on' : ''} onClick={() => set({ sameForAll: true })}>{t.yes}</button>
                <button style={{ flex: 1 }} className={!s.sameForAll ? 'on' : ''} onClick={() => set({ sameForAll: false })}>{t.no}</button>
              </div></div>
          </div>
          <label>{t.backCylinder}</label>
          <select value={s.shared.cylIdx} onChange={(e) => set({ shared: { ...s.shared, cylIdx: +e.target.value } })}>{CYLINDERS.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}</select>
          {s.sameForAll ? (
            <>
              <div className="row">
                <div><label>{t.startPressure(u)}</label><NumInput min={0} value={u.pressureN(s.shared.startBar)} onChange={(v) => set({ shared: { ...s.shared, startBar: u.toBar(v) } })} /></div>
                <div><label>{t.penSac(u)}</label><NumInput min={0} step={u.sacStep} decimals={u.sys === 'metric' ? 0 : 2} value={u.sacN(s.shared.sac)} onChange={(v) => set({ shared: { ...s.shared, sac: u.toLpm(v) } })} /></div>
              </div>
            </>
          ) : (
            Array.from({ length: s.teamSize }, (_, i) => s.members[i]).map((m, i) => (
              <div className="inv-row pen" key={i}>
                <div className="full"><label>{t.penDiver} {i + 1}</label><input value={m.name} onChange={(e) => { const ms = [...s.members]; ms[i] = { ...m, name: e.target.value }; set({ members: ms }); }} /></div>
                <div className="full"><label>{t.bottomGas}</label>
                  <select value={m.gasIdx} onChange={(e) => { const ms = [...s.members]; ms[i] = { ...m, gasIdx: e.target.value === 'team' ? 'team' : +e.target.value }; set({ members: ms }); }}>
                    <option value="team">{t.penGasTeam}</option>
                    {bottomList.map((g, j) => <option key={g.gas.name} value={j}>{g.gas.name}</option>)}
                  </select></div>
                <div><label>{t.startPressure(u)}</label><NumInput min={0} value={u.pressureN(m.startBar)} onChange={(v) => { const ms = [...s.members]; ms[i] = { ...m, startBar: u.toBar(v) }; set({ members: ms }); }} /></div>
                <div><label>{t.penSac(u)}</label><NumInput min={0} step={u.sacStep} decimals={u.sys === 'metric' ? 0 : 2} value={u.sacN(m.sac)} onChange={(v) => { const ms = [...s.members]; ms[i] = { ...m, sac: u.toLpm(v) }; set({ members: ms }); }} /></div>
              </div>
            ))
          )}
        </section>

        <section className="panel pen">
          <h2>{t.penStages}</h2>
          <div className="row3">
            <div><label>{t.penStagesPerDiver}</label><select value={s.stageCount} onChange={(e) => set({ stageCount: +e.target.value })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label>{t.cylinder}</label><select value={s.stageCylIdx} onChange={(e) => set({ stageCylIdx: +e.target.value })}>{CYLINDERS.map((c, i) => <option key={c.name} value={i}>{c.name.split(' (')[0]}</option>)}</select></div>
            <div><label>{t.startPressure(u)}</label><NumInput min={0} value={u.pressureN(stageBar)} onChange={(v) => set({ stageBar: u.toBar(v) })} /></div>
          </div>
          <label>{t.penStageGas}</label>
          <select value={s.stageGasIdx} onChange={(e) => set({ stageGasIdx: e.target.value === 'bottom' ? 'bottom' : +e.target.value })}>
            <option value="bottom">{t.penStageGasBottom}</option>
            {stageList.map((g, i) => <option key={gasName(g)} value={i}>{gasName(g)}</option>)}
          </select>
          {decoStages.length > 0 && (
            <>
              <label>{t.penDecoStages}</label>
              <table>
                <thead><tr><th>{t.gas}</th><th>{t.cylinder}</th><th className="num">{t.penDecoNeed(u)}</th><th className="num">{t.minFill}</th></tr></thead>
                <tbody>{decoStages.map((d) => <tr key={d.name}><td>{d.name}</td><td>{d.suggestedCylinder.name.split(' (')[0]}</td><td className="num">{vol0(d.litresWithReserve)}</td><td className={`num ${d.fits ? '' : 'bad'}`}>{u.pressure(Math.ceil(d.barNeeded / 10) * 10)}</td></tr>)}</tbody>
              </table>
              <div className="small">{t.penDecoStagesNote}</div>
            </>
          )}
          <div className="row">
            <div><label>{t.penStageRule}</label>
              <select value={s.stageRule} onChange={(e) => set({ stageRule: e.target.value as StageRule })}>
                <option value="halfPlus">{t.penRuleHalfPlus}</option><option value="thirds">{t.penRuleThirds}</option>
              </select></div>
            <div><label>{t.penStageReserve(u)}</label><NumInput min={0} value={u.pressureN(s.stageReserveBar)} onChange={(v) => set({ stageReserveBar: u.toBar(v) })} /></div>
          </div>
          <div className="small" style={{ marginTop: 8 }}>{t.penStageNote}</div>
        </section>
      </>
    );
  }

  // ---------- right column ----------
  if (!plan) return <section className="panel pen"><h2>{t.penPlan}</h2><div className="small">{t.msg({ code: 'penNoTeam', params: {} }, u)}</div></section>;
  const stops = stopTable(plan.deco);
  const limitingPlan = plan.members.find((m) => m.member.id === plan.limiting.id) ?? plan.members[0];
  const evText = penEventText(t, u, limitingPlan.turnBar);
  const allMsgs = [...plan.blockers.map((m) => ({ text: t.msg(m, u), bad: true })), ...plan.warnings.map((m) => ({ text: t.msg(m, u), bad: false }))];

  return (
    <>
      <section className="panel pen">
        <h2>{t.penPlan}</h2>
        <div className={`verdict ${plan.overridden ? 'bad brave' : !plan.feasible ? 'bad' : plan.unsupported ? 'unsupported' : 'ok'}`} style={{ marginBottom: 12 }}>
          <div className="icon">{plan.overridden ? '⚠' : !plan.feasible ? '✕' : plan.unsupported ? '⚠' : '✓'}</div>
          <div style={{ flex: 1 }}><div className="title">{plan.overridden ? t.penBraveActive : !plan.feasible ? t.feasibleNo : plan.unsupported ? t.penUnsupported(s.agency.toUpperCase()) : t.penFeasible}</div>
            <div className="small" style={{ color: 'inherit' }}>{t.penRuleSummary(plan.rules.fractionLabel, s.agency.toUpperCase(), u.depth(plan.rules.maxDepthM))}</div>
            {plan.blockers.some((b) => b.code === 'penTimeOverGas') && !s.brave && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {suggestedStages !== null && suggestedStages > s.stageCount && (
                  <button className="btn" style={{ background: '#fff', color: '#7f1d1d', fontWeight: 600 }} onClick={() => set({ stageCount: suggestedStages })}>
                    {t.penFillStages(suggestedStages, CYLINDERS[s.stageCylIdx].name.split(' (')[0], gasName(input.stages[0]?.gas ?? input.bottomGas))}
                  </button>
                )}
                <button className="btn brave" style={{ marginTop: 0 }} onClick={() => { if (window.confirm(t.penBraveConfirm)) set({ brave: true }); }}>{t.penBrave}</button>
              </div>
            )}
            {s.brave && <button className="btn" style={{ marginTop: 8 }} onClick={() => set({ brave: false })}>{t.penBraveRevert}</button>}
          </div>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="v">{u.pressureN(limitingPlan.turnBar)}</div><div className="l">{t.penKpiTurn(u)}</div></div>
          <div className="kpi"><div className="v">{fmt(plan.penetrationMinutes)}</div><div className="l">{t.penKpiPenMin}</div></div>
          <div className="kpi"><div className="v">{fmt(plan.maxPenetrationMinutes)}</div><div className="l">{t.penKpiMaxPen}</div></div>
          <div className="kpi"><div className="v">{u.depthN(plan.penetrationDistanceM)}</div><div className="l">{t.penKpiDistance(u)}</div></div>
          <div className="kpi"><div className="v">{fmt(plan.bottomTime)}</div><div className="l">{t.penKpiBottom}</div></div>
          <div className="kpi"><div className="v">{fmt(plan.deco.decoTime)}</div><div className="l">{t.decoTotal}</div></div>
          <div className="kpi"><div className="v">{fmt(plan.deco.runtime)}</div><div className="l">{t.runtime}</div></div>
        </div>
        <ProfileChart plan={plan.deco} unitLabel={lang === 'hu' ? 'perc' : 'min'} depthLabel={u.d} depthScale={u.sys === 'metric' ? 1 : 3.28084} />
        {allMsgs.length > 0 && <ul className="warnings">{allMsgs.map((w, i) => <li key={i} className={w.bad ? 'bad' : ''}>{w.text}</li>)}</ul>}
      </section>

      <section className="panel pen">
        <h2>{t.penGasMatching}</h2>
        <table>
          <thead><tr><th>{t.penDiver}</th><th>{t.gas}</th><th className="num">{t.penStart(u)}</th><th className="num">{t.penTurn(u)}</th><th className="num">{t.penPenGas(u)}</th><th className="num">{t.penExitLeft(u)}</th><th className="num">{t.penSharedLeft(u)}</th></tr></thead>
          <tbody>
            {plan.members.map((m) => (
              <tr key={m.member.id}>
                <td>{m.member.name}{m.member.id === plan.limiting.id ? <span className="tag pen" style={{ marginLeft: 6 }}>{t.penLimiting}</span> : null}</td>
                <td>{gasName(m.member.gas ?? input.bottomGas)}</td>
                <td className="num">{u.pressureN(m.member.startBar)}</td>
                <td className="num"><b>{u.pressureN(m.turnBar)}</b></td>
                <td className="num">{vol(m.penetrationLitres)}</td>
                <td className="num">{vol(m.exitRemainingLitres)}</td>
                <td className={`num ${m.sharedExitRemainingLitres < 0 ? 'bad' : 'ok'}`}>{vol(m.sharedExitRemainingLitres)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small" style={{ marginTop: 8 }}>{t.penMatchingNote} {t.penDecoGasNote(gasName(plan.decoGas), plan.members[0].member.cylinder.name.split(' (')[0])}</div>
      </section>

      {plan.stages.length > 0 && (
        <section className="panel pen">
          <h2>{t.penStagePlan}</h2>
          <table>
            <thead><tr><th>#</th><th>{t.cylinder}</th><th>{t.gas}</th><th className="num">{t.penDropAt(u)}</th><th className="num">{t.penUsableIn(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.penDropDistance(u)}</th></tr></thead>
            <tbody>
              {plan.stages.map((st, i) => {
                const cum = plan.stages.slice(0, i + 1).reduce((a, x) => a + x.minutes, 0);
                return <tr key={i}><td>{i + 1}</td><td>{st.stage.cylinder.name.split(' (')[0]}</td><td>{gasName(st.stage.gas)}</td><td className="num"><b>{u.pressureN(st.dropBar)}</b></td><td className="num">{vol(st.usableInLitres)}</td><td className="num">{fmt(st.minutes)}</td><td className="num">{u.depthN(cum * s.swimSpeed)}</td></tr>;
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="panel pen">
        <h2>{t.stops}</h2>
        {stops.length === 0 ? <div className="small">{t.noStops(std.id === 'gue', u)}</div> : (
          <table>
            <thead><tr><th className="num">{t.depth(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.runtimeCol}</th><th>{t.gas}</th></tr></thead>
            <tbody>{stops.map((st, i) => <tr key={i}><td className="num">{u.stopDepthN(st.depth)}</td><td className="num">{st.minutes}</td><td className="num">{Math.round(st.runtime + (plan.bottomTime - plan.deco.bottomTime))}</td><td>{st.gas}</td></tr>)}</tbody>
          </table>
        )}
        <div className="small" style={{ marginTop: 8 }}>{t.penDecoNote(u.depth(input.maxDepth))}</div>
      </section>

      <section className="panel pen">
        <h2>{t.itinerary}</h2>
        <table className="itinerary">
          <thead><tr><th className="num">{t.itTime}</th><th className="num">{t.itDepth(u)}</th><th>{t.itAction}</th><th>{t.itGas}</th></tr></thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i} className={`ev-${e.kind === 'switch' || e.kind === 'stageDrop' || e.kind === 'stagePickup' ? 'switch' : e.kind === 'turn' ? 'turn' : e.kind === 'decoStop' ? 'stop' : e.kind}`}>
                <td className="num">{Math.round(e.runtime)}</td>
                <td className="num">{e.kind === 'decoStop' || e.kind === 'switch' ? u.stopDepthN(e.depth) : u.depthN(e.depth)}</td>
                <td>{evText(e)}</td>
                <td>{gasName(e.gas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

/** Text for a penetration itinerary event (shared by the screen and the printed sheet). */
export function penEventText(t: Dict, u: Units, turnBar: number) {
  return (e: PenEvent): string => {
    switch (e.kind) {
      case 'start': return t.penEvStart(gasName(e.gas));
      case 'enter': return t.penEvEnter;
      case 'stageDrop': return t.penEvDrop(e.note ?? '');
      case 'turn': return t.penEvTurn(u.pressure(turnBar));
      case 'stagePickup': return t.penEvPickup(e.note ?? '');
      case 'exit': return t.penEvExit;
      case 'switch': return t.itSwitch(e.fromGas ? gasName(e.fromGas) : '—', gasName(e.gas), u, e.depth, Math.round(e.duration ?? 0));
      case 'decoStop': return t.itStop(Math.round(e.duration ?? 0), Math.round(e.until ?? 0), u, e.depth);
      case 'surface': return t.itSurface;
    }
  };
}
