// Virtual camera rigs: several calibrated cameras placed around a subject or a scene, all filming the same moment.
// One plain-data description (where each camera stands, what it looks at, its lens, whether it follows the action)
// shared by everything on Plajah that needs more than one camera:
//   - motion capture: synced multi-view training renders and the two/four-phone triangulation mode
//   - scene staging (Fabula, Stage, previz): blocking a shot list with a wide, a medium and a close on the same action
//   - generative video: render the blocked cameras as guides (depth/pose/edges) for each shot
// No three.js state lives in a spec; `toThree` / `place` turn it into a camera when a renderer needs one.
import * as THREE from 'three';

export type Vec3 = [number, number, number];

export interface CameraSpec {
  id: string;
  /** Label for people ("Wide", "Phone 2", "Over-the-shoulder"). */
  name?: string;
  /** Position in the scene, metres, Y up. With `follow`, relative to the followed point. */
  position: Vec3;
  /** Point the camera looks at. With `follow`, relative to the followed point. */
  target: Vec3;
  /** Horizontal field of view, degrees (phones ≈ 65–75, a 50 mm lens on full frame ≈ 40). */
  hfovDeg: number;
  /** Width / height of the picture. */
  aspect?: number;
  /** Roll around the viewing axis, degrees (Dutch angle). */
  rollDeg?: number;
  /**
   * 'none' = locked off on a tripod; 'pan' = stays put, turns to keep the followed point at `target`'s offset;
   * 'track' = moves with the followed point (dolly/steadicam).
   */
  follow?: 'none' | 'pan' | 'track';
}

export interface CameraRig {
  id: string;
  name?: string;
  cameras: CameraSpec[];
}

const V = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

/** Lens as a full-frame focal length (what film crews say) ↔ horizontal field of view. */
export const mmToHfov = (mm: number) => THREE.MathUtils.radToDeg(2 * Math.atan(36 / (2 * mm)));
export const hfovToMm = (deg: number) => 36 / (2 * Math.tan(THREE.MathUtils.degToRad(deg) / 2));

/** A three.js camera for a spec (aspect from the spec unless given). */
export function toThree(spec: CameraSpec, aspect = spec.aspect ?? 16 / 9): THREE.PerspectiveCamera {
  const vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(spec.hfovDeg) / 2) / aspect));
  const cam = new THREE.PerspectiveCamera(vfov, aspect, 0.05, 500);
  cam.name = spec.name ?? spec.id;
  place(cam, spec);
  return cam;
}

/** Put a camera where the spec says, given the followed point (e.g. the performer's hips) when it follows. */
export function place(cam: THREE.PerspectiveCamera, spec: CameraSpec, followed?: THREE.Vector3, origin?: THREE.Vector3): void {
  const f = spec.follow ?? 'none';
  const pos = V(spec.position), tgt = V(spec.target);
  if (followed && f === 'track') { pos.add(followed); tgt.add(followed); }
  if (followed && f === 'pan') tgt.add(followed).sub(origin ?? new THREE.Vector3());
  cam.position.copy(pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(tgt);
  if (spec.rollDeg) cam.rotateZ(THREE.MathUtils.degToRad(spec.rollDeg));
  cam.updateMatrixWorld(true);
}

/** Pinhole numbers for a camera at the current pose: focal length in pixels, centre, world→camera rotation and shift. */
export interface Calibration { w: number; h: number; f: number; cx: number; cy: number; R: number[]; t: Vec3 }
export function calibration(cam: THREE.PerspectiveCamera, w: number, h: number): Calibration {
  cam.updateMatrixWorld(true);
  const m = cam.matrixWorldInverse.elements; // column-major
  const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect);
  return {
    w, h, f: (w / 2) / Math.tan(hfov / 2), cx: w / 2, cy: h / 2,
    R: [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]], t: [m[12], m[13], m[14]],
  };
}

