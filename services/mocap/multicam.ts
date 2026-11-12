// Two-camera motion capture: two phones film the same performer from different sides (about 90° apart is best),
// each recording on its own. No markers, no calibration board, no network: everything is worked out afterwards
// from the two takes.
//
//   1. Sync      the two recordings line up by their sound: one clap at the start, heard by both phones, lines
//                them up to a few milliseconds. Movement is a last resort (right only about a third of the time on
//                fight takes in the benchmark), used only when it is unusually sure.
//   2. Calibrate where camera B stands relative to camera A, from the performer's body: MediaPipe's 3D body in
//                each view is the same body turned by the angle between the cameras (Horn's method); each camera's
//                distance comes from fitting that body to its picture; the lens from what makes the two views agree.
//   3. Fuse      every landmark is triangulated from both pictures (services/cameraRig). A limb hidden behind the
//                body in one view (MediaPipe guesses those and still calls them seen) counts for little there.
//
// The result is an ordinary RawTake (camera A's picture, fused 3D), so the solver, BVH export and games are unchanged.
//
//   const off = (await syncByAudio(fileA, fileB)) ?? syncByMotion(takeA, takeB);
//   const { take, report } = twoCamera(takeA, takeB, { offset: off.offset });
import { triangulate, type Calibration, type Vec3 } from '../cameraRig/rig';
import type { RawFrame, RawTake } from './types';

// ── Small maths ─────────────────────────────────────────────────────────────────────────────────────────────
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const mulM = (R: number[], p: V): V => [R[0] * p[0] + R[1] * p[1] + R[2] * p[2], R[3] * p[0] + R[4] * p[1] + R[5] * p[2], R[6] * p[0] + R[7] * p[1] + R[8] * p[2]];
const transpose = (R: number[]) => [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
/** Angle of a rotation matrix, degrees. */
export const rotAngleDeg = (R: number[]) => (Math.acos(Math.max(-1, Math.min(1, (R[0] + R[4] + R[8] - 1) / 2))) * 180) / Math.PI;

/** Largest-eigenvalue eigenvector of a symmetric 4×4 (Jacobi). */
function topEigen4(N: number[][]): number[] {
  const A = N.map((r) => [...r]), Vm = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) off += A[i][j] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 4; p++) for (let q = p + 1; q < 4; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 4; k++) { const a = A[k][p], b = A[k][q]; A[k][p] = c * a - s * b; A[k][q] = s * a + c * b; }
      for (let k = 0; k < 4; k++) { const a = A[p][k], b = A[q][k]; A[p][k] = c * a - s * b; A[q][k] = s * a + c * b; }
      for (let k = 0; k < 4; k++) { const a = Vm[k][p], b = Vm[k][q]; Vm[k][p] = c * a - s * b; Vm[k][q] = s * a + c * b; }
    }
  }
  let best = 0; for (let i = 1; i < 4; i++) if (A[i][i] > A[best][best]) best = i;
  return [Vm[0][best], Vm[1][best], Vm[2][best], Vm[3][best]];
}

/** The rotation R (row-major 3×3) that best turns points `src` onto `dst` (least squares, weighted; Horn 1987). */
export function bestRotation(src: V[], dst: V[], w: number[] = src.map(() => 1)): number[] {
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  src.forEach((b, i) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += w[i] * b[r] * dst[i][c]; });
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const q = topEigen4([
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ]);
  const [a, b, c, d] = q;
  return [
    a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c),
    2 * (b * c + a * d), a * a - b * b + c * c - d * d, 2 * (c * d - a * b),
    2 * (b * d - a * c), 2 * (c * d + a * b), a * a - b * b - c * c + d * d,
  ];
}

// ── Takes ───────────────────────────────────────────────────────────────────────────────────────────────────
/** MediaPipe world point (x right, y down, z away) → camera axes (x right, y up, z toward the camera). */
const cam3 = (q: { x: number; y: number; z: number }): V => [q.x, -q.y, -q.z];
const fromCam3 = (p: V, v: number) => ({ x: p[0], y: -p[1], z: -p[2], v });
const timeOf = (t: RawTake, i: number) => t.frames[i]?.t ?? i / (t.fps || 30);
const ok = (f: RawFrame | null | undefined): f is RawFrame => !!f && f.pts.length === 33 && f.world.length === 33;

