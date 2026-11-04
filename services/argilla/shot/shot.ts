/**
 * shot.ts — a Shot: the unit of storytelling in Plajah 3D. A stage (the scene), a camera that moves along a path,
 * and a length. Plain data, so Anima and Fabula can share it later (docs/plajah-3d-animation-scope.md).
 *
 * The camera is a handful of keys; between them it flies a smooth curve, easing out of the first key and into the
 * last, so a two-key push-in and a five-key fly-through both feel filmed rather than tweened.
 */

import type { Scene } from '../scene/sceneModel';

export type Vec3 = [number, number, number];

export interface CameraKey {
  /** Seconds from the start of the shot. */
  t: number;
  position: Vec3;
  /** Where the camera looks. */
  target: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
}

export interface Shot {
  id: string;
  title: string;
  seconds: number;
  fps: number;
  /** Sorted by time. Empty means the camera stays wherever the viewer leaves it. */
  camera: CameraKey[];
  createdAt: number;
  updatedAt: number;
}

export const SHOT_LENGTHS = [3, 5, 8, 10, 15, 20];

export const newShotId = () => `shot_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function newShot(title: string, seconds = 10): Shot {
  const now = Date.now();
  return { id: newShotId(), title, seconds, fps: 30, camera: [], createdAt: now, updatedAt: now };
}

/** Everything in the scene as one box: its middle and the radius of a ball that holds it. */
export function sceneBounds(scene: Pick<Scene, 'objects'>) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const o of scene.objects) {
    const [x, y, z] = o.position, [w, h, d] = o.size;
    lo[0] = Math.min(lo[0], x - w / 2); hi[0] = Math.max(hi[0], x + w / 2);
    lo[1] = Math.min(lo[1], y); hi[1] = Math.max(hi[1], y + h);
    lo[2] = Math.min(lo[2], z - d / 2); hi[2] = Math.max(hi[2], z + d / 2);
  }
  if (!Number.isFinite(lo[0])) return { centre: [0, 0.5, 0] as Vec3, radius: 1 };
  return {
    centre: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] as Vec3,
    radius: Math.max(0.05, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2),
  };
}

/** How far back a camera stands for a ball of this radius to fill the narrower side of the frame. */
export function fitDistance(radius: number, fovDeg: number, aspect: number) {
  const vertical = (fovDeg * Math.PI) / 360;
  return (radius / Math.sin(Math.min(vertical, Math.atan(Math.tan(vertical) * aspect)))) * 1.1;
}

const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
const ease = (s: number) => s * s * (3 - 2 * s);

/** Centripetal Catmull-Rom through p1 and p2: no loops or overshoot when keys sit unevenly. */
function catmull(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, s: number): Vec3 {
  const knot = (a: Vec3, b: Vec3) => Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])));
  const t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * s;
  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const a1 = ((t1 - t) * p0[k] + t * p1[k]) / t1;
    const a2 = ((t2 - t) * p1[k] + (t - t1) * p2[k]) / (t2 - t1);
    const a3 = ((t3 - t) * p2[k] + (t - t2) * p3[k]) / (t3 - t2);
    const b1 = ((t2 - t) * a1 + t * a2) / t2;
    const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1);
    out[k] = ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1);
  }
  return out;
}

/** Ends of the curve: a mirrored phantom key, so the path leaves the first key heading at the second. */
const phantom = (a: Vec3, b: Vec3): Vec3 => [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]];

/** Where the camera is at time t. Null when the shot has no camera keys. */
export function cameraAt(keys: CameraKey[], t: number): Omit<CameraKey, 't'> | null {
  if (!keys.length) return null;
  if (keys.length === 1 || t <= keys[0].t) return { position: [...keys[0].position], target: [...keys[0].target], fov: keys[0].fov };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { position: [...last.position], target: [...last.target], fov: last.fov };
  // One ease over the whole move, so it starts and settles gently but never stops at a key in between.
  const span = last.t - keys[0].t;
  const u = keys[0].t + ease((t - keys[0].t) / span) * span;
  let i = 0;
  while (i < keys.length - 2 && u > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1];
  const s = (u - a.t) / Math.max(1e-6, b.t - a.t);
  const pick = (k: 'position' | 'target') => {
    const p1 = a[k], p2 = b[k];
    const p0 = i > 0 ? keys[i - 1][k] : phantom(p1, p2);
    const p3 = i + 2 < keys.length ? keys[i + 2][k] : phantom(p2, p1);
    return catmull(p0, p1, p2, p3, s);
  };
  return { position: pick('position'), target: pick('target'), fov: lerp(a.fov, b.fov, s) };
}

/** Adds a key at time t, replacing one within a quarter second of it. */
export function setKey(keys: CameraKey[], key: CameraKey): CameraKey[] {
  return [...keys.filter((k) => Math.abs(k.t - key.t) > 0.25), key].sort((a, b) => a.t - b.t);
}

/** Squeezes or stretches the keys when the shot's length changes, so a move still fills the shot. */
export function retime(keys: CameraKey[], from: number, to: number): CameraKey[] {
  const k = to / Math.max(from, 1e-6);
  return keys.map((key) => ({ ...key, t: Math.min(to, key.t * k) }));
}

export type MoveId = 'push-in' | 'pull-back' | 'orbit' | 'crane-up' | 'slide-past';

export const CAMERA_MOVES: { id: MoveId; label: string }[] = [
  { id: 'push-in', label: 'Push in' },
  { id: 'pull-back', label: 'Pull back' },
  { id: 'orbit', label: 'Orbit around' },
  { id: 'crane-up', label: 'Crane up' },
  { id: 'slide-past', label: 'Slide past' },
];

/**
 * A ready-made move around the scene, starting from the direction the viewer is looking from, so the shot keeps
 * the angle they chose. `from` is the current camera position, `aspect` the frame's width over height.
 */
export function cameraMove(id: MoveId, scene: Pick<Scene, 'objects'>, seconds: number, from: Vec3, aspect = 16 / 9, fov = 38): CameraKey[] {
  const { centre, radius } = sceneBounds(scene);
  const far = fitDistance(radius, fov, aspect);
  let dir: Vec3 = [from[0] - centre[0], from[1] - centre[1], from[2] - centre[2]];
  const len = Math.hypot(...dir);
  dir = len > 1e-6 ? [dir[0] / len, dir[1] / len, dir[2] / len] : [0.5, 0.35, 0.8];
  const at = (d: number, direction: Vec3 = dir, lift = 0): Vec3 => [centre[0] + direction[0] * d, centre[1] + direction[1] * d + lift, centre[2] + direction[2] * d];
  const around = (angle: number): Vec3 => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [dir[0] * c - dir[2] * s, dir[1], dir[0] * s + dir[2] * c];
  };
  const key = (t: number, position: Vec3, target: Vec3 = centre, f = fov): CameraKey => ({ t, position, target: [...target], fov: f });
  const end = seconds;
  switch (id) {
    case 'push-in': return [key(0, at(far * 1.05)), key(end, at(far * 0.55))];
    case 'pull-back': return [key(0, at(far * 0.55)), key(end, at(far * 1.1))];
    case 'orbit': return [0, 0.25, 0.5, 0.75, 1].map((s) => key(s * end, at(far, around(s * Math.PI * 0.9))));
    case 'crane-up': {
      const low: Vec3 = [dir[0], Math.max(-0.05, dir[1] - 0.45), dir[2]], high: Vec3 = [dir[0], dir[1] + 0.55, dir[2]];
      const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      return [key(0, at(far * 0.85, norm(low)), [centre[0], centre[1] - radius * 0.25, centre[2]]), key(end, at(far, norm(high)))];
    }
    case 'slide-past': {
      const side: Vec3 = [dir[2], 0, -dir[0]];
      const shift = (s: number): Vec3 => { const p = at(far * 0.85); return [p[0] + side[0] * radius * s, p[1], p[2] + side[2] * radius * s]; };
      return [key(0, shift(-1.1), [centre[0] - side[0] * radius * 0.2, centre[1], centre[2] - side[2] * radius * 0.2]), key(end, shift(1.1), [centre[0] + side[0] * radius * 0.2, centre[1], centre[2] + side[2] * radius * 0.2])];
    }
  }
}
