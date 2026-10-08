// Tests for the face-decal geometry (ray casting onto the mask, tangent frames, cell transforms) and the extras curves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { castRay, cellSample, conformGrid, surfaceFrame, trisNear } from '../components/kaiju/stage3d/kaijuFaceConform';
import { EXTRA_DEFS, EXTRA_CELLS, GLYPH, glyphRect, type SpriteState } from '../components/kaiju/stage3d/kaijuFaceExtras';
import { mergeAnchors, DEFAULT_ANCHORS, SLOTS } from '../components/kaiju/stage3d/kaijuFaceRig';

/** a bulging sphere cap facing +z, as triangles (head-local) */
function sphereCap(r = 0.3, cz = -0.2, n = 40): Float32Array {
  const out: number[] = [];
  const P = (i: number, j: number) => { const u = (i / n - 0.5) * 1.6, v = (j / n - 0.5) * 1.6; const x = Math.sin(u) * r, y = Math.sin(v) * r * Math.cos(u), z = cz + Math.cos(u) * Math.cos(v) * r; return [x, y, z]; };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), d = P(i + 1, j + 1); out.push(...a, ...b, ...c, ...b, ...d, ...c); }
  return new Float32Array(out);
}
const plane = (z: number) => new Float32Array([-1, -1, z, 1, -1, z, -1, 1, z, 1, -1, z, 1, 1, z, -1, 1, z]);

test('castRay hits the nearest triangle, normal faces the ray', () => {
  const tris = new Float32Array([...plane(0.1), ...plane(0.3)]);
  const h = castRay(tris, [0, 0, 2], [0, 0, -1])!;
  assert.ok(Math.abs(h.p[2] - 0.3) < 1e-6 && h.n[2] > 0.99);
  assert.equal(castRay(tris, [5, 5, 2], [0, 0, -1]), null);
  const up = castRay(tris, [0, 0, -2], [0, 0, 1])!; assert.ok(up.n[2] < -0.99);
});

test('surfaceFrame gives a right-handed tangent frame with ex ≈ +x on a flat patch', () => {
  const f = surfaceFrame(plane(0.2), { x: 0.1, y: 0.1, rot: 0 })!;
  assert.ok(Math.abs(f.p[2] - 0.2) < 1e-6);
  assert.ok(f.n[2] > 0.999 && f.ex[0] > 0.999 && f.ey[1] > 0.999);
  const r = surfaceFrame(plane(0.2), { x: 0, y: 0, rot: Math.PI / 2 })!;
  assert.ok(r.ex[1] > 0.999 && r.ey[0] < -0.999, 'rot rolls CCW about the normal');
});

test('conformGrid hugs a curved surface (every vertex sits ~lift above the sphere) and tiles the cell', () => {
  const r = 0.3, cz = -0.2, lift = 0.002, tris = sphereCap(r, cz);
  const g = conformGrid(tris, { x: 0.05, y: 0.02, s: 0.14, rot: 0.3 }, 10, 8, lift)!;
  assert.ok(g && g.misses === 0);
  for (let i = 0; i < g.positions.length; i += 3) {
    const d = Math.hypot(g.positions[i], g.positions[i + 1], g.positions[i + 2] - cz);
    assert.ok(Math.abs(d - (r + lift)) < 0.004, `vertex off the surface by ${d - r - lift}`);
  }
  assert.equal(g.indices.length, 10 * 8 * 6);
  assert.equal(g.uvs[0], 0); assert.equal(g.uvs[g.uvs.length - 1], 1);
  // a flat plane is simply planar
  const gp = conformGrid(plane(0.5), { x: 0, y: 0, s: 0.2, rot: 0 }, 4, 4, 0.001)!;
  for (let i = 2; i < gp.positions.length; i += 3) assert.ok(Math.abs(gp.positions[i] - 0.501) < 1e-5);
});

