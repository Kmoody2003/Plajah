/**
 * enginePerf.ts — High-Performance 60 FPS Browser Engine Suite for Apex Elohim:
 *
 * 1. DynamicResScaler:
 *    Maintains a locked 60 FPS (16.67 ms budget) by scaling WebGL pixelRatio
 *    between 0.85x and 1.5x with hysteresis so GPU fill-rate never bottlenecks
 *    full-screen postprocessing (AO, Bloom, Grading) on high-DPI displays.
 *
 * 2. SpatialCuller & ShadowBudget:
 *    - Frustum + distance-culls non-instanced static groups (furniture, streetscape,
 *      zones, rural/city expansion) using precomputed world bounding spheres.
 *    - Enforces a strict 240 m foreground shadow-caster budget (distant objects
 *      still render and receive shadows, but stop wasting shadow-map vertices).
 *    - Throttles shadowMap updates (every 2nd frame while driving, or when camera/sun
 *      moves > 2 m) to cut shadow-pass GPU cost in half.
 *
 * 3. Time-Sliced Async Streaming Helpers:
 *    - `runWithConcurrency`: bounds simultaneous GLB/texture network fetches.
 *    - `yieldIfOverBudget`: yields to requestAnimationFrame during heavy setup.
 */

import * as THREE from 'three';
import type { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

export type PerfTier = 'low' | 'mid' | 'high';

export interface TierConfig {
  tier: PerfTier;
  cityViewDist: number;
  cityShadowDist: number;
  cullViewDist: number;
  cullShadowDist: number;
  shadowStride: number;
  aoEnabled: boolean;
  aoStrength: number;
}

export const TIER_CONFIGS: Record<PerfTier, TierConfig> = {
  high: {
    tier: 'high',
    cityViewDist: 3200,
    cityShadowDist: 190,
    cullViewDist: 2200,
    cullShadowDist: 180,
    shadowStride: 2,
    aoEnabled: true,
    aoStrength: 0.85,
  },
  mid: {
    tier: 'mid',
    cityViewDist: 2400,
    cityShadowDist: 145,
    cullViewDist: 1650,
    cullShadowDist: 140,
    shadowStride: 2,
    aoEnabled: true,
    aoStrength: 0.72,
  },
  low: {
    tier: 'low',
    cityViewDist: 1600,
    cityShadowDist: 95,
    cullViewDist: 1150,
    cullShadowDist: 90,
    shadowStride: 3,
    aoEnabled: false,
    aoStrength: 0,
  },
};

export function detectInitialTier(renderer: THREE.WebGLRenderer, tvMode: boolean): PerfTier {
  try {
    const q = new URLSearchParams(location.search).get('tier') ?? localStorage.getItem('apex.tier');
    if (q === 'low' || q === 'mid' || q === 'high') return q;
  } catch { /* ignore storage restrictions */ }
  if (tvMode) return 'low';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const rStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '').toLowerCase();
      if (/swiftshader|llvmpipe|softpipe|microsoft basic/.test(rStr)) return 'low';
      if (/\b(uhd|hd graphics|iris|vega|mali|adreno|powervr)\b/.test(rStr)) return 'mid';
      if (/\b(rtx|gtx|radeon rx|arc|apple m[1-9]|geforce)\b/.test(rStr)) return 'high';
    }
  } catch { /* ignore gl probe failure */ }
  return (navigator.hardwareConcurrency || 4) <= 4 ? 'mid' : 'high';
}

