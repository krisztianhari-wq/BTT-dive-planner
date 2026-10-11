import { describe, expect, it } from 'vitest';
import { COMPARTMENTS, HE_A, HE_B, N2_A, N2_B, ascentStart, leadingGf, planDive, supersaturationTrace } from '../src/engine';

describe('leading-tissue gradient factor', () => {
  it('hand check: all N2 tensions 1.5 bar at 1.01325 bar → compartment 16 leads, GF = 0.48675 / (1.01325/0.9653 + 0.2327 − 1.01325)', () => {
    const t = { n2: new Array(COMPARTMENTS).fill(1.5), he: new Array(COMPARTMENTS).fill(0) };
    const r = leadingGf(t, 1.01325);
    const expected = (1.5 - 1.01325) / (1.01325 / 0.9653 + 0.2327 - 1.01325); // = 1.8086
    expect(r.lead).toBe(15);
    expect(r.gf).toBeCloseTo(expected, 9);
    expect(r.gf).toBeCloseTo(1.8086, 3);
    // compartment 1 for comparison: (1.5 − 1.01325) / (1.01325/0.5578 + 1.1696 − 1.01325) = 0.2467
    expect((1.5 - 1.01325) / (1.01325 / N2_B[0] + N2_A[0] - 1.01325)).toBeCloseTo(0.2467, 3);
    void HE_A; void HE_B;
  });
  it('surface-saturated tissues are undersaturated (negative GF)', () => {
    const t = { n2: new Array(COMPARTMENTS).fill(0.79 * (1.01325 - 0.0627)), he: new Array(COMPARTMENTS).fill(0) };
    expect(leadingGf(t, 1.01325).gf).toBeLessThan(0);
  });
});

describe('supersaturation trace over the ascent', () => {
  for (const [lo, hi] of [[0.2, 0.85], [0.3, 0.7], [0.5, 0.8]]) {
    it(`GF ${lo * 100}/${hi * 100}: the trace never exceeds GF high, ends at the surface ≤ GF high`, () => {
      const plan = planDive({ maxDepth: 50, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [{ gas: { o2: 0.5, he: 0 }, switchDepth: 21 }, { gas: { o2: 1, he: 0 }, switchDepth: 6 }], settings: { gf: { low: lo, high: hi } } });
      const tr = supersaturationTrace(plan, { fromRuntime: ascentStart(plan) });
      expect(tr[0].t).toBeCloseTo(ascentStart(plan), 9);
      expect(tr[tr.length - 1].t).toBeCloseTo(plan.runtime, 9);
      expect(tr[tr.length - 1].depth).toBe(0);
      const max = Math.max(...tr.map((p) => p.gf));
      expect(max).toBeLessThanOrEqual(hi + 1e-6);
      expect(tr[tr.length - 1].gf).toBeLessThanOrEqual(hi + 1e-6);
      // GF low is the anchor of the slope at the first stop (Subsurface convention: the first stop is chosen from the
      // ceiling at the bottom, so arriving there the leading tissue can sit a little above GF low), still below GF high
      const first = plan.firstStopDepth!;
      const arrive = tr.find((p) => Math.abs(p.depth - first) < 1e-9)!;
      expect(arrive.gf).toBeLessThan(hi);
    });
  }
  it('a fixed ascent-rate change depth splits the ascent; unset keeps the old schedule', () => {
    const base = { maxDepth: 40, bottomTime: 20, bottomGas: { o2: 0.21, he: 0.35 }, decoGases: [] };
    const a = planDive(base);
    const b = planDive({ ...base, settings: { ascentRateChangeDepthM: 0 } });
    expect(b).toEqual(a);
    const c = planDive({ ...base, settings: { ascentRateChangeDepthM: 21 } });
    const first = c.segments.find((s) => s.kind === 'ascent')!;
    expect(first.startDepth).toBe(40);
    expect(first.endDepth).toBe(21);
    expect(first.duration).toBeCloseTo(19 / 9, 9);
    // slower from 21 m: the ascent takes longer than with the rate change at the first stop
    expect(c.runtime).toBeGreaterThanOrEqual(a.runtime);
  });
});
