import { chromium } from 'playwright';
import fs from 'fs';
import { ROOT as S, OUT, BUILD, fixture, readJson, PW } from './paths.mjs';
export { PW, fixture, readJson };
const html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + fs.readFileSync(BUILD, 'utf8') + '</body></html>';
const J = readJson;
export const liveDocs = () => { const d = { 'app/state': J('dbread10/app/state.json'), 'app/config': J('dbread10/app/config.json') }; for (const f of fs.readdirSync(fixture('dbread10/history'))) d['history/' + f.replace('.json', '')] = J('dbread10/history/' + f); return d; };
export async function open(opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 400, height: 860 } : { width: 1500, height: 1000 }, colorScheme: opts.dark ? 'dark' : 'light', deviceScaleFactor: opts.mobile ? 2 : 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.route('**/*', (r) => r.request().url().startsWith('https://test.local/') ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort());
  if (opts.now) await page.clock.setFixedTime(new Date(opts.now));
  if (opts.init) await page.addInitScript(opts.init);
  await page.addInitScript(({ docs, nomcp, gsFiles }) => {
    window.__db = JSON.parse(JSON.stringify(docs || {})); window.__sets = []; window.__saved = [];
    window.__lease = {}; const doc = (p) => ({ acquire: async (o) => { if (window.__onAcquire) window.__onAcquire(p); const L = window.__lease[p]; if (L && L.holder !== o.holder && L.until > Date.now()) return { acquired: false, expiresAt: new Date(L.until).toISOString() }; window.__lease[p] = { holder: o.holder, until: Date.now() + Math.min(600000, Math.max(1000, o.ttlMs || 30000)) }; return { acquired: true, holder: o.holder }; }, get: async () => ({ exists: p in window.__db, id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(window.__db[p])), metadata: {} }), set: async (d) => { window.__db[p] = JSON.parse(JSON.stringify(d)); window.__sets.push(p); } });
    const collection = (name) => { let lim = 1e9, by = '', dir = 'asc'; const q = { orderBy: (f, d) => { by = f; dir = d || 'asc'; return q; }, limit: (n) => { lim = n; return q; }, get: async () => { let ks = Object.keys(window.__db).filter((k) => k.startsWith(name + '/')); if (by) ks.sort((x, y) => (String(window.__db[x][by]) < String(window.__db[y][by]) ? -1 : 1) * (dir === 'desc' ? -1 : 1)); return { docs: ks.slice(0, lim).map((k) => ({ id: k.split('/').pop(), data: () => JSON.parse(JSON.stringify(window.__db[k])) })) }; } }; return q; };
    // ---- a small stand-in for the Google Sheets connector ----
    const blank = (title) => ({ title, sheets: [{ properties: { sheetId: 0, title: 'Sheet1', index: 0, gridProperties: { rowCount: 1000, columnCount: 26 } }, rows: [] }], prot: [] });
    const G = window.__gs = { files: Object.assign({ FILE_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA: blank('ปีงบ69'), FILE_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB: blank('ปีงบ70'), FILE_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC: blank('ปีงบ71'), BKUP_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA: blank('BACKUP ปีงบ69'), BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB: blank('BACKUP ปีงบ70'), BKUP_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC: blank('BACKUP ปีงบ71') }, JSON.parse(JSON.stringify(gsFiles || {}))), calls: [], fail: [], deny: {} };
    const colIx = (s) => { let n = 0; for (const c of s) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; };
    const disp = (c) => { const v = c && c.userEnteredValue; return !v ? '' : ('numberValue' in v ? String(v.numberValue) : 'formulaValue' in v ? String(v.formulaValue) : String(v.stringValue)); };
    const grow = (s) => { const g = s.properties.gridProperties = s.properties.gridProperties || {}; g.rowCount = Math.max(g.rowCount || 0, s.rows.length); };
    const err = (code, message) => Object.assign(new Error(message || code), { code, message: message || code });
    const tools = {
      get_spreadsheet: (f) => ({ properties: { title: f.title }, sheets: f.sheets.map((s) => ({ properties: JSON.parse(JSON.stringify(s.properties)) })) }),
      get_values: (f, a) => {
        const i = a.range.lastIndexOf('!'), title = a.range.slice(0, i).replace(/^'|'$/g, '').replace(/''/g, "'"), rg = a.range.slice(i + 1);
        const sh = f.sheets.find((s) => s.properties.title === title);
        if (!sh) throw err('tool_error', 'Unable to parse range: ' + a.range);
        const m = /^([A-Z]*)(\d*)(?::([A-Z]*)(\d*))?$/.exec(rg);
        const c0 = m[1] ? colIx(m[1]) : 0, r0 = m[2] ? +m[2] - 1 : 0, c1 = m[3] !== undefined && m[3] !== '' ? colIx(m[3]) : (m[3] === undefined && m[1] ? c0 : 9999), r1 = m[4] ? +m[4] - 1 : (m[3] === undefined && m[2] && m[1] ? r0 : 999999);
        let vals = sh.rows.slice(r0, r1 + 1).map((r) => { const o = (r || []).slice(c0, c1 + 1).map(disp); while (o.length && o[o.length - 1] === '') o.pop(); return o; });
        while (vals.length && !vals[vals.length - 1].length) vals.pop();
        const out = { range: a.range }; if (vals.length) out.values = vals; return out;
      },
      update_spreadsheet: (f, a) => {
        const byId = (id) => { const s = f.sheets.find((x) => x.properties.sheetId === id); if (!s) throw err('tool_error', 'No grid with id: ' + id); return s; };
        for (const rq of a.requests) {
          const k = Object.keys(rq)[0], q = rq[k];
          if (k === 'addSheet') { const p = q.properties; if (f.sheets.some((s) => s.properties.title === p.title || s.properties.sheetId === p.sheetId)) throw err('tool_error', 'duplicate sheet'); f.sheets.push({ properties: Object.assign({ index: f.sheets.length }, JSON.parse(JSON.stringify(p))), rows: [] }); }
          else if (k === 'updateSheetProperties') Object.assign(byId(q.properties.sheetId).properties, q.properties);
          else if (k === 'updateCells') {
            if (q.range) { const s = byId(q.range.sheetId), g = s.properties.gridProperties || {}; if (q.range.endRowIndex > (g.rowCount || 0) || q.range.endColumnIndex > (g.columnCount || 0)) throw err('tool_error', 'range exceeds grid limits'); for (let i = q.range.startRowIndex; i < q.range.endRowIndex; i++) { const row = s.rows[i] = s.rows[i] || []; for (let j = q.range.startColumnIndex; j < q.range.endColumnIndex; j++) row[j] = ((q.rows || [])[i - q.range.startRowIndex] || { values: [] }).values[j - q.range.startColumnIndex] || {}; } while (s.rows.length && !(s.rows[s.rows.length - 1] || []).some((c) => disp(c) !== '')) s.rows.pop(); }
            else { const s = byId(q.start.sheetId); q.rows.forEach((r, i) => { const row = s.rows[q.start.rowIndex + i] = s.rows[q.start.rowIndex + i] || []; (r.values || []).forEach((c, j) => { row[q.start.columnIndex + j] = c; }); }); }
          }
          else if (k === 'copyPaste') { const a = byId(q.source.sheetId), b = byId(q.destination.sheetId), n = q.source.endRowIndex - q.source.startRowIndex; if (q.source.endRowIndex > Math.max(a.rows.length, (a.properties.gridProperties || {}).rowCount || 0) || q.destination.startRowIndex + n > ((b.properties.gridProperties || {}).rowCount || 0)) throw err('tool_error', 'copyPaste: exceeds grid limits'); for (let i = 0; i < n; i++) b.rows[q.destination.startRowIndex + i] = JSON.parse(JSON.stringify(a.rows[q.source.startRowIndex + i] || [])); for (let i = 0; i < b.rows.length; i++) b.rows[i] = b.rows[i] || []; }
          else if (k === 'deleteDimension') { const s = byId(q.range.sheetId), g = s.properties.gridProperties, n = q.range.endIndex - q.range.startIndex; if (q.range.dimension !== 'ROWS' || q.range.endIndex > g.rowCount) throw err('tool_error', 'deleteDimension: bad range'); if (g.rowCount - n <= (g.frozenRowCount || 0)) throw err('tool_error', 'Sorry, it is not possible to delete all non-frozen rows.'); s.rows.splice(q.range.startIndex, n); g.rowCount -= n; }
          else if (k === 'appendDimension') { const s = byId(q.sheetId), g = s.properties.gridProperties; if (q.dimension === 'ROWS') g.rowCount += q.length; else g.columnCount += q.length; }
          else if (k === 'autoResizeDimensions') byId(q.dimensions.sheetId);
          else if (k === 'appendCells') { const s = byId(q.sheetId); let last = s.rows.length; while (last > 0 && !(s.rows[last - 1] || []).some((c) => disp(c) !== '')) last--; s.rows.length = last; q.rows.forEach((r) => s.rows.push(r.values || [])); grow(s); }
          else if (k === 'addProtectedRange') { byId(q.protectedRange.range.sheetId); f.prot.push(q.protectedRange); }
          else if (k === 'updateDimensionProperties') byId(q.range.sheetId);
          else if (k === 'deleteSheet') f.sheets.splice(f.sheets.indexOf(byId(q.sheetId)), 1);
          else throw err('tool_error', 'unknown request ' + k);
        }
        return { status: 'success', replies: a.requests.map(() => ({})) };
      },
    };
    const mcp = { callTool: async (server, tool, input) => {
      await new Promise((r) => setTimeout(r, 15));
      G.calls.push({ server, tool, input: JSON.parse(JSON.stringify(input)) });
      if (server !== 'Google Sheets' || !tools[tool]) throw err('not_in_manifest');
      const fi = G.fail.findIndex((x) => x.tool === tool), fl = fi >= 0 ? G.fail.splice(fi, 1)[0] : null;
      if (fl && !fl.after) throw err(fl.code, fl.message);
      const id = input.spreadsheetId, cur = G.files[id];
      if (G.deny[id]) throw err('tool_error', 'The caller does not have permission');
      if (!cur) throw err('tool_error', 'Requested entity was not found.');
      const copy = JSON.parse(JSON.stringify(cur));
      const res = tools[tool](copy, input);                      // all-or-nothing, like a real batch
      G.files[id] = copy;
      if (fl) throw err(fl.code, fl.message);
      return { content: [{ type: 'text', text: JSON.stringify(res) }], payload: res };
    } };
    const caps = { db: { doc, collection }, user: { can: async () => true }, mcp: nomcp ? null : mcp,
      downloads: { save: async ({ filename, data }) => { const b = new Uint8Array(await data.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); window.__saved.push({ filename, b64: btoa(s) }); return { status: 'saved' }; } } };
    window.claude = { use: (n) => new Promise((r) => setTimeout(() => r(caps[n] || null), 100)) };
  }, { docs: opts.docs || liveDocs(), nomcp: !!opts.nomcp, gsFiles: opts.gsFiles || null });
  await page.goto('https://test.local/');
  await page.waitForTimeout(800);
  if (!opts.keep && await page.locator('#dlg[open] [data-x=cancel]').count()) { await page.click('#dlg [data-x=cancel]'); await page.waitForTimeout(150); }   // the daily reminder
  const dlgText = async () => (await page.locator('#dlg[open]').count()) ? (await page.locator('#dlg').innerText()).replace(/\n+/g, ' | ') : '(no dialog)';
  const pass = async (pw) => { await page.fill('#dlg input[name=pw]', pw); await page.click('#dlg button[type=submit]'); await page.waitForTimeout(150); };
  const ok = async () => { await page.click('#dlg button[type=submit]'); await page.waitForTimeout(150); };
  const cancel = async () => { await page.click('#dlg [data-x=cancel]'); await page.waitForTimeout(150); };
  const type = async (sel, v) => { await page.fill(sel, v); await page.locator(sel).blur(); await page.waitForTimeout(150); };
  const tab = (name, file) => page.evaluate(([name, file]) => { const f = window.__gs.files[file || 'FILE_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'], s = f.sheets.find((x) => x.properties.title === name); return s ? { props: s.properties, rows: s.rows.map((r) => r.map((c) => { const v = c && c.userEnteredValue; return !v ? '' : ('numberValue' in v ? v.numberValue : v.stringValue); })) } : null; }, [name, file]);
  const txt = (sel) => page.locator(sel).innerText();
  return { browser, page, errors, dlgText, pass, ok, cancel, type, tab, txt, FILE: 'FILE_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', FILE_B: 'FILE_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', FILE_C: 'FILE_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', BK_A: 'BKUP_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', BK_B: 'BKUP_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', BK_C: 'BKUP_CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', out: (n) => OUT + '/' + n };
}
