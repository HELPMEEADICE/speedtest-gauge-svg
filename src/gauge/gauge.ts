/**
 * Gauge view.
 *
 * Rendering technology matches the original: hand-built SVG. The production gauge is
 * an <svg> holding a stroked 270 deg arc, a clipped gradient raster, a rotated needle
 * polygon and <text> labels — not a <canvas>, and definitely not a CSS ring.
 *
 * Everything lives in a 286 x 286 user-unit viewBox, so the whole instrument scales
 * proportionally at any CSS size and any devicePixelRatio. A steady-state frame only
 * writes three attributes (clip-path `d`, needle `transform`, number text), so there
 * is no layout thrash and no component re-render.
 */

import { ACCENT, GEO, SRGB_FALLBACK, TEXT_BLOCK, THEME, type GaugeTheme } from './tokens';
import { GRADIENT_STOPS, type GradientStop } from './gradient-stops';
import { arcPath, clamp, sectorPath } from './geometry';
import {
  angleForValue,
  formatSpeed,
  kbpsToMbps,
  LABELS_EXTENDED,
  LABELS_STANDARD,
  labelAngleAt,
} from './scale';
import { Clock, NeedleMotion, type NeedleConfig } from './animator';

const NS = 'http://www.w3.org/2000/svg';

export type Stage = 'idle' | 'ping' | 'download' | 'upload' | 'done';
export type ConnectionMode = 'multi' | 'single';
export type ScaleMode = 'fixed' | 'auto';
export type GradientVariant = 'dl-multi' | 'ul-multi' | 'dl-single' | 'ul-single';

export interface GaugeOptions {
  theme?: 'dark' | 'light';
  connectionMode?: ConnectionMode;
  scaleMode?: ScaleMode;
  motion?: Partial<NeedleConfig>;
  /** thin arcs used to reproduce the angular gradient (colour fidelity vs. node count) */
  ringSegments?: number;
}

const SUPPORTS_P3: boolean =
  typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('color', 'color(display-p3 0 0 0)');

function color(cssValue: string): string {
  return SUPPORTS_P3 ? cssValue : SRGB_FALLBACK[cssValue] ?? cssValue;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lerpHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return `rgb(${Math.round(ra[0] + (rb[0] - ra[0]) * t)},${Math.round(ra[1] + (rb[1] - ra[1]) * t)},${Math.round(
    ra[2] + (rb[2] - ra[2]) * t
  )})`;
}

function sampleStops(stops: GradientStop[], t: number): string {
  const x = clamp(t, 0, 1);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (x >= a.t && x <= b.t) {
      const span = b.t - a.t;
      return lerpHex(a.hex, b.hex, span === 0 ? 0 : (x - a.t) / span);
    }
  }
  return stops[stops.length - 1].hex;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

interface LabelNode {
  value: number;
  angle: number;
  text: SVGTextElement;
  on: boolean;
}

export class Gauge {
  readonly svg: SVGSVGElement;
  readonly motion: NeedleMotion;

  private readonly clock = new Clock();
  private readonly theme: GaugeTheme;
  private readonly ringSegments: number;
  private readonly clipId: string;
  private readonly needleGradId: string;

  private readonly ringGroup: SVGGElement;
  private readonly sweepPath: SVGPathElement;
  private readonly needle: SVGGElement;
  private readonly labelGroup: SVGGElement;
  private labelNodes: LabelNode[] = [];
  private readonly numberText: SVGTextElement;
  private readonly unitGroup: SVGGElement;
  private readonly iconDownload: SVGPathElement;
  private readonly iconUpload: SVGPathElement;

  private labels: readonly number[] = LABELS_STANDARD;
  private stage: Stage = 'idle';
  private connectionMode: ConnectionMode;
  private scaleMode: ScaleMode;
  private speedKbps = 0;
  private displayAngle: number = GEO.startAngle;
  private lastNumber = '';
  private lastVariant: GradientVariant | null = null;
  private lastPaintAngle = Number.NaN;
  private unitLaidOut = false;
  private disposed = false;

