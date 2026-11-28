// Lexicon sound: Lyre notes, combat/world cues, and living procedural Ambient Environment Soundscape
// (meadow breeze, proximity waterfall & creek rush, woodland birds, squirrel chirps, nighttime crickets & owl).
import { noteFrequency } from '../../../playkit/adventure/instrument';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audioStart() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return;
  }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
}

/** The shared AudioContext once the player has started (a browser lets sound begin only after a click). */
export const audioContext = () => ctx;

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slideTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, hp = 800) {
  if (!ctx || !master) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ctx.createBufferSource(); s.buffer = b;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = ctx.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(master); s.start();
}

export const sfx = {
  note: (letter: string) => { const f = noteFrequency(letter); tone(f, 0.9, 'triangle', 0.22); tone(f * 2, 0.5, 'sine', 0.05); },
  // Crisp Quill-Spear slash: brisk air cut + subtle harmonic ring of the cyan spear tip!
  swing: () => { noise(0.14, 0.28, 1700); tone(420, 0.13, 'triangle', 0.09, 0, 185); tone(940, 0.09, 'sine', 0.04, 0.02, 620); },
  hit: () => { noise(0.1, 0.38, 520); tone(190, 0.14, 'square', 0.1, 0, 82); tone(520, 0.08, 'triangle', 0.06, 0, 260); },
  hurt: () => tone(220, 0.3, 'sawtooth', 0.12, 0, 110),
  roll: () => noise(0.2, 0.12, 400),
  rescue: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.5, 'triangle', 0.16, i * 0.07)),
  wrong: () => { tone(200, 0.25, 'square', 0.1); tone(150, 0.35, 'square', 0.1, 0.12); },
  song: () => [0, 7, 12, 19].forEach((s, i) => tone(294 * Math.pow(2, s / 12), 1.2, 'sine', 0.12, i * 0.12)),
  gate: () => { tone(98, 1.6, 'sawtooth', 0.1, 0, 196); tone(147, 1.6, 'sine', 0.1, 0.2); },
  open: () => tone(330, 0.15, 'triangle', 0.1, 0, 660),
  boss: () => { tone(80, 1.2, 'sawtooth', 0.14, 0, 50); noise(0.6, 0.15, 200); },
  lasso: () => { noise(0.16, 0.18, 1800); tone(520, 0.22, 'sine', 0.12, 0, 980); },
  catchWord: () => [0, 4, 7, 11, 12].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.35, 'triangle', 0.15, i * 0.055)),
  cleanse: () => [0, 4, 7, 12, 16, 19].forEach((s, i) => tone(294 * Math.pow(2, s / 12), 0.9, 'sine', 0.14, i * 0.09)),
  elkCall: () => { tone(196, 0.9, 'triangle', 0.18, 0, 310); tone(392, 0.85, 'sine', 0.1, 0.08, 494); },
  splash: () => { noise(0.35, 0.26, 500); tone(140, 0.22, 'sine', 0.1, 0, 75); },
  railSwitch: () => { tone(640, 0.08, 'square', 0.09, 0, 880); noise(0.08, 0.2, 1400); },
  mirror: () => { tone(880, 0.28, 'sine', 0.12, 0, 1175); },
  save: () => { tone(523, 0.18, 'sine', 0.1, 0); tone(659, 0.22, 'sine', 0.1, 0.08); tone(784, 0.35, 'triangle', 0.11, 0.16); },
};

// ── Living Procedural Ambient Soundscape (wind, waterfall/creek, birds, squirrels, night crickets & owl) ──
export interface AmbientState {
  outdoor: boolean;
  night: boolean;
  waterfallProximity: number; // 0..1
  creekProximity: number;     // 0..1
  inWoods: number;            // 0..1
  muted: boolean;
}

