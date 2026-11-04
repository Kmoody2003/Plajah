/**
 * finish.ts — clay into a real model: mesh, skin weights, live muscle, UV atlas, painted texture, fur map.
 *
 * Runs in a worker. The field is the source of truth for everything: a bone only claims a vertex it can reach
 * without leaving the solid, so an arm never drags the ribs next to it and one leg never moves the other.
 */

import { meshFromField, type ClayFieldSnapshot, type Vec3 } from '../engine';
import { BRICK_STRIDE, BRICK_VOXELS } from '../brickPool';
import type { Anatomy, Bone, JointName } from './anatomy';
import type { FurRegion, SurfaceBrief } from './codex';

export interface MuscleInfluence { id: string; label: string; verts: Uint32Array; amounts: Float32Array }

export interface CreatureModel {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  furLength: Float32Array;
  furDir: Float32Array;
  muscles: MuscleInfluence[];
  /** The body with its joints settled into this clay; the skeleton must be built from this one. */
  anatomy: Anatomy;
  textureSize: number;
  texture: Uint8ClampedArray;
  normalSize: number;
  normalMap: Uint8ClampedArray | null;
  /** Longest fur in world units, zero for a bare creature. */
  furReach: number;
  stats: { vertices: number; triangles: number; charts: number; ms: number };
}

/** One side of a character sheet, in shared height. h runs along the picture's width. */
export interface PaintView {
  role: 'front' | 'side' | 'back';
  box: { u0: number; v0: number; u1: number; v1: number };
  h0: number; h1: number; y0: number; y1: number;
}

/** A picture the model should be painted from, and where it lands on the body. */
export interface PicturePaint {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** World-space box the picture's `box` covers, seen from the front. */
  worldBox: { x0: number; y0: number; x1: number; y1: number };
  box: { u0: number; v0: number; u1: number; v1: number };
  mask?: Float32Array;
  maskSize?: number;
  /** A sheet paints from several sides. */
  views?: PaintView[];
  /** Near is larger. Features from this are pressed into the front of the mesh. */
  depth?: Float32Array;
  depthSize?: number;
}

export interface FinishOptions {
  stride?: number;
  textureSize?: number;
  /** Normal map size, 0 for none. It carries sculpted detail the mesh is too coarse to hold. */
  normalSize?: number;
  /** The clay isn't this plan's own bake, so proportions must be fitted first. */
  fitToClay?: boolean;
  picture?: PicturePaint | null;
  onProgress?: (fraction: number, label: string) => void;
}

