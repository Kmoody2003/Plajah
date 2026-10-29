// A SOMA patch — Real-Time Multi-Physics Acoustic Percussion & Chamber Simulator.
//
// Strictly adheres to the Melos Firestore serialization rules:
// - Never writes `undefined` values in serialized objects.
// - Never writes nested arrays (`Array<Array<...>>`).

import {
  P,
  SM,
  SP,
  RV,
  veilDecayForHall,
  SOMA_DISCRETE_IDS,
  somaDefault,
} from './params';
import {
  SOMA_PRESETS,
  DEFAULT_SOMA_PRESET,
  expandSomaMacros,
  type SomaMacro,
  type SomaPreset,
} from './presets';
import type { Instrument } from '../../beats/engine/InstrumentHost';
import { defaultHandConfig, somaHandStrike, type SomaHandConfig } from './handMap';
import { liveBus, now as liveNow } from '../../beats/band/live/events';

export type SomaArpMode = 'up' | 'down' | 'upDown' | 'octave' | 'random' | 'seq';
export type SomaArpRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T';

export interface SomaArpConfig {
  enabled: boolean;
  mode: SomaArpMode;
  rate: SomaArpRate;
  gate: number;
  octaves: number;
  /** 8-step rhythmic pitch/articulation offsets. */
  steps: number[];
}

export const SOMA_MACRO_ORDER: SomaMacro[] = [
  'strikePos',
  'hardness',
  'tension',
  'chamber',
  'shellBody',
  'hallSpace',
];

export const SOMA_MACRO_LABELS: Record<SomaMacro, string> = {
  strikePos: 'Strike Spot (r/a)',
  hardness: 'Mallet / Slap',
  tension: 'Pedal / Cords',
  chamber: 'Air Chamber',
  shellBody: 'Wood / Copper',
  hallSpace: 'Hall Ambience',
};

export const SOMA_MACRO_HINTS: Record<SomaMacro, string> = {
  strikePos: 'Radial strike location from dead center (0% — axisymmetric bass thud) to the outer bearing edge (95% — bright multipole slap/rim modes).',
  hardness: 'Hertzian contact stiffness of the felt mallet, hand palm, cupped slap, or wooden stick.',
  tension: 'Live Timpani foot pedal or West African Talking-Drum underarm cord squeeze — bends pitch while the membrane is ringing.',
  chamber: 'Bidirectional acoustic pressure coupling between the internal air volume (Kettle, Goblet Helmholtz neck, Stave Barrel, Hourglass) and the underside of the skin.',
  shellBody: 'Structural wall vibration of the carved hardwood (Lenke/Iroko), hammered copper kettle, oak staves, or fired clay shell.',
  hallSpace: 'Early stage floor reflections and concert hall acoustic reverberation.',
};

export interface SomaPatch {
  id: string;
  name: string;
  presetId?: string;
  origin?: string;
  acoustics?: string;
  description?: string;
  defaultNote: number;
  params: Record<number, number>;
  macros: Record<SomaMacro, number>;
  /** Normalized 2D strike coordinate [x, y] in [-1..1, -1..1] on the circular drumhead. */
  strikePad: [number, number];
  arp: SomaArpConfig;
  /** Pads and keys as hand strokes (handMap.ts). Absent = the drum's default (hand drums on, pitched drums off). */
  hand?: SomaHandConfig;
  version: 1;
}

export function defaultSomaArp(): SomaArpConfig {
  return {
    enabled: false,
    mode: 'seq',
    rate: '1/16',
    gate: 0.55,
    octaves: 1,
    steps: [0, 0, 7, 0, 5, 0, 7, 12],
  };
}

/** Converts polar (r/a in [0, 0.95], azimuth norm in [0, 1]) to Cartesian [-1..1, -1..1] on the drumhead pad. */
export function polarToDrumPad(radiusNorm: number, angleNorm: number): [number, number] {
  const r = Math.max(0, Math.min(0.95, radiusNorm));
  const theta = (angleNorm - 0.5) * Math.PI - Math.PI * 0.5;
  return [
    Number((r * Math.cos(theta)).toFixed(4)),
    Number((r * Math.sin(theta)).toFixed(4)),
  ];
}

/** Converts Cartesian [-1..1, -1..1] drumhead pad coordinate to polar (r/a in [0, 0.95], angleNorm in [0, 1]). */
export function drumPadToPolar(x: number, y: number): { radius: number; angle: number } {
  const radius = Math.min(0.95, Math.hypot(x, y));
  const rawAngle = Math.atan2(y, x) + Math.PI * 0.5;
  const angle = Math.max(0, Math.min(1, rawAngle / Math.PI + 0.5));
  return { radius, angle };
}

