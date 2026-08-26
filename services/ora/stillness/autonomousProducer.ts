// The Endless Hour's producer: harmony, groove and orchestration decisions from one deterministic
// timeline. It emits MIDI-like events; instruments merely perform them.

import { chordNotes, progressionsFor, type ProgressionMood } from '../../melos/composition/harmony';
import type { SessionState } from './emotionalEngine';

export type ProducerPart = 'chord' | 'bass' | 'arp' | 'kick';
export interface ProducerEvent { at: number; part: ProducerPart; notes: number[]; velocity: number; holdSec: number; bar: number }
export interface ProducerScore {
  progressionId: string;
  events: ReadonlyArray<ProducerEvent>;
  chordAt(t: number): ProducerEvent;
}

const hash = (seed: number, n: number) => {
  let h = Math.imul((seed ^ n) >>> 0, 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function composeProducer(seed: number, durationSec: number, stateAt: (t: number) => SessionState): ProducerScore {
  const initial = stateAt(0);
  const mood: ProgressionMood = initial.arousal > 0.68 ? 'driving' : initial.arousal < 0.4 ? 'peaceful' : 'uplifting';
  const choices = progressionsFor(mood);
  const progression = choices[Math.floor(hash(seed, 1) * choices.length)] ?? progressionsFor('peaceful')[0];
  const tonic = [0, 2, 5, 7, 9][Math.floor(hash(seed, 2) * 5)];
  const events: ProducerEvent[] = [];
  let t = 0, bar = 0;

  while (t < durationSec && bar < 4000) {
    const state = stateAt(t);
    // One musical beat per quarter breath: rhythm stays physiologically synchronized but reads as
    // a groove, not a metronome pasted over the meditation.
    const beat = Math.max(1.15, Math.min(2.8, state.breathRate / 4));
    const barSec = beat * 4;
    const phrase = Math.floor(bar / 4);
    const scene = phrase % 6;
    const symbol = { ...progression.chords[bar % progression.chords.length], inversion: phrase % 3 === 1 ? 1 : 0 };
    const register = Math.round(45 - state.depth * 4);
    const chord = chordNotes(symbol, tonic, register);
    events.push({ at: t, part: 'chord', notes: chord, velocity: 0.52, holdSec: barSec * 1.08, bar });

    // Six phrase scenes form an arrangement arc: establish → arp enters → bass joins → rhythmic
    // answer → full ensemble → breakdown. Repeating the concept with new chord inversions and
    // deterministic note choices sounds produced without becoming a short audible loop.
    const arpOn = state.phase === 'depth' ? scene === 1 : [1, 2, 4].includes(scene);
    const bassOn = state.phase === 'depth' ? scene === 3 : [2, 3, 4].includes(scene);
    const kickOn = state.phase === 'depth' ? scene === 4 && bar % 2 === 0 : [2, 3, 4].includes(scene);
    const sparse = state.phase === 'depth' ? 0.38 : state.phase === 'turn' ? 0.58 : 0.92;
    const bassPattern = [0, 0, 2, 1];
    for (let step = 0; step < 8; step++) {
      const at = t + step * beat / 2;
      if (arpOn && hash(seed ^ bar, step + 20) < sparse) {
        const order = phrase % 2 === 0 ? step : 7 - step;
        const n = chord[order % chord.length] + (order >= 4 ? 12 : 0);
        events.push({ at, part: 'arp', notes: [n], velocity: 0.42, holdSec: beat * 0.8, bar });
      }
      // Bass establishes root on 1, then answers on beat 3; the second note creates groove without
      // turning the channel into a dance track.
      if (bassOn && (step === 0 || (step === 4 && state.phase !== 'depth'))) {
        const degree = bassPattern[bar % bassPattern.length] % chord.length;
        events.push({ at, part: 'bass', notes: [chord[degree] - 24], velocity: step === 0 ? 0.55 : 0.4, holdSec: beat * 1.7, bar });
      }
      // Kick cadence: downbeat plus a quiet anticipatory beat late in active phases.
      if (kickOn && (step === 0 || (step === 6 && state.arousal > 0.5 && state.phase !== 'depth'))) {
        events.push({ at, part: 'kick', notes: [29], velocity: step === 0 ? 0.58 : 0.38, holdSec: 0.5, bar });
      }
    }
    t += barSec;
    bar++;
  }
  events.sort((a, b) => a.at - b.at || a.part.localeCompare(b.part));
  const chords = events.filter((e) => e.part === 'chord');
  return {
    progressionId: progression.id,
    events,
    chordAt: (at) => {
      let found = chords[0];
      for (const chord of chords) { if (chord.at <= at) found = chord; else break; }
      return found;
    },
  };
}
