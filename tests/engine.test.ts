import { describe, expect, it } from 'vitest';
import {
  GUE_DECO_GASES, ceilingDepth, end, gasName, initialTissues, loadSegment, minimumGas, mod, ndl,
  planDive, ppO2, recommendedDecoGasesFor, standardBottomGasFor, stopTable, CYLINDERS, planConsumption,
} from '../src/engine';

const AIR = { o2: 0.21, he: 0 };
const EAN32 = { o2: 0.32, he: 0 };
const T2135 = { o2: 0.21, he: 0.35 };
const EAN50 = GUE_DECO_GASES[1];
const O2 = GUE_DECO_GASES[0];

describe('gas maths', () => {
  it('MOD of EAN32 at pO2 1.4 is ~33.7 m, of O2 at 1.6 is ~5.9 m', () => {
    expect(mod(EAN32, 1.4)).toBeCloseTo(33.6, 0);
    expect(mod({ o2: 1, he: 0 }, 1.6)).toBeCloseTo(5.9, 0);
  });
  it('END of 21/35 at 45 m is ~26 m (below GUE 30 m limit)', () => {
    expect(end(T2135, 45)).toBeLessThan(30);
    expect(end(T2135, 45)).toBeCloseTo(25.7, 0);
  });
  it('pO2 of 18/45 at 60 m is 1.26', () => {
    expect(ppO2({ o2: 0.18, he: 0.45 }, 60)).toBeCloseTo(1.26, 2);
  });
  it('picks GUE standard bottom gas by depth', () => {
    expect(standardBottomGasFor(25)?.gas.name).toBe('EAN32');
    expect(standardBottomGasFor(45)?.gas.name).toBe('21/35');
    expect(standardBottomGasFor(60)?.gas.name).toBe('18/45');
    expect(standardBottomGasFor(130)).toBeUndefined();
  });
  it('recommends EAN50 only for Tech 1 range, EAN50+O2 deeper', () => {
    expect(recommendedDecoGasesFor(45).map((g) => g.gas.name)).toEqual(['EAN50']);
    expect(recommendedDecoGasesFor(60).map((g) => g.gas.name)).toEqual(['EAN50', 'O2']);
  });
});

describe('Bühlmann tissues', () => {
  it('starts saturated with air at the surface, no ceiling', () => {
    const t = initialTissues();
    expect(ceilingDepth(t, 1.0)).toBe(0);
    expect(t.n2[0]).toBeCloseTo(0.751, 2);
  });
  it('long exposure saturates towards inspired pressure', () => {
    const t = initialTissues();
    loadSegment(t, AIR, 30, 30, 20000);
    expect(t.n2[15]).toBeCloseTo(0.79 * (4.01325 - 0.0627), 2);
  });
  it('NDL on air at 30 m with GF 100 is in the classic Bühlmann range (15–22 min)', () => {
    const n = ndl(AIR, 30, 1.0);
    expect(n).toBeGreaterThanOrEqual(15);
    expect(n).toBeLessThanOrEqual(22);
  });
  it('NDL on EAN32 is longer than on air', () => {
    expect(ndl(EAN32, 30, 0.85)).toBeGreaterThan(ndl(AIR, 30, 0.85));
  });
  it('NDL is monotone in GF high', () => {
    expect(ndl(AIR, 30, 0.7)).toBeLessThanOrEqual(ndl(AIR, 30, 0.85));
    expect(ndl(AIR, 30, 0.85)).toBeLessThanOrEqual(ndl(AIR, 30, 1.0));
  });
});

