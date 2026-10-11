// Geometry engine — affine transforms, align & distribute, path editing, distortions,
// envelope / warp, blend, hit testing and snapping.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  affine, transformPath, transformEach, align, distribute, parseTransform, reversePath, joinSubpaths, closeSubpath, averageAnchors, setHandle,
  addAnchor, addAnchorPoints, removeAnchor, convertAnchor, smoothPath, roughen, zigzag, puckerBloat, twist, envelope, makeMesh, warp, blend,
  rectPath, circlePath, polyPath, parsePathData, pathArea, pathBounds, pathLength, subpathCurves, starPath,
  hitFill, hitStroke, hitAnchor, inMarquee, snapPoint, smartGuides, targetsFrom, constrainAngle, distanceToPath,
} from '../services/tela/geometry';
import { bezier } from '../services/tela/geometry';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);

describe('affine', () => {
  it('compose, invert, apply, parse', () => {
    const m = affine.compose(affine.translate(10, 0), affine.rotate(90), affine.scale(2));
    const p = affine.apply(m, { x: 1, y: 0 }); near(p.x, 0, 1e-12); near(p.y, 22, 1e-12);
    const q = affine.apply(affine.invert(m), p); near(q.x, 1, 1e-12); near(q.y, 0, 1e-12);
    const t = parseTransform('translate(10 20) rotate(90) scale(2,3) skewX(0)'); const r = affine.apply(t, { x: 1, y: 1 }); near(r.x, 7, 1e-9); near(r.y, 22, 1e-9);
  });
  it('reflect and shear', () => {
    const f = affine.apply(affine.reflect(90, { x: 50, y: 0 }), { x: 40, y: 5 }); near(f.x, 60, 1e-12); near(f.y, 5, 1e-12);
    const sh = affine.apply(affine.shear(45), { x: 0, y: 10 }); near(sh.x, 10, 1e-12);
  });
  it('transforms are exact on beziers (area scales by det)', () => { const c = circlePath(0, 0, 10); near(pathArea(transformPath(c, affine.scale(2, 3))), pathArea(c) * 6, 1e-9); });
  it('transform each: about each object centre', () => {
    const [a, b] = transformEach([rectPath(0, 0, 10, 10), rectPath(100, 0, 10, 10)], { sx: 2 });
    const ba = pathBounds(a), bb = pathBounds(b); near(ba.x, -5, 1e-12); near(bb.x, 95, 1e-12); near(bb.w, 20, 1e-12);
  });
});

describe('align & distribute', () => {
  const items = [{ id: 'a', bounds: { x: 0, y: 0, w: 10, h: 10 } }, { id: 'b', bounds: { x: 30, y: 5, w: 20, h: 10 } }, { id: 'c', bounds: { x: 90, y: 20, w: 10, h: 30 } }];
  it('align left / centre / to key / to artboard', () => {
    assert.deepEqual(align(items, 'left', null)['b'], { x: -30, y: 0 });
    near(align(items, null, 'middle')['a'].y, 20, 1e-12);
    assert.deepEqual(align(items, 'right', null, { to: 'key', keyId: 'b' })['b'], { x: 0, y: 0 });
    near(align(items, 'center', null, { to: 'artboard', artboard: { x: 0, y: 0, w: 200, h: 100 } })['a'].x, 95, 1e-12);
  });
  it('distribute centres and equal spacing; explicit spacing from a key', () => {
    near(distribute(items, 'center')['b'].x, 50 - 40, 1e-12);
    const sp = distribute(items, 'spaceH'); near(sp['b'].x, 40 - 30, 1e-12); // gaps: (100-0-40)/2 = 30 → b at 40
    const k = distribute(items, 'spaceH', { keyId: 'a', spacing: 5 }); near(k['b'].x, 15 - 30, 1e-12); near(k['c'].x, 40 - 90, 1e-12);
  });
});

describe('path editing', () => {
  it('reverse keeps the shape, flips orientation', () => { const r = rectPath(0, 0, 10, 10); near(pathArea(reversePath(r)), -pathArea(r), 1e-12); });
  it('join two open paths (coincident ends merge) and close', () => {
    const j = joinSubpaths(polyPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], false).subpaths[0], polyPath([{ x: 10, y: 0 }, { x: 10, y: 10 }], false).subpaths[0]);
    assert.equal(j.anchors.length, 3); assert.equal(closeSubpath(j).closed, true);
  });
  it('average anchors', () => { const p = averageAnchors(polyPath([{ x: 0, y: 0 }, { x: 10, y: 4 }], false), [[0, 0], [0, 1]], 'v'); assert.equal(p.subpaths[0].anchors[0].x, 5); assert.equal(p.subpaths[0].anchors[0].y, 0); });
  it('add anchor keeps the shape exactly; add anchor points doubles segments', () => {
    const c = circlePath(0, 0, 20); const a = addAnchor(c, 0, 1, .3); assert.equal(a.subpaths[0].anchors.length, 5); near(pathArea(a), pathArea(c), 1e-9);
    assert.equal(addAnchorPoints(c).subpaths[0].anchors.length, 8);
  });
  it('remove anchor refits so the outline barely moves', () => {
    const c = addAnchor(circlePath(0, 0, 20), 0, 1, .5); const r = removeAnchor(c, 0, 2); assert.equal(r.subpaths[0].anchors.length, 4); near(pathArea(r), pathArea(circlePath(0, 0, 20)), 2);
  });
  it('convert anchor and kind-aware handles', () => {
    const p = convertAnchor(rectPath(0, 0, 10, 10), 0, 1, 'smooth'); const a = p.subpaths[0].anchors[1]; assert.ok(a.hin && a.hout); assert.equal(a.kind, 'smooth');
    const s = setHandle(a, 'out', { x: a.x + 5, y: a.y }, 'symmetric'); near(s.hin!.x, a.x - 5, 1e-12);
    assert.equal(smoothPath(rectPath(0, 0, 10, 10)).subpaths[0].anchors.every(x => x.hin && x.hout), true);
  });
});