export class DynamicResScaler {
  private currentDpr: number;
  private readonly minDpr = 0.85;
  private readonly maxDpr: number;
  private readonly targetMs = 16.67;
  private samples: number[] = [];
  private cooldownFrames = 0;
  enabled = true;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private getComposer: () => EffectComposer | null
  ) {
    this.maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.currentDpr = this.maxDpr;
    this.apply(this.currentDpr);
  }

  get pixelRatio(): number {
    return this.currentDpr;
  }

  private apply(dpr: number): void {
    this.currentDpr = Math.max(this.minDpr, Math.min(this.maxDpr, Math.round(dpr * 20) / 20));
    this.renderer.setPixelRatio(this.currentDpr);
    const comp = this.getComposer();
    if (comp) {
      comp.setPixelRatio(this.currentDpr);
      comp.setSize(window.innerWidth, window.innerHeight);
    }
  }

  recordFrame(frameMs: number): void {
    if (!this.enabled || frameMs <= 0 || frameMs > 120) return;
    this.samples.push(frameMs);
    if (this.samples.length > 36) this.samples.shift();

    if (this.cooldownFrames > 0) {
      this.cooldownFrames--;
      return;
    }
    if (this.samples.length < 24) return;

    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length * 0.5)];

    if (median > this.targetMs * 1.09 && this.currentDpr > this.minDpr + 0.01) {
      this.apply(this.currentDpr - 0.12);
      this.samples.length = 0;
      this.cooldownFrames = 30;
    } else if (median < this.targetMs * 0.80 && this.currentDpr < this.maxDpr - 0.01) {
      this.apply(this.currentDpr + 0.08);
      this.samples.length = 0;
      this.cooldownFrames = 55;
    }
  }
}

interface CullEntry {
  obj: THREE.Object3D;
  center: THREE.Vector3;
  radius: number;
  baseCastShadow: boolean;
}

interface ChunkBucket {
  cx: number;
  cz: number;
  list: CullEntry[];
  active: boolean;
}

export class SpatialCuller {
  private entries: CullEntry[] = [];
  private buckets: ChunkBucket[] = [];
  private big: CullEntry[] = [];
  private readonly chunkSize = 420;
  private frustum = new THREE.Frustum();
  private projScreenMatrix = new THREE.Matrix4();
  private tmpSphere = new THREE.Sphere();
  private lastShadowCamPos = new THREE.Vector3(1e9, 1e9, 1e9);
  private shadowFrameToggle = 0;

