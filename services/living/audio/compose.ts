// Composition helpers: write a score in a few lines of code.
//
//   parseNotation('C4:1 E4:.5 G4:.5 | rest:1 [C4,E4,G4]:2')      compact notation -> ScoreNote[]
//   parseAbc('C D E F | G2 A2 | [CEG]4', { unit: 0.5 })             ABC-like notation
//   scale('C4', 'pentatonic', 2), degree('C4','major', 9), chord('C4','min7'), diatonicChord(...), progression(...)
//   arpeggiate(chordNotes, { pattern:'updown', step:.5, count:16 }), bassline(...), drums({ kick:'x...x...' })
//   transpose / shift / repeat / concat / merge / scaleVelocity / swing
//   makeScore({ id, tempo, lengthBeats, tracks:[track('musicbox', notes, { gain:.8 })] })
//
// Everything returns plain ScoreNote[] (t and d in beats) so scores stay JSON the Tela editor can store and the author can edit.

import type { Score, ScoreNote, ScoreTrack } from '../contracts';
import { mulberry32 } from './dsp';
import { isUnpitched, midiToName, noteToMidi } from './notes';

export { noteToMidi, midiToName };

// ───────────── notation ─────────────
export interface ParseOptions { defaultDur?: number; startBeat?: number; defaultVel?: number }
export interface Parsed { notes: ScoreNote[]; lengthBeats: number; bars: number[] }

/**
 * Tokens are separated by spaces. Each token is  <pitch>[:<beats>][@<velocity>][*<repeat>]
 *   pitch:  C4  F#3  Bb2  60 (MIDI)  x (unpitched hit)  rest | r | - (silence)
 *           [C4,E4,G4] or C4+E4+G4  (chord: all start together)
 *   beats:  1  .5  0.25  1.5   (sticky: a token without ':' reuses the previous length)
 *   '|' marks a bar line (recorded in `bars`, otherwise ignored).  '~' after a note ties it to the next token of the same pitch.
 */
export function parseNotation(src: string, opts: ParseOptions = {}): Parsed {
  const notes: ScoreNote[] = [];
  const bars: number[] = [];
  let t = opts.startBeat ?? 0;
  let lastDur = opts.defaultDur ?? 1;
  const defVel = opts.defaultVel;
  const toks = src.replace(/\s*,\s*(?![^\[]*\])/g, ' ').trim().split(/\s+/).filter(Boolean);
  let pendingTie: ScoreNote[] | null = null;
  for (const raw of toks) {
    if (raw === '|' || raw === '||') { bars.push(t); continue; }
    let tok = raw;
    let tie = false;
    if (tok.endsWith('~')) { tie = true; tok = tok.slice(0, -1); }
    let rep = 1;
    const rm = /\*(\d+)$/.exec(tok); if (rm) { rep = Math.max(1, parseInt(rm[1], 10)); tok = tok.slice(0, -rm[0].length); }
    let vel: number | undefined = defVel;
    const vm = /@(\d*\.?\d+)$/.exec(tok); if (vm) { vel = Number(vm[1]); tok = tok.slice(0, -vm[0].length); }
    let dur = lastDur;
    const dm = /:(\d*\.?\d+)$/.exec(tok); if (dm) { dur = Number(dm[1]); tok = tok.slice(0, -dm[0].length); lastDur = dur; }
    let pitches: Array<string | number> | null;
    const low = tok.toLowerCase();
    if (low === 'rest' || low === 'r' || low === '-' || low === '_') pitches = null;
    else if (tok.startsWith('[') && tok.endsWith(']')) pitches = tok.slice(1, -1).split(/[,+]/).map(parsePitch).filter((p): p is string | number => p != null);
    else if (tok.includes('+')) pitches = tok.split('+').map(parsePitch).filter((p): p is string | number => p != null);
    else { const p = parsePitch(tok); if (p == null) throw new Error(`parseNotation: cannot read "${raw}"`); pitches = [p]; }
    for (let r = 0; r < rep; r++) {
      if (pitches) {
        const group: ScoreNote[] = [];
        for (const p of pitches) {
          // a tied note extends the previous note of the same pitch instead of starting a new one
          const prev = pendingTie?.find((n) => n.n === p);
          if (prev) { prev.d += dur; group.push(prev); continue; }
          const n: ScoreNote = vel != null ? { t, n: p, d: dur, v: vel } : { t, n: p, d: dur };
          notes.push(n); group.push(n);
        }
        pendingTie = tie ? group : null;
      } else pendingTie = null;
      t += dur;
    }
  }
  return { notes, lengthBeats: t - (opts.startBeat ?? 0), bars };
}

