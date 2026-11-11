// TONOS patch — a preset plus its physical controls and six front-panel macros. Flattened to plain
// engine param ids, like SOMA and LYRA, so it needs no bespoke ABI call.

import type { Instrument } from '../../beats/engine/InstrumentHost';
import { TONOS_INSTRUMENTS } from './catalog';
import { RV, TN, TONOS_DEFAULTS } from './params';
import { DEFAULT_TONOS_PRESET, TONOS_PRESETS, tonosPresetById, type TonosPreset } from './presets';

export type TonosMacro = 'touch' | 'tension' | 'bridge' | 'body' | 'hand' | 'space';
export const TONOS_MACRO_ORDER: TonosMacro[] = ['touch', 'tension', 'bridge', 'body', 'hand', 'space'];
export const TONOS_MACRO_LABELS: Record<TonosMacro, string> = {
  touch: 'Touch', tension: 'Tension', bridge: 'Bridge', body: 'Body', hand: 'Vibrato', space: 'Room',
};

export interface TonosPatch {
  id: string;
  name: string;
  presetId?: string;
  instrument: number;
  description?: string;
  defaultNote: number;
  params: Record<number, number>;
  macros: Record<TonosMacro, number>;
  version: 1;
}

const neutral = (): Record<TonosMacro, number> => ({ touch: 0.5, tension: 0.5, bridge: 0.5, body: 0.5, hand: 0.5, space: 0.5 });
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const rid = () => Math.random().toString(36).slice(2, 10);
const clampInst = (i: number) => Math.max(0, Math.min(TONOS_INSTRUMENTS.length - 1, Math.round(i)));

export function newTonosPatch(preset: TonosPreset = DEFAULT_TONOS_PRESET): TonosPatch {
  return { id: rid(), name: preset.name, presetId: preset.id, instrument: preset.instrument, description: preset.description, defaultNote: preset.defaultNote, params: { ...preset.params, [TN.ENABLE]: 1 }, macros: neutral(), version: 1 };
}

export function applyTonosPreset(patch: TonosPatch, preset: TonosPreset): TonosPatch {
  return { ...patch, name: preset.name, presetId: preset.id, instrument: preset.instrument, description: preset.description, defaultNote: preset.defaultNote, params: { ...preset.params, [TN.ENABLE]: 1 }, macros: neutral() };
}

export function serializeTonosPatch(p: TonosPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: p.id, name: p.name, instrument: p.instrument,
    defaultNote: Number.isFinite(p.defaultNote) ? p.defaultNote : 60,
    params: Object.fromEntries(Object.entries(p.params).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).map(([k, v]) => [String(k), v])),
    macros: { ...p.macros },
    version: 1,
  };
  if (p.presetId !== undefined) out.presetId = p.presetId;
  if (p.description !== undefined) out.description = p.description;
  return out;
}

export function deserializeTonosPatch(raw: Record<string, unknown> | undefined): TonosPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw as Partial<TonosPatch> & { params?: Record<string, number>; macros?: Record<string, number> };
  const preset = tonosPresetById(src.presetId as string | undefined) ?? DEFAULT_TONOS_PRESET;
  const params: Record<number, number> = { ...TONOS_DEFAULTS };
  for (const [k, v] of Object.entries(src.params ?? {})) {
    const id = Number(k);
    if (Number.isFinite(id) && typeof v === 'number' && Number.isFinite(v)) params[id] = v;
  }
  params[TN.ENABLE] = 1;
  const instrument = clampInst(Number.isFinite(Number(src.instrument)) ? Number(src.instrument) : params[TN.INSTRUMENT] ?? preset.instrument);
  params[TN.INSTRUMENT] = instrument;
  const macros = neutral();
  for (const k of TONOS_MACRO_ORDER) { const v = Number(src.macros?.[k]); if (Number.isFinite(v)) macros[k] = clamp(v); }
  return {
    id: String(src.id ?? rid()), name: String(src.name ?? preset.name), presetId: typeof src.presetId === 'string' ? src.presetId : undefined,
    instrument, description: typeof src.description === 'string' ? src.description : preset.description,
    defaultNote: Number.isFinite(Number(src.defaultNote)) ? Number(src.defaultNote) : preset.defaultNote,
    params, macros, version: 1,
  };
}

/** Macros nudge the physical controls around the preset (0.5 = the preset as voiced). */
export function expandTonosMacros(base: Record<number, number>, m: Record<TonosMacro, number>): Record<number, number> {
  const out = { ...base, [TN.ENABLE]: 1 };
  const nudge = (id: number, d: number, k = 0.8) => { out[id] = clamp((base[id] ?? TONOS_DEFAULTS[id] ?? 0.5) + d * k); };
  const d = (x: number) => x - 0.5;
  nudge(TN.FORCE, d(m.touch)); nudge(TN.HARDNESS, d(m.touch), 0.6);
  nudge(TN.TENSION, d(m.tension), 0.6);
  nudge(TN.JAWARI, d(m.bridge)); nudge(TN.RATTLE, d(m.bridge), 0.6); nudge(TN.SYMP, d(m.bridge), 0.5);
  nudge(TN.BODY, d(m.body)); nudge(TN.BODY_SIZE, -d(m.body), 0.4);
  nudge(TN.VIB_DEPTH, d(m.hand)); nudge(TN.SLIDE, d(m.hand), 0.4);
  nudge(RV.MIX, d(m.space), 0.5);
  return out;
}

export function tonosEngineParams(patch: TonosPatch): Array<[number, number]> {
  return Object.entries(expandTonosMacros(patch.params, patch.macros))
    .map(([k, v]) => [Number(k), v] as [number, number])
    .filter(([k, v]) => Number.isFinite(k) && Number.isFinite(v));
}

export function applyTonosPatch(inst: Instrument, patch: TonosPatch): void {
  inst.setParams(tonosEngineParams(patch));
  for (let i = 0; i < 32; i++) inst.setRoute(i, 0, 0, 0, 0);
}

/** A patch for a preset id. */
export function tonosPatchFor(presetId: string): TonosPatch {
  return newTonosPatch(tonosPresetById(presetId) ?? DEFAULT_TONOS_PRESET);
}

export { TONOS_PRESETS, DEFAULT_TONOS_PRESET };
export type { TonosPreset };
