// Plajah Terrain — streamed ground chunks (docs/plajah-terrain.md, phase 1).
//
// The world is cut into square chunks; each is meshed at the detail level its distance from the camera asks for
// (finer levels built on demand, a few per update so streaming never stalls a frame), with skirts round the edges to
// hide the cracks between levels. The finest level of chunks far behind the camera is freed.
import * as THREE from 'three/webgpu';
import type { SurfaceSource } from './field';
import { chunkArrays, type ChunkArrays, type PatchOptions } from './chunkArrays';

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

/** One square ground patch centred on (cx, cz) as a BufferGeometry (chunkArrays.ts builds the arrays). Shared by the
 *  fixed-world and streaming chunk managers. */
export function chunkGeometry(S: SurfaceSource, cx: number, cz: number, C: number, seg: number, skirt: number,
  o: PatchOptions = {}): THREE.BufferGeometry {
  return geometryFromArrays(chunkArrays(S, cx, cz, C, seg, skirt, o));
}

/** Wrap built arrays (from here or the mesh worker) in a geometry; the bounding sphere comes with them. */
export function geometryFromArrays(a: ChunkArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(a.nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(a.uv, 2));
  g.setIndex(new THREE.BufferAttribute(a.index, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(a.sphere[0], a.sphere[1], a.sphere[2]), a.sphere[3]);
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
