import { Msg } from '../engine';
import { Units } from './units';

export type Lang = 'hu' | 'en';

const hu = {
  appTitle: 'BTT Dive Planner',
  subtitle: (gue: boolean, u: Units): string => `Bühlmann ZH-L16C + gradient factor · ${gue ? 'GUE standard gázok' : 'általános (PADI/SSI/TDI) gázok'} · ${u.sys === 'metric' ? 'metrikus' : 'angolszász egységek'}`,
  modeStandard: 'Standard terv',
  modeInventory: 'Saját gázaim',
  stdGue: 'GUE',
  stdGeneric: 'PADI / SSI',
  stdTitle: 'Gázszabvány',
  unitsTitle: 'Mértékegység',
  themeLight: 'Világos',
  themeDark: 'Sötét',
  themeTitle: 'Sötét mód',
  disclaimer: 'Fejlesztés alatt álló, nem validált szoftver. Tényleges merülés tervezésére csak megfelelő képzés és egy független tervezővel (pl. Subsurface, DecoPlanner) történő ellenőrzés mellett használható. A dekompressziós betegség kockázata soha nem nulla.',
  dive: 'Merülés',
  maxDepth: (u: Units) => `Max mélység (${u.d})`,
  bottomTime: 'Fenékidő (perc, leszállással)',
  bottomGas: 'Fenékgáz',
  autoBottomGas: (g: string) => `GUE standard automatikusan (${g})`,
  autoBottomGasGeneric: (g: string) => `Legjobb keverék automatikusan (${g})`,
  decoGases: 'Dekógázok (váltómélység)',
  recommended: 'Ajánlott',
  noneMinDeco: 'nincs (minimum dekó)',
  backGasAndSac: 'Háti gáz és fogyasztás',
  backCylinder: 'Háti palack',
  startPressure: (u: Units) => `Kezdőnyomás (${u.p})`,
  sacBottom: (u: Units) => `SAC fenék (${u.sac})`,
  sacDeco: (u: Units) => `SAC dekó (${u.sac})`,
  myGases: 'Milyen gázaim vannak',
  myGasesHint: 'Add meg a palackjaidat és a bennük lévő gázt. Az első „háti" sor a fenékgáz, a többi dekó/stage.',
  roleBack: 'Háti',
  roleDeco: 'Dekó / stage',
  roleBackShort: 'háti',
  roleDecoShort: 'dekó',
  remove: 'eltávolít',
  cylinder: 'Palack',
  role: 'Szerep',
  count: 'Darab',
  pressure: (u: Units) => `Nyomás (${u.p})`,
  addDeco: '+ dekópalack',
  addBack: '+ háti palack',
  algorithm: 'Algoritmus',
  gfLow: 'GF low %',
  gfHigh: 'GF high %',
  lastStop: (u: Units) => `Utolsó stop (${u.d})`,
  methodLabel: 'Számítási mód',
  methodStandard: 'Standard',
  methodConservative: 'Konzervatív',
  methodNote: (conservative: boolean): string => conservative
    ? 'Konzervatív: a GF-meredekséget az aktuális stop mélységén értékeli, ezért a mély stopok hosszabbak (dive-deco konvenció). Hosszabb dekó, nagyobb biztonsági tartalék.'
    : 'Standard: GF low az első stopnál, a továbbindulás feltétele a következő stop mélységén értékelve (Subsurface / Shearwater konvenció).',
  ratesNote: (shallow: number, u: Units): string => shallow === 9
    ? `Leszállás ${u.depthN(20)} ${u.rate}, felszállás ${u.depthN(9)} ${u.rate}.`
    : `Leszállás ${u.depthN(20)} ${u.rate}, felszállás ${u.depthN(9)} ${u.rate} az első stopig, majd ${u.depthN(shallow)} ${u.rate}.`,
  packing: 'Mit vigyél magaddal',
  minFill: 'min. töltés',
  overfill: 'nem fér a palackba',
  includesMinGas: (bar: number, u: Units) => `tartalmazza a ${u.pressure(bar)} minimum gázt`,
  withReserve: (f: number) => `×${f} tartalékkal`,
  feasibleTitle: 'Megmerülhető?',
  feasibleYes: 'Igen, ezekkel a gázokkal megmerülhető.',
  feasibleDetail: (d: number, t: number, mg: number, u: Units) => `${u.depth(d)} / ${t} perc, minimum gáz ${u.pressure(mg)} a háti palackban.`,
  feasibleNo: 'Ezt nem tudod megmerülni.',
  maxBottomTime: (bt: number, d: number, u: Units) => `Ezekkel a gázokkal legfeljebb ${bt} perc fenékidő tervezhető ${u.depth(d)}-en.`,
  gas: 'Gáz',
  haveL: (u: Units) => `Van (${u.v})`,
  needL: (u: Units) => `Kell (${u.v})`,
  reserveL: (u: Units) => `Tartalék (${u.v})`,
  plan: 'Terv',
  runtime: 'runtime (perc)',
  decoTotal: 'dekó összesen (perc)',
  firstStop: (u: Units) => `első stop (${u.d})`,
  stopCount: 'stopok száma',
  needBackGas: 'Adj meg legalább egy háti palackot a tervhez.',
  stops: 'Dekompressziós megállók',
  noStops: (gue: boolean, u: Units): string => gue
    ? `Nincs kötelező megálló. GUE „minimum deco" felszállás: ${u.depthN(9)} ${u.rate}, majd ${u.depthN(3)} ${u.rate} a felső ${u.stopDepth(6)}-en, ${u.stopDepth(6)}-en ajánlott 1–3 perc.`
    : `Nincs kötelező megálló. Ajánlott biztonsági megálló: 3 perc ${u.depth(5)}-en.`,
  depth: (u: Units) => `Mélység (${u.d})`,
  minutes: 'Idő (perc)',
  runtimeCol: 'Runtime',
  gasPlan: 'Gázterv',
  minGas: 'Minimum gáz',
  minGasDesc: (divers: number, sac: number, problem: number, from: number, to: number, u: Units) => `${divers} búvár × ${u.sacS(sac)}, ${problem} perc hibaelhárítás ${u.depth(from)}-en, felszállás ${u.depth(to)}-ig`,
  usableBackGas: (cyl: string, bar: number, u: Units) => `Felhasználható háti gáz (${cyl}, ${u.pressure(bar)})`,
  bottomPhaseNeed: 'Fenékfázis igény (leszállás + fenék)',
  ascentOnBackGas: 'Felszállás háti gázon',
  turnPressure: 'Fordulónyomás (nem penetrációs)',
  backGasEnough: 'Háti gáz elég?',
  yes: 'igen',
  no: 'nem',
  usagePerGas: 'Fogyasztás gázonként',
  litres: (u: Units): string => u.sys === 'metric' ? 'Liter' : 'Köbláb',
  barInCylinder: (u: Units) => `${u.p} a palackban`,
  endOverLimit: (e: number, u: Units) => `END ${u.depth(e)} meghaladja a ${u.depth(30)}-es GUE limitet.`,
  endOverLimitGeneric: (e: number, lim: number, u: Units) => `END ${u.depth(e)}, ${u.depth(lim)} felett a narkózis kockázata jelentős.`,
  backGasNotEnough: (shortBar: number, shortL: number, u: Units) => `A háti gáz nem elég: ${u.pressure(Math.ceil(shortBar))} (${u.volume(shortL)}) hiányzik a tervhez a minimum gáz megtartásával.`,
  overfillBy: (bar: number, u: Units) => `${u.pressure(bar)} hiányzik`,
  standardGasHint: (d: number, g: string, u: Units) => `A GUE standard fenékgáz ${u.depth(d)}-re: ${g}.`,
  standardGasHintGeneric: (d: number, g: string, u: Units) => `Ajánlott gáz ${u.depth(d)}-re: ${g}.`,
  itinerary: 'Itiner',
  itTime: 'Perc',
  itDepth: (u: Units) => `Mélység (${u.d})`,
  itAction: 'Teendő',
  itGas: 'Gáz',
  itStart: (g: string) => `Leszállás indul ${g} gázon (20 m/min)`,
  itArrive: 'Fenékmélység elérve, fenékidő indul',
  itLeave: (g: string) => `Fenékidő vége, felszállás indul ${g} gázon`,
  itSwitch: (from: string, to: string, u: Units, d: number) => `Gázváltás ${u.stopDepth(d)}-en: ${from} → ${to}, palackváltás, ellenőrzés`,
  itStop: (min: number, until: number, u: Units, d: number) => `Megállás ${u.stopDepth(d)}-en ${min} perc, indulás a ${until}. percben`,
  itSurface: 'Felszín, merülés vége',
  msg: (m: Msg, u: Units): string => {
    const p = m.params;
    const n = (k: string) => Number(p[k]);
    switch (m.code) {
      case 'bottomTimeShorterThanDescent': return 'A fenékidő rövidebb, mint a leszállási idő.';
      case 'stopTooLong': return 'A dekompressziós megálló meghaladja a 600 percet, a terv nem reális.';
      case 'ppo2AboveMax': return `A fenékgáz (${p.gas}) pO2 értéke ${p.ppo2} bar ${u.depth(n('depth'))}-en, meghaladja a ${p.limit} bar maximumot. MOD: ${u.depth(n('mod'))}.`;
      case 'ppo2AboveWorking': return `A fenékgáz (${p.gas}) pO2 értéke ${p.ppo2} bar, a munkalimit ${p.limit} bar.`;
      case 'hypoxicBottomGas': return `A fenékgáz (${p.gas}) hipoxiás sekélyen (pO2 ${p.ppo2}).`;
      case 'decoSwitchExceedsMod': return `${p.gas} váltása ${u.depth(n('depth'))}-en meghaladja a MOD-ot (${u.depth(n('mod'), 1)}, pO2 ${p.limit}).`;
      case 'noBackGas': return 'Nincs háti gáz megadva.';
      case 'multipleBackGas': return 'Több háti palack van megadva, csak az elsőt használom fenékgáznak.';
      case 'backEndAboveLimit': return `END ${u.depth(n('end'))} a háti gázzal (${p.gas}), a limit ${u.depth(n('limit'))}. Több hélium kell.`;
      case 'endHigh': return `END ${u.depth(n('end'))} a háti gázzal (${p.gas}), ${u.depth(n('limit'))} felett a narkózis kockázata jelentős.`;
      case 'backHypoxicAtSurface': return `A háti gáz (${p.gas}) hipoxiás a felszínen (pO2 ${p.ppo2}), utazógázra van szükség.`;
      case 'decoSwitchNotShallower': return `${p.gas} váltómélysége (${u.depth(n('depth'))}) nem sekélyebb a max mélységnél, nem használom.`;
      case 'duplicateSwitchDepth': return `${p.gas}: két dekógáz azonos váltómélységgel (${u.depth(n('depth'))}), csak az elsőt használom.`;
      case 'gasShort': return `${p.gas} (${p.role === 'back' ? 'háti' : 'dekó'}): ${u.volume(n('short'))} hiányzik (szükséges ${u.volume(n('needed'))} + ${u.volume(n('reserve'))} tartalék, van ${u.volume(n('available'))}).`;
      case 'missingGas': return `Hiányzó gáz: ${p.gas}.`;
    }
  },
  isBlocking: (m: Msg) => ['ppo2AboveMax', 'decoSwitchExceedsMod', 'backEndAboveLimit', 'gasShort', 'missingGas', 'noBackGas', 'stopTooLong'].includes(m.code),
};

