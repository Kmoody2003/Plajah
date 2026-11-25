// Lexicon sound: the Lyre's notes (playkit noteFrequency ladder) and a few cues.
// Stand-in synthesis until recorded CC0 / owner-scored audio lands (canon: recorded over synth).
import { noteFrequency } from '../../../playkit/adventure/instrument';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function audioStart() {
  if (ctx) { void ctx.resume(); return; }
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.5;
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
  swing: () => noise(0.12, 0.25, 2200),
  hit: () => { noise(0.08, 0.35, 600); tone(180, 0.12, 'square', 0.08, 0, 90); },
  hurt: () => tone(220, 0.3, 'sawtooth', 0.12, 0, 110),
  roll: () => noise(0.2, 0.12, 400),
  rescue: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 0.5, 'triangle', 0.16, i * 0.07)),
  wrong: () => { tone(200, 0.25, 'square', 0.1); tone(150, 0.35, 'square', 0.1, 0.12); },
  song: () => [0, 7, 12, 19].forEach((s, i) => tone(294 * Math.pow(2, s / 12), 1.2, 'sine', 0.12, i * 0.12)),
  gate: () => { tone(98, 1.6, 'sawtooth', 0.1, 0, 196); tone(147, 1.6, 'sine', 0.1, 0.2); },
  open: () => tone(330, 0.15, 'triangle', 0.1, 0, 660),
  boss: () => { tone(80, 1.2, 'sawtooth', 0.14, 0, 50); noise(0.6, 0.15, 200); },
};
