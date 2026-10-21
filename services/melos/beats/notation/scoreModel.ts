// Melos Beats — the score model: a clip's notes engraved as music notation. The piano roll's
// Score lens and MusicXML export both read this, so what you see is what you export.
//
//   • Measures come from the song's meter map (time-signature changes included), so a clip's
//     bars are the song's bars.
//   • Time is quantized per beat to the nearer of a straight 16th grid or an 8th-triplet grid, so
//     swung / triplet lines read as triplets instead of 16th-note soup.
//   • Notes become chords (same onset per staff), rests fill the gaps, long notes split into
//     tied values at bar lines and readable beat boundaries, dotted values where they fit.
//   • Pitches are spelled from the project key (key signature from doc.key), accidentals carry
//     through the bar and are cancelled with naturals, like printed music.
//   • A grand staff splits at middle C; a line that stays on one side gets a single staff.
// Every element keeps the ids of the notes it came from, so the Score lens can edit in place.

import type { NoteEvent, SongKey } from '../grooveDoc';
import type { MeterMap } from '../tempoMap';

export const TPB = 12;            // ticks per quarter beat: 16th = 3, triplet 8th = 4, triplet 16th = 2

export type NoteType = 'whole' | 'half' | 'quarter' | 'eighth' | '16th';
export type Clef = 'treble' | 'bass';

export interface ScoreNote {
  id: string;
  midi: number;
  step: string;      // C D E F G A B
  alter: number;     // -2..2
  octave: number;
  accidental?: 'sharp' | 'flat' | 'natural' | 'double-sharp' | 'flat-flat';
  tieStart?: boolean;
  tieStop?: boolean;
}

export interface ScoreElement {
  staff: number;            // index into Score.clefs
  start: number;            // ticks from the measure start
  ticks: number;            // notated length
  type: NoteType;
  dots: number;
  rest: boolean;
  notes: ScoreNote[];       // empty for rests
  triplet?: { start?: boolean; stop?: boolean };
}

export interface ScoreMeasure {
  index: number;            // song bar index (0-based)
  startContent: number;     // content beat where the bar starts
  lenTicks: number;
  num: number;
  den: number;
  showTime: boolean;        // first bar or a meter change
  elements: ScoreElement[];
}

export interface Score {
  measures: ScoreMeasure[];
  clefs: Clef[];
  fifths: number;
  minor: boolean;
}

// Straight values (ticks) → type + dots, largest first.
const STRAIGHT: { t: number; type: NoteType; dots: number }[] = [
  { t: 48, type: 'whole', dots: 0 }, { t: 36, type: 'half', dots: 1 }, { t: 24, type: 'half', dots: 0 },
  { t: 18, type: 'quarter', dots: 1 }, { t: 12, type: 'quarter', dots: 0 }, { t: 9, type: 'eighth', dots: 1 },
  { t: 6, type: 'eighth', dots: 0 }, { t: 3, type: '16th', dots: 0 },
];
// Triplet values within one beat (ticks, sounding) → displayed type.
const TRIPLET: { t: number; type: NoteType }[] = [{ t: 8, type: 'quarter' }, { t: 4, type: 'eighth' }, { t: 2, type: '16th' }];

const MINORISH = /minor|dorian|phrygian|locrian|blues/;

/** Key signature (fifths) for a project key: modes use their relative major's signature. */
export function keyFifths(key: SongKey | null): { fifths: number; minor: boolean } {
  if (!key) return { fifths: 0, minor: false };
  const minor = MINORISH.test(key.scale) && key.scale !== 'major-pent';
  // Relative major tonic for the signature (dorian = up a whole tone back down… use modal offsets).
  const MODE_TO_MAJOR: Record<string, number> = { major: 0, 'major-pent': 0, lydian: -5, mixolydian: 5, dorian: 10, minor: 3, 'minor-pent': 3, blues: 3, 'harmonic-minor': 3, phrygian: 8, locrian: 1 };
  const majorPc = (key.tonic + (MODE_TO_MAJOR[key.scale] ?? (minor ? 3 : 0)) + 12) % 12;
  const SF: Record<number, number> = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 };
  return { fifths: SF[majorPc] ?? 0, minor };
}

const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const STEP_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];

