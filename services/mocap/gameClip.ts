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
export function makeLoop(c: MotionClip, o: { minSec?: number; blend?: number; search?: boolean } = {}): MotionClip {
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
    r.x -= end.x * u; // sideways drift removed: the loop must not walk off its line
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
  loop?: boolean | { minSec?: number; blend?: number; search?: boolean };
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
