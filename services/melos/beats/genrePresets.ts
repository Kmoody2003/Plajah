// genrePresets — factory drum patterns for the MEKA drum machine, ready to drop in and jam.
//
// Each preset builds a 16-step Pattern using the DEFAULT_KIT pad layout, plus a suggested BPM +
// swing. applyGenrePreset() pushes the pattern into a GrooveDoc and sets tempo/swing — call it inside
// a mutate() and select the returned pattern id (see BeatsRoom's addPattern flow).
//
// Pad indices match DEFAULT_KIT (grooveDoc.ts): kick 0 · kick2 1 · sub/808 2 · snare 4 · clap 5 ·
// snare2 6 · rim 7 · closed-hat 8 · open-hat 9 · hat2 10 · hat3 11 · perc 12 · perc2 13.

import type { GrooveDoc, Pattern } from './grooveDoc';
import { grooveUid } from './grooveDoc';

const PAD = {
  kick: 0, kick2: 1, sub: 2, snare: 4, clap: 5, snare2: 6, rim: 7,
  chat: 8, ohat: 9, hat2: 10, hat3: 11, perc: 12, perc2: 13,
} as const;

// A hit is [pad, step] (velocity 110) or [pad, step, velocity].
type Hit = [number, number] | [number, number, number];

function build(name: string, hits: Hit[], length: 16 | 32 = 16): Pattern {
  const steps: Pattern['steps'] = {};
  for (const h of hits) {
    const [pad, step] = h;
    const v = h.length > 2 ? (h[2] as number) : 110;
    (steps[pad] || (steps[pad] = {}))[step] = { v };
  }
  return { id: grooveUid() + grooveUid(), name, length, steps };
}

// Helper: place a hit on every listed step for one pad.
const on = (pad: number, stepsArr: number[], v = 110): Hit[] => stepsArr.map(s => [pad, s, v] as Hit);

export interface GenrePreset {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  swing: number;   // 0..1
  hint: string;
  make: () => Pattern;
}

