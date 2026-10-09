// SFX catalogue: every sound is a small recipe of oscillators + filtered noise + envelopes. Nothing is sampled, nothing is downloaded.
// Each recipe writes to s.out at time s.t, scaling pitch by s.pr, durations by s.ds, with slight seeded randomisation (s.rnd).
// Internal layers peak around 0.5; `defaultGain` trims each sound so the whole catalogue lands in the same safe loudness window
// (measured by the offline-render test: tests/livingAudio.render.test.ts). `loud` marks startle sounds that reduced-sound mode softens more.

import { SFX_GAIN } from './calibration';
import { type Ctx, type SynthCtx, makeSynth, noise, partials, tone } from './dsp';

export type SfxCategory = 'beep' | 'vehicle' | 'cartoon' | 'magic' | 'bell' | 'nature' | 'body' | 'creature' | 'texture' | 'ui' | 'story' | 'music';

export interface SfxDef {
  id: string;
  label: string;
  category: SfxCategory;
  /** multiplies the caller's gain; calibrated so the default is comfortable */
  defaultGain: number;
  /** upper bound (seconds) on how long the sound rings at default params; the render test enforces it */
  maxSec: number;
  loud?: boolean;
  play(s: SynthCtx): void;
}

const SFX: SfxDef[] = [];
function def(id: string, label: string, category: SfxCategory, maxSec: number, play: (s: SynthCtx) => void, extra: { gain?: number; loud?: boolean } = {}) {
  SFX.push({ id, label, category, maxSec, play, defaultGain: SFX_GAIN[id] ?? extra.gain ?? 1, loud: extra.loud });
}

// ───────────── beeps & horns ─────────────
const beepAt = (s: SynthCtx, f: number, at = 0) => {
  tone(s, { type: 'triangle', f, at, dur: 0.15, shape: 'flat', a: 0.005, rel: 0.05, peak: 0.5 });
  tone(s, { type: 'square', f, at, dur: 0.15, shape: 'flat', a: 0.005, rel: 0.05, peak: 0.07, lp: 3200 });
};
const beep = (f: number) => (s: SynthCtx) => beepAt(s, f);
def('beep', 'Beep', 'beep', 0.4, beep(880));
def('beep-low', 'Beep (low)', 'beep', 0.4, beep(440));
def('beep-high', 'Beep (high)', 'beep', 0.4, beep(1320));
def('beep-double', 'Double beep', 'beep', 0.6, (s) => { beepAt(s, 988); beepAt(s, 988, 0.2); });
def('beep-car', 'Car-horn beep', 'vehicle', 0.6, (s) => {
  tone(s, { type: 'square', f: 410, dur: 0.24, shape: 'flat', a: 0.01, rel: 0.05, peak: 0.28, lp: 1900 });
  tone(s, { type: 'square', f: 515, dur: 0.24, shape: 'flat', a: 0.01, rel: 0.05, peak: 0.26, lp: 1900 });
});
def('honk', 'Honk', 'vehicle', 0.8, (s) => {
  tone(s, { type: 'sawtooth', f: 190, f2: 172, dur: 0.46, shape: 'flat', a: 0.025, rel: 0.1, peak: 0.34, lp: 1100, q: 1.2 });
  tone(s, { type: 'sawtooth', f: 238, f2: 216, dur: 0.46, shape: 'flat', a: 0.03, rel: 0.1, peak: 0.28, lp: 1100, q: 1.2 });
}, { loud: true });
def('toot', 'Toot', 'vehicle', 0.5, (s) => {
  tone(s, { type: 'triangle', f: 330, f2: 322, dur: 0.17, shape: 'flat', a: 0.012, rel: 0.06, peak: 0.42, lp: 1500 });
  tone(s, { type: 'sawtooth', f: 330, dur: 0.17, shape: 'flat', a: 0.012, rel: 0.06, peak: 0.12, lp: 1300 });
});
def('kazoo-toot', 'Kazoo toot', 'music', 0.7, (s) => {
  const wob = (u: number) => 1 + 0.012 * Math.sin(u * 14);
  tone(s, { type: 'sawtooth', f: 392, curve: wob, dur: 0.34, shape: 'flat', a: 0.025, rel: 0.08, peak: 0.34, bp: 1500, bpQ: 1.2, lp: 4200, vibHz: 6, vibCents: 22, vibDelay: 0.05 });
  tone(s, { type: 'square', f: 392 * 1.003, dur: 0.34, shape: 'flat', a: 0.025, rel: 0.08, peak: 0.1, lp: 2400 });
  noise(s, { color: 'white', dur: 0.34, shape: 'flat', a: 0.03, peak: 0.03, bp: [2200, 2200, 1] });
});

