// Read the real dark-scheme computed colors from the live page (no speed test).
import { chromium } from 'playwright';
import fs from 'node:fs';

const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();
await page.goto('https://www.speedtest.net/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);

const read = () =>
  page.evaluate(() => {
    const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
    const probe = [...document.querySelectorAll('div,section,main')]
      .map((e) => ({ e, cs: getComputedStyle(e) }))
      .filter(({ e, cs }) => {
        const r = e.getBoundingClientRect();
        return r.width > 900 && r.height > 400 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
      })
      .slice(0, 5)
      .map(({ e, cs }) => ({ cls: String(e.className).slice(0, 60), bg: cs.backgroundColor, color: cs.color }));
    return {
      schemeAttr: document.documentElement.getAttribute('data-mui-color-scheme'),
      dataTheme: document.documentElement.getAttribute('data-theme'),
      bodyBg: bg(document.body),
      htmlBg: bg(document.documentElement),
      bodyColor: getComputedStyle(document.body).color,
      largeBlocks: probe,
      numColor: (() => {
        const n = [...document.querySelectorAll('*')].find(
          (e) => e.children.length === 0 && /Gauge|mono/i.test(getComputedStyle(e).fontFamily)
        );
        return n ? { ff: getComputedStyle(n).fontFamily, fs: getComputedStyle(n).fontSize, c: getComputedStyle(n).color } : null;
      })(),
    };
  });

const before = await read();
console.log('[light]', JSON.stringify(before, null, 1));

// click the theme toggle in the header
let toggled = false;
for (const sel of [
  'button[aria-label*="dark" i]',
  'button[aria-label*="theme" i]',
  'button[aria-label*="color" i]',
  '[data-testid="theme-toggle"]',
  'header button:has(svg)',
]) {
  try {
    const b = page.locator(sel).first();
    if (await b.count()) {
      await b.click({ timeout: 3000 });
      toggled = true;
      console.log('[probe] clicked', sel);
      break;
    }
  } catch {}
}
await page.waitForTimeout(2500);
const after = await read();
console.log('[after-toggle]', JSON.stringify(after, null, 1));

// force dark attribute as a fallback and re-read
if (!/dark/.test(String(after.schemeAttr))) {
  await page.evaluate(() => {
    const el = document.documentElement;
    el.setAttribute('data-mui-color-scheme', 'dark');
    el.setAttribute('data-color-scheme', 'dark');
    el.style.colorScheme = 'dark';
  });
  await page.waitForTimeout(1200);
  console.log('[forced]', JSON.stringify(await read(), null, 1));
}

await page.screenshot({ path: 'research/shots/ref-dark-viewport.png' });
fs.writeFileSync('research/dark-theme.json', JSON.stringify({ before, after }, null, 2));
await browser.close();
console.log('[probe] done (no test started)');
