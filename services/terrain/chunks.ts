// Plajah Terrain — streamed ground chunks (docs/plajah-terrain.md, phase 1).
//
// The world is cut into square chunks; each is meshed at the detail level its distance from the camera asks for
// (finer levels built on demand, a few per update so streaming never stalls a frame), with skirts round the edges to
// hide the cracks between levels. The finest level of chunks far behind the camera is freed.
import * as THREE from 'three/webgpu';
import type { SurfaceSource } from './field';

export interface ChunkLod { seg: number; range: number }

export interface ChunkOptions {
  /** World bounds: chunks cover [-half, half]² (or [x0, x0 + size]² when x0/z0/size are given). */
  half?: number;
  x0?: number; z0?: number; size?: number;
  /** Chunk edge length in metres. */
  chunk?: number;
  /** Detail levels nearest first; the last range should be Infinity. */
  lods?: ChunkLod[];
  /** Segment count for a chunk at a level (e.g. double near an arena); defaults to the level's seg. */
  segFor?: (cx: number, cz: number, lod: number, seg: number) => number;
  /** Lower-tier devices: fewer segments everywhere. */
  lowTier?: boolean;
  /** Cut holes (cave mouths, wells): true drops the quad centred at (x, z). */
  holed?: (x: number, z: number) => boolean;
  /** Cheap test whether a chunk can have holes at all (skips the per-quad test elsewhere). */
  mayHaveHoles?: (cx: number, cz: number, chunk: number) => boolean;
  /** UV scale: uv = xz / uvScale. */
  uvScale?: number;
  /** Builds per update while streaming (the forced first update builds everything it needs). */
  buildsPerUpdate?: number;
  /** Seconds between distance checks. */
  interval?: number;
  name?: string;
}

/** One square ground patch centred on (cx, cz): seg × seg quads sampled from the surface, holes cut, skirts round the
 *  edge (to hide cracks between detail levels). Shared by the fixed-world and streaming chunk managers. */