const hex = (c: string): Vec3 => [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Distance sample anywhere in the domain, trilinear inside bricks. */
export function fieldSampler(field: ClayFieldSnapshot) {
  const { grid, band, states, cells, values } = field;
  const res = grid * BRICK_VOXELS;
  const count = BRICK_STRIDE ** 3;
  const index = new Map<number, number>();
  cells.forEach((c, i) => index.set(c, i));
  const at = (x: number, y: number, z: number) => {
    const cx = Math.min(grid - 1, Math.max(0, Math.floor(x / BRICK_VOXELS)));
    const cy = Math.min(grid - 1, Math.max(0, Math.floor(y / BRICK_VOXELS)));
    const cz = Math.min(grid - 1, Math.max(0, Math.floor(z / BRICK_VOXELS)));
    const cell = cx + grid * (cy + grid * cz);
    const brick = index.get(cell);
    if (brick === undefined) return states[cell] ? -band : band;
    const lx = x - cx * BRICK_VOXELS + 1, ly = y - cy * BRICK_VOXELS + 1, lz = z - cz * BRICK_VOXELS + 1;
    return values[brick * count + lx + BRICK_STRIDE * (ly + BRICK_STRIDE * lz)];
  };
  return (wx: number, wy: number, wz: number) => {
    const x = Math.max(0, Math.min(res - 1, ((wx + 1) / 2) * res));
    const y = Math.max(0, Math.min(res - 1, ((wy + 1) / 2) * res));
    const z = Math.max(0, Math.min(res - 1, ((wz + 1) / 2) * res));
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const fx = x - x0, fy = y - y0, fz = z - z0;
    const c00 = at(x0, y0, z0) * (1 - fx) + at(x0 + 1, y0, z0) * fx;
    const c10 = at(x0, y0 + 1, z0) * (1 - fx) + at(x0 + 1, y0 + 1, z0) * fx;
    const c01 = at(x0, y0, z0 + 1) * (1 - fx) + at(x0 + 1, y0, z0 + 1) * fx;
    const c11 = at(x0, y0 + 1, z0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1, z0 + 1) * fx;
    return (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  };
}

/**
 * Pulls each joint to the middle of the clay around it, so a body that was sculpted after it was built,
 * or an imported form fitted by proportion, still gets bones down the centre of its limbs.
 */
export function fitBonesToField(anatomy: Anatomy, field: ClayFieldSnapshot): Anatomy {
  const sample = fieldSampler(field);
  const moved = new Map<JointName, Vec3>();
  for (const bone of anatomy.bones) {
    let [x, y, z] = bone.at;
    const reach = Math.max(bone.radius * 1.5, 0.012);
    const step = reach * 0.2;
    const h = 0.008;
    for (let i = 0; i < 8; i++) {
      const gx = sample(x + h, y, z) - sample(x - h, y, z);
      const gy = sample(x, y + h, z) - sample(x, y - h, z);
      const gz = sample(x, y, z + h) - sample(x, y, z - h);
      const len = Math.hypot(gx, gy, gz);
      if (len < 1e-5) break;
      x -= (gx / len) * step; y -= (gy / len) * step; z -= (gz / len) * step;
      const away = Math.hypot(x - bone.at[0], y - bone.at[1], z - bone.at[2]);
      if (away > reach) {
        const k = reach / away;
        x = bone.at[0] + (x - bone.at[0]) * k; y = bone.at[1] + (y - bone.at[1]) * k; z = bone.at[2] + (z - bone.at[2]) * k;
      }
    }
    moved.set(bone.name, [x, y, z]);
  }
  const bones: Bone[] = anatomy.bones.map((bone) => {
    const at = moved.get(bone.name)!;
    const child = anatomy.bones.find((b) => b.parent === bone.name && Math.hypot(b.at[0] - bone.tip[0], b.at[1] - bone.tip[1], b.at[2] - bone.tip[2]) < 1e-5);
    const delta: Vec3 = [at[0] - bone.at[0], at[1] - bone.at[1], at[2] - bone.at[2]];
    const tip: Vec3 = child ? moved.get(child.name)! : [bone.tip[0] + delta[0], bone.tip[1] + delta[1], bone.tip[2] + delta[2]];
    return { ...bone, at, tip };
  });
  return { ...anatomy, bones, byName: Object.fromEntries(bones.map((b) => [b.name, b])) as Record<JointName, Bone> };
}

function segmentClosest(p: Vec3, a: Vec3, b: Vec3): { t: number; dist: number; x: number; y: number; z: number } {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  const t = l2 > 1e-10 ? clamp01(((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (p[2] - a[2]) * bz) / l2) : 0;
  const x = a[0] + bx * t, y = a[1] + by * t, z = a[2] + bz * t;
  return { t, dist: Math.hypot(p[0] - x, p[1] - y, p[2] - z), x, y, z };
}

/** Mesh pieces smaller than this are specks from the surface extraction, not parts. */
function keepConnected(mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }, minVerts = 40) {
  const n = mesh.positions.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = find(mesh.indices[i]), b = find(mesh.indices[i + 1]), c = find(mesh.indices[i + 2]);
    parent[b] = a; parent[find(c)] = a;
  }
  const size = new Int32Array(n);
  for (let i = 0; i < n; i++) size[find(i)]++;
  const remap = new Int32Array(n).fill(-1);
  let kept = 0;
  for (let i = 0; i < n; i++) if (size[find(i)] >= minVerts) remap[i] = kept++;
  const positions = new Float32Array(kept * 3), normals = new Float32Array(kept * 3);
  for (let i = 0; i < n; i++) {
    if (remap[i] < 0) continue;
    positions.set(mesh.positions.subarray(i * 3, i * 3 + 3), remap[i] * 3);
    normals.set(mesh.normals.subarray(i * 3, i * 3 + 3), remap[i] * 3);
  }
  const indices: number[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = remap[mesh.indices[i]], b = remap[mesh.indices[i + 1]], c = remap[mesh.indices[i + 2]];
    if (a >= 0 && b >= 0 && c >= 0) indices.push(a, b, c);
  }
  return { positions, normals, indices: new Uint32Array(indices) };
}

/** Fills holes in the vertex neighbours list and evens out the staircase surface nets leaves at low resolution. */
function relax(positions: Float32Array, indices: Uint32Array, passes: number, amount: number) {
  const n = positions.length / 3;
  for (let pass = 0; pass < passes; pass++) {
    const sum = new Float32Array(n * 3), count = new Uint16Array(n);
    for (let i = 0; i < indices.length; i += 3) {
      for (let e = 0; e < 3; e++) {
        const a = indices[i + e], b = indices[i + (e + 1) % 3];
        sum[a * 3] += positions[b * 3]; sum[a * 3 + 1] += positions[b * 3 + 1]; sum[a * 3 + 2] += positions[b * 3 + 2];
        sum[b * 3] += positions[a * 3]; sum[b * 3 + 1] += positions[a * 3 + 1]; sum[b * 3 + 2] += positions[a * 3 + 2];
        count[a]++; count[b]++;
      }
    }
    for (let v = 0; v < n; v++) {
      if (!count[v]) continue;
      for (let k = 0; k < 3; k++) positions[v * 3 + k] += (sum[v * 3 + k] / count[v] - positions[v * 3 + k]) * amount;
    }
  }
}

function recomputeNormals(positions: Float32Array, indices: Uint32Array) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const at of [a, b, c]) { normals[at] += nx; normals[at + 1] += ny; normals[at + 2] += nz; }
  }
  for (let v = 0; v < normals.length; v += 3) {
    const l = Math.hypot(normals[v], normals[v + 1], normals[v + 2]) || 1;
    normals[v] /= l; normals[v + 1] /= l; normals[v + 2] /= l;
  }
  return normals;
}

/**
 * Bones to vertices. Distance from each bone counts less the further inside its limb's radius a vertex is,
 * and a bone is ruled out when the straight line to it leaves the solid.
 */
