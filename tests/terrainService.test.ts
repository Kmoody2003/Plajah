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

// ── phase 2: noise + terrain graph ──────────────────────────────────────────────────────────────────────────────────
import { cellularNoise, fractal, gradientNoise, hash2, valueNoise } from '../services/terrain/noise';
import { compileGraph, gpuReady, validateGraph, type TerrainGraph } from '../services/terrain/graph';
import { HIGHLANDS } from '../services/terrain/presets/highlands';

test('hash is deterministic, 32-bit and well spread', () => {
  assert.equal(hash2(3, -7, 1), hash2(3, -7, 1));
  assert.notEqual(hash2(3, -7, 1), hash2(3, -7, 2));
  const buckets = new Array(16).fill(0);
  for (let i = -50; i < 50; i++) for (let j = -50; j < 50; j++) { const h = hash2(i, j, 9); assert.ok(h >= 0 && h < 2 ** 32); buckets[h >>> 28]++; }
  for (const b of buckets) assert.ok(b > 450 && b < 800, `bucket ${b}`);
});

test('noises stay in range and are continuous across lattice lines', () => {
  for (const f of [valueNoise, gradientNoise, cellularNoise]) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < 5000; k++) { const v = f(k * 0.137 - 300, k * 0.291 + 50, 4); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    assert.ok(lo >= -1.05 && hi <= 1.05 && hi - lo > 0.8, `${f.name} ${lo}..${hi}`);
    for (const x of [2, -5, 17]) assert.ok(Math.abs(f(x - 1e-7, 0.4, 4) - f(x + 1e-7, 0.4, 4)) < 1e-4, `${f.name} jumps at ${x}`);
  }
  for (let k = 0; k < 500; k++) { const r = fractal(k * 0.31, k * 0.17, { mode: 'ridged', seed: 2 }); assert.ok(r >= 0 && r <= 1); }
});

test('graph validation catches unknown nodes, cycles and bad parameters', () => {
  const bad: TerrainGraph = { version: 1, output: 'a', nodes: {
    a: { type: 'combine', op: 'add', inputs: ['b', 'ghost'] }, b: { type: 'scale', input: 'a' },
    n: { type: 'noise', freq: 0 }, c: { type: 'curve', input: 1, points: [[1, 0], [0, 1]] }, f: { type: 'fn', name: 'nope' } } };
  const errs = validateGraph(bad).join('\n');
  for (const s of ['ghost', 'cycle', 'freq', 'curve', 'nope']) assert.ok(errs.includes(s), `missing "${s}" in ${errs}`);
  assert.throws(() => compileGraph(bad));
  assert.deepEqual(validateGraph(HIGHLANDS), []);
});

test('graph nodes compute what they say', () => {
  const g: TerrainGraph = { version: 1, output: 'out', nodes: {
    x: { type: 'distance', center: [0, 0] },
    c: { type: 'curve', input: 'x', points: [[0, 0], [10, 5], [20, 5]] },
    t: { type: 'terrace', input: 'x', step: 4, sharpness: 100 },
    m: { type: 'mix', a: 0, b: 10, t: 'half' }, half: { type: 'const', value: 0.5 },
    p: { type: 'path', points: [[-100, 0], [100, 0]], width: 10, depth: 3, falloff: 5 },
    out: { type: 'combine', op: 'add', inputs: ['c', 'm'] } } };
  const out = compileGraph(g), at = (id: string) => compileGraph({ ...g, output: id });
  assert.equal(out(6, 8), 5 + 5);                       // distance 10 → curve 5, mix 5
  assert.equal(at('c')(15, 0), 5);
  assert.ok(Math.abs(at('t')(0, 5.5) - 4) < 1e-9 && Math.abs(at('t')(0, 7.9) - 8) < 1e-6, 'sharp terraces snap to steps');
  assert.equal(at('p')(0, 3), 3); assert.equal(at('p')(0, 20), 0);
});

