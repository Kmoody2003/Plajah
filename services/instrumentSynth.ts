// instrumentSynth.ts — hear what an instrument sounds like, synthesised in the browser.
//
// Blueprint Part 4.5 asks for instrument primers "with ear-training hooks into the existing Web
// Audio synthesis". We synthesise rather than stream samples on purpose: no external URLs to rot,
// no licensing, no download, and it works offline. A sine wave would make a trumpet and a cello
// identical, so each FAMILY gets its own voice — waveform, filter behaviour, envelope, vibrato
// and attack transient — chosen to caricature how that family actually makes sound.
//
// The demo phrase is placed inside the instrument's REAL written range (parsed from its `range`
// string), so a piccolo demo sits high and a tuba demo sits low, as they should.

import type { Instrument, InstrumentFamilyId } from '../data/instrumentPrimers';

// ── Note helpers ──────────────────────────────────────────────────────────────
const NOTE_SEMITONE: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** The data uses typographic accidentals (B♭3, F♯3) — normalise them to ASCII before parsing. */
const normalizeAccidentals = (s: string) => s.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/𝄫/g, 'bb').replace(/𝄪/g, '##');

/** 'G3' | 'Bb1' | 'C#7' | 'B♭3' → MIDI number. Returns null if unparseable. */
export function noteToMidi(note: string): number | null {
  const m = normalizeAccidentals(note).trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const letter = m[1].toUpperCase() + (m[2] || '');
  const semi = NOTE_SEMITONE[letter];
  if (semi === undefined) return null;
  return semi + (parseInt(m[3], 10) + 1) * 12;
}

/** True when the instrument has no definite pitch (snare, cymbals, congas, most drum machines). */
export function isUnpitched(range: string): boolean {
  return /indefinite/i.test(range);
}

/** Parse a range string like 'G3 – E7', 'B♭1 – E5', 'C2-C7', 'A0 – C8 (88 keys)' into MIDI bounds. */
export function parseRange(range: string): { low: number; high: number } | null {
  const notes = (normalizeAccidentals(range).match(/[A-Ga-g][#b]?-?\d+/g) || [])
    .map(noteToMidi).filter((n): n is number => n !== null);
  if (notes.length < 2) return null;
  const low = Math.min(...notes), high = Math.max(...notes);
  return high > low ? { low, high } : null;
}

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// ── Audio context (created on a user gesture, so it's never born suspended) ────
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let activeStop: (() => void) | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx!.createGain();
      master.gain.value = 0.9;
      master.connect(ctx!.destination);
    }
    if (ctx!.state === 'suspended') void ctx!.resume();
    return ctx;
  } catch { return null; }
}

// ── Per-family voicing ────────────────────────────────────────────────────────
interface Voice {
  wave: OscillatorType;
  /** Extra detuned/harmonic partials: [semitone offset, gain]. */
  partials: [number, number][];
  cutoff: number;          // lowpass at note start
  cutoffPeak: number;      // brightness the filter opens to on attack
  q: number;
  attack: number;
  decay: number;
  sustain: number;         // 0..1 of peak
  release: number;
  vibratoHz: number;
  vibratoCents: number;
  /** Brass-style pitch scoop into the note, in cents. */
  scoopCents: number;
  /** Noise transient mixed at onset (bow scratch, breath, mallet, pluck). */
  noise: number;
  gain: number;
}

const VOICES: Record<InstrumentFamilyId, Voice> = {
  strings:    { wave: 'sawtooth', partials: [[0, 0.5], [12, 0.12]], cutoff: 900,  cutoffPeak: 2600, q: 3,   attack: 0.09, decay: 0.25, sustain: 0.75, release: 0.35, vibratoHz: 5.2, vibratoCents: 9,  scoopCents: 0,  noise: 0.06, gain: 0.30 },
  woodwind:   { wave: 'triangle', partials: [[12, 0.18], [19, 0.06]], cutoff: 1400, cutoffPeak: 3200, q: 1.4, attack: 0.05, decay: 0.18, sustain: 0.80, release: 0.22, vibratoHz: 5.6, vibratoCents: 7,  scoopCents: 0,  noise: 0.10, gain: 0.28 },
  brass:      { wave: 'sawtooth', partials: [[7, 0.22], [12, 0.16]], cutoff: 700,  cutoffPeak: 4200, q: 2.2, attack: 0.06, decay: 0.20, sustain: 0.82, release: 0.25, vibratoHz: 4.6, vibratoCents: 5,  scoopCents: 28, noise: 0.05, gain: 0.26 },
  percussion: { wave: 'triangle', partials: [[12, 0.30], [19, 0.14]], cutoff: 2200, cutoffPeak: 5200, q: 1.0, attack: 0.002, decay: 0.55, sustain: 0.02, release: 0.35, vibratoHz: 0,   vibratoCents: 0,  scoopCents: 0,  noise: 0.30, gain: 0.34 },
  keys:       { wave: 'triangle', partials: [[12, 0.22], [19, 0.07]], cutoff: 2000, cutoffPeak: 4200, q: 0.8, attack: 0.004, decay: 0.9,  sustain: 0.10, release: 0.5,  vibratoHz: 0,   vibratoCents: 0,  scoopCents: 0,  noise: 0.08, gain: 0.30 },
  voice:      { wave: 'sine',     partials: [[12, 0.28], [19, 0.14], [24, 0.05]], cutoff: 1100, cutoffPeak: 2400, q: 4, attack: 0.10, decay: 0.2, sustain: 0.85, release: 0.35, vibratoHz: 5.0, vibratoCents: 14, scoopCents: 12, noise: 0.03, gain: 0.26 },
  electronic: { wave: 'square',   partials: [[0.08, 0.45], [12, 0.10]], cutoff: 600, cutoffPeak: 5000, q: 6,   attack: 0.01, decay: 0.35, sustain: 0.65, release: 0.3,  vibratoHz: 0,   vibratoCents: 0,  scoopCents: 0,  noise: 0.04, gain: 0.24 },
};

