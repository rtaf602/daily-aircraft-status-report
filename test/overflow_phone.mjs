import { open, readJson } from './harness.mjs';
import fs from 'fs';
const live = readJson('live_state.json');
const t = await open({ docs: live.db, gsFiles: live.files, mobile: true }), page = t.page;
await t.type('#f-dateFrom', '2026-10-07'); await page.click('#btn-save'); await page.waitForTimeout(2200);
const r = await page.evaluate(() => { const w = document.documentElement.clientWidth, out = []; document.querySelectorAll('body *').forEach((el) => { const b = el.getBoundingClientRect(); if (b.width && b.right > w + 1 && !el.closest('[hidden]')) out.push(el.tagName + '#' + el.id + '.' + String(el.className).slice(0, 30) + ' right=' + Math.round(b.right) + ' w=' + Math.round(b.width)); }); return { w, sw: document.documentElement.scrollWidth, out: out.slice(0, 12) }; });
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: t.out('k-m-saved.png') });
await t.browser.close();
