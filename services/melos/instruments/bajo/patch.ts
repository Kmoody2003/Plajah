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
  BAJO_DISCRETE_IDS, bajoDefault,
} from './params';
import { BAJO_PRESETS, DEFAULT_BAJO_PRESET, expandBajoMacros, type BajoMacro, type BajoPreset } from './presets';
import type { Instrument } from '../../beats/engine/InstrumentHost';
import { getBajoWavetable, bajoTableIndex, FRAMES, FRAME_SIZE } from './wavetables';

/**
 * One morph-pad destination. An array of OBJECTS, not of tuples — Firestore stores objects inside
 * arrays quite happily and refuses arrays inside arrays, which is the same wall the gate grid hit.
 */
export interface PadTarget {
  id: number;
  lo: number;
  hi: number;
}

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
  /** Wavetable id per oscillator slot, index 0..1. Empty string = that oscillator is analog. */
  tables: string[];
  /** 16 slots, one per 16th note; each holds a division index into LANE_DIVS. */
  lane: number[];
  /** 4 bands × 16 steps of 0/1, band-major: Sub, Low, Mid, Air. Flat on disk — see serialize. */
  grid: number[][];
  /** What each pad axis is wired to. Per patch, because the useful pair differs per sound. */
  padX: PadTarget[];
  padY: PadTarget[];
  /** Pad position, so a patch reloads where it was left. */
  padPos: [number, number];
  /** A recorded gesture, flat [phase, x, y, ...]. Flat for storage, and for cheap scanning. */
  padPath: number[];
  /** Loop length in bars. */
  padBars: number;
  padLoop: boolean;
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
    tables: preset.tables ? [...preset.tables] : [],
    lane: preset.lane ? [...preset.lane] : defaultLane(),
    grid: preset.grid ? preset.grid.map((row) => [...row]) : defaultGrid(),
    ...defaultPad(preset),
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
    tables: preset.tables ? [...preset.tables] : [],
    lane: preset.lane ? [...preset.lane] : defaultLane(),
    grid: preset.grid ? preset.grid.map((row) => [...row]) : defaultGrid(),
    ...defaultPad(preset),
    macros: { ...preset.macros },
  };
}

/**
 * A preset's pad wiring, or a sensible one derived from the patch.
 *
 * The fallback is cutoff on X and Scorch drive on Y, which is the pair that does something on
 * every bass patch ever made. Presets that have a better answer — the vowel on a talkbox, the
 * pick position on an upright — say so.
 */
function defaultPad(preset: BajoPreset): Pick<BajoPatch, 'padX' | 'padY' | 'padPos' | 'padPath' | 'padBars' | 'padLoop'> {
  const cutoff = preset.params[flt(0, F.CUTOFF)] ?? 0.5;
  return {
    padX: preset.padX ? preset.padX.map((t) => ({ ...t })) : [{ id: flt(0, F.CUTOFF), lo: Math.max(0, cutoff - 0.22), hi: Math.min(1, cutoff + 0.3) }],
    padY: preset.padY ? preset.padY.map((t) => ({ ...t })) : [{ id: scorch(0, SC.DRIVE), lo: 0, hi: 0.8 }],
    padPos: [0.5, 0.5],
    padPath: [],
    padBars: 2,
    padLoop: false,
  };
}

/** The gate grid, flattened band-major for storage. See `serializeBajoPatch`. */
export const flattenGrid = (grid: number[][]): number[] => {
  const out: number[] = [];
  for (let b = 0; b < GATE_BANDS; b++) {
    for (let st = 0; st < GATE_STEPS; st++) out.push(grid[b]?.[st] ? 1 : 0);
  }
  return out;
};

