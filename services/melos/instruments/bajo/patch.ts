// A BAJO patch.
//
// BAJO shares ONDA's voice, so a patch is mostly a flat `params` map over the shared id space
// plus BAJO's own block. The two exceptions are the wobble rate lane and the gate grid, which
// are arrays — they are kept as arrays here because that is what the UI edits, and flattened
// into param ids on the way to the engine.
//
// Fixed-length arrays, never sparse ones: a cleared lane slot writes a value, never `undefined`.
// (Firestore throws on an undefined field write, and it throws silently enough to cost an
// afternoon — see the Firestore gotchas note.)

import {
  P, O, F, E, osc, flt, env,
  S, T, W, G, SC, SP, RV, MONO_BELOW,
  LANE_LEN, GATE_BANDS, GATE_STEPS, laneParam, gridParam, scorch, SC_STAGES,
} from './params';
import { BAJO_PRESETS, DEFAULT_BAJO_PRESET, expandBajoMacros, type BajoMacro, type BajoPreset } from './presets';

export interface BajoModRoute {
  source: number;
  dest: number;
  depth: number;
}

/** The four controls the Play surface leads with. Everything else is one level down. */
export const BAJO_MACRO_ORDER: BajoMacro[] = ['weight', 'grit', 'wobble', 'space'];

export const BAJO_MACRO_LABELS: Record<BajoMacro, string> = {
  weight: 'Weight',
  grit: 'Grit',
  wobble: 'Wobble',
  space: 'Space',
};

export const BAJO_MACRO_HINTS: Record<BajoMacro, string> = {
  weight: 'How much of the instrument is below 100 Hz. Moves the sub, the mono fold and where sub-safe splits.',
  grit: 'Scorch, in one control. Drive across the stages, and the focus that decides what burns.',
  wobble: 'Depth of the rate lane, and how hard its corners are.',
  space: 'Reverb and delay together — a wet knob that never leaves you with an inaudible one.',
};

export interface BajoPatch {
  id: string;
  name: string;
  presetId?: string;
  description?: string;
  /** Raw param id → value. Anything absent keeps the engine default. */
  params: Record<number, number>;
  /** 16 slots, one per 16th note; each holds a division index into LANE_DIVS. */
  lane: number[];
  /** 4 bands × 16 steps of 0/1, band-major: Sub, Low, Mid, Air. */
  grid: number[][];
  macros: Record<BajoMacro, number>;
  routes: BajoModRoute[];
  version: 1;
}

export const defaultLane = (): number[] => Array.from({ length: LANE_LEN }, () => 6); // 1/8
export const defaultGrid = (): number[][] =>
  Array.from({ length: GATE_BANDS }, () => Array.from({ length: GATE_STEPS }, () => 1));

export function newBajoPatch(preset: BajoPreset = DEFAULT_BAJO_PRESET): BajoPatch {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: preset.name,
    presetId: preset.id,
    description: preset.description,
    params: { ...preset.params },
    lane: preset.lane ? [...preset.lane] : defaultLane(),
    grid: preset.grid ? preset.grid.map((row) => [...row]) : defaultGrid(),
    macros: { ...preset.macros },
    routes: [],
    version: 1,
  };
}

/** Apply a preset to an existing patch, keeping its identity and its Motion routes. */
export function applyBajoPreset(patch: BajoPatch, preset: BajoPreset): BajoPatch {
  return {
    ...patch,
    name: preset.name,
    presetId: preset.id,
    description: preset.description,
    params: { ...preset.params },
    lane: preset.lane ? [...preset.lane] : defaultLane(),
    grid: preset.grid ? preset.grid.map((row) => [...row]) : defaultGrid(),
    macros: { ...preset.macros },
  };
}

/** Param ids stored as strings when serialized, so JSON round-trips without key coercion bugs. */
export function serializeBajoPatch(p: BajoPatch): Record<string, unknown> {
  return {
    ...p,
    params: Object.fromEntries(Object.entries(p.params).map(([k, v]) => [String(k), v])),
    lane: [...p.lane],
    grid: p.grid.map((row) => [...row]),
  };
}

export function deserializeBajoPatch(raw: Record<string, unknown> | undefined): BajoPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<BajoPatch> & { params?: Record<string, number> };
  const params: Record<number, number> = {};
  for (const [k, v] of Object.entries(src.params ?? {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'number') params[id] = v;
  }
  // Rebuild the arrays at their fixed length whatever came back, so a short or missing lane can
  // never leave the engine reading a slot that is not there.
  const lane = defaultLane();
  if (Array.isArray(src.lane)) {
    for (let i = 0; i < LANE_LEN; i++) {
      const v = Number(src.lane[i]);
      if (Number.isFinite(v)) lane[i] = Math.max(0, Math.min(12, Math.round(v)));
    }
  }
  const grid = defaultGrid();
  if (Array.isArray(src.grid)) {
    for (let b = 0; b < GATE_BANDS; b++) {
      const row = src.grid[b];
      if (!Array.isArray(row)) continue;
      for (let st = 0; st < GATE_STEPS; st++) grid[b][st] = row[st] ? 1 : 0;
    }
  }
  return {
    id: String(src.id ?? Math.random().toString(36).slice(2, 10)),
    name: String(src.name ?? 'Bajo'),
    presetId: src.presetId,
    description: src.description,
    params,
    lane,
    grid,
    macros: {
      weight: src.macros?.weight ?? 0.6,
      grit: src.macros?.grit ?? 0.3,
      wobble: src.macros?.wobble ?? 0.0,
      space: src.macros?.space ?? 0.2,
    },
    routes: Array.isArray(src.routes) ? (src.routes as BajoModRoute[]) : [],
    version: 1,
  };
}

