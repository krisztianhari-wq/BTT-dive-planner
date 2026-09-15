import { Msg } from '../engine';

export type Lang = 'hu' | 'en';

const hu = {
  appTitle: 'BTT Dive Planner',
  subtitle: 'Bühlmann ZH-L16C + gradient factor · GUE standard gázok · metrikus',
  modeStandard: 'Standard terv',
  modeInventory: 'Saját gázaim',
  stdGue: 'GUE',
  stdGeneric: 'PADI / SSI',
  stdTitle: 'Gázszabvány',
  subtitleGue: 'Bühlmann ZH-L16C + gradient factor · GUE standard gázok · metrikus',
  subtitleGeneric: 'Bühlmann ZH-L16C + gradient factor · általános (PADI/SSI/TDI) gázok · metrikus',
  autoBottomGasGeneric: (g: string) => `Legjobb keverék automatikusan (${g})`,
  endOverLimitGeneric: (e: string, lim: number) => `END ${e} m, ${lim} m felett a narkózis kockázata jelentős.`,
  standardGasHintGeneric: (d: number, g: string) => `Ajánlott gáz ${d} m-re: ${g}.`,
  themeLight: 'Világos',
  themeDark: 'Sötét',
  themeTitle: 'Sötét mód',
  disclaimer: 'Fejlesztés alatt álló, nem validált szoftver. Tényleges merülés tervezésére csak megfelelő képzés és egy független tervezővel (pl. Subsurface, DecoPlanner) történő ellenőrzés mellett használható. A dekompressziós betegség kockázata soha nem nulla.',
  dive: 'Merülés',
  maxDepth: 'Max mélység (m)',
  bottomTime: 'Fenékidő (perc, leszállással)',
  bottomGas: 'Fenékgáz',
  autoBottomGas: (g: string) => `GUE standard automatikusan (${g})`,
  decoGases: 'Dekógázok (váltómélység)',
  recommended: 'Ajánlott',
  noneMinDeco: 'nincs (minimum dekó)',
  backGasAndSac: 'Háti gáz és fogyasztás',
  backCylinder: 'Háti palack',
  startPressure: 'Kezdőnyomás (bar)',
  sacBottom: 'SAC fenék (l/min)',
  sacDeco: 'SAC dekó (l/min)',
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
  pressure: 'Nyomás (bar)',
  addDeco: '+ dekópalack',
  addBack: '+ háti palack',
  algorithm: 'Algoritmus',
  gfLow: 'GF low %',
  gfHigh: 'GF high %',
  lastStop: 'Utolsó stop (m)',
  ratesNote: (shallow: number): string => shallow === 9 ? 'Leszállás 20 m/min, felszállás 9 m/min.' : `Leszállás 20 m/min, felszállás 9 m/min az első stopig, majd ${shallow} m/min.`,
  packing: 'Mit vigyél magaddal',
  minFill: 'min. töltés',
  overfill: 'nem fér a palackba',
  includesMinGas: (bar: number) => `tartalmazza a ${bar} bar minimum gázt`,
  withReserve: (f: number) => `×${f} tartalékkal`,
  feasibleTitle: 'Megmerülhető?',
  feasibleYes: 'Igen, ezekkel a gázokkal megmerülhető.',
  feasibleDetail: (d: number, t: number, mg: number) => `${d} m / ${t} perc, minimum gáz ${mg} bar a háti palackban.`,
  feasibleNo: 'Ezt nem tudod megmerülni.',
  maxBottomTime: (bt: number, d: number) => `Ezekkel a gázokkal legfeljebb ${bt} perc fenékidő tervezhető ${d} m-en.`,
  gas: 'Gáz',
  haveL: 'Van (L)',
  needL: 'Kell (L)',
  reserveL: 'Tartalék (L)',
  plan: 'Terv',
  runtime: 'runtime (perc)',
  decoTotal: 'dekó összesen (perc)',
  firstStop: 'első stop (m)',
  stopCount: 'stopok száma',
  needBackGas: 'Adj meg legalább egy háti palackot a tervhez.',
  stops: 'Dekompressziós megállók',
  noStops: (gue: boolean): string => gue ? 'Nincs kötelező megálló. GUE „minimum deco" felszállás: 9 m/min, majd 3 m/min a felső 6 m-en, 6 m-en ajánlott 1–3 perc.' : 'Nincs kötelező megálló. Ajánlott biztonsági megálló: 3 perc 5 m-en.',
  depth: 'Mélység (m)',
  minutes: 'Idő (perc)',
  runtimeCol: 'Runtime',
  gasPlan: 'Gázterv',
  minGas: 'Minimum gáz',
  minGasDesc: (divers: number, sac: number, problem: number, from: number, to: number) => `${divers} búvár × ${sac} l/min, ${problem} perc hibaelhárítás ${from} m-en, felszállás ${to} m-ig`,
  usableBackGas: (cyl: string, bar: number) => `Felhasználható háti gáz (${cyl}, ${bar} bar)`,
  bottomPhaseNeed: 'Fenékfázis igény (leszállás + fenék)',
  ascentOnBackGas: 'Felszállás háti gázon',
  turnPressure: 'Fordulónyomás (nem penetrációs)',
  backGasEnough: 'Háti gáz elég?',
  yes: 'igen',
  no: 'nem',
  usagePerGas: 'Fogyasztás gázonként',
  litres: 'Liter',
  barInCylinder: 'Bar a palackban',
  endOverLimit: (e: string) => `END ${e} m meghaladja a 30 m-es GUE limitet.`,
  backGasNotEnough: 'A háti gáz nem elég a tervezett fenékidőre a minimum gáz megtartásával.',
  standardGasHint: (d: number, g: string) => `A GUE standard fenékgáz ${d} m-re: ${g}.`,
  msg: (m: Msg): string => {
    const p = m.params;
    switch (m.code) {
      case 'bottomTimeShorterThanDescent': return 'A fenékidő rövidebb, mint a leszállási idő.';
      case 'stopTooLong': return 'A dekompressziós megálló meghaladja a 600 percet, a terv nem reális.';
      case 'ppo2AboveMax': return `A fenékgáz (${p.gas}) pO2 értéke ${p.ppo2} bar ${p.depth} m-en, meghaladja a ${p.limit} bar maximumot. MOD: ${p.mod} m.`;
      case 'ppo2AboveWorking': return `A fenékgáz (${p.gas}) pO2 értéke ${p.ppo2} bar, a munkalimit ${p.limit} bar.`;
      case 'hypoxicBottomGas': return `A fenékgáz (${p.gas}) hipoxiás sekélyen (pO2 ${p.ppo2}).`;
      case 'decoSwitchExceedsMod': return `${p.gas} váltása ${p.depth} m-en meghaladja a MOD-ot (${p.mod} m, pO2 ${p.limit}).`;
      case 'noBackGas': return 'Nincs háti gáz megadva.';
      case 'multipleBackGas': return 'Több háti palack van megadva, csak az elsőt használom fenékgáznak.';
      case 'backEndAboveLimit': return `END ${p.end} m a háti gázzal (${p.gas}), a limit ${p.limit} m. Több hélium kell.`;
      case 'endHigh': return `END ${p.end} m a háti gázzal (${p.gas}), ${p.limit} m felett a narkózis kockázata jelentős.`;
      case 'backHypoxicAtSurface': return `A háti gáz (${p.gas}) hipoxiás a felszínen (pO2 ${p.ppo2}), utazógázra van szükség.`;
      case 'decoSwitchNotShallower': return `${p.gas} váltómélysége (${p.depth} m) nem sekélyebb a max mélységnél, nem használom.`;
      case 'duplicateSwitchDepth': return `${p.gas}: két dekógáz azonos váltómélységgel (${p.depth} m), csak az elsőt használom.`;
      case 'gasShort': return `${p.gas} (${p.role === 'back' ? 'háti' : 'dekó'}): ${p.short} liter hiányzik (szükséges ${p.needed} L + ${p.reserve} L tartalék, van ${p.available} L).`;
      case 'missingGas': return `Hiányzó gáz: ${p.gas}.`;
    }
  },
  isBlocking: (m: Msg) => ['ppo2AboveMax', 'decoSwitchExceedsMod', 'backEndAboveLimit', 'gasShort', 'missingGas', 'noBackGas', 'stopTooLong'].includes(m.code),
};

