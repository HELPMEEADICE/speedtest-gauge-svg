/**
 * Value -> angle mapping.
 *
 * speedtest.net does NOT use a linear scale. The shipped code is:
 *
 *   determineLabelAngle = (labels, v) =>
 *     labels.findIndex(x => x >= v) / (labels.length - 1) * (endAngle - startAngle) + startAngle
 *
 *   determineNeedleAngle = (labels, v) => {
 *     const i = labels.findIndex(x => x >= v);
 *     if (i === -1) return determineLabelAngle(labels, labels.at(-1));
 *     if (v === labels[i]) return determineLabelAngle(labels, labels[i]);
 *     const prev = i === 0 ? 0 : i - 1;
 *     const t = (v - labels[prev]) / (labels[i] - labels[prev]);
 *     return angle(prev) + t * (angle(i) - angle(prev));
 *   };
 *
 * So tick marks sit at *equal angular intervals* (270 deg / (n - 1)), and the needle
 * interpolates linearly inside whichever value band it currently occupies. That is why
 * 0..100 Mbps occupies the same sweep as 250..1000 Mbps.
 */

import { GEO } from './tokens';

/** GAUGE_LABEL_VALUES in the bundle. */
export const LABELS_STANDARD: readonly number[] = [0, 5, 10, 50, 100, 250, 500, 750, 1000];

/**
 * Extension used only when a sample exceeds the shipped 1000 Mbps ceiling and the caller
 * opts into `scaleMode: 'auto'`. The live gauge does not switch scales — it clamps at the
 * last label — so this ladder is an addition, kept to 10 ticks (30 deg apart) so the
 * labels keep the same clearance as the shipped 9-tick set.
 */
export const LABELS_EXTENDED: readonly number[] = [0, 10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

export function labelAngleAt(index: number, count: number): number {
  if (count < 2) return GEO.startAngle;
  return (index / (count - 1)) * (GEO.endAngle - GEO.startAngle) + GEO.startAngle;
}

/** Angle in degrees (-135 .. 135) for a speed given in Mbps. */
export function angleForValue(labels: readonly number[], mbps: number): number {
  const n = labels.length;
  if (n === 0) return GEO.startAngle;
  if (!Number.isFinite(mbps) || mbps <= labels[0]) return labelAngleAt(0, n);

  const idx = labels.findIndex((x) => x >= mbps);
  if (idx === -1) return labelAngleAt(n - 1, n); // beyond the last label: clamp
  if (mbps === labels[idx]) return labelAngleAt(idx, n);

  const i0 = idx === 0 ? 0 : idx - 1;
  const lo = labels[i0];
  const hi = labels[idx];
  const span = hi - lo;
  const t = span === 0 ? 0 : (mbps - lo) / span;
  return labelAngleAt(i0, n) + t * (labelAngleAt(idx, n) - labelAngleAt(i0, n));
}

/** Mbps value the needle points at for a given angle (inverse of angleForValue). */
export function valueForAngle(labels: readonly number[], angle: number): number {
  const n = labels.length;
  if (n < 2) return 0;
  const clamped = Math.min(GEO.endAngle, Math.max(GEO.startAngle, angle));
  const step = (GEO.endAngle - GEO.startAngle) / (n - 1);
  const idx = Math.min(n - 2, Math.max(0, Math.floor((clamped - GEO.startAngle) / step)));
  const t = (clamped - labelAngleAt(idx, n)) / step;
  return labels[idx] + t * (labels[idx + 1] - labels[idx]);
}

const MBPS_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** speedLocalized(): always two fraction digits, en-US grouping. */
export function formatSpeed(kbps: number): string {
  if (!Number.isFinite(kbps) || kbps < 0) return '—';
  if (kbps === 0) return MBPS_FORMAT.format(0);
  return MBPS_FORMAT.format(kbps / 1000);
}

export function kbpsToMbps(kbps: number): number {
  return parseFloat((kbps / 1000).toFixed(2));
}
