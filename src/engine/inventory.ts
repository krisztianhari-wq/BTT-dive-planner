import { Gas, end, gasName, mod, ppO2 } from './gas';
import { GUE_STANDARD, GasStandard } from './standards';
import { DecoGasSpec, DivePlan, planDive, PlanSettings } from './planner';
import { Cylinder, GasUsage, minimumGas, planConsumption, roundBar, segmentConsumption } from './gasPlan';
import { Msg, msg } from './messages';

/** One line of the "what to bring" list. */
export interface PackingItem {
  cylinder: Cylinder;
  count: number;
  gas: Gas;
  gasLabel: string;
  role: 'back' | 'deco';
  /** minimum fill pressure per cylinder, bar, rounded up to 10 */
  fillBar: number;
  litresNeeded: number;
  /** required fill exceeds the cylinder's working pressure */
  overfill: boolean;
  /** why the fill is what it is: minimum gas included, or reserve factor applied */
  note: { kind: 'includesMinGas'; minGasBar: number } | { kind: 'withReserve'; factor: number };
}

const S40 = (cyls: Cylinder[]) => cyls.find((c) => c.name.startsWith('AL40'))!;
const S80 = (cyls: Cylinder[]) => cyls.find((c) => c.name.startsWith('AL80'))!;

/**
 * Build the packing list for a standard plan: back gas cylinder with required fill,
 * and one or more deco/stage cylinders per deco gas (S40 if it fits, else S80s).
 */
export function packingList(
  plan: DivePlan, usage: GasUsage[], backCylinder: Cylinder, minGasBar: number,
  bottomSac: number, decoSac: number, cylinders: Cylinder[], reserveFactor = 1.5,
): PackingItem[] {
  const bottomGas = plan.segments[0].gas;
  let backL = 0;
  for (const seg of plan.segments) {
    if (seg.gas !== bottomGas || seg.duration <= 0) continue;
    backL += segmentConsumption(seg, seg.kind === 'descent' || seg.kind === 'bottom' ? bottomSac : decoSac);
  }
  const items: PackingItem[] = [{
    cylinder: backCylinder, count: 1, gas: bottomGas, gasLabel: gasName(bottomGas), role: 'back',
    fillBar: roundBar(backL / backCylinder.volumeL + minGasBar), litresNeeded: backL,
    overfill: roundBar(backL / backCylinder.volumeL + minGasBar) > backCylinder.workingPressureBar,
    note: { kind: 'includesMinGas', minGasBar },
  }];
  for (const u of usage) {
    if (u.gas === bottomGas) continue;
    const need = u.litres * reserveFactor;
    const s40 = S40(cylinders), s80 = S80(cylinders);
    const usable = (c: Cylinder) => c.volumeL * c.workingPressureBar * 0.9;
    let cyl = need <= usable(s40) ? s40 : s80;
    const count = Math.max(1, Math.ceil(need / usable(cyl)));
    items.push({
      cylinder: cyl, count, gas: u.gas, gasLabel: u.name, role: 'deco',
      fillBar: Math.min(cyl.workingPressureBar, roundBar(need / count / cyl.volumeL)), litresNeeded: need,
      overfill: false,
      note: { kind: 'withReserve', factor: reserveFactor },
    });
  }
  return items;
}

/* ---------- "Milyen gázaim vannak" mode ---------- */

export interface InventoryItem {
  id: string;
  cylinder: Cylinder;
  count: number;
  gas: Gas;
  pressureBar: number;
  role: 'back' | 'deco';
}

export interface InventoryVerdict {
  feasible: boolean;
  /** hard blockers, dive not possible as planned */
  blockers: Msg[];
  /** soft warnings */
  warnings: Msg[];
  plan: DivePlan | null;
  usage: GasUsage[];
  /** per inventory item: available vs needed litres */
  balance: { item: InventoryItem; availableL: number; neededL: number; reserveL: number; ok: boolean }[];
  /** the longest bottom time (minutes) that would be feasible with this inventory, if the planned one is not */
  maxBottomTime: number | null;
  decoGasesUsed: DecoGasSpec[];
}

const availableLitres = (it: InventoryItem) => it.cylinder.volumeL * it.pressureBar * it.count;

/** Switch depth for an arbitrary deco gas: the standard's depth if it is a standard deco gas, else MOD(1.6) rounded down to 3 m. */
export function switchDepthFor(gas: Gas, standard: GasStandard = GUE_STANDARD): number {
  const std = standard.decoGases.find((d) => Math.abs(d.gas.o2 - gas.o2) < 0.005 && Math.abs(d.gas.he - gas.he) < 0.005);
  if (std) return std.switchDepth;
  return Math.max(3, Math.floor(mod(gas, standard.limits.decoPpO2Max) / 3) * 3);
}

