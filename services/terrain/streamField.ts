// Plajah Terrain — the streamed height field (docs/plajah-terrain.md, phase 6). Three-free: the game, tools, tests and
// the mesh worker all use it.
//   far grid     the whole world once at a coarse cell (8 km at 16 m = 501²): distant ground, and the fallback;
//   fine tiles   square tiles at the fine cell, baked round the player in time slices (a few ms a frame, nearest
//                first) and evicted behind them, so memory stays flat however far you walk.
// surface() reads the fine tile when it's ready and the far grid otherwise; it never calls the (slow) height graph.
import { HeightGrid, type GridRegion, type HeightFn, type SurfaceSource, type TerrainField } from './field';

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

/** Fine tiles over a far grid: the lookup the streamed field and the mesh worker share. */
export class TileSurface implements SurfaceSource {
  readonly tiles = new Map<number, HeightGrid>();
  constructor(readonly far: HeightGrid, readonly bounds: { x0: number; z0: number }, readonly tile: number) {}
  key(ix: number, iz: number) { return (ix + 32768) * 65536 + (iz + 32768); }
  keyAt(x: number, z: number) { return this.key(Math.floor((x - this.bounds.x0) / this.tile), Math.floor((z - this.bounds.z0) / this.tile)); }
  /** True when the fine tile under (x, z) is ready. */
  fineAt(x: number, z: number) { return this.tiles.has(this.keyAt(x, z)); }
  surface(x: number, z: number) {
    const t = this.tiles.get(this.keyAt(x, z));
    return t ? t.at(x, z) : this.far.at(x, z);
  }
  normal(x: number, z: number, e = 1) {
    const nx = this.surface(x - e, z) - this.surface(x + e, z), nz = this.surface(x, z - e) - this.surface(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  }
}

/** Hears tiles arrive and leave (chunk managers, the mesh worker's mirror). */
export interface TileListener { onTile?(g: HeightGrid): void; onEvict?(x0: number, z0: number): void }

export class StreamedHeightField implements SurfaceSource, TerrainField {
  readonly tile: number; readonly cell: number; readonly radius: number;
  readonly far: HeightGrid;
  readonly bounds: { x0: number; z0: number; size: number };
  readonly lookup: TileSurface;
  private get tiles() { return this.lookup.tiles; }
  private pending: Pending[] = [];
  private fx = 0; private fz = 0;
  private listeners: TileListener[] = [];
  step = 0.55;
  stats = { baked: 0, evicted: 0, maxSliceMs: 0 };

  constructor(private o: StreamOptions) {
    this.tile = o.tile ?? 200; this.cell = o.cell ?? 2; this.radius = o.radius ?? 700;
    const fc = o.farCell ?? 16, b = o.bounds;
    this.bounds = b;
    this.far = new HeightGrid(b.x0, b.z0, b.size, fc, o.farData ?? o.height);
    this.lookup = new TileSurface(this.far, b, this.tile);
  }

  /** Listen for tiles arriving and leaving; returns an unsubscribe. */
  listen(l: TileListener) { this.listeners.push(l); return () => { this.listeners = this.listeners.filter((x) => x !== l); }; }
  /** The resident fine tiles (a new listener catches up from these). */
  residentGrids() { return [...this.tiles.values()]; }

  private key(ix: number, iz: number) { return this.lookup.key(ix, iz); }
  get residentTiles() { return this.tiles.size; }
  get residentBytes() { let b = 0; for (const t of this.tiles.values()) b += t.data.byteLength; for (const p of this.pending) b += p.data.byteLength; return b + this.far.data.byteLength; }
  get pendingTiles() { return this.pending.length; }
  /** True when the fine tile under (x, z) is ready. */
  fineAt(x: number, z: number) { return this.lookup.fineAt(x, z); }

  surface(x: number, z: number) { return this.lookup.surface(x, z); }
  heightAt(x: number, z: number) { return this.lookup.surface(x, z); }
  normal(x: number, z: number, e = 1) { return this.lookup.normal(x, z, e); }

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
      if (this.tileDist(ix, iz) > r * 1.35) { this.tiles.delete(k); this.stats.evicted++; for (const l of this.listeners) l.onEvict?.(t.x0, t.z0); }
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
    const g = new HeightGrid(x0, z0, T, this.cell, d);
    this.tiles.set(p.key, g);
    this.stats.baked++;
    for (const l of this.listeners) l.onTile?.(g);
  }

  /** Bake everything queued now (loading screens, the spawn point). */
  flush() { while (this.pending.some((p) => !p.async)) this.update(1e9); }
}

