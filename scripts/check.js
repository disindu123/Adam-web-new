import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', '.git'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    result.push(...(entry.isDirectory() ? await files(path) : [path]));
  }
  return result;
}
let failed = false, count = 0;
for (const path of await files(root)) {
  if (path.endsWith('.js')) {
    const check = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    count++;
    if (check.status !== 0) { console.error(check.stderr); failed = true; }
  }
  if (path.endsWith('.html')) {
    const html = await readFile(path, 'utf8');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    if (new Set(ids).size !== ids.length) { console.error(`Duplicate HTML IDs: ${path}`); failed = true; }
    for (const [, target] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) {
      try { await readFile(join(root, 'public', target)); }
      catch { console.error(`Missing asset ${target} in ${path}`); failed = true; }
    }
  }
}
const publicHtml = await readFile(join(root, 'public/index.html'), 'utf8');
if (/\/login|\/admin|admin panel|admin dashboard|Adam'\s*&&/i.test(publicHtml)) { console.error('Private access details appeared in the public portfolio.'); failed = true; }
if (failed) process.exitCode = 1;
else console.log(`Checked ${count} JavaScript files, HTML identifiers and local asset references.`);
