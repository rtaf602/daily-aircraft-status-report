/**
 * สภาพ บ.ประจำวัน ฝูง.602 — ระบบหลังบ้าน (Google Apps Script)
 *
 * หน้าเว็บบน GitHub Pages เรียกสคริปต์นี้เพื่อ
 *   1) เก็บข้อมูลร่วมกันทุกเครื่อง (รายงานล่าสุด ประวัติ การตั้งค่า ตัวล็อกกัน SAVE พร้อมกัน)
 *   2) เขียนลง Google Sheet ของแต่ละปีงบประมาณ ทั้งไฟล์หลักและไฟล์ BACKUP
 * สคริปต์ทำงานในนามเจ้าของสคริปต์ จึงเขียนไฟล์ BACKUP ที่เปิดได้เฉพาะเจ้าของได้
 *
 * วิธีติดตั้งอยู่ในไฟล์ backend/SETUP_TH.md  —  แก้เฉพาะส่วน SETUP ด้านล่าง แล้วกด Run ที่ฟังก์ชัน setup หนึ่งครั้ง
 */

// ============================== SETUP: แก้เฉพาะตรงนี้ ==============================
const SETUP = {
  // รหัสเข้าใช้งาน ทุกคนต้องพิมพ์ครั้งแรกบนแต่ละเครื่อง ยาวอย่างน้อย 8 ตัว ไม่เว้นวรรค อย่าใช้รหัสเดียวกับรหัสอื่นของหน้าเว็บ
  accessCode: '',
  // สองบรรทัดที่จะแสดงในแท็บ "คำอธิบาย" ของ Google Sheet (ชื่อผู้ดูแลระบบ และเบอร์โทร)
  contact: ['', ''],
};
// ====================================================================================

// The page asks for the Google Sheet password before it changes a file link or deletes from a BACKUP file, and sends
// what was typed along. It is checked here again, against the same number the page uses (hashes.sheet in
// build.config.json — build.mjs refuses to build when the two differ).
const ADMIN_HASH = 4755646905037765;

const STORE_TAB = 'docs', CHUNK = 40000, CHUNK_COLS = 60, META_COLS = 3;
// every cell the store writes starts with this character, so Sheets can never take a cell for a formula, a number or a date
const MARK = '~';
const PROP = { code: 'ACCESS_CODE', store: 'STORE_ID', contact: 'CONTACT', allow: 'ALLOW_IDS', backups: 'BACKUP_IDS', btabs: 'BACKUP_TABS' };
// what a caller without the Google Sheet password may ask of a BACKUP file: adding only
const BACKUP_OPEN = ['appendCells', 'appendDimension', 'insertDimension', 'addSheet', 'autoResizeDimensions', 'addProtectedRange', 'updateSheetProperties', 'updateDimensionProperties', 'updateCells'];

/* ------------------------------ run once from the editor ------------------------------ */

function setup() {
  const props = PropertiesService.getScriptProperties();
  const code = String(SETUP.accessCode || '').trim();
  if (code.length < 8 || /\s/.test(code)) throw new Error('ตั้ง SETUP.accessCode ให้ยาวอย่างน้อย 8 ตัว และไม่มีเว้นวรรค แล้วกด Run อีกครั้ง');
  props.setProperty(PROP.code, code);
  props.setProperty(PROP.contact, JSON.stringify((SETUP.contact || []).slice(0, 2).map(function (x) { return String(x || ''); })));
  let id = props.getProperty(PROP.store);
  if (!id) {
    const ss = SpreadsheetApp.create('สภาพ บ.ประจำวัน ฝูง.602 — ที่เก็บข้อมูลของหน้าเว็บ (ห้ามแก้ไขด้วยมือ)'), sh = ss.getSheets()[0];
    sh.setName(STORE_TAB);
    const width = META_COLS + CHUNK_COLS;
    if (sh.getMaxColumns() < width) sh.insertColumnsAfter(sh.getMaxColumns(), width - sh.getMaxColumns());
    sh.getRange(1, 1, sh.getMaxRows(), width).setNumberFormat('@');          // plain text everywhere
    sh.getRange(1, 1, 1, 4).setValues([[MARK + 'path', MARK + 'updatedAt', MARK + 'savedAt', MARK + 'json →']]);
    sh.setFrozenRows(1);
    id = ss.getId();
    props.setProperty(PROP.store, id);
  }
  Logger.log('ตั้งค่าเสร็จแล้ว');
  Logger.log('ไฟล์ที่เก็บข้อมูลของหน้าเว็บ (เก็บไว้ ห้ามแก้ไขด้วยมือ ห้ามแชร์): https://docs.google.com/spreadsheets/d/' + id + '/edit');
  Logger.log('ขั้นต่อไป: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone)');
}

