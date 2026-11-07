// Numeric audit: compare the rendered DOM geometry against the analytic spec.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5178/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(`${BASE}?bare=1&static=862&stage=download`, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-ready="true"]');
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);

const report = await page.evaluate(() => {
  const svg = document.querySelector('svg.gauge-svg');
  const sr = svg.getBoundingClientRect();
  const scale = 286 / sr.width;
  const toUnits = (r) => ({
    x: +((r.x - sr.x) * scale).toFixed(2),
    y: +((r.y - sr.y) * scale).toFixed(2),
    w: +(r.width * scale).toFixed(2),
    h: +(r.height * scale).toFixed(2),
    cx: +((r.x - sr.x + r.width / 2) * scale).toFixed(2),
    cy: +((r.y - sr.y + r.height / 2) * scale).toFixed(2),
  });
  const labels = [...svg.querySelectorAll('.gauge-labels text')].map((t) => ({
    v: t.textContent,
    ...toUnits(t.getBoundingClientRect()),
    fill: t.getAttribute('fill'),
    font: getComputedStyle(t).fontFamily,
    size: getComputedStyle(t).fontSize,
    weight: getComputedStyle(t).fontWeight,
  }));
  const num = svg.querySelector('.gauge-number');
  const unit = svg.querySelector('.gauge-unit');
  const needle = svg.querySelector('g[transform^="rotate"]');
  const rings = svg.querySelectorAll('g[clip-path] path').length;
  const trackPath = svg.querySelectorAll(':scope > path')[0];
  return {
    svgCss: { w: sr.width, h: sr.height, dpr: devicePixelRatio },
    scale,
    labels,
    number: {
      text: num.textContent,
      ...toUnits(num.getBoundingClientRect()),
      fill: num.getAttribute('fill'),
      font: getComputedStyle(num).fontFamily,
      size: getComputedStyle(num).fontSize,
      weight: getComputedStyle(num).fontWeight,
    },
    unit: {
      ...toUnits(unit.getBoundingClientRect()),
      text: unit.textContent,
      font: getComputedStyle(unit.querySelector('text')).fontFamily,
      size: getComputedStyle(unit.querySelector('text')).fontSize,
    },
    needle: { transform: needle.getAttribute('transform'), ...toUnits(needle.getBoundingClientRect()) },
    ringSegments: rings,
    trackD: trackPath?.getAttribute('d')?.slice(0, 90),
    fonts: {
      gaugeMono: document.fonts.check('36px "Gauge Mono"'),
      montserrat: document.fonts.check('14px Montserrat'),
      loaded: [...document.fonts].map((f) => `${f.family}:${f.status}`),
    },
  };
});

console.log(JSON.stringify(report, null, 1));
await browser.close();