export function chunkGeometry(S: SurfaceSource, cx: number, cz: number, C: number, seg: number, skirt: number,
  o: Pick<ChunkOptions, 'holed' | 'mayHaveHoles' | 'uvScale'> & { gridNormals?: boolean } = {}): THREE.BufferGeometry {
  const step = C / seg, x0 = cx - C / 2, z0 = cz - C / 2, v = seg + 1, uvk = 1 / (o.uvScale ?? 8), e = Math.max(1, step * 0.5);
  const nGrid = v * v, nSkirt = 4 * seg * 2, nv = nGrid + nSkirt;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
  // gridNormals: sample one ring beyond the patch once and take normals from neighbours (5× fewer height reads)
  const vb = v + 2, hb = o.gridNormals ? new Float32Array(vb * vb) : null;
  if (hb) for (let j = 0; j < vb; j++) for (let i = 0; i < vb; i++) hb[i + j * vb] = S.surface(x0 + (i - 1) * step, z0 + (j - 1) * step);
  for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
    const x = x0 + i * step, z = z0 + j * step, k = i + j * v;
    let nx: number, ny: number, nz: number, h: number;
    if (hb) {
      const c = i + 1 + (j + 1) * vb, dx = hb[c - 1] - hb[c + 1], dz = hb[c - vb] - hb[c + vb], l = Math.hypot(dx, 2 * step, dz);
      nx = dx / l; ny = (2 * step) / l; nz = dz / l; h = hb[c];
    } else { const n = S.normal(x, z, e); nx = n[0]; ny = n[1]; nz = n[2]; h = S.surface(x, z); }
    pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
    nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz;
    uvs[k * 2] = x * uvk; uvs[k * 2 + 1] = z * uvk;
  }
  const hasHoles = !!o.holed && (o.mayHaveHoles ? o.mayHaveHoles(cx, cz, C) : true);
  const idx: number[] = [];
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = i + j * v, b = a + 1, c = a + v, d = c + 1;
    if (hasHoles && o.holed!(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step)) continue;
    idx.push(a, c, b, b, c, d);
  }
  // skirts round the edge hide the cracks between detail levels
  let w = nGrid;
  const edge = (list: number[]) => {
    for (let k = 0; k < list.length - 1; k++) {
      const p = list[k], q = list[k + 1], base = w;
      for (const s of [p, q]) {
        pos[w * 3] = pos[s * 3]; pos[w * 3 + 1] = pos[s * 3 + 1] - skirt; pos[w * 3 + 2] = pos[s * 3 + 2];
        nor[w * 3] = nor[s * 3]; nor[w * 3 + 1] = nor[s * 3 + 1]; nor[w * 3 + 2] = nor[s * 3 + 2];
        uvs[w * 2] = uvs[s * 2]; uvs[w * 2 + 1] = uvs[s * 2 + 1]; w++;
      }
      idx.push(p, base, q, q, base, base + 1);
    }
  };
  const row = (j: number) => Array.from({ length: v }, (_, i) => i + j * v), col = (i: number) => Array.from({ length: v }, (_, j) => i + j * v);
  edge(row(0)); edge(row(seg).reverse()); edge(col(0).reverse()); edge(col(seg));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(nv > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export const DEFAULT_LODS: ChunkLod[] = [{ seg: 50, range: 170 }, { seg: 20, range: 480 }, { seg: 8, range: Infinity }];

export class TerrainChunks {
  readonly group = new THREE.Group();
  readonly chunkSize: number;
  readonly lods: ChunkLod[];
  private chunks: { cx: number; cz: number; meshes: (THREE.Mesh | null)[]; lod: number }[] = [];
  private t = 1;

  constructor(private source: SurfaceSource, private material: THREE.Material, protected opts: ChunkOptions = {}) {
    this.group.name = opts.name ?? 'terrain';
    this.chunkSize = opts.chunk ?? 100;
    this.lods = opts.lods ?? DEFAULT_LODS;
    const size = opts.size ?? (opts.half ?? 1000) * 2, x0 = opts.x0 ?? -size / 2, z0 = opts.z0 ?? -size / 2;
    const n = Math.round(size / this.chunkSize);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++)
      this.chunks.push({ cx: x0 + (i + 0.5) * this.chunkSize, cz: z0 + (j + 0.5) * this.chunkSize, meshes: this.lods.map(() => null), lod: -1 });
  }

  private build(cx: number, cz: number, lod: number) {
    const o = this.opts, C = this.chunkSize;
    let seg = this.lods[lod].seg;
    if (o.segFor) seg = o.segFor(cx, cz, lod, seg);
    if (o.lowTier) seg = Math.max(6, Math.round(seg * 0.6));
    const g = chunkGeometry(this.source, cx, cz, C, seg, lod > 0 ? 3 : 1.2, o);
    const m = new THREE.Mesh(g, this.material);
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.name = `${this.group.name}-${cx}-${cz}-${lod}`;
    return m;
  }

  /** Pick each chunk's detail by its distance from the camera; build the finer levels when first needed. */
  update(cam: THREE.Vector3, dt: number, force = false) {
    this.t += dt;
    if (!force && this.t < (this.opts.interval ?? 0.25)) return;
    this.t = 0;
    const L = this.lods, C = this.chunkSize, cap = force ? Infinity : (this.opts.buildsPerUpdate ?? 3);
    let built = 0;
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z) - C * 0.7);
      let lod = L.findIndex((l) => d < l.range);
      if (lod < 0) lod = L.length - 1;
      if (!c.meshes[lod]) {
        // limit the builds per update so streaming never stalls a frame for long; use what exists meanwhile
        if (built >= cap) { const have = c.meshes.findIndex((m) => m); if (have >= 0) lod = have; else continue; }
        else { c.meshes[lod] = this.build(c.cx, c.cz, lod); built++; }
      }
      if (lod === c.lod) continue;
      if (c.lod >= 0 && c.meshes[c.lod]) this.group.remove(c.meshes[c.lod]!);
      this.group.add(c.meshes[lod]!);
      c.lod = lod;
      // free the finest level of chunks far behind us
      if (lod > 0 && c.meshes[0] && L.length > 1 && d > L[1].range) { c.meshes[0]!.geometry.dispose(); c.meshes[0] = null; }
    }
  }

  /** Drop every built mesh (e.g. after the height field is re-baked); the next update rebuilds. */
  invalidate() {
    for (const c of this.chunks) {
      if (c.lod >= 0 && c.meshes[c.lod]) this.group.remove(c.meshes[c.lod]!);
      for (const m of c.meshes) m?.geometry.dispose();
      c.meshes = this.lods.map(() => null); c.lod = -1;
    }
  }

  dispose() { this.invalidate(); }
}
