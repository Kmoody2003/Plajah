// Orchestra patch — shared serializer, macro expander, and engine applier for ARCO, CORNU, and AULOS.

import type { Instrument } from '../../beats/engine/InstrumentHost';
import {
  AR,
  ARCO_ARTICULATIONS,
  ARCO_ENSEMBLES,
  ARCO_INSTRUMENTS,
  ARCO_SECTIONS,
  AU,
  AULOS_ARTICULATIONS,
  AULOS_ENSEMBLES,
  AULOS_INSTRUMENTS,
  AULOS_SECTIONS,
  CN,
  CORNU_ARTICULATIONS,
  CORNU_ENSEMBLES,
  CORNU_INSTRUMENTS,
  CORNU_SECTIONS,
  RV,
  orchestraDefaults,
  type OrchestraFamily,
} from './params';
import {
  defaultOrchestraPreset,
  orchestraPresetById,
  type OrchestraPreset,
} from './presets';

export type OrchestraMacro = 'dynamics' | 'vibrato' | 'tightness' | 'space';

export const ORCHESTRA_MACRO_ORDER: OrchestraMacro[] = ['dynamics', 'vibrato', 'tightness', 'space'];

export const ORCHESTRA_MACRO_LABELS: Record<OrchestraMacro, string> = {
  dynamics: 'Dynamics',
  vibrato: 'Vibrato',
  tightness: 'Tightness',
  space: 'Room',
};

export const ORCHESTRA_MACRO_HINTS: Record<OrchestraMacro, string> = {
  dynamics: 'Scales bow force/speed, lip pressure, or reed/jet breath intensity.',
  vibrato: 'Adjusts player vibrato depth around the preset.',
  tightness: 'Controls ensemble timing and intonation cohesion (higher = tighter unison).',
  space: 'Concert hall room mix.',
};

export interface OrchestraPatch {
  id: string;
  family: OrchestraFamily;
  name: string;
  presetId?: string;
  description?: string;
  instrument: number;
  ensemble: number;
  section: number;
  artic: number;
  defaultNote: number;
  params: Record<number, number>;
  macros: Record<OrchestraMacro, number>;
  version: 1;
}

const neutralMacros = (): Record<OrchestraMacro, number> => ({
  dynamics: 0.5,
  vibrato: 0.5,
  tightness: 0.5,
  space: 0.5,
});

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const rid = () => Math.random().toString(36).slice(2, 10);

function familyBounds(family: OrchestraFamily) {
  if (family === 'arco') {
    return {
      enableId: AR.ENABLE,
      instId: AR.INSTRUMENT,
      ensId: AR.ENSEMBLE,
      secId: AR.SECTION,
      artId: AR.ARTIC,
      maxInst: ARCO_INSTRUMENTS.length - 1,
      maxEns: ARCO_ENSEMBLES.length - 1,
      maxSec: ARCO_SECTIONS.length - 1,
      maxArt: ARCO_ARTICULATIONS.length - 1,
    };
  }
  if (family === 'cornu') {
    return {
      enableId: CN.ENABLE,
      instId: CN.INSTRUMENT,
      ensId: CN.ENSEMBLE,
      secId: CN.SECTION,
      artId: CN.ARTIC,
      maxInst: CORNU_INSTRUMENTS.length - 1,
      maxEns: CORNU_ENSEMBLES.length - 1,
      maxSec: CORNU_SECTIONS.length - 1,
      maxArt: CORNU_ARTICULATIONS.length - 1,
    };
  }
  return {
    enableId: AU.ENABLE,
    instId: AU.INSTRUMENT,
    ensId: AU.ENSEMBLE,
    secId: AU.SECTION,
    artId: AU.ARTIC,
    maxInst: AULOS_INSTRUMENTS.length - 1,
    maxEns: AULOS_ENSEMBLES.length - 1,
    maxSec: AULOS_SECTIONS.length - 1,
    maxArt: AULOS_ARTICULATIONS.length - 1,
  };
}

