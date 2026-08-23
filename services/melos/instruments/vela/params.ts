// VELA parameter ids — the TypeScript mirror of the block-1000 section of
// rust/plajah-audio/src/params.rs.
//
// Same contract as ONDA's params.ts: an id IS simultaneously a UI knob, a preset field and a
// modulation destination. ONDA owns 0..999; VELA starts at 1000, so neither ever renumbers the
// other and DSP_ABI_VERSION (now 5) fences off a stale .wasm.
//
// One thing worth knowing before touching these: `Params::set` in Rust silently drops any id
// past MAX_PARAM_ID. That constant was 1024 until VELA existed, which meant the whole exciter
// and Veil blocks vanished with no error anywhere. It is 1408 now — if you add a block past
// 1407, raise it in the same commit.

/** Shared with ONDA — id 0 is the instrument's output trim, and VELA presets use it to sit at
 *  a consistent level. Bodies differ enormously in how much energy they hold, so a per-preset
 *  trim is the honest place to balance them rather than squeezing the DSP's normalisation. */
export const MASTER_GAIN = 0;

/** Modal body — the resonator bank. This is the sound; everything else serves it. */
export const M = {
  ENABLE: 1000,
  PARTIALS: 1001,
  INHARM: 1002,
  SPREAD: 1003,
  DECAY: 1004,
  DECAY_TILT: 1005,
  MATERIAL: 1006,
  POSITION: 1007,
  KEYTRACK: 1008,
  /// Independent slow amplitude drift per partial. The difference between a bank and an organ:
  /// a real body's partials swell and fade against one another because the object is never
  /// perfectly still.
  ANIMA: 1009,
  /// Beating depth. Real singing bowls have partials a few Hz apart, and the slow amplitude
  /// "wah" that produces is the most recognisable thing about them.
  BEAT: 1010,
  /// Beat rate at the fundamental. Higher partials beat proportionally faster.
  BEAT_RATE: 1011,
  /// Amplitude attack, 0..12 s. A modal bank can only decay on its own, so without this the
  /// instrument structurally cannot make a pad.
  SWELL: 1012,
  /// Timbral evolution across the note. 0.5 is static; the bank re-derives itself as the note
  /// ages, so a held note is still becoming something else a minute later.
  MORPH: 1013,
  MORPH_TIME: 1014,
  /// 0 Struck, 1 Sustained, 2 Blend. The largest character control in the instrument: whether
  /// the partials are excited resonators that ring out, or driven oscillators that simply
  /// sound. Bells and bowls are the first; strings, choirs and pads are the second.
  MODE: 1015,
  /// Formant depth. Fixed absolute-frequency resonances — a resonance that does NOT track pitch
  /// is what the ear reads as a throat or a cabinet rather than a tuned object.
  FORMANT: 1016,
  FORMANT_SHIFT: 1017,
  /// Sustained mode: how much later the high partials arrive.
  BLOOM: 1018,
  /// Overtone emphasis. Narrow gain on ONE partial, movable across the series — what throat
  /// singing physically is. Emphasising by partial INDEX rather than by frequency is what keeps
  /// the whistle locked to the harmonic series as the pitch moves; a filter cannot do that.
  SPOTLIGHT: 1019,
  SPOTLIGHT_POS: 1020,
  SPOTLIGHT_WIDTH: 1021,
  /// Pitch vibrato. The slow end is a monastic waver rather than a trained wobble.
  VIBRATO: 1022,
  VIBRATO_RATE: 1023,
} as const;

/** Exciter — what puts energy into the bank. */
export const X = {
  TYPE: 1100,
  PRESSURE: 1101,
  GRAIN: 1102,
  TONE: 1103,
  VEL_TILT: 1104,
  /// Slow swell of pressure — the player leaning into a bowl and easing off.
  PULSE: 1105,
  PULSE_RATE: 1106,
} as const;

/** The Veil — one diffusion field after the voice sum, not one per voice. */
export const V = {
  SIZE: 1200,
  DECAY: 1201,
  DIFFUSION: 1202,
  SHIMMER: 1203,
  SHIMMER_IVL: 1204,
  BLUR: 1205,
  FREEZE: 1206,
  MIX: 1207,
} as const;

/** Added to the existing LFO block: remaps rate to 20 s – 5 min cycles. */
export const L_RANGE = 6;
export const lfoRange = (index: number): number => 800 + index * 10 + L_RANGE;

/** New Motion shape index — a seeded random walk that never repeats. */
export const LFO_SHAPE_TIDE = 6;