/** The alteration a key signature gives each step. */
export function keyAlters(fifths: number): Record<string, number> {
  const out: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (fifths > 0) for (let i = 0; i < fifths; i++) out[SHARP_ORDER[i]] = 1;
  if (fifths < 0) for (let i = 0; i < -fifths; i++) out[SHARP_ORDER[6 - i]] = -1;
  return out;
}

/** Spell a MIDI pitch in a key: diatonic tones as the key has them, others by the key's direction. */
export function spell(midi: number, fifths: number): { step: string; alter: number; octave: number } {
  const ka = keyAlters(fifths);
  const pc = ((midi % 12) + 12) % 12;
  for (const st of STEPS) {
    if ((STEP_PC[st] + ka[st] + 12) % 12 === pc) return withOctave(midi, st, ka[st]);
  }
  // Outside the key: a plain natural first (B♮ in F major, F♮ in G), then the key's direction —
  // sharps in sharp/natural keys, flats in flat keys.
  for (const alter of [0, fifths < 0 ? -1 : 1]) {
    for (const st of STEPS) {
      if ((STEP_PC[st] + alter + 12) % 12 === pc) return withOctave(midi, st, alter);
    }
  }
  return withOctave(midi, 'C', 0);
}
function withOctave(midi: number, step: string, alter: number) {
  // Octave of the WRITTEN step (B#3 sounds as C4; Cb4 sounds as B3).
  const octave = Math.floor((midi - STEP_PC[step] - alter) / 12) - 1;
  return { step, alter, octave };
}

/** Diatonic step under a staff position, sounding pitch with the key's alteration. */
export function midiFromStep(step: string, octave: number, alter: number): number {
  return (octave + 1) * 12 + STEP_PC[step] + alter;
}

// ── quantization ────────────────────────────────────────────────────────────

interface QNote { id: string; midi: number; start: number; end: number }

/** Per beat: straight 16ths (3) or 8th-triplets (4), whichever fits the onsets/offsets better. */
function beatGrids(edges: number[], beats: number): number[] {
  const grids = new Array<number>(beats).fill(3);
  for (let b = 0; b < beats; b++) {
    const lo = b * TPB, hi = lo + TPB;
    const inBeat = edges.filter((x) => x > lo + 0.05 && x < hi - 0.05);
    if (!inBeat.length) continue;
    const err = (g: number) => inBeat.reduce((s, x) => { const r = (x - lo) / g; return s + Math.abs(r - Math.round(r)) * g; }, 0);
    if (err(4) + 0.15 < err(3)) grids[b] = 4;
  }
  return grids;
}

function snapTick(x: number, grids: number[]): number {
  const b = Math.max(0, Math.min(grids.length - 1, Math.floor(x / TPB)));
  const lo = b * TPB, g = grids[b];
  return lo + Math.round((x - lo) / g) * g;
}

// ── duration spelling ───────────────────────────────────────────────────────

interface Piece { start: number; ticks: number; type: NoteType; dots: number; triplet: boolean }

/** Spell [start, start+len) (ticks from the bar) into notated values, splitting at beat groups
 *  where an off-beat value would hide the beat (a quarter, or a dotted quarter in 6/8, 9/8, 12/8),
 *  and using triplet values inside triplet beats. */
function spellSpan(start: number, len: number, grids: number[], group = TPB): Piece[] {
  const out: Piece[] = [];
  let t = start;
  const end = start + len;
  for (let guard = 0; guard < 256 && t < end - 1e-6; guard++) {
    const beat = Math.floor(t / TPB);
    const beatStart = beat * TPB;
    const triplet = grids[beat] === 4;
    if (triplet) {
      // Triplet beat: stay inside it.
      const room = Math.min(end, beatStart + TPB) - t;
      const v = TRIPLET.find((x) => x.t <= room + 1e-6) ?? TRIPLET[TRIPLET.length - 1];
      out.push({ start: t, ticks: v.t, type: v.type, dots: 0, triplet: true });
      t += v.t;
      continue;
    }
    const groupStart = Math.floor(t / group + 1e-9) * group;
    const onBeat = Math.abs(t - groupStart) < 1e-6;
    // Off the beat: don't cross the next beat. On a beat: may span later straight beats.
    let room = end - t;
    if (!onBeat) room = Math.min(room, groupStart + group - t);
    else {
      // Stop before the first triplet beat ahead.
      for (let b = beat + 1; b * TPB < end; b++) if (grids[b] === 4) { room = Math.min(room, b * TPB - t); break; }
    }
    const v = STRAIGHT.find((x) => x.t <= room + 1e-6) ?? STRAIGHT[STRAIGHT.length - 1];
    out.push({ start: t, ticks: v.t, type: v.type, dots: v.dots, triplet: false });
    t += v.t;
  }
  return out;
}