function parsePitch(p: string): string | number | null {
  const s = p.trim();
  if (!s) return null;
  if (isUnpitched(s)) return 'x';
  const m = noteToMidi(s);
  if (m == null) throw new Error(`parseNotation: bad pitch "${p}"`);
  return /^-?\d+$/.test(s) ? Number(s) : normaliseName(s);
}
const normaliseName = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * ABC-like: letters A-G (C = C4, c = C5, c' = C6, C, = C3), ^ sharp, _ flat, = natural, trailing number multiplies the unit length,
 * /n divides it, z = rest, [CEG] = chord, '|' bar line, '-' tie into the next same note. `key` applies accidentals (e.g. 'F#,C#').
 */
export function parseAbc(src: string, opts: { unit?: number; startBeat?: number; vel?: number } = {}): Parsed {
  const unit = opts.unit ?? 1;
  const notes: ScoreNote[] = [];
  const bars: number[] = [];
  let t = opts.startBeat ?? 0;
  const s = src.replace(/\s+/g, ' ');
  let i = 0;
  const readLen = (): number => {
    let mult = 1;
    const m = /^(\d+)?(\/(\d+)?)?/.exec(s.slice(i)) as RegExpExecArray;
    if (m[0]) {
      const num = m[1] ? parseInt(m[1], 10) : 1;
      const den = m[2] ? (m[3] ? parseInt(m[3], 10) : 2) : 1;
      mult = num / den; i += m[0].length;
    }
    return mult * unit;
  };
  const readPitch = (): string | null => {
    let acc = 0;
    while (s[i] === '^' || s[i] === '_' || s[i] === '=') { acc += s[i] === '^' ? 1 : s[i] === '_' ? -1 : 0; i++; }
    const ch = s[i];
    if (!ch || !/[A-Ga-g]/.test(ch)) return null;
    i++;
    let oct = ch === ch.toUpperCase() ? 4 : 5;
    while (s[i] === "'") { oct++; i++; }
    while (s[i] === ',') { oct--; i++; }
    const name = ch.toUpperCase() + (acc > 0 ? '#'.repeat(acc) : acc < 0 ? 'b'.repeat(-acc) : '') + oct;
    return name;
  };
  let tieFrom: ScoreNote[] | null = null;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ') { i++; continue; }
    if (ch === '|') { bars.push(t); i++; if (s[i] === '|' || s[i] === ']' || s[i] === ':') i++; continue; }
    if (ch === 'z' || ch === 'x') { i++; t += readLen(); tieFrom = null; continue; }
    if (ch === '[') {
      i++; const ps: string[] = [];
      while (i < s.length && s[i] !== ']') { const p = readPitch(); if (p) ps.push(p); else i++; }
      i++; const d = readLen();
      const group = ps.map((p) => { const n: ScoreNote = { t, n: p, d }; if (opts.vel != null) n.v = opts.vel; notes.push(n); return n; });
      t += d; tieFrom = null; void group; continue;
    }
    const p = readPitch();
    if (p == null) throw new Error(`parseAbc: unexpected "${s.slice(i, i + 6)}"`);
    const d = readLen();
    const prev = tieFrom?.find((n) => n.n === p);
    if (prev) prev.d += d; else { const n: ScoreNote = { t, n: p, d }; if (opts.vel != null) n.v = opts.vel; notes.push(n); tieFrom = [n]; }
    t += d;
    if (s[i] === '-') { i++; } else tieFrom = null;
  }
  return { notes, lengthBeats: t - (opts.startBeat ?? 0), bars };
}

// ───────────── scales & chords ─────────────
export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], 'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
  pentatonic: [0, 2, 4, 7, 9], 'minor-pentatonic': [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  blues: [0, 3, 5, 6, 7, 10], 'whole-tone': [0, 2, 4, 6, 8, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

function rootMidi(root: string | number): number {
  const m = noteToMidi(root);
  if (m == null) throw new Error(`bad root "${root}"`);
  return m;
}

/** MIDI numbers of a scale over `octaves` octaves, ending on the top root. */
export function scale(root: string | number, name: keyof typeof SCALES | string = 'major', octaves = 1): number[] {
  const iv = SCALES[name]; if (!iv) throw new Error(`unknown scale "${name}"`);
  const r = rootMidi(root); const out: number[] = [];
  for (let o = 0; o < octaves; o++) for (const s of iv) out.push(r + o * 12 + s);
  out.push(r + octaves * 12);
  return out;
}

/** Scale degree to MIDI; 0 = root, 1 = second, ... may be negative or exceed the scale length (wraps by octave). */
export function degree(root: string | number, name: string, deg: number): number {
  const iv = SCALES[name]; if (!iv) throw new Error(`unknown scale "${name}"`);
  const len = iv.length;
  const oct = Math.floor(deg / len); const idx = ((deg % len) + len) % len;
  return rootMidi(root) + oct * 12 + iv[idx];
}

export const CHORDS: Record<string, number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], add9: [0, 4, 7, 14], '6': [0, 4, 7, 9], min6: [0, 3, 7, 9], power: [0, 7, 12],
};
export function chord(root: string | number, quality: keyof typeof CHORDS | string = 'maj', inversion = 0): number[] {
  const iv = CHORDS[quality]; if (!iv) throw new Error(`unknown chord "${quality}"`);
  const r = rootMidi(root);
  let notes = iv.map((s) => r + s);
  for (let i = 0; i < inversion; i++) { const f = notes.shift() as number; notes.push(f + 12); }
  return notes;
}
/** Diatonic chord built on a scale degree (stacked thirds within the scale). */
export function diatonicChord(root: string | number, scaleName: string, deg: number, size = 3): number[] {
  return Array.from({ length: size }, (_, k) => degree(root, scaleName, deg + k * 2));
}
/** progression('C3', 'major', [0,3,4,0]) -> array of chords (MIDI arrays) */
export function progression(root: string | number, scaleName: string, degrees: number[], size = 3): number[][] {
  return degrees.map((d) => diatonicChord(root, scaleName, d, size));
}

