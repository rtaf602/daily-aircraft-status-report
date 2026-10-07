// Where things are. The scenarios need material that is deliberately NOT in the git repository: fixtures made from real
// reports, and the page's passwords. It lives in a private folder, looked for in this order:
//   1. the folder named by the environment variable STATUS602_PRIVATE
//   2. ./private                         (inside the project; listed in .gitignore)
//   3. ../aircraft-status-602-private    (next to the project folder, as it comes in the hand-over zip)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
export const OUT = path.join(ROOT, 'test', 'out');                         // screenshots and exported files land here
fs.mkdirSync(OUT, { recursive: true });
const tries = [process.env.STATUS602_PRIVATE, path.join(ROOT, 'private'), path.join(ROOT, '..', 'aircraft-status-602-private')].filter(Boolean);
export const PRIVATE = tries.find((p) => fs.existsSync(path.join(p, 'passwords.json')));
if (!PRIVATE) {
  console.error('The private folder was not found. The scenarios need its fixtures and passwords.\nLooked in:\n  ' + tries.join('\n  ')
    + '\nPut the folder "aircraft-status-602-private" next to the project, copy it to ./private, or set STATUS602_PRIVATE.');
  process.exit(2);
}
export const fixture = (name) => path.join(PRIVATE, 'fixtures', name);
export const readJson = (name) => JSON.parse(fs.readFileSync(fixture(name), 'utf8'));
export const PW = JSON.parse(fs.readFileSync(path.join(PRIVATE, 'passwords.json'), 'utf8'));     // { admin, hours, sheet }
export const BUILD = process.env.BUILD || path.join(ROOT, 'dist', 'daily-aircraft-status.html');
