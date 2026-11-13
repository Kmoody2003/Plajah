/**
 * humanFinish.ts — the human body plan's clay into a game body: mesh, weights, dual-quaternion skinning and the
 * corrective shapes baked from the anatomy (docs/character-forge.md §1–2).
 *
 * Plain math, no DOM and no GPU, so it runs in the Forge's build script and in a worker alike. The field is the
 * source of truth: the skin is its zero set, normals are its gradient, and a corrective shape is the difference
 * between where skinning puts a vertex in a pose and where the posed field says the skin really is.
 */

import { compileRecipe, primsNear, recipeDistance, type ClayPart, type CompiledPrim } from '../bake';
import type { Vec3 } from '../engine';
import { skinWeights } from './finish';
import {
  HUMAN_JOINTS, TWIST_JOINTS, poseJoints, posedParts, qmul, qrot,
  type HumanAnatomy, type HumanJoint, type HumanPose, type JointXf,
} from './human';

export interface BodyMesh { positions: Float32Array; normals: Float32Array; indices: Uint32Array }

/** Signed distance to a thin shell around a triangle mesh (the canonical face), with a quick bounds reject. */
export function shellField(points: Vec3[], indices: ArrayLike<number>, thickness: number) {
  const lo: Vec3 = [Infinity, Infinity, Infinity], hi: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], p[c]); hi[c] = Math.max(hi[c], p[c]); }
  // triangles bucketed on a 1.5 cm grid by their bounds; a query looks at its own cell and the 26 around it
  const cell = 0.015;
  const buckets = new Map<string, number[]>();
  for (let t = 0; t < indices.length; t += 3) {
    const a = points[indices[t]], b = points[indices[t + 1]], c = points[indices[t + 2]];
    const x0 = Math.floor(Math.min(a[0], b[0], c[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0], c[0]) / cell);
    const y0 = Math.floor(Math.min(a[1], b[1], c[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1], c[1]) / cell);
    const z0 = Math.floor(Math.min(a[2], b[2], c[2]) / cell), z1 = Math.floor(Math.max(a[2], b[2], c[2]) / cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const k = `${x},${y},${z}`; const l = buckets.get(k); if (l) l.push(t); else buckets.set(k, [t]);
    }
  }
  return (x: number, y: number, z: number) => {
    const ox = Math.max(lo[0] - x, 0, x - hi[0]), oy = Math.max(lo[1] - y, 0, y - hi[1]), oz = Math.max(lo[2] - z, 0, z - hi[2]);
    const box = Math.hypot(ox, oy, oz);
    if (box > 0.012) return box - thickness;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = cell * cell;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const l = buckets.get(`${cx + dx},${cy + dy},${cz + dz}`);
      if (!l) continue;
      for (const t of l) {
        const d2 = pointTri2(x, y, z, points[indices[t]], points[indices[t + 1]], points[indices[t + 2]]);
        if (d2 < best) best = d2;
      }
    }
    return Math.max(box, Math.sqrt(best)) - thickness;
  };
}

