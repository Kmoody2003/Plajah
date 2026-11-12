// Camera motion capture: landmarks → a clean skeleton animation.
//
//   raw take ─► resample to a fixed rate, fill short gaps ─► light smoothing (looks both ways: offline)
//            ─► bone lengths fixed for the whole take (medians) ─► per-bone rotations from landmark directions
//            ─► root path: a camera estimate (pixel size vs. metric size) for drift and flight,
//               the planted foot for everything else, so the feet cannot skate
//            ─► floor at y = 0, ballistic arcs through jumps ─► MotionClip
//
// Joints use the CMU/DAZ names (hip, abdomen, chest, lShldr, …) so a capture is just another take to the game
// retargeters already written for the CMU shelf (games/era-clash-3d/src/core/character.ts CMU_TO_CONTRACT).
// Pure math on `three` (no renderer), so it runs in a worker, in node tests and in the page alike.
import * as THREE from 'three';
import type { MotionClip, RawFrame, RawTake, SkeletonJoint, TakeQuality, WorldPoint, ImagePoint } from './types';

// MediaPipe pose landmark indices ("left" = the performer's left).
export const MP = {
  nose: 0, earL: 7, earR: 8, shL: 11, shR: 12, elL: 13, elR: 14, wrL: 15, wrR: 16,
  pinkyL: 17, pinkyR: 18, indexL: 19, indexR: 20, hipL: 23, hipR: 24, knL: 25, knR: 26,
  ankL: 27, ankR: 28, heelL: 29, heelR: 30, toeL: 31, toeR: 32,
} as const;

export const JOINTS = [
  'hip', 'abdomen', 'chest', 'neck', 'head',
  'lCollar', 'lShldr', 'lForeArm', 'lHand',
  'rCollar', 'rShldr', 'rForeArm', 'rHand',
  'lThigh', 'lShin', 'lFoot',
  'rThigh', 'rShin', 'rFoot',
] as const;
export type JointName = typeof JOINTS[number];
const J = Object.fromEntries(JOINTS.map((n, i) => [n, i])) as Record<JointName, number>;
const PARENT: Record<JointName, JointName | null> = {
  hip: null, abdomen: 'hip', chest: 'abdomen', neck: 'chest', head: 'neck',
  lCollar: 'chest', lShldr: 'lCollar', lForeArm: 'lShldr', lHand: 'lForeArm',
  rCollar: 'chest', rShldr: 'rCollar', rForeArm: 'rShldr', rHand: 'rForeArm',
  lThigh: 'hip', lShin: 'lThigh', lFoot: 'lShin',
  rThigh: 'hip', rShin: 'rThigh', rFoot: 'rShin',
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const GRAVITY = 9.81;

/** MediaPipe world (x right, y down, z away) → ours (x = performer's left when facing the camera, y up, z toward the camera). */
const toYUp = (p: WorldPoint) => V(p.x, -p.y, -p.z);

// ── 1. Resample, fill, smooth ────────────────────────────────────────────────────────────────────────────

interface Track { w: THREE.Vector3[][]; px: ImagePoint[][]; vis: number[]; missing: boolean[] }

const LEG_L = [23, 25, 27, 29, 31], LEG_R = [24, 26, 28, 30, 32];
const ARM_L = [11, 13, 15, 17, 19, 21], ARM_R = [12, 14, 16, 18, 20, 22];

/** Repairs left/right mix-ups. In side views MediaPipe now and then labels the far leg (or arm) as the near one for
 *  a frame or two; a planted foot then seems to jump to the other leg and drags the hips with it. Per limb pair,
 *  each frame is either as labelled or exchanged; the labelling with the least total on-screen motion over the
 *  whole take wins (a shortest path over the two states), and every exchanged frame pays a fixed toll so the model's
 *  own labels win unless a glitch is plain. Deciding against the previous repaired frame alone was tried first and
 *  failed: one wrong exchange made every later frame look exchanged. Legs crossing in a side view move smoothly,
 *  so they never pay off. Returns the fixed take and how many limb-frames were exchanged. */
export function fixLimbSwaps(take: RawTake, toll = 25): { take: RawTake; swaps: number } {
  const F = take.frames;
  const ok = (f: RawFrame | null): f is RawFrame => !!f && f.pts?.length === 33 && f.world?.length === 33;
  const d = (a: ImagePoint, b: ImagePoint) => Math.hypot((a.x - b.x) * take.width, (a.y - b.y) * take.height);
  const flip = F.map(() => [false, false]);
  ([[LEG_L, LEG_R], [ARM_L, ARM_R]] as const).forEach(([L, R], limb) => {
    // Segments of consecutive detected frames; each solved on its own.
    let i = 0;
    while (i < F.length) {
      if (!ok(F[i])) { i++; continue; }
      let j = i; while (j < F.length && ok(F[j])) j++;
      const seg = F.slice(i, j) as RawFrame[];
      const pos = (f: RawFrame, side: 0 | 1, state: number, k: number) => f.pts[(side === 0) !== (state === 1) ? L[k] : R[k]];
      const move = (a: RawFrame, sa: number, b: RawFrame, sb: number) => {
        let c = 0;
        for (let k = 1; k < L.length; k++) c += d(pos(b, 0, sb, k), pos(a, 0, sa, k)) + d(pos(b, 1, sb, k), pos(a, 1, sa, k));
        return c;
      };
      const cost: number[][] = [[0, toll]], back: number[][] = [[0, 0]];
      for (let t = 1; t < seg.length; t++) {
        cost.push([0, 0]); back.push([0, 0]);
        for (const sb of [0, 1]) {
          const c0 = cost[t - 1][0] + move(seg[t - 1], 0, seg[t], sb), c1 = cost[t - 1][1] + move(seg[t - 1], 1, seg[t], sb);
          cost[t][sb] = Math.min(c0, c1) + (sb ? toll : 0);
          back[t][sb] = c0 <= c1 ? 0 : 1;
        }
      }
      let st = cost[seg.length - 1][0] <= cost[seg.length - 1][1] ? 0 : 1;
      for (let t = seg.length - 1; t >= 0; t--) { flip[i + t][limb] = st === 1; st = back[t][st]; }
      i = j;
    }
  });
  let swaps = 0;
  const frames = F.map((f, i) => {
    if (!ok(f) || (!flip[i][0] && !flip[i][1])) return f;
    const pts = f.pts.slice(), world = f.world.slice();
    ([[LEG_L, LEG_R], [ARM_L, ARM_R]] as const).forEach(([L, R], limb) => {
      if (!flip[i][limb]) return;
      swaps++;
      for (let k = 1; k < L.length; k++) {
        [pts[L[k]], pts[R[k]]] = [f.pts[R[k]], f.pts[L[k]]];
        [world[L[k]], world[R[k]]] = [f.world[R[k]], f.world[L[k]]];
      }
    });
    return { ...f, pts, world };
  });
  return { take: { ...take, frames }, swaps };
}

/** Uniform frames at `fps` from (possibly irregular) captured frames; gaps are filled by interpolation. */
export function resample(take: RawTake): Track {
  const got = take.frames.filter((f): f is RawFrame => !!f && f.world?.length === 33 && f.pts?.length === 33);
  const fps = take.fps;
  if (!got.length) return { w: [], px: [], vis: [], missing: [] };
  const t0 = got[0].t, t1 = got[got.length - 1].t;
  // Frames with no performer still count toward the length of the take.
  const all = take.frames.map((f, i) => f?.t ?? i / fps);
  const tEnd = Math.max(t1, all[all.length - 1] ?? t1);
  const n = Math.max(1, Math.round((tEnd - Math.min(t0, all[0] ?? t0)) * fps) + 1);
  const start = Math.min(t0, all[0] ?? t0);
  const out: Track = { w: [], px: [], vis: [], missing: [] };
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = start + i / fps;
    while (k < got.length - 1 && got[k + 1].t <= t) k++;
    const a = got[k], b = got[Math.min(k + 1, got.length - 1)];
    const span = b.t - a.t;
    const u = span > 1e-6 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
    // A frame is "missing" when the nearest real frame is more than 1.5 frame-times away.
    const near = Math.min(Math.abs(t - a.t), Math.abs(b.t - t));
    out.missing.push(near > 1.5 / fps || t < t0 - 0.5 / fps || t > t1 + 0.5 / fps);
    const w: THREE.Vector3[] = [], px: ImagePoint[] = [];
    let vs = 0;
    for (let j = 0; j < 33; j++) {
      w.push(toYUp(a.world[j]).lerp(toYUp(b.world[j]), u));
      const pa = a.pts[j], pb = b.pts[j];
      const v = pa.v + (pb.v - pa.v) * u;
      px.push({ x: pa.x + (pb.x - pa.x) * u, y: pa.y + (pb.y - pa.y) * u, v });
      vs += v;
    }
    out.w.push(w); out.px.push(px); out.vis.push(vs / 33);
  }
  return out;
}