export function skinWeights(positions: Float32Array, indices: Uint32Array, anatomy: Anatomy, sample: (x: number, y: number, z: number) => number) {
  const n = positions.length / 3;
  const bones = anatomy.bones;
  const scores = new Float32Array(bones.length);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const p: Vec3 = [0, 0, 0];
  const order = bones.map((_, i) => i);
  for (let v = 0; v < n; v++) {
    p[0] = positions[v * 3]; p[1] = positions[v * 3 + 1]; p[2] = positions[v * 3 + 2];
    for (let b = 0; b < bones.length; b++) {
      const hit = segmentClosest(p, bones[b].at, bones[b].tip);
      scores[b] = Math.max(hit.dist - bones[b].radius * 0.5, 0.002);
    }
    order.sort((a, c) => scores[a] - scores[c]);
    let total = 0, kept = 0;
    for (let k = 0; k < 7 && kept < 4; k++) {
      const b = order[k];
      const hit = segmentClosest(p, bones[b].at, bones[b].tip);
      let solid = true;
      if (k > 0) {
        for (let s = 1; s < 6 && solid; s++) {
          const t = s / 6;
          const d = sample(p[0] + (hit.x - p[0]) * t, p[1] + (hit.y - p[1]) * t, p[2] + (hit.z - p[2]) * t);
          if (d > 0.012) solid = false;
        }
      }
      if (!solid) continue;
      const w = 1 / scores[b] ** 3;
      skinIndex[v * 4 + kept] = b;
      skinWeight[v * 4 + kept] = w;
      total += w;
      kept++;
    }
    for (let k = 0; k < kept; k++) skinWeight[v * 4 + k] /= total;
  }

  // Smoothing across the surface softens the crease where one bone's region ends and the next begins.
  const dense = new Float32Array(n * bones.length);
  for (let v = 0; v < n; v++) for (let k = 0; k < 4; k++) if (skinWeight[v * 4 + k] > 0) dense[v * bones.length + skinIndex[v * 4 + k]] = skinWeight[v * 4 + k];
  const neighbours: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < indices.length; i += 3) {
    for (let e = 0; e < 3; e++) neighbours[indices[i + e]].push(indices[i + (e + 1) % 3]);
  }
  for (let pass = 0; pass < 3; pass++) {
    const next = dense.slice();
    for (let v = 0; v < n; v++) {
      const list = neighbours[v];
      if (!list.length) continue;
      for (let b = 0; b < bones.length; b++) {
        let sum = 0;
        for (const o of list) sum += dense[o * bones.length + b];
        next[v * bones.length + b] = dense[v * bones.length + b] * 0.5 + (sum / list.length) * 0.5;
      }
    }
    dense.set(next);
  }
  for (let v = 0; v < n; v++) {
    const row = v * bones.length;
    const top: [number, number][] = [];
    for (let b = 0; b < bones.length; b++) if (dense[row + b] > 1e-3) top.push([b, dense[row + b]]);
    top.sort((a, c) => c[1] - a[1]);
    let total = 0;
    for (let k = 0; k < Math.min(4, top.length); k++) total += top[k][1];
    for (let k = 0; k < 4; k++) {
      skinIndex[v * 4 + k] = k < top.length ? top[k][0] : 0;
      skinWeight[v * 4 + k] = k < top.length && total > 0 ? top[k][1] / total : 0;
    }
    if (!top.length) skinWeight[v * 4] = 1;
  }
  return { skinIndex, skinWeight };
}

/** Where each muscle's bulge lands: strongest over the belly, nothing past its ends. */
export function muscleInfluences(positions: Float32Array, anatomy: Anatomy): MuscleInfluence[] {
  const n = positions.length / 3;
  const out: MuscleInfluence[] = [];
  const p: Vec3 = [0, 0, 0];
  for (const m of anatomy.muscles) {
    const af = anatomy.byName[m.from.joint].at, at = anatomy.byName[m.to.joint].at;
    const a: Vec3 = [af[0] + m.from.offset[0], af[1] + m.from.offset[1], af[2] + m.from.offset[2]];
    const b: Vec3 = [at[0] + m.to.offset[0], at[1] + m.to.offset[1], at[2] + m.to.offset[2]];
    const verts: number[] = [], amounts: number[] = [];
    const reach = m.radius * 2.1;
    for (let v = 0; v < n; v++) {
      p[0] = positions[v * 3]; p[1] = positions[v * 3 + 1]; p[2] = positions[v * 3 + 2];
      const hit = segmentClosest(p, a, b);
      if (hit.dist > reach) continue;
      const along = Math.sin(Math.PI * clamp01(hit.t * (0.5 / m.belly) * (hit.t < m.belly ? 1 : 0) + (hit.t >= m.belly ? 0.5 + (hit.t - m.belly) / (1 - m.belly) * 0.5 : 0)));
      const across = Math.exp(-((hit.dist / (m.radius * 1.15)) ** 2));
      const w = along * across;
      if (w < 0.02) continue;
      verts.push(v);
      amounts.push(w * m.radius);
    }
    out.push({ id: m.id, label: m.label, verts: new Uint32Array(verts), amounts: new Float32Array(amounts) });
  }
  return out;
}

/** Each vertex's fur: length from its body region, lying along the bone toward the bone's tip. */
export function furMap(positions: Float32Array, normals: Float32Array, skinIndex: Uint16Array, skinWeight: Float32Array, anatomy: Anatomy, surface: SurfaceBrief) {
  const n = positions.length / 3;
  const furLength = new Float32Array(n);
  const furDir = new Float32Array(n * 3);
  if (surface.furLength <= 0) return { furLength, furDir };
  const by = surface.furBy;
  const lengthOf = (region: FurRegion) => (by[region] ?? 0) * surface.furLength;
  const head = anatomy.byName.head, headR = head.radius, nose = anatomy.byName.muzzle.tip;
  for (let v = 0; v < n; v++) {
    const nx = normals[v * 3], ny = normals[v * 3 + 1], nz = normals[v * 3 + 2];
    let len = 0, dx = 0, dy = 0, dz = 0;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight[v * 4 + k];
      if (w <= 0) continue;
      const bone = anatomy.bones[skinIndex[v * 4 + k]];
      let region = bone.fur;
      // The trunk is one bone chain but several coats: back, chest and belly differ by which way the skin faces.
      if (bone.name === 'hips' || bone.name === 'spine' || bone.name === 'chest') {
        const facesBack = anatomy.tune.quadruped > 0.5 ? ny > 0.1 : nz < -0.1;
        region = facesBack ? 'back' : bone.name === 'chest' ? 'chest' : 'belly';
      }
      len += w * lengthOf(region);
      // Fur grows away from the head on the trunk and toward the tip on a limb.
      const towardTip = bone.name === 'hips' || bone.name === 'spine' || bone.name === 'chest' || bone.name === 'neck' ? -1 : 1;
      dx += w * (bone.tip[0] - bone.at[0]) * towardTip;
      dy += w * (bone.tip[1] - bone.at[1]) * towardTip;
      dz += w * (bone.tip[2] - bone.at[2]) * towardTip;
    }
    // Lies flat against the skin, with a pull toward the ground.
    dy -= 0.04;
    const along = dx * nx + dy * ny + dz * nz;
    dx -= along * nx; dy -= along * ny; dz -= along * nz;
    const l = Math.hypot(dx, dy, dz) || 1;
    furDir[v * 3] = dx / l; furDir[v * 3 + 1] = dy / l; furDir[v * 3 + 2] = dz / l;
    // Eyes, nose and lips stay bare, or the face disappears into the coat.
    const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
    const toEye = Math.hypot(Math.abs(px - head.at[0]) - headR * 0.36, py - (head.at[1] + headR * 0.08), pz - (head.at[2] + headR * 0.72));
    const toNose = Math.hypot(px - nose[0], py - nose[1], pz - nose[2]);
    const bare = Math.min(clamp01((toEye - headR * 0.16) / (headR * 0.22)), clamp01((toNose - headR * 0.3) / (headR * 0.5)));
    furLength[v] = len * bare;
  }
  return { furLength, furDir };
}

