// VELA presets.
//
// These are the spec, not decoration: if a voice here cannot be reached from the parameter set
// in params.ts, the parameter set is wrong. They were the acceptance test while the DSP was
// being written and they stay the acceptance test.
//
// They are grouped into four families, and the families are the point. A bank of resonators
// that can only be struck has exactly one gesture and every preset ends up a variation on it —
// which is what the first set was, and why it sounded like one instrument with eight EQ
// settings. Three engine capabilities open the rest:
//
//   Swell   an amplitude attack, so a body can arrive rather than only decay. Without it a
//           modal bank structurally cannot be a pad.
//   Morph   the bank re-derives itself as the note ages, moving stretch, decay lean and
//           excitation point. A held note is a different body a minute later.
//   Anima / Beat / Pulse   movement inside the sustain: independent partial drift, the
//           singing-bowl beat, and the player leaning into the body.
//
// Every preset also carries a MASTER_GAIN trim. Bodies differ enormously in how much energy
// they hold, and balancing them by squeezing the DSP's normalisation instead just removes
// headroom — which is where the movement lives.

import { M, MASTER_GAIN, V, X } from './params';

export type VelaMacro = 'air' | 'body' | 'shimmer' | 'drift';

/** What kind of thing this is, before what it sounds like. */
export type VelaFamily = 'struck' | 'sustained' | 'voices' | 'pad' | 'soundscape';

export const VELA_FAMILY_LABELS: Record<VelaFamily, string> = {
  struck: 'Struck bodies',
  sustained: 'Sustained',
  voices: 'Strings and voices',
  pad: 'Pads and swells',
  soundscape: 'Soundscapes',
};

export interface VelaPreset {
  id: string;
  name: string;
  family: VelaFamily;
  /** Shown under the name in the gallery — the shorthand a player actually scans. */
  blurb: string;
  description: string;
  /** Raw param ids → values. Anything omitted keeps the engine default. */
  params: Record<number, number>;
  macros: Record<VelaMacro, number>;
}

/** Shorthand so the table below reads as sound design rather than as a wall of ids. */
const body = (
  partials: number, inharm: number, spread: number, decay: number, tilt: number,
  material: number, position: number, keytrack: number,
) => ({
  [M.ENABLE]: 1, [M.PARTIALS]: partials, [M.INHARM]: inharm, [M.SPREAD]: spread,
  [M.DECAY]: decay, [M.DECAY_TILT]: tilt, [M.MATERIAL]: material,
  [M.POSITION]: position, [M.KEYTRACK]: keytrack,
});
const life = (anima: number, beat: number, beatRate: number, pulse: number, pulseRate: number) => ({
  [M.ANIMA]: anima, [M.BEAT]: beat, [M.BEAT_RATE]: beatRate,
  [X.PULSE]: pulse, [X.PULSE_RATE]: pulseRate,
});
const evolve = (swell: number, morph: number, morphTime: number) => ({
  [M.SWELL]: swell, [M.MORPH]: morph, [M.MORPH_TIME]: morphTime,
});
const breath = (type: number, pressure: number, grain: number, tone: number, velTilt: number) => ({
  [X.TYPE]: type, [X.PRESSURE]: pressure, [X.GRAIN]: grain, [X.TONE]: tone, [X.VEL_TILT]: velTilt,
});
const veil = (
  mix: number, size: number, decay: number, diffusion: number,
  shimmer = 0, interval = 0, blur = 0,
) => ({
  [V.MIX]: mix, [V.SIZE]: size, [V.DECAY]: decay, [V.DIFFUSION]: diffusion,
  [V.SHIMMER]: shimmer, [V.SHIMMER_IVL]: interval, [V.BLUR]: blur,
});
const trim = (g: number) => ({ [MASTER_GAIN]: g });

/** Sustained partials plus formants. Everything that is not a struck object lives here. */
const sung = (formant: number, vowel: number, bloom: number, blend = false) => ({
  [M.MODE]: blend ? 2 : 1, [M.FORMANT]: formant, [M.FORMANT_SHIFT]: vowel, [M.BLOOM]: bloom,
});