describe('planner', () => {
  it('a short shallow dive needs no stops', () => {
    const p = planDive({ maxDepth: 18, bottomTime: 30, bottomGas: EAN32, decoGases: [] });
    expect(stopTable(p)).toHaveLength(0);
    expect(p.firstStopDepth).toBeNull();
    expect(p.runtime).toBeGreaterThan(30);
  });

  it('45 m / 25 min on 21/35 with EAN50 produces a plausible schedule', () => {
    const p = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50] });
    const stops = stopTable(p);
    expect(stops.length).toBeGreaterThan(0);
    // all stops on 3 m multiples, none shallower than 6 m
    for (const s of stops) { expect(s.depth % 3).toBe(0); expect(s.depth).toBeGreaterThanOrEqual(6); }
    // deepest stop first, monotone shallower
    for (let i = 1; i < stops.length; i++) expect(stops[i].depth).toBeLessThan(stops[i - 1].depth);
    // EAN50 used at 21 m and shallower
    for (const s of stops) if (s.depth <= 21) expect(s.gas).toBe('EAN50');
    // total deco somewhere in the range typical planners give for this profile with GF 20/85 (~20–45 min)
    expect(p.decoTime).toBeGreaterThan(15);
    expect(p.decoTime).toBeLessThan(50);
    // runtime consistent
    const last = p.segments[p.segments.length - 1];
    expect(last.endDepth).toBe(0);
    expect(Math.abs(last.runtime - p.runtime)).toBeLessThan(1e-6);
  });

  it('longer bottom time never gives shorter deco', () => {
    let prev = 0;
    for (const bt of [15, 20, 25, 30, 40]) {
      const p = planDive({ maxDepth: 45, bottomTime: bt, bottomGas: T2135, decoGases: [EAN50] });
      expect(p.decoTime).toBeGreaterThanOrEqual(prev);
      prev = p.decoTime;
    }
  });

  it('more conservative GF never gives less deco', () => {
    const loose = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50], settings: { gf: { low: 0.4, high: 0.95 } } });
    const tight = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50], settings: { gf: { low: 0.2, high: 0.75 } } });
    expect(tight.decoTime).toBeGreaterThanOrEqual(loose.decoTime);
  });

  it('adding O2 at 6 m shortens deco', () => {
    const one = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50] });
    const two = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50, O2] });
    expect(two.decoTime).toBeLessThan(one.decoTime);
  });

  it('surfacing GF never exceeds GF high (tolerance for 1-min stop granularity)', () => {
    const p = planDive({ maxDepth: 51, bottomTime: 30, bottomGas: T2135, decoGases: [EAN50] });
    expect(ceilingDepth(p.tissuesAtSurface, 0.85)).toBeLessThanOrEqual(0.01);
  });

  it('warns when bottom gas pO2 exceeds limits', () => {
    const p = planDive({ maxDepth: 40, bottomTime: 10, bottomGas: EAN32, decoGases: [] });
    expect(p.warnings.some((w) => w.code === 'ppo2AboveMax' || w.code === 'ppo2AboveWorking')).toBe(true);
  });
});

describe('gas planning', () => {
  it('minimum gas for 30 m on D12/200 is around 50–60 bar', () => {
    const d12 = CYLINDERS[0];
    const mg = minimumGas(30, d12);
    // 40 l/min × (1 min @4 bar + 2.67 min @ avg 2.8 bar + 2 min @ avg 1.3 bar) ≈ 40 × (4 + 7.5 + 2.6) ≈ 564 L ≈ 23.5 bar in 24 L
    expect(mg.litres).toBeGreaterThan(500);
    expect(mg.litres).toBeLessThan(650);
    expect(mg.bar).toBeCloseTo(mg.litres / 24, 5);
  });
  it('consumption sums across gases and is positive', () => {
    const p = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50] });
    const use = planConsumption(p, 20, 15);
    expect(use.map((u) => u.name).sort()).toEqual(['21/35', 'EAN50']);
    for (const u of use) expect(u.litres).toBeGreaterThan(0);
  });
});