/** Body joints used for sync and calibration (shoulders, elbows, wrists, hips, knees, ankles). */
const BODY = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const TORSO = [11, 12, 23, 24];

/** Frame of `t` at time `s` (linear between neighbours; null if no found frame within half a frame). */
function sampleAt(t: RawTake, s: number): RawFrame | null {
  const fps = t.fps || 30, n = t.frames.length;
  const x = s * fps, i0 = Math.floor(x), a = x - i0;
  const f0 = t.frames[i0], f1 = t.frames[i0 + 1];
  if (i0 < -1 || i0 >= n) return null;
  if (ok(f0) && ok(f1)) {
    const L = (p: number, q: number) => p + (q - p) * a;
    return {
      t: s,
      pts: f0.pts.map((p, k) => ({ x: L(p.x, f1.pts[k].x), y: L(p.y, f1.pts[k].y), v: Math.min(p.v, f1.pts[k].v) })),
      world: f0.world.map((p, k) => ({ x: L(p.x, f1.world[k].x), y: L(p.y, f1.world[k].y), z: L(p.z, f1.world[k].z), v: Math.min(p.v, f1.world[k].v) })),
    };
  }
  const near = a < 0.5 ? f0 : f1;
  return ok(near) ? near : ok(f0) ? f0 : ok(f1) ? f1 : null;
}

// ── 1. Sync ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface PairSync {
  /** Seconds to add to a time in take B to get the same moment in take A. */
  offset: number;
  /** Peak correlation 0..1 (how alike the two signals are at that offset). */
  score: number;
  /** Peak over the next-best peak (well over 1 = unambiguous). */
  margin: number;
  method: 'audio' | 'motion' | 'given';
}

/** Lag of best correlation between two evenly sampled multi-channel signals (rows = time). */
function bestLag(A: number[][], B: number[][], dt: number, maxLag: number, minOverlap: number): { lag: number; score: number; margin: number } {
  const K = Math.round(maxLag / dt), need = Math.round(minOverlap / dt);
  const scores: number[] = [];
  for (let k = -K; k <= K; k++) {
    // A[i] against B[i - k]
    let sab = 0, saa = 0, sbb = 0, n = 0;
    for (let i = Math.max(0, k); i < Math.min(A.length, B.length + k); i++) {
      const a = A[i], b = B[i - k];
      for (let c = 0; c < a.length; c++) { if (!Number.isFinite(a[c]) || !Number.isFinite(b[c])) continue; sab += a[c] * b[c]; saa += a[c] * a[c]; sbb += b[c] * b[c]; n++; }
    }
    scores.push(n / Math.max(1, A[0]?.length ?? 1) >= need && saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : -1);
  }
  let bi = 0; for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bi]) bi = i;
  // Next-best peak at least a quarter second away.
  const away = Math.round(0.25 / dt);
  let second = 1e-6; scores.forEach((s, i) => { if (Math.abs(i - bi) > away && s > second) second = s; });
  // Sub-sample refinement (parabola through the peak and its neighbours).
  let frac = 0;
  if (bi > 0 && bi < scores.length - 1) { const [l, c, r] = [scores[bi - 1], scores[bi], scores[bi + 1]]; const den = l - 2 * c + r; if (den < 0) frac = (0.5 * (l - r)) / den; }
  return { lag: (bi - K + frac) * dt, score: Math.max(0, scores[bi]), margin: scores[bi] / second };
}

/** Standardise each channel (zero mean, unit spread), leaving gaps as NaN. */
function standardise(rows: number[][]): number[][] {
  const C = rows[0]?.length ?? 0;
  for (let c = 0; c < C; c++) {
    const xs = rows.map((r) => r[c]).filter(Number.isFinite);
    if (!xs.length) continue;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length, s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
    for (const r of rows) r[c] = (r[c] - m) / s;
  }
  return rows;
}

const angle = (u: V, v: V) => Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / ((len(u) * len(v)) || 1))));
/** Body measures that read the same from any camera: elbow, knee and hip bend, how far each arm is raised, and
 *  the hands' and feet's distance apart (in torso lengths). */
