// motionApply — turns a Motion Council one-click move (ApplyAction) into a concrete change on a host surface.
// Pure functions only: the hosts (Fabula's VFX room, Pixels) own their state and call these to compute the
// next value, so the same translation is tested headlessly (scripts/verifyMotionRoster.mjs).
//
// What each host can honestly do today:
//   Fabula — fps (project format), aspect, beatGrid (timeline markers, which edge-snapping lands on),
//            ease (the selected clip's keyframes), stepping (bake the selected clip's keyframes on ones/twos/threes).
//            No motion-blur engine yet, so `shutter` is not offered.
//   Pixels — fps only (its 30/60 target frame rate); tempo is derived live from the music.
import { sampleTrack, type Ease, type KfMap, type KfTrack } from '../../fabula/keyframes';
import type { ApplyAction } from './motionCouncilTypes';

export type ApplyKind = ApplyAction['kind'];
export const FABULA_APPLY_KINDS: ApplyKind[] = ['fps', 'aspect', 'beatGrid', 'ease', 'stepping'];
export const PIXELS_APPLY_KINDS: ApplyKind[] = ['fps'];

/** The council's easing vocabulary → Fabula keyframe eases (which have no overshoot; nearest honest match). */
export function easeToKeyframe(preset: string): Ease {
  switch (preset) {
    case 'ease-out': case 'overshoot': return 'out';
    case 'ease-in': case 'anticipation': return 'in';
    case 'ease-in-out': return 'smooth';
    case 'linear': return 'linear';
    default: return 'smooth';
  }
}

/** Set every key's ease in every track (hold keys stay held — they are deliberate steps). */
export function setKeyframeEase(kf: KfMap | undefined, ease: Ease): KfMap {
  const out: KfMap = {};
  for (const [param, track] of Object.entries(kf || {})) out[param] = track.map(k => (k.ease === 'hold' ? k : { ...k, ease }));
  return out;
}

/**
 * Animate on ones/twos/threes: re-sample each keyframed track every `every` frames at `fps` and store the samples
 * as HOLD keys, so the value steps like drawn animation instead of sliding. The last key is kept exactly.
 * `every` = 1 bakes on ones (still stepped per frame — useful before a frame-rate change). Capped per track.
 */
export function stepKeyframes(kf: KfMap | undefined, every: number, fps: number, maxKeys = 2000): KfMap {
  const out: KfMap = {};
  const step = Math.max(1, Math.round(every)) / Math.max(1, fps);
  for (const [param, track] of Object.entries(kf || {})) {
    if (!track || track.length < 2) { out[param] = track ? track.slice() : []; continue; }
    const t0 = track[0].t, t1 = track[track.length - 1].t;
    const n = Math.min(maxKeys - 1, Math.floor((t1 - t0) / step + 1e-6));
    const baked: KfTrack = [];
    for (let i = 0; i <= n; i++) {
      const t = +(t0 + i * step).toFixed(6);
      if (t >= t1 - 1e-6) break;
      baked.push({ t, v: sampleTrack(track, t, track[0].v), ease: 'hold' });
    }
    baked.push({ t: t1, v: track[track.length - 1].v, ease: track[track.length - 1].ease ?? 'hold' });
    out[param] = baked;
  }
  return out;
}

/** Does a clip carry any keyframes the council can act on? */
export function hasAnyKeyframes(kf: KfMap | undefined): boolean {
  return !!kf && Object.values(kf).some(t => Array.isArray(t) && t.length > 0);
}

/**
 * Beat-grid marker times from 0 to `end` seconds: one per beat (division 4) or finer (8 = eighths), capped so a
 * long timeline does not drown in markers — when capped, it falls back to one marker per bar.
 */
export function beatGridTimes(bpm: number, end: number, division = 4, cap = 400): number[] {
  if (!(bpm > 0) || !(end > 0)) return [];
  const beat = 60 / bpm;
  let step = beat / Math.max(1, division / 4);
  if (end / step > cap) step = beat * 4; // too dense → bars
  const out: number[] = [];
  for (let t = 0; t <= end + 1e-6 && out.length < cap; t += step) out.push(+t.toFixed(6));
  return out;
}

/** Merge new marker times into existing markers, skipping any within half a frame of one already there. */
export function mergeMarkerTimes<T extends { t: number }>(existing: T[], times: number[], fps: number, make: (t: number) => T): T[] {
  const tol = 0.5 / Math.max(1, fps);
  const out = existing.slice();
  for (const t of times) if (!out.some(m => Math.abs(m.t - t) < tol)) out.push(make(t));
  return out.sort((a, b) => a.t - b.t);
}

/** Nearest frame rate a host offers. */
export function nearestFps(fps: number, options: number[]): number {
  return options.reduce((best, f) => (Math.abs(f - fps) < Math.abs(best - fps) ? f : best), options[0]);
}

/** Pixels renders at 30 or 60. */
export function pixelsTargetFrameRate(fps: number): 30 | 60 {
  return fps >= 45 ? 60 : 30;
}

/** A sensible delivery target for the council from a host's frame rate and aspect. */
export function deliveryFor(fps?: number, aspect?: string): string {
  if (aspect === '9:16') return 'social-vertical';
  if (aspect === '1:1') return 'square';
  if (fps && fps < 25) return 'cinema';
  if (fps && fps >= 50) return 'web';
  return 'broadcast';
}