/** Rebuild the 4x16 grid from either the flat form or the legacy nested one. */
export const unflattenGrid = (raw: unknown): number[][] => {
  const grid = defaultGrid();
  if (!Array.isArray(raw)) return grid;
  if (raw.length && Array.isArray(raw[0])) {
    // Nested — anything saved before the grid was flattened, or an in-memory patch.
    for (let b = 0; b < GATE_BANDS; b++) {
      const row = raw[b];
      if (!Array.isArray(row)) continue;
      for (let st = 0; st < GATE_STEPS; st++) grid[b][st] = row[st] ? 1 : 0;
    }
    return grid;
  }
  for (let b = 0; b < GATE_BANDS; b++) {
    for (let st = 0; st < GATE_STEPS; st++) grid[b][st] = raw[b * GATE_STEPS + st] ? 1 : 0;
  }
  return grid;
};

/**
 * Param ids stored as strings when serialized, so JSON round-trips without key coercion bugs.
 *
 * The gate grid flattens to a single 64-entry run, band-major. **Firestore cannot store an array
 * of arrays** — a `number[][]` throws on `setDoc`, and it takes the whole groove document with it,
 * not just this patch. The step sequencer hits the same wall and solves it with a nested map
 * (`steps: Record<number, Record<number, Step>>`); a fixed-length flat run is simpler here because
 * this grid is always exactly 4 x 16.
 */
