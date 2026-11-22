// Solved takes → game-ready clips. A solve (solve.ts) is a faithful record of what the camera saw: the performer
// faces wherever they faced the camera, the camera's tilt leans the whole body, a walk drifts across the floor and a
// "cycle" starts and stops wherever the footage did. Games want each move facing +Z, standing on a level floor, a
// cycle that loops without a pop, and the travel reported separately (root motion) so the game moves the body.
// Every step here is a rigid or blending edit of the solved motion — nothing is keyed by hand.
import * as THREE from 'three';
import type { MotionClip } from './types';
import { JOINTS, fk, smoothRotations, cleanRuns, lockFeet } from './solve';
import { findLoop } from './moves';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<string, number>;

/** Root motion of a clip in its own facing frame (+Z forward, +X the performer's left). */
export interface RootMotion { dx: number; dy: number; dz: number; /** m/s along the floor, start → end */ speed: number; durationSec: number }

const nj = (c: MotionClip) => c.skeleton.joints.length;
const getQ = (c: MotionClip, f: number, j: number) => { const o = (f * nj(c) + j) * 4; return new THREE.Quaternion(c.rot[o], c.rot[o + 1], c.rot[o + 2], c.rot[o + 3]); };
const setQ = (c: MotionClip, f: number, j: number, q: THREE.Quaternion) => { const o = (f * nj(c) + j) * 4; c.rot[o] = q.x; c.rot[o + 1] = q.y; c.rot[o + 2] = q.z; c.rot[o + 3] = q.w; };
const getR = (c: MotionClip, f: number) => V(c.root[f * 3], c.root[f * 3 + 1], c.root[f * 3 + 2]);
const setR = (c: MotionClip, f: number, p: THREE.Vector3) => { c.root[f * 3] = p.x; c.root[f * 3 + 1] = p.y; c.root[f * 3 + 2] = p.z; };
const locals = (c: MotionClip, f: number) => c.skeleton.joints.map((_, j) => getQ(c, f, j));

/** Frames [a, b] (inclusive) of a clip as a clip of their own; the root starts at x = z = 0. */
export function subClip(c: MotionClip, a: number, b: number, name?: string): MotionClip {
  a = Math.max(0, Math.min(c.frames - 1, a)); b = Math.max(a, Math.min(c.frames - 1, b));
  const n = nj(c), r0 = getR(c, a);
  const root = c.root.slice(a * 3, (b + 1) * 3);
  for (let i = 0; i < root.length; i += 3) { root[i] -= r0.x; root[i + 2] -= r0.z; }
  return {
    ...c, name: name ?? c.name, frames: b - a + 1,
    rot: c.rot.slice(a * n * 4, (b + 1) * n * 4), root,
    contacts: { l: c.contacts.l.slice(a, b + 1), r: c.contacts.r.slice(a, b + 1) },
    seen: c.seen?.slice(a, b + 1), moves: [],
    source: { ...c.source, durationSec: +((b - a + 1) / c.fps).toFixed(3) },
  };
}

/** Facing of the hips (yaw, radians; 0 = +Z). */
export const hipYaw = (c: MotionClip, f: number) => { const d = V(0, 0, 1).applyQuaternion(getQ(c, f, J.hip)); return Math.atan2(d.x, d.z); };

/** Turn the whole clip about the vertical so it faces +Z: 'start' = the facing over the first ~0.15 s, 'mean' = the
 *  average facing, 'travel' = the direction the hips travel (locomotion cycles), or a yaw in radians to undo. */
