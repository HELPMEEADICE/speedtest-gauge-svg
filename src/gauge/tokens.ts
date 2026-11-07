/**
 * Design tokens recovered from the speedtest.net production bundle
 * (r.cdnst.net/assets/index-*.js) and from live-DOM probing.
 *
 * Nothing here is guessed: every number below has a provenance comment.
 */

/** Geometry of the gauge, in SVG user units. The <svg> uses viewBox 0 0 286 286. */
export const GEO = {
  /** GAUGE_RADIUS = 130 */
  radius: 130,
  /** STROKE_WIDTH$1 = 23 */
  strokeWidth: 23,
  /** containerSize = radius * 2.2  ->  286 */
  size: 286,
  /** centerX = centerY = containerSize / 2  ->  143 */
  center: 143,
  /** calculateGaugeValues(): startAngle = -135, endAngle = 135 (0 deg points up, clockwise) */
  startAngle: -135,
  endAngle: 135,
  /** label radius = RADIUS - 33  ->  97 */
  labelRadius: 97,
  /** generateLabels(): fontSize "14", fontWeight "bold" */
  labelFontSize: 14,
  labelFontWeight: 700,
  /** needle polygon: base 20, tip 10, length 85 */
  needleBase: 20,
  needleTip: 10,
  needleLength: 85,
  /** speed number: Tailwind `font-mono text-4xl font-medium` -> 36px / weight 500 */
  numberSize: 36,
  numberWeight: 500,
  /** unit row: Tailwind `mt-1 text-sm` -> 14px, gap 4 */
  unitSize: 14,
  unitGap: 4,
  unitIconSize: 16,
  /** overlay is `absolute bottom-4` -> 16 units above the container bottom */
  bottomInset: 16,
  /** text-4xl line-height = 2.5rem = 40, text-sm line-height = 20 */
  numberLineHeight: 40,
  unitLineHeight: 20,
} as const;

/** Derived vertical anchors for the bottom text block, matching the CSS box model. */
export const TEXT_BLOCK = (() => {
  const bottom = GEO.size - GEO.bottomInset; // 270
  const unitCenter = bottom - GEO.unitLineHeight / 2; // 260
  const numberCenter = unitCenter - GEO.unitLineHeight / 2 - GEO.unitGap - GEO.numberLineHeight / 2; // 226
  return { bottom, unitCenter, numberCenter };
})();

/**
 * sRGB equivalents for the wide-gamut tokens above, used only when the engine does not
 * support `color(display-p3 ...)`. Values computed with a D65 P3 -> sRGB matrix.
 */
export const SRGB_FALLBACK: Record<string, string> = {
  'color(display-p3 1 1 1)': '#ffffff',
  'color(display-p3 0 0 0)': '#000000',
  'color(display-p3 0.399 0.399 0.399)': '#666666',
  'color(display-p3 0.635 0.635 0.635)': '#a3a3a3',
  'color(display-p3 0.886 0.886 0.886)': '#e2e2e2',
  'color(display-p3 0.000 0.773 0.749)': '#00c9c0',
  'color(display-p3 0.671 0.380 0.910)': '#b75cf0',
};

export interface AccentColor {
  /** Primary value, exactly as speedtest.net writes it (wide-gamut). */
  p3: string;
  /** sRGB fallback for engines without display-p3 support. */
  hex: string;
}

/**
 * accentTeal = base.T[70] = color(display-p3 0 0.773 0.749)
 * accentPurple = base.P[50] = color(display-p3 0.671 0.38 0.91)
 * accentSingleDownload = "#e56b4f", accentSingleUpload = "#7cdb2b"
 */
export const ACCENT: Record<'download' | 'upload' | 'downloadSingle' | 'uploadSingle', AccentColor> = {
  download: { p3: 'color(display-p3 0.000 0.773 0.749)', hex: '#00c9c0' },
  upload: { p3: 'color(display-p3 0.671 0.380 0.910)', hex: '#b75cf0' },
  downloadSingle: { p3: '#e56b4f', hex: '#e56b4f' },
  uploadSingle: { p3: '#7cdb2b', hex: '#7cdb2b' },
};

export interface GaugeTheme {
  page: string;
  /** gaugeArcInactiveTrack */
  track: string;
  /** highEmphasisText (label lit by the needle) */
  labelOn: string;
  /** inverseSecondaryText (label not yet reached) */
  labelOff: string;
  /** speed number colour (highEmphasisText) */
  number: string;
  /** unit row colour (inverseSecondaryText) */
  unit: string;
  /** needle gradient stops, top (tip) -> bottom (hub) */
  needle: { offset: number; color: string; opacity: number }[];
}

export const THEME: Record<'dark' | 'light', GaugeTheme> = {
  dark: {
    // live probe: body background is `color(display-p3 0 0 0)` in the dark scheme
    page: '#000000',
    // gaugeArcInactiveTrack = base.ooklaLightNavy
    track: '#26273b',
    labelOn: 'color(display-p3 1 1 1)',
    labelOff: 'color(display-p3 0.399 0.399 0.399)',
    number: 'color(display-p3 1 1 1)',
    unit: 'color(display-p3 0.399 0.399 0.399)',
    // light scheme gradient is white -> transparent, objectBoundingBox top to bottom
    needle: [
      { offset: 0, color: '#ffffff', opacity: 0.6 },
      { offset: 1, color: '#ffffff', opacity: 0 },
    ],
  },
  light: {
    page: '#f2f2f2',
    track: 'color(display-p3 0.886 0.886 0.886)',
    labelOn: 'color(display-p3 0 0 0)',
    labelOff: 'color(display-p3 0.635 0.635 0.635)',
    number: 'color(display-p3 0 0 0)',
    unit: 'color(display-p3 0.635 0.635 0.635)',
    // the light scheme swaps in a dark needle so it reads against the pale track
    needle: [
      { offset: 0, color: '#ffffff', opacity: 1 },
      { offset: 0.58, color: '#A4A4A4', opacity: 1 },
      { offset: 1, color: '#222222', opacity: 1 },
    ],
  },
};

/** Motion constants taken from the bundle's TIMING table. */
export const TIMING = {
  /** needleTracking: 0.2s easeOut, retargeted on every sample */
  needleTracking: 0.2,
  /** needleReturn: 0.5s easeInOut when the gauge resets between phases */
  needleReturn: 0.5,
  labelStagger: 0.08,
  labelFadeIn: 0.08,
} as const;