export function newSomaPatch(preset: SomaPreset = DEFAULT_SOMA_PRESET): SomaPatch {
  const r = preset.params[SM.STRIKE_POS] ?? 0.62;
  const ang = preset.params[SM.STRIKE_ANGLE] ?? 0.5;
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: preset.name,
    presetId: preset.id,
    origin: preset.origin,
    acoustics: preset.acoustics,
    description: preset.description,
    defaultNote: preset.defaultNote,
    params: { ...preset.params, [SM.ENABLE]: 1 },
    macros: { ...preset.macros },
    strikePad: polarToDrumPad(r, ang),
    arp: defaultSomaArp(),
    version: 1,
  };
}

export function applySomaPreset(patch: SomaPatch, preset: SomaPreset): SomaPatch {
  const r = preset.params[SM.STRIKE_POS] ?? 0.62;
  const ang = preset.params[SM.STRIKE_ANGLE] ?? 0.5;
  return {
    ...patch,
    name: preset.name,
    presetId: preset.id,
    origin: preset.origin,
    acoustics: preset.acoustics,
    description: preset.description,
    defaultNote: preset.defaultNote,
    params: { ...preset.params, [SM.ENABLE]: 1 },
    macros: { ...preset.macros },
    strikePad: polarToDrumPad(r, ang),
  };
}

/**
 * Serialize a SOMA patch for Firestore persistence.
 * Strips all `undefined` properties and stores only flat objects/arrays.
 */
export function serializeSomaPatch(p: SomaPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: p.id,
    name: p.name,
    defaultNote: Number.isFinite(p.defaultNote) ? p.defaultNote : 48,
    params: Object.fromEntries(
      Object.entries(p.params)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        .map(([k, v]) => [String(k), v]),
    ),
    macros: { ...p.macros },
    strikePad: [
      Number.isFinite(p.strikePad[0]) ? p.strikePad[0] : 0,
      Number.isFinite(p.strikePad[1]) ? p.strikePad[1] : -0.62,
    ],
    arp: {
      enabled: !!p.arp.enabled,
      mode: p.arp.mode,
      rate: p.arp.rate,
      gate: p.arp.gate,
      octaves: p.arp.octaves,
      steps: p.arp.steps.map((s) => Number(s) || 0),
    },
    version: 1,
  };
  if (p.presetId !== undefined) out.presetId = p.presetId;
  if (p.origin !== undefined) out.origin = p.origin;
  if (p.acoustics !== undefined) out.acoustics = p.acoustics;
  if (p.description !== undefined) out.description = p.description;
  if (p.hand) out.hand = { enabled: !!p.hand.enabled, layout: p.hand.layout === 'pads' ? 'pads' : 'keys' };
  return out;
}

