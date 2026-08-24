// The player — VELA arranging for itself.
//
// Not an arpeggiator and not a chord-progression generator in the usual sense. Functional
// harmony is a system of tension and resolution, and resolution is an *arrival*: it tells the
// listener the thing is finished and hands their attention back. A session does not want that.
// The Stillness design says it plainly — nothing resolves, it ends where it happens to be.
//
// So the model here is a slowly mutating pitch collection rather than a chord sequence. A set
// of pitch classes drifts by one note at a time, the way a Ligeti texture or an Eno tape system
// does, and voicings are drawn from whatever the set currently holds. There is no tonic, no
// cadence and no loop point; the harmony is always somewhere, never going somewhere.
//
// Everything is a pure function of (seed, elapsed) for the same reason as the rest of the
// engine: the pre-baked headset path, the offline bounce and the generative channel all assume
// a session can be reproduced exactly.

import type { SessionState } from './emotionalEngine';

/** Pitch classes, 0 = C. */
export type PitchSet = number[];

export interface Voicing {
  /** MIDI notes to sound, low to high. */
  notes: number[];
  /** How long to feed the exciter, seconds. The body rings on afterwards. */
  holdSec: number;
  /** 0..1. */
  velocity: number;
  /** -1..1 across the field. */
  pan: number;
}

export interface PlayerEvent {
  at: number;
  voicing: Voicing;
  /** True when this event also mutated the pitch collection. */
  mutation: boolean;
}

/**
 * Starting collections, one per arrival mood.
 *
 * All are modal and none contain a leading tone — a semitone below the reference pitch is the
 * strongest pull toward resolution in Western hearing, and its absence is most of why these
 * sound suspended rather than unfinished. Rough arrivals start with more notes, because a
 * denser set is closer to where an agitated person already is.
 */
const ARRIVAL_SETS: Record<number, PitchSet> = {
  1: [2, 4, 5, 7, 9, 11], // six notes, restless
  2: [2, 4, 7, 9, 11],
  3: [2, 4, 7, 9],        // suspended, no third against the reference
  4: [2, 7, 9],
  5: [2, 7],              // two notes and a lot of space
};

/** Candidates a mutation may bring in. Deliberately excludes 1 and 6 semitones from the
 *  reference — those are the two intervals that make the collection sound like it wants
 *  something. */
const CANDIDATES = [2, 3, 4, 5, 7, 9, 10, 11];