// ───────────── patterns ─────────────
export type ArpPattern = 'up' | 'down' | 'updown' | 'random' | 'converge' | 'thumb';
export interface ArpOptions { pattern?: ArpPattern; t0?: number; step?: number; dur?: number; count?: number; vel?: number; seed?: number; octaves?: number }

export function arpeggiate(chordNotes: Array<number | string>, o: ArpOptions = {}): ScoreNote[] {
  const base = chordNotes.map((n) => rootMidi(n)).sort((a, b) => a - b);
  const pool: number[] = [];
  for (let k = 0; k < (o.octaves ?? 1); k++) for (const n of base) pool.push(n + 12 * k);
  const step = o.step ?? 0.5; const count = o.count ?? pool.length; const dur = o.dur ?? step * 1.5; const t0 = o.t0 ?? 0;
  const pat = o.pattern ?? 'up';
  const r = mulberry32(o.seed ?? 7);
  const seq: number[] = [];
  if (pat === 'down') seq.push(...[...pool].reverse());
  else if (pat === 'updown') seq.push(...pool, ...[...pool].reverse().slice(1, -1));
  else if (pat === 'converge') { const a = [...pool]; while (a.length) { seq.push(a.shift() as number); if (a.length) seq.push(a.pop() as number); } }
  else if (pat === 'thumb') { for (let i = 1; i < pool.length; i++) seq.push(pool[0], pool[i]); if (!seq.length) seq.push(pool[0]); }
  else seq.push(...pool);
  const out: ScoreNote[] = [];
  for (let i = 0; i < count; i++) {
    const m = pat === 'random' ? pool[Math.floor(r() * pool.length)] : seq[i % seq.length];
    const n: ScoreNote = { t: t0 + i * step, n: m, d: dur };
    if (o.vel != null) n.v = o.vel;
    out.push(n);
  }
  return out;
}

export type BassPattern = 'root' | 'root-fifth' | 'walking' | 'oompah' | 'pulse' | 'octave';
/** One bass note set per bar. `roots` are MIDI/names (one per bar); beatsPerBar default 4. */
export function bassline(roots: Array<number | string>, pattern: BassPattern = 'root-fifth', o: { beatsPerBar?: number; t0?: number; vel?: number; octaveDown?: number } = {}): ScoreNote[] {
  const bpb = o.beatsPerBar ?? 4; const out: ScoreNote[] = [];
  const dn = (o.octaveDown ?? 0) * 12;
  roots.forEach((rt, bar) => {
    const r = rootMidi(rt) - dn; const t = (o.t0 ?? 0) + bar * bpb;
    const add = (dt: number, m: number, d: number, v = o.vel ?? 0.75) => out.push({ t: t + dt, n: m, d, v });
    switch (pattern) {
      case 'root': add(0, r, bpb * 0.9); break;
      case 'octave': for (let b = 0; b < bpb; b++) add(b, b % 2 ? r + 12 : r, 0.9); break;
      case 'pulse': for (let b = 0; b < bpb * 2; b++) add(b * 0.5, r, 0.4, b % 2 ? 0.55 : 0.8); break;
      case 'oompah': for (let b = 0; b < bpb; b++) add(b, b % 2 ? r + 7 : r, 0.8); break;
      case 'walking': { const steps = [0, 4, 7, 9, 7, 4, 2, 4]; for (let b = 0; b < bpb; b++) add(b, r + steps[(bar * 3 + b) % steps.length], 0.95); break; }
      case 'root-fifth': default:
        add(0, r, bpb / 2 - 0.1); add(bpb / 2, r + 7, bpb / 2 - 0.1, 0.65);
    }
  });
  return out;
}

