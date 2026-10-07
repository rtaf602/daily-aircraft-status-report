// The web-site build together with the real back-end code, end to end, on the stand-in for Google (test/gas_sim.mjs):
// access code → import of the old data → setting the Google Sheet files → SAVE from two "devices" → look-back →
// deleting from the BACKUP file → working on when the back end cannot be reached.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, OUT, PRIVATE, PW, fixture, readJson } from './paths.mjs';
import { startSim, blankFile } from './gas_sim.mjs';

const log = (...a) => console.log(...a);
const MAIN = 'SIMMAIN70' + 'A'.repeat(35), BK = 'SIMBACKUP70' + 'B'.repeat(33), CODE = 'UNIT602CODE';
// SLOW=<ms> adds that delay to every hop (a request is two hops), to see the page under the back end's real pace
const SLOW = +process.env.SLOW || 0, W = SLOW ? 1 + SLOW / 100 : 1;
const sim = await startSim({ files: { [MAIN]: blankFile('ปีงบ70 หลัก'), [BK]: blankFile('ปีงบ70 BACKUP') }, delayMs: SLOW });
sim.setup(CODE, ['ผู้ดูแลทดสอบ (หน่วยทดสอบ)', 'โทร.000-000-0000']);
const siteDir = path.join(OUT, 'site_backend');
const b = spawnSync(process.execPath, [path.join(ROOT, 'build.mjs')], { encoding: 'utf8', env: { ...process.env, SITE_BACKEND_URL: sim.backendUrl, SITE_OUT: siteDir } });
if (b.status !== 0) { console.error(b.stdout + b.stderr); process.exit(1); }
sim.siteHtml = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
log('0 site build:', b.stdout.trim().split('\n').pop().replace(siteDir, '<out>'), '| page carries the administrator’s name or phone:', JSON.parse(fs.readFileSync(path.join(PRIVATE, 'contact.json'), 'utf8')).some((line) => line && sim.siteHtml.includes(line)));

// the data to bring over: what the Claude page's store held (fixtures), without its Google Sheet settings
const seed = { docs: { 'app/config': readJson('dbread10/app/config.json'), 'app/state': readJson('dbread10/app/state.json') } };
for (const f of fs.readdirSync(fixture('dbread10/history'))) seed.docs['history/' + f.replace('.json', '')] = readJson('dbread10/history/' + f);
const seedFile = path.join(OUT, 'seed-test.json'); fs.writeFileSync(seedFile, JSON.stringify(seed));

const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
const errors = [];
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true }), page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(name + ' PAGEERROR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) errors.push(name + ' ' + m.text()); });
  const dlg = async () => ((await page.locator('#dlg[open]').count()) ? (await page.locator('#dlg').innerText()).replace(/\n+/g, ' | ') : '(no dialog)');
  const go = async () => { await page.goto(sim.siteUrl); await page.waitForTimeout(400 * W); };
  const enter = async (code) => { await page.fill('#site-gate input', code); await page.click('#site-gate button[type=submit]'); await page.waitForTimeout(900 * W); };
  const settle = async (ms) => { await page.waitForTimeout((ms || 1200) * W); if (await page.locator('#dlg[open] [data-x=cancel]').count()) { await page.click('#dlg [data-x=cancel]'); await page.waitForTimeout(200 * W); } };   // the daily reminder
  const type = async (sel, v) => { await page.fill(sel, v); await page.locator(sel).blur(); await page.waitForTimeout(200 * W); };
  const status = () => page.locator('#save-status').innerText();
  return { page, dlg, go, enter, settle, type, status };
}
const rows = (id) => ['ARCHIVE', 'DATA', 'SUMMARY'].map((t) => { const x = sim.tab(id, t); return x ? x.length - 1 : '-'; }).join('/');
const doc = (p) => sim.post({ code: CODE, calls: [{ op: 'doc.get', path: p }] }).results[0].data;

// ---- 1: first visit: the access code ----
const A = await device('A');
await A.go();
log('1 gate shown:', await A.page.isVisible('#site-gate'), '| page behind it:', await A.status());
await A.enter('wrong-code-1'); log('1 wrong code →', await A.page.locator('#site-gate .e').innerText());
await A.enter(CODE); await A.settle();
log('1 right code → gate hidden:', await A.page.isHidden('#site-gate'), '| status:', await A.status(), '| import bar:', await A.page.locator('#site-import').count());