/** Squared distance from a point to a triangle (Ericson, Real-Time Collision Detection 5.1.5). */
function pointTri2(px: number, py: number, pz: number, a: Vec3, b: Vec3, c: Vec3): number {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const apx = px - a[0], apy = py - a[1], apz = pz - a[2];
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  const q = (x: number, y: number, z: number) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
  if (d1 <= 0 && d2 <= 0) return q(a[0], a[1], a[2]);
  const bpx = px - b[0], bpy = py - b[1], bpz = pz - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return q(b[0], b[1], b[2]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return q(a[0] + abx * v, a[1] + aby * v, a[2] + abz * v); }
  const cpx = px - c[0], cpy = py - c[1], cpz = pz - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return q(c[0], c[1], c[2]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return q(a[0] + acx * w, a[1] + acy * w, a[2] + acz * w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return q(b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w); }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return q(a[0] + abx * v + acx * w, a[1] + aby * v + acy * w, a[2] + abz * v + acz * w);
}

const sminK = (a: number, b: number, k: number) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/** Signed distance of a part list (plus optional extra shapes, smooth-unioned), with cached short lists per region. */
export function fieldOf(parts: ClayPart[], extra?: { d: (x: number, y: number, z: number) => number; blend: number }) {
  const prims = compileRecipe(parts);
  const cell = 0.04;
  const lists = new Map<string, CompiledPrim[]>();
  const listAt = (x: number, y: number, z: number) => {
    const ix = Math.floor(x / cell), iy = Math.floor(y / cell), iz = Math.floor(z / cell);
    const key = `${ix},${iy},${iz}`;
    let l = lists.get(key);
    if (!l) { l = primsNear(prims, (ix + 0.5) * cell, (iy + 0.5) * cell, (iz + 0.5) * cell, cell * 0.9); lists.set(key, l); }
    return l;
  };
  const d = extra
    ? (x: number, y: number, z: number) => sminK(recipeDistance(listAt(x, y, z), x, y, z), extra.d(x, y, z), extra.blend)
    : (x: number, y: number, z: number) => recipeDistance(listAt(x, y, z), x, y, z);
  const grad = (x: number, y: number, z: number, h = 0.0012): Vec3 => {
    const gx = d(x + h, y, z) - d(x - h, y, z), gy = d(x, y + h, z) - d(x, y - h, z), gz = d(x, y, z + h) - d(x, y, z - h);
    const l = Math.hypot(gx, gy, gz) || 1;
    return [gx / l, gy / l, gz / l];
  };
  return { d, grad, prims };
}

/**
 * Naive surface nets over a sparse lattice: only blocks the surface passes through are sampled. `voxel` in metres.
 */
export function meshField(field: ReturnType<typeof fieldOf>, min: Vec3, max: Vec3, voxel: number): BodyMesh {
  const { d } = field;
  const B = 8;
  const nx = Math.ceil((max[0] - min[0]) / voxel), ny = Math.ceil((max[1] - min[1]) / voxel), nz = Math.ceil((max[2] - min[2]) / voxel);
  const bx = Math.ceil(nx / B), by = Math.ceil(ny / B), bz = Math.ceil(nz / B);
  const wx = (i: number) => min[0] + i * voxel, wy = (i: number) => min[1] + i * voxel, wz = (i: number) => min[2] + i * voxel;
  const key = (x: number, y: number, z: number) => x + (nx + 2) * (y + (ny + 2) * z);
  const values = new Map<number, number>();
  const sample = (x: number, y: number, z: number) => {
    const k = key(x, y, z);
    let v = values.get(k);
    if (v === undefined) { v = d(wx(x), wy(y), wz(z)); values.set(k, v); }
    return v;
  };
  const active: [number, number, number][] = [];
  const reach = B * voxel * 0.9;
  for (let k = 0; k < bz; k++) for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
    const c = d(wx((i + 0.5) * B), wy((j + 0.5) * B), wz((k + 0.5) * B));
    if (Math.abs(c) < reach) active.push([i, j, k]);
  }
  const vertexOf = new Map<number, number>();
  const positions: number[] = [];
  const corner = new Float64Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const cellVertex = (x: number, y: number, z: number): number => {
    const k = key(x, y, z);
    const known = vertexOf.get(k);
    if (known !== undefined) return known;
    let mask = 0;
    for (let c = 0; c < 8; c++) { corner[c] = sample(x + C[c][0], y + C[c][1], z + C[c][2]); if (corner[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) { vertexOf.set(k, -1); return -1; }
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const da = corner[a], db = corner[b];
      if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    const index = positions.length / 3;
    positions.push(wx(x + sx / n), wy(y + sy / n), wz(z + sz / n));
    vertexOf.set(k, index);
    return index;
  };
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, e: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || e < 0) return;
    if (flip) indices.push(a, b, c, a, c, e); else indices.push(a, c, b, a, e, c);
  };
  for (const [i, j, k] of active) {
    for (let z = k * B; z < Math.min(nz, (k + 1) * B); z++) for (let y = j * B; y < Math.min(ny, (j + 1) * B); y++) for (let x = i * B; x < Math.min(nx, (i + 1) * B); x++) {
      if (x < 1 || y < 1 || z < 1) continue;
      const v0 = sample(x, y, z);
      // edge +x: shared by cells (x, y-1..y, z-1..z)
      const vx = sample(x + 1, y, z);
      if ((v0 < 0) !== (vx < 0)) quad(cellVertex(x, y - 1, z - 1), cellVertex(x, y, z - 1), cellVertex(x, y, z), cellVertex(x, y - 1, z), v0 < 0);
      const vy = sample(x, y + 1, z);
      if ((v0 < 0) !== (vy < 0)) quad(cellVertex(x - 1, y, z - 1), cellVertex(x - 1, y, z), cellVertex(x, y, z), cellVertex(x, y, z - 1), v0 < 0);
      const vz = sample(x, y, z + 1);
      if ((v0 < 0) !== (vz < 0)) quad(cellVertex(x - 1, y - 1, z), cellVertex(x, y - 1, z), cellVertex(x, y, z), cellVertex(x - 1, y, z), v0 < 0);
    }
  }
  const pos = new Float32Array(positions);
  const normals = new Float32Array(pos.length);
  return { positions: pos, normals, indices: new Uint32Array(indices) };
}