// ── build ───────────────────────────────────────────────────────────────────

export interface BuildOptions {
  meter: MeterMap;
  /** Song beat of content beat 0 (clip start − content offset). */
  songOffset: number;
  fromContent: number;
  toContent: number;
  key: SongKey | null;
  staves?: 'auto' | 'grand' | 'treble' | 'bass';
}

export function buildScore(notes: NoteEvent[], o: BuildOptions): Score {
  const { fifths, minor } = keyFifths(o.key);
  const clefs: Clef[] = chooseClefs(notes, o.staves ?? 'auto');
  const staffOf = (midi: number) => (clefs.length === 1 ? 0 : midi >= 60 ? 0 : 1);

  // Bars covering [from, to) in song time.
  const songFrom = o.fromContent + o.songOffset;
  const songTo = Math.max(songFrom + 1e-6, o.toContent + o.songOffset);
  const firstBar = o.meter.at(Math.max(0, songFrom));
  const bars = [firstBar, ...o.meter.bars(firstBar.startBeat + firstBar.lenBeats - 1e-6, songTo)]
    .filter((b, i, a) => i === 0 || b.bar !== a[i - 1].bar);

  // Carry-over (a chord tied into the next bar) per staff.
  let carry: { staff: number; notes: QNote[]; ticks: number }[] = [];
  const measures: ScoreMeasure[] = [];
  let prevSig = '';
  for (const bar of bars) {
    const startContent = bar.startBeat - o.songOffset;
    const lenTicks = Math.round(bar.lenBeats * TPB);
    const beats = Math.ceil(lenTicks / TPB);
    // Compound meters (6/8, 9/8, 12/8) count in dotted quarters.
    const group = bar.den === 8 && bar.num % 3 === 0 ? TPB * 1.5 : TPB;
    // Notes starting in this bar, in bar ticks.
    const inBar: QNote[] = notes
      .filter((n) => n.startBeats >= startContent - 1e-6 && n.startBeats < startContent + bar.lenBeats - 1e-6)
      .map((n) => ({ id: n.id, midi: n.key, start: (n.startBeats - startContent) * TPB, end: (n.startBeats + n.lengthBeats - startContent) * TPB }));
    // Straight-or-triplet is decided per STAFF: a bass line under treble triplets stays straight.
    const gridsByStaff = clefs.map((_, s) => {
      const mine = inBar.filter((n) => staffOf(n.midi) === s);
      const grids = beatGrids(mine.flatMap((n) => [n.start, Math.min(n.end, lenTicks)]), beats);
      for (const n of mine) {
        n.start = snapTick(n.start, grids);
        const e = n.end >= lenTicks ? n.end : snapTick(n.end, grids);
        n.end = Math.max(n.start + grids[Math.min(beats - 1, Math.floor(n.start / TPB))], e);
      }
      return grids;
    });
    const sig = `${bar.num}/${bar.den}`;
    const m: ScoreMeasure = { index: bar.bar, startContent, lenTicks, num: bar.num, den: bar.den, showTime: sig !== prevSig, elements: [] };
    prevSig = sig;
    const nextCarry: typeof carry = [];
    const accState: Record<string, number>[] = clefs.map(() => ({}));
    for (let s = 0; s < clefs.length; s++) {
      const grids = gridsByStaff[s];
      const mine = inBar.filter((n) => staffOf(n.midi) === s);
      const carried = carry.find((c) => c.staff === s);
      // Chords by onset.
      const onsets = [...new Set(mine.map((n) => n.start))].sort((a, b) => a - b);
      type Chord = { start: number; end: number; notes: QNote[]; tieIn: boolean };
      const chords: Chord[] = [];
      if (carried) chords.push({ start: 0, end: Math.min(carried.ticks, lenTicks), notes: carried.notes, tieIn: true });
      for (let i = 0; i < onsets.length; i++) {
        const at = onsets[i];
        const group = mine.filter((n) => n.start === at);
        const next = onsets[i + 1] ?? Infinity;
        chords.push({ start: at, end: Math.min(Math.max(...group.map((n) => n.end)), next), notes: group, tieIn: false });
      }
      // A carried chord can't overlap the bar's first onset.
      if (carried && chords.length > 1) chords[0].end = Math.min(chords[0].end, chords[1].start);
      let t = 0;
      const pushRest = (from: number, to: number) => {
        for (const p of spellSpan(from, to - from, grids, group)) m.elements.push({ staff: s, start: p.start, ticks: p.ticks, type: p.type, dots: p.dots, rest: true, notes: [], triplet: p.triplet ? {} : undefined });
      };
      for (const ch of chords) {
        if (ch.start > t + 1e-6) pushRest(t, ch.start);
        if (ch.end <= ch.start + 1e-6) continue;
        const pieces = spellSpan(ch.start, Math.min(ch.end, lenTicks) - ch.start, grids, group);
        pieces.forEach((p, k) => {
          const first = k === 0, last = k === pieces.length - 1;
          const continues = !last || (ch.end > lenTicks + 1e-6 && last);
          m.elements.push({
            staff: s, start: p.start, ticks: p.ticks, type: p.type, dots: p.dots, rest: false,
            triplet: p.triplet ? {} : undefined,
            notes: ch.notes.map((n) => {
              const sp = spell(n.midi, fifths);
              const out: ScoreNote = { id: n.id, midi: n.midi, ...sp };
              if (!first || ch.tieIn) out.tieStop = true;
              if (continues) out.tieStart = true;
              // Accidentals: only on the first written head of a note in this bar, carried per bar.
              if (first && !ch.tieIn) {
                const k = `${sp.step}${sp.octave}`;
                const expected = accState[s][k] ?? keyAlters(fifths)[sp.step];
                if (sp.alter !== expected) out.accidental = ACC[sp.alter];
                accState[s][k] = sp.alter;
              } else accState[s][`${sp.step}${sp.octave}`] = sp.alter;
              return out;
            }),
          });
        });
        if (ch.end > lenTicks + 1e-6) nextCarry.push({ staff: s, notes: ch.notes, ticks: ch.end - lenTicks });
        t = Math.min(ch.end, lenTicks);
      }
      if (t < lenTicks - 1e-6) pushRest(t, lenTicks);
    }
    carry = nextCarry;
    markTriplets(m);
    m.elements.sort((a, b) => a.staff - b.staff || a.start - b.start);
    measures.push(m);
  }
  return { measures, clefs, fifths, minor };
}

