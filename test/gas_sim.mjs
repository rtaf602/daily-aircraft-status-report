// A stand-in for Google, so the real back-end code (backend/Code.gs) can be run and tested without a Google account.
//   - loads Code.gs unchanged into a sandbox that has the Apps Script services it uses: SpreadsheetApp, the Sheets
//     advanced service, PropertiesService, LockService, ContentService, Utilities, Logger
//   - keeps the spreadsheets in memory (the same small model of Google Sheets the page scenarios use)
//   - serves the web app over HTTP the way Apps Script does: POST /exec answers with a redirect to a one-time address
//     that returns the JSON, cross-origin reads are allowed, and a CORS preflight is NOT answered
// It checks the logic and the wire format. It cannot show what only the real service has: quotas, timing, the exact
// wording of Google's error messages, the authorisation screens.
import fs from 'node:fs';
import vm from 'node:vm';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const clone = (v) => JSON.parse(JSON.stringify(v));
const colIx = (s) => { let n = 0; for (const c of s) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
const disp = (c) => { const v = c && c.userEnteredValue; return !v ? '' : ('numberValue' in v ? String(v.numberValue) : 'formulaValue' in v ? String(v.formulaValue) : String(v.stringValue)); };
const rawCell = (v) => (v === '' || v == null ? {} : { userEnteredValue: typeof v === 'number' ? { numberValue: v } : { stringValue: String(v) } });

export function blankFile(title) { return { title, sheets: [{ properties: { sheetId: 0, title: 'Sheet1', index: 0, gridProperties: { rowCount: 1000, columnCount: 26 } }, rows: [] }], prot: [] }; }

export async function startSim(opts = {}) {
  const files = Object.assign({}, clone(opts.files || {})), props = {}, logs = [], calls = [];
  const sim = { files, props, logs, calls, hits: [], deny: {}, down: false, delayMs: opts.delayMs || 0 };      // hits: what each POST to the web app asked for
  let made = 0;
  const fail = (method, msg) => new Error('API call to ' + method + ' failed with error: ' + msg);
  const file = (id, method) => { if (sim.deny[id]) throw fail(method, 'The caller does not have permission'); const f = files[id]; if (!f) throw fail(method, 'Requested entity was not found.'); return f; };
  // 'Tab name'!A1:C3 → the tab and a zero-based box; open ends run to the edge of what is there
  const parse = (f, range, method) => {
    const i = range.lastIndexOf('!'), title = (i < 0 ? '' : range.slice(0, i)).replace(/^'|'$/g, '').replace(/''/g, "'"), rg = i < 0 ? range : range.slice(i + 1);
    const sh = i < 0 ? f.sheets[0] : f.sheets.find((s) => s.properties.title === title), m = /^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/.exec(rg);
    if (!sh || !m) throw fail(method, 'Unable to parse range: ' + range);
    const c0 = m[1] ? colIx(m[1]) : 0, r0 = m[2] ? +m[2] - 1 : 0;
    const c1 = m[3] !== undefined && m[3] !== '' ? colIx(m[3]) : (m[3] === undefined && m[1] ? c0 : 9999), r1 = m[4] ? +m[4] - 1 : (m[3] === undefined && m[2] && m[1] ? r0 : 999999);
    return { sh, r0, c0, r1, c1 };
  };
  const read = (id, range, method) => {
    const f = file(id, method), { sh, r0, c0, r1, c1 } = parse(f, range, method);
    const vals = sh.rows.slice(r0, r1 + 1).map((r) => { const o = (r || []).slice(c0, c1 + 1).map(disp); while (o.length && o[o.length - 1] === '') o.pop(); return o; });
    while (vals.length && !vals[vals.length - 1].length) vals.pop();
    const out = { range, majorDimension: 'ROWS' }; if (vals.length) out.values = vals; return out;
  };
  const grow = (s) => { const g = s.properties.gridProperties = s.properties.gridProperties || {}; g.rowCount = Math.max(g.rowCount || 0, s.rows.length); };
  const lastRow = (s) => { let n = s.rows.length; while (n > 0 && !(s.rows[n - 1] || []).some((c) => disp(c) !== '')) n--; return n; };
  function batch(f, requests, method) {
    const byId = (id) => { const s = f.sheets.find((x) => x.properties.sheetId === id); if (!s) throw fail(method, 'Invalid requests[0]: No grid with id: ' + id); return s; };
    for (const rq of requests) {
      const k = Object.keys(rq)[0], q = rq[k];
      if (k === 'addSheet') { const p = q.properties; if (f.sheets.some((s) => s.properties.title === p.title || s.properties.sheetId === p.sheetId)) throw fail(method, 'A sheet with that name or id already exists'); f.sheets.splice(p.index == null ? f.sheets.length : p.index, 0, { properties: Object.assign({ index: f.sheets.length }, clone(p)), rows: [] }); }
      else if (k === 'updateSheetProperties') Object.assign(byId(q.properties.sheetId).properties, q.properties);
      else if (k === 'updateCells') {
        if (q.range) { const s = byId(q.range.sheetId), g = s.properties.gridProperties || {}; if (q.range.endRowIndex > (g.rowCount || 0) || q.range.endColumnIndex > (g.columnCount || 0)) throw fail(method, 'range exceeds grid limits'); for (let i = q.range.startRowIndex; i < q.range.endRowIndex; i++) { const row = s.rows[i] = s.rows[i] || []; for (let j = q.range.startColumnIndex; j < q.range.endColumnIndex; j++) row[j] = ((q.rows || [])[i - q.range.startRowIndex] || { values: [] }).values[j - q.range.startColumnIndex] || {}; } s.rows.length = lastRow(s); }
        else { const s = byId(q.start.sheetId); q.rows.forEach((r, i) => { const row = s.rows[q.start.rowIndex + i] = s.rows[q.start.rowIndex + i] || []; (r.values || []).forEach((c, j) => { row[q.start.columnIndex + j] = c; }); }); }
      }
      else if (k === 'copyPaste') { const a = byId(q.source.sheetId), b = byId(q.destination.sheetId), n = q.source.endRowIndex - q.source.startRowIndex; if (q.source.endRowIndex > Math.max(a.rows.length, (a.properties.gridProperties || {}).rowCount || 0) || q.destination.startRowIndex + n > ((b.properties.gridProperties || {}).rowCount || 0)) throw fail(method, 'copyPaste: exceeds grid limits'); for (let i = 0; i < n; i++) b.rows[q.destination.startRowIndex + i] = clone(a.rows[q.source.startRowIndex + i] || []); for (let i = 0; i < b.rows.length; i++) b.rows[i] = b.rows[i] || []; }
      else if (k === 'deleteDimension') { const s = byId(q.range.sheetId), g = s.properties.gridProperties, n = q.range.endIndex - q.range.startIndex; if (q.range.dimension !== 'ROWS' || q.range.endIndex > g.rowCount) throw fail(method, 'deleteDimension: bad range'); if (g.rowCount - n <= (g.frozenRowCount || 0)) throw fail(method, 'Sorry, it is not possible to delete all non-frozen rows.'); s.rows.splice(q.range.startIndex, n); g.rowCount -= n; }
      else if (k === 'appendDimension') { const s = byId(q.sheetId), g = s.properties.gridProperties; if (q.dimension === 'ROWS') g.rowCount += q.length; else g.columnCount += q.length; }
      else if (k === 'autoResizeDimensions') byId(q.dimensions.sheetId);
      else if (k === 'appendCells') { const s = byId(q.sheetId); s.rows.length = lastRow(s); q.rows.forEach((r) => s.rows.push(r.values || [])); grow(s); }
      else if (k === 'addProtectedRange') { byId(q.protectedRange.range.sheetId); f.prot.push(q.protectedRange); }
      else if (k === 'updateDimensionProperties') byId(q.range.sheetId);
      else if (k === 'deleteSheet') f.sheets.splice(f.sheets.indexOf(byId(q.sheetId)), 1);
      else throw fail(method, 'unknown request ' + k);
    }
  }
  const Sheets = { Spreadsheets: {
    create(res) {
      const id = 'SIMSTORE' + String(++made).padStart(4, '0') + 'x'.repeat(32);
      files[id] = { title: (res.properties || {}).title || 'Untitled', prot: [], sheets: (res.sheets || [{ properties: { title: 'Sheet1' } }]).map((s, i) => ({ properties: Object.assign({ sheetId: i === 0 ? 0 : 1000 + i, index: i, gridProperties: { rowCount: 1000, columnCount: 26 } }, clone(s.properties)), rows: [] })) };
      return { spreadsheetId: id, properties: { title: files[id].title } };
    },
    get(id) { calls.push(['get', id]); const f = file(id, 'sheets.spreadsheets.get'); return { spreadsheetId: id, properties: { title: f.title }, sheets: f.sheets.map((s) => ({ properties: clone(s.properties) })) }; },
    batchUpdate(res, id) {
      calls.push(['batchUpdate', id, (res.requests || []).map((q) => Object.keys(q)[0]).join(',')]);
      const copy = clone(file(id, 'sheets.spreadsheets.batchUpdate'));
      batch(copy, res.requests || [], 'sheets.spreadsheets.batchUpdate');            // all or nothing, like the real thing
      files[id] = copy;
      return { spreadsheetId: id, replies: (res.requests || []).map(() => ({})) };
    },
    Values: {
      get(id, range) { calls.push(['values.get', id, range]); return read(id, range, 'sheets.spreadsheets.values.get'); },
      batchGet(id, o) { calls.push(['values.batchGet', id, (o.ranges || []).length]); return { spreadsheetId: id, valueRanges: (o.ranges || []).map((r) => read(id, r, 'sheets.spreadsheets.values.batchGet')) }; },
      update(res, id, range, o) {
        const m = 'sheets.spreadsheets.values.update'; calls.push(['values.update', id, range]);
        if (!o || o.valueInputOption !== 'RAW') throw fail(m, 'this stand-in only takes RAW input');
        const f = file(id, m), { sh, r0, c0 } = parse(f, range, m), g = sh.properties.gridProperties;
        const rows = res.values || [], w = Math.max(0, ...rows.map((r) => r.length));
        if (r0 + rows.length > g.rowCount || c0 + w > g.columnCount) throw fail(m, 'Range (' + range + ') exceeds grid limits. Max rows: ' + g.rowCount + ', max columns: ' + g.columnCount);
        rows.forEach((r, i) => { const row = sh.rows[r0 + i] = sh.rows[r0 + i] || []; r.forEach((v, j) => { if (String(v).length > 50000) throw fail(m, 'Your input contains more than the maximum of 50000 characters in a single cell.'); row[c0 + j] = rawCell(v); }); });
        for (let i = 0; i < sh.rows.length; i++) sh.rows[i] = sh.rows[i] || [];
        return { spreadsheetId: id, updatedRange: range, updatedRows: rows.length };
      },
      append(res, id, range, o) {
        const m = 'sheets.spreadsheets.values.append'; calls.push(['values.append', id, (res.values || []).length]);
        if (!o || o.valueInputOption !== 'RAW') throw fail(m, 'this stand-in only takes RAW input');
        const f = file(id, m), { sh } = parse(f, range, m), at = lastRow(sh);
        sh.rows.length = at;
        (res.values || []).forEach((r) => { r.forEach((v) => { if (String(v).length > 50000) throw fail(m, 'Your input contains more than the maximum of 50000 characters in a single cell.'); }); if (r.length > sh.properties.gridProperties.columnCount) throw fail(m, 'exceeds grid limits'); sh.rows.push(r.map(rawCell)); });
        grow(sh);
        return { spreadsheetId: id, updates: { updatedRange: sh.properties.title + '!A' + (at + 1), updatedRows: (res.values || []).length } };
      },
    },
  } };
  // SpreadsheetApp, as far as the store uses it. Unlike RAW input through the Sheets API, setValues() here reads what it is
  // given the way a person typing into a cell is read: "=…" becomes a formula, digits a number, a date a date. The store
  // must survive that, so this stand-in does it too.
  const typed = (v) => {
    if (typeof v !== 'string') return rawCell(v);
    if (v === '') return {};
    if (v[0] === '=' || v[0] === '+') return { userEnteredValue: { formulaValue: v } };
    if (/^-?\d+(\.\d+)?$/.test(v.trim())) return { userEnteredValue: { numberValue: +v } };
    if (/^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(v)) return { userEnteredValue: { numberValue: 46302.5 } };      // a date serial
    return { userEnteredValue: { stringValue: /^(true|false)$/i.test(v) ? v.toUpperCase() : v } };
  };
  const sheetApi = (sh) => {
    const g = sh.properties.gridProperties;
    return {
      setName(n) { sh.properties.title = n; return this; },
      getMaxRows: () => g.rowCount, getMaxColumns: () => g.columnCount, getLastRow: () => lastRow(sh),
      insertColumnsAfter(at, n) { g.columnCount += n; return this; }, insertRowsAfter(at, n) { g.rowCount += n; return this; },
      setFrozenRows(n) { g.frozenRowCount = n; },
      getRange(r, c, nr, nc) {
        nr = nr || 1; nc = nc || 1;
        if (r < 1 || c < 1 || r + nr - 1 > g.rowCount || c + nc - 1 > g.columnCount) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        return {
          setNumberFormat() { return this; },
          getValues: () => { calls.push(['app.getValues', nr + 'x' + nc]); const out = []; for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || [], o = []; for (let j = 0; j < nc; j++) { const u = (row[c - 1 + j] || {}).userEnteredValue; o.push(!u ? '' : 'numberValue' in u ? u.numberValue : 'formulaValue' in u ? '#NAME?' : u.stringValue); } out.push(o); } return out; },
          setValues(v) {
            calls.push(['app.setValues', nr + 'x' + nc]);
            if (v.length !== nr || v.some((x) => x.length !== nc)) throw new Error('The number of rows or columns in the data does not match the range.');
            v.forEach((x, i) => { const row = sh.rows[r - 1 + i] = sh.rows[r - 1 + i] || []; x.forEach((y, j) => { if (String(y).length > 50000) throw new Error('Your input contains more than the maximum of 50000 characters in a single cell.'); row[c - 1 + j] = typed(y); }); });
            for (let i = 0; i < sh.rows.length; i++) sh.rows[i] = sh.rows[i] || [];
            return this;
          },
        };
      },
    };
  };
  const bookApi = (id) => { const f = files[id]; if (!f) throw new Error('Document ' + id + ' is missing (perhaps it was deleted, or you don\'t have read access?)'); return { getId: () => id, getSheets: () => f.sheets.map(sheetApi), getSheetByName: (n) => { const x = f.sheets.find((q) => q.properties.title === n); return x ? sheetApi(x) : null; } }; };
  const SpreadsheetApp = {
    create(title) { const id = 'SIMSTORE' + String(++made).padStart(4, '0') + 'x'.repeat(32); files[id] = blankFile(title); return bookApi(id); },
    openById: (id) => bookApi(id),
  };
  const sandbox = {
    Sheets, SpreadsheetApp, console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, getProperties: () => Object.assign({}, props) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },                // one request at a time here anyway
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; }, getContent() { return this.text; } }) },
    Utilities: { sleep() {} },
    Logger: { log: (s) => logs.push(String(s)) },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(process.env.CODE_GS || fileURLToPath(new URL('../backend/Code.gs', import.meta.url)), 'utf8'), ctx, { filename: 'Code.gs' });   // CODE_GS: try another copy of the back end
  // fill in the SETUP block and run setup(), as the owner does once in the editor
  sim.setup = (accessCode, contact) => vm.runInContext('SETUP.accessCode = ' + JSON.stringify(accessCode) + '; SETUP.contact = ' + JSON.stringify(contact || ['', '']) + '; setup();', ctx);
  sim.post = (obj) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(obj), type: 'text/plain' } }).getContent());   // straight into doPost, no HTTP
  sim.tab = (id, name) => { const f = files[id], s = f && f.sheets.find((x) => x.properties.title === name); return s ? s.rows.map((r) => r.map(disp)) : null; };

  // ---- the web app, and a second server that hands out the built site (so the page and the back end are different origins) ----
  const pending = new Map(); let seq = 0;
  const wait = () => new Promise((r) => setTimeout(r, sim.delayMs));
  const app = http.createServer(async (req, res) => {
    if (sim.down) { req.destroy(); return; }
    const url = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(405); res.end(); return; }                 // Apps Script does not answer a preflight
    await wait();
    if (url.pathname === '/echo') { const body = pending.get(url.searchParams.get('t')); pending.delete(url.searchParams.get('t')); res.writeHead(body ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(body || '{}'); return; }
    if (url.pathname !== '/exec') { res.writeHead(404); res.end(); return; }
    let body = ''; for await (const c of req) body += c;
    if (req.method === 'POST') { let ops = []; try { ops = (JSON.parse(body).calls || []).map((c) => c.op + (c.path ? ' ' + c.path : c.tool ? ' ' + c.tool : '')); } catch (e) { /* counted as an empty request */ } sim.hits.push(ops); }
    let out;
    try { out = req.method === 'POST' ? ctx.doPost({ postData: { contents: body, type: req.headers['content-type'] } }) : ctx.doGet({}); }
    catch (e) { res.writeHead(500, { 'Access-Control-Allow-Origin': '*' }); res.end(String(e)); return; }
    const t = String(++seq); pending.set(t, out.getContent());
    res.writeHead(302, { Location: sim.backendUrl.replace('/exec', '/echo?t=' + t), 'Access-Control-Allow-Origin': '*' }); res.end();
  });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  sim.backendUrl = 'http://127.0.0.1:' + app.address().port + '/exec';
  sim.siteHtml = '';
  const web = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(sim.siteHtml); });
  await new Promise((r) => web.listen(0, '127.0.0.1', r));
  sim.siteUrl = 'http://127.0.0.1:' + web.address().port + '/';
  sim.close = () => { app.closeAllConnections && app.closeAllConnections(); web.closeAllConnections && web.closeAllConnections(); app.close(); web.close(); };
  return sim;
}
