import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planDive, stopTable } from '../src/engine';

interface Golden {
  id: string;
  source: string;
  pending?: boolean;
  profile: { maxDepth: number; bottomTime: number; bottomGas: { o2: number; he: number }; decoGases: { o2: number; he: number; switchDepth: number }[] };
  settings: { gfLow: number; gfHigh: number; lastStop: number; descentRate: number; ascentRate: number; ascentRateShallow: number; gasSwitchMinutes?: number };
  expected: { stops: { depth: number; minutes: number }[]; decoTime: number; runtime: number };
  tolerance?: { stopMinutes?: number; decoTime?: number; runtime?: number };
}

const dir = join(__dirname, 'golden');
const files = readdirSync(dir).filter((f: string) => f.endsWith('.json'));

describe('golden reference schedules', () => {
  for (const f of files) {
    const g: Golden = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const run = g.pending ? it.skip : it;
    run(`${g.id} (${g.source}): ${g.profile.maxDepth} m / ${g.profile.bottomTime} min`, () => {
      const plan = planDive({
        maxDepth: g.profile.maxDepth,
        bottomTime: g.profile.bottomTime,
        bottomGas: g.profile.bottomGas,
        decoGases: g.profile.decoGases.map((d) => ({ gas: { o2: d.o2, he: d.he }, switchDepth: d.switchDepth })),
        settings: {
          gf: { low: g.settings.gfLow / 100, high: g.settings.gfHigh / 100 },
          lastStopDepth: g.settings.lastStop,
          descentRateMpm: g.settings.descentRate,
          ascentRateMpm: g.settings.ascentRate,
          ascentRateShallowMpm: g.settings.ascentRateShallow,
          gasSwitchMinutes: g.settings.gasSwitchMinutes ?? 0,
        },
      });
      const tol = { stopMinutes: 1, decoTime: 2, runtime: 2, ...g.tolerance };
      const ours = stopTable(plan);
      const oursByDepth = new Map(ours.map((s) => [s.depth, s.minutes]));
      const expByDepth = new Map(g.expected.stops.map((s) => [s.depth, s.minutes]));
      const depths = new Set([...oursByDepth.keys(), ...expByDepth.keys()]);
      const diffs: string[] = [];
      for (const d of [...depths].sort((a, b) => b - a)) {
        const o = oursByDepth.get(d) ?? 0, e = expByDepth.get(d) ?? 0;
        if (Math.abs(o - e) > tol.stopMinutes) diffs.push(`${d} m: ours ${o}′ vs ref ${e}′`);
      }
      expect(diffs, `stop differences for ${g.id}`).toEqual([]);
      expect(Math.abs(plan.decoTime - g.expected.decoTime), 'deco time').toBeLessThanOrEqual(tol.decoTime);
      expect(Math.abs(plan.runtime - g.expected.runtime), 'runtime').toBeLessThanOrEqual(tol.runtime);
    });
  }
});
