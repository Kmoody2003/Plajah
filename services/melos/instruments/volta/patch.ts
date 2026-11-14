import { VOLTA, voltaDefaults } from './params';
import {
  DEFAULT_VOLTA_PRESET,
  VOLTA_PRESETS,
  expandVoltaMacros,
  type VoltaMacro,
} from './presets';
import { P as ONDA_P, O, F, E, env, flt, osc, lfo, L } from '../onda/params';
import { A as AURA_A, SP as AURA_SP } from '../aura/params';
import type { AuraPreset } from '../aura/presets';
import type { OndaPatch } from '../onda/patch';
import type { Instrument } from '../../beats/engine/InstrumentHost';

export interface VoltaPatch {
  id: string;
  name: string;
  presetId?: string;
  era?: string;
  circuitNotes?: string;
  importedFrom?: string;
  params: Record<number, number>;
  macros: Record<VoltaMacro, number>;
  version: 1;
}

export function newVoltaPatch(presetOrId: string | { id: string } = DEFAULT_VOLTA_PRESET.id): VoltaPatch {
  const id = typeof presetOrId === 'string' ? presetOrId : presetOrId.id;
  const preset = VOLTA_PRESETS.find((p) => p.id === id) ?? DEFAULT_VOLTA_PRESET;
  return {
    id: `volta-${Date.now().toString(36)}`,
    name: preset.name,
    presetId: preset.id,
    era: preset.era,
    circuitNotes: preset.circuitNotes,
    params: { ...voltaDefaults(), ...preset.params },
    macros: { ...preset.macros },
    version: 1,
  };
}

export function serializeVoltaPatch(patch: VoltaPatch): Record<string, unknown> {
  const paramsObj: Record<string, number> = {};
  for (const [k, v] of Object.entries(patch.params)) {
    if (typeof v === 'number' && Number.isFinite(v)) paramsObj[k] = v;
  }
  const out: Record<string, unknown> = {
    id: patch.id,
    name: patch.name,
    params: paramsObj,
    macros: { ...patch.macros },
    version: 1,
  };
  if (patch.presetId) out.presetId = patch.presetId;
  if (patch.era) out.era = patch.era;
  if (patch.circuitNotes) out.circuitNotes = patch.circuitNotes;
  if (patch.importedFrom) out.importedFrom = patch.importedFrom;
  return out;
}

