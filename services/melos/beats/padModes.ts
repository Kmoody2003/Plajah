// MEKA pad modes (Maschine's Pad / Keyboard / Chords / 16 Velocities). In Keyboard and Chords the
// 4×4 grid plays the SELECTED pad's sound at sixteen pitches — chromatic or locked to the song
// key — and Chords stacks scale thirds on each degree. Offsets are semitones from the pad's own
// tuning; an instrument pad's absolute base note lets the scale line up with the song key.

import { scalePitchClasses } from '../theory';
import type { SongKey } from './grooveDoc';

export type PadMode = 'pads' | 'keys' | 'chords' | 'vel16';
export type ChordKind = 'triad' | 'seventh';

/** Scale steps above the tonic, e.g. major → [0,2,4,5,7,9,11]. */
export function scaleSteps(key: SongKey | null): number[] {
  if (!key) return [0, 2, 4, 5, 7, 9, 11];
  const pcs = scalePitchClasses(0, key.scale);
  const steps = pcs.map((on, i) => (on ? i : -1)).filter((i) => i >= 0);
  return steps.length ? steps : [0, 2, 4, 5, 7, 9, 11];
}

/** How far the pad's base pitch sits above the key's tonic (so degree 0 = the tonic). Sample
 *  pads have no known pitch, so their natural pitch IS the root. */
export function tonicOffset(key: SongKey | null, baseNote: number | null): number {
  if (!key || baseNote === null) return 0;
  let d = (((key.tonic - baseNote) % 12) + 12) % 12;
  if (d > 6) d -= 12;            // nearest tonic, up or down
  return d;
}

/** Semitone for a scale index (may run past one octave or below zero). */
const degreeSemi = (steps: number[], idx: number) => {
  const n = steps.length;
  const oct = Math.floor(idx / n);
  return steps[((idx % n) + n) % n] + oct * 12;
};

/** Keyboard mode: cell 0 (bottom-left) … 15. */
export function keySemi(cell: number, opts: { key: SongKey | null; scaleLock: boolean; octave: number; baseNote: number | null }): number {
  const off = tonicOffset(opts.key, opts.baseNote) + opts.octave * 12;
  if (!opts.scaleLock) return off + cell;
  return off + degreeSemi(scaleSteps(opts.key), cell);
}

/** Chords mode: each cell is a scale degree; the chord stacks thirds inside the scale. */
export function chordSemis(cell: number, opts: { key: SongKey | null; kind: ChordKind; octave: number; baseNote: number | null }): number[] {
  const steps = scaleSteps(opts.key);
  const off = tonicOffset(opts.key, opts.baseNote) + opts.octave * 12;
  const tones = opts.kind === 'seventh' ? [0, 2, 4, 6] : [0, 2, 4];
  return tones.map((t) => off + degreeSemi(steps, cell + t));
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
/** "ii", "V7", "vii°" — the chord on a cell, named for its quality. */
export function chordLabel(cell: number, opts: { key: SongKey | null; kind: ChordKind }): string {
  const steps = scaleSteps(opts.key);
  const notes = chordSemis(cell, { ...opts, octave: 0, baseNote: null });
  const third = notes[1] - notes[0], fifth = notes[2] - notes[0];
  const n = steps.length;
  const deg = ((cell % n) + n) % n;
  let name = n === 7 ? ROMAN[deg] : String(deg + 1);
  if (third === 3) name = name.toLowerCase();
  if (third === 3 && fifth === 6) name += '°';
  else if (third === 4 && fifth === 8) name += '+';
  if (opts.kind === 'seventh') name += '7';
  return cell >= n ? `${name}'` : name;
}

const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (midi: number) => `${NOTE[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
/** Keyboard pad label: the note name for an instrument pad, else the offset ("+7"). */
export const keyLabelFor = (semi: number, baseNote: number | null) => (baseNote !== null ? noteName(baseNote + semi) : semi === 0 ? 'root' : `${semi > 0 ? '+' : ''}${semi}`);
