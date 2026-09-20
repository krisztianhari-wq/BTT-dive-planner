// Prints our schedule for every golden fixture so it can be compared by eye with an external planner.
// Usage: npm run schedule   (loads the TypeScript engine through Vite's SSR loader, no build step needed)
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', appType: 'custom' });
const engine = await vite.ssrLoadModule('/src/engine/index.ts');
const dir = 'tests/golden';
for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const g = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const p = engine.planDive({
    maxDepth: g.profile.maxDepth, bottomTime: g.profile.bottomTime, bottomGas: g.profile.bottomGas,
    decoGases: g.profile.decoGases.map((d) => ({ gas: { o2: d.o2, he: d.he }, switchDepth: d.switchDepth })),
    settings: { gasSwitchMinutes: g.settings.gasSwitchMinutes ?? 0, gf: { low: g.settings.gfLow / 100, high: g.settings.gfHigh / 100 }, lastStopDepth: g.settings.lastStop,
      descentRateMpm: g.settings.descentRate, ascentRateMpm: g.settings.ascentRate, ascentRateShallowMpm: g.settings.ascentRateShallow },
  });
  const stops = engine.stopTable(p).map((s) => `${s.depth}m:${s.minutes}′`).join('  ');
  console.log(`${g.id} | ${g.profile.maxDepth} m / ${g.profile.bottomTime} min | GF ${g.settings.gfLow}/${g.settings.gfHigh} | first ${p.firstStopDepth ?? '-'} | deco ${p.decoTime.toFixed(0)} | runtime ${p.runtime.toFixed(0)}${g.pending ? '  [pending]' : ''}\n    ${stops}`);
}
await vite.close();
