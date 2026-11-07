// Isolate the variable: compare this component's SVG number with plain HTML text using
// the identical font, size, colour and background, in the same browser engine.
import { chromium } from 'playwright';
import path from 'node:path';

const REP = path.resolve('report');
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://localhost:5178/?bare=1&static=155.61&stage=download', { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-ready="true"]');
await page.evaluate(() => document.fonts.ready);

// 36 svg units == 48 css px
await page.evaluate((s) => {
  document.getElementById('gauge-stage').style.width = `${s}px`;
}, (286 * 48) / 36);
await page.waitForTimeout(300);

const svgBox = await page.evaluate(() => {
  const r = document.querySelector('.gauge-number').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

// inject the HTML twin right next to it, same font / size / weight / colour
await page.evaluate(() => {
  const d = document.createElement('div');
  d.id = 'html-twin';
  d.textContent = '155.61';
  d.style.cssText =
    'position:fixed;left:40px;top:40px;color:#fff;background:#000;font-family:"Gauge Mono",monospace;' +
    'font-size:48px;font-weight:500;line-height:1;letter-spacing:0;padding:0;margin:0;white-space:pre;';
  document.body.appendChild(d);
});
await page.waitForTimeout(150);
const htmlBox = await page.evaluate(() => {
  const r = document.getElementById('html-twin').getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
});

await page.screenshot({ path: path.join(REP, 'number-svg.png'), clip: { x: svgBox.x, y: svgBox.y, width: svgBox.w, height: svgBox.h } });
await page.screenshot({ path: path.join(REP, 'number-html.png'), clip: { x: htmlBox.x, y: htmlBox.y, width: htmlBox.w, height: htmlBox.h } });
console.log('[svg ]', JSON.stringify(svgBox));
console.log('[html]', JSON.stringify(htmlBox));
await browser.close();
