// Elderwood Wilds — terrain: the world height baked once into grids (2 m over the world, 1 m over the hollow), streamed
// as 100 m chunks at three detail levels round the camera, and answered to the collision world as a height field with
// caves (the vaults, the Titan Tree's hollow) and a trunk grid (every grown tree's trunk is a cylinder, not triangles).
import * as THREE from 'three/webgpu';
import { color, float, mix, normalWorld, positionWorld, smoothstep, texture as tslTexture, uniform, vec2, vec3 } from 'three/tsl';
import type { TerrainField } from '../collision';
import { art } from '../cyberforest';
import { pbr } from '../textures';
import { CAVES, CAVE_CIRCLES, HALF, MESH_HOLES, worldHeight } from './layout';

// ── height grids ───────────────────────────────────────────────────────────────────────────────────────────────────
class Grid {
  readonly n: number; readonly data: Float32Array;
  constructor(readonly x0: number, readonly z0: number, readonly size: number, readonly cell: number, f: (x: number, z: number) => number) {
    this.n = Math.round(size / cell) + 1;
    this.data = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) this.data[i + j * this.n] = f(x0 + i * cell, z0 + j * cell);
  }
  inside(x: number, z: number) { return x >= this.x0 && z >= this.z0 && x <= this.x0 + this.size && z <= this.z0 + this.size; }
  at(x: number, z: number) {
    const n = this.n, fx = Math.min(n - 1.0001, Math.max(0, (x - this.x0) / this.cell)), fz = Math.min(n - 1.0001, Math.max(0, (z - this.z0) / this.cell));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, d = this.data, k = i + j * n;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + n] * (1 - u) + d[k + n + 1] * u) * v;
  }
}

const inBox = (x: number, z: number, b: number[], pad = 0) => {
  const c = Math.cos(b[4]), s = Math.sin(b[4]), dx = x - b[0], dz = z - b[1];
  return Math.abs(dx * c - dz * s) <= b[2] / 2 + pad && Math.abs(dx * s + dz * c) <= b[3] / 2 + pad;
};

export class WorldTerrain implements TerrainField {
  private world!: Grid; private core!: Grid;
  private trunkCells = new Map<number, number[][]>();
  private readonly TC = 8;
  step = 0.55;
  baked = false;

  bake() {
    const t0 = performance.now();
    this.world = new Grid(-HALF, -HALF, HALF * 2, 2, worldHeight);
    this.core = new Grid(-112, -112, 224, 1, worldHeight);
    this.baked = true;
    console.info(`[wilds] terrain baked in ${Math.round(performance.now() - t0)} ms`);
  }

  /** Surface height (ignores caves): for placing things and drawing the ground. */
  surface(x: number, z: number) {
    if (!this.baked) this.bake();
    return this.core.inside(x, z) ? this.core.at(x, z) : this.world.at(x, z);
  }

  heightAt(x: number, z: number, y?: number) {
    if (y !== undefined) {
      for (const c of CAVES) if (y < c[5] && inBox(x, z, c)) return -Infinity;
      for (const c of CAVE_CIRCLES) if (y < c[3] && (x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2] * c[2]) return -Infinity;
    }
    return this.surface(x, z);
  }

  addTrunk(x: number, z: number, r: number, y0: number, y1: number) {
    const k = Math.floor(x / this.TC) * 4096 + Math.floor(z / this.TC);
    let a = this.trunkCells.get(k); if (!a) { a = []; this.trunkCells.set(k, a); }
    a.push([x, z, r, y0, y1]);
  }

  private near: number[][] = [];
  trunksNear(x: number, z: number, r: number) {
    const out = this.near; out.length = 0;
    const i0 = Math.floor((x - r) / this.TC), i1 = Math.floor((x + r) / this.TC), j0 = Math.floor((z - r) / this.TC), j1 = Math.floor((z + r) / this.TC);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.trunkCells.get(i * 4096 + j); if (a) for (const t of a) out.push(t); }
    return out;
  }

  normal(x: number, z: number, e = 1) {
    const nx = this.surface(x - e, z) - this.surface(x + e, z), nz = this.surface(x, z - e) - this.surface(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  }
}