  indexGroups(groups: THREE.Object3D[]): void {
    this.entries.length = 0;
    this.buckets.length = 0;
    this.big.length = 0;
    const map = new Map<string, ChunkBucket>();
    const box = new THREE.Box3();
    const sphere = new THREE.Sphere();

    for (const root of groups) {
      root.updateMatrixWorld(true);
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && !(obj as THREE.InstancedMesh).isInstancedMesh) {
          const m = obj as THREE.Mesh;
          if (!m.geometry) return;
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const bs = m.geometry.boundingSphere;
          if (!bs) {
            box.setFromObject(m);
            box.getBoundingSphere(sphere);
          } else {
            sphere.copy(bs).applyMatrix4(m.matrixWorld);
          }
          const entry: CullEntry = {
            obj: m,
            center: sphere.center.clone(),
            radius: Math.max(2, sphere.radius),
            baseCastShadow: m.castShadow,
          };
          this.entries.push(entry);
          // an object much bigger than a chunk (a 13 km scenic road, a long bridge) is not bucketed by its centre: from 2.6 km off its centre the whole
          // chunk went dark, so the road vanished under the car. Big objects get the per-object distance + frustum test every frame instead.
          if (entry.radius > this.chunkSize * 2) { this.big.push(entry); return; }
          const cx = Math.floor(entry.center.x / this.chunkSize);
          const cz = Math.floor(entry.center.z / this.chunkSize);
          const key = `${cx},${cz}`;
          let bucket = map.get(key);
          if (!bucket) {
            bucket = { cx, cz, list: [], active: true };
            map.set(key, bucket);
            this.buckets.push(bucket);
          }
          bucket.list.push(entry);
        }
      });
    }
  }

  update(
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    isMapMode: boolean,
    maxViewDist = 2600,
    maxShadowDist = 240,
    shadowStride = 2
  ): void {
    // 1. O(1) Spatial-Chunk Frustum + Distance culling with active-chunk state tracking
    if (this.entries.length > 0) {
      this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
      const camPos = camera.position;
      const maxD2 = isMapMode ? 1e12 : maxViewDist * maxViewDist;
      const shadD2 = maxShadowDist * maxShadowDist;

      if (isMapMode) {
        for (let b = 0; b < this.buckets.length; b++) this.buckets[b].active = true;
        for (let i = 0; i < this.entries.length; i++) {
          const e = this.entries[i];
          e.obj.visible = true;
          if (e.baseCastShadow) e.obj.castShadow = false;
        }
      } else {
        for (let i = 0; i < this.big.length; i++) {
          const e = this.big[i], dx = e.center.x - camPos.x, dy = e.center.y - camPos.y, dz = e.center.z - camPos.z;
          const reach = Math.sqrt(maxD2) + e.radius;
          if (dx * dx + dy * dy + dz * dz > reach * reach) { e.obj.visible = false; continue; }
          this.tmpSphere.center.copy(e.center); this.tmpSphere.radius = e.radius;
          const inFrustum = this.frustum.intersectsSphere(this.tmpSphere);
          e.obj.visible = inFrustum;
          if (e.baseCastShadow) e.obj.castShadow = inFrustum;
        }
        const camCx = Math.floor(camPos.x / this.chunkSize);
        const camCz = Math.floor(camPos.z / this.chunkSize);
        const span = Math.ceil(maxViewDist / this.chunkSize) + 1;

        for (let b = 0; b < this.buckets.length; b++) {
          const bucket = this.buckets[b];
          const farChunk = Math.abs(bucket.cx - camCx) > span || Math.abs(bucket.cz - camCz) > span;
          if (farChunk) {
            if (!bucket.active) continue;
            bucket.active = false;
            const list = bucket.list;
            for (let i = 0; i < list.length; i++) list[i].obj.visible = false;
            continue;
          }
          bucket.active = true;
          const list = bucket.list;
          for (let i = 0; i < list.length; i++) {
            const e = list[i];
            const dx = e.center.x - camPos.x;
            const dy = e.center.y - camPos.y;
            const dz = e.center.z - camPos.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            const maxR = e.radius;
            if (d2 > maxD2 + maxR * maxR) {
              e.obj.visible = false;
              continue;
            }
            this.tmpSphere.center.copy(e.center);
            this.tmpSphere.radius = maxR;
            const inFrustum = this.frustum.intersectsSphere(this.tmpSphere);
            e.obj.visible = inFrustum;
            if (e.baseCastShadow) {
              e.obj.castShadow = inFrustum && d2 < shadD2 + maxR * maxR;
            }
          }
        }
      }
    }

    // 2. Throttled Shadow Map refresh (cuts shadow-pass GPU cost by 50%–75%)
    this.shadowFrameToggle = (this.shadowFrameToggle + 1) % Math.max(1, shadowStride);
    const camMovedSq = this.lastShadowCamPos.distanceToSquared(camera.position);
    if (this.shadowFrameToggle === 0 || (shadowStride <= 2 && camMovedSq > 25.0)) {
      renderer.shadowMap.needsUpdate = true;
      this.lastShadowCamPos.copy(camera.position);
    }
  }
}

export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  let lastYield = performance.now();

  const next = async (): Promise<void> => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx], idx);
      const now = performance.now();
      if (now - lastYield > 7) {
        lastYield = now;
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => next());
  await Promise.all(workers);
}

/**
 * Terrain with level of detail: the height grid is cut into tiles of `tileVerts` cells; each tile keeps ONE vertex buffer (plus a skirt ring) and gets
 * one index buffer per level (every vertex, every 2nd, 4th, 8th), chosen by THREE.LOD from the camera distance. A skirt hangs `skirt` metres below every
 * tile edge, so where two neighbours sit at different levels the T-junction gaps show the skirt (terrain-coloured) instead of the sky. Distant terrain
 * drops to 1/16 and 1/64 of the triangles. The vertices near the camera are the full grid, so the surface under the car is unchanged.
 */
