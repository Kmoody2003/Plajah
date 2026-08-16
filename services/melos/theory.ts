// The shared music-theory engine.
//
// One deliberate bet runs through this file: **the code that stops a beginner playing a wrong
// note is the same code that explains to a student why it was wrong.** So nothing here returns
// bare numbers — every result carries the name, the degree and the function alongside it, and
// the teaching surfaces in Academia read the same objects the instruments do.
//
// Extends the smaller helpers already in services/guidedListening.ts (pitchClassOf, noteName,
// diatonicChords) rather than replacing them; that file analyses recordings, this one is the
// generative/performance side.

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export const midiToName = (midi: number, flats = false): string => {
  const pc = ((midi % 12) + 12) % 12;
  return `${(flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[pc]}${Math.floor(midi / 12) - 1}`;
};
export const pcName = (pc: number, flats = false): string =>
  (flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP)[((pc % 12) + 12) % 12];
export const nameToPc = (name: string): number => {
  const i = NOTE_NAMES_SHARP.indexOf(name);
  if (i >= 0) return i;
  const j = NOTE_NAMES_FLAT.indexOf(name);
  return j >= 0 ? j : 0;
};

// ── Scales ───────────────────────────────────────────────────────────────────
// Intervals in semitones from the root. Ordered so the picker reads as a journey from
// "safest for a first-timer" to "you know what you're doing".

export interface ScaleDef {
  id: string;
  name: string;
  intervals: number[];
  /** Why a human would pick this — shown under the name, and used verbatim in lessons. */
  character: string;
  /** Beginner-safe scales are surfaced first: fewer notes, harder to sound wrong. */
  tier: 'easy' | 'core' | 'colour';
  /** Degree names for the teaching overlay (parallel to `intervals`). */
  degrees?: string[];
}

export const SCALES: ScaleDef[] = [
  { id: 'major-pent', name: 'Major pentatonic', intervals: [0, 2, 4, 7, 9], tier: 'easy',
    character: 'Five notes that agree with almost anything. The safest place to start.',
    degrees: ['1', '2', '3', '5', '6'] },
  { id: 'minor-pent', name: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10], tier: 'easy',
    character: 'The sound of nearly every guitar solo you have ever heard.',
    degrees: ['1', '♭3', '4', '5', '♭7'] },
  { id: 'blues', name: 'Blues', intervals: [0, 3, 5, 6, 7, 10], tier: 'easy',
    character: 'Minor pentatonic with the flat five sneaked in — instant grit.',
    degrees: ['1', '♭3', '4', '♭5', '5', '♭7'] },
  { id: 'major', name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11], tier: 'core',
    character: 'Bright and resolved. The reference every other scale is described against.',
    degrees: ['1', '2', '3', '4', '5', '6', '7'] },
  { id: 'minor', name: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10], tier: 'core',
    character: 'Serious, weighty, the default for most dance and hip-hop.',
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '♭7'] },
  { id: 'dorian', name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10], tier: 'core',
    character: 'Minor with a raised sixth — hopeful rather than sad. House and amapiano live here.',
    degrees: ['1', '2', '♭3', '4', '5', '6', '♭7'] },
  { id: 'mixolydian', name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10], tier: 'core',
    character: 'Major with a flat seventh. Funk, gospel and anything that wants to groove.',
    degrees: ['1', '2', '3', '4', '5', '6', '♭7'] },
  { id: 'harmonic-minor', name: 'Harmonic minor', intervals: [0, 2, 3, 5, 7, 8, 11], tier: 'colour',
    character: 'Minor with a leading tone. That leap from ♭6 to 7 is the whole flavour.',
    degrees: ['1', '2', '♭3', '4', '5', '♭6', '7'] },
  { id: 'phrygian', name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10], tier: 'colour',
    character: 'Flat second. Dark, Spanish, and it announces itself immediately.',
    degrees: ['1', '♭2', '♭3', '4', '5', '♭6', '♭7'] },
  { id: 'lydian', name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11], tier: 'colour',
    character: 'Major with a sharp fourth — the floating, film-score major.',
    degrees: ['1', '2', '3', '#4', '5', '6', '7'] },
  { id: 'locrian', name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10], tier: 'colour',
    character: 'Unstable by construction: even its home chord is diminished.',
    degrees: ['1', '♭2', '♭3', '4', '♭5', '♭6', '♭7'] },
  { id: 'whole-tone', name: 'Whole tone', intervals: [0, 2, 4, 6, 8, 10], tier: 'colour',
    character: 'Every step the same size, so nothing pulls anywhere. Weightless.',
    degrees: ['1', '2', '3', '#4', '#5', '#6'] },
  { id: 'hirajoshi', name: 'Hirajoshi', intervals: [0, 2, 3, 7, 8], tier: 'colour',
    character: 'A Japanese pentatonic — wide gaps, very little sounds wrong.',
    degrees: ['1', '2', '♭3', '5', '♭6'] },
  { id: 'chromatic', name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], tier: 'colour',
    character: 'Every note. No guard rails — the setting for when you want none.',
    degrees: ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'] },
];

