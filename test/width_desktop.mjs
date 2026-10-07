import { chromium } from 'playwright';
import fs from 'fs';
import { OUT, BUILD, readJson } from './paths.mjs';
const html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + fs.readFileSync(BUILD, 'utf8') + '</body></html>';
const live = readJson('dbread10/app/state.json'), cfg = readJson('dbread10/app/config.json');
const browser = await chromium.launch();
for (const w of [901, 1000, 1100, 1180, 1280, 1366, 1440, 1700]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } }), page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => r.request().url().startsWith('https://test.local/') ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort());
  await page.addInitScript(([state, config]) => { localStorage.setItem('daily-ac-status-602:v2:state', JSON.stringify(state)); localStorage.setItem('daily-ac-status-602:v2:config', JSON.stringify(config)); }, [live.data || live, cfg.data || cfg]);
  await page.goto('https://test.local/'); await page.waitForTimeout(700);
  const m = async () => page.evaluate(() => { const g = document.getElementById('grid'), b = g.parentNode, d = document.documentElement, over = []; document.querySelectorAll('main *').forEach((el) => { if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible' && el.offsetParent) over.push(el.className || el.id || el.tagName); }); return { zoom: g.style.zoom || '1', box: b.clientWidth, scroll: b.scrollWidth, doc: d.scrollWidth - d.clientWidth, font: Math.round(parseFloat(getComputedStyle(document.getElementById('f-a319-af')).fontSize) * (parseFloat(g.style.zoom) || 1) * 10) / 10, over: [...new Set(over)].slice(0, 6) }; });
  const a = await m(); a.sum = await page.evaluate(() => { const s = document.querySelector('.sum-wrap'); return s.scrollWidth - s.clientWidth; }); a.over = undefined;
  await page.check('#toggle-key'); await page.waitForTimeout(150);
  const b = await m();
  console.log(w, JSON.stringify(a), '| with K:', JSON.stringify({ zoom: b.zoom, scroll: b.scroll - b.box, over: b.over }), errors.length ? errors : '');
  if (w === 1100 || w === 1280) { await page.uncheck('#toggle-key'); await page.waitForTimeout(150); await page.screenshot({ path: OUT + '/w' + w + '.png' }); }
  await ctx.close();
}
await browser.close();
