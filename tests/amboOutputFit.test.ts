// outputFit — letterbox / fill / align placement maths.
// Run: npx tsx --test tests/amboOutputFit.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlacement, normalizeFit, DEFAULT_FIT } from '../services/ambo/outputFit';

const F = { w: 1920, h: 1080 };
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.6, `${a} ≉ ${b}`);

test('matching aspect fills edge to edge, no bars', () => {
  const p = computePlacement({ w: 1280, h: 720 }, F);
  assert.deepEqual([p.x, p.y, p.w, p.h, p.letterboxed], [0, 0, 1920, 1080, false]);
});
test('4:3 video on 16:9 is pillarboxed, centred, nothing cropped', () => {
  const p = computePlacement({ w: 1440, h: 1080 }, F);
  near(p.w, 1440); near(p.h, 1080); near(p.x, 240); near(p.y, 0);
  assert.equal(p.letterboxed, true); assert.equal(p.bars, 'side');
});
test('portrait photo is pillarboxed', () => {
  const p = computePlacement({ w: 1080, h: 1920 }, F);
  near(p.h, 1080); near(p.w, 607.5); assert.equal(p.bars, 'side');
});
test('21:9 on 16:9 is letterboxed top/bottom', () => {
  const p = computePlacement({ w: 2520, h: 1080 }, F);
  near(p.w, 1920); near(p.h, 822.857); near(p.y, (1080 - 822.857) / 2); assert.equal(p.bars, 'top');
});
test('full fill covers the frame (crops) with no bars', () => {
  const p = computePlacement({ w: 1440, h: 1080 }, F, { mode: 'fill' });
  assert.equal(p.letterboxed, false); assert.ok(p.w >= 1920 && p.h >= 1080);
});
test('stretch ignores aspect', () => {
  const p = computePlacement({ w: 1000, h: 1000 }, F, { mode: 'stretch' });
  assert.deepEqual([p.w, p.h], [1920, 1080]);
});
test('alignment anchors the fitted media (left / bottom-right)', () => {
  const l = computePlacement({ w: 1440, h: 1080 }, F, { ax: 0 });
  near(l.x, 0);
  const br = computePlacement({ w: 1000, h: 1000 }, F, { ax: 1, ay: 1 });
  near(br.x + br.w, 1920); near(br.y + br.h, 1080);
});
test('zoom and shift reposition even matching content', () => {
  const p = computePlacement({ w: 1920, h: 1080 }, F, { zoom: 0.5, ox: 0.1 });
  near(p.w, 960); near(p.x, 480 + 192); assert.equal(p.letterboxed, true);
});
test('normalizeFit clamps garbage and keeps defaults', () => {
  const f = normalizeFit({ zoom: 99, ax: -3, fill: 'nonsense' as any, color: 'javascript:alert(1)' });
  assert.equal(f.zoom, 4); assert.equal(f.ax, 0); assert.equal(f.fill, DEFAULT_FIT.fill); assert.equal(f.color, DEFAULT_FIT.color);
});