export const MATERIALS = ['Bronze', 'Glass', 'Iron', 'Wood', 'Skin', 'Air'] as const;
export const EXCITERS = ['Bow', 'Blow', 'Strike', 'Rub'] as const;
export const SHIMMER_INTERVALS = ['+12', '+19', '+24', '−12'] as const;
export const PARTIAL_STEPS = [16, 24, 32, 48, 64] as const;

// ── Display formatting ───────────────────────────────────────────────────────

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Mirrors `modal_decay_s` in params.rs. Keep the two in step or the readout lies. */
export const modalDecaySec = (v: number): number => {
  const n = Math.max(0, Math.min(1, v));
  return 0.2 + 44.8 * n * n * n;
};
const decayFmt = (v: number) => {
  const t = modalDecaySec(v);
  return t >= 10 ? `${t.toFixed(0)} s` : `${t.toFixed(1)} s`;
};

/** Stored 0..1, meaningful as -1..+1 — the centre means "whatever the material does". */
const tiltFmt = (v: number) => {
  const t = v * 2 - 1;
  if (Math.abs(t) < 0.04) return 'material';
  return t < 0 ? `highs ring ${Math.abs(t).toFixed(2)}` : `highs die ${t.toFixed(2)}`;
};

/** The character control, labelled by what the ear actually hears at each range. */
const inharmFmt = (v: number) => {
  const p = `${(v * 100).toFixed(0)}%`;
  if (v < 0.02) return `${p} · harmonic`;
  if (v < 0.09) return `${p} · bowl`;
  if (v < 0.2) return `${p} · glass`;
  if (v < 0.45) return `${p} · gong`;
  if (v < 0.6) return `${p} · iron`;
  return `${p} · no pitch`;
};

/** Direct index rather than normalised — these are set as raw enum values, matching Rust. */
const asIndex = (list: readonly string[]) => (v: number) => list[Math.round(v)] ?? list[0];

export interface VelaParamMeta {
  id: number;
  label: string;
  format?: (v: number) => string;
  /** Stepped controls should not render as continuous knobs. */
  options?: readonly string[];
  /** Grouping for the editor's section cards. */
  group: 'body' | 'breath' | 'veil';
}