/** World point → pixel (and camera depth, positive in front). */
export function project(c: Calibration, p: Vec3): { u: number; v: number; depth: number } {
  const { R, t } = c;
  const x = R[0] * p[0] + R[1] * p[1] + R[2] * p[2] + t[0];
  const y = R[3] * p[0] + R[4] * p[1] + R[5] * p[2] + t[1];
  const z = R[6] * p[0] + R[7] * p[1] + R[8] * p[2] + t[2];
  return { u: c.cx + (c.f * x) / -z, v: c.cy - (c.f * y) / -z, depth: -z };
}

/**
 * One 3D point from its pixel position in two or more calibrated views (weighted least squares on the projection
 * equations; weight = how sure each view is, e.g. landmark visibility). Returns null with fewer than two usable views.
 */
export function triangulate(views: { c: Calibration; u: number; v: number; w?: number }[]): { p: Vec3; err: number } | null {
  // Views the tracker is unsure of (a hidden elbow) count for little, but are kept when they're all there is.
  const sure = views.filter((x) => (x.w ?? 1) > 0.05);
  const use = sure.length >= 2 ? sure : views.filter((x) => (x.w ?? 1) > 0.002).map((x) => ({ ...x, w: Math.max(x.w ?? 1, 0.05) }));
  if (use.length < 2) return null;
  const A = new Array(9).fill(0), b = [0, 0, 0];
  const rows: { r: number[]; k: number; w: number }[] = [];
  for (const { c, u, v, w = 1 } of use) {
    const a = (u - c.cx) / c.f, bb = (v - c.cy) / c.f, R = c.R, t = c.t;
    // x_c + a z_c = 0 ; y_c − bb z_c = 0   (camera looks down −z, image v grows downward)
    rows.push({ r: [R[0] + a * R[6], R[1] + a * R[7], R[2] + a * R[8]], k: t[0] + a * t[2], w });
    rows.push({ r: [R[3] - bb * R[6], R[4] - bb * R[7], R[5] - bb * R[8]], k: t[1] - bb * t[2], w });
  }
  for (const { r, k, w } of rows) {
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i * 3 + j] += w * r[i] * r[j]; b[i] -= w * r[i] * k; }
  }
  const p = solve3(A, b);
  if (!p) return null;
  let err = 0;
  for (const x of use) { const q = project(x.c, p); err += Math.hypot(q.u - x.u, q.v - x.v); }
  return { p, err: err / use.length };
}

function solve3(A: number[], b: number[]): Vec3 | null {
  const [a, bb, c, d, e, f, g, h, i] = A;
  const det = a * (e * i - f * h) - bb * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return null;
  const inv = [e * i - f * h, c * h - bb * i, bb * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, bb * g - a * h, a * e - bb * d];
  return [0, 1, 2].map((r) => (inv[r * 3] * b[0] + inv[r * 3 + 1] * b[1] + inv[r * 3 + 2] * b[2]) / det) as Vec3;
}

// ── Presets ─────────────────────────────────────────────────────────────────────────────────────────────────
// All face a subject at the origin facing +Z (towards the "front" camera), eye line ~1.5 m, look point ~1 m.

const ring = (n: number, dist: number, height: number, hfov: number, startDeg = 0, look = 1.0): CameraSpec[] =>
  Array.from({ length: n }, (_, k) => {
    const a = THREE.MathUtils.degToRad(startDeg + (360 / n) * k);
    return { id: `cam${k + 1}`, name: `Camera ${k + 1}`, position: [Math.sin(a) * dist, height, Math.cos(a) * dist], target: [0, look, 0], hfovDeg: hfov };
  });

