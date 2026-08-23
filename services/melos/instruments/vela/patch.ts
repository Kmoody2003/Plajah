// The VELA patch — a serializable body.
//
// Same shape and same contract as OndaPatch: raw param ids to values, Motion routes, macros,
// spatial position, stored inside the groove document so a project carries its instruments with
// it. Deliberately a separate module rather than a variant of OndaPatch — the two instruments
// share an engine and a parameter space but not a single field of their patch beyond the
// envelope, and merging them would mean every ONDA preset grows dead VELA keys.

import { SpatialLayout, IamfRole } from '../../beats/engine/InstrumentHost';
import { M, V, X, lfoRange, LFO_SHAPE_TIDE } from './params';
import { DEFAULT_VELA_PRESET, expandMacros, type VelaMacro, type VelaPreset } from './presets';

export interface VelaModRoute {
  source: number;
  dest: number;
  depth: number;
  via?: number;
}

/** The four Play-panel macros, in display order. */
export const VELA_MACRO_ORDER: VelaMacro[] = ['air', 'body', 'shimmer', 'drift'];

export const VELA_MACRO_LABELS: Record<VelaMacro, string> = {
  air: 'Air',
  body: 'Body',
  shimmer: 'Shimmer',
  drift: 'Drift',
};

/** What each macro actually moves — shown on hover, because a macro that hides its meaning is
 *  just an unlabelled knob. */
export const VELA_MACRO_HINTS: Record<VelaMacro, string> = {
  air: 'Exciter pressure, grain and tone together',
  body: 'Inharmonicity and decay — string through bowl to gong',
  shimmer: 'Veil depth and pitch-shifted feedback',
  drift: 'Depth of every Motion route at once',
};

export interface VelaPatch {
  id: string;
  name: string;
  presetId?: string;
  description?: string;
  /** Raw param id → value. Anything absent keeps the engine default. */
  params: Record<number, number>;
  routes: VelaModRoute[];
  macros: Record<VelaMacro, number>;
  spatial?: {
    position: [number, number, number];
    layout?: SpatialLayout;
    role?: IamfRole;
  };
  version: 1;
}

export function newVelaPatch(preset: VelaPreset = DEFAULT_VELA_PRESET): VelaPatch {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: preset.name,
    presetId: preset.id,
    description: preset.description,
    params: { ...preset.params },
    routes: [],
    macros: { ...preset.macros },
    version: 1,
  };
}

/** Apply a preset to an existing patch, keeping its identity and its Motion routes. */
export function applyVelaPreset(patch: VelaPatch, preset: VelaPreset): VelaPatch {
  return {
    ...patch,
    name: preset.name,
    presetId: preset.id,
    description: preset.description,
    params: { ...preset.params },
    macros: { ...preset.macros },
  };
}

/** Param ids stored as strings when serialized, so JSON round-trips without key coercion bugs. */
export function serializeVelaPatch(p: VelaPatch): Record<string, unknown> {
  return {
    ...p,
    params: Object.fromEntries(Object.entries(p.params).map(([k, v]) => [String(k), v])),
  };
}

export function deserializeVelaPatch(raw: Record<string, unknown> | undefined): VelaPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<VelaPatch> & { params?: Record<string, number> };
  const params: Record<number, number> = {};
  for (const [k, v] of Object.entries(src.params ?? {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'number') params[id] = v;
  }
  return {
    id: String(src.id ?? Math.random().toString(36).slice(2, 10)),
    name: String(src.name ?? 'Vela'),
    presetId: src.presetId,
    description: src.description,
    params,
    routes: Array.isArray(src.routes) ? (src.routes as VelaModRoute[]) : [],
    macros: {
      air: src.macros?.air ?? 0.55,
      body: src.macros?.body ?? 0.35,
      shimmer: src.macros?.shimmer ?? 0.2,
      drift: src.macros?.drift ?? 0.22,
    },
    spatial: src.spatial,
    version: 1,
  };
}

/**
 * Everything the engine needs for this patch, as a flat list.
 *
 * Macros are expanded here rather than being sent as macro values, because VELA's macros move
 * several engine parameters along shaped curves — the engine has no idea what "Air" means and
 * should not have to.
 */
export function velaEngineParams(patch: VelaPatch): Array<[number, number]> {
  const expanded = expandMacros(patch.params, patch.macros);
  const out: Array<[number, number]> = [[M.ENABLE, 1]];
  for (const [k, v] of Object.entries(expanded)) out.push([Number(k), v]);
  return out;
}

/**
 * Drift's Motion slots. Three Tide modulators on the slow range.
 *
 * Set up once when a VELA track is created. Tide is the only aperiodic shape and the slow range
 * puts a cycle at 20 s to 5 minutes — together that is what stops a twenty-minute pad from
 * audibly repeating, which is the difference between an instrument and a loop.
 */
export function velaDriftSetup(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const rates = [0.18, 0.31, 0.47]; // mutually non-commensurate: no common period either
  for (let i = 0; i < 3; i++) {
    out.push([800 + i * 10 + 0, LFO_SHAPE_TIDE]);
    out.push([800 + i * 10 + 1, rates[i]]);
    out.push([lfoRange(i), 1]);
    out.push([800 + i * 10 + 3, 1]); // bipolar
    out.push([800 + i * 10 + 4, 0]); // retrigger off — a retriggered walk is a cycle
  }
  return out;
}

/** The ids the editor surfaces, grouped for its section cards. */
export const VELA_EDITOR_GROUPS: Array<{ key: 'body' | 'breath' | 'veil'; title: string; color: string; ids: number[] }> = [
  {
    key: 'body', title: 'Body', color: '#D0BCFF',
    ids: [
      M.PARTIALS, M.INHARM, M.DECAY, M.DECAY_TILT, M.SPREAD, M.POSITION, M.MATERIAL, M.KEYTRACK,
      // The life controls. Anima and Beat are what stop a bank sounding like an organ, so they
      // sit with the body rather than in a separate "modulation" section — they are not
      // modulation of the sound, they are part of what the sound is.
      M.MODE, M.FORMANT, M.FORMANT_SHIFT, M.BLOOM,
      M.ANIMA, M.BEAT, M.BEAT_RATE, M.SWELL, M.MORPH, M.MORPH_TIME,
    ],
  },
  {
    key: 'breath', title: 'Breath', color: '#FF8C00',
    ids: [X.TYPE, X.PRESSURE, X.GRAIN, X.TONE, X.VEL_TILT, X.PULSE, X.PULSE_RATE],
  },
  {
    key: 'veil', title: 'Veil', color: '#00DAF3',
    ids: [V.SIZE, V.DECAY, V.DIFFUSION, V.SHIMMER, V.SHIMMER_IVL, V.BLUR, V.FREEZE, V.MIX],
  },
];