export function deserializeSomaPatch(raw: Record<string, unknown> | undefined): SomaPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<SomaPatch> & { params?: Record<string, number> };
  const params: Record<number, number> = { [SM.ENABLE]: 1 };
  for (const [k, v] of Object.entries(src.params ?? {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'number' && Number.isFinite(v)) {
      params[id] = v;
    }
  }
  const preset = SOMA_PRESETS.find((p) => p.id === src.presetId) ?? DEFAULT_SOMA_PRESET;
  const rawArp = src.arp as Partial<SomaArpConfig> | undefined;
  const arp: SomaArpConfig = {
    enabled: typeof rawArp?.enabled === 'boolean' ? rawArp.enabled : false,
    mode: (rawArp?.mode as SomaArpMode) ?? 'seq',
    rate: (rawArp?.rate as SomaArpRate) ?? '1/16',
    gate: Number.isFinite(Number(rawArp?.gate)) ? Math.max(0.1, Math.min(0.95, Number(rawArp?.gate))) : 0.55,
    octaves: Number.isFinite(Number(rawArp?.octaves)) ? Math.max(1, Math.min(3, Math.round(Number(rawArp?.octaves)))) : 1,
    steps: Array.isArray(rawArp?.steps) && rawArp.steps.length === 8
      ? rawArp.steps.map((s) => Math.max(-24, Math.min(24, Math.round(Number(s) || 0))))
      : [0, 0, 7, 0, 5, 0, 7, 12],
  };

  const defaultPad = polarToDrumPad(
    params[SM.STRIKE_POS] ?? preset.params[SM.STRIKE_POS] ?? 0.62,
    params[SM.STRIKE_ANGLE] ?? preset.params[SM.STRIKE_ANGLE] ?? 0.5,
  );

  return {
    id: String(src.id ?? Math.random().toString(36).slice(2, 10)),
    name: String(src.name ?? preset.name),
    presetId: typeof src.presetId === 'string' ? src.presetId : undefined,
    origin: typeof src.origin === 'string' ? src.origin : preset.origin,
    acoustics: typeof src.acoustics === 'string' ? src.acoustics : preset.acoustics,
    description: typeof src.description === 'string' ? src.description : preset.description,
    defaultNote: Number.isFinite(Number(src.defaultNote)) ? Number(src.defaultNote) : preset.defaultNote,
    params,
    macros: {
      strikePos: Number.isFinite(Number(src.macros?.strikePos)) ? Number(src.macros?.strikePos) : preset.macros.strikePos,
      hardness: Number.isFinite(Number(src.macros?.hardness)) ? Number(src.macros?.hardness) : preset.macros.hardness,
      tension: Number.isFinite(Number(src.macros?.tension)) ? Number(src.macros?.tension) : preset.macros.tension,
      chamber: Number.isFinite(Number(src.macros?.chamber)) ? Number(src.macros?.chamber) : preset.macros.chamber,
      shellBody: Number.isFinite(Number(src.macros?.shellBody)) ? Number(src.macros?.shellBody) : preset.macros.shellBody,
      hallSpace: Number.isFinite(Number(src.macros?.hallSpace)) ? Number(src.macros?.hallSpace) : preset.macros.hallSpace,
    },
    strikePad: [
      Number.isFinite(Number(src.strikePad?.[0])) ? Number(src.strikePad?.[0]) : defaultPad[0],
      Number.isFinite(Number(src.strikePad?.[1])) ? Number(src.strikePad?.[1]) : defaultPad[1],
    ],
    arp,
    ...(src.hand && typeof src.hand === 'object'
      ? { hand: { enabled: !!(src.hand as SomaHandConfig).enabled, layout: (src.hand as SomaHandConfig).layout === 'pads' ? 'pads' as const : 'keys' as const } }
      : {}),
    version: 1,
  };
}

/** A SOMA value as the engine wants it. Only the hall decay differs: see `veilDecayForHall`. */
export function somaEngineValue(id: number, v: number): number {
  return id === RV.DECAY ? veilDecayForHall(v) : v;
}

export function somaEngineParams(patch: SomaPatch): Array<[number, number]> {
  const expanded = expandSomaMacros(patch.params, patch.macros);
  const out: Array<[number, number]> = [];
  for (const [k, v] of Object.entries(expanded)) {
    const id = Number(k);
    if (Number.isFinite(id) && Number.isFinite(v)) {
      out.push([id, somaEngineValue(id, v)]);
    }
  }
  return out;
}

/** The hand map in effect for a patch: its own setting, else its drum's default. */
export function somaHandConfig(patch: SomaPatch): SomaHandConfig {
  return patch.hand ?? defaultHandConfig(SOMA_PRESETS.find((p) => p.id === patch.presetId)?.category);
}

export function applySomaPatch(inst: Instrument, patch: SomaPatch): void {
  const entries = somaEngineParams(patch);
  inst.setParams(entries);
  for (let i = 0; i < 32; i++) inst.setRoute(i, 0, 0, 0, 0);
  const hand = somaHandConfig(patch);
  const base = Object.fromEntries(entries) as Record<number, number>;
  const home = patch.defaultNote || 48;
  // Live playing from keys, pads or a controller is what the band's percussionist listens to.
  const heard = (note: number, velocity: number, pos?: number, striker?: number) =>
    liveBus.emit({ kind: 'strike', instrument: 'soma', trackId: '', at: liveNow(), note, velocity, pos, striker });
  inst.setNoteMapper((key, velocity, mod, live) => {
    if (!hand.enabled) {
      if (live) heard(key, velocity, base[SM.STRIKE_POS], base[SM.STRIKER_TYPE]);
      return null;
    }
    const s = somaHandStrike(key, velocity, mod, hand, home, base);
    if (live) heard(s.note, s.velocity, s.params.find(([id]) => id === SM.STRIKE_POS)?.[1], s.params.find(([id]) => id === SM.STRIKER_TYPE)?.[1]);
    return { note: s.note, velocity: s.velocity, params: s.params };
  });
}

/**
 * Physical Acoustic Morph — smoothly morph between any two SOMA percussion bodies.
 */
