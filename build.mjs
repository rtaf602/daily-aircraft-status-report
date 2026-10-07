// Builds the page:  node build.mjs      (no dependencies beyond Node itself)
//
//   src/page.html + fonts (embedded as base64) + fonts/advances.json + password hashes
//     → dist/daily-aircraft-status.html   the file published as the Claude artifact (full function: shared data, Google Sheet)
//     → site/index.html                   the same page as a complete HTML document for an ordinary web host such as
//                                         GitHub Pages. With site.backendUrl set in build.config.json it saves through the
//                                         Google Apps Script back end (backend/Code.gs): shared data and Google Sheet.
//                                         Without it every browser keeps its own data. See README.md.
// Environment: SITE_BACKEND_URL overrides site.backendUrl (empty = none), SITE_OUT writes the site somewhere else.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const at = (p) => fileURLToPath(new URL(p, import.meta.url));
const b64 = (p) => fs.readFileSync(at(p)).toString('base64');
const cfg = JSON.parse(fs.readFileSync(at('./build.config.json'), 'utf8'));
let s = fs.readFileSync(at('./src/page.html'), 'utf8');
const put = {
  __FONT_REGULAR__: b64('./fonts/THSarabun.ttf'),
  __FONT_BOLD__: b64('./fonts/THSarabun_Bold.ttf'),
  __FONT_ADV__: fs.readFileSync(at('./fonts/advances.json'), 'utf8').trim(),
  __HASH_ADMIN__: String(cfg.hashes.admin),
  __HASH_HOURS__: String(cfg.hashes.hours),
  __HASH_SHEET__: String(cfg.hashes.sheet),
};
for (const [k, v] of Object.entries(put)) {
  const n = s.split(k).length - 1;
  if (n !== 1) throw new Error(k + ' must appear exactly once in src/page.html, found ' + n);
  s = s.replace(k, () => v);
}

// The administrator's name and phone number (two lines written into the first tab of each Google Sheet) are not kept in
// this repository. The Claude artifact gets them from contact.json in the private folder; without that folder it gets a
// neutral wording. The web-site build never carries them: there they come from the back end, after the access code.
const jsStr = (t) => "'" + String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const privateDirs = [process.env.STATUS602_PRIVATE, at('./private'), at('../aircraft-status-602-private')].filter(Boolean);
const contactFile = privateDirs.map((d) => path.join(d, 'contact.json')).find((f) => fs.existsSync(f));
const contact = contactFile ? JSON.parse(fs.readFileSync(contactFile, 'utf8')) : ['ผู้ดูแลระบบของหน่วย', ''];
const CONTACT = ['__CONTACT_1__', '__CONTACT_2__'];
for (const k of CONTACT) if (s.split(k).length !== 2) throw new Error(k + ' must appear exactly once in src/page.html');
const page = s;                                               // placeholders for the contact lines still in
s = page.replace(CONTACT[0], () => jsStr(contact[0] || '')).replace(CONTACT[1], () => jsStr(contact[1] || ''));
fs.mkdirSync(at('./dist'), { recursive: true });
fs.writeFileSync(at('./dist/daily-aircraft-status.html'), s);

// ---------- site/index.html: the same page for an ordinary web host ----------
// Changes made to the web-site build only. Each `from` must be found exactly once in the built page, so a change in
// src/page.html that would silently drop one of them stops the build instead.
const siteEdits = [
  { why: 'tell the back-end client which Google Sheet password was just accepted, so the back end can check it too',
    from: "const passOk = (kind, v) => h53('602:' + str(v).trim().toUpperCase()) === PASS[kind];",
    to: "const passOk = (kind, v) => { const ok = h53('602:' + str(v).trim().toUpperCase()) === PASS[kind]; if (ok && kind === 'sheet' && window.__status602) window.__status602.admin(str(v).trim()); return ok; };" },
  { why: 'every step of a SAVE is a trip to the back end here, so the lock that keeps two devices from saving at once is held for longer',
    from: "    locked = await lease(store.lock, 20000);",
    to: "    locked = await lease(store.lock, 60000);" },
];
let site = page.replace(CONTACT[0], () => "(((window.__status602 || {}).contact || [])[0]) || 'ผู้ดูแลระบบของหน่วย'").replace(CONTACT[1], () => "(((window.__status602 || {}).contact || [])[1]) || ''");
for (const e of siteEdits) {
  const n = site.split(e.from).length - 1;
  if (n !== 1) throw new Error('site edit not applicable (' + n + ' matches): ' + e.why);
  site = site.replace(e.from, () => e.to);
}

// the Google Apps Script back end: its web-app address is put into the page; empty = every browser keeps its own data
const backendUrl = ('SITE_BACKEND_URL' in process.env ? process.env.SITE_BACKEND_URL : ((cfg.site || {}).backendUrl || '')).trim();
if (backendUrl && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(backendUrl) && !/^http:\/\/127\.0\.0\.1:\d+\/exec$/.test(backendUrl))
  throw new Error('site.backendUrl must be the web-app address from Apps Script (https://script.google.com/macros/s/…/exec)');
const gs = fs.readFileSync(at('./backend/Code.gs'), 'utf8'), adminHash = /const ADMIN_HASH = (\d+);/.exec(gs);
if (!adminHash || adminHash[1] !== String(cfg.hashes.sheet)) throw new Error('ADMIN_HASH in backend/Code.gs must equal hashes.sheet in build.config.json');
const client = backendUrl ? '<script>\n' + fs.readFileSync(at('./src/site_client.js'), 'utf8').replace("'__BACKEND_URL__'", () => JSON.stringify(backendUrl)) + '</script>\n' : '';
if (client.includes('__BACKEND_URL__')) throw new Error('src/site_client.js: the back-end address was not filled in');

// The Claude viewer wraps an artifact in its own document and base styles. A plain web host gets them spelled out here.
// The page's own <title> and <style> come first in the file, so they still land inside <head>.
const shell = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<style>
body { margin: 0; font: 14px system-ui, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
`;
const out = process.env.SITE_OUT ? process.env.SITE_OUT.replace(/[\\/]$/, '') + '/' : at('./site/');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + 'index.html', shell + client + site + '\n</html>\n');
fs.writeFileSync(out + '.nojekyll', '');
const kb = (t) => Math.round(Buffer.byteLength(t) / 1024) + ' KB';
console.log('built dist/daily-aircraft-status.html', kb(s), contactFile ? '(Claude artifact)' : '(Claude artifact — WITHOUT the administrator contact lines: the private folder was not found)');
console.log('built ' + (process.env.SITE_OUT ? out : 'site/') + 'index.html', kb(shell + client + site), backendUrl ? '(web site with the shared back end)' : '(web site, every browser keeps its own data: no back-end address set)');
