/**
 * Motion engine: one requestAnimationFrame clock, one needle integrator.
 *
 * Two tracking models are available:
 *
 *  • 'tween'  — byte-for-byte the behaviour of the production gauge: every incoming
 *               sample restarts a 200 ms cubic easeOut tween from the current angle
 *               (TIMING.needleTracking), and phase changes run a 500 ms easeInOut
 *               return to the start angle (TIMING.needleReturn).
 *
 *  • 'spring' — default. A damped spring with its natural frequency tuned so a step
 *               response settles in ~200 ms, matching the tween's perceived timing
 *               while giving continuous velocity (no acceleration discontinuity at
 *               each retarget). Damping ratio slightly under 1 leaves the tiny
 *               overshoot real gauges show.
 *
 * A velocity-driven micro-wobble is layered on top of both models.
 */

import { GEO, TIMING } from './tokens';
import { clamp } from './geometry';

export type Easing = (t: number) => number;

/** Standard CSS/framer cubic-bezier evaluator. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleX = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number): number => ((ay * t + by) * t + cy) * t;
  const sampleDX = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;

  const solveX = (x: number): number => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = sampleDX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };

  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveX(x));
  };
}

/** framer-motion's named easings, which the production gauge relies on. */
export const EASE_OUT = cubicBezier(0, 0, 0.58, 1);
export const EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1);

export interface NeedleConfig {
  mode: 'spring' | 'tween';
  /** spring natural frequency (rad/s); 21.4 settles in ~0.2 s */
  omega: number;
  /** damping ratio; 1 = critical, < 1 overshoots slightly */
  zeta: number;
  /** wobble frequency in Hz */
  wobbleHz: number;
  /** wobble amplitude ceiling in degrees */
  wobbleMax: number;
  /** degrees of wobble per deg/s of needle slew */
  wobbleGain: number;
}

export const DEFAULT_NEEDLE_CONFIG: NeedleConfig = {
  mode: 'spring',
  omega: 21.4,
  zeta: 0.92,
  wobbleHz: 6.5,
  wobbleMax: 1.1,
  wobbleGain: 0.0032,
};

interface Tween {
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  ease: Easing;
}

export class NeedleMotion {
  angle: number = GEO.startAngle;
  velocity: number = 0;
  target: number = GEO.startAngle;
  config: NeedleConfig;

  private tween: Tween | null = null;
  private wobbleAmp = 0;
  private wobblePhase = 0;

  constructor(config: Partial<NeedleConfig> = {}) {
    this.config = { ...DEFAULT_NEEDLE_CONFIG, ...config };
  }

  /** Point the needle at `angle`. */
  setTarget(angle: number, opts: { snap?: boolean; duration?: number; ease?: Easing } = {}): void {
    this.target = clamp(angle, GEO.startAngle, GEO.endAngle);
    if (opts.snap) {
      this.angle = this.target;
      this.velocity = 0;
      this.tween = null;
      this.wobbleAmp = 0;
        return;
    }
    if (this.config.mode === 'tween') {
      this.tween = {
        from: this.angle,
        to: this.target,
        elapsed: 0,
        duration: opts.duration ?? TIMING.needleTracking,
        ease: opts.ease ?? EASE_OUT,
      };
    }
  }

  /** Smooth return to the start angle (guage reset between phases). */
  reset(duration = TIMING.needleReturn): void {
    this.target = GEO.startAngle;
    this.tween = { from: this.angle, to: GEO.startAngle, elapsed: 0, duration, ease: EASE_IN_OUT };
    if (this.config.mode === 'spring') {
      // honour the explicit duration in spring mode too
      this.springResetTween = this.tween;
    }
  }

  private springResetTween: Tween | null = null;

  get isSettled(): boolean {
    return Math.abs(this.angle - this.target) < 0.02 && Math.abs(this.velocity) < 0.5;
  }

  /** Advance the integrator. Returns the painted angle including micro-wobble. */
  step(dt: number): number {
    if (this.config.mode === 'tween' || this.springResetTween) {
      const tw = this.springResetTween ?? this.tween;
      if (tw) {
        tw.elapsed += dt;
        const raw = tw.duration <= 0 ? 1 : Math.min(1, tw.elapsed / tw.duration);
        const next = tw.from + (tw.to - tw.from) * tw.ease(raw);
        this.velocity = (next - this.angle) / Math.max(dt, 1e-4);
        this.angle = next;
        if (raw >= 1) {
          if (tw === this.springResetTween) {
            this.springResetTween = null;
            this.velocity = 0;
          }
          this.tween = null;
        }
      }
    } else {
      // damped spring, sub-stepped for stability
      const { omega, zeta } = this.config;
      const k = omega * omega;
      const c = 2 * zeta * omega;
      const steps = Math.max(1, Math.ceil(dt / (1 / 480)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const a = k * (this.target - this.angle) - c * this.velocity;
        this.velocity += a * h;
        this.angle += this.velocity * h;
      }
    }

    // micro-wobble: amplitude follows needle slew, so it only shows up on hard changes
    const cfg = this.config;
    const slew = Math.abs(this.velocity);
    const ampTarget = Math.min(cfg.wobbleMax, slew * cfg.wobbleGain);
    this.wobbleAmp += (ampTarget - this.wobbleAmp) * Math.min(1, dt / 0.09);
    this.wobblePhase += dt * cfg.wobbleHz * Math.PI * 2;
    const wobble = Math.sin(this.wobblePhase) * this.wobbleAmp;

    return clamp(this.angle + wobble, GEO.startAngle - 2, GEO.endAngle + 2);
  }
}

/** Single shared RAF clock; subscribers get a clamped delta in seconds. */
export class Clock {
  private handle = 0;
  private last = 0;
  private readonly subs = new Set<(dt: number) => void>();
  private running = false;

  add(fn: (dt: number) => void): () => void {
    this.subs.add(fn);
    this.start();
    return () => {
      this.subs.delete(fn);
      if (this.subs.size === 0) this.stop();
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      for (const fn of this.subs) fn(dt);
      this.handle = requestAnimationFrame(tick);
    };
    this.handle = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }
}
