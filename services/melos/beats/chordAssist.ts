// Melos Beats — auto-chord and progression assist. One note becomes a chord in the song's key, and
// the assistant says what could come next: functional harmony (where each chord wants to go) plus
// the progressions in theory.ts, plus the out-of-key moves worth knowing about (secondary dominants,
// borrowed chords, the tritone sub). Pure — the roll, the pads and the engine all read this.

import type { GrooveDoc, NoteEvent, SongKey } from './grooveDoc';
import { CHORDS, PROGRESSIONS, chordById, pcName, scaleById, type ChordDef } from '../theory';

export type ChordVoicing = 'close' | 'drop2' | 'drop3' | 'open' | 'shell' | 'rootless';

export const CHORD_VOICINGS: { id: ChordVoicing; name: string; hint: string }[] = [
  { id: 'close', name: 'Close', hint: 'Stacked as tightly as possible.' },
  { id: 'drop2', name: 'Drop 2', hint: 'Second-highest note down an octave: the standard jazz spread.' },
  { id: 'drop3', name: 'Drop 3', hint: 'Third-highest note down an octave.' },
  { id: 'open', name: 'Open', hint: 'Root low, the rest spread wide.' },
  { id: 'shell', name: 'Shell', hint: 'Just root, third and seventh: room for everything else.' },
  { id: 'rootless', name: 'Rootless', hint: 'No root; the bass has it. Left-hand piano voicing.' },
];

export interface ChordShape {
  tones: number;
  voicing: ChordVoicing;
  inversion: number;
}

/** Auto-chord settings, stored with the song. */
export interface ChordAssist extends ChordShape {
  on: boolean;
  /** Fixed chord type (theory.ts id), or empty = whichever chord the key gives each note. */
  chordId?: string;
}

export const defaultChordAssist = (): ChordAssist => ({ on: false, tones: 3, voicing: 'close', inversion: 0 });

/** Apply inversion, then voicing, to chord notes given root-up. */
export function voiceNotes(notes: number[], voicing: ChordVoicing = 'close', inversion = 0): number[] {
  let v = [...notes].sort((a, b) => a - b);
  if (voicing === 'shell' && v.length > 3) v = [v[0], v[1], v[3]];
  if (voicing === 'rootless' && v.length > 3) v = v.slice(1);
  for (let i = 0; i < inversion % Math.max(1, v.length); i++) {
    const low = v.shift()!;
    v.push(low + 12);
  }
  v.sort((a, b) => a - b);
  const dropFrom = (d: number) => { if (v.length > d) v[v.length - 1 - d] -= 12; };
  if (voicing === 'drop2') dropFrom(1);
  if (voicing === 'drop3') dropFrom(2);
  if (voicing === 'open' && v.length > 2) { v = [v[0] - 12, ...v.slice(1).map((n, i) => (i % 2 === 0 ? n : n + 12))]; }
  return v.sort((a, b) => a - b);
}

/** Notes of a named chord on a root, voiced. A slash bass goes below everything. */
export function buildVoicedChord(rootMidi: number, chordId: string, opts: Partial<ChordShape> & { bassPc?: number } = {}): number[] {
  const v = voiceNotes(chordById(chordId).intervals.map((i) => rootMidi + i), opts.voicing, opts.inversion ?? 0);
  if (opts.bassPc === undefined) return v;
  let bass = Math.min(...v) - 1;
  while (((bass % 12) + 12) % 12 !== ((opts.bassPc % 12) + 12) % 12) bass -= 1;
  return [bass, ...v.filter((n) => ((n % 12) + 12) % 12 !== ((opts.bassPc! % 12) + 12) % 12)];
}

// ── chord symbols ────────────────────────────────────────────────────────────────────────────

const PC_NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const norm = (s: string) => s.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/°/g, 'dim').replace(/ø/g, 'hdim');

