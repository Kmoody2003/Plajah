// Synthesised instruments. Pitched ones play through note(); sustained ones (kazoo, flute, whistle, pad, choir, whale, hum) also
// work as voice(): a held, pitch-bendable voice with vibrato and glide. Drum kit pieces take a GM-style number or a name.
// Everything is oscillators + filtered noise; nothing is sampled.

import { INSTRUMENT_LEVEL } from './calibration';
import { type Ctx, type SynthCtx, clamp, makeSynth, midiToHz, noise, partials, tone, getNoise } from './dsp';
import { isUnpitched, noteToMidi } from './notes';

export type InstFamily = 'plucked' | 'struck' | 'blown' | 'sustained' | 'bowed' | 'drum' | 'perc';

export interface SustainedVoice {
  setPitch(note: string | number, glideMs?: number): void;
  setGain(g: number): void;
  /** schedule the release at an absolute context time (used by timed notes and offline renders) */
  stopAt(time: number, releaseSec?: number): void;
  stop(releaseMs?: number): void;
  /** nodes to disconnect when everything has rung out */
  output: GainNode;
}

export interface InstrumentDef {
  id: string;
  label: string;
  family: InstFamily;
  /** can be held with voice() */
  sustained: boolean;
  /** trim so mid-velocity notes of every instrument sit at a comparable loudness */
  level: number;
  /** extra ring-out time after the note's length (seconds) used for voice-pool bookkeeping */
  tail: number;
  play(s: SynthCtx, midi: number, durSec: number, vel: number): void;
  voice?(c: Ctx, out: AudioNode, t: number, midi: number, gain: number, soft?: boolean): SustainedVoice;
}

const INST: InstrumentDef[] = [];
const amp = (vel: number) => 0.28 + 0.72 * clamp(vel, 0, 1);

