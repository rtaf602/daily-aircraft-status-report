// The back end by itself (backend/Code.gs run against the stand-in for Google, no browser): what it accepts and what it refuses.
// Needs nothing from the private folder.
import { startSim, blankFile } from './gas_sim.mjs';
const MAIN = 'SIMMAIN70' + 'A'.repeat(35), BK = 'SIMBACKUP70' + 'B'.repeat(33), OTHER = 'SIMOTHER' + 'C'.repeat(36);
const sim = await startSim({ files: { [MAIN]: blankFile('ปีงบ70 หลัก'), [BK]: blankFile('ปีงบ70 BACKUP'), [OTHER]: blankFile('ไฟล์ส่วนตัวของเจ้าของ') } });
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// the Google Sheet password comes from the private folder when it is there; without it the checks that need it are skipped
const here = fileURLToPath(new URL('..', import.meta.url));
const pwFile = [process.env.STATUS602_PRIVATE, path.join(here, 'private'), path.join(here, '..', 'aircraft-status-602-private')].filter(Boolean).map((d) => path.join(d, 'passwords.json')).find((f) => fs.existsSync(f));
const CODE = 'UNIT602CODE', ADMIN = pwFile ? JSON.parse(fs.readFileSync(pwFile, 'utf8')).sheet : '';
const bad = []; const check = (name, cond, got) => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (cond ? '' : '  → ' + JSON.stringify(got))); if (!cond) bad.push(name); };
const one = (c, extra) => { const r = sim.post(Object.assign({ v: 1, code: CODE, calls: [c] }, extra || {})); return r.ok ? r.results[0] : r; };
const code = (r) => (r.error || {}).code;

check('before setup: not ready', code(sim.post({ code: CODE, calls: [{ op: 'ping' }] })) === 'not_ready');
let threw = ''; try { sim.setup('short', []); } catch (e) { threw = e.message; }
check('setup refuses a short access code', /8/.test(threw), threw);
sim.setup(CODE, ['ผู้ดูแลทดสอบ', 'โทร.000-000-0000']);
const STORE = sim.props.STORE_ID;
check('setup made the store spreadsheet with 63 columns', !!STORE && sim.files[STORE].sheets[0].properties.gridProperties.columnCount === 63, sim.logs);
check('wrong access code is refused', code(sim.post({ code: 'nope', calls: [{ op: 'ping' }] })) === 'bad_code');
const ping = one({ op: 'ping' });
check('ping: empty store, contact from setup', ping.ok && ping.empty === true && ping.contact[0] === 'ผู้ดูแลทดสอบ', ping);

// documents
check('get of a missing document', one({ op: 'doc.get', path: 'app/state' }).exists === false);
const big = { savedAt: '2026-10-07T03:00:00.000Z', text: '=SUM(1,2)', th: 'ทดสอบ'.repeat(30000), n: 12345, s: '   leading and trailing   ', q: "'quoted", date: '2026-10-07' };
// nothing the store writes may be taken for a formula, a number or a date — not even when a 40,000-character cut lands right before such text
const edge = (n) => ({ savedAt: '2026-10-07T03:00:00.000Z', pad: 'x'.repeat(n), v: '=1+1', w: '12345', d: '2026-10-07' });
check('set a 150,000-character document', one({ op: 'doc.set', path: 'history/r2026-10-07_001', data: big }).ok);
const back = one({ op: 'doc.get', path: 'history/r2026-10-07_001' });
check('…and it reads back identical (formula-like text, spaces, long Thai)', JSON.stringify(back.data) === JSON.stringify(big));
check('…cut over several cells', sim.files[STORE].sheets[0].rows[1].filter((c) => c.userEnteredValue).length === 3 + Math.ceil(JSON.stringify(big).length / 40000), sim.files[STORE].sheets[0].rows[1].length);
check('store cells are never read as formula, number or date (a cut placed at every offset near the risky text)', (() => { for (let k = 39900; k < 40030; k++) { const d = edge(k); one({ op: 'doc.set', path: 'app/edge', data: d }); if (JSON.stringify(one({ op: 'doc.get', path: 'app/edge' }).data) !== JSON.stringify(d)) return false; } return sim.files[STORE].sheets[0].rows.every((r) => r.every((c) => !c.userEnteredValue || typeof c.userEnteredValue.stringValue === 'string')); })());
check('a shorter rewrite leaves no old tail', one({ op: 'doc.set', path: 'history/r2026-10-07_001', data: { savedAt: big.savedAt, v: 2 } }).ok && JSON.stringify(one({ op: 'doc.get', path: 'history/r2026-10-07_001' }).data) === JSON.stringify({ savedAt: big.savedAt, v: 2 }));
for (let i = 2; i <= 40; i++) one({ op: 'doc.set', path: 'history/r2026-10-07_' + String(i).padStart(3, '0'), data: { savedAt: '2026-10-07T03:' + String(i).padStart(2, '0') + ':00.000Z', i } });
const top = one({ op: 'col.get', name: 'history', orderBy: 'savedAt', dir: 'desc', limit: 10 });
check('history: newest 10 first', top.docs.length === 10 && top.docs[0].id === 'r2026-10-07_040' && top.docs[9].data.i === 31, top.docs.map((d) => d.id));
const all = one({ op: 'col.get', name: 'history', orderBy: 'savedAt', dir: 'desc', limit: 1000 });
check('history: all 40 in one read', all.docs.length === 40 && all.docs[39].id === 'r2026-10-07_001', all.docs.length);
check('several calls in one request', (() => { const r = sim.post({ code: CODE, calls: [{ op: 'doc.set', path: 'app/config', data: { a: 1 } }, { op: 'doc.get', path: 'app/config' }, { op: 'doc.get', path: 'app/none' }] }); return r.ok && r.results[1].data.a === 1 && r.results[2].exists === false; })());
check('bad path refused', code(one({ op: 'doc.get', path: '../x' })) === 'bad_request');

