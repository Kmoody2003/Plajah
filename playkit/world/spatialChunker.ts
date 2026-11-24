// playkit/world/spatialChunker.ts
//
// Universal Plajah Draw-Call Reduction & Spatial Frustum / Shadow Culling System.
// Shared across ALL 1st-party games (Vesselbound, Apex, Era Clash, Ravencrest, Kith, Firstlight)
// and 3rd-party creator worlds (zero `isFirstParty` branches):
//
//   1. `InstancedBatchCollector`:
//      Collects repeated decorative / structural props (moss decals, rain puddles, glowing rings,
//      rune cards, lanterns, crates, foliage props) and flushes ONE `THREE.InstancedMesh` per
//      `(geometryKey, material)` — cutting hundreds of draw calls down to a single GPU instanced draw!
//
//   2. `SpatialChunkMerger`:
//      Buckets world-space static geometries into spatial grid cells (e.g. 220 m x 220 m chunks)
//      before merging per material, giving the GPU true frustum culling across 2+ km open worlds
//      AND distance-based shadow-caster culling (`updateShadowCulling(focusPos, maxDistM)`).

import * as THREE from 'three/webgpu';

export interface InstancedEntry {
  matrix: THREE.Matrix4;
  color?: THREE.Color;
}

interface BatchBucket {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  name: string;
  entries: InstancedEntry[];
}

/**
 * Collects repeated meshes across an open world and emits a single `THREE.InstancedMesh`
 * per `(batchKey, material)`. Cuts draw calls 10x–100x on decals, puddles, rings & small props.
 */
export class InstancedBatchCollector {
  private readonly buckets = new Map<string, BatchBucket>();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpScale = new THREE.Vector3();