/**
 * Everything the engine needs for this patch, as a flat list.
 *
 * The macros are expanded here rather than sent as macro values, for the same reason VELA does
 * it: the engine has no idea what "Grit" means and should not have to. The lane and the grid are
 * flattened into their param ids here too — the engine reads them as plain params, which is why
 * neither needed a bespoke ABI call.
 */
export function bajoEngineParams(patch: BajoPatch): Array<[number, number]> {
  const expanded = expandBajoMacros(patch.params, patch.macros);
  const out: Array<[number, number]> = [];
  for (const [k, v] of Object.entries(expanded)) out.push([Number(k), v]);
  for (let i = 0; i < LANE_LEN; i++) out.push([laneParam(i), patch.lane[i] ?? 6]);
  for (let b = 0; b < GATE_BANDS; b++) {
    for (let st = 0; st < GATE_STEPS; st++) out.push([gridParam(b, st), patch.grid[b]?.[st] ? 1 : 0]);
  }
  return out;
}

/** The ids the editor surfaces, grouped for its section cards. */
export const BAJO_EDITOR_GROUPS: Array<{
  key: 'engine' | 'string' | 'filter' | 'wobble' | 'gate' | 'scorch' | 'space';
  title: string;
  blurb: string;
  color: string;
  ids: number[];
}> = [
  {
    key: 'engine',
    title: 'Engine',
    blurb: 'Two oscillators, sub, noise',
    color: '#FF4B1C',
    ids: [
      osc(0, O.LEVEL), osc(0, O.ANALOG_SHAPE), osc(0, O.COARSE), osc(0, O.FINE),
      osc(1, O.LEVEL), osc(1, O.ANALOG_SHAPE), osc(1, O.COARSE),
      P.UNISON_COUNT, P.UNISON_DETUNE, P.UNISON_WIDTH,
      P.SUB_LEVEL, P.SUB_OCTAVE, P.NOISE_LEVEL, P.GLIDE, P.VOICE_MODE,
    ],
  },
  {
    key: 'string',
    title: 'String',
    blurb: 'Karplus-Strong — no oscillator',
    color: '#E0A85C',
    ids: [S.LEVEL, S.DAMP, S.TONE, S.PICK, S.BOW, S.BODY],
  },
  {
    key: 'filter',
    title: 'Filter + Throat',
    blurb: 'Ladder, and the vowel bank',
    color: '#9A93A6',
    ids: [
      flt(0, F.CUTOFF), flt(0, F.RES), flt(0, F.ENV_AMT), flt(0, F.DRIVE), flt(0, F.KEYTRACK),
      T.AMOUNT, T.VOWEL, T.Q,
    ],
  },
  {
    key: 'wobble',
    title: 'Wobble',
    blurb: 'Per-step rate lane',
    color: '#FF4B1C',
    ids: [W.ENABLE, W.SHAPE, W.SKEW, W.SMOOTH, W.FREE, W.RATE, W.DEST1, W.DEPTH1, W.DEST2, W.DEPTH2],
  },
  {
    key: 'gate',
    title: 'Ghost Gate',
    blurb: 'Four bands, closed steps spill to reverb',
    color: '#FF4B1C',
    ids: [G.ENABLE, G.DEPTH, G.SLEW, G.SPILL, G.SWING, G.RATE, G.SPLIT],
  },
  {
    key: 'scorch',
    title: 'Scorch',
    blurb: 'Three stages, sub-safe',
    color: '#FF4B1C',
    ids: [
      scorch(0, SC.ALG), scorch(0, SC.DRIVE), scorch(0, SC.BIAS), scorch(0, SC.TONE), scorch(0, SC.MIX),
      scorch(1, SC.ALG), scorch(1, SC.DRIVE), scorch(1, SC.BIAS), scorch(1, SC.TONE), scorch(1, SC.MIX),
      scorch(2, SC.ALG), scorch(2, SC.DRIVE), scorch(2, SC.BIAS), scorch(2, SC.TONE), scorch(2, SC.MIX),
      SC.INPUT, SC.FOCUS, SC.SAFE, SC.SUB, SC.OUTPUT,
    ],
  },
  {
    key: 'space',
    title: 'Space',
    blurb: 'Dimension, delay, tape echo, reverb',
    color: '#63C9DE',
    ids: [
      SP.CH_ON, SP.CH_RATE, SP.CH_DEPTH, SP.CH_MIX,
      SP.DL_ON, SP.DL_DIV, SP.DL_FB, SP.DL_TONE, SP.DL_PING, SP.DL_MIX,
      SP.EC_ON, SP.EC_TIME, SP.EC_FB, SP.EC_WOW, SP.EC_DRIVE, SP.EC_DEGRADE, SP.EC_MIX,
      RV.SIZE, RV.DECAY, RV.MIX, MONO_BELOW,
    ],
  },
];

export { BAJO_PRESETS, DEFAULT_BAJO_PRESET };
export type { BajoMacro, BajoPreset };
export { E, env, SC_STAGES };
