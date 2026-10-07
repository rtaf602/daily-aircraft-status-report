import { open } from './harness_basic.mjs';
for (const dark of [false, true]) {
  const t = await open({ mobile: true, dark }); const { page } = t;
  const ov = async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const a = await ov();
  for (const id of ['a319', 'a320_03', 'a320_05', 'a340_04', 'ssj_06', 'ssj_07', 'ssj_08']) for (let i = 0; i < (id === 'a340_04' ? 4 : 2); i++) await page.fill(`#f-${id}-sn${i}`, `S${i}`);
  await page.click('#btn-save'); await page.waitForTimeout(400);
  console.log(dark ? 'dark' : 'light', 'overflow edit/saved:', a, await ov(), '| saved visible:', await page.isVisible('#panel-saved'), '| dialog:', await t.dlgText(), '| errors:', JSON.stringify(t.errors));
  if (!dark) await page.screenshot({ path: t.out('v4-m-saved.png') });
  await t.browser.close();
}
