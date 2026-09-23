import { askConfirm } from './pdf';
import { useMemo, useState } from 'react';
import {
  Agency, CYLINDERS, DecoGasSpec, Environment, Flow, Gas, GasStandard, PenEvent, PlanSettings, StageRule, TeamMember,
  gasName, penetrationItinerary, planPenetration, stagesNeeded, stopTable, planConsumption, decoGasRequirements, DecoGasRequirement, Cylinder, defaultSwitchStep,
} from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { Card, Chevron, Chip, KV, Label, Note, NumRow, Primary, ProfileCard, Secondary, Seg, SelectRow, Stat, Stats, Stepper, StopRows, Timeline, Toggle, Verdict, Warnings } from './kit';

interface Props {
  t: Dict; u: Units; lang: 'hu' | 'en'; std: GasStandard; settings: Partial<PlanSettings>;
  tab: 'setup' | 'team' | 'kit' | 'deco';
  state: PenState; setState: (s: PenState) => void;
  onMatch: () => void; onExport: () => void;
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

export function PenetrationView({ t, u, lang, std, settings, tab, state: s, setState, onMatch, onExport }: Props) {
  const set = (patch: Partial<PenState>) => setState({ ...s, ...patch });
  const { input, plan, events, autoBottom, stageBar, suggestedStages, decoStages, unusedDecoGases, bottomList, stageList, packing, teamSize, cylinder } = usePenetrationPlan(s, std, settings);
  const vol0 = (l: number) => (u.volumeN(l)).toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: u.sys === 'metric' ? 0 : 1 });
  const fmt = (v: number, d = 0) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const vol = (l: number) => fmt(u.volumeN(l), u.sys === 'metric' ? 0 : 1);
  const [openDiver, setOpenDiver] = useState<number | null>(null);
  const cylShort = (n: string) => n.split(' (')[0];
  const setMember = (i: number, patch: Partial<PenState['members'][number]>) => { const ms = [...s.members]; ms[i] = { ...ms[i], ...patch }; set({ members: ms }); };

  if (tab === 'setup') {
    const team = input.team;
    return (
      <>
        <Label>{t.penEnvironment}</Label>
        <Card className="list">
          <SelectRow label={t.penType} value={s.environment} onChange={(v) => set({ environment: v, flow: v === 'cave' ? 'outflow' : 'none' })}
            options={[{ v: 'cave' as Environment, l: t.penCave }, { v: 'mine' as Environment, l: t.penMine }, { v: 'wreck' as Environment, l: t.penWreck }]} />
          <SelectRow label={t.penAgency} value={s.agency} onChange={(a) => set({ agency: a, stageRule: a === 'gue' ? 'halfPlus' : 'thirds' })}
            options={[{ v: 'gue' as Agency, l: 'GUE' }, { v: 'tdi' as Agency, l: 'TDI' }, { v: 'iantd' as Agency, l: 'IANTD' }]} />
          <SelectRow label={t.penFlow} value={s.flow} onChange={(v) => set({ flow: v })}
            options={[{ v: 'outflow' as Flow, l: t.penFlowOut }, { v: 'none' as Flow, l: t.penFlowNone }, { v: 'siphon' as Flow, l: t.penFlowSiphon }]} />
        </Card>
        <Stepper label={t.penMaxDepth(u)} min={u.depthN(3)} max={u.depthN(60)} value={u.depthN(s.maxDepth)} onChange={(v) => set({ maxDepth: u.toM(v) })} />
        <Stepper label={t.penPlannedTime} min={0} max={300} step={5} value={s.plannedMinutes} onChange={(v) => set({ plannedMinutes: v })} />
        <Card className="list">
          <NumRow label={t.penAvgDepth(u)} min={u.depthN(3)} max={u.depthN(60)} value={u.depthN(s.avgDepth)} onChange={(v) => set({ avgDepth: u.toM(v) })} />
          <NumRow label={t.penDescent} min={0} max={30} value={s.descentMinutes} onChange={(v) => set({ descentMinutes: v })} />
          <NumRow label={t.penSwimSpeed(u)} min={1} value={u.depthN(s.swimSpeed)} onChange={(v) => set({ swimSpeed: u.toM(v) })} />
          <SelectRow label={t.bottomGas} value={s.bottomGasIdx} onChange={(v) => set({ bottomGasIdx: v })}
            options={[{ v: 'auto' as const, l: t.autoBottomGas(autoBottom?.gas.name ?? '—') }, ...bottomList.map((g, i) => ({ v: i, l: g.gas.name ?? '' }))]} />
          <div className="row stack">
            <span className="row-l">{t.decoGases}</span>
            <div className="tchips">
              {std.decoGases.map((d) => {
                const on = !!s.decoOn[d.gas.name!];
                return <Toggle key={d.gas.name} on={on} onClick={() => set({ decoOn: { ...s.decoOn, [d.gas.name!]: !on } })}>{d.gas.name} · {u.stopDepth(d.switchDepth)}</Toggle>;
              })}
            </div>
          </div>
        </Card>

        <Label>{t.teamSizeLabel(s.teamSize)}</Label>
        <Card className="list">
          <div className="row stack">
            <span className="row-l">{t.penSoloOrTeam}</span>
            <Seg value={s.teamSize > 1} onChange={(team) => set({ teamSize: team ? Math.max(2, s.teamSize) : 1 })} options={[{ v: true, l: t.penTeam }, { v: false, l: t.penSolo }]} />
          </div>
          {s.teamSize > 1 && <SelectRow label={t.penTeamSize} value={s.teamSize} onChange={(v) => set({ teamSize: v })} options={[2, 3, 4].map((n) => ({ v: n, l: String(n) }))} />}
          <div className="row stack">
            <span className="row-l">{t.penSameForAll}</span>
            <Seg value={s.sameForAll} onChange={(v) => set({ sameForAll: v })} options={[{ v: true, l: t.yes }, { v: false, l: t.no }]} />
          </div>
          <div className="row stack">
            <span className="row-l">{t.config}</span>
            <Seg value={s.config} onChange={(v) => set({ config: v })} options={[{ v: 'backmount' as const, l: t.configBackmount }, { v: 'sidemount' as const, l: t.configSidemount }]} />
          </div>
          {s.config === 'backmount' ? (
            <SelectRow label={t.backCylinder} value={s.shared.cylIdx} onChange={(v) => set({ shared: { ...s.shared, cylIdx: v } })} options={CYLINDERS.map((c, i) => ({ v: i, l: c.name }))} />
          ) : (
            <>
              <SelectRow label={t.smCylinder} value={s.smCylIdx} onChange={(v) => set({ smCylIdx: v })} options={SM_CYLINDERS.map((c, i) => ({ v: i, l: `2× ${c.name}` }))} />
              <NumRow label={t.smStep(u)} min={u.pressureN(5)} value={u.pressureN(s.smStep ?? defaultSwitchStep(s.shared.startBar))} onChange={(v) => set({ smStep: u.toBar(v) })} />
              <div className="row info">{t.smSwitchNote}</div>
            </>
          )}
          {s.sameForAll && (
            <>
              <NumRow label={t.startPressure(u)} min={0} value={u.pressureN(s.shared.startBar)} onChange={(v) => set({ shared: { ...s.shared, startBar: u.toBar(v) } })} />
              <NumRow label={t.penSac(u)} min={0} step={u.sacStep} decimals={u.sys === 'metric' ? 0 : 2} value={u.sacN(s.shared.sac)} onChange={(v) => set({ shared: { ...s.shared, sac: u.toLpm(v) } })} />
            </>
          )}
        </Card>
        {team.map((tm, i) => {
          const m = s.members[i];
          const editable = !s.sameForAll;
          const open = editable && openDiver === i;
          return (
            <Card className="list diver" key={i}>
              <button className="row diver-head" disabled={!editable} aria-expanded={open} onClick={() => setOpenDiver(open ? null : i)}>
                <span className="badge">{tm.name.slice(0, 3) || `B${i + 1}`}</span>
                <span className="diver-txt"><span className="diver-cyl">{cylShort(tm.cylinder.name)}</span><span className="diver-sub">{t.diverSummary(gasName(tm.gas ?? input.bottomGas), u.pressure(tm.startBar))}</span></span>
                {editable && <Chevron open={open} />}
              </button>
              {open && (
                <>
                  <label className="row num"><span className="row-l">{t.penDiver} {i + 1}</span><span className="row-field wide"><input value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} /></span></label>
                  <SelectRow label={t.bottomGas} value={m.gasIdx} onChange={(v) => setMember(i, { gasIdx: v })}
                    options={[{ v: 'team' as const, l: t.penGasTeam }, ...bottomList.map((g, j) => ({ v: j, l: g.gas.name ?? '' }))]} />
                  <SelectRow label={t.config} value={m.config} onChange={(v) => setMember(i, { config: v })}
                    options={[{ v: 'team' as const, l: t.penConfigTeam }, { v: 'backmount' as const, l: t.configBackmount }, { v: 'sidemount' as const, l: t.configSidemount }]} />
                  {m.config === 'sidemount' ? (
                    <SelectRow label={t.cylinder} value={m.smCylIdx} onChange={(v) => setMember(i, { smCylIdx: v })} options={SM_CYLINDERS.map((c, j) => ({ v: j, l: `2× ${cylShort(c.name)}` }))} />
                  ) : m.config === 'backmount' ? (
                    <SelectRow label={t.cylinder} value={m.cylIdx} onChange={(v) => setMember(i, { cylIdx: v })} options={CYLINDERS.map((c, j) => ({ v: j, l: cylShort(c.name) }))} />
                  ) : (
                    <SelectRow label={t.cylinder} value="team" disabled onChange={() => undefined} options={[{ v: 'team', l: cylShort(cylinder.name) }]} />
                  )}
                  <NumRow label={t.startPressure(u)} min={0} value={u.pressureN(m.startBar)} onChange={(v) => setMember(i, { startBar: u.toBar(v) })} />
                  <NumRow label={t.penSac(u)} min={0} step={u.sacStep} decimals={u.sys === 'metric' ? 0 : 2} value={u.sacN(m.sac)} onChange={(v) => setMember(i, { sac: u.toLpm(v) })} />
                </>
              )}
            </Card>
          );
        })}

        <Label>{t.penStages}</Label>
        <Card className="list">
          <SelectRow label={t.penStagesPerDiver} value={s.stageCount} onChange={(v) => set({ stageCount: v })} options={[0, 1, 2, 3].map((n) => ({ v: n, l: String(n) }))} />
          <SelectRow label={t.cylinder} value={s.stageCylIdx} onChange={(v) => set({ stageCylIdx: v })} options={CYLINDERS.map((c, i) => ({ v: i, l: cylShort(c.name) }))} />
          <NumRow label={t.startPressure(u)} min={0} value={u.pressureN(stageBar)} onChange={(v) => set({ stageBar: u.toBar(v) })} />
          <SelectRow label={t.penStageGas} value={s.stageGasIdx} onChange={(v) => set({ stageGasIdx: v })}
            options={[{ v: 'bottom' as const, l: t.penStageGasBottom }, ...stageList.map((g, i) => ({ v: i, l: gasName(g) }))]} />
        </Card>
        <Note>{t.penStageNote}</Note>
        <Primary onClick={onMatch}>{t.matchTeamGas}</Primary>
      </>
    );
  }

  if (!plan) return <Verdict tone="bad" title={t.msg({ code: 'penNoTeam', params: {} }, u)} />;
  const stops = stopTable(plan.deco);
  const limitingPlan = plan.members.find((m) => m.member.id === plan.limiting.id) ?? plan.members[0];
  const evText = penEventText(t, u, limitingPlan.turnBar);
  const anySm = plan.members.some((m) => !!m.sidemount);
  const allMsgs = [...plan.blockers.map((m) => ({ text: t.msg(m, u), bad: true })), ...plan.warnings.map((m) => ({ text: t.msg(m, u), bad: false }))];
  const depthScale = u.sys === 'metric' ? 1 : 3.28084;

  if (tab === 'team') {
    const teamDies = plan.blockers.some((b) => b.code === 'penSharedExitShort');
    return (
      <>
        <Verdict tone={plan.overridden ? 'brave' : !plan.feasible ? 'bad' : plan.unsupported ? 'warn' : 'ok'} icon={plan.overridden || plan.unsupported ? '!' : undefined}
          title={teamDies ? t.penTeamDies : plan.overridden ? t.penBraveActive : !plan.feasible ? t.feasibleNo : plan.unsupported ? t.penUnsupported(s.agency.toUpperCase()) : t.penFeasible}>
          {plan.overridden && teamDies && <div><b>{t.penBraveActive}</b></div>}
          <div>{t.penRuleSummary(plan.rules.fractionLabel, s.agency.toUpperCase(), u.depth(plan.rules.maxDepthM))}{s.teamSize === 1 ? ` ${t.penSoloNote}` : ''}</div>
          {plan.blockers.some((b) => b.code === 'penTimeOverGas') && suggestedStages !== null && suggestedStages > s.stageCount && (
            <button className="v-action" onClick={() => set({ stageCount: suggestedStages })}>
              {t.penFillStages(suggestedStages, cylShort(CYLINDERS[s.stageCylIdx].name), gasName(input.stages[0]?.gas ?? input.bottomGas))}
            </button>
          )}
        </Verdict>
        <div className="hero">
          <div>
            <div className="hero-l">{t.teamTurnsAt}</div>
            <div className="hero-v">{u.pressureN(limitingPlan.turnBar)}<span> {u.p}</span></div>
          </div>
          <div className="hero-r">{t.limitedBy(limitingPlan.member.name)}</div>
        </div>
        <Card className="list">
          <div className="row stack">
            <span className="row-l">{t.penBraveLabel}</span>
            <Seg value={s.brave} onChange={async (v) => { if (!v) { set({ brave: false }); return; } if (s.brave) return; if (await askConfirm(t.penBraveConfirm)) set({ brave: true }); }}
              options={[{ v: false, l: t.penBraveOff }, { v: true, l: t.penBrave, cls: 'brave' }]} />
          </div>
        </Card>
        <Stats>
          <Stat v={fmt(plan.penetrationMinutes)} l={t.penKpiPenMin} />
          <Stat v={fmt(plan.maxPenetrationMinutes)} l={t.penKpiMaxPen} />
          <Stat v={u.depthN(plan.penetrationDistanceM)} l={t.penKpiDistance(u)} />
          <Stat v={fmt(plan.bottomTime)} l={t.penKpiBottom} />
          <Stat v={fmt(plan.deco.decoTime)} l={t.decoTotal} />
          <Stat v={fmt(plan.deco.runtime)} l={t.runtime} tone="mode" />
        </Stats>
        <Warnings items={allMsgs} />
        <Label>{t.penGasMatching}</Label>
        {plan.members.map((m) => (
          <Card className="diver-gas" key={m.member.id}>
            <div className="dg-head">
              <span className="dg-name">{m.member.name}</span>
              <span className="dg-gas">{gasName(m.member.gas ?? input.bottomGas)} · {cylShort(m.member.cylinder.name)}</span>
              {m.member.id === plan.limiting.id && <Chip kind="mode">{t.penLimiting}</Chip>}
            </div>
            <div className="cols3">
              <div><div className="c-l">{t.penStart(u)}</div><div className="c-v">{u.pressureN(m.member.startBar)}</div></div>
              <div><div className="c-l">{t.penTurn(u)}</div><div className="c-v mode">{u.pressureN(m.turnBar)}</div></div>
              <div><div className="c-l">{t.penPenGas(u)}</div><div className="c-v">{vol(m.penetrationLitres)}</div></div>
            </div>
            <div className="dg-more">
              <KV l={t.penExitLeft(u)} v={vol(m.exitRemainingLitres)} />
              <KV l={t.penSharedLeft(u)} v={vol(m.sharedExitRemainingLitres)} tone={m.sharedExitRemainingLitres < 0 ? 'bad' : 'ok'} />
              {anySm && m.sidemount && <KV l={t.smAtTurn(u)} v={`${u.pressureN(m.sidemount.leftBar)} / ${u.pressureN(m.sidemount.rightBar)}`} />}
              {anySm && m.sidemount && <KV l={t.smLost(u)} v={vol(m.sidemount.lostCylinderShortLitres)} tone={m.sidemount.lostCylinderShortLitres > 0 ? 'bad' : 'ok'} />}
            </div>
          </Card>
        ))}
        <Note>{t.penMatchingNote} {t.penDecoGasNote(gasName(plan.decoGas), cylShort(plan.members[0].member.cylinder.name))}</Note>
      </>
    );
  }

  if (tab === 'kit') {
    return (
      <>
        <Label>{t.packing} · {t.penTeamSize.toLowerCase()} {teamSize}</Label>
        <Card className="list">
          {packing.map((p, i) => (
            <div className="pack-row" key={i}>
              <span className={`badge qty ${p.role === 'back' ? '' : 'deco'}`}>{p.count}×</span>
              <span className="pack-txt"><span className="pack-name">{p.cylinder}</span>
                <span className="pack-sub">{p.gas} · {p.role === 'back' ? t.roleBackShort : p.role === 'stage' ? t.penStageShort : t.roleDecoShort}{p.divers ? ` · ${p.divers}` : ''}{p.role === 'back' ? '' : ` · ${t.penPerTeam(teamSize)}`}</span></span>
              <span className="pack-fill">{u.pressure(p.fillBar)}<small>{p.role === 'back' ? t.startPressure(u) : t.minFill}</small></span>
            </div>
          ))}
        </Card>
        {plan.stages.length > 0 && (
          <>
            <Label>{t.penStagePlan}</Label>
            <Note>{t.penBottomStages}</Note>
            <Card className="list">
              {plan.stages.map((st, i) => {
                const cum = plan.stages.slice(0, i + 1).reduce((a, x) => a + x.minutes, 0);
                return (
                  <div className="pack-row" key={i}>
                    <span className="badge qty">{i + 1}</span>
                    <span className="pack-txt"><span className="pack-name">{cylShort(st.stage.cylinder.name)} · {gasName(st.stage.gas)}</span>
                      <span className="pack-sub">{t.penUsableIn(u)}: {vol(st.usableInLitres)} · {fmt(st.minutes)} {t.minUnit} · {t.penDropDistance(u)}: {u.depthN(cum * s.swimSpeed)}</span></span>
                    <span className="pack-fill">{u.pressure(st.dropBar)}<small>{t.penDropAt(u)}</small></span>
                  </div>
                );
              })}
            </Card>
          </>
        )}
        {(decoStages.length > 0 || unusedDecoGases.length > 0) && (
          <>
            <Label>{t.penDecoStages}</Label>
            <Card className="list">
              {decoStages.map((d) => (
                <div className="pack-row" key={d.name}>
                  <span className="badge qty deco">1×</span>
                  <span className="pack-txt"><span className="pack-name">{d.name} · {cylShort(d.suggestedCylinder.name)}</span>
                    <span className="pack-sub">{t.penDecoNeed(u)}: {vol0(d.litresWithReserve)} · {t.penDropWhere}: {t.penDropEntrance}</span></span>
                  <span className={`pack-fill ${d.fits ? '' : 'bad'}`}>{u.pressure(Math.ceil(d.barNeeded / 10) * 10)}<small>{t.minFill}</small></span>
                </div>
              ))}
              {unusedDecoGases.map((n) => <div className="row info" key={n}>{n}: {t.penDecoNotNeeded}</div>)}
            </Card>
            <Note>{t.penDecoStagesNote}</Note>
          </>
        )}
        <Secondary onClick={onExport}>{t.exportChecklist}</Secondary>
      </>
    );
  }

  // deco tab
  return (
    <>
      <ProfileCard plan={plan.deco} title={t.profile} axes={t.profileAxes(u)} depthScale={depthScale} />
      <Label>{t.stops}</Label>
      {stops.length === 0 ? <Card><Note>{t.noStops(std.id === 'gue', u)}</Note></Card> : (
        <StopRows chip="mode" unit={u.d} minLabel={t.minUnit} leaveAt={t.leaveAt}
          stops={stops.map((st) => ({ depth: u.stopDepthN(st.depth), minutes: st.minutes, runtime: Math.round(st.runtime + (plan.bottomTime - plan.deco.bottomTime)), gas: st.gas }))} />
      )}
      <Note>{t.penDecoNote(u.depth(input.maxDepth))}</Note>
      <Label>{t.itinerary}</Label>
      <Timeline minLabel={t.minUnit} rows={events.map((e) => ({
        min: Math.round(e.runtime), action: evText(e),
        sub: `${e.kind === 'decoStop' || e.kind === 'switch' ? u.stopDepth(e.depth) : u.depth(e.depth)} · ${gasName(e.gas)}`,
        kind: e.kind === 'turn' || e.kind === 'decoStop' ? 'hl' : e.kind === 'switch' || e.kind === 'stageDrop' || e.kind === 'stagePickup' ? 'switch' : e.kind === 'regSwitch' ? 'muted' : undefined,
      }))} />
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
