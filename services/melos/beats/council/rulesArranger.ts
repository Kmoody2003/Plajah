// Melos Beats — the council's arranger, in plain code. The parts that have to be RIGHT more than
// they have to be inspired — bass, harmony, pads, arpeggios — are written from the chords the song
// already implies (or a progression in its key when the region is empty), voiced with smooth voice
// leading, with rhythm and dynamics from the mood the user described. The same code writes a
// fallback melody and counter-melody when no on-device model is available, so the council always
// answers. No model, no network — tested like the rest of the council.

import { syllables, type ComposeContext, type ContextBar, type PartRole } from './composeContext';
import type { ComposedNote } from './composeCouncil';
import { PROGRESSIONS, realiseProgression, scalePitchClasses, chordById } from '../../theory';

export interface Mood {
  /** 0 calm … 1 driving — note density and rhythm. */
  energy: number;
  /** 0 dark … 1 bright — register and chord colour. */
  brightness: number;
  /** 0 flat … 1 rising — where the line heads by the end ("lift", "build", "soar"). */
  lift: number;
}

const WORDS: [RegExp, Partial<Mood>][] = [
  [/\b(calm|still|gentle|soft|tender|quiet|held back|restrained|intimate|sparse|slow|lullaby|ambient|peace)/i, { energy: -0.25 }],
  [/\b(driving|energetic|urgent|hype|fast|busy|dance|bounce|running|fierce|anthem|explosive|aggressive)/i, { energy: 0.3 }],
  [/\b(groove|funky|syncopat|swing)/i, { energy: 0.15 }],
  [/\b(dark|sad|grief|lonely|cold|haunt|melanchol|menac|ominous|bitter|minor)/i, { brightness: -0.3 }],
  [/\b(bright|hope|joy|warm|happy|light|sunny|uplift|triumph|major|golden)/i, { brightness: 0.3 }],
  [/\b(lift|rise|rising|build|soar|climb|swell|crescendo|ascend|open up)/i, { lift: 0.6 }],
];

export function readMood(text: string): Mood {
  const m: Mood = { energy: 0.45, brightness: 0.5, lift: 0.2 };
  for (const [re, d] of WORDS) {
    if (!re.test(text)) continue;
    m.energy += d.energy ?? 0; m.brightness += d.brightness ?? 0; m.lift = Math.max(m.lift, d.lift ?? 0);
  }
  m.energy = Math.max(0, Math.min(1, m.energy)); m.brightness = Math.max(0, Math.min(1, m.brightness));
  return m;
}

export interface BarChord { at: number; beats: number; pcs: number[]; bar: number; lyric?: string }

/** The region's chords bar by bar: implied by the tracks, or a progression in the key when silent. */
export function regionChords(ctx: ComposeContext, mood: Mood): BarChord[] {
  const bars = ctx.bars.filter((b) => b.inRegion);
  const known = bars.filter((b) => b.chordPcs?.length);
  let prog: number[][] | null = null;
  if (known.length < bars.length) {
    const minorish = scalePitchClasses(ctx.song.keyPc, ctx.song.scaleId)[(ctx.song.keyPc + 3) % 12];
    const pick = minorish
      ? PROGRESSIONS.find((p) => p.id === (mood.brightness < 0.4 ? 'drill' : 'sad-pop'))
      : PROGRESSIONS.find((p) => p.id === (mood.brightness < 0.4 ? 'sad-pop' : 'pop'));
    const prog0 = pick ?? PROGRESSIONS[0];
    // A major-mode progression in a minor key is played from the relative major (and vice versa).
    const root = prog0.mode === 'minor'
      ? (minorish ? ctx.song.keyPc : (ctx.song.keyPc + 9) % 12)
      : (minorish ? (ctx.song.keyPc + 3) % 12 : ctx.song.keyPc);
    const chords = realiseProgression(prog0, root);
    prog = chords.map((c) => chordById(c.chordId).intervals.map((i) => (c.rootPc + i) % 12));
  }
  let last: number[] | undefined;
  return bars.map((b: ContextBar, i) => {
    const pcs = b.chordPcs?.length ? b.chordPcs : last && i % 2 === 1 && b.beats <= 3 ? last : prog![i % prog!.length];
    last = pcs;
    return { at: b.at, beats: b.beats, pcs, bar: b.bar, lyric: b.lyric };
  });
}

