import { open, readJson, PW } from './harness.mjs';
import fs from 'fs';
const log = (...a) => console.log(...a);
const live = readJson('live_state.json');
const t = await open({ docs: live.db, gsFiles: live.files, keep: true }), page = t.page;
const n = async (file) => { const o = []; for (const k of ['ARCHIVE', 'DATA', 'SUMMARY', 'BACKUP']) { const x = await t.tab(k, file); o.push(x ? x.rows.length : '-'); } return o.join('/'); };
const db = (k) => page.evaluate((k) => window.__db[k], k);
const back = async () => { await page.click('#panel-saved [data-act=back]'); await page.waitForTimeout(150); };
const gl = async () => (await t.txt('#gs-line')).replace(/\n/g, ' ~ ');
const bump = async () => t.type('#f-a319-af', String(+(await page.inputValue('#f-a319-af')) + 1));
const openSet = async () => { await page.click('#gs-chip'); await page.waitForTimeout(250); };
// ---- 1: first open after the change ----
log('1 reminder:', (await t.dlgText()).slice(0, 190));
await t.cancel(); await page.waitForTimeout(150);
log('1 banner:', (await t.txt('#fy-note')).replace(/\n/g, ' ~ '), '| chip:', await t.txt('#gs-chip'));
// ---- 2: SAVE before any BACKUP file is set ----
await t.type('#f-dateFrom', '2026-10-07'); await page.click('#btn-save'); await page.waitForTimeout(2000);
log('2 dialog:', (await t.dlgText()).slice(0, 120), '| gs-line:', await gl());
log('2 rows A', await n(t.FILE), 'B', await n(t.FILE_B), '| bpending', JSON.stringify((await db('app/sheets')).bpending), '| doc v', (await db('app/sheets')).v, 'tabs70', JSON.stringify((await db('app/sheets')).files['70'].tabs));
await back();
// ---- 3: set the BACKUP file of FY 70 ----
await openSet();
await page.fill('#dlg input[name=fy]', '70'); await page.fill('#dlg input[name=blink]', t.FILE_B); await t.pass(PW.sheet); log('3 same file as main →', await page.locator('#dlg .derr').innerText());
await page.fill('#dlg input[name=blink]', ''); await t.pass(PW.sheet); log('3 no link →', await page.locator('#dlg .derr').innerText());
await page.fill('#dlg input[name=blink]', 'https://docs.google.com/spreadsheets/d/' + t.BK_B + '/edit#gid=0'); await t.pass(PW.admin); log('3 old password →', await page.locator('#dlg .derr').innerText());
await page.evaluate(() => { window.__gs.calls.length = 0; });
await t.pass(PW.sheet); await page.waitForTimeout(7000);
log('3 toast:', await t.txt('#toast'));
log('3 rows B', await n(t.FILE_B), 'BK_B', await n(t.BK_B), '| bpending', JSON.stringify((await db('app/sheets')).bpending), '| banner hidden:', await page.locator('#fy-note').isHidden(), '| chip:', await t.txt('#gs-chip'));
log('3 BK_B ids:', (await t.tab('ARCHIVE', t.BK_B)).rows.map((r) => r[0]).join(','));
log('3 BK_B about:', (await t.tab('คำอธิบาย', t.BK_B)).rows.slice(0, 2).map((r) => r[0]).join(' / '), '| tabs:', await page.evaluate(() => window.__gs.files.BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.sheets.map((s) => s.properties.title + (s.properties.hidden ? '(hidden)' : '')).join(',')), '| prot:', await page.evaluate(() => window.__gs.files.BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.prot.length));
const same = await page.evaluate(() => { const g = window.__gs.files, a = (f, t) => g[f].sheets.find((s) => s.properties.title === t).rows; return ['ARCHIVE', 'DATA', 'SUMMARY'].map((t) => JSON.stringify(a('FILE_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', t)) === JSON.stringify(a('BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', t))); });
log('3 BK_B equals main B (ARCHIVE/DATA/SUMMARY):', JSON.stringify(same));
log('3 writes to main files during backup setup:', (await page.evaluate(() => window.__gs.calls)).filter((c) => c.tool === 'update_spreadsheet' && c.input.spreadsheetId.startsWith('FILE')).length);
// ---- 4: FY 69 BACKUP ----
await openSet(); await page.fill('#dlg input[name=fy]', '69'); await page.fill('#dlg input[name=blink]', t.BK_A); await t.pass('thanchanit'); await page.waitForTimeout(6000);
log('4 rows A', await n(t.FILE), 'BK_A', await n(t.BK_A), '| BK_A ids:', (await t.tab('ARCHIVE', t.BK_A)).rows.map((r) => r[0]).join(','));
// ---- 5: SAVE with both files ----
await bump(); await page.click('#btn-save'); await page.waitForTimeout(2200);
log('5 gs-line:', await gl(), '| rows B', await n(t.FILE_B), 'BK_B', await n(t.BK_B), '| queues', JSON.stringify([(await db('app/sheets')).pending, (await db('app/sheets')).bpending]));
await back();
// ---- 6: a row deleted from the main file by hand does not touch the BACKUP ----
await page.evaluate(() => { const f = window.__gs.files.FILE_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB; for (const s of f.sheets) if (['ARCHIVE', 'DATA', 'SUMMARY'].includes(s.properties.title)) { const keep = s.rows.filter((r, i) => i === 0 || (r[0] && r[0].userEnteredValue.stringValue !== 'r2026-10-01_001')); s.properties.gridProperties.rowCount -= s.rows.length - keep.length; s.rows = keep; } });
log('6 after deleting r2026-10-01_001 from main: B', await n(t.FILE_B), 'BK_B', await n(t.BK_B), '| in BK_B:', (await t.tab('ARCHIVE', t.BK_B)).rows.some((r) => r[0] === 'r2026-10-01_001'));
// ---- 7: an account that cannot open the BACKUP file ----
await page.evaluate(() => { window.__gs.deny.BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB = true; });
await bump(); await page.click('#btn-save'); await page.waitForTimeout(2200);
log('7 gs-line:', await gl(), '| state', await page.locator('#gs-line').getAttribute('data-s'), '| chip:', await t.txt('#gs-chip'));
log('7 rows B', await n(t.FILE_B), 'BK_B', await n(t.BK_B), '| queues', JSON.stringify([(await db('app/sheets')).pending, (await db('app/sheets')).bpending]));
await back();
await page.evaluate(() => { delete window.__gs.deny.BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB; });
await bump(); await page.click('#btn-save'); await page.waitForTimeout(2200);
log('7b owner saves next → gs-line:', await gl(), '| rows B', await n(t.FILE_B), 'BK_B', await n(t.BK_B), '| queues', JSON.stringify([(await db('app/sheets')).pending, (await db('app/sheets')).bpending]));
await back();
// ---- 8: look-back from the BACKUP file; delete with the password ----
await page.click('#btn-hist'); await page.waitForTimeout(900);
log('8 sources:', (await page.locator('#h-src option').allInnerTexts()).join(' || '));
await page.selectOption('#h-src', 'bk:' + t.BK_B); await page.waitForTimeout(900);
log('8 backup list:', await page.locator('#h-list .hrow').count(), '| info:', await t.txt('#h-info'));
await page.locator('#h-list .hrow').last().click(); await page.waitForTimeout(900);
log('8 view:', await t.txt('#h-title'), '| delete button visible:', await page.locator('#h-del').isVisible());
await page.click('#h-del'); await page.waitForTimeout(250);
log('8 delete dialog:', (await t.dlgText()).slice(0, 260));
await t.pass(PW.admin); log('8 wrong pw →', await page.locator('#dlg .derr').innerText());
await t.pass(PW.sheet); await page.waitForTimeout(2500);
log('8 after delete: BK_B', await n(t.BK_B), '| still in BK_B:', (await t.tab('ARCHIVE', t.BK_B)).rows.some((r) => r[0] === 'r2026-10-01_001'), '| DATA/SUMMARY left:', (await t.tab('DATA', t.BK_B)).rows.filter((r) => r[0] === 'r2026-10-01_001').length, (await t.tab('SUMMARY', t.BK_B)).rows.filter((r) => r[0] === 'r2026-10-01_001').length, '| bgone', JSON.stringify((await db('app/sheets')).bgone), '| main B', await n(t.FILE_B), '| toast:', await t.txt('#toast'));
await page.selectOption('#h-src', 'gs:' + t.FILE_B); await page.waitForTimeout(900);
await page.locator('#h-list .hrow').first().click(); await page.waitForTimeout(700);
log('8 main source: delete button visible:', await page.locator('#h-del').isVisible());
await page.click('#panel-hist [data-act=back]'); await page.waitForTimeout(150);
await openSet(); await page.click('#dlg [data-a="0"]'); await page.waitForTimeout(3000);
log('8 check action:', await page.locator('#dlg .dinfo').innerText(), '| BK_B', await n(t.BK_B), '| deleted one back?', (await t.tab('ARCHIVE', t.BK_B)).rows.some((r) => r[0] === 'r2026-10-01_001'));
await t.cancel();
// ---- 9: a damaged row in the main file is read from the BACKUP file ----
await page.evaluate(() => { const s = window.__gs.files.FILE_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB.sheets.find((x) => x.properties.title === 'ARCHIVE'); s.rows.find((r) => r[0] && r[0].userEnteredValue.stringValue === 'r2026-10-01_002')[7] = { userEnteredValue: { stringValue: '{broken' } }; });
await page.click('#btn-hist'); await page.waitForTimeout(900);
const idx = await page.evaluate(() => [...document.querySelectorAll('#h-list .hrow')].length - 2);
await page.locator('#h-list .hrow').nth(idx).click(); await page.waitForTimeout(900);
log('9 damaged main row →', await t.txt('#h-title'), '| info:', await t.txt('#h-info'));
await page.evaluate(() => { window.__gs.deny.BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB = true; });
await page.locator('#h-list .hrow').nth(idx).click(); await page.waitForTimeout(900);
log('9 same, account without the BACKUP →', await t.txt('#h-info'));
await page.selectOption('#h-src', 'bk:' + t.BK_B); await page.waitForTimeout(900);
log('9 BACKUP source without access →', await t.txt('#h-info'));
log('errors:', JSON.stringify(t.errors));
await t.browser.close();