// locks
check('lock: first holder gets it', one({ op: 'doc.acquire', path: 'app/savelock', holder: 'tab1', ttlMs: 20000 }).acquired === true);
check('lock: second holder is told to wait', one({ op: 'doc.acquire', path: 'app/savelock', holder: 'tab2', ttlMs: 20000 }).acquired === false);
check('lock: the holder can shorten it', one({ op: 'doc.acquire', path: 'app/savelock', holder: 'tab1', ttlMs: 1000 }).acquired === true);
await new Promise((r) => setTimeout(r, 1100));
check('lock: free again after it lapses', one({ op: 'doc.acquire', path: 'app/savelock', holder: 'tab2', ttlMs: 1000 }).acquired === true);

// which spreadsheets may be touched
const sheetsDoc = { v: 3, files: { 70: { id: MAIN, name: 'm', tabs: { ARCHIVE: 60201, DATA: 60202, SUMMARY: 60203 } } }, backups: { 70: { id: BK, name: 'b', tabs: { ARCHIVE: 60201, DATA: 60202, SUMMARY: 60203 } } }, pending: [], bpending: [], parked: {}, bgone: {}, carry: {} };
check('Google Sheets call on a file that is not registered → refused', code(one({ op: 'gs', tool: 'get_spreadsheet', input: { spreadsheetId: OTHER, fields: ['properties.title'] } })) === 'admin_required');
check('the store spreadsheet itself can never be reached', code(one({ op: 'gs', tool: 'get_values', input: { spreadsheetId: STORE, range: 'docs!A1:C5' } }, { admin: ADMIN })) === 'forbidden');
check('registering files without the password → refused', code(one({ op: 'doc.set', path: 'app/sheets', data: sheetsDoc })) === 'admin_required');
check('a wrong password does not help', code(one({ op: 'doc.set', path: 'app/sheets', data: sheetsDoc }, { admin: 'WRONG' })) === 'admin_required');
if (!ADMIN) console.log('     (the private folder is not here: the checks that need the Google Sheet password were skipped)');
else {
  check('with the password, a new file can be looked at before it is registered', one({ op: 'gs', tool: 'get_spreadsheet', input: { spreadsheetId: MAIN, fields: ['properties.title', 'sheets.properties'] } }, { admin: ADMIN }).payload.properties.title === 'ปีงบ70 หลัก');
  check('registering files with the password', one({ op: 'doc.set', path: 'app/sheets', data: sheetsDoc }, { admin: ADMIN.toLowerCase() + ' ' }).ok);
  check('…the allow-list holds exactly the two files', sim.props.ALLOW_IDS === JSON.stringify([MAIN, BK]) && sim.props.BACKUP_IDS === JSON.stringify([BK]), sim.props);
  const tabs = (id) => [{ addSheet: { properties: { sheetId: 60201, title: 'ARCHIVE', gridProperties: { rowCount: 2, columnCount: 5, frozenRowCount: 1 } } } }, { updateCells: { start: { sheetId: 60201, rowIndex: 0, columnIndex: 0 }, fields: 'userEnteredValue', rows: [{ values: [{ userEnteredValue: { stringValue: 'รหัสบันทึก' } }] }] } }];
  const row = (v) => ({ appendCells: { sheetId: 60201, fields: 'userEnteredValue', rows: [{ values: [{ userEnteredValue: { stringValue: v } }] }] } });
  for (const id of [MAIN, BK]) check('everyday call: add tab + header + two rows to ' + (id === BK ? 'BACKUP' : 'main'), one({ op: 'gs', tool: 'update_spreadsheet', input: { spreadsheetId: id, requests: tabs(id).concat([{ appendDimension: { sheetId: 60201, dimension: 'ROWS', length: 5 } }, row('r2026-10-07_001'), row('r2026-10-07_002')]) } }).ok);
  check('reading it back through get_values', JSON.stringify(one({ op: 'gs', tool: 'get_values', input: { spreadsheetId: BK, range: 'ARCHIVE!A:A' } }).payload.values) === JSON.stringify([['รหัสบันทึก'], ['r2026-10-07_001'], ['r2026-10-07_002']]));
  const del = { deleteDimension: { range: { sheetId: 60201, dimension: 'ROWS', startIndex: 1, endIndex: 2 } } };
  check('deleting a row from the main file needs no password (moving a year to its new file does it)', one({ op: 'gs', tool: 'update_spreadsheet', input: { spreadsheetId: MAIN, requests: [del] } }).ok);
  check('deleting a row from the BACKUP file without the password → refused', code(one({ op: 'gs', tool: 'update_spreadsheet', input: { spreadsheetId: BK, requests: [del] } })) === 'admin_required');
  check('overwriting BACKUP data rows without the password → refused', code(one({ op: 'gs', tool: 'update_spreadsheet', input: { spreadsheetId: BK, requests: [{ updateCells: { range: { sheetId: 60201, startRowIndex: 1, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 5 }, fields: 'userEnteredValue' } }] } })) === 'admin_required');
  check('deleting a whole BACKUP tab without the password → refused', code(one({ op: 'gs', tool: 'update_spreadsheet', input: { spreadsheetId: BK, requests: [{ deleteSheet: { sheetId: 60201 } }] } })) === 'admin_required');
  check('…the BACKUP rows are all still there', sim.tab(BK, 'ARCHIVE').length === 3, sim.tab(BK, 'ARCHIVE'));
  check('taking a file out of "backups" without the password → refused', code(one({ op: 'doc.set', path: 'app/sheets', data: Object.assign({}, sheetsDoc, { backups: {}, files: { 70: sheetsDoc.files[70], 71: sheetsDoc.backups[70] } }) })) === 'admin_required');
  check('an everyday rewrite of app/sheets (queues only) needs no password', one({ op: 'doc.set', path: 'app/sheets', data: Object.assign({}, sheetsDoc, { pending: ['r2026-10-07_003'] }) }).ok);
  check('deleting from the BACKUP file with the password', one({ op: 'gs', tool: 'update_spreadsheet', input: { spreadsheetId: BK, requests: [del] } }, { admin: ADMIN }).ok && sim.tab(BK, 'ARCHIVE').length === 2);
  check('a Google error comes back as tool_error with its message', (() => { const r = one({ op: 'gs', tool: 'get_values', input: { spreadsheetId: MAIN, range: 'NOPE!A:A' } }); return code(r) === 'tool_error' && /Unable to parse range/.test(r.error.message); })());
  // import
  check('import without the password → refused', code(one({ op: 'import', docs: { 'app/state': { x: 1 } } })) === 'admin_required');
  check('import of 3 documents', one({ op: 'import', docs: { 'app/state': { revs: {} }, 'history/r2026-09-30_001': { savedAt: '2026-09-30T01:00:00.000Z' }, 'app/savelock': { holder: 'x' } } }, { admin: ADMIN }).imported === 2);
  check('a second import is refused once there is data', code(one({ op: 'import', docs: { 'app/state': { revs: { a: 1 } } } }, { admin: ADMIN })) === 'not_empty');
  check('ping now says the store is not empty', one({ op: 'ping' }).empty === false);
  // a fresh back end taking over from the Claude page: the imported settings register the files in one go
  const sim2 = await startSim({ files: { [MAIN]: blankFile('m'), [BK]: blankFile('b') } }); sim2.setup(CODE, ['', '']);
  const imp = sim2.post({ code: CODE, admin: ADMIN, calls: [{ op: 'import', docs: { 'app/state': { revs: {} }, 'app/sheets': sheetsDoc } }, { op: 'gs', tool: 'get_spreadsheet', input: { spreadsheetId: MAIN } }] });
  check('import with the Google Sheet settings registers the files', imp.ok && imp.results[0].imported === 2 && sim2.props.ALLOW_IDS === JSON.stringify([MAIN, BK]) && sim2.props.BACKUP_IDS === JSON.stringify([BK]) && imp.results[1].ok, imp);
  check('…and they can be used afterwards without the password', sim2.post({ code: CODE, calls: [{ op: 'gs', tool: 'get_spreadsheet', input: { spreadsheetId: BK } }] }).results[0].ok);
  sim2.close();
}
// over HTTP, the way a browser reaches it
const g = await (await fetch(sim.backendUrl)).json();
check('GET /exec answers through a redirect', g.ok && g.ready === true, g);
const p = await (await fetch(sim.backendUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ code: CODE, calls: [{ op: 'ping' }] }) })).json();
check('POST /exec as text/plain answers through a redirect', p.ok && p.results[0].ok, p);
sim.close();
console.log(bad.length ? bad.length + ' check(s) FAILED' : 'all checks passed');
console.log('errors:', JSON.stringify(bad));
process.exit(bad.length ? 1 : 0);