// ───────────── plucked & struck ─────────────
INST.push({
  id: 'musicbox', label: 'Music box', family: 'struck', sustained: false, level: 0.95, tail: 1.2,
  play(s, m, _d, v) {
    const f = midiToHz(m); const d = clamp(2.4 - m / 45, 0.5, 1.7);
    partials(s, { f, parts: [[1, 1, 1], [2, 0.1, 0.5], [5.4, 0.16, 0.14]], dur: d, peak: 0.42 * amp(v) });
    noise(s, { color: 'white', dur: 0.008, peak: 0.05 * amp(v), hp: [6000], a: 0.001 });
  },
});
INST.push({
  id: 'marimba', label: 'Marimba', family: 'struck', sustained: false, level: 1, tail: 0.6,
  play(s, m, _d, v) {
    const f = midiToHz(m);
    tone(s, { f, dur: clamp(0.9 - m / 200, 0.3, 0.7), peak: 0.5 * amp(v), a: 0.002 });
    tone(s, { f: f * 3.93, dur: 0.1, peak: 0.2 * amp(v), a: 0.001 });
    noise(s, { color: 'pink', dur: 0.018, peak: 0.08 * amp(v), bp: [Math.min(6000, f * 4), Math.min(6000, f * 4), 1.5], a: 0.001 });
  },
});
INST.push({
  id: 'felt-piano', label: 'Felt piano', family: 'struck', sustained: false, level: 0.95, tail: 1.8,
  play(s, m, d, v) {
    const f = midiToHz(m); const len = clamp(2.8 - m / 40, 0.8, 2.2); const a = amp(v);
    tone(s, { type: 'triangle', f, detuneCents: -3, dur: len, peak: 0.34 * a, a: 0.004, lp: 3000 * (0.6 + a * 0.6), lpEnd: 650, q: 0.5 });
    tone(s, { type: 'triangle', f, detuneCents: 3, dur: len, peak: 0.3 * a, a: 0.004, lp: 3000 * (0.6 + a * 0.6), lpEnd: 650, q: 0.5 });
    tone(s, { type: 'sine', f: f * 2, dur: len * 0.5, peak: 0.08 * a, a: 0.004 });
    noise(s, { color: 'brown', dur: 0.04, peak: 0.12 * a, lp: [700], a: 0.002 });
    void d;
  },
});
INST.push({
  id: 'harp', label: 'Harp', family: 'plucked', sustained: false, level: 1, tail: 1.4,
  play(s, m, _d, v) {
    const f = midiToHz(m); const a = amp(v);
    partials(s, { f, parts: [[1, 1, 1], [2, 0.4, 0.6], [3, 0.2, 0.4], [4, 0.1, 0.25], [5, 0.05, 0.2]], dur: clamp(2.4 - m / 50, 0.7, 1.7), peak: 0.4 * a, type: 'triangle', lp: 5000 });
    noise(s, { color: 'white', dur: 0.01, peak: 0.07 * a, hp: [3000], a: 0.001 });
  },
});
INST.push({
  id: 'pluck', label: 'Pluck', family: 'plucked', sustained: false, level: 1, tail: 0.5,
  play(s, m, _d, v) {
    const f = midiToHz(m); const a = amp(v);
    tone(s, { type: 'sawtooth', f, dur: 0.55, peak: 0.3 * a, a: 0.002, lp: Math.min(7000, f * 12), lpEnd: Math.max(300, f * 1.5), q: 1.5 });
    tone(s, { type: 'triangle', f: f / 2, dur: 0.4, peak: 0.16 * a, a: 0.002 });
  },
});
INST.push({
  id: 'kalimba', label: 'Kalimba', family: 'plucked', sustained: false, level: 1, tail: 0.9,
  play(s, m, _d, v) {
    const f = midiToHz(m); const a = amp(v);
    partials(s, { f, parts: [[1, 1, 1], [5.4, 0.28, 0.2], [8.9, 0.1, 0.12]], dur: 1.0, peak: 0.45 * a });
    noise(s, { color: 'brown', dur: 0.02, peak: 0.08 * a, lp: [1500], a: 0.001 });
  },
});
INST.push({
  id: 'bell', label: 'Bell', family: 'struck', sustained: false, level: 0.85, tail: 2.4,
  play(s, m, _d, v) {
    partials(s, { f: midiToHz(m), parts: [[0.5, 0.5, 1.2], [0.92, 0.55, 1], [1.19, 1, 0.9], [1.71, 0.6, 0.6], [2, 0.4, 0.6], [2.74, 0.3, 0.4], [3, 0.2, 0.3]], dur: 2.3, peak: 0.34 * amp(v) });
  },
});
INST.push({
  id: 'glass', label: 'Glass', family: 'struck', sustained: false, level: 0.9, tail: 1.6,
  play(s, m, _d, v) {
    partials(s, { f: midiToHz(m), parts: [[1, 1, 1], [2.32, 0.5, 0.6], [4.25, 0.3, 0.4], [6.63, 0.14, 0.3]], dur: 1.6, peak: 0.36 * amp(v) });
  },
});
INST.push({
  id: 'bass', label: 'Bass', family: 'plucked', sustained: false, level: 1, tail: 0.15,
  play(s, m, d, v) {
    const f = midiToHz(m); const a = amp(v); const len = Math.max(0.14, d * 0.95);
    tone(s, { type: 'sine', f, dur: len, shape: 'flat', a: 0.01, rel: 0.1, peak: 0.5 * a });
    tone(s, { type: 'sawtooth', f, dur: len, shape: 'flat', a: 0.008, rel: 0.08, peak: 0.16 * a, lp: Math.min(900, f * 5), lpEnd: Math.max(150, f * 2), q: 1 });
  },
});

// ───────────── sustained voices ─────────────
interface SusSpec {
  oscs: Array<{ type: OscillatorType; ratio: number; cents?: number; amp: number }>;
  lp?: (hz: number) => number; q?: number;
  formants?: Array<[f: number, q: number, g: number]>;
  vibHz: number; vibCents: number; vibDelay: number;
  attack: number; release: number;
  breath?: { amp: number; mult: number; q: number };
  peak: number;
}