// ───────────── cartoon pops, springs, whooshes ─────────────
def('pop', 'Pop', 'cartoon', 0.3, (s) => {
  tone(s, { f: 720, f2: 120, dur: 0.1, peak: 0.6, a: 0.002 });
  noise(s, { color: 'white', dur: 0.022, peak: 0.22, hp: [2200] });
});
def('boing', 'Boing', 'cartoon', 1.0, (s) => {
  const w = (u: number) => 1 + 1.05 * Math.exp(-4.4 * u) * Math.sin(2 * Math.PI * 7 * u);
  tone(s, { type: 'sine', f: 300, curve: w, dur: 0.75, peak: 0.5, a: 0.006 });
  tone(s, { type: 'triangle', f: 600, curve: w, dur: 0.75, peak: 0.12, a: 0.006 });
});
def('whoosh', 'Whoosh', 'cartoon', 0.9, (s) => {
  noise(s, { color: 'pink', dur: 0.55, shape: 'swell', a: 0.22, rel: 0.3, peak: 0.55, bp: [350, 2300, 0.8], lp: [5000] });
});
def('swoosh', 'Swoosh', 'cartoon', 0.6, (s) => {
  noise(s, { color: 'white', dur: 0.3, shape: 'swell', a: 0.1, rel: 0.18, peak: 0.34, bp: [1300, 4300, 1.1] });
});
def('zip', 'Zip', 'cartoon', 0.5, (s) => {
  noise(s, { color: 'white', dur: 0.2, shape: 'swell', a: 0.03, rel: 0.12, peak: 0.28, bp: [600, 6000, 2] });
  tone(s, { type: 'triangle', f: 500, f2: 2400, dur: 0.18, shape: 'swell', a: 0.02, rel: 0.1, peak: 0.12 });
});
def('jelly-squish', 'Jelly squish', 'cartoon', 0.8, (s) => {
  tone(s, { type: 'sine', f: 150, f2: 85, dur: 0.45, peak: 0.5, a: 0.01, vibHz: 12, vibCents: 130 });
  noise(s, { color: 'pink', dur: 0.32, peak: 0.28, bp: [420, 900, 2.2], amHz: 15, amDepth: 0.8, a: 0.01 });
});
def('squeak', 'Squeak', 'cartoon', 0.5, (s) => {
  tone(s, { type: 'sine', f: 1650, f2: 2700, dur: 0.12, shape: 'swell', a: 0.015, rel: 0.05, peak: 0.28, vibHz: 38, vibCents: 70, lp: 6000 });
  tone(s, { type: 'sine', f: 2300, f2: 1900, dur: 0.1, at: 0.15, shape: 'swell', a: 0.012, rel: 0.05, peak: 0.2, vibHz: 34, vibCents: 60, lp: 6000 });
});
def('boop', 'Boop', 'ui', 0.3, (s) => {
  tone(s, { f: 480, f2: 690, bendEnd: 0.5, dur: 0.11, peak: 0.5, a: 0.008 });
  tone(s, { f: 960, f2: 1380, bendEnd: 0.5, dur: 0.09, peak: 0.1, a: 0.008 });
});
def('tick', 'Tick', 'ui', 0.15, (s) => {
  noise(s, { color: 'white', dur: 0.01, peak: 0.4, hp: [3500] });
  tone(s, { f: 2400, dur: 0.012, peak: 0.12, a: 0.001 });
});
def('button-click', 'Button click', 'ui', 0.2, (s) => {
  noise(s, { color: 'white', dur: 0.009, peak: 0.4, hp: [3000], a: 0.001 });
  tone(s, { f: 1800, f2: 1300, dur: 0.025, peak: 0.22, a: 0.001 });
  tone(s, { f: 620, dur: 0.02, peak: 0.16, a: 0.001 });
});
def('pop-balloon', 'Balloon pop', 'cartoon', 0.5, (s) => {
  noise(s, { color: 'white', dur: 0.07, peak: 0.75, a: 0.001, lp: [9000, 1500] });
  tone(s, { f: 130, f2: 55, dur: 0.14, peak: 0.35, a: 0.001 });
}, { loud: true });
def('confetti', 'Confetti', 'cartoon', 1.4, (s) => {
  tone(s, { f: 520, f2: 150, dur: 0.07, peak: 0.28, a: 0.002 });
  noise(s, { color: 'white', dur: 0.03, peak: 0.2, hp: [1800] });
  for (let i = 0; i < 38; i++) {
    const at = Math.min(1.0, -Math.log(1 - s.rnd() * 0.97) * 0.28) + 0.03;
    noise(s, { color: 'white', at, dur: 0.012 + s.rnd() * 0.01, peak: 0.05 + s.rnd() * 0.1, hp: [4500 + s.rnd() * 3000], a: 0.001 });
  }
});

