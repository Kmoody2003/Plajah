// An AURA patch — 1960s & 1970s Voltage-Controlled Analogue Synthesizer.
//
// Strictly adheres to the Melos Firestore serialization rules:
// - Never writes `undefined` values in serialized objects.
// - Never writes nested arrays (`Array<Array<...>>`).

import {
  P, O, F, E, L, osc, flt, env, lfo,
  A, SP, RV,
  AURA_DISCRETE_IDS, auraDefault,
} from './params';
import {
  AURA_PRESETS,
  DEFAULT_AURA_PRESET,
  expandAuraMacros,
  type AuraMacro,
  type AuraPreset,
} from './presets';
import type { Instrument } from '../../beats/engine/InstrumentHost';
import { getAuraWavetable, auraTableIndex, FRAMES, FRAME_SIZE } from './wavetables';

export interface PadTarget {
  id: number;
  lo: number;
  hi: number;
}

export interface AuraModRoute {
  source: number;
  dest: number;
  depth: number;
}

export type AuraArpMode = 'up' | 'down' | 'upDown' | 'octave' | 'random' | 'seq';
export type AuraArpRate = '1/4' | '1/8' | '1/8T' | '1/16' | '1/16T';

export interface AuraArpConfig {
  enabled: boolean;
  mode: AuraArpMode;
  rate: AuraArpRate;
  gate: number;
  octaves: number;
  /** 8-step semitone offsets (Moog 960 / EMS Synthi AKS style step sequencer). */
  steps: number[];
}

export const AURA_MACRO_ORDER: AuraMacro[] = [
  'warmth',
  'cutoff',
  'resonance',
  'aura',
  'ensemble',
  'space',
];

export const AURA_MACRO_LABELS: Record<AuraMacro, string> = {
  warmth: 'Warmth',
  cutoff: 'Cutoff',
  resonance: 'Resonance',
  aura: 'Vintage Aura',
  ensemble: 'Ensemble',
  space: 'Tape Space',
};

export const AURA_MACRO_HINTS: Record<AuraMacro, string> = {
  warmth: 'Preamp discrete transistor drive, ladder saturation, and 15 IPS magnetic tape compression.',
  cutoff: 'Primary 24dB Ladder and secondary 12dB SEM filter cutoff frequencies.',
  resonance: 'Filter feedback emphasis — self-oscillates at the top of the dial.',
  aura: '1960s/70s circuit age: per-voice card trimpot tolerance, thermal wander, capstan wow, and 60Hz studio floor.',
  ensemble: 'ARP Solina 3-phase BBD String Ensemble and 6-stage Small Stone Krautrock Phaser.',
  space: 'Free-running magnetic Tape Echo (RE-201 style) and vintage chamber/spring reverb.',
};

export interface AuraPatch {
  id: string;
  name: string;
  presetId?: string;
  year?: string;
  inspiration?: string;
  description?: string;
  params: Record<number, number>;
  /** Wavetable id per oscillator slot (0..2). Empty string = pure analog VCO. */
  tables: string[];
  padX: PadTarget[];
  padY: PadTarget[];
  padPos: [number, number];
  macros: Record<AuraMacro, number>;
  routes: AuraModRoute[];
  arp: AuraArpConfig;
  version: 1;
}

export function defaultArp(preset?: AuraPreset): AuraArpConfig {
  const src = preset?.arp;
  const steps = Array.isArray(src?.steps) && src.steps.length === 8
    ? src.steps.map((s) => Math.max(-24, Math.min(24, Math.round(Number(s) || 0))))
    : [0, 7, 12, 7, 0, 10, 7, 12];
  return {
    enabled: !!src?.enabled,
    mode: src?.mode ?? 'up',
    rate: src?.rate ?? '1/16',
    gate: typeof src?.gate === 'number' ? Math.max(0.1, Math.min(0.95, src.gate)) : 0.58,
    octaves: typeof src?.octaves === 'number' ? Math.max(1, Math.min(3, Math.round(src.octaves))) : 2,
    steps,
  };
}