function poseSignature(f: RawFrame): number[] {
  const p = (j: number) => cam3(f.world[j]);
  const mid = (a: number, b: number): V => { const x = p(a), y = p(b); return [(x[0] + y[0]) / 2, (x[1] + y[1]) / 2, (x[2] + y[2]) / 2]; };
  const up = sub(mid(11, 12), mid(23, 24)), torso = len(up) || 1;
  const bend = (a: number, b: number, c: number) => angle(sub(p(b), p(a)), sub(p(c), p(b)));
  return [
    bend(11, 13, 15), bend(12, 14, 16), bend(23, 25, 27), bend(24, 26, 28),
    angle(up, sub(p(25), p(23))), angle(up, sub(p(26), p(24))),
    angle(up, sub(p(13), p(11))), angle(up, sub(p(14), p(12))),
    len(sub(p(15), p(16))) / torso, len(sub(p(27), p(28))) / torso,
  ];
}

/** Heights in the picture: phones stand roughly level, so how high each hand, elbow, knee, foot and the head sit
 *  above the hips (in torso lengths) reads about the same from every side; so does the hips' own bob. */
function heightSignature(f: RawFrame, H: number, W: number): number[] {
  const y = (j: number) => f.pts[j].y * H, x = (j: number) => f.pts[j].x * W;
  const hy = (y(23) + y(24)) / 2, sy = (y(11) + y(12)) / 2;
  const torso = Math.hypot((x(11) + x(12)) / 2 - (x(23) + x(24)) / 2, sy - hy) || 1;
  return [...[15, 16, 13, 14, 25, 26, 27, 28, 0].map((j) => (hy - y(j)) / torso), -hy / torso];
}

/** Line two takes up by the performer's movement: heights in the picture (and joint bends, which read the same from
 *  any camera) rise and fall together in both recordings at the right offset. Sound is far more reliable: this is
 *  the fallback, and it says so (low score) when it can't tell. */
export function syncByMotion(a: RawTake, b: RawTake, o: { maxLag?: number; dt?: number; use?: 'height' | 'angles' | 'both' } = {}): PairSync {
  const dt = o.dt ?? 1 / 30;
  const signal = (t: RawTake) => {
    const dur = timeOf(t, t.frames.length - 1), n = Math.max(2, Math.floor(dur / dt));
    const use = o.use ?? 'height';
    const sig = (f: RawFrame) => use === 'angles' ? poseSignature(f) : use === 'height' ? heightSignature(f, t.height || 720, t.width || 1280) : [...poseSignature(f), ...heightSignature(f, t.height || 720, t.width || 1280)];
    const raw = Array.from({ length: n }, (_, i) => { const f = sampleAt(t, i * dt); return f ? sig(f) : null; });
    // Light smoothing (5 samples), then each measure and its rate of change as channels.
    const C = raw.find(Boolean)?.length ?? 1, sm = raw.map((_, i) => Array.from({ length: C }, (_, c) => {
      const w: number[] = []; for (let k = -2; k <= 2; k++) { const r = raw[i + k]; if (r && Number.isFinite(r[c])) w.push(r[c]); }
      return w.length >= 3 ? w.reduce((x, y) => x + y, 0) / w.length : NaN;
    }));
    return standardise(sm.map((r, i) => [...r, ...r.map((x, c) => (i > 0 ? x - sm[i - 1][c] : NaN)).map((x) => x * 4)]));
  };
  const r = bestLag(signal(a), signal(b), dt, o.maxLag ?? 8, 2);
  return { offset: r.lag, score: r.score, margin: r.margin, method: 'motion' };
}

/** Line two recordings up by their sound (onset envelopes; a clap makes it exact). Browser only. Null when either
 *  file has no usable sound or the match is weak. */
