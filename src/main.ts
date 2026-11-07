import { Gauge, type ConnectionMode, type ScaleMode, type Stage } from './gauge/gauge';
import { DemoSource, ManualSource } from './gauge/pipeline';

const params = new URLSearchParams(location.search);
const num = (key: string, fallback: number): number => {
  const raw = params.get(key);
  const v = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(v) ? v : fallback;
};

const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const connectionMode: ConnectionMode = params.get('mode') === 'single' ? 'single' : 'multi';
const scaleMode: ScaleMode = params.get('scale') === 'auto' ? 'auto' : 'fixed';
const bare = params.get('bare') === '1';

document.documentElement.dataset.theme = theme;
document.body.classList.toggle('is-bare', bare);

const stageHost = document.getElementById('gauge-stage') as HTMLElement;
const gauge = new Gauge(stageHost, { theme, connectionMode, scaleMode });

const manual = new ManualSource();

let activeSource: { stop(): void } | null = null;
let lastStage: Stage = 'idle';

function applySample(kbps: number, stage?: Stage): void {
  if (stage && stage !== lastStage) {
    lastStage = stage;
    gauge.setStage(stage);
    syncStageButtons(stage);
  }
  gauge.setSpeed(kbps);
  updateReadout(kbps);
}

function startDemo(): void {
  activeSource?.stop();
  lastStage = 'idle';
  gauge.setStage('idle');
  gauge.reset();
  const source = new DemoSource({
    seed: num('seed', 20260101),
    onPhase: (stage) => {
      gauge.setStage(stage);
      syncStageButtons(stage);
    },
    onDone: () => syncStageButtons('done'),
  });
  activeSource = source;
  source.start(({ kbps, stage }) => applySample(kbps, stage));
  setPlayIcon(true);
}

function stopSource(): void {
  activeSource?.stop();
  activeSource = null;
  setPlayIcon(false);
}

// ------------------------------------------------------------------ readouts
const readout = document.getElementById('readout');
function updateReadout(kbps: number): void {
  if (!readout) return;
  readout.textContent = `${(kbps / 1000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Mbps  ·  ${Math.round(kbps).toLocaleString('en-US')} kbps`;
}

// ------------------------------------------------------------------ controls
const playBtn = document.getElementById('play') as HTMLButtonElement | null;
function setPlayIcon(playing: boolean): void {
  if (!playBtn) return;
  playBtn.dataset.playing = String(playing);
  playBtn.textContent = playing ? 'Stop' : 'Run demo';
}

const stageButtons = new Map<Stage, HTMLButtonElement>();
document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach((btn) => {
  const stage = btn.dataset.stage as Stage;
  stageButtons.set(stage, btn);
  btn.addEventListener('click', () => {
    stopSource();
    lastStage = stage;
    gauge.setStage(stage);
    if (stage === 'idle') {
      gauge.snapTo(0);
    } else if (stage === 'download') {
      gauge.snapTo(num('value', 862) * 1000);
    } else if (stage === 'upload') {
      gauge.snapTo(num('uvalue', 341) * 1000);
    } else if (stage === 'done') {
      gauge.snapTo(num('value', 862) * 1000);
    }
    syncStageButtons(stage);
  });
});

function syncStageButtons(stage: Stage): void {
  for (const [key, btn] of stageButtons) btn.classList.toggle('is-active', key === stage);
}

playBtn?.addEventListener('click', () => {
  if (playBtn.dataset.playing === 'true') stopSource();
  else startDemo();
});

const slider = document.getElementById('speed') as HTMLInputElement | null;
const sliderLabel = document.getElementById('speed-label');
function onSlider(): void {
  if (!slider) return;
  const mbps = Number(slider.value);
  if (sliderLabel) sliderLabel.textContent = `${mbps.toLocaleString('en-US')} Mbps`;
  stopSource();
  lastStage = mbps === 0 ? 'idle' : lastStage === 'upload' ? 'upload' : 'download';
  gauge.setStage(lastStage);
  gauge.setSpeed(mbps * 1000);
  updateReadout(mbps * 1000);
}
slider?.addEventListener('input', onSlider);

const singleToggle = document.getElementById('single') as HTMLInputElement | null;
singleToggle?.addEventListener('change', () => {
  gauge.setConnectionMode(singleToggle.checked ? 'single' : 'multi');
});

const autoScale = document.getElementById('autoscale') as HTMLInputElement | null;
autoScale?.addEventListener('change', () => {
  gauge.setScaleMode(autoScale.checked ? 'auto' : 'fixed');
});

const resetBtn = document.getElementById('reset') as HTMLButtonElement | null;
resetBtn?.addEventListener('click', () => {
  stopSource();
  lastStage = 'idle';
  gauge.setStage('idle');
  gauge.snapTo(0);
  syncStageButtons('idle');
});

// ------------------------------------------------------ screenshot bootstrap
const frozen = params.get('static');
if (frozen !== null) {
  const mbps = Number(frozen);
  const stage = (params.get('stage') as Stage) ?? (mbps > 0 ? 'download' : 'idle');
  lastStage = stage;
  gauge.setStage(stage);
  gauge.snapTo(Number.isFinite(mbps) ? mbps * 1000 : 0);
  syncStageButtons(stage);
  updateReadout(Number.isFinite(mbps) ? mbps * 1000 : 0);
  if (slider) {
    slider.value = String(Number.isFinite(mbps) ? mbps : 0);
    if (sliderLabel) {
      sliderLabel.textContent = `${(Number.isFinite(mbps) ? mbps : 0).toLocaleString('en-US')} Mbps`;
    }
  }
} else if (params.get('autoplay') === '1') {
  startDemo();
} else {
  syncStageButtons('idle');
}

// ------------------------------------------------------------- public surface
interface SpeedGaugeApi {
  setSpeed(kbps: number): void;
  setStage(stage: Stage): void;
  snapTo(kbps: number): void;
  reset(): void;
  setConnectionMode(mode: ConnectionMode): void;
  setScaleMode(mode: ScaleMode): void;
  playDemo(): void;
  stop(): void;
  manual: ManualSource;
  gauge: Gauge;
}

declare global {
  interface Window {
    speedGauge: SpeedGaugeApi;
  }
}

window.speedGauge = {
  setSpeed: (kbps) => applySample(kbps),
  setStage: (stage) => {
    lastStage = stage;
    gauge.setStage(stage);
    syncStageButtons(stage);
  },
  snapTo: (kbps) => gauge.snapTo(kbps),
  reset: () => gauge.reset(),
  setConnectionMode: (mode) => gauge.setConnectionMode(mode),
  setScaleMode: (mode) => gauge.setScaleMode(mode),
  playDemo: startDemo,
  stop: stopSource,
  manual,
  gauge,
};

document.body.dataset.ready = 'true';
