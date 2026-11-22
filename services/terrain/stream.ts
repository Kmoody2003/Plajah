// Plajah Terrain — streaming for big worlds (docs/plajah-terrain.md, phase 6).
//
// A 4–8 km world can't bake its whole fine grid up front (8 km at 2 m = 16 M samples). Instead:
//   far grid     the whole world once at a coarse cell (8 km at 16 m = 501²): distant ground, and the fallback;
//   fine tiles   square tiles at the fine cell, baked round the player in time slices (a few ms a frame, nearest
//                first) and evicted behind them, so memory stays flat however far you walk;
//   chunks       ground meshes within view distance, rebuilt when the fine tile under them arrives.
// surface() reads the fine tile when it's ready and the far grid otherwise; it never calls the (slow) height graph.
// No three.js in the field (tests and tools use it); StreamingChunks needs three.
import * as THREE from 'three/webgpu';
import { HeightGrid, type GridRegion, type HeightFn, type SurfaceSource, type TerrainField } from './field';
import { chunkGeometry, type ChunkLod, type ChunkOptions } from './chunks';

export interface StreamOptions {
  /** CPU height (a compiled graph). */
  height: HeightFn;
  /** World square. */
  bounds: { x0: number; z0: number; size: number };
  /** Fine tile edge (m, a multiple of the chunk size) and cell (m). */
  tile?: number;
  cell?: number;
  /** Coarse cell for the whole-world far grid (m). */
  farCell?: number;
  /** Keep fine tiles within this distance of the focus (m); evicted beyond radius × 1.35. */
  radius?: number;
  /** Bake budget per update (ms). */
  budgetMs?: number;
  /** Optional async whole-tile baker (the GPU: gpu.ts bakeGraphGPU). Returning null falls back to sliced CPU baking. */
  bakeTile?: (r: GridRegion) => Promise<Float32Array | null>;
  /** Pre-baked far grid data ((size / farCell + 1)², e.g. from a GPU bake or a file). */
  farData?: Float32Array;
}

