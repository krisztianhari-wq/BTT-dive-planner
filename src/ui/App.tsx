import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CYLINDERS, Cylinder, DEFAULT_SETTINGS, DecoGasSpec, DivePlan, Gas, GasUsage, STANDARDS, StandardId,
  InventoryItem, Msg, backGasPlan, end, evaluateInventory, gasName, minimumGas, mod, packingList, planConsumption, planDive, ppO2,
  roundBar, stopTable, itinerary, ItineraryEvent, sidemountSwitchesOnProfile, worstSingleCylinderLitres, defaultSwitchStep, msg,
} from '../engine';
import { PrintSheet } from './PrintSheet';
import { Card, Chevron, Chip, Disclaimer, IconShare, IconSliders, KV, Label, Note, NumRow, Primary, ProfileCard, Seg, SelectRow, Sheet, Stat, Stats, Stepper, StopRows, Timeline, Toast, Toggle, Verdict, Warnings } from './kit';
import { PenetrationView, PenState, defaultPenState, usePenetrationPlan, penEventText } from './PenetrationView';
import { RecreationalView, RecState, defaultRecState, useRecreationalPlan } from './RecreationalView';
import { RecPrintSheet, PenPrintSheet } from './PrintSheets';
import { renderPdf, savePdf, sharePdf, canShareFiles, isMobileTauri, askConfirm } from './pdf';
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