/** Pull vertices onto the field's zero set and take normals from its gradient. */
export function settleOnField(mesh: BodyMesh, field: ReturnType<typeof fieldOf>, steps = 3) {
  const p = mesh.positions;
  for (let v = 0; v < p.length; v += 3) {
    let x = p[v], y = p[v + 1], z = p[v + 2];
    for (let s = 0; s < steps; s++) {
      const dist = field.d(x, y, z);
      if (Math.abs(dist) < 1e-5) break;
      const g = field.grad(x, y, z);
      x -= g[0] * dist; y -= g[1] * dist; z -= g[2] * dist;
    }
    p[v] = x; p[v + 1] = y; p[v + 2] = z;
    const g = field.grad(x, y, z);
    mesh.normals[v] = g[0]; mesh.normals[v + 1] = g[1]; mesh.normals[v + 2] = g[2];
  }
}

/** Laplacian smoothing of positions (surface nets leaves a fine staircase). */
export function relaxMesh(mesh: BodyMesh, passes: number, amount: number) {
  const n = mesh.positions.length / 3;
  const nb = neighbours(mesh.indices, n);
  const p = mesh.positions;
  for (let pass = 0; pass < passes; pass++) {
    const next = p.slice();
    for (let v = 0; v < n; v++) {
      const list = nb[v];
      if (!list.length) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const o of list) { sx += p[o * 3]; sy += p[o * 3 + 1]; sz += p[o * 3 + 2]; }
      next[v * 3] += (sx / list.length - p[v * 3]) * amount;
      next[v * 3 + 1] += (sy / list.length - p[v * 3 + 1]) * amount;
      next[v * 3 + 2] += (sz / list.length - p[v * 3 + 2]) * amount;
    }
    p.set(next);
  }
}

export function neighbours(indices: Uint32Array, n: number): number[][] {
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) { const a = indices[i + e], b = indices[i + (e + 1) % 3]; sets[a].add(b); sets[b].add(a); }
  }
  return sets.map((s) => [...s]);
}

/** Drop vertices no triangle uses and renumber. */
export function compact(mesh: BodyMesh, extra: Float32Array[] = []): { mesh: BodyMesh; remap: Int32Array; extra: Float32Array[] } {
  const n = mesh.positions.length / 3;
  const remap = new Int32Array(n).fill(-1);
  let kept = 0;
  for (const i of mesh.indices) if (remap[i] < 0) remap[i] = kept++;
  const positions = new Float32Array(kept * 3), normals = new Float32Array(kept * 3);
  const ex = extra.map((e) => new Float32Array((e.length / n) * kept));
  for (let v = 0; v < n; v++) {
    const r = remap[v];
    if (r < 0) continue;
    positions.set(mesh.positions.subarray(v * 3, v * 3 + 3), r * 3);
    normals.set(mesh.normals.subarray(v * 3, v * 3 + 3), r * 3);
    extra.forEach((e, i) => { const w = e.length / n; ex[i].set(e.subarray(v * w, v * w + w), r * w); });
  }
  const indices = new Uint32Array(mesh.indices.length);
  for (let i = 0; i < indices.length; i++) indices[i] = remap[mesh.indices[i]];
  return { mesh: { positions, normals, indices }, remap, extra: ex };
}

