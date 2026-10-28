// LYRA patch — a preset plus its physical controls and six front-panel macros. Flattened to plain
// engine param ids, like SOMA, so it needs no bespoke ABI call.

import type { Instrument } from '../../beats/engine/InstrumentHost';
import { LY, LYRA_DEFAULTS, LYRA_MODELS, RV, type LyraModel } from './params';
import { DEFAULT_LYRA_PRESET, LYRA_PRESETS, lyraPresetById, type LyraPreset } from './presets';

export type LyraMacro = 'tone' | 'touch' | 'ring' | 'body' | 'expression' | 'space';
export const LYRA_MACRO_ORDER: LyraMacro[] = ['tone', 'touch', 'ring', 'body', 'expression', 'space'];
export const LYRA_MACRO_LABELS: Record<LyraMacro, string> = {
  tone: 'Tone', touch: 'Touch', ring: 'Ring', body: 'Body', expression: 'Vibrato', space: 'Room',
};

export interface LyraPatch {
  id: string;
  name: string;
  presetId?: string;
  model: LyraModel;
  description?: string;
  defaultNote: number;
  params: Record<number, number>;
  macros: Record<LyraMacro, number>;
  version: 1;
}

const neutral = (): Record<LyraMacro, number> => ({ tone: 0.5, touch: 0.5, ring: 0.5, body: 0.5, expression: 0.5, space: 0.5 });
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const rid = () => Math.random().toString(36).slice(2, 10);

export function newLyraPatch(preset: LyraPreset = DEFAULT_LYRA_PRESET): LyraPatch {
  return { id: rid(), name: preset.name, presetId: preset.id, model: preset.model, description: preset.description, defaultNote: preset.defaultNote, params: { ...preset.params, [LY.ENABLE]: 1 }, macros: neutral(), version: 1 };
}

export function applyLyraPreset(patch: LyraPatch, preset: LyraPreset): LyraPatch {
  return { ...patch, name: preset.name, presetId: preset.id, model: preset.model, description: preset.description, defaultNote: preset.defaultNote, params: { ...preset.params, [LY.ENABLE]: 1 }, macros: neutral() };
}

export function serializeLyraPatch(p: LyraPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: p.id, name: p.name, model: p.model,
    defaultNote: Number.isFinite(p.defaultNote) ? p.defaultNote : 60,
    params: Object.fromEntries(Object.entries(p.params).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [String(k), v])),
    macros: { ...p.macros },
    version: 1,
  };
  if (p.presetId !== undefined) out.presetId = p.presetId;
  if (p.description !== undefined) out.description = p.description;
  return out;
}

export function deserializeLyraPatch(raw: Record<string, unknown> | undefined): LyraPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<LyraPatch> & { params?: Record<string, number>; macros?: Record<string, number> };
  const preset = lyraPresetById(src.presetId as string | undefined) ?? DEFAULT_LYRA_PRESET;
  const params: Record<number, number> = { ...LYRA_DEFAULTS };
  for (const [k, v] of Object.entries(src.params ?? {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'number' && Number.isFinite(v)) params[id] = v;
  }
  params[LY.ENABLE] = 1;
  const model = LYRA_MODELS.includes(src.model as LyraModel) ? (src.model as LyraModel) : LYRA_MODELS[Math.round(params[LY.MODEL] ?? 0)] ?? preset.model;
  params[LY.MODEL] = LYRA_MODELS.indexOf(model);
  const macros = neutral();
  for (const k of LYRA_MACRO_ORDER) { const v = Number(src.macros?.[k]); if (Number.isFinite(v)) macros[k] = clamp(v); }
  return {
    id: String(src.id ?? rid()), name: String(src.name ?? preset.name), presetId: typeof src.presetId === 'string' ? src.presetId : undefined,
    model, description: typeof src.description === 'string' ? src.description : preset.description,
    defaultNote: Number.isFinite(Number(src.defaultNote)) ? Number(src.defaultNote) : preset.defaultNote,
    params, macros, version: 1,
  };
}

/** Macros nudge the physical controls around the preset (0.5 = the preset as voiced). */
export function expandLyraMacros(base: Record<number, number>, m: Record<LyraMacro, number>): Record<number, number> {
  const out = { ...base, [LY.ENABLE]: 1 };
  const nudge = (id: number, d: number, k = 0.8) => { out[id] = clamp((base[id] ?? LYRA_DEFAULTS[id] ?? 0.5) + d * k); };
  const d = (x: number) => x - 0.5;
  nudge(LY.BRIGHTNESS, d(m.tone)); nudge(LY.TONE, d(m.tone), 0.6);
  nudge(LY.EXCITE_HARD, d(m.touch)); nudge(LY.NOISE, d(m.touch), 0.4);
  nudge(LY.DECAY, d(m.ring));
  nudge(LY.BODY, d(m.body)); nudge(LY.BODY_SIZE, -d(m.body), 0.4);
  nudge(LY.VIB_DEPTH, d(m.expression)); nudge(LY.TREM_DEPTH, d(m.expression), 0.6);
  nudge(RV.MIX, d(m.space), 0.5);
  return out;
}

export function lyraEngineParams(patch: LyraPatch): Array<[number, number]> {
  return Object.entries(expandLyraMacros(patch.params, patch.macros))
    .map(([k, v]) => [Number(k), v] as [number, number])
    .filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v));
}

export function applyLyraPatch(inst: Instrument, patch: LyraPatch): void {
  inst.setParams(lyraEngineParams(patch));
  for (let i = 0; i < 32; i++) inst.setRoute(i, 0, 0, 0, 0);
}

/** A patch for a preset id (the Session Band seats players with these). */
export function lyraPatchFor(presetId: string): LyraPatch {
  return newLyraPatch(lyraPresetById(presetId) ?? DEFAULT_LYRA_PRESET);
}

export { LYRA_PRESETS, DEFAULT_LYRA_PRESET };
export type { LyraPreset };
