// Runs every scenario one after another against dist/daily-aircraft-status.html and prints a summary.
// The scenarios are log-style: each prints what the page did, and ends with the browser errors it collected.
// A run counts as clean when the process exits 0 and every "errors" line it prints is an empty list.
// Read the logs after changing behaviour — a scenario does not fail by itself when a printed value changes.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const dir = fileURLToPath(new URL('.', import.meta.url));
const tests = ['save_basic', 'signers_basic', 'dates_fonts_sched', 'overlong_marking', 'history_lookback', 'backup_files', 'new_fiscal_year', 'replace_main_file', 'width_desktop', 'width_phone', 'overflow_phone', 'render_paper', 'standalone_site', 'backend_api', 'backend_site'];
const only = process.argv.slice(2);
let bad = 0;
for (const t of tests.filter((x) => !only.length || only.includes(x))) {
  const r = spawnSync(process.execPath, [dir + t + '.mjs'], { encoding: 'utf8', timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const errs = [...out.matchAll(/errors[^:\n]*:\s*(\[.*?\])(?=\s|$)/g)].map((m) => m[1]);
  const clean = r.status === 0 && errs.every((e) => e === '[]');
  if (!clean) bad++;
  console.log((clean ? 'ok   ' : 'CHECK') + ' ' + t + (clean ? '' : '  (exit ' + r.status + ', errors ' + errs.filter((e) => e !== '[]').join(' ') + ')'));
  if (!clean || process.env.VERBOSE) console.log(out.split('\n').map((l) => '      ' + l.slice(0, 400)).join('\n'));
}
console.log(bad ? bad + ' scenario(s) need a look' : 'all scenarios clean');
process.exit(bad ? 1 : 0);