/* ------------------------------ web app entry points ------------------------------ */

function doGet() {
  const props = PropertiesService.getScriptProperties();
  return json_({ ok: true, service: 'status602', ready: !!(props.getProperty(PROP.code) && props.getProperty(PROP.store)) });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: { code: 'bad_request', message: 'not JSON' } }); }
  try { return json_(handle_(req)); }
  catch (x) { return json_({ ok: false, error: asError_(x) }); }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err_(code, message) { return { isErr_: true, code: code, message: message || code }; }
function asError_(x) { return (x && x.isErr_) ? { code: x.code, message: x.message } : { code: 'server_error', message: String((x && x.message) || x) }; }

function h53_(s) {
  let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function isAdmin_(pw) { return typeof pw === 'string' && pw !== '' && h53_('602:' + pw.trim().toUpperCase()) === ADMIN_HASH; }

const MUTATING = { 'doc.set': 1, 'doc.acquire': 1, 'import': 1 };

function handle_(req) {
  const props = PropertiesService.getScriptProperties(), code = props.getProperty(PROP.code), storeId = props.getProperty(PROP.store);
  if (!code || !storeId) return { ok: false, error: { code: 'not_ready', message: 'ยังไม่ได้ตั้งค่าระบบหลังบ้าน (รันฟังก์ชัน setup)' } };
  if (!req || String(req.code || '') !== code) { Utilities.sleep(1200); return { ok: false, error: { code: 'bad_code', message: 'รหัสเข้าใช้งานไม่ถูกต้อง' } }; }
  const ctx = { props: props, storeId: storeId, admin: isAdmin_(req.admin), index: null };
  const calls = Array.isArray(req.calls) ? req.calls.slice(0, 40) : [];
  const lock = calls.some(function (c) { return c && MUTATING[c.op]; }) ? LockService.getScriptLock() : null;
  if (lock) { try { lock.waitLock(28000); } catch (x) { return { ok: false, error: { code: 'busy', message: 'ระบบกำลังทำรายการอื่นอยู่ ลองอีกครั้ง' } }; } }
  const results = [];
  try {
    for (let i = 0; i < calls.length; i++) {
      try { results.push(Object.assign({ ok: true }, run_(ctx, calls[i] || {}))); }
      catch (x) { results.push({ ok: false, error: asError_(x) }); }
    }
  } finally { if (lock) lock.releaseLock(); }
  return { ok: true, admin: ctx.admin, results: results };
}

function run_(ctx, c) {
  switch (c.op) {
    case 'ping': return { time: new Date().toISOString(), contact: JSON.parse(ctx.props.getProperty(PROP.contact) || '[]'), empty: !rowOf_(ctx, 'app/state') };
    case 'doc.get': { const d = readDoc_(ctx, path_(c.path)); return { exists: d !== null, data: d }; }
    case 'doc.set': return docSet_(ctx, path_(c.path), c.data);
    case 'doc.acquire': return acquire_(ctx, path_(c.path), c);
    case 'col.get': return { docs: colGet_(ctx, c) };
    case 'gs': return { payload: gs_(ctx, String(c.tool || ''), c.input || {}) };
    case 'import': return import_(ctx, c);
    default: throw err_('bad_request', 'unknown op ' + c.op);
  }
}

/* ------------------------------ the document store ------------------------------
   One row per document in the store spreadsheet: A path, B updatedAt, C savedAt (what the history list is ordered by),
   then the JSON text cut into cells of 40,000 characters. It is read and written with SpreadsheetApp, not the Sheets
   API: every request of every user runs as the one owner of this script, and the Sheets API allows a single user only
   about 60 reads and 60 writes a minute. The Sheets API is kept for the report files themselves (see gs_). */

function path_(p) { p = String(p || ''); if (!/^[A-Za-z0-9_-]+(\/[A-Za-z0-9_.-]+)+$/.test(p) || p.length > 200) throw err_('bad_request', 'bad path'); return p; }
const WIDTH = META_COLS + CHUNK_COLS;
function sheet_(ctx) {
  if (!ctx.sheet) { ctx.sheet = SpreadsheetApp.openById(ctx.storeId).getSheetByName(STORE_TAB); if (!ctx.sheet) throw err_('store_error', 'the store spreadsheet has no "docs" tab'); }
  return ctx.sheet;
}
function un_(v) { v = String(v === null || v === undefined ? '' : v); return v.charAt(0) === MARK ? v.substring(1) : v; }

function index_(ctx) {
  if (!ctx.index) {
    const sh = sheet_(ctx), n = sh.getLastRow() - 1, v = n > 0 ? sh.getRange(2, 1, n, META_COLS).getValues() : [];
    ctx.index = v.map(function (r) { return { path: un_(r[0]), at: un_(r[1]), key: un_(r[2]) }; });
  }
  return ctx.index;
}
function rowOf_(ctx, path) { const ix = index_(ctx); for (let i = 0; i < ix.length; i++) if (ix[i].path === path) return i + 2; return 0; }
function parse_(cells) { const s = (cells || []).map(un_).join(''); if (!s) return null; try { return JSON.parse(s); } catch (x) { throw err_('store_error', 'a stored document cannot be read'); } }
function readDoc_(ctx, path) {
  const row = rowOf_(ctx, path);
  return row ? parse_(sheet_(ctx).getRange(row, META_COLS + 1, 1, CHUNK_COLS).getValues()[0]) : null;
}
function rowFor_(path, data, now) {
  if (data === null || typeof data !== 'object') throw err_('bad_request', 'a document must be an object');
  const s = JSON.stringify(data);
  if (s.length > CHUNK * CHUNK_COLS) throw err_('too_large', 'document too large');
  const row = [MARK + path, MARK + now, MARK + (typeof data.savedAt === 'string' ? data.savedAt : '')];
  for (let i = 0; i < s.length; i += CHUNK) row.push(MARK + s.substring(i, i + CHUNK));
  while (row.length < WIDTH) row.push('');
  return row;
}
function appendRows_(ctx, rows) {
  const sh = sheet_(ctx), at = sh.getLastRow() + 1, short = at + rows.length - 1 - sh.getMaxRows();
  if (short > 0) sh.insertRowsAfter(sh.getMaxRows(), short + 100);
  sh.getRange(at, 1, rows.length, WIDTH).setValues(rows);
  ctx.index = null;                                      // read the rows again rather than guess
}
function writeDoc_(ctx, path, data) {
  const now = new Date().toISOString(), values = rowFor_(path, data, now), row = rowOf_(ctx, path);
  if (row) { sheet_(ctx).getRange(row, 1, 1, WIDTH).setValues([values]); ctx.index[row - 2] = { path: path, at: now, key: un_(values[2]) }; }
  else appendRows_(ctx, [values]);
}

function docSet_(ctx, path, data) {
  if (path === 'app/sheets') registerSheets_(ctx, data);
  writeDoc_(ctx, path, data);
  return {};
}

// a short cooperative lock: { holder, until }. Locks are asked for often and are tiny, so they live in the script
// properties rather than in the store spreadsheet.
function acquire_(ctx, path, c) {
  const holder = String(c.holder || ''), ttl = Math.min(600000, Math.max(1000, Math.round(+c.ttlMs) || 30000)), now = Date.now(), key = 'LOCK:' + path;
  if (!holder) throw err_('bad_request', 'holder missing');
  let cur = null;
  try { cur = JSON.parse(ctx.props.getProperty(key) || 'null'); } catch (x) { cur = null; }
  if (cur && cur.holder && cur.holder !== holder && +cur.until > now) return { acquired: false, expiresAt: new Date(+cur.until).toISOString() };
  ctx.props.setProperty(key, JSON.stringify({ holder: holder, until: now + ttl }));
  return { acquired: true, holder: holder };
}

// the documents directly under `name/`, ordered by savedAt (the only ordering the page uses) or by path
function colGet_(ctx, c) {
  const name = String(c.name || '');
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw err_('bad_request', 'bad collection');
  const pre = name + '/', desc = String(c.dir || 'asc') === 'desc', byKey = String(c.orderBy || '') === 'savedAt';
  const limit = Math.min(1000, Math.max(1, Math.round(+c.limit) || 1000));
  let rows = [];
  index_(ctx).forEach(function (x, i) { if (x.path.indexOf(pre) === 0 && x.path.indexOf('/', pre.length) < 0) rows.push({ id: x.path.slice(pre.length), key: byKey ? x.key : x.path, row: i + 2 }); });
  rows.sort(function (a, b) { return (a.key < b.key ? -1 : a.key > b.key ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) * (desc ? -1 : 1); });
  rows = rows.slice(0, limit);
  if (!rows.length) return [];
  // one read of the block of rows that holds them all (the newest few lie together at the bottom)
  let lo = rows[0].row, hi = rows[0].row;
  rows.forEach(function (r) { if (r.row < lo) lo = r.row; if (r.row > hi) hi = r.row; });
  const block = sheet_(ctx).getRange(lo, META_COLS + 1, hi - lo + 1, CHUNK_COLS).getValues(), out = [];
  let size = 0;
  for (let i = 0; i < rows.length && size < 20000000; i++) {
    const cells = block[rows[i].row - lo], d = parse_(cells);
    if (d) { out.push({ id: rows[i].id, data: d }); size += cells.join('').length; }
  }
  return out;
}

/* ------------------------------ which Google Sheets may be touched ------------------------------
   The script can reach every spreadsheet of its owner, so it only works on the files the page has registered in
   app/sheets (main files, BACKUP files, and files a year is being moved out of). A file enters that list only with the
   Google Sheet password. Rows leave a BACKUP file only with that password too. */

function list_(ctx, key) { try { const v = JSON.parse(ctx.props.getProperty(key) || '[]'); return Array.isArray(v) ? v : []; } catch (x) { return []; } }
function idsOf_(doc) {
  const all = {}, bk = {}, tabs = {};
  const add = function (v) { if (typeof v === 'string' && /^[A-Za-z0-9_-]{20,}$/.test(v)) all[v] = 1; };
  const d = (doc && typeof doc === 'object') ? doc : {};
  ['files', 'backups'].forEach(function (kind) {
    const o = (d[kind] && typeof d[kind] === 'object') ? d[kind] : {};
    Object.keys(o).forEach(function (k) {
      const f = o[k] || {}; add(f.id);
      if (kind === 'backups' && all[f.id]) { bk[f.id] = 1; tabs[f.id] = Object.keys(f.tabs || {}).map(function (t) { return f.tabs[t]; }).filter(function (n) { return typeof n === 'number'; }); }
    });
  });
  ['carry', 'parked'].forEach(function (kind) { const o = (d[kind] && typeof d[kind] === 'object') ? d[kind] : {}; Object.keys(o).forEach(function (k) { add(o[k]); }); });
  return { all: Object.keys(all), backups: Object.keys(bk), tabs: tabs };
}
function registerSheets_(ctx, doc) {
  const ids = idsOf_(doc), allow = list_(ctx, PROP.allow), backups = list_(ctx, PROP.backups);
  const fresh = ids.all.filter(function (id) { return allow.indexOf(id) < 0; });
  // a file that is a BACKUP stays one for callers without the password, whatever the document says
  const demoted = backups.filter(function (id) { return ids.backups.indexOf(id) < 0; });
  if ((fresh.length || demoted.length) && !ctx.admin) throw err_('admin_required', 'การเปลี่ยนไฟล์ Google Sheet ต้องใช้รหัสผ่านสำหรับ Google Sheet');
  let tabs = {};
  try { tabs = JSON.parse(ctx.props.getProperty(PROP.btabs) || '{}') || {}; } catch (x) { tabs = {}; }
  Object.keys(ids.tabs).forEach(function (id) { const seen = tabs[id] || []; ids.tabs[id].forEach(function (n) { if (seen.indexOf(n) < 0) seen.push(n); }); tabs[id] = seen; });
  if (ctx.admin) {
    ctx.props.setProperty(PROP.allow, JSON.stringify(ids.all));
    ctx.props.setProperty(PROP.backups, JSON.stringify(ids.backups));
    Object.keys(tabs).forEach(function (id) { if (ids.backups.indexOf(id) < 0) delete tabs[id]; });
  }
  ctx.props.setProperty(PROP.btabs, JSON.stringify(tabs));
}

// may a caller without the password send this request to a BACKUP file?
function backupSafe_(q, dataTabs) {
  const kind = Object.keys(q || {})[0], body = q ? q[kind] : null;
  if (BACKUP_OPEN.indexOf(kind) < 0 || !body) return false;
  if (kind !== 'updateCells') return true;
  // cells: anywhere outside the three data tabs (the note on the first tab), or the header row of a data tab
  const where = body.start || body.range || {}, sid = where.sheetId;
  if (dataTabs.indexOf(sid) < 0) return true;
  const first = body.start ? body.start.rowIndex : where.startRowIndex, rows = body.start ? (body.rows || []).length : (where.endRowIndex - where.startRowIndex);
  return first === 0 && rows === 1;
}

function gs_(ctx, tool, input) {
  const id = String(input.spreadsheetId || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id) || id === ctx.storeId) throw err_('forbidden', 'ไฟล์นี้ใช้กับหน้าเว็บไม่ได้');
  if (!ctx.admin && list_(ctx, PROP.allow).indexOf(id) < 0) throw err_('admin_required', 'ไฟล์นี้ยังไม่ได้ลงทะเบียนกับหน้าเว็บ');
  if (tool === 'update_spreadsheet' && !ctx.admin && list_(ctx, PROP.backups).indexOf(id) >= 0) {
    let tabs = {};
    try { tabs = JSON.parse(ctx.props.getProperty(PROP.btabs) || '{}') || {}; } catch (x) { tabs = {}; }
    const dataTabs = tabs[id] || [];
    if (!(input.requests || []).every(function (q) { return backupSafe_(q, dataTabs); })) throw err_('admin_required', 'การลบหรือแก้ข้อมูลในไฟล์ BACKUP ต้องใช้รหัสผ่านสำหรับ Google Sheet');
  }
  try {
    if (tool === 'get_spreadsheet') {
      const f = Array.isArray(input.fields) ? input.fields.join(',') : String(input.fields || '');
      return Sheets.Spreadsheets.get(id, f ? { fields: f } : {});
    }
    if (tool === 'get_values') return Sheets.Spreadsheets.Values.get(id, String(input.range || ''));
    if (tool === 'update_spreadsheet') {
      if (!Array.isArray(input.requests) || !input.requests.length) throw err_('bad_request', 'no requests');
      const r = Sheets.Spreadsheets.batchUpdate({ requests: input.requests }, id);
      return { status: 'success', replies: (r && r.replies) || [] };
    }
  } catch (x) {
    if (x && x.isErr_) throw x;
    throw err_('tool_error', String((x && x.message) || x));
  }
  throw err_('bad_request', 'unknown tool ' + tool);
}