// ---- 2: bring the old data in ----
await A.page.setInputFiles('#site-import input[type=file]', seedFile);
await A.page.fill('#site-import input[type=password]', PW.admin); await A.page.click('#site-import .go'); await A.page.waitForTimeout(700 * W);
log('2 wrong password →', await A.page.locator('#site-import .s').innerText());
await A.page.fill('#site-import input[type=password]', PW.sheet); await A.page.click('#site-import .go'); await A.page.waitForTimeout(3500 * W); await A.settle();
log('2 after import: status:', await A.status(), '| import bar:', await A.page.locator('#site-import').count(), '| store rows:', sim.tab(sim.props.STORE_ID, 'docs').length - 1, '| first aircraft hours shown:', await A.page.inputValue('#f-a319-af'));

// ---- 3: set the Google Sheet files of fiscal year 70 ----
await A.page.click('#gs-chip'); await A.page.waitForTimeout(600 * W);
await A.page.fill('#dlg input[name=fy]', '70'); await A.page.fill('#dlg input[name=link]', 'https://docs.google.com/spreadsheets/d/' + MAIN + '/edit'); await A.page.fill('#dlg input[name=blink]', 'https://docs.google.com/spreadsheets/d/' + BK + '/edit#gid=0');
await A.page.fill('#dlg input[name=pw]', PW.sheet); await A.page.click('#dlg button[type=submit]'); await A.page.waitForTimeout(9000 * W);
log('3 toast:', (await A.page.locator('#toast').innerText()).slice(0, 160));
log('3 tabs main:', sim.files[MAIN].sheets.map((s) => s.properties.title).join(','), '| BACKUP:', sim.files[BK].sheets.map((s) => s.properties.title).join(','));
log('3 rows main', rows(MAIN), 'BACKUP', rows(BK), '| allow-list:', sim.props.ALLOW_IDS === JSON.stringify([MAIN, BK]), '| chip:', await A.page.locator('#gs-chip').innerText());
log('3 contact lines written to the sheet:', sim.tab(MAIN, 'คำอธิบาย').map((r) => r[0]).filter((v) => /ผู้ดูแล|โทร/.test(v)).join(' ~ '));

// ---- 4: SAVE a new report on device A ----
await A.type('#f-dateFrom', '2026-10-07'); await A.type('#f-a319-af', String(+(await A.page.inputValue('#f-a319-af')) + 1));
sim.hits.length = 0; sim.calls.length = 0; const t0 = Date.now(); await A.page.click('#btn-save'); await A.page.waitForSelector('#panel-saved:not([hidden])', { timeout: 30000 * W }); const nSave = sim.hits.length, tSave = Date.now() - t0;
await A.page.waitForTimeout(5000 * W); const apiCalls = sim.calls.filter((c) => !c[0].startsWith('app.')).length, nAll = sim.hits.length, trace = sim.hits.map((h) => h.join(' + '));
log('4 saved page:', (await A.page.locator('#panel-saved').innerText()).split('\n').filter(Boolean).slice(0, 2).join(' | '), '| dialog:', await A.dlg());
log('4 gs line:', (await A.page.locator('#gs-line').innerText()).replace(/\n/g, ' ~ '));
log('4 rows main', rows(MAIN), 'BACKUP', rows(BK), '| last id main:', sim.tab(MAIN, 'ARCHIVE').slice(-1)[0][0], '| BACKUP:', sim.tab(BK, 'ARCHIVE').slice(-1)[0][0], '| queues:', JSON.stringify([doc('app/sheets').pending, doc('app/sheets').bpending]));
log('4 Sheets API calls for this SAVE (Google allows one user about 60 reads and 60 writes a minute):', apiCalls);
log('4 round trips to the back end: until the saved page showed:', nSave, '| until Google Sheet was done:', nAll, SLOW ? '| with ' + 2 * SLOW + ' ms per round trip the saved page took ' + (tSave / 1000).toFixed(1) + ' s' : '');
if (process.env.TRACE) trace.forEach((x, i) => log('    ' + (i + 1) + (i + 1 === nSave ? ' ← saved page' : '') + ': ' + x));

