/**
 * CI smoke test — asserts the rendered instrument against the spec taken from the
 * speedtest.net bundle, not against this implementation's own constants.
 *
 *   node tools/ci-smoke.mjs [baseUrl]
 *
 * Exits non-zero on the first failed assertion so the workflow reports it clearly.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173/';
const SHOTS = path.resolve('shots');

let failures = 0;
const ok = (name, detail = '') => console.log(`  PASS  ${name}${detail ? ` (${detail})` : ''}`);
const bad = (name, detail) => {
  failures++;
  console.error(`  FAIL  ${name} -> ${detail}`);
};
const eq = (name, actual, expected, tol = 0) => {
  const a = typeof actual === 'number' ? actual : actual;
  const pass =
    typeof expected === 'number' && typeof a === 'number'
      ? Math.abs(a - expected) <= tol
      : a === expected;
  if (pass) ok(name, `${a}`);
  else bad(name, `expected ${expected}, got ${a}`);
};

// ---------------------------------------------------------------- the spec
/** Tick table and the exact mapping shipped by the production gauge. */
const LABELS = [0, 5, 10, 50, 100, 250, 500, 750, 1000];
const START = -135;
const END = 135;

const labelAngle = (i) => (i / (LABELS.length - 1)) * (END - START) + START;
const angleFor = (v) => {
  const i = LABELS.findIndex((x) => x >= v);
  if (i === -1) return labelAngle(LABELS.length - 1);
  if (v === LABELS[i]) return labelAngle(i);
  const p = i === 0 ? 0 : i - 1;
  const t = (v - LABELS[p]) / (LABELS[i] - LABELS[p]);
  return labelAngle(p) + t * (labelAngle(i) - labelAngle(p));
};
const fmt = (kbps) =>
  (kbps / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log('[smoke] base =', BASE);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});

// ------------------------------------------------------------ absolute anchors
console.log('[smoke] hard anchors');
eq('0 Mbps -> start angle', angleFor(0), -135);
eq('100 Mbps -> top', angleFor(100), 0);
eq('1000 Mbps -> end angle', angleFor(1000), 135);
eq('100 Mbps sits halfway', angleFor(100), START + (END - START) / 2);

// --------------------------------------------------------------- page render
console.log('[smoke] render');
await page.goto(`${BASE}?bare=1&static=0&stage=idle`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForSelector('body[data-ready="true"]', { timeout: 30000 });
await page.evaluate(() => document.fonts.ready);

const svg = await page.evaluate(() => {
  const s = document.querySelector('svg.gauge-svg');
  if (!s) return null;
  return {
    viewBox: s.getAttribute('viewBox'),
    labels: [...s.querySelectorAll('.gauge-labels text')].map((t) => t.textContent),
    number: s.querySelector('.gauge-number')?.textContent,
    track: s.querySelectorAll(':scope > path')[0]?.getAttribute('d'),
    segments: s.querySelectorAll('g[clip-path] path').length,
    unit: s.querySelector('.gauge-unit')?.textContent,
  };
});

if (!svg) {
  bad('svg.gauge-svg present', 'element missing');
} else {
  eq('viewBox', svg.viewBox, '0 0 286 286');
  eq('tick count', svg.labels.length, LABELS.length);
  eq('tick values', svg.labels.join(','), LABELS.join(','));
  eq('idle readout', svg.number, '0.00');
  eq(
    'track arc path',
    svg.track,
    'M 51.076 234.924 A 130 130 0 1 1 234.924 234.924'
  );
  eq('gradient ring built', svg.segments > 100, true, 0);
  eq('unit label', svg.unit, 'Mbps');
}

// ------------------------------------------------- needle position per value
console.log('[smoke] needle mapping');
for (const mbps of [0, 8, 100, 155.61, 862, 1000]) {
  await page.goto(`${BASE}?bare=1&static=${mbps}&stage=download`, { waitUntil: 'networkidle' });
  await page.waitForSelector('body[data-ready="true"]');
  const state = await page.evaluate(() => {
    const s = document.querySelector('svg.gauge-svg');
    const t = s.querySelector('g[transform^="rotate"]').getAttribute('transform');
    return {
      angle: Number(t.match(/rotate\(([-\d.]+)/)[1]),
      number: s.querySelector('.gauge-number').textContent,
      lit: [...s.querySelectorAll('.gauge-labels text')].filter(
        (n) => !/0\.399/.test(n.getAttribute('fill') ?? '')
      ).length,
    };
  });
  eq(`needle @ ${mbps} Mbps`, state.angle, angleFor(mbps), 0.6);
  eq(`readout @ ${mbps} Mbps`, state.number, fmt(mbps * 1000));
  const expectedLit = LABELS.filter((v) => (v === 0 ? angleFor(mbps) > labelAngle(0) + 1e-9 : angleFor(mbps) >= labelAngle(LABELS.indexOf(v)))).length;
  eq(`lit ticks @ ${mbps} Mbps`, state.lit, expectedLit);
}

// ------------------------------------------------------------ interactive run
console.log('[smoke] animation');
await page.goto(`${BASE}?bare=1&autoplay=1&seed=3`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body[data-ready="true"]');
await page.waitForTimeout(2500);

const frames = [];
for (let i = 0; i < 20; i++) {
  frames.push(
    await page.evaluate(() => {
      const s = document.querySelector('svg.gauge-svg');
      const t = s.querySelector('g[transform^="rotate"]').getAttribute('transform');
      return Number(t.match(/rotate\(([-\d.]+)/)[1]);
    })
  );
  await page.waitForTimeout(50);
}
const moved = new Set(frames).size;
eq('needle is animating', moved > 3, true);
eq(
  'needle stays in range',
  frames.every((a) => a >= -137 && a <= 137),
  true
);

eq('no console errors', consoleErrors.length, 0);
if (consoleErrors.length) console.error('    ', consoleErrors.slice(0, 3));

// keep one frame around for CI artifact debugging
await fs.mkdir(SHOTS, { recursive: true });
await page.screenshot({ path: path.join(SHOTS, 'ci-smoke.png') });

await browser.close();

if (failures) {
  console.error(`\n[smoke] ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('\n[smoke] all assertions passed');