const ACC: Record<number, ScoreNote['accidental']> = { 1: 'sharp', [-1]: 'flat', 0: 'natural', 2: 'double-sharp', [-2]: 'flat-flat' };

/** Mark the first/last element of each triplet beat (for brackets and MusicXML <tuplet>). */
function markTriplets(m: ScoreMeasure): void {
  const byKey = new Map<string, ScoreElement[]>();
  for (const e of m.elements) {
    if (!e.triplet) continue;
    const k = `${e.staff}:${Math.floor(e.start / TPB)}`;
    (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(e);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => a.start - b.start);
    list[0].triplet = { ...list[0].triplet, start: true };
    list[list.length - 1].triplet = { ...list[list.length - 1].triplet, stop: true };
  }
}

function chooseClefs(notes: NoteEvent[], want: BuildOptions['staves']): Clef[] {
  if (want === 'grand') return ['treble', 'bass'];
  if (want === 'treble') return ['treble'];
  if (want === 'bass') return ['bass'];
  if (!notes.length) return ['treble', 'bass'];
  const lo = Math.min(...notes.map((n) => n.key)), hi = Math.max(...notes.map((n) => n.key));
  if (lo >= 57) return ['treble'];   // stays above A3: one treble staff
  if (hi <= 62) return ['bass'];     // stays below D4: one bass staff
  return ['treble', 'bass'];
}

/** Ticks → beats. */
export const ticksToBeats = (t: number) => t / TPB;
