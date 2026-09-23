import { useMemo } from 'react';
import { CYLINDERS, GENERIC_STANDARD, Gas, gasName, mod, planRecreational, ppO2, end, recreationalItinerary, recreationalProfile, RecInput, RecEvent } from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { Card, KV, Label, Note, NumRow, Primary, ProfileCard, SelectRow, Stat, Stats, Stepper, Timeline, Verdict, Warnings } from './kit';

export interface RecState { maxDepth: number; bottomTime: number; gasIdx: number | 'auto'; cylIdx: number; startBar: number; sac: number }
/** Recreational mode: single 12 L or 15 L back cylinder only */
export const REC_CYLINDERS = CYLINDERS.filter((c) => c.name.startsWith('Single 12') || c.name.startsWith('Single 15'));
export const defaultRecState = (): RecState => ({ maxDepth: 18, bottomTime: 30, gasIdx: 'auto', cylIdx: 0, startBar: 200, sac: 18 });

const REC_GASES = GENERIC_STANDARD.bottomGases.filter((g) => g.gas.he === 0); // Air, EAN28/32/36/40

export function useRecreationalPlan(s: RecState, gfHigh: number) {
  return useMemo(() => {
    const auto = GENERIC_STANDARD.bottomGasFor(Math.min(s.maxDepth, 40));
    const gas: Gas = s.gasIdx === 'auto' ? (auto?.gas ?? REC_GASES[REC_GASES.length - 1].gas) : REC_GASES[s.gasIdx].gas;
    const cyl = REC_CYLINDERS[s.cylIdx] ?? REC_CYLINDERS[0];
    const input: RecInput = { maxDepth: s.maxDepth, bottomTime: s.bottomTime, gas, cylinder: cyl, startBar: s.startBar, sacLpm: s.sac, gfHigh: gfHigh / 100 };
    const plan = planRecreational(input);
    return { input, plan, events: recreationalItinerary(input, plan), profile: recreationalProfile(input, plan), gas, cyl, auto };
  }, [s, gfHigh]);
}

export function RecreationalView({ t, u, lang, gfHigh, tab, state: s, setState, onShowPlan }: { t: Dict; u: Units; lang: 'hu' | 'en'; gfHigh: number; tab: 'setup' | 'plan' | 'time'; state: RecState; setState: (s: RecState) => void; onShowPlan: () => void }) {
  const set = (p: Partial<RecState>) => setState({ ...s, ...p });
  const fmt = (v: number, d = 0) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const { input, plan, events, profile, gas, auto } = useRecreationalPlan(s, gfHigh);
  const evText = (e: RecEvent): string => { switch (e.kind) { case 'start': return t.itStart(gasName(input.gas)); case 'arriveBottom': return t.itArrive; case 'leaveBottom': return t.recEvLeave; case 'safetyStop': return t.recEvSafety(Math.round(e.duration ?? 0), u.depth(e.depth)); case 'surface': return t.itSurface; } };

  if (tab === 'setup') {
    const po2 = ppO2(gas, s.maxDepth);
    return (
      <>
        <Label>{t.dive}</Label>
        <Stepper label={t.maxDepth(u)} min={u.depthN(3)} max={u.depthN(60)} value={u.depthN(s.maxDepth)} onChange={(v) => set({ maxDepth: u.toM(v) })} />
        <Stepper label={t.bottomTime} min={1} max={300} step={5} value={s.bottomTime} onChange={(v) => set({ bottomTime: v })} />
        <Card className="list">
          <SelectRow label={t.bottomGas} value={s.gasIdx} onChange={(v) => set({ gasIdx: v })}
            options={[{ v: 'auto' as const, l: t.autoBottomGasGeneric(auto?.gas.name ?? '—') }, ...REC_GASES.map((g, i) => ({ v: i, l: `${g.gas.name} (MOD ${u.depth(mod(g.gas, 1.4))})` }))]} />
          <div className="row info">{gasName(gas)}: pO2 <b className={po2 > 1.4 ? 'bad' : 'ok'}>{po2.toFixed(2)}</b> bar · END {u.depth(end(gas, s.maxDepth))}</div>
          <SelectRow label={t.backCylinder} value={s.cylIdx} onChange={(v) => set({ cylIdx: v })} options={REC_CYLINDERS.map((c, i) => ({ v: i, l: c.name }))} />
          <NumRow label={t.startPressure(u)} min={0} value={u.pressureN(s.startBar)} onChange={(v) => set({ startBar: u.toBar(v) })} />
          <NumRow label={t.penSac(u)} min={0} step={u.sacStep} decimals={u.sys === 'metric' ? 0 : 2} value={u.sacN(s.sac)} onChange={(v) => set({ sac: u.toLpm(v) })} />
        </Card>
        <Note>{t.recNote}</Note>
        <Primary onClick={onShowPlan}>{t.showPlan}</Primary>
      </>
    );
  }
  if (tab === 'time') {
    return (
      <>
        <Label>{t.itinerary}</Label>
        <Timeline minLabel={t.minUnit} rows={events.map((e) => ({ min: Math.round(e.runtime), action: evText(e), sub: u.depth(e.depth), kind: e.kind === 'safetyStop' ? 'hl' : undefined }))} />
      </>
    );
  }
  const warns = plan.warnings.map((m) => ({ text: t.msg(m, u), bad: false }));
  return (
    <>
      <Verdict tone={plan.feasible ? 'ok' : 'bad'} title={plan.feasible ? t.recFeasible : t.feasibleNo}>
        {!plan.feasible && <ul>{plan.blockers.map((b, i) => <li key={i}>{t.msg(b, u)}</li>)}</ul>}
        <div>{t.recMaxBottom(plan.maxBottomTime)}</div>
      </Verdict>
      <Stats>
        <Stat v={plan.ndlMinutes >= 999 ? '∞' : plan.ndlMinutes} l={t.recNdl} />
        <Stat v={fmt(s.bottomTime)} l={t.bottomTime} />
        <Stat v={fmt(plan.runtime)} l={t.runtime} />
        <Stat v={u.pressureN(plan.turnBar)} l={`${t.recTurn} (${u.p})`} />
        <Stat v={u.pressureN(plan.surfaceBar)} l={t.recSurfaceKpi(u)} tone={plan.gasOk ? 'mode' : 'bad'} />
      </Stats>
      <ProfileCard plan={profile} title={t.profile} axes={t.profileAxes(u)} depthScale={u.sys === 'metric' ? 1 : 3.28084} />
      <Note>{t.recSafetyStop(u.depth(5), 3)}</Note>
      <Warnings items={warns} />
      <Label>{t.gasPlan}</Label>
      <Card className="list">
        <KV l={t.recSurfaceWith(u.pressure(plan.surfaceReserveBar))} v={u.pressure(plan.surfaceReserveBar)} />
        <KV l={t.recGasUsed} v={`${u.pressure(plan.gasUsedBar)} · ${u.volume(plan.gasUsedLitres)}`} />
        <KV l={t.recSurfaceBar} v={u.pressure(plan.surfaceBar)} tone={plan.gasOk ? 'ok' : 'bad'} />
        <KV l={t.recTurn} v={u.pressure(plan.turnBar)} />
        <KV l={t.recRockBottom} sub={t.recRockBottomDesc} v={`${u.pressure(plan.rockBottomBar)} · ${u.volume(plan.rockBottomLitres)}`} />
        <KV l={t.recGasOk} v={plan.gasOk ? t.yes : t.no} tone={plan.gasOk ? 'ok' : 'bad'} />
      </Card>
    </>
  );
}
