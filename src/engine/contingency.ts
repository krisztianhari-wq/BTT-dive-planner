/**
 * Contingency planning on top of the normal plan:
 * - lost deco gas: re-plan without one deco gas and check whether the remaining gases still cover the dive,
 * - gas-plan feasibility predicate shared by the range table and the max bottom time search.
 * Everything re-uses planDive / gasPlan; nothing here changes the normal plan.
 */
import { Cylinder, minimumGas, roundBar, segmentConsumption } from './gasPlan';
import { gasName } from './gas';
import { DecoGasSpec, DiveInput, DivePlan, planDive } from './planner';
import { densityLevel, gasDensity } from './density';
import { mod, ppO2 } from './gas';

export interface GasSupply {
  backCylinder: Cylinder;
  backStartBar: number;
  /** litres carried per deco gas (by gas name); `null` = deco cylinders are sized to the plan (standard mode: ×reserve) */
  decoLitres: Record<string, number> | null;
  sacBottom: number;
  sacDeco: number;
  /** deco gas reserve factor (GUE: plan × 1.5) */
  reserveFactor?: number;
}

export type SupplyStatus = 'ok' | 'noReserve' | 'short';

export interface SupplyRow {
  name: string;
  role: 'back' | 'deco';
  /** litres needed on this plan */
  neededL: number;
  /** litres needed on the normal plan (for the "extra" column) */
  baseNeededL: number;
  /** reserve that should stay unused: minimum gas (back) or (factor − 1) × need (deco), litres */
  reserveL: number;
  availableL: number;
  /** ok: need + reserve fits; noReserve: only the need fits (reserve consumed); short: not even the need fits */
  status: SupplyStatus;
}

export interface LostGasScenario {
  lost: DecoGasSpec;
  name: string;
  plan: DivePlan;
  extraRuntime: number;
  extraDeco: number;
  rows: SupplyRow[];
  status: SupplyStatus;
}

/** Litres per gas name split by role: back gas (the bottom gas) at bottom SAC on descent/bottom, deco SAC elsewhere. */
export function litresByGas(plan: DivePlan, sacBottom: number, sacDeco: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const seg of plan.segments) {
    if (seg.duration <= 0) continue;
    const sac = seg.kind === 'descent' || seg.kind === 'bottom' ? sacBottom : sacDeco;
    const k = gasName(seg.gas);
    m.set(k, (m.get(k) ?? 0) + segmentConsumption(seg, sac));
  }
  return m;
}

const worst = (xs: SupplyStatus[]): SupplyStatus => (xs.includes('short') ? 'short' : xs.includes('noReserve') ? 'noReserve' : 'ok');

/** Minimum gas (litres, rounded to 10 bar like the main plan) for a set of deco gases. */
function minGasLitres(maxDepth: number, cyl: Cylinder, decoGases: DecoGasSpec[]): number {
  const firstSwitch = decoGases.length ? Math.max(...decoGases.map((d) => d.switchDepth)) : 0;
  const mg = minimumGas(maxDepth, cyl, { toDepth: Math.min(firstSwitch, maxDepth) });
  return roundBar(mg.bar) * cyl.volumeL;
}

/** Supply check of one plan against the carried gas. */
export function supplyRows(input: DiveInput, plan: DivePlan, basePlan: DivePlan, supply: GasSupply): SupplyRow[] {
  const f = supply.reserveFactor ?? 1.5;
  const need = litresByGas(plan, supply.sacBottom, supply.sacDeco);
  const base = litresByGas(basePlan, supply.sacBottom, supply.sacDeco);
  const backName = gasName(input.bottomGas);
  const rows: SupplyRow[] = [];
  const backNeed = need.get(backName) ?? 0;
  const backAvail = supply.backCylinder.volumeL * supply.backStartBar;
  const backRes = minGasLitres(input.maxDepth, supply.backCylinder, input.decoGases);
  rows.push({ name: backName, role: 'back', neededL: backNeed, baseNeededL: base.get(backName) ?? 0, reserveL: backRes, availableL: backAvail,
    status: backNeed + backRes <= backAvail + 1e-9 ? 'ok' : backNeed <= backAvail + 1e-9 ? 'noReserve' : 'short' });
  for (const d of input.decoGases) {
    const n = gasName(d.gas);
    if (n === backName || rows.some((r) => r.name === n)) continue;
    const nd = need.get(n) ?? 0;
    const bn = base.get(n) ?? 0;
    // standard mode: cylinders are filled for the normal plan × reserve factor
    const avail = supply.decoLitres ? (supply.decoLitres[n] ?? 0) : bn * f;
    const res = nd * (f - 1);
    rows.push({ name: n, role: 'deco', neededL: nd, baseNeededL: bn, reserveL: res, availableL: avail,
      status: nd + res <= avail + 1e-9 ? 'ok' : nd <= avail + 1e-9 ? 'noReserve' : 'short' });
  }
  return rows;
}

