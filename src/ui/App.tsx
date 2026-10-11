import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CYLINDERS, Cylinder, DEFAULT_SETTINGS, DecoGasSpec, DivePlan, Gas, GasUsage, STANDARDS, StandardId,
  InventoryItem, Msg, backGasPlan, end, evaluateInventory, gasName, minimumGas, mod, packingList, planConsumption, planDive, ppO2,
  roundBar, stopTable, itinerary, ItineraryEvent, sidemountSwitchesOnProfile, worstSingleCylinderLitres, defaultSwitchStep, msg, gasDensity, tissuesAfterDives, tissuesFromLog, altitudeToSurfacePressure, initialTissues, TissueState, PlanSettings, supersaturationTrace, ascentStart, GasSupply, lostGasScenarios, DiveInput, rangeTable, maxFeasibleBottomTime, CellIssue,
} from '../engine';
import { PrintSheet } from './PrintSheet';
import { GfChart, DensityVal, densityTone, Card, Chevron, Chip, Disclaimer, IconShare, RobotMark, IconSliders, KV, Label, Note, NumRow, Primary, ProfileCard, Seg, SelectRow, Sheet, Stat, Stats, Stepper, StopRows, Timeline, Toast, Toggle, Verdict, Warnings } from './kit';
import { PenetrationView, PenState, defaultPenState, usePenetrationPlan, penEventText } from './PenetrationView';
import { RecreationalView, RecState, defaultRecState, useRecreationalPlan, REC_GASES } from './RecreationalView';
import { RecPrintSheet, PenPrintSheet } from './PrintSheets';
import { BlendTool } from './BlendSheet';
import { Brief, BriefData } from './Brief';
import { PLAN_HASH, PlanLinkV1, decodePlanHash, planUrl } from './planLink';
import { RepetitiveCard, RepState, LogStatus, defaultRepState, epochOfLocal, localNow, parsePlannerContext, contextUrl, startSummary } from './Repetitive';
import { renderPdf, savePdf, sharePdf, canShareFiles, isMobileTauri, askConfirm } from './pdf';
import { Lang, dict, initialLang } from './i18n';
import { HOME_URL, LOG_URL, hostCookie, setHostCookie } from './host';
import { UnitSystem, makeUnits } from './units';
import logoUrl from '../assets/btt-logo.png';
import sadrobotUrl from '../assets/sadrobot.png';

