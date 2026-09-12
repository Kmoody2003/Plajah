// audioReact — drive any effect parameter from the timeline's audio (the Beat Reactor idea).
//
// Two halves of the same feature:
//   • the GLSL uniforms iBass / iMid / iTreble / iLevel, which effects can read directly, and
//   • PARAM BINDINGS, which modulate any declared parameter of any effect — so audio reactivity
//     is not limited to effects whose shader happens to read the audio uniforms.
//
// Both are fed from ONE AudioTexture owned by the compositor, so whatever drives the picture
// drives the numbers too. The offline renderer feeds it the exact per-frame spectrum of the
// rendered audio mix; the live monitor feeds it the master analyser. Pure and GL-free here so
// it can be unit tested.
import type { FxParam } from './effects';

export type AudioSource = 'level' | 'bass' | 'mid' | 'treble';
export const AUDIO_SOURCES: { id: AudioSource; label: string }[] = [
  { id: 'level', label: 'Level' }, { id: 'bass', label: 'Bass' }, { id: 'mid', label: 'Mid' }, { id: 'treble', label: 'Treble' },
];

export interface AudioLevels { level: number; bass: number; mid: number; treble: number; }
export const SILENT: AudioLevels = { level: 0, bass: 0, mid: 0, treble: 0 };

export interface AudioBinding {
  source: AudioSource;
  /** Fraction of the parameter's range added at full signal. Negative pulls the other way. */
  amount: number;
  /** Signal below this is ignored (0..1) — keeps a parameter still through quiet passages. */
  threshold?: number;
  /** Raises the response curve: >1 reacts only to peaks, <1 reacts to everything. */
  gamma?: number;
  invert?: boolean;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Shape one channel by threshold / gamma / invert. Returns 0..1. */
export function shapeSignal(raw: number, b: AudioBinding): number {
  const thr = clamp01(b.threshold ?? 0);
  let v = clamp01(raw);
  v = thr >= 1 ? 0 : clamp01((v - thr) / (1 - thr));
  const g = b.gamma ?? 1;
  if (g !== 1 && g > 0) v = Math.pow(v, g);
  return b.invert ? 1 - v : v;
}

/** Ordered parameter values with audio bindings applied. Unbound values pass through. */
export function applyAudioBindings(values: number[], params: FxParam[], bindings: Record<string, AudioBinding> | undefined, levels: AudioLevels): number[] {
  if (!bindings) return values;
  const keys = Object.keys(bindings);
  if (!keys.length) return values;
  const out = values.slice();
  for (const key of keys) {
    const b = bindings[key];
    const index = params.findIndex(p => p.key === key);
    if (!b || index < 0) continue;
    const param = params[index];
    const signal = shapeSignal(levels[b.source] ?? 0, b);
    const base = out[index] ?? param.default;
    const value = base + signal * (b.amount || 0) * (param.max - param.min);
    out[index] = Math.max(param.min, Math.min(param.max, value));
  }
  return out;
}

/** True when this instance has at least one live audio binding (lets callers skip work). */
export function hasAudioBindings(bindings: Record<string, AudioBinding> | undefined): boolean {
  return !!bindings && Object.values(bindings).some(b => b && !!b.amount);
}
