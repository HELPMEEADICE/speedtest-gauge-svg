/**
 * Restore the third-party assets that are deliberately not committed.
 *
 * They live on speedtest.net's public CDN and are used here only as measurement
 * references — see .gitignore for why they are excluded from the repository.
 *
 *   node tools/fetch-assets.mjs
 *
 * Fetches:
 *   public/fonts/gaugemono.woff2        the gauge numeral face
 *   research/gauge-gradient-*.png       the 4 arc gradient rasters
 *
 * Without the font the gauge still renders; it just falls back to `ui-monospace`
 * and the numerals become slightly wider than the original.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const TARGETS = [
  {
    url: 'https://r.cdnst.net/assets/fonts/gaugemono-regular-webfont-DwJfUwLI.woff2',
    out: 'public/fonts/gaugemono.woff2',
  },
  {
    url: 'https://r.cdnst.net/assets/gauge-gradient-dl-multi-web-C__WQ3QL.png',
    out: 'research/gauge-gradient-dl-multi-web-C__WQ3QL.png',
  },
  {
    url: 'https://r.cdnst.net/assets/gauge-gradient-ul-multi-web-BaUcwGfE.png',
    out: 'research/gauge-gradient-ul-multi-web-BaUcwGfE.png',
  },
  {
    url: 'https://r.cdnst.net/assets/gauge-gradient-dl-single-web-BoyDl7Ow.png',
    out: 'research/gauge-gradient-dl-single-web-BoyDl7Ow.png',
  },
  {
    url: 'https://r.cdnst.net/assets/gauge-gradient-ul-single-web-CHz2mjhc.png',
    out: 'research/gauge-gradient-ul-single-web-CHz2mjhc.png',
  },
];

let failed = 0;
for (const { url, out } of TARGETS) {
  const dest = path.resolve(out);
  try {
    const existing = await fs.stat(dest).catch(() => null);
    if (existing?.size) {
      console.log(`skip   ${out} (${existing.size} B)`);
      continue;
    }
    const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://www.speedtest.net/' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buf);
    console.log(`ok     ${out} (${buf.length} B)`);
  } catch (err) {
    failed++;
    console.error(`FAILED ${out}: ${err.message}`);
  }
}

if (failed) {
  console.error(`\n${failed} asset(s) could not be fetched; the gauge still runs on fallbacks.`);
  process.exitCode = 1;
} else {
  console.log('\nall reference assets present');
}