/** Short noise burst for the attack transient (bow bite, breath, mallet, pluck). */
function noiseBurst(c: AudioContext, dest: AudioNode, t: number, amount: number, bright: number) {
  if (amount <= 0) return;
  const len = Math.floor(c.sampleRate * 0.06);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = bright; bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(amount * 0.5, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  src.connect(bp).connect(g).connect(dest);
  src.start(t); src.stop(t + 0.08);
}

function playNote(c: AudioContext, dest: AudioNode, v: Voice, midi: number, t: number, dur: number): void {
  const freq = midiToFreq(midi);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass'; filter.Q.value = v.q;
  filter.frequency.setValueAtTime(v.cutoff, t);
  filter.frequency.linearRampToValueAtTime(v.cutoffPeak, t + v.attack + 0.02);
  filter.frequency.exponentialRampToValueAtTime(Math.max(v.cutoff * 0.8, 220), t + dur);

  const amp = c.createGain();
  const peak = v.gain;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(peak, t + v.attack);
  amp.gain.linearRampToValueAtTime(peak * v.sustain + 0.0001, t + v.attack + v.decay);
  amp.gain.setValueAtTime(peak * v.sustain + 0.0001, t + Math.max(dur - v.release, v.attack + v.decay));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  filter.connect(amp).connect(dest);

  // Vibrato LFO shared by all partials.
  let lfo: OscillatorNode | null = null, lfoGain: GainNode | null = null;
  if (v.vibratoHz > 0 && v.vibratoCents > 0) {
    lfo = c.createOscillator(); lfo.frequency.value = v.vibratoHz;
    lfoGain = c.createGain();
    lfoGain.gain.setValueAtTime(0, t);
    lfoGain.gain.linearRampToValueAtTime(v.vibratoCents, t + Math.min(0.35, dur * 0.5)); // vibrato eases in
    lfo.connect(lfoGain);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  }

  const mk = (semitoneOffset: number, gain: number) => {
    const osc = c.createOscillator();
    osc.type = v.wave;
    osc.frequency.value = freq * Math.pow(2, semitoneOffset / 12);
    if (v.scoopCents > 0) {
      osc.detune.setValueAtTime(-v.scoopCents, t);
      osc.detune.linearRampToValueAtTime(0, t + v.attack * 1.2);
    }
    if (lfoGain) lfoGain.connect(osc.detune);
    const g = c.createGain(); g.gain.value = gain;
    osc.connect(g).connect(filter);
    osc.start(t); osc.stop(t + dur + 0.05);
    return osc;
  };

  mk(0, 1);
  v.partials.forEach(([off, g]) => mk(off, g));
  noiseBurst(c, filter, t, v.noise, Math.min(freq * 4, 6000));
}

/**
 * A short musical gesture that shows the instrument off: rise through the triad, touch the
 * octave, settle back. Placed low-ish in the range for big instruments and high for small ones
 * by simply centring on the instrument's own written range.
 */
function demoPhrase(low: number, high: number): number[] {
  const span = high - low;
  // Sit ~30% up the range — comfortable tessitura rather than the extremes.
  let root = Math.round(low + span * 0.30);
  // Snap toward a C for a stable-sounding demo.
  root = root - ((root % 12) - 0) ;
  if (root < low) root += 12;
  if (root + 12 > high) root = Math.max(low, high - 12);
  const shape = [0, 4, 7, 12, 7];
  return shape.map(s => root + s).filter(n => n >= low - 1 && n <= high + 1);
}

/**
 * Unpitched percussion (snare, cymbals, congas, drum kit, 808) has no range and no melody, so
 * it gets a short rhythmic figure instead: a body thump plus a filtered noise crack per hit,
 * with the noise brightness deciding whether it reads as a low conga or a splashy cymbal.
 */
function playHit(c: AudioContext, dest: AudioNode, t: number, bodyHz: number, bright: number, noiseAmt: number, decay: number) {
  // Body: a fast pitch-dropping sine — the drum's fundamental.
  const osc = c.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(bodyHz * 1.7, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(bodyHz * 0.7, 30), t + decay * 0.7);
  const og = c.createGain();
  og.gain.setValueAtTime(0.34, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(og).connect(dest);
  osc.start(t); osc.stop(t + decay + 0.05);

  // Crack: bandpassed noise.
  const len = Math.floor(c.sampleRate * Math.min(decay, 0.5));
  const buf = c.createBuffer(1, Math.max(len, 64), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = c.createBufferSource(); src.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = bright; bp.Q.value = 0.7;
  const ng = c.createGain();
  ng.gain.setValueAtTime(noiseAmt, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(bp).connect(ng).connect(dest);
  src.start(t); src.stop(t + decay + 0.05);
}

function unpitchedFigure(name: string): { bodyHz: number; bright: number; noise: number; decay: number; pattern: number[] } {
  const n = name.toLowerCase();
  if (n.includes('cymbal')) return { bodyHz: 300, bright: 7000, noise: 0.34, decay: 1.4, pattern: [0, 0.9] };
  if (n.includes('conga'))  return { bodyHz: 190, bright: 1400, noise: 0.16, decay: 0.34, pattern: [0, 0.28, 0.5, 0.72, 0.95] };
  if (n.includes('snare'))  return { bodyHz: 190, bright: 3200, noise: 0.36, decay: 0.28, pattern: [0, 0.42, 0.62, 0.84] };
  // Drum kit / drum machine — a small backbeat pattern.
  return { bodyHz: 90, bright: 3000, noise: 0.28, decay: 0.34, pattern: [0, 0.45, 0.9, 1.35] };
}

export interface DemoHandle { stop: () => void; durationMs: number }

/** Play a short solo phrase demonstrating this instrument. Call from a click handler. */
export function playInstrumentDemo(instrument: Pick<Instrument, 'family' | 'range' | 'name'>): DemoHandle | null {
  const c = getCtx();
  if (!c || !master) return null;
  activeStop?.();                      // only one demo at a time

  const bus0 = c.createGain(); bus0.gain.value = 1; bus0.connect(master);

  // ── Unpitched percussion: a rhythmic figure, not a melody ──
  if (isUnpitched(instrument.range)) {
    const f = unpitchedFigure(instrument.name);
    const t0 = c.currentTime + 0.06;
    f.pattern.forEach(off => playHit(c, bus0, t0 + off, f.bodyHz, f.bright, f.noise, f.decay));
    const totalMs = ((f.pattern[f.pattern.length - 1] + f.decay) + 0.3) * 1000;
    let stopped0 = false;
    const stop0 = () => {
      if (stopped0) return; stopped0 = true;
      try {
        const now = c.currentTime;
        bus0.gain.cancelScheduledValues(now);
        bus0.gain.setValueAtTime(bus0.gain.value, now);
        bus0.gain.linearRampToValueAtTime(0.0001, now + 0.08);
        setTimeout(() => { try { bus0.disconnect(); } catch { /* */ } }, 200);
      } catch { /* */ }
      if (activeStop === stop0) activeStop = null;
    };
    activeStop = stop0;
    setTimeout(() => { if (activeStop === stop0) activeStop = null; }, totalMs);
    return { stop: stop0, durationMs: totalMs };
  }

  const v = VOICES[instrument.family] || VOICES.keys;
  // Instruments with no notated range (theremin, sampler, the DAW) get a mid register.
  const parsed = parseRange(instrument.range) || { low: 48, high: 84 };
  const notes = demoPhrase(parsed.low, parsed.high);
  if (!notes.length) { try { bus0.disconnect(); } catch { /* */ } return null; }

  // Percussion and keys decay fast, so play them a touch quicker and more detached.
  const fast = instrument.family === 'percussion' || instrument.family === 'keys';
  const step = fast ? 0.30 : 0.42;
  const hold = fast ? 0.55 : 0.60;
  const lastHold = fast ? 1.1 : 1.5;

  const bus = bus0;   // reuse the bus created above

  const t0 = c.currentTime + 0.06;
  notes.forEach((n, i) => {
    const isLast = i === notes.length - 1;
    playNote(c, bus, v, n, t0 + i * step, isLast ? lastHold : hold);
  });

  const totalMs = ((notes.length - 1) * step + lastHold + 0.3) * 1000;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      const now = c.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0.0001, now + 0.08);   // quick fade, no click
      setTimeout(() => { try { bus.disconnect(); } catch { /* */ } }, 200);
    } catch { /* */ }
    if (activeStop === stop) activeStop = null;
  };
  activeStop = stop;
  setTimeout(() => { if (activeStop === stop) activeStop = null; }, totalMs);

  return { stop, durationMs: totalMs };
}

/** Stop whatever demo is playing. */
export function stopInstrumentDemo(): void { activeStop?.(); }
