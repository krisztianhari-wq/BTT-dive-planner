import { describe, expect, it } from 'vitest';
import { decodePlanHash, encodePlan, fromBase64Url, toBase64Url, validatePlan, PlanLinkV1 } from '../src/ui/planLink';

const plan: PlanLinkV1 = {
  v: 1, env: 'open', maxDepth: 45, bottomTime: 25, bottomGas: { o2: 0.21, he: 0.35 },
  decoGases: [{ o2: 0.5, he: 0, switchDepth: 21 }, { o2: 1, he: 0, switchDepth: 6 }],
  gfLow: 20, gfHigh: 85, lastStop: 6, sacBottom: 18, sacDeco: 14, std: 'gue', unit: 'metric', name: 'Kőbánya – 45 m / 25′',
};

describe('plan link (#plan=, schema v1)', () => {
  it('base64url round trip keeps UTF-8 and uses no +/= characters', () => {
    const s = 'Ő ű – ✓ {"a":1}';
    const e = toBase64Url(s);
    expect(e).not.toMatch(/[+/=]/);
    expect(fromBase64Url(e)).toBe(s);
  });
  it('encode → decode returns the same plan', () => {
    expect(decodePlanHash(`#plan=${encodePlan(plan)}`)).toEqual(plan);
    expect(decodePlanHash(`https://x.example/terv/#plan=${encodePlan(plan)}`)).toEqual(plan);
  });
  it('clamps every field and ignores unknown ones', () => {
    const p = validatePlan({ v: 1, env: 'open', maxDepth: 500, bottomTime: -3, bottomGas: { o2: 32, he: 90 }, decoGases: [{ o2: 0.5, switchDepth: 999 }, { o2: 'x' }],
      gfLow: 95, gfHigh: 70, lastStop: 9, sacBottom: 1, sacDeco: 100, altitudeM: 9000, std: 'padi', unit: 'furlong', name: '<b>x</b>\u0007', evil: true })!;
    expect(p.maxDepth).toBe(120);
    expect(p.bottomTime).toBe(1);
    expect(p.bottomGas).toEqual({ o2: 0.32, he: 0.68 }); // percent read as percent, He capped at 100 − O2
    expect(p.decoGases).toEqual([{ o2: 0.5, he: 0, switchDepth: 120 }]);
    expect(p.gfLow).toBe(70); expect(p.gfHigh).toBe(70);
    expect(p.lastStop).toBe(6);
    expect(p.sacBottom).toBe(5); expect(p.sacDeco).toBe(60);
    expect(p.altitudeM).toBe(4500);
    expect(p.std).toBeUndefined(); expect(p.unit).toBeUndefined();
    expect(p.name).toBe('bx/b');
    expect((p as unknown as Record<string, unknown>).evil).toBeUndefined();
  });
  it('rejects other versions and garbage; recreational depth is capped at 60 m', () => {
    expect(validatePlan({ ...plan, v: 2 })).toBeNull();
    expect(decodePlanHash('#plan=%%%')).toBeNull();
    expect(decodePlanHash('#other=1')).toBeNull();
    expect(validatePlan({ ...plan, env: 'rec', maxDepth: 90 })!.maxDepth).toBe(60);
  });
  it('a link can never switch on the "brave" override in penetration', () => {
    const p = validatePlan({ ...plan, env: 'pen', maxDepth: 30, pen: { brave: true, teamSize: 9, agency: 'gue', plannedMinutes: 40 } })!;
    expect(p.pen!.brave).toBe(false);
    expect(p.pen!.teamSize).toBe(4);
    expect(p.pen!.plannedMinutes).toBe(40);
  });
});