// ───────────── magic & sparkles ─────────────
def('sparkle', 'Sparkle', 'magic', 1.0, (s) => {
  for (let i = 0; i < 9; i++) tone(s, { f: 2500 + s.rnd() * 4500, at: s.rnd() * 0.42, dur: 0.18 + s.rnd() * 0.12, peak: 0.12 + s.rnd() * 0.06, a: 0.002 });
});
def('twinkle', 'Twinkle', 'magic', 0.8, (s) => {
  [2093, 1568, 1319].forEach((f, i) => { tone(s, { f, at: i * 0.09, dur: 0.38, peak: 0.24, a: 0.003 }); tone(s, { f: f * 2, at: i * 0.09, dur: 0.2, peak: 0.05, a: 0.003 }); });
});
def('magic-appear', 'Magic appear', 'magic', 2.0, (s) => {
  [0, 2, 4, 7, 9, 12].forEach((st, i) => partials(s, { f: 784 * Math.pow(2, st / 12), parts: [[1, 1], [2, 0.25, 0.6], [3, 0.1, 0.4]], at: i * 0.06, dur: 0.7, peak: 0.2 }));
  for (let i = 0; i < 7; i++) tone(s, { f: 3000 + s.rnd() * 4000, at: 0.25 + s.rnd() * 0.5, dur: 0.25, peak: 0.07, a: 0.003 });
  noise(s, { color: 'white', at: 0.1, dur: 0.9, shape: 'swell', a: 0.4, rel: 0.4, peak: 0.05, hp: [5000] });
});
def('success-jingle', 'Success jingle', 'story', 1.6, (s) => {
  [[523.25, 0, 0.5], [659.25, 0.11, 0.5], [783.99, 0.22, 0.5], [1046.5, 0.35, 1.0]].forEach(([f, at, d]) =>
    partials(s, { f, parts: [[1, 1], [2, 0.3, 0.5], [4, 0.08, 0.3]], at, dur: d, peak: 0.3, type: 'triangle' }));
});
def('gentle-no', "Gentle 'No!'", 'story', 0.8, (s) => {
  tone(s, { type: 'triangle', f: 392, f2: 372, dur: 0.22, shape: 'swell', a: 0.03, rel: 0.1, peak: 0.4, lp: 1300, vibHz: 5, vibCents: 12 });
  tone(s, { type: 'triangle', f: 311, f2: 292, at: 0.25, dur: 0.34, shape: 'swell', a: 0.03, rel: 0.2, peak: 0.4, lp: 1100, vibHz: 5, vibCents: 12 });
});

