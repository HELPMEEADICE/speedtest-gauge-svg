// Cross-checks: (a) numeral metrics against the real result page, (b) responsive and
// DPR invariance of the local gauge.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5178/';
const browser = await chromium.launch();

// ---------------------------------------------------------- (a) font metrics
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
const refFont = await refPage.evaluate(() => {
  const target = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && /^\d+\.\d{2}$/.test(e.textContent.trim()) && /mono/i.test(getComputedStyle(e).fontFamily)
  );
  if (!target) return null;
  const cs = getComputedStyle(target);
  const r = target.getBoundingClientRect();
  return {
    text: target.textContent.trim(),
    font: cs.fontFamily,
    size: parseFloat(cs.fontSize),
    weight: cs.fontWeight,
    width: r.width,
    advRatio: r.width / (cs.fontSize * target.textContent.trim().length),
  };
});
console.log('[reference result page]', JSON.stringify(refFont));
await refCtx.close();

// -------------------------------------------------- (b) responsive / DPR grid
const local = await browser.newContext({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
const page = await local.newPage();

const measure = async (q, stageSize) =>
  page.evaluate(
    ({ stageSize }) => {
      const host = document.getElementById('gauge-stage');
      if (stageSize) host.style.width = `${stageSize}px`;
      const svg = document.querySelector('svg.gauge-svg');
      const sr = svg.getBoundingClientRect();
      const u = 286 / sr.width;
      const rel = (el) => {
        const r = el.getBoundingClientRect();
        return {
          x: +(((r.x - sr.x + r.width / 2) * u) / 286).toFixed(4),
          y: +(((r.y - sr.y + r.height / 2) * u) / 286).toFixed(4),
          w: +((r.width * u) / 286).toFixed(4),
        };
      };
      return {
        cssSize: +sr.width.toFixed(2),
        number: rel(document.querySelector('.gauge-number')),
        unit: rel(document.querySelector('.gauge-unit')),
        label100: rel(document.querySelectorAll('.gauge-labels text')[4]),
        trackWidth: +(document.querySelectorAll('svg.gauge-svg > path')[0].getBoundingClientRect().width * u).toFixed(2),
      };
    },
    { stageSize }
  );

await page.goto(`${BASE}?bare=1&static=155.61&stage=download`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-ready="true"]');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

const localFont = await page.evaluate(() => {
  const el = document.querySelector('.gauge-number');
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const svgR = document.querySelector('svg.gauge-svg').getBoundingClientRect();
  const unit = svgR.width / 286;
  return {
    text: el.textContent,
    font: cs.fontFamily,
    userUnitsFontSize: 36,
    inkWidthUserUnits: r.width / unit,
    advRatio: r.width / unit / (36 * el.textContent.length),
  };
});
console.log('[local gauge]', JSON.stringify(localFont));
if (refFont) {
  const delta = ((localFont.advRatio - refFont.advRatio) / refFont.advRatio) * 100;
  console.log(`[advance-ratio] reference=${refFont.advRatio.toFixed(4)} local=${localFont.advRatio.toFixed(4)} delta=${delta.toFixed(2)}%`);
}

console.log('== responsive invariance (all values are fractions of the 286 box) ==');
for (const size of [300, 440, 640]) {
  const m = await measure('', size);
  console.log(`  ${String(size).padStart(3)}px ->`, JSON.stringify(m));
}

console.log('== DPR invariance ==');
for (const dpr of [1, 2, 3]) {
  const c = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: dpr });
  const p = await c.newPage();
  await p.goto(`${BASE}?bare=1&static=155.61&stage=download`, { waitUntil: 'networkidle' });
  await p.waitForSelector('body[data-ready="true"]');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(250);
  const m = await p.evaluate(() => {
    const svg = document.querySelector('svg.gauge-svg');
    const sr = svg.getBoundingClientRect();
    const u = 286 / sr.width;
    const n = document.querySelector('.gauge-number').getBoundingClientRect();
    return { dpr: devicePixelRatio, css: sr.width, numCx: +(((n.x - sr.x + n.width / 2) * u)).toFixed(3), numCy: +(((n.y - sr.y + n.height / 2) * u)).toFixed(3) };
  });
  console.log('  ', JSON.stringify(m));
  await c.close();
}

await browser.close();