interface Charted {
  positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array;
  /** The original vertex behind each new one. */
  source: Uint32Array; charts: number;
}

/**
 * A plain UV atlas: triangles grouped by which way they face, each connected group projected flat and packed
 * on shelves. All charts share one scale, so fur strands keep the same density everywhere.
 */
export function atlasUv(positions: Float32Array, normals: Float32Array, indices: Uint32Array, textureSize: number): Charted {
  const triCount = indices.length / 3;
  const axisOf = new Uint8Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    axisOf[t] = ax >= ay && ax >= az ? (nx > 0 ? 0 : 1) : ay >= az ? (ny > 0 ? 2 : 3) : nz > 0 ? 4 : 5;
  }
  const edges = new Map<number, number>();
  const neighbours = new Int32Array(triCount * 3).fill(-1);
  const vertCount = positions.length / 3;
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const a = indices[t * 3 + e], b = indices[t * 3 + (e + 1) % 3];
      const key = a < b ? a * vertCount + b : b * vertCount + a;
      const other = edges.get(key);
      if (other === undefined) edges.set(key, t * 3 + e);
      else {
        neighbours[t * 3 + e] = Math.floor(other / 3);
        neighbours[other] = t;
      }
    }
  }
  const chartOf = new Int32Array(triCount).fill(-1);
  const charts: number[][] = [];
  const stack: number[] = [];
  for (let start = 0; start < triCount; start++) {
    if (chartOf[start] >= 0) continue;
    const id = charts.length;
    const list: number[] = [];
    chartOf[start] = id;
    stack.push(start);
    while (stack.length) {
      const t = stack.pop()!;
      list.push(t);
      for (let e = 0; e < 3; e++) {
        const o = neighbours[t * 3 + e];
        if (o >= 0 && chartOf[o] < 0 && axisOf[o] === axisOf[t]) { chartOf[o] = id; stack.push(o); }
      }
    }
    charts.push(list);
  }

  const outPos: number[] = [], outNorm: number[] = [], outSource: number[] = [], raw: number[] = [], outIdx: number[] = [];
  const boxes: { id: number; first: number; count: number; w: number; h: number; x0: number; y0: number }[] = [];
  const local = new Map<number, number>();
  charts.forEach((list, id) => {
    local.clear();
    const axis = axisOf[list[0]];
    const iu = axis < 2 ? 2 : 0, iv = axis >= 2 && axis < 4 ? 2 : 1;
    const first = outSource.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const t of list) for (let e = 0; e < 3; e++) {
      const v = indices[t * 3 + e];
      let at = local.get(v);
      if (at === undefined) {
        at = outSource.length;
        local.set(v, at);
        outSource.push(v);
        for (let k = 0; k < 3; k++) { outPos.push(positions[v * 3 + k]); outNorm.push(normals[v * 3 + k]); }
        const u = positions[v * 3 + iu], w = positions[v * 3 + iv];
        raw.push(u, w);
        x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, w); y1 = Math.max(y1, w);
      }
      outIdx.push(at);
    }
    boxes.push({ id, first, count: outSource.length - first, w: x1 - x0, h: y1 - y0, x0, y0 });
  });

  // Finds the scale that fills the atlas: shelves are cheap to test, so it searches rather than estimates.
  const sorted = [...boxes].sort((a, b) => b.h - a.h);
  const pad = 3;
  const place = (scale: number) => {
    const spots = new Map<number, [number, number]>();
    let x = pad, y = pad, row = 0;
    for (const box of sorted) {
      const w = Math.ceil(box.w * scale) + pad * 2, h = Math.ceil(box.h * scale) + pad * 2;
      if (x + w > textureSize) { x = pad; y += row; row = 0; }
      if (y + h > textureSize) return null;
      spots.set(box.id, [x + pad, y + pad]);
      x += w;
      row = Math.max(row, h);
    }
    return spots;
  };
  let lo = 8, hi = textureSize * 4;
  let best = place(lo);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const spots = place(mid);
    if (spots) { lo = mid; best = spots; } else hi = mid;
  }
  if (!best) throw new Error('This form is too broken up to fit on one texture.');
  const uvs = new Float32Array(outSource.length * 2);
  for (const box of boxes) {
    const [ox, oy] = best.get(box.id)!;
    for (let i = box.first; i < box.first + box.count; i++) {
      uvs[i * 2] = (ox + (raw[i * 2] - box.x0) * lo) / textureSize;
      uvs[i * 2 + 1] = (oy + (raw[i * 2 + 1] - box.y0) * lo) / textureSize;
    }
  }
  return {
    positions: new Float32Array(outPos), normals: new Float32Array(outNorm), uvs,
    indices: new Uint32Array(outIdx), source: new Uint32Array(outSource), charts: charts.length,
  };
}