export const GENRE_PRESETS: GenrePreset[] = [
  {
    id: 'house', name: 'House', genre: 'House', bpm: 124, swing: 0.10,
    hint: 'Four-on-the-floor, offbeat open hats, clap on the backbeat.',
    make: () => build('House', [
      ...on(PAD.kick, [0, 4, 8, 12], 122),
      ...on(PAD.clap, [4, 12], 108),
      ...on(PAD.ohat, [2, 6, 10, 14], 92),
      ...on(PAD.chat, [0, 2, 4, 6, 8, 10, 12, 14], 66),
    ]),
  },
  {
    id: 'techno', name: 'Techno', genre: 'Techno', bpm: 130, swing: 0,
    hint: 'Driving kick, relentless hats, rim on the backbeat.',
    make: () => build('Techno', [
      ...on(PAD.kick, [0, 4, 8, 12], 124),
      ...on(PAD.ohat, [2, 6, 10, 14], 96),
      ...on(PAD.chat, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 54),
      ...on(PAD.rim, [4, 12], 84),
      ...on(PAD.perc, [7, 15], 74),
    ]),
  },
  {
    id: 'bigroom', name: 'Big Room', genre: 'EDM', bpm: 128, swing: 0,
    hint: 'Festival kick + clap, sub on the one, hats between.',
    make: () => build('Big Room', [
      ...on(PAD.kick, [0, 4, 8, 12], 127),
      ...on(PAD.clap, [4, 12], 120),
      ...on(PAD.sub, [0, 8], 110),
      ...on(PAD.chat, [2, 6, 10, 14], 84),
    ]),
  },
  {
    id: 'future-bass', name: 'Future Bass', genre: 'EDM', bpm: 150, swing: 0,
    hint: 'Half-time snare, syncopated kick, airy hats.',
    make: () => build('Future Bass', [
      ...on(PAD.kick, [0, 10], 122),
      ...on(PAD.snare, [8], 124),
      ...on(PAD.clap, [8], 100),
      ...on(PAD.chat, [0, 2, 4, 6, 8, 10, 12, 14], 62),
      ...on(PAD.ohat, [6, 14], 80),
    ]),
  },
  {
    id: 'trap', name: 'Trap', genre: 'Trap', bpm: 140, swing: 0,
    hint: 'Half-time 808, snare on 3, rolling hats.',
    make: () => build('Trap', [
      ...on(PAD.kick, [0, 7], 120),
      ...on(PAD.snare, [8], 122),
      ...on(PAD.sub, [0, 7], 112),
      ...on(PAD.chat, [0, 2, 4, 6, 8, 10, 12, 13, 14], 70),
      [PAD.chat, 15, 90], [PAD.chat, 3, 60],
    ]),
  },
  {
    id: 'dubstep', name: 'Dubstep', genre: 'Dubstep', bpm: 140, swing: 0,
    hint: 'Half-time, huge snare on 3, space for the wobble.',
    make: () => build('Dubstep', [
      ...on(PAD.kick, [0], 127),
      ...on(PAD.snare, [8], 127),
      ...on(PAD.sub, [0, 4], 110),
      ...on(PAD.chat, [4, 12], 68),
      ...on(PAD.perc, [11], 72),
    ]),
  },
  {
    id: 'dnb', name: 'Drum & Bass', genre: 'DnB', bpm: 174, swing: 0,
    hint: 'Amen-flavoured breakbeat, ghost snares, fast hats.',
    make: () => build('Drum & Bass', [
      ...on(PAD.kick, [0, 10], 116),
      ...on(PAD.snare, [4, 12], 120),
      [PAD.snare2, 7, 62], [PAD.snare2, 15, 66],
      ...on(PAD.chat, [0, 2, 4, 6, 8, 10, 12, 14], 68),
      ...on(PAD.sub, [0], 108),
    ]),
  },
  {
    id: 'boombap', name: 'Boom Bap', genre: 'Hip-Hop', bpm: 90, swing: 0.18,
    hint: 'Swung boom-bap, snappy backbeat, dusty hats.',
    make: () => build('Boom Bap', [
      ...on(PAD.kick, [0, 6, 10], 116),
      ...on(PAD.snare, [4, 12], 116),
      ...on(PAD.chat, [0, 2, 4, 6, 8, 10, 12, 14], 74),
    ]),
  },
  {
    id: 'amapiano', name: 'Amapiano', genre: 'Amapiano', bpm: 112, swing: 0.2,
    hint: 'Log-drum bounce, swung shakers, late clap.',
    make: () => build('Amapiano', [
      ...on(PAD.kick, [0, 4, 8, 12], 110),
      ...on(PAD.sub, [3, 7, 10, 14], 100),
      ...on(PAD.clap, [12], 96),
      ...on(PAD.chat, [2, 6, 10, 14], 70),
      ...on(PAD.rim, [6, 14], 76),
    ]),
  },
  {
    id: 'afrobeats', name: 'Afrobeats', genre: 'Afrobeats', bpm: 105, swing: 0.14,
    hint: 'Syncopated kick, rim clave, shaker groove.',
    make: () => build('Afrobeats', [
      ...on(PAD.kick, [0, 3, 8, 11], 112),
      ...on(PAD.rim, [4, 7, 12, 15], 86),
      ...on(PAD.clap, [4, 12], 92),
      ...on(PAD.chat, [2, 6, 10, 14], 70),
      ...on(PAD.perc, [5, 13], 72),
    ]),
  },
  {
    id: 'pop', name: 'Pop', genre: 'Pop', bpm: 118, swing: 0,
    hint: 'Clean pop backbeat, steady eighth hats.',
    make: () => build('Pop', [
      ...on(PAD.kick, [0, 8], 116), [PAD.kick, 6, 92],
      ...on(PAD.snare, [4, 12], 116),
      ...on(PAD.chat, [0, 2, 4, 6, 8, 10, 12, 14], 76),
    ]),
  },
];

/**
 * Push a genre preset's pattern into the doc and set its tempo/swing. Call inside mutate();
 * returns the new pattern id so the caller can select it.
 */
export function applyGenrePreset(doc: GrooveDoc, preset: GenrePreset): string {
  const pat = preset.make();
  doc.patterns.push(pat);
  doc.bpm = preset.bpm;
  doc.swing = preset.swing;
  return pat.id;
}
