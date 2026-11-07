// Phase 1 (revised): static observation only — never starts a real speed test.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('research');
const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const log = (...a) => console.log('[probe]', ...a);

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
const assets = new Set();
page.on('response', (r) => {
  const u = r.url();
  if (/\.(png|webp|svg|woff2?|jpg)(\?|$)/i.test(u)) assets.add(u);
});

await page.goto('https://www.speedtest.net/', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Accept All")', 'button:has-text("Accept")']) {
  try {
    const b = page.locator(sel).first();
    if (await b.isVisible({ timeout: 1200 })) { await b.click(); break; }
  } catch {}
}
await page.waitForTimeout(7000);

const info = await page.evaluate(() => {
  const out = { url: location.href, title: document.title };
  const dec = document.documentElement;
  out.scheme = dec.getAttribute('data-mui-color-scheme');
  out.bodyBg = getComputedStyle(document.body).backgroundColor;
  out.decBg = getComputedStyle(dec).backgroundColor;
  out.fonts = [...new Set([...document.querySelectorAll('body *')]
    .map((e) => getComputedStyle(e).fontFamily))].slice(0, 20);
  out.svg = [...document.querySelectorAll('svg')].map((s) => {
    const r = s.getBoundingClientRect();
    return {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1),
      viewBox: s.getAttribute('viewBox'), width: s.getAttribute('width'), height: s.getAttribute('height'),
      hasImg: !!s.querySelector('image'), hasRot: !!s.querySelector('g[transform^="rotate"]'),
      nText: s.querySelectorAll('text').length, nPath: s.querySelectorAll('path').length,
      nCircle: s.querySelectorAll('circle').length,
    };
  }).filter((s) => s.w > 60);
  const g = [...document.querySelectorAll('svg')].find((s) => s.querySelector('g[transform^="rotate"]'));
  if (g) { out.gauge = g.outerHTML; const r = g.getBoundingClientRect(); out.gaugeRect = r.toJSON(); }
  const mono = [...document.querySelectorAll('*')].filter(
    (e) => e.children.length === 0 && /mono/i.test(getComputedStyle(e).fontFamily) && e.textContent.trim()
  );
  out.mono = mono.slice(0, 6).map((e) => {
    const cs = getComputedStyle(e);
    return { tag: e.tagName, text: e.textContent.trim(), ff: cs.fontFamily, fs: cs.fontSize,
      fw: cs.fontWeight, color: cs.color, lh: cs.lineHeight, ls: cs.letterSpacing,
      rect: e.getBoundingClientRect().toJSON() };
  });
  return out;
});

fs.writeFileSync(path.join(OUT, 'live-dom.json'), JSON.stringify(info, null, 2));
log('scheme', info.scheme, '| bodyBg', info.bodyBg);
log('svgs:', JSON.stringify(info.svg?.slice(0, 12)));
log('gaugeRect:', JSON.stringify(info.gaugeRect));
log('mono:', JSON.stringify(info.mono?.slice(0, 2)));

if (info.gaugeRect) {
  const p = 70;
  fs.writeFileSync(path.join(OUT, 'gauge.svg'), info.gauge);
  await page.screenshot({
    path: path.join(SHOTS, 'ref-idle-gauge.png'),
    clip: {
      x: Math.max(0, info.gaugeRect.x - p), y: Math.max(0, info.gaugeRect.y - p),
      width: info.gaugeRect.width + p * 2, height: info.gaugeRect.height + p * 2,
    },
  });
}
await page.screenshot({ path: path.join(SHOTS, 'ref-idle-viewport.png') });

fs.writeFileSync(path.join(OUT, 'assets.txt'), [...assets].sort().join('\n'));
log('assets', assets.size);
await browser.close();
log('done (no test was started)');