export type Dict = typeof hu;

const en: Dict = {
  appTitle: 'BTT Dive Planner',
  subtitle: (gue, u) => `Bühlmann ZH-L16C + gradient factors · ${gue ? 'GUE standard gases' : 'common (PADI/SSI/TDI) gases'} · ${u.sys === 'metric' ? 'metric' : 'imperial units'}`,
  modeStandard: 'Standard plan',
  modeInventory: 'My gases',
  stdGue: 'GUE',
  stdGeneric: 'PADI / SSI',
  stdTitle: 'Gas standard',
  unitsTitle: 'Units',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeTitle: 'Dark mode',
  disclaimer: 'Unvalidated software under development. Do not use it to plan real dives without proper training and a cross-check against an independent planner (e.g. Subsurface, DecoPlanner). The risk of decompression sickness is never zero.',
  dive: 'Dive',
  maxDepth: (u) => `Max depth (${u.d})`,
  bottomTime: 'Bottom time (min, incl. descent)',
  bottomGas: 'Bottom gas',
  autoBottomGas: (g) => `GUE standard, automatic (${g})`,
  autoBottomGasGeneric: (g) => `Best mix, automatic (${g})`,
  decoGases: 'Deco gases (switch depth)',
  recommended: 'Recommended',
  noneMinDeco: 'none (minimum deco)',
  backGasAndSac: 'Back gas and consumption',
  backCylinder: 'Back cylinder',
  startPressure: (u) => `Start pressure (${u.p})`,
  sacBottom: (u) => `SAC bottom (${u.sac})`,
  sacDeco: (u) => `SAC deco (${u.sac})`,
  myGases: 'What gases do I have',
  myGasesHint: 'Enter your cylinders and the gas in them. The first "back" row is the bottom gas, the rest are deco/stage.',
  roleBack: 'Back gas',
  roleDeco: 'Deco / stage',
  roleBackShort: 'back',
  roleDecoShort: 'deco',
  remove: 'remove',
  cylinder: 'Cylinder',
  role: 'Role',
  count: 'Count',
  pressure: (u) => `Pressure (${u.p})`,
  addDeco: '+ deco cylinder',
  addBack: '+ back cylinder',
  algorithm: 'Algorithm',
  gfLow: 'GF low %',
  gfHigh: 'GF high %',
  lastStop: (u) => `Last stop (${u.d})`,
  methodLabel: 'Calculation method',
  methodStandard: 'Standard',
  methodConservative: 'Conservative',
  methodNote: (conservative) => conservative
    ? 'Conservative: the GF slope is evaluated at the current stop depth, so deep stops are longer (dive-deco convention). Longer deco, larger safety margin.'
    : 'Standard: GF low at the first stop, the leave condition is evaluated at the next stop depth (Subsurface / Shearwater convention).',
  ratesNote: (shallow, u) => shallow === 9
    ? `Descent ${u.depthN(20)} ${u.rate}, ascent ${u.depthN(9)} ${u.rate}.`
    : `Descent ${u.depthN(20)} ${u.rate}, ascent ${u.depthN(9)} ${u.rate} to the first stop, then ${u.depthN(shallow)} ${u.rate}.`,
  packing: 'What to bring',
  minFill: 'min. fill',
  overfill: 'does not fit the cylinder',
  includesMinGas: (bar, u) => `includes ${u.pressure(bar)} minimum gas`,
  withReserve: (f) => `with ×${f} reserve`,
  feasibleTitle: 'Can I dive it?',
  feasibleYes: 'Yes, this dive is feasible with these gases.',
  feasibleDetail: (d, t, mg, u) => `${u.depth(d)} / ${t} min, minimum gas ${u.pressure(mg)} in the back cylinder.`,
  feasibleNo: 'You cannot dive this.',
  maxBottomTime: (bt, d, u) => `With these gases at most ${bt} min bottom time can be planned at ${u.depth(d)}.`,
  gas: 'Gas',
  haveL: (u) => `Have (${u.v})`,
  needL: (u) => `Need (${u.v})`,
  reserveL: (u) => `Reserve (${u.v})`,
  plan: 'Plan',
  runtime: 'runtime (min)',
  decoTotal: 'total deco (min)',
  firstStop: (u) => `first stop (${u.d})`,
  stopCount: 'number of stops',
  needBackGas: 'Add at least one back cylinder to get a plan.',
  stops: 'Decompression stops',
  noStops: (gue, u) => gue
    ? `No mandatory stops. GUE "minimum deco" ascent: ${u.depthN(9)} ${u.rate}, then ${u.depthN(3)} ${u.rate} over the last ${u.stopDepth(6)}, 1–3 min at ${u.stopDepth(6)} recommended.`
    : `No mandatory stops. Recommended safety stop: 3 min at ${u.depth(5)}.`,
  depth: (u) => `Depth (${u.d})`,
  minutes: 'Time (min)',
  runtimeCol: 'Runtime',
  gasPlan: 'Gas plan',
  minGas: 'Minimum gas',
  minGasDesc: (divers, sac, problem, from, to, u) => `${divers} divers × ${u.sacS(sac)}, ${problem} min problem solving at ${u.depth(from)}, ascent to ${u.depth(to)}`,
  usableBackGas: (cyl, bar, u) => `Usable back gas (${cyl}, ${u.pressure(bar)})`,
  bottomPhaseNeed: 'Bottom phase need (descent + bottom)',
  ascentOnBackGas: 'Ascent on back gas',
  turnPressure: 'Turn pressure (non-penetration)',
  backGasEnough: 'Enough back gas?',
  yes: 'yes',
  no: 'no',
  usagePerGas: 'Consumption per gas',
  litres: (u) => u.sys === 'metric' ? 'Litres' : 'Cubic feet',
  barInCylinder: (u) => `${u.p} in cylinder`,
  endOverLimit: (e, u) => `END ${u.depth(e)} exceeds the ${u.depth(30)} GUE limit.`,
  endOverLimitGeneric: (e, lim, u) => `END ${u.depth(e)}, above ${u.depth(lim)} narcosis risk is significant.`,
  backGasNotEnough: (shortBar, shortL, u) => `Not enough back gas: ${u.pressure(Math.ceil(shortBar))} (${u.volume(shortL)}) short of the plan while keeping minimum gas.`,
  overfillBy: (bar, u) => `${u.pressure(bar)} short`,
  standardGasHint: (d, g, u) => `GUE standard bottom gas for ${u.depth(d)}: ${g}.`,
  standardGasHintGeneric: (d, g, u) => `Suggested gas for ${u.depth(d)}: ${g}.`,
  itinerary: 'Itinerary',
  itTime: 'Min',
  itDepth: (u) => `Depth (${u.d})`,
  itAction: 'Action',
  itGas: 'Gas',
  itStart: (g) => `Start descent on ${g} (20 m/min)`,
  itArrive: 'Max depth reached, bottom time starts',
  itLeave: (g) => `Bottom time over, start ascent on ${g}`,
  itSwitch: (from, to, u, d) => `Gas switch at ${u.stopDepth(d)}: ${from} → ${to}, change cylinder, verify`,
  itStop: (min, until, u, d) => `Stop at ${u.stopDepth(d)} for ${min} min, leave at minute ${until}`,
  itSurface: 'Surface, dive complete',
  msg: (m, u) => {
    const p = m.params;
    const n = (k: string) => Number(p[k]);
    switch (m.code) {
      case 'bottomTimeShorterThanDescent': return 'Bottom time is shorter than the descent time.';
      case 'stopTooLong': return 'A decompression stop exceeds 600 minutes, the plan is not realistic.';
      case 'ppo2AboveMax': return `Bottom gas (${p.gas}) pO2 is ${p.ppo2} bar at ${u.depth(n('depth'))}, above the ${p.limit} bar maximum. MOD: ${u.depth(n('mod'))}.`;
      case 'ppo2AboveWorking': return `Bottom gas (${p.gas}) pO2 is ${p.ppo2} bar, the working limit is ${p.limit} bar.`;
      case 'hypoxicBottomGas': return `Bottom gas (${p.gas}) is hypoxic when shallow (pO2 ${p.ppo2}).`;
      case 'decoSwitchExceedsMod': return `Switching to ${p.gas} at ${u.depth(n('depth'))} exceeds its MOD (${u.depth(n('mod'), 1)}, pO2 ${p.limit}).`;
      case 'noBackGas': return 'No back gas specified.';
      case 'multipleBackGas': return 'Several back cylinders specified, only the first is used as bottom gas.';
      case 'backEndAboveLimit': return `END ${u.depth(n('end'))} on the back gas (${p.gas}), the limit is ${u.depth(n('limit'))}. More helium is needed.`;
      case 'endHigh': return `END ${u.depth(n('end'))} on the back gas (${p.gas}), above ${u.depth(n('limit'))} narcosis risk is significant.`;
      case 'backHypoxicAtSurface': return `Back gas (${p.gas}) is hypoxic at the surface (pO2 ${p.ppo2}), a travel gas is needed.`;
      case 'decoSwitchNotShallower': return `Switch depth of ${p.gas} (${u.depth(n('depth'))}) is not shallower than max depth, it is not used.`;
      case 'duplicateSwitchDepth': return `${p.gas}: two deco gases share the same switch depth (${u.depth(n('depth'))}), only the first is used.`;
      case 'gasShort': return `${p.gas} (${p.role}): ${u.volume(n('short'))} short (need ${u.volume(n('needed'))} + ${u.volume(n('reserve'))} reserve, have ${u.volume(n('available'))}).`;
      case 'missingGas': return `Missing gas: ${p.gas}.`;
    }
  },
  isBlocking: hu.isBlocking,
};

export const dict: Record<Lang, Dict> = { hu, en };

export function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('btt-lang');
    if (saved === 'hu' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('hu') ? 'hu' : 'en';
}