const clampIdx = (v: number, max: number) => Math.max(0, Math.min(max, Math.round(v)));

export function newOrchestraPatch(
  family: OrchestraFamily,
  preset: OrchestraPreset = defaultOrchestraPreset(family),
): OrchestraPatch {
  const b = familyBounds(family);
  const defaults = orchestraDefaults(family);
  const params: Record<number, number> = {
    ...defaults,
    ...preset.params,
    [b.enableId]: 1,
    [b.instId]: clampIdx(preset.instrument, b.maxInst),
    [b.ensId]: clampIdx(preset.ensemble, b.maxEns),
    [b.secId]: clampIdx(preset.section, b.maxSec),
    [b.artId]: clampIdx(preset.artic, b.maxArt),
  };
  return {
    id: rid(),
    family,
    name: preset.name,
    presetId: preset.id,
    description: preset.description,
    instrument: params[b.instId],
    ensemble: params[b.ensId],
    section: params[b.secId],
    artic: params[b.artId],
    defaultNote: preset.defaultNote,
    params,
    macros: neutralMacros(),
    version: 1,
  };
}

export function applyOrchestraPreset(patch: OrchestraPatch, preset: OrchestraPreset): OrchestraPatch {
  const b = familyBounds(patch.family);
  const defaults = orchestraDefaults(patch.family);
  const params: Record<number, number> = {
    ...defaults,
    ...preset.params,
    [b.enableId]: 1,
    [b.instId]: clampIdx(preset.instrument, b.maxInst),
    [b.ensId]: clampIdx(preset.ensemble, b.maxEns),
    [b.secId]: clampIdx(preset.section, b.maxSec),
    [b.artId]: clampIdx(preset.artic, b.maxArt),
  };
  return {
    ...patch,
    name: preset.name,
    presetId: preset.id,
    description: preset.description,
    instrument: params[b.instId],
    ensemble: params[b.ensId],
    section: params[b.secId],
    artic: params[b.artId],
    defaultNote: preset.defaultNote,
    params,
    macros: neutralMacros(),
  };
}

export function serializeOrchestraPatch(patch: OrchestraPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: patch.id,
    family: patch.family,
    name: patch.name,
    instrument: patch.instrument,
    ensemble: patch.ensemble,
    section: patch.section,
    artic: patch.artic,
    defaultNote: Number.isFinite(patch.defaultNote) ? patch.defaultNote : 60,
    params: Object.fromEntries(
      Object.entries(patch.params)
        .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
        .map(([k, v]) => [String(k), v]),
    ),
    macros: { ...patch.macros },
    version: 1,
  };
  if (patch.presetId !== undefined) out.presetId = patch.presetId;
  if (patch.description !== undefined) out.description = patch.description;
  return out;
}

export function deserializeOrchestraPatch(
  family: OrchestraFamily,
  raw: Record<string, unknown> | undefined,
): OrchestraPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<OrchestraPatch> & {
    params?: Record<string, number>;
    macros?: Record<string, number>;
  };
  const resolvedPreset = orchestraPresetById(src.presetId);
  const preset =
    resolvedPreset && resolvedPreset.family === family
      ? resolvedPreset
      : defaultOrchestraPreset(family);

  const b = familyBounds(family);
  const params: Record<number, number> = { ...orchestraDefaults(family) };
  for (const [k, v] of Object.entries(src.params ?? {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'number' && Number.isFinite(v)) {
      params[id] = v;
    }
  }
  params[b.enableId] = 1;

  const instrument = clampIdx(
    Number.isFinite(Number(src.instrument)) ? Number(src.instrument) : params[b.instId] ?? preset.instrument,
    b.maxInst,
  );
  const ensemble = clampIdx(
    Number.isFinite(Number(src.ensemble)) ? Number(src.ensemble) : params[b.ensId] ?? preset.ensemble,
    b.maxEns,
  );
  const section = clampIdx(
    Number.isFinite(Number(src.section)) ? Number(src.section) : params[b.secId] ?? preset.section,
    b.maxSec,
  );
  const artic = clampIdx(
    Number.isFinite(Number(src.artic)) ? Number(src.artic) : params[b.artId] ?? preset.artic,
    b.maxArt,
  );

  params[b.instId] = instrument;
  params[b.ensId] = ensemble;
  params[b.secId] = section;
  params[b.artId] = artic;

  const macros = neutralMacros();
  for (const k of ORCHESTRA_MACRO_ORDER) {
    const v = Number(src.macros?.[k]);
    if (Number.isFinite(v)) macros[k] = clamp(v);
  }

  return {
    id: String(src.id ?? rid()),
    family,
    name: String(src.name ?? preset.name),
    presetId: typeof src.presetId === 'string' ? src.presetId : undefined,
    description: typeof src.description === 'string' ? src.description : preset.description,
    instrument,
    ensemble,
    section,
    artic,
    defaultNote: Number.isFinite(Number(src.defaultNote)) ? Number(src.defaultNote) : preset.defaultNote,
    params,
    macros,
    version: 1,
  };
}