/** Step-grid drum patterns. Lanes are strings: 'x' = hit, 'X' = accent, '.' or ' ' = rest. e.g. { kick:'x...x...', snare:'....x...', hat:'x.x.x.x.' } */
export function drums(lanes: Partial<Record<'kick' | 'snare' | 'hat' | 'ohat' | 'clap' | 'tom' | 'shaker' | 'click', string>>, o: { stepBeats?: number; bars?: number; t0?: number; swing?: number } = {}): ScoreNote[] {
  const step = o.stepBeats ?? 0.5; const out: ScoreNote[] = [];
  const GM_NUM: Record<string, number> = { kick: 36, snare: 38, hat: 42, ohat: 46, clap: 39, tom: 45, shaker: 70, click: 37 };
  for (const [lane, pat] of Object.entries(lanes)) {
    if (!pat) continue;
    const steps = [...pat.replace(/\s/g, '')];
    const reps = o.bars ?? 1;
    for (let r = 0; r < reps; r++) {
      steps.forEach((ch, i) => {
        if (ch === '.' || ch === '-') return;
        const idx = r * steps.length + i;
        const sw = o.swing && idx % 2 === 1 ? o.swing * step : 0;
        out.push({ t: (o.t0 ?? 0) + idx * step + sw, n: GM_NUM[lane], d: Math.min(step, 0.25), v: ch === 'X' ? 1 : lane === 'hat' ? 0.45 : 0.75 });
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// ───────────── note-list utilities ─────────────
const clone = (n: ScoreNote): ScoreNote => ({ ...n });
export function transpose(notes: ScoreNote[], semis: number): ScoreNote[] {
  return notes.map((n) => { const c = clone(n); const m = isUnpitched(c.n) ? null : noteToMidi(c.n); if (m != null) c.n = m + semis; return c; });
}
export const shift = (notes: ScoreNote[], beats: number): ScoreNote[] => notes.map((n) => ({ ...n, t: n.t + beats }));
export function repeat(notes: ScoreNote[], times: number, lengthBeats: number): ScoreNote[] {
  const out: ScoreNote[] = [];
  for (let k = 0; k < times; k++) for (const n of notes) out.push({ ...n, t: n.t + k * lengthBeats });
  return out;
}
export function concat(...parts: Array<{ notes: ScoreNote[]; lengthBeats: number }>): { notes: ScoreNote[]; lengthBeats: number } {
  let off = 0; const notes: ScoreNote[] = [];
  for (const p of parts) { notes.push(...shift(p.notes, off)); off += p.lengthBeats; }
  return { notes, lengthBeats: off };
}
export const merge = (...lists: ScoreNote[][]): ScoreNote[] => lists.flat().map(clone).sort((a, b) => a.t - b.t);
export const scaleVelocity = (notes: ScoreNote[], k: number): ScoreNote[] => notes.map((n) => ({ ...n, v: Math.max(0, Math.min(1, (n.v ?? 0.7) * k)) }));
/** Push off-beat notes later (amount 0..0.5 of the grid step). */
export function swing(notes: ScoreNote[], amount = 0.33, grid = 0.5): ScoreNote[] {
  return notes.map((n) => { const idx = Math.round(n.t / grid); const onGrid = Math.abs(n.t - idx * grid) < 1e-6; return onGrid && idx % 2 === 1 ? { ...n, t: n.t + amount * grid } : { ...n }; });
}
/** Turn a list of chords into held notes, one chord per `beatsEach`. */
export function chordsToNotes(chords: number[][], beatsEach: number, o: { t0?: number; vel?: number; hold?: number } = {}): ScoreNote[] {
  const out: ScoreNote[] = [];
  chords.forEach((ch, i) => ch.forEach((m) => out.push({ t: (o.t0 ?? 0) + i * beatsEach, n: m, d: beatsEach * (o.hold ?? 0.98), v: o.vel ?? 0.5 })));
  return out;
}

export function track(instrument: string, notes: ScoreNote[], o: { gain?: number; pan?: number; loop?: boolean } = {}): ScoreTrack {
  const t: ScoreTrack = { instrument, notes: [...notes].sort((a, b) => a.t - b.t) };
  if (o.gain != null) t.gain = o.gain; if (o.pan != null) t.pan = o.pan; if (o.loop != null) t.loop = o.loop;
  return t;
}
export function makeScore(s: Pick<Score, 'id' | 'tempo' | 'lengthBeats'> & Partial<Score>): Score {
  return { beatsPerBar: 4, ...s, tracks: s.tracks ?? [] };
}