// ---- 5: a second device sees it and saves a revision ----
const B = await device('B');
await B.go(); await B.enter(CODE); await B.settle();
log('5 device B status:', await B.status(), '| hours shown:', await B.page.inputValue('#f-a319-af'));
await B.type('#f-a319-af', String(+(await B.page.inputValue('#f-a319-af')) + 2));
await B.page.click('#btn-save'); await B.page.waitForSelector('#panel-saved:not([hidden])', { timeout: 30000 * W }); await B.page.waitForTimeout(5000 * W);
log('5 B saved:', (await B.page.locator('#panel-saved').innerText()).split('\n').filter(Boolean).slice(0, 2).join(' | '));
log('5 rows main', rows(MAIN), 'BACKUP', rows(BK), '| revs for 7 Oct in the store:', doc('app/state').revs['2026-10-07'], '| ids:', sim.tab(MAIN, 'ARCHIVE').slice(-2).map((r) => r[0] + ' REV ' + r[3]).join(', '));

// ---- 6: device A still shows the older state and saves: it must not overwrite B's revision ----
await A.page.click('#panel-saved [data-act=back]'); await A.page.waitForTimeout(300 * W);
await A.type('#f-a319-af', String(+(await A.page.inputValue('#f-a319-af')) + 5));
await A.page.click('#btn-save'); await A.page.waitForTimeout(6000 * W);
log('6 A saving on top of an older state → saved page:', await A.page.isVisible('#panel-saved'), '| dialog:', (await A.dlg()).slice(0, 170));
if (await A.page.locator('#dlg[open]').count()) { await A.page.click('#dlg button[type=submit]'); await A.page.waitForTimeout(300 * W); }
log('6 revs for 7 Oct:', doc('app/state').revs['2026-10-07'], '| rows main', rows(MAIN));

// ---- 7: look-back and the BACKUP file ----
await B.page.click('#panel-saved [data-act=hist]'); await B.page.waitForTimeout(2500 * W);
const srcs = await B.page.locator('#h-src option').allInnerTexts();
log('7 sources:', srcs.join(' || '));
const bkOpt = await B.page.locator('#h-src option').evaluateAll((os) => (os.find((o) => o.value.startsWith('bk:')) || {}).value);
await B.page.selectOption('#h-src', bkOpt); await B.page.waitForTimeout(2500 * W);
log('7 BACKUP list:', (await B.page.locator('#h-info').innerText()), '| first:', (await B.page.locator('#h-list .hrow b').first().innerText()));
await B.page.locator('#h-list .hrow').first().click(); await B.page.waitForTimeout(3000 * W);
log('7 opened from BACKUP:', await B.page.locator('#h-title').innerText(), '| paper shown:', await B.page.isVisible('#h-paper'));
const before = rows(BK);
const direct = sim.post({ code: CODE, calls: [{ op: 'gs', tool: 'update_spreadsheet', input: { spreadsheetId: BK, requests: [{ deleteDimension: { range: { sheetId: doc('app/sheets').backups['70'].tabs.ARCHIVE, dimension: 'ROWS', startIndex: 1, endIndex: 2 } } }] } }] }).results[0];
log('7 deleting from BACKUP straight through the back end, no password →', (direct.error || {}).code, '| rows still', rows(BK) === before);
await B.page.click('#h-del'); await B.page.waitForTimeout(400 * W);
await B.page.fill('#dlg input[name=pw]', PW.admin); await B.page.click('#dlg button[type=submit]'); await B.page.waitForTimeout(400 * W);
log('7 delete with the wrong password →', (await B.page.locator('#dlg .derr').innerText()));
await B.page.fill('#dlg input[name=pw]', PW.sheet); await B.page.click('#dlg button[type=submit]'); await B.page.waitForTimeout(6000 * W);
log('7 delete with the password → toast:', await B.page.locator('#toast').innerText(), '| BACKUP rows', before, '→', rows(BK), '| main untouched', rows(MAIN), '| noted so it is not backed up again:', Object.keys(doc('app/sheets').bgone).length);

// ---- 8: the back end cannot be reached ----
sim.down = true;
const C = await device('C');
await C.page.addInitScript((c) => { localStorage.setItem('status602:access', c); }, CODE);
await C.go(); await C.page.waitForTimeout(2500 * W);
log('8 back end down → gate:', await C.page.isVisible('#site-gate'), '|', await C.page.locator('#site-gate .e').innerText(), '| offer to work locally:', await C.page.isVisible('#site-gate .q'));
await C.page.click('#site-gate .q'); await C.settle();
log('8 working locally → status:', await C.status(), '| Google Sheet chip hidden:', await C.page.isHidden('#gs-chip'));
sim.down = false;

log('errors:', JSON.stringify(errors));
await browser.close(); sim.close();