// ───────────── bells & chimes ─────────────
def('chime', 'Chime', 'bell', 2.2, (s) => partials(s, { f: 880, parts: [[1, 1, 1], [2.76, 0.35, 0.5], [5.4, 0.15, 0.3]], dur: 1.5, peak: 0.45 }));
def('glass-chime', 'Glass chime', 'bell', 2.4, (s) => partials(s, { f: 1320, parts: [[1, 1, 1], [2.32, 0.5, 0.6], [4.25, 0.3, 0.4], [6.63, 0.14, 0.3]], dur: 1.7, peak: 0.4 }));
def('bell', 'Bell', 'bell', 3.2, (s) => partials(s, { f: 440, parts: [[0.5, 0.5, 1.2], [0.92, 0.55, 1], [1.19, 1, 0.9], [1.71, 0.6, 0.6], [2, 0.4, 0.6], [2.74, 0.3, 0.4], [3, 0.2, 0.3]], dur: 2.4, peak: 0.4 }));
def('ding', 'Ding', 'bell', 1.4, (s) => partials(s, { f: 1568, parts: [[1, 1, 1], [2, 0.3, 0.5], [3, 0.1, 0.3]], dur: 0.95, peak: 0.45 }));
def('harp-gliss', 'Harp glissando', 'music', 1.8, (s) => {
  [0, 2, 4, 7, 9, 12, 14, 16].forEach((st, i) => partials(s, { f: 523.25 * Math.pow(2, st / 12), parts: [[1, 1, 1], [2, 0.35, 0.55], [3, 0.12, 0.35]], at: i * 0.06, dur: 0.9, peak: 0.22, type: 'triangle' }));
});
def('stitch', 'Stitch', 'story', 0.3, (s) => {
  tone(s, { type: 'triangle', f: 880, f2: 700, dur: 0.09, peak: 0.34, a: 0.002 });
  noise(s, { color: 'white', dur: 0.01, peak: 0.12, hp: [5000] });
});
def('thread-pluck', 'Thread pluck', 'story', 1.5, (s) => {
  partials(s, { f: 440, parts: [[1, 1, 1], [2, 0.4, 0.6], [3, 0.2, 0.4], [4, 0.1, 0.25]], dur: 1.1, peak: 0.4, type: 'triangle' });
  noise(s, { color: 'white', dur: 0.012, peak: 0.1, hp: [3000] });
});
def('thread-tug', 'Thread tug', 'story', 0.8, (s) => {
  tone(s, { type: 'sine', f: 150, f2: 215, dur: 0.42, shape: 'swell', a: 0.1, rel: 0.2, peak: 0.34, vibHz: 7, vibCents: 18 });
  noise(s, { color: 'pink', dur: 0.4, shape: 'swell', a: 0.1, rel: 0.2, peak: 0.1, bp: [1000, 1300, 6], amHz: 31, amDepth: 0.9 });
});
def('unravel', 'Unravel', 'story', 1.2, (s) => {
  noise(s, { color: 'pink', dur: 0.9, shape: 'swell', a: 0.2, rel: 0.45, peak: 0.34, bp: [2600, 900, 2], amHz: 38, amDepth: 0.95 });
  for (let i = 0; i < 10; i++) noise(s, { color: 'white', at: i * 0.085, dur: 0.008, peak: 0.09, hp: [3500] });
});