export function deserializeVoltaPatch(raw: Record<string, unknown> | undefined | null): VoltaPatch {
  const base = newVoltaPatch();
  if (!raw || typeof raw !== 'object') return base;
  const params: Record<number, number> = { ...base.params };
  const rawParams = raw.params;
  if (rawParams && typeof rawParams === 'object') {
    for (const [k, v] of Object.entries(rawParams as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isFinite(id) && typeof v === 'number' && Number.isFinite(v)) {
        params[id] = v;
      }
    }
  }
  params[VOLTA.ENABLE] = 1;
  const rawMacros = (raw.macros && typeof raw.macros === 'object'
    ? (raw.macros as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const m = (k: VoltaMacro, d: number) =>
    typeof rawMacros[k] === 'number' && Number.isFinite(rawMacros[k] as number)
      ? Math.max(0, Math.min(1, rawMacros[k] as number))
      : d;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : base.id,
    name: typeof raw.name === 'string' && raw.name ? raw.name : base.name,
    presetId: typeof raw.presetId === 'string' ? raw.presetId : undefined,
    era: typeof raw.era === 'string' ? raw.era : undefined,
    circuitNotes: typeof raw.circuitNotes === 'string' ? raw.circuitNotes : undefined,
    importedFrom: typeof raw.importedFrom === 'string' ? raw.importedFrom : undefined,
    params,
    macros: {
      morph: m('morph', base.macros.morph),
      cutoff: m('cutoff', base.macros.cutoff),
      resonance: m('resonance', base.macros.resonance),
      fold: m('fold', base.macros.fold),
      sag: m('sag', base.macros.sag),
      ensemble: m('ensemble', base.macros.ensemble),
    },
    version: 1,
  };
}

export function applyVoltaPatch(ins: Instrument, patch: VoltaPatch): void {
  // Disable conflicting specialized instrument engines on this slot, then push all VOLTA params
  const offIds = [1000, 1800, 1900, 2000, 2100, 2200, 2300];
  const offVals = offIds.map(() => 0);
  ins.setParams(offIds, offVals);

  const expanded = expandVoltaMacros(patch.params, patch.macros);
  expanded[VOLTA.ENABLE] = 1;
  const entries = Object.entries(expanded);
  const ids = entries.map(([k]) => Number(k));
  const values = entries.map(([, v]) => v);
  ins.setParams(ids, values);
}

const mapShape = (shapeNorm?: number, morphNorm?: number): number => {
  if (typeof shapeNorm === 'number') {
    const s = Math.round(shapeNorm);
    if (s >= 0 && s <= 3) return s;
  }
  if (typeof morphNorm === 'number') {
    if (morphNorm < 0.2) return 3; // sine
    if (morphNorm < 0.45) return 2; // tri
    if (morphNorm < 0.75) return 0; // saw
    return 1; // pulse
  }
  return 0;
};

/**
 * Translate an AURA vintage preset into a VOLTA discrete-analog-voiced patch
 * so vintage patches gain physical BJT ladder / diode / PSU sag controls & Plajah Builder export.
 */
export function importAuraPresetToVolta(preset: AuraPreset): VoltaPatch {
  const s = preset.params;
  const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const params = voltaDefaults();

  params[VOLTA.TOPOLOGY] = 3; // Pure Vintage '74 Discrete Ladder
  params[VOLTA.VINTAGE_MORPH] = 0.08;
  params[VOLTA.OSC1_WAVE] = mapShape(s[osc(0, O.ANALOG_SHAPE)], s[osc(0, O.MORPH)]);
  params[VOLTA.OSC1_PW] = s[osc(0, O.PULSE_WIDTH)] ?? 0.5;
  params[VOLTA.OSC2_WAVE] = mapShape(s[osc(1, O.ANALOG_SHAPE)], s[osc(1, O.MORPH)]);
  params[VOLTA.OSC2_SEMI] = clamp(s[osc(1, O.COARSE)] ?? 0.5);
  params[VOLTA.OSC2_DETUNE] = clamp(s[osc(1, O.FINE)] ?? 0.56);
  const l1 = s[osc(0, O.LEVEL)] ?? 0.7;
  const l2 = s[osc(1, O.LEVEL)] ?? 0.5;
  params[VOLTA.OSC_MIX] = clamp(l2 / Math.max(0.05, l1 + l2));
  params[VOLTA.SUB_LVL] = clamp(s[ONDA_P.SUB_LEVEL] ?? 0.3);
  params[VOLTA.SUB_OCT] = s[ONDA_P.SUB_OCTAVE] ?? 0;
  params[VOLTA.NOISE_LVL] = clamp(s[ONDA_P.NOISE_LEVEL] ?? 0.04);
  params[VOLTA.FM_TZ] = clamp((s[AURA_A.XMOD_PITCH] ?? 0) * 0.85);
  params[VOLTA.WAVEFOLD] = clamp((s[AURA_A.RING_MOD] ?? 0) * 0.65);

  params[VOLTA.LADDER_CUTOFF] = clamp(s[flt(0, F.CUTOFF)] ?? 0.62);
  params[VOLTA.LADDER_RES] = clamp(s[flt(0, F.RES)] ?? 0.25);
  params[VOLTA.LADDER_DRIVE] = clamp((s[flt(0, F.DRIVE)] ?? 0.2) + (s[AURA_A.WARMTH] ?? 0.2) * 0.35);
  params[VOLTA.DIODE_CLIP] = clamp((s[AURA_A.WARMTH] ?? 0.25) * 0.65 + (s[AURA_A.TAPE_SAT] ?? 0) * 0.25);
  params[VOLTA.OTA_DRIFT] = clamp((s[AURA_A.AURA] ?? preset.macros.aura ?? 0.3) * 0.85);
  params[VOLTA.PSU_SAG] = clamp((s[AURA_A.TAPE_SAT] ?? 0.25) * 0.75);
  params[VOLTA.FILT_ENV_AMT] = clamp(0.5 + ((s[flt(0, F.ENV_AMT)] ?? 0.6) - 0.5));
  params[VOLTA.KEY_TRACK] = clamp(s[flt(0, F.KEYTRACK)] ?? 0.45);

  params[VOLTA.AMP_ATK] = clamp(s[env(0, E.ATTACK)] ?? 0.05);
  params[VOLTA.AMP_DEC] = clamp(s[env(0, E.DECAY)] ?? 0.38);
  params[VOLTA.AMP_SUS] = clamp(s[env(0, E.SUSTAIN)] ?? 0.78);
  params[VOLTA.AMP_REL] = clamp(s[env(0, E.RELEASE)] ?? 0.3);

  params[VOLTA.FLT_ATK] = clamp(s[env(1, E.ATTACK)] ?? params[VOLTA.AMP_ATK]);
  params[VOLTA.FLT_DEC] = clamp(s[env(1, E.DECAY)] ?? 0.42);
  params[VOLTA.FLT_SUS] = clamp(s[env(1, E.SUSTAIN)] ?? 0.3);
  params[VOLTA.FLT_REL] = clamp(s[env(1, E.RELEASE)] ?? 0.34);

  params[VOLTA.LFO_RATE] = clamp(s[lfo(0, L.RATE)] ?? 0.35);
  params[VOLTA.GLIDE] = clamp(s[ONDA_P.GLIDE] ?? 0.06);
  params[VOLTA.VOICE_MODE] = s[ONDA_P.VOICE_MODE] ?? 0;
  params[VOLTA.CHORUS] = clamp(
    (s[AURA_A.ENS_ON] ?? 0) > 0.5 ? (s[AURA_A.ENS_MIX] ?? 0.55) : (s[AURA_SP.CH_MIX] ?? preset.macros.ensemble ?? 0.25),
  );
  params[VOLTA.WIDTH] = clamp(s[ONDA_P.UNISON_WIDTH] ?? 0.65);

  return {
    id: `volta-from-${preset.id}-${Date.now().toString(36)}`,
    name: `${preset.name} [AURA]`,
    era: `Imported ${preset.year} AURA`,
    circuitNotes: `Compatible import from AURA "${preset.name}" (${preset.inspiration}) → Discrete BJT Ladder + Diode circuit.`,
    importedFrom: `aura:${preset.id}`,
    params,
    macros: {
      morph: 0.08,
      cutoff: preset.macros.cutoff ?? 0.5,
      resonance: preset.macros.resonance ?? 0.35,
      fold: clamp(params[VOLTA.WAVEFOLD]),
      sag: clamp(params[VOLTA.DIODE_CLIP]),
      ensemble: clamp(params[VOLTA.CHORUS]),
    },
    version: 1,
  };
}

/**
 * Translate an ONDA modern hybrid patch into a VOLTA Cytomic/Morph patch
 * keeping osc, filter, envelope, unison & glide voicing compatible.
 */
export function importOndaPresetToVolta(src: OndaPatch): VoltaPatch {
  const s = src.params;
  const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const params = voltaDefaults();

  params[VOLTA.TOPOLOGY] = 2; // Dual Morph
  params[VOLTA.VINTAGE_MORPH] = 0.78;
  params[VOLTA.OSC1_WAVE] = (s[ONDA_P.UNISON_COUNT] ?? 0) > 0.2 ? 4 : mapShape(s[osc(0, O.ANALOG_SHAPE)], s[osc(0, O.MORPH)]);
  params[VOLTA.OSC1_PW] = clamp(s[osc(0, O.PULSE_WIDTH)] ?? 0.5);
  params[VOLTA.OSC2_WAVE] = mapShape(s[osc(1, O.ANALOG_SHAPE)], s[osc(1, O.MORPH)]);
  params[VOLTA.OSC2_SEMI] = clamp(s[osc(1, O.COARSE)] ?? 0.5);
  params[VOLTA.OSC2_DETUNE] = clamp(s[osc(1, O.FINE)] ?? 0.54);
  params[VOLTA.SUB_LVL] = clamp(s[ONDA_P.SUB_LEVEL] ?? 0.3);
  params[VOLTA.SUB_OCT] = s[ONDA_P.SUB_OCTAVE] ?? 0;
  params[VOLTA.NOISE_LVL] = clamp(s[ONDA_P.NOISE_LEVEL] ?? 0.02);

  params[VOLTA.LADDER_CUTOFF] = clamp(s[flt(0, F.CUTOFF)] ?? 0.62);
  params[VOLTA.LADDER_RES] = clamp(s[flt(0, F.RES)] ?? 0.22);
  params[VOLTA.LADDER_DRIVE] = clamp(s[flt(0, F.DRIVE)] ?? 0.28);
  params[VOLTA.SVF_CUTOFF] = clamp(s[flt(0, F.CUTOFF)] ?? 0.72);
  params[VOLTA.SVF_RES] = clamp(s[flt(0, F.RES)] ?? 0.2);
  const fMode = Math.round(s[flt(0, F.MODE)] ?? 0);
  params[VOLTA.SVF_MODE] = fMode === 1 ? 0.33 : fMode === 2 ? 0.67 : fMode === 3 ? 1.0 : 0.0;
  params[VOLTA.FILT_ENV_AMT] = clamp(0.5 + ((s[flt(0, F.ENV_AMT)] ?? 0.6) - 0.5));
  params[VOLTA.KEY_TRACK] = clamp(s[flt(0, F.KEYTRACK)] ?? 0.45);

  params[VOLTA.AMP_ATK] = clamp(s[env(0, E.ATTACK)] ?? 0.04);
  params[VOLTA.AMP_DEC] = clamp(s[env(0, E.DECAY)] ?? 0.4);
  params[VOLTA.AMP_SUS] = clamp(s[env(0, E.SUSTAIN)] ?? 0.75);
  params[VOLTA.AMP_REL] = clamp(s[env(0, E.RELEASE)] ?? 0.3);

  params[VOLTA.FLT_ATK] = clamp(s[env(1, E.ATTACK)] ?? params[VOLTA.AMP_ATK]);
  params[VOLTA.FLT_DEC] = clamp(s[env(1, E.DECAY)] ?? 0.35);
  params[VOLTA.FLT_SUS] = clamp(s[env(1, E.SUSTAIN)] ?? 0.25);
  params[VOLTA.FLT_REL] = clamp(s[env(1, E.RELEASE)] ?? 0.28);

  params[VOLTA.GLIDE] = clamp(s[ONDA_P.GLIDE] ?? 0.05);
  params[VOLTA.VOICE_MODE] = s[ONDA_P.VOICE_MODE] ?? 0;
  params[VOLTA.UNISON] = clamp(s[ONDA_P.UNISON_DETUNE] ?? 0.25);
  params[VOLTA.WIDTH] = clamp(s[ONDA_P.UNISON_WIDTH] ?? 0.75);
  params[VOLTA.OTA_DRIFT] = clamp(s[ONDA_P.ANALOG_DRIFT] ?? 0.12);
  params[VOLTA.DIODE_CLIP] = clamp((s[osc(0, O.DRIVE)] ?? 0.15) * 0.75);
  params[VOLTA.CHORUS] = clamp((s[ONDA_P.UNISON_COUNT] ?? 0) * 0.55 + 0.15);

  return {
    id: `volta-from-${src.id}-${Date.now().toString(36)}`,
    name: `${src.name} [ONDA]`,
    era: 'Imported ONDA Hybrid',
    circuitNotes: `Compatible import from ONDA "${src.name}" (${src.category}) → Modern Cytomic SVF + Dual-Era Morph stage.`,
    importedFrom: `onda:${src.id}`,
    params,
    macros: {
      morph: 0.78,
      cutoff: 0.5,
      resonance: 0.35,
      fold: clamp(params[VOLTA.WAVEFOLD]),
      sag: clamp(params[VOLTA.DIODE_CLIP]),
      ensemble: clamp(params[VOLTA.CHORUS]),
    },
    version: 1,
  };
}