/**
 * "What if I lose this deco gas?" – one scenario per deco gas: the plan is recomputed without it (the diver stays
 * on the previous gas until the next remaining switch) and the remaining gases are checked against what is carried.
 */
export function lostGasScenarios(input: DiveInput, basePlan: DivePlan, supply: GasSupply): LostGasScenario[] {
  return input.decoGases.map((lost) => {
    const decoGases = input.decoGases.filter((d) => d !== lost);
    const sub: DiveInput = { ...input, decoGases };
    const plan = planDive(sub);
    // the carried deco gas litres stay those of the normal plan (sized from basePlan in standard mode)
    const rows = supplyRows(sub, plan, basePlan, supply);
    const impossible = plan.warnings.some((w) => w.code === 'stopTooLong');
    return {
      lost, name: gasName(lost.gas), plan,
      extraRuntime: plan.runtime - basePlan.runtime,
      extraDeco: plan.decoTime - basePlan.decoTime,
      rows,
      status: impossible ? 'short' : worst(rows.map((r) => r.status)),
    };
  });
}

/* ---------------- feasibility predicate (range table, max bottom time) ---------------- */

export interface FeasibilityLimits {
  ppO2Max: number;
  /** END hard limit (m) or null */
  maxEndM?: number | null;
}

export type CellIssue = 'gas' | 'ppo2' | 'density' | 'deco';

export interface CellResult {
  depth: number;
  bottomTime: number;
  plan: DivePlan;
  issues: CellIssue[];
  feasible: boolean;
}

/** Plan one cell and check gas (with reserves), bottom pO2 and an impossible ascent; gas density ≥ 6.2 g/L is flagged but only a warning. */
export function evaluateCell(input: DiveInput, supply: GasSupply, limits: FeasibilityLimits): CellResult {
  const decoGases = input.decoGases.filter((d) => d.switchDepth < input.maxDepth);
  const sub: DiveInput = { ...input, decoGases };
  const plan = planDive(sub);
  const issues: CellIssue[] = [];
  if (ppO2(input.bottomGas, input.maxDepth) > limits.ppO2Max + 1e-9) issues.push('ppo2');
  if (densityLevel(gasDensity(input.bottomGas, input.maxDepth)) === 'crit') issues.push('density');
  if (plan.warnings.some((w) => w.code === 'stopTooLong' || w.code === 'decoSwitchExceedsMod')) issues.push('deco');
  // the normal plan's own gas check: standard mode sizes deco cylinders to the plan, so only the back gas can run short
  const rows = supplyRows(sub, plan, plan, supply);
  if (rows.some((r) => r.status !== 'ok')) issues.push('gas');
  return { depth: input.maxDepth, bottomTime: input.bottomTime, plan, issues, feasible: issues.every((i) => i === 'density') };
}

export interface RangeTable {
  depths: number[];
  times: number[];
  /** cells[i][j] for depths[i], times[j] */
  cells: CellResult[][];
}

/**
 * Small matrix around the current plan: depth −6/−3/0/+3/+6 m × bottom time −10/−5/0/+5/+10 min,
 * clipped to 3…maxDepthLimit m, 1…300 min and the bottom gas MOD at the maximum pO2.
 */
export function rangeTable(input: DiveInput, supply: GasSupply, limits: FeasibilityLimits, opts: { maxDepthLimit?: number; depthSteps?: number[]; timeSteps?: number[] } = {}): RangeTable {
  const dmax = Math.min(opts.maxDepthLimit ?? 120, mod(input.bottomGas, limits.ppO2Max));
  const depths = [...new Set((opts.depthSteps ?? [-6, -3, 0, 3, 6]).map((s) => input.maxDepth + s))]
    .filter((d) => d >= 3 && (d <= dmax + 1e-9 || d === input.maxDepth));
  const times = [...new Set((opts.timeSteps ?? [-10, -5, 0, 5, 10]).map((s) => input.bottomTime + s))].filter((t) => t >= 1 && t <= 300);
  const cells = depths.map((d) => times.map((bt) => evaluateCell({ ...input, maxDepth: d, bottomTime: bt }, supply, limits)));
  return { depths, times, cells };
}

/**
 * Largest integer bottom time (1…hi) at this depth for which the cell is feasible, by binary search; null if even
 * 1 minute fails. Assumes feasibility only gets worse with time (more gas, more deco); the result is re-verified.
 */
export function maxFeasibleBottomTime(input: DiveInput, supply: GasSupply, limits: FeasibilityLimits, hi = 300): number | null {
  const ok = (bt: number) => evaluateCell({ ...input, bottomTime: bt }, supply, limits).feasible;
  if (!ok(1)) return null;
  if (ok(hi)) return hi;
  let lo = 1; let h = hi; // ok(lo) && !ok(h)
  while (h - lo > 1) {
    const mid = Math.floor((lo + h) / 2);
    if (ok(mid)) lo = mid; else h = mid;
  }
  return lo;
}