export async function syncByAudio(a: Blob, b: Blob, o: { maxLag?: number } = {}): Promise<PairSync | null> {
  const AC = (globalThis as unknown as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
  if (!AC) return null;
  const rate = 8000, hop = 1 / 200; // 5 ms steps
  const env = async (blob: Blob) => {
    try {
      const ctx = new AC(1, rate, rate);
      const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
      const ch = buf.getChannelData(0), step = Math.round(buf.sampleRate * hop);
      const e: number[] = [];
      for (let i = 0; i + step <= ch.length; i += step) { let s = 0; for (let k = i; k < i + step; k++) s += ch[k] * ch[k]; e.push(Math.log(1e-6 + s / step)); }
      // Onsets: rises in loudness only.
      return standardise(e.map((x, i) => [i ? Math.max(0, x - e[i - 1]) : 0]));
    } catch { return null; }
  };
  const [ea, eb] = await Promise.all([env(a), env(b)]);
  if (!ea || !eb || ea.length < 200 || eb.length < 200) return null;
  // Only trust sound with at least one sharp event (a clap, a stamp, a door) well clear of the background in both.
  const sharp = (e: number[][]) => Math.max(...e.map((r) => r[0]));
  if (sharp(ea) < 8 || sharp(eb) < 8) return null;
  const r = bestLag(ea, eb, hop, o.maxLag ?? 8, 1);
  if (r.score < 0.2 || r.margin < 1.15) return null;
  return { offset: r.lag, score: r.score, margin: r.margin, method: 'audio' };
}

// ── 2. Calibrate ────────────────────────────────────────────────────────────────────────────────────────────
export interface PairCalibration {
  a: Calibration; b: Calibration;
  /** Long-side field of view used for each camera, degrees. */
  fovDeg: [number, number];
  /** Angle between the two cameras around the performer, degrees, and their distance apart in metres. */
  angleDeg: number; baselineM: number;
  /** Mean reprojection error of the fused landmarks, as a share of the picture width. */
  reproj: number;
  /** Frames both cameras saw the performer in. */
  shared: number;
  /** Plain-language warnings (cameras too close in angle, facing each other, few shared frames…). */
  notes: string[];
}

const focal = (t: RawTake, fovLong: number) => {
  const W = t.width || 1280, H = t.height || 720, longSide = Math.max(W, H);
  return (longSide / 2) / Math.tan((fovLong * Math.PI) / 360);
};

/** Where the hips are in this camera (camera axes), given the body's 3D shape and its picture: linear least
 *  squares on the projection equations, the body's own orientation taken as MediaPipe gave it. */
function hipsInCamera(fr: RawFrame, W: number, H: number, f: number): V | null {
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = [0, 0, 0];
  const add = (r: V, k: number, w: number) => { for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i * 3 + j] += w * r[i] * r[j]; b[i] += w * r[i] * k; } };
  const cx = W / 2, cy = H / 2;
  for (const j of BODY) {
    const P = cam3(fr.world[j]), u = fr.pts[j].x * W, v = fr.pts[j].y * H, w = fr.pts[j].v;
    if (w < 0.3) continue;
    // f·Tx + (u−cx)·Tz = −(u−cx)·Pz − f·Px ;  f·Ty − (v−cy)·Tz = (v−cy)·Pz − f·Py
    add([f, 0, u - cx], -(u - cx) * P[2] - f * P[0], w);
    add([0, f, -(v - cy)], (v - cy) * P[2] - f * P[1], w);
  }
  const [a, bb, c, d, e, g, h, i, k] = A;
  const det = a * (e * k - g * i) - bb * (d * k - g * h) + c * (d * i - e * h);
  if (Math.abs(det) < 1e-9) return null;
  const inv = [e * k - g * i, c * i - bb * k, bb * g - c * e, g * h - d * k, a * k - c * h, c * d - a * g, d * i - e * h, bb * h - a * i, a * e - bb * d];
  const T = [0, 1, 2].map((r) => (inv[r * 3] * b[0] + inv[r * 3 + 1] * b[1] + inv[r * 3 + 2] * b[2]) / det) as V;
  return T[2] < -0.3 ? T : null; // in front of the camera
}

interface Pair { i: number; fa: RawFrame; fb: RawFrame }
function pairs(a: RawTake, b: RawTake, offset: number): Pair[] {
  const out: Pair[] = [];
  a.frames.forEach((fa, i) => { if (!ok(fa)) return; const fb = sampleAt(b, timeOf(a, i) - offset); if (fb) out.push({ i, fa, fb }); });
  return out;
}