export function serializeBajoPatch(p: BajoPatch): Record<string, unknown> {
  return {
    ...p,
    params: Object.fromEntries(Object.entries(p.params).map(([k, v]) => [String(k), v])),
    tables: [...p.tables],
    lane: [...p.lane],
    grid: flattenGrid(p.grid),
    padX: p.padX.map((t) => ({ ...t })),
    padY: p.padY.map((t) => ({ ...t })),
    padPos: [p.padPos[0], p.padPos[1]],
    padPath: [...p.padPath],
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
  const grid = unflattenGrid(src.grid);
  return {
    id: String(src.id ?? Math.random().toString(36).slice(2, 10)),
    name: String(src.name ?? 'Bajo'),
    presetId: src.presetId,
    description: src.description,
    params,
    tables: Array.isArray(src.tables) ? src.tables.map((t) => String(t ?? '')) : [],
    lane,
    grid,
    macros: {
      weight: src.macros?.weight ?? 0.6,
      grit: src.macros?.grit ?? 0.3,
      wobble: src.macros?.wobble ?? 0.0,
      space: src.macros?.space ?? 0.2,
    },
    padX: readTargets(src.padX),
    padY: readTargets(src.padY),
    padPos: [
      Number.isFinite(Number(src.padPos?.[0])) ? Number(src.padPos[0]) : 0.5,
      Number.isFinite(Number(src.padPos?.[1])) ? Number(src.padPos[1]) : 0.5,
    ],
    // A path is [phase, x, y] triples; a truncated tail would desync every point after it.
    padPath: Array.isArray(src.padPath)
      ? src.padPath.map(Number).filter((n) => Number.isFinite(n)).slice(0, 3 * Math.floor(src.padPath.length / 3))
      : [],
    padBars: Number.isFinite(Number(src.padBars)) ? Math.max(1, Math.min(8, Number(src.padBars))) : 2,
    padLoop: !!src.padLoop,
    routes: Array.isArray(src.routes) ? (src.routes as BajoModRoute[]) : [],
    version: 1,
  };
}

function readTargets(raw: unknown): PadTarget[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => t as Partial<PadTarget>)
    .filter((t) => t && Number.isFinite(Number(t.id)))
    .map((t) => ({ id: Number(t.id), lo: Number(t.lo) || 0, hi: Number.isFinite(Number(t.hi)) ? Number(t.hi) : 1 }));
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

/** Which wavetables this patch needs, deduped — the caller uploads these once per instrument. */
export function bajoTablesFor(patch: BajoPatch): string[] {
  return Array.from(new Set(patch.tables.filter(Boolean)));
}

/**
 * Push a whole patch into a live instrument: wavetables first (the mip build is the expensive
 * part and must never land in the render path), then every parameter in one bulk message.
 *
 * BAJO owns its engine instance, so its table slots are its own and cannot collide with ONDA's.
 */
export function applyBajoPatch(inst: Instrument, patch: BajoPatch): void {
  for (const id of bajoTablesFor(patch)) {
    const data = getBajoWavetable(id);
    if (data) inst.loadWavetable(bajoTableIndex(id), data, FRAMES, FRAME_SIZE);
  }
  const entries = bajoEngineParams(patch);
  // Point each oscillator at its slot. An oscillator with no table stays in analog mode, which
  // is exact for a sine 808 and cheaper than reading a table to get one.
  patch.tables.forEach((id, i) => {
    if (id) entries.push([osc(i, O.TABLE), bajoTableIndex(id)]);
  });
  inst.setParams(entries);
}

/**
 * Crossform — interpolate the whole instrument between two patches.
 *
 * Every continuous parameter moves; everything the engine reads as an index or a flag snaps at
 * the midpoint, because halfway between Saw and Square is neither and half a toggle is not a
 * state. Wavetables, the rate lane and the gate grid snap too — they are patterns, and a blend
 * of two patterns is a third pattern nobody asked for.
 *
 * It is the fastest way to hear what the instrument spans (drag Upright Jazz toward Riddim Snarl
 * and listen to it stop being wood), and a sound-design tool in its own right — the interesting
 * patch is usually not at either end.
 */
export function crossformPatch(a: BajoPatch, b: BajoPatch, amount: number): BajoPatch {
  const t = Math.max(0, Math.min(1, amount));
  const pick = t < 0.5 ? a : b;
  const params: Record<number, number> = {};
  const ids = new Set<number>([
    ...Object.keys(a.params).map(Number),
    ...Object.keys(b.params).map(Number),
  ]);
  for (const id of ids) {
    // A parameter only one side states is not "both sides agree" — it is that side changing it
    // and the other side leaving it at the engine's default. Reading it as agreement left the
    // string engine at full strength all the way into a riddim patch, and the gate stuck on.
    const av = a.params[id] ?? bajoDefault(id);
    const bv = b.params[id] ?? bajoDefault(id);
    params[id] = BAJO_DISCRETE_IDS.has(id) ? (t < 0.5 ? av : bv) : av + (bv - av) * t;
  }
  const macros = {} as Record<BajoMacro, number>;
  (Object.keys(a.macros) as BajoMacro[]).forEach((k) => {
    macros[k] = a.macros[k] + ((b.macros[k] ?? a.macros[k]) - a.macros[k]) * t;
  });
  return {
    ...pick,
    id: a.id,
    name: t <= 0 ? a.name : t >= 1 ? b.name : `${a.name} → ${b.name}`,
    presetId: t <= 0 ? a.presetId : t >= 1 ? b.presetId : undefined,
    description: pick.description,
    params,
    tables: [...pick.tables],
    lane: [...pick.lane],
    grid: pick.grid.map((row) => [...row]),
    macros,
    routes: pick.routes,
    version: 1,
  };
}

/** The ids the editor surfaces, grouped for its section cards. */
export const BAJO_EDITOR_GROUPS: Array<{
  key: 'engine' | 'string' | 'filter' | 'env' | 'wobble' | 'gate' | 'scorch' | 'space';
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
      osc(1, O.LEVEL), osc(1, O.ANALOG_SHAPE), osc(1, O.COARSE), osc(1, O.FINE),
      P.UNISON_COUNT, P.UNISON_DETUNE, P.UNISON_WIDTH,
      P.SUB_LEVEL, P.SUB_OCTAVE, P.SUB_SHAPE, P.NOISE_LEVEL, P.GLIDE, P.VOICE_MODE,
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
    key: 'env',
    title: 'Envelopes',
    blurb: 'Amp, and the one that opens the filter',
    color: '#9A93A6',
    ids: [
      env(0, E.ATTACK), env(0, E.DECAY), env(0, E.SUSTAIN), env(0, E.RELEASE),
      env(1, E.ATTACK), env(1, E.DECAY), env(1, E.SUSTAIN), env(1, E.RELEASE),
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
