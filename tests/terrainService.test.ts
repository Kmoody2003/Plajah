// services/terrain phase 1: the shared height field must answer exactly what Rift Realm's own grids answered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ColumnGrid, HeightField, HeightGrid } from '../services/terrain/field';
import { HALF, worldHeight } from '../games/rift-realm/src/world/layout';

// Rift Realm's grid sampler before the move (world/terrain.ts, commit 77c282db), kept verbatim as the reference.
class LegacyGrid {
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

const rand = (s: number) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

test('Wilds height field matches the legacy bake everywhere (world + hollow detail)', () => {
  const world = new LegacyGrid(-HALF, -HALF, HALF * 2, 2, worldHeight), core = new LegacyGrid(-112, -112, 224, 1, worldHeight);
  const legacy = (x: number, z: number) => (core.inside(x, z) ? core.at(x, z) : world.at(x, z));
  const f = new HeightField({ height: worldHeight, world: { x0: -HALF, z0: -HALF, size: HALF * 2, cell: 2 }, detail: [{ x0: -112, z0: -112, size: 224, cell: 1 }] });
  const r = rand(7);
  let worst = 0;
  for (let k = 0; k < 20000; k++) {
    // a third of the points inside the hollow, the rest anywhere (and a little outside the world, to test clamping)
    const x = k % 3 === 0 ? (r() - 0.5) * 230 : (r() - 0.5) * (HALF * 2 + 40), z = k % 3 === 0 ? (r() - 0.5) * 230 : (r() - 0.5) * (HALF * 2 + 40);
    worst = Math.max(worst, Math.abs(f.surface(x, z) - legacy(x, z)));
  }
  assert.equal(worst, 0, `max difference ${worst} m`);
});

test('grid reads exact samples on nodes and is bilinear between them', () => {
  const g = new HeightGrid(0, 0, 10, 1, (x, z) => 2 * x + 3 * z);
  assert.equal(g.at(4, 7), 29);
  assert.ok(Math.abs(g.at(4.5, 7.25) - (9 + 21.75)) < 1e-4);
  assert.ok(Math.abs(g.at(-5, 3) - 9) < 1e-4, 'clamped to the edge');
});

test('normal and slope of a 45° plane', () => {
  const f = new HeightField({ height: (x) => x, world: { x0: -50, z0: -50, size: 100, cell: 1 } });
  const n = f.normal(0, 0);
  assert.ok(Math.abs(n[0] + Math.SQRT1_2) < 1e-6 && Math.abs(n[1] - Math.SQRT1_2) < 1e-6 && Math.abs(n[2]) < 1e-6);
  assert.ok(Math.abs(f.slope(3, 4) - 45) < 1e-6);
});

test('column grid finds columns in overlapping cells only', () => {
  const c = new ColumnGrid(8);
  c.add(1, 1, 0.5, 0, 10); c.add(30, 30, 0.5, 0, 10); c.add(-3, 2, 0.4, 0, 5);
  assert.equal(c.size, 3);
  assert.deepEqual(c.near(0, 0, 2).map((t) => t[0]).sort((a, b) => a - b), [-3, 1]);
  assert.equal(c.near(30, 30, 1).length, 1);
  assert.equal(c.near(100, 100, 1).length, 0);
});
