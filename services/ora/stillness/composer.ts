// The composer — the thing that actually writes a MELODY, and keeps writing one, indefinitely.
//
// Everything else on the channel is texture: a drone that holds, chords that drift, a pulse on the
// breath. None of it is a tune. This is. It scores a single melodic line the way an improviser over
// a modal drone would — a short motif, stated, then developed (moved, inverted, fragmented,
// stretched) so it recurs recognisably but never identically, phrase after phrase, forever.
//
// Three rules make it musical rather than random:
//
//   1. It only ever plays notes from the harmony's current pitch collection, so the melody is
//      consonant with the chords and drone by construction — it can wander freely and never clash.
//   2. It moves mostly by STEP. Conjunct motion is what the ear reads as a melody rather than a
//      sequence of pitches; leaps are rare and deliberate.
//   3. It PHRASES. A phrase is a gesture with an end, followed by a rest at least as long as itself.
//      The silence is the composition too — it is what keeps an endless line from becoming wallpaper.
//
// Like the rest of the engine it is a pure function of (seed, time): the same arc always scores the
// same melody, so a shared stream is identical for everyone and an offline render matches a live one.

import type { SessionState } from './emotionalEngine';

export interface MelodyNote {
  /** Seconds from the arc's start. */
  at: number;
  /** MIDI note. */
  note: number;
  velocity: number;
  /** How long to feed the voice, seconds. Legato — held longer than the step, so notes overlap. */
  holdSec: number;
}

/** Register the melody lives in. Deliberately mid: above the low harmony, below the range where a
 *  sustained tone reads as a whine. Lines are octave-folded to stay inside it. */
const MEL_LOW = 52;   // ~E3
const MEL_HIGH = 74;  // ~D5

