// Capture the same string, at the same device pixel size, from both sources.
// reference: speedtest.net result page, gauge-mono 48 CSS px, DPR 1
// local    : this component with the stage scaled so 36 svg units == 48 CSS px
import { chromium } from 'playwright';
import path from 'node:path';

const REP = path.resolve('report');
const browser = await chromium.launch();

// ---------------------------------------------------------------- reference
const refCtx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
const ref = await refCtx.newPage();
await ref.goto('https://www.speedtest.net/result/19869366452', { waitUntil: 'domcontentloaded', timeout: 90000 });
await ref
  .waitForFunction(
    () =>
      [...document.querySelectorAll('*')].some(
        (e) => e.children.length === 0 && /^\d+\.\d{2}$/.test(e.textContent.trim()) && /mono/i.test(getComputedStyle(e).fontFamily)
      ),
    { timeout: 45000 }
  )
  .catch(() => {});
await ref.waitForTimeout(2500);
const rb = await ref.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && /^\d+\.\d{2}$/.test(e.textContent.trim()) && /mono/i.test(getComputedStyle(e).fontFamily)
  );
  if (!el) return null;
  const r = document.createRange();
  r.selectNodeContents(el);
  const b = r.getBoundingClientRect();
  return { text: el.textContent.trim(), x: b.x, y: b.y, w: b.width, h: b.height, size: parseFloat(getComputedStyle(el).fontSize) };
});
console.log('[ref]', JSON.stringify(rb));
if (!rb) throw new Error('reference number element not found');
await ref.screenshot({
  path: path.join(REP, 'number-ref-48px.png'),
  clip: { x: rb.x, y: rb.y, width: rb.w, height: rb.h },
});
await refCtx.close();

// -------------------------------------------------------------------- local
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:5178/?bare=1&static=155.61&stage=download', { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-ready="true"]');
await page.evaluate(() => document.fonts.ready);
// 36 units must equal 48 css px  ->  stage = 286 * 48 / 36
const STAGE = (286 * 48) / 36;
await page.evaluate((s) => {
  document.getElementById('gauge-stage').style.width = `${s}px`;
}, STAGE);
await page.waitForTimeout(350);
const lb = await page.evaluate(() => {
  const t = document.querySelector('.gauge-number');
  const r = t.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, size: getComputedStyle(t).fontSize };
});
console.log('[local]', JSON.stringify(lb));
await page.screenshot({
  path: path.join(REP, 'number-local-48px.png'),
  clip: { x: lb.x, y: lb.y, width: lb.w, height: lb.h },
});
await browser.close();
console.log('captured at DPR 1, both nominally 48 px');
