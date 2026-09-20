import { useMemo } from 'react';
import { CYLINDERS, GENERIC_STANDARD, Gas, gasName, mod, planRecreational, ppO2, end } from '../engine';
import { Dict } from './i18n';
import { Units } from './units';
import { NumInput } from './NumInput';

export interface RecState { maxDepth: number; bottomTime: number; gasIdx: number | 'auto'; cylIdx: number; startBar: number; sac: number }
/** Recreational mode: single 12 L or 15 L back cylinder only */
export const REC_CYLINDERS = CYLINDERS.filter((c) => c.name.startsWith('Single 12') || c.name.startsWith('Single 15'));
export const defaultRecState = (): RecState => ({ maxDepth: 18, bottomTime: 30, gasIdx: 'auto', cylIdx: 0, startBar: 200, sac: 18 });

const REC_GASES = GENERIC_STANDARD.bottomGases.filter((g) => g.gas.he === 0); // Air, EAN28/32/36/40

export function RecreationalView({ t, u, lang, gfHigh, side, state: s, setState }: { t: Dict; u: Units; lang: 'hu' | 'en'; gfHigh: number; side: 'left' | 'right'; state: RecState; setState: (s: RecState) => void }) {
  const set = (p: Partial<RecState>) => setState({ ...s, ...p });
  const fmt = (v: number, d = 0) => v.toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-GB', { maximumFractionDigits: d, minimumFractionDigits: d });
  const auto = GENERIC_STANDARD.bottomGasFor(Math.min(s.maxDepth, 40));
  const gas: Gas = s.gasIdx === 'auto' ? (auto?.gas ?? REC_GASES[REC_GASES.length - 1].gas) : REC_GASES[s.gasIdx].gas;
  const cyl = REC_CYLINDERS[s.cylIdx] ?? REC_CYLINDERS[0];
  const plan = useMemo(() => planRecreational({ maxDepth: s.maxDepth, bottomTime: s.bottomTime, gas, cylinder: cyl, startBar: s.startBar, sacLpm: s.sac, gfHigh: gfHigh / 100 }), [s, gas, cyl, gfHigh]);

  if (side === 'left') {
    return (
      <section className="panel rec">
        <h2>{t.dive}</h2>
        <div className="row">
          <div><label>{t.maxDepth(u)}</label><NumInput min={u.depthN(3)} max={u.depthN(60)} value={u.depthN(s.maxDepth)} onChange={(v) => set({ maxDepth: u.toM(v) })} /></div>
          <div><label>{t.bottomTime}</label><NumInput min={1} max={300} value={s.bottomTime} onChange={(v) => set({ bottomTime: v })} /></div>
        </div>
        <label>{t.bottomGas}</label>
        <select value={s.gasIdx} onChange={(e) => set({ gasIdx: e.target.value === 'auto' ? 'auto' : +e.target.value })}>
          <option value="auto">{t.autoBottomGasGeneric(auto?.gas.name ?? '—')}</option>
          {REC_GASES.map((g, i) => <option key={g.gas.name} value={i}>{g.gas.name} (MOD {u.depth(mod(g.gas, 1.4))})</option>)}
        </select>
        <div className="small" style={{ marginTop: 8 }}>{gasName(gas)}: pO2 <b className={ppO2(gas, s.maxDepth) > 1.4 ? 'bad' : 'ok'}>{ppO2(gas, s.maxDepth).toFixed(2)}</b> bar · END {u.depth(end(gas, s.maxDepth))}</div>
        <label>{t.backCylinder}</label>
        <select value={s.cylIdx} onChange={(e) => set({ cylIdx: +e.target.value })}>{REC_CYLINDERS.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}</select>
        <div className="row">
          <div><label>{t.startPressure(u)}</label><NumInput min={0} value={u.pressureN(s.startBar)} onChange={(v) => set({ startBar: u.toBar(v) })} /></div>
          <div><label>{t.penSac(u)}</label><NumInput min={0} step={u.sacStep} decimals={u.sys === 'metric' ? 0 : 2} value={u.sacN(s.sac)} onChange={(v) => set({ sac: u.toLpm(v) })} /></div>
        </div>
        <div className="small" style={{ marginTop: 10 }}>{t.recNote}</div>
      </section>
    );
  }
  const msgs = [...plan.blockers.map((m) => ({ text: t.msg(m, u), bad: true })), ...plan.warnings.map((m) => ({ text: t.msg(m, u), bad: false }))];
  return (
    <>
      <section className="panel rec">
        <h2>{t.recPlan}</h2>
        <div className={`verdict ${plan.feasible ? 'ok' : 'bad'}`} style={{ marginBottom: 12 }}>
          <div className="icon">{plan.feasible ? '✓' : '✕'}</div>
          <div><div className="title">{plan.feasible ? t.recFeasible : t.feasibleNo}</div>
            {!plan.feasible && <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: '.84rem' }}>{plan.blockers.map((b, i) => <li key={i}>{t.msg(b, u)}</li>)}</ul>}
            <div className="small" style={{ color: 'inherit', marginTop: 6 }}>{t.recMaxBottom(plan.maxBottomTime)}</div></div>
        </div>
        <div className="kpis">
          <div className="kpi"><div className="v">{plan.ndlMinutes >= 999 ? '∞' : plan.ndlMinutes}</div><div className="l">{t.recNdl}</div></div>
          <div className="kpi"><div className="v">{fmt(s.bottomTime)}</div><div className="l">{t.bottomTime}</div></div>
          <div className="kpi"><div className="v">{fmt(plan.runtime)}</div><div className="l">{t.runtime}</div></div>
          <div className="kpi"><div className="v">{u.pressureN(plan.turnBar)}</div><div className="l">{t.recTurn} ({u.p})</div></div>
          <div className="kpi"><div className={`v ${plan.gasOk ? 'ok' : 'bad'}`}>{u.pressureN(plan.surfaceBar)}</div><div className="l">{t.recSurfaceKpi(u)}</div></div>
        </div>
        <div className="small">{t.recSafetyStop(u.depth(5), 3)}</div>
        {msgs.filter((m) => !m.bad).length > 0 && <ul className="warnings">{msgs.filter((m) => !m.bad).map((w, i) => <li key={i}>{w.text}</li>)}</ul>}
      </section>
      <section className="panel rec">
        <h2>{t.gasPlan}</h2>
        <table>
          <tbody>
            <tr><td>{t.recSurfaceWith(u.pressure(plan.surfaceReserveBar))}</td><td className="num"><b>{u.pressure(plan.surfaceReserveBar)}</b></td></tr>
            <tr><td>{t.recGasUsed}</td><td className="num">{u.pressure(plan.gasUsedBar)} · {u.volume(plan.gasUsedLitres)}</td></tr>
            <tr><td>{t.recSurfaceBar}</td><td className={`num ${plan.gasOk ? 'ok' : 'bad'}`}><b>{u.pressure(plan.surfaceBar)}</b></td></tr>
            <tr><td>{t.recTurn}</td><td className="num"><b>{u.pressure(plan.turnBar)}</b></td></tr>
            <tr><td>{t.recRockBottom}<div className="small">{t.recRockBottomDesc}</div></td><td className="num">{u.pressure(plan.rockBottomBar)} · {u.volume(plan.rockBottomLitres)}</td></tr>
            <tr><td>{t.recGasOk}</td><td className={`num ${plan.gasOk ? 'ok' : 'bad'}`}><b>{plan.gasOk ? t.yes : t.no}</b></td></tr>
          </tbody>
        </table>
      </section>
    </>
  );
}