/** A deterministic 0..1 from two integers — no shared mutable RNG, so call order never matters. */
function hashUnit(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
const pick = <T,>(arr: T[], r: number): T => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

/** Fold a MIDI note into the melody register by octaves, so a developed line never drifts away. */
function fold(note: number): number {
  let n = note;
  while (n < MEL_LOW) n += 12;
  while (n > MEL_HIGH) n -= 12;
  return n;
}

/**
 * A scale degree → a MIDI note.
 *
 * The "scale" is the harmony's pitch collection repeated across octaves, so degree 0 is the lowest
 * pitch class, degree `set.length` is that class an octave up, and negative degrees go below. This
 * is what keeps the melody locked to the harmony no matter how far the line walks.
 */
function degreeToNote(set: number[], deg: number, root: number): number {
  const len = set.length;
  const oct = Math.floor(deg / len);
  const pc = set[((deg % len) + len) % len];
  return fold(root + pc + oct * 12);
}

/**
 * A motif: a contour of scale-step deltas and a rhythm, both drawn from the seed.
 *
 * The contour is mostly ±1 (stepwise) with the occasional wider move, so it sings. The rhythm is in
 * beats; a beat is derived from the breath, so the melody floats at the body's pace rather than a
 * grid's.
 */
function makeMotif(seed: number): { contour: number[]; rhythm: number[] } {
  const len = 3 + Math.floor(hashUnit(seed, 1) * 3); // 3..5 notes
  const STEPS = [-2, -1, -1, 1, 1, 2]; // weighted toward conjunct motion
  const DURS = [1, 1, 2, 2, 3];        // in beats
  const contour: number[] = [];
  const rhythm: number[] = [];
  for (let i = 0; i < len; i++) {
    contour.push(pick(STEPS, hashUnit(seed, i * 3 + 2)));
    rhythm.push(pick(DURS, hashUnit(seed, i * 3 + 3)));
  }
  return { contour, rhythm };
}

/** One phrase's transformation of the base motif — how development happens over time. */
function transform(base: { contour: number[]; rhythm: number[] }, phrase: number, seed: number) {
  const r = (k: number) => hashUnit(seed ^ 0x51ed, phrase * 7 + k);
  let contour = [...base.contour];
  let rhythm = [...base.rhythm];
  // Invert: flip the contour upside down — the same shape, reflected. A classic development.
  if (r(1) < 0.35) contour = contour.map((d) => -d);
  // Retrograde: play the shape backwards.
  if (r(2) < 0.25) { contour = [...contour].reverse(); rhythm = [...rhythm].reverse(); }
  // Fragment: state only the opening of the motif — a question left hanging.
  if (r(3) < 0.3 && contour.length > 2) { const n = 2 + Math.floor(r(4) * (contour.length - 2)); contour = contour.slice(0, n); rhythm = rhythm.slice(0, n); }
  // Augment: stretch the rhythm, so the same line arrives slower and more spacious deep in.
  if (r(5) < 0.3) rhythm = rhythm.map((d) => d + 1);
  return { contour, rhythm };
}

export interface ComposeOptions {
  seed: number;
  durationSec: number;
  /** The session arc, for depth/arousal/breath at any moment. */
  stateAt: (t: number) => SessionState;
  /** The harmony's pitch collection at any moment — what the melody is allowed to use. */
  setAt: (t: number) => number[];
}

/**
 * Score the whole arc's melody up front.
 *
 * Built ahead of time for the same reasons the harmony is: the channel bakes a session before the
 * live edge and an offline render needs every note queued. Phrases are laid down one after another
 * with real rests between them; density follows the arc, and the Depth phase is left nearly silent
 * because that is where the melody's absence says the most.
 */
export function composeMelody(opts: ComposeOptions): MelodyNote[] {
  const { seed, durationSec, stateAt, setAt } = opts;
  const base = makeMotif(seed);
  const out: MelodyNote[] = [];

  let t = 4 + hashUnit(seed, 9) * 12; // enter after the field has established, not on the downbeat
  let degree = 0;                     // the running scale-degree the next phrase starts from
  let phrase = 0;
  let guard = 0;

  while (t < durationSec - 4 && guard++ < 4000) {
    const s = stateAt(t);
    const set = setAt(t);
    if (!set.length) { t += 8; continue; }

    // The beat floats at the breath's pace; slower and quieter the deeper the session goes.
    const beat = Math.max(1.6, Math.min(4.5, s.breathRate / 3.2));
    // The SAME base the harmony uses (velaPlayer's rootFor), so the set's pitch classes line up
    // exactly — the melody is in the harmony's key by construction. degreeToNote then octave-folds
    // the line up into the melody register, so it sits above the chords while staying consonant.
    const root = Math.round(43 - s.depth * 8);

    // Depth is the emptiest stretch — most phrases there are held back, and the ones that sound are
    // the barest fragments. Elsewhere the line is present but never continuous.
    const skipChance = s.phase === 'depth' ? 0.7 : s.phase === 'turn' ? 0.55 : 0.22;
    if (hashUnit(seed, phrase * 5 + 1) < skipChance) {
      // A rest. Its length is the composition too — longer when there is more openness.
      t += beat * (3 + s.openness * 6);
      phrase++;
      continue;
    }

    const { contour, rhythm } = transform(base, phrase, seed);
    // Where this phrase starts: a gentle walk of the whole line over time (development by position),
    // nudged back toward centre so it never climbs away or sinks out of register.
    degree += Math.round(hashUnit(seed, phrase * 5 + 2) * 3) - 1 - Math.sign(degree) * (Math.abs(degree) > 5 ? 1 : 0);
    let deg = degree;

    let localT = t;
    const velBase = 0.2 + (1 - s.depth) * 0.16;
    for (let i = 0; i < contour.length; i++) {
      const note = degreeToNote(set, deg, root);
      const dur = rhythm[i] * beat;
      out.push({
        at: localT,
        note,
        // A soft arch over the phrase — swell to the middle, ease off at the end.
        velocity: Math.max(0.12, velBase * (0.8 + 0.3 * Math.sin((Math.PI * i) / Math.max(1, contour.length - 1)))),
        holdSec: dur * 1.6, // legato: notes ring into one another
      });
      localT += dur;
      deg += contour[i]; // move by the motif's next step
    }

    // Rest after the phrase — at least as long as a breath, longer with openness. This is rule 3.
    t = localT + beat * (2 + s.openness * 5);
    phrase++;
  }

  return out;
}