type Mode = 'standard' | 'inventory';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  const host = hostCookie('theme');
  if (host === 'light' || host === 'dark') return host;
  if (HOME_URL) return 'dark';
  try {
    const saved = localStorage.getItem('btt-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* ignore */ }
  return 'dark'; // a sadrobot napló-rendszer alapja a sötét téma
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
  const setTab = (next: Tab) => {
    setTabRaw(next);
    const el = document.getElementById(`tab-${next}`);
    if (el && window.matchMedia?.('(min-width: 1024px)').matches) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0 });
  };
  const [sheet, setSheet] = useState<null | 'settings' | 'export' | 'blend' | 'share' | 'save'>(null);
  const [saveDate, setSaveDate] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'busy' | 'login' | 'error'>('idle');
  const [briefOpen, setBriefOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [algoOpen, setAlgoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 1800); return () => clearTimeout(id); }, [toast]);
  const closeSheet = useCallback(() => setSheet(null), []);
  const closeBrief = useCallback(() => setBriefOpen(false), []);
  const setEnv = async (target: Env) => {
    if (target === env) return;
    if (target === 'rec') { setEnvRaw('rec'); setTabRaw(TABS.rec[1]); return; }
    let acked = false;
    try { acked = sessionStorage.getItem(`btt-ack-${target}`) === '1'; } catch { /* ignore */ }
    if (!acked) {
      if (!(await askConfirm(target === 'open' ? t.confirmTech : t.confirmPen))) return;
      try { sessionStorage.setItem(`btt-ack-${target}`, '1'); } catch { /* ignore */ }
    }
    setEnvRaw(target);
    setTabRaw(TABS[target][1]);
  };
  // széles képernyőn (≥ 1024 px) a beállítás és az eredmények egymás mellett, fülsor nélkül
  const [wide, setWide] = useState(() => window.matchMedia?.('(min-width: 1024px)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(min-width: 1024px)');
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const [rec, setRec] = useState<RecState>(defaultRecState);
  const [pen, setPen] = useState<PenState>(defaultPenState);
  const [stdId, setStdId] = useState<StandardId>(() => stored('btt-std', ['gue', 'generic'], 'gue'));
  const [method, setMethod] = useState<'next' | 'current'>(() => stored('btt-method', ['next', 'current'], 'next'));
  const [maxDepth, setMaxDepth] = useState(45);
  const [bottomTime, setBottomTime] = useState(25);
  const [bottomGasIdx, setBottomGasIdx] = useState<number | 'auto' | 'custom'>('auto');
  // gases from a plan link that are not in the standard's list
  const [customBottom, setCustomBottom] = useState<Gas | null>(null);
  const [customDeco, setCustomDeco] = useState<{ gas: Gas; switchDepth: number; on: boolean }[]>([]);
  const [decoOn, setDecoOn] = useState<Record<string, boolean> | null>(null);
  const [gfLow, setGfLow] = useState(20);
  const [gfHigh, setGfHigh] = useState(85);
  const [descentRate, setDescentRate] = useState(DEFAULT_SETTINGS.descentRateMpm);
  const [ascentFast, setAscentFast] = useState(DEFAULT_SETTINGS.ascentRateMpm);
  const [ascentSlow, setAscentSlow] = useState<number | null>(null);
  const [rateChange, setRateChange] = useState(0);
  const [altitudeM, setAltitudeM] = useState(0);
  const [acclimatised, setAcclimatised] = useState(false);
  const [rep, setRep] = useState<RepState>(defaultRepState);
  const [logCtx, setLogCtx] = useState<LogStatus>({ status: 'idle' });
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
  const changeStandard = (id: StandardId) => { setStdId(id); setBottomGasIdx('auto'); setDecoOn(null); setLastStop(null); setCustomBottom(null); setCustomDeco([]); };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('btt-theme', theme); } catch { /* ignore */ }
    setHostCookie('theme', theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.appTitle;
    try { localStorage.setItem('btt-lang', lang); } catch { /* ignore */ }
    setHostCookie('lang', lang);
  }, [lang]);
  useEffect(() => { try { localStorage.setItem('btt-std', stdId); } catch { /* ignore */ } }, [stdId]);
  useEffect(() => { try { localStorage.setItem('btt-units', unitSys); } catch { /* ignore */ } }, [unitSys]);
  useEffect(() => { try { localStorage.setItem('btt-method', method); } catch { /* ignore */ } }, [method]);
  useEffect(() => { try { localStorage.setItem('btt-config', config); } catch { /* ignore */ } }, [config]);
  useEffect(() => { document.documentElement.dataset.env = env; }, [env]);

  const shallowRate = ascentSlow ?? std.ascentRateShallowMpm;
  // altitude: surface pressure from the barometric formula; not acclimatised → tissues still saturated at sea level (conservative)
  const surfaceBar = altitudeToSurfacePressure(altitudeM);
  const altStart: TissueState | undefined = altitudeM > 0 && !acclimatised ? initialTissues() : undefined;
  const coreSettings: PlanSettings = {
    ...DEFAULT_SETTINGS, gf: { low: gfLow / 100, high: gfHigh / 100 }, lastStopDepth, gfEvalAt: method,
    ascentRateShallowMpm: shallowRate, ppO2Working: L.bottomPpO2Working, ppO2Max: L.bottomPpO2Max, decoPpO2Max: L.decoPpO2Max,
    descentRateMpm: descentRate, ascentRateMpm: ascentFast, ...(rateChange > 0 ? { ascentRateChangeDepthM: rateChange } : {}),
    ...(altitudeM > 0 ? { surfacePressureBar: surfaceBar } : {}),
  };
  // repetitive dive: start tissues from previous dives (manual square profiles, or the logged profiles from the napló)
  const repKey = JSON.stringify([rep, coreSettings, !!altStart, logCtx.status]);
  const repResult = useMemo(() => {
    if (!rep.on) return null;
    if (rep.source === 'log') {
      if (logCtx.status !== 'ok') return null;
      const r = tissuesFromLog(logCtx.data.recent, epochOfLocal(rep.plannedStart), { surfacePressureBar: surfaceBar, start: altStart });
      return { tissues: r.tissues, used: r.used, unknown: r.unknownTime.length, future: r.future, count: r.used.length, log: true };
    }
    const dives = rep.dives.map((d) => ({ maxDepth: d.depth, bottomTime: d.bt, gas: { o2: d.o2 / 100, he: d.he / 100 }, surfaceIntervalMin: d.si }));
    return { tissues: tissuesAfterDives(dives, { settings: coreSettings, surfacePressureBar: surfaceBar, start: altStart }), used: [], unknown: 0, future: 0, count: dives.length, log: false };
  }, [repKey, logCtx]);
  const startTissues: TissueState | undefined = repResult?.tissues ?? altStart;
  const diveEnv = { ...(altitudeM > 0 ? { surfacePressureBar: surfaceBar } : {}), ...(startTissues ? { initialTissues: startTissues } : {}) };
  const settings: PlanSettings = { ...coreSettings, ...(startTissues ? { initialTissues: startTissues } : {}) };
  const settingsKey = JSON.stringify(settings);

  /* ---- standard mode ---- */
  const autoBottom = std.bottomGasFor(maxDepth);
  const stdBottomGas: Gas = bottomGasIdx === 'custom' && customBottom ? customBottom
    : bottomGasIdx === 'auto' || bottomGasIdx === 'custom' || bottomGasIdx >= std.bottomGases.length
      ? (autoBottom?.gas ?? std.bottomGases[std.bottomGases.length - 1].gas)
      : std.bottomGases[bottomGasIdx].gas;
  const recommended = std.recommendedDecoGasesFor(maxDepth);
  const decoSelection: Record<string, boolean> = decoOn ?? Object.fromEntries(std.decoGases.map((d) => [d.gas.name!, recommended.includes(d)]));
  const stdDecoGases: DecoGasSpec[] = [
    ...std.decoGases.filter((d) => decoSelection[d.gas.name!]).map((d) => ({ gas: d.gas, switchDepth: d.switchDepth })),
    ...customDeco.filter((d) => d.on).map((d) => ({ gas: d.gas, switchDepth: d.switchDepth })),
  ];
  const SM_CYLINDERS = CYLINDERS.filter((c) => c.name.startsWith('Single') || c.name.startsWith('AL80'));
  const smSingle = SM_CYLINDERS[smCylIdx] ?? SM_CYLINDERS[0];
  const cylinder: Cylinder = config === 'sidemount'
    ? { name: `2× ${smSingle.name.split(' (')[0]} (${t.configSidemount})`, volumeL: smSingle.volumeL * 2, workingPressureBar: smSingle.workingPressureBar }
    : CYLINDERS[cylIdx];
  const smStepBar = smStep ?? defaultSwitchStep(startBar);

  const stdPlan = useMemo(() => planDive({ maxDepth, bottomTime, bottomGas: stdBottomGas, decoGases: stdDecoGases, settings }),
    [maxDepth, bottomTime, stdBottomGas, stdDecoGases, settingsKey]);

  /* ---- inventory mode ---- */
  const verdict = useMemo(() => evaluateInventory(items, maxDepth, bottomTime, sacBottom, sacDeco, settings, 1.5, std),
    [items, maxDepth, bottomTime, sacBottom, sacDeco, settingsKey]);

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
  const gfTrace = useMemo(() => (plan ? supersaturationTrace(plan, { fromRuntime: ascentStart(plan), initialTissues: settings.initialTissues, surfacePressureBar: settings.surfacePressureBar }) : []), [plan]);
  const gfPeak = gfTrace.reduce((a, b) => (b.gf > a.gf ? b : a), gfTrace[0] ?? { t: 0, depth: 0, gf: 0, lead: 0 });

  /* ---- contingencies: lost deco gas (technical mode) ---- */
  const decoLitres: Record<string, number> | null = mode === 'inventory'
    ? items.filter((i) => i.role === 'deco').reduce<Record<string, number>>((m, i) => { const k = gasName(i.gas); m[k] = (m[k] ?? 0) + i.cylinder.volumeL * i.pressureBar * i.count; return m; }, {})
    : null;
  const supply: GasSupply = { backCylinder: backCyl, backStartBar: backStart, decoLitres, sacBottom, sacDeco };
  const diveInput: DiveInput = { maxDepth, bottomTime, bottomGas, decoGases, settings };
  const contKey = JSON.stringify([env, maxDepth, bottomTime, bottomGas, decoGases, settings, supply, plan?.runtime]);
  const range = useMemo(() => {
    if (env !== 'open' || !plan) return null;
    const limits = { ppO2Max: L.bottomPpO2Max };
    return { table: rangeTable(diveInput, supply, limits), maxBt: maxFeasibleBottomTime(diveInput, supply, limits) };
  }, [contKey, L.bottomPpO2Max]);
  const lostGas = useMemo(() => (env === 'open' && plan && decoGases.length ? lostGasScenarios(diveInput, plan, supply) : []), [contKey]);

  const bottomPpO2 = ppO2(bottomGas, maxDepth);
  const bottomEnd = end(bottomGas, maxDepth);
  const ppo2Class = bottomPpO2 > L.bottomPpO2Max ? 'bad' : bottomPpO2 > L.bottomPpO2Working ? 'warn' : 'ok';
  const endClass = L.maxEndM !== null && bottomEnd > L.maxEndM ? 'bad' : bottomEnd > L.warnEndM ? 'warn' : 'ok';
  const bottomDensity = gasDensity(bottomGas, maxDepth);

  const engineMsgs: Msg[] = mode === 'standard' ? stdPlan.warnings : verdict.warnings;
  const warnings: { text: string; bad: boolean }[] = engineMsgs.map((m) => ({ text: t.msg(m, u), bad: t.isBlocking(m) }));
  if (mode === 'standard') {
    if (L.maxEndM !== null && bottomEnd > L.maxEndM) warnings.push({ text: t.endOverLimit(bottomEnd, u), bad: true });
    else if (bottomEnd > L.warnEndM) warnings.push({ text: t.endOverLimitGeneric(bottomEnd, L.warnEndM, u), bad: false });
    if (bg && !bg.ok) warnings.push({ text: t.backGasNotEnough(bg.shortBar, bg.shortLitres, u), bad: true });
    if (bottomGasIdx !== 'auto' && autoBottom && autoBottom.gas !== stdBottomGas) warnings.push({ text: isGue ? t.standardGasHint(maxDepth, autoBottom.gas.name!, u) : t.standardGasHintGeneric(maxDepth, autoBottom.gas.name!, u), bad: false });
    if (sm && sm.lostShort > 0) warnings.push({ text: t.msg(msg('smLostCylinderMinGas', { short: Math.round(sm.lostShort) }), u), bad: true });
  }

  const recData = useRecreationalPlan(rec, gfHigh, diveEnv);
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

  const loadLog = async () => {
    setLogCtx({ status: 'loading' });
    try {
      const r = await fetch(contextUrl(), { credentials: 'include', headers: { Accept: 'application/json' } });
      if (r.status === 401) { setLogCtx({ status: 'login' }); return; }
      if (!r.ok) throw new Error(String(r.status));
      const data = parsePlannerContext(await r.json());
      if (!data) throw new Error('bad context');
      setLogCtx({ status: 'ok', data });
      setRep((x) => ({ ...x, on: true, source: 'log', plannedStart: localNow() }));
    } catch (err) { console.error(err); setLogCtx({ status: 'error' }); }
  };
  const applyLogSac = () => {
    if (logCtx.status !== 'ok' || !logCtx.data.sac) return;
    const clampSac = (v: number) => Math.max(5, Math.min(60, v));
    setSacBottom(clampSac(logCtx.data.sac.bottom)); setSacDeco(clampSac(logCtx.data.sac.deco));
    setRec((r) => ({ ...r, sac: clampSac(logCtx.data.sac!.bottom) }));
    setToast(t.toastSacApplied);
  };
  const repSum = repResult ? startSummary(repResult.tissues, surfaceBar) : null;
  const repCard = (
    <RepetitiveCard t={t} u={u} lang={lang} state={rep} setState={setRep} log={logCtx} onLoadLog={loadLog} onApplySac={applyLogSac}
      summary={repSum} used={repResult?.used ?? []} unknownCount={repResult?.unknown ?? 0} futureCount={repResult?.future ?? 0} />
  );

  /* ---------- shareable plan link (#plan=) ---------- */
  const frac = (g: Gas) => ({ o2: Math.round(g.o2 * 1000) / 1000, he: Math.round(g.he * 1000) / 1000 });
  const gasLabel = (g: Gas) => (g.he > 0 ? `Tx ${Math.round(g.o2 * 100)}/${Math.round(g.he * 100)}` : gasName(g));
  const curDepth = env === 'rec' ? rec.maxDepth : env === 'pen' ? pen.maxDepth : maxDepth;
  const curBt = env === 'rec' ? rec.bottomTime : env === 'pen' ? Math.round(penData.plan?.bottomTime ?? pen.plannedMinutes) : bottomTime;
  const curGas = env === 'rec' ? recData.gas : env === 'pen' ? penData.bottomGas : bottomGas;
  const defaultName = `${u.depth(curDepth)} / ${curBt}′ – ${gasLabel(curGas)}`;
  const buildPlan = (): PlanLinkV1 => {
    const base = { v: 1 as const, gfLow, gfHigh, lastStop: lastStopDepth, sacDeco, std: stdId, unit: unitSys, ...(altitudeM > 0 ? { altitudeM } : {}), name: planName.trim() || defaultName };
    if (env === 'rec') return { ...base, env: 'rec', maxDepth: rec.maxDepth, bottomTime: rec.bottomTime, bottomGas: frac(recData.gas), decoGases: [], sacBottom: rec.sac };
    if (env === 'pen') {
      return { ...base, env: 'pen', maxDepth: pen.maxDepth, bottomTime: curBt, bottomGas: frac(penData.bottomGas), sacBottom: pen.shared.sac,
        decoGases: penData.input.decoGases.map((d) => ({ ...frac(d.gas), switchDepth: d.switchDepth })), pen: { ...pen, brave: false } };
    }
    return { ...base, env: 'open', maxDepth, bottomTime, bottomGas: frac(bottomGas), sacBottom, decoGases: decoGases.map((d) => ({ ...frac(d.gas), switchDepth: d.switchDepth })) };
  };
  const sameGas = (a: { o2: number; he: number }, b: { o2: number; he: number }) => Math.abs(a.o2 - b.o2) < 0.005 && Math.abs(a.he - b.he) < 0.005;
  const applyPlan = async (p: PlanLinkV1) => {
    if (p.unit) setUnitSys(p.unit);
    const sid = p.std ?? stdId;
    if (p.std) setStdId(p.std);
    const S = STANDARDS[sid];
    setGfLow(p.gfLow); setGfHigh(p.gfHigh); setLastStop(p.lastStop);
    setSacBottom(p.sacBottom); setSacDeco(p.sacDeco);
    setAltitudeM(p.altitudeM ?? 0);
    setPlanName(p.name ?? '');
    if (p.env === 'rec') {
      const i = REC_GASES.findIndex((g) => sameGas(g.gas, p.bottomGas));
      setRec((r) => ({ ...r, maxDepth: p.maxDepth, bottomTime: p.bottomTime, sac: p.sacBottom, gasIdx: i >= 0 ? i : 'custom', customGas: i >= 0 ? undefined : { ...p.bottomGas } }));
    } else if (p.env === 'open') {
      setMode('standard'); setMaxDepth(p.maxDepth); setBottomTime(p.bottomTime);
      const bi = S.bottomGases.findIndex((g) => sameGas(g.gas, p.bottomGas));
      if (bi >= 0) { setBottomGasIdx(bi); setCustomBottom(null); } else { setCustomBottom({ ...p.bottomGas }); setBottomGasIdx('custom'); }
      const on: Record<string, boolean> = Object.fromEntries(S.decoGases.map((d) => [d.gas.name!, false]));
      const custom: { gas: Gas; switchDepth: number; on: boolean }[] = [];
      for (const d of p.decoGases) {
        const sd = S.decoGases.find((x) => sameGas(x.gas, d) && x.switchDepth === d.switchDepth);
        if (sd) on[sd.gas.name!] = true; else custom.push({ gas: { o2: d.o2, he: d.he }, switchDepth: d.switchDepth, on: true });
      }
      setDecoOn(on); setCustomDeco(custom);
    } else {
      setPen((x) => ({ ...x, ...(p.pen ?? {}), maxDepth: p.pen?.maxDepth ?? p.maxDepth, brave: false }));
    }
    if (p.env !== env) await setEnv(p.env); // technical / penetration still need the qualification confirmation
  };
  const applyRef = useRef(applyPlan);
  applyRef.current = applyPlan;
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    const load = () => {
      if (!location.hash.startsWith(PLAN_HASH)) return;
      const p = decodePlanHash(location.hash);
      try { history.replaceState(null, '', `${location.pathname}${location.search}`); } catch { /* ignore */ }
      if (!p) { setToast(tRef.current.linkInvalid); return; }
      void applyRef.current(p).then(() => setToast(tRef.current.linkLoaded));
    };
    load();
    window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, []);
  const shareUrl = sheet === 'share' ? planUrl(buildPlan()) : '';
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(shareUrl); setToast(t.shareCopied); }
    catch { const el = document.querySelector<HTMLTextAreaElement>('.share-url'); el?.select(); }
  };
  const nativeShare = async () => {
    try { await navigator.share({ title: planName.trim() || defaultName, url: shareUrl }); } catch { /* cancelled */ }
  };

  const signed = (v: number) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v))}`;
  const buildBrief = (): BriefData | null => {
    const title = planName.trim() || defaultName;
    const pills = ctxPills.map((p) => p.text);
    const notes = [...(repResult ? [t.briefRepNote] : []), ...(altitudeM > 0 ? [t.altitudeNote(acclimatised)] : []), t.disclaimer];
    const gasDetail = (g: Gas, d: number) => {
      const dens = gasDensity(g, d);
      const tone = densityTone(dens);
      return { detail: `pO2 ${ppO2(g, d).toFixed(2)} · END ${u.depth(end(g, d))} · ${fmt(dens, 1)} ${t.densityUnit}`, tone: tone === 'ok' ? undefined : tone };
    };
    if (env === 'rec') {
      const r = recData.plan;
      return {
        title, envLabel: t.envRec, verdict: { ok: r.feasible, title: r.feasible ? t.recFeasible : t.feasibleNo }, pills,
        kpis: [{ v: u.depth(rec.maxDepth), l: t.maxDepth(u) }, { v: `${rec.bottomTime}′`, l: t.bottomTime }, { v: r.ndlMinutes >= 999 ? '∞' : r.ndlMinutes, l: t.recNdl }, { v: fmt(r.runtime), l: t.runtime }, { v: u.pressure(r.turnBar), l: t.recTurn }],
        gases: [{ name: gasName(recData.gas), role: t.roleBottom, ...gasDetail(recData.gas, rec.maxDepth) }],
        stops: [], stopsEmpty: t.recSafetyStop(u.depth(5), 3),
        gasRows: [
          { l: t.recSurfaceWith(u.pressure(r.surfaceReserveBar)), v: u.pressure(r.surfaceReserveBar) },
          { l: t.recGasUsed, v: `${u.pressure(r.gasUsedBar)} · ${u.volume(r.gasUsedLitres)}` },
          { l: t.recSurfaceBar, v: u.pressure(r.surfaceBar), tone: r.gasOk ? 'ok' : 'bad' },
          { l: t.recRockBottom, v: u.pressure(r.rockBottomBar) },
        ],
        lostGas: [], warnings: [...r.blockers.map((m) => ({ text: t.msg(m, u), bad: true })), ...r.warnings.map((m) => ({ text: t.msg(m, u), bad: false }))], notes,
      };
    }
    if (env === 'pen') {
      const p = penData.plan;
      if (!p) return null;
      const lim = p.members.find((m) => m.member.id === p.limiting.id) ?? p.members[0];
      const pst = stopTable(p.deco);
      return {
        title, envLabel: t.envPen, verdict: { ok: p.feasible && !p.overridden, title: p.overridden ? t.penBraveActive : p.feasible ? t.penFeasible : t.feasibleNo }, pills,
        kpis: [{ v: u.pressure(lim.turnBar), l: t.teamTurnsAt }, { v: fmt(p.penetrationMinutes), l: t.penKpiPenMin }, { v: fmt(p.bottomTime), l: t.penKpiBottom }, { v: fmt(p.deco.decoTime), l: t.decoTotal }, { v: fmt(p.deco.runtime), l: t.runtime }],
        gases: [{ name: gasName(penData.bottomGas), role: t.roleBottom, ...gasDetail(penData.bottomGas, pen.maxDepth) },
          ...[...penData.input.decoGases].sort((a, b) => b.switchDepth - a.switchDepth).map((d) => ({ name: gasName(d.gas), role: t.roleDecoShort, detail: t.switchAt(u.stopDepth(d.switchDepth)) }))],
        stops: pst.map((x) => ({ depth: u.stopDepth(x.depth), minutes: x.minutes, runtime: Math.round(x.runtime + (p.bottomTime - p.deco.bottomTime)), gas: x.gas })), stopsEmpty: t.noStops(true, u),
        gasRows: p.members.map((m) => ({ l: `${m.member.name} · ${gasName(m.member.gas ?? penData.bottomGas)}`, v: `${u.pressureN(m.member.startBar)} → ${u.pressure(m.turnBar)}`, tone: m.sharedExitRemainingLitres < 0 ? 'bad' as const : undefined })),
        lostGas: [], warnings: [...p.blockers.map((m) => ({ text: t.msg(m, u), bad: true })), ...p.warnings.map((m) => ({ text: t.msg(m, u), bad: false }))], notes,
      };
    }
    if (!plan || !bg) return null;
    return {
      title, envLabel: t.envOpen, verdict: { ok: techOk, title: techOk ? t.techFeasible(stdLabel) : t.techNotFeasible(stdLabel) }, pills,
      kpis: [{ v: u.depth(maxDepth), l: t.maxDepth(u) }, { v: `${bottomTime}′`, l: t.bottomTime }, { v: fmt(plan.runtime), l: t.runtime }, { v: fmt(plan.decoTime), l: t.decoTotal },
        { v: plan.firstStopDepth === null ? '—' : u.stopDepth(plan.firstStopDepth), l: t.firstStop(u) }],
      gases: [{ name: gasName(bottomGas), role: t.roleBottom, ...gasDetail(bottomGas, maxDepth) },
        ...[...decoGases].sort((a, b) => b.switchDepth - a.switchDepth).map((d) => ({ name: gasName(d.gas), role: t.roleDecoShort, detail: `${t.switchAt(u.stopDepth(d.switchDepth))} · pO2 ${ppO2(d.gas, d.switchDepth).toFixed(2)}` }))],
      stops: stops.map((x) => ({ depth: u.stopDepth(x.depth), minutes: x.minutes, runtime: x.runtime, gas: x.gas })), stopsEmpty: t.noStops(isGue, u),
      gasRows: [
        { l: t.minGas, v: u.pressure(minGasBar) },
        { l: t.turnPressure, v: u.pressure(bg.turnPressureBar) },
        { l: t.backGasEnough, v: bg.ok ? t.yes : t.no, tone: bg.ok ? 'ok' : 'bad' },
        ...usage.map((x) => ({ l: x.name, v: u.volume(x.litres) })),
      ],
      lostGas: lostGas.map((sc) => ({ name: sc.name, text: t.lostGasRun(fmt(sc.plan.runtime), signed(sc.extraRuntime), fmt(sc.plan.decoTime), signed(sc.extraDeco)), status: sc.status, statusText: t.lostGasStatus(sc.status) })),
      warnings, notes,
    };
  };

  /* ---------- save to the logbook (embedded only): POST /api/plans ---------- */
  const todayLocal = () => localNow().slice(0, 10);
  const openSave = () => { if (!planName.trim()) setPlanName(defaultName); setSaveDate(todayLocal()); setSaveState('idle'); setSheet('save'); };
  const profilePlan: DivePlan | null = env === 'rec' ? recData.profile : env === 'pen' ? (penData.plan?.deco ?? null) : plan;
  const savePlan = async () => {
    if (!profilePlan) return;
    const p = buildPlan();
    const pts: { t: number; d: number }[] = [{ t: 0, d: 0 }];
    let rt = 0;
    for (const sg of profilePlan.segments) { rt += sg.duration; pts.push({ t: Math.round(rt * 60), d: Math.round(sg.endDepth * 10) / 10 }); }
    const gasesUsed = [p.bottomGas, ...p.decoGases].map((g) => ({ o2: Math.round(g.o2 * 1000) / 10, he: Math.round(g.he * 1000) / 10 }));
    const runtime = env === 'rec' ? recData.plan.runtime : profilePlan.runtime;
    const body = {
      name: (planName.trim() || defaultName).slice(0, 80),
      planned_for: /^\d{4}-\d{2}-\d{2}$/.test(saveDate) ? saveDate : null,
      plan: p,
      summary: { env: p.env, maxDepth: p.maxDepth, bottomTime: p.bottomTime, runtime: Math.round(runtime * 10) / 10, decoTime: Math.round(profilePlan.decoTime * 10) / 10, gfLow: p.gfLow, gfHigh: p.gfHigh, gases: gasesUsed },
      profile: pts,
    };
    setSaveState('busy');
    try {
      const r = await fetch(`${(HOME_URL ?? '/').replace(/\/$/, '')}/api/plans`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dive' }, body: JSON.stringify(body),
      });
      if (r.status === 401) { setSaveState('login'); return; }
      if (!r.ok) throw new Error(String(r.status));
      setSaveState('idle'); setSheet(null); setToast(t.saveLogSaved);
    } catch (err) { console.error(err); setSaveState('error'); }
  };

  /** context badges (altitude, repetitive dive) shown under the page head in every mode */
  const ctxPills: { text: string; tone?: 'warn' }[] = [];
  if (altitudeM > 0) ctxPills.push({ text: `⛰ ${t.altitudeBadge(u.depth(altitudeM), fmt(surfaceBar, 3))}`, tone: 'warn' });
  /** extra rows for the PDF dive card */
  const printExtraRows: { l: string; v: string }[] = [];
  if (repResult) ctxPills.push({ text: `↻ ${t.repBadge(repResult.count, repResult.log)}`, tone: 'warn' });
  if (repResult) printExtraRows.push({ l: t.repRow, v: `${t.repBadge(repResult.count, repResult.log)}${repSum ? ` · ${repSum.gf > 0 ? `GF ${fmt(repSum.gf * 100)}%` : ''} +${fmt(repSum.slowExcess * 100)}%` : ''}` });
  if (altitudeM > 0) printExtraRows.push({ l: t.altitudeRow, v: `${u.depth(altitudeM)} · ${fmt(surfaceBar, 3)} bar · ${acclimatised ? t.acclimatisedYes : t.acclimatisedNo}` });

  const tabLabel: Record<Tab, string> = { setup: t.tabSetup, plan: t.tabPlan, time: t.tabTimeline, gas: t.tabGasCheck, team: t.tabTeamGas, kit: t.tabKit, deco: t.tabDeco };
  const depthScale = u.sys === 'metric' ? 1 : 3.28084;
  const vol = (l: number) => fmt(u.volumeN(l), u.sys === 'metric' ? 0 : 1);
  const issueMark = (i: CellIssue) => (i === 'gas' ? 'G' : i === 'ppo2' ? 'O₂' : i === 'density' ? 'ρ' : 'D');
  const signedVol = (l: number) => `${l >= 0 ? '+' : '−'}${vol(Math.abs(l))}`;

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
              ...std.bottomGases.map((g, i) => ({ v: i as number | 'auto' | 'custom', l: `${g.gas.name} (${isGue ? `${u.depthN(g.minDepth)}–${u.depth(g.maxDepth)}` : `MOD ${u.depth(mod(g.gas, 1.4))}`})` })),
              ...(customBottom ? [{ v: 'custom' as const, l: `${gasName(customBottom)} (${t.fromLink}, MOD ${u.depth(Math.floor(mod(customBottom, L.bottomPpO2Max)))})` }] : [])]} />
          <div className="row stack">
            <span className="row-l">{t.decoGases}</span>
            <div className="tchips">
              {std.decoGases.map((d) => {
                const on = !!decoSelection[d.gas.name!];
                return <Toggle key={d.gas.name} on={on} onClick={() => setDecoOn({ ...decoSelection, [d.gas.name!]: !on })}>{d.gas.name} · {u.stopDepth(d.switchDepth)}</Toggle>;
              })}
              {customDeco.map((d, i) => (
                <Toggle key={`c${i}`} on={d.on} onClick={() => setCustomDeco(customDeco.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}>{gasName(d.gas)} · {u.stopDepth(d.switchDepth)} ({t.fromLink})</Toggle>
              ))}
            </div>
            <span className="row-sub">{t.recommended}: {recommended.length ? recommended.map((r) => r.gas.name).join(', ') : t.noneMinDeco}</span>
          </div>
          <div className="row info">
            {gasName(bottomGas)}: pO2 <b className={ppo2Class}>{bottomPpO2.toFixed(2)}</b> bar · END <b className={endClass}>{u.depth(bottomEnd)}</b> · MOD({L.bottomPpO2Working.toFixed(1)}) {u.depth(mod(bottomGas, L.bottomPpO2Working))} · {t.densityShort} <DensityVal gL={bottomDensity} locale={locale} unit={t.densityUnit} />
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
              {gasName(bottomGas)}: pO2 <b className={ppo2Class}>{bottomPpO2.toFixed(2)}</b> bar · END <b className={endClass}>{u.depth(bottomEnd)}</b> · MOD({L.bottomPpO2Working.toFixed(1)}) {u.depth(mod(bottomGas, L.bottomPpO2Working))} · {t.densityShort} <DensityVal gL={bottomDensity} locale={locale} unit={t.densityUnit} />
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
      {repCard}
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
      {gfTrace.length > 1 && plan.firstStopDepth !== null && (
        <GfChart points={gfTrace} gfLow={settings.gf.low} gfHigh={settings.gf.high} title={t.gfChartTitle} axes={t.gfChartAxes}
          note={t.gfChartNote(`${fmt(gfPeak.gf * 100)}%`, gfPeak.lead + 1)} />
      )}
      <Warnings items={warnings.filter((w) => !w.bad)} />
      <Label>{t.stops}</Label>
      {stops.length === 0 ? <Card><Note>{t.noStops(isGue, u)}</Note></Card> : (
        <StopRows unit={u.d} minLabel={t.minUnit} leaveAt={t.leaveAt} stops={stops.map((s) => ({ depth: u.stopDepthN(s.depth), minutes: s.minutes, runtime: s.runtime, gas: s.gas }))} />
      )}
      <Note>{t.ratesNote(descentRate, ascentFast, shallowRate, rateChange, u)}</Note>
      {range && (
        <>
          <Label>{t.rangeTitle}</Label>
          <Card className="list">
            <KV l={t.rangeMaxBottom} sub={t.rangeMaxBottomSub} v={range.maxBt === null ? t.rangeNone : `${range.maxBt} ${t.minUnit}`} tone={range.maxBt !== null && range.maxBt >= bottomTime ? 'ok' : 'bad'} />
            <div className="row stack">
              <table className="range">
                <thead><tr><th className="corner">{t.rangeHead(u)}</th>{range.table.times.map((tm) => <th key={tm}>{tm}</th>)}</tr></thead>
                <tbody>{range.table.depths.map((d, i) => (
                  <tr key={d}><th>{u.depthN(d)}</th>{range.table.cells[i].map((c) => (
                    <td key={c.bottomTime} className={`${c.feasible ? '' : 'bad'} ${d === maxDepth && c.bottomTime === bottomTime ? 'cur' : ''}`} title={c.issues.join(', ')}>
                      <b>{fmt(c.plan.runtime)}</b><small>{c.feasible ? fmt(c.plan.decoTime) : c.issues.map(issueMark).join(' ')}</small>
                    </td>
                  ))}</tr>
                ))}</tbody>
              </table>
              <span className="row-sub">{t.rangeLegend}</span>
            </div>
          </Card>
        </>
      )}
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
            <KV l={t.densityAt(gasName(bottomGas), u.depth(maxDepth))} sub={t.densityNote} v={`${fmt(bottomDensity, 1)} ${t.densityUnit}`} tone={densityTone(bottomDensity)} />
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
      {lostGas.length > 0 && (
        <>
          <Label>{t.lostGasTitle}</Label>
          <Card className="list">
            {lostGas.map((sc) => (
              <div className="lg-block" key={sc.name}>
                <div className="lg-head"><span className="gas-name">{t.lostGasIf(sc.name)}</span><span className={`st ${sc.status}`}>{t.lostGasStatus(sc.status)}</span></div>
                <div className="lg-sub">{t.lostGasRun(fmt(sc.plan.runtime), signed(sc.extraRuntime), fmt(sc.plan.decoTime), signed(sc.extraDeco))}</div>
                {sc.rows.map((r) => (
                  <div className={`lg-row ${r.status}`} key={r.name}>
                    <span><b>{r.name}</b> <small>{r.role === 'back' ? t.roleBackShort : t.roleDecoShort} · {t.lostGasExtra} {signedVol(r.neededL - r.baseNeededL)} {u.v}</small></span>
                    <span className="r">{vol(r.neededL)} / {vol(r.availableL)} {u.v}</span>
                  </div>
                ))}
              </div>
            ))}
          </Card>
          <Note>{t.lostGasNote}</Note>
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

  const renderTab = (tb: Tab) => env === 'rec'
    ? <RecreationalView t={t} u={u} lang={lang} gfHigh={gfHigh} tab={tb as 'setup' | 'plan' | 'time'} state={rec} setState={setRec} onShowPlan={() => setTab('plan')} env={diveEnv} extra={{ setup: repCard }} />
    : env === 'pen'
      ? <PenetrationView t={t} u={u} lang={lang} std={std} settings={settings} tab={tb as 'setup' | 'team' | 'kit' | 'deco'} state={pen} setState={setPen} onMatch={() => setTab('team')} onExport={() => setSheet('export')} />
      : tb === 'setup' ? techSetup : tb === 'plan' ? techPlan : techGas;
  const [setupTab, ...resultTabs] = TABS[env];
  const actionRow = canPrint ? (
    <div className="actions">
      <button onClick={() => setBriefOpen(true)}>{t.briefOpen}</button>
      <button onClick={() => setSheet('share')}>{t.shareAction}</button>
      {HOME_URL && <button onClick={openSave}>{t.saveLogAction}</button>}
    </div>
  ) : null;

  return (
    <div className="app">
      <header className="top">
        {HOME_URL
          ? <a className="brand" href={HOME_URL}><RobotMark />SADROBOT <small>// {t.navPlanner}</small></a>
          : <span className="brand"><RobotMark />SADROBOT <small>// {t.navPlanner}</small></span>}
        {HOME_URL && (
          <nav className="main" aria-label={t.navLabel}>
            <a href={HOME_URL}>{t.navHome}</a>
            <a href="./" className="on" aria-current="page">{t.navPlanner}</a>
            {LOG_URL && <a href={LOG_URL}>{t.navLog}</a>}
          </nav>
        )}
        <div className="status">
          <button className="icon-btn txt" onClick={() => setLang(lang === 'hu' ? 'en' : 'hu')} title={t.langTitle} aria-label={t.langTitle}>{lang === 'hu' ? 'EN' : 'HU'}</button>
          <button className="icon-btn txt" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={t.appearance} aria-label={t.appearance}>◐</button>
          <button className="icon-btn" onClick={() => setSheet('export')} disabled={!canPrint} aria-label={t.exportTitle} title={canPrint ? t.exportTitle : t.exportNeedsPlan}><IconShare /></button>
          <button className="icon-btn" onClick={() => setSheet('settings')} aria-label={t.settingsTitle} title={t.settingsTitle}><IconSliders /></button>
        </div>
      </header>

      <main className="content">
        <div className="page-head">
          <div className="title-block">
            <img className="logo" src={logoUrl} alt="BTT Explorers Hungary" />
            <div className="title-txt">
              <p className="eyebrow">{t.subtitle(isGue, u)}</p>
              <h1>{t.appTitle}</h1>
            </div>
          </div>
          <div className="modes" role="tablist" aria-label={t.modesLabel}>
            {(['rec', 'open', 'pen'] as Env[]).map((m) => (
              <button key={m} role="tab" aria-selected={env === m} className={`m-${m} ${env === m ? 'on' : ''}`} onClick={() => setEnv(m)}>{m === 'rec' ? t.envRec : m === 'open' ? t.envOpen : t.envPen}</button>
            ))}
          </div>
        </div>
        {ctxPills.length > 0 && <div className="ctx-pills">{ctxPills.map((p, i) => <span key={i} className={`ctx-pill ${p.tone ?? ''}`}>{p.text}</span>)}</div>}
        {(wide || tab === 'setup') && <Disclaimer text={t.disclaimer} />}
        {wide ? (
          <div className="cols" key={env}>
            <section className="col col-setup" id={`tab-${setupTab}`} aria-label={tabLabel[setupTab]}>
              <h2 className="col-h">{tabLabel[setupTab]}</h2>
              {renderTab(setupTab)}
            </section>
            <div className="col col-results">
              {actionRow}
              {resultTabs.map((id) => (
                <section className="col-sec" id={`tab-${id}`} key={id} aria-label={tabLabel[id]}>
                  <h2 className="col-h">{tabLabel[id]}</h2>
                  {renderTab(id)}
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="stack" key={`${env}-${tab}`}>{tab !== setupTab && actionRow}{renderTab(tab)}</div>
        )}
        <footer className="footer2">
          <img src={logoUrl} alt="" aria-hidden="true" />
          <span className="motto">Mindig van lejjebb!!!</span>
          <span className="credit"><img className="sricon" src={sadrobotUrl} alt="sadrobot" />BTT Explorers Hungary · 2018 · made by sadrobot · v{__APP_VERSION__}</span>
          <span className="rights">{t.rights}</span>
        </footer>
      </main>

      {!wide && (
        <nav className="tabbar" role="tablist">
          <div className="tabbar-inner">
            {TABS[env].map((id) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{tabLabel[id]}</button>
            ))}
          </div>
        </nav>
      )}

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
              {env !== 'rec' && (
                <>
                  <NumRow label={t.descentRate(u)} min={u.depthN(3)} max={u.depthN(30)} value={u.depthN(descentRate)} onChange={(v) => setDescentRate(Math.max(3, Math.min(30, u.toM(v))))} />
                  <NumRow label={t.ascentFast(u)} min={u.depthN(1)} max={u.depthN(18)} value={u.depthN(ascentFast)} onChange={(v) => setAscentFast(Math.max(1, Math.min(18, u.toM(v))))} />
                  <NumRow label={t.ascentSlow(u)} min={u.depthN(1)} max={u.depthN(18)} value={u.depthN(shallowRate)} onChange={(v) => setAscentSlow(Math.max(1, Math.min(18, u.toM(v))))} />
                  <NumRow label={t.ascentChange(u)} min={0} max={u.depthN(60)} value={u.depthN(rateChange)} onChange={(v) => setRateChange(Math.max(0, Math.min(60, Math.round(u.toM(v)))))} />
                </>
              )}
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
        <div className="sheet-field"><span>{t.altitudeTitle}</span>
          <div className="algo">
            <div className="algo-body">
              <NumRow label={t.altitudeLabel(u)} min={0} max={u.depthN(4500)} value={u.depthN(altitudeM)} onChange={(v) => setAltitudeM(Math.max(0, Math.min(4500, Math.round(u.toM(v)))))} />
              {altitudeM > 0 && (
                <div className="row stack">
                  <span className="row-l">{t.acclimatised}</span>
                  <Seg value={acclimatised} onChange={setAcclimatised} options={[{ v: false, l: t.acclimatisedNo }, { v: true, l: t.acclimatisedYes }]} />
                  <span className="row-sub">{t.altitudeBadge(u.depth(altitudeM), fmt(surfaceBar, 3))}. {t.altitudeNote(acclimatised)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="sheet-field"><span>{t.toolsTitle}</span>
          <button className="btn-secondary" onClick={() => setSheet('blend')}>{t.blendOpen}</button>
        </div>
      </Sheet>

      <Sheet open={sheet === 'blend'} onClose={closeSheet} label={t.blendTitle}>
        <div className="sheet-head"><h2>{t.blendTitle}</h2><button className="pill" onClick={closeSheet}>{t.done}</button></div>
        <BlendTool t={t} u={u} lang={lang} />
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
      <Sheet open={sheet === 'share'} onClose={closeSheet} label={t.shareTitle}>
        <div className="sheet-head"><h2>{t.shareTitle}</h2><button className="pill" onClick={closeSheet}>{t.done}</button></div>
        <div className="sheet-field"><span>{t.planNameLabel}</span>
          <input className="text-field" value={planName} placeholder={defaultName} maxLength={80} onChange={(e) => setPlanName(e.target.value)} />
        </div>
        <textarea className="share-url" readOnly rows={4} value={shareUrl} onFocus={(e) => e.currentTarget.select()} />
        <div className="sheet-btns">
          <button onClick={copyLink}>{t.shareCopy}</button>
          {canNativeShare && <button onClick={nativeShare}>{t.shareNative}</button>}
          <button onClick={() => { setSheet(null); setBriefOpen(true); }}>{t.briefOpen}</button>
        </div>
        <Note>{t.shareNote}</Note>
      </Sheet>
      <Sheet open={sheet === 'save'} onClose={closeSheet} label={t.saveLogTitle}>
        <div className="sheet-head"><h2>{t.saveLogTitle}</h2><button className="pill" onClick={closeSheet}>{t.done}</button></div>
        <div className="sheet-field"><span>{t.planNameLabel}</span>
          <input className="text-field" value={planName} placeholder={defaultName} maxLength={80} onChange={(e) => setPlanName(e.target.value)} />
        </div>
        <div className="sheet-field"><span>{t.saveLogDate}</span>
          <input className="text-field" type="date" value={saveDate} onChange={(e) => setSaveDate(e.target.value)} />
        </div>
        {saveState === 'login' && <Verdict tone="bad" title={t.saveLogLogin}>{LOG_URL && <a href={LOG_URL}>{t.navLog} →</a>}</Verdict>}
        {saveState === 'error' && <Verdict tone="bad" title={t.saveLogError} />}
        <Primary disabled={saveState === 'busy' || !profilePlan} onClick={savePlan}>{saveState === 'busy' ? '…' : t.saveLogSave}</Primary>
        <Note>{t.saveLogNote}</Note>
      </Sheet>
      {briefOpen && (() => { const b = buildBrief(); return b ? <Brief t={t} data={b} onClose={closeBrief} /> : null; })()}
      <Toast text={toast} />

      {env === 'rec' && (
        <RecPrintSheet t={t} u={u} lang={lang} input={recData.input} plan={recData.plan} events={recData.events} cylinderName={recData.cyl.name} extraRows={printExtraRows} />
      )}
      {env === 'pen' && penData.plan && (
        <PenPrintSheet t={t} u={u} lang={lang} input={penData.input} plan={penData.plan} events={penData.events}
          agencyLabel={pen.agency.toUpperCase()} envLabel={pen.environment === 'cave' ? t.penCave : pen.environment === 'mine' ? t.penMine : t.penWreck}
          extraRows={printExtraRows}
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
          lostGas={lostGas} extraRows={printExtraRows}
        />
      )}
    </div>
  );
}