export function faceForward(c: MotionClip, mode: 'start' | 'mean' | 'travel' | number = 'start'): number {
  let yaw: number;
  if (typeof mode === 'number') yaw = mode;
  else if (mode === 'travel') {
    const d = getR(c, c.frames - 1).sub(getR(c, 0)).setY(0);
    yaw = d.lengthSq() > 1e-4 ? Math.atan2(d.x, d.z) : hipYaw(c, 0);
  } else {
    const k = mode === 'start' ? Math.min(c.frames, Math.max(1, Math.round(0.15 * c.fps))) : c.frames;
    let sx = 0, sz = 0;
    for (let f = 0; f < k; f++) { const y = hipYaw(c, f); sx += Math.sin(y); sz += Math.cos(y); }
    yaw = Math.atan2(sx, sz);
  }
  const q = new THREE.Quaternion().setFromAxisAngle(UP, -yaw);
  for (let f = 0; f < c.frames; f++) {
    setQ(c, f, J.hip, q.clone().multiply(getQ(c, f, J.hip)));
    setR(c, f, getR(c, f).applyQuaternion(q));
  }
  return yaw;
}

/** Undo the camera's tilt: a camera looking up or down (or rolled) leans the whole solved body. The reference is the
 *  ankles→hips line averaged over the frames with a foot planted, which stands vertical for any stance a body can
 *  hold still in. Corrections under `minDeg` are left alone; over `maxDeg` the clip is trusted (a real lean). */
export function level(c: MotionClip, o: { minDeg?: number; maxDeg?: number } = {}): number {
  const minD = o.minDeg ?? 3, maxD = o.maxDeg ?? 25;
  const sum = V(); let k = 0;
  for (let f = 0; f < c.frames; f++) {
    if (!c.contacts.l[f] && !c.contacts.r[f]) continue;
    const { pos } = fk(locals(c, f), c.skeleton.joints);
    const ank = pos[J.lFoot].clone().add(pos[J.rFoot]).multiplyScalar(0.5);
    sum.add(pos[J.hip].clone().sub(ank).normalize()); k++;
  }
  if (!k) return 0;
  const up = sum.normalize(), deg = THREE.MathUtils.radToDeg(up.angleTo(UP));
  if (deg < minD || deg > maxD) return 0;
  const q = new THREE.Quaternion().setFromUnitVectors(up, UP);
  for (let f = 0; f < c.frames; f++) setQ(c, f, J.hip, q.clone().multiply(getQ(c, f, J.hip)));
  return +deg.toFixed(1);
}

/** Extra temporal smoothing of the rotations (sigma in frames) for fast, blurred footage. */
export function smooth(c: MotionClip, sigma: number): void {
  const L = Array.from({ length: c.frames }, (_, f) => locals(c, f));
  smoothRotations(L, sigma);
  L.forEach((row, f) => row.forEach((q, j) => setQ(c, f, j, q)));
}

/** Contact cleanup: drop plants shorter than `minOn` frames and close lifts shorter than `minOff`, then pin the
 *  planted feet again with leg IK (solve.ts lockFeet) so the edited clip still doesn't skate. */
export function cleanContacts(c: MotionClip, o: { minOn?: number; minOff?: number; relock?: boolean } = {}): void {
  c.contacts = { l: cleanRuns(c.contacts.l, o.minOn ?? 3, o.minOff ?? 3), r: cleanRuns(c.contacts.r, o.minOn ?? 3, o.minOff ?? 3) };
  if (o.relock === false) return;
  const L = Array.from({ length: c.frames }, (_, f) => locals(c, f));
  const roots = Array.from({ length: c.frames }, (_, f) => getR(c, f));
  lockFeet(L, roots, c.contacts, c.skeleton.joints);
  L.forEach((row, f) => row.forEach((q, j) => setQ(c, f, j, q)));
}

/** Travel over the clip in its facing frame. */
export function rootMotion(c: MotionClip): RootMotion {
  const a = getR(c, 0), b = getR(c, c.frames - 1), d = b.clone().sub(a), dur = (c.frames - 1) / c.fps;
  return { dx: +d.x.toFixed(3), dy: +d.y.toFixed(3), dz: +d.z.toFixed(3), speed: +(Math.hypot(d.x, d.z) / Math.max(1e-3, dur)).toFixed(2), durationSec: +dur.toFixed(3) };
}