/** Camera B's place relative to camera A from the performer's body, for given lenses. */
function calibrateWith(a: RawTake, b: RawTake, P: Pair[], fovA: number, fovB: number) {
  const Wa = a.width || 1280, Ha = a.height || 720, Wb = b.width || 1280, Hb = b.height || 720;
  const fa = focal(a, fovA), fb = focal(b, fovB);
  // Rotation B camera → A camera: the same body in both cameras' axes (torso and limbs, weighted by visibility).
  const src: V[] = [], dst: V[] = [], w: number[] = [];
  for (const { fa: x, fb: y } of P) {
    const ha = cam3(x.world[23]), hb = cam3(y.world[23]), ha2 = cam3(x.world[24]), hb2 = cam3(y.world[24]);
    const ca: V = [(ha[0] + ha2[0]) / 2, (ha[1] + ha2[1]) / 2, (ha[2] + ha2[2]) / 2], cb: V = [(hb[0] + hb2[0]) / 2, (hb[1] + hb2[1]) / 2, (hb[2] + hb2[2]) / 2];
    for (const j of BODY) {
      const vw = Math.min(x.pts[j].v, y.pts[j].v) * (TORSO.includes(j) ? 2 : 1);
      if (vw < 0.3) continue;
      src.push(sub(cam3(y.world[j]), cb)); dst.push(sub(cam3(x.world[j]), ca)); w.push(vw);
    }
  }
  if (src.length < 24) return null;
  let R = bestRotation(src, dst, w);
  // Drop the worst-fitting third (fast moves, tracker slips) and fit again.
  const res = src.map((p, i) => len(sub(mulM(R, p), dst[i])));
  const cut = median(res) * 1.5;
  const keep = res.map((r) => r <= cut);
  R = bestRotation(src.filter((_, i) => keep[i]), dst.filter((_, i) => keep[i]), w.filter((_, i) => keep[i]));
  const Rt = transpose(R); // A camera → B camera
  // Translation: hips in each camera, per frame; B's offset is the median of T_B − Rᵀ·T_A.
  const tx: number[] = [], ty: number[] = [], tz: number[] = [];
  for (const { fa: x, fb: y } of P) {
    const TA = hipsInCamera(x, Wa, Ha, fa), TB = hipsInCamera(y, Wb, Hb, fb);
    if (!TA || !TB) continue;
    const r = mulM(Rt, TA); tx.push(TB[0] - r[0]); ty.push(TB[1] - r[1]); tz.push(TB[2] - r[2]);
  }
  if (tx.length < 5) return null;
  const t: Vec3 = [median(tx), median(ty), median(tz)];
  const ca: Calibration = { w: Wa, h: Ha, f: fa, cx: Wa / 2, cy: Ha / 2, R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };
  const cb: Calibration = { w: Wb, h: Hb, f: fb, cx: Wb / 2, cy: Hb / 2, R: Rt, t };
  // How well the two views agree once triangulated (sampled frames, body joints).
  let err = 0, n = 0;
  const step = Math.max(1, Math.floor(P.length / 60));
  for (let k = 0; k < P.length; k += step) {
    const { fa: x, fb: y } = P[k];
    for (const j of BODY) {
      if (x.pts[j].v < 0.5 || y.pts[j].v < 0.5) continue;
      const tri = triangulate([{ c: ca, u: x.pts[j].x * Wa, v: x.pts[j].y * Ha }, { c: cb, u: y.pts[j].x * Wb, v: y.pts[j].y * Hb }]);
      if (tri) { err += tri.err / Wa; n++; }
    }
  }
  return { a: ca, b: cb, reproj: n ? err / n : 1 };
}

