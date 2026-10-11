// Geometry engine — offset path, outline stroke (caps/joins/dashes/alignment), variable width, brushes.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  offsetPath, outlineStroke, variableStroke, dashPath, PROFILES, artBrush, patternBrush, scatterBrush,
  rectPath, circlePath, polyPath, parsePathData, smoothThrough, pathArea, pathBounds, pathLength, resolve, subpathCurves, starPath,
} from '../services/tela/geometry';

const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);
const ar = (p: Parameters<typeof pathArea>[0]) => pathArea(p);
const signedMatchesFill = (p: Parameters<typeof pathArea>[0]) => near(Math.abs(ar(p)), ar(resolve(p)), 1e-6 * Math.max(1, ar(resolve(p))), 'clean');

describe('offset path', () => {
  it('circle grows / insets (Tiller–Hanson accuracy)', () => {
    const c = circlePath(0, 0, 10); const base = ar(c) / (Math.PI * 100);
    near(ar(offsetPath(c, 3, 'round')), Math.PI * 169 * base, .5); near(ar(offsetPath(c, -4, 'round')), Math.PI * 36 * base, .3);
  });
  it('rect joins: miter / bevel / round, and inset to nothing', () => {
    const r = rectPath(0, 0, 20, 10);
    near(ar(offsetPath(r, 2, 'miter')), 24 * 14, 1e-6); assert.equal(offsetPath(r, 2, 'miter').subpaths[0].anchors.length, 4);
    near(ar(offsetPath(r, 2, 'bevel')), 24 * 14 - 4 * 2, 1e-6);
    near(ar(offsetPath(r, 2, 'round')), 200 + 2 * 2 * 30 + Math.PI * 4, .02);
    near(ar(offsetPath(r, -2, 'miter')), 16 * 6, 1e-6);
    assert.equal(offsetPath(r, -6, 'miter').subpaths.length, 0);
  });
  it('large offsets of small shapes keep the right area', () => {
    for (const [r, d] of [[1, 5], [10, 30]]) near(ar(offsetPath(circlePath(0, 0, r), d, 'round')), Math.PI * (r + d) ** 2, Math.PI * (r + d) ** 2 * .01, `r${r} d${d}`);
  });
  it('concave star: inward offset with round joins is clean', () => { const o = offsetPath(starPath(0, 0, 100, 40, 5), -8, 'round'); assert.equal(o.subpaths.length, 1); signedMatchesFill(o); });
});

describe('outline stroke', () => {
  const l = polyPath([{ x: 0, y: 0 }, { x: 30, y: 40 }], false);
  it('caps', () => {
    near(ar(outlineStroke(l, { width: 4, cap: 'butt' })), 200, 1e-6);
    near(ar(outlineStroke(l, { width: 4, cap: 'square' })), 216, 1e-6);
    near(ar(outlineStroke(l, { width: 4, cap: 'round' })), 200 + Math.PI * 4, .02);
  });
  it('closed square → a ring of two loops', () => { const o = outlineStroke(rectPath(0, 0, 10, 10), { width: 2, join: 'miter', miterLimit: 10 }); assert.equal(o.subpaths.length, 2); near(ar(o), 144 - 64, 1e-6); });
  it('self-overlapping zig-zag is unioned, never double-covered', () => {
    const z = polyPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 2 }], false);
    const o = outlineStroke(z, { width: 3, cap: 'round', join: 'round' }); assert.ok(o.subpaths.length >= 1); signedMatchesFill(o);
  });
  it('miter limit falls back to bevel on sharp turns', () => {
    const v = polyPath([{ x: 0, y: 0 }, { x: 50, y: 4 }, { x: 0, y: 8 }], false);
    const m = pathBounds(outlineStroke(v, { width: 4, join: 'miter', miterLimit: 4 })); assert.ok(m.x + m.w < 60, `miter spike ${m.x + m.w}`);
  });
  it('alignment: inside + outside = 2× centre area band split', () => {
    const r = rectPath(0, 0, 100, 100);
    near(ar(outlineStroke(r, { width: 10, align: 'inside', join: 'miter' })), 10000 - 80 * 80, 1e-6);
    near(ar(outlineStroke(r, { width: 10, align: 'outside', join: 'miter' })), 120 * 120 - 10000, 1e-6);
  });
});

