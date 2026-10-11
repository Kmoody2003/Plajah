// visualizerParams — the adjustable parameters of each visualizer, and the
// operator's settings for them.
//
// The schema is light (no three.js / GL imports) so the library's parameter
// panel, the slide inspector and the output windows' GeneratorSource all read
// the same definitions. Settings are remembered per visualizer mode, so a
// visualizer comes back the way the operator left it.

import type { TypoTextSource } from './typoText';

// Same values as MILKDROP_PREFIX / TYPO_PREFIX in layerSources (not imported: that module is heavy).
const MILKDROP_PREFIX = 'MILKDROP:';
const TYPO_PREFIX_KEY = 'TYPO:';

export type VizFamily = 'typo' | 'gen' | 'studio' | 'flux' | 'milkdrop' | 'shader';
export type VizParams = Record<string, number | string>;

export interface VizParamDef {
  key: string;
  label: string;
  kind: 'range' | 'color' | 'select' | 'text' | 'textarea' | 'toggle';
  min?: number; max?: number; step?: number;
  default: number | string;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  /** Only shown when another param has one of these values. */
  showIf?: { key: string; in: Array<string | number> };
  group?: string;
}

export function vizFamily(mode: string | undefined | null, kind?: string): VizFamily {
  const m = mode || '';
  if (kind === 'SHADER') return 'shader';
  if (m.startsWith(TYPO_PREFIX_KEY)) return 'typo';
  if (m.startsWith(MILKDROP_PREFIX) || m.startsWith('BUTTERCHURN') || m === 'MILKDROP') return 'milkdrop';
  if (m.startsWith('FLUX')) return 'flux';
  if (m === 'STUDIO_PLASMA' || m === 'STUDIO_RAYMARCH') return 'studio';
  return 'gen';
}

const AUDIO: VizParamDef = {
  key: 'audioSource', label: 'Reacts to', kind: 'select', default: 'ambo-playback', group: 'Audio',
  options: [
    { value: 'ambo-playback', label: 'Ambo mix (what is playing)' },
    { value: 'live-input', label: 'Live input (microphone)' },
    { value: 'none', label: 'Nothing — gentle idle motion' },
  ],
};
const SPEED: VizParamDef = { key: 'speed', label: 'Speed', kind: 'range', min: 0, max: 3, step: 0.05, default: 1, group: 'Motion' };

const TEXT_SOURCE_OPTIONS: Array<{ value: TypoTextSource; label: string }> = [
  { value: 'auto', label: 'Auto (song → scripture → room → text)' },
  { value: 'scripture', label: 'Scripture on Program' },
  { value: 'lyrics', label: 'Song / audio playing' },
  { value: 'transcript', label: 'Live transcription' },
  { value: 'custom', label: 'Custom text' },
  { value: 'data', label: 'Data source' },
];