export const scaleById = (id: string): ScaleDef => SCALES.find((s) => s.id === id) || SCALES[3];

/** Pitch classes in a scale, as a fast lookup for the note path. */
export function scalePitchClasses(rootPc: number, scaleId: string): boolean[] {
  const def = scaleById(scaleId);
  const set = new Array(12).fill(false);
  for (const iv of def.intervals) set[((rootPc + iv) % 12 + 12) % 12] = true;
  return set;
}

export type SnapMode = 'off' | 'nearest' | 'up' | 'down';

/**
 * The "you cannot play a wrong note" primitive.
 *
 * Nearest-snapping is what makes a first-timer sound good in ten seconds, and it is also the
 * honest teaching tool: the UI can show the note they pressed AND the note that sounded, so the
 * guard rail teaches instead of hiding.
 */
export function snapToScale(midi: number, rootPc: number, scaleId: string, mode: SnapMode = 'nearest'): number {
  if (mode === 'off' || scaleId === 'chromatic') return midi;
  const inScale = scalePitchClasses(rootPc, scaleId);
  const pc = ((midi % 12) + 12) % 12;
  if (inScale[pc]) return midi;
  if (mode === 'up') {
    for (let d = 1; d <= 12; d++) if (inScale[(pc + d) % 12]) return midi + d;
    return midi;
  }
  if (mode === 'down') {
    for (let d = 1; d <= 12; d++) if (inScale[((pc - d) % 12 + 12) % 12]) return midi - d;
    return midi;
  }
  // Nearest, preferring downward on a tie — a flattened note reads as intentional colour, a
  // sharpened one usually reads as a mistake.
  for (let d = 1; d <= 6; d++) {
    if (inScale[((pc - d) % 12 + 12) % 12]) return midi - d;
    if (inScale[(pc + d) % 12]) return midi + d;
  }
  return midi;
}

// ── Chords ───────────────────────────────────────────────────────────────────

export interface ChordDef {
  id: string;
  name: string;
  symbol: string;
  intervals: number[];
  tier: 'easy' | 'core' | 'colour';
}

export const CHORDS: ChordDef[] = [
  { id: 'maj', name: 'Major', symbol: '', intervals: [0, 4, 7], tier: 'easy' },
  { id: 'min', name: 'Minor', symbol: 'm', intervals: [0, 3, 7], tier: 'easy' },
  { id: 'sus4', name: 'Suspended 4th', symbol: 'sus4', intervals: [0, 5, 7], tier: 'easy' },
  { id: 'sus2', name: 'Suspended 2nd', symbol: 'sus2', intervals: [0, 2, 7], tier: 'easy' },
  { id: 'maj7', name: 'Major 7th', symbol: 'maj7', intervals: [0, 4, 7, 11], tier: 'core' },
  { id: 'min7', name: 'Minor 7th', symbol: 'm7', intervals: [0, 3, 7, 10], tier: 'core' },
  { id: 'dom7', name: 'Dominant 7th', symbol: '7', intervals: [0, 4, 7, 10], tier: 'core' },
  { id: 'dim', name: 'Diminished', symbol: '°', intervals: [0, 3, 6], tier: 'core' },
  { id: 'aug', name: 'Augmented', symbol: '+', intervals: [0, 4, 8], tier: 'colour' },
  { id: 'min9', name: 'Minor 9th', symbol: 'm9', intervals: [0, 3, 7, 10, 14], tier: 'colour' },
  { id: 'maj9', name: 'Major 9th', symbol: 'maj9', intervals: [0, 4, 7, 11, 14], tier: 'colour' },
  { id: 'dom9', name: 'Dominant 9th', symbol: '9', intervals: [0, 4, 7, 10, 14], tier: 'colour' },
  { id: 'min11', name: 'Minor 11th', symbol: 'm11', intervals: [0, 3, 7, 10, 14, 17], tier: 'colour' },
  { id: 'add9', name: 'Add 9', symbol: 'add9', intervals: [0, 4, 7, 14], tier: 'colour' },
  { id: 'min6', name: 'Minor 6th', symbol: 'm6', intervals: [0, 3, 7, 9], tier: 'colour' },
  { id: 'dim7', name: 'Diminished 7th', symbol: '°7', intervals: [0, 3, 6, 9], tier: 'colour' },
];