const gaussKernel = (sigma: number) => {
  const r = Math.max(1, Math.ceil(sigma * 2.5));
  const k: number[] = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  return { r, k };
};

/** Spike removal: a running median over 2·half+1 frames, per landmark coordinate. MediaPipe's noise on small or
 *  distant performers is mostly single-frame jumps; a median drops them without blurring a fast strike the way a
 *  wider Gaussian would (a real move lasts several frames, a spike one or two). */
export function despike(tr: Track, half = 2): Track {
  const n = tr.w.length;
  if (half <= 0 || n < 2 * half + 1) return tr;
  const med = (xs: number[]) => xs.sort((a, b) => a - b)[xs.length >> 1];
  const w = tr.w.map((f) => f.map((p) => p.clone()));
  const px = tr.px.map((f) => f.map((p) => ({ ...p })));
  for (let i = 0; i < n; i++) {
    const idx: number[] = [];
    for (let o = -half; o <= half; o++) { const q = i + o; if (q >= 0 && q < n && !tr.missing[q]) idx.push(q); }
    if (idx.length < 3) continue;
    for (let j = 0; j < 33; j++) {
      w[i][j].set(med(idx.map((q) => tr.w[q][j].x)), med(idx.map((q) => tr.w[q][j].y)), med(idx.map((q) => tr.w[q][j].z)));
      px[i][j].x = med(idx.map((q) => tr.px[q][j].x)); px[i][j].y = med(idx.map((q) => tr.px[q][j].y));
    }
  }
  return { ...tr, w, px };
}

/** Default smoothing from how big the performer is on screen: landmark noise grows as the body shrinks.
 *  `torsoPx` = median shoulder-to-hip height in pixels. */
export function autoSmooth(torsoPx: number): number {
  if (torsoPx >= 160) return 1.1;
  if (torsoPx <= 50) return 2.4;
  return 2.4 - ((torsoPx - 50) / 110) * 1.3;
}

/** Median torso height in pixels across the take (frames with a performer). */
export function torsoPixels(take: RawTake): number {
  const hs = take.frames.filter((f): f is RawFrame => !!f && f.pts?.length === 33)
    .map((f) => Math.abs((f.pts[11].y + f.pts[12].y - f.pts[23].y - f.pts[24].y) / 2) * take.height);
  return median(hs) || 200;
}

/** Noise of each of the 33 landmarks (world, hip-centred), mm: the median third difference / sqrt(20), which is the
 *  std of white noise and barely registers smooth motion, however fast. Hidden or blurred limbs score high. */
export function landmarkNoise(tr: Track): number[] {
  const out: number[] = [];
  const n = tr.w.length;
  for (let k = 0; k < 33; k++) {
    // Measured only while the point moves slowly (its slower 40% of frames, by a 5-frame displacement): a walking
    // foot lands and turns sharply, and that real motion read as noise smoothed the stride away (benchmark: stride
    // 0.34 m with it, 0.51 m without, truth 0.67 m).
    const slow: number[] = [];
    for (let i = 2; i < n - 2; i++) slow.push(tr.w[i + 2][k].distanceTo(tr.w[i - 2][k]));
    const cut = [...slow].sort((a, b) => a - b)[Math.floor(slow.length * 0.4)] ?? Infinity;
    const d3: number[] = [];
    for (let i = 2; i < n - 2; i++) {
      if (tr.missing[i - 1] || tr.missing[i] || tr.missing[i + 1] || tr.missing[i + 2] || slow[i - 2] > cut) continue;
      const [a, b, c, d] = [tr.w[i - 1][k], tr.w[i][k], tr.w[i + 1][k], tr.w[i + 2][k]];
      d3.push(Math.hypot(d.x - 3 * c.x + 3 * b.x - a.x, d.y - 3 * c.y + 3 * b.y - a.y, d.z - 3 * c.z + 3 * b.z - a.z) * 1000);
    }
    out.push((median(d3) || 0) / Math.sqrt(20));
  }
  return out;
}

/** Residual noise a landmark keeps after Gaussian smoothing of width s frames: σ / sqrt(2·sqrt(π)·s). */
export const residualNoise = (noise: number, s: number) => (s > 0 ? noise / Math.sqrt(2 * Math.sqrt(Math.PI) * s) : noise);
/** Auto smoothing aims to leave about this much noise per landmark (mm), within [0.8, 3.5] frames. */
export const NOISE_TARGET = 5;

/** Visibility-weighted Gaussian smoothing of every landmark, looking forwards and backwards (no lag). */
/** Above this speed (m/s) a point is smoothed about e-fold less than at rest. */
export const ADAPT_SPEED = 0.6;

export function smoothTrack(tr: Track, sigma: number | number[] = 1.1, adaptive = false): Track {
  if (tr.w.length < 3) return tr;
  const n = tr.w.length;
  const w = tr.w.map((f) => f.map((p) => p.clone()));
  const px = tr.px.map((f) => f.map((p) => ({ ...p })));
  // Speed-adaptive (like a One Euro filter, but looking both ways): the full width while a point moves slowly,
  // narrowing toward 0.8 frames as it speeds up, so noise is calmed when still and a fast stride or strike keeps its
  // reach (a fixed width that tamed a noisy ankle also halved a walking stride on the benchmark).
  const kernels = new Map<number, { r: number; k: number[] }>();
  const kernelFor = (sg: number) => { const key = Math.round(sg * 10); if (!kernels.has(key)) kernels.set(key, gaussKernel(key / 10)); return kernels.get(key)!; };
  for (let j = 0; j < 33; j++) {
    const sj = Array.isArray(sigma) ? sigma[j] : sigma;
    if (!(sj > 0)) continue;
    // Speed (m/s) from a 4-frame span, so single-frame noise doesn't read as motion.
    const speed = tr.w.map((_, i) => {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      return b > a ? (tr.w[b][j].distanceTo(tr.w[a][j]) * 30) / (b - a) : 0;
    });
    for (let i = 0; i < n; i++) {
      const sgi = adaptive ? 0.8 + (sj - 0.8) * Math.exp(-speed[i] / ADAPT_SPEED) : sj;
      const { r, k } = kernelFor(Math.max(0.3, sgi));
      let sx = 0, sy = 0, sz = 0, su = 0, sv = 0, sw = 0;
      for (let o = -r; o <= r; o++) {
        const q = Math.min(n - 1, Math.max(0, i + o));
        const wt = k[o + r] * Math.max(0.05, tr.px[q][j].v) * (tr.missing[q] ? 0.02 : 1);
        const p = tr.w[q][j];
        sx += p.x * wt; sy += p.y * wt; sz += p.z * wt; su += tr.px[q][j].x * wt; sv += tr.px[q][j].y * wt; sw += wt;
      }
      w[i][j].set(sx / sw, sy / sw, sz / sw);
      px[i][j].x = su / sw; px[i][j].y = sv / sw;
    }
  }
  return { ...tr, w, px };
}

// ── 2. Skeleton with fixed bone lengths ─────────────────────────────────────────────────────────────────

const mid = (a: THREE.Vector3, b: THREE.Vector3) => a.clone().add(b).multiplyScalar(0.5);
const median = (xs: number[]) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export interface Proportions {
  spine: number; neckHead: number; shHalf: number; upper: number; fore: number; hand: number;
  hipHalf: number; thigh: number; shin: number; foot: number; ankleH: number;
}

export function measure(tr: Track): Proportions {
  const good = tr.w.filter((_, i) => !tr.missing[i] && tr.vis[i] > 0.4);
  const use = good.length ? good : tr.w;
  const m = (f: (w: THREE.Vector3[]) => number) => median(use.map(f));
  const d = (a: number, b: number) => (w: THREE.Vector3[]) => w[a].distanceTo(w[b]);
  const both = (a1: number, b1: number, a2: number, b2: number) => (w: THREE.Vector3[]) => (w[a1].distanceTo(w[b1]) + w[a2].distanceTo(w[b2])) / 2;
  const foot = m(both(MP.ankL, MP.toeL, MP.ankR, MP.toeR)) || 0.16;
  return {
    spine: m((w) => mid(w[MP.shL], w[MP.shR]).distanceTo(mid(w[MP.hipL], w[MP.hipR]))) || 0.5,
    neckHead: m((w) => mid(w[MP.earL], w[MP.earR]).distanceTo(mid(w[MP.shL], w[MP.shR]))) || 0.2,
    shHalf: (m(d(MP.shL, MP.shR)) || 0.36) / 2,
    upper: m(both(MP.shL, MP.elL, MP.shR, MP.elR)) || 0.28,
    fore: m(both(MP.elL, MP.wrL, MP.elR, MP.wrR)) || 0.25,
    hand: m((w) => (w[MP.wrL].distanceTo(mid(w[MP.indexL], w[MP.pinkyL])) + w[MP.wrR].distanceTo(mid(w[MP.indexR], w[MP.pinkyR]))) / 2) || 0.08,
    hipHalf: (m(d(MP.hipL, MP.hipR)) || 0.2) / 2,
    thigh: m(both(MP.hipL, MP.knL, MP.hipR, MP.knR)) || 0.42,
    shin: m(both(MP.knL, MP.ankL, MP.knR, MP.ankR)) || 0.4,
    foot,
    ankleH: Math.min(0.075, foot * 0.55),
  };
}