  constructor(container: HTMLElement, options: GaugeOptions = {}) {
    this.theme = THEME[options.theme ?? 'dark'];
    this.connectionMode = options.connectionMode ?? 'multi';
    this.scaleMode = options.scaleMode ?? 'fixed';
    this.ringSegments = options.ringSegments ?? 240;
    this.motion = new NeedleMotion(options.motion);

    const uid = Math.random().toString(36).slice(2, 8);
    this.clipId = `sweep-${uid}`;
    this.needleGradId = `needle-${uid}`;

    this.svg = el('svg', {
      viewBox: `0 0 ${GEO.size} ${GEO.size}`,
      width: GEO.size,
      height: GEO.size,
      role: 'img',
      'aria-label': 'Speedtest gauge',
    });
    this.svg.classList.add('gauge-svg');

    // ---------------------------------------------------------------- defs
    const defs = el('defs');
    const clip = el('clipPath', { id: this.clipId, clipPathUnits: 'userSpaceOnUse' });
    this.sweepPath = el('path', { d: '' });
    clip.appendChild(this.sweepPath);
    defs.appendChild(clip);

    const grad = el('linearGradient', {
      id: this.needleGradId,
      x1: '0',
      y1: '0',
      x2: '0',
      y2: '1',
      gradientUnits: 'objectBoundingBox',
    });
    for (const stop of this.theme.needle) {
      grad.appendChild(
        el('stop', {
          offset: `${stop.offset * 100}%`,
          'stop-color': stop.color,
          'stop-opacity': stop.opacity,
        })
      );
    }
    defs.appendChild(grad);
    this.svg.appendChild(defs);

    // -------------------------------------------------- inactive track arc
    this.svg.appendChild(
      el('path', {
        d: arcPath(GEO.center, GEO.center, GEO.radius, GEO.startAngle, GEO.endAngle),
        fill: 'none',
        stroke: color(this.theme.track),
        'stroke-width': GEO.strokeWidth,
        'stroke-linecap': 'butt',
      })
    );

    // -------------------------------------- angular gradient ring + sweep clip
    this.ringGroup = el('g', { 'clip-path': `url(#${this.clipId})` });
    this.svg.appendChild(this.ringGroup);

    // --------------------------------------------------------------- needle
    this.needle = el('g');
    const needlePath =
      `M ${GEO.center - GEO.needleBase / 2}, ${GEO.center} ` +
      `L ${GEO.center + GEO.needleBase / 2}, ${GEO.center} ` +
      `L ${GEO.center + GEO.needleTip / 2}, ${GEO.center - GEO.needleLength} ` +
      `L ${GEO.center - GEO.needleTip / 2}, ${GEO.center - GEO.needleLength} Z`;
    this.needle.appendChild(el('path', { d: needlePath, fill: `url(#${this.needleGradId})` }));
    this.svg.appendChild(this.needle);

    // --------------------------------------------------------------- labels
    this.labelGroup = el('g', { class: 'gauge-labels' });
    this.svg.appendChild(this.labelGroup);
    this.buildLabels();

    // --------------------------------------------------------- speed number
    this.numberText = el('text', {
      x: GEO.center,
      y: TEXT_BLOCK.numberCenter,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-size': GEO.numberSize,
      'font-weight': GEO.numberWeight,
      'font-family': "'Gauge Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fill: color(this.theme.number),
    });
    this.numberText.classList.add('gauge-number');
    this.numberText.textContent = '0.00';
    this.svg.appendChild(this.numberText);

    // ------------------------------------- unit row: 16px icon + 4px + "Mbps"
    this.unitGroup = el('g', { class: 'gauge-unit' });
    const iconHolder = el('g', { transform: 'translate(0, -8)' });
    this.iconDownload = el('path', {
      d: 'M6.6 0.6h2.8v6.2h3.1L8 12.4 3.5 6.8h3.1z',
      fill: color(ACCENT.download.p3),
    });
    this.iconUpload = el('path', {
      d: 'M6.6 15.4h2.8V9.2h3.1L8 3.6 3.5 9.2h3.1z',
      fill: color(ACCENT.upload.p3),
      display: 'none',
    });
    iconHolder.append(this.iconDownload, this.iconUpload);
    const unitText = el('text', {
      x: GEO.unitIconSize + GEO.unitGap,
      y: 0,
      'dominant-baseline': 'central',
      'font-size': GEO.unitSize,
      'font-family': "Montserrat, 'Segoe UI', system-ui, sans-serif",
      fill: color(this.theme.unit),
    });
    unitText.textContent = 'Mbps';
    this.unitGroup.append(iconHolder, unitText);
    this.unitGroup.setAttribute('transform', `translate(${GEO.center}, ${TEXT_BLOCK.unitCenter})`);
    this.svg.appendChild(this.unitGroup);

    container.appendChild(this.svg);
    this.renderVariant(this.currentVariant());
    this.paint(GEO.startAngle);

    // Web-font metrics change the unit row width; re-centre once they arrive.
    void document.fonts?.ready.then(() => {
      if (!this.disposed) this.layoutUnit();
    });

    this.clock.add((dt) => this.frame(dt));
  }

