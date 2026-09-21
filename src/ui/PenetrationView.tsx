import { useMemo, useState } from 'react';
import {
  Agency, CYLINDERS, DecoGasSpec, Environment, Flow, Gas, GasStandard, PenEvent, PlanSettings, StageRule, TeamMember,
  gasName, penetrationItinerary, planPenetration, stagesNeeded, stopTable, planConsumption, decoGasRequirements, DecoGasRequirement, Cylinder, defaultSwitchStep,
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
  config: 'backmount' | 'sidemount'; smCylIdx: number; smStep: number | null;
  shared: { cylIdx: number; startBar: number; sac: number };
  members: { name: string; gasIdx: number | 'team'; startBar: number; sac: number; config: 'team' | 'backmount' | 'sidemount'; cylIdx: number; smCylIdx: number }[];
  bottomGasIdx: number | 'auto';
  stageCount: number; stageCylIdx: number; stageBar: number | null; stageRule: StageRule; stageReserveBar: number; stageGasIdx: number | 'bottom';
  decoOn: Record<string, boolean>;
}

export const S80_IDX = CYLINDERS.findIndex((c) => c.name.startsWith('AL80'));
export const SM_CYLINDERS = CYLINDERS.filter((c) => c.name.startsWith('Single') || c.name.startsWith('AL80'));

