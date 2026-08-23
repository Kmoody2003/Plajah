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
} as const;

/** Exciter — what puts energy into the bank. */
export const X = {
  TYPE: 1100,
  PRESSURE: 1101,
  GRAIN: 1102,
  TONE: 1103,
  VEL_TILT: 1104,
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

  [X.TYPE]: { id: X.TYPE, label: 'Exciter', group: 'breath', format: asIndex(EXCITERS), options: EXCITERS },
  [X.PRESSURE]: { id: X.PRESSURE, label: 'Pressure', group: 'breath', format: pct },
  [X.GRAIN]: { id: X.GRAIN, label: 'Grain', group: 'breath', format: pct },
  [X.TONE]: { id: X.TONE, label: 'Tone', group: 'breath', format: pct },
  [X.VEL_TILT]: { id: X.VEL_TILT, label: 'Vel → tone', group: 'breath', format: pct },

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
