import { describe, expect, it } from 'vitest';
import { CYLINDERS, GasSupply, litresByGas, lostGasScenarios, maxFeasibleBottomTime, planDive, rangeTable, supplyRows, evaluateCell } from '../src/engine';

const D12 = CYLINDERS[0]; // 2×12 L
const EAN32 = { o2: 0.32, he: 0 };
const TX2135 = { o2: 0.21, he: 0.35 };
const EAN50 = { gas: { o2: 0.5, he: 0 }, switchDepth: 21 };
const O2 = { gas: { o2: 1, he: 0 }, switchDepth: 6 };
const GF85 = { gf: { low: 0.85, high: 0.85 } };
const supply = (startBar: number, decoLitres: Record<string, number> | null = null): GasSupply => ({ backCylinder: D12, backStartBar: startBar, decoLitres, sacBottom: 20, sacDeco: 15 });

// 20 m / bt min on EAN32 without stops: descent 1 min at 2.01325 bar avg, bottom (bt−1) min at 3.01325 bar (20 l/min),
// direct ascent 20/9 min at 2.01325 bar avg (15 l/min)
const handNeed = (bt: number) => 20 * 2.01325 * 1 + 20 * 3.01325 * (bt - 1) + 15 * 2.01325 * (20 / 9);
// minimum gas 20 m → surface: 2 divers × 20 l/min: 1 min at 3.01325 + 14/9 min at 2.31325 + 2 min at 1.31325 = 369.5 L → 15.4 bar → 20 bar → 480 L
const MIN_GAS_L = 20 * 24;

describe('supply check (hand-computed)', () => {
  it('back gas need of a no-stop dive matches the hand sum', () => {
    const plan = planDive({ maxDepth: 20, bottomTime: 20, bottomGas: EAN32, decoGases: [], settings: GF85 });
    expect(plan.decoTime).toBe(0);
    expect(litresByGas(plan, 20, 15).get('EAN32')).toBeCloseTo(handNeed(20), 6);
  });
  it('ok with minimum gas kept, noReserve when only the minimum gas is eaten into, short below the need', () => {
    const input = { maxDepth: 20, bottomTime: 20, bottomGas: EAN32, decoGases: [], settings: GF85 };
    const plan = planDive(input);
    const at = (bar: number) => supplyRows(input, plan, plan, supply(bar))[0];
    expect(at(200).status).toBe('ok');
    expect(at(200).reserveL).toBe(MIN_GAS_L);
    expect(handNeed(20) + MIN_GAS_L).toBeGreaterThan(70 * 24); // 1252 + 480 > 1680
    expect(at(70).status).toBe('noReserve');
    expect(at(50).status).toBe('short'); // 1200 L < 1252 L
  });
});

describe('lost deco gas', () => {
  const input = { maxDepth: 45, bottomTime: 25, bottomGas: TX2135, decoGases: [EAN50, O2] };
  const base = planDive(input);

  it('one scenario per deco gas, each equal to planning without that gas', () => {
    const sc = lostGasScenarios(input, base, supply(200));
    expect(sc.map((s) => s.name)).toEqual(['EAN50', 'O2']);
    const noEan = planDive({ ...input, decoGases: [O2] });
    expect(sc[0].plan.runtime).toBe(noEan.runtime);
    expect(sc[0].extraRuntime).toBeCloseTo(noEan.runtime - base.runtime, 9);
    expect(sc[0].extraDeco).toBeGreaterThan(0);
    // losing EAN50 means more back gas (breathed to 6 m) and more O2
    const back = sc[0].rows.find((r) => r.role === 'back')!;
    expect(back.neededL).toBeGreaterThan(back.baseNeededL);
    expect(sc[0].rows.find((r) => r.name === 'O2')!.neededL).toBeGreaterThan(sc[0].rows.find((r) => r.name === 'O2')!.baseNeededL);
    expect(sc[0].rows.some((r) => r.name === 'EAN50')).toBe(false);
  });
  it('standard mode: deco gas carried = normal need × 1.5; the extra need eats the reserve or runs short', () => {
    const sc = lostGasScenarios(input, base, supply(200));
    const o2 = sc[0].rows.find((r) => r.name === 'O2')!;
    expect(o2.availableL).toBeCloseTo(o2.baseNeededL * 1.5, 9);
    const expected = o2.neededL * 1.5 <= o2.availableL ? 'ok' : o2.neededL <= o2.availableL ? 'noReserve' : 'short';
    expect(o2.status).toBe(expected);
  });
  it('inventory mode uses the real litres; too little back gas makes the scenario short', () => {
    const sc = lostGasScenarios(input, base, supply(120, { EAN50: 11.1 * 200, O2: 50 }));
    expect(sc[0].rows.find((r) => r.name === 'O2')!.status).toBe('short');
    expect(sc[0].status).toBe('short');
  });
});

describe('range table and max bottom time', () => {
  it('max bottom time by binary search matches the hand-computed back-gas limit', () => {
    // 100 bar in a D12 = 2400 L; need + 480 ≤ 2400 → need ≤ 1920 → bt = 31 (1916.3 L), 32 fails (1975.6 L)
    expect(handNeed(31)).toBeLessThanOrEqual(2400 - MIN_GAS_L);
    expect(handNeed(32)).toBeGreaterThan(2400 - MIN_GAS_L);
    const input = { maxDepth: 20, bottomTime: 20, bottomGas: EAN32, decoGases: [], settings: GF85 };
    expect(planDive({ ...input, bottomTime: 32 }).decoTime).toBe(0);
    expect(maxFeasibleBottomTime(input, supply(100), { ppO2Max: 1.4 })).toBe(31);
  });
  it('cells beyond the bottom gas MOD are clipped, critical density and gas shortage are flagged', () => {
    const input = { maxDepth: 30, bottomTime: 20, bottomGas: EAN32, decoGases: [] };
    const rt = rangeTable(input, supply(200), { ppO2Max: 1.4 });
    expect(rt.depths).toEqual([24, 27, 30, 33]); // MOD(EAN32, 1.4) = 33.75 m → 36 m clipped
    expect(rt.times).toEqual([10, 15, 20, 25, 30]);
    const air = evaluateCell({ maxDepth: 45, bottomTime: 10, bottomGas: { o2: 0.21, he: 0 }, decoGases: [] }, supply(200), { ppO2Max: 1.4 });
    expect(air.issues).toContain('density');
    // a kritikus gázsűrűség csak figyelmeztetés: a cella ettől még tervezhető (a pO2 45 m-en levegővel 1,15 bar)
    expect(air.issues.filter((i) => i !== 'density')).toEqual([]);
    expect(air.feasible).toBe(true);
    const short = evaluateCell({ maxDepth: 30, bottomTime: 60, bottomGas: EAN32, decoGases: [] }, supply(100), { ppO2Max: 1.4 });
    expect(short.issues).toContain('gas');
    expect(short.feasible).toBe(false);
  });
});
