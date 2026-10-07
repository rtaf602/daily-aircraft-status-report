import { chromium } from 'playwright';
import fs from 'fs';
import { OUT, BUILD, readJson } from './paths.mjs';
const html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + fs.readFileSync(BUILD, 'utf8') + '</body></html>';
const docs = { 'app/state': readJson('basic_state.json'), 'app/config': readJson('basic_config.json') };
export async function open(opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 400, height: 860 } : { width: 1500, height: 1000 }, colorScheme: opts.dark ? 'dark' : 'light', deviceScaleFactor: opts.mobile ? 2 : 1, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  await page.route('**/*', (r) => r.request().url().startsWith('https://test.local/') ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort());
  if (!opts.nohost) await page.addInitScript((docs) => {
    window.__db = JSON.parse(JSON.stringify(docs || {})); window.__sets = []; window.__saved = [];
    const doc = (p) => ({ get: async () => ({ exists: p in window.__db, id: p.split('/').pop(), data: () => JSON.parse(JSON.stringify(window.__db[p])), metadata: {} }), set: async (d) => { window.__db[p] = JSON.parse(JSON.stringify(d)); window.__sets.push(p); } });
    const collection = (name) => { const q = { orderBy: () => q, limit: () => q, get: async () => ({ docs: Object.keys(window.__db).filter((k) => k.startsWith(name + '/')).map((k) => ({ id: k.split('/').pop(), data: () => JSON.parse(JSON.stringify(window.__db[k])) })) }) }; return q; };
    const caps = { db: { doc, collection }, user: { can: async () => true },
      downloads: { save: async ({ filename, data }) => { const b = new Uint8Array(await data.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); window.__saved.push({ filename, b64: btoa(s) }); return { status: 'saved' }; } } };
    window.claude = { use: (n) => new Promise((r) => setTimeout(() => r(caps[n] || null), 100)) };
  }, opts.empty ? {} : docs);
  await page.goto('https://test.local/');
  await page.waitForTimeout(700);
  const dlgText = async () => (await page.locator('#dlg[open]').count()) ? (await page.locator('#dlg').innerText()).replace(/\n+/g, ' | ') : '(no dialog)';
  const pass = async (pw) => { await page.fill('#dlg input[name=pw]', pw); await page.click('#dlg button[type=submit]'); await page.waitForTimeout(150); };
  const ok = async () => { await page.click('#dlg button[type=submit]'); await page.waitForTimeout(150); };
  const cancel = async () => { await page.click('#dlg [data-x=cancel]'); await page.waitForTimeout(150); };
  const pick = async (sel, text) => { await page.click(sel); await page.waitForTimeout(80); await page.locator('#pop .opt', { hasText: text }).first().click(); await page.waitForTimeout(120); };
  const type = async (sel, v) => { await page.fill(sel, v); await page.locator(sel).blur(); await page.waitForTimeout(150); };
  return { browser, page, errors, dlgText, pass, ok, cancel, pick, type, out: (n) => OUT + '/' + n };
}