export const VELA_PRESETS: VelaPreset[] = [
  // ── Struck bodies ────────────────────────────────────────────────────────
  {
    id: 'himalayan-bronze', name: 'Himalayan Bronze', family: 'struck',
    blurb: 'bowl · rub · beat 0.45 Hz',
    description:
      'The reference voice. The beating is the signature — two partials a few Hz apart is what a real bowl does, and it is most of why one raises hair.',
    params: {
      ...body(0.75, 0.04, 0.14, 0.62, 0.42, 0, 0.26, 0.45),
      ...breath(3, 0.55, 0.42, 0.34, 0.6), ...life(0.45, 0.55, 0.15, 0.35, 0.12),
      ...evolve(0.0, 0.5, 0.2), ...veil(0.42, 0.55, 0.5, 0.66, 0.08), ...trim(1.0),
    },
    macros: { air: 0.55, body: 0.35, shimmer: 0.2, drift: 0.22 },
  },
  {
    id: 'vitreous', name: 'Vitreous', family: 'struck',
    blurb: 'glass · strike · fast beat',
    description: 'Crystal rim. Bright, fast-decaying lows and a top that hangs. Fragile.',
    params: {
      ...body(1.0, 0.09, 0.08, 0.5, 0.3, 1, 0.14, 0.6),
      ...breath(2, 0.8, 0.3, 0.62, 0.75), ...life(0.3, 0.35, 0.45, 0.15, 0.3),
      ...evolve(0.0, 0.5, 0.2), ...veil(0.5, 0.45, 0.55, 0.7, 0.22), ...trim(1.0),
    },
    macros: { air: 0.4, body: 0.28, shimmer: 0.38, drift: 0.14 },
  },
  {
    id: 'deep-wash', name: 'Deep Wash', family: 'struck',
    blurb: 'gong · strike · morphs open',
    description:
      'A gong that never resolves to a pitch, and keeps opening for twelve seconds after the strike.',
    params: {
      ...body(1.0, 0.26, 0.3, 0.78, 0.36, 0, 0.5, 0.2),
      ...breath(2, 0.9, 0.6, 0.36, 0.8), ...life(0.6, 0.4, 0.08, 0.3, 0.08),
      ...evolve(0.0, 0.72, 0.13), ...veil(0.55, 0.75, 0.68, 0.8, 0.1), ...trim(0.92),
    },
    macros: { air: 0.7, body: 0.62, shimmer: 0.18, drift: 0.4 },
  },
  {
    id: 'ferrous', name: 'Ferrous', family: 'struck',
    blurb: 'iron · rub · past pitch',
    description:
      'The haunted one. Past the pitch threshold — it reads as a room reacting rather than a note being played.',
    params: {
      ...body(1.0, 0.46, 0.38, 0.7, 0.3, 2, 0.62, 0.1),
      ...breath(3, 0.48, 0.7, 0.42, 0.55), ...life(0.7, 0.5, 0.05, 0.35, 0.06),
      ...evolve(0.0, 0.62, 0.3), ...veil(0.62, 0.7, 0.72, 0.78, 0.16, 0, 0.22), ...trim(0.14),
    },
    macros: { air: 0.48, body: 0.82, shimmer: 0.24, drift: 0.55 },
  },

  // ── Sustained ────────────────────────────────────────────────────────────
  {
    id: 'cathedral', name: 'Cathedral', family: 'sustained',
    blurb: 'bronze · bow · veil 90%',
    description:
      'Bowed metal into a long Veil. Turns a single held note into a chord through shimmer alone.',
    params: {
      ...body(0.75, 0.06, 0.16, 0.55, 0.4, 0, 0.3, 0.35),
      ...breath(0, 0.6, 0.3, 0.4, 0.5), ...life(0.4, 0.3, 0.18, 0.4, 0.1),
      ...evolve(0.12, 0.56, 0.25), ...veil(0.9, 0.85, 0.82, 0.85, 0.5), ...trim(0.11),
    },
    macros: { air: 0.6, body: 0.4, shimmer: 0.72, drift: 0.35 },
  },
  {
    id: 'aurora', name: 'Aurora', family: 'sustained',
    blurb: 'glass · bow · shimmer +19',
    description: 'Shimmer-forward. Blooms upward continuously without ever running away.',
    params: {
      ...body(0.75, 0.11, 0.12, 0.48, 0.34, 1, 0.22, 0.5),
      ...breath(0, 0.55, 0.25, 0.55, 0.45), ...life(0.55, 0.25, 0.35, 0.45, 0.15),
      ...evolve(0.18, 0.5, 0.3), ...veil(0.78, 0.68, 0.75, 0.88, 0.85, 1), ...trim(0.08),
    },
    macros: { air: 0.52, body: 0.3, shimmer: 0.95, drift: 0.42 },
  },
  {
    id: 'aerial', name: 'Aerial', family: 'sustained',
    blurb: 'air · blow · breath-forward',
    description:
      'An air column with almost no metal in it. Nearly a wind sound, pitched only just enough to be played.',
    params: {
      ...body(0.25, 0.01, 0.2, 0.3, 0.58, 5, 0.4, 0.5),
      ...breath(1, 0.62, 0.85, 0.5, 0.4), ...life(0.55, 0.15, 0.3, 0.6, 0.18),
      ...evolve(0.1, 0.5, 0.2), ...veil(0.48, 0.6, 0.45, 0.75, 0.05), ...trim(0.42),
    },
    macros: { air: 0.78, body: 0.16, shimmer: 0.12, drift: 0.3 },
  },

  // ── Strings and voices ───────────────────────────────────────────────────
  // These are the ones a resonator bank structurally could not make. The partials are DRIVEN
  // rather than struck, and the formants sit at fixed frequencies so the ear reads a throat or
  // a body of fixed size rather than a tuned object.
  {
    id: 'choir', name: 'Choir', family: 'voices',
    blurb: 'sustained · formant 78% · ah',
    description:
      'The clearest demonstration of what Sustained mode and formants do. Nothing about this is a bell — move Vowel while a chord is held.',
    params: {
      ...body(0.75, 0.004, 0.22, 0.5, 0.5, 5, 0.5, 0.4),
      ...sung(0.78, 0.62, 0.45), ...breath(0, 0.5, 0.3, 0.4, 0.3),
      ...life(0.55, 0.22, 0.9, 0.35, 0.16), ...evolve(0.42, 0.54, 0.28),
      ...veil(0.56, 0.72, 0.6, 0.82, 0.12), ...trim(0.49),
    },
    macros: { air: 0.5, body: 0.2, shimmer: 0.2, drift: 0.4 },
  },
  {
    id: 'tremolo-strings', name: 'Tremolo Strings', family: 'voices',
    blurb: 'sustained · fast beat · bow',
    description:
      'Bowed ensemble. The beating is fast enough to read as tremolo rather than as a bowl, and Spread does the work of a section playing slightly out of tune.',
    params: {
      ...body(0.75, 0.012, 0.4, 0.45, 0.44, 3, 0.34, 0.5),
      ...sung(0.42, 0.5, 0.3), ...breath(0, 0.6, 0.45, 0.5, 0.4),
      ...life(0.45, 0.62, 0.72, 0.3, 0.4), ...evolve(0.3, 0.56, 0.22),
      ...veil(0.5, 0.62, 0.55, 0.78, 0.1), ...trim(0.22),
    },
    macros: { air: 0.58, body: 0.24, shimmer: 0.16, drift: 0.35 },
  },
  {
    id: 'vox-humana', name: 'Vox Humana', family: 'voices',
    blurb: 'sustained · vowel sweeps over 25 s',
    description:
      'A voice slowly changing what it is saying. Morph carries the formant across the note, so a held chord moves from oo to ah without you touching anything.',
    params: {
      ...body(0.5, 0.006, 0.26, 0.48, 0.52, 5, 0.42, 0.45),
      ...sung(0.85, 0.24, 0.55), ...breath(1, 0.52, 0.4, 0.34, 0.3),
      ...life(0.62, 0.2, 0.55, 0.5, 0.1), ...evolve(0.5, 0.8, 0.45),
      ...veil(0.62, 0.78, 0.68, 0.85, 0.2), ...trim(0.44),
    },
    macros: { air: 0.5, body: 0.2, shimmer: 0.28, drift: 0.5 },
  },
  {
    id: 'glass-choir', name: 'Glass Choir', family: 'voices',
    blurb: 'blend · body under the voice',
    description:
      'Blend mode: a struck glass body and a sung spectrum at once. The strike gives it an edge the pure voice does not have, and the voice gives the glass a throat.',
    params: {
      ...body(0.75, 0.07, 0.16, 0.5, 0.38, 1, 0.2, 0.5),
      ...sung(0.6, 0.7, 0.35, true), ...breath(2, 0.7, 0.35, 0.55, 0.6),
      ...life(0.5, 0.3, 0.4, 0.35, 0.2), ...evolve(0.28, 0.6, 0.3),
      ...veil(0.64, 0.7, 0.66, 0.84, 0.35, 1), ...trim(0.48),
    },
    macros: { air: 0.5, body: 0.3, shimmer: 0.45, drift: 0.4 },
  },
  {
    id: 'hollow', name: 'Hollow', family: 'voices',
    blurb: 'sustained · low formant · almost no pitch',
    description:
      'Barely a note. Formants dominate and the fundamental is nearly gone, so it reads as a space being breathed through rather than anything being played.',
    params: {
      ...body(0.5, 0.03, 0.5, 0.55, 0.6, 5, 0.5, 0.25),
      ...sung(0.95, 0.12, 0.65), ...breath(1, 0.45, 0.75, 0.28, 0.3),
      ...life(0.75, 0.18, 0.3, 0.6, 0.06), ...evolve(0.55, 0.42, 0.55),
      ...veil(0.7, 0.85, 0.74, 0.86, 0.14, 3, 0.28), ...trim(0.22),
    },
    macros: { air: 0.45, body: 0.3, shimmer: 0.18, drift: 0.6 },
  },

  // ── Pads and swells ──────────────────────────────────────────────────────
  {
    id: 'vespers', name: 'Vespers', family: 'pad',
    blurb: 'bronze pad · 3 s swell',
    description:
      'The plainest pad in the set, and the one to start from. Arrives over three seconds, beats gently, never gets bright.',
    params: {
      ...body(0.5, 0.03, 0.18, 0.6, 0.55, 0, 0.32, 0.4),
      ...sung(0.34, 0.45, 0.5, true), ...breath(0, 0.5, 0.35, 0.24, 0.3),
      ...life(0.5, 0.42, 0.11, 0.45, 0.07),
      ...evolve(0.62, 0.56, 0.35), ...veil(0.62, 0.7, 0.62, 0.8, 0.14), ...trim(0.61),
    },
    macros: { air: 0.5, body: 0.3, shimmer: 0.25, drift: 0.4 },
  },
  {
    id: 'glasshouse', name: 'Glasshouse', family: 'pad',
    blurb: 'glass pad · swell into shimmer',
    description:
      'Bright and weightless. The swell and the shimmer arrive together, so it seems to come from above rather than in front.',
    params: {
      ...body(0.75, 0.13, 0.1, 0.52, 0.28, 1, 0.18, 0.55),
      ...breath(0, 0.48, 0.22, 0.6, 0.35), ...life(0.45, 0.3, 0.38, 0.4, 0.13),
      ...evolve(0.7, 0.6, 0.4), ...veil(0.72, 0.66, 0.7, 0.86, 0.6, 1), ...trim(0.09),
    },
    macros: { air: 0.45, body: 0.32, shimmer: 0.8, drift: 0.45 },
  },
  {
    id: 'ashfall', name: 'Ashfall', family: 'pad',
    blurb: 'skin + iron · closes over 20 s',
    description:
      'Starts open and slowly shuts. Morph runs negative here, so the body gets darker and shorter the longer you hold it.',
    params: {
      ...body(0.5, 0.16, 0.34, 0.58, 0.5, 4, 0.44, 0.25),
      ...breath(3, 0.55, 0.62, 0.3, 0.4), ...life(0.6, 0.28, 0.07, 0.5, 0.05),
      ...evolve(0.55, 0.16, 0.45), ...veil(0.6, 0.72, 0.6, 0.74, 0.06, 0, 0.3), ...trim(0.41),
    },
    macros: { air: 0.5, body: 0.5, shimmer: 0.12, drift: 0.5 },
  },
  {
    id: 'rise', name: 'Rise', family: 'pad',
    blurb: 'wood · long swell · opens up',
    description:
      'A swell that keeps going. Eight seconds to arrive and it is still brightening when it gets there — hold it longer than feels sensible.',
    params: {
      ...body(0.75, 0.07, 0.15, 0.5, 0.62, 3, 0.2, 0.5),
      ...sung(0.3, 0.72, 0.6), ...breath(1, 0.6, 0.55, 0.35, 0.3),
      ...life(0.5, 0.2, 0.25, 0.55, 0.1),
      ...evolve(0.86, 0.82, 0.32), ...veil(0.68, 0.75, 0.68, 0.82, 0.4, 0), ...trim(0.24),
    },
    macros: { air: 0.6, body: 0.34, shimmer: 0.5, drift: 0.5 },
  },

  // ── Soundscapes ──────────────────────────────────────────────────────────
  {
    id: 'slow-tide', name: 'Slow Tide', family: 'soundscape',
    blurb: 'one note · 60 s of change',
    description:
      'Play one note and leave it. The bank re-derives itself for a full minute, so nothing you hear at the end was there at the start.',
    params: {
      ...body(0.75, 0.05, 0.28, 0.72, 0.46, 0, 0.3, 0.2),
      ...breath(0, 0.44, 0.4, 0.26, 0.25), ...life(0.75, 0.35, 0.04, 0.55, 0.035),
      ...evolve(0.72, 0.78, 0.8), ...veil(0.72, 0.88, 0.8, 0.86, 0.3, 1, 0.18), ...trim(0.42),
    },
    macros: { air: 0.45, body: 0.4, shimmer: 0.45, drift: 0.7 },
  },
  {
    id: 'reliquary', name: 'Reliquary', family: 'soundscape',
    blurb: 'iron · closes inward · 40 s',
    description:
      'Something ancient and shut. Begins wide and inharmonic and gradually pulls in on itself, as if the room were getting smaller.',
    params: {
      ...body(1.0, 0.4, 0.42, 0.68, 0.34, 2, 0.56, 0.12),
      ...breath(3, 0.42, 0.68, 0.34, 0.4), ...life(0.8, 0.45, 0.045, 0.4, 0.04),
      ...evolve(0.5, 0.12, 0.66), ...veil(0.7, 0.82, 0.78, 0.8, 0.18, 3, 0.35), ...trim(0.08),
    },
    macros: { air: 0.44, body: 0.7, shimmer: 0.22, drift: 0.65 },
  },
  {
    id: 'cathedral-dust', name: 'Cathedral Dust', family: 'soundscape',
    blurb: 'bell → air · 30 s',
    description:
      'Starts as a struck bell and ends as breath. The morph carries it the whole way; the strike is only how it begins.',
    params: {
      ...body(0.75, 0.08, 0.22, 0.66, 0.4, 0, 0.24, 0.3),
      ...breath(2, 0.85, 0.5, 0.44, 0.6), ...life(0.7, 0.3, 0.09, 0.3, 0.06),
      ...evolve(0.0, 0.88, 0.56), ...veil(0.74, 0.86, 0.82, 0.88, 0.45, 0, 0.42), ...trim(1.0),
    },
    macros: { air: 0.5, body: 0.45, shimmer: 0.55, drift: 0.6 },
  },
  {
    id: 'undertow', name: 'Undertow', family: 'soundscape',
    blurb: 'skin · sub-heavy floor',
    description:
      'Highs gone in half a second. The floor a session sits on, rather than anything you would solo.',
    params: {
      ...body(0.25, 0.02, 0.1, 0.66, 0.9, 4, 0.46, 0.3),
      ...breath(2, 0.85, 0.4, 0.12, 0.5), ...life(0.35, 0.3, 0.1, 0.25, 0.09),
      ...evolve(0.2, 0.44, 0.5), ...veil(0.38, 0.8, 0.6, 0.6), ...trim(0.95),
    },
    macros: { air: 0.6, body: 0.7, shimmer: 0.02, drift: 0.18 },
  },
  // ── Production & Heritage Modal Expansion ────────────────────────────────
  {
    id: 'kyoto-temple-rin', name: 'Kyoto Temple Rin', family: 'struck',
    blurb: 'spun brass · crisp wood striker · singing fifth',
    description: 'Hand-hammered Japanese sanctuary rin bowl struck with an ebony-tipped stick: crystalline transient followed by a 0.6 Hz doublet beat.',
    params: {
      ...body(0.85, 0.055, 0.11, 0.68, 0.36, 0, 0.21, 0.55),
      ...breath(2, 0.72, 0.28, 0.56, 0.68), ...life(0.38, 0.58, 0.22, 0.22, 0.14),
      ...evolve(0.0, 0.52, 0.24), ...veil(0.46, 0.62, 0.58, 0.74, 0.14), ...trim(0.95),
    },
    macros: { air: 0.45, body: 0.38, shimmer: 0.26, drift: 0.24 },
  },
  {
    id: 'javanese-bonang-kettle', name: 'Gamelan Bronze Kettle', family: 'struck',
    blurb: 'boss-tuned bronze · ombak shimmer',
    description: 'Central-bossed Javanese bronze kettle gong with paired ombak beating and warm wooden rack resonance.',
    params: {
      ...body(0.72, 0.12, 0.19, 0.56, 0.48, 0, 0.34, 0.5),
      ...breath(2, 0.76, 0.34, 0.44, 0.65), ...life(0.42, 0.68, 0.38, 0.2, 0.16),
      ...evolve(0.0, 0.48, 0.22), ...veil(0.4, 0.58, 0.52, 0.72, 0.06), ...trim(0.92),
    },
    macros: { air: 0.42, body: 0.48, shimmer: 0.14, drift: 0.28 },
  },
  {
    id: 'rosewood-marimba-arch', name: 'Honduran Rosewood Bar', family: 'struck',
    blurb: 'carved wood · yarn mallet · 1:4:10 modes',
    description: 'Arch-undercut concert rosewood bar over brass resonator tubes — warm fundamental bloom for minimalist ostinati and film cues.',
    params: {
      ...body(0.55, 0.08, 0.09, 0.38, 0.64, 3, 0.42, 0.65),
      ...breath(2, 0.68, 0.26, 0.38, 0.62), ...life(0.24, 0.18, 0.18, 0.14, 0.12),
      ...evolve(0.0, 0.5, 0.18), ...veil(0.36, 0.54, 0.46, 0.7, 0.04), ...trim(0.96),
    },
    macros: { air: 0.38, body: 0.52, shimmer: 0.1, drift: 0.14 },
  },
  {
    id: 'bowed-vibraphone-halo', name: 'Bowed Vibraphone', family: 'sustained',
    blurb: 'aluminum bar · contrabass bow · motor pulse',
    description: 'Double-bass hair drawn across the nodal edge of an aluminum vibraphone bar with gentle motor-vane tremolo.',
    params: {
      ...body(0.7, 0.065, 0.12, 0.58, 0.38, 0, 0.18, 0.55),
      ...breath(0, 0.58, 0.24, 0.48, 0.45), ...life(0.44, 0.42, 0.48, 0.48, 0.28),
      ...evolve(0.22, 0.54, 0.28), ...veil(0.64, 0.72, 0.68, 0.82, 0.28, 1), ...trim(0.26),
    },
    macros: { air: 0.5, body: 0.36, shimmer: 0.42, drift: 0.34 },
  },
  {
    id: 'cristal-baschet', name: 'Cristal Baschet', family: 'sustained',
    blurb: 'wet glass rods · metal radiator cones',
    description: 'Moistened fingers stroking tuned glass rods coupled to flame-shaped sheet-metal resonators — singing celestial purity.',
    params: {
      ...body(0.88, 0.095, 0.14, 0.54, 0.32, 1, 0.24, 0.52),
      ...breath(3, 0.54, 0.22, 0.58, 0.48), ...life(0.48, 0.32, 0.26, 0.38, 0.14),
      ...evolve(0.26, 0.58, 0.32), ...veil(0.68, 0.74, 0.72, 0.86, 0.36, 1), ...trim(0.18),
    },
    macros: { air: 0.48, body: 0.34, shimmer: 0.54, drift: 0.38 },
  },
  {
    id: 'nordic-ice-harmonica', name: 'Franklin Glass Armonica', family: 'voices',
    blurb: 'spinning quartz bowls · vocal formant',
    description: 'Concentric spinning leaded-crystal bowls fused with a delicate vocal formant halo for intimate Nordic underscores.',
    params: {
      ...body(0.78, 0.05, 0.18, 0.52, 0.4, 1, 0.26, 0.48),
      ...sung(0.52, 0.58, 0.4, true), ...breath(3, 0.52, 0.28, 0.5, 0.42),
      ...life(0.52, 0.34, 0.32, 0.36, 0.16), ...evolve(0.34, 0.62, 0.34),
      ...veil(0.66, 0.76, 0.7, 0.84, 0.32, 1), ...trim(0.38),
    },
    macros: { air: 0.48, body: 0.3, shimmer: 0.46, drift: 0.42 },
  },
  {
    id: 'cello-harmonic-cloud', name: 'Sul Ponticello Cloud', family: 'voices',
    blurb: 'wooden body · glassy overtones · slow bow',
    description: 'Bowed just millimetres from the bridge so the fundamental recedes and icy upper wooden modes shimmer across the stereo field.',
    params: {
      ...body(0.82, 0.018, 0.32, 0.48, 0.36, 3, 0.12, 0.5),
      ...sung(0.46, 0.64, 0.38), ...breath(0, 0.58, 0.48, 0.56, 0.4),
      ...life(0.56, 0.44, 0.52, 0.42, 0.22), ...evolve(0.38, 0.64, 0.32),
      ...veil(0.62, 0.74, 0.66, 0.82, 0.24), ...trim(0.28),
    },
    macros: { air: 0.58, body: 0.28, shimmer: 0.34, drift: 0.44 },
  },
  {
    id: 'amber-sanctuary-swell', name: 'Amber Sanctuary', family: 'pad',
    blurb: 'aged wood + bronze · 4 s warm bloom',
    description: 'Lush, velvet modal pad combining aged wooden body warmth with slow bronze shimmer — effortless under vocals or piano.',
    params: {
      ...body(0.6, 0.025, 0.22, 0.58, 0.56, 3, 0.36, 0.45),
      ...sung(0.4, 0.48, 0.52, true), ...breath(0, 0.48, 0.32, 0.3, 0.32),
      ...life(0.52, 0.36, 0.14, 0.44, 0.09), ...evolve(0.66, 0.6, 0.38),
      ...veil(0.68, 0.78, 0.68, 0.84, 0.22), ...trim(0.52),
    },
    macros: { air: 0.48, body: 0.36, shimmer: 0.32, drift: 0.44 },
  },
  {
    id: 'solstice-horizon', name: 'Solstice Horizon', family: 'pad',
    blurb: 'air + glass · fifths shimmer · weightless',
    description: 'Wide atmospheric modal pad whose fifth-shifted Veil halo opens gently as the chord sustains.',
    params: {
      ...body(0.68, 0.08, 0.16, 0.54, 0.38, 1, 0.24, 0.5),
      ...breath(1, 0.52, 0.38, 0.48, 0.36), ...life(0.54, 0.28, 0.24, 0.48, 0.12),
      ...evolve(0.68, 0.68, 0.36), ...veil(0.74, 0.8, 0.74, 0.88, 0.52, 2), ...trim(0.16),
    },
    macros: { air: 0.56, body: 0.3, shimmer: 0.68, drift: 0.48 },
  },
  {
    id: 'subterranean-cistern', name: 'Subterranean Cistern', family: 'soundscape',
    blurb: 'iron + water reflections · 45 s drift',
    description: 'Resonant iron pillars echoing across an underground stone reservoir — dark, cinematic tension bed.',
    params: {
      ...body(0.92, 0.34, 0.36, 0.72, 0.42, 2, 0.52, 0.16),
      ...breath(3, 0.46, 0.58, 0.32, 0.38), ...life(0.74, 0.42, 0.06, 0.42, 0.05),
      ...evolve(0.46, 0.28, 0.48), ...veil(0.76, 0.9, 0.84, 0.86, 0.2, 3, 0.34), ...trim(0.12),
    },
    macros: { air: 0.46, body: 0.68, shimmer: 0.26, drift: 0.64 },
  },
  {
    id: 'koto-bamboo-bridge', name: 'Wooden Koto Harp', family: 'struck',
    blurb: 'plucked wood + paulownia · crisp silk',
    description: 'Dry plucked paulownia resonators with high treble tilt and swift natural wood damping — articulate chamber arpeggios.',
    params: {
      ...body(0.66, 0.014, 0.08, 0.34, 0.68, 3, 0.22, 0.7),
      ...breath(2, 0.72, 0.18, 0.58, 0.55), ...life(0.18, 0.14, 0.2, 0.12, 0.08),
      ...evolve(0.0, 0.28, 0.18), ...veil(0.32, 0.48, 0.42, 0.68, 0.04), ...trim(0.95),
    },
    macros: { air: 0.68, body: 0.22, shimmer: 0.12, drift: 0.14 },
  },
  {
    id: 'steelpan-island-harmonics', name: 'Trinidad Tenor Pan', family: 'struck',
    blurb: 'hammered steel · octave harmonic',
    description: 'Bright hammered tempered iron pan where an octave partial blooms right after the rubber mallet contact.',
    params: {
      ...body(0.7, 0.06, 0.1, 0.46, 0.46, 2, 0.34, 0.65),
      ...breath(2, 0.64, 0.22, 0.62, 0.52), ...life(0.32, 0.42, 0.34, 0.22, 0.14),
      ...evolve(0.02, 0.44, 0.22), ...veil(0.38, 0.54, 0.48, 0.7, 0.12), ...trim(0.82),
    },
    macros: { air: 0.6, body: 0.32, shimmer: 0.26, drift: 0.2 },
  },
  {
    id: 'glass-harmonica-spin', name: 'Bohemian Crystal Armonica', family: 'sustained',
    blurb: 'wet crystal rims · singing fifth halo',
    description: 'Rotating nested crystal bowls rubbed with damp fingertips: pure, eerie sine-like partials floating into a crystalline space.',
    params: {
      ...body(0.54, 0.024, 0.06, 0.7, 0.44, 1, 0.32, 0.58),
      ...sung(0.28, 0.58, 0.35), ...breath(0, 0.5, 0.2, 0.44, 0.32),
      ...life(0.38, 0.52, 0.24, 0.36, 0.12), ...evolve(0.28, 0.42, 0.34),
      ...veil(0.62, 0.72, 0.68, 0.82, 0.32, 2), ...trim(0.42),
    },
    macros: { air: 0.46, body: 0.28, shimmer: 0.5, drift: 0.3 },
  },
  {
    id: 'nordic-choir-fjord', name: 'Fjord Mist Choir', family: 'voices',
    blurb: 'choral vowel morph · ice breeze',
    description: 'Open human vowel formants blended with cool air partials so sustained chords drift gently from dark /u/ to bright /e/.',
    params: {
      ...body(0.76, 0.008, 0.28, 0.6, 0.48, 6, 0.46, 0.36),
      ...sung(0.84, 0.36, 0.58, true), ...breath(1, 0.54, 0.42, 0.4, 0.34),
      ...life(0.6, 0.32, 0.28, 0.46, 0.1), ...evolve(0.56, 0.78, 0.54),
      ...veil(0.74, 0.88, 0.8, 0.88, 0.28, 1, 0.2), ...trim(0.42),
    },
    macros: { air: 0.52, body: 0.3, shimmer: 0.42, drift: 0.56 },
  },
  {
    id: 'cathedral-velvet-organ', name: 'Velvet Pipe Pad', family: 'pad',
    blurb: 'blown air + wood · infinite fifths',
    description: 'Slow-arriving blown modal pad balancing warm wooden body resonance with a luminous octave shimmer tail.',
    params: {
      ...body(0.62, 0.012, 0.24, 0.64, 0.54, 3, 0.44, 0.42),
      ...sung(0.46, 0.4, 0.48, true), ...breath(1, 0.56, 0.52, 0.36, 0.3),
      ...life(0.48, 0.4, 0.16, 0.44, 0.08), ...evolve(0.7, 0.62, 0.5),
      ...veil(0.7, 0.84, 0.76, 0.86, 0.34, 1, 0.16), ...trim(0.48),
    },
    macros: { air: 0.54, body: 0.34, shimmer: 0.48, drift: 0.46 },
  },
];

