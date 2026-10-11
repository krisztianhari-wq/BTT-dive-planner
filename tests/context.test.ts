import { describe, expect, it } from 'vitest';
import { parsePlannerContext } from '../src/ui/Repetitive';
import { tissuesFromLog, initialTissues } from '../src/engine';

describe('napló planner context (GET /api/planner/context)', () => {
  it('parses the documented shape and drops invalid samples', () => {
    const c = parsePlannerContext({
      user: { display_name: 'Krisz' }, sac: { bottom: 17, deco: 13 },
      recent: [{ id: 7, start_local: '2026-10-11T09:00:00', start_utc_epoch: 1_791_700_000, duration_s: 2400,
        samples: [{ t: 0, d: 0 }, { t: 60, d: 20, gas: 0 }, { t: 'x', d: 3 }, { t: 2340, d: 0 }], gases: [{ o2: 32, he: 0 }], surface_mbar: 1013, salinity: 1030, extra: 1 }],
    })!;
    expect(c.user?.display_name).toBe('Krisz');
    expect(c.sac).toEqual({ bottom: 17, deco: 13 });
    expect(c.recent[0].samples).toHaveLength(3);
    expect(c.recent[0].samples[1]).toEqual({ t: 60, d: 20, gas: 0 });
    const r = tissuesFromLog(c.recent, 1_791_700_000 + 2400 + 3600);
    expect(r.used).toHaveLength(1);
    expect(r.tissues.n2[0]).toBeGreaterThan(initialTissues().n2[0]);
  });
  it('tolerates missing / null fields', () => {
    const c = parsePlannerContext({ user: null, sac: null, recent: [{ start_utc_epoch: null, samples: null }] })!;
    expect(c.user).toBeNull();
    expect(c.sac).toBeNull();
    expect(c.recent[0].samples).toEqual([]);
    expect(parsePlannerContext('nope')).toBeNull();
  });
});
