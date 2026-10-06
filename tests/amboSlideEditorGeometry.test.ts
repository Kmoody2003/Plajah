import test from 'node:test';
import assert from 'node:assert/strict';
import { snapMove, resizeBox, alignBoxes, distributeBoxes, fixRotatedOrigin, toLocalDelta, unionBox } from '../services/ambo/slideEditorGeometry';

test('snapMove snaps to artboard centre and reports a guide', () => {
  const r = snapMove({ x: 910, y: 100, w: 100, h: 50 }, [], 1920, 1080, 8);
  assert.equal(r.dx, 0);                       // centre 960 is already exact
  const r2 = snapMove({ x: 905, y: 100, w: 100, h: 50 }, [], 1920, 1080, 8);
  assert.equal(r2.dx, 5);
  assert.deepEqual(r2.guides.find(g => g.axis === 'x'), { axis: 'x', at: 960 });
  assert.equal(snapMove({ x: 300, y: 300, w: 10, h: 10 }, [], 1920, 1080, 8).dx, 0);
});

test('snapMove snaps to another object edge', () => {
  const r = snapMove({ x: 497, y: 300, w: 50, h: 50 }, [{ x: 500, y: 0, w: 100, h: 100 }], 1920, 1080, 8);
  assert.equal(r.dx, 3);
});

test('resizeBox handles, aspect lock and centre', () => {
  assert.deepEqual(resizeBox({ x: 0, y: 0, w: 100, h: 50 }, 'se', 20, 10), { x: 0, y: 0, w: 120, h: 60 });
  assert.deepEqual(resizeBox({ x: 100, y: 100, w: 100, h: 50 }, 'nw', 20, 10), { x: 120, y: 110, w: 80, h: 40 });
  const a = resizeBox({ x: 0, y: 0, w: 160, h: 90 }, 'se', 160, 5, { keepAspect: true });
  assert.ok(Math.abs(a.w / a.h - 16 / 9) < 1e-9);
  const c = resizeBox({ x: 100, y: 100, w: 100, h: 100 }, 'e', 20, 0, { fromCenter: true });
  assert.deepEqual(c, { x: 80, y: 100, w: 140, h: 100 });
  assert.equal(resizeBox({ x: 0, y: 0, w: 50, h: 50 }, 'se', -500, -500).w, 8);   // never collapses
});

test('rotated resize keeps the opposite corner fixed', () => {
  const start = { x: 100, y: 100, w: 200, h: 100 };
  const rot = 90;
  const d = toLocalDelta(0, 30, rot);       // dragging 30px down on screen = 30px along local +x of a 90° box
  assert.ok(Math.abs(d.dx - 30) < 1e-9 && Math.abs(d.dy) < 1e-9);
  const next = resizeBox(start, 'e', d.dx, d.dy);
  const fixed = fixRotatedOrigin(start, next, rot, 'e');
  // west-edge midpoint in world space must not move
  const world = (b: { x: number; y: number; w: number; h: number }) => {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.x - cx, ry = 0;
    const a = rot * Math.PI / 180; return { x: cx + rx * Math.cos(a) - ry * Math.sin(a), y: cy + rx * Math.sin(a) + ry * Math.cos(a) };
  };
  const p0 = world(start), p1 = world(fixed);
  assert.ok(Math.abs(p0.x - p1.x) < 1e-6 && Math.abs(p0.y - p1.y) < 1e-6);
});

test('align and distribute', () => {
  const b = [{ x: 10, y: 0, w: 100, h: 10 }, { x: 300, y: 50, w: 100, h: 10 }, { x: 150, y: 20, w: 50, h: 10 }];
  assert.deepEqual(alignBoxes(b, 'left', 1920, 1080).map(p => p.x), [10, 10, 10]);
  assert.deepEqual(alignBoxes(b, 'right', 1920, 1080).map(p => p.x), [300, 300, 350]);
  assert.deepEqual(alignBoxes([{ x: 5, y: 5, w: 100, h: 100 }], 'hcenter', 1920, 1080), [{ x: 910, y: 5 }]);
  const d = distributeBoxes(b, 'x');
  assert.deepEqual(d.map(p => p.x), [10, 300, 180]);   // outer fixed; middle gets equal gaps (gap 70)
  assert.deepEqual(unionBox(b), { x: 10, y: 0, w: 390, h: 60 });
});