/** Make a cycle: cut at the best-matching pair of frames inside the clip (moves.ts findLoop), then blend the last
 *  `blend` frames so the final pose equals the first exactly (rotations by a slerped correction, hip height by a
 *  ramp) and the floor path runs at its average velocity, so a looping action never pops or drifts sideways. */
/** `travel: 'side'` (strafes, side-runs): the sideways path is the travel and is kept; forward drift is removed. */
export function makeLoop(c: MotionClip, o: { minSec?: number; blend?: number; search?: boolean; travel?: 'forward' | 'side' } = {}): MotionClip {
  let out = c;
  if (o.search !== false) {
    const lp = findLoop(c, o.minSec ?? 0.5);
    if (lp) out = subClip(c, lp.start, lp.end, c.name);
  }
  const n = out.frames, k = Math.min(n - 1, o.blend ?? Math.max(3, Math.round(0.2 * out.fps)));
  for (let j = 0; j < nj(out); j++) {
    const first = getQ(out, 0, j), last = getQ(out, n - 1, j);
    if (first.dot(last) < 0) first.set(-first.x, -first.y, -first.z, -first.w);
    const D = first.clone().multiply(last.clone().invert());
    for (let f = n - 1 - k; f < n; f++) {
      const w = (f - (n - 1 - k)) / k, s = w * w * (3 - 2 * w);
      setQ(out, f, j, new THREE.Quaternion().slerp(D, s).multiply(getQ(out, f, j)).normalize());
    }
  }
  const y0 = out.root[1], y1 = out.root[(n - 1) * 3 + 1];
  const end = getR(out, n - 1);
  for (let f = 0; f < n; f++) {
    const u = f / (n - 1), w = f >= n - 1 - k ? ((f - (n - 1 - k)) / k) : 0;
    const r = getR(out, f);
    // sideways and height: pulled back onto the start so the cycle closes; forward: kept (that is the travel)
    if (o.travel === 'side') r.z -= end.z * u; // a side-run: forward drift removed, the sideways travel kept
    else r.x -= end.x * u; // sideways drift removed: the loop must not walk off its line
    r.y = r.y + (y0 - y1) * w * w * (3 - 2 * w);
    setR(out, f, r);
  }
  out.contacts.l[n - 1] = out.contacts.l[0]; out.contacts.r[n - 1] = out.contacts.r[0];
  return out;
}

const SWAP: Record<string, string> = {};
for (const n of JOINTS) if (/^[lr][A-Z]/.test(n)) SWAP[n] = (n[0] === 'l' ? 'r' : 'l') + n.slice(1);

/** Left ↔ right mirror image (a strafe right from a strafe left, a left-hand combo from a right-hand one). The rest
 *  skeleton is symmetric about x = 0, so a mirrored local rotation is (x, −y, −z, w) on the swapped joint. */
export function mirror(c: MotionClip, name?: string): MotionClip {
  const out: MotionClip = { ...c, name: name ?? `${c.name} (mirrored)`, rot: c.rot.slice(), root: c.root.slice(), contacts: { l: c.contacts.r.slice(), r: c.contacts.l.slice() } };
  const names = c.skeleton.joints.map((j) => j.name);
  for (let f = 0; f < c.frames; f++) {
    names.forEach((nm, j) => {
      const src = SWAP[nm] ? names.indexOf(SWAP[nm]) : j;
      const q = getQ(c, f, src);
      setQ(out, f, j, new THREE.Quaternion(q.x, -q.y, -q.z, q.w));
    });
    out.root[f * 3] = -c.root[f * 3];
  }
  return out;
}