/** Macros nudge the physical controls around the preset (0.5 = as voiced). */
export function expandOrchestraMacros(
  family: OrchestraFamily,
  base: Record<number, number>,
  m: Record<OrchestraMacro, number>,
): Record<number, number> {
  const defaults = orchestraDefaults(family);
  const out: Record<number, number> = { ...base };
  const nudge = (id: number, d: number, k = 0.7) => {
    out[id] = clamp((base[id] ?? defaults[id] ?? 0.5) + d * k);
  };
  const d = (x: number) => x - 0.5;

  if (family === 'arco') {
    nudge(AR.DYNAMICS, d(m.dynamics));
    nudge(AR.BOW_FORCE, d(m.dynamics), 0.45);
    nudge(AR.BOW_SPEED, d(m.dynamics), 0.35);
    nudge(AR.VIB_DEPTH, d(m.vibrato));
    // Higher tightness -> lower timing/intonation spread
    nudge(AR.TIGHTNESS, -d(m.tightness));
    nudge(AR.INTONATION, -d(m.tightness), 0.5);
  } else if (family === 'cornu') {
    nudge(CN.DYNAMICS, d(m.dynamics));
    nudge(CN.BRASSINESS, d(m.dynamics), 0.4);
    nudge(CN.VIB_DEPTH, d(m.vibrato));
    nudge(CN.TIGHTNESS, -d(m.tightness));
    nudge(CN.INTONATION, -d(m.tightness), 0.5);
  } else {
    nudge(AU.DYNAMICS, d(m.dynamics));
    nudge(AU.VIB_DEPTH, d(m.vibrato));
    nudge(AU.TIGHTNESS, -d(m.tightness));
    nudge(AU.INTONATION, -d(m.tightness), 0.5);
  }

  nudge(RV.MIX, d(m.space), 0.5);
  return out;
}

/**
 * Produces the flat `[paramId, value]` list for the Rust DSP engine.
 * Disables the other two orchestra blocks (`*_ENABLE = 0`) and enables the active block (`*_ENABLE = 1`).
 */
export function orchestraEngineParams(patch: OrchestraPatch): Array<[number, number]> {
  const b = familyBounds(patch.family);
  const expanded = expandOrchestraMacros(patch.family, patch.params, patch.macros);

  expanded[AR.ENABLE] = patch.family === 'arco' ? 1 : 0;
  expanded[CN.ENABLE] = patch.family === 'cornu' ? 1 : 0;
  expanded[AU.ENABLE] = patch.family === 'aulos' ? 1 : 0;

  expanded[b.instId] = patch.instrument;
  expanded[b.ensId] = patch.ensemble;
  expanded[b.secId] = patch.section;
  expanded[b.artId] = patch.artic;

  return Object.entries(expanded)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v));
}

export function applyOrchestraPatch(inst: Instrument, patch: OrchestraPatch): void {
  inst.setParams(orchestraEngineParams(patch));
}
