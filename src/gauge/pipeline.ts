/**
 * Data layer. Completely decoupled from drawing: the gauge only ever receives
 * `setSpeed(kbps)` + `setStage(stage)` calls, so a real measurement engine, a
 * WebSocket feed or the built-in demo all drive it through one interface.
 */

import type { Stage } from './gauge';

export interface SpeedSample {
  /** kilobits per second — same unit the production feed uses */
  kbps: number;
  stage: Stage;
}

export type SampleListener = (sample: SpeedSample) => void;

export interface SpeedSource {
  readonly name: string;
  start(listener: SampleListener): void;
  stop(): void;
}

/** Deterministic PRNG so demo runs are reproducible for screenshot diffing. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoOptions {
  /** peak download in Mbps */
  downloadPeak?: number;
  /** peak upload in Mbps */
  uploadPeak?: number;
  seed?: number;
  /** how long the holding plateau lasts, in ms */
  holdMs?: number;
  onPhase?: (stage: Stage) => void;
  onDone?: () => void;
}

/**
 * Demo source: reproduces the shape of a real Speedtest run — a short idle/latency
 * beat, a fast noisy ramp, a jittery plateau, a needle reset, then the same for upload.
 */
export class DemoSource implements SpeedSource {
  readonly name = 'demo';
  private timer = 0;
  private stopped = true;

  constructor(private readonly opts: DemoOptions = {}) {}

  start(listener: SampleListener): void {
    this.stop();
    this.stopped = false;
    const dl = this.opts.downloadPeak ?? 862;
    const ul = this.opts.uploadPeak ?? 341;
    const holdMs = this.opts.holdMs ?? 4200;
    const rnd = mulberry32(this.opts.seed ?? 20260101);
    const emit = (stage: Stage, kbps: number) => {
      if (this.stopped) return;
      listener({ kbps: Math.max(0, kbps), stage });
    };
    const phase = (stage: Stage) => {
      if (this.stopped) return;
      this.opts.onPhase?.(stage);
    };

    const runMeasuredPhase = (stage: Stage, peakMbps: number, hold: number, next: () => void) => {
      phase(stage);
      const tickMs = 100;
      const rampMs = 1500;
      const total = rampMs + hold;
      const started = performance.now();
      const loop = () => {
        if (this.stopped) return;
        const t = performance.now() - started;
        if (t >= total) {
          next();
          return;
        }
        const rampT = Math.min(1, t / rampMs);
        // fast rise, slight ease-out, then a plateau that never sits still
        const envelope = rampT < 1 ? 1 - Math.pow(1 - rampT, 3) : 1;
        const drift = Math.sin((t / 1000) * 1.7) * 0.012 + Math.sin((t / 1000) * 4.3) * 0.006;
        const noise = (rnd() - 0.5) * 0.03;
        const mbps = peakMbps * envelope * (1 + drift + noise);
        emit(stage, mbps * 1000);
        this.timer = window.setTimeout(loop, tickMs);
      };
      loop();
    };

    const finish = () => {
      if (this.stopped) return;
      phase('done');
      emit('done', dl * 1000);
      this.opts.onDone?.();
    };

    // latency beat: the needle stays parked at the start angle
    phase('ping');
    emit('ping', 0);
    this.timer = window.setTimeout(() => {
      runMeasuredPhase('download', dl, holdMs, () => {
        // needle return + stage swap
        phase('upload');
        this.timer = window.setTimeout(() => {
          runMeasuredPhase('upload', ul, holdMs, finish);
        }, 620);
      });
    }, 1200);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = 0;
    }
  }
}

/** Manual source: whatever the host page pushes. This is the "real data" seam. */
export class ManualSource implements SpeedSource {
  readonly name = 'manual';
  private listener: SampleListener | null = null;

  start(listener: SampleListener): void {
    this.listener = listener;
  }

  stop(): void {
    this.listener = null;
  }

  push(kbps: number, stage: Stage = 'download'): void {
    this.listener?.({ kbps, stage });
  }
}

/**
 * Adapter for a real measurement backend. Expects JSON frames of the shape
 * `{ "kbps": 123456, "stage": "download" }` on a WebSocket. Nothing is connected by
 * default; pass a URL to wire your own speed test into the gauge.
 */
export class WebSocketSource implements SpeedSource {
  readonly name = 'websocket';
  private socket: WebSocket | null = null;

  constructor(private readonly url: string) {}

  start(listener: SampleListener): void {
    this.stop();
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(String(event.data)) as { kbps?: number; stage?: Stage };
        if (typeof data.kbps === 'number') {
          listener({ kbps: data.kbps, stage: data.stage ?? 'download' });
        }
      } catch {
        /* ignore malformed frames */
      }
    });
  }

  stop(): void {
    this.socket?.close();
    this.socket = null;
  }
}
