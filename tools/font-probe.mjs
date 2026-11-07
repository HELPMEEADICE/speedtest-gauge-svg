// Apples-to-apples numeral metric comparison using canvas measureText on both pages.
import { chromium } from 'playwright';

const browser = await chromium.launch();

const probe = async (url, fontExpr, waitMs, ready) => {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'en-US',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  if (ready) await page.waitForSelector(ready, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(waitMs);
  const out = await page.evaluate((fontExpr) => {
    const c = document.createElement('canvas').getContext('2d');
    const measure = (font, text) => {
      c.font = font;
      return c.measureText(text).width;
    };
    return {
      loaded: [...document.fonts].map((f) => `${f.family}:${f.status}`),
      gaugeMono48: measure(`48px ${fontExpr}`, '155.61'),
      gaugeMono36: measure(`36px ${fontExpr}`, '155.61'),
      perCharEm48: measure(`48px ${fontExpr}`, '155.61') / 48 / 6,
      digits: Array.from({ length: 10 }, (_, i) => +measure(`48px ${fontExpr}`, String(i)).toFixed(2)),
      dot48: +measure(`48px ${fontExpr}`, '.').toFixed(2),
      comma48: +measure(`48px ${fontExpr}`, ',').toFixed(2),
    };
  }, fontExpr);
  await ctx.close();
  return out;
};

const ref = await probe('https://www.speedtest.net/result/19869366452', 'gauge-mono, Montserrat', 7000, null);
console.log('[reference]', JSON.stringify(ref));

const local = await probe('http://localhost:5178/?bare=1&static=155.61', '"Gauge Mono", ui-monospace', 1500, 'body[data-ready="true"]');
console.log('[local    ]', JSON.stringify(local));

const d = ((local.gaugeMono48 - ref.gaugeMono48) / ref.gaugeMono48) * 100;
console.log(`[per-char advance] ref=${(ref.perCharEm48 * 100).toFixed(2)}%em  local=${(local.perCharEm48 * 100).toFixed(2)}%em  delta=${d.toFixed(2)}%`);

await browser.close();