/* ------------------------------ bringing the data over from the Claude page ------------------------------ */

// { docs: { 'app/config': {...}, 'app/state': {...}, 'history/r2026-10-01_001': {...}, ... }, overwrite: false }
function import_(ctx, c) {
  if (!ctx.admin) throw err_('admin_required', 'การนำเข้าข้อมูลต้องใช้รหัสผ่านสำหรับ Google Sheet');
  const docs = (c.docs && typeof c.docs === 'object') ? c.docs : {}, paths = Object.keys(docs);
  if (!paths.length) throw err_('bad_request', 'no documents');
  if (rowOf_(ctx, 'app/state') && !c.overwrite) throw err_('not_empty', 'ระบบมีข้อมูลอยู่แล้ว จึงไม่นำเข้าทับ');
  paths.forEach(function (p) { path_(p); });
  if (docs['app/sheets']) registerSheets_(ctx, docs['app/sheets']);
  const fresh = [], now = new Date().toISOString();
  let n = 0;
  paths.forEach(function (p) {
    if (/^app\/(savelock|gslock)$/.test(p)) return;
    if (rowOf_(ctx, p)) writeDoc_(ctx, p, docs[p]); else fresh.push(rowFor_(p, docs[p], now));
    n++;
  });
  if (fresh.length) appendRows_(ctx, fresh);              // every new document in one request
  return { imported: n };
}