describe('distort & transform', () => {
  const st = starPath(0, 0, 50, 25, 5);
  it('roughen / zig-zag are deterministic and change the outline', () => {
    assert.equal(JSON.stringify(roughen(st, { size: 3, seed: 2 })), JSON.stringify(roughen(st, { size: 3, seed: 2 })));
    assert.ok(pathLength(zigzag(rectPath(0, 0, 100, 100), 5, 4)) > 400 * 1.2);
  });
  it('pucker: anchors out, sides sucked in; bloat: anchors in, sides bulge', () => {
    const r = rectPath(-50, -50, 100, 100); const pk = puckerBloat(r, -.3), bl = puckerBloat(r, .3);
    near(pathBounds(pk).w, 130, 1e-9); assert.ok(pathBounds(bl).w < 120 && pathBounds(bl).w > 100); assert.ok(Math.abs(pathArea(bl)) > 8000);
  });
  it('twist keeps far anchors (falls to 0 at the farthest point)', () => { const t = twist(rectPath(-50, -50, 100, 100), 90); assert.ok(Math.abs(pathArea(t)) > 5000); });
  it('envelope with an unmoved mesh is the identity', () => {
    const c = circlePath(50, 50, 30); const e = envelope(c, makeMesh({ x: 0, y: 0, w: 100, h: 100 }, 3, 3));
    for (const s of e.subpaths) for (const a of s.anchors) near(Math.hypot(a.x - 50, a.y - 50), 30, .05);
  });
  it('envelope moves art with the mesh; curves stay curves', () => {
    const m = makeMesh({ x: 0, y: 0, w: 100, h: 100 }, 1, 1); m.points[1] = { x: 140, y: 0 };
    const e = envelope(rectPath(0, 0, 100, 100), m); near(pathBounds(e).w, 140, .5);
  });
  it('warp arc bends a flat bar', () => { const w = warp(rectPath(0, 0, 200, 20), 'arc', .5); assert.ok(pathBounds(w).h > 30); });
  it('blend interpolates shape and count', () => {
    const bs = blend(rectPath(0, 0, 10, 10), circlePath(100, 5, 5), 3); assert.equal(bs.length, 3);
    const mid = pathBounds(bs[1]); near(mid.x + mid.w / 2, 52.5, 1);
  });
});

describe('hit testing & snapping', () => {
  const ring = { fillRule: 'evenodd' as const, subpaths: [...rectPath(0, 0, 100, 100).subpaths, ...rectPath(25, 25, 50, 50).subpaths] };
  it('fill hit respects fill rule', () => { assert.equal(hitFill(ring, { x: 50, y: 50 }), false); assert.equal(hitFill(ring, { x: 50, y: 50 }, 'nonzero'), true); assert.equal(hitFill(ring, { x: 10, y: 10 }), true); });
  it('stroke hit and distance', () => { assert.ok(hitStroke(circlePath(0, 0, 50), { x: 52, y: 0 }, 2, 1.5)); near(distanceToPath(circlePath(0, 0, 50), { x: 0, y: 0 }).dist, 50, .05); });
  it('anchor / handle hits prefer handles', () => { const c = circlePath(0, 0, 50); const h = hitAnchor(c, { x: 50, y: 27 }, 3); assert.equal(h?.part, 'out'); });
  it('marquee touch vs contain', () => { assert.ok(inMarquee(circlePath(0, 0, 50), { x: 40, y: -5, w: 30, h: 10 })); assert.ok(!inMarquee(circlePath(0, 0, 50), { x: 40, y: -5, w: 30, h: 10 }, 'contain')); assert.ok(inMarquee(circlePath(0, 0, 50), { x: -5, y: -5, w: 10, h: 10 })); });
  it('snap to point, guides, grid, 45°', () => {
    const t = targetsFrom([rectPath(100, 100, 50, 50)]);
    assert.deepEqual(snapPoint({ x: 102, y: 98 }, { targets: t }).p, { x: 100, y: 100 });
    near(snapPoint({ x: 124, y: 300 }, { targets: t }).p.x, 125, 1e-12);
    assert.deepEqual(snapPoint({ x: 13, y: 26 }, { grid: 10 }).p, { x: 10, y: 30 });
    const c = constrainAngle({ x: 0, y: 0 }, { x: 10, y: 9 }); near(c.x, c.y, 1e-9);
    const g = smartGuides({ x: 3, y: 50, w: 20, h: 20 }, [{ x: 0, y: 0, w: 20, h: 20 }]); near(g.dx, -3, 1e-12); assert.equal(g.guides[0].axis, 'x');
  });
  it('tight bounds ignore off-curve handles', () => { const p = parsePathData('M0 0 C0 100 100 100 100 0'); near(pathBounds(p).h, 75, 1e-9); void subpathCurves; void bezier; });
});
