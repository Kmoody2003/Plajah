import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leafOutline, outlineBounds, polygonArea, type LeafShape,
} from '../components/museion/flora/leafShapes.ts';

const SHAPES: LeafShape[] = ['broad', 'ovate', 'lanceolate', 'palmate', 'needle', 'scale', 'frond', 'maple', 'fan', 'heart'];

test('every shape produces closed, finite, non-degenerate blades', () => {
  for (const s of SHAPES) {
    const o = leafOutline(s);
    assert.ok(o.polygons.length > 0, `${s} produced no polygons`);
    for (const p of o.polygons) {
      assert.ok(p.length >= 3, `${s} has a polygon with ${p.length} points`);
      for (const [x, y] of p) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `${s} has a non-finite point`);
      }
      assert.ok(Math.abs(polygonArea(p)) > 1e-5, `${s} has a zero-area blade`);
    }
  }
});

test('leaves live in leaf space: base at the petiole, tip near y=1', () => {
  for (const s of SHAPES) {
    const b = outlineBounds(leafOutline(s));
    assert.ok(b.minY >= -0.02, `${s} extends below the petiole (${b.minY})`);
    assert.ok(b.maxY <= 1.02, `${s} overshoots the tip (${b.maxY})`);
    assert.ok(b.maxY > 0.5, `${s} is suspiciously short (${b.maxY})`);
    assert.ok(b.maxX <= 0.75 && b.minX >= -0.75, `${s} is wider than leaf space`);
  }
});

test('a willow leaf is narrower than an oak leaf (lanceolate vs lobed)', () => {
  const willow = outlineBounds(leafOutline('lanceolate'));
  const oak = outlineBounds(leafOutline('broad'));
  const wW = willow.maxX - willow.minX;
  const wO = oak.maxX - oak.minX;
  assert.ok(wW < wO * 0.6, `willow ${wW.toFixed(3)} should be far narrower than oak ${wO.toFixed(3)}`);
});

test('the oak margin actually swings — lobes, not a smooth ellipse', () => {
  const poly = leafOutline('broad').polygons[0];
  // sample the right-hand margin and count direction changes in width
  const right = poly.slice(0, Math.floor(poly.length / 2));
  let flips = 0;
  for (let i = 2; i < right.length; i++) {
    const d0 = right[i - 1][0] - right[i - 2][0];
    const d1 = right[i][0] - right[i - 1][0];
    if (d0 !== 0 && d1 !== 0 && Math.sign(d0) !== Math.sign(d1)) flips++;
  }
  assert.ok(flips >= 4, `expected several lobes, saw ${flips} margin reversals`);
});

test('palmate is many blades, lanceolate is one', () => {
  assert.ok(leafOutline('palmate').polygons.length >= 5, 'a palmate hand needs its leaflets');
  assert.equal(leafOutline('lanceolate').polygons.length, 1);
});

test('a needle fascicle is several very thin blades', () => {
  const o = leafOutline('needle');
  assert.ok(o.polygons.length >= 3, 'a fascicle holds multiple needles');
  for (const p of o.polygons) {
    let minX = Infinity, maxX = -Infinity;
    for (const [x] of p) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    assert.ok(maxX - minX < 0.35, 'needles must be thin');
  }
});

test('broad and ovate carry veins; needles do not', () => {
  assert.ok(leafOutline('broad').veins.length > 0);
  assert.ok(leafOutline('ovate').veins.length > 1, 'birch gets pinnate side veins');
  assert.equal(leafOutline('needle').veins.length, 0);
});

test('outlineBounds survives an empty outline', () => {
  const b = outlineBounds({ polygons: [], veins: [] });
  assert.deepEqual([b.minX, b.maxX, b.minY, b.maxY], [0, 0, 0, 0]);
});

test('shapes are deterministic', () => {
  for (const s of SHAPES) {
    assert.equal(JSON.stringify(leafOutline(s)), JSON.stringify(leafOutline(s)), `${s} is not stable`);
  }
});
