import { describe, expect, it } from 'vitest';
import { altitudeToSurfacePressure, initialTissues, ndl, planDive, planRecreational, CYLINDERS, SURFACE_PRESSURE_BAR } from '../src/engine';

const TX = { o2: 0.21, he: 0.35 };
const deco = [{ gas: { o2: 0.5, he: 0 }, switchDepth: 21 }];

describe('altitude', () => {
  it('barometric formula: 0 m → exactly 1.01325 bar, 1000 m → 0.89875, 2000 m → 0.79495, 3000 m → 0.70109', () => {
    expect(altitudeToSurfacePressure(0)).toBe(SURFACE_PRESSURE_BAR);
    expect(altitudeToSurfacePressure(1000)).toBeCloseTo(0.898746, 5);
    expect(altitudeToSurfacePressure(2000)).toBeCloseTo(0.794952, 5);
    expect(altitudeToSurfacePressure(3000)).toBeCloseTo(0.701085, 5);
  });
  it('sea-level surface pressure passed explicitly gives the identical plan', () => {
    const a = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: TX, decoGases: deco });
    const b = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: TX, decoGases: deco, settings: { surfacePressureBar: altitudeToSurfacePressure(0) } });
    expect(b).toEqual(a);
  });
  it('at altitude the same dive needs more decompression; not acclimatised (sea-level tissues) needs at least as much', () => {
    const sea = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: TX, decoGases: deco });
    const p2000 = altitudeToSurfacePressure(2000);
    const acc = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: TX, decoGases: deco, settings: { surfacePressureBar: p2000, initialTissues: initialTissues(p2000) } });
    const notAcc = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: TX, decoGases: deco, settings: { surfacePressureBar: p2000, initialTissues: initialTissues() } });
    expect(acc.decoTime).toBeGreaterThan(sea.decoTime);
    expect(notAcc.decoTime).toBeGreaterThanOrEqual(acc.decoTime);
    // the default start at altitude is saturation at the altitude surface pressure
    expect(planDive({ maxDepth: 45, bottomTime: 25, bottomGas: TX, decoGases: deco, settings: { surfacePressureBar: p2000 } })).toEqual(acc);
  });
  it('no-deco limit is shorter at altitude', () => {
    const air = { o2: 0.21, he: 0 };
    const p = altitudeToSurfacePressure(1500);
    expect(ndl(air, 25, 0.85, undefined, p)).toBeLessThan(ndl(air, 25, 0.85));
    const rec = planRecreational({ maxDepth: 25, bottomTime: 20, gas: air, cylinder: CYLINDERS[4], startBar: 200, sacLpm: 15, gfHigh: 0.85, surfacePressureBar: p });
    expect(rec.ndlMinutes).toBe(ndl(air, 25, 0.85, undefined, p));
  });
});