/** Colours a surface: the coat from the plan and picture, darker roots and extremities, and bare places left bare. */
function paintTexture(mesh: Charted, skinIndex: Uint16Array, skinWeight: Float32Array, anatomy: Anatomy, surface: SurfaceBrief, picture: PicturePaint | null | undefined, size: number) {
  const palette = picture ? palettePicture(picture) ?? surface.colors : surface.colors;
  const base = hex(palette.base), under = hex(palette.under), accent = hex(palette.accent);
  const n = mesh.positions.length / 3;
  const vertexColor = new Float32Array(n * 3);
  const headR = anatomy.byName.head.radius;
  const eyeL: Vec3 = [anatomy.byName.head.at[0] + headR * 0.36, anatomy.byName.head.at[1] + headR * 0.08, anatomy.byName.head.at[2] + headR * 0.72];
  const noseAt = anatomy.byName.muzzle.tip;
  for (let v = 0; v < n; v++) {
    const s = mesh.source[v];
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
    const nz = mesh.normals[v * 3 + 2], ny = mesh.normals[v * 3 + 1];
    // The coat is paler underneath and on the front of the torso.
    let bellyness = clamp01(anatomy.tune.quadruped > 0.5 ? -ny * 1.4 : nz * 0.7 - 0.05);
    let dark = 0;
    for (let k = 0; k < 4; k++) {
      const w = skinWeight[s * 4 + k];
      const name = anatomy.bones[skinIndex[s * 4 + k]].name;
      if (name.startsWith('finger') || name.startsWith('toes') || name.startsWith('foot') || name.startsWith('hand') || name === 'tailTip') dark += w * 0.75;
      if (name.startsWith('ear')) dark += w * 0.45;
      if (name === 'head' || name.startsWith('upperArm') || name.startsWith('thigh')) bellyness *= 1 - w * 0.6;
    }
    const noseD = Math.hypot(x - noseAt[0], y - noseAt[1], z - noseAt[2]);
    if (noseD < headR * 0.2) dark = Math.max(dark, 1);
    const eyeD = Math.hypot(Math.abs(x) - Math.abs(eyeL[0]), y - eyeL[1], z - eyeL[2]);
    const eye = eyeD < headR * 0.1 && nz > 0.1 ? 1 : 0;
    // Dark lids and socket: without them a bare eye reads as a pale ring.
    if (eyeD < headR * 0.3) dark = Math.max(dark, 0.9);
    for (let k = 0; k < 3; k++) {
      let c = base[k] + (under[k] - base[k]) * bellyness;
      c += (accent[k] - c) * clamp01(dark);
      if (eye) c = [0.8, 0.5, 0.12][k];
      vertexColor[v * 3 + k] = c;
    }
  }
  const texture = new Uint8ClampedArray(size * size * 4);
  const filled = new Uint8Array(size * size);
  const pic = picture;
  const { uvs, indices, positions, normals } = mesh;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ax = uvs[a * 2] * size, ay = uvs[a * 2 + 1] * size, bx = uvs[b * 2] * size, by = uvs[b * 2 + 1] * size, cx = uvs[c * 2] * size, cy = uvs[c * 2 + 1] * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-6) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const i = x + y * size;
      let r = vertexColor[a * 3] * w0 + vertexColor[b * 3] * w1 + vertexColor[c * 3] * w2;
      let g = vertexColor[a * 3 + 1] * w0 + vertexColor[b * 3 + 1] * w1 + vertexColor[c * 3 + 1] * w2;
      let bl = vertexColor[a * 3 + 2] * w0 + vertexColor[b * 3 + 2] * w1 + vertexColor[c * 3 + 2] * w2;
      const wx = positions[a * 3] * w0 + positions[b * 3] * w1 + positions[c * 3] * w2;
      const wy = positions[a * 3 + 1] * w0 + positions[b * 3 + 1] * w1 + positions[c * 3 + 1] * w2;
      const wz = positions[a * 3 + 2] * w0 + positions[b * 3 + 2] * w1 + positions[c * 3 + 2] * w2;
      // Blotches, so a coat isn't one flat colour where the picture doesn't reach.
      const blotch = 0.92 + 0.16 * softNoise(wx * 9, wy * 9, wz * 9);
      r *= blotch; g *= blotch; bl *= blotch;
      if (pic?.views) {
        const nw: Vec3 = [normals[a * 3] * w0 + normals[b * 3] * w1 + normals[c * 3] * w2, normals[a * 3 + 1] * w0 + normals[b * 3 + 1] * w1 + normals[c * 3 + 1] * w2, normals[a * 3 + 2] * w0 + normals[b * 3 + 2] * w1 + normals[c * 3 + 2] * w2];
        let total = 0, sr = 0, sg = 0, sb = 0;
        for (const view of pic.views) {
          const facing = view.role === 'front' ? nw[2] : view.role === 'back' ? -nw[2] : Math.abs(nw[0]);
          if (facing <= 0.05) continue;
          const h = view.role === 'front' ? wx : view.role === 'back' ? -wx : -wz;
          const fx = (h - view.h0) / (view.h1 - view.h0), fy = (wy - view.y0) / (view.y1 - view.y0);
          if (fx < 0 || fx > 1 || fy < 0 || fy > 1) continue;
          const u = view.box.u0 + fx * (view.box.u1 - view.box.u0), v = view.box.v1 - fy * (view.box.v1 - view.box.v0);
          const si = (Math.min(pic.width - 1, Math.floor(u * pic.width)) + Math.min(pic.height - 1, Math.floor(v * pic.height)) * pic.width) * 4;
          const weight = facing * facing * facing;
          sr += (pic.rgba[si] / 255) * weight; sg += (pic.rgba[si + 1] / 255) * weight; sb += (pic.rgba[si + 2] / 255) * weight;
          total += weight;
        }
        if (total > 0) { r = sr / total; g = sg / total; bl = sb / total; }
      } else if (pic) {
        const box = pic.worldBox;
        const fx = (wx - box.x0) / (box.x1 - box.x0), fy = (wy - box.y0) / (box.y1 - box.y0);
        const nz2 = normals[a * 3 + 2] * w0 + normals[b * 3 + 2] * w1 + normals[c * 3 + 2] * w2;
        if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 && nz2 > 0.05) {
          const u = pic.box.u0 + fx * (pic.box.u1 - pic.box.u0), v = pic.box.v1 - fy * (pic.box.v1 - pic.box.v0);
          const sx = Math.min(pic.width - 1, Math.max(0, Math.floor(u * pic.width))), sy = Math.min(pic.height - 1, Math.max(0, Math.floor(v * pic.height)));
          const si = (sx + sy * pic.width) * 4;
          const cover = pic.mask && pic.maskSize ? pic.mask[Math.min(pic.maskSize - 1, Math.floor(v * pic.maskSize)) * pic.maskSize + Math.min(pic.maskSize - 1, Math.floor(u * pic.maskSize))] : 1;
          const edge = Math.min(fx, 1 - fx, fy, 1 - fy) * 8;
          const w = clamp01((nz2 - 0.05) * 2.5) * clamp01(edge) * clamp01(cover * 1.4) * (pic.rgba[si + 3] / 255);
          r += (pic.rgba[si] / 255 - r) * w; g += (pic.rgba[si + 1] / 255 - g) * w; bl += (pic.rgba[si + 2] / 255 - bl) * w;
        }
      }
      const o = i * 4;
      texture[o] = r * 255; texture[o + 1] = g * 255; texture[o + 2] = bl * 255; texture[o + 3] = 255;
      filled[i] = 1;
    }
  }
  // Grow every chart past its edge, so filtering at a seam doesn't pick up the empty atlas.
  for (let pass = 0; pass < 3; pass++) {
    const copy = filled.slice();
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const i = x + y * size;
      if (copy[i]) continue;
      const from = copy[i - 1] ? i - 1 : copy[i + 1] ? i + 1 : copy[i - size] ? i - size : copy[i + size] ? i + size : -1;
      if (from < 0) continue;
      for (let k = 0; k < 4; k++) texture[i * 4 + k] = texture[from * 4 + k];
      filled[i] = 1;
    }
  }
  return texture;
}