export function crossformSomaPatch(a: SomaPatch, b: SomaPatch, amount: number): SomaPatch {
  const t = Math.max(0, Math.min(1, amount));
  const pick = t < 0.5 ? a : b;
  const params: Record<number, number> = { [SM.ENABLE]: 1 };
  const ids = new Set<number>([
    ...Object.keys(a.params).map(Number),
    ...Object.keys(b.params).map(Number),
  ]);
  for (const id of ids) {
    const av = a.params[id] ?? somaDefault(id);
    const bv = b.params[id] ?? somaDefault(id);
    params[id] = SOMA_DISCRETE_IDS.has(id) ? (t < 0.5 ? av : bv) : av + (bv - av) * t;
  }
  const macros = {} as Record<SomaMacro, number>;
  SOMA_MACRO_ORDER.forEach((k) => {
    macros[k] = a.macros[k] + ((b.macros[k] ?? a.macros[k]) - a.macros[k]) * t;
  });
  return {
    ...pick,
    id: a.id,
    name: t <= 0 ? a.name : t >= 1 ? b.name : `${a.name} × ${b.name}`,
    presetId: t <= 0 ? a.presetId : t >= 1 ? b.presetId : undefined,
    params,
    macros,
    strikePad: [
      a.strikePad[0] + (b.strikePad[0] - a.strikePad[0]) * t,
      a.strikePad[1] + (b.strikePad[1] - a.strikePad[1]) * t,
    ],
    arp: { ...pick.arp, steps: [...pick.arp.steps] },
    version: 1,
  };
}

export const SOMA_EDITOR_GROUPS: Array<{
  key: 'striker' | 'membrane' | 'chamber' | 'radiation';
  title: string;
  blurb: string;
  color: string;
  ids: number[];
}> = [
  {
    key: 'striker',
    title: 'I · Striker & Hand Contact Mechanics',
    blurb: 'Bidirectional Hunt-Crossley collision: mallet felt, open hand, slap air-pocket pop, muted palm & radial strike location',
    color: '#E86A33',
    ids: [
      SM.STRIKER_TYPE,
      SM.STRIKER_HARDNESS,
      SM.STRIKER_MASS,
      SM.STRIKE_POS,
      SM.STRIKE_ANGLE,
      SM.VEL_HARDNESS,
      SM.HAND_BRUSH,
    ],
  },
  {
    key: 'membrane',
    title: 'II · 2D Circular Membrane & Bessel Modes',
    blurb: '16 Bessel eigenmodes J_m(j_{mn} r/a), skin material, air-mass loading, nonlinear deflection bloom & live tension pedal',
    color: '#F59E0B',
    ids: [
      SM.HEAD_DIAMETER,
      SM.SKIN_MATERIAL,
      SM.MEMBRANE_DECAY,
      SM.MEMBRANE_DAMP_HF,
      SM.AIR_LOAD,
      SM.TENSION_NONLIN,
      SM.TENSION_PEDAL,
      SM.BUZZ_AMOUNT,
      SM.KEYTRACK,
      P.BEND_RANGE,
    ],
  },
  {
    key: 'chamber',
    title: 'III · Coupled Air Cavity & Wood/Metal Shell',
    blurb: 'Kettle bowl, Djembe goblet Helmholtz neck, Conga stave barrel, Talking-Drum hourglass & structural shell wall modes',
    color: '#10B981',
    ids: [
      SM.CAVITY_TYPE,
      SM.CAVITY_VOLUME,
      SM.CAVITY_COUPLING,
      SM.PORT_TUNING,
      SM.SHELL_MATERIAL,
      SM.SHELL_RESONANCE,
      SM.SHELL_WARMTH,
    ],
  },
  {
    key: 'radiation',
    title: 'IV · Acoustic Radiation & Concert Hall',
    blurb: 'Batter skin vs. bottom air port radiation perspective, early floor reflections, stereo echo & concert hall space',
    color: '#38BDF8',
    ids: [
      SM.MIC_PERSPECTIVE,
      SM.ROOM_EARLY,
      RV.SIZE,
      RV.DECAY,
      RV.DIFFUSION,
      RV.MIX,
      SP.DL_ON,
      SP.DL_DIV,
      SP.DL_FB,
      SP.DL_TONE,
      SP.DL_PING,
      SP.DL_MIX,
      P.MASTER_GAIN,
    ],
  },
];

export { SOMA_PRESETS, DEFAULT_SOMA_PRESET };
export type { SomaMacro, SomaPreset };