  // --------------------------------------------------------------- public API

  /** Push a live sample in kilobits per second (the same unit the production feed uses). */
  setSpeed(kbps: number): void {
    const safe = Number.isFinite(kbps) && kbps > 0 ? kbps : 0;
    this.speedKbps = safe;
    const mbps = kbpsToMbps(safe);

    if (this.scaleMode === 'auto') {
      this.applyLabels(mbps > LABELS_STANDARD[LABELS_STANDARD.length - 1] ? LABELS_EXTENDED : LABELS_STANDARD);
    }
    this.motion.setTarget(angleForValue(this.labels, mbps));
    this.updateNumber(safe);
  }

  /** Freeze the needle at an exact value with no animation (screenshot calibration). */
  snapTo(kbps: number): void {
    this.speedKbps = Number.isFinite(kbps) && kbps > 0 ? kbps : 0;
    const mbps = kbpsToMbps(this.speedKbps);
    if (this.scaleMode === 'auto') {
      this.applyLabels(mbps > LABELS_STANDARD[LABELS_STANDARD.length - 1] ? LABELS_EXTENDED : LABELS_STANDARD);
    }
    const angle = angleForValue(this.labels, mbps);
    this.motion.setTarget(angle, { snap: true });
    this.displayAngle = angle;
    this.paint(angle);
    this.updateNumber(this.speedKbps);
  }

  setStage(stage: Stage): void {
    if (this.stage === stage) return;
    this.stage = stage;
    this.renderVariant(this.currentVariant());

    const uploading = stage === 'upload';
    this.iconDownload.setAttribute('display', uploading ? 'none' : '');
    this.iconUpload.setAttribute('display', uploading ? '' : 'none');
    const accent = this.currentAccent();
    this.iconDownload.setAttribute('fill', color(accent.p3));
    this.iconUpload.setAttribute('fill', color(accent.p3));

    // A phase change parks the needle back at the start angle (TIMING.needleReturn) and
    // blanks the readout, exactly like the production gauge does between download and
    // upload. 'done' is excluded: there the needle keeps pointing at the final result.
    if (stage === 'upload' || stage === 'idle') {
      this.motion.reset();
      this.updateNumber(0);
    }
  }

  getStage(): Stage {
    return this.stage;
  }

  get angle(): number {
    return this.displayAngle;
  }

  setConnectionMode(mode: ConnectionMode): void {
    if (this.connectionMode === mode) return;
    this.connectionMode = mode;
    this.renderVariant(this.currentVariant());
    const accent = this.currentAccent();
    this.iconDownload.setAttribute('fill', color(accent.p3));
    this.iconUpload.setAttribute('fill', color(accent.p3));
  }

  setScaleMode(mode: ScaleMode): void {
    if (this.scaleMode === mode) return;
    this.scaleMode = mode;
    this.applyLabels(
      mode === 'auto' && this.speedKbps / 1000 > LABELS_STANDARD[LABELS_STANDARD.length - 1]
        ? LABELS_EXTENDED
        : LABELS_STANDARD
    );
  }

  reset(): void {
    this.speedKbps = 0;
    this.motion.reset();
    this.updateNumber(0);
  }

  destroy(): void {
    this.disposed = true;
    this.svg.remove();
  }

  // ---------------------------------------------------------------- internals

  private currentVariant(): GradientVariant {
    const upload = this.stage === 'upload';
    if (this.connectionMode === 'single') return upload ? 'ul-single' : 'dl-single';
    return upload ? 'ul-multi' : 'dl-multi';
  }

