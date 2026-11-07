// Build the reference-vs-local comparison artefacts.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('report');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

// ---------------------------------------------------------- reference crops
const refCtx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
const refPage = await refCtx.newPage();
await refPage.goto('https://www.speedtest.net/result/19869366452', { waitUntil: 'domcontentloaded', timeout: 90000 });
await refPage.waitForTimeout(7000);

const boxes = await refPage.evaluate(() => {
  const grab = (text) => {
    const el = [...document.querySelectorAll('*')].find(
      (e) => e.children.length === 0 && e.textContent.trim() === text && /mono/i.test(getComputedStyle(e).fontFamily)
    );
    if (!el) return null;
    const r = document.createRange();
    r.selectNodeContents(el);
    const b = r.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height, size: parseFloat(getComputedStyle(el).fontSize) };
  };
  return { dl: grab('155.61'), ul: grab('113.57') };
});
console.log('[ref boxes]', JSON.stringify(boxes));
for (const [key, b] of Object.entries(boxes)) {
  if (!b) continue;
  const pad = 6;
  await refPage.screenshot({
    path: path.join(OUT, `reference-number-${key}.png`),
    clip: { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2 },
  });
}
await refCtx.close();

// -------------------------------------------------------------- local crops
const ctx = await browser.newContext({ viewport: { width: 1200, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// gauge states, sized so 1 svg unit == 2 css px (a 572 px stage), for crisp comparisons
const STATES = [
  ['local-idle', 'static=0&stage=idle'],
  ['local-low', 'static=8&stage=download'],
  ['local-mid', 'static=155.61&stage=download'],
  ['local-high', 'static=862&stage=download'],
  ['local-upload', 'static=341&stage=upload'],
  ['local-done', 'static=862&stage=done'],
  ['local-extended', 'static=4200&stage=download&scale=auto'],
];
for (const [id, q] of STATES) {
  await page.goto(`http://localhost:5178/?bare=1&${q}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => {
    document.getElementById('gauge-stage').style.width = '572px';
  });
  await page.waitForTimeout(320);
  const el = await page.$('#gauge-stage');
  const box = await el.boundingBox();
  await page.screenshot({
    path: path.join(OUT, `${id}.png`),
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
  console.log('[local]', id);
}

// number crop at the same optical size as the reference (48px -> 24 svg units at 2x)
const numBox = await page.evaluate(() => {
  const t = document.querySelector('.gauge-number');
  const r = t.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});
console.log('[local number box]', JSON.stringify(numBox));

await browser.close();
console.log('done');