function buildSustained(spec: SusSpec) {
  return (c: Ctx, out: AudioNode, t: number, midi: number, gain: number, soft?: boolean): SustainedVoice => {
    const hz0 = midiToHz(midi);
    const vg = c.createGain();
    const att = Math.max(spec.attack, soft ? 0.05 : 0.01);
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.linearRampToValueAtTime(Math.max(0.0001, spec.peak * gain), t + att);
    vg.connect(out);
    const sum = c.createGain(); sum.gain.value = 1;
    let chain: AudioNode = sum;
    if (spec.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = spec.lp(hz0); lp.Q.value = spec.q ?? 0.7; sum.connect(lp); chain = lp; }
    if (spec.formants) {
      const mix = c.createGain(); mix.gain.value = 1;
      for (const [f, q, g] of spec.formants) { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const fg = c.createGain(); fg.gain.value = g; chain.connect(bp); bp.connect(fg); fg.connect(mix); }
      chain = mix;
    }
    chain.connect(vg);
    const oscs: OscillatorNode[] = [];
    for (const o of spec.oscs) {
      const osc = c.createOscillator(); osc.type = o.type; osc.frequency.value = hz0 * o.ratio; osc.detune.value = o.cents ?? 0;
      const og = c.createGain(); og.gain.value = o.amp; osc.connect(og); og.connect(sum); osc.start(t); oscs.push(osc);
    }
    const srcs: AudioScheduledSourceNode[] = [...oscs];
    // vibrato: fades in after vibDelay so the note starts steady (kazoo/flute/whistle behaviour)
    const lfo = c.createOscillator(); lfo.frequency.value = spec.vibHz;
    const lg = c.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(spec.vibCents, t + spec.vibDelay + 0.3);
    lfo.connect(lg); for (const o of oscs) lg.connect(o.detune);
    lfo.start(t); srcs.push(lfo);
    if (spec.breath) {
      const n = c.createBufferSource(); n.buffer = getNoise(c, 'pink'); n.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, hz0 * spec.breath.mult); bp.Q.value = spec.breath.q;
      const bg = c.createGain(); bg.gain.value = spec.breath.amp; n.connect(bp); bp.connect(bg); bg.connect(vg); n.start(t); srcs.push(n);
    }
    let stopped = false;
    let curPeak = Math.max(0.0001, spec.peak * gain);
    const stopAt = (time: number, rel = spec.release) => {
      if (stopped) return; stopped = true;
      const r = Math.max(0.03, rel);
      vg.gain.cancelScheduledValues(time);
      // a note shorter than its attack never reaches full level: start the release from where the ramp had got to
      const lvl = time <= t + att ? curPeak * Math.max(0, (time - t) / att) : curPeak;
      vg.gain.setValueAtTime(Math.max(0.0001, lvl), time);
      vg.gain.setTargetAtTime(0.0001, time, r / 4);
      for (const s of srcs) { try { s.stop(time + r + 0.1); } catch { /* already stopped */ } }
    };
    return {
      output: vg,
      setPitch(note, glideMs = 60) {
        const m = noteToMidi(note); if (m == null || stopped) return;
        const now = c.currentTime; const tc = Math.max(0.004, glideMs / 1000 / 3);
        const hz = midiToHz(m);
        spec.oscs.forEach((o, i) => { oscs[i].frequency.cancelScheduledValues(now); oscs[i].frequency.setTargetAtTime(hz * o.ratio, now, tc); });
      },
      setGain(g) { if (stopped) return; const now = c.currentTime; curPeak = Math.max(0.0001, spec.peak * clamp(g, 0, 2)); vg.gain.cancelScheduledValues(now); vg.gain.setTargetAtTime(curPeak, now, 0.03); },
      stopAt,
      stop(releaseMs) { stopAt(c.currentTime, releaseMs != null ? releaseMs / 1000 : spec.release); },
    };
  };
}