  private currentAccent() {
    if (this.connectionMode === 'single') {
      return this.stage === 'upload' ? ACCENT.uploadSingle : ACCENT.downloadSingle;
    }
    return this.stage === 'upload' ? ACCENT.upload : ACCENT.download;
  }

  private renderVariant(variant: GradientVariant): void {
    if (this.lastVariant === variant && this.ringGroup.childNodes.length > 0) return;
    this.lastVariant = variant;
    const stops = GRADIENT_STOPS[variant];
    const frag = document.createDocumentFragment();
    const span = GEO.endAngle - GEO.startAngle;
    const overlap = 0.28; // hides hairline seams between butt-capped segments
    const n = this.ringSegments;
    for (let i = 0; i < n; i++) {
      const a0 = GEO.startAngle + (span * i) / n;
      const a1 = Math.min(GEO.endAngle, GEO.startAngle + (span * (i + 1)) / n + overlap);
      frag.appendChild(
        el('path', {
          d: arcPath(GEO.center, GEO.center, GEO.radius, a0, a1),
          fill: 'none',
          stroke: sampleStops(stops, (i + 0.5) / n),
          'stroke-width': GEO.strokeWidth,
          'stroke-linecap': 'butt',
        })
      );
    }
    this.ringGroup.replaceChildren(frag);
  }

  private buildLabels(): void {
    this.labelGroup.replaceChildren();
    const next: LabelNode[] = [];
    this.labels.forEach((value, index) => {
      const angle = labelAngleAt(index, this.labels.length);
      const rad = ((angle - 90) * Math.PI) / 180;
      const text = el('text', {
        x: GEO.center + GEO.labelRadius * Math.cos(rad),
        y: GEO.center + GEO.labelRadius * Math.sin(rad),
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        'font-size': GEO.labelFontSize,
        'font-weight': GEO.labelFontWeight,
        'font-family': "Montserrat, 'Segoe UI', system-ui, sans-serif",
        fill: color(this.theme.labelOff),
      });
      text.textContent = String(value);
      this.labelGroup.appendChild(text);
      next.push({ value, angle, text, on: false });
    });
    this.labelNodes = next;
    this.lastPaintAngle = Number.NaN;
  }

  private applyLabels(next: readonly number[]): void {
    if (next === this.labels) return;
    this.labels = next;
    this.buildLabels();
  }

  private updateNumber(kbps: number): void {
    const text = formatSpeed(kbps);
    if (text === this.lastNumber) return;
    this.lastNumber = text;
    this.numberText.textContent = text;
  }

  private updateLabels(angle: number): void {
    for (const node of this.labelNodes) {
      const on = node.value === 0 ? angle > node.angle : angle >= node.angle;
      if (on === node.on) continue;
      node.on = on;
      node.text.setAttribute('fill', color(on ? this.theme.labelOn : this.theme.labelOff));
    }
  }

  private layoutUnit(): void {
    const bbox = this.unitGroup.getBBox();
    const x = GEO.center - (bbox.x + bbox.width / 2);
    this.unitGroup.setAttribute('transform', `translate(${x.toFixed(2)}, ${TEXT_BLOCK.unitCenter})`);
    this.unitLaidOut = true;
  }

  /** Paint one frame: sweep clip, needle rotation, label emphasis. */
  private paint(angle: number): void {
    const arcAngle = clamp(angle, GEO.startAngle, GEO.endAngle);
    const sweep = arcAngle - GEO.startAngle;
    if (sweep < 0.05) {
      this.sweepPath.setAttribute('d', '');
      this.ringGroup.style.display = 'none';
    } else {
      if (this.ringGroup.style.display === 'none') this.ringGroup.style.display = '';
      this.sweepPath.setAttribute(
        'd',
        sectorPath(GEO.center, GEO.center, GEO.radius + GEO.strokeWidth / 2, GEO.startAngle, arcAngle)
      );
    }
    this.needle.setAttribute('transform', `rotate(${angle.toFixed(3)} ${GEO.center} ${GEO.center})`);
    if (!this.unitLaidOut) this.layoutUnit();
    if (!(Math.abs(this.lastPaintAngle - arcAngle) < 0.02)) {
      this.lastPaintAngle = arcAngle;
      this.updateLabels(arcAngle);
    }
  }

  private frame(dt: number): void {
    const angle = this.motion.step(dt);
    this.displayAngle = angle;
    this.paint(angle);
  }
}
