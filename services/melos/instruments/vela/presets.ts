// VELA presets.
//
// These eight are the spec, not decoration: if a voice here cannot be reached from the
// parameter set in params.ts, the parameter set is wrong. They were the acceptance test while
// the DSP was being written and they stay the acceptance test.
//
// The four macros — Air, Body, Shimmer, Drift — are the whole of the Play panel, and they are
// also the exact surface the meditation host drives. That is why there are four and not six.

import { M, V, X } from './params';

export type VelaMacro = 'air' | 'body' | 'shimmer' | 'drift';

export interface VelaPreset {
  id: string;
  name: string;
  /** Shown under the name in the gallery — the shorthand a player actually scans. */
  blurb: string;
  /** Short description of what the voice is for. */
  description: string;
  /** Raw param ids → values. Anything omitted keeps the engine default. */
  params: Record<number, number>;
  /** Starting macro positions for the Play panel. */
  macros: Record<VelaMacro, number>;
}

export const VELA_PRESETS: VelaPreset[] = [
  {
    id: 'himalayan-bronze',
    name: 'Himalayan Bronze',
    blurb: 'bowl · rub · inharm 4%',
    description:
      'The reference voice. Slow rub excitation, long high-partial ring, minimal shimmer. Warm and unmistakably metal.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 0.75, [M.INHARM]: 0.04, [M.SPREAD]: 0.14,
      [M.DECAY]: 0.62, [M.DECAY_TILT]: 0.42, [M.MATERIAL]: 0, [M.POSITION]: 0.26, [M.KEYTRACK]: 0.45,
      [X.TYPE]: 3, [X.PRESSURE]: 0.55, [X.GRAIN]: 0.42, [X.TONE]: 0.34, [X.VEL_TILT]: 0.6,
      [V.MIX]: 0.42, [V.SIZE]: 0.55, [V.DECAY]: 0.5, [V.DIFFUSION]: 0.66, [V.SHIMMER]: 0.08,
    },
    macros: { air: 0.55, body: 0.35, shimmer: 0.2, drift: 0.22 },
  },
  {
    id: 'vitreous',
    name: 'Vitreous',
    blurb: 'glass · strike · inharm 9%',
    description:
      'Crystal rim. Bright, fast-decaying lows and a top that hangs for twenty seconds. Fragile.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 1.0, [M.INHARM]: 0.09, [M.SPREAD]: 0.08,
      [M.DECAY]: 0.5, [M.DECAY_TILT]: 0.3, [M.MATERIAL]: 1, [M.POSITION]: 0.14, [M.KEYTRACK]: 0.6,
      [X.TYPE]: 2, [X.PRESSURE]: 0.8, [X.GRAIN]: 0.3, [X.TONE]: 0.72, [X.VEL_TILT]: 0.75,
      [V.MIX]: 0.5, [V.SIZE]: 0.45, [V.DECAY]: 0.55, [V.DIFFUSION]: 0.7, [V.SHIMMER]: 0.22,
    },
    macros: { air: 0.4, body: 0.28, shimmer: 0.38, drift: 0.14 },
  },
  {
    id: 'deep-wash',
    name: 'Deep Wash',
    blurb: 'gong · strike · inharm 34%',
    description:
      'A gong that never resolves to a pitch. Position is the interesting modulation target here — put Tide on it and no two strikes land the same.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 1.0, [M.INHARM]: 0.34, [M.SPREAD]: 0.3,
      [M.DECAY]: 0.78, [M.DECAY_TILT]: 0.36, [M.MATERIAL]: 0, [M.POSITION]: 0.5, [M.KEYTRACK]: 0.2,
      [X.TYPE]: 2, [X.PRESSURE]: 0.9, [X.GRAIN]: 0.6, [X.TONE]: 0.4, [X.VEL_TILT]: 0.8,
      [V.MIX]: 0.55, [V.SIZE]: 0.75, [V.DECAY]: 0.68, [V.DIFFUSION]: 0.8, [V.SHIMMER]: 0.1,
    },
    macros: { air: 0.7, body: 0.62, shimmer: 0.18, drift: 0.4 },
  },
  {
    id: 'aerial',
    name: 'Aerial',
    blurb: 'air · blow · inharm 1%',
    description:
      'An air column with almost no metal in it. Breath-forward, nearly a wind sound, pitched only just enough to be played.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 0.25, [M.INHARM]: 0.01, [M.SPREAD]: 0.2,
      [M.DECAY]: 0.3, [M.DECAY_TILT]: 0.58, [M.MATERIAL]: 5, [M.POSITION]: 0.4, [M.KEYTRACK]: 0.5,
      [X.TYPE]: 1, [X.PRESSURE]: 0.62, [X.GRAIN]: 0.85, [X.TONE]: 0.55, [X.VEL_TILT]: 0.4,
      [V.MIX]: 0.48, [V.SIZE]: 0.6, [V.DECAY]: 0.45, [V.DIFFUSION]: 0.75, [V.SHIMMER]: 0.05,
    },
    macros: { air: 0.78, body: 0.16, shimmer: 0.12, drift: 0.3 },
  },
  {
    id: 'cathedral',
    name: 'Cathedral',
    blurb: 'bronze · bow · veil 90%',
    description:
      'Bowed metal into a forty-second Veil. Turns a single held note into a chord through shimmer alone.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 0.75, [M.INHARM]: 0.06, [M.SPREAD]: 0.16,
      [M.DECAY]: 0.55, [M.DECAY_TILT]: 0.4, [M.MATERIAL]: 0, [M.POSITION]: 0.3, [M.KEYTRACK]: 0.35,
      [X.TYPE]: 0, [X.PRESSURE]: 0.6, [X.GRAIN]: 0.3, [X.TONE]: 0.42, [X.VEL_TILT]: 0.5,
      [V.MIX]: 0.9, [V.SIZE]: 0.85, [V.DECAY]: 0.82, [V.DIFFUSION]: 0.85,
      [V.SHIMMER]: 0.5, [V.SHIMMER_IVL]: 0,
    },
    macros: { air: 0.6, body: 0.4, shimmer: 0.72, drift: 0.35 },
  },
  {
    id: 'ferrous',
    name: 'Ferrous',
    blurb: 'iron · rub · inharm 58%',
    description:
      'The haunted one. Past the pitch threshold — it reads as a room reacting rather than a note being played.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 1.0, [M.INHARM]: 0.58, [M.SPREAD]: 0.45,
      [M.DECAY]: 0.7, [M.DECAY_TILT]: 0.3, [M.MATERIAL]: 2, [M.POSITION]: 0.62, [M.KEYTRACK]: 0.1,
      [X.TYPE]: 3, [X.PRESSURE]: 0.48, [X.GRAIN]: 0.7, [X.TONE]: 0.5, [X.VEL_TILT]: 0.55,
      [V.MIX]: 0.62, [V.SIZE]: 0.7, [V.DECAY]: 0.72, [V.DIFFUSION]: 0.78, [V.SHIMMER]: 0.16, [V.BLUR]: 0.22,
    },
    macros: { air: 0.48, body: 0.82, shimmer: 0.24, drift: 0.55 },
  },
  {
    id: 'aurora',
    name: 'Aurora',
    blurb: 'glass · bow · shimmer 100%',
    description:
      'Shimmer-forward pad. Feedback sits just under unity, so it blooms upward continuously without running away.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 0.75, [M.INHARM]: 0.11, [M.SPREAD]: 0.12,
      [M.DECAY]: 0.48, [M.DECAY_TILT]: 0.34, [M.MATERIAL]: 1, [M.POSITION]: 0.22, [M.KEYTRACK]: 0.5,
      [X.TYPE]: 0, [X.PRESSURE]: 0.55, [X.GRAIN]: 0.25, [X.TONE]: 0.6, [X.VEL_TILT]: 0.45,
      [V.MIX]: 0.82, [V.SIZE]: 0.68, [V.DECAY]: 0.75, [V.DIFFUSION]: 0.88,
      [V.SHIMMER]: 1.0, [V.SHIMMER_IVL]: 1,
    },
    macros: { air: 0.52, body: 0.3, shimmer: 0.95, drift: 0.42 },
  },
  {
    id: 'undertow',
    name: 'Undertow',
    blurb: 'skin · strike · tilt +80%',
    description:
      'Sub-heavy, highs gone in half a second. The floor a session sits on, rather than anything you would solo.',
    params: {
      [M.ENABLE]: 1, [M.PARTIALS]: 0.25, [M.INHARM]: 0.02, [M.SPREAD]: 0.1,
      [M.DECAY]: 0.66, [M.DECAY_TILT]: 0.9, [M.MATERIAL]: 4, [M.POSITION]: 0.46, [M.KEYTRACK]: 0.3,
      [X.TYPE]: 2, [X.PRESSURE]: 0.85, [X.GRAIN]: 0.4, [X.TONE]: 0.12, [X.VEL_TILT]: 0.5,
      [V.MIX]: 0.38, [V.SIZE]: 0.8, [V.DECAY]: 0.6, [V.DIFFUSION]: 0.6, [V.SHIMMER]: 0.0,
    },
    macros: { air: 0.6, body: 0.7, shimmer: 0.02, drift: 0.18 },
  },
];

