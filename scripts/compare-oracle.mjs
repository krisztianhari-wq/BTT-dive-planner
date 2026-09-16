import { createServer } from 'vite';
const vite = await createServer({ server: { middlewareMode: true }, logLevel: 'silent', appType: 'custom' });
const E = await vite.ssrLoadModule('/src/engine/index.ts');
const P = [
  ['A', 30, 30, { o2: .32, he: 0 }, []],
  ['B', 45, 25, { o2: .21, he: .35 }, [[.5, 0, 21]]],
  ['C', 51, 30, { o2: .21, he: .35 }, [[.5, 0, 21]]],
  ['D', 60, 25, { o2: .18, he: .45 }, [[.5, 0, 21], [1, 0, 6]]],
  ['E', 75, 20, { o2: .15, he: .55 }, [[.35, .25, 36], [.5, 0, 21], [1, 0, 6]]],
  ['E2', 75, 20, { o2: .15, he: .55 }, [[.5, 0, 21], [1, 0, 6]]],
];
const lastStop = Number(process.argv[2] ?? 3), shallow = Number(process.argv[3] ?? 9);
console.log(`ours (gfEvalAt=${process.env.GFEVAL ?? 'next'})  GF ${process.env.GFL ?? 20}/${process.env.GFH ?? 85}  descent 20  ascent 9/${shallow}  last stop ${lastStop} m`);
for (const [id, d, bt, g, deco] of P) {
  const p = E.planDive({ maxDepth: d, bottomTime: bt, bottomGas: g, decoGases: deco.map(([o2, he, sd]) => ({ gas: { o2, he }, switchDepth: sd })),
    settings: { gfEvalAt: process.env.GFEVAL ?? 'next', gf: { low: Number(process.env.GFL ?? 20) / 100, high: Number(process.env.GFH ?? 85) / 100 }, lastStopDepth: lastStop, ascentRateShallowMpm: shallow } });
  const st = E.stopTable(p);
  console.log(`${id} | ${d} m / ${bt} min | first stop ${p.firstStopDepth ?? '-'} | stops ${st.reduce((a, s) => a + s.minutes, 0)} min | deco ${p.decoTime.toFixed(1)} | runtime ${p.runtime.toFixed(1)}`);
  console.log('    ' + st.map(s => `${s.depth}m:${s.minutes}′(${s.gas})`).join('  '));
}
await vite.close();
