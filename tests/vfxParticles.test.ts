import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ParticleSim } from '../services/vfx/sim';
import { RECIPES, KILL_BURST, HIT_SPARKS, WALL_IMPACT } from '../services/vfx/recipes';

test('a kill burst fills sprite, smoke and shard layers, then everything dies', () => {
  const s = new ParticleSim({}, 3);
  s.spawn(KILL_BURST, [0, 1, 0], { tint: 0x38bdf8 });
  s.step(0.016);
  assert.ok(s.pools.add.out.count >= 50, `sparks ${s.pools.add.out.count}`);
  assert.ok(s.pools.shard.out.count >= 14);
  assert.equal(s.lights.length, 1);
  assert.ok(s.shake > 0.3);
  for (let k = 0; k < 20; k++) s.step(0.016);
  assert.ok(s.pools.alpha.out.count >= 6, 'delayed smoke spawned');
  for (let k = 0; k < 300; k++) s.step(0.016);
  assert.equal(s.liveCount, 0);
});

test('sparks spray along the given direction and gravity pulls them down', () => {
  const s = new ParticleSim({}, 5);
  s.spawn({ id: 't', emitters: [{ layer: 'add', shape: 'spark', count: 200, life: 1, speed: 10, spread: 0.3, size: [0.02, 0.01], color: [0xffffff, 0xffffff], gravity: 9.8 }] }, [0, 0, 0], { dir: [1, 0, 0] });
  s.step(0.05);
  const o = s.pools.add.out;
  let sx = 0, vy = 0;
  for (let i = 0; i < o.count; i++) { sx += o.posAge[i * 4]; vy += o.velSize[i * 4 + 1]; }
  assert.ok(sx / o.count > 0.4, 'moved along +x');
  assert.ok(vy / o.count < 0, 'falling');
});

test('bouncing particles stay above the ground', () => {
  const s = new ParticleSim({}, 9);
  s.ground = () => 0;
  s.spawn(WALL_IMPACT, [0, 0.3, 0], { dir: [0, 1, 0], tint: 0xffaa00 });
  let minY = Infinity;
  for (let k = 0; k < 40; k++) {
    s.step(0.016);
    const o = s.pools.add.out;
    for (let i = 0; i < o.count; i++) if (o.misc[i * 4] > 0) minY = Math.min(minY, o.posAge[i * 4 + 1]);
  }
  assert.ok(minY >= -1e-6, `min y ${minY}`);
});

test('tint colours the sparks and a full pool recycles instead of growing', () => {
  const s = new ParticleSim({ add: 64 }, 2);
  for (let k = 0; k < 20; k++) s.spawn(HIT_SPARKS, [0, 0, 0], { tint: 0xff0000 });
  s.step(0.2);
  const o = s.pools.add.out;
  assert.ok(o.count <= 64);
  let r = 0, b = 0;
  for (let i = 0; i < o.count; i++) { r += o.color[i * 4]; b += o.color[i * 4 + 2]; }
  assert.ok(r > b, 'red tint dominates');
});

test('every recipe is valid data', () => {
  for (const r of Object.values(RECIPES)) {
    assert.ok(r.emitters.length > 0, r.id);
    for (const e of r.emitters) { assert.ok(['add', 'alpha', 'shard'].includes(e.layer)); assert.equal(e.size.length, 2); assert.equal(e.color.length, 2); }
    const s = new ParticleSim({}, 1);
    s.spawn(r, [0, 0, 0], { tint: 0x22ccff });
    for (let k = 0; k < 10; k++) s.step(0.016);
    for (const l of ['add', 'alpha', 'shard'] as const) { const o = s.pools[l].out; for (let i = 0; i < o.count * 4; i++) assert.ok(Number.isFinite(o.posAge[i]) && Number.isFinite(o.color[i])); }
  }
});

test('a blade trail builds a strip from its samples, smooths it, and empties after its life', async () => {
  const THREE = await import('three/webgpu');
  const { Trail } = await import('../services/vfx/trails');
  const t = new Trail({ mode: 'blade', life: 0.2, samples: 16 });
  t.emitting = true;
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * k / 8;
    t.push(new THREE.Vector3(Math.cos(a) * 0.3, 1, Math.sin(a) * 0.3), new THREE.Vector3(Math.cos(a), 1, Math.sin(a)));
    t.update(0.016);
  }
  const g = t.mesh.geometry as InstanceType<typeof THREE.BufferGeometry>;
  // 8 samples → 7 segments × 4 sub-steps → 29 cross-sections → 28 quads
  assert.equal(g.drawRange.count, 28 * 6);
  const p = g.attributes.position.array as Float32Array, uv = g.attributes.uv.array as Float32Array;
  assert.ok(uv[0] < 0.1 && uv[28 * 4] > uv[0] + 0.3, 'u grows from the head (one frame old) to the tail');
  for (let i = 0; i < 29 * 6; i++) assert.ok(Number.isFinite(p[i]));
  t.emitting = false;
  for (let k = 0; k < 20; k++) t.update(0.016);
  assert.equal(g.drawRange.count, 0);
});

test('slashes reuse a small pool and throw sparks as they open', async () => {
  const THREE = await import('three/webgpu');
  const { Slashes } = await import('../services/vfx/trails');
  const { SLASH } = await import('../services/vfx/recipes');
  const s = new Slashes(3);
  const sparks: string[] = [];
  s.onSparks = (id) => sparks.push(id);
  for (let k = 0; k < 5; k++) s.spawn(SLASH, new THREE.Vector3(0, 1, 0), { forward: new THREE.Vector3(0, 0, -1), flip: k % 2 === 1 });
  assert.equal(s.active, 3);
  for (let k = 0; k < 8; k++) { s.group.updateMatrixWorld(true); s.update(0.016); }
  assert.ok(sparks.length >= 3 && sparks.every((x) => x === 'slash_sparks'));
  for (let k = 0; k < 30; k++) s.update(0.016);
  assert.equal(s.active, 0);
});