export const velaPreset = (id: string): VelaPreset | undefined =>
  VELA_PRESETS.find((p) => p.id === id);

export const DEFAULT_VELA_PRESET = VELA_PRESETS[0];

/** Grouped for the gallery, in family order. */
export const velaPresetsByFamily = (): Array<{ family: VelaFamily; label: string; presets: VelaPreset[] }> =>
  (['struck', 'sustained', 'voices', 'pad', 'soundscape'] as VelaFamily[]).map((family) => ({
    family,
    label: VELA_FAMILY_LABELS[family],
    presets: VELA_PRESETS.filter((p) => p.family === family),
  }));

// ── Macros ───────────────────────────────────────────────────────────────────

/**
 * Expand the four Play-panel macros into raw parameter values, layered on a preset.
 *
 * A macro is not one parameter with a friendly name — each moves several along a curve chosen
 * so the whole travel is useful. Air is the clearest: at the bottom a whisper of pressure with
 * a soft tone, at the top hard, grainy and bright, and no single engine parameter does that.
 */
export function expandMacros(
  base: Record<number, number>,
  macros: Record<VelaMacro, number>,
): Record<number, number> {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const air = clamp(macros.air);
  const bodyM = clamp(macros.body);
  const shimmer = clamp(macros.shimmer);

  const at = (id: number, fallback: number) => base[id] ?? fallback;
  const out: Record<number, number> = { ...base };

  out[X.PRESSURE] = clamp(0.12 + air * 0.85);
  out[X.GRAIN] = clamp(at(X.GRAIN, 0.4) * 0.45 + air * 0.55);
  out[X.TONE] = clamp(at(X.TONE, 0.4) * 0.6 + air * 0.4);

  // Non-linear on inharmonicity because the musically useful range is compressed into the
  // bottom fifth of the control; a linear macro would spend most of its travel past the point
  // where pitch has already dissolved.
  out[M.INHARM] = clamp(at(M.INHARM, 0.05) + bodyM * bodyM * 0.45);
  out[M.DECAY] = clamp(0.15 + bodyM * 0.7);

  // Mix and shimmer move together: shimmer with no wet signal is an inaudible control, and
  // that is a confusing knob to hand someone.
  out[V.SHIMMER] = clamp(shimmer);
  out[V.MIX] = clamp(Math.max(at(V.MIX, 0.4), shimmer * 0.9));

  // Drift is not expanded here — it scales the depth of every Motion route, which lives in the
  // Motion compiler rather than in the parameter block.
  return out;
}

export const driftDepthScale = (drift: number): number =>
  Math.max(0, Math.min(1, drift)) * 1.6;