// ---- Skin weights --------------------------------------------------------------------------------------------

/** Joints the skin binds to through the generic pass (twists and eyes are assigned afterwards). */
const SKIN_JOINTS = HUMAN_JOINTS.filter((j) => !j.endsWith('Twist') && !j.endsWith('Eye'));

/**
 * Field-aware weights (finish.ts's rule: a bone only claims a vertex it can reach without leaving the solid), then
 * the twist joints take their share along the limb, and the face is held rigid to the head.
 */
export function humanSkinWeights(mesh: BodyMesh, anatomy: HumanAnatomy, field: ReturnType<typeof fieldOf>) {
  const plan = { bones: SKIN_JOINTS.map((j) => anatomy.byName[j]) } as unknown as Parameters<typeof skinWeights>[2];
  const { skinIndex, skinWeight } = skinWeights(mesh.positions, mesh.indices, plan, field.d);
  const jointIndex = (j: string) => HUMAN_JOINTS.indexOf(j as HumanJoint);
  const n = mesh.positions.length / 3;
  for (let v = 0; v < n * 4; v++) skinIndex[v] = jointIndex(SKIN_JOINTS[skinIndex[v]]);
  // Twist: split the parent's weight along the limb.
  for (const [twist, t] of Object.entries(TWIST_JOINTS)) {
    const parent = anatomy.byName[t.parent as HumanJoint];
    const pi = jointIndex(t.parent), ti = jointIndex(twist);
    const ax = sub3(parent.tip, parent.at), l2 = dot3(ax, ax);
    for (let v = 0; v < n; v++) {
      for (let s = 0; s < 4; s++) {
        if (skinIndex[v * 4 + s] !== pi || skinWeight[v * 4 + s] <= 0) continue;
        const p: Vec3 = [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
        const along = dot3(sub3(p, parent.at), ax) / l2;
        const ramp = smooth01((along - t.from) / (t.to - t.from));
        const w = skinWeight[v * 4 + s];
        // put the twist share in a free slot, or the smallest one
        let slot = -1, smallest = 1e9;
        for (let q = 0; q < 4; q++) { if (skinWeight[v * 4 + q] === 0) { slot = q; break; } if (skinWeight[v * 4 + q] < smallest) { smallest = skinWeight[v * 4 + q]; slot = q; } }
        if (slot === s || ramp <= 0.001) continue;
        const moved = w * ramp;
        if (skinWeight[v * 4 + slot] > 0 && skinIndex[v * 4 + slot] !== ti) skinWeight[v * 4 + s] += skinWeight[v * 4 + slot];
        skinIndex[v * 4 + slot] = ti;
        skinWeight[v * 4 + slot] = moved;
        skinWeight[v * 4 + s] = w - moved;
      }
    }
  }
  // Face and skull: one bone. The head turns as a piece; the jaw and lips move by shape, not by weight.
  const head = anatomy.byName.Head, hi = jointIndex('Head');
  for (let v = 0; v < n; v++) {
    const y = mesh.positions[v * 3 + 1];
    const t = smooth01((y - (head.at[1] - 0.005)) / 0.035);
    if (t <= 0) continue;
    let other = 0;
    for (let s = 0; s < 4; s++) if (skinIndex[v * 4 + s] !== hi) other += skinWeight[v * 4 + s];
    let hs = -1;
    for (let s = 0; s < 4; s++) if (skinIndex[v * 4 + s] === hi && skinWeight[v * 4 + s] > 0) hs = s;
    if (hs < 0) { let min = 1e9; for (let s = 0; s < 4; s++) if (skinWeight[v * 4 + s] < min) { min = skinWeight[v * 4 + s]; hs = s; } other -= skinWeight[v * 4 + hs]; skinIndex[v * 4 + hs] = hi; skinWeight[v * 4 + hs] = 0; }
    const keep = other * (1 - t);
    for (let s = 0; s < 4; s++) {
      if (s === hs) continue;
      skinWeight[v * 4 + s] = other > 0 ? (skinWeight[v * 4 + s] / other) * keep : 0;
    }
    skinWeight[v * 4 + hs] = 1 - keep;
  }
  return { skinIndex, skinWeight };
}

// ---- Dual-quaternion skinning on the CPU (the same algebra the engine's skinning node runs) ------------------

export interface DualQuat { r: [number, number, number, number]; d: [number, number, number, number] }

/** Joint world transform (rest orientation identity) → the dual quaternion that maps rest positions to posed. */
export function jointDualQuats(anatomy: HumanAnatomy, xf: Map<string, JointXf>, joints: readonly string[] = HUMAN_JOINTS): DualQuat[] {
  return joints.map((name) => {
    const x = xf.get(name)!;
    const rest = anatomy.byName[name as HumanJoint].at;
    // p' = R (p - rest) + t  →  translation part T = t - R·rest
    const rr = qrot(x.q, rest);
    const T: Vec3 = [x.t[0] - rr[0], x.t[1] - rr[1], x.t[2] - rr[2]];
    const r = x.q;
    const d = qmul([T[0], T[1], T[2], 0], r).map((c) => c * 0.5) as [number, number, number, number];
    return { r: [...r] as [number, number, number, number], d };
  });
}

export function dqBlend(dqs: DualQuat[], idx: ArrayLike<number>, w: ArrayLike<number>, o: number): DualQuat {
  const r = [0, 0, 0, 0], d = [0, 0, 0, 0];
  const r0 = dqs[idx[o]].r;
  for (let s = 0; s < 4; s++) {
    const ws = w[o + s];
    if (ws <= 0) continue;
    const q = dqs[idx[o + s]];
    const sign = q.r[0] * r0[0] + q.r[1] * r0[1] + q.r[2] * r0[2] + q.r[3] * r0[3] < 0 ? -1 : 1;
    for (let c = 0; c < 4; c++) { r[c] += q.r[c] * ws * sign; d[c] += q.d[c] * ws * sign; }
  }
  const l = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
  return { r: r.map((c) => c / l) as DualQuat['r'], d: d.map((c) => c / l) as DualQuat['d'] };
}

export function dqApply(q: DualQuat, p: Vec3): Vec3 {
  const rp = qrot(q.r, p);
  // translation = 2 · d · conj(r)
  const t = qmul(q.d, [-q.r[0], -q.r[1], -q.r[2], q.r[3]]);
  return [rp[0] + 2 * t[0], rp[1] + 2 * t[1], rp[2] + 2 * t[2]];
}

// ---- Corrective shapes ---------------------------------------------------------------------------------------

export interface CorrectiveSpec {
  name: string;
  pose: HumanPose;
  /** The joint whose bend this fixes; the shape fades out with distance from it. */
  joint: HumanJoint;
  reach: number;
}

/**
 * Bake a corrective: skin the rest mesh into the pose with dual quaternions, pull each skinned vertex onto the posed
 * field (the anatomy re-posed, muscles shortened and thickened), and store the difference in bind space. Near the
 * joint only, smoothed, so a shape never moves skin the bend didn't touch.
 */
export function bakeCorrective(
  mesh: BodyMesh, skin: { skinIndex: Uint16Array; skinWeight: Float32Array },
  anatomy: HumanAnatomy, restField: ReturnType<typeof fieldOf>, spec: CorrectiveSpec,
): Float32Array {
  const xf = poseJoints(anatomy, spec.pose);
  const posed = fieldOf(posedParts(anatomy, xf), bodyExtra(anatomy));
  const dqs = jointDualQuats(anatomy, xf);
  const n = mesh.positions.length / 3;
  const delta = new Float32Array(n * 3);
  const centre = anatomy.byName[spec.joint].at;
  const fade = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const p: Vec3 = [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
    const dist = Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
    const f = 1 - smooth01((dist - spec.reach * 0.55) / (spec.reach * 0.45));
    fade[v] = f;
    if (f <= 0) continue;
    const q = dqBlend(dqs, skin.skinIndex, skin.skinWeight, v * 4);
    const s = dqApply(q, p);
    // where the posed anatomy says this bit of skin is
    let x = s[0], y = s[1], z = s[2];
    for (let it = 0; it < 4; it++) {
      const dd = posed.d(x, y, z);
      if (Math.abs(dd) < 2e-5) break;
      const g = posed.grad(x, y, z);
      const step = Math.max(-0.03, Math.min(0.03, dd));
      x -= g[0] * step; y -= g[1] * step; z -= g[2] * step;
    }
    // the rest mesh already sits a hair off its own field; don't bake that in
    const r0 = restField.d(p[0], p[1], p[2]);
    const g0 = restField.grad(p[0], p[1], p[2]);
    const rest: Vec3 = qrot(q.r, [-g0[0] * r0, -g0[1] * r0, -g0[2] * r0]);
    const w: Vec3 = [x - s[0] - rest[0], y - s[1] - rest[1], z - s[2] - rest[2]];
    // back to bind space: undo the vertex's blended rotation
    const b = qrot([-q.r[0], -q.r[1], -q.r[2], q.r[3]], w);
    delta[v * 3] = b[0] * f; delta[v * 3 + 1] = b[1] * f; delta[v * 3 + 2] = b[2] * f;
  }
  // smooth the delta field over the surface; projection picks the nearest sheet, which is noisy in deep folds
  const nb = neighbours(mesh.indices, n);
  for (let pass = 0; pass < 4; pass++) {
    const next = delta.slice();
    for (let v = 0; v < n; v++) {
      if (fade[v] <= 0 || !nb[v].length) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const o of nb[v]) { sx += delta[o * 3]; sy += delta[o * 3 + 1]; sz += delta[o * 3 + 2]; }
      const k = nb[v].length;
      next[v * 3] = delta[v * 3] * 0.4 + (sx / k) * 0.6;
      next[v * 3 + 1] = delta[v * 3 + 1] * 0.4 + (sy / k) * 0.6;
      next[v * 3 + 2] = delta[v * 3 + 2] * 0.4 + (sz / k) * 0.6;
    }
    delta.set(next);
  }
  // clamp outliers (a vertex that snapped across the crease to the other limb)
  for (let v = 0; v < n; v++) {
    const l = Math.hypot(delta[v * 3], delta[v * 3 + 1], delta[v * 3 + 2]);
    if (l > 0.035) { const k = 0.035 / l; delta[v * 3] *= k; delta[v * 3 + 1] *= k; delta[v * 3 + 2] *= k; }
  }
  return delta;
}

