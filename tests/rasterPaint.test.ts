// Raster engine — brush engine, undo patches, bucket, gradient tool (CPU, node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrushStroke, paintStroke, PaintHistory, bucketFill, applyGradientTool, roundTipCoverage, undoPatch, redoPatch, TILE } from '../services/tela/raster/painting';
import { createBitmap, createMask } from '../services/tela/raster/buffer';
import { renderGradientBitmap, gradientT, sampleGradient } from '../services/tela/raster/gradient';

const near = (a: number, b: number, eps: number, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

test('round tip: hard edge AA, soft falloff', () => {
  near(roundTipCoverage(0, 10, 1), 1, 1e-9); near(roundTipCoverage(10, 10, 1), 0.5, 1e-9); near(roundTipCoverage(11, 10, 1), 0, 1e-9);
  near(roundTipCoverage(7.5, 10, 0.5), 0.5, 1e-9); // cosine falloff midpoint
});

test('opacity caps a stroke; flow builds up; spacing places dabs', () => {
  const bm = createBitmap(200, 40, [255, 255, 255, 255]);
  const s = new BrushStroke({ kind: 'rgba', bitmap: bm }, { size: 20, hardness: 1, spacing: 0.1, flow: 1, opacity: 0.5 }, 'paint', [0, 0, 0, 255]);
  for (let x = 20; x <= 180; x += 3) s.addPoint({ x, y: 20 });
  s.end();
  near(bm.data[(20 * 200 + 100) * 4], 128, 1, 'opacity 50% caps overlapping dabs');
  assert.ok(s.dabs >= 70 && s.dabs <= 90, `~81 dabs at 10% spacing, got ${s.dabs}`);
  const b2 = createBitmap(100, 40, [255, 255, 255, 255]);
  const f = new BrushStroke({ kind: 'rgba', bitmap: b2 }, { size: 20, hardness: 1, spacing: 0.1, flow: 0.2, opacity: 1 }, 'paint', [0, 0, 0, 255]);
  f.addPoint({ x: 50, y: 20 }); const one = b2.data[(20 * 100 + 50) * 4]; for (let i = 0; i < 10; i++) f.dab({ x: 50, y: 20, size: 20, opacity: 1, flow: 0.2, angle: 0, roundness: 1, pressure: 1 }); f.end();
  near(one, 204, 1, 'single 20% flow dab'); assert.ok(b2.data[(20 * 100 + 50) * 4] < 40, 'flow builds up toward opacity');
});

test('pressure dynamics scale size; smoothing lags the cursor', () => {
  const bm = createBitmap(100, 100, [255, 255, 255, 255]);
  const s = new BrushStroke({ kind: 'rgba', bitmap: bm }, { size: 20, hardness: 1, spacing: 0.25, flow: 1, opacity: 1, dynamics: { sizePressure: 1 } }, 'paint', [0, 0, 0, 255]);
  s.addPoint({ x: 50, y: 50, pressure: 0.25 }); s.end();
  assert.equal(bm.data[(50 * 100 + 50) * 4], 0); assert.equal(bm.data[(50 * 100 + 57) * 4], 255, 'quarter-pressure dab is ~5px across');
  const b2 = createBitmap(100, 10, [255, 255, 255, 255]);
  const sm = new BrushStroke({ kind: 'rgba', bitmap: b2 }, { size: 4, hardness: 1, spacing: 0.25, flow: 1, opacity: 1, smoothing: 0.8 }, 'paint', [0, 0, 0, 255]);
  sm.addPoint({ x: 5, y: 5 }); sm.addPoint({ x: 95, y: 5 }); sm.end();
  assert.equal(b2.data[(5 * 100 + 80) * 4], 255, 'lazy mouse did not reach the cursor yet');
});

test('tile-diff undo patches: small memory, exact undo/redo', () => {
  const bm = createBitmap(1024, 1024, [10, 20, 30, 255]), before = new Uint8ClampedArray(bm.data);
  const patch = paintStroke({ kind: 'rgba', bitmap: bm }, [{ x: 100, y: 100 }, { x: 140, y: 110 }], { size: 16, hardness: 0.8, spacing: 0.25, flow: 1, opacity: 1 }, [255, 0, 0, 255]);
  assert.ok(patch.tiles.length <= 4, `only touched tiles (${patch.tiles.length})`);
  assert.ok(patch.bytes <= 4 * TILE * TILE * 4 * 2, 'patch bytes bounded by touched tiles');
  const after = new Uint8ClampedArray(bm.data);
  undoPatch(patch); assert.deepEqual(bm.data, before); redoPatch(patch); assert.deepEqual(bm.data, after);
  const h = new PaintHistory(); h.push(patch); assert.ok(h.undo()); assert.deepEqual(bm.data, before); assert.ok(h.redo()); assert.deepEqual(bm.data, after);
});

test('eraser removes alpha; mask painting writes gray', () => {
  const bm = createBitmap(40, 40, [0, 0, 255, 255]);
  paintStroke({ kind: 'rgba', bitmap: bm }, [{ x: 20, y: 20 }], { size: 10, hardness: 1, spacing: 0.25, flow: 1, opacity: 1 }, [0, 0, 0, 255], 'erase');
  assert.equal(bm.data[(20 * 40 + 20) * 4 + 3], 0); assert.equal(bm.data[(20 * 40 + 20) * 4 + 2], 255);
  const m = createMask(40, 40, 255);
  paintStroke({ kind: 'mask', mask: m }, [{ x: 20, y: 20 }], { size: 10, hardness: 1, spacing: 0.25, flow: 1, opacity: 1 }, [0, 0, 0, 255]);
  assert.equal(m.data[20 * 40 + 20], 0); assert.equal(m.data[0], 255);
});

test('bucket fill respects tolerance + contiguity; undoable', () => {
  const bm = createBitmap(20, 20, [255, 255, 255, 255]); for (let y = 0; y < 20; y++) bm.data.set([0, 0, 0, 255], (y * 20 + 10) * 4);
  const p = bucketFill(bm, 2, 2, [255, 0, 0, 255], { tolerance: 10, contiguous: true, antiAlias: false })!;
  assert.deepEqual([...bm.data.slice((5 * 20 + 3) * 4, (5 * 20 + 3) * 4 + 4)], [255, 0, 0, 255]); assert.equal(bm.data[(5 * 20 + 15) * 4 + 1], 255);
  undoPatch(p); assert.equal(bm.data[(5 * 20 + 3) * 4 + 1], 255);
});

test('gradient tool: shapes, multi-stop opacity, dithering', () => {
  near(gradientT('linear', 5, 0, 0, 0, 10, 0), 0.5, 1e-9); near(gradientT('radial', 3, 4, 0, 0, 10, 0), 0.5, 1e-9);
  near(gradientT('reflected', -5, 0, 0, 0, 10, 0), 0.5, 1e-9); near(gradientT('diamond', 3, 2, 0, 0, 10, 0), 0.5, 1e-9);
  near(gradientT('angle', 0, -1, 0, 0, 1, 0), 0.25, 1e-9);
  const spec = { stops: [{ offset: 0, color: [255, 0, 0] as [number, number, number], opacity: 1 }, { offset: 0.5, color: [0, 255, 0] as [number, number, number], opacity: 0.5 }, { offset: 1, color: [0, 0, 255] as [number, number, number], opacity: 1 }] };
  const c = sampleGradient(spec, 0.25); near(c[0], 0.5, 1e-9); near(c[1], 0.5, 1e-9); near(c[3], 0.75, 1e-9);
  const plain = renderGradientBitmap(256, 1, { stops: [{ offset: 0, color: [100, 100, 100] }, { offset: 1, color: [110, 110, 110] }] }, { shape: 'linear', x0: 0, y0: 0, x1: 256, y1: 0 });
  const dith = renderGradientBitmap(256, 1, { stops: [{ offset: 0, color: [100, 100, 100] }, { offset: 1, color: [110, 110, 110] }] }, { shape: 'linear', x0: 0, y0: 0, x1: 256, y1: 0, dither: true });
  let runsP = 0, runsD = 0; for (let x = 1; x < 256; x++) { if (plain.data[x * 4] !== plain.data[x * 4 - 4]) runsP++; if (dith.data[x * 4] !== dith.data[x * 4 - 4]) runsD++; }
  assert.ok(runsD > runsP * 4, `dither breaks up bands (${runsP} → ${runsD})`);
  const bm = createBitmap(10, 1, [0, 0, 0, 0]); applyGradientTool(bm, spec, { shape: 'linear', x0: 0, y0: 0, x1: 10, y1: 0, dither: false });
  assert.ok(bm.data[3] > 240 && bm.data[9 * 4 + 2] > 200);
});