const SCHEMA: Record<VizFamily, VizParamDef[]> = {
  typo: [
    { key: 'textSource', label: 'Words from', kind: 'select', default: 'auto', options: TEXT_SOURCE_OPTIONS, group: 'Words' },
    { key: 'customText', label: 'Custom text', kind: 'textarea', default: '', group: 'Words', hint: 'Blank = the shared custom text', showIf: { key: 'textSource', in: ['custom', 'auto'] } },
    { key: 'maxWords', label: 'Max words', kind: 'range', min: 3, max: 60, step: 1, default: 24, group: 'Words', hint: 'Long verses are trimmed to keep the type readable' },
    { key: 'uppercase', label: 'Uppercase', kind: 'toggle', default: 1, group: 'Words' },
    { key: 'wordPace', label: 'Word highlight pace (s)', kind: 'range', min: 0.2, max: 2.5, step: 0.05, default: 0.85, group: 'Motion' },
    AUDIO,
  ],
  gen: [
    SPEED,
    { key: 'p0', label: 'Shape', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Look', hint: 'What each control does varies by visualizer' },
    { key: 'p1', label: 'Detail', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Look' },
    { key: 'p2', label: 'Energy', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Look' },
    { key: 'p3', label: 'Variation', kind: 'range', min: 0, max: 1, step: 0.01, default: 0.5, group: 'Look' },
    { key: 'color0', label: 'Colour 1', kind: 'color', default: '#8C5CF2', group: 'Colour' },
    { key: 'color1', label: 'Colour 2', kind: 'color', default: '#D40054', group: 'Colour' },
    { key: 'color2', label: 'Colour 3', kind: 'color', default: '#FF8C00', group: 'Colour' },
    AUDIO,
  ],
  studio: [
    SPEED,
    { key: 'glow', label: 'Glow', kind: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'Look' },
    { key: 'color0', label: 'Colour 1', kind: 'color', default: '#8B5CF6', group: 'Colour' },
    { key: 'color1', label: 'Colour 2', kind: 'color', default: '#D40055', group: 'Colour' },
    { key: 'color2', label: 'Colour 3', kind: 'color', default: '#FF8C00', group: 'Colour' },
    { key: 'color3', label: 'Background', kind: 'color', default: '#0A0612', group: 'Colour' },
    AUDIO,
  ],
  flux: [AUDIO],
  milkdrop: [AUDIO],
  shader: [],
};

// Library shaders name their own iParam0..3 controls (Series VIII: Motion,
// Warmth, Light, Text-safe). The library registers them here so this module
// stays free of the shader catalogue import.
const shaderParamNames = new Map<string, Array<{ name: string; def: number }>>();
export function registerShaderParams(src: string, params: Array<{ name: string; def: number }> | undefined): void {
  if (src && params?.length) shaderParamNames.set(src, params);
}

const SHADER_HINTS: Record<string, string> = {
  Motion: 'How fast it moves — 50% is the designed pace',
  Warmth: 'White balance: cool daylight ← neutral → warm tungsten',
  Light: 'Exposure',
  'Text-safe': 'Darkens the centre / lower third so lyrics read',
};

export function vizParamDefs(family: VizFamily, mode?: string | null): VizParamDef[] {
  if (family !== 'shader') return SCHEMA[family];
  const named = mode ? shaderParamNames.get(mode) : undefined;
  return (named ?? []).slice(0, 4).map((p, i) => ({
    key: `p${i}`, label: p.name, kind: 'range' as const, min: 0, max: 1, step: 0.01, default: p.def, group: 'Look', hint: SHADER_HINTS[p.name],
  }));
}

/** A param's value with its default filled in. */
export function vizParam(params: VizParams | undefined, def: VizParamDef): number | string {
  const v = params?.[def.key];
  if (v === undefined || v === '') return def.default;
  return typeof def.default === 'number' ? Number(v) : v;
}
export function numParam(params: VizParams | undefined, key: string, d: number): number {
  const v = params?.[key];
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
}
export function hexToRgb01(hex: unknown, fallback: [number, number, number]): [number, number, number] {
  const m = typeof hex === 'string' ? hex.trim().match(/^#?([0-9a-f]{6})$/i) : null;
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ── per-mode settings store ─────────────────────────────────────────────────

export type VizApplyTarget = 'preview' | 'program' | 'both';
const KEY = 'ambo_viz_params_v1';
const TKEY = 'ambo_viz_params_target_v1';

let byMode: Record<string, VizParams> = (() => {
  try { return typeof localStorage !== 'undefined' ? JSON.parse(localStorage.getItem(KEY) || '{}') : {}; } catch { return {}; }
})();
let target: VizApplyTarget = (() => {
  try { const t = typeof localStorage !== 'undefined' ? localStorage.getItem(TKEY) : null; return t === 'preview' || t === 'program' ? t : 'both'; } catch { return 'both'; }
})();
let version = 0;
let lastChanged: string | null = null;
const subs = new Set<() => void>();
const emit = () => { version++; subs.forEach(fn => { try { fn(); } catch { /* */ } }); };
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(byMode)); } catch { /* */ } };

export const subscribeVizParams = (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; };
export const vizParamsVersion = () => version;
/** The mode whose settings changed most recently (lets the studio patch only that layer). */
export const lastChangedVizMode = () => lastChanged;
export const getVizParams = (mode: string | undefined | null): VizParams | undefined => (mode ? byMode[mode] : undefined);
/** Only the numeric params (SHADER content carries p0..p3 numbers). */
export function numericVizParams(mode: string | undefined | null): Record<string, number> | undefined {
  const p = getVizParams(mode);
  if (!p) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === 'number') out[k] = v;
  return out;
}
export function setVizParams(mode: string, patch: VizParams): void {
  byMode = { ...byMode, [mode]: { ...(byMode[mode] || {}), ...patch } };
  lastChanged = mode;
  persist(); emit();
}
export function resetVizParams(mode: string): void {
  const { [mode]: _drop, ...rest } = byMode;
  byMode = rest;
  lastChanged = mode;
  persist(); emit();
}
export const getVizApplyTarget = () => target;
export function setVizApplyTarget(t: VizApplyTarget): void {
  target = t;
  try { localStorage.setItem(TKEY, t); } catch { /* */ }
  emit();
}
