// Raster engine — selections (CPU, node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { rectSelection, ellipseSelection, lassoSelection, magicWand, colorRange, combine, invertSelection, featherSelection, expandSelection, contractSelection, borderSelection, smoothSelection, transformSelection, refineEdge, quickSelect, selectionToMask, selectionToPath, traceContours, computeBounds } from '../services/tela/raster/selection';
import { rasterizeSubpaths } from '../services/tela/raster/vectorPath';
import { createBitmap } from '../services/tela/raster/buffer';

const sum = (d: Uint8Array) => d.reduce((a, v) => a + v, 0) / 255;
const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

test('marquees: exact area, anti-aliased fractional edges', () => {
  near(sum(rectSelection(50, 50, { x: 10, y: 10, width: 20, height: 10 }).data), 200, 0.5);
  near(sum(rectSelection(50, 50, { x: 10.5, y: 10, width: 20, height: 10 }).data), 200, 1, 'fractional rect area preserved');
  near(sum(ellipseSelection(100, 100, { x: 10, y: 10, width: 80, height: 60 }).data), Math.PI * 40 * 30, 25, 'ellipse area');
  const s = rectSelection(50, 50, { x: 10.5, y: 10, width: 20, height: 10 }); near(s.data[15 * 50 + 10], 128, 2, 'half-covered edge pixel');
  assert.deepEqual(computeBounds(rectSelection(50, 50, { x: 5, y: 6, width: 7, height: 8 })), { x: 5, y: 6, width: 7, height: 8 });
});

test('lasso / polygonal lasso: triangle area', () => {
  near(sum(lassoSelection(64, 64, [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 40 }]).data), 800, 3);
});

test('combine: add / subtract / intersect / invert', () => {
  const a = rectSelection(20, 20, { x: 0, y: 0, width: 10, height: 20 }), b = rectSelection(20, 20, { x: 5, y: 0, width: 10, height: 20 });
  near(sum(combine(a, b, 'add').data), 300, 0.5); near(sum(combine(a, b, 'subtract').data), 100, 0.5);
  near(sum(combine(a, b, 'intersect').data), 100, 0.5); near(sum(combine(a, b, 'xor').data), 200, 0.5);
  near(sum(invertSelection(a).data), 200, 0.5);
});

test('magic wand: tolerance, contiguous vs global', () => {
  const bm = createBitmap(30, 10, [200, 0, 0, 255]);
  for (let y = 0; y < 10; y++) for (const x of [10, 11]) bm.data.set([0, 0, 255, 255], (y * 30 + x) * 4); // blue wall
  for (let y = 0; y < 10; y++) for (let x = 20; x < 30; x++) bm.data.set([210, 5, 0, 255], (y * 30 + x) * 4);
  near(sum(magicWand(bm, 2, 2, { tolerance: 32, contiguous: true, antiAlias: false }).data), 100, 0.1);
  near(sum(magicWand(bm, 2, 2, { tolerance: 32, contiguous: false, antiAlias: false }).data), 280, 0.1);
  near(sum(magicWand(bm, 2, 2, { tolerance: 5, contiguous: false, antiAlias: false }).data), 180, 0.1);
});

test('color range picks similar colours softly', () => {
  const bm = createBitmap(3, 1); bm.data.set([255, 0, 0, 255, 240, 20, 20, 255, 0, 0, 255, 255]);
  const s = colorRange(bm, [[255, 0, 0]], 60); assert.equal(s.data[0], 255); assert.ok(s.data[1] > 100 && s.data[1] < 255); assert.equal(s.data[2], 0);
});

test('feather keeps area, expand/contract/border/smooth move the edge', () => {
  const s = rectSelection(80, 80, { x: 20, y: 20, width: 40, height: 40 });
  near(sum(featherSelection(s, 6).data), 1600, 40, 'feather ~ preserves area');
  near(sum(expandSelection(s, 5).data), 50 * 50, 120, 'expand 5'); near(sum(contractSelection(s, 5).data), 30 * 30, 60, 'contract 5');
  const b = borderSelection(s, 4); assert.ok(b.data[40 * 80 + 20] > 200 && b.data[40 * 80 + 40] === 0, 'border ring');
  near(sum(smoothSelection(s, 3).data), 1600, 80, 'smooth');
});

test('transform selection (scale ×2 about origin)', () => {
  const s = rectSelection(60, 60, { x: 5, y: 5, width: 10, height: 10 });
  near(sum(transformSelection(s, [2, 0, 0, 2, 0, 0]).data), 400, 10);
});

test('refine edge pulls a soft/misplaced edge onto the image edge (guided filter)', () => {
  const bm = createBitmap(40, 20, [0, 0, 0, 255]); for (let y = 0; y < 20; y++) for (let x = 20; x < 40; x++) bm.data.set([255, 255, 255, 255], (y * 40 + x) * 4);
  const rough = featherSelection(rectSelection(40, 20, { x: 20, y: -10, width: 40, height: 40 }), 8); // blurry edge
  const r = refineEdge(rough, bm, { radius: 4, epsilon: 0.0005 });
  assert.ok(r.data[10 * 40 + 17] < rough.data[10 * 40 + 17] - 8, `outside of the image edge drops (${rough.data[10 * 40 + 17]} → ${r.data[10 * 40 + 17]})`);
  assert.ok(r.data[10 * 40 + 22] > rough.data[10 * 40 + 22] + 8, `inside rises (${rough.data[10 * 40 + 22]} → ${r.data[10 * 40 + 22]})`);
});

test('quick select grows within an object and stops at its edge', () => {
  const bm = createBitmap(60, 40, [30, 120, 40, 255]); for (let y = 10; y < 30; y++) for (let x = 15; x < 45; x++) bm.data.set([220, 200, 40, 255], (y * 60 + x) * 4);
  const s = quickSelect(bm, [{ x: 30, y: 20 }], { brushSize: 6 });
  assert.ok(s.data[12 * 60 + 17] > 200, 'reached object corner'); assert.ok(s.data[5 * 60 + 5] < 20, 'did not leak');
});

test('selection → mask bounds, → path (round trip ≈ same area), marching ants', () => {
  const s = ellipseSelection(64, 64, { x: 8, y: 8, width: 48, height: 40 });
  const m = selectionToMask(s)!; assert.equal(m.bounds.x, 8); assert.equal(m.mask.width, m.bounds.width);
  const paths = selectionToPath(s, 0.5); assert.equal(paths.length, 1);
  near(sum(Uint8Array.from(rasterizeSubpaths(paths, 64, 64), v => Math.round(v * 255))), sum(s.data), sum(s.data) * 0.02, 'path area');
  const loops = traceContours(rectSelection(20, 20, { x: 5, y: 5, width: 10, height: 10 })); assert.equal(loops.length, 1); assert.ok(loops[0].length >= 4);
  const two = combine(rectSelection(30, 10, { x: 1, y: 1, width: 5, height: 5 }), rectSelection(30, 10, { x: 20, y: 1, width: 5, height: 5 }), 'add');
  assert.equal(traceContours(two).length, 2);
});