/**
 * The clay's true surface direction per texel, in the tangent space of the mesh. Lets a 50k-triangle body keep the
 * look of the full-resolution sculpt.
 */
export function bakeNormals(mesh: Charted, sample: (x: number, y: number, z: number) => number, size: number) {
  const out = new Uint8ClampedArray(size * size * 4);
  const filled = new Uint8Array(size * size);
  const { uvs, indices, positions, normals } = mesh;
  const h = 0.004;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const ax = uvs[a * 2] * size, ay = uvs[a * 2 + 1] * size, bx = uvs[b * 2] * size, by = uvs[b * 2 + 1] * size, cx = uvs[c * 2] * size, cy = uvs[c * 2 + 1] * size;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-6) continue;
    // World-space direction of +u and +v across this triangle.
    const e1 = [positions[b * 3] - positions[a * 3], positions[b * 3 + 1] - positions[a * 3 + 1], positions[b * 3 + 2] - positions[a * 3 + 2]];
    const e2 = [positions[c * 3] - positions[a * 3], positions[c * 3 + 1] - positions[a * 3 + 1], positions[c * 3 + 2] - positions[a * 3 + 2]];
    const du1 = bx - ax, dv1 = by - ay, du2 = cx - ax, dv2 = cy - ay;
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-9) continue;
    const T = [0, 1, 2].map((k) => (e1[k] * dv2 - e2[k] * dv1) / det);
    const B = [0, 1, 2].map((k) => (e2[k] * du1 - e1[k] * du2) / det);
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(size - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(size - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den;
      const w1 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const wx = positions[a * 3] * w0 + positions[b * 3] * w1 + positions[c * 3] * w2;
      const wy = positions[a * 3 + 1] * w0 + positions[b * 3 + 1] * w1 + positions[c * 3 + 1] * w2;
      const wz = positions[a * 3 + 2] * w0 + positions[b * 3 + 2] * w1 + positions[c * 3 + 2] * w2;
      let nx = sample(wx + h, wy, wz) - sample(wx - h, wy, wz), ny = sample(wx, wy + h, wz) - sample(wx, wy - h, wz), nz = sample(wx, wy, wz + h) - sample(wx, wy, wz - h);
      const smoothN = [normals[a * 3] * w0 + normals[b * 3] * w1 + normals[c * 3] * w2, normals[a * 3 + 1] * w0 + normals[b * 3 + 1] * w1 + normals[c * 3 + 1] * w2, normals[a * 3 + 2] * w0 + normals[b * 3 + 2] * w1 + normals[c * 3 + 2] * w2];
      const nl = Math.hypot(smoothN[0], smoothN[1], smoothN[2]) || 1;
      const N = smoothN.map((v) => v / nl);
      const l = Math.hypot(nx, ny, nz);
      // Outside the clay's narrow band the gradient is flat; the mesh's own normal stands in.
      if (l < 1e-5) { nx = N[0]; ny = N[1]; nz = N[2]; } else { nx /= l; ny /= l; nz /= l; }
      // Tangent frame, kept perpendicular to the interpolated normal.
      const tDot = T[0] * N[0] + T[1] * N[1] + T[2] * N[2], bDot = B[0] * N[0] + B[1] * N[1] + B[2] * N[2];
      const tx = T[0] - N[0] * tDot, ty = T[1] - N[1] * tDot, tz = T[2] - N[2] * tDot;
      const bx2 = B[0] - N[0] * bDot, by2 = B[1] - N[1] * bDot, bz2 = B[2] - N[2] * bDot;
      const tl = Math.hypot(tx, ty, tz) || 1, bl = Math.hypot(bx2, by2, bz2) || 1;
      const i = (x + y * size) * 4;
      out[i] = ((nx * tx + ny * ty + nz * tz) / tl * 0.5 + 0.5) * 255;
      out[i + 1] = ((nx * bx2 + ny * by2 + nz * bz2) / bl * 0.5 + 0.5) * 255;
      out[i + 2] = ((nx * N[0] + ny * N[1] + nz * N[2]) * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
      filled[x + y * size] = 1;
    }
  }
  for (let i = 0; i < filled.length; i++) if (!filled[i]) { out[i * 4] = 128; out[i * 4 + 1] = 128; out[i * 4 + 2] = 255; out[i * 4 + 3] = 255; }
  return out;
}