function defaultPad(preset: AuraPreset): Pick<AuraPatch, 'padX' | 'padY' | 'padPos'> {
  const baseX: PadTarget[] = preset.padX
    ? preset.padX.map((t) => ({
        id: t.id,
        lo: t.id === flt(0, F.CUTOFF) ? Math.min(t.lo, 0.10) : t.lo,
        hi: t.id === flt(0, F.CUTOFF) ? Math.max(t.hi, 0.95) : t.hi,
      }))
    : [
        { id: flt(0, F.CUTOFF), lo: 0.08, hi: 0.96 },
      ];
  // Guarantee multi-dimensional harmonic & filter morph on X
  const xIds = new Set(baseX.map((t) => t.id));
  if (!xIds.has(flt(0, F.CUTOFF))) baseX.unshift({ id: flt(0, F.CUTOFF), lo: 0.10, hi: 0.95 });
  if (!xIds.has(flt(0, F.DRIVE))) baseX.push({ id: flt(0, F.DRIVE), lo: 0.08, hi: 0.82 });
  if (!xIds.has(osc(0, O.MORPH))) baseX.push({ id: osc(0, O.MORPH), lo: 0.0, hi: 0.88 });
  if (!xIds.has(A.WARMTH)) baseX.push({ id: A.WARMTH, lo: 0.18, hi: 0.85 });

  const baseY: PadTarget[] = preset.padY
    ? preset.padY.map((t) => ({
        id: t.id,
        lo: t.id === flt(0, F.RES) ? Math.min(t.lo, 0.08) : t.lo,
        hi: t.id === flt(0, F.RES) ? Math.max(t.hi, 0.85) : t.hi,
      }))
    : [
        { id: flt(0, F.RES), lo: 0.08, hi: 0.86 },
      ];
  // Guarantee dramatic resonance + vintage movement on Y
  const yIds = new Set(baseY.map((t) => t.id));
  if (!yIds.has(flt(0, F.RES))) baseY.unshift({ id: flt(0, F.RES), lo: 0.08, hi: 0.85 });
  if (!yIds.has(A.AURA)) baseY.push({ id: A.AURA, lo: 0.14, hi: 0.88 });
  if (!yIds.has(A.XMOD_FILTER) && (preset.params[osc(1, O.ENABLE)] ?? 0) > 0.5) {
    baseY.push({ id: A.XMOD_FILTER, lo: 0.0, hi: 0.48 });
  }

  return {
    padX: baseX,
    padY: baseY,
    padPos: [0.5, 0.5],
  };
}

export function newAuraPatch(preset: AuraPreset = DEFAULT_AURA_PRESET): AuraPatch {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name: preset.name,
    presetId: preset.id,
    year: preset.year,
    inspiration: preset.inspiration,
    description: preset.description,
    params: { ...preset.params },
    tables: preset.tables ? [...preset.tables] : [],
    ...defaultPad(preset),
    macros: { ...preset.macros },
    routes: preset.routes ? preset.routes.map((r) => ({ ...r })) : [],
    arp: defaultArp(preset),
    version: 1,
  };
}

export function applyAuraPreset(patch: AuraPatch, preset: AuraPreset): AuraPatch {
  return {
    ...patch,
    name: preset.name,
    presetId: preset.id,
    year: preset.year,
    inspiration: preset.inspiration,
    description: preset.description,
    params: { ...preset.params },
    tables: preset.tables ? [...preset.tables] : [],
    ...defaultPad(preset),
    macros: { ...preset.macros },
    routes: preset.routes ? preset.routes.map((r) => ({ ...r })) : [],
    arp: defaultArp(preset),
  };
}

/**
 * Serialize an AURA patch for Firestore persistence.
 * Strips all `undefined` properties and stores only flat arrays/objects.
 */
export function serializeAuraPatch(p: AuraPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: p.id,
    name: p.name,
    params: Object.fromEntries(
      Object.entries(p.params)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        .map(([k, v]) => [String(k), v]),
    ),
    tables: p.tables.map((t) => String(t ?? '')),
    padX: p.padX.map((t) => ({ id: t.id, lo: t.lo, hi: t.hi })),
    padY: p.padY.map((t) => ({ id: t.id, lo: t.lo, hi: t.hi })),
    padPos: [p.padPos[0], p.padPos[1]],
    macros: { ...p.macros },
    routes: p.routes.map((r) => ({ source: r.source, dest: r.dest, depth: r.depth })),
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
  if (p.year !== undefined) out.year = p.year;
  if (p.inspiration !== undefined) out.inspiration = p.inspiration;
  if (p.description !== undefined) out.description = p.description;
  return out;
}