// ───────────── thuds, knocks, nature ─────────────
def('knock', 'Knock', 'texture', 0.7, (s) => {
  [0, 0.17].forEach((at, i) => {
    tone(s, { f: 190 - i * 14, f2: 105, dur: 0.1, at, peak: 0.55, a: 0.001 });
    noise(s, { color: 'brown', at, dur: 0.05, peak: 0.28, lp: [900], a: 0.001 });
  });
});
def('thud', 'Thud', 'texture', 0.6, (s) => {
  tone(s, { f: 95, f2: 42, dur: 0.3, peak: 0.7, a: 0.002 });
  noise(s, { color: 'brown', dur: 0.1, peak: 0.3, lp: [320], a: 0.002 });
});
def('crunch', 'Crunch (twig)', 'nature', 0.5, (s) => {
  noise(s, { color: 'white', dur: 0.022, peak: 0.55, bp: [2600, 1500, 1.4], a: 0.001 });
  tone(s, { f: 310, f2: 190, dur: 0.06, peak: 0.12, a: 0.001 });
  [0.025, 0.05, 0.078].forEach((at) => noise(s, { color: 'white', at, dur: 0.012, peak: 0.2 + s.rnd() * 0.15, hp: [2500 + s.rnd() * 1500], a: 0.001 }));
});
def('rustle', 'Rustle (leaves)', 'nature', 1.0, (s) => {
  noise(s, { color: 'pink', dur: 0.7, shape: 'swell', a: 0.22, rel: 0.38, peak: 0.28, hp: [2400], bp: [3400, 4400, 0.7], amHz: 17, amDepth: 0.9 });
  noise(s, { color: 'white', dur: 0.7, shape: 'swell', a: 0.25, rel: 0.35, peak: 0.12, hp: [4500], amHz: 29, amDepth: 0.9 });
});
def('splash', 'Splash', 'nature', 1.2, (s) => {
  noise(s, { color: 'white', dur: 0.65, peak: 0.45, lp: [5200, 600], a: 0.005 });
  noise(s, { color: 'pink', dur: 0.3, peak: 0.25, bp: [1600, 1600, 1] });
  [0.12, 0.22, 0.34].forEach((at, i) => tone(s, { f: 420 + i * 120, f2: 1200 + i * 200, at, dur: 0.08, peak: 0.12, a: 0.004 }));
});
def('bubble', 'Bubble', 'nature', 0.4, (s) => {
  const f = 340 + s.rnd() * 120;
  tone(s, { f, f2: f * 3, bendEnd: 0.8, dur: 0.1, peak: 0.45, a: 0.004 });
});
def('drip', 'Drip', 'nature', 0.6, (s) => {
  tone(s, { f: 1500, f2: 800, dur: 0.085, peak: 0.4, a: 0.002 });
  tone(s, { f: 1400, f2: 760, at: 0.13, dur: 0.07, peak: 0.1, a: 0.002 });
});
def('cricket', 'Cricket', 'creature', 1.0, (s) => {
  [0, 0.34].forEach((base) => [0, 0.055, 0.11].forEach((o) => {
    tone(s, { f: 4500, at: base + o, dur: 0.035, shape: 'swell', a: 0.006, rel: 0.012, peak: 0.12 });
    tone(s, { f: 9000, at: base + o, dur: 0.03, shape: 'swell', a: 0.005, rel: 0.01, peak: 0.03 });
  }));
});
def('owl-hoo', 'Owl hoo', 'creature', 1.5, (s) => {
  const hoo = (at: number, d: number, f1: number, f2: number) => {
    tone(s, { type: 'sine', f: f1, f2, at, dur: d, shape: 'swell', a: 0.07, rel: d * 0.5, peak: 0.34, lp: 1000 });
    tone(s, { type: 'sine', f: f1 * 2, f2: f2 * 2, at, dur: d, shape: 'swell', a: 0.08, rel: d * 0.5, peak: 0.05 });
  };
  hoo(0, 0.26, 420, 390); hoo(0.34, 0.26, 420, 385); hoo(0.7, 0.5, 400, 330);
});
def('wings', 'Fluttering wings', 'creature', 0.9, (s) => {
  noise(s, { color: 'pink', dur: 0.55, shape: 'swell', a: 0.07, rel: 0.25, peak: 0.34, bp: [750, 950, 1], amHz: 24, amDepth: 0.95 });
  noise(s, { color: 'white', dur: 0.55, shape: 'swell', a: 0.07, rel: 0.25, peak: 0.08, hp: [3500], amHz: 24, amDepth: 0.95 });
});
def('whale-call', 'Whale call', 'creature', 4.4, (s) => {
  const song = (u: number) => 1 + 0.9 * Math.sin(Math.PI * Math.min(1, u * 1.25)) - 0.35 * u;
  tone(s, { type: 'sine', f: 150, curve: song, dur: 3.4, shape: 'swell', a: 0.9, rel: 1.4, peak: 0.42, lp: 750, vibHz: 4.5, vibCents: 28 });
  tone(s, { type: 'sine', f: 300, curve: song, dur: 3.4, shape: 'swell', a: 1.0, rel: 1.4, peak: 0.12, lp: 900, vibHz: 4.5, vibCents: 28 });
}, {});
def('hum', 'Hum', 'body', 1.9, (s) => {
  tone(s, { type: 'triangle', f: 130, dur: 1.2, shape: 'swell', a: 0.25, rel: 0.5, peak: 0.36, lp: 900, vibHz: 5, vibCents: 16 });
  tone(s, { type: 'sine', f: 260, dur: 1.2, shape: 'swell', a: 0.3, rel: 0.5, peak: 0.08, vibHz: 5, vibCents: 16 });
});
def('snore', 'Snore', 'body', 2.6, (s) => {
  [0, 0.95].forEach((at) => {
    tone(s, { type: 'sawtooth', f: 60, f2: 52, at, dur: 0.75, shape: 'swell', a: 0.35, rel: 0.3, peak: 0.28, lp: 320, vibHz: 24, vibCents: 60 });
    noise(s, { color: 'pink', at, dur: 0.75, shape: 'swell', a: 0.35, rel: 0.3, peak: 0.12, bp: [200, 520, 1.2] });
  });
});
def('yawn', 'Yawn', 'body', 2.2, (s) => {
  const arc = (u: number) => (u < 0.3 ? 1 + 0.2 * (u / 0.3) : 1.2 - 0.62 * ((u - 0.3) / 0.7));
  tone(s, { type: 'sawtooth', f: 270, curve: arc, dur: 1.5, shape: 'swell', a: 0.45, rel: 0.6, peak: 0.3, lp: 950, bp: 800, bpQ: 0.6, vibHz: 5, vibCents: 20 });
  noise(s, { color: 'pink', dur: 1.5, shape: 'swell', a: 0.45, rel: 0.6, peak: 0.07, bp: [900, 500, 1] });
});
const step = (rate: number, bright: number) => (s: SynthCtx) => {
  tone(s, { f: 115 * rate, f2: 68 * rate, dur: 0.09, peak: 0.42, a: 0.002 });
  noise(s, { color: 'brown', dur: 0.1, peak: 0.34, lp: [650 * bright, 250], a: 0.002 });
  noise(s, { color: 'pink', dur: 0.05, peak: 0.1, bp: [1500 * bright, 900, 1] });
};
def('footstep-left', 'Footstep (left)', 'body', 0.4, step(1, 1));
def('footstep-right', 'Footstep (right)', 'body', 0.4, step(1.13, 0.85));
def('heartbeat', 'Heartbeat', 'body', 1.8, (s) => {
  [0, 0.95].forEach((base) => {
    tone(s, { f: 62, f2: 40, at: base, dur: 0.17, peak: 0.7, a: 0.004 });
    tone(s, { f: 52, f2: 38, at: base + 0.24, dur: 0.15, peak: 0.5, a: 0.004 });
    noise(s, { color: 'brown', at: base, dur: 0.08, peak: 0.12, lp: [260] });
  });
});
def('candle-flicker', 'Candle flicker', 'texture', 1.0, (s) => {
  noise(s, { color: 'pink', dur: 0.6, shape: 'swell', a: 0.15, rel: 0.3, peak: 0.4, bp: [550, 650, 0.7], amHz: 9, amDepth: 1 });
  for (let i = 0; i < 5; i++) noise(s, { color: 'white', at: 0.05 + s.rnd() * 0.5, dur: 0.01, peak: 0.12 + s.rnd() * 0.1, hp: [3000], a: 0.001 });
});
def('candle-blow', 'Candle blow-out', 'texture', 1.0, (s) => {
  noise(s, { color: 'white', dur: 0.55, shape: 'swell', a: 0.08, rel: 0.4, peak: 0.42, bp: [950, 380, 0.9], lp: [3000] });
  noise(s, { color: 'pink', at: 0.5, dur: 0.15, peak: 0.05, hp: [3000] });
});
def('page-flip', 'Page flip', 'texture', 0.5, (s) => {
  noise(s, { color: 'pink', dur: 0.24, shape: 'swell', a: 0.05, rel: 0.15, peak: 0.34, bp: [1800, 4200, 0.9] });
  noise(s, { color: 'white', at: 0.17, dur: 0.012, peak: 0.12, hp: [4000] });
});
def('rumble', 'Rumble', 'texture', 2.6, (s) => {
  noise(s, { color: 'brown', dur: 1.7, shape: 'swell', a: 0.4, rel: 0.8, peak: 0.8, lp: [150, 95], amHz: 9, amDepth: 0.4 });
  tone(s, { f: 46, f2: 40, dur: 1.7, shape: 'swell', a: 0.4, rel: 0.8, peak: 0.28 });
}, { loud: true });