/** Work out where camera B stands relative to camera A (camera A's axes are the world). */
export function calibratePair(a: RawTake, b: RawTake, offset: number, o: { fovDeg?: number | [number, number] } = {}): PairCalibration | null {
  const P = pairs(a, b, offset);
  const notes: string[] = [];
  if (P.length < 30) return null;
  let best: { a: Calibration; b: Calibration; reproj: number } | null = null, fov: [number, number] = [69, 69];
  if (o.fovDeg !== undefined) {
    fov = Array.isArray(o.fovDeg) ? o.fovDeg : [o.fovDeg, o.fovDeg];
    best = calibrateWith(a, b, P, fov[0], fov[1]);
  } else {
    // The lens: the field of view (shared by both phones, long side) that makes the two views agree best.
    // Phones' main cameras are about 65–80°; the search runs wider in case of a zoomed or wide lens.
    const tryFov = (d: number) => { const c = calibrateWith(a, b, P, d, d); if (c && (!best || c.reproj < best.reproj)) { best = c; fov = [d, d]; } };
    for (let d = 40; d <= 100; d += 5) tryFov(d);
    const d0 = fov[0];
    for (let d = d0 - 4; d <= d0 + 4; d += 1) tryFov(d);
  }
  if (!best) return null;
  const b0 = best as { a: Calibration; b: Calibration; reproj: number };
  const angleDeg = rotAngleDeg(b0.b.R);
  const centreB = mulM(transpose(b0.b.R), [-b0.b.t[0], -b0.b.t[1], -b0.b.t[2]]);
  if (angleDeg < 30) notes.push(`The cameras are only ${Math.round(angleDeg)}° apart around the performer; about 90° apart gives the best depth.`);
  if (angleDeg > 150) notes.push('The cameras face each other; they see the same limbs hidden. Move one round to the side (about 90° apart).');
  if (P.length < 90) notes.push('The two recordings overlap for under 3 seconds of shared view.');
  if (b0.reproj > 0.02) notes.push('The two views disagree more than expected: check both recordings show the same take, whole body in frame.');
  return { a: b0.a, b: b0.b, fovDeg: fov, angleDeg, baselineM: len(centreB), reproj: b0.reproj, shared: P.length, notes };
}

// ── 3. Fuse ─────────────────────────────────────────────────────────────────────────────────────────────────
const LIMB = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 30, 31, 32];

