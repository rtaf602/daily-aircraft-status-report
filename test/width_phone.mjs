import { open, readJson } from './harness.mjs';
import fs from 'fs';
const live = readJson('live_state.json');
const t = await open({ docs: live.db, gsFiles: live.files, mobile: true }), page = t.page;
const r = await page.evaluate(() => { const s = document.querySelector('.sum-wrap'), d = document.documentElement; return { sum: s.scrollWidth - s.clientWidth, zoom: document.getElementById('sum').style.zoom || '1', doc: d.scrollWidth - d.clientWidth, grid: document.getElementById('grid').style.zoom || '1' }; });
console.log('phone:', JSON.stringify(r), JSON.stringify(t.errors));
await t.browser.close();