// ───────────── registry ─────────────
export const SFX_CATALOG: readonly SfxDef[] = SFX;
export const SFX_BY_ID: ReadonlyMap<string, SfxDef> = new Map(SFX.map((d) => [d.id, d]));
export const SFX_IDS: readonly string[] = SFX.map((d) => d.id);
/** Ids accepted by sfx() that resolve to another sound: 'footstep' alternates left/right, 'car-horn' is the car-horn beep. */
export const SFX_ALIASES: Record<string, string> = { 'car-horn': 'beep-car', 'balloon-pop': 'pop-balloon', 'blow-candle': 'candle-blow', 'owl': 'owl-hoo', 'whale': 'whale-call', 'jingle': 'success-jingle', 'no': 'gentle-no', 'click': 'button-click' };

export function resolveSfx(id: string): SfxDef | undefined {
  return SFX_BY_ID.get(id) ?? SFX_BY_ID.get(SFX_ALIASES[id]);
}

export interface SfxPlayOpts { pitch?: number; gain?: number; variation?: number; durationScale?: number; seed?: number; soft?: boolean }

/** Play one catalogue sound into `out` (a node you own) at time `t`. Applies defaultGain * gain. Returns the sound's length in seconds. */
export function playSfxInto(c: Ctx, out: AudioNode, t: number, id: string, o: SfxPlayOpts = {}): number {
  const d = resolveSfx(id);
  if (!d) return 0;
  const g = c.createGain();
  g.gain.value = d.defaultGain * (o.gain ?? 1);
  g.connect(out);
  const s = makeSynth(c, g, t, { pitch: o.pitch, variation: o.variation ?? 0.25, durationScale: o.durationScale, seed: o.seed, soft: o.soft });
  d.play(s);
  return s.end;
}
