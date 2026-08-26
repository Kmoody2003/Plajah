// Engine state → VELA.
//
// The meditation host. Where the Melos host exposes VELA as a playable voice with noteOn/noteOff
// and full parameter automation, this one drives the same instrument from four macros and a
// breath clock — and never from a keyboard.
//
// Two rules shape everything here, both from the ephemerality premise:
//
//   1. Nothing may loop. Every value below is either monotonic across the session or driven by
//      the breath, and the only randomness comes from Tide, which is a random walk rather than
//      a cycle. If a listener can identify a repeat, the sense of a moment passing dies.
//   2. Decay is one-way. The bank is never re-struck to "refresh" a note, and the Veil decay
//      only ever lengthens until Return. Energy leaves the system, which is the physical form
//      of the thing the session is about.

import { M, V, X, lfoRange, LFO_SHAPE_TIDE } from '../../melos/instruments/vela/params';
import type { SessionState } from './emotionalEngine';
import { getTuning } from './soundTuning';

export interface VelaFrame {
  /** Raw param id → value, ready for `instrument.setParams`. */
  params: Array<[number, number]>;
  /** Notes to voice this frame, if any. */
  notes: Array<{ note: number; velocity: number; pan: number; durationSec: number }>;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A pentatonic set with no leading tone and no resolution — nothing in it points anywhere.
 * Deliberately not a scale with a tonic: a cadence is an arrival, and this session does not
 * arrive, it stops.
 */
const DEGREES = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

/** Root moves down as the session deepens. Lower is not "sadder", it is less arousing. */
function rootFor(depth: number): number {
  return Math.round(50 - depth * 7); // D3 down to about G2
}

/**
 * Continuous parameters for this instant.
 *
 * The four macros are expanded here rather than by `expandMacros` in presets.ts, because the
 * meditation host needs the engine's arousal and depth to reach parameters the Play panel does
 * not surface — Veil decay and blur in particular.
 */
export function velaParamsFor(s: SessionState): Array<[number, number]> {
  const calm = 1 - s.arousal;

  // Air — exciter pressure follows the inhale, so the body is being fed in time with the
  // breath. This is the single most direct link between the person and the sound.
  const inhale = Math.max(0, Math.sin(Math.PI * Math.min(1, s.breathPhase * 2)));
  const pressure = clamp01(0.18 + inhale * (0.30 + calm * 0.22));

  // Body — roughness comes down across the session. Partials moving out of each other's
  // critical bands is a real psychoacoustic mechanism, not a metaphor, and it is the reason the
  // release is felt before it is noticed.
  // Lower inharmonicity → purer, more synth/voice-like partials and less metallic bell "ring",
  // which piled up and grated. The body sings rather than clangs.
  const inharm = clamp01(0.01 + s.arousal * 0.05);
  const decay = clamp01(0.35 + s.depth * 0.45);

  // Slow, non-commensurate morph terms (0..1) so the SPACE and the shimmer breathe over minutes
  // rather than sitting constant. Two incommensurate sines — never quite the same combination twice.
  const morphA = clamp01(0.5 + 0.35 * Math.sin(s.t / 53) + 0.15 * Math.sin(s.t / 29 + 1.7));
  const morphB = clamp01(0.5 + 0.4 * Math.sin(s.t / 71 + 2.3) + 0.1 * Math.sin(s.t / 37));

  // Live tuning (admin sliders): warmth lifts the low-mid floor, brightness scales the high end
  // (the whine control), reverb scales the Veil. Read fresh each update so a slider is heard at once.
  const T = getTuning();

  // Spectral brightness — warmth in the floor, brightness on the arousal-driven top.
  const tone = clamp01(0.05 + T.warmth * 0.1 + s.arousal * 0.16 * T.brightness);

  // Veil = the reverb: modest, MORPHING, and scaled by the reverb knob.
  const veilMix = clamp01((0.24 + s.depth * 0.24 + morphA * 0.12) * (0.5 + T.reverb));
  const veilDecay = clamp01(0.3 + s.depth * 0.5);
  const veilSize = clamp01(0.4 + s.depth * 0.28 + morphB * 0.1);
  // Shimmer is the high pitch-shifted sparkle — the whine. Near-off, drifting, scaled by brightness
  // so it can be taken to nothing.
  const shimmer = clamp01((0.02 + morphB * 0.05) * s.depth * calm * (T.brightness * 2));
  // Blur swells on the exhale — the visual field does the same thing, from the same value.
  const exhale = clamp01((s.breathPhase - 0.5) * 2);
  const blur = clamp01(s.depth * 0.3 + exhale * 0.12);

  return [
    [M.ENABLE, 1],
    [M.INHARM, inharm],
    [M.DECAY, decay],
    // Tilt the decay so the HIGH partials die fast while the low body sustains — the metallic
    // top-end "ring" is what grates, so it is the first thing to go.
    [M.DECAY_TILT, 0.62],
    [M.SPREAD, clamp01(0.1 + s.openness * 0.2)],
    [M.KEYTRACK, 0.4],
    [X.PRESSURE, pressure],
    [X.TONE, tone],
    [X.GRAIN, clamp01(0.25 + s.arousal * 0.35)],
    [V.MIX, veilMix],
    [V.SIZE, veilSize],
    [V.DECAY, veilDecay],
    [V.DIFFUSION, clamp01(0.6 + s.depth * 0.3)],
    [V.SHIMMER, shimmer],
    [V.BLUR, blur],
  ];
}

/**
 * One-time setup: the patch shape that does not change within a session.
 *
 * Drift is configured here — three Motion slots on the slow range, all using Tide. Slow range
 * remaps LFO rate to 20 s – 5 min cycles, and Tide is the only aperiodic shape, so the
 * modulation never returns to a previous state.
 */
export function velaSessionSetup(depth: number): Array<[number, number]> {
  const out: Array<[number, number]> = [
    [M.ENABLE, 1],
    // Lighter banks: fewer resonator partials is the dominant CPU cost of modal synthesis, so this
    // buys back the headroom the ONDA pad + lead cost — and fewer high partials is also LESS
    // metallic, which the sound wanted anyway. The ONDA pad now carries the richness.
    [M.PARTIALS, depth > 0.5 ? 0.5 : 0.35],
    [M.MATERIAL, 0],
    [M.POSITION, 0.28],
    [M.DECAY_TILT, 0.42],
    [X.TYPE, 3], // Rub — the crystal-bowl gesture, and the gentlest way to sustain
    [X.VEL_TILT, 0.5],
    [V.SHIMMER_IVL, 0],
    [V.FREEZE, 0],
  ];
  // Three slow Tide modulators. Rates are mutually non-commensurate so the combination has no
  // common period either — a detail that matters far more over twenty minutes than over two.
  const rates = [0.18, 0.31, 0.47];
  for (let i = 0; i < 3; i++) {
    out.push([800 + i * 10 + 0, LFO_SHAPE_TIDE]); // L_SHAPE
    out.push([800 + i * 10 + 1, rates[i]]); // L_RATE
    out.push([lfoRange(i), 1]); // slow range
    out.push([800 + i * 10 + 3, 1]); // bipolar
    out.push([800 + i * 10 + 4, 0]); // no retrigger — a retriggered walk is a cycle
  }
  return out;
}

/**
 * Which note a bloom event should voice.
 *
 * Chosen from the seed carried by the state rather than at random, so the same session always
 * blooms the same way — the sequence is unrepeatable across sessions and exactly repeatable
 * within one, which is what makes an offline render match the live one.
 */
export function bloomNoteFor(s: SessionState, index: number, seed: number): {
  note: number;
  velocity: number;
  pan: number;
  durationSec: number;
} {
  const root = rootFor(s.depth);
  // A cheap deterministic hash of (seed, index) — no shared mutable RNG, so the answer does not
  // depend on how many times this was called before.
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  const pick = DEGREES[h % DEGREES.length];

  // Spread widens with openness: deeper in, events are allowed further from the centre.
  const octave = ((h >>> 8) % 3) - 1;
  const note = root + pick + octave * 12 * (s.openness > 0.5 ? 1 : 0);

  return {
    note,
    // Quiet, and quieter the deeper the session goes.
    velocity: 0.28 + (1 - s.depth) * 0.3,
    pan: s.bloomPan,
    // Long enough that the bow has fed the bank, short enough that voices free up.
    durationSec: 2.5 + s.openness * 4,
  };
}

/** The Turn: one struck bowl, placed behind and above the listener. */
export function turnGesture(s: SessionState): { note: number; velocity: number; pan: number } {
  return { note: rootFor(s.depth) - 12, velocity: 0.85, pan: -0.55 };
}
