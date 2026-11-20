import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growTree } from '../services/vegetation/trees/grow';
import { profileAt, validateSpecies } from '../services/vegetation/species';
import { measureTree } from '../services/vegetation/fromArt/profile';
import { CYBER_FOREST_TREES, CF_BLUE } from '../services/vegetation/catalog/cyberForest';

test('species in the Cyber Forest catalog are valid', () => {
  for (const s of CYBER_FOREST_TREES) assert.deepEqual(validateSpecies(s), [], s.id);
});

test('growTree is deterministic and stays inside the crown hull', () => {
  const a = growTree(CF_BLUE, 3, { scale: 1 }), b = growTree(CF_BLUE, 3, { scale: 1 });
  assert.equal(a.nodes.length, b.nodes.length);
  assert.deepEqual(a.nodes.slice(0, 50).map((n) => [n.x, n.y, n.z]), b.nodes.slice(0, 50).map((n) => [n.x, n.y, n.z]));
  assert.ok(a.nodes.length > 200, `grew ${a.nodes.length} nodes`);
  assert.ok(a.leaves.length > 80, `${a.leaves.length} leaves`);
  const H = CF_BLUE.height;
  // crown nodes stay within the profile (plus a step of slack) about the crown centre
  let outside = 0, crown = 0;
  for (const n of a.nodes) {
    if (n.root || n.y < CF_BLUE.trunk.crownBase * H) continue;
    crown++;
    const r = profileAt(CF_BLUE.crown.profile, n.y / H) * H + CF_BLUE.crown.step * 2 + 1;
    const d = Math.hypot(n.x - a.crownCenter.x, (n.z - a.crownCenter.z) / CF_BLUE.crown.depthScale);
    if (d > r) outside++;
  }
  assert.ok(outside / Math.max(1, crown) < 0.05, `${outside}/${crown} crown nodes outside the hull`);
  assert.ok(a.height > H * 0.8 && a.height < H * 1.1, `height ${a.height}`);
});

test('pipe-model radii never grow toward the tips, and the trunk base has the species radius', () => {
  const t = growTree(CF_BLUE, 9, { scale: 1 });
  assert.ok(Math.abs(t.nodes[0].radius - CF_BLUE.trunk.radius) < 1e-6);
  for (const n of t.nodes) if (n.parent >= 0 && !n.root) assert.ok(n.radius <= t.nodes[n.parent].radius + 1e-9);
  // orders: the trunk is order 0, limbs come off it
  assert.ok(t.nodes.some((n) => n.order >= 2));
});

test('measureTree reads a synthetic tree: trunk below, round crown above', () => {
  const W = 200, H = 300, data = new Uint8Array(W * H * 4);
  const set = (x: number, y: number) => { data[(x + y * W) * 4 + 3] = 255; };
  for (let y = 180; y < 300; y++) for (let x = 92; x < 108; x++) set(x, y);              // trunk 16 px wide
  for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) if (Math.hypot(x - 100, y - 100) < 90) set(x, y); // crown
  const m = measureTree({ data, width: W, height: H });
  assert.ok(m.crownBase > 0.25 && m.crownBase < 0.45, `crownBase ${m.crownBase}`);
  const widest = Math.max(...m.profile.map((p) => p.r));
  assert.ok(Math.abs(widest - 90 / 300) < 0.03, `widest ${widest}`);
  assert.ok(Math.abs(m.lean) < 0.02);
});
