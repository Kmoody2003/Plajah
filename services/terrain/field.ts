// Plajah Terrain — height fields (docs/plajah-terrain.md, phase 1).
//
// A world's height is a function f(x, z) baked once into grids: one coarse grid over the whole world plus optional finer
// grids over the places that need more detail (an arena, a hollow). Sampling picks the finest grid that holds the point
// and reads it bilinearly. Columns (tree trunks, pillars) live in a hashed cell grid so collision can ask "what's near me"
// without a giant triangle BVH. No three.js here: games, tools and tests all use it.

/** A ground the collision world can stand on: answered from grids, not triangles. Games put one on userData.terrain. */
export interface TerrainField {
  /** Ground height at (x, z); `y` (the query's height) lets caves and hollow trunks answer -Infinity inside them. */
  heightAt(x: number, z: number, y?: number): number;
  /** Vertical columns near (x, z) within `r`: [x, z, radius, y0, y1] each. */
  trunksNear?(x: number, z: number, r: number): ArrayLike<number>[];
  /** Highest step a capsule walks up; terrain rising more than this across its radius is a wall. */
  step?: number;
}

/** Anything chunks can mesh: a surface height and its normal. */
export interface SurfaceSource {
  surface(x: number, z: number): number;
  normal(x: number, z: number, e?: number): number[];
}

export type HeightFn = (x: number, z: number) => number;

/** One square grid of heights, (size / cell + 1)² samples from (x0, z0). */
export class HeightGrid {
  readonly n: number;
  readonly data: Float32Array;
  constructor(readonly x0: number, readonly z0: number, readonly size: number, readonly cell: number, f: HeightFn) {
    this.n = Math.round(size / cell) + 1;
    this.data = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) this.data[i + j * this.n] = f(x0 + i * cell, z0 + j * cell);
  }
  inside(x: number, z: number) { return x >= this.x0 && z >= this.z0 && x <= this.x0 + this.size && z <= this.z0 + this.size; }
  /** Bilinear height at (x, z), clamped to the grid's edge. */
  at(x: number, z: number) {
    const n = this.n, fx = Math.min(n - 1.0001, Math.max(0, (x - this.x0) / this.cell)), fz = Math.min(n - 1.0001, Math.max(0, (z - this.z0) / this.cell));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, d = this.data, k = i + j * n;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + n] * (1 - u) + d[k + n + 1] * u) * v;
  }
}

/** A square region baked at its own cell size. */
export interface GridRegion { x0: number; z0: number; size: number; cell: number }

export interface HeightFieldOptions {
  /** The height function to bake. */
  height: HeightFn;
  /** The whole world (coarsest grid). */
  world: GridRegion;
  /** Finer regions; the first one holding a point wins, so list the finest first. */
  detail?: GridRegion[];
  /** Name for the bake log line (omit to stay quiet). */
  name?: string;
}

/** A world's baked surface: coarse world grid + finer detail grids, baked lazily on first use. */
export class HeightField implements SurfaceSource {
  private grids: HeightGrid[] = [];
  baked = false;
  constructor(protected opts: HeightFieldOptions) {}

  bake() {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const { height, world, detail = [] } = this.opts;
    this.grids = [...detail, world].map((r) => new HeightGrid(r.x0, r.z0, r.size, r.cell, height));
    this.baked = true;
    if (this.opts.name) console.info(`[terrain] ${this.opts.name} baked in ${Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0)} ms`);
  }

  /** Surface height (ignores caves and overlays): for placing things and drawing the ground. */
  surface(x: number, z: number) {
    if (!this.baked) this.bake();
    const g = this.grids;
    for (let k = 0; k < g.length - 1; k++) if (g[k].inside(x, z)) return g[k].at(x, z);
    return g[g.length - 1].at(x, z);
  }

  /** Unit normal from central differences `e` metres apart. */
  normal(x: number, z: number, e = 1) {
    const nx = this.surface(x - e, z) - this.surface(x + e, z), nz = this.surface(x, z - e) - this.surface(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    return [nx / l, (2 * e) / l, nz / l];
  }

  /** Slope in degrees at (x, z). */
  slope(x: number, z: number, e = 1) { return Math.acos(Math.min(1, this.normal(x, z, e)[1])) * 180 / Math.PI; }
}

/** Vertical columns (trunks, pillars) in a hashed cell grid: [x, z, radius, y0, y1]. */
export class ColumnGrid {
  private cells = new Map<number, number[][]>();
  private out: number[][] = [];
  constructor(readonly cell = 8) {}
  private key(i: number, j: number) { return i * 4096 + j; }
  add(x: number, z: number, r: number, y0: number, y1: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.cells.get(k); if (!a) { a = []; this.cells.set(k, a); }
    a.push([x, z, r, y0, y1]);
  }
  /** Columns whose cell overlaps the square of half-size r round (x, z). The returned array is reused per call. */
  near(x: number, z: number, r: number) {
    const out = this.out, c = this.cell; out.length = 0;
    const i0 = Math.floor((x - r) / c), i1 = Math.floor((x + r) / c), j0 = Math.floor((z - r) / c), j1 = Math.floor((z + r) / c);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = this.cells.get(this.key(i, j)); if (a) for (const t of a) out.push(t); }
    return out;
  }
  get size() { let n = 0; for (const a of this.cells.values()) n += a.length; return n; }
}