function hash(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
const rand01 = (a: number, b: number) => hash(a, b) / 4294967296;

/**
 * Seconds between voicings at a given depth.
 *
 * The Depth phase is meant to be the emptiest stretch of the session, and "empty" has to mean
 * long enough to be uncomfortable for about half a minute before it stops being uncomfortable.
 * Forty-five seconds between chords is not a bug.
 */
function intervalFor(s: SessionState): number {
  // Sparser than before. A chord every few seconds is a wall of ringing bodies; leaving real space
  // between them is what lets each one be heard and then let go, and is most of "calm".
  const base = 13 + s.depth * 46;
  // Arousal shortens the gaps: someone who arrived agitated is met with more to hold on to.
  return Math.max(8, base * (1.25 - s.arousal * 0.5));
}

/** How many notes sound at once. Thins out as the session deepens. Fewer bodies overall now — a
 *  five-note quartal stack every few seconds was most of the "too much ringing". */
function voiceCountFor(s: SessionState): number {
  if (s.depth > 0.7) return 2;
  if (s.depth > 0.4) return 3;
  return s.arousal > 0.6 ? 4 : 3;
}

/** Register centre. Lower than before — the mix was sitting too high, and there was not enough
 *  low-octave weight under it. This drops the whole harmony roughly a fifth. */
function rootFor(s: SessionState): number {
  return Math.round(43 - s.depth * 8);
}

export interface Player {
  readonly seed: number;
  /** Every voicing for the whole session, in order. */
  events(): ReadonlyArray<PlayerEvent>;
  /** The pitch collection in force at a given moment. */
  setAt(t: number): PitchSet;
}

/**
 * Build the whole performance up front.
 *
 * Not lazily, because the channel needs to bake a session ahead of the live edge and the
 * offline renderer needs every note queued before it starts — the same reason the emotional
 * engine precomputes its bloom schedule.
 */
export function createPlayer(
  seed: number,
  durationSec: number,
  stateAt: (t: number) => SessionState,
): Player {
  const events: PlayerEvent[] = [];
  const sets: Array<{ at: number; set: PitchSet }> = [];

  const arrival = stateAt(0);
  // ARRIVAL_SETS is keyed by MOOD, where 1 is Rough and 5 is Bright, but what we have here is
  // arousal, which runs the other way. Indexing directly gave an agitated arrival the sparsest
  // two-note collection — the exact hush the design says not to open with.
  const moodKey = 5 - Math.round(Math.max(0, Math.min(1, arrival.arousal)) * 4);
  let set: PitchSet = [...(ARRIVAL_SETS[moodKey] ?? ARRIVAL_SETS[3])];
  sets.push({ at: 0, set: [...set] });

  let t = 2.5;
  let i = 0;
  while (t < durationSec && i < 4000) {
    const s = stateAt(t);

    // Mutate the collection occasionally — one note swapped, never a wholesale change. A
    // collection that changes all at once is a key change, and a key change is an event; a
    // collection that changes one note is a colour shift you notice only in hindsight.
    const mutationChance = 0.12 + (1 - s.depth) * 0.25;
    const mutation = rand01(seed, i * 7 + 1) < mutationChance && set.length > 1;
    if (mutation) {
      const dropIdx = Math.floor(rand01(seed, i * 7 + 2) * set.length);
      const dropped = set[dropIdx];
      const pool = CANDIDATES.filter((c) => !set.includes(c) || c === dropped);
      if (pool.length) {
        const add = pool[Math.floor(rand01(seed, i * 7 + 3) * pool.length)];
        set = set.filter((_, k) => k !== dropIdx);
        if (!set.includes(add)) set.push(add);
        set.sort((a, b) => a - b);
        sets.push({ at: t, set: [...set] });
      }
    }

    // Voice it as an OPEN QUARTAL/QUINTAL STACK. The bass is the lowest degree of the collection;
    // each voice above it climbs by roughly a fourth or a fifth, snapped to the nearest pitch the
    // collection actually holds. Stacked fourths and fifths are the oldest harmony there is — the
    // sound of organum, of a tuned gong, of open strings — and, crucially, they contain no third,
    // so they imply no key and resolve nowhere. That open, unplaced quality is exactly the
    // suspended, ancient character the session wants, and it is "heavier" than scattered octaves
    // without ever becoming a chord that points somewhere.
    const count = Math.min(voiceCountFor(s), set.length + 1);
    const root = rootFor(s);
    const notes: number[] = [];
    // The bass: lowest degree, so the register drops cleanly with the root as the session deepens
    // rather than wandering with a random pick.
    let prevMidi = root + set[0];
    notes.push(prevMidi);
    // A sub-octave under the bass for low-end weight — the mix was thin down low. It hums as a
    // foundation rather than ringing like the bodies above it. Clamped into a sane range.
    const sub = prevMidi - 12;
    if (sub >= 24) notes.push(sub);
    for (let v = 1; v < count; v++) {
      // A fourth or a fifth — the two intervals the whole style is built on.
      const step = rand01(seed, i * 31 + v * 5) < 0.5 ? 5 : 7;
      const target = prevMidi + step;
      // Snap to the nearest higher note whose pitch class is in the collection, so the stack is
      // always quartal-ISH but never leaves the mode. Octaves NARROW deep in: fewer voices means
      // a lower ceiling on their own, without a separate register rule.
      let best = -1;
      let bestDist = 999;
      for (const pc of set) {
        for (let oct = 0; oct <= 3; oct++) {
          const cand = root + pc + oct * 12;
          if (cand <= prevMidi || notes.includes(cand)) continue; // ascend, and never double
          const d = Math.abs(cand - target);
          if (d < bestDist) { best = cand; bestDist = d; }
        }
      }
      if (best < 0) break; // nothing higher left in the collection — a smaller voicing is fine
      prevMidi = best;
      notes.push(best);
    }
    notes.sort((a, b) => a - b);

    events.push({
      at: t,
      mutation,
      voicing: {
        notes,
        // Long holds deep in: the exciter keeps feeding while the body rings, which is what
        // makes a sustained voice a pad rather than a struck chord.
        holdSec: 3 + s.openness * 9 + s.depth * 6,
        velocity: 0.22 + (1 - s.depth) * 0.28,
        pan: rand01(seed, i * 13) * 1.6 - 0.8,
      },
    });

    t += intervalFor(s) * (0.75 + rand01(seed, i * 17) * 0.5);
    i++;
  }

  return {
    seed,
    events: () => events,
    setAt: (at: number) => {
      let cur = sets[0].set;
      for (const s of sets) {
        if (s.at <= at) cur = s.set;
        else break;
      }
      return cur;
    },
  };
}

/**
 * Which preset the session should be playing, and how the body should be morphing.
 *
 * The patch is not fixed for a whole session. Arrival meets an agitated person with something
 * that has more going on; Depth wants the emptiest, least eventful body in the set; the Turn is
 * the one struck gesture in twenty minutes. Changing the instrument under the harmony is most
 * of what makes a generated session feel arranged rather than generated.
 */
export function presetForPhase(s: SessionState): { presetId: string; blendToStruck: boolean } {
  switch (s.phase) {
    case 'arrival':
      // Meet an activated arrival with something that has more going on, rather than with a
      // hush they will experience as a demand.
      return { presetId: s.arousal > 0.62 ? 'tremolo-strings' : 'vespers', blendToStruck: false };
    case 'settling':
      return { presetId: 'choir', blendToStruck: false };
    case 'depth':
      return { presetId: 'hollow', blendToStruck: false };
    case 'turn':
      // The single struck bowl. The only transient in the session.
      return { presetId: 'himalayan-bronze', blendToStruck: true };
    case 'return':
    default:
      return { presetId: 'vox-humana', blendToStruck: false };
  }
}