export function createAmbientSoundscape() {
  let started = false;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let waterGain: GainNode | null = null;
  let waterFilter: BiquadFilterNode | null = null;
  let birdTimer = 2.2;
  let squirrelTimer = 5.5;
  let nightTimer = 1.4;

  function ensureInit() {
    if (started || !ctx || !master) return;
    started = true;
    // Generate a 4-second seamless brown-pink noise loop buffer for silky meadow breeze & rushing water
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.04 * w) / 1.04;
      ch[i] = last * 3.0;
    }
    // Gentle crossfade at loop seam so there is never an audible click
    const seam = Math.floor(ctx.sampleRate * 0.15);
    for (let i = 0; i < seam; i++) {
      const k = i / seam;
      ch[len - seam + i] = ch[len - seam + i] * (1 - k) + ch[i] * k;
    }

    const windSrc = ctx.createBufferSource();
    windSrc.buffer = buf; windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 340; windFilter.Q.value = 1.1;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windSrc.connect(windFilter).connect(windGain).connect(master);
    windSrc.start();

    const waterSrc = ctx.createBufferSource();
    waterSrc.buffer = buf; waterSrc.loop = true;
    waterFilter = ctx.createBiquadFilter();
    waterFilter.type = 'bandpass'; waterFilter.frequency.value = 820; waterFilter.Q.value = 0.65;
    waterGain = ctx.createGain(); waterGain.gain.value = 0;
    waterSrc.connect(waterFilter).connect(waterGain).connect(master);
    waterSrc.start();
  }

  function chirpBird() {
    if (!ctx || !master) return;
    const base = 1850 + Math.random() * 1150;
    const notes = Math.random() < 0.5 ? [0, 220, 480] : [0, 320, 140, 520];
    notes.forEach((off, i) => {
      tone(base + off, 0.11, 'sine', 0.032, i * 0.095, base + off + (i % 2 ? -140 : 210));
    });
  }

  function chirpSquirrel() {
    if (!ctx || !master) return;
    // Quick playful woodland squirrel chitter ("chk-chk-chk!")
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const f = 1400 + Math.random() * 450;
      tone(f, 0.045, 'triangle', 0.028, i * 0.075, f * 0.65);
    }
  }

  function chirpCricketOrOwl() {
    if (!ctx || !master) return;
    if (Math.random() < 0.18) {
      // Soft distant woodland owl "hoo - hoo-ooo"
      tone(370, 0.28, 'sine', 0.036, 0, 345);
      tone(355, 0.52, 'sine', 0.038, 0.38, 315);
    } else {
      // Gentle night cricket pulse
      const f = 3700 + Math.random() * 350;
      for (let i = 0; i < 3; i++) {
        tone(f, 0.038, 'sine', 0.016, i * 0.065);
      }
    }
  }

  return {
    update(dt: number, t: number, s: AmbientState) {
      if (!ctx || ctx.state !== 'running') return;
      ensureInit();
      if (!windGain || !windFilter || !waterGain || !waterFilter) return;

      const vol = s.muted ? 0 : 1;
      // Gently breathing meadow breeze (or hollow cavern wind indoors)
      const breezeLfo = 0.72 + 0.28 * Math.sin(t * 0.42);
      const wantWind = vol * (s.outdoor ? 0.11 * breezeLfo : 0.065 * breezeLfo);
      const wantWindFreq = s.outdoor ? 320 + Math.sin(t * 0.27) * 140 : 175 + Math.sin(t * 0.2) * 35;
      windGain.gain.setTargetAtTime(wantWind, ctx.currentTime, 0.35);
      windFilter.frequency.setTargetAtTime(wantWindFreq, ctx.currentTime, 0.4);

      // Proximity-blended waterfall roar + sparkling creek babble
      const waterLevel = Math.max(s.waterfallProximity * 0.24, s.creekProximity * 0.11);
      const wantWater = vol * waterLevel;
      const wantWaterFreq = 540 + (1 - s.waterfallProximity) * 480 + Math.sin(t * 1.4) * 60;
      waterGain.gain.setTargetAtTime(wantWater, ctx.currentTime, 0.25);
      waterFilter.frequency.setTargetAtTime(wantWaterFreq, ctx.currentTime, 0.3);

      if (s.muted || !s.outdoor) return;

      if (!s.night) {
        birdTimer -= dt;
        if (birdTimer <= 0) {
          chirpBird();
          birdTimer = 3.2 + Math.random() * 4.8;
        }
        squirrelTimer -= dt;
        if (squirrelTimer <= 0) {
          if (s.inWoods > 0.2 || Math.random() < 0.45) chirpSquirrel();
          squirrelTimer = 6.5 + Math.random() * 7.5;
        }
      } else {
        nightTimer -= dt;
        if (nightTimer <= 0) {
          chirpCricketOrOwl();
          nightTimer = 2.0 + Math.random() * 3.4;
        }
      }
    },
  };
}