// ── the ground material: the hollow's moss on the flats, rock on the slopes and cliffs, mud by the water ──────────
export function terrainMaterial(beat: { value: number }) {
  const mossA = art('moss_cable_albedo.jpg', true, true), mossB = art('moss_strand_albedo.jpg', true, true), mossG = art('moss_glow_albedo.jpg', true, true);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, normalMap: art('moss_cable_normal.jpg', false, true) });
  m.normalScale.set(0.8, 0.8);
  const rockSet = pbr('volc-rock', { maps: ['normal', 'roughness'], tint: 0x8a9488, normalScale: 1.3 }) as THREE.MeshStandardNodeMaterial;
  const rockMap = rockSet.map ?? null;
  const wp = positionWorld.xz;
  const a = tslTexture(mossA, wp.mul(1 / 9).add(vec2(0.21, 0.63))).rgb, b = tslTexture(mossB, wp.mul(1 / 8).add(vec2(0.37, 0.11))).rgb;
  const g = tslTexture(mossG, wp.mul(1 / 6)).rgb;
  const k = tslTexture(mossG, wp.mul(1 / 97)).g, k2 = tslTexture(mossB, wp.mul(1 / 71).add(vec2(0.5, 0.2))).g;
  const base = mix(b.mul(0.75), g.mul(0.45), smoothstep(float(0.62), float(0.82), k2));
  const lum = a.dot(vec3(0.3, 0.5, 0.2));
  const moss = mix(base, a.mul(0.6), smoothstep(float(0.62), float(0.8), k).mul(smoothstep(float(0.6), float(0.2), lum))).mul(vec3(0.4, 0.58, 0.36));
  // rock: side-projected on the steep faces (x/z planes by the normal), grey-green
  const ny = normalWorld.y.abs();
  const rx = rockMap ? tslTexture(rockMap, positionWorld.zy.mul(1 / 7)).rgb : vec3(0.35);
  const rz = rockMap ? tslTexture(rockMap, positionWorld.xy.mul(1 / 7)).rgb : vec3(0.35);
  // grey-green stone: the rock sheet's luminance only (its lava-orange cracks belong to the volcanic level)
  const rl = mix(rx, rz, normalWorld.z.abs().div(normalWorld.x.abs().add(normalWorld.z.abs()).add(0.001))).dot(vec3(0.3, 0.55, 0.15));
  const rock = vec3(rl).mul(vec3(0.5, 0.6, 0.55));
  const steep = smoothstep(float(0.78), float(0.6), ny);
  // mud at the waterline and in the vale's wet ground
  const wet = smoothstep(float(-47.6), float(-48.8), positionWorld.y);
  m.colorNode = mix(mix(moss, rock, steep), vec3(0.09, 0.1, 0.08), wet.mul(0.7));
  const cyan = color(0x2ae6ff), uB = uniform(0);
  m.emissiveNode = g.mul(smoothstep(float(0.6), float(0.9), g.g)).mul(cyan).mul(smoothstep(float(0.25), float(0.75), k).mul(0.8).add(0.2))
    .mul(float(0.12).add(uB.mul(0.1))).mul(float(1).sub(steep));
  return { material: m, setBeat: () => { uB.value = beat.value; } };
}

// ── streamed chunks ────────────────────────────────────────────────────────────────────────────────────────────────
const CHUNK = 100;
const LODS = [{ seg: 50, range: 170 }, { seg: 20, range: 480 }, { seg: 8, range: Infinity }];

function holed(x: number, z: number) {
  for (const c of MESH_HOLES.circles) if ((x - c[0]) ** 2 + (z - c[1]) ** 2 < c[2] * c[2]) return true;
  for (const b of MESH_HOLES.boxes) if (inBox(x, z, b)) return true;
  return false;
}

export class TerrainChunks {
  readonly group = new THREE.Group();
  private chunks: { cx: number; cz: number; meshes: (THREE.Mesh | null)[]; lod: number }[] = [];
  private t = 1;