export type Dict = typeof hu;

const en: Dict = {
  appTitle: 'BTT Dive Planner',
  subtitle: 'Bühlmann ZH-L16C + gradient factors · GUE standard gases · metric',
  modeStandard: 'Standard plan',
  modeInventory: 'My gases',
  stdGue: 'GUE',
  stdGeneric: 'PADI / SSI',
  stdTitle: 'Gas standard',
  subtitleGue: 'Bühlmann ZH-L16C + gradient factors · GUE standard gases · metric',
  subtitleGeneric: 'Bühlmann ZH-L16C + gradient factors · common (PADI/SSI/TDI) gases · metric',
  autoBottomGasGeneric: (g: string) => `Best mix, automatic (${g})`,
  endOverLimitGeneric: (e: string, lim: number) => `END ${e} m, above ${lim} m narcosis risk is significant.`,
  standardGasHintGeneric: (d: number, g: string) => `Suggested gas for ${d} m: ${g}.`,
  themeLight: 'Light',
  themeDark: 'Dark',
  themeTitle: 'Dark mode',
  disclaimer: 'Unvalidated software under development. Do not use it to plan real dives without proper training and a cross-check against an independent planner (e.g. Subsurface, DecoPlanner). The risk of decompression sickness is never zero.',
  dive: 'Dive',
  maxDepth: 'Max depth (m)',
  bottomTime: 'Bottom time (min, incl. descent)',
  bottomGas: 'Bottom gas',
  autoBottomGas: (g: string) => `GUE standard, automatic (${g})`,
  decoGases: 'Deco gases (switch depth)',
  recommended: 'Recommended',
  noneMinDeco: 'none (minimum deco)',
  backGasAndSac: 'Back gas and consumption',
  backCylinder: 'Back cylinder',
  startPressure: 'Start pressure (bar)',
  sacBottom: 'SAC bottom (l/min)',
  sacDeco: 'SAC deco (l/min)',
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
  pressure: 'Pressure (bar)',
  addDeco: '+ deco cylinder',
  addBack: '+ back cylinder',
  algorithm: 'Algorithm',
  gfLow: 'GF low %',
  gfHigh: 'GF high %',
  lastStop: 'Last stop (m)',
  ratesNote: (shallow: number): string => shallow === 9 ? 'Descent 20 m/min, ascent 9 m/min.' : `Descent 20 m/min, ascent 9 m/min to the first stop, then ${shallow} m/min.`,
  packing: 'What to bring',
  minFill: 'min. fill',
  overfill: 'does not fit the cylinder',
  includesMinGas: (bar: number) => `includes ${bar} bar minimum gas`,
  withReserve: (f: number) => `with ×${f} reserve`,
  feasibleTitle: 'Can I dive it?',
  feasibleYes: 'Yes, this dive is feasible with these gases.',
  feasibleDetail: (d: number, t: number, mg: number) => `${d} m / ${t} min, minimum gas ${mg} bar in the back cylinder.`,
  feasibleNo: 'You cannot dive this.',
  maxBottomTime: (bt: number, d: number) => `With these gases at most ${bt} min bottom time can be planned at ${d} m.`,
  gas: 'Gas',
  haveL: 'Have (L)',
  needL: 'Need (L)',
  reserveL: 'Reserve (L)',
  plan: 'Plan',
  runtime: 'runtime (min)',
  decoTotal: 'total deco (min)',
  firstStop: 'first stop (m)',
  stopCount: 'number of stops',
  needBackGas: 'Add at least one back cylinder to get a plan.',
  stops: 'Decompression stops',
  noStops: (gue: boolean): string => gue ? 'No mandatory stops. GUE "minimum deco" ascent: 9 m/min, then 3 m/min over the last 6 m, 1–3 min at 6 m recommended.' : 'No mandatory stops. Recommended safety stop: 3 min at 5 m.',
  depth: 'Depth (m)',
  minutes: 'Time (min)',
  runtimeCol: 'Runtime',
  gasPlan: 'Gas plan',
  minGas: 'Minimum gas',
  minGasDesc: (divers: number, sac: number, problem: number, from: number, to: number) => `${divers} divers × ${sac} l/min, ${problem} min problem solving at ${from} m, ascent to ${to} m`,
  usableBackGas: (cyl: string, bar: number) => `Usable back gas (${cyl}, ${bar} bar)`,
  bottomPhaseNeed: 'Bottom phase need (descent + bottom)',
  ascentOnBackGas: 'Ascent on back gas',
  turnPressure: 'Turn pressure (non-penetration)',
  backGasEnough: 'Enough back gas?',
  yes: 'yes',
  no: 'no',
  usagePerGas: 'Consumption per gas',
  litres: 'Litres',
  barInCylinder: 'Bar in cylinder',
  endOverLimit: (e: string) => `END ${e} m exceeds the 30 m GUE limit.`,
  backGasNotEnough: 'Back gas is not enough for the planned bottom time while keeping minimum gas.',
  standardGasHint: (d: number, g: string) => `GUE standard bottom gas for ${d} m: ${g}.`,
  msg: (m: Msg): string => {
    const p = m.params;
    switch (m.code) {
      case 'bottomTimeShorterThanDescent': return 'Bottom time is shorter than the descent time.';
      case 'stopTooLong': return 'A decompression stop exceeds 600 minutes, the plan is not realistic.';
      case 'ppo2AboveMax': return `Bottom gas (${p.gas}) pO2 is ${p.ppo2} bar at ${p.depth} m, above the ${p.limit} bar maximum. MOD: ${p.mod} m.`;
      case 'ppo2AboveWorking': return `Bottom gas (${p.gas}) pO2 is ${p.ppo2} bar, the working limit is ${p.limit} bar.`;
      case 'hypoxicBottomGas': return `Bottom gas (${p.gas}) is hypoxic when shallow (pO2 ${p.ppo2}).`;
      case 'decoSwitchExceedsMod': return `Switching to ${p.gas} at ${p.depth} m exceeds its MOD (${p.mod} m, pO2 ${p.limit}).`;
      case 'noBackGas': return 'No back gas specified.';
      case 'multipleBackGas': return 'Several back cylinders specified, only the first is used as bottom gas.';
      case 'backEndAboveLimit': return `END ${p.end} m on the back gas (${p.gas}), the limit is ${p.limit} m. More helium is needed.`;
      case 'endHigh': return `END ${p.end} m on the back gas (${p.gas}), above ${p.limit} m narcosis risk is significant.`;
      case 'backHypoxicAtSurface': return `Back gas (${p.gas}) is hypoxic at the surface (pO2 ${p.ppo2}), a travel gas is needed.`;
      case 'decoSwitchNotShallower': return `Switch depth of ${p.gas} (${p.depth} m) is not shallower than max depth, it is not used.`;
      case 'duplicateSwitchDepth': return `${p.gas}: two deco gases share the same switch depth (${p.depth} m), only the first is used.`;
      case 'gasShort': return `${p.gas} (${p.role}): ${p.short} litres short (need ${p.needed} L + ${p.reserve} L reserve, have ${p.available} L).`;
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
