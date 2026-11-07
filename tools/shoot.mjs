// Capture deterministic gauge states at DPR 2 for calibration.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('shots');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE_URL ?? 'http://localhost:5178/';

const STATES = [
  { id: 'idle', q: 'static=0&stage=idle' },
  { id: 'low', q: 'static=8&stage=download' },
  { id: 'mid', q: 'static=150&stage=download' },
  { id: 'high', q: 'static=862&stage=download' },
  { id: 'upload', q: 'static=341&stage=upload' },
  { id: 'done', q: 'static=862&stage=done' },
  { id: 'gigabit', q: 'static=1000&stage=download' },
  { id: 'extended', q: 'static=4200&stage=download&scale=auto' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

for (const state of STATES) {
  await page.goto(`${BASE}?bare=1&${state.q}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]', { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const el = await page.$('#gauge-stage');
  const box = await el.boundingBox();
  const pad = 8;
  await page.screenshot({
    path: path.join(OUT, `${state.id}.png`),
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
  console.log(`[shot] ${state.id} ${state.q} box=${Math.round(box.width)}x${Math.round(box.height)}`);
}

// animated run: sample frames of a live demo to check motion continuity
await page.goto(`${BASE}?bare=1&autoplay=1&seed=7`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body[data-ready="true"]');
await page.waitForTimeout(500);
const trace = [];
const t0 = Date.now();
for (let i = 0; i < 90; i++) {
  const s = await page.evaluate(() => {
    const svg = document.querySelector('svg.gauge-svg');
    const needle = svg?.querySelector('g[transform^="rotate"]');
    const num = svg?.querySelector('.gauge-number');
    const t = needle?.getAttribute('transform') ?? '';
    const m = t.match(/rotate\(([-\d.]+)/);
    return { a: m ? Number(m[1]) : null, n: num?.textContent ?? '' };
  });
  trace.push({ t: Date.now() - t0, ...s });
  await page.waitForTimeout(50);
}
fs.writeFileSync(path.join(OUT, 'motion-trace.json'), JSON.stringify(trace, null, 1));
const angles = trace.map((r) => r.a).filter((v) => v !== null);
let maxJump = 0;
for (let i = 1; i < angles.length; i++) maxJump = Math.max(maxJump, Math.abs(angles[i] - angles[i - 1]));
console.log(`[motion] samples=${angles.length} range=${Math.min(...angles).toFixed(1)}..${Math.max(...angles).toFixed(1)} maxStep=${maxJump.toFixed(2)}deg`);

await page.screenshot({ path: path.join(OUT, 'animation-frame.png') });
console.log('[errors]', errors.length ? errors.slice(0, 6) : 'none');
await browser.close();