export function deserializeAuraPatch(raw: Record<string, unknown> | undefined): AuraPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<AuraPatch> & { params?: Record<string, number> };
  const params: Record<number, number> = {};
  for (const [k, v] of Object.entries(src.params ?? {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'number' && Number.isFinite(v)) {
      params[id] = v;
    }
  }
  const preset = AURA_PRESETS.find((p) => p.id === src.presetId) ?? DEFAULT_AURA_PRESET;
  const rawArp = src.arp as Partial<AuraArpConfig> | undefined;
  const arp: AuraArpConfig = {
    enabled: typeof rawArp?.enabled === 'boolean' ? rawArp.enabled : false,
    mode: (rawArp?.mode as AuraArpMode) ?? 'up',
    rate: (rawArp?.rate as AuraArpRate) ?? '1/16',
    gate: Number.isFinite(Number(rawArp?.gate)) ? Math.max(0.1, Math.min(0.95, Number(rawArp?.gate))) : 0.58,
    octaves: Number.isFinite(Number(rawArp?.octaves)) ? Math.max(1, Math.min(3, Math.round(Number(rawArp?.octaves)))) : 2,
    steps: Array.isArray(rawArp?.steps) && rawArp.steps.length === 8
      ? rawArp.steps.map((s) => Math.max(-24, Math.min(24, Math.round(Number(s) || 0))))
      : [0, 7, 12, 7, 0, 10, 7, 12],
  };

  return {
    id: String(src.id ?? Math.random().toString(36).slice(2, 10)),
    name: String(src.name ?? preset.name),
    presetId: typeof src.presetId === 'string' ? src.presetId : undefined,
    year: typeof src.year === 'string' ? src.year : preset.year,
    inspiration: typeof src.inspiration === 'string' ? src.inspiration : preset.inspiration,
    description: typeof src.description === 'string' ? src.description : preset.description,
    params,
    tables: Array.isArray(src.tables) ? src.tables.map((t) => String(t ?? '')) : [],
    macros: {
      warmth: Number.isFinite(Number(src.macros?.warmth)) ? Number(src.macros?.warmth) : preset.macros.warmth,
      cutoff: Number.isFinite(Number(src.macros?.cutoff)) ? Number(src.macros?.cutoff) : preset.macros.cutoff,
      resonance: Number.isFinite(Number(src.macros?.resonance)) ? Number(src.macros?.resonance) : preset.macros.resonance,
      aura: Number.isFinite(Number(src.macros?.aura)) ? Number(src.macros?.aura) : preset.macros.aura,
      ensemble: Number.isFinite(Number(src.macros?.ensemble)) ? Number(src.macros?.ensemble) : preset.macros.ensemble,
      space: Number.isFinite(Number(src.macros?.space)) ? Number(src.macros?.space) : preset.macros.space,
    },
    padX: readTargets(src.padX, defaultPad(preset).padX),
    padY: readTargets(src.padY, defaultPad(preset).padY),
    padPos: [
      Number.isFinite(Number(src.padPos?.[0])) ? Number(src.padPos?.[0]) : 0.5,
      Number.isFinite(Number(src.padPos?.[1])) ? Number(src.padPos?.[1]) : 0.5,
    ],
    routes: Array.isArray(src.routes)
      ? (src.routes as AuraModRoute[])
          .filter((r) => r && Number.isFinite(Number(r.source)) && Number.isFinite(Number(r.dest)))
          .map((r) => ({ source: Number(r.source), dest: Number(r.dest), depth: Number(r.depth) || 0 }))
      : [],
    arp,
    version: 1,
  };
}

