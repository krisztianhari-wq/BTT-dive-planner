// Post-build step for the single-file variant: embed favicon / apple-touch-icon as data URIs
// and leave only index.html in dist-single/.
import { readFileSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-single';
const html = join(dir, 'index.html');
let s = readFileSync(html, 'utf8');
let count = 0;
s = s.replace(/href="\.\/((?:icons\/)?[\w.-]+\.png)"/g, (_m, rel) => {
  const b64 = readFileSync(join(dir, rel)).toString('base64');
  count++;
  return `href="data:image/png;base64,${b64}"`;
});
writeFileSync(html, s);
for (const f of readdirSync(dir)) {
  if (f === 'index.html') continue;
  rmSync(join(dir, f), { recursive: true, force: true });
}
console.log(`inlined ${count} icon(s); dist-single/index.html = ${(statSync(html).size / 1024).toFixed(0)} kB`);