function sustainedInst(id: string, label: string, family: InstFamily, level: number, spec: SusSpec): InstrumentDef {
  const voice = buildSustained(spec);
  return {
    id, label, family, sustained: true, level, tail: spec.release,
    voice,
    play(s, midi, durSec, vel) {
      const dur = Math.max(0.08, durSec);
      const v = voice(s.c, s.out, s.t, midi, amp(vel), s.soft);
      v.stopAt(s.t + dur);
      s.end = Math.max(s.end, dur + spec.release + 0.1);
    },
  };
}

INST.push(sustainedInst('flute', 'Flute', 'blown', 1, {
  oscs: [{ type: 'sine', ratio: 1, amp: 1 }, { type: 'sine', ratio: 2, amp: 0.14 }, { type: 'sine', ratio: 3, amp: 0.04 }],
  lp: (h) => Math.min(5000, h * 6), vibHz: 5.2, vibCents: 14, vibDelay: 0.3, attack: 0.07, release: 0.12,
  breath: { amp: 0.05, mult: 2, q: 3 }, peak: 0.4,
}));
INST.push(sustainedInst('whistle', 'Whistle', 'blown', 0.9, {
  oscs: [{ type: 'sine', ratio: 1, amp: 1 }, { type: 'sine', ratio: 2, amp: 0.03 }],
  vibHz: 5.6, vibCents: 22, vibDelay: 0.25, attack: 0.05, release: 0.09,
  breath: { amp: 0.02, mult: 1.5, q: 6 }, peak: 0.34,
}));
INST.push(sustainedInst('kazoo', 'Kazoo', 'blown', 1, {
  oscs: [{ type: 'sawtooth', ratio: 1, amp: 0.9 }, { type: 'square', ratio: 1.004, amp: 0.25 }],
  lp: () => 4200, formants: [[1400, 1.1, 1], [2600, 1.5, 0.35]], vibHz: 6, vibCents: 24, vibDelay: 0.08, attack: 0.025, release: 0.07, peak: 0.34,
}));
INST.push(sustainedInst('pad', 'Pad', 'sustained', 0.9, {
  oscs: [{ type: 'sawtooth', ratio: 1, cents: -9, amp: 0.5 }, { type: 'sawtooth', ratio: 1, cents: 0, amp: 0.5 }, { type: 'sawtooth', ratio: 1, cents: 9, amp: 0.5 }, { type: 'sine', ratio: 0.5, amp: 0.5 }],
  lp: (h) => Math.min(1800, 500 + h * 1.5), q: 0.5, vibHz: 0.4, vibCents: 6, vibDelay: 1, attack: 0.45, release: 0.9, peak: 0.28,
}));
INST.push(sustainedInst('choir', 'Choir (ahh)', 'sustained', 1, {
  oscs: [{ type: 'sawtooth', ratio: 1, cents: -12, amp: 0.4 }, { type: 'sawtooth', ratio: 1, cents: 0, amp: 0.4 }, { type: 'sawtooth', ratio: 1, cents: 12, amp: 0.4 }],
  formants: [[800, 5, 1], [1150, 6, 0.5], [2900, 8, 0.14]], vibHz: 5, vibCents: 14, vibDelay: 0.4, attack: 0.3, release: 0.7, peak: 1.1,
}));
INST.push(sustainedInst('whale', 'Whale song', 'sustained', 1, {
  oscs: [{ type: 'sine', ratio: 1, amp: 1 }, { type: 'sine', ratio: 2, amp: 0.25 }, { type: 'sine', ratio: 3, amp: 0.06 }],
  lp: () => 900, vibHz: 4, vibCents: 26, vibDelay: 0.5, attack: 0.8, release: 1.2, peak: 0.4,
}));
INST.push(sustainedInst('hum', 'Thread hum', 'sustained', 1, {
  oscs: [{ type: 'triangle', ratio: 1, amp: 1 }, { type: 'sine', ratio: 2, amp: 0.12 }],
  lp: () => 800, vibHz: 5, vibCents: 14, vibDelay: 0.3, attack: 0.22, release: 0.4, peak: 0.36,
}));

