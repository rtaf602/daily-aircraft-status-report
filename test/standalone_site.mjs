// The web-site build without a back end, opened as an ordinary web page: no Claude runtime, no shared storage.
// Needs nothing from the private folder. Checks that the page stands on its own: nothing marked hidden is showing,
// SAVE lands in this browser's own storage, and PDF / Excel come out as ordinary downloads.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const ROOT = fileURLToPath(new URL('..', import.meta.url)), OUT = ROOT + 'test/out/';
fs.mkdirSync(OUT, { recursive: true });
// built here with no back-end address, whatever build.config.json says, so this never talks to the real back end
const b = spawnSync(process.execPath, [ROOT + 'build.mjs'], { encoding: 'utf8', env: { ...process.env, SITE_BACKEND_URL: '', SITE_OUT: OUT + 'site_local' } });
if (b.status !== 0) { console.error(b.stdout + b.stderr); process.exit(1); }
const html = fs.readFileSync(OUT + 'site_local/index.html', 'utf8');
const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });   // Thai file names need a UTF-8 locale on Linux
const page = await (await browser.newContext({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/*', (r) => (r.request().url() === 'https://pages.test/' ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }) : r.abort()));
await page.goto('https://pages.test/'); await page.waitForTimeout(1200);
const showing = () => page.evaluate(() => [...document.querySelectorAll('[hidden]')].filter((e) => e.getClientRects().length).map((e) => e.id || e.className || e.tagName));
console.log('title in <head>:', await page.evaluate(() => !!document.head.querySelector('title')), '|', await page.title());
console.log('status:', await page.locator('#save-status').innerText());
console.log('hidden elements that are showing (edit page):', JSON.stringify(await showing()));
console.log('Google Sheet chip visible:', await page.locator('#gs-chip').isVisible(), '| fiscal-year banner visible:', await page.locator('#fy-note').isVisible());
await page.screenshot({ path: OUT + 'standalone-edit.png' });
const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#btn-pdf')]);
console.log('PDF download:', pdf.suggestedFilename());
const [xls] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#btn-xlsx')]);
console.log('Excel download:', xls.suggestedFilename());
await page.click('#btn-save'); await page.waitForTimeout(1500);
console.log('after SAVE: saved page visible:', await page.isVisible('#panel-saved'), '| hidden elements showing:', JSON.stringify(await showing()));
console.log('saved page says:', (await page.locator('#panel-saved').innerText()).split('\n').filter(Boolean).slice(0, 3).join(' | '));
console.log('kept in this browser only:', JSON.stringify(await page.evaluate(() => Object.keys(localStorage))));
await page.screenshot({ path: OUT + 'standalone-saved.png' });
console.log('errors:', JSON.stringify(errors));
await browser.close();
