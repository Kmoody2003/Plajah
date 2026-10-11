// Geometry engine — path model, path data, shapes, bezier maths, intersections, fitting.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parsePathData, toPathData, rectPath, ellipseAt, circlePath, starPath, polygonPath, spiralPath, smoothThrough, roundedPolygon,
  fromPoints, fromNodes, toNodes, pathArea, pathBounds, pathLength, curvesToSubpath, subpathCurves, lineCurve, arcToCubics,
  curveCurve, lineLine, selfIntersection, fitCurve, rdp, pointsToPath, simplifyPath, type Curve,
} from '../services/tela/geometry';
import { bezier } from '../services/tela/geometry';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b} (±${tol})`);

describe('path data', () => {
  it('parses the full grammar and round-trips', () => {
    const d = 'M10 10 h20 v20 H10 Z m40 0 c5 -10 15 -10 20 0 s15 10 20 0 q10 -10 20 0 t20 0 L100 50 l-5 5 a10 5 30 1 0 20 0 A5 5 0 0 1 150 50 z';
    const p = parsePathData(d);
    assert.equal(p.subpaths.length, 2);
    const again = parsePathData(toPathData(p));
    assert.equal(toPathData(again), toPathData(p));
    near(pathArea(again), pathArea(p), .01); // 3-decimal serialisation
  });
  it('handles packed numbers and arc flags', () => {
    const p = parsePathData('M0,0L1.5.5-1-2a5 5 0 1010 0');
    const A = p.subpaths[0].anchors;
    assert.deepEqual([A[1].x, A[1].y, A[2].x, A[2].y], [1.5, .5, -1, -2]);
    assert.ok(Math.abs(A[A.length - 1].x - 9) < 1e-9 && Math.abs(A[A.length - 1].y + 2) < 1e-9);
  });
  it('commands after Z start at the subpath start; implicit lineto after M', () => {
    const p = parsePathData('M10 10 20 10 20 20Z l5 5');
    assert.equal(p.subpaths.length, 2);
    assert.equal(p.subpaths[1].anchors[0].x, 10); assert.equal(p.subpaths[1].anchors[1].x, 15);
  });
  it('arcs: a full circle from two arcs has area πr²', () => {
    const p = parsePathData('M-10 0 A10 10 0 0 1 10 0 A10 10 0 0 1 -10 0 Z');
    near(Math.abs(pathArea(p)), Math.PI * 100, .1); // 4-cubic circle: +0.028% area
    assert.ok(arcToCubics(0, 0, 0, 0, 0, false, false, 10, 0).length === 1, 'zero radius → line');
  });
  it('tolerates garbage', () => { assert.equal(parsePathData('M10 10 L foo').subpaths.length, 0); assert.equal(parsePathData('').subpaths.length, 0); });
});

describe('shapes and legacy conversion', () => {
  it('rect with per-corner radii, clamped', () => {
    near(pathArea(rectPath(0, 0, 100, 50)), 5000, 1e-9);
    const r = rectPath(0, 0, 100, 50, { tl: 10, br: 20 });
    near(pathArea(r), 5000 - (100 + 400) * (1 - Math.PI / 4), .2);
    near(pathArea(rectPath(0, 0, 10, 10, 50)), Math.PI * 25, .05); // clamped to a circle
  });
  it('ellipse / circle / polygon / star / spiral', () => {
    near(pathArea(ellipseAt(0, 0, 20, 10)), Math.PI * 200, .2);
    near(pathLength(circlePath(0, 0, 10)), 2 * Math.PI * 10, .01);
    near(pathArea(polygonPath(0, 0, 10, 4)), 200, 1e-9);
    assert.equal(starPath(0, 0, 10, 4, 5).subpaths[0].anchors.length, 10);
    const sp = spiralPath(0, 0, 50, .8, 8); assert.equal(sp.subpaths[0].closed, false); assert.equal(sp.subpaths[0].anchors.length, 9);
    const rp = roundedPolygon([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], 10);
    near(pathArea(rp), 10000 - 400 * (1 - Math.PI / 4), .2);
  });
  it('legacy points and nodes', () => {
    const p = fromPoints([0, 0, 10, 0, 10, 10], true); near(pathArea(p), 50, 1e-9);
    const n = fromNodes([{ x: 0, y: 0, outX: 5, outY: -5 }, { x: 10, y: 0, inX: 5, inY: -5 }], false);
    assert.equal(subpathCurves(n.subpaths[0])[0].line, undefined);
    const back = toNodes(n); assert.equal(back.length, 2); assert.equal(back[0].outX, 5);
  });
  it('smoothThrough interpolates its points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 30 }, { x: 100, y: 0 }];
    const p = smoothThrough(pts, false); assert.deepEqual(p.subpaths[0].anchors.map(a => [a.x, a.y]), pts.map(q => [q.x, q.y]));
  });
});

describe('bezier maths', () => {
  const c: Curve = { p0: { x: 0, y: 0 }, p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, p3: { x: 100, y: 0 } };
  it('split preserves points; subCurve; bounds are tight', () => {
    const [a, b] = bezier.split(c, .3); const p = bezier.point(c, .3);
    near(a.p3.x, p.x, 1e-12); near(b.p0.y, p.y, 1e-12);
    near(bezier.point(a, .5).x, bezier.point(c, .15).x, 1e-9);
    const bb = bezier.bounds(c); near(bb.h, 75, 1e-9); near(bb.w, 100, 1e-9);
  });
  it('arc length, inverse arc length, curvature', () => {
    const q = ellipseAt(0, 0, 10, 10); const L = subpathCurves(q.subpaths[0]).reduce((s, k) => s + bezier.length(k), 0);
    near(L, 2 * Math.PI * 10, .01);
    const t = bezier.tAtLength(c, bezier.length(c) / 2); near(bezier.length(c, 0, t), bezier.length(c) / 2, 1e-6);
    near(Math.abs(bezier.curvature(subpathCurves(q.subpaths[0])[0], .5)), .1, .002);
  });
  it('nearest point / projection', () => {
    const n = bezier.nearest(c, { x: 50, y: 200 }); near(n.point.x, 50, 1e-6); near(n.point.y, 75, 1e-6); near(n.dist, 125, 1e-6);
  });
  it('flatten within tolerance', () => {
    const pts = bezier.flatten(c, .1, [c.p0]);
    for (let i = 1; i < pts.length; i++) { const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 }; assert.ok(bezier.nearest(c, m).dist < .15); }
  });
  it('inflections and extrema', () => {
    const s: Curve = { p0: { x: 0, y: 0 }, p1: { x: 50, y: 100 }, p2: { x: 50, y: -100 }, p3: { x: 100, y: 0 } };
    assert.equal(bezier.inflections(s).length, 1); near(bezier.inflections(s)[0], .5, 1e-9);
    assert.equal(bezier.extremaParams(c).length, 1);
  });
  it('cubic solver', () => { const r = bezier.solveCubic(1, -6, 11, -6).sort(); r.forEach((x, i) => near(x, i + 1, 1e-10)); });
});

describe('intersections', () => {
  it('line × line', () => { const r = lineLine({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })!; near(r.t, .5, 1e-12); assert.equal(lineLine({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null); });
  it('curve × curve: two circles meet twice', () => {
    const a = subpathCurves(circlePath(0, 0, 50).subpaths[0]), b = subpathCurves(circlePath(60, 0, 50).subpaths[0]);
    let hits = 0; for (const x of a) for (const y of b) hits += curveCurve(x, y).filter(h => h.ta > 1e-6 && h.ta < 1 - 1e-6).length;
    assert.equal(hits, 2);
  });
  it('curve × line through a cubic hump (3 crossings)', () => {
    const s: Curve = { p0: { x: 0, y: 0 }, p1: { x: 33, y: 100 }, p2: { x: 66, y: -100 }, p3: { x: 100, y: 0 } };
    assert.equal(curveCurve(s, lineCurve({ x: -10, y: 0 }, { x: 110, y: 0 })).filter(h => !h.overlap).length, 3);
  });
  it('overlapping (coincident) curves report their shared range, not a cascade', () => {
    const c: Curve = { p0: { x: 0, y: 0 }, p1: { x: 0, y: 100 }, p2: { x: 100, y: 100 }, p3: { x: 100, y: 0 } };
    const [, tail] = bezier.split(c, .4); const hs = curveCurve(c, tail);
    assert.equal(hs.length, 2); assert.ok(hs.every(h => h.overlap));
  });
  it('self-intersection of a looped cubic', () => {
    const loop: Curve = { p0: { x: 0, y: 0 }, p1: { x: 150, y: 100 }, p2: { x: -50, y: 100 }, p3: { x: 100, y: 0 } };
    const r = selfIntersection(loop)!; assert.ok(r); const a = bezier.point(loop, r[0]), b = bezier.point(loop, r[1]); near(a.x, b.x, 1e-4); near(a.y, b.y, 1e-4);
  });
});

describe('fitting and simplify', () => {
  it('RDP keeps corners and drops collinear points', () => { assert.equal(rdp([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], .1).length, 3); });
  it('Schneider fit stays within tolerance', () => {
    const pts = Array.from({ length: 80 }, (_, i) => ({ x: i * 3, y: Math.sin(i / 8) * 40 }));
    const cs = fitCurve(pts, .5); assert.ok(cs.length < 12, `${cs.length} curves`);
    for (const p of pts) assert.ok(Math.min(...cs.map(c => bezier.nearest(c, p).dist)) < .6);
  });
  it('fit survives noisy input without runaway handles', () => {
    let s = 1; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const pts = Array.from({ length: 300 }, (_, i) => ({ x: i, y: Math.sin(i / 20) * 30 + (rnd() - .5) * 6 }));
    const cs = fitCurve(pts, .05); const b = pathBounds({ fillRule: 'nonzero', subpaths: [curvesToSubpath(cs, false)] });
    assert.ok(b.h < 75, `bounds ${b.h}`); // data spans ~66; runaway handles gave 385
  });
  it('pencil input keeps a real corner; simplify reduces anchors', () => {
    const pts = [...Array.from({ length: 30 }, (_, i) => ({ x: i * 3, y: 0 })), ...Array.from({ length: 30 }, (_, i) => ({ x: 90, y: i * 3 }))];
    const p = pointsToPath(pts, { tol: .5 }); assert.ok(p.subpaths[0].anchors.some(a => Math.abs(a.x - 90) < 2 && Math.abs(a.y) < 2 && a.kind === 'corner'));
    const dense = fromPoints(Array.from({ length: 200 }, (_, i) => [50 * Math.cos(i / 200 * 2 * Math.PI), 50 * Math.sin(i / 200 * 2 * Math.PI)]).flat(), true);
    const sp = simplifyPath(dense, .3); assert.ok(sp.subpaths[0].anchors.length < 20); near(Math.abs(pathArea(sp)), Math.PI * 2500, 60);
  });
});
