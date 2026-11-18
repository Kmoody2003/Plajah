// Trading points on the model for pixels of a picture, both ways, through a ModelCamera.

import type { ModelCamera, Vec3 } from './schema';

const D = Math.PI / 180;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export interface CameraBasis { eye: Vec3; right: Vec3; up: Vec3; fwd: Vec3; tanHalf: number }

/** Yaw 0 looks from +Z (the model's front) toward −Z; positive pitch is from above. */
export function basis(c: ModelCamera): CameraBasis {
  const y = c.yawDeg * D, p = c.pitchDeg * D;
  const eye: Vec3 = [c.target[0] + c.distance * Math.sin(y) * Math.cos(p), c.target[1] + c.distance * Math.sin(p), c.target[2] + c.distance * Math.cos(y) * Math.cos(p)];
  const fwd = unit(sub(c.target, eye));
  const right = unit(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  return { eye, right, up, fwd, tanHalf: Math.tan((c.fovDeg * D) / 2) };
}

/** World point → [pixel x, pixel y, depth along the view]. Depth ≤ 0 is behind the camera. */
export function project(c: ModelCamera, p: Vec3, b: CameraBasis = basis(c)): [number, number, number] {
  const v = sub(p, b.eye);
  const z = dot(v, b.fwd);
  const nx = dot(v, b.right) / (z * b.tanHalf), ny = dot(v, b.up) / (z * b.tanHalf);
  const half = (c.height / 2) * c.frame.scale;
  return [c.width / 2 + nx * half + c.frame.dx, c.height / 2 - ny * half + c.frame.dy, z];
}

/** Pixel → ray from the eye. */
export function ray(c: ModelCamera, px: number, py: number, b: CameraBasis = basis(c)): { origin: Vec3; dir: Vec3 } {
  const half = (c.height / 2) * c.frame.scale;
  const nx = (px - c.width / 2 - c.frame.dx) / half, ny = -(py - c.height / 2 - c.frame.dy) / half;
  const dir = unit([
    b.fwd[0] + (b.right[0] * nx + b.up[0] * ny) * b.tanHalf,
    b.fwd[1] + (b.right[1] * nx + b.up[1] * ny) * b.tanHalf,
    b.fwd[2] + (b.right[2] * nx + b.up[2] * ny) * b.tanHalf,
  ]);
  return { origin: b.eye, dir };
}

/** World units per pixel at a given depth. */
export function unitsPerPixel(c: ModelCamera, depth: number, b: CameraBasis = basis(c)): number {
  return (depth * b.tanHalf) / ((c.height / 2) * c.frame.scale);
}

/** A camera at this angle that frames a model of the given half-extent in the picture. */
export function framingCamera(o: { yawDeg: number; pitchDeg: number; width: number; height: number; target?: Vec3; fovDeg?: number; radius?: number }): ModelCamera {
  const fov = o.fovDeg ?? 30, r = o.radius ?? 1;
  return { yawDeg: o.yawDeg, pitchDeg: o.pitchDeg, fovDeg: fov, distance: (r / Math.sin((fov * D) / 2)) * 1.05, target: o.target ?? [0, 0, 0], width: o.width, height: o.height, frame: { scale: 1, dx: 0, dy: 0 } };
}

/** Ray against a sphere-traced distance field; null when it misses. */
export function traceField(sample: (x: number, y: number, z: number) => number, origin: Vec3, dir: Vec3, maxT = 8, eps = 0.002): { point: Vec3; normal: Vec3; t: number } | null {
  let t = 0;
  for (let i = 0; i < 256 && t < maxT; i++) {
    const p: Vec3 = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
    const d = sample(p[0], p[1], p[2]);
    if (d < eps) {
      const h = 0.004;
      const n = unit([
        sample(p[0] + h, p[1], p[2]) - sample(p[0] - h, p[1], p[2]),
        sample(p[0], p[1] + h, p[2]) - sample(p[0], p[1] - h, p[2]),
        sample(p[0], p[1], p[2] + h) - sample(p[0], p[1], p[2] - h),
      ]);
      return { point: p, normal: n, t };
    }
    t += Math.max(d * 0.9, eps * 0.5);
  }
  return null;
}