type Env = 'rec' | 'open' | 'pen';
type Tab = 'setup' | 'plan' | 'time' | 'gas' | 'team' | 'kit' | 'deco';
/** Tabs per dive mode; switching mode opens the second (result) tab. */
const TABS: Record<Env, Tab[]> = { rec: ['setup', 'plan', 'time'], open: ['setup', 'plan', 'gas'], pen: ['setup', 'team', 'kit', 'deco'] };

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
  const [env, setEnvRaw] = useState<Env>('rec');
  const [tab, setTabRaw] = useState<Tab>('setup');
  const setTab = (next: Tab) => { setTabRaw(next); window.scrollTo({ top: 0 }); };
  const [sheet, setSheet] = useState<null | 'settings' | 'export'>(null);
  const [algoOpen, setAlgoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 1800); return () => clearTimeout(id); }, [toast]);
  const closeSheet = useCallback(() => setSheet(null), []);
  const setEnv = async (target: Env) => {
    if (target === env) return;
    if (target === 'rec') { setEnvRaw('rec'); setTab(TABS.rec[1]); return; }
    let acked = false;
    try { acked = sessionStorage.getItem(`btt-ack-${target}`) === '1'; } catch { /* ignore */ }
    if (!acked) {
      if (!(await askConfirm(target === 'open' ? t.confirmTech : t.confirmPen))) return;
      try { sessionStorage.setItem(`btt-ack-${target}`, '1'); } catch { /* ignore */ }
    }
    setEnvRaw(target);
    setTab(TABS[target][1]);
  };
  // header collapses while the page is scrolled (hysteresis so it does not flicker)
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCompact((c) => (c ? y > 24 : y > 72));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
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
  const [config, setConfig] = useState<'backmount' | 'sidemount'>(() => stored('btt-config', ['backmount', 'sidemount'], 'backmount'));
  const [smCylIdx, setSmCylIdx] = useState(() => CYLINDERS.findIndex((c) => c.name.startsWith('Single 12')));
  const [smStep, setSmStep] = useState<number | null>(null);
  const [startBar, setStartBar] = useState(200);
  const [sacBottom, setSacBottom] = useState(20);
  const [sacDeco, setSacDeco] = useState(15);
  const [openItem, setOpenItem] = useState<string | null>(null);
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
  useEffect(() => { try { localStorage.setItem('btt-config', config); } catch { /* ignore */ } }, [config]);
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
  const SM_CYLINDERS = CYLINDERS.filter((c) => c.name.startsWith('Single') || c.name.startsWith('AL80'));
  const smSingle = SM_CYLINDERS[smCylIdx] ?? SM_CYLINDERS[0];
  const cylinder: Cylinder = config === 'sidemount'
    ? { name: `2× ${smSingle.name.split(' (')[0]} (${t.configSidemount})`, volumeL: smSingle.volumeL * 2, workingPressureBar: smSingle.workingPressureBar }
    : CYLINDERS[cylIdx];
  const smStepBar = smStep ?? defaultSwitchStep(startBar);

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

  const backCyl: Cylinder = mode === 'standard' ? cylinder : (backItem?.cylinder ?? cylinder);
  const backStart = mode === 'standard' ? startBar : (backItem?.pressureBar ?? startBar);
  const firstSwitch = decoGases.length ? Math.max(...decoGases.map((d) => d.switchDepth)) : 0;
  const minGas = minimumGas(maxDepth, backCyl, { toDepth: Math.min(firstSwitch, maxDepth) });
  const minGasBar = roundBar(minGas.bar);
  const bg = plan ? backGasPlan(plan, backCyl, backStart, sacBottom, sacDeco, minGasBar) : null;
  const pack = plan && mode === 'standard' ? packingList(plan, usage, cylinder, minGasBar, sacBottom, sacDeco, CYLINDERS) : [];
  // sidemount: regulator switches on the profile and the lost-cylinder minimum-gas check
  const sm = useMemo(() => {
    if (config !== 'sidemount' || env !== 'open' || mode !== 'standard' || !plan) return null;
    const isBack = (seg: { gas: Gas }) => seg.gas === bottomGas;
    const all = sidemountSwitchesOnProfile(plan.segments, isBack, sacBottom, sacDeco, backStart, smSingle.volumeL, smStepBar);
    const bottomSegs = plan.segments.filter((sg) => sg.kind === 'descent' || sg.kind === 'bottom');
    const atBottomEnd = sidemountSwitchesOnProfile(bottomSegs, isBack, sacBottom, sacDeco, backStart, smSingle.volumeL, smStepBar).end;
    const lostShort = Math.max(0, minGas.litres - worstSingleCylinderLitres(atBottomEnd, smSingle.volumeL));
    return { switches: all.switches, end: all.end, atBottomEnd, lostShort };
  }, [config, env, mode, plan, bottomGas, sacBottom, sacDeco, backStart, smSingle, smStepBar, minGas.litres]);
  const events: ItineraryEvent[] = plan ? itinerary(plan) : [];

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
    if (sm && sm.lostShort > 0) warnings.push({ text: t.msg(msg('smLostCylinderMinGas', { short: Math.round(sm.lostShort) }), u), bad: true });
  }

  const recData = useRecreationalPlan(rec, gfHigh);
  const penData = usePenetrationPlan(pen, std, settings);
  const canPrint = env === 'rec' ? true : env === 'pen' ? !!penData.plan : !!(plan && bg);
  const [busy, setBusy] = useState(false);
  const isTauri = '__TAURI_INTERNALS__' in window;
  const mobile = isMobileTauri();
  const doPrint = async () => {
    if (isTauri) {
      try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('print_page'); return; } catch { /* fall back */ }
    }
    window.print();
  };
  const pdfName = () => {
    const d = env === 'rec' ? rec.maxDepth : env === 'pen' ? pen.maxDepth : maxDepth;
    const bt = env === 'rec' ? rec.bottomTime : env === 'pen' ? Math.round(penData.plan?.bottomTime ?? 0) : bottomTime;
    return `BTT-${env}-plan_${u.depthN(d)}${u.d}_${bt}min_${new Date().toISOString().slice(0, 10)}.pdf`;
  };
  const shareable = useMemo(canShareFiles, []);
  /** Renders the print sheet to a PDF and hands it to `deliver` (share sheet or save dialog). */
  const doPdf = async (deliver: 'share' | 'save') => {
    const el = document.querySelector<HTMLElement>('.print-sheet');
    if (!el) return;
    setBusy(true);
    try {
      const blob = await renderPdf(el);
      const name = pdfName();
      const ok = deliver === 'share' ? await sharePdf(blob, name) : await savePdf(blob, name);
      if (ok) { setSheet(null); setToast(deliver === 'share' ? t.toastShared : t.toastSaved); }
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
      case 'regSwitch': { const [to, bar] = (e.note ?? 'L|0').split('|'); return t.smEvSwitch(to, u.pressure(Math.round(Number(bar)))); }
      case 'surface': return t.itSurface;
    }
  };

  const tabLabel: Record<Tab, string> = { setup: t.tabSetup, plan: t.tabPlan, time: t.tabTimeline, gas: t.tabGasCheck, team: t.tabTeamGas, kit: t.tabKit, deco: t.tabDeco };
  const depthScale = u.sys === 'metric' ? 1 : 3.28084;
  const vol = (l: number) => fmt(u.volumeN(l), u.sys === 'metric' ? 0 : 1);

  /* ---------- technical mode tabs ---------- */
  const techSetup = (
    <>
      <Seg value={stdId} onChange={changeStandard} label={t.stdTitle} options={[{ v: 'gue' as StandardId, l: t.stdGue }, { v: 'generic' as StandardId, l: t.stdGeneric }]} />
      <Seg value={mode} onChange={setMode} options={[{ v: 'standard' as Mode, l: t.modeStandard }, { v: 'inventory' as Mode, l: t.modeInventory }]} />
      <Label>{t.dive}</Label>
      <Stepper label={t.maxDepth(u)} min={u.depthN(3)} max={u.depthN(120)} value={u.depthN(maxDepth)} onChange={(v) => { setMaxDepth(u.toM(v)); setDecoOn(null); }} />
      <Stepper label={t.bottomTime} min={1} max={300} step={5} value={bottomTime} onChange={setBottomTime} />
      {mode === 'standard' && (
        <Card className="list">
          <SelectRow label={t.bottomGas} value={bottomGasIdx} onChange={setBottomGasIdx}
            options={[{ v: 'auto' as const, l: isGue ? t.autoBottomGas(autoBottom?.gas.name ?? '—') : t.autoBottomGasGeneric(autoBottom?.gas.name ?? '—') },
              ...std.bottomGases.map((g, i) => ({ v: i, l: `${g.gas.name} (${isGue ? `${u.depthN(g.minDepth)}–${u.depth(g.maxDepth)}` : `MOD ${u.depth(mod(g.gas, 1.4))}`})` }))]} />
          <div className="row stack">
            <span className="row-l">{t.decoGases}</span>
            <div className="tchips">
              {std.decoGases.map((d) => {
                const on = !!decoSelection[d.gas.name!];
                return <Toggle key={d.gas.name} on={on} onClick={() => setDecoOn({ ...decoSelection, [d.gas.name!]: !on })}>{d.gas.name} · {u.stopDepth(d.switchDepth)}</Toggle>;
              })}
            </div>
            <span className="row-sub">{t.recommended}: {recommended.length ? recommended.map((r) => r.gas.name).join(', ') : t.noneMinDeco}</span>
          </div>
          <div className="row info">
            {gasName(bottomGas)}: pO2 <b className={ppo2Class}>{bottomPpO2.toFixed(2)}</b> bar · END <b className={endClass}>{u.depth(bottomEnd)}</b> · MOD({L.bottomPpO2Working.toFixed(1)}) {u.depth(mod(bottomGas, L.bottomPpO2Working))}
          </div>
        </Card>
      )}
      {mode === 'standard' ? (
        <>
          <Label>{t.backGasAndSac}</Label>
          <Card className="list">
            <div className="row stack">
              <span className="row-l">{t.config}</span>
              <Seg value={config} onChange={setConfig} options={[{ v: 'backmount' as const, l: t.configBackmount }, { v: 'sidemount' as const, l: t.configSidemount }]} />
            </div>
            {config === 'backmount' ? (
              <SelectRow label={t.backCylinder} value={cylIdx} onChange={setCylIdx} options={CYLINDERS.map((c, i) => ({ v: i, l: c.name }))} />
            ) : (
              <>
                <SelectRow label={t.smCylinder} value={smCylIdx} onChange={setSmCylIdx} options={SM_CYLINDERS.map((c, i) => ({ v: i, l: `2× ${c.name}` }))} />
                <NumRow label={t.smStep(u)} min={u.pressureN(5)} value={u.pressureN(smStepBar)} onChange={(v) => setSmStep(u.toBar(v))} />
                <div className="row info">{t.smSwitchNote} {t.smMinGasNote}</div>
              </>
            )}
            <NumRow label={t.startPressure(u)} min={u.pressureN(50)} max={u.pressureN(300)} value={u.pressureN(startBar)} onChange={(v) => setStartBar(u.toBar(v))} />
            <NumRow label={t.sacBottom(u)} step={u.sacStep} min={0} value={u.sacN(sacBottom)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacBottom(u.toLpm(v))} />
            <NumRow label={t.sacDeco(u)} step={u.sacStep} min={0} value={u.sacN(sacDeco)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacDeco(u.toLpm(v))} />
          </Card>
        </>
      ) : (
        <>
          <Label>{t.myGases}</Label>
          <Note>{t.myGasesHint}</Note>
          <Card className="list">
            <div className="row info">
              {gasName(bottomGas)}: pO2 <b className={ppo2Class}>{bottomPpO2.toFixed(2)}</b> bar · END <b className={endClass}>{u.depth(bottomEnd)}</b> · MOD({L.bottomPpO2Working.toFixed(1)}) {u.depth(mod(bottomGas, L.bottomPpO2Working))}
            </div>
          </Card>
          {items.map((it) => {
            const open = openItem === it.id;
            return (
              <Card className="list diver" key={it.id}>
                <button className="row gas-head" aria-expanded={open} onClick={() => setOpenItem(open ? null : it.id)}>
                  <span className="gas-name">{gasName(it.gas)}</span>
                  <Chip kind={it.role === 'deco' ? 'deco' : 'back'}>{roleLabel(it.role)}</Chip>
                  <span className="gas-have">{it.count > 1 ? `${it.count}× ` : ''}{u.volume(it.cylinder.volumeL * it.pressureBar * it.count)}</span>
                  <Chevron open={open} />
                </button>
                {open && (
                  <>
                    <SelectRow label={t.cylinder} value={CYLINDERS.indexOf(it.cylinder)} onChange={(v) => updateItem(it.id, { cylinder: CYLINDERS[v] })} options={CYLINDERS.map((c, i) => ({ v: i, l: c.name }))} />
                    <SelectRow label={t.role} value={it.role} onChange={(v) => updateItem(it.id, { role: v })} options={[{ v: 'back' as const, l: t.roleBackShort }, { v: 'deco' as const, l: t.roleDeco.toLowerCase() }]} />
                    <NumRow label={t.count} min={1} max={6} value={it.count} onChange={(v) => updateItem(it.id, { count: Math.max(1, Math.round(v)) })} />
                    <NumRow label="O2 %" min={5} max={100} value={Math.round(it.gas.o2 * 100)} onChange={(v) => updateItem(it.id, { gas: { o2: Math.min(100, v) / 100, he: Math.min(it.gas.he, 1 - v / 100) } })} />
                    <NumRow label="He %" min={0} max={95} value={Math.round(it.gas.he * 100)} onChange={(v) => updateItem(it.id, { gas: { o2: it.gas.o2, he: Math.min(v / 100, 1 - it.gas.o2) } })} />
                    <NumRow label={t.pressure(u)} min={0} value={u.pressureN(it.pressureBar)} onChange={(v) => updateItem(it.id, { pressureBar: u.toBar(v) })} />
                    <div className="row"><button className="link-bad" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>{t.remove}</button></div>
                  </>
                )}
              </Card>
            );
          })}
          <div className="btn-row">
            <button className="btn-field" onClick={() => { const n = newItem({ role: 'deco', cylinder: S80, gas: { o2: 1, he: 0 } }); setItems((xs) => [...xs, n]); setOpenItem(n.id); }}>{t.addDeco}</button>
            <button className="btn-field" onClick={() => { const n = newItem({ role: 'back' }); setItems((xs) => [...xs, n]); setOpenItem(n.id); }}>{t.addBack}</button>
          </div>
          <Card className="list">
            <NumRow label={t.sacBottom(u)} step={u.sacStep} min={0} value={u.sacN(sacBottom)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacBottom(u.toLpm(v))} />
            <NumRow label={t.sacDeco(u)} step={u.sacStep} min={0} value={u.sacN(sacDeco)} decimals={u.sys === 'metric' ? 0 : 2} onChange={(v) => setSacDeco(u.toLpm(v))} />
          </Card>
        </>
      )}
      <Primary onClick={() => setTab('plan')}>{t.showPlan}</Primary>
    </>
  );

  // verdict under the selected gas standard: blocking engine messages (and, with my gases, the inventory blockers)
  const stdLabel = isGue ? t.stdGue : t.stdGeneric;
  const blockers = [...new Set([...(mode === 'inventory' ? verdict.blockers.map((b) => t.msg(b, u)) : []), ...warnings.filter((w) => w.bad).map((w) => w.text)])];
  const techOk = blockers.length === 0 && (mode === 'standard' || verdict.feasible);
  const techPlan = !plan ? <Verdict tone="bad" title={t.needBackGas} /> : (
    <>
      <Verdict tone={techOk ? 'ok' : 'bad'} title={techOk ? t.techFeasible(stdLabel) : t.techNotFeasible(stdLabel)}>
        {techOk ? <div>{t.feasibleDetail(maxDepth, bottomTime, minGasBar, u)}</div> : blockers.map((b, i) => <div key={i}>{b}</div>)}
        {!techOk && mode === 'inventory' && verdict.maxBottomTime !== null && <div><b>{t.maxBottomTime(verdict.maxBottomTime, maxDepth, u)}</b></div>}
      </Verdict>
      <Stats>
        <Stat v={fmt(plan.runtime)} l={t.runtime} />
        <Stat v={fmt(plan.decoTime)} l={t.decoTotal} />
        <Stat v={plan.firstStopDepth === null ? '—' : u.stopDepthN(plan.firstStopDepth)} l={t.firstStop(u)} />
        <Stat v={stops.length} l={t.stopCount} />
      </Stats>
      <ProfileCard plan={plan} title={t.profile} axes={t.profileAxes(u)} depthScale={depthScale} />
      <Warnings items={warnings.filter((w) => !w.bad)} />
      <Label>{t.stops}</Label>
      {stops.length === 0 ? <Card><Note>{t.noStops(isGue, u)}</Note></Card> : (
        <StopRows unit={u.d} minLabel={t.minUnit} leaveAt={t.leaveAt} stops={stops.map((s) => ({ depth: u.stopDepthN(s.depth), minutes: s.minutes, runtime: s.runtime, gas: s.gas }))} />
      )}
      <Note>{t.ratesNote(std.ascentRateShallowMpm, u)}</Note>
      {events.length > 0 && (
        <>
          <Label>{t.itinerary}</Label>
          <Timeline minLabel={t.minUnit} rows={events.map((e) => ({
            min: Math.round(e.runtime), action: eventText(e),
            sub: `${e.kind === 'stop' || e.kind === 'switch' ? u.stopDepth(e.depth) : u.depth(e.depth)} · ${gasName(e.gas)}`,
            kind: e.kind === 'stop' ? 'hl' : e.kind === 'switch' ? 'switch' : e.kind === 'regSwitch' ? 'muted' : undefined,
          }))} />
        </>
      )}
    </>
  );

  const techGas = (
    <>
      {mode === 'inventory' && (
        <>
          <Label>{t.feasibleTitle}</Label>
          {verdict.feasible ? (
            <Verdict tone="ok" title={t.feasibleYes}>{t.feasibleDetail(maxDepth, bottomTime, minGasBar, u)}</Verdict>
          ) : (
            <Verdict tone="bad" title={t.feasibleNo}>
              {verdict.blockers.map((b, i) => <div key={i}>{t.msg(b, u)}</div>)}
              {verdict.maxBottomTime !== null && <div><b>{t.maxBottomTime(verdict.maxBottomTime, maxDepth, u)}</b></div>}
            </Verdict>
          )}
          {verdict.balance.map((b) => {
            const total = Math.max(b.availableL, b.neededL + b.reserveL, 1);
            return (
              <Card className="gas-card" key={b.item.id}>
                <div className="gc-head">
                  <span className="gc-name">{gasName(b.item.gas)}</span>
                  <Chip kind={b.item.role === 'deco' ? 'deco' : 'back'}>{roleLabel(b.item.role)}</Chip>
                  <span className={`gc-status ${b.ok ? 'ok' : 'bad'}`}>{b.ok ? t.enough : t.shortBy(u.volume(b.neededL + b.reserveL - b.availableL))}</span>
                </div>
                <div className="gc-bar"><span className="need" style={{ width: `${(b.neededL / total) * 100}%` }} /><span className="res" style={{ width: `${(b.reserveL / total) * 100}%` }} /></div>
                <div className="cols3">
                  <div><div className="c-l">{t.haveL(u)}</div><div className={`c-v ${b.ok ? 'ok' : 'bad'}`}>{vol(b.availableL)}</div></div>
                  <div><div className="c-l">{t.needL(u)}</div><div className="c-v">{vol(b.neededL)}</div></div>
                  <div><div className="c-l">{t.reserveL(u)}</div><div className="c-v">{vol(b.reserveL)}</div></div>
                </div>
              </Card>
            );
          })}
        </>
      )}
      {bg && (
        <>
          <Label>{t.gasPlan}</Label>
          <Card className="list">
            <KV l={t.minGas} sub={t.minGasDesc(minGas.divers, minGas.sacLpm, minGas.problemMinutes, minGas.fromDepth, minGas.toDepth, u)} v={<><b>{u.pressure(minGasBar)}</b> · {u.volume(minGas.litres)}</>} />
            <KV l={t.usableBackGas(backCyl.name, backStart, u)} v={u.pressure(bg.usableBar)} />
            <KV l={t.bottomPhaseNeed} v={u.pressure(bg.bottomPhaseBar)} />
            <KV l={t.ascentOnBackGas} v={u.pressure(bg.ascentOnBackGasBar)} />
            <KV l={t.turnPressure} v={u.pressure(bg.turnPressureBar)} />
            <KV l={t.backGasEnough} v={bg.ok ? t.yes : t.no} tone={bg.ok ? 'ok' : 'bad'} />
            {sm && <KV l={`${t.configSidemount}: ${t.smAtBottomEnd(u)}`} v={`${u.pressureN(sm.atBottomEnd.left)} / ${u.pressureN(sm.atBottomEnd.right)}`} />}
            {sm && <KV l={t.smLost(u)} v={u.volumeN(sm.lostShort)} tone={sm.lostShort > 0 ? 'bad' : 'ok'} />}
          </Card>
          <Label>{t.usagePerGas}</Label>
          <Card className="list">
            {usage.map((x) => {
              const cyl = x.gas === bottomGas ? backCyl : (mode === 'inventory' ? items.find((i) => i.role === 'deco' && gasName(i.gas) === x.name)?.cylinder : pack.find((p) => p.gasLabel === x.name)?.cylinder);
              return (
                <div className="row usage" key={x.name}>
                  <span className="gas-name">{x.name}</span>
                  <Chip kind={x.gas === bottomGas ? 'back' : 'deco'}>{x.gas === bottomGas ? t.roleBackShort : t.roleDecoShort}</Chip>
                  <span className="usage-v"><b>{u.volume(x.litres)}</b><small>{cyl ? `${u.pressure(x.litres / cyl.volumeL)} · ${cylShort(cyl)}` : '—'}</small></span>
                </div>
              );
            })}
          </Card>
        </>
      )}
      {mode === 'standard' && pack.length > 0 && (
        <>
          <Label>{t.packing}</Label>
          <Card className="list">
            {pack.map((p, i) => (
              <div className="pack-row" key={i}>
                <span className={`badge qty ${p.role === 'deco' ? 'deco' : ''}`}>{p.count}×</span>
                <span className="pack-txt"><span className="pack-name">{p.cylinder.name}</span>
                  <span className="pack-sub">{p.gasLabel} · {roleLabel(p.role)} · {p.note.kind === 'includesMinGas' ? t.includesMinGas(p.note.minGasBar, u) : t.withReserve(p.note.factor)}</span></span>
                <span className={`pack-fill ${p.overfill ? 'bad' : ''}`}>{u.pressure(p.fillBar)}<small>{p.overfill ? `${t.overfill}, ${t.overfillBy(Math.ceil(p.shortBar), u)}` : t.minFill}</small></span>
              </div>
            ))}
          </Card>
        </>
      )}
    </>
  );

  const content = env === 'rec'
    ? <RecreationalView t={t} u={u} lang={lang} gfHigh={gfHigh} tab={tab as 'setup' | 'plan' | 'time'} state={rec} setState={setRec} onShowPlan={() => setTab('plan')} />
    : env === 'pen'
      ? <PenetrationView t={t} u={u} lang={lang} std={std} settings={settings} tab={tab as 'setup' | 'team' | 'kit' | 'deco'} state={pen} setState={setPen} onMatch={() => setTab('team')} onExport={() => setSheet('export')} />
      : tab === 'setup' ? techSetup : tab === 'plan' ? techPlan : techGas;

  return (
    <div className="app">
      <header className={compact ? 'hdr compact' : 'hdr'}>
        <div className="hdr-inner">
          <div className="hdr-row">
            <img className="logo" src={logoUrl} alt="BTT Explorers Hungary" />
            <div className="hdr-title">
              <h1>{t.appTitle}</h1>
              <div className="hdr-sub">{t.subtitle(isGue, u)}</div>
            </div>
            <button className="icon-btn" onClick={() => setSheet('export')} disabled={!canPrint} aria-label={t.exportTitle} title={canPrint ? t.exportTitle : t.exportNeedsPlan}><IconShare /></button>
            <button className="icon-btn" onClick={() => setSheet('settings')} aria-label={t.settingsTitle} title={t.settingsTitle}><IconSliders /></button>
          </div>
          <div className="modes" role="tablist">
            {(['rec', 'open', 'pen'] as Env[]).map((m) => (
              <button key={m} role="tab" aria-selected={env === m} className={`m-${m} ${env === m ? 'on' : ''}`} onClick={() => setEnv(m)}>{m === 'rec' ? t.envRec : m === 'open' ? t.envOpen : t.envPen}</button>
            ))}
          </div>
        </div>
      </header>

      <main className="content" key={`${env}-${tab}`}>
        {tab === 'setup' && <Disclaimer text={t.disclaimer} />}
        {content}
        <footer className="footer2">
          <img src={logoUrl} alt="" aria-hidden="true" />
          <span className="motto">Mindig van lejjebb!!!</span>
          <span>BTT Explorers Hungary · 2018 · made by sadrobot · v{__APP_VERSION__}</span>
        </footer>
      </main>

      <nav className="tabbar" role="tablist">
        <div className="tabbar-inner">
          {TABS[env].map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{tabLabel[id]}</button>
          ))}
        </div>
      </nav>

      <Sheet open={sheet === 'settings'} onClose={closeSheet} label={t.settingsTitle}>
        <div className="sheet-head"><h2>{t.settingsTitle}</h2><button className="pill" onClick={closeSheet}>{t.done}</button></div>
        <div className="sheet-field"><span>{t.unitsTitle}</span>
          <Seg variant="sheet" value={unitSys} onChange={setUnitSys} options={[{ v: 'metric' as UnitSystem, l: 'm · bar' }, { v: 'imperial' as UnitSystem, l: 'ft · psi' }]} /></div>
        <div className="sheet-field"><span>{t.langTitle}</span>
          <Seg variant="sheet" value={lang} onChange={setLang} options={[{ v: 'hu' as Lang, l: 'HU' }, { v: 'en' as Lang, l: 'EN' }]} /></div>
        <div className="sheet-field"><span>{t.appearance}</span>
          <Seg variant="sheet" value={theme} onChange={setTheme} options={[{ v: 'light' as Theme, l: t.themeLight }, { v: 'dark' as Theme, l: t.themeDark }]} /></div>
        <div className="algo">
          <button className="algo-row" aria-expanded={algoOpen} onClick={() => setAlgoOpen(!algoOpen)}>
            <span>{t.algorithmRow}</span>
            <span className="algo-v">{env === 'rec' ? `GF ${gfHigh}` : `GF ${gfLow}/${gfHigh}`}</span>
            <Chevron open={algoOpen} />
          </button>
          {algoOpen && (
            <div className="algo-body">
              {env !== 'rec' && <NumRow label={t.gfLow} min={5} max={100} value={gfLow} onChange={setGfLow} />}
              <NumRow label={t.gfHigh} min={5} max={100} value={gfHigh} onChange={setGfHigh} />
              {env !== 'rec' && <SelectRow label={t.lastStop(u)} value={lastStopDepth} onChange={(v) => setLastStop(v)} options={[{ v: 6, l: u.stopDepth(6) }, { v: 3, l: u.stopDepth(3) }]} />}
              {env === 'open' && (
                <>
                  <div className="row stack">
                    <span className="row-l">{t.methodLabel}</span>
                    <Seg value={method} onChange={setMethod} options={[{ v: 'next' as const, l: t.methodStandard }, { v: 'current' as const, l: t.methodConservative }]} />
                    <span className="row-sub">{t.methodNote(method === 'current')}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet open={sheet === 'export'} onClose={closeSheet} label={t.exportTitle}>
        <div className="sheet-head"><h2>{t.exportTitle}</h2><button className="pill" onClick={closeSheet}>{t.done}</button></div>
        <div className="file">
          <div className="thumb"><span className="thumb-bar" /><span /><span /><span className="short" /><span /><span className="short" /></div>
          <div className="file-txt"><div className="file-name">{pdfName()}</div><div className="file-sub">{t.pdfDoc}</div></div>
        </div>
        <div className="sheet-btns">
          {!mobile && <button disabled={busy} onClick={() => { setSheet(null); doPrint(); }}>{t.print}</button>}
          {shareable && <button disabled={busy} onClick={() => doPdf('save')}>{t.saveFiles}</button>}
        </div>
        <Primary disabled={busy} onClick={() => doPdf(shareable ? 'share' : 'save')}>{busy ? '…' : shareable ? t.sharePdf : t.savePdf}</Primary>
      </Sheet>
      <Toast text={toast} />

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
          planOk={techOk} planTitle={techOk ? t.techFeasible(stdLabel) : t.techNotFeasible(stdLabel)} blockers={blockers}
        />
      )}
    </div>
  );
}
