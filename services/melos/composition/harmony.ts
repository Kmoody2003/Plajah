// Reusable harmonic vocabulary for Melos. Progressions are data, not playback code: any Melos
// instrument, sequencer, MIDI exporter or generative producer can voice the same musical intent.

export type ChordQuality = 'major' | 'minor' | 'sus2' | 'sus4' | 'maj7' | 'min7' | 'add9' | 'power';
export type ProgressionMood = 'uplifting' | 'peaceful' | 'reflective' | 'driving' | 'suspended';

export interface ChordSymbol { degree: number; quality: ChordQuality; inversion?: number }
export interface Progression {
  id: string;
  name: string;
  mood: ProgressionMood[];
  chords: ChordSymbol[];
}

export const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7], minor: [0, 3, 7], sus2: [0, 2, 7], sus4: [0, 5, 7],
  maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], add9: [0, 4, 7, 14], power: [0, 7, 12],
};

/** A useful core library spanning pop, cinematic, ambient and modal writing. */
export const PROGRESSIONS: Progression[] = [
  { id: 'open-sky', name: 'Open Sky', mood: ['uplifting', 'peaceful'], chords: [{ degree: 1, quality: 'add9' }, { degree: 5, quality: 'sus2' }, { degree: 6, quality: 'min7' }, { degree: 4, quality: 'maj7' }] },
  { id: 'gentle-return', name: 'Gentle Return', mood: ['peaceful', 'reflective'], chords: [{ degree: 1, quality: 'maj7' }, { degree: 3, quality: 'min7' }, { degree: 4, quality: 'maj7' }, { degree: 2, quality: 'min7' }] },
  { id: 'floating-fifths', name: 'Floating Fifths', mood: ['suspended', 'peaceful'], chords: [{ degree: 1, quality: 'sus2' }, { degree: 4, quality: 'sus2' }, { degree: 6, quality: 'min7' }, { degree: 5, quality: 'sus4' }] },
  { id: 'warm-horizon', name: 'Warm Horizon', mood: ['uplifting', 'reflective'], chords: [{ degree: 6, quality: 'min7' }, { degree: 4, quality: 'maj7' }, { degree: 1, quality: 'add9' }, { degree: 5, quality: 'sus2' }] },
  { id: 'forward-light', name: 'Forward Light', mood: ['driving', 'uplifting'], chords: [{ degree: 1, quality: 'major' }, { degree: 5, quality: 'major' }, { degree: 4, quality: 'add9' }, { degree: 5, quality: 'sus4' }] },
  { id: 'quiet-question', name: 'Quiet Question', mood: ['reflective', 'suspended'], chords: [{ degree: 2, quality: 'min7' }, { degree: 4, quality: 'maj7' }, { degree: 1, quality: 'sus2' }, { degree: 1, quality: 'add9' }] },
];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

export function chordNotes(symbol: ChordSymbol, tonic: number, register = 48): number[] {
  const root = register + tonic + MAJOR[(symbol.degree - 1 + 7) % 7];
  const notes = CHORD_INTERVALS[symbol.quality].map((n) => root + n);
  const inversion = Math.max(0, symbol.inversion ?? 0);
  for (let i = 0; i < Math.min(inversion, notes.length); i++) notes[i] += 12;
  return notes.sort((a, b) => a - b);
}

export function progressionsFor(mood: ProgressionMood): Progression[] {
  return PROGRESSIONS.filter((p) => p.mood.includes(mood));
}
