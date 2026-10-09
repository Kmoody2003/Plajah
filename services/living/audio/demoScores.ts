// Three demo cues written with the composition library: they prove the helpers and double as starting points for authors.
//   lullaby  - music-box lullaby in 3/4 (slows well with setTempoScale)
//   city     - bouncy city groove: bass, marimba stabs, kalimba hook, shaker + drums
//   folk     - folk harp over a drone, with a sparse flute line

import type { Score } from '../contracts';
import { arpeggiate, bassline, chord, chordsToNotes, drums, makeScore, merge, parseNotation, shift, track } from './compose';

/** Music-box lullaby: 8 bars of 3/4, original melody in C. */
export function lullaby(): Score {
  const melody = parseNotation(
    'E5:1.5 D5:.5 C5:1 | D5:1.5 C5:.5 G4:1 | A4:1 C5:1 E5:1 | D5:3 | ' +
    'E5:1.5 G5:.5 E5:1 | D5:1.5 C5:.5 D5:1 | E5:1 D5:1 A4:1 | C5:3', { defaultVel: 0.7 });
  const bars = [['C3', 'maj'], ['C3', 'maj'], ['A2', 'min'], ['G2', 'maj'], ['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['C3', 'maj']] as const;
  const harp = bars.flatMap(([r, q], b) => arpeggiate(chord(r, q).map((n) => n + 12), { pattern: 'up', step: 1, count: 3, dur: 1, t0: b * 3, vel: 0.4 }));
  const pad = chordsToNotes(bars.map(([r, q]) => chord(r, q)), 3, { vel: 0.35, hold: 0.99 });
  return makeScore({
    id: 'lullaby', tempo: 72, beatsPerBar: 3, lengthBeats: melody.lengthBeats, reverb: 0.45,
    variation: { seed: 3, humanizeMs: 14 },
    tracks: [track('musicbox', melody.notes, { gain: 0.9 }), track('harp', harp, { gain: 0.45, pan: -0.25 }), track('pad', pad, { gain: 0.3 })],
  });
}

/** Bouncy city groove: 4 bars of 4/4 at 112 bpm. */
export function cityGroove(): Score {
  const roots = ['C2', 'F2', 'G2', 'C2'];
  const bass = bassline(roots, 'oompah', { beatsPerBar: 4, vel: 0.8 });
  const kit = drums({
    kick: 'x...x...x..xx...', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.xx', shaker: '..x...x...x...x.',
  }, { stepBeats: 0.25, bars: 4 });
  const stabsOne = [chord('C4', 'maj'), chord('F4', 'maj'), chord('G4', 'maj'), chord('C4', 'maj')];
  const stabs = stabsOne.flatMap((c, b) => c.flatMap((n) => [{ t: b * 4 + 0.5, n, d: 0.25, v: 0.5 }, { t: b * 4 + 2.5, n, d: 0.25, v: 0.42 }, { t: b * 4 + 3.5, n, d: 0.2, v: 0.5 }]));
  const hook = parseNotation('rest:1 G5:.5 A5:.5 C6:1 A5:.5 G5:.5 | E5:1 D5:.5 E5:.5 G5:2 | rest:1 A5:.5 G5:.5 E5:1 D5:.5 C5:.5 | D5:1 E5:1 C5:2', { defaultVel: 0.7 });
  return makeScore({
    id: 'city', tempo: 112, lengthBeats: 16, reverb: 0.12,
    variation: { seed: 11, humanizeMs: 8 },
    tracks: [
      track('bass', bass, { gain: 0.8 }), track('drum', kit, { gain: 0.8 }), track('marimba', stabs, { gain: 0.5, pan: 0.2 }), track('kalimba', hook.notes, { gain: 0.65, pan: -0.2 }),
    ],
  });
}

/** Folk harp over a drone with a sparse flute: 8 bars of 4/4 at 84 bpm, A dorian feel. */
export function folkDrone(): Score {
  const prog: Array<[string, string]> = [['A3', 'min'], ['G3', 'maj'], ['F3', 'maj'], ['E3', 'min']];
  const harp = prog.flatMap(([r, q], b) => {
    const c = chord(r, q);
    return merge(arpeggiate(c, { pattern: 'updown', step: 0.5, count: 8, dur: 1.6, t0: b * 4, vel: 0.5 }), arpeggiate(c, { pattern: 'updown', step: 0.5, count: 8, dur: 1.6, t0: b * 4 + 16, vel: 0.45 }));
  });
  const drone = [{ t: 0, n: 'A2', d: 31.5, v: 0.4 }, { t: 0, n: 'E3', d: 31.5, v: 0.32 }];
  const flute = shift(parseNotation('E5:2 D5:1 C5:1 | A4:3 rest:1 | rest:2 C5:1 D5:1 | E5:4', { defaultVel: 0.6 }).notes, 8);
  return makeScore({
    id: 'folk', tempo: 84, lengthBeats: 32, reverb: 0.35,
    variation: { seed: 5, humanizeMs: 18, dropout: 0.04 },
    tracks: [track('harp', harp, { gain: 0.8 }), track('pad', drone, { gain: 0.35, pan: 0.1 }), track('flute', flute, { gain: 0.45, pan: 0.25 })],
  });
}

export const DEMO_SCORES: Record<string, Score> = { lullaby: lullaby(), city: cityGroove(), folk: folkDrone() };