/** The rest skeleton (T-pose facing +Z) for a performer's proportions. */
export function buildSkeleton(p: Proportions): SkeletonJoint[] {
  const off: Record<JointName, [number, number, number]> = {
    hip: [0, 0, 0],
    abdomen: [0, p.spine * 0.3, 0],
    chest: [0, p.spine * 0.35, 0],
    neck: [0, p.spine * 0.35, 0],
    head: [0, p.neckHead * 0.55, 0],
    lCollar: [p.shHalf * 0.15, p.spine * 0.35, 0],
    lShldr: [p.shHalf * 0.85, 0, 0],
    lForeArm: [p.upper, 0, 0],
    lHand: [p.fore, 0, 0],
    rCollar: [-p.shHalf * 0.15, p.spine * 0.35, 0],
    rShldr: [-p.shHalf * 0.85, 0, 0],
    rForeArm: [-p.upper, 0, 0],
    rHand: [-p.fore, 0, 0],
    lThigh: [p.hipHalf, 0, 0],
    lShin: [0, -p.thigh, 0],
    lFoot: [0, -p.shin, 0],
    rThigh: [-p.hipHalf, 0, 0],
    rShin: [0, -p.thigh, 0],
    rFoot: [0, -p.shin, 0],
  };
  const toe: [number, number, number] = [0, -p.ankleH, Math.sqrt(Math.max(1e-4, p.foot * p.foot - p.ankleH * p.ankleH))];
  const end: Partial<Record<JointName, [number, number, number]>> = {
    head: [0, p.neckHead * 0.45 + 0.1, 0],
    lHand: [p.hand, 0, 0], rHand: [-p.hand, 0, 0],
    lFoot: toe, rFoot: toe,
  };
  return JOINTS.map((name) => ({ name, parent: PARENT[name] ? J[PARENT[name]!] : -1, offset: off[name], ...(end[name] ? { end: end[name] } : {}) }));
}

// ── 2b. Depth from the picture ─────────────────────────────────────────────────────────────────────────

/** Rebuilds the limbs' depth from the 2D landmarks, the camera and fixed bone lengths. MediaPipe's own 3D compresses
 *  depth (a body turned 78° reads as ~35° on the benchmark), but its 2D points are good: a joint must lie on the ray
 *  through its pixel at exactly bone-length from its parent, which leaves two depths (toward or away from the
 *  camera), and MediaPipe's 3D only has to say which. Joints seen poorly keep MediaPipe's direction; the face rides
 *  with the shoulders. Works on the hip-centred track in place, using the camera estimate of the hips. */
export function liftDepth(tr: Track, width: number, height: number, hfovDeg = 65): Track {
  const n = tr.w.length;
  if (!n) return tr;
  const f = (width / 2) / Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2), cx = width / 2, cy = height / 2;
  const cam = cameraRoot(tr, width, height, hfovDeg);
  // Bone lengths from the picture: a bone is never longer on screen than it is, so its longest on-screen length
  // (95th percentile, in metres at the hips' depth) is close to its real length. MediaPipe's own 3D lengths are
  // short (upper arm 40% short on the benchmark), which would flatten every tilted bone into the picture plane.
  // Measured with the same depth estimate the rays use, so any error in that depth cancels.
  const L = (a: number, b: number) => {
    const imp: number[] = [];
    for (let i = 0; i < n; i++) {
      if (tr.missing[i] || tr.px[i][a].v < 0.6 || tr.px[i][b].v < 0.6) continue;
      imp.push(Math.hypot((tr.px[i][a].x - tr.px[i][b].x) * width, (tr.px[i][a].y - tr.px[i][b].y) * height) * -cam[i].z / f);
    }
    imp.sort((x, y) => x - y);
    const pic = imp.length >= 10 ? imp[Math.floor(imp.length * 0.95)] : 0;
    const mp = median(tr.w.filter((_, i) => !tr.missing[i]).map((w) => w[a].distanceTo(w[b]))) || 0.25;
    return Math.max(pic, mp);
  };
  // Bones walked out from the hips: [parent, child]; lengths measured once per take.
  const chain: [number, number][] = [
    [-1, MP.hipL], [-1, MP.hipR],
    [MP.hipL, MP.knL], [MP.knL, MP.ankL], [MP.ankL, MP.heelL], [MP.ankL, MP.toeL],
    [MP.hipR, MP.knR], [MP.knR, MP.ankR], [MP.ankR, MP.heelR], [MP.ankR, MP.toeR],
    [MP.hipL, MP.shL], [MP.hipR, MP.shR],
    [MP.shL, MP.elL], [MP.elL, MP.wrL], [MP.wrL, MP.indexL], [MP.wrL, MP.pinkyL], [MP.wrL, 21],
    [MP.shR, MP.elR], [MP.elR, MP.wrR], [MP.wrR, MP.indexR], [MP.wrR, MP.pinkyR], [MP.wrR, 22],
  ];
  const hipHalf = L(MP.hipL, MP.hipR) / 2;
  const lens = chain.map(([a, b]) => (a < 0 ? hipHalf : L(a, b)));
  const done = new Set(chain.map(([, b]) => b));
  const w = tr.w.map((fr) => fr.map((p) => p.clone()));
  const prevDir: (THREE.Vector3 | undefined)[] = new Array(33);
  for (let i = 0; i < n; i++) {
    if (tr.missing[i]) { prevDir.fill(undefined); continue; }
    const P = new Array<THREE.Vector3>(33);
    const hip = cam[i];
    const mpHip = mid(tr.w[i][MP.hipL], tr.w[i][MP.hipR]);
    chain.forEach(([a, b], k) => {
      const parent = a < 0 ? hip : P[a];
      const px = tr.px[i][b];
      const mpDir = tr.w[i][b].clone().sub(a < 0 ? mpHip : tr.w[i][a]);
      if (px.v < 0.5 || !parent) { P[b] = (parent ?? hip).clone().add(mpDir.normalize().multiplyScalar(lens[k])); return; }
      const ray = V((px.x * width - cx) / f, -(px.y * height - cy) / f, -1).normalize();
      const rp = ray.dot(parent), disc = rp * rp - parent.lengthSq() + lens[k] * lens[k];
      if (disc <= 0) { P[b] = ray.multiplyScalar(rp); return; } // looks longer than the bone: keep it in the parent's depth
      const t1 = rp + Math.sqrt(disc), t2 = rp - Math.sqrt(disc);
      const c1 = ray.clone().multiplyScalar(t1), c2 = ray.clone().multiplyScalar(t2);
      // Pick the root that agrees with MediaPipe's 3D (its depth sign) and continues last frame's bone direction;
      // MediaPipe's hint is near zero and noisy when a bone is almost flat to the camera.
      const d1 = c1.clone().sub(parent).normalize(), d2 = c2.clone().sub(parent).normalize(), m = mpDir.normalize();
      const pd = prevDir[b];
      const s1 = d1.dot(m) + (pd ? 1.5 * d1.dot(pd) : 0), s2 = d2.dot(m) + (pd ? 1.5 * d2.dot(pd) : 0);
      P[b] = s1 >= s2 ? c1 : c2;
      prevDir[b] = (s1 >= s2 ? d1 : d2);
    });
    const out = w[i];
    for (const k of done) out[k].copy(P[k]).sub(hip);
    // Face and the rest: MediaPipe's offsets from the shoulder midpoint, on the rebuilt shoulders.
    const shMid = mid(P[MP.shL], P[MP.shR]).sub(hip), mpSh = mid(tr.w[i][MP.shL], tr.w[i][MP.shR]);
    for (let k = 0; k < 33; k++) if (!done.has(k) && k !== MP.hipL && k !== MP.hipR) out[k].copy(shMid).add(tr.w[i][k].clone().sub(mpSh));
  }
  return { ...tr, w };
}

// ── 3. Rotations from landmark directions ───────────────────────────────────────────────────────────────

