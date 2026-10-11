import { describe, expect, it } from 'vitest';
import { CYLINDERS, densityLevel, densityMsg, gasDensity, molarMass, planDive, planRecreational } from '../src/engine';

const AIR = { o2: 0.21, he: 0 };

describe('gas density (ideal gas, 20 °C) – hand-computed values', () => {
  it('molar mass of air is 0.21·32 + 0.79·28.0134 = 28.8506 g/mol', () => {
    expect(molarMass(AIR)).toBeCloseTo(28.850586, 6);
  });
  it('air: 1.199 g/L at the surface, 4.750 at 30 m, 5.934 at 40 m, 7.118 at 50 m', () => {
    // ρ = P·1e5·M / (8.314462618 · 293.15) / 1000
    expect(gasDensity(AIR, 0)).toBeCloseTo(1.1994, 3);
    expect(gasDensity(AIR, 30)).toBeCloseTo(4.7504, 3);
    expect(gasDensity(AIR, 40)).toBeCloseTo(5.9340, 3);
    expect(gasDensity(AIR, 50)).toBeCloseTo(7.1177, 3);
  });
  it('trimix: 21/35 at 45 m 4.625 g/L, 18/45 at 60 m 5.158, 10/70 at 120 m 6.196', () => {
    expect(gasDensity({ o2: 0.21, he: 0.35 }, 45)).toBeCloseTo(4.625, 3);
    expect(gasDensity({ o2: 0.18, he: 0.45 }, 60)).toBeCloseTo(5.158, 3);
    expect(gasDensity({ o2: 0.10, he: 0.70 }, 120)).toBeCloseTo(6.1957, 3);
  });
  it('colder gas is denser; altitude surface pressure lowers it', () => {
    expect(gasDensity(AIR, 30, { tempK: 277.15 })).toBeGreaterThan(gasDensity(AIR, 30));
    expect(gasDensity(AIR, 30, { surfaceBar: 0.9 })).toBeLessThan(gasDensity(AIR, 30));
  });
  it('levels: < 5.2 ok, ≥ 5.2 warn, ≥ 6.2 critical (Anthony & Mitchell 2016)', () => {
    expect(densityLevel(5.19)).toBe('ok');
    expect(densityLevel(5.2)).toBe('warn');
    expect(densityLevel(6.19)).toBe('warn');
    expect(densityLevel(6.2)).toBe('crit');
    expect(densityMsg(AIR, 30)).toBeNull();
    expect(densityMsg(AIR, 40)?.code).toBe('densityHigh');
    expect(densityMsg(AIR, 43)?.code).toBe('densityCritical');
  });
  it('the planner and the recreational mode report the density of the bottom gas', () => {
    const p = planDive({ maxDepth: 45, bottomTime: 20, bottomGas: AIR, decoGases: [] });
    expect(p.warnings.some((w) => w.code === 'densityCritical')).toBe(true);
    const ok = planDive({ maxDepth: 45, bottomTime: 20, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [] });
    expect(ok.warnings.some((w) => w.code.startsWith('density'))).toBe(false);
    const rec = planRecreational({ maxDepth: 40, bottomTime: 5, gas: AIR, cylinder: CYLINDERS[4], startBar: 200, sacLpm: 15, gfHigh: 0.85 });
    expect(rec.warnings.some((w) => w.code === 'densityHigh')).toBe(true);
  });
});