test('conformGrid falls back to the tangent plane where rays miss and reports null with no surface', () => {
  const g = conformGrid(plane(0.2), { x: 0.9, y: 0, s: 0.4, rot: 0 }, 6, 6)!;     // hangs over the plane's edge
  assert.ok(g.misses > 0);
  assert.equal(conformGrid(new Float32Array(0), { x: 0, y: 0, s: 0.1, rot: 0 }, 2, 2), null);
});

test('trisNear culls far triangles', () => {
  const t = new Float32Array([...plane(0), 5, 5, 0, 6, 5, 0, 5, 6, 0]);
  assert.equal(trisNear(t, 0, 0, 0.1).length, 18);
});

test('cellSample mirrors the shader: identity, squash, shift, tilt and clipping', () => {
  const id = { sx: 1, sy: 1, shiftX: 0, shiftY: 0, tilt: 0, mirror: false };
  assert.deepEqual(cellSample([0.3, 0.7], id), [0.3, 0.7].map(v => v) as [number, number]);
  // squash sy = 0.5: a point 0.2 above centre samples 0.4 above centre
  const sq = cellSample([0.5, 0.7], { ...id, sy: 0.5 })!; assert.ok(Math.abs(sq[1] - 0.9) < 1e-9);
  // beyond the squashed glyph's extent → inside cell? sampling v>1 clips
  assert.equal(cellSample([0.5, 0.95], { ...id, sy: 0.3 }), null);
  const sh = cellSample([0.6, 0.5], { ...id, shiftX: 0.1 })!; assert.ok(Math.abs(sh[0] - 0.5) < 1e-9);
  const mi = cellSample([0.7, 0.5], { ...id, mirror: true })!; assert.ok(Math.abs(mi[0] - 0.3) < 1e-9);
  const tl = cellSample([0.7, 0.5], { ...id, tilt: Math.PI / 2 })!; assert.ok(Math.abs(tl[0] - 0.5) < 1e-6 && Math.abs(tl[1] - 0.3) < 1e-6);
  assert.equal(cellSample([1.2, 0.5], id), null);
});

test('extras: every curve stays finite, alpha/size sane, and fades to nothing at weight 0', () => {
  const o: SpriteState = { x: 0, y: 0, z: 0, size: 0, alpha: 0, rot: 0 };
  for (const [kind, def] of Object.entries(EXTRA_DEFS)) {
    assert.ok(def!.glyph >= 0 && def!.glyph < 12, kind);
    for (let k = 0; k < 40; k++) for (let i = 0; i < def!.count; i++) {
      def!.sprite(k / 40, i, k * 0.1, 1, o);
      for (const v of Object.values(o)) assert.ok(Number.isFinite(v), `${kind} ${JSON.stringify(o)}`);
      assert.ok(o.size >= 0 && o.size < 0.25 && o.alpha >= -1e-9 && o.alpha <= 1.0001, `${kind} size ${o.size} alpha ${o.alpha}`);
      def!.sprite(k / 40, i, k * 0.1, 0, o); assert.ok(o.alpha <= 1e-9 || o.size <= 1e-9, `${kind} still visible at weight 0`);
    }
  }
});

test('glyph rects tile the atlas without overlap', () => {
  const seen = new Set<string>();
  for (const g of Object.values(GLYPH)) { const r = glyphRect(g); const key = r.join(','); assert.ok(!seen.has(key)); seen.add(key); assert.ok(r[0] >= 0 && r[0] + r[2] <= 1.0001 && r[1] >= 0 && r[1] + r[3] <= 1.0001); }
  assert.ok(EXTRA_CELLS > 0);
});

test('mergeAnchors layers a partial anchors file over the defaults', () => {
  const m = mergeAnchors(DEFAULT_ANCHORS.chora, { slots: { mouth: { y: 0.01 } }, brightness: 0.5 });
  assert.equal(m.slots.mouth.y, 0.01); assert.equal(m.slots.mouth.s, DEFAULT_ANCHORS.chora.slots.mouth.s); assert.equal(m.brightness, 0.5);
  assert.equal(mergeAnchors(DEFAULT_ANCHORS.reello, null), DEFAULT_ANCHORS.reello);
  for (const k of SLOTS) assert.ok(m.slots[k]);
});
