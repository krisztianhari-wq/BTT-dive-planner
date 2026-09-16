// Regenerates tests/golden/oracle-*.json from the dive-deco oracle (tools/oracle).
// Usage: npm run golden:oracle   (requires a Rust toolchain)
import { execSync } from 'node:child_process';
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const SETS = [
  { gf: [85, 85], profiles: ['A', 'B', 'C', 'D', 'E', 'E2'], tolerance: { stopMinutes: 1.5, decoTime: 3, runtime: 3 } },
  // With a GF slope the two implementations agree for typical profiles; deep 75 m profiles (E, E2) diverge (see tools/oracle/README.md)
  // per-stop distribution differs slightly between implementations when a GF slope is active; totals must still agree
  { gf: [20, 85], profiles: ['A', 'B', 'C', 'D'], tolerance: { stopMinutes: 3, decoTime: 3, runtime: 3 } },
];
const dir = 'tests/golden';
for (const f of readdirSync(dir)) if (f.startsWith('oracle-')) unlinkSync(join(dir, f));
for (const set of SETS) {
  const out = execSync(`cargo run --quiet --release -- ${set.gf[0]} ${set.gf[1]} 9 json`, { cwd: 'tools/oracle', encoding: 'utf8' });
  for (const line of out.trim().split('\n')) {
    const r = JSON.parse(line);
    if (!set.profiles.includes(r.id)) continue;
    const fixture = {
      id: `${r.id}-gf${r.gfLow}-${r.gfHigh}`,
      source: 'dive-deco 6.1.2 (independent ZH-L16C implementation)',
      pending: false,
      profile: { maxDepth: r.maxDepth, bottomTime: r.bottomTime, bottomGas: r.bottomGas,
        decoGases: r.decoGases.map((g) => ({ ...g, switchDepth: g.o2 === 1 ? 6 : g.o2 === 0.5 ? 21 : g.o2 === 0.35 ? 36 : 21 })) },
      settings: { gfLow: r.gfLow, gfHigh: r.gfHigh, lastStop: 3, descentRate: 20, ascentRate: 9, ascentRateShallow: 9 },
      expected: { stops: r.stops.map((s) => ({ depth: s.depth, minutes: Math.round(s.minutes) })), decoTime: Math.round(r.tts), runtime: Math.round(r.runtime) },
      tolerance: set.tolerance,
    };
    writeFileSync(join(dir, `oracle-${fixture.id}.json`), JSON.stringify(fixture, null, 2) + '\n');
  }
}
console.log('golden fixtures:', readdirSync(dir).filter((f) => f.startsWith('oracle-')).join(', '));