const scaleSet = (ctx: ComposeContext) => scalePitchClasses(ctx.song.keyPc, ctx.song.scaleId);

/** Nearest MIDI note with pitch class `pc` to `target`. */
const nearestPc = (pc: number, target: number) => {
  const base = target - (((target - pc) % 12) + 12) % 12;
  return target - base > 6 ? base + 12 : base;
};

/** Voice a chord (3–4 voices) inside [lo, hi], choosing the inversion closest to `prev`. */
export function voiceChord(pcs: number[], center: number, prev?: number[], voices = 4): number[] {
  const tones = pcs.slice(0, voices);
  while (tones.length < Math.min(voices, 3)) tones.push(tones[0]);
  const options: number[][] = [];
  for (let inv = 0; inv < tones.length; inv++) {
    const order = [...tones.slice(inv), ...tones.slice(0, inv)];
    const v: number[] = [];
    let p = nearestPc(order[0], center - 5);
    v.push(p);
    for (const pc of order.slice(1)) { p = p + ((((pc - p) % 12) + 12) % 12 || 12); v.push(p); }
    options.push(v);
  }
  const cost = (v: number[]) => prev
    ? v.reduce((s, x, i) => s + Math.abs(x - (prev[i] ?? prev[prev.length - 1])), 0)
    : Math.abs(v.reduce((a, x) => a + x, 0) / v.length - center);
  return options.sort((a, b) => cost(a) - cost(b))[0];
}

const vel = (base: number, mood: Mood, accent = 0) => Math.max(20, Math.min(120, Math.round(base + mood.energy * 22 + accent)));

function bassPart(chords: BarChord[], mood: Mood): ComposedNote[] {
  const out: ComposedNote[] = [];
  for (const [i, c] of chords.entries()) {
    const root = nearestPc(c.pcs[0], 38);
    const fifth = root + 7 <= 52 ? root + 7 : root - 5;
    if (mood.energy < 0.35) out.push({ start: c.at, length: c.beats, pitch: root, velocity: vel(78, mood) });
    else if (mood.energy < 0.7) {
      const half = Math.max(1, Math.floor(c.beats / 2));
      out.push({ start: c.at, length: half, pitch: root, velocity: vel(84, mood, 6) });
      out.push({ start: c.at + half, length: c.beats - half, pitch: i % 2 ? root : fifth, velocity: vel(76, mood) });
    } else {
      for (let t = 0; t < c.beats - 1e-6; t += 0.5) {
        const p = Math.abs(t % 2 - 1.5) < 1e-6 ? root + 12 : root;
        out.push({ start: c.at + t, length: 0.45, pitch: p, velocity: vel(t % 1 ? 70 : 86, mood) });
      }
    }
  }
  return out;
}

function harmonyPart(chords: BarChord[], mood: Mood): ComposedNote[] {
  const out: ComposedNote[] = [];
  let prev: number[] | undefined;
  const center = 60 + Math.round((mood.brightness - 0.5) * 6);
  for (const c of chords) {
    const v = voiceChord(c.pcs, center, prev);
    prev = v;
    const hits = mood.energy < 0.35 ? [[0, c.beats]]
      : mood.energy < 0.7 ? [[0, c.beats / 2], [c.beats / 2, c.beats / 2]]
        : [[0, 0.75], [1.5, 0.5], [2, 0.75], [3.5, 0.5]].filter(([t]) => t < c.beats);
    for (const [t, len] of hits) for (const p of v) out.push({ start: c.at + t, length: len, pitch: p, velocity: vel(t ? 62 : 70, mood) });
  }
  return out;
}

function padPart(chords: BarChord[], mood: Mood): ComposedNote[] {
  const out: ComposedNote[] = [];
  let prev: number[] | undefined;
  for (let i = 0; i < chords.length; i++) {
    const c = chords[i];
    const v = voiceChord(c.pcs, 58, prev, 4);
    // Hold through repeated chords.
    let len = c.beats;
    while (i + 1 < chords.length && chords[i + 1].pcs.join() === c.pcs.join()) { len += chords[i + 1].beats; i++; }
    prev = v;
    for (const p of [v[0] - 12, ...v.slice(1)]) out.push({ start: c.at, length: len, pitch: Math.max(40, p), velocity: vel(48, mood, -8) });
  }
  return out;
}