/** Rotation taking the rest frame (d0 primary, s0 secondary) onto the frame (d, s). */
function frameRot(d: THREE.Vector3, s: THREE.Vector3, d0: THREE.Vector3, s0: THREE.Vector3): THREE.Quaternion {
  const basis = (a: THREE.Vector3, b: THREE.Vector3) => {
    const x = a.clone().normalize();
    const y = b.clone().sub(x.clone().multiplyScalar(x.dot(b))).normalize();
    const z = x.clone().cross(y);
    return new THREE.Matrix4().makeBasis(x, y, z);
  };
  const M = basis(d, s), M0 = basis(d0, s0);
  return new THREE.Quaternion().setFromRotationMatrix(M.multiply(M0.transpose()));
}

/** A secondary axis perpendicular to `d`: the preferred one where it is well defined, easing to a fallback where
 *  it degenerates (a straight arm has no bend plane; a pointed foot lines up with the shin). */
function secondary(d: THREE.Vector3, preferred: THREE.Vector3, fallback: THREE.Vector3, thr = 0.3): THREE.Vector3 {
  const dn = d.clone().normalize();
  const orth = (v: THREE.Vector3) => v.clone().sub(dn.clone().multiplyScalar(dn.dot(v)));
  const p = orth(preferred), f = orth(fallback).normalize();
  const strength = p.length() / Math.max(1e-6, preferred.length());
  if (strength >= thr) return p.normalize();
  const w = strength / thr;
  if (w < 1e-3 || p.lengthSq() < 1e-12) return f;
  return p.normalize().multiplyScalar(w).add(f.multiplyScalar(1 - w)).normalize();
}

const REST = {
  up: Y, x: X, negX: X.clone().negate(), down: Y.clone().negate(), negY: Y.clone().negate(),
};

/** World rotations of every joint for one frame of landmarks (Y-up, hip-centred metres). */
export function solveFrame(w: THREE.Vector3[], skel: SkeletonJoint[]): THREE.Quaternion[] {
  const hipM = mid(w[MP.hipL], w[MP.hipR]), shM = mid(w[MP.shL], w[MP.shR]), earM = mid(w[MP.earL], w[MP.earR]);
  const spine = shM.clone().sub(hipM);
  const hipLat = w[MP.hipL].clone().sub(w[MP.hipR]);
  const shLat = w[MP.shL].clone().sub(w[MP.shR]);
  const earLat = w[MP.earL].clone().sub(w[MP.earR]);
  const chestFwd = shLat.clone().normalize().cross(spine.clone().normalize()).normalize();
  const headPos = shM.clone().add(earM.clone().sub(shM).multiplyScalar(0.55));
  const W: THREE.Quaternion[] = new Array(JOINTS.length);

  W[J.hip] = frameRot(spine, hipLat, Y, X);
  W[J.abdomen] = frameRot(spine, hipLat.clone().normalize().lerp(shLat.clone().normalize(), 0.35), Y, X);
  W[J.chest] = frameRot(spine, shLat, Y, X);
  W[J.neck] = frameRot(headPos.clone().sub(shM), shLat.clone().normalize().lerp(earLat.clone().normalize(), 0.5), Y, X);
  {
    const face = w[MP.nose].clone().sub(earM);
    const up = face.clone().cross(earLat);   // forward × left = up
    W[J.head] = frameRot(up.lengthSq() > 1e-8 ? up : spine, earLat, Y, X);
  }
  W[J.lCollar] = frameRot(w[MP.shL].clone().sub(shM), spine, X, Y);
  W[J.rCollar] = frameRot(w[MP.shR].clone().sub(shM), spine, REST.negX, Y);

  const arm = (side: 'L' | 'R') => {
    const sh = w[side === 'L' ? MP.shL : MP.shR], el = w[side === 'L' ? MP.elL : MP.elR], wr = w[side === 'L' ? MP.wrL : MP.wrR];
    const ix = w[side === 'L' ? MP.indexL : MP.indexR], pk = w[side === 'L' ? MP.pinkyL : MP.pinkyR];
    const d0 = side === 'L' ? X : REST.negX, s0 = side === 'L' ? REST.negY : Y;
    const up = el.clone().sub(sh), lo = wr.clone().sub(el);
    const bend = up.clone().cross(lo);
    const fbUp = up.clone().cross(chestFwd), fbLo = lo.clone().cross(chestFwd);
    W[J[`${side.toLowerCase()}Shldr` as JointName]] = frameRot(up, secondary(up, bend, fbUp), d0, s0);
    W[J[`${side.toLowerCase()}ForeArm` as JointName]] = frameRot(lo, secondary(lo, bend, fbLo), d0, s0);
    const hand = mid(ix, pk).sub(wr);
    W[J[`${side.toLowerCase()}Hand` as JointName]] = frameRot(hand.lengthSq() > 1e-8 ? hand : lo, secondary(hand, ix.clone().sub(pk), chestFwd), d0, Z);
  };
  arm('L'); arm('R');

  const leg = (side: 'L' | 'R') => {
    const hp = w[side === 'L' ? MP.hipL : MP.hipR], kn = w[side === 'L' ? MP.knL : MP.knR], an = w[side === 'L' ? MP.ankL : MP.ankR];
    const heel = w[side === 'L' ? MP.heelL : MP.heelR], toe = w[side === 'L' ? MP.toeL : MP.toeR];
    const s = side.toLowerCase();
    const fwd = toe.clone().sub(heel);
    const th = kn.clone().sub(hp), sh = an.clone().sub(kn), ft = toe.clone().sub(an);
    W[J[`${s}Thigh` as JointName]] = frameRot(th, secondary(th, fwd.clone().cross(th), hipLat), REST.down, X);
    W[J[`${s}Shin` as JointName]] = frameRot(sh, secondary(sh, fwd.clone().cross(sh), hipLat), REST.down, X);
    const toeRest = V(...skel[J[`${s}Foot` as JointName]].end!);
    W[J[`${s}Foot` as JointName]] = frameRot(ft, secondary(ft, kn.clone().sub(an).cross(fwd), hipLat), toeRest, X);
  };
  leg('L'); leg('R');
  return W;
}

/** World → local (parent-relative) rotations. */
export function toLocal(W: THREE.Quaternion[], skel: SkeletonJoint[]): THREE.Quaternion[] {
  return skel.map((j, i) => (j.parent < 0 ? W[i].clone() : W[j.parent].clone().invert().multiply(W[i])));
}

/** Forward kinematics: world joint positions (and end sites) with the root at `root`. */
export function fk(local: THREE.Quaternion[], skel: SkeletonJoint[], root = V()): { pos: THREE.Vector3[]; world: THREE.Quaternion[]; ends: (THREE.Vector3 | null)[] } {
  const pos: THREE.Vector3[] = [], world: THREE.Quaternion[] = [], ends: (THREE.Vector3 | null)[] = [];
  skel.forEach((j, i) => {
    if (j.parent < 0) { world[i] = local[i].clone(); pos[i] = root.clone(); }
    else {
      world[i] = world[j.parent].clone().multiply(local[i]);
      pos[i] = pos[j.parent].clone().add(V(...j.offset).applyQuaternion(world[j.parent]));
    }
    ends[i] = j.end ? pos[i].clone().add(V(...j.end).applyQuaternion(world[i])) : null;
  });
  return { pos, world, ends };
}

// ── 4. Root path, floor, contacts ───────────────────────────────────────────────────────────────────────

const SEGMENTS: [number, number][] = [
  [MP.shL, MP.hipL], [MP.shR, MP.hipR], [MP.hipL, MP.knL], [MP.hipR, MP.knR], [MP.knL, MP.ankL], [MP.knR, MP.ankR],
  [MP.shL, MP.elL], [MP.shR, MP.elR], [MP.shL, MP.shR], [MP.hipL, MP.hipR],
];

/** Where the hips are relative to the camera, from how big the body looks against how big it really is.
 *  Each segment's metric length is taken across the image plane only, so a foreshortened limb doesn't bias depth. */
export function cameraRoot(tr: Track, width: number, height: number, hfovDeg = 65): THREE.Vector3[] {
  const f = (width / 2) / Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2);
  const cx = width / 2, cy = height / 2;
  let lastZ = 3;
  return tr.w.map((w, i) => {
    const px = tr.px[i];
    let zs = 0, ws = 0;
    for (const [a, b] of SEGMENTS) {
      const d = w[a].clone().sub(w[b]);
      const Lp = Math.hypot(d.x, d.y);
      const lp = Math.hypot((px[a].x - px[b].x) * width, (px[a].y - px[b].y) * height);
      const vis = Math.min(px[a].v, px[b].v);
      if (Lp < 0.08 || lp < 6 || vis < 0.3) continue;
      const wt = Lp * Lp * vis;
      zs += (f * Lp / lp) * wt; ws += wt;
    }
    const Zc = ws > 0 ? zs / ws : lastZ;
    lastZ = Zc;
    const u = (px[MP.hipL].x + px[MP.hipR].x) / 2 * width, v = (px[MP.hipL].y + px[MP.hipR].y) / 2 * height;
    return V(((u - cx) / f) * Zc, (-(v - cy) / f) * Zc, -Zc);
  });
}