/** The face shell as an extra field (rest position; the corrective poses never move the head). */
export function bodyExtra(anatomy: HumanAnatomy) {
  return { d: shellField(anatomy.faceShell.points, anatomy.faceShell.indices, anatomy.faceShell.thickness), blend: 0.004 };
}
/** The whole body's field: clay parts plus the face. */
export function bodyField(anatomy: HumanAnatomy) { return fieldOf(anatomy.parts, bodyExtra(anatomy)); }

// ---- Fitting other meshes to the body --------------------------------------------------------------------------

/** Nearest body vertex for each point (grid hash; the body is a few tens of thousands of vertices). */
export function nearestOnBody(body: BodyMesh, points: Float32Array): Int32Array {
  const cell = 0.03;
  const grid = new Map<string, number[]>();
  const n = body.positions.length / 3;
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (let v = 0; v < n; v++) {
    const k = key(body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]);
    const l = grid.get(k); if (l) l.push(v); else grid.set(k, [v]);
  }
  const m = points.length / 3;
  const out = new Int32Array(m).fill(-1);
  for (let i = 0; i < m; i++) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
    let best = Infinity, bi = -1;
    for (let r = 1; r <= 6 && bi < 0; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const l = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!l) continue;
        for (const v of l) {
          const d2 = (body.positions[v * 3] - x) ** 2 + (body.positions[v * 3 + 1] - y) ** 2 + (body.positions[v * 3 + 2] - z) ** 2;
          if (d2 < best) { best = d2; bi = v; }
        }
      }
    }
    out[i] = bi;
  }
  return out;
}

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const smooth01 = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
export type { HumanPose };