export const velaPreset = (id: string): VelaPreset | undefined =>
  VELA_PRESETS.find((p) => p.id === id);

export const DEFAULT_VELA_PRESET = VELA_PRESETS[0];

// ── Macros ───────────────────────────────────────────────────────────────────

/**
 * Expand the four Play-panel macros into raw parameter values, layered on top of a preset.
 *
 * A macro is not a single parameter with a friendly name — each one moves several at once along
 * a curve chosen so the whole travel of the knob is useful. Air is the clearest example: at the
 * bottom it is a whisper of pressure with a soft tone, at the top it is hard, grainy and bright,
 * and no single engine parameter does that on its own.
 */
export function expandMacros(
  base: Record<number, number>,
  macros: Record<VelaMacro, number>,
): Record<number, number> {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const air = clamp(macros.air);
  const body = clamp(macros.body);
  const shimmer = clamp(macros.shimmer);

  const at = (id: number, fallback: number) => base[id] ?? fallback;
  const out: Record<number, number> = { ...base };

  // Air — exciter pressure, grain and tone together.
  out[X.PRESSURE] = clamp(0.12 + air * 0.85);
  out[X.GRAIN] = clamp(at(X.GRAIN, 0.4) * 0.45 + air * 0.55);
  out[X.TONE] = clamp(at(X.TONE, 0.4) * 0.6 + air * 0.4);

  // Body — inharmonicity and decay. Non-linear on inharmonicity because the musically useful
  // range is compressed into the bottom fifth of the control; a linear macro would spend most
  // of its travel past the point where pitch has already dissolved.
  const inharmBase = at(M.INHARM, 0.05);
  out[M.INHARM] = clamp(inharmBase + body * body * 0.55);
  out[M.DECAY] = clamp(0.15 + body * 0.7);

  // Shimmer — Veil depth. Mix and shimmer move together, since shimmer with no wet signal is
  // an inaudible control and that is a confusing knob to hand someone.
  out[V.SHIMMER] = clamp(shimmer);
  out[V.MIX] = clamp(Math.max(at(V.MIX, 0.4), shimmer * 0.9));

  // Drift is not expanded here: it scales the depth of every Motion route, which lives in the
  // Motion compiler rather than in the parameter block.
  return out;
}

/** Drift maps to a multiplier applied to every compiled Motion route's depth. */
export const driftDepthScale = (drift: number): number =>
  Math.max(0, Math.min(1, drift)) * 1.6;