/** The clip played backwards (a back-pedal from a forward advance). */
export function reverse(c: MotionClip, name?: string): MotionClip {
  const out: MotionClip = { ...c, name: name ?? `${c.name} (reversed)`, rot: c.rot.slice(), root: c.root.slice(), contacts: { l: c.contacts.l.slice().reverse(), r: c.contacts.r.slice().reverse() } };
  const n = nj(c);
  for (let f = 0; f < c.frames; f++) {
    const g = c.frames - 1 - f;
    for (let k = 0; k < n * 4; k++) out.rot[f * n * 4 + k] = c.rot[g * n * 4 + k];
    for (let k = 0; k < 3; k++) out.root[f * 3 + k] = c.root[g * 3 + k];
  }
  const r0 = getR(out, 0);
  for (let f = 0; f < c.frames; f++) { out.root[f * 3] -= r0.x; out.root[f * 3 + 2] -= r0.z; }
  return out;
}

/** Time-stretch to `rate` × the original speed (resampled by slerp), e.g. 0.8 to calm a reel's sped-up action. */
export function retime(c: MotionClip, rate: number): MotionClip {
  const n = Math.max(2, Math.round((c.frames - 1) / rate) + 1), J0 = nj(c);
  const out: MotionClip = { ...c, frames: n, rot: new Array(n * J0 * 4), root: new Array(n * 3), contacts: { l: [], r: [] }, seen: undefined };
  for (let f = 0; f < n; f++) {
    const t = (f * (c.frames - 1)) / (n - 1), a = Math.floor(t), b = Math.min(c.frames - 1, a + 1), u = t - a;
    for (let j = 0; j < J0; j++) setQ(out, f, j, getQ(c, a, j).slerp(getQ(c, b, j), u));
    setR(out, f, getR(c, a).lerp(getR(c, b), u));
    out.contacts.l.push(c.contacts.l[Math.round(t)]); out.contacts.r.push(c.contacts.r[Math.round(t)]);
  }
  return out;
}

/** One recipe for a game clip, so every clip records exactly how it was made from its source footage. */
export interface ClipRecipe {
  name: string;
  /** Seconds inside the shot's solved clip. */
  from: number; to: number;
  face?: 'start' | 'mean' | 'travel';
  level?: boolean;
  smooth?: number;
  loop?: boolean | { minSec?: number; blend?: number; search?: boolean; travel?: 'forward' | 'side' };
  mirror?: boolean;
  reverse?: boolean;
  rate?: number;
}

/** Apply a recipe to a solved clip; returns the game clip and its root motion. */
export function bakeRecipe(solved: MotionClip, r: ClipRecipe): { clip: MotionClip; rootMotion: RootMotion; levelDeg: number; faceDeg: number } {
  let c = subClip(solved, Math.round(r.from * solved.fps), Math.round(r.to * solved.fps), r.name);
  c = { ...c, rot: c.rot.slice(), root: c.root.slice(), contacts: { l: c.contacts.l.slice(), r: c.contacts.r.slice() } };
  const levelDeg = r.level === false ? 0 : level(c);
  const faceDeg = THREE.MathUtils.radToDeg(faceForward(c, r.face ?? 'start'));
  if (r.smooth) smooth(c, r.smooth);
  cleanContacts(c, { relock: true });
  if (r.rate && r.rate !== 1) c = retime(c, r.rate);
  if (r.loop) c = makeLoop(c, typeof r.loop === 'object' ? r.loop : {});
  if (r.reverse) c = reverse(c, r.name);
  if (r.mirror) c = mirror(c, r.name);
  c.name = r.name;
  return { clip: c, rootMotion: rootMotion(c), levelDeg, faceDeg: Math.round(faceDeg) };
}

/** Close a baked three.js clip into a loop: over the last `blendSec` every quaternion track is slerped onto its first
 *  key and every position track's last keys onto its first (game clips from libraries like CMU, cut between two
 *  matching steps by hand, still end a few degrees off). Edits the clip in place. */