export const RIG_PRESETS: Record<string, () => CameraRig> = {
  /** Two phones on tripods about 90° apart: the cheapest real triangulation setup. */
  twoPhones: () => ({ id: 'twoPhones', name: 'Two phones', cameras: [
    { id: 'p1', name: 'Phone 1', position: [-2.5, 1.2, 2.5], target: [0, 1, 0], hfovDeg: 68 },
    { id: 'p2', name: 'Phone 2', position: [2.5, 1.2, 2.5], target: [0, 1, 0], hfovDeg: 68 },
  ] }),
  /** Four corners of a capture square. */
  fourCorners: () => ({ id: 'fourCorners', name: 'Four corners', cameras: ring(4, 4, 1.6, 68, 45) }),
  /** Eight around, alternating high and low (best coverage for training and multi-view capture). */
  eightRing: () => ({ id: 'eightRing', name: 'Eight ring', cameras: ring(8, 4.5, 1.4, 60).map((c, k) => ({ ...c, position: [c.position[0], k % 2 ? 2.2 : 0.8, c.position[2]] as Vec3 })) }),
  /** Classic three-camera coverage for staging a scene: wide master, medium, close-up. */
  coverage: () => ({ id: 'coverage', name: 'Wide / medium / close', cameras: [
    { id: 'wide', name: 'Wide master', position: [0, 1.6, 7], target: [0, 1.1, 0], hfovDeg: mmToHfov(24) },
    { id: 'medium', name: 'Medium', position: [-2, 1.5, 4], target: [0, 1.3, 0], hfovDeg: mmToHfov(50), follow: 'pan' },
    { id: 'close', name: 'Close-up', position: [1.2, 1.55, 2.6], target: [0, 1.55, 0], hfovDeg: mmToHfov(85), follow: 'pan' },
  ] }),
  /** Two-person dialogue: master plus matching over-the-shoulders (subjects at x = ±0.8). */
  dialogue: () => ({ id: 'dialogue', name: 'Dialogue', cameras: [
    { id: 'master', name: 'Two-shot', position: [0, 1.5, 4.5], target: [0, 1.4, 0], hfovDeg: mmToHfov(35) },
    { id: 'otsA', name: 'Over A onto B', position: [-1.4, 1.6, 0.9], target: [0.8, 1.55, 0], hfovDeg: mmToHfov(65) },
    { id: 'otsB', name: 'Over B onto A', position: [1.4, 1.6, 0.9], target: [-0.8, 1.55, 0], hfovDeg: mmToHfov(65) },
  ] }),
  /** Fight / action: low wide, tracking side, high overhead. */
  action: () => ({ id: 'action', name: 'Action', cameras: [
    { id: 'low', name: 'Low wide', position: [0, 0.4, 5], target: [0, 1.2, 0], hfovDeg: mmToHfov(18) },
    { id: 'side', name: 'Tracking side', position: [5, 1.3, 0], target: [0, 1.1, 0], hfovDeg: mmToHfov(35), follow: 'track' },
    { id: 'high', name: 'High angle', position: [-3, 5, 3], target: [0, 0.8, 0], hfovDeg: mmToHfov(28), follow: 'pan' },
  ] }),
};

/** Random rig for training data: n cameras spread around, with jittered distance, height, lens and aim. */
export function randomRig(n: number, rand: () => number = Math.random, o: { minDist?: number; maxDist?: number } = {}): CameraRig {
  const start = rand() * 360, lo = o.minDist ?? 3, hi = o.maxDist ?? 6.5;
  const cameras = Array.from({ length: n }, (_, k): CameraSpec => {
    const a = THREE.MathUtils.degToRad(start + (360 / n) * k + (rand() - 0.5) * (240 / n));
    const d = lo + rand() * (hi - lo);
    return {
      id: `cam${k + 1}`, position: [Math.sin(a) * d, 0.5 + rand() * 1.7, Math.cos(a) * d],
      target: [(rand() - 0.5) * 0.4, 0.8 + rand() * 0.4, (rand() - 0.5) * 0.4], hfovDeg: 48 + rand() * 27,
    };
  });
  return { id: 'random', cameras };
}

/** Pull every camera back along its line of sight until a ground circle of `radius` round the target fits in frame. */
export function fitRadius(rig: CameraRig, radius: number, aspect = 16 / 9): CameraRig {
  return { ...rig, cameras: rig.cameras.map((c) => {
    const half = THREE.MathUtils.degToRad(Math.min(c.hfovDeg, c.hfovDeg / aspect * 1.6) / 2);
    const need = radius / Math.tan(half) + 0.5;
    const p = V(c.position), t = V(c.target), d = p.clone().sub(t);
    const flat = Math.hypot(d.x, d.z);
    if (flat >= need) return c;
    const k = need / Math.max(0.01, flat);
    return { ...c, position: [t.x + d.x * k, c.position[1], t.z + d.z * k] as Vec3 };
  }) };
}