interface Pending { key: number; ix: number; iz: number; data: Float32Array; row: number; n: number; async?: boolean }
// `row` counts samples done (not rows): baking stops mid-row when the budget runs out, so one slow height graph can't
// overrun the frame by a whole row.

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class StreamedHeightField implements SurfaceSource, TerrainField {
  readonly tile: number; readonly cell: number; readonly radius: number;
  readonly far: HeightGrid;
  private tiles = new Map<number, HeightGrid>();
  private pending: Pending[] = [];
  private fx = 0; private fz = 0;
  /** Called when a fine tile finishes (chunks over it rebuild). */
  onTile?: (x0: number, z0: number, size: number) => void;
  step = 0.55;
  stats = { baked: 0, evicted: 0, maxSliceMs: 0 };

  constructor(private o: StreamOptions) {
    this.tile = o.tile ?? 200; this.cell = o.cell ?? 2; this.radius = o.radius ?? 700;
    const fc = o.farCell ?? 16, b = o.bounds;
    this.far = new HeightGrid(b.x0, b.z0, b.size, fc, o.farData ?? o.height);
  }

  private key(ix: number, iz: number) { return (ix + 32768) * 65536 + (iz + 32768); }
  private tileAt(x: number, z: number) {
    const ix = Math.floor((x - this.o.bounds.x0) / this.tile), iz = Math.floor((z - this.o.bounds.z0) / this.tile);
    return this.tiles.get(this.key(ix, iz));
  }
  get residentTiles() { return this.tiles.size; }
  get residentBytes() { let b = 0; for (const t of this.tiles.values()) b += t.data.byteLength; for (const p of this.pending) b += p.data.byteLength; return b + this.far.data.byteLength; }
  get pendingTiles() { return this.pending.length; }
  /** True when the fine tile under (x, z) is ready. */
  fineAt(x: number, z: number) { return !!this.tileAt(x, z); }

  surface(x: number, z: number) {
    const t = this.tileAt(x, z);
    return t ? t.at(x, z) : this.far.at(x, z);
  }
  heightAt(x: number, z: number) { return this.surface(x, z); }
  normal(x: number, z: number, e = 1) {
    const nx = this.surface(x - e, z) - this.surface(x + e, z), nz = this.surface(x, z - e) - this.surface(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  }

  /** Move the focus (the player): queue missing tiles nearest first, evict far ones. */
  focus(x: number, z: number) {
    this.fx = x; this.fz = z;
    const b = this.o.bounds, T = this.tile, nT = Math.ceil(b.size / T), r = this.radius;
    const i0 = Math.max(0, Math.floor((x - r - b.x0) / T)), i1 = Math.min(nT - 1, Math.floor((x + r - b.x0) / T));
    const j0 = Math.max(0, Math.floor((z - r - b.z0) / T)), j1 = Math.min(nT - 1, Math.floor((z + r - b.z0) / T));
    for (let iz = j0; iz <= j1; iz++) for (let ix = i0; ix <= i1; ix++) {
      const k = this.key(ix, iz);
      if (this.tiles.has(k) || this.pending.some((p) => p.key === k)) continue;
      if (this.tileDist(ix, iz) > r) continue;
      const n = Math.round(T / this.cell) + 1;
      this.pending.push({ key: k, ix, iz, data: new Float32Array(n * n), row: 0, n });
    }
    // drop queued tiles we walked away from; evict resident ones beyond the hysteresis ring
    this.pending = this.pending.filter((p) => p.async || this.tileDist(p.ix, p.iz) <= r * 1.35);
    for (const [k, t] of this.tiles) {
      const ix = Math.round((t.x0 - b.x0) / T), iz = Math.round((t.z0 - b.z0) / T);
      if (this.tileDist(ix, iz) > r * 1.35) { this.tiles.delete(k); this.stats.evicted++; }
    }
    this.pending.sort((a, c) => this.tileDist(a.ix, a.iz) - this.tileDist(c.ix, c.iz));
  }

  private tileDist(ix: number, iz: number) {
    const b = this.o.bounds, T = this.tile;
    const cx = Math.max(b.x0 + ix * T, Math.min(this.fx, b.x0 + (ix + 1) * T)), cz = Math.max(b.z0 + iz * T, Math.min(this.fz, b.z0 + (iz + 1) * T));
    return Math.hypot(cx - this.fx, cz - this.fz);
  }

  /** Bake queued tiles for up to budgetMs (rows at a time on the CPU, or whole tiles on the async baker). */
  update(budgetMs = this.o.budgetMs ?? 4) {
    const t0 = now(), b = this.o.bounds, T = this.tile, c = this.cell, f = this.o.height;
    while (this.pending.length && now() - t0 < budgetMs) {
      const p = this.pending[0];
      if (p.async) { this.pending.push(this.pending.shift()!); if (this.pending.every((q) => q.async)) break; continue; }
      if (this.o.bakeTile && p.row === 0) {
        p.async = true;
        const r: GridRegion = { x0: b.x0 + p.ix * T, z0: b.z0 + p.iz * T, size: T, cell: c };
        void this.o.bakeTile(r).then((d) => {
          const i = this.pending.indexOf(p);
          if (i < 0) return;
          if (d) { this.pending.splice(i, 1); this.finish(p, d); } else p.async = false;
        });
        continue;
      }
      const x0 = b.x0 + p.ix * T, z0 = b.z0 + p.iz * T, total = p.n * p.n;
      for (let q = 0; q < 16 && p.row < total; q++, p.row++) { const i = p.row % p.n, j = (p.row - i) / p.n; p.data[p.row] = f(x0 + i * c, z0 + j * c); }
      if (p.row >= total) { this.pending.shift(); this.finish(p, p.data); }
    }
    this.stats.maxSliceMs = Math.max(this.stats.maxSliceMs, now() - t0);
  }

  private finish(p: Pending, d: Float32Array) {
    const b = this.o.bounds, T = this.tile, x0 = b.x0 + p.ix * T, z0 = b.z0 + p.iz * T;
    this.tiles.set(p.key, new HeightGrid(x0, z0, T, this.cell, d));
    this.stats.baked++;
    this.onTile?.(x0, z0, T);
  }

  /** Bake everything queued now (loading screens, the spawn point). */
  flush() { while (this.pending.some((p) => !p.async)) this.update(1e9); }
}

export interface StreamingChunkOptions extends Pick<ChunkOptions, 'holed' | 'mayHaveHoles' | 'uvScale' | 'lowTier'> {
  chunk?: number;
  /** Detail levels nearest first; the last range is the view distance. */
  lods?: ChunkLod[];
  /** Mesh building budget per update (ms); at least one build always runs when one is due. */
  buildBudgetMs?: number;
  name?: string;
}

interface Live { cx: number; cz: number; lod: number; mesh: THREE.Mesh; fine: boolean }

/** Ground meshes round the camera over a streamed field: built in view distance, dropped beyond, rebuilt fine. */
export class StreamingChunks {
  readonly group = new THREE.Group();
  readonly chunk: number; readonly lods: ChunkLod[];
  private live = new Map<number, Live>();
  stats = { built: 0, disposed: 0 };

  constructor(private field: StreamedHeightField, private material: THREE.Material, private o: StreamingChunkOptions = {}) {
    this.chunk = o.chunk ?? 100;
    this.lods = o.lods ?? [{ seg: 50, range: 200 }, { seg: 20, range: 600 }, { seg: 8, range: 1800 }];
    this.group.name = o.name ?? 'terrain-stream';
    // tiles should hold whole chunks (tile a multiple of chunk, bounds on the chunk grid) so a chunk is all fine or all far
    if (field.tile % this.chunk !== 0) console.warn(`[terrain] stream tile ${field.tile} m is not a multiple of the ${this.chunk} m chunk`);
  }

  private key(i: number, j: number) { return (i + 32768) * 65536 + (j + 32768); }
  get liveChunks() { return this.live.size; }
  get liveVertices() { let n = 0; for (const l of this.live.values()) n += l.mesh.geometry.attributes.position.count; return n; }

  private want: { k: number; cx: number; cz: number; lod: number; d: number }[] = [];
  private wx = Infinity; private wz = Infinity;

  update(cam: { x: number; z: number }) {
    const C = this.chunk, L = this.lods, view = L[L.length - 1].range, budget = this.o.buildBudgetMs ?? 3;
    // the wanted set only changes when the camera has moved a little: recompute every C/8
    if (Math.hypot(cam.x - this.wx, cam.z - this.wz) > C / 8) { this.plan(cam); this.wx = cam.x; this.wz = cam.z; }
    const t0 = now();
    for (const w of this.want) {
      const l = this.live.get(w.k), fineNow = this.field.fineAt(w.cx, w.cz);
      if (l && l.lod === w.lod && l.fine === fineNow) continue;     // up to date (a tile arriving or leaving flips fine)
      this.build(w.k, w.cx, w.cz, w.lod, fineNow, l);
      if (now() - t0 > budget) break;
    }
  }

  private plan(cam: { x: number; z: number }) {
    const C = this.chunk, L = this.lods, view = L[L.length - 1].range;
    const i0 = Math.floor((cam.x - view) / C), i1 = Math.floor((cam.x + view) / C), j0 = Math.floor((cam.z - view) / C), j1 = Math.floor((cam.z + view) / C);
    const want: { k: number; cx: number; cz: number; lod: number; d: number }[] = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * C, cz = (j + 0.5) * C, d = Math.max(0, Math.hypot(cx - cam.x, cz - cam.z) - C * 0.7);
      if (d > view) continue;
      want.push({ k: this.key(i, j), cx, cz, lod: L.findIndex((l) => d <= l.range), d });
    }
    want.sort((a, b) => a.d - b.d);
    const keep = new Set(want.map((w) => w.k));
    for (const [k, l] of this.live) if (!keep.has(k)) { this.group.remove(l.mesh); l.mesh.geometry.dispose(); this.live.delete(k); this.stats.disposed++; }
    this.want = want;
  }

  private build(k: number, cx: number, cz: number, lod: number, fine: boolean, old?: Live) {
    let seg = this.lods[lod].seg;
    if (this.o.lowTier) seg = Math.max(6, Math.round(seg * 0.6));
    const g = chunkGeometry(this.field, cx, cz, this.chunk, seg, lod > 0 ? 3 : 1.2, { ...this.o, gridNormals: true });
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = `${this.group.name}-${cx}-${cz}-${lod}`;
    if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); this.stats.disposed++; }
    this.group.add(mesh);
    this.live.set(k, { cx, cz, lod, mesh, fine });
    this.stats.built++;
  }

  dispose() { for (const l of this.live.values()) l.mesh.geometry.dispose(); this.live.clear(); this.group.clear(); }
}