// ───────────── drum kit pieces ─────────────
type Hit = (s: SynthCtx, vel: number, midi: number) => void;
const hits: Record<string, { label: string; tail: number; level: number; hit: Hit }> = {
  kick: { label: 'Kick', tail: 0.4, level: 1, hit: (s, v) => { const a = amp(v); tone(s, { f: 150, f2: 46, bendEnd: 0.35, dur: 0.4, peak: 0.75 * a, a: 0.002 }); noise(s, { color: 'brown', dur: 0.025, peak: 0.2 * a, lp: [900], a: 0.001 }); } },
  snare: { label: 'Snare', tail: 0.3, level: 1, hit: (s, v) => { const a = amp(v); noise(s, { color: 'white', dur: 0.2, peak: 0.42 * a, bp: [2200, 1600, 0.7], a: 0.001 }); tone(s, { type: 'triangle', f: 200, f2: 150, dur: 0.1, peak: 0.34 * a, a: 0.001 }); } },
  hat: { label: 'Hi-hat', tail: 0.1, level: 1, hit: (s, v) => { noise(s, { color: 'white', dur: 0.055, peak: 0.5 * amp(v), hp: [7000], a: 0.001 }); } },
  ohat: { label: 'Open hat', tail: 0.3, level: 1, hit: (s, v) => { noise(s, { color: 'white', dur: 0.28, peak: 0.45 * amp(v), hp: [6500], a: 0.001 }); } },
  shaker: { label: 'Shaker', tail: 0.12, level: 1, hit: (s, v) => { noise(s, { color: 'white', dur: 0.1, shape: 'swell', a: 0.02, rel: 0.07, peak: 0.6 * amp(v), bp: [5600, 5600, 0.9] }); } },
  click: { label: 'Click', tail: 0.05, level: 1, hit: (s, v) => { tone(s, { f: 1500, dur: 0.02, peak: 0.34 * amp(v), a: 0.001 }); noise(s, { color: 'white', dur: 0.008, peak: 0.16 * amp(v), hp: [4000], a: 0.001 }); } },
  clap: { label: 'Clap', tail: 0.3, level: 1, hit: (s, v) => { const a = amp(v); [0, 0.011, 0.024].forEach((at) => noise(s, { color: 'white', at, dur: 0.02, peak: 0.9 * a, bp: [1300, 1300, 0.8], a: 0.001 })); noise(s, { color: 'white', at: 0.03, dur: 0.14, peak: 0.6 * a, bp: [1200, 900, 0.8] }); } },
  tom: { label: 'Tom', tail: 0.4, level: 1, hit: (s, v, m) => { const f = midiToHz(m || 50) * 1.0; tone(s, { f: f * 1.5, f2: f, bendEnd: 0.4, dur: 0.38, peak: 0.6 * amp(v), a: 0.002 }); noise(s, { color: 'pink', dur: 0.02, peak: 0.1 * amp(v), bp: [1200, 1200, 1], a: 0.001 }); } },
};
const GM: Record<number, string> = { 35: 'kick', 36: 'kick', 37: 'click', 38: 'snare', 39: 'clap', 40: 'snare', 41: 'tom', 42: 'hat', 43: 'tom', 44: 'hat', 45: 'tom', 46: 'ohat', 47: 'tom', 48: 'tom', 70: 'shaker' };
const KIT_NAMES: Record<string, string> = { kick: 'kick', bd: 'kick', snare: 'snare', sd: 'snare', hat: 'hat', hh: 'hat', ohat: 'ohat', openhat: 'ohat', shaker: 'shaker', click: 'click', clap: 'clap', tom: 'tom' };