export function evaluateInventory(
  items: InventoryItem[], maxDepth: number, bottomTime: number,
  bottomSac: number, decoSac: number, settings: Partial<PlanSettings>, reserveFactor = 1.5, standard: GasStandard = GUE_STANDARD,
): InventoryVerdict {
  const L = standard.limits;
  const blockers: Msg[] = [];
  const warnings: Msg[] = [];
  const back = items.filter((i) => i.role === 'back');
  if (back.length === 0) blockers.push(msg('noBackGas'));
  if (back.length > 1) warnings.push(msg('multipleBackGas'));
  const backItem = back[0];

  if (!backItem) return { feasible: false, blockers, warnings, plan: null, usage: [], balance: [], maxBottomTime: null, decoGasesUsed: [] };

  const bg = backItem.gas;
  const p = ppO2(bg, maxDepth);
  if (p > L.bottomPpO2Max) blockers.push(msg('ppo2AboveMax', { gas: gasName(bg), ppo2: p.toFixed(2), depth: maxDepth, mod: mod(bg, L.bottomPpO2Max).toFixed(0), limit: L.bottomPpO2Max }));
  else if (p > L.bottomPpO2Working) warnings.push(msg('ppo2AboveWorking', { gas: gasName(bg), ppo2: p.toFixed(2), limit: L.bottomPpO2Working }));
  const e = end(bg, maxDepth);
  if (L.maxEndM !== null && e > L.maxEndM) blockers.push(msg('backEndAboveLimit', { gas: gasName(bg), end: e.toFixed(0), limit: L.maxEndM }));
  else if (e > L.warnEndM) warnings.push(msg('endHigh', { gas: gasName(bg), end: e.toFixed(0), limit: L.warnEndM }));
  if (ppO2(bg, 0) < L.minPpO2) warnings.push(msg('backHypoxicAtSurface', { gas: gasName(bg), ppo2: ppO2(bg, 0).toFixed(2) }));

  // deco gases: only those whose switch depth is shallower than max depth
  const decoItems = items.filter((i) => i.role === 'deco');
  const decoGasesUsed: DecoGasSpec[] = [];
  for (const d of decoItems) {
    const sd = switchDepthFor(d.gas, standard);
    if (sd >= maxDepth) { warnings.push(msg('decoSwitchNotShallower', { gas: gasName(d.gas), depth: sd })); continue; }
    if (decoGasesUsed.some((x) => x.switchDepth === sd)) { warnings.push(msg('duplicateSwitchDepth', { gas: gasName(d.gas), depth: sd })); continue; }
    decoGasesUsed.push({ gas: d.gas, switchDepth: sd });
  }

  const plan = planDive({ maxDepth, bottomTime, bottomGas: bg, decoGases: decoGasesUsed, settings });
  const usage = planConsumption(plan, bottomSac, decoSac);

  const firstSwitch = decoGasesUsed.length ? Math.max(...decoGasesUsed.map((d) => d.switchDepth)) : 0;
  const minGasL = minimumGas(maxDepth, backItem.cylinder, { toDepth: Math.min(firstSwitch, maxDepth) }).litres;

  const balance = items.map((item) => {
    const u = usage.find((x) => gasName(x.gas) === gasName(item.gas) && ((item.role === 'back') === (x.gas === bg)));
    const neededL = u?.litres ?? 0;
    const reserveL = item.role === 'back' ? minGasL : neededL * (reserveFactor - 1);
    const availableL = availableLitres(item);
    return { item, availableL, neededL, reserveL, ok: neededL + reserveL <= availableL };
  });
  for (const b of balance) {
    if (!b.ok) {
      const short = b.neededL + b.reserveL - b.availableL;
      blockers.push(msg('gasShort', { gas: gasName(b.item.gas), role: b.item.role, short: Math.round(short), needed: Math.round(b.neededL), reserve: Math.round(b.reserveL), available: Math.round(b.availableL) }));
    }
  }
  for (const u of usage) {
    if (u.gas !== bg && !decoItems.some((d) => gasName(d.gas) === u.name)) blockers.push(msg('missingGas', { gas: u.name }));
  }

  // find max feasible bottom time if gas is the blocker
  let maxBottomTime: number | null = null;
  const gasBlocked = balance.some((b) => !b.ok);
  const otherBlocked = blockers.length > balance.filter((b) => !b.ok).length;
  if (gasBlocked && !otherBlocked) {
    for (let bt = bottomTime - 1; bt >= 1; bt--) {
      const pl = planDive({ maxDepth, bottomTime: bt, bottomGas: bg, decoGases: decoGasesUsed, settings });
      const us = planConsumption(pl, bottomSac, decoSac);
      const ok = items.every((item) => {
        const u = us.find((x) => gasName(x.gas) === gasName(item.gas) && ((item.role === 'back') === (x.gas === bg)));
        const need = u?.litres ?? 0;
        const res = item.role === 'back' ? minGasL : need * (reserveFactor - 1);
        return need + res <= availableLitres(item);
      });
      if (ok) { maxBottomTime = bt; break; }
    }
  }

  warnings.push(...plan.warnings.filter((w) => !blockers.some((b) => b.code === w.code)));
  return { feasible: blockers.length === 0, blockers, warnings, plan, usage, balance, maxBottomTime, decoGasesUsed };
}