/** "Cm7♭5/G♭", "F#maj9", "Bb13♯11" → root, chord and slash bass; null when it's not a chord. */
export function parseChordSymbol(text: string): { rootPc: number; chordId: string; bassPc?: number } | null {
  const m = text.trim().match(/^([A-Ga-g])([#b♯♭]?)(.*?)(?:\/([A-Ga-g])([#b♯♭]?))?$/);
  if (!m) return null;
  const acc = (a: string) => (a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0);
  const rootPc = (PC_NAMES[m[1].toUpperCase()] + acc(m[2]) + 12) % 12;
  const want = norm(m[3]);
  const found = CHORDS.find((c) => norm(c.symbol) === want)
    ?? CHORDS.find((c) => norm(c.symbol).toLowerCase() === want.toLowerCase())
    ?? (want === 'M7' ? chordById('maj7') : want === 'min' ? chordById('min') : want === 'M' ? chordById('maj') : want === 'dim7' ? chordById('dim7') : undefined);
  if (!found) return null;
  const bassPc = m[4] ? (PC_NAMES[m[4].toUpperCase()] + acc(m[5]) + 12) % 12 : undefined;
  return { rootPc, chordId: found.id, bassPc };
}

export function chordSymbol(rootPc: number, chordId: string, flats = false, bassPc?: number): string {
  const name = `${pcName(rootPc, flats)}${chordById(chordId).symbol}`;
  return bassPc !== undefined && bassPc !== rootPc ? `${name}/${pcName(bassPc, flats)}` : name;
}

/** The named chord whose pitch classes match exactly (root-relative), if there is one. */
function chordFromIntervals(iv: number[]): ChordDef | null {
  const want = [...new Set(iv.map((i) => ((i % 12) + 12) % 12))].sort((a, b) => a - b);
  for (const c of CHORDS) {
    const have = [...new Set(c.intervals.map((i) => i % 12))].sort((a, b) => a - b);
    if (have.length === want.length && have.every((v, i) => v === want[i])) return c;
  }
  return null;
}

// ── diatonic chords in ANY scale ─────────────────────────────────────────────────────────────

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export interface KeyChord {
  /** Scale degree, 0-based. */
  degree: number;
  rootPc: number;
  chordId: string | null;
  /** Semitones above the root, stacked from the scale. */
  intervals: number[];
  symbol: string;
  roman: string;
}

/** Stack `tones` notes on a scale degree, every other scale step (thirds, in a seven-note scale).
 *  Works in pentatonics and eight-note scales too; a stack the library has no name for is still
 *  playable and reads as root + note count. */
export function keyChord(key: SongKey, degree: number, tones = 3): KeyChord {
  const iv = scaleById(key.scale).intervals;
  const n = iv.length;
  const d = ((degree % n) + n) % n;
  const intervals: number[] = [];
  for (let t = 0; t < tones; t++) {
    const idx = d + t * 2;
    intervals.push(iv[idx % n] + Math.floor(idx / n) * 12 - iv[d]);
  }
  const rootPc = (key.tonic + iv[d]) % 12;
  const c = chordFromIntervals(intervals);
  const third = intervals[1] ?? 4;
  const fifth = intervals[2] ?? 7;
  const minor = third === 3;
  let roman = ROMAN[d] ?? String(d + 1);
  if (minor) roman = roman.toLowerCase();
  if (minor && fifth === 6) roman += '°';
  if (!minor && fifth === 8) roman += '+';
  return { degree: d, rootPc, chordId: c?.id ?? null, intervals, symbol: c ? `${pcName(rootPc)}${c.symbol}` : `${pcName(rootPc)}(${tones})`, roman };
}

/** All the chords a key gives, one per scale degree. */
export function keyChords(key: SongKey, tones = 3): KeyChord[] {
  return scaleById(key.scale).intervals.map((_, d) => keyChord(key, d, tones));
}

/** Which degree a pitch class sits on, or the nearest degree below it for a note outside the key. */
export function degreeOfPc(key: SongKey, pc: number): number {
  const iv = scaleById(key.scale).intervals;
  const rel = (((pc - key.tonic) % 12) + 12) % 12;
  let best = 0;
  for (let i = 0; i < iv.length; i++) if (iv[i] <= rel) best = i;
  return best;
}

/**
 * The chord one key plays. In a key: the chord the scale gives that note. Out of key: the note is
 * still the root, with the shape its nearest scale degree has, so nothing played goes silent or
 * moves. Without a key, a plain major or minor stack.
 */
export function chordKeysFor(key: number, songKey: SongKey | null | undefined, shape: Partial<ChordShape> & { chordId?: string } = {}): number[] {
  const tones = Math.max(2, Math.min(7, shape.tones ?? 3));
  const clamp = (k: number) => Math.max(0, Math.min(127, k));
  let intervals: number[];
  if (shape.chordId) intervals = chordById(shape.chordId).intervals;
  else if (!songKey) intervals = [0, 4, 7, 11, 14, 17, 21].slice(0, tones);
  else intervals = keyChord(songKey, degreeOfPc(songKey, ((key % 12) + 12) % 12), tones).intervals;
  return [...new Set(voiceNotes(intervals.map((i) => key + i), shape.voicing ?? 'close', shape.inversion ?? 0).map(clamp))];
}

/** Auto-chord for a played or drawn key; the key alone when it's off. */
export function assistKeys(doc: GrooveDoc, key: number): number[] {
  const a = doc.chordAssist;
  if (!a?.on) return [key];
  return chordKeysFor(key, doc.key ?? null, a);
}

// ── what comes next ──────────────────────────────────────────────────────────────────────────
// Where each degree wants to go, weighted (Piston's table of usual root progressions, simplified).

const MAJOR_FLOW: Record<number, Record<number, number>> = {
  0: { 3: 6, 4: 6, 5: 5, 1: 3, 2: 1 },
  1: { 4: 9, 6: 2, 0: 1, 2: 1 },
  2: { 5: 6, 3: 5, 1: 2 },
  3: { 4: 7, 0: 5, 1: 4, 6: 2 },
  4: { 0: 9, 5: 5, 3: 2 },
  5: { 3: 6, 1: 6, 4: 3, 2: 2 },
  6: { 0: 9, 2: 2, 5: 1 },
};
const MINOR_FLOW: Record<number, Record<number, number>> = {
  0: { 3: 6, 5: 6, 6: 5, 4: 5, 2: 3 },
  1: { 4: 9, 6: 2, 0: 1 },
  2: { 5: 6, 6: 5, 3: 3 },
  3: { 4: 7, 0: 5, 6: 4, 1: 3 },
  4: { 0: 9, 5: 4, 3: 2 },
  5: { 2: 5, 6: 6, 3: 4, 1: 3 },
  6: { 2: 7, 0: 6, 5: 3 },
};

const FLOW_WHY: Record<string, string> = {
  tonic: 'Home. The tension resolves.',
  subdominant: 'Moves away from home without tension.',
  dominant: 'Builds tension that wants to resolve.',
};
const DEGREE_FN = ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant'];

export interface ChordSuggestion {
  id: string;
  roman: string;
  symbol: string;
  rootPc: number;
  /** Null when the stack has no library name; `intervals` is always playable. */
  chordId: string | null;
  intervals: number[];
  /** 'in-key' | a progression the move belongs to | an out-of-key colour. */
  kind: 'in-key' | 'progression' | 'colour';
  why: string;
  score: number;
}

export interface PlayedChord {
  rootPc: number;
  chordId: string | null;
  /** Degree in the key, or null for a chord from outside it. */
  degree: number | null;
}

/** Read a chord off notes: the lowest note's pitch class if it names a chord, else any inversion. */
export function identifyPlayedChord(keys: number[], songKey: SongKey | null): PlayedChord | null {
  if (keys.length < 1) return null;
  const pcs = [...new Set(keys.map((k) => ((k % 12) + 12) % 12))];
  const lowest = ((Math.min(...keys) % 12) + 12) % 12;
  const tryRoots = [lowest, ...pcs.filter((p) => p !== lowest)];
  for (const root of tryRoots) {
    const c = chordFromIntervals(pcs.map((p) => p - root));
    if (c) return { rootPc: root, chordId: c.id, degree: degreeIn(songKey, root) };
  }
  return { rootPc: lowest, chordId: null, degree: degreeIn(songKey, lowest) };
}

function degreeIn(songKey: SongKey | null, pc: number): number | null {
  if (!songKey) return null;
  const rel = (((pc - songKey.tonic) % 12) + 12) % 12;
  const i = scaleById(songKey.scale).intervals.indexOf(rel);
  return i >= 0 ? i : null;
}

/** The chords in a note list, in order: notes starting together count as one chord. */
export function chordHistory(notes: Pick<NoteEvent, 'startBeats' | 'key'>[], songKey: SongKey | null, beforeBeat = Infinity): PlayedChord[] {
  const groups = new Map<number, number[]>();
  for (const n of notes) {
    if (n.startBeats >= beforeBeat - 1e-6) continue;
    const k = Math.round(n.startBeats * 8);
    const g = groups.get(k);
    if (g) g.push(n.key); else groups.set(k, [n.key]);
  }
  const out: PlayedChord[] = [];
  for (const k of [...groups.keys()].sort((a, b) => a - b)) {
    const c = identifyPlayedChord(groups.get(k)!, songKey);
    if (!c) continue;
    const last = out[out.length - 1];
    if (last && last.rootPc === c.rootPc && last.chordId === c.chordId) continue;
    out.push(c);
  }
  return out;
}

/**
 * The next chords worth trying after `history`, best first. Scores add up from where the last chord
 * wants to go and from every progression in the library the recent chords match; a resolved song
 * start offers the tonic and the classic openers. Non-seven-note scales get in-key stacks, ranked by
 * root movement by fourth or fifth.
 */
export function suggestNextChords(key: SongKey, history: PlayedChord[], opts: { tones?: number; limit?: number; colour?: boolean } = {}): ChordSuggestion[] {
  const tones = opts.tones ?? 3;
  const limit = opts.limit ?? 8;
  const chords = keyChords(key, tones);
  const scores = new Map<number, { score: number; why: string; kind: ChordSuggestion['kind'] }>();
  const add = (deg: number, s: number, why: string, kind: ChordSuggestion['kind']) => {
    const cur = scores.get(deg);
    if (!cur) { scores.set(deg, { score: s, why, kind }); return; }
    cur.score += s;
    // The most specific reason wins: a named progression says more than a general tendency.
    if (kind === 'progression' && cur.kind !== 'progression') { cur.why = why; cur.kind = kind; }
  };

  const seven = chords.length === 7;
  const minorish = (chords[0]?.intervals[1] ?? 4) === 3;
  const last = history[history.length - 1];
  const lastDeg = last?.degree ?? null;

  if (seven) {
    const flow = minorish ? MINOR_FLOW : MAJOR_FLOW;
    if (lastDeg !== null) {
      for (const [to, w] of Object.entries(flow[lastDeg] ?? {})) {
        const d = Number(to);
        add(d, w, FLOW_WHY[DEGREE_FN[d]], 'in-key');
      }
    } else if (!last) {
      add(0, 8, 'Start at home.', 'in-key');
      add(minorish ? 5 : 3, 5, 'A warm opener.', 'in-key');
      add(minorish ? 2 : 5, 4, 'Opens on the relative key.', 'in-key');
    } else {
      // Out-of-key last chord: lean home or to the dominant.
      add(0, 6, 'Back into the key.', 'in-key');
      add(4, 5, 'Back in through the dominant.', 'in-key');
    }
    // Library progressions: match the last one, two or three chords anywhere in a progression.
    const recent = history.slice(-3).map((c) => c.degree);
    for (const prog of PROGRESSIONS) {
      if ((prog.mode === 'minor') !== minorish) continue;
      const ds = prog.degrees.map((d) => d - 1);
      for (let i = 0; i < ds.length; i++) {
        for (let m = Math.min(3, recent.length); m >= 1; m--) {
          const tail = recent.slice(-m);
          let hit = true;
          for (let j = 0; j < m; j++) if (ds[(i - m + 1 + j + ds.length * 3) % ds.length] !== tail[j]) { hit = false; break; }
          if (!hit) continue;
          const nextDeg = ds[(i + 1) % ds.length];
          add(nextDeg, m * m * 1.5, `Continues "${prog.name}", ${prog.heardIn.toLowerCase().startsWith('"') ? prog.heardIn : prog.heardIn.toLowerCase()}.`, 'progression');
          break;
        }
      }
    }
  } else {
    // Pentatonics, whole-tone, eight-note scales: no functional table applies. Falling fifths and
    // rising fourths still pull hardest, then steps.
    const from = last?.rootPc ?? key.tonic;
    chords.forEach((c, d) => {
      const up = ((c.rootPc - from) % 12 + 12) % 12;
      const s = up === 5 ? 6 : up === 7 ? 5 : up === 2 || up === 10 ? 3 : up === 0 ? 0 : 2;
      add(d, s + (d === 0 ? 1 : 0), d === 0 ? 'The home chord of this scale.' : up === 5 || up === 7 ? 'Root moves by a fourth or fifth: the strongest pull.' : 'Moves by step.', 'in-key');
    });
  }
  if (last && lastDeg !== null) scores.delete(lastDeg);

  const out: ChordSuggestion[] = [...scores.entries()].map(([deg, s]) => {
    const c = chords[deg];
    return { id: `d${deg}`, roman: c.roman, symbol: c.symbol, rootPc: c.rootPc, chordId: c.chordId, intervals: c.intervals, kind: s.kind, why: s.why, score: s.score };
  });
  out.sort((a, b) => b.score - a.score);
  const top = out.slice(0, limit);

  // Colour: moves from outside the key, never ranked above the in-key answers.
  if (opts.colour !== false && seven && last) {
    const colour = (rootPc: number, chordId: string, roman: string, why: string): ChordSuggestion => ({
      id: `c${rootPc}${chordId}`, roman, symbol: `${pcName(rootPc)}${chordById(chordId).symbol}`, rootPc, chordId,
      intervals: chordById(chordId).intervals, kind: 'colour', why, score: 0,
    });
    const tonicP = key.tonic;
    // The most likely next in-key chord can be approached by ITS dominant.
    const target = top.find((t) => t.intervals[1] !== undefined);
    if (target) {
      const v = (target.rootPc + 7) % 12;
      top.push(colour(v, 'dom7', `V7/${target.roman}`, `Secondary dominant: leans hard into ${target.symbol}.`));
    }
    if (minorish) top.push(colour((tonicP + 7) % 12, 'dom7', 'V7', 'Harmonic-minor dominant: a real leading tone back home.'));
    else {
      top.push(colour((tonicP + 5) % 12, 'min', 'iv', 'Borrowed from the parallel minor: the bittersweet turn.'));
      top.push(colour((tonicP + 10) % 12, 'maj', '♭VII', 'Borrowed from mixolydian: the rock move.'));
    }
    top.push(colour((tonicP + 1) % 12, 'dom7', '♭II7', 'Tritone substitute for the dominant: chromatic slide home.'));
  }
  return top;
}

/** Notes for a suggestion near the register of what's already there. */
export function suggestionKeys(s: Pick<ChordSuggestion, 'rootPc' | 'intervals'>, around = 60, shape: Partial<ChordShape> = {}): number[] {
  let root = Math.round(around / 12) * 12 + s.rootPc;
  if (root > around + 6) root -= 12;
  return voiceNotes(s.intervals.map((i) => root + i), shape.voicing ?? 'close', shape.inversion ?? 0);
}
