/**
 * bake.ts — the CPU's copy of the recipe distance, used to decide which cells need bricks. The GPU
 * evaluates the same function for every sample in those bricks (bakeShader).
 */

import type { Vec3 } from './engine';

export interface ClayPart {
  op: 'add' | 'carve';
  a: Vec3;
  ra: number;
  b?: Vec3;
  rb?: number;
  blend?: number;
  /** Also place the part mirrored across X. */
  mirror?: boolean;
}

export interface CompiledPrim {
  a: Vec3;
  ra: number;
  b: Vec3;
  rb: number;
  blend: number;
  carve: boolean;
}

export function compileRecipe(parts: ClayPart[]): CompiledPrim[] {
  const out: CompiledPrim[] = [];
  for (const p of parts) {
    const prim: CompiledPrim = { a: p.a, ra: p.ra, b: p.b ?? p.a, rb: p.rb ?? p.ra, blend: p.blend ?? 0, carve: p.op === 'carve' };
    out.push(prim);
    if (p.mirror) {
      out.push({ ...prim, a: [-prim.a[0], prim.a[1], prim.a[2]], b: [-prim.b[0], prim.b[1], prim.b[2]] });
    }
  }
  return out;
}

function roundCone(px: number, py: number, pz: number, p: CompiledPrim): number {
  const ax = px - p.a[0], ay = py - p.a[1], az = pz - p.a[2];
  const bx = p.b[0] - p.a[0], by = p.b[1] - p.a[1], bz = p.b[2] - p.a[2];
  const l2 = bx * bx + by * by + bz * bz;
  if (l2 < 1e-10) return Math.hypot(ax, ay, az) - Math.max(p.ra, p.rb);
  const rr = p.ra - p.rb;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const y = ax * bx + ay * by + az * bz;
  const z = y - l2;
  const vx = ax * l2 - bx * y, vy = ay * l2 - by * y, vz = az * l2 - bz * y;
  const x2 = vx * vx + vy * vy + vz * vz;
  const y2 = y * y * l2;
  const z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - p.rb;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - p.ra;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - p.ra;
}

const smin = (a: number, b: number, k: number) => {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export function recipeDistance(prims: CompiledPrim[], x: number, y: number, z: number): number {
  let d = 1e3;
  for (const p of prims) {
    const c = roundCone(x, y, z, p);
    d = p.carve ? -smin(-d, c, p.blend) : smin(d, c, p.blend);
  }
  return d;
}

/**
 * The parts that can matter inside a sphere around a point. Bodies have hundreds of parts and any one spot only
 * touches a few, so classifying cells against this short list keeps a re-bake interactive.
 */
export function primsNear(prims: CompiledPrim[], x: number, y: number, z: number, radius: number): CompiledPrim[] {
  let closest = Infinity;
  const dist = prims.map((p) => {
    const c = roundCone(x, y, z, p);
    if (!p.carve && c < closest) closest = c;
    return c;
  });
  // A part further than the nearest body by the sphere's full width plus its blend can never win anywhere in it.
  return prims.filter((p, i) => dist[i] - p.blend <= Math.max(closest, 0) + radius * 2);
}