function readTargets(raw: unknown, fallback: PadTarget[]): PadTarget[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const parsed = raw
    .map((t) => t as Partial<PadTarget>)
    .filter((t) => t && Number.isFinite(Number(t.id)))
    .map((t) => ({
      id: Number(t.id),
      lo: Number.isFinite(Number(t.lo)) ? Number(t.lo) : 0,
      hi: Number.isFinite(Number(t.hi)) ? Number(t.hi) : 1,
    }));
  if (parsed.length === 0) return fallback;
  // Ensure existing patches with 1 target get the full multi-dimensional vector targets
  const seen = new Set(parsed.map((t) => t.id));
  for (const fb of fallback) {
    if (!seen.has(fb.id)) {
      parsed.push({ ...fb });
      seen.add(fb.id);
    }
  }
  return parsed;
}

export function auraEngineParams(patch: AuraPatch): Array<[number, number]> {
  const expanded = expandAuraMacros(patch.params, patch.macros);
  const out: Array<[number, number]> = [];
  for (const [k, v] of Object.entries(expanded)) {
    const id = Number(k);
    if (Number.isFinite(id) && Number.isFinite(v)) {
      out.push([id, v]);
    }
  }
  return out;
}

export function auraTablesFor(patch: AuraPatch): string[] {
  return Array.from(new Set(patch.tables.filter(Boolean)));
}

export function applyAuraPatch(inst: Instrument, patch: AuraPatch): void {
  for (const id of auraTablesFor(patch)) {
    const data = getAuraWavetable(id);
    if (data) inst.loadWavetable(auraTableIndex(id), data, FRAMES, FRAME_SIZE);
  }
  const entries = auraEngineParams(patch);
  patch.tables.forEach((id, i) => {
    if (id) entries.push([osc(i, O.TABLE), auraTableIndex(id)]);
  });
  inst.setParams(entries);
  for (let i = 0; i < 32; i++) inst.setRoute(i, 0, 0, 0, 0);
  patch.routes.slice(0, 32).forEach((r, idx) => {
    inst.setRoute(idx, r.source, r.dest, r.depth, 0);
  });
}

/**
 * Crossform — smoothly morph between any two 1960s/1970s AURA patches.
 */
export function crossformAuraPatch(a: AuraPatch, b: AuraPatch, amount: number): AuraPatch {
  const t = Math.max(0, Math.min(1, amount));
  const pick = t < 0.5 ? a : b;
  const params: Record<number, number> = {};
  const ids = new Set<number>([
    ...Object.keys(a.params).map(Number),
    ...Object.keys(b.params).map(Number),
  ]);
  for (const id of ids) {
    const av = a.params[id] ?? auraDefault(id);
    const bv = b.params[id] ?? auraDefault(id);
    params[id] = AURA_DISCRETE_IDS.has(id) ? (t < 0.5 ? av : bv) : av + (bv - av) * t;
  }
  const macros = {} as Record<AuraMacro, number>;
  AURA_MACRO_ORDER.forEach((k) => {
    macros[k] = a.macros[k] + ((b.macros[k] ?? a.macros[k]) - a.macros[k]) * t;
  });
  return {
    ...pick,
    id: a.id,
    name: t <= 0 ? a.name : t >= 1 ? b.name : `${a.name} × ${b.name}`,
    presetId: t <= 0 ? a.presetId : t >= 1 ? b.presetId : undefined,
    params,
    tables: [...pick.tables],
    macros,
    routes: pick.routes.map((r) => ({ ...r })),
    arp: { ...pick.arp, steps: [...pick.arp.steps] },
    version: 1,
  };
}