function smoothVecs(vs: THREE.Vector3[], sigma: number): THREE.Vector3[] {
  if (sigma <= 0 || vs.length < 3) return vs.map((v) => v.clone());
  const { r, k } = gaussKernel(sigma);
  return vs.map((_, i) => {
    const s = V(); let sw = 0;
    for (let o = -r; o <= r; o++) { const q = Math.min(vs.length - 1, Math.max(0, i + o)); s.addScaledVector(vs[q], k[o + r]); sw += k[o + r]; }
    return s.multiplyScalar(1 / sw);
  });
}

/** Clean a 0/1 run sequence: drop blips shorter than `minOn`, close gaps shorter than `minOff`. */
export function cleanRuns(x: number[], minOn = 3, minOff = 3): number[] {
  const y = x.slice();
  const runs = (val: number, min: number) => {
    let i = 0;
    while (i < y.length) {
      if (y[i] !== val) { i++; continue; }
      let j = i; while (j < y.length && y[j] === val) j++;
      if (j - i < min && i > 0 && j < y.length) for (let k = i; k < j; k++) y[k] = 1 - val;
      i = j;
    }
  };
  runs(0, minOff); runs(1, minOn);
  return y;
}

/** Gaussian smoothing of every joint's rotation over time (sign-aligned weighted average, renormalised). */
export function smoothRotations(locals: THREE.Quaternion[][], sigma: number): void {
  if (sigma <= 0 || locals.length < 3) return;
  const { r, k } = gaussKernel(sigma);
  const n = locals.length, nj = locals[0].length;
  const src = locals.map((L) => L.map((q) => q.clone()));
  for (let i = 0; i < n; i++) for (let j = 0; j < nj; j++) {
    const c = src[i][j];
    let x = 0, y = 0, z = 0, w = 0;
    for (let o = -r; o <= r; o++) {
      const q = src[Math.min(n - 1, Math.max(0, i + o))][j], wt = k[o + r] * (q.dot(c) < 0 ? -1 : 1);
      x += q.x * wt; y += q.y * wt; z += q.z * wt; w += q.w * wt;
    }
    locals[i][j].set(x, y, z, w).normalize();
  }
}

/** Jitter grades, mm/frame² of end-effector shake (see the quality block in solveTake). */
export const JITTER_USABLE = 4, JITTER_POOR = 9;

/** Foot locking. Each planted run is split into stretches where the ankle really stays put (within `radius` of
 *  where the stretch began); a stretch shorter than `minFrames` isn't a plant and loses its contact flag. Each
 *  kept stretch pins the ankle to its mean position, easing in and out over `ease` frames, and the thigh and shin
 *  are re-aimed with two-bone IK in the leg's own bend plane; the foot keeps its world orientation.
 *  Edits `locals` and `contacts` in place. */
/** Stretches of real stillness inside one foot's contact runs: the ankle stays within `radius` (3D) of where the
 *  stretch began, for at least `minFrames`. Shorter pieces keep their contact flag but aren't pinned.
 *  Each stretch carries its mean ankle position as the pin target. */
export function plantSpans(locals: THREE.Quaternion[][], roots: THREE.Vector3[], contacts: { l: number[]; r: number[] }, skel: SkeletonJoint[],
  s: 'l' | 'r', o: { radius?: number; minFrames?: number } = {}): { a: number; b: number; target: THREE.Vector3 }[] {
  const n = locals.length, radius = o.radius ?? 0.06, minF = o.minFrames ?? 4, iF = J[`${s}Foot` as JointName];
  const ankleAt = (i: number) => fk(locals[i], skel, roots[i]).pos[iF];
  const spans: { a: number; b: number; target: THREE.Vector3 }[] = [];
  let i = 0;
  while (i < n) {
    if (!contacts[s][i]) { i++; continue; }
    const a = i, anchor = ankleAt(i), sum = anchor.clone();
    let j = i + 1;
    while (j < n && contacts[s][j]) {
      const p = ankleAt(j);
      if (p.distanceTo(anchor) > radius) break; // in 3D: a foot rising slowly is not planted
      sum.add(p); j++;
    }
    // Too short to pin (noise broke the plant up, or the foot is pivoting): stays a contact, just isn't pinned.
    if (j - a >= minF) spans.push({ a, b: j - 1, target: sum.multiplyScalar(1 / (j - a)) });
    i = j;
  }
  return spans;
}

export function lockFeet(locals: THREE.Quaternion[][], roots: THREE.Vector3[], contacts: { l: number[]; r: number[] }, skel: SkeletonJoint[],
  o: { radius?: number; minFrames?: number; ease?: number } = {}): { l: { a: number; b: number }[]; r: { a: number; b: number }[] } {
  const pinned = { l: [] as { a: number; b: number }[], r: [] as { a: number; b: number }[] };
  const n = locals.length, radius = o.radius ?? 0.06, minF = o.minFrames ?? 4, ease = o.ease ?? 3;
  for (const s of ['l', 'r'] as const) {
    const iT = J[`${s}Thigh` as JointName], iS = J[`${s}Shin` as JointName], iF = J[`${s}Foot` as JointName];
    const spans = plantSpans(locals, roots, contacts, skel, s, o);
    pinned[s] = spans.map(({ a, b }) => ({ a, b }));
    for (const sp of spans) {
      for (let f = Math.max(0, sp.a - ease); f <= Math.min(n - 1, sp.b + ease); f++) {
        const w = f < sp.a ? 1 - (sp.a - f) / (ease + 1) : f > sp.b ? 1 - (f - sp.b) / (ease + 1) : 1;
        if (w <= 0) continue;
        const { pos, world } = fk(locals[f], skel, roots[f]);
        const H = pos[iT], K = pos[iS], A = pos[iF];
        // Pin across the floor only: the floor solve already set the height, and pulling a near-straight leg
        // a couple of cm shorter would throw the knee forward.
        const T = A.clone().lerp(V(sp.target.x, A.y, sp.target.z), w);
        const L1 = H.distanceTo(K), L2 = K.distanceTo(A);
        const dir = T.clone().sub(H); const d = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, dir.length())); dir.normalize();
        // The knee's direction: from the leg's own bend, or (leg nearly straight, bend undefined) the knee-forward
        // axis of the thigh's rotation (rest: thigh down, knee toward +Z).
        const orth = (v: THREE.Vector3) => v.sub(dir.clone().multiplyScalar(v.dot(dir)));
        const bend = orth(K.clone().sub(H)), fwd = orth(V(0, 0, 1).applyQuaternion(world[iT]));
        const pole = bend.length() > 0.05 * L1 ? bend.normalize() : fwd.normalize();
        if (pole.lengthSq() < 0.5) continue;
        const cosA = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const K2 = H.clone().addScaledVector(dir, L1 * cosA).addScaledVector(pole, L1 * sinA);
        const T2 = H.clone().addScaledVector(dir, d);
        const q1 = new THREE.Quaternion().setFromUnitVectors(K.clone().sub(H).normalize(), K2.clone().sub(H).normalize());
        const thighW = q1.clone().multiply(world[iT]);
        const shinVec = A.clone().sub(K).applyQuaternion(q1).normalize();
        const q2 = new THREE.Quaternion().setFromUnitVectors(shinVec, T2.clone().sub(K2).normalize());
        const shinW = q2.multiply(q1).multiply(world[iS]);
        const parentW = world[skel[iT].parent];
        locals[f][iT] = parentW.clone().invert().multiply(thighW);
        locals[f][iS] = thighW.clone().invert().multiply(shinW);
        locals[f][iF] = shinW.clone().invert().multiply(world[iF]);
      }
    }
  }
  return pinned;
}

/** Puts a path on a straight line along `yaw0`: the slow sideways drift (averaged over about a second) is
 *  removed, the stride's quick side-to-side sway is kept, since that sway is what keeps a planted foot still
 *  while the hips shift over it. Edits `path` in place. */
export function straightenPath(path: THREE.Vector3[], yaw0: number, fps: number): void {
  const n = path.length;
  const ahead = V(Math.sin(yaw0), 0, Math.cos(yaw0)), side = V(ahead.z, 0, -ahead.x);
  const st = path.map((r, i) => (i ? r.clone().sub(path[i - 1]) : V()));
  const lat = st.map((d) => V(d.dot(side), 0, 0));
  const drift = smoothVecs(lat, fps);
  for (let i = 1; i < n; i++) path[i].copy(path[i - 1]).addScaledVector(ahead, st[i].dot(ahead)).addScaledVector(side, lat[i].x - drift[i].x);
}

