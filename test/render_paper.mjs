// draws the preview and the PDF; MODE=h1 makes Chromium misplace centred/right-aligned Thai text the way the Safari PDF shows,
// MODE=h2 additionally makes measureText return 0 for strings with Thai
import { open } from './harness.mjs';
import fs from 'fs';
const mode = process.env.MODE || 'none', tag = process.argv[2] || 'x';
const init = mode === 'none' ? null : `(() => {
  const P = CanvasRenderingContext2D.prototype, fill = P.fillText, meas = P.measureText, thai = /[\\u0E00-\\u0E7F]/;
  P.fillText = function (s, x, y, m) { if (thai.test(s) && this.textAlign !== 'left' && this.textAlign !== 'start') { const a = this.textAlign; this.textAlign = 'left'; fill.call(this, s, x, y); this.textAlign = a; return; } return m === undefined ? fill.call(this, s, x, y) : fill.call(this, s, x, y, m); };
  ${mode === 'h2' ? "P.measureText = function (s) { const r = meas.call(this, s); if (!thai.test(s)) return r; return { width: 0, fontBoundingBoxAscent: r.fontBoundingBoxAscent, fontBoundingBoxDescent: r.fontBoundingBoxDescent, actualBoundingBoxAscent: r.actualBoundingBoxAscent, actualBoundingBoxDescent: r.actualBoundingBoxDescent }; };" : ''}
})();`;
const t = await open({ init }); const { page } = t;
// a report close to the one in the Safari files
const set = async (sel, v) => { if (await page.locator(sel).count()) { await page.fill(sel, v); await page.locator(sel).blur(); } else console.log('missing', sel); };
if (process.env.LONG) {
  await set('#f-ac-a319-work-0', 'รอการซ่อมสีลำตัว บ. เนื่องจากสีมีการเสื่อมสภาพอย่างมากทั้งบริเวณลำตัวส่วนหน้าและส่วนหลัง รอการซ่อมจาก TG ภายในเดือนหน้า');
  await set('#f-ac-a320_03-work-1', 'ENG.2 IGNITION B FAULT AWAITING AVAILABLE SPARE PARTS FROM THE MANUFACTURER VIA TG TECHNICAL DEPARTMENT WAVE 2 AND FOLLOW-UP');
  await set('#f-ac-a320_05-work-0', 'ตรวจซ่อมตามระยะเวลา C5-CHECK ตั้งแต่ 15 ก.ย. - 15 ต.ค.69 และตรวจพิเศษเพิ่มเติมตามคำสั่ง');
  const ids = await page.evaluate(() => [...document.querySelectorAll('input[type=text], input:not([type])')].map((e) => e.id).filter((i) => /pos|note|sched|ck|j-/.test(i)).slice(0, 40));
  console.log('ids', ids.join(' '));
  for (const id of ids.filter((i) => /pos/.test(i)).slice(0, 2)) await set('#' + id, 'น.ควบคุมมาตรฐาน กทน.บน.๖ และรักษาราชการ ผู้ช่วยหัวหน้าฝ่ายการช่าง ฝูงบิน ๖๐๒ กองบิน ๖ อีกตำแหน่งหนึ่ง');
  for (const id of ids.filter((i) => /note|j-/.test(i)).slice(0, 2)) await set('#' + id, 'หมายเหตุยาวมากเกินกว่าช่องจะรับได้ 29 พ.ย.67 - 29 พ.ย.69');
}
await page.click('#btn-preview'); await page.waitForTimeout(600);
const png = await page.evaluate(() => document.getElementById('paper').toDataURL('image/png'));
fs.writeFileSync(t.out('f2-' + tag + '.png'), Buffer.from(png.split(',')[1], 'base64'));
await page.evaluate(() => { window.__saved = []; });
await page.click('#btn-pdf'); await page.waitForFunction(() => window.__saved.length >= 1, null, { timeout: 120000 });
const f = (await page.evaluate(() => window.__saved))[0]; fs.writeFileSync(t.out('f2-' + tag + '.pdf'), Buffer.from(f.b64, 'base64'));
await page.evaluate(() => { window.__saved = []; });
await page.click('#btn-xlsx'); await page.waitForFunction(() => window.__saved.length >= 1, null, { timeout: 30000 });
const g = (await page.evaluate(() => window.__saved))[0]; fs.writeFileSync(t.out('f2-' + tag + '.xlsx'), Buffer.from(g.b64, 'base64'));
console.log(tag, mode, f.filename, g.filename, 'dialog:', await t.dlgText(), 'errors:', JSON.stringify(t.errors));
await t.browser.close();