export function populateTerrainLOD(
  target: THREE.Group, material: THREE.Material, nx: number, ny: number, pos: Float32Array, uv: Float32Array, nor: Float32Array,
  tileVerts = 224, lodDist: number[] = [0, 850, 1900, 4000], skirt = 16,
): void {
  for (const lod of target.children) for (const lvl of (lod as THREE.LOD).levels ?? []) (lvl.object as THREE.Mesh).geometry?.dispose();
  target.clear();
  const steps = [1, 2, 4, 8].slice(0, lodDist.length);
  const tilesX = Math.ceil((nx - 1) / tileVerts), tilesY = Math.ceil((ny - 1) / tileVerts);
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) {
    const x0 = tx * tileVerts, x1 = Math.min(nx - 1, x0 + tileVerts), y0 = ty * tileVerts, y1 = Math.min(ny - 1, y0 + tileVerts);
    const tw = x1 - x0 + 1, th = y1 - y0 + 1;
    // the perimeter, as a closed loop of (i, j)
    const ring: number[][] = [];
    for (let i = 0; i < tw; i++) ring.push([i, 0]);
    for (let j = 1; j < th; j++) ring.push([tw - 1, j]);
    for (let i = tw - 2; i >= 0; i--) ring.push([i, th - 1]);
    for (let j = th - 2; j >= 1; j--) ring.push([0, j]);
    const vCount = tw * th + ring.length;
    const tPos = new Float32Array(vCount * 3), tNor = new Float32Array(vCount * 3), tUv = new Float32Array(vCount * 2);
    // tile centre: positions are stored relative to it so THREE.LOD measures the distance from the tile, not from the world origin
    const cs = ((y0 + (th >> 1)) * nx + x0 + (tw >> 1)) * 3, cx = pos[cs], cz = pos[cs + 2];
    const put = (dst: number, src: number, drop: number): void => {
      const s3 = src * 3, d3 = dst * 3, s2 = src * 2, d2 = dst * 2;
      tPos[d3] = pos[s3] - cx; tPos[d3 + 1] = pos[s3 + 1] - drop; tPos[d3 + 2] = pos[s3 + 2] - cz;
      tNor[d3] = nor[s3]; tNor[d3 + 1] = nor[s3 + 1]; tNor[d3 + 2] = nor[s3 + 2]; tUv[d2] = uv[s2]; tUv[d2 + 1] = uv[s2 + 1];
    };
    for (let j = 0; j < th; j++) for (let i = 0; i < tw; i++) put(j * tw + i, (y0 + j) * nx + x0 + i, 0);
    const skirtOf = new Map<number, number>();
    ring.forEach(([i, j], r) => { const dst = tw * th + r; put(dst, (y0 + j) * nx + x0 + i, skirt); skirtOf.set(j * tw + i, dst); });
    const aPos = new THREE.BufferAttribute(tPos, 3), aNor = new THREE.BufferAttribute(tNor, 3), aUv = new THREE.BufferAttribute(tUv, 2);
    const lod = new THREE.LOD(); lod.position.set(cx, 0, cz); lod.updateMatrix(); lod.matrixAutoUpdate = false;
    steps.forEach((s, li) => {
      const is: number[] = []; for (let i = 0; i < tw - 1; i += s) is.push(i); is.push(tw - 1);
      const js: number[] = []; for (let j = 0; j < th - 1; j += s) js.push(j); js.push(th - 1);
      const idx: number[] = [];
      for (let b = 0; b < js.length - 1; b++) for (let a = 0; a < is.length - 1; a++) {
        const p = js[b] * tw + is[a], q = js[b] * tw + is[a + 1], r = js[b + 1] * tw + is[a], t = js[b + 1] * tw + is[a + 1];
        idx.push(p, r, q, q, r, t);
      }
      // skirts along the four edges at this level's spacing (both windings: they are seen from either side)
      const edge = (pts: number[]): void => {
        for (let k = 0; k < pts.length - 1; k++) {
          const p = pts[k], q = pts[k + 1], sp = skirtOf.get(p)!, sq = skirtOf.get(q)!;
          idx.push(p, sp, q, q, sp, sq, p, q, sp, q, sq, sp);
        }
      };
      edge(is.map((i) => i)); edge(is.map((i) => (th - 1) * tw + i)); edge(js.map((j) => j * tw)); edge(js.map((j) => j * tw + tw - 1));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', aPos); geo.setAttribute('normal', aNor); geo.setAttribute('uv', aUv);
      geo.setIndex(vCount <= 65535 ? new THREE.Uint16BufferAttribute(idx, 1) : new THREE.Uint32BufferAttribute(idx, 1));
      geo.computeBoundingBox(); geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material); mesh.receiveShadow = true; mesh.castShadow = false; mesh.matrixAutoUpdate = false;
      lod.addLevel(mesh, lodDist[li], 0.1);
    });
    target.add(lod);
  }
}

