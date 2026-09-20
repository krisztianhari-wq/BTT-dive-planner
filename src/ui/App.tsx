import { useEffect, useMemo, useState } from 'react';
import {
  CYLINDERS, Cylinder, DEFAULT_SETTINGS, DecoGasSpec, DivePlan, Gas, GasUsage, STANDARDS, StandardId,
  InventoryItem, Msg, backGasPlan, end, evaluateInventory, gasName, minimumGas, mod, packingList, planConsumption, planDive, ppO2,
  roundBar, stopTable, itinerary, ItineraryEvent,
} from '../engine';
import { ProfileChart } from './ProfileChart';
import { PrintSheet } from './PrintSheet';
import { NumInput } from './NumInput';
import { PenetrationView, PenState, defaultPenState, usePenetrationPlan, penEventText } from './PenetrationView';
import { RecreationalView, RecState, defaultRecState, useRecreationalPlan } from './RecreationalView';
import { RecPrintSheet, PenPrintSheet } from './PrintSheets';
import { exportPdf } from './pdf';
import { Lang, dict, initialLang } from './i18n';
import { UnitSystem, makeUnits } from './units';
import logoUrl from '../assets/btt-logo.png';

type Mode = 'standard' | 'inventory';
type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('btt-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function stored<T extends string>(key: string, allowed: T[], fallback: T): T {
  try { const v = localStorage.getItem(key); if (v && (allowed as string[]).includes(v)) return v as T; } catch { /* ignore */ }
  return fallback;
}