/**
 * Fits a plan to clay it wasn't baked from: scales the joints to the form's bounds, finds the ends of its limbs from
 * the surface, then settles every joint into the middle of the clay.
 */
export function fitPlanToClay(anatomy: Anatomy, positions: Float32Array): Anatomy {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < positions.length; v += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], positions[v + k]); hi[k] = Math.max(hi[k], positions[v + k]); }
  const blo = [Infinity, Infinity, Infinity], bhi = [-Infinity, -Infinity, -Infinity];
  for (const b of anatomy.bones) for (const p of [b.at, b.tip]) for (let k = 0; k < 3; k++) { blo[k] = Math.min(blo[k], p[k]); bhi[k] = Math.max(bhi[k], p[k]); }
  const map = (p: Vec3): Vec3 => [0, 1, 2].map((k) => lo[k] + ((p[k] - blo[k]) / Math.max(bhi[k] - blo[k], 1e-4)) * (hi[k] - lo[k])) as Vec3;
  const moved = new Map<JointName, Vec3>(anatomy.bones.map((b) => [b.name, map(b.at)]));

  // On an upright form the widest surface points are the hands and the lowest on each side are the feet.
  if (anatomy.tune.quadruped < 0.5) {
    const midY = lo[1] + (hi[1] - lo[1]) * 0.25;
    for (const [side, sign] of [['L', 1], ['R', -1]] as const) {
      let hand: Vec3 | null = null, foot: Vec3 | null = null;
      for (let v = 0; v < positions.length; v += 3) {
        const x = positions[v] * sign, y = positions[v + 1];
        if (y > midY && (!hand || x > hand[0] * sign)) hand = [positions[v], y, positions[v + 2]];
        if (x > 0.005 && (!foot || y < foot[1])) foot = [positions[v], y, positions[v + 2]];
      }
      const shoulder = moved.get(`upperArm${side}` as JointName)!;
      if (hand) {
        const wrist: Vec3 = [shoulder[0] + (hand[0] - shoulder[0]) * 0.88, shoulder[1] + (hand[1] - shoulder[1]) * 0.88, shoulder[2] + (hand[2] - shoulder[2]) * 0.88];
        moved.set(`fingers${side}` as JointName, [(wrist[0] + hand[0]) / 2, (wrist[1] + hand[1]) / 2, (wrist[2] + hand[2]) / 2]);
        moved.set(`hand${side}` as JointName, wrist);
        moved.set(`foreArm${side}` as JointName, [(shoulder[0] + wrist[0]) / 2, (shoulder[1] + wrist[1]) / 2, (shoulder[2] + wrist[2]) / 2]);
      }
      if (foot) {
        const f = moved.get(`foot${side}` as JointName)!;
        const shift: Vec3 = [foot[0] - f[0], 0, foot[2] - f[2]];
        for (const j of ['foot', 'toes', 'ankle'] as const) {
          const p = moved.get(`${j}${side}` as JointName)!;
          moved.set(`${j}${side}` as JointName, [p[0] + shift[0], p[1], p[2] + shift[2]]);
        }
      }
    }
  }
  const scale = (hi[1] - lo[1]) / Math.max(bhi[1] - blo[1], 1e-4);
  const bones: Bone[] = anatomy.bones.map((bone) => {
    const at = moved.get(bone.name)!;
    const child = anatomy.bones.find((b) => b.parent === bone.name && Math.hypot(b.at[0] - bone.tip[0], b.at[1] - bone.tip[1], b.at[2] - bone.tip[2]) < 1e-5);
    const mappedTip = map(bone.tip), mappedAt = map(bone.at);
    const tip: Vec3 = child ? moved.get(child.name)! : [at[0] + mappedTip[0] - mappedAt[0], at[1] + mappedTip[1] - mappedAt[1], at[2] + mappedTip[2] - mappedAt[2]];
    return { ...bone, at, tip, radius: bone.radius * scale };
  });
  return { ...anatomy, bones, byName: Object.fromEntries(bones.map((b) => [b.name, b])) as Record<JointName, Bone>, floor: lo[1] };
}

/** Three smooth-valued octaves, cheap enough to run per texel. */
function softNoise(x: number, y: number, z: number) {
  return (Math.sin(x + Math.sin(y * 1.3) * 1.7) * Math.cos(y * 0.9 + Math.sin(z * 1.1) * 1.4) * Math.sin(z * 1.2 + Math.cos(x * 0.8)) +
    0.5 * Math.sin(x * 2.3 + z) * Math.cos(y * 2.1 - x)) * 0.66;
}

/** Reads the coat out of the picture: the subject's median, its lights and its shadows. */
function palettePicture(picture: PicturePaint) {
  const { rgba, width, height, mask, maskSize } = picture;
  const samples: [number, number, number, number][] = [];
  for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) {
    const i = (x + y * width) * 4;
    if (rgba[i + 3] < 128) continue;
    if (mask && maskSize) {
      const m = mask[Math.floor((y / height) * maskSize) * maskSize + Math.floor((x / width) * maskSize)];
      if (m < 0.5) continue;
    }
    samples.push([rgba[i] * 0.3 + rgba[i + 1] * 0.59 + rgba[i + 2] * 0.11, rgba[i], rgba[i + 1], rgba[i + 2]]);
  }
  if (samples.length < 50) return null;
  samples.sort((a, b) => a[0] - b[0]);
  const at = (q: number) => {
    const from = Math.floor(samples.length * Math.max(0, q - 0.05)), to = Math.floor(samples.length * Math.min(1, q + 0.05));
    const sum = [0, 0, 0];
    for (let i = from; i < to; i++) { sum[0] += samples[i][1]; sum[1] += samples[i][2]; sum[2] += samples[i][3]; }
    const c = sum.map((v) => Math.round(v / Math.max(1, to - from)).toString(16).padStart(2, '0'));
    return `#${c.join('')}`;
  };
  return { base: at(0.5), under: at(0.8), accent: at(0.1) };
}