function arpPart(chords: BarChord[], mood: Mood): ComposedNote[] {
  const out: ComposedNote[] = [];
  const step = mood.energy > 0.6 ? 0.25 : 0.5;
  let prev: number[] | undefined;
  for (const c of chords) {
    const v = voiceChord(c.pcs, 64, prev, 3);
    prev = v;
    const seq = [...v, v[0] + 12, ...v.slice(1).map((x) => x + 12), ...v.slice(1).reverse().map((x) => x + 12), v[0] + 12, ...v.slice(1).reverse()];
    let k = 0;
    for (let t = 0; t < c.beats - 1e-6; t += step, k++) out.push({ start: c.at + t, length: step * 0.9, pitch: seq[k % seq.length], velocity: vel(k % 4 ? 58 : 70, mood) });
  }
  return out;
}

/** Fallback melody: one note per syllable where there are lyrics (else a phrase every two bars),
 *  an arch contour in scale steps, chord tones on each bar's downbeat and middle, an even rhythm,
 *  a breath at the end of each phrase, and a higher peak on the last phrase when the mood lifts. */
export function fallbackMelody(ctx: ComposeContext, chords: BarChord[], mood: Mood, sung: boolean): ComposedNote[] {
  const inScale = scaleSet(ctx);
  const scale: number[] = [];
  for (let m = 45; m <= 88; m++) if (inScale[m % 12]) scale.push(m);
  const home = sung ? 64 + Math.round(mood.brightness * 3) : 69 + Math.round(mood.brightness * 3);
  const homeIdx = scale.findIndex((x) => x >= home);
  const chordAt = (t: number) => [...chords].reverse().find((c) => c.at <= t + 1e-6) ?? chords[0];
  const barStrong = (t: number) => {
    const c = chordAt(t);
    const into = t - c.at;
    return Math.abs(into) < 1e-6 || Math.abs(into - c.beats / 2) < 1e-6;
  };

  const lines = ctx.lyrics.filter((l) => l.inRegion);
  const phrases: { from: number; to: number; n: number }[] = [];
  if (sung && lines.length) {
    for (const [i, l] of lines.entries()) {
      const from = ctx.bars.find((b) => b.bar === l.bar)?.at ?? 0;
      const next = lines[i + 1] ? ctx.bars.find((b) => b.bar === lines[i + 1].bar)?.at : undefined;
      phrases.push({ from, to: next ?? ctx.region.beats, n: Math.max(2, syllables(l.text)) });
    }
  } else {
    for (let i = 0; i < chords.length; i += 2) {
      const to = chords[i + 2]?.at ?? ctx.region.beats;
      phrases.push({ from: chords[i].at, to, n: Math.max(3, Math.round((to - chords[i].at) * (0.6 + mood.energy * 0.8))) });
    }
  }

  const out: ComposedNote[] = [];
  for (const [pi, ph] of phrases.entries()) {
    const room = (ph.to - ph.from) * 0.85;                       // the rest is a breath
    const grids = [2, 1, 0.5, 0.25];
    const step = grids.find((g) => g * ph.n <= room + 1e-6) ?? 0.25;
    const last = pi === phrases.length - 1;
    const peak = 3 + (last ? Math.round(mood.lift * 3) : 0) + (pi % 2);
    const peakAt = Math.max(1, Math.round(ph.n * 0.6));
    let prev: number | undefined;
    for (let k = 0; k < ph.n; k++) {
      const start = ph.from + k * step;
      if (start >= ph.to - 0.24 || start >= ctx.region.beats) break;
      // Arch: climb to the peak, fall back, end a step above home (or on the peak when it lifts).
      const shape = k <= peakAt ? (peak * k) / peakAt : peak - ((peak - 1) * (k - peakAt)) / Math.max(1, ph.n - 1 - peakAt);
      let pitch = scale[Math.max(0, Math.min(scale.length - 1, homeIdx + Math.round(shape)))];
      if (barStrong(start)) {
        const c = chordAt(start);
        pitch = c.pcs.slice(0, 3).map((pc) => nearestPc(pc, pitch)).sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch))[0];
      }
      if (prev !== undefined && pitch === prev && k % 2 === 1) {
        // Don't drone: step to the neighbour in the contour's direction.
        const i = scale.indexOf(pitch);
        pitch = scale[Math.max(0, Math.min(scale.length - 1, i + (k < peakAt ? 1 : -1)))] ?? pitch;
      }
      prev = pitch;
      const end = k === ph.n - 1 ? Math.min(ph.to - 0.5, start + step * 2) : start + step;
      out.push({ start, length: Math.max(0.25, end - start), pitch, velocity: vel(70 + (k === peakAt ? 10 : 0), mood) });
    }
  }
  return out;
}