/** Is pixel (u, v) inside the torso's quadrilateral (shoulders and hips, widened a little) in this picture? */
function inTorso(fr: RawFrame, W: number, H: number, u: number, v: number): boolean {
  const q = [11, 12, 24, 23].map((k) => [fr.pts[k].x * W, fr.pts[k].y * H]);
  const cx = q.reduce((s, p) => s + p[0], 0) / 4, cy = q.reduce((s, p) => s + p[1], 0) / 4;
  const poly = q.map(([x, y]) => [cx + (x - cx) * 1.25, cy + (y - cy) * 1.1]);
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export interface TwoCameraReport {
  sync: PairSync; calibration: PairCalibration;
  /** Share of camera A's frames whose 3D came from both cameras. */
  fused: number;
  /** Limb points down-weighted in a view because they were hidden behind the body there. */
  hiddenFixes: number;
}

/** One take from two: camera A's picture, 3D triangulated from both cameras (hip-centred, MediaPipe's axes). */
export function fuseTakes(a: RawTake, b: RawTake, offset: number, cal: PairCalibration): { take: RawTake; fused: number; hiddenFixes: number } {
  const Wa = a.width || 1280, Ha = a.height || 720, Wb = b.width || 1280, Hb = b.height || 720;
  let fused = 0, hiddenFixes = 0;
  const frames = a.frames.map((fa, i): RawFrame | null => {
    const fb = sampleAt(b, timeOf(a, i) - offset);
    if (!ok(fa)) {
      if (!fb) return fa ?? null;
      return null; // seen only by B: a gap here (the solver bridges short gaps)
    }
    if (!fb) return fa;
    const views = (j: number, wa: number, wb: number) => [
      { c: cal.a, u: fa.pts[j].x * Wa, v: fa.pts[j].y * Ha, w: wa },
      { c: cal.b, u: fb.pts[j].x * Wb, v: fb.pts[j].y * Hb, w: wb },
    ];
    const pts3: (V | null)[] = [];
    for (let j = 0; j < 33; j++) {
      const t = triangulate(views(j, Math.max(fa.pts[j].v, 0.01), Math.max(fb.pts[j].v, 0.01)));
      pts3.push(t ? (t.p as V) : null);
    }
    if (!pts3[23] || !pts3[24] || TORSO.some((j) => !pts3[j])) return fa;
    // Any point that couldn't be triangulated keeps camera A's own 3D, placed on the triangulated hips.
    const hip0: V = [0, 1, 2].map((k) => (pts3[23]![k] + pts3[24]![k]) / 2) as V;
    const ha: V = [0, 1, 2].map((k) => (cam3(fa.world[23])[k] + cam3(fa.world[24])[k]) / 2) as V;
    for (let j = 0; j < 33; j++) if (!pts3[j]) { const q = cam3(fa.world[j]); pts3[j] = [hip0[0] + q[0] - ha[0], hip0[1] + q[1] - ha[1], hip0[2] + q[2] - ha[2]]; }
    const P3 = pts3 as V[];
    // A limb point behind the torso as seen from one camera (and inside the torso's outline in that picture)
    // was guessed by the tracker there: trust the other camera for it.
    const depth = (c: Calibration, p: V) => -(c.R[6] * p[0] + c.R[7] * p[1] + c.R[8] * p[2] + c.t[2]);
    const torsoMid: V = [0, 1, 2].map((k) => TORSO.reduce((s, j) => s + P3[j][k], 0) / 4) as V;
    for (const j of LIMB) {
      let wa = Math.max(fa.pts[j].v, 0.01), wb = Math.max(fb.pts[j].v, 0.01), changed = false;
      if (depth(cal.a, P3[j]) > depth(cal.a, torsoMid) + 0.06 && inTorso(fa, Wa, Ha, fa.pts[j].x * Wa, fa.pts[j].y * Ha)) { wa *= 0.05; changed = true; }
      if (depth(cal.b, P3[j]) > depth(cal.b, torsoMid) + 0.06 && inTorso(fb, Wb, Hb, fb.pts[j].x * Wb, fb.pts[j].y * Hb)) { wb *= 0.05; changed = true; }
      if (!changed || (wa < 0.01 && wb < 0.01)) continue;
      const t = triangulate(views(j, wa, wb));
      if (t) { P3[j] = t.p as V; hiddenFixes++; }
    }
    fused++;
    // Hip-centred, back in MediaPipe's axes, at camera A's orientation (like MediaPipe's own world points).
    const hip: V = [0, 1, 2].map((k) => (P3[23][k] + P3[24][k]) / 2) as V;
    return { ...fa, world: P3.map((p, j) => fromCam3(sub(p, hip), Math.max(fa.world[j].v, fb.world[j].v))) };
  });
  return {
    take: { ...a, frames, hfovDeg: (2 * Math.atan((Wa / 2) / cal.a.f) * 180) / Math.PI, source: { ...a.source, label: `${a.source.label} + 2nd camera`, cameras: 2 } as RawTake['source'] },
    fused: fused / Math.max(1, a.frames.filter(ok).length), hiddenFixes,
  };
}

/** Everything in one call: sync (given, or by movement), calibrate, fuse. */
export function twoCamera(a: RawTake, b: RawTake, o: { offset?: number; sync?: PairSync; fovDeg?: number | [number, number] } = {}): { take: RawTake; report: TwoCameraReport } | { error: string; sync?: PairSync } {
  const sync = o.sync ?? (o.offset !== undefined ? { offset: o.offset, score: 1, margin: Infinity, method: 'given' as const } : syncByMotion(a, b));
  // Movement alone lined fight takes up right only about a third of the time on the benchmark, sometimes with a
  // fair score; it is accepted only when it is unusually sure. Sound (a clap) is the real sync.
  if (sync.method === 'motion' && (sync.score < 0.5 || sync.margin < 2)) return { error: 'The two recordings could not be lined up: no clap was heard in both. Clap once at the start, in view of both phones, and try again.', sync };
  const calibration = calibratePair(a, b, sync.offset, { fovDeg: o.fovDeg });
  if (!calibration) return { error: 'Not enough moments where both cameras see the whole body to work out where the cameras stand.', sync };
  const f = fuseTakes(a, b, sync.offset, calibration);
  return { take: f.take, report: { sync, calibration, fused: f.fused, hiddenFixes: f.hiddenFixes } };
}
