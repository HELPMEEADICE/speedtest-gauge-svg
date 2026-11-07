/** Small SVG geometry helpers, mirroring the polar helpers in the original bundle. */

export interface Point {
  x: number;
  y: number;
}

const r3 = (v: number): string => (Math.round(v * 1000) / 1000).toString();

/** angle 0 deg = straight up, positive = clockwise (identical to the bundle's helper). */
export function polar(cx: number, cy: number, radius: number, angleDeg: number): Point {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

/** Open arc stroke path (describeArc). */
export function arcPath(cx: number, cy: number, radius: number, a0: number, a1: number): string {
  const p0 = polar(cx, cy, radius, a0);
  const p1 = polar(cx, cy, radius, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${r3(p0.x)} ${r3(p0.y)} A ${r3(radius)} ${r3(radius)} 0 ${large} 1 ${r3(p1.x)} ${r3(p1.y)}`;
}

/** Wedge from the centre out to `radius` (describeSector) — used as the sweep clip. */
export function sectorPath(cx: number, cy: number, radius: number, a0: number, a1: number): string {
  const p0 = polar(cx, cy, radius, a0);
  const p1 = polar(cx, cy, radius, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return [
    `M ${r3(cx)} ${r3(cy)}`,
    `L ${r3(p0.x)} ${r3(p0.y)}`,
    `A ${r3(radius)} ${r3(radius)} 0 ${large} 1 ${r3(p1.x)} ${r3(p1.y)}`,
    'Z',
  ].join(' ');
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