  constructor(private terrain: WorldTerrain, private material: THREE.Material, private lowTier: boolean) {
    this.group.name = 'wilds-terrain';
    const n = Math.round((HALF * 2) / CHUNK);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) this.chunks.push({ cx: -HALF + (i + 0.5) * CHUNK, cz: -HALF + (j + 0.5) * CHUNK, meshes: [null, null, null], lod: -1 });
  }

  private build(cx: number, cz: number, lod: number) {
    let seg = LODS[lod].seg;
    // the hollow's chunks get double the detail at the nearest level (decks, pads and the pool basin are small)
    if (lod === 0 && Math.abs(cx) < 130 && Math.abs(cz) < 130) seg = 100;
    if (this.lowTier) seg = Math.max(6, Math.round(seg * 0.6));
    const T = this.terrain, step = CHUNK / seg, x0 = cx - CHUNK / 2, z0 = cz - CHUNK / 2, v = seg + 1;
    const skirt = lod > 0 ? 3 : 1.2;
    const pos: number[] = [], nor: number[] = [], idx: number[] = [], uvs: number[] = [];
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const x = x0 + i * step, z = z0 + j * step, h = T.surface(x, z), n = T.normal(x, z, Math.max(1, step * 0.5));
      pos.push(x, h, z); nor.push(n[0], n[1], n[2]); uvs.push(x / 8, z / 8);
    }
    const hasHoles = MESH_HOLES.circles.some((c) => Math.abs(c[0] - cx) < CHUNK / 2 + c[2] && Math.abs(c[1] - cz) < CHUNK / 2 + c[2])
      || MESH_HOLES.boxes.some((b) => Math.abs(b[0] - cx) < CHUNK / 2 + 10 && Math.abs(b[1] - cz) < CHUNK / 2 + 10);
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = i + j * v, b = a + 1, c = a + v, d = c + 1;
      if (hasHoles && holed(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
      idx.push(a, c, b, b, c, d);
    }
    // skirts round the edge hide the cracks between detail levels
    const edge = (list: number[]) => {
      for (let k = 0; k < list.length - 1; k++) {
        const p = list[k], q = list[k + 1], base = pos.length / 3;
        for (const s of [p, q]) { pos.push(pos[s * 3], pos[s * 3 + 1] - skirt, pos[s * 3 + 2]); nor.push(nor[s * 3], nor[s * 3 + 1], nor[s * 3 + 2]); uvs.push(uvs[s * 2], uvs[s * 2 + 1]); }
        idx.push(p, base, q, q, base, base + 1);
      }
    };
    const row = (j: number) => Array.from({ length: v }, (_, i) => i + j * v), col = (i: number) => Array.from({ length: v }, (_, j) => i + j * v);
    edge(row(0)); edge(row(seg).reverse()); edge(col(0).reverse()); edge(col(seg));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.name = `terrain-${cx}-${cz}-${lod}`;
    return m;
  }

  /** Pick each chunk's detail by its distance from the camera; build the finer levels when first needed. */
  update(cam: THREE.Vector3, dt: number, force = false) {
    this.t += dt;
    if (!force && this.t < 0.25) return;
    this.t = 0;
    let built = 0;
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z) - CHUNK * 0.7);
      let lod = LODS.findIndex((l) => d < l.range);
      if (!c.meshes[lod]) {
        // limit the builds per update so streaming never stalls a frame for long; use what exists meanwhile
        if (built >= (force ? 999 : 3)) { const have = c.meshes.findIndex((m) => m); if (have >= 0) lod = have; else continue; }
        else { c.meshes[lod] = this.build(c.cx, c.cz, lod); built++; }
      }
      if (lod === c.lod) continue;
      if (c.lod >= 0 && c.meshes[c.lod]) this.group.remove(c.meshes[c.lod]!);
      this.group.add(c.meshes[lod]!);
      c.lod = lod;
      // free the finest level of chunks far behind us
      for (let k = 0; k < lod; k++) if (k === 0 && c.meshes[0] && d > LODS[1].range) { c.meshes[0]!.geometry.dispose(); c.meshes[0] = null; }
    }
  }
}