export function resolveDrumPiece(n: string | number): string {
  if (typeof n === 'number') return GM[Math.round(n)] ?? 'click';
  const k = n.trim().toLowerCase();
  if (KIT_NAMES[k]) return KIT_NAMES[k];
  const m = noteToMidi(n);
  return m != null ? GM[Math.round(m)] ?? 'click' : 'kick';
}

for (const [id, h] of Object.entries(hits)) {
  INST.push({
    id: id === 'ohat' ? 'ohat' : id, label: h.label, family: 'drum', sustained: false, level: h.level, tail: h.tail,
    play(s, midi, _d, v) { h.hit(s, v, midi); },
  });
}
INST.push({
  id: 'drum', label: 'Drum kit', family: 'drum', sustained: false, level: 1, tail: 0.4,
  play(s, midi, _d, v) { const piece = hits[GM[Math.round(midi)] ?? 'click']; piece.hit(s, v, midi); },
});

// ───────────── registry & helpers ─────────────
for (const i of INST) if (INSTRUMENT_LEVEL[i.id] != null) i.level = INSTRUMENT_LEVEL[i.id];
export const INSTRUMENTS: readonly InstrumentDef[] = INST;
export const INSTRUMENT_BY_ID: ReadonlyMap<string, InstrumentDef> = new Map(INST.map((i) => [i.id, i]));
export const INSTRUMENT_ALIASES: Record<string, string> = {
  'music-box': 'musicbox', piano: 'felt-piano', felt: 'felt-piano', xylophone: 'marimba', guitar: 'pluck', strings: 'pad', ahh: 'choir', drums: 'drum', hihat: 'hat', synth: 'pad', 'thread-hum': 'hum', 'whale-song': 'whale',
};
export const SUSTAINED_IDS: readonly string[] = INST.filter((i) => i.sustained).map((i) => i.id);

export function resolveInstrument(id: string): InstrumentDef | undefined {
  return INSTRUMENT_BY_ID.get(id) ?? INSTRUMENT_BY_ID.get(INSTRUMENT_ALIASES[id]);
}

/** MIDI number to play for a score/api note on a given instrument. Drum kit pieces take names ('kick') or 'x'. */
export function noteForInstrument(inst: InstrumentDef, note: string | number): number | null {
  if (inst.family === 'drum') {
    if (inst.id === 'drum') {
      if (typeof note === 'string' && isUnpitched(note)) return 36;
      const piece = resolveDrumPiece(note);
      return ({ kick: 36, snare: 38, hat: 42, ohat: 46, clap: 39, tom: 45, shaker: 70, click: 37 } as Record<string, number>)[piece] ?? 36;
    }
    if (typeof note === 'string' && isUnpitched(note)) return 50;
    return noteToMidi(note) ?? 50;
  }
  if (typeof note === 'string' && isUnpitched(note)) return 60;
  return noteToMidi(note);
}

export interface NotePlayOpts { durationMs?: number; gain?: number; vel?: number; seed?: number; soft?: boolean; variation?: number }
/** Play one note into `out` at time t. Returns seconds until it has rung out (0 if the instrument/note is unknown). */
export function playNoteInto(c: Ctx, out: AudioNode, t: number, instrument: string, note: string | number, o: NotePlayOpts = {}): number {
  const inst = resolveInstrument(instrument);
  if (!inst) return 0;
  const midi = noteForInstrument(inst, note);
  if (midi == null) return 0;
  const g = c.createGain(); g.gain.value = inst.level * (o.gain ?? 1); g.connect(out);
  const s = makeSynth(c, g, t, { variation: o.variation ?? 0, seed: o.seed, soft: o.soft });
  const dur = (o.durationMs ?? 400) / 1000;
  inst.play(s, midi, dur, o.vel ?? 0.7);
  return Math.max(s.end, dur + inst.tail);
}