let nextId = 1;
const newItem = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  id: String(nextId++), cylinder: CYLINDERS[0], count: 1, gas: { o2: 0.21, he: 0.35 }, pressureBar: 200, role: 'back', ...over,
});
const S80 = CYLINDERS.find((c) => c.name.startsWith('AL80'))!;

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [unitSys, setUnitSys] = useState<UnitSystem>(() => stored('btt-units', ['metric', 'imperial'], 'metric'));
  const [mode, setMode] = useState<Mode>('standard');
  // Recreational is the base mode on every start; technical / penetration need an explicit confirmation per session
  const [env, setEnvRaw] = useState<'rec' | 'open' | 'pen'>('rec');
  const setEnv = (target: 'rec' | 'open' | 'pen') => {
    if (target === 'rec') { setEnvRaw('rec'); return; }
    let acked = false;
    try { acked = sessionStorage.getItem(`btt-ack-${target}`) === '1'; } catch { /* ignore */ }
    if (!acked) {
      if (!window.confirm(target === 'open' ? t.confirmTech : t.confirmPen)) return;
      try { sessionStorage.setItem(`btt-ack-${target}`, '1'); } catch { /* ignore */ }
    }
    setEnvRaw(target);
  };
  const [rec, setRec] = useState<RecState>(defaultRecState);
  const [pen, setPen] = useState<PenState>(defaultPenState);
  const [stdId, setStdId] = useState<StandardId>(() => stored('btt-std', ['gue', 'generic'], 'gue'));
  const [method, setMethod] = useState<'next' | 'current'>(() => stored('btt-method', ['next', 'current'], 'next'));
  const [maxDepth, setMaxDepth] = useState(45);
  const [bottomTime, setBottomTime] = useState(25);
  const [bottomGasIdx, setBottomGasIdx] = useState<number | 'auto'>('auto');
  const [decoOn, setDecoOn] = useState<Record<string, boolean> | null>(null);
  const [gfLow, setGfLow] = useState(20);
  const [gfHigh, setGfHigh] = useState(85);
  const [lastStop, setLastStop] = useState<number | null>(null);
  const [cylIdx, setCylIdx] = useState(0);
  const [startBar, setStartBar] = useState(200);
  const [sacBottom, setSacBottom] = useState(20);
  const [sacDeco, setSacDeco] = useState(15);
  const [items, setItems] = useState<InventoryItem[]>([
    newItem({ role: 'back' }),
    newItem({ role: 'deco', cylinder: S80, gas: { o2: 0.5, he: 0 } }),
  ]);

  const t = dict[lang];
  const locale = lang === 'hu' ? 'hu-HU' : 'en-GB';
  const u = useMemo(() => makeUnits(unitSys, locale), [unitSys, locale]);
  const fmt = (v: number, d = 0) => v.toLocaleString(locale, { maximumFractionDigits: d, minimumFractionDigits: d });
  const std = STANDARDS[env === 'pen' ? (pen.agency === 'gue' ? 'gue' : 'generic') : stdId];
  const isGue = stdId === 'gue';
  const L = std.limits;
  const lastStopDepth = lastStop ?? std.lastStopDepth;
  const changeStandard = (id: StandardId) => { setStdId(id); setBottomGasIdx('auto'); setDecoOn(null); setLastStop(null); };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('btt-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.appTitle;
    try { localStorage.setItem('btt-lang', lang); } catch { /* ignore */ }
  }, [lang]);
  useEffect(() => { try { localStorage.setItem('btt-std', stdId); } catch { /* ignore */ } }, [stdId]);
  useEffect(() => { try { localStorage.setItem('btt-units', unitSys); } catch { /* ignore */ } }, [unitSys]);
  useEffect(() => { try { localStorage.setItem('btt-method', method); } catch { /* ignore */ } }, [method]);
  useEffect(() => { document.documentElement.dataset.env = env; }, [env]);

  const settings = {
    ...DEFAULT_SETTINGS, gf: { low: gfLow / 100, high: gfHigh / 100 }, lastStopDepth, gfEvalAt: method,
    ascentRateShallowMpm: std.ascentRateShallowMpm, ppO2Working: L.bottomPpO2Working, ppO2Max: L.bottomPpO2Max, decoPpO2Max: L.decoPpO2Max,
  };

  /* ---- standard mode ---- */
  const autoBottom = std.bottomGasFor(maxDepth);
  const stdBottomGas: Gas = bottomGasIdx === 'auto' || bottomGasIdx >= std.bottomGases.length
    ? (autoBottom?.gas ?? std.bottomGases[std.bottomGases.length - 1].gas)
    : std.bottomGases[bottomGasIdx].gas;
  const recommended = std.recommendedDecoGasesFor(maxDepth);
  const decoSelection: Record<string, boolean> = decoOn ?? Object.fromEntries(std.decoGases.map((d) => [d.gas.name!, recommended.includes(d)]));
  const stdDecoGases: DecoGasSpec[] = std.decoGases.filter((d) => decoSelection[d.gas.name!]).map((d) => ({ gas: d.gas, switchDepth: d.switchDepth }));
  const cylinder = CYLINDERS[cylIdx];

  const stdPlan = useMemo(() => planDive({ maxDepth, bottomTime, bottomGas: stdBottomGas, decoGases: stdDecoGases, settings }),
    [maxDepth, bottomTime, stdBottomGas, stdDecoGases, gfLow, gfHigh, lastStopDepth, stdId, method]);

  /* ---- inventory mode ---- */
  const verdict = useMemo(() => evaluateInventory(items, maxDepth, bottomTime, sacBottom, sacDeco, settings, 1.5, std),
    [items, maxDepth, bottomTime, sacBottom, sacDeco, gfLow, gfHigh, lastStopDepth, stdId, method]);

  const backItem = items.find((i) => i.role === 'back');
  const plan: DivePlan | null = mode === 'standard' ? stdPlan : verdict.plan;
  const bottomGas: Gas = mode === 'standard' ? stdBottomGas : (backItem?.gas ?? stdBottomGas);
  const decoGases = mode === 'standard' ? stdDecoGases : verdict.decoGasesUsed;
  const usage: GasUsage[] = plan ? (mode === 'standard' ? planConsumption(plan, sacBottom, sacDeco) : verdict.usage) : [];
  const stops = plan ? stopTable(plan) : [];
  const events: ItineraryEvent[] = plan ? itinerary(plan) : [];

  const backCyl: Cylinder = mode === 'standard' ? cylinder : (backItem?.cylinder ?? cylinder);
  const backStart = mode === 'standard' ? startBar : (backItem?.pressureBar ?? startBar);
  const firstSwitch = decoGases.length ? Math.max(...decoGases.map((d) => d.switchDepth)) : 0;
  const minGas = minimumGas(maxDepth, backCyl, { toDepth: Math.min(firstSwitch, maxDepth) });
  const minGasBar = roundBar(minGas.bar);
  const bg = plan ? backGasPlan(plan, backCyl, backStart, sacBottom, sacDeco, minGasBar) : null;
  const pack = plan && mode === 'standard' ? packingList(plan, usage, cylinder, minGasBar, sacBottom, sacDeco, CYLINDERS) : [];

  const bottomPpO2 = ppO2(bottomGas, maxDepth);
  const bottomEnd = end(bottomGas, maxDepth);
  const ppo2Class = bottomPpO2 > L.bottomPpO2Max ? 'bad' : bottomPpO2 > L.bottomPpO2Working ? 'warn' : 'ok';
  const endClass = L.maxEndM !== null && bottomEnd > L.maxEndM ? 'bad' : bottomEnd > L.warnEndM ? 'warn' : 'ok';

  const engineMsgs: Msg[] = mode === 'standard' ? stdPlan.warnings : verdict.warnings;
  const warnings: { text: string; bad: boolean }[] = engineMsgs.map((m) => ({ text: t.msg(m, u), bad: t.isBlocking(m) }));
  if (mode === 'standard') {
    if (L.maxEndM !== null && bottomEnd > L.maxEndM) warnings.push({ text: t.endOverLimit(bottomEnd, u), bad: true });
    else if (bottomEnd > L.warnEndM) warnings.push({ text: t.endOverLimitGeneric(bottomEnd, L.warnEndM, u), bad: false });
    if (bg && !bg.ok) warnings.push({ text: t.backGasNotEnough(bg.shortBar, bg.shortLitres, u), bad: true });
    if (bottomGasIdx !== 'auto' && autoBottom && autoBottom.gas !== stdBottomGas) warnings.push({ text: isGue ? t.standardGasHint(maxDepth, autoBottom.gas.name!, u) : t.standardGasHintGeneric(maxDepth, autoBottom.gas.name!, u), bad: false });
  }

  const recData = useRecreationalPlan(rec, gfHigh);
  const penData = usePenetrationPlan(pen, std, settings);
  const canPrint = env === 'rec' ? true : env === 'pen' ? !!penData.plan : !!(plan && bg);
  const [busy, setBusy] = useState(false);
  const isTauri = '__TAURI_INTERNALS__' in window;
  const doPrint = async () => {
    if (isTauri) {
      try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('print_page'); return; } catch { /* fall back */ }
    }
    window.print();
  };
  const doPdf = async () => {
    const el = document.querySelector<HTMLElement>('.print-sheet');
    if (!el) return;
    setBusy(true);
    try {
      const d = env === 'rec' ? rec.maxDepth : env === 'pen' ? pen.maxDepth : maxDepth;
      const bt = env === 'rec' ? rec.bottomTime : env === 'pen' ? Math.round(penData.plan?.bottomTime ?? 0) : bottomTime;
      const name = `BTT-${env}-plan_${u.depthN(d)}${u.d}_${bt}min_${new Date().toISOString().slice(0, 10)}.pdf`;
      await exportPdf(el, name);
    } catch (err) { console.error(err); alert(t.pdfError); }
    finally { setBusy(false); }
  };
  const updateItem = (id: string, patch: Partial<InventoryItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const roleLabel = (r: 'back' | 'deco') => (r === 'back' ? t.roleBackShort : t.roleDecoShort);
  const cylShort = (c: Cylinder) => c.name.split(' (')[0];
  const eventText = (e: ItineraryEvent): string => {
    switch (e.kind) {
      case 'start': return t.itStart(gasName(e.gas));
      case 'arriveBottom': return t.itArrive;
      case 'leaveBottom': return t.itLeave(gasName(e.gas));
      case 'switch': return t.itSwitch(e.fromGas ? gasName(e.fromGas) : '—', gasName(e.gas), u, e.depth, Math.round(e.duration ?? 0));
      case 'stop': return t.itStop(Math.round(e.duration ?? 0), Math.round(e.until ?? 0), u, e.depth);
      case 'surface': return t.itSurface;
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src={logoUrl} alt="BTT Explorers Hungary" />
            <div>
              <h1>{t.appTitle}</h1>
              <div className="sub">{t.subtitle(isGue, u)}</div>
            </div>
          </div>
          <div className="controls">
            <div className="seg env" role="tablist">
              <button className={env === 'rec' ? 'on rec' : ''} onClick={() => setEnv('rec')}>🐠 {t.envRec}</button>
              <button className={env === 'open' ? 'on' : ''} onClick={() => setEnv('open')}>🌊 {t.envOpen}</button>
              <button className={env === 'pen' ? 'on pen' : ''} onClick={() => setEnv('pen')}>⛰ {t.envPen}</button>
            </div>
            {env === 'open' && (
            <div className="seg" role="tablist">
              <button className={mode === 'standard' ? 'on' : ''} onClick={() => setMode('standard')}>{t.modeStandard}</button>
              <button className={mode === 'inventory' ? 'on' : ''} onClick={() => setMode('inventory')}>{t.modeInventory}</button>
            </div>)}
            {env === 'open' && (
            <div className="seg lang" role="radiogroup" aria-label={t.stdTitle} title={t.stdTitle}>
              <button className={isGue ? 'on' : ''} onClick={() => changeStandard('gue')}>{t.stdGue}</button>
              <button className={!isGue ? 'on' : ''} onClick={() => changeStandard('generic')}>{t.stdGeneric}</button>
            </div>)}
            <div className="seg lang" role="radiogroup" aria-label={t.unitsTitle} title={t.unitsTitle}>
              <button className={unitSys === 'metric' ? 'on' : ''} onClick={() => setUnitSys('metric')}>m · bar</button>
              <button className={unitSys === 'imperial' ? 'on' : ''} onClick={() => setUnitSys('imperial')}>ft · psi</button>
            </div>
            <div className="seg lang" role="radiogroup" aria-label="Language">
              <button className={lang === 'hu' ? 'on' : ''} onClick={() => setLang('hu')}>HU</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>EN</button>
            </div>
            <div className="seg lang" role="radiogroup" aria-label={t.themeTitle}>
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')} title={t.themeLight}>☀︎</button>
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')} title={t.themeDark}>☾</button>
            </div>
            <div className="seg lang actions" role="group" aria-label={t.print}>
              <button onClick={doPrint} disabled={!canPrint} title={t.print}>🖨 {t.print}</button>
              <button onClick={doPdf} disabled={!canPrint || busy} title={t.savePdf}>{busy ? '…' : '⤓ PDF'}</button>
            </div>
          </div>
        </div>
      </div>
      <div className="disclaimer">{t.disclaimer}</div>

      {env === 'rec' && (
      <div className="grid">
        <div className="stack">
          <RecreationalView t={t} u={u} lang={lang} gfHigh={gfHigh} side="left" state={rec} setState={setRec} />
          <section className="panel rec">
            <h2>{t.algorithm}</h2>
            <div><label>{t.gfHigh}</label><NumInput min={5} max={100} value={gfHigh} onChange={(v) => setGfHigh(v)} /></div>
          </section>
        </div>
        <div className="stack">
          <RecreationalView t={t} u={u} lang={lang} gfHigh={gfHigh} side="right" state={rec} setState={setRec} />
        </div>
      </div>)}

      {env === 'pen' && (
      <div className="grid pen-grid">
        <div className="stack">
          <PenetrationView t={t} u={u} lang={lang} std={std} settings={settings} side="left" state={pen} setState={setPen} />
          <section className="panel pen">
            <h2>{t.algorithm}</h2>
            <div className="row3">
              <div><label>{t.gfLow}</label><NumInput min={5} max={100} value={gfLow} onChange={(v) => setGfLow(v)} /></div>
              <div><label>{t.gfHigh}</label><NumInput min={5} max={100} value={gfHigh} onChange={(v) => setGfHigh(v)} /></div>
              <div><label>{t.lastStop(u)}</label><select value={lastStopDepth} onChange={(e) => setLastStop(+e.target.value)}><option value={6}>{u.stopDepthN(6)}</option><option value={3}>{u.stopDepthN(3)}</option></select></div>
            </div>
          </section>
        </div>
        <div className="stack">
          <PenetrationView t={t} u={u} lang={lang} std={std} settings={settings} side="right" state={pen} setState={setPen} />
        </div>
      </div>)}

      {env === 'open' && (
      <div className="grid">
        {/* ---------- LEFT ---------- */}
        <div className="stack">
          <section className="panel">
            <h2>{t.dive}</h2>
            <div className="row">
              <div><label>{t.maxDepth(u)}</label><NumInput min={u.depthN(3)} max={u.depthN(120)} value={u.depthN(maxDepth)} onChange={(v) => { setMaxDepth(u.toM(v)); setDecoOn(null); }} /></div>
              <div><label>{t.bottomTime}</label><NumInput min={1} max={300} value={bottomTime} onChange={(v) => setBottomTime(v)} /></div>
            </div>

            {mode === 'standard' && (
              <>
                <label>{t.bottomGas}</label>
                <select value={bottomGasIdx} onChange={(e) => setBottomGasIdx(e.target.value === 'auto' ? 'auto' : +e.target.value)}>
                  <option value="auto">{isGue ? t.autoBottomGas(autoBottom?.gas.name ?? '—') : t.autoBottomGasGeneric(autoBottom?.gas.name ?? '—')}</option>
                  {std.bottomGases.map((g, i) => <option key={g.gas.name} value={i}>{g.gas.name} ({isGue ? `${u.depthN(g.minDepth)}–${u.depth(g.maxDepth)}` : `MOD ${u.depth(mod(g.gas, 1.4))}`})</option>)}
                </select>
                <label>{t.decoGases}</label>
                <div className="chips">
                  {std.decoGases.map((d) => {
                    const on = !!decoSelection[d.gas.name!];
                    return (
                      <span key={d.gas.name} className={`chip ${on ? 'on' : ''}`} onClick={() => setDecoOn({ ...decoSelection, [d.gas.name!]: !on })}>
                        <span className="dot" /> {d.gas.name} · {u.stopDepth(d.switchDepth)}
                      </span>
                    );
                  })}
                </div>
                <div className="small" style={{ marginTop: 8 }}>{t.recommended}: {recommended.length ? recommended.map((r) => r.gas.name).join(', ') : t.noneMinDeco}</div>
              </>
            )}
            <div className="small" style={{ marginTop: 10 }}>
              {gasName(bottomGas)}: pO2 <b className={ppo2Class}>{bottomPpO2.toFixed(2)}</b> bar · END <b className={endClass}>{u.depth(bottomEnd)}</b> · MOD({L.bottomPpO2Working.toFixed(1)}) {u.depth(mod(bottomGas, L.bottomPpO2Working))}
            </div>
          </section>

          {mode === 'standard' ? (
            <section className="panel">
              <h2>{t.backGasAndSac}</h2>
              <label>{t.backCylinder}</label>
              <select value={cylIdx} onChange={(e) => setCylIdx(+e.target.value)}>
                {CYLINDERS.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
              </select>
              <div className="row3">
                <div><label>{t.startPressure(u)}</label><NumInput min={u.pressureN(50)} max={u.pressureN(300)} value={u.pressureN(startBar)} onChange={(v) => setStartBar(u.toBar(v))} /></div>
                <div><label>{t.sacBottom(u)}</label><NumInput step={u.sacStep} min={0} value={u.sacN(sacBottom)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacBottom(u.toLpm(v))} /></div>
                <div><label>{t.sacDeco(u)}</label><NumInput step={u.sacStep} min={0} value={u.sacN(sacDeco)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacDeco(u.toLpm(v))} /></div>
              </div>
            </section>
          ) : (
            <section className="panel">
              <h2>{t.myGases}</h2>
              <div className="small">{t.myGasesHint}</div>
              {items.map((it) => (
                <div className="inv-row" key={it.id}>
                  <div className="full" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`tag ${it.role === 'deco' ? 'deco' : ''}`}>{it.role === 'back' ? t.roleBack : t.roleDeco} · {gasName(it.gas)}</span>
                    <button className="btn ghost" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>{t.remove}</button>
                  </div>
                  <div className="full"><label>{t.cylinder}</label>
                    <select value={CYLINDERS.indexOf(it.cylinder)} onChange={(e) => updateItem(it.id, { cylinder: CYLINDERS[+e.target.value] })}>
                      {CYLINDERS.map((c, i) => <option key={c.name} value={i}>{c.name}</option>)}
                    </select>
                  </div>
                  <div><label>{t.role}</label>
                    <select value={it.role} onChange={(e) => updateItem(it.id, { role: e.target.value as 'back' | 'deco' })}>
                      <option value="back">{t.roleBackShort}</option><option value="deco">{t.roleDeco.toLowerCase()}</option>
                    </select>
                  </div>
                  <div><label>{t.count}</label><NumInput min={1} max={6} value={it.count} onChange={(v) => updateItem(it.id, { count: Math.max(1, Math.round(v)) })} /></div>
                  <div><label>O2 %</label><NumInput min={5} max={100} value={Math.round(it.gas.o2 * 100)} onChange={(v) => updateItem(it.id, { gas: { o2: Math.min(100, v) / 100, he: Math.min(it.gas.he, 1 - v / 100) } })} /></div>
                  <div><label>He %</label><NumInput min={0} max={95} value={Math.round(it.gas.he * 100)} onChange={(v) => updateItem(it.id, { gas: { o2: it.gas.o2, he: Math.min(v / 100, 1 - it.gas.o2) } })} /></div>
                  <div className="full"><label>{t.pressure(u)}</label><NumInput min={0} value={u.pressureN(it.pressureBar)} onChange={(v) => updateItem(it.id, { pressureBar: u.toBar(v) })} /></div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => setItems((xs) => [...xs, newItem({ role: 'deco', cylinder: S80, gas: { o2: 1, he: 0 } })])}>{t.addDeco}</button>
                <button className="btn" onClick={() => setItems((xs) => [...xs, newItem({ role: 'back' })])}>{t.addBack}</button>
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <div><label>{t.sacBottom(u)}</label><NumInput step={u.sacStep} min={0} value={u.sacN(sacBottom)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacBottom(u.toLpm(v))} /></div>
                <div><label>{t.sacDeco(u)}</label><NumInput step={u.sacStep} min={0} value={u.sacN(sacDeco)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacDeco(u.toLpm(v))} /></div>
              </div>
            </section>
          )}

          <section className="panel">
            <h2>{t.algorithm}</h2>
            <div className="row3">
              <div><label>{t.gfLow}</label><NumInput min={5} max={100} value={gfLow} onChange={(v) => setGfLow(v)} /></div>
              <div><label>{t.gfHigh}</label><NumInput min={5} max={100} value={gfHigh} onChange={(v) => setGfHigh(v)} /></div>
              <div><label>{t.lastStop(u)}</label><select value={lastStopDepth} onChange={(e) => setLastStop(+e.target.value)}><option value={6}>{u.stopDepthN(6)}</option><option value={3}>{u.stopDepthN(3)}</option></select></div>
            </div>
            <label>{t.methodLabel}</label>
            <div className="seg" role="radiogroup" aria-label={t.methodLabel} style={{ display: 'flex' }}>
              <button style={{ flex: 1 }} className={method === 'next' ? 'on' : ''} onClick={() => setMethod('next')}>{t.methodStandard}</button>
              <button style={{ flex: 1 }} className={method === 'current' ? 'on' : ''} onClick={() => setMethod('current')}>{t.methodConservative}</button>
            </div>
            <div className="small" style={{ marginTop: 8 }}>{t.methodNote(method === 'current')}</div>
            <div className="small" style={{ marginTop: 6 }}>{t.ratesNote(std.ascentRateShallowMpm, u)}</div>
          </section>

          {mode === 'standard' ? (
            <section className="panel">
              <h2>{t.packing}</h2>
              <div className="pack">
                {pack.map((p, i) => (
                  <div className="pack-item" key={i}>
                    <div className={`count ${p.role === 'deco' ? 'deco' : ''}`}>{p.count}×</div>
                    <div>
                      <div className="t">{p.cylinder.name}</div>
                      <div className="s">{p.gasLabel} · {roleLabel(p.role)} · {p.note.kind === 'includesMinGas' ? t.includesMinGas(p.note.minGasBar, u) : t.withReserve(p.note.factor)}</div>
                    </div>
                    <div className={`fill ${p.overfill ? 'bad' : ''}`}>{u.pressure(p.fillBar)}<small>{p.overfill ? `${t.overfill}, ${t.overfillBy(Math.ceil(p.shortBar), u)}` : t.minFill}</small></div>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <section className="panel">
              <h2>{t.feasibleTitle}</h2>
              {verdict.feasible ? (
                <div className="verdict ok"><div className="icon">✓</div><div><div className="title">{t.feasibleYes}</div>
                  <div className="small" style={{ color: 'inherit' }}>{t.feasibleDetail(maxDepth, bottomTime, minGasBar, u)}</div></div></div>
              ) : (
                <div className="verdict bad"><div className="icon">✕</div><div><div className="title">{t.feasibleNo}</div>
                  <ul>{verdict.blockers.map((b, i) => <li key={i}>{t.msg(b, u)}</li>)}</ul>
                  {verdict.maxBottomTime !== null && <div style={{ marginTop: 8, fontWeight: 500 }}>{t.maxBottomTime(verdict.maxBottomTime, maxDepth, u)}</div>}
                </div></div>
              )}
              {verdict.balance.length > 0 && (
                <table style={{ marginTop: 12 }}>
                  <thead><tr><th>{t.gas}</th><th className="num">{t.haveL(u)}</th><th className="num">{t.needL(u)}</th><th className="num">{t.reserveL(u)}</th></tr></thead>
                  <tbody>
                    {verdict.balance.map((b) => (
                      <tr key={b.item.id}><td>{gasName(b.item.gas)} <span className={`tag ${b.item.role === 'deco' ? 'deco' : ''}`}>{roleLabel(b.item.role)}</span></td>
                        <td className={`num ${b.ok ? 'ok' : 'bad'}`}>{fmt(u.volumeN(b.availableL), u.sys === 'metric' ? 0 : 1)}</td><td className="num">{fmt(u.volumeN(b.neededL), u.sys === 'metric' ? 0 : 1)}</td><td className="num">{fmt(u.volumeN(b.reserveL), u.sys === 'metric' ? 0 : 1)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>

        {/* ---------- RIGHT ---------- */}
        <div className="stack">
          <section className="panel">
            <h2>{t.plan}</h2>
            {plan ? (
              <>
                <div className="kpis">
                  <div className="kpi"><div className="v">{fmt(plan.runtime)}</div><div className="l">{t.runtime}</div></div>
                  <div className="kpi"><div className="v">{fmt(plan.decoTime)}</div><div className="l">{t.decoTotal}</div></div>
                  <div className="kpi"><div className="v">{plan.firstStopDepth === null ? '—' : u.stopDepthN(plan.firstStopDepth)}</div><div className="l">{t.firstStop(u)}</div></div>
                  <div className="kpi"><div className="v">{stops.length}</div><div className="l">{t.stopCount}</div></div>
                </div>
                <ProfileChart plan={plan} unitLabel={lang === 'hu' ? 'perc' : 'min'} depthLabel={u.d} depthScale={u.sys === 'metric' ? 1 : 3.28084} />
              </>
            ) : <div className="small">{t.needBackGas}</div>}
            {warnings.length > 0 && <ul className="warnings">{warnings.map((w, i) => <li key={i} className={w.bad ? 'bad' : ''}>{w.text}</li>)}</ul>}
          </section>

          <section className="panel">
            <h2>{t.stops}</h2>
            {stops.length === 0 ? <div className="small">{t.noStops(isGue, u)}</div> : (
              <table>
                <thead><tr><th className="num">{t.depth(u)}</th><th className="num">{t.minutes}</th><th className="num">{t.runtimeCol}</th><th>{t.gas}</th></tr></thead>
                <tbody>{stops.map((s, i) => <tr key={i}><td className="num">{u.stopDepthN(s.depth)}</td><td className="num">{s.minutes}</td><td className="num">{s.runtime}</td><td>{s.gas}</td></tr>)}</tbody>
              </table>
            )}
          </section>

          {events.length > 0 && (
            <section className="panel">
              <h2>{t.itinerary}</h2>
              <table className="itinerary">
                <thead><tr><th className="num">{t.itTime}</th><th className="num">{t.itDepth(u)}</th><th>{t.itAction}</th><th>{t.itGas}</th></tr></thead>
                <tbody>
                  {events.map((e, i) => (
                    <tr key={i} className={`ev-${e.kind}`}>
                      <td className="num">{Math.round(e.runtime)}</td>
                      <td className="num">{e.kind === 'stop' || e.kind === 'switch' ? u.stopDepthN(e.depth) : u.depthN(e.depth)}</td>
                      <td>{eventText(e)}</td>
                      <td>{gasName(e.gas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {bg && (
            <section className="panel">
              <h2>{t.gasPlan}</h2>
              <table>
                <tbody>
                  <tr><td>{t.minGas}<div className="small">{t.minGasDesc(minGas.divers, minGas.sacLpm, minGas.problemMinutes, minGas.fromDepth, minGas.toDepth, u)}</div></td><td className="num"><b>{u.pressure(minGasBar)}</b> · {u.volume(minGas.litres)}</td></tr>
                  <tr><td>{t.usableBackGas(backCyl.name, backStart, u)}</td><td className="num">{u.pressure(bg.usableBar)}</td></tr>
                  <tr><td>{t.bottomPhaseNeed}</td><td className="num">{u.pressure(bg.bottomPhaseBar)}</td></tr>
                  <tr><td>{t.ascentOnBackGas}</td><td className="num">{u.pressure(bg.ascentOnBackGasBar)}</td></tr>
                  <tr><td>{t.turnPressure}</td><td className="num">{u.pressure(bg.turnPressureBar)}</td></tr>
                  <tr><td>{t.backGasEnough}</td><td className={`num ${bg.ok ? 'ok' : 'bad'}`}><b>{bg.ok ? t.yes : t.no}</b></td></tr>
                </tbody>
              </table>
              <h2 style={{ marginTop: 18 }}>{t.usagePerGas}</h2>
              <table>
                <thead><tr><th>{t.gas}</th><th className="num">{t.litres(u)}</th><th className="num">{t.barInCylinder(u)}</th></tr></thead>
                <tbody>
                  {usage.map((x) => {
                    const cyl = x.gas === bottomGas ? backCyl : (mode === 'inventory' ? items.find((i) => i.role === 'deco' && gasName(i.gas) === x.name)?.cylinder : pack.find((p) => p.gasLabel === x.name)?.cylinder);
                    return (
                      <tr key={x.name}>
                        <td>{x.name} <span className={`tag ${x.gas === bottomGas ? '' : 'deco'}`}>{x.gas === bottomGas ? t.roleBackShort : t.roleDecoShort}</span></td>
                        <td className="num">{fmt(u.volumeN(x.litres), u.sys === 'metric' ? 0 : 1)}</td>
                        <td className="num">{cyl ? `${u.pressure(x.litres / cyl.volumeL)} (${cylShort(cyl)})` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </div>
      </div>)}
      {env === 'rec' && (
        <RecPrintSheet t={t} u={u} lang={lang} input={recData.input} plan={recData.plan} events={recData.events} cylinderName={recData.cyl.name} />
      )}
      {env === 'pen' && penData.plan && (
        <PenPrintSheet t={t} u={u} lang={lang} input={penData.input} plan={penData.plan} events={penData.events}
          agencyLabel={pen.agency.toUpperCase()} envLabel={pen.environment === 'cave' ? t.penCave : pen.environment === 'mine' ? t.penMine : t.penWreck}
          flowLabel={pen.flow === 'outflow' ? t.penFlowOut : pen.flow === 'none' ? t.penFlowNone : t.penFlowSiphon} decoStages={penData.decoStages} packing={penData.packing}
          evText={penEventText(t, u, (penData.plan.members.find((m) => m.member.id === penData.plan!.limiting.id) ?? penData.plan.members[0]).turnBar)} />
      )}
      {env === 'open' && plan && bg && (
        <PrintSheet
          t={t} u={u} lang={lang} mode={mode}
          standardName={isGue ? t.stdGue : t.stdGeneric} methodName={method === 'current' ? t.methodConservative : t.methodStandard}
          maxDepth={maxDepth} bottomTime={bottomTime} bottomGas={bottomGas} decoGases={decoGases}
          gfLow={gfLow} gfHigh={gfHigh} lastStopDepth={lastStopDepth}
          plan={plan} stops={stops} events={events} usage={usage} bg={bg} minGas={minGas} minGasBar={minGasBar} backCyl={backCyl} backStart={backStart}
          pack={pack} verdict={mode === 'inventory' ? verdict : null} eventText={eventText} warnings={warnings}
        />
      )}
      <footer className="footer">
        <img src={logoUrl} alt="" aria-hidden="true" />
        <span className="motto">Mindig van lejjebb!!!</span>
        <span className="small">BTT Explorers Hungary · 2018 · made by sadrobot · v{__APP_VERSION__}</span>
      </footer>
    </div>
  );
}