export const chordById = (id: string): ChordDef => CHORDS.find((c) => c.id === id) || CHORDS[0];

/** Build a chord's MIDI notes, with optional inversion and open voicing. */
export function buildChord(rootMidi: number, chordId: string, inversion = 0, spread = false): number[] {
  const def = chordById(chordId);
  let notes = def.intervals.map((iv) => rootMidi + iv);
  for (let i = 0; i < inversion && notes.length > 1; i++) {
    notes = [...notes.slice(1), notes[0] + 12];
  }
  if (spread && notes.length > 2) {
    // Drop-2: take the second-highest note down an octave. The standard way to stop a close
    // voicing sounding muddy, and it's one line.
    const sorted = [...notes].sort((a, b) => a - b);
    sorted[sorted.length - 2] -= 12;
    notes = sorted;
  }
  return notes.sort((a, b) => a - b);
}

// ── Diatonic harmony (the teaching backbone) ─────────────────────────────────

export type ChordFunction = 'tonic' | 'subdominant' | 'dominant';

export interface DiatonicDegree {
  degree: number;          // 1–7
  roman: string;           // I, ii, iii… lower case = minor, ° = diminished
  rootPc: number;
  rootName: string;
  chordId: string;
  symbol: string;          // e.g. "Am7"
  fn: ChordFunction;
  /** Plain-language explanation — the line a lesson can show verbatim. */
  role: string;
}

const MAJOR_QUALITIES = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MINOR_QUALITIES = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];
const MAJOR_ROMAN = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_ROMAN = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];
const FUNCTIONS: ChordFunction[] = ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant'];

const ROLE_TEXT: Record<ChordFunction, string> = {
  tonic: 'Home. Arriving here feels settled.',
  subdominant: 'Departure. Moves you away from home without tension.',
  dominant: 'Tension. Wants to fall back to the tonic.',
};

/** The seven chords of a key, with roman numerals and function — used by lessons and the Arp. */
export function diatonicDegrees(rootPc: number, scaleId: 'major' | 'minor' | string = 'major', seventh = false): DiatonicDegree[] {
  const def = scaleById(scaleId === 'minor' ? 'minor' : scaleId === 'major' ? 'major' : scaleId);
  const isMinorish = def.intervals[2] === 3;
  const quals = isMinorish ? MINOR_QUALITIES : MAJOR_QUALITIES;
  const romans = isMinorish ? MINOR_ROMAN : MAJOR_ROMAN;
  const out: DiatonicDegree[] = [];
  for (let d = 0; d < 7; d++) {
    const iv = def.intervals[d] ?? d * 2;
    const pc = (rootPc + iv) % 12;
    let chordId = quals[d];
    if (seventh) {
      chordId = chordId === 'maj' ? (d === 4 ? 'dom7' : 'maj7') : chordId === 'min' ? 'min7' : 'dim7';
    }
    const fn = FUNCTIONS[d];
    out.push({
      degree: d + 1,
      roman: romans[d],
      rootPc: pc,
      rootName: pcName(pc),
      chordId,
      symbol: `${pcName(pc)}${chordById(chordId).symbol}`,
      fn,
      role: ROLE_TEXT[fn],
    });
  }
  return out;
}

