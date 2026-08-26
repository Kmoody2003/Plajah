// bassLines — factory MIDI basslines for the BAJO bass synth, ready to drop into a groove.
//
// A bassline is authored as a 16-step note list (step index, semitone relative to the bass root,
// gate length in steps, velocity). applyBassline() spawns a BAJO instrument on the next pad and
// writes the notes into the active pattern's `melo` (pitch-roll) lane — the scheduler fires that
// lane independently of the drum steps, so the BAJO plays the line straight away. Pair with a genre
// drum preset (services/melos/beats/genrePresets) for an instant groove.
//
// `semi` is relative to the bass root (0 = root). We drop the whole line an octave into bass register
// when writing (the pad's instrument note is C4/60, so OCTAVE_DOWN lands it around C2).

import type { GrooveDoc, MeloNote } from './grooveDoc';
import { addInstrumentToNextPad } from './instrumentFactory';

interface BassNote { step: number; semi: number; len: number; v?: number }

export interface BasslinePreset {
  id: string;
  name: string;
  genre: string;
  bpm?: number;
  hint: string;
  notes: BassNote[];
}

// Scale-degree shorthands (relative to the root) so the tables read musically.
const R = 0, m3 = 3, M3 = 4, P4 = 5, P5 = 7, m7 = 10, OCT = 12, m6 = 8, M6 = 9;

export const BASSLINES: BasslinePreset[] = [
  {
    id: 'house-offbeat', name: 'House Offbeat', genre: 'House', bpm: 124,
    hint: 'Classic off-the-kick bass stabs on every "and".',
    notes: [
      { step: 2, semi: R, len: 2 }, { step: 6, semi: R, len: 2 },
      { step: 10, semi: R, len: 2 }, { step: 14, semi: R, len: 2 },
    ],
  },
  {
    id: 'deep-walk', name: 'Deep House Walk', genre: 'House', bpm: 122,
    hint: 'A rounded root that steps up to the fifth and fourth.',
    notes: [
      { step: 0, semi: R, len: 4 }, { step: 4, semi: R, len: 2 },
      { step: 8, semi: P5, len: 4 }, { step: 12, semi: P4, len: 2 }, { step: 14, semi: M3, len: 2 },
    ],
  },
  {
    id: 'techno-roll', name: 'Techno Roll', genre: 'Techno', bpm: 130,
    hint: 'Relentless eighth-note root — hypnotic and driving.',
    notes: [0, 2, 4, 6, 8, 10, 12, 14].map(step => ({ step, semi: R, len: 1, v: step % 4 === 0 ? 118 : 96 })),
  },
  {
    id: 'trap-808', name: 'Trap 808', genre: 'Trap', bpm: 140,
    hint: 'Long 808 root with a glide up to the fifth and a minor-third turn.',
    notes: [
      { step: 0, semi: R, len: 6, v: 120 }, { step: 8, semi: P5, len: 4 }, { step: 14, semi: m3, len: 2 },
    ],
  },
  {
    id: 'dnb-reese', name: 'DnB Reese', genre: 'DnB', bpm: 174,
    hint: 'Two long sustained roots — a Reese begging for the wobble lane.',
    notes: [
      { step: 0, semi: R, len: 8, v: 116 }, { step: 8, semi: R, len: 6 }, { step: 14, semi: m7, len: 2 },
    ],
  },
  {
    id: 'future-bass-roots', name: 'Future Bass Roots', genre: 'EDM', bpm: 150,
    hint: 'Follows a IV–V–vi–iii lift — pairs with the Future Bass chord.',
    notes: [
      { step: 0, semi: P4, len: 4 }, { step: 4, semi: P5, len: 4 },
      { step: 8, semi: M6, len: 4 }, { step: 12, semi: M3, len: 4 },
    ],
  },
  {
    id: 'amapiano-log', name: 'Amapiano Log', genre: 'Amapiano', bpm: 112,
    hint: 'Syncopated log-drum bounce with a lift to the fourth.',
    notes: [
      { step: 0, semi: R, len: 2 }, { step: 3, semi: R, len: 2 }, { step: 7, semi: R, len: 2 },
      { step: 10, semi: P4, len: 2 }, { step: 14, semi: R, len: 2 },
    ],
  },
  {
    id: 'funk-octave', name: 'Funk Octave Pop', genre: 'Funk', bpm: 108,
    hint: 'Bouncy octave pops with a bluesy b7 turnaround.',
    notes: [
      { step: 0, semi: R, len: 1 }, { step: 2, semi: OCT, len: 1 }, { step: 4, semi: R, len: 1 },
      { step: 6, semi: P5, len: 1 }, { step: 8, semi: R, len: 1 }, { step: 10, semi: OCT, len: 1 },
      { step: 12, semi: R, len: 1 }, { step: 14, semi: m7, len: 1 },
    ],
  },
  {
    id: 'reggaeton', name: 'Dembow Bass', genre: 'Reggaeton', bpm: 95,
    hint: 'Dembow-locked root under the boom-ch-boom-chick.',
    notes: [
      { step: 0, semi: R, len: 2 }, { step: 6, semi: R, len: 2 },
      { step: 8, semi: R, len: 2 }, { step: 11, semi: R, len: 2 },
    ],
  },
  {
    id: 'synthwave-oct', name: 'Synthwave Octave', genre: 'Synthwave', bpm: 118,
    hint: 'Driving octave arp — neon highway at night.',
    notes: [0, 2, 4, 6, 8, 10, 12, 14].map((step, i) => ({ step, semi: i % 2 === 0 ? R : OCT, len: 1, v: 104 })),
  },
];

const OCTAVE_DOWN = -24; // land the line in bass register (pad note is C4/60)

/**
 * Spawn a BAJO on the next pad and write the bassline into `pattern`'s melo lane. Call inside
 * mutate(); returns the pad index the BAJO landed on (or null if the pattern wasn't found).
 */
export function applyBassline(doc: GrooveDoc, patternId: string, preset: BasslinePreset): number | null {
  const { padIdx } = addInstrumentToNextPad(doc, 'bajo', undefined, `${preset.name} Bass`);
  const pat = doc.patterns.find(p => p.id === patternId);
  if (!pat) return null;
  if (!pat.melo) pat.melo = {};
  const lane: Record<number, MeloNote[]> = {};
  for (const n of preset.notes) {
    (lane[n.step] || (lane[n.step] = [])).push({ semi: n.semi + OCTAVE_DOWN, v: n.v ?? 112, len: Math.max(1, n.len) });
  }
  pat.melo[padIdx] = lane;
  if (preset.bpm) doc.bpm = preset.bpm;
  return padIdx;
}