export const defaultPenState = (): PenState => ({
  agency: 'gue', environment: 'cave', flow: 'outflow',
  avgDepth: 18, maxDepth: 24, swimSpeed: 15, descentMinutes: 1, plannedMinutes: 20, brave: false,
  teamSize: 2, sameForAll: true,
  config: 'backmount', smCylIdx: CYLINDERS.findIndex((c) => c.name.startsWith('Single 12')), smStep: null,
  shared: { cylIdx: 0, startBar: 200, sac: 18 },
  members: [1, 2, 3, 4].map((i) => ({ name: `B${i}`, gasIdx: 'team' as const, startBar: 200, sac: 18, config: 'team' as const, cylIdx: 0, smCylIdx: CYLINDERS.findIndex((c) => c.name.startsWith('Single 12')) })),
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
    const smSingle = SM_CYLINDERS[s.smCylIdx] ?? SM_CYLINDERS[0];
    const cylinder: Cylinder = s.config === 'sidemount'
      ? { name: `2× ${smSingle.name.split(' (')[0]}`, volumeL: smSingle.volumeL * 2, workingPressureBar: smSingle.workingPressureBar }
      : (CYLINDERS[s.shared.cylIdx] ?? CYLINDERS[0]); // one cylinder type for the whole team; divers differ by gas, pressure and SAC
    const teamSm = s.config === 'sidemount' ? { singleVolumeL: smSingle.volumeL, stepBar: s.smStep ?? undefined } : undefined;
    const team: TeamMember[] = Array.from({ length: s.teamSize }, (_, i) => {
      if (s.sameForAll) return { id: String(i), name: `B${i + 1}`, cylinder, startBar: s.shared.startBar, sacLpm: s.shared.sac, sidemount: teamSm };
      const m = s.members[i];
      const g = typeof m.gasIdx === 'number' && bottomList[m.gasIdx] ? bottomList[m.gasIdx].gas : bottomGas;
      // per-diver cylinder configuration: team default, own backmount cylinder, or own sidemount pair
      let cyl: Cylinder = cylinder; let sm = teamSm;
      if (m.config === 'backmount') { cyl = CYLINDERS[m.cylIdx] ?? CYLINDERS[0]; sm = undefined; }
      if (m.config === 'sidemount') { const sg = SM_CYLINDERS[m.smCylIdx] ?? SM_CYLINDERS[0]; cyl = { name: `2× ${sg.name.split(' (')[0]}`, volumeL: sg.volumeL * 2, workingPressureBar: sg.workingPressureBar }; sm = { singleVolumeL: sg.volumeL, stepBar: s.smStep ?? undefined }; }
      return { id: String(i), name: m.name, cylinder: cyl, startBar: m.startBar, sacLpm: m.sac, gas: g, sidemount: sm };
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
    const decoNames = new Set(decoGases.map((d) => gasName(d.gas)));
    const decoStages: DecoGasRequirement[] = plan ? decoGasRequirements(planConsumption(plan.deco, sac, sac), plan.decoGas).filter((d) => decoNames.has(d.name)) : [];
    const unusedDecoGases = decoGases.map((d) => gasName(d.gas)).filter((n) => !decoStages.some((d) => d.name === n));
    // what to bring, per diver: back cylinder(s) by gas, bottom stages, deco stages
    const packing: { count: number; cylinder: string; gas: string; fillBar: number; role: 'back' | 'stage' | 'deco'; divers?: string }[] = [];
    if (plan) {
      const byKey = new Map<string, { names: string[]; bar: number; cyl: string; gas: string }>();
      for (const m of team) { const g = gasName(m.gas ?? bottomGas); const k = `${m.cylinder.name}|${g}`; const e = byKey.get(k) ?? { names: [], bar: 0, cyl: m.cylinder.name, gas: g }; e.names.push(m.name); e.bar = Math.max(e.bar, m.startBar); byKey.set(k, e); }
      for (const e of byKey.values()) packing.push({ count: e.names.length, cylinder: e.cyl, gas: e.gas, fillBar: e.bar, role: 'back', divers: byKey.size > 1 ? e.names.join(', ') : undefined });
      if (s.stageCount > 0) packing.push({ count: s.stageCount * team.length, cylinder: stageTemplate.cylinder.name, gas: gasName(stageTemplate.gas), fillBar: stageBar, role: 'stage' });
      for (const d of decoStages) packing.push({ count: team.length, cylinder: d.suggestedCylinder.name, gas: d.name, fillBar: Math.ceil(d.barNeeded / 10) * 10, role: 'deco' });
    }
    return { input, plan, events, bottomGas, autoBottom: auto, stageTemplate, stageBar, suggestedStages, decoStages, unusedDecoGases, bottomList, stageList, packing, teamSize: team.length, cylinder };
  }, [s, std, settings]);
}

export function PenetrationView({ t, u, lang, std, settings, side, state: s, setState }: Props) {
  const set = (patch: Partial<PenState>) => setState({ ...s, ...patch });
  const { input, plan, events, autoBottom, stageBar, suggestedStages, decoStages, unusedDecoGases, bottomList, stageList, packing, teamSize, cylinder } = usePenetrationPlan(s, std, settings);
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
          <label>{t.penSoloOrTeam}</label>
          <div className="seg" style={{ display: 'flex', marginBottom: 4 }}>
            <button style={{ flex: 1 }} className={s.teamSize > 1 ? 'on' : ''} onClick={() => set({ teamSize: Math.max(2, s.teamSize) })}>{t.penTeam}</button>
            <button style={{ flex: 1 }} className={s.teamSize === 1 ? 'on' : ''} onClick={() => set({ teamSize: 1 })}>{t.penSolo}</button>
          </div>
          <div className="row">
            <div><label>{t.penTeamSize}</label>
              <select value={s.teamSize} disabled={s.teamSize === 1} onChange={(e) => set({ teamSize: +e.target.value })}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label>{t.penSameForAll}</label>
              <div className="seg" style={{ display: 'flex' }}>
                <button style={{ flex: 1 }} className={s.sameForAll ? 'on' : ''} onClick={() => set({ sameForAll: true })}>{t.yes}</button>
                <button style={{ flex: 1 }} className={!s.sameForAll ? 'on' : ''} onClick={() => set({ sameForAll: false })}>{t.no}</button>
              </div></div>
          </div>
          <label>{t.config}</label>
          <div className="seg" style={{ display: 'flex' }}>
            <button style={{ flex: 1 }} className={s.config === 'backmount' ? 'on' : ''} onClick={() => set({ config: 'backmount' })}>{t.configBackmount}</button>
            <button style={{ flex: 1 }} className={s.config === 'sidemount' ? 'on' : ''} onClick={() => set({ config: 'sidemount' })}>{t.configSidemount}</button>
          </div>
          {s.config === 'backmount' ? (
            <>
              <label>{t.backCylinder}</label>
              <select value={s.shared.cylIdx} onChange={(e) => set({ shared: { ...s.shared, cylIdx: +e.target.value } })}>{CYLINDERS.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}</select>
            </>
          ) : (
            <>
              <label>{t.smCylinder}</label>
              <select value={s.smCylIdx} onChange={(e) => set({ smCylIdx: +e.target.value })}>{SM_CYLINDERS.map((c, i) => <option key={c.name} value={i}>2× {c.name}</option>)}</select>
              <label>{t.smStep(u)}</label>
              <NumInput min={u.pressureN(5)} value={u.pressureN(s.smStep ?? defaultSwitchStep(s.shared.startBar))} onChange={(v) => set({ smStep: u.toBar(v) })} />
              <div className="small" style={{ marginTop: 6 }}>{t.smSwitchNote}</div>
            </>
          )}
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
                <div><label>{t.config}</label>
                  <select value={m.config} onChange={(e) => { const ms = [...s.members]; ms[i] = { ...m, config: e.target.value as 'team' | 'backmount' | 'sidemount' }; set({ members: ms }); }}>
                    <option value="team">{t.penConfigTeam}</option><option value="backmount">{t.configBackmount}</option><option value="sidemount">{t.configSidemount}</option>
                  </select></div>
                <div><label>{t.cylinder}</label>
                  {m.config === 'sidemount' ? (
                    <select value={m.smCylIdx} onChange={(e) => { const ms = [...s.members]; ms[i] = { ...m, smCylIdx: +e.target.value }; set({ members: ms }); }}>{SM_CYLINDERS.map((c, j) => <option key={c.name} value={j}>2× {c.name.split(' (')[0]}</option>)}</select>
                  ) : m.config === 'backmount' ? (
                    <select value={m.cylIdx} onChange={(e) => { const ms = [...s.members]; ms[i] = { ...m, cylIdx: +e.target.value }; set({ members: ms }); }}>{CYLINDERS.map((c, j) => <option key={c.name} value={j}>{c.name.split(' (')[0]}</option>)}</select>
                  ) : (
                    <select disabled value="team"><option value="team">{cylinder.name.split(' (')[0]}</option></select>
                  )}</div>
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
          <label>{t.penStagesCarried}</label>
          {(s.stageCount === 0 && decoStages.length === 0) ? <div className="small">{t.penNoStages}</div> : (
            <table>
              <thead><tr><th className="num">#</th><th>{t.cylinder}</th><th>{t.gas}</th><th className="num">{t.minFill}</th><th>{t.role}</th></tr></thead>
              <tbody>
                {s.stageCount > 0 && <tr><td className="num">{s.stageCount}×</td><td>{(CYLINDERS[s.stageCylIdx] ?? CYLINDERS[S80_IDX]).name.split(' (')[0]}</td><td>{gasName(input.stages[0]?.gas ?? input.bottomGas)}</td><td className="num">{u.pressure(stageBar)}</td><td>{t.penStageShort}</td></tr>}
                {decoStages.map((d) => <tr key={d.name}><td className="num">1×</td><td>{d.suggestedCylinder.name.split(' (')[0]}</td><td>{d.name}</td><td className="num">{u.pressure(Math.ceil(d.barNeeded / 10) * 10)}</td><td>{t.roleDecoShort}</td></tr>)}
                {unusedDecoGases.map((n) => <tr key={n} className="muted"><td className="num">–</td><td colSpan={4} className="small">{n}: {t.penDecoNotNeeded}</td></tr>)}
              </tbody>
            </table>
          )}
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
  const anySm = plan.members.some((m) => !!m.sidemount);
  const allMsgs = [...plan.blockers.map((m) => ({ text: t.msg(m, u), bad: true })), ...plan.warnings.map((m) => ({ text: t.msg(m, u), bad: false }))];

  return (
    <>
      <section className="panel pen">
        <h2>{t.penPlan}</h2>
        <div className={`verdict ${plan.overridden ? 'bad brave' : !plan.feasible ? 'bad' : plan.unsupported ? 'unsupported' : 'ok'}`} style={{ marginBottom: 12 }}>
          <div className="icon">{plan.overridden ? '⚠' : !plan.feasible ? '✕' : plan.unsupported ? '⚠' : '✓'}</div>
          <div style={{ flex: 1 }}><div className="title">{plan.blockers.some((b) => b.code === 'penSharedExitShort') ? t.penTeamDies : plan.overridden ? t.penBraveActive : !plan.feasible ? t.feasibleNo : plan.unsupported ? t.penUnsupported(s.agency.toUpperCase()) : t.penFeasible}</div>
            {plan.overridden && plan.blockers.some((b) => b.code === 'penSharedExitShort') && <div className="small" style={{ color: 'inherit', fontWeight: 600 }}>{t.penBraveActive}</div>}
            <div className="small" style={{ color: 'inherit' }}>{t.penRuleSummary(plan.rules.fractionLabel, s.agency.toUpperCase(), u.depth(plan.rules.maxDepthM))}{s.teamSize === 1 ? ` ${t.penSoloNote}` : ''}</div>
            {plan.blockers.some((b) => b.code === 'penTimeOverGas') && suggestedStages !== null && suggestedStages > s.stageCount && (
              <button className="btn" style={{ marginTop: 8, background: '#fff', color: '#7f1d1d', fontWeight: 600 }} onClick={() => set({ stageCount: suggestedStages })}>
                {t.penFillStages(suggestedStages, CYLINDERS[s.stageCylIdx].name.split(' (')[0], gasName(input.stages[0]?.gas ?? input.bottomGas))}
              </button>
            )}
          </div>
        </div>
        <div className="brave-row">
          <span className="small">{t.penBraveLabel}</span>
          <div className="seg" role="radiogroup">
            <button className={!s.brave ? 'on' : ''} onClick={() => set({ brave: false })}>{t.penBraveOff}</button>
            <button className={s.brave ? 'on brave' : ''} onClick={() => { if (s.brave) return; if (window.confirm(t.penBraveConfirm)) set({ brave: true }); }}>{t.penBrave}</button>
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
          <thead><tr><th>{t.penDiver}</th><th>{t.gas}</th><th className="num">{t.penStart(u)}</th><th className="num">{t.penTurn(u)}</th><th className="num">{t.penPenGas(u)}</th><th className="num">{t.penExitLeft(u)}</th><th className="num">{t.penSharedLeft(u)}</th><th>{t.cylinder}</th>{anySm && <th className="num">{t.smAtTurn(u)}</th>}{anySm && <th className="num">{t.smLost(u)}</th>}</tr></thead>
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
                <td>{m.member.cylinder.name.split(' (')[0]}</td>
                {anySm && <td className="num">{m.sidemount ? `${u.pressureN(m.sidemount.leftBar)} / ${u.pressureN(m.sidemount.rightBar)}` : '—'}</td>}
                {anySm && <td className={`num ${m.sidemount && m.sidemount.lostCylinderShortLitres > 0 ? 'bad' : 'ok'}`}>{m.sidemount ? vol(m.sidemount.lostCylinderShortLitres) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small" style={{ marginTop: 8 }}>{t.penMatchingNote} {t.penDecoGasNote(gasName(plan.decoGas), plan.members[0].member.cylinder.name.split(' (')[0])}</div>
      </section>

      {(plan.stages.length > 0 || decoStages.length > 0 || unusedDecoGases.length > 0) && (
        <section className="panel pen">
          <h2>{t.penStagePlan}</h2>
          {plan.stages.length > 0 && (
            <>
              <div className="small" style={{ marginBottom: 4 }}>{t.penBottomStages}</div>
              <table>
                <thead><tr><th>#</th><th>{t.cylinder}</th><th>{t.gas}</th><th className="num">{t.penDropAt(u)}</th><th className="num">{t.penUsableIn(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.penDropDistance(u)}</th></tr></thead>
                <tbody>
                  {plan.stages.map((st, i) => {
                    const cum = plan.stages.slice(0, i + 1).reduce((a, x) => a + x.minutes, 0);
                    return <tr key={i}><td>{i + 1}</td><td>{st.stage.cylinder.name.split(' (')[0]}</td><td>{gasName(st.stage.gas)}</td><td className="num"><b>{u.pressureN(st.dropBar)}</b></td><td className="num">{vol(st.usableInLitres)}</td><td className="num">{fmt(st.minutes)}</td><td className="num">{u.depthN(cum * s.swimSpeed)}</td></tr>;
                  })}
                </tbody>
              </table>
            </>
          )}
          {(decoStages.length > 0 || unusedDecoGases.length > 0) && (
            <>
              <div className="small" style={{ margin: '10px 0 4px' }}>{t.penDecoStages}</div>
              <table>
                <thead><tr><th>{t.gas}</th><th>{t.cylinder}</th><th className="num">{t.penDecoNeed(u)}</th><th className="num">{t.minFill}</th><th>{t.penDropWhere}</th></tr></thead>
                <tbody>
                  {decoStages.map((d) => <tr key={d.name}><td>{d.name}</td><td>{d.suggestedCylinder.name.split(' (')[0]}</td><td className="num">{vol0(d.litresWithReserve)}</td><td className={`num ${d.fits ? '' : 'bad'}`}><b>{u.pressure(Math.ceil(d.barNeeded / 10) * 10)}</b></td><td>{t.penDropEntrance}</td></tr>)}
                  {unusedDecoGases.map((n) => <tr key={n} className="muted"><td>{n}</td><td colSpan={4} className="small">{t.penDecoNotNeeded}</td></tr>)}
                </tbody>
              </table>
              <div className="small" style={{ marginTop: 6 }}>{t.penDecoStagesNote}</div>
            </>
          )}
        </section>
      )}

      <section className="panel pen">
        <h2>{t.packing} · {t.penTeamSize.toLowerCase()} {teamSize}</h2>
        <div className="pack">
          {packing.map((p, i) => (
            <div className="pack-item" key={i}>
              <div className={`count ${p.role === 'back' ? '' : 'deco'}`}>{p.count}×</div>
              <div>
                <div className="t">{p.cylinder}</div>
                <div className="s">{p.gas} · {p.role === 'back' ? t.roleBackShort : p.role === 'stage' ? t.penStageShort : t.roleDecoShort}{p.divers ? ` · ${p.divers}` : ''}{p.role === 'back' ? '' : ` · ${t.penPerTeam(teamSize)}`}</div>
              </div>
              <div className="fill">{u.pressure(p.fillBar)}<small>{p.role === 'back' ? t.startPressure(u) : t.minFill}</small></div>
            </div>
          ))}
        </div>
      </section>

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
              <tr key={i} className={`ev-${e.kind === 'switch' || e.kind === 'stageDrop' || e.kind === 'stagePickup' ? 'switch' : e.kind === 'turn' ? 'turn' : e.kind === 'decoStop' ? 'stop' : e.kind === 'regSwitch' ? 'reg' : e.kind}`}>
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
      case 'regSwitch': { const [to, bar] = (e.note ?? 'L|0').split('|'); return t.smEvSwitch(to, u.pressure(Math.round(Number(bar)))); }
      case 'surface': return t.itSurface;
    }
  };
}
