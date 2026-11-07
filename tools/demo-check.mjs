// End-to-end demo run: verify the stage machine, needle return and number sync.
import { chromium } from 'playwright';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:5178/?bare=1&autoplay=1&seed=11', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body[data-ready="true"]');

const rows = [];
const t0 = Date.now();
while (Date.now() - t0 < 17000) {
  const s = await page.evaluate(() => {
    const g = window.speedGauge.gauge;
    const t = document.querySelector('svg.gauge-svg g[transform^="rotate"]').getAttribute('transform');
    return {
      stage: g.getStage(),
      angle: Number(t.match(/rotate\(([-\d.]+)/)[1]),
      num: document.querySelector('.gauge-number').textContent,
      filled: document.querySelector('svg.gauge-svg g[clip-path]').style.display !== 'none',
    };
  });
  rows.push({ t: Date.now() - t0, ...s });
  await page.waitForTimeout(200);
}

// stage timeline
const changes = [];
let prev = null;
for (const r of rows) {
  if (r.stage !== prev) {
    changes.push(`${(r.t / 1000).toFixed(1)}s -> ${r.stage}  angle=${r.angle.toFixed(1)}  num="${r.num}"`);
    prev = r.stage;
  }
}
console.log('stage timeline:');
changes.forEach((c) => console.log('  ' + c));

const angles = rows.map((r) => r.angle);
console.log(`angle range ${Math.min(...angles).toFixed(1)} .. ${Math.max(...angles).toFixed(1)}`);
// did the needle park back at -135 between phases?
const parked = rows.filter((r) => Math.abs(r.angle - -135) < 0.6).length;
console.log(`frames parked at start angle: ${parked}`);
// sync: while the needle is off zero the number must be non-"0.00"
const bad = rows.filter((r) => r.angle > -120 && r.num === '0.00' && r.stage !== 'upload' && r.stage !== 'done');
console.log(`frames with number desync: ${bad.length}`);
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