  add(
    batchKey: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    matrix: THREE.Matrix4,
    opts?: {
      castShadow?: boolean;
      receiveShadow?: boolean;
      renderOrder?: number;
      color?: THREE.Color;
      name?: string;
    },
  ): void {
    const key = `${batchKey}|${material.uuid}|${opts?.renderOrder ?? 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = {
        geometry,
        material,
        castShadow: Boolean(opts?.castShadow),
        receiveShadow: opts?.receiveShadow ?? true,
        renderOrder: opts?.renderOrder ?? 0,
        name: opts?.name ?? `instanced:${batchKey}`,
        entries: [],
      };
      this.buckets.set(key, b);
    }
    b.entries.push({ matrix: matrix.clone(), color: opts?.color?.clone() });
  }

  /** Convenience helper for position + Euler (rx, ry, rz) + scale placement. */
  addTRS(
    batchKey: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number, y: number, z: number,
    rx = 0, ry = 0, rz = 0,
    sx = 1, sy = 1, sz = 1,
    opts?: { castShadow?: boolean; receiveShadow?: boolean; renderOrder?: number; color?: THREE.Color; name?: string },
  ): void {
    this.tmpPos.set(x, y, z);
    this.tmpEuler.set(rx, ry, rz, 'XYZ');
    this.tmpQuat.setFromEuler(this.tmpEuler);
    this.tmpScale.set(sx, sy, sz);
    const m = new THREE.Matrix4().compose(this.tmpPos, this.tmpQuat, this.tmpScale);
    this.add(batchKey, geometry, material, m, opts);
  }

  get bucketCount(): number {
    return this.buckets.size;
  }

  get totalInstances(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.entries.length;
    return n;
  }

  /** Flush all collected batches into `parent` as `THREE.InstancedMesh`es with accurate bounds. */
  flush(parent: THREE.Object3D): THREE.InstancedMesh[] {
    const meshes: THREE.InstancedMesh[] = [];
    for (const b of this.buckets.values()) {
      const count = b.entries.length;
      if (count === 0) continue;
      const im = new THREE.InstancedMesh(b.geometry, b.material, count);
      im.name = b.name;
      im.castShadow = b.castShadow;
      im.receiveShadow = b.receiveShadow;
      im.renderOrder = b.renderOrder;
      let hasColor = false;
      for (let i = 0; i < count; i++) {
        im.setMatrixAt(i, b.entries[i].matrix);
        if (b.entries[i].color) {
          im.setColorAt(i, b.entries[i].color!);
          hasColor = true;
        }
      }
      im.instanceMatrix.needsUpdate = true;
      if (hasColor && im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingBox();
      im.computeBoundingSphere();
      im.frustumCulled = true;
      parent.add(im);
      meshes.push(im);
    }
    this.buckets.clear();
    return meshes;
  }
}

export interface ChunkedMeshRecord {
  mesh: THREE.Mesh;
  centerX: number;
  centerZ: number;
  radiusM: number;
  wantsShadow: boolean;
}

/** Merge a list of attribute-compatible geometries (pos/normal/uv) preserving smooth vertex normals. */
function mergeCompatibleGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let totalVerts = 0;
  for (const g of list) totalVerts += g.attributes.position.count;
  if (totalVerts === 0) return null;

  const pos = new Float32Array(totalVerts * 3);
  const nor = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  let off = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    const pArr = g.attributes.position.array as Float32Array;
    const nArr = g.attributes.normal.array as Float32Array;
    pos.set(pArr, off * 3);
    nor.set(nArr, off * 3);
    if (g.attributes.uv) {
      uvs.set(g.attributes.uv.array as Float32Array, off * 2);
    }
    off += g.attributes.position.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Spatially partitions world-space geometries into `cellSizeM x cellSizeM` frustum-cullable
 * chunks before merging, AND manages distance-based shadow-caster culling per frame so distant
 * open-world chunks stop casting expensive shadows outside the shadow frustum.
 */
export class SpatialChunkController {
  readonly cellSizeM: number;
  readonly chunks: ChunkedMeshRecord[] = [];
  private lastX = 1e9;
  private lastZ = 1e9;

  constructor(cellSizeM = 220) {
    this.cellSizeM = Math.max(40, cellSizeM);
  }

  /**
   * Partition `geos` by bounding-box center into spatial cells, merge each cell into one mesh
   * with preserved smooth normals, and attach to `parent`.
   */
  addChunkedGeometryGroup(
    parent: THREE.Object3D,
    geos: THREE.BufferGeometry[],
    material: THREE.Material,
    opts: { name: string; castShadow?: boolean; receiveShadow?: boolean; collide?: boolean },
  ): THREE.Mesh[] {
    if (geos.length === 0) return [];
    const cells = new Map<string, THREE.BufferGeometry[]>();
    const cs = this.cellSizeM;

    for (const g of geos) {
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      const cx = bb ? (bb.min.x + bb.max.x) * 0.5 : 0;
      const cz = bb ? (bb.min.z + bb.max.z) * 0.5 : 0;
      const key = `${Math.floor(cx / cs)},${Math.floor(cz / cs)}`;
      let arr = cells.get(key);
      if (!arr) {
        arr = [];
        cells.set(key, arr);
      }
      arr.push(g);
    }

    const created: THREE.Mesh[] = [];
    let idx = 0;
    for (const [cellKey, cellGeos] of cells) {
      const merged = mergeCompatibleGeos(cellGeos);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      const wantsShadow = Boolean(opts.castShadow);
      mesh.castShadow = wantsShadow;
      mesh.receiveShadow = opts.receiveShadow ?? true;
      mesh.frustumCulled = true;
      mesh.name = `${opts.name}:c${idx++}(${cellKey})`;
      if (opts.collide) mesh.userData.collide = true;
      parent.add(mesh);
      created.push(mesh);

      const bs = merged.boundingSphere!;
      this.chunks.push({
        mesh,
        centerX: bs.center.x,
        centerZ: bs.center.z,
        radiusM: bs.radius,
        wantsShadow,
      });
    }
    return created;
  }

  /**
   * Toggle `castShadow` only on chunks overlapping the active shadow radius around `focusPos`.
   * Re-evaluates only after moving > 12 m to stay virtually zero-cost per frame.
   */
  updateShadowCulling(focusX: number, focusZ: number, shadowRadiusM = 115, force = false): number {
    if (!force && (focusX - this.lastX) ** 2 + (focusZ - this.lastZ) ** 2 < 144) {
      return -1;
    }
    this.lastX = focusX;
    this.lastZ = focusZ;
    let activeCasters = 0;
    for (const c of this.chunks) {
      if (!c.wantsShadow) {
        c.mesh.castShadow = false;
        continue;
      }
      const dist = Math.hypot(c.centerX - focusX, c.centerZ - focusZ) - c.radiusM;
      const on = dist <= shadowRadiusM;
      c.mesh.castShadow = on;
      if (on) activeCasters++;
    }
    return activeCasters;
  }
}
