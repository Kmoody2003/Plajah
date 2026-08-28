// ═══════════════════════════════════════════════════════════════════════════
// keyframes — animate a clip parameter over time. The flat per-clip `fx` bag
// gains an optional `kf` map: fx.kf[param] = [{ t, v, ease }] (t = seconds from
// the clip's head). A param with keys is SAMPLED per frame; a param without keys
// stays its static fx[param] value — so keyframing is purely additive and every
// existing clip keeps rendering exactly as before.
//
// Pure + shared: the live monitor, the offline MP4 render and the tests all read
// the SAME sampler, so what you preview is what bakes (the parity contract the
// grade primitives also follow).
// ═══════════════════════════════════════════════════════════════════════════

export type Ease = 'linear' | 'hold' | 'smooth' | 'in' | 'out';

export interface Keyframe { t: number; v: number; ease?: Ease; }
export type KfTrack = Keyframe[];               // kept sorted by t
export interface KfMap { [param: string]: KfTrack; }

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Shape a 0..1 progress by the segment's ease (ease belongs to the LEFT key). */
function shape(p: number, ease?: Ease): number {
  switch (ease) {
    case 'hold': return 0;                       // hold the left value until the next key
    case 'in': return p * p;                     // accelerate
    case 'out': return 1 - (1 - p) * (1 - p);    // decelerate
    case 'smooth': return p * p * (3 - 2 * p);   // ease-in-out (smoothstep)
    default: return p;                           // linear
  }
}

export function hasKeys(track?: KfTrack | null): boolean {
  return !!track && track.length > 0;
}

/** Value of a track at time t. No/empty track → the clip's static value. */
export function sampleTrack(track: KfTrack | undefined | null, t: number, staticVal: number): number {
  if (!track || track.length === 0) return staticVal;
  if (track.length === 1) return track[0].v;
  if (t <= track[0].t) return track[0].v;
  const last = track[track.length - 1];
  if (t >= last.t) return last.v;
  // locate the bracketing pair
  let i = 0;
  while (i < track.length - 1 && t > track[i + 1].t) i++;
  const a = track[i], b = track[i + 1];
  const span = b.t - a.t;
  const p = span > 1e-6 ? shape(clamp01((t - a.t) / span), a.ease) : 0;
  return a.v + (b.v - a.v) * p;
}

/** Convenience: sample fx.kf[param] at clip-local time, falling back to fx[param]. */
export function sampleParam(fx: any, param: string, localT: number, staticVal: number): number {
  return sampleTrack(fx?.kf?.[param], localT, staticVal);
}

/** Insert or replace a key at time t (within tol), returning a new sorted track. */
export function addKey(track: KfTrack | undefined, t: number, v: number, ease: Ease = 'smooth', tol = 1e-3): KfTrack {
  const next = (track || []).filter((k) => Math.abs(k.t - t) > tol);
  next.push({ t, v, ease });
  next.sort((a, b) => a.t - b.t);
  return next;
}

/** Remove the key nearest t (within tol). Returns a new track (may be empty). */
export function removeKey(track: KfTrack | undefined, t: number, tol = 1e-3): KfTrack {
  return (track || []).filter((k) => Math.abs(k.t - t) > tol);
}

/** The key at t (within tol), or null. */
export function keyAt(track: KfTrack | undefined, t: number, tol = 1e-3): Keyframe | null {
  return (track || []).find((k) => Math.abs(k.t - t) <= tol) || null;
}

/** Neighbour key times for prev/next navigation. */
export function prevKeyTime(track: KfTrack | undefined, t: number, tol = 1e-3): number | null {
  const before = (track || []).filter((k) => k.t < t - tol);
  return before.length ? before[before.length - 1].t : null;
}
export function nextKeyTime(track: KfTrack | undefined, t: number, tol = 1e-3): number | null {
  const after = (track || []).find((k) => k.t > t + tol);
  return after ? after.t : null;
}

/** Does this fx animate anything? (any param has ≥1 key) */
export function isAnimated(fx: any): boolean {
  const kf = fx?.kf;
  if (!kf) return false;
  return Object.keys(kf).some((p) => hasKeys(kf[p]));
}

/** The params Fabula can keyframe today: transform + opacity + the scalar grade
 *  primaries (exposure/contrast/sat/hue/blur). The wheels/curves/qualifier are
 *  objects, not scalars, so they are not keyframeable yet. */
export const KF_PARAMS: { key: string; label: string; def: number; unit?: string }[] = [
  { key: 'x', label: 'POSITION X', def: 0, unit: '%' },
  { key: 'y', label: 'POSITION Y', def: 0, unit: '%' },
  { key: 'sc', label: 'SCALE', def: 1, unit: '×' },
  { key: 'rot', label: 'ROTATION', def: 0, unit: '°' },
  { key: 'op', label: 'OPACITY', def: 1 },
  { key: 'bri', label: 'EXPOSURE', def: 1 },
  { key: 'con', label: 'CONTRAST', def: 1 },
  { key: 'sat', label: 'SATURATION', def: 1 },
  { key: 'hue', label: 'HUE', def: 0, unit: '°' },
  { key: 'blur', label: 'BLUR', def: 0 },
];

/** All keyframeable keys — the single source the UI and samplers agree on. */
export const KF_ALL: string[] = KF_PARAMS.map((p) => p.key);