test('the Wilds graph is the hand-written height, unchanged', () => {
  const g: TerrainGraph = { version: 1, nodes: { base: { type: 'fn', name: 'w' } }, output: 'base' };
  assert.equal(gpuReady(g), false);
  const f = compileGraph(g, { w: worldHeight });
  for (let k = 0; k < 2000; k++) { const x = (k * 37.1) % 2000 - 1000, z = (k * 91.7) % 2000 - 1000; assert.equal(f(x, z), worldHeight(x, z)); }
});

test('Highlands: a pure-graph world with valley, mountains, mesa, crater and river', () => {
  assert.equal(gpuReady(HIGHLANDS), true);
  const f = compileGraph(HIGHLANDS);
  const field = new HeightField({ height: f, world: { x0: -1000, z0: -1000, size: 2000, cell: 8 } });
  let lo = Infinity, hi = -Infinity;
  for (let x = -1000; x <= 1000; x += 25) for (let z = -1000; z <= 1000; z += 25) { const h = field.surface(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
  assert.ok(hi - lo > 150, `relief ${lo}..${hi}`);
  assert.ok(f(-360, 260) > f(-360 + 250, 260) + 30, 'the mesa stands above its surroundings');
  assert.ok(f(420, -360) < f(420 + 120, -360), 'the crater floor sits below its rim');
  assert.ok(f(-60, -120) < f(-60, -120 + 80) - 8, 'the river is carved below its banks');
  assert.ok(f(900, 900) - f(0, 0) > 40 || f(-900, 900) - f(0, 0) > 40, 'mountains rise toward the edges');
});

// ── phase 3: erosion, maps, rasters ─────────────────────────────────────────────────────────────────────────────────
import { encodeRaster, decodeRaster } from '../services/terrain/raster';
import { hydraulicErosion } from '../services/terrain/erode/hydraulic';
import { thermalErosion } from '../services/terrain/erode/thermal';
import { erodeGrid } from '../services/terrain/erode/index';
import { flowAccumulation } from '../services/terrain/maps';

/** A cone 40 m tall on a 65 × 65 grid at 2 m, with a little noise so drops pick paths. */
function cone(n = 65, cell = 2) {
  const h = new Float32Array(n * n), c = (n - 1) / 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[i + j * n] = Math.max(0, 40 - Math.hypot(i - c, j - c) * cell * 0.9) + valueNoise(i * 0.7, j * 0.7, 3) * 0.3;
  return h;
}
const centreMass = (h: Float32Array, n: number) => { let a = 0, b = 0; const c = (n - 1) / 2; for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = i + j * n, r = Math.hypot(i - c, j - c); if (r < 8) a += h[k]; else if (r < 20) b += h[k]; } return { inner: a, ring: b }; };

test('raster round trip: i16 heights within half a step, u8 maps within 1/255', () => {
  const n = 11, r = rand(3), a = new Float32Array(n * n).map(() => (r() - 0.5) * 80), b = new Float32Array(n * n).map(() => r());
  const buf = encodeRaster([{ name: 'delta', x0: -10, z0: -10, size: 20, cell: 2, data: a, type: 'i16', step: 0.01 }, { name: 'wet', x0: 0, z0: 0, size: 10, cell: 1, data: b, type: 'u8' }], { hi: 1 });
  const d = decodeRaster(buf);
  assert.deepEqual(d.meta, { hi: 1 });
  for (let k = 0; k < n * n; k++) { assert.ok(Math.abs(d.layers.delta.data[k] - a[k]) <= 0.005 + 1e-6); assert.ok(Math.abs(d.layers.wet.data[k] - b[k]) <= 0.5 / 255 + 1e-6); }
  assert.ok(Math.abs(d.layers.delta.at(-10 + 4, -10 + 6) - a[2 + 3 * n]) <= 0.005 + 1e-6);
  assert.throws(() => decodeRaster(new ArrayBuffer(16)));
});

test('hydraulic erosion moves material downhill, is deterministic and leaves protected cells alone', () => {
  const n = 65, a = cone(), b = Float32Array.from(a), before = centreMass(a, n);
  const protect = new Float32Array(n * n); for (let k = 0; k < n * 10; k++) protect[k] = 1;   // the first 10 rows
  const p0 = Float32Array.from(a.subarray(0, n * 10));
  hydraulicErosion(a, n, 2, { droplets: 3000, seed: 5, protect });
  hydraulicErosion(b, n, 2, { droplets: 3000, seed: 5, protect });
  assert.deepEqual(a, b, 'same seed, same result');
  const after = centreMass(a, n);
  assert.ok(after.inner < before.inner, `the peak lost material (${before.inner.toFixed(0)} → ${after.inner.toFixed(0)})`);
  for (let k = 0; k < n * 10; k++) assert.equal(a[k], p0[k]);
});

test('thermal erosion slumps a spike toward the angle of repose and spares protected cells', () => {
  const n = 21, h = new Float32Array(n * n); h[10 + 10 * n] = 30; h[3 + 3 * n] = 30;
  const protect = new Float32Array(n * n); protect[3 + 3 * n] = 1;
  thermalErosion(h, n, 1, { iterations: 200, talus: 35, rate: 0.25, protect });
  assert.ok(h[10 + 10 * n] < 10, `spike slumped to ${h[10 + 10 * n]}`);
  assert.equal(h[3 + 3 * n], 30);
  let sum = 0; for (let k = 0; k < n * n; k++) if (k !== 3 + 3 * n) sum += h[k];
  assert.ok(Math.abs(sum - 30) < 1e-2, `mass kept (${sum})`);
});

test('D8 flow accumulates the whole tilted plane into its lowest corner', () => {
  const n = 16, h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[i + j * n] = i + j * 1.01;
  const acc = flowAccumulation(h, n);
  assert.equal(acc[0], n * n);
  assert.equal(acc[n * n - 1], 1);
});

test('erodeGrid clamps the change, keeps the input and reports maps', () => {
  const n = 65, a = cone(), copy = Float32Array.from(a);
  const r = erodeGrid(a, n, 2, { dropsPerCell: 1, maxCut: 0.5, maxFill: 0.2, seed: 2 });
  assert.deepEqual(a, copy, 'input untouched');
  let lo = 0, hi = 0; for (const d of r.delta) { lo = Math.min(lo, d); hi = Math.max(hi, d); }
  assert.ok(lo >= -0.5 - 1e-6 && hi <= 0.2 + 1e-6 && lo < -0.1, `delta ${lo}..${hi}`);
  for (let k = 0; k < n * n; k++) assert.ok(Math.abs(r.height[k] - (copy[k] + r.delta[k])) < 1e-4);
  for (const m of [r.flow, r.wetness, r.deposition]) for (const v of m) assert.ok(v >= 0 && v <= 1);
});

test('a raster node adds a baked layer to the graph', () => {
  const delta = new HeightGrid(0, 0, 10, 1, (x) => x * 0.5);
  const g: TerrainGraph = { version: 1, output: 'out', nodes: { base: { type: 'const', value: 3 }, e: { type: 'raster', name: 'd' }, out: { type: 'combine', op: 'add', inputs: ['base', 'e'] } } };
  assert.equal(gpuReady(g), false);
  assert.ok(validateGraph(g).some((s) => s.includes('no raster')));
  assert.equal(compileGraph(g, {}, { d: delta })(4, 2), 5);
});

// ── phase 4: the ground material painted by the land ────────────────────────────────────────────────────────────────
test('splat material: map-only layers drop out without a bake; map textures hold the grid', async () => {
  const { activeLayers, mapTexture, terrainSplatMaterial } = await import('../services/terrain/material');
  const L = [{ name: 'base', color: () => 0 }, { name: 'wet', needsMaps: true, color: () => 0 }, { name: 'rock', color: () => 0, where: { up: [0.78, 0.6] as [number, number] } }];
  assert.deepEqual(activeLayers(L, false).map((l) => l.name), ['base', 'rock']);
  assert.deepEqual(activeLayers(L, true).map((l) => l.name), ['base', 'wet', 'rock']);
  const g = new HeightGrid(0, 0, 4, 1, (x, z) => (x + z) / 8);
  const t = mapTexture(g);
  assert.equal(t.image.width, 5);
  assert.equal((t.image.data as Uint8Array)[4 + 4 * 5], 255);
  assert.equal((t.image.data as Uint8Array)[0], 0);
  const { vec3 } = await import('three/tsl');
  const plain = terrainSplatMaterial({ layers: [{ name: 'a', color: () => vec3(1, 0, 0) }, { name: 'b', needsMaps: true, color: () => vec3(0, 1, 0), roughness: 0.5, where: { wet: [0.5, 0.8] } }] });
  assert.equal(plain.hasMaps, false); assert.deepEqual(plain.layers, ['a']); assert.equal(plain.material.roughnessNode, null);
  const withMaps = terrainSplatMaterial({ maps: { wetness: g }, layers: [{ name: 'a', color: () => vec3(1, 0, 0) }, { name: 'b', needsMaps: true, color: () => vec3(0, 1, 0), roughness: 0.5, where: { wet: [0.5, 0.8] } }] });
  assert.equal(withMaps.hasMaps, true); assert.deepEqual(withMaps.layers, ['a', 'b']); assert.ok(withMaps.material.roughnessNode);
  plain.dispose(); withMaps.dispose();
});

test('normal texture of a height field encodes its slope; the material takes it as the shading normal', async () => {
  const { normalTexture, terrainSplatMaterial } = await import('../services/terrain/material');
  const g = new HeightGrid(0, 0, 20, 2, (x) => x);              // 45° rising toward +x → normal (−0.707, 0.707, 0)
  const t = normalTexture(g), d = t.image.data as Uint8Array, k = (5 + 5 * g.n) * 2;
  assert.ok(Math.abs(d[k] / 255 * 2 - 1 + Math.SQRT1_2) < 0.01, `nx ${d[k] / 255 * 2 - 1}`);
  assert.ok(Math.abs(d[k + 1] / 255 * 2 - 1) < 0.01);
  assert.equal(t.generateMipmaps, true);
  const { vec3 } = await import('three/tsl');
  const without = terrainSplatMaterial({ layers: [{ name: 'a', color: () => vec3(1) }] });
  const withField = terrainSplatMaterial({ layers: [{ name: 'a', color: () => vec3(1) }], normalField: { grid: g, geometryInside: { x0: 0, z0: 0, size: 4 } } });
  assert.equal(without.material.normalNode, null);
  assert.ok(withField.material.normalNode);
  without.dispose(); withField.dispose();
});

// ── phase 5: the EcoSystem ──────────────────────────────────────────────────────────────────────────────────────────
import { scatterEcosystem, suitability, validateEco, type EcoRule, type EcoWorld } from '../services/terrain/eco/index';
import { WILDS_ECO } from '../games/rift-realm/src/world/eco';

const flatWorld = (o: Partial<EcoWorld> = {}): EcoWorld => ({
  bounds: { x0: 0, z0: 0, x1: 200, z1: 200 }, height: (x) => x * 0.1, normal: () => [0, 1, 0], trunkRadius: () => 0.5, ...o,
});

test('eco: canopy rules share candidates by weight × suitability and keep by density; deterministic', () => {
  const rules: EcoRule[] = [
    { id: 'low', kind: 'tree', layer: 'canopy', species: 0, weight: 1, density: 1, height: [12, 8] },   // below ~10 m
    { id: 'high', kind: 'tree', layer: 'canopy', species: 1, weight: 1, density: 0.5, height: [8, 12] },
  ];
  const a = scatterEcosystem(flatWorld(), rules, { canopyCell: 5, seed: 3 }), b = scatterEcosystem(flatWorld(), rules, { canopyCell: 5, seed: 3 });
  assert.deepEqual(a.trees, b.trees);
  const low = a.trees.filter((t) => t.species === 0), high = a.trees.filter((t) => t.species === 1);
  assert.ok(low.every((t) => t.x < 125) && high.every((t) => t.x > 75), 'species follow their height ranges');
  const lowLeft = low.filter((t) => t.x < 70).length, highRight = high.filter((t) => t.x > 130).length;
  assert.ok(highRight > 0.35 * lowLeft && highRight < 0.65 * lowLeft, `density 0.5 halves the count (${highRight} vs ${lowLeft})`);
});

test('eco: around rules grow from hosts, ground rules on their own grid, map rules only with maps', () => {
  const rules: EcoRule[] = [
    { id: 'tree', kind: 'tree', layer: 'canopy', species: 6, density: 1 },
    { id: 'fern', kind: 'plant', layer: 'around', species: 2, hosts: [6], prob: 1, count: [2, 2], ring: [1, 2], trunkScaled: true },
    { id: 'shelf', kind: 'fungus', layer: 'around', species: 4, hosts: [6], prob: 1, count: [1, 1], ring: [0, 0], onTrunk: [3, 3] },
    { id: 'wetcap', kind: 'fungus', layer: 'ground', species: 0, cell: 10, density: 1, needsMaps: true, wet: [0.4, 0.6] },
  ];
  const plain = scatterEcosystem(flatWorld(), rules, { canopyCell: 20, seed: 1 });
  assert.equal(plain.plants.length, plain.trees.length * 2);
  for (const p of plain.plants) assert.ok(plain.trees.some((t) => { const d = Math.hypot(p.x - t.x, p.z - t.z); return d >= 0.5 - 1e-9 && d <= 1 + 1e-9; }));
  assert.equal(plain.fungi.length, plain.trees.length, 'shelf only: no maps, no wetcaps');
  const shelf = plain.fungi[0], host = plain.trees.find((t) => Math.hypot(t.x - shelf.x, t.z - shelf.z) < 0.6)!;
  assert.ok(Math.abs(shelf.y - (host.y + 1.5)) < 1e-9, 'on the trunk at 3 radii');
  const wet = scatterEcosystem(flatWorld({ maps: { wet: { at: (x) => (x > 100 ? 1 : 0) } } }), rules, { canopyCell: 20, seed: 1 });
  const caps = wet.fungi.filter((f) => f.species === 0);
  assert.ok(caps.length > 50 && caps.every((f) => f.x > 95), `wetcaps on the wet half only (${caps.length})`);
});

test('eco: suitability multiplies ranges and the region mask; rule sets validate', () => {
  const r: EcoRule = { id: 'a', kind: 'plant', layer: 'ground', species: 0, cell: 1, density: 1, up: [0.8, 0.9], where: (s) => (s.x > 0 ? 1 : 0.5) };
  const s = { x: 1, z: 0, y: 0, up: 0.85, wet: 0, flow: 0, dep: 0, clear: Infinity, maps: false, memo: {} };
  assert.ok(Math.abs(suitability(r, s) - 0.5) < 1e-9);
  assert.ok(Math.abs(suitability(r, { ...s, x: -1 }) - 0.25) < 1e-9);
  assert.deepEqual(validateEco(WILDS_ECO), []);
  assert.ok(validateEco([{ id: 'x', kind: 'tree', layer: 'canopy', species: 0, density: 2 }, { id: 'x', kind: 'plant', layer: 'around', species: 0, prob: 1, count: [3, 1], ring: [0, 1] }]).length >= 3);
});
