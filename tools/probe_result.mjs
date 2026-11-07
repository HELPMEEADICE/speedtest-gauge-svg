// Observe a public result page (page load only — no speed test is started).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('research');
const SHOTS = path.join(OUT, 'shots');
const url = process.argv[2] || 'https://www.speedtest.net/result/19869366452';

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(9000);

const data = await page.evaluate(() => {
  const out = { url: location.href, title: document.title };
  out.scheme = document.documentElement.getAttribute('data-mui-color-scheme');
  out.bodyBg = getComputedStyle(document.body).backgroundColor;
  out.svgs = [...document.querySelectorAll('svg')].map((s) => {
    const r = s.getBoundingClientRect();
    return {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1),
      viewBox: s.getAttribute('viewBox'), width: s.getAttribute('width'),
      hasImg: !!s.querySelector('image'), hasRot: !!s.querySelector('g[transform^="rotate"]'),
      nText: s.querySelectorAll('text').length, nPath: s.querySelectorAll('path').length,
    };
  }).filter((s) => s.w > 50);
  const g = [...document.querySelectorAll('svg')].find((s) => s.querySelector('g[transform^="rotate"]'));
  if (g) { out.gaugeSvg = g.outerHTML; out.gaugeRect = g.getBoundingClientRect().toJSON(); }
  return out;
});

fs.writeFileSync(path.join(OUT, 'result-dom.json'), JSON.stringify(data, null, 2));
console.log('[result] scheme', data.scheme, 'bodyBg', data.bodyBg);
console.log('[result] gaugeRect', JSON.stringify(data.gaugeRect));
console.log('[result] svgs', JSON.stringify(data.svgs?.slice(0, 10)));

if (data.gaugeRect) {
  const p = 60;
  fs.writeFileSync(path.join(OUT, 'result-gauge.svg'), data.gaugeSvg);
  await page.screenshot({
    path: path.join(SHOTS, 'ref-result-gauge.png'),
    clip: {
      x: Math.max(0, data.gaugeRect.x - p), y: Math.max(0, data.gaugeRect.y - p),
      width: data.gaugeRect.width + p * 2, height: data.gaugeRect.height + p * 2,
    },
  });
}
await page.screenshot({ path: path.join(SHOTS, 'ref-result-viewport.png'), fullPage: false });
await browser.close();
console.log('[result] done');