// ── Progressions ─────────────────────────────────────────────────────────────

export interface Progression {
  id: string;
  name: string;
  /** Scale degrees, 1-indexed. Negative means borrow from the parallel mode. */
  degrees: number[];
  mode: 'major' | 'minor';
  character: string;
  /** Songs a student will recognise — the fastest route to "oh, THAT". */
  heardIn: string;
}

export const PROGRESSIONS: Progression[] = [
  { id: 'pop', name: 'The four chords', degrees: [1, 5, 6, 4], mode: 'major',
    character: 'The most used progression in popular music, and it still works.',
    heardIn: 'Half the charts since 1975' },
  { id: 'sad-pop', name: 'Minor pop', degrees: [6, 4, 1, 5], mode: 'major',
    character: 'The same four chords starting on the sad one.',
    heardIn: 'Ballads and most sad-but-danceable songs' },
  { id: 'ii-v-i', name: 'ii–V–I', degrees: [2, 5, 1], mode: 'major',
    character: 'The engine of jazz harmony: tension built then resolved.',
    heardIn: 'Almost every jazz standard' },
  { id: 'blues12', name: '12-bar blues', degrees: [1, 1, 1, 1, 4, 4, 1, 1, 5, 4, 1, 5], mode: 'major',
    character: 'A whole form, not just a loop. Learn it once and you can sit in anywhere.',
    heardIn: 'Blues, rock and roll, and most of what came after' },
  { id: 'house', name: 'Deep house vamp', degrees: [1, 4, 1, 5], mode: 'minor',
    character: 'Two chords doing most of the work, with a lift on the fourth.',
    heardIn: 'Deep and soulful house' },
  { id: 'amapiano', name: 'Amapiano loop', degrees: [1, 4, 5, 4], mode: 'minor',
    character: 'Dorian-leaning minor with a hopeful fourth — the log-drum lane.',
    heardIn: 'Amapiano and afro house' },
  { id: 'andalusian', name: 'Andalusian cadence', degrees: [1, 7, 6, 5], mode: 'minor',
    character: 'A descending walk that sounds ancient and inevitable.',
    heardIn: 'Flamenco, and a lot of metal' },
  { id: 'canon', name: 'Canon', degrees: [1, 5, 6, 3, 4, 1, 4, 5], mode: 'major',
    character: 'Eight chords that keep resolving forward.',
    heardIn: "Pachelbel's Canon, and everything that borrowed it" },
];

/** Realise a progression into chords in a key. */
export function realiseProgression(prog: Progression, rootPc: number, seventh = false): DiatonicDegree[] {
  const degrees = diatonicDegrees(rootPc, prog.mode, seventh);
  return prog.degrees.map((d) => degrees[(d - 1 + 7) % 7]);
}

// ── Intervals (for the teaching overlay) ─────────────────────────────────────

const INTERVAL_NAMES = [
  'Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd', 'Perfect 4th',
  'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Octave',
];

export function intervalName(semitones: number): string {
  const s = Math.abs(semitones);
  if (s <= 12) return INTERVAL_NAMES[s];
  return `${INTERVAL_NAMES[s % 12]} + ${Math.floor(s / 12)} octave${s >= 24 ? 's' : ''}`;
}

/** Name what a set of notes forms, if it forms anything nameable. Used by the "what am I playing?" readout. */
export function identifyChord(midiNotes: number[]): { symbol: string; name: string; rootName: string } | null {
  if (midiNotes.length < 2) return null;
  const pcs = [...new Set(midiNotes.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b);
  for (const rootPc of pcs) {
    const rel = pcs.map((p) => ((p - rootPc) % 12 + 12) % 12).sort((a, b) => a - b);
    for (const c of CHORDS) {
      const want = [...new Set(c.intervals.map((i) => i % 12))].sort((a, b) => a - b);
      if (want.length === rel.length && want.every((v, i) => v === rel[i])) {
        return { symbol: `${pcName(rootPc)}${c.symbol}`, name: c.name, rootName: pcName(rootPc) };
      }
    }
  }
  return null;
}