export function closeLoopThree(clip: THREE.AnimationClip, blendSec = 0.15): void {
  const q0 = new THREE.Quaternion(), q = new THREE.Quaternion();
  for (const t of clip.tracks) {
    const n = t.times.length, stride = t.getValueSize();
    if (n < 3) continue;
    const tEnd = t.times[n - 1];
    for (let i = 0; i < n; i++) {
      const u = (t.times[i] - (tEnd - blendSec)) / blendSec;
      if (u <= 0) continue;
      const w = Math.min(1, u), s = w * w * (3 - 2 * w), o = i * stride;
      if (stride === 4) {
        q0.fromArray(t.values, 0); q.fromArray(t.values, o);
        if (q.dot(q0) < 0) q0.set(-q0.x, -q0.y, -q0.z, -q0.w);
        q.slerp(q0, s).toArray(t.values, o);
      } else for (let c = 0; c < stride; c++) t.values[o + c] += (t.values[c] - t.values[o + c]) * s;
    }
  }
}

/** Turn a baked clip about the vertical (its root bone's rotation and travel), e.g. to face a library take +Z. */
export function yawThree(clip: THREE.AnimationClip, root: string, yaw: number): void {
  const r = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), q = new THREE.Quaternion(), v = new THREE.Vector3();
  for (const t of clip.tracks) {
    if (t.name === `${root}.quaternion`) for (let o = 0; o < t.values.length; o += 4) q.fromArray(t.values, o).premultiply(r).toArray(t.values, o);
    if (t.name === `${root}.position`) {
      const x0 = t.values[0], z0 = t.values[2];
      for (let o = 0; o < t.values.length; o += 3) { v.set(t.values[o] - x0, t.values[o + 1], t.values[o + 2] - z0).applyQuaternion(r); t.values[o] = v.x + x0; t.values[o + 1] = v.y; t.values[o + 2] = v.z + z0; }
    }
  }
}

/** Best loop in a baked three.js clip: the pair of sample times (at least `minSec` apart) whose joint rotations match
 *  best (hips height and travel excluded). Returns the clip cut to [start, end] with times from 0. */
export function findLoopThree(clip: THREE.AnimationClip, minSec = 0.5, fps = 30): THREE.AnimationClip {
  const qt = clip.tracks.filter((t) => t.getValueSize() === 4 && !t.name.startsWith('Hips.'));
  if (!qt.length) return clip;
  const n = qt[0].times.length, min = Math.round(minSec * fps);
  if (n < min + 2) return clip;
  let best = { a: 0, b: n - 1, e: Infinity };
  for (let a = 0; a < n - min; a++) for (let b = a + min; b < n; b++) {
    let e = 0;
    for (const t of qt) { const v = t.values; const d = Math.abs(v[a * 4] * v[b * 4] + v[a * 4 + 1] * v[b * 4 + 1] + v[a * 4 + 2] * v[b * 4 + 2] + v[a * 4 + 3] * v[b * 4 + 3]); e += 1 - Math.min(1, d); }
    // prefer longer loops a little (two strides beat one when they match as well)
    e -= (b - a) * 1e-5;
    if (e < best.e) best = { a, b, e };
  }
  const t0 = qt[0].times[best.a], t1 = qt[0].times[best.b];
  const tracks = clip.tracks.map((t) => {
    const s = t.getValueSize(), times: number[] = [], vals: number[] = [];
    for (let i = 0; i < t.times.length; i++) if (t.times[i] >= t0 - 1e-6 && t.times[i] <= t1 + 1e-6) { times.push(t.times[i] - t0); for (let c = 0; c < s; c++) vals.push(t.values[i * s + c]); }
    return new (t.constructor as new (n: string, t: number[], v: number[]) => THREE.KeyframeTrack)(t.name, times, vals);
  });
  return new THREE.AnimationClip(clip.name, t1 - t0, tracks);
}

/** A baked three.js clip played backwards (the root's travel reverses with it). */
export function reverseThree(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.map((t) => {
    const s = t.getValueSize(), n = t.times.length, times: number[] = [], vals: number[] = [];
    for (let i = n - 1; i >= 0; i--) { times.push(clip.duration - t.times[i]); for (let c = 0; c < s; c++) vals.push(t.values[i * s + c]); }
    return new (t.constructor as new (n: string, t: number[], v: number[]) => THREE.KeyframeTrack)(t.name, times, vals);
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