/** Fallback counter-melody: guide tones (3rds and 7ths) in long notes, kept in a middle register
 *  and moving by the smallest step, so it answers the melody instead of climbing over it. */
export function fallbackCounter(chords: BarChord[], mood: Mood): ComposedNote[] {
  const out: ComposedNote[] = [];
  let cur = 64;
  for (const c of chords) {
    const guides = [c.pcs[1], c.pcs[3] ?? c.pcs[2]].filter((x) => x !== undefined) as number[];
    const half = c.beats >= 4 ? c.beats / 2 : c.beats;
    for (let t = 0, i = 0; t < c.beats - 1e-6; t += half, i++) {
      const pc = guides[i % guides.length];
      // Nearest to where it is, pulled towards the middle of the staff.
      cur = nearestPc(pc, Math.round(cur * 0.6 + 64 * 0.4));
      out.push({ start: c.at + t, length: half, pitch: cur, velocity: vel(60, mood) });
    }
  }
  return out;
}

/** A short fill in the last bar: a scale run into the next downbeat. */
function fillPart(ctx: ComposeContext, chords: BarChord[], mood: Mood): ComposedNote[] {
  const last = chords[chords.length - 1];
  const inScale = scaleSet(ctx);
  const notes: number[] = [];
  for (let m = 60; m <= 84; m++) if (inScale[m % 12]) notes.push(m);
  const step = mood.energy > 0.5 ? 0.25 : 0.5;
  const out: ComposedNote[] = [];
  const startT = last.at + last.beats / 2;
  let i = notes.indexOf(nearestPc(last.pcs[0], 64));
  if (i < 0) i = 0;
  for (let t = startT, k = 0; t < last.at + last.beats - 1e-6; t += step, k++) {
    out.push({ start: t, length: step * 0.9, pitch: notes[Math.min(notes.length - 1, i + k)], velocity: vel(66 + k * 3, mood) });
  }
  return out;
}

/** Breathe: a gentle swell across each two-bar phrase, louder towards the end when it lifts. */
function phrase(notes: ComposedNote[], ctx: ComposeContext, mood: Mood): ComposedNote[] {
  const span = Math.max(1, ctx.region.beats);
  const two = (ctx.bars.find((b) => b.inRegion)?.beats ?? 4) * 2;
  return notes.map((n) => ({
    ...n,
    velocity: Math.max(1, Math.min(127, Math.round(n.velocity + 7 * Math.sin(Math.PI * ((n.start % two) / two)) + mood.lift * 8 * (n.start / span)))),
  }));
}

/** Write one role from the rules. */
export function arrangeRole(role: PartRole, ctx: ComposeContext, chords: BarChord[], mood: Mood): ComposedNote[] {
  return phrase(writeRole(role, ctx, chords, mood), ctx, mood);
}

function writeRole(role: PartRole, ctx: ComposeContext, chords: BarChord[], mood: Mood): ComposedNote[] {
  switch (role) {
    case 'bass': return bassPart(chords, mood);
    case 'harmony': return harmonyPart(chords, mood);
    case 'pad': return padPart(chords, mood);
    case 'arp': return arpPart(chords, mood);
    case 'fill': return fillPart(ctx, chords, mood);
    case 'counter-melody': return fallbackCounter(chords, mood);
    case 'melody': return fallbackMelody(ctx, chords, mood, ctx.lyrics.some((l) => l.inRegion));
  }
}

/** The instrument each role reaches for by default. */
export function defaultInstrument(role: PartRole, sung: boolean) {
  return ({ bass: 'bajo', harmony: 'aura', pad: 'aura', arp: 'onda', fill: 'vela', 'counter-melody': 'pneuma', melody: sung ? 'cantus' : 'onda' } as const)[role];
}

/** Roles whose notes the on-device model writes (when one is available); the rest are rules. */
export const MODEL_ROLES: PartRole[] = ['melody', 'counter-melody'];