export const VELA_PARAM_META: Record<number, VelaParamMeta> = {
  [M.PARTIALS]: {
    id: M.PARTIALS, label: 'Partials', group: 'body',
    format: (v) => `${PARTIAL_STEPS[Math.round(Math.max(0, Math.min(1, v)) * 4)]}`,
    options: PARTIAL_STEPS.map(String),
  },
  [M.INHARM]: { id: M.INHARM, label: 'Inharmonic', group: 'body', format: inharmFmt },
  [M.SPREAD]: { id: M.SPREAD, label: 'Spread', group: 'body', format: pct },
  [M.DECAY]: { id: M.DECAY, label: 'Decay', group: 'body', format: decayFmt },
  [M.DECAY_TILT]: { id: M.DECAY_TILT, label: 'Tilt', group: 'body', format: tiltFmt },
  [M.MATERIAL]: { id: M.MATERIAL, label: 'Material', group: 'body', format: asIndex(MATERIALS), options: MATERIALS },
  [M.POSITION]: { id: M.POSITION, label: 'Position', group: 'body', format: pct },
  [M.KEYTRACK]: { id: M.KEYTRACK, label: 'Key track', group: 'body', format: pct },
  [M.ANIMA]: { id: M.ANIMA, label: 'Anima', group: 'body', format: pct },
  [M.BEAT]: { id: M.BEAT, label: 'Beat', group: 'body', format: pct },
  [M.SWELL]: {
    id: M.SWELL, label: 'Swell', group: 'body',
    format: (v) => { const t = 12 * v * v * v; return t < 0.05 ? 'instant' : `${t.toFixed(1)} s`; },
  },
  [M.MORPH]: {
    id: M.MORPH, label: 'Morph', group: 'body',
    format: (v) => {
      const m = v * 2 - 1;
      if (Math.abs(m) < 0.04) return 'static';
      return m > 0 ? `opens ${m.toFixed(2)}` : `closes ${Math.abs(m).toFixed(2)}`;
    },
  },
  [M.MORPH_TIME]: {
    id: M.MORPH_TIME, label: 'Morph time', group: 'body',
    format: (v) => `${(1 + 89 * v * v).toFixed(0)} s`,
  },
  [M.MODE]: {
    id: M.MODE, label: 'Mode', group: 'body',
    format: (v) => ['Struck', 'Sustained', 'Blend'][Math.round(v)] ?? 'Struck',
    options: ['Struck', 'Sustained', 'Blend'],
  },
  [M.FORMANT]: { id: M.FORMANT, label: 'Formant', group: 'body', format: pct },
  [M.FORMANT_SHIFT]: {
    id: M.FORMANT_SHIFT, label: 'Vowel', group: 'body',
    format: (v) => ['uu', 'oo', 'oh', 'ah', 'eh', 'ee'][Math.round(v * 5)] ?? 'ah',
  },
  [M.BLOOM]: { id: M.BLOOM, label: 'Bloom', group: 'body', format: pct },
  [M.SPOTLIGHT]: { id: M.SPOTLIGHT, label: 'Overtone', group: 'body', format: pct },
  [M.SPOTLIGHT_POS]: {
    id: M.SPOTLIGHT_POS, label: 'Partial', group: 'body',
    // Reported as a harmonic number, because that is what a singer is actually choosing.
    format: (v) => `~${Math.round(3 + v * 42) + 1}`,
  },
  [M.SPOTLIGHT_WIDTH]: {
    id: M.SPOTLIGHT_WIDTH, label: 'Width', group: 'body',
    format: (v) => (v < 0.12 ? 'whistle' : v < 0.4 ? 'narrow' : 'vowel'),
  },
  [M.VIBRATO]: {
    id: M.VIBRATO, label: 'Waver', group: 'body',
    format: (v) => (v < 0.02 ? 'off' : `${(v * 1.2 * 100).toFixed(0)} cents`),
  },
  [M.VIBRATO_RATE]: {
    id: M.VIBRATO_RATE, label: 'Waver rate', group: 'body',
    format: (v) => `${(0.5 * Math.pow(18, v)).toFixed(2)} Hz`,
  },
  [M.BEAT_RATE]: {
    id: M.BEAT_RATE, label: 'Beat rate', group: 'body',
    format: (v) => `${(0.15 * Math.pow(60, Math.max(0, Math.min(1, v)))).toFixed(2)} Hz`,
  },

  [X.TYPE]: { id: X.TYPE, label: 'Exciter', group: 'breath', format: asIndex(EXCITERS), options: EXCITERS },
  [X.PRESSURE]: { id: X.PRESSURE, label: 'Pressure', group: 'breath', format: pct },
  [X.GRAIN]: { id: X.GRAIN, label: 'Grain', group: 'breath', format: pct },
  [X.TONE]: { id: X.TONE, label: 'Tone', group: 'breath', format: pct },
  [X.VEL_TILT]: { id: X.VEL_TILT, label: 'Vel → tone', group: 'breath', format: pct },
  [X.PULSE]: { id: X.PULSE, label: 'Pulse', group: 'breath', format: pct },
  [X.PULSE_RATE]: {
    id: X.PULSE_RATE, label: 'Pulse rate', group: 'breath',
    format: (v) => `${(0.03 * Math.pow(40, Math.max(0, Math.min(1, v)))).toFixed(2)} Hz`,
  },

  [V.SIZE]: { id: V.SIZE, label: 'Size', group: 'veil', format: pct },
  [V.DECAY]: { id: V.DECAY, label: 'Decay', group: 'veil', format: (v) => `${(0.5 + v * v * 59.5).toFixed(1)} s` },
  [V.DIFFUSION]: { id: V.DIFFUSION, label: 'Diffusion', group: 'veil', format: pct },
  [V.SHIMMER]: { id: V.SHIMMER, label: 'Shimmer', group: 'veil', format: pct },
  [V.SHIMMER_IVL]: {
    id: V.SHIMMER_IVL, label: 'Interval', group: 'veil',
    format: asIndex(SHIMMER_INTERVALS), options: SHIMMER_INTERVALS,
  },
  [V.BLUR]: { id: V.BLUR, label: 'Blur', group: 'veil', format: pct },
  [V.FREEZE]: { id: V.FREEZE, label: 'Freeze', group: 'veil', format: (v) => (v > 0.5 ? 'held' : 'off'), options: ['off', 'held'] },
  [V.MIX]: { id: V.MIX, label: 'Mix', group: 'veil', format: pct },
};

export const velaParamLabel = (id: number): string => VELA_PARAM_META[id]?.label ?? `P${id}`;
export const formatVelaParam = (id: number, v: number): string =>
  VELA_PARAM_META[id]?.format?.(v) ?? v.toFixed(2);

/** True for any id that belongs to VELA rather than ONDA. */
export const isVelaParam = (id: number): boolean => id >= 1000 && id <= 1407;