/** Split the full-map height grid into frustum-culled tiles sharing exact border vertices/normals. */
export function populateTiledTerrain(
  target: THREE.Group,
  material: THREE.Material,
  nx: number,
  ny: number,
  pos: Float32Array,
  uv: Float32Array,
  nor: Float32Array,
  tilesX = 8,
  tilesY = 6
): void {
  for (let i = 0; i < target.children.length; i++) {
    const ch = target.children[i] as THREE.Mesh;
    ch.geometry?.dispose();
  }
  target.clear();

  for (let ty = 0; ty < tilesY; ty++) {
    const y0 = Math.floor((ty * (ny - 1)) / tilesY);
    const y1 = Math.floor(((ty + 1) * (ny - 1)) / tilesY);
    const th = y1 - y0 + 1;
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = Math.floor((tx * (nx - 1)) / tilesX);
      const x1 = Math.floor(((tx + 1) * (nx - 1)) / tilesX);
      const tw = x1 - x0 + 1;
      const vCount = tw * th;

      const tPos = new Float32Array(vCount * 3);
      const tNor = new Float32Array(vCount * 3);
      const tUv = new Float32Array(vCount * 2);
      for (let j = 0; j < th; j++) {
        const sy = y0 + j;
        for (let i = 0; i < tw; i++) {
          const sx = x0 + i;
          const src = sy * nx + sx;
          const dst = j * tw + i;
          const s3 = src * 3, d3 = dst * 3;
          tPos[d3] = pos[s3]; tPos[d3 + 1] = pos[s3 + 1]; tPos[d3 + 2] = pos[s3 + 2];
          tNor[d3] = nor[s3]; tNor[d3 + 1] = nor[s3 + 1]; tNor[d3 + 2] = nor[s3 + 2];
          const s2 = src * 2, d2 = dst * 2;
          tUv[d2] = uv[s2]; tUv[d2 + 1] = uv[s2 + 1];
        }
      }

      const cells = (tw - 1) * (th - 1);
      const tIdx = vCount <= 65535 ? new Uint16Array(cells * 6) : new Uint32Array(cells * 6);
      let k = 0;
      for (let j = 0; j < th - 1; j++) {
        for (let i = 0; i < tw - 1; i++) {
          const a = j * tw + i, b = a + 1, c = a + tw, d = c + 1;
          tIdx[k++] = a; tIdx[k++] = c; tIdx[k++] = b;
          tIdx[k++] = b; tIdx[k++] = c; tIdx[k++] = d;
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(tNor, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
      geo.setIndex(new THREE.BufferAttribute(tIdx, 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();

      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.matrixAutoUpdate = false;
      target.add(mesh);
    }
  }
}