export const AURA_EDITOR_GROUPS: Array<{
  key: 'vco' | 'xmod' | 'vcf' | 'env' | 'ensemble' | 'tape';
  title: string;
  blurb: string;
  color: string;
  ids: number[];
}> = [
  {
    key: 'vco',
    title: 'VCO Bank I · II · III',
    blurb: 'Three voltage-controlled oscillators, divide-down sub & noise generator',
    color: '#E59A38',
    ids: [
      osc(0, O.ENABLE), osc(0, O.LEVEL), osc(0, O.MODE), osc(0, O.ANALOG_SHAPE), osc(0, O.MORPH), osc(0, O.PULSE_WIDTH), osc(0, O.COARSE), osc(0, O.FINE),
      osc(1, O.ENABLE), osc(1, O.LEVEL), osc(1, O.MODE), osc(1, O.ANALOG_SHAPE), osc(1, O.MORPH), osc(1, O.PULSE_WIDTH), osc(1, O.COARSE), osc(1, O.FINE),
      osc(2, O.ENABLE), osc(2, O.LEVEL), osc(2, O.ANALOG_SHAPE), osc(2, O.COARSE), osc(2, O.FINE),
      P.SUB_LEVEL, P.SUB_OCTAVE, P.SUB_SHAPE, P.NOISE_LEVEL, P.NOISE_COLOR,
      P.VOICE_MODE, P.GLIDE, P.BEND_RANGE, P.UNISON_COUNT, P.UNISON_DETUNE, P.UNISON_WIDTH,
    ],
  },
  {
    key: 'xmod',
    title: 'Cross-Mod, Analog Flux & Vintage Aura',
    blurb: 'Hard Sync, Poly-Mod FM, Ring Mod, Buchla 266 Source of Uncertainty & discrete preamp warmth',
    color: '#D97724',
    ids: [
      A.OSC_SYNC, A.XMOD_PITCH, A.XMOD_FILTER, A.RING_MOD,
      A.FLUX_ON, A.FLUX_MODE, A.FLUX_AMT, A.FLUX_RATE,
      A.AURA, P.ANALOG_DRIFT, A.WARMTH,
      A.TAPE_SAT, A.HUM, A.CRACKLE,
    ],
  },
  {
    key: 'vcf',
    title: 'Dual Vintage Filters',
    blurb: '24dB Moog Transistor Ladder + 12dB Oberheim SEM State-Variable',
    color: '#D4A359',
    ids: [
      P.FILTER_ROUTING,
      flt(0, F.ENABLE), flt(0, F.TYPE), flt(0, F.MODE), flt(0, F.CUTOFF), flt(0, F.RES), flt(0, F.ENV_AMT), flt(0, F.DRIVE), flt(0, F.KEYTRACK),
      flt(1, F.ENABLE), flt(1, F.TYPE), flt(1, F.MODE), flt(1, F.CUTOFF), flt(1, F.RES), flt(1, F.ENV_AMT),
    ],
  },
  {
    key: 'env',
    title: 'Contour Generators, LFOs & Pulse Gate',
    blurb: 'VCA & VCF ADSR contours, dual LFOs & tempo-synced VCA/Lowpass Gate chopper',
    color: '#9A93A6',
    ids: [
      env(0, E.ATTACK), env(0, E.DECAY), env(0, E.SUSTAIN), env(0, E.RELEASE),
      env(1, E.ATTACK), env(1, E.DECAY), env(1, E.SUSTAIN), env(1, E.RELEASE),
      lfo(0, L.SHAPE), lfo(0, L.RATE), lfo(1, L.SHAPE), lfo(1, L.RATE),
      A.GATE_ON, A.GATE_SHAPE, A.GATE_RATE, A.GATE_DEPTH,
    ],
  },
  {
    key: 'ensemble',
    title: 'BBD Ensemble & 6-Stage Phaser',
    blurb: '1974 ARP Solina 3-phase BBD string chorus & Small Stone Krautrock phaser',
    color: '#63C9DE',
    ids: [
      A.ENS_ON, A.ENS_MODE, A.ENS_DEPTH, A.ENS_MIX,
      A.PH_ON, A.PH_RATE, A.PH_DEPTH, A.PH_FEEDBACK, A.PH_MIX,
    ],
  },
  {
    key: 'tape',
    title: 'Tape Echo, Stereo Delay & Chamber Space',
    blurb: 'Free-running magnetic tape echo, tempo ping-pong delay & vintage reverb chamber',
    color: '#8EA885',
    ids: [
      SP.EC_ON, SP.EC_TIME, SP.EC_FB, SP.EC_WOW, SP.EC_DRIVE, SP.EC_DEGRADE, SP.EC_MIX,
      SP.DL_ON, SP.DL_DIV, SP.DL_FB, SP.DL_TONE, SP.DL_PING, SP.DL_MIX,
      RV.SIZE, RV.DECAY, RV.SHIMMER, RV.MIX, P.MASTER_GAIN,
    ],
  },
];

export { AURA_PRESETS, DEFAULT_AURA_PRESET };
export type { AuraMacro, AuraPreset };