describe('dashes', () => {
  it('SVG dash semantics with offset', () => {
    const d = dashPath(polyPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), [10, 10], 5);
    // phase 5: [0,5] [15,25] [35,45] [55,65] [75,85] [95,100]
    assert.equal(d.subpaths.length, 6); near(pathLength(d), 50, 1e-9); near(d.subpaths[0].anchors[1].x, 5, 1e-9);
  });
  it('odd-length patterns repeat twice', () => { const d = dashPath(polyPath([{ x: 0, y: 0 }, { x: 60, y: 0 }], false), [10]); assert.equal(d.subpaths.length, 3); });
  it('aligned to corners: a dash is centred on every corner (and turns it)', () => {
    const d = dashPath(rectPath(0, 0, 100, 100), [10, 6], 0, true);
    for (const c of [[0, 0], [100, 0], [100, 100], [0, 100]]) assert.ok(d.subpaths.some(s => s.anchors.some(a => a.x === c[0] && a.y === c[1]) && s.anchors.length >= 3), `corner ${c}`);
  });
  it('dashed outline stroke produces one piece per dash', () => { const o = outlineStroke(polyPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), { width: 4, dash: [10, 10] }); assert.equal(o.subpaths.length, 5); near(ar(o), 200, 1e-6); });
});

describe('variable width', () => {
  const spine = smoothThrough([{ x: 0, y: 100 }, { x: 60, y: 20 }, { x: 150, y: 120 }, { x: 230, y: 30 }], false);
  it('uniform profile ≈ constant-width stroke', () => {
    const v = variableStroke(spine, { width: 10, profile: PROFILES.uniform, cap: 'butt' });
    near(ar(v), pathLength(spine) * 10, pathLength(spine) * 10 * .01);
  });
  it('tapers have less area than uniform and stay clean', () => {
    for (const k of ['ink', 'brush', 'taper', 'tail', 'comma'] as const) { const v = variableStroke(spine, { width: 20, profile: PROFILES[k] }); assert.ok(ar(v) > 100 && ar(v) < pathLength(spine) * 20, k); signedMatchesFill(v); }
  });
  it('width points with asymmetric sides', () => {
    const v = variableStroke(polyPath([{ x: 0, y: 0 }, { x: 100, y: 0 }], false), { width: 0, profile: [{ u: 0, left: 10, right: 0 }, { u: 1, left: 10, right: 0 }], cap: 'butt' });
    const b = pathBounds(v); near(b.h, 10, 1e-6); near(Math.min(b.y, b.y + b.h), 0, 10); near(ar(v), 1000, 1);
  });
  it('closed spine gives a ring; corners stay sharp', () => {
    const v = variableStroke(rectPath(0, 0, 100, 100), { width: 10, profile: PROFILES.uniform, join: 'miter' }); assert.equal(v.subpaths.length, 2); near(ar(v), 110 * 110 - 90 * 90, 40);
  });
});

describe('brushes', () => {
  const spine = parsePathData('M0 0 C50 -50 150 50 200 0');
  it('art brush stretches art along the spine', () => {
    const out = artBrush([rectPath(0, -10, 100, 20)], spine, { width: 20 }); const b = pathBounds(out[0]);
    const sb = pathBounds(spine); assert.ok(b.x >= sb.x - 10 && b.x < sb.x + 1 && b.x + b.w > sb.x + sb.w - 1 && b.x + b.w <= sb.x + sb.w + 10, `${b.x} ${b.w}`); assert.ok(subpathCurves(out[0].subpaths[0]).some(c => !c.line), 'stays curved');
  });
  it('pattern brush tiles a whole number of tiles and places corners', () => {
    const tiles = patternBrush(rectPath(0, 0, 100, 100), { width: 10, side: [rectPath(0, -5, 18, 10)], outerCorner: [circlePath(0, 0, 5)] });
    assert.ok(tiles.length >= 16 && tiles.length <= 30, `${tiles.length}`);
  });
  it('scatter brush is deterministic by seed', () => {
    const a = scatterBrush([circlePath(0, 0, 3)], spine, { spacing: 3, size: [.5, 1.5], scatter: [-1, 1], seed: 4 }), b = scatterBrush([circlePath(0, 0, 3)], spine, { spacing: 3, size: [.5, 1.5], scatter: [-1, 1], seed: 4 });
    assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.ok(a.length > 10);
  });
});
