import { describe, expect, it } from 'vitest';
import { COMPARTMENTS, N2_HALFTIMES, depthScaleFor, initialTissues, loadSegment, planDive, salinityKgL, tissuesAfterDives, tissuesFromLog, LoggedDive } from '../src/engine';

const EAN32 = { o2: 0.32, he: 0 };
const AIR = { o2: 0.21, he: 0 };
const GF85 = { gf: { low: 0.85, high: 0.85 } };

describe('repetitive dives – manual previous dives', () => {
  it('a surface interval off-gasses each compartment by the Haldane closed form', () => {
    const t = initialTissues();
    loadSegment(t, AIR, 30, 30, 20);
    const before = [...t.n2];
    const after = tissuesAfterDives([{ maxDepth: 0, bottomTime: 0, gas: AIR, surfaceIntervalMin: 60 }], { start: t });
    const pi = 0.79 * (1.01325 - 0.0627);
    for (let i = 0; i < COMPARTMENTS; i++) {
      expect(after.n2[i]).toBeCloseTo(pi + (before[i] - pi) * Math.pow(2, -60 / N2_HALFTIMES[i]), 9);
    }
  });
  it('a short surface interval makes the next dive longer; 48 h later it is (almost) a fresh dive again', () => {
    const fresh = planDive({ maxDepth: 40, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [] });
    const prev = { maxDepth: 40, bottomTime: 25, gas: { o2: 0.21, he: 0.35 } };
    const short = tissuesAfterDives([{ ...prev, surfaceIntervalMin: 60 }]);
    const long = tissuesAfterDives([{ ...prev, surfaceIntervalMin: 48 * 60 }]);
    const rep = planDive({ maxDepth: 40, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [], initialTissues: short });
    const rep48 = planDive({ maxDepth: 40, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [], initialTissues: long });
    expect(rep.decoTime).toBeGreaterThan(fresh.decoTime);
    expect(rep48.decoTime).toBeGreaterThanOrEqual(fresh.decoTime);
    expect(rep48.decoTime - fresh.decoTime).toBeLessThanOrEqual(1);
  });
  it('initialTissues equal to surface saturation reproduce the normal plan exactly', () => {
    const a = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [] });
    const b = planDive({ maxDepth: 45, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [], initialTissues: initialTissues() });
    expect(b).toEqual(a);
  });
});

describe('repetitive dives – logged profiles', () => {
  // the same 20 m / 20 min EAN32 no-stop dive as planDive builds it: descent 1 min, bottom 19 min, ascent 20/9 min
  const plan = planDive({ maxDepth: 20, bottomTime: 20, bottomGas: EAN32, decoGases: [], settings: GF85 });
  const asc = 20 / 9 * 60;
  const logged = (start: number | null, salinity: number | null = 1000): LoggedDive => ({
    id: 1, start_utc_epoch: start, duration_s: 1200 + asc, gases: [{ o2: 32, he: 0 }], surface_mbar: 1013.25, salinity,
    samples: [{ t: 0, d: 0 }, { t: 60, d: 20 }, { t: 1200, d: 20 }, { t: 1200 + asc, d: 0 }],
  });
  it('samples of a square profile load the tissues exactly like the planned profile', () => {
    expect(plan.decoTime).toBe(0);
    const start = 1_000_000;
    const r = tissuesFromLog([logged(start)], start + 1200 + asc); // planned start right at surfacing
    for (let i = 0; i < COMPARTMENTS; i++) expect(r.tissues.n2[i]).toBeCloseTo(plan.tissuesAtSurface.n2[i], 9);
    expect(r.used).toHaveLength(1);
    expect(r.used[0].maxDepth).toBe(20);
  });
  it('the surface interval until the planned start matches the manual equivalent', () => {
    const start = 1_000_000;
    const r = tissuesFromLog([logged(start)], start + 1200 + asc + 90 * 60);
    const m = tissuesAfterDives([{ maxDepth: 20, bottomTime: 20, gas: EAN32, surfaceIntervalMin: 90 }], { settings: GF85 });
    for (let i = 0; i < COMPARTMENTS; i++) expect(r.tissues.n2[i]).toBeCloseTo(m.n2[i], 9);
  });
  it('unknown start time is treated as ending right before the planned dive (more loading)', () => {
    const start = 1_000_000;
    const known = tissuesFromLog([logged(start)], start + 3 * 3600);
    const unk = tissuesFromLog([logged(null)], start + 3 * 3600);
    expect(unk.unknownTime).toEqual([1]);
    expect(unk.tissues.n2[0]).toBeGreaterThan(known.tissues.n2[0]);
  });
  it('dives after the planned start are ignored', () => {
    const r = tissuesFromLog([logged(2_000_000)], 1_000_000);
    expect(r.future).toBe(1);
    expect(r.used).toHaveLength(0);
    expect(r.tissues).toEqual(initialTissues());
  });
  it('salinity: sea water scales depth by 1.0101, fresh water is never scaled down', () => {
    expect(salinityKgL(10300)).toBeCloseTo(1.03, 9);
    expect(salinityKgL(1030)).toBeCloseTo(1.03, 9);
    expect(depthScaleFor(1030)).toBeCloseTo(1.03 * 9.80665 / 10, 9);
    expect(depthScaleFor(1000)).toBe(1);
    expect(depthScaleFor(null)).toBeGreaterThan(1);
  });
});