/** No take moves the hips faster than this across the floor (m/s): a sprint. */
export const MAX_SPEED = 9;

// ── 5. The whole solve ──────────────────────────────────────────────────────────────────────────────────

export interface SolveOptions {
  /** Gaussian sigma in frames; omitted = chosen from the performer's size on screen (autoSmooth). */
  smooth?: number;
  /** Median half-window for spike removal (frames); 0 turns it off. */
  despike?: number;
  /** Take the slow turning out of the hips so a walk in a circle (or a turnaround video) becomes a straight walk.
   *  The stride's own hip sway stays. */
  straighten?: boolean;
  /** Pin planted feet with leg IK (default on). */
  lockFeet?: boolean;
  /** Rebuild limb depth from the 2D landmarks and bone lengths (liftDepth). */
  lift?: boolean;
  name?: string; id?: string; rights?: MotionClip['rights']['performer'];
}

export function solveTake(take: RawTake, opts: SolveOptions = {}): MotionClip {
  const fps = take.fps;
  // Smoothing per landmark, from its own measured noise (a clean visible fist stays sharp, a hidden elbow guessed
  // by the model gets smoothed hard); a number in opts.smooth overrides it for every landmark.
  const fixed = fixLimbSwaps(take);
  take = fixed.take;
  const base0 = resample(take);
  const base = opts.lift ? liftDepth(base0, take.width, take.height, take.hfovDeg) : base0;
  const noise = landmarkNoise(base);
  const sig = opts.smooth !== undefined
    ? noise.map(() => opts.smooth!)
    : noise.map((nz) => Math.min(3.5, Math.max(0.8, (nz / NOISE_TARGET) ** 2 / (2 * Math.sqrt(Math.PI)))));
  const sigma = median(sig.slice());
  const tr = smoothTrack(despike(base, opts.despike ?? 2), sig, opts.smooth === undefined);
  const n = tr.w.length;
  if (!n) throw new Error('No performer was found in this take.');
  const props = measure(tr);
  const skel = buildSkeleton(props);

  // Rotations, with quaternion signs kept continuous.
  const locals: THREE.Quaternion[][] = [];
  for (let i = 0; i < n; i++) {
    const L = toLocal(solveFrame(tr.w[i], skel), skel);
    if (i) L.forEach((q, j) => { if (q.dot(locals[i - 1][j]) < 0) q.set(-q.x, -q.y, -q.z, -q.w); });
    locals.push(L);
  }
  // Light when Auto (the landmarks were already smoothed by speed; a second wide pass flattens fast moves again).
  smoothRotations(locals, opts.smooth === undefined ? 0.8 : sigma * 0.9);

  // Foot points relative to the hips (world orientation), from the solved skeleton itself.
  const iLF = J.lFoot, iRF = J.rFoot;
  const feet = locals.map((L) => {
    const { pos, world, ends } = fk(L, skel);
    const heel = (k: number) => pos[k].clone().add(V(0, -props.ankleH, -0.04).applyQuaternion(world[k]));
    const low = (k: number) => [pos[k], ends[k]!, heel(k)].reduce((a, b) => (b.y < a.y ? b : a));
    return { l: low(iLF), r: low(iRF), lMid: mid(ends[iLF]!, heel(iLF)), rMid: mid(ends[iRF]!, heel(iRF)) };
  });

  // Camera estimate of the hips: noisy, so heavily smoothed; it sets the floor and carries flight.
  const camRaw = cameraRoot(tr, take.width, take.height, take.hfovDeg);
  const camXZ = smoothVecs(camRaw, 3), camY = smoothVecs(camRaw, 1.5);
  const cam = camXZ.map((v, i) => V(v.x, camY[i].y, v.z));
  const footWorldY = feet.map((f, i) => cam[i].y + Math.min(f.l.y, f.r.y));
  const floor = [...footWorldY].sort((a, b) => a - b)[Math.floor(n * 0.15)] ?? 0;

  // Contacts: near the floor and nearly still (or clearly the lower, slower foot).
  const speedOf = (k: 'lMid' | 'rMid') => feet.map((f, i) => {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    if (a === b) return 0;
    // Full 3D speed: a foot leaving the floor straight up (a jump) is not planted, however still it is sideways.
    const pa = cam[a].clone().add(feet[a][k]), pb = cam[b].clone().add(feet[b][k]);
    return pa.distanceTo(pb) * fps / (b - a);
  });
  const sL = speedOf('lMid'), sR = speedOf('rMid');
  const dbg: Record<string, unknown>[] | null = (opts as { debug?: boolean }).debug ? [] : null;
  // A stance foot slides backward under the hips (or holds still); a swing foot travels forward. Forward = where
  // the hips face this frame. Relative to the hips, so it holds for any camera.
  const fwdSpeed = (k: 'lMid' | 'rMid') => feet.map((_, i) => {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    if (a === b) return 0;
    const face = V(0, 0, 1).applyQuaternion(locals[i][J.hip]).setY(0).normalize();
    return feet[b][k].clone().sub(feet[a][k]).setY(0).dot(face) * fps / (b - a);
  });
  const fwdL = fwdSpeed('lMid'), fwdR = fwdSpeed('rMid');
  // Planted (any camera): near its floor height, the lower foot or both down, and not moving forward under the hips.
  const stance = { l: [] as number[], r: [] as number[] };
  for (let i = 0; i < n; i++) {
    const hL = cam[i].y + feet[i].l.y - floor, hR = cam[i].y + feet[i].r.y - floor;
    const gap = feet[i].l.y - feet[i].r.y; // < 0: left lower
    stance.l.push(hL < 0.06 && fwdL[i] < 0.2 && gap < 0.03 ? 1 : 0);
    stance.r.push(hR < 0.06 && fwdR[i] < 0.2 && -gap < 0.03 ? 1 : 0);
    dbg?.push({ i, hL: +hL.toFixed(3), hR: +hR.toFixed(3), sL: +sL[i].toFixed(2), sR: +sR[i].toFixed(2), fL: +fwdL[i].toFixed(2), fR: +fwdR[i].toFixed(2) });
  }
  // Following camera (or treadmill): the hips stay put on screen and the planted feet seem to sweep at walking
  // speed. On a still camera a planted foot doesn't move. Judged on the planted feet themselves, so it doesn't
  // matter which way the stride points (a stride toward the camera is squashed in MediaPipe's depth).
  const hipU = tr.px.filter((_, i) => !tr.missing[i]).map((p) => (p[MP.hipL].x + p[MP.hipR].x) / 2).sort((a, b) => a - b);
  const hipScreenRange = hipU.length ? hipU[Math.floor(hipU.length * 0.95)] - hipU[Math.floor(hipU.length * 0.05)] : 1;
  const stanceSpeeds: number[] = [];
  for (let i = 0; i < n; i++) { if (stance.l[i]) stanceSpeeds.push(sL[i]); if (stance.r[i]) stanceSpeeds.push(sR[i]); }
  const tracked = hipScreenRange < 0.12 && stanceSpeeds.length > n * 0.2 && median(stanceSpeeds.slice()) > 0.4;
  // On a still camera, a foot the camera sees moving fast isn't planted (a slide, a pivot that carries the foot).
  const contacts = {
    l: cleanRuns(stance.l.map((v, i) => (v && (tracked || sL[i] < 0.8) ? 1 : 0))),
    r: cleanRuns(stance.r.map((v, i) => (v && (tracked || sR[i] < 0.8) ? 1 : 0))),
  };
  const swing = [0, 0];
  dbg?.push({ tracked, hipScreenRange: +hipScreenRange.toFixed(3), swing: swing.map((v) => +v.toFixed(2)) });
  // "Nobody planted" runs: short or low ones are noise (the lower foot stays down); real ones are flights.
  // A flight's timing comes from its height: a body in the air rises and falls on a parabola, so the peak
  // height p fixes the time aloft T = sqrt(8p/g), centred on the highest frame. That is steadier than
  // reading take-off and landing frames off smoothed contacts, which both smear outward.
  const camPeak = smoothVecs(camRaw, 0.8);
  const footLift = (k: number) => camPeak[k].y + Math.min(feet[k].l.y, feet[k].r.y) - floor;
  const flights: { t0: number; T: number }[] = [];
  {
    let i = 0;
    while (i < n) {
      if (contacts.l[i] || contacts.r[i]) { i++; continue; }
      let j = i; while (j < n && !contacts.l[j] && !contacts.r[j]) j++;
      const lo = Math.max(0, i - 4), hi = Math.min(n - 1, j + 3);
      let c = lo;
      for (let k = lo; k <= hi; k++) if (footLift(k) > footLift(c)) c = k;
      const peak = footLift(c);
      const plant = (k: number) => { (feet[k].l.y < feet[k].r.y ? contacts.l : contacts.r)[k] = 1; };
      if (j - i < Math.round(0.12 * fps) || peak < 0.04 || i === 0 || j === n) {
        if (!(i === 0 || j === n) || peak < 0.04) for (let k = i; k < j; k++) plant(k);
        i = j; continue;
      }
      // Sub-frame peak time from the parabola through the three frames around the top.
      const y0 = footLift(Math.max(0, c - 1)), y2 = footLift(Math.min(n - 1, c + 1)), den = y0 - 2 * peak + y2;
      const tc = (c + (Math.abs(den) > 1e-9 ? (0.5 * (y0 - y2)) / den : 0)) / fps;
      const T = Math.sqrt((8 * peak) / GRAVITY), t0 = tc - T / 2;
      flights.push({ t0, T });
      for (let k = lo; k <= hi; k++) {
        const t = k / fps, inAir = t > t0 && t < t0 + T;
        if (inAir) { contacts.l[k] = 0; contacts.r[k] = 0; } else if (!contacts.l[k] && !contacts.r[k]) plant(k);
      }
      i = hi + 1;
    }
  }

  // Root height: the lowest planted foot on the floor; ballistic arcs through flights.
  const rootY: number[] = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const ys: number[] = [];
    if (contacts.l[i]) ys.push(feet[i].l.y);
    if (contacts.r[i]) ys.push(feet[i].r.y);
    if (ys.length) rootY[i] = -Math.min(...ys);
  }
  for (let i = 0; i < n;) {
    if (Number.isFinite(rootY[i])) { i++; continue; }
    let j = i; while (j < n && !Number.isFinite(rootY[j])) j++;
    const a = i - 1, b = j;
    for (let k = i; k < j; k++) {
      if (a >= 0 && b < n) {
        const t = k / fps;
        const fl = flights.find((f) => t >= f.t0 - 1 / fps && t <= f.t0 + f.T + 1 / fps);
        const t0 = fl ? fl.t0 : a / fps, T = fl ? fl.T : (b - a) / fps;
        const u = Math.min(1, Math.max(0, (t - t0) / T)), tt = Math.min(T, Math.max(0, t - t0));
        rootY[k] = rootY[a] + (rootY[b] - rootY[a]) * u + 0.5 * GRAVITY * tt * (T - tt);
      } else rootY[k] = cam[k].y - floor; // a take that starts or ends in the air: hips above the floor, by the camera
    }
    i = j;
  }

  // Root across the floor: carried by the planted foot (no skating), by the camera estimate otherwise.
  const rootXZ: THREE.Vector3[] = [V()];
  for (let i = 1; i < n; i++) {
    // Both feet down: trust the stiller one (by the camera estimate) more — a foot just landing or lifting is
    // usually still moving.
    const d = V(); let c = 0;
    for (const k of ['l', 'r'] as const) {
      // Only a foot planted on both sides of the step: on a hand-off frame (one lifting, one landing) neither
      // foot was still, so the camera estimate carries that frame.
      if (contacts[k][i] && contacts[k][i - 1]) {
        const key = k === 'l' ? 'lMid' : 'rMid';
        const sp = (k === 'l' ? sL : sR)[i];
        const wt = tracked ? 1 : 1 / (sp + 0.05) ** 2;
        d.addScaledVector(feet[i - 1][key].clone().sub(feet[i][key]), wt); c += wt;
      }
    }
    const camD = cam[i].clone().sub(cam[i - 1]);
    if (c) {
      d.multiplyScalar(1 / c);
      // A "planted" foot that the camera sees moving is lifting or landing: lean on the camera estimate as it speeds up.
      const sp = Math.min(contacts.l[i] && contacts.l[i - 1] ? sL[i] : Infinity, contacts.r[i] && contacts.r[i - 1] ? sR[i] : Infinity);
      const trust = tracked ? 1 : Math.min(1, Math.max(0, 1 - (sp - 0.15) / 0.3));
      d.lerp(camD, 1 - trust);
    } else if (tracked && i > 1) d.copy(rootXZ[i - 1]).sub(rootXZ[i - 2]); // tracked camera: keep the last velocity
    else d.copy(camD);
    d.y = 0;
    // Reliability: frames where the performer wasn't really seen (filled in between detections) don't move the hips,
    // and no step is faster than a sprint, so a take that loses the performer can't fly off (benchmark: a get-up
    // from the floor, found in 27% of frames, had travelled 23 m).
    d.y = 0;
    if (tr.missing[i] || tr.vis[i] < 0.35) d.set(0, 0, 0);
    const maxStep = MAX_SPEED / fps;
    if (d.length() > maxStep) d.setLength(maxStep);
    rootXZ.push(rootXZ[i - 1].clone().add(d));
  }

  // A foot the camera sees moving faster than a shuffle isn't really planted (it is lifting or landing):
  // the root above already leaned on the camera for those frames; the contact strip should say so too.
  // Only while the other foot holds the body: in a two-footed take-off both feet push off together.
  for (let i = 0; i < n && !tracked; i++) {
    const l = contacts.l[i], r = contacts.r[i];
    if (l && r && sL[i] > 0.3 && sL[i] > sR[i]) contacts.l[i] = 0;
    else if (l && r && sR[i] > 0.3 && sR[i] > sL[i]) contacts.r[i] = 0;
  }

  // Foot locking: planted feet are pinned where they stand and the legs reach them with two-bone IK.
  // How far the performer turns over the take (slow facing changes; the stride's sway is smoothed out), and
  // optionally straightening it: each frame's hips and floor step are turned back by the turn so far.
  const yawRaw = locals.map((L) => { const f = V(0, 0, 1).applyQuaternion(L[J.hip]); return Math.atan2(f.x, f.z); });
  for (let i = 1; i < n; i++) { while (yawRaw[i] - yawRaw[i - 1] > Math.PI) yawRaw[i] -= 2 * Math.PI; while (yawRaw[i] - yawRaw[i - 1] < -Math.PI) yawRaw[i] += 2 * Math.PI; }
  const turnSm = smoothVecs(yawRaw.map((y) => V(y, 0, 0)), Math.round(0.5 * fps)).map((v) => v.x);
  const turnDeg = THREE.MathUtils.radToDeg(Math.max(...turnSm) - Math.min(...turnSm));
  if (opts.straighten) {
    const up = V(0, 1, 0);
    const steps0 = rootXZ.map((r, i) => (i ? r.clone().sub(rootXZ[i - 1]) : V()));
    for (let i = 0; i < n; i++) {
      const back = new THREE.Quaternion().setFromAxisAngle(up, -(turnSm[i] - turnSm[0]));
      locals[i][J.hip] = back.clone().multiply(locals[i][J.hip]);
      if (i) rootXZ[i].copy(rootXZ[i - 1]).add(steps0[i].applyQuaternion(back));
    }
  }

  // The floor path is built from frame-to-frame foot motion, so landmark jitter adds up into a wandering pelvis:
  // smooth it (feet stay put regardless: the lock below pins them and the legs take up the difference).
  // Smooth the steps, not the positions, so the distance covered survives (smoothing positions shortens the ends).
  const steps = rootXZ.map((r, i) => (i ? r.clone().sub(rootXZ[i - 1]) : V()));
  const calm = smoothVecs(steps, 1.5);
  for (let i = 1; i < n; i++) rootXZ[i].copy(rootXZ[i - 1]).add(calm[i]).setY(0);
  let rootsV = rootXZ.map((r, i) => V(r.x, rootY[i], r.z));
  const lockOpts: { radius?: number } = {};
  let pins: { l: { a: number; b: number }[]; r: { a: number; b: number }[] } | null = null;
  if (opts.lockFeet !== false) {
    // Re-anchor the hips on the pins: while a foot is planted, the hips sit at (pin − that foot's offset from the
    // hips), so landmark jitter can't accumulate into a wandering pelvis the way summed foot deltas do. The
    // correction is eased across unplanted frames (flight, hand-offs) so the path stays continuous.
    // Stillness radius grows with how noisy the ankles still are (MediaPipe's depth axis especially).
    const ankleNoise = Math.max(residualNoise(noise[MP.ankL], sig[MP.ankL]), residualNoise(noise[MP.ankR], sig[MP.ankR])) / 1000;
    lockOpts.radius = Math.max(0.06, 4 * ankleNoise);
    const spans = { l: plantSpans(locals, rootsV, contacts, skel, 'l', lockOpts), r: plantSpans(locals, rootsV, contacts, skel, 'r', lockOpts) };
    const off: (THREE.Vector3 | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const c = V(); let k = 0;
      for (const sd of ['l', 'r'] as const) {
        const sp = spans[sd].find((x) => x.a <= i && i <= x.b);
        if (!sp) continue;
        const rel = fk(locals[i], skel).pos[sd === 'l' ? J.lFoot : J.rFoot];
        c.add(V(sp.target.x - rel.x, 0, sp.target.z - rel.z)); k++;
      }
      if (k) off[i] = c.multiplyScalar(1 / k).sub(V(rootXZ[i].x, 0, rootXZ[i].z));
    }
    const known = off.map((o, i) => (o ? i : -1)).filter((i) => i >= 0);
    if (known.length) {
      for (let i = 0; i < n; i++) {
        if (off[i]) continue;
        const nx = known.find((k) => k > i), pv = [...known].reverse().find((k) => k < i);
        off[i] = pv === undefined ? off[nx!]!.clone() : nx === undefined ? off[pv]!.clone() : off[pv]!.clone().lerp(off[nx]!, (i - pv) / (nx - pv));
      }
      const sm = smoothVecs(off as THREE.Vector3[], 1.5);
      for (let i = 0; i < n; i++) rootXZ[i].add(sm[i]).setY(0);
      rootsV = rootXZ.map((r, i) => V(r.x, rootY[i], r.z));
    }
    if (opts.straighten) {
      // Straightened: each step keeps only its part along the starting direction, so the cycle runs in a line (the
      // sideways part is what's left of the turn and of depth noise when the back or front faces the camera). Done
      // after the hips are anchored and before the feet are pinned, so the pins sit on the final path.
      straightenPath(rootXZ, turnSm[0], fps);
      rootsV = rootXZ.map((r, i) => V(r.x, rootY[i], r.z));
    }
    pins = lockFeet(locals, rootsV, contacts, skel, lockOpts);
  } else if (opts.straighten) {
    straightenPath(rootXZ, turnSm[0], fps);
    rootsV = rootXZ.map((r, i) => V(r.x, rootY[i], r.z));
  }

  // Quality.
  const occlusion = tr.missing.reduce((s, m, i) => s + (m || tr.vis[i] < 0.45 ? 1 : 0), 0) / n;
  // Shake: landmark noise left after smoothing, mm, averaged over wrists, ankles, nose, elbows and knees
  // (see landmarkNoise / residualNoise).
  const probe = [15, 16, 27, 28, 0, 13, 14, 25, 26];
  const jitter = probe.reduce((acc, k) => acc + residualNoise(noise[k], sig[k]), 0) / probe.length;
  // Foot slide as the final skeleton shows it: a planted ankle's travel across the floor, cm per second.
  let slide = 0, sc = 0;
  const ankle = (i: number, k: 'l' | 'r') => fk(locals[i], skel, rootsV[i]).pos[k === 'l' ? J.lFoot : J.rFoot].setY(0);
  // Pinned frames when feet were locked (what the lock failed to hold); otherwise every planted frame.
  const counts = (k: 'l' | 'r', i: number) => (pins ? pins[k].some((p) => p.a < i && i <= p.b) : contacts[k][i] && contacts[k][i - 1]);
  for (let i = 1; i < n; i++) for (const k of ['l', 'r'] as const) {
    if (!counts(k, i)) continue;
    slide += ankle(i, k).distanceTo(ankle(i - 1, k)) * fps * 100; sc++;
  }
  const skate = sc ? slide / sc : 0;
  const notes: string[] = [];
  if (occlusion > 0.5) notes.push(`The performer was found in only ${Math.round((1 - occlusion) * 100)}% of the take (lying down, curled up, or out of frame): the motion between sightings is guessed.`);
  else if (occlusion > 0.15) notes.push(`The performer was hidden or out of frame in ${Math.round(occlusion * 100)}% of the take.`);
  if (jitter > JITTER_POOR) notes.push('The motion is shaky: more light, a steadier camera, a plainer background, or standing closer will help.');
  else if (jitter > JITTER_USABLE) notes.push('A little shaky: try more smoothing.');
  if (skate > 3) notes.push('The feet slide while both are planted: keep the whole body, feet included, in the picture.');
  // Frames where the model actually found the performer (short gaps get filled in and don't count as hidden).
  const foundShare = take.frames.filter(Boolean).length / Math.max(1, take.frames.length);
  if (foundShare < 0.5 && occlusion <= 0.5) notes.push(`The performer was found in only ${Math.round(foundShare * 100)}% of the frames; the rest is filled in.`);
  const grade: TakeQuality['grade'] = occlusion > 0.35 || foundShare < 0.5 || jitter > JITTER_POOR ? 'poor' : occlusion > 0.15 || foundShare < 0.85 || jitter > JITTER_USABLE || skate > 3 ? 'usable' : 'good';

  const rot: number[] = [], root: number[] = [];
  locals.forEach((L, i) => {
    L.forEach((q) => rot.push(+q.x.toFixed(5), +q.y.toFixed(5), +q.z.toFixed(5), +q.w.toFixed(5)));
    root.push(+rootXZ[i].x.toFixed(4), +rootY[i].toFixed(4), +rootXZ[i].z.toFixed(4));
  });
  return {
    format: 'plajah.motion', version: 1,
    id: opts.id ?? `mc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: opts.name ?? take.source.label,
    createdAt: Date.now(), fps, frames: n,
    skeleton: { id: 'plajah.biped.v1', joints: skel },
    rot, root, contacts,
    seen: tr.vis.map((v, i) => (tr.missing[i] ? 0 : +v.toFixed(2))),
    quality: { occlusion: +occlusion.toFixed(3), jitter: +jitter.toFixed(2), skate: +skate.toFixed(2), grade, notes },
    stats: (() => {
      const onsets = (a: number[]) => a.reduce((k, v, i) => k + (v && !a[i - 1] ? 1 : 0), 0);
      // Path length over half-second steps, so frame-to-frame jitter doesn't count as distance.
      let path = 0; const hop = Math.max(1, Math.round(fps / 2));
      for (let i = hop; i < n; i += hop) path += rootXZ[i].distanceTo(rootXZ[i - hop]);
      const plantedFrames = contacts.l.reduce((a, b) => a + b, 0) + contacts.r.reduce((a, b) => a + b, 0);
      const pinnedFrames = pins ? [...pins.l, ...pins.r].reduce((a, p) => a + p.b - p.a + 1, 0) : 0;
      const ys = rootY.filter(Number.isFinite);
      return {
        found: +(take.frames.filter(Boolean).length / Math.max(1, take.frames.length)).toFixed(3),
        followedCamera: tracked,
        limbSwapsFixed: fixed.swaps,
        plants: { l: onsets(contacts.l), r: onsets(contacts.r) },
        airborne: +(contacts.l.filter((x, i) => !x && !contacts.r[i]).length / n).toFixed(3),
        bothFeet: +(contacts.l.filter((x, i) => x && contacts.r[i]).length / n).toFixed(3),
        netSpeed: +(rootXZ[n - 1].distanceTo(rootXZ[0]) / (n / fps)).toFixed(2),
        pathSpeed: +(path / (n / fps)).toFixed(2),
        hipHeight: [+Math.min(...ys).toFixed(2), +Math.max(...ys).toFixed(2)] as [number, number],
        pinned: +(plantedFrames ? Math.min(1, pinnedFrames / plantedFrames) : 0).toFixed(3),
        turnDeg: Math.round(turnDeg),
        straightened: !!opts.straighten,
      };
    })(),
    source: { ...take.source, width: take.width, height: take.height, durationSec: +(n / fps).toFixed(3) },
    rights: { performer: opts.rights ?? 'unknown' },
    moves: [],
    ...(dbg ? { debug: dbg } : {}),
  } as MotionClip;
}

/** Local rotations of one frame of a clip. */
export function clipFrame(clip: MotionClip, f: number): { local: THREE.Quaternion[]; root: THREE.Vector3 } {
  const J = clip.skeleton.joints.length, o = f * J * 4, r = clip.rot;
  const local = clip.skeleton.joints.map((_, j) => new THREE.Quaternion(r[o + j * 4], r[o + j * 4 + 1], r[o + j * 4 + 2], r[o + j * 4 + 3]));
  return { local, root: V(clip.root[f * 3], clip.root[f * 3 + 1], clip.root[f * 3 + 2]) };
}

/** Live preview: rotations for one landmark frame without a root path (the hips stay put). */
export function solveLive(world: WorldPoint[], skel: SkeletonJoint[]): THREE.Quaternion[] {
  return toLocal(solveFrame(world.map(toYUp), skel), skel);
}

export { toYUp };