/** Presses a picture's fine depth into the front of the mesh, so the model carries its features. */
function pressPictureDepth(positions: Float32Array, normals: Float32Array, picture: PicturePaint) {
  const { depth, depthSize, box, worldBox } = picture;
  if (!depth || !depthSize) return;
  const S = depthSize;
  const blur = new Float32Array(S * S);
  const radius = 18;
  // A wide box blur, twice, gives the broad shape to subtract: only the features are worth pressing in.
  const pass = (src: Float32Array, step: number, across: number) => {
    const out = new Float32Array(src.length);
    for (let a = 0; a < S; a++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[a * across + Math.max(0, Math.min(S - 1, k)) * step];
      for (let k = 0; k < S; k++) {
        out[a * across + k * step] = sum / (radius * 2 + 1);
        sum += src[a * across + Math.min(S - 1, k + radius + 1) * step] - src[a * across + Math.max(0, k - radius) * step];
      }
    }
    return out;
  };
  blur.set(pass(pass(depth, 1, S), S, 1));
  let power = 0;
  for (let i = 0; i < S * S; i++) power += (depth[i] - blur[i]) ** 2;
  const gain = 1 / Math.max(Math.sqrt(power / (S * S)), 1e-5);
  const span = worldBox.x1 - worldBox.x0;
  for (let v = 0; v < positions.length / 3; v++) {
    if (normals[v * 3 + 2] < 0.1) continue;
    const fx = (positions[v * 3] - worldBox.x0) / span, fy = (positions[v * 3 + 1] - worldBox.y0) / (worldBox.y1 - worldBox.y0);
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) continue;
    const u = box.u0 + fx * (box.u1 - box.u0), t = box.v1 - fy * (box.v1 - box.v0);
    const i = Math.min(S - 1, Math.floor(t * S)) * S + Math.min(S - 1, Math.floor(u * S));
    const edge = clamp01(Math.min(fx, 1 - fx, fy, 1 - fy) * 7) * clamp01(normals[v * 3 + 2] * 2);
    positions[v * 3 + 2] += clamp01((depth[i] - blur[i]) * gain * 0.5 + 0.5) * edge * span * 0.05 - edge * span * 0.025;
  }
}

export function finishCreature(field: ClayFieldSnapshot, anatomy: Anatomy, surface: SurfaceBrief, options: FinishOptions = {}): CreatureModel {
  const started = performance.now();
  const { stride = 4, textureSize = 2048, normalSize = 1024, fitToClay = false, picture, onProgress } = options;
  onProgress?.(0.05, 'Laying the skin over the clay');
  const raw = keepConnected(meshFromField(field, stride));
  relax(raw.positions, raw.indices, 2, 0.4);
  if (picture) pressPictureDepth(raw.positions, recomputeNormals(raw.positions, raw.indices), picture);
  const normals = recomputeNormals(raw.positions, raw.indices);
  onProgress?.(0.2, 'Fitting the bones and binding the skin');
  const fitted = fitBonesToField(fitToClay ? fitPlanToClay(anatomy, raw.positions) : anatomy, field);
  const sample = fieldSampler(field);
  const skin = skinWeights(raw.positions, raw.indices, fitted, sample);
  onProgress?.(0.5, 'Attaching the muscles');
  const influences = muscleInfluences(raw.positions, fitted);
  onProgress?.(0.6, 'Growing the fur map');
  const fur = furMap(raw.positions, normals, skin.skinIndex, skin.skinWeight, fitted, surface);
  onProgress?.(0.7, 'Unwrapping');
  const charted = atlasUv(raw.positions, normals, raw.indices, textureSize);
  onProgress?.(0.8, 'Painting');
  const texture = paintTexture(charted, skin.skinIndex, skin.skinWeight, fitted, surface, picture, textureSize);
  onProgress?.(0.9, 'Baking the sculpted detail');
  const normalMap = normalSize > 0 ? bakeNormals(charted, sample, normalSize) : null;

  // Everything keyed to a vertex follows it onto its charts.
  const n = charted.positions.length / 3;
  const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4), furLength = new Float32Array(n), furDir = new Float32Array(n * 3);
  const copies: number[][] = Array.from({ length: raw.positions.length / 3 }, () => []);
  for (let v = 0; v < n; v++) {
    const s = charted.source[v];
    copies[s].push(v);
    skinIndex.set(skin.skinIndex.subarray(s * 4, s * 4 + 4), v * 4);
    skinWeight.set(skin.skinWeight.subarray(s * 4, s * 4 + 4), v * 4);
    furLength[v] = fur.furLength[s];
    furDir.set(fur.furDir.subarray(s * 3, s * 3 + 3), v * 3);
  }
  const muscles = influences.map((m) => {
    const verts: number[] = [], amounts: number[] = [];
    m.verts.forEach((s, i) => { for (const v of copies[s]) { verts.push(v); amounts.push(m.amounts[i]); } });
    return { id: m.id, label: m.label, verts: new Uint32Array(verts), amounts: new Float32Array(amounts) };
  });
  onProgress?.(1, 'Done');
  return {
    positions: charted.positions, normals: charted.normals, uvs: charted.uvs, indices: charted.indices,
    skinIndex, skinWeight, furLength, furDir, muscles, anatomy: fitted, textureSize, texture, normalSize, normalMap,
    furReach: furLength.reduce((a, b) => Math.max(a, b), 0),
    stats: { vertices: n, triangles: charted.indices.length / 3, charts: charted.charts, ms: Math.round(performance.now() - started) },
  };
}