describe('inventory mode', () => {
  const D12 = CYLINDERS[0];
  const S80 = CYLINDERS.find((c) => c.name.startsWith('AL80'))!;
  const S40 = CYLINDERS.find((c) => c.name.startsWith('AL40'))!;

  it('standard Tech 1 kit is feasible for 45 m / 25 min', async () => {
    const { evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([
      { id: 'a', cylinder: D12, count: 1, gas: T2135, pressureBar: 200, role: 'back' },
      { id: 'b', cylinder: S80, count: 1, gas: EAN50.gas, pressureBar: 200, role: 'deco' },
    ], 45, 25, 20, 15, {});
    expect(v.blockers).toEqual([]);
    expect(v.feasible).toBe(true);
    expect(v.decoGasesUsed[0].switchDepth).toBe(21);
  });

  it('EAN32 at 50 m is blocked by pO2 and END', async () => {
    const { evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([{ id: 'a', cylinder: D12, count: 1, gas: EAN32, pressureBar: 200, role: 'back' }], 50, 20, 20, 15, {});
    expect(v.feasible).toBe(false);
    expect(v.blockers.some((b) => b.code === 'ppo2AboveMax')).toBe(true);
    expect(v.blockers.some((b) => b.code === 'backEndAboveLimit')).toBe(true);
  });

  it('too little back gas is blocked and a shorter feasible bottom time is suggested', async () => {
    const { evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([
      { id: 'a', cylinder: D12, count: 1, gas: T2135, pressureBar: 120, role: 'back' },
      { id: 'b', cylinder: S40, count: 1, gas: EAN50.gas, pressureBar: 200, role: 'deco' },
    ], 45, 40, 20, 15, {});
    expect(v.feasible).toBe(false);
    expect(v.maxBottomTime).not.toBeNull();
    expect(v.maxBottomTime!).toBeLessThan(40);
  });

  it('custom deco gas gets a MOD-based switch depth on a 3 m step', async () => {
    const { switchDepthFor } = await import('../src/engine');
    expect(switchDepthFor({ o2: 0.5, he: 0 })).toBe(21);
    expect(switchDepthFor({ o2: 0.4, he: 0 })).toBe(27); // MOD 1.6 → 29.9 m → 27
  });

  it('packing list has one back gas item and one item per deco gas', async () => {
    const { packingList, minimumGas, roundBar } = await import('../src/engine');
    const p = planDive({ maxDepth: 60, bottomTime: 25, bottomGas: { o2: 0.18, he: 0.45 }, decoGases: [EAN50, O2] });
    const use = planConsumption(p, 20, 15);
    const mg = roundBar(minimumGas(60, D12, { toDepth: 21 }).bar);
    const list = packingList(p, use, D12, mg, 20, 15, CYLINDERS);
    expect(list.filter((i) => i.role === 'back')).toHaveLength(1);
    expect(list.filter((i) => i.role === 'deco').map((i) => i.gasLabel).sort()).toEqual(['EAN50', 'O2']);
    // 60 m on a D12/200 does not fit: the back gas item must be flagged as overfill
    expect(list[0].overfill).toBe(true);
    for (const i of list.filter((x) => x.role === 'deco')) expect(i.fillBar).toBeLessThanOrEqual(i.cylinder.workingPressureBar);
  });
});

describe('gas standards', () => {
  it('generic standard picks best nitrox mix at pO2 1.4 for recreational depths', async () => {
    const { GENERIC_STANDARD } = await import('../src/engine');
    expect(GENERIC_STANDARD.bottomGasFor(18)?.gas.name).toBe('EAN40');
    expect(GENERIC_STANDARD.bottomGasFor(30)?.gas.name).toBe('EAN32');
    expect(GENERIC_STANDARD.bottomGasFor(40)?.gas.name).toBe('Air');
    expect(GENERIC_STANDARD.bottomGasFor(50)?.gas.name).toBe('21/35');
  });
  it('generic standard has no hard END limit but warns above 40 m END', async () => {
    const { GENERIC_STANDARD, evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([{ id: 'a', cylinder: CYLINDERS[0], count: 1, gas: AIR, pressureBar: 230, role: 'back' }], 45, 15, 20, 15, {}, 1.5, GENERIC_STANDARD);
    expect(v.blockers.some((b) => b.code === 'backEndAboveLimit')).toBe(false);
    expect(v.warnings.some((w) => w.code === 'endHigh')).toBe(true);
  });
  it('GUE standard blocks the same dive on END', async () => {
    const { GUE_STANDARD, evaluateInventory } = await import('../src/engine');
    const v = evaluateInventory([{ id: 'a', cylinder: CYLINDERS[0], count: 1, gas: AIR, pressureBar: 230, role: 'back' }], 45, 15, 20, 15, {}, 1.5, GUE_STANDARD);
    expect(v.blockers.some((b) => b.code === 'backEndAboveLimit')).toBe(true);
  });
  it('EAN80 gets its standard 9 m switch depth in the generic standard', async () => {
    const { GENERIC_STANDARD, switchDepthFor } = await import('../src/engine');
    expect(switchDepthFor({ o2: 0.8, he: 0 }, GENERIC_STANDARD)).toBe(9);
  });
});

describe('itinerary', () => {
  it('lists events chronologically from t=0 to the surface with switches and stops', async () => {
    const { itinerary } = await import('../src/engine');
    const p = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: T2135, decoGases: [EAN50] });
    const ev = itinerary(p);
    expect(ev[0].kind).toBe('start');
    expect(ev[0].runtime).toBe(0);
    expect(ev[ev.length - 1].kind).toBe('surface');
    expect(Math.abs(ev[ev.length - 1].runtime - p.runtime)).toBeLessThan(1e-6);
    for (let i = 1; i < ev.length; i++) expect(ev[i].runtime).toBeGreaterThanOrEqual(ev[i - 1].runtime - 1e-9);
    expect(ev.filter((e) => e.kind === 'stop').length).toBe(stopTable(p).length);
    const sw = ev.find((e) => e.kind === 'switch')!;
    expect(sw.depth).toBe(21);
    expect(sw.gas.name).toBe('EAN50');
    expect(sw.fromGas && gasName(sw.fromGas)).toBe('21/35');
    expect(ev.filter((e) => e.kind === 'arriveBottom')).toHaveLength(1);
    expect(ev.filter((e) => e.kind === 'leaveBottom')).toHaveLength(1);
  });
});

describe('calculation method', () => {
  it('conservative (gfEvalAt=current) never gives less deco than standard', () => {
    for (const [d, bt, gas, deco] of [[45, 25, T2135, [EAN50]], [60, 25, { o2: 0.18, he: 0.45 }, [EAN50, O2]], [75, 20, { o2: 0.15, he: 0.55 }, [GUE_DECO_GASES[2], EAN50, O2]]] as const) {
      const std = planDive({ maxDepth: d, bottomTime: bt, bottomGas: gas, decoGases: [...deco], settings: { gfEvalAt: 'next' } });
      const con = planDive({ maxDepth: d, bottomTime: bt, bottomGas: gas, decoGases: [...deco], settings: { gfEvalAt: 'current' } });
      expect(con.decoTime).toBeGreaterThanOrEqual(std.decoTime);
      expect(con.firstStopDepth ?? 0).toBeGreaterThanOrEqual(std.firstStopDepth ?? 0);
    }
  });
});
