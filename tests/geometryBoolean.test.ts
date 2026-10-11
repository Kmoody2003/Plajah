// Geometry engine — booleans, divide / shape builder, pathfinder stacks, clipping.
// Includes property tests on area identities over random and deliberately degenerate inputs
// (coincident edges, tangencies, near-horizontal edges meeting arc ends, identical shapes).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  boolean, union, intersect, subtract, exclude, resolve, divide, pickRegion, mergeRegions, trim, merge, crop, outline, containsPoint,
  rectPath, circlePath, starPath, polyPath, parsePathData, pathArea, transformPath, clipPath, toPathData, subpathCurves, type CompoundPath,
} from '../services/tela/geometry';
import { rotate } from '../services/tela/geometry/transform';
import { Random } from '../services/tela/geometry/procedural/random';
import { blob } from '../services/tela/geometry/procedural/organic';

const A = (p: CompoundPath) => pathArea(p);
const near = (a: number, b: number, tol: number, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);
function identities(a: CompoundPath, b: CompoundPath, tag: string) {
  const u = A(boolean('union', [a, b])), n = A(boolean('intersect', [a, b])), x = A(boolean('exclude', [a, b]));
  const d1 = A(boolean('subtract', [a, b])), d2 = A(boolean('subtract', [b, a])); const aa = A(resolve(a)), bb = A(resolve(b));
  const tol = 1e-6 * Math.max(1, aa + bb);
  near(u + n, aa + bb, tol, `${tag} u+n`); near(u - n, x, tol, `${tag} u-n=x`); near(d1 + d2, x, tol, `${tag} d1+d2=x`); near(d1 + n, aa, tol, `${tag} d1+n=a`); near(d2 + n, bb, tol, `${tag} d2+n=b`);
}

describe('boolean basics', () => {
  const a = rectPath(0, 0, 100, 100), b = rectPath(50, 50, 100, 100);
  it('rect ops', () => { near(A(union(a, b)), 17500, 1e-9); near(A(intersect(a, b)), 2500, 1e-9); near(A(subtract(a, b)), 7500, 1e-9); near(A(exclude(a, b)), 15000, 1e-9); });
  it('results are clean: straight edges merge, curves stay curves', () => {
    assert.equal(toPathData(union(rectPath(0, 0, 100, 100), rectPath(100, 0, 100, 100))), 'M0 0H200V100H0Z');
    const u = union(circlePath(0, 0, 50), circlePath(60, 0, 50));
    assert.ok(subpathCurves(u.subpaths[0]).every(c => !c.line), 'circle union keeps only curves');
    assert.ok(u.subpaths[0].anchors.length <= 10, `anchors ${u.subpaths[0].anchors.length}`);
  });
  it('disjoint union keeps both; A − A is empty; A ∪ A is A', () => {
    assert.equal(union(rectPath(0, 0, 10, 10), rectPath(20, 0, 10, 10)).subpaths.length, 2);
    assert.equal(subtract(a, rectPath(0, 0, 100, 100)).subpaths.length, 0);
    near(A(union(a, rectPath(0, 0, 100, 100))), 10000, 1e-9);
  });
  it('holes and fill rules', () => {
    const h = subtract(rectPath(0, 0, 100, 100), circlePath(50, 50, 20)); assert.equal(h.subpaths.length, 2); near(A(h), 10000 - Math.PI * 400, 1);
    assert.ok(!containsPoint(h, { x: 50, y: 50 })); assert.ok(containsPoint(h, { x: 5, y: 5 }));
    const nested = { fillRule: 'evenodd' as const, subpaths: [...rectPath(0, 0, 100, 100).subpaths, ...rectPath(25, 25, 50, 50).subpaths] };
    near(A(resolve(nested)), 7500, 1e-9); near(A(resolve({ ...nested, fillRule: 'nonzero' })), 10000, 1e-9);
  });
  it('self-intersection: figure-eight and pentagram', () => {
    near(A(resolve(parsePathData('M0 0 L100 100 L100 0 L0 100 Z'))), 5000, 1e-9);
    const star = parsePathData('M50 0 L79 90 L2 35 L98 35 L21 90 Z');
    assert.ok(A(resolve({ ...star, fillRule: 'nonzero' })) > A(resolve({ ...star, fillRule: 'evenodd' })) + 100);
  });
  it('open paths are closed for fill', () => { near(A(union(polyPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], false))), 50, 1e-9); });
  it('externally tangent circles stay two clean loops', () => { const u = union(circlePath(50, 80, 50), circlePath(150, 80, 50)); assert.equal(u.subpaths.length, 2); near(A(u), 2 * A(circlePath(0, 0, 50)), 1e-6); });
  it('n-ary union and subtract', () => {
    const rs = Array.from({ length: 5 }, (_, i) => rectPath(i * 10, 0, 10, 10));
    assert.equal(toPathData(boolean('union', rs)), 'M0 0H50V10H0Z');
    near(A(boolean('subtract', [rectPath(0, 0, 50, 10), rs[1], rs[3]])), 300, 1e-9);
  });
});

describe('boolean properties (area identities)', () => {
  it('random shapes (rects, circles, stars, blobs)', () => {
    const R = new Random('prop');
    const shape = (k: number): CompoundPath => { const t = k % 4; const x = R.float(0, 60), y = R.float(0, 60);
      if (t === 0) return rectPath(x, y, R.float(5, 60), R.float(5, 60), R.chance(.5) ? R.float(0, 10) : 0);
      if (t === 1) return circlePath(x, y, R.float(5, 40));
      if (t === 2) return starPath(x, y, R.float(10, 40), R.float(4, 15), R.int(3, 8), R.float(0, 90));
      return blob(x, y, R.float(10, 40), R.float(10, 40), { seed: R.int(0, 1e5), wobble: .25 }); };
    for (let i = 0; i < 120; i++) identities(shape(i), shape(i + R.int(0, 3)), `random ${i}`);
  });
  it('grid-aligned rects sharing edges and corners', () => {
    const R = new Random('grid'); const g = () => rectPath(R.int(0, 6) * 10, R.int(0, 6) * 10, R.int(1, 5) * 10, R.int(1, 5) * 10);
    for (let i = 0; i < 80; i++) identities(g(), g(), `grid ${i}`);
  });
  it('identical and rotated-identical shapes', () => {
    const c = circlePath(50, 50, 30); for (const r of [0, 45, 90, 180]) identities(c, transformPath(c, rotate(r, { x: 50, y: 50 })), `circle rot ${r}`);
    const s = starPath(50, 50, 40, 18, 5); for (const k of [1, 2, 3]) identities(s, transformPath(s, rotate(72 * k, { x: 50, y: 50 })), `star rot ${k}`);
  });
  it('tangent circles, external and internal', () => {
    const R = new Random('tan');
    for (let i = 0; i < 24; i++) { const r1 = R.float(5, 30), r2 = R.float(5, 30); const d = i % 2 ? r1 + r2 : Math.abs(r1 - r2); const a = R.float(0, 6.28); identities(circlePath(0, 0, r1), circlePath(Math.cos(a) * d, Math.sin(a) * d, r2), `tangent ${i}`); }
  });
  it('near-horizontal edge meeting an arc end (sweep-line killer, own construction)', () => {
    for (const dy of [1e-14, 1e-12, 1e-10, 1e-8, 1e-6, 1e-4]) identities(parsePathData('M10 10 L30 10 L30 18 C29 22 26 25 22 26 L12 26 Z'), parsePathData(`M0 27 L0 26 L12 26 L15 26.6 L19 ${26 - dy} L40 26 L40 27 Z`), `dy ${dy}`);
  });
  it('rect edge through a circle cap at near-tangent heights', () => {
    for (const k of [1e-3, 1e-6, 1e-9, 0]) identities(circlePath(0, 0, 13.7), rectPath(-30, 13.7 * (1 - k), 60, 1), `cap ${k}`);
  });
  it('two half-discs sharing a curved-free diameter unite into one disc', () => {
    const top = parsePathData('M-20 0 C-20 -11.05 -11.05 -20 0 -20 C11.05 -20 20 -11.05 20 0 Z'), bot = parsePathData('M-20 0 L20 0 C20 11.05 11.05 20 0 20 C-11.05 20 -20 11.05 -20 0 Z');
    assert.equal(union(top, bot).subpaths.length, 1);
  });
});

describe('divide, shape builder, pathfinder stacks', () => {
  const a = circlePath(0, 0, 50), b = circlePath(60, 0, 50);
  it('divide covers each operand exactly', () => {
    const regs = divide([a, b]); assert.equal(regs.length, 3);
    near(regs.reduce((s, r) => s + r.area, 0), A(union(a, b)), 1e-6);
    near(regs.filter(r => r.coverage[0]).reduce((s, r) => s + r.area, 0), A(resolve(a)), 1e-6);
  });
  it('divide keeps islands as holes', () => {
    const regs = divide([rectPath(0, 0, 100, 100), rectPath(40, 40, 20, 20)]);
    const outer = regs.find(r => r.coverage[0] && !r.coverage[1])!; assert.equal(outer.path.subpaths.length, 2); near(outer.area, 9600, 1e-9);
  });
  it('shape builder: pick and merge', () => {
    const regs = divide([a, b]); const i = pickRegion(regs, { x: 30, y: 0 }); assert.ok(regs[i].coverage.every(Boolean));
    near(A(mergeRegions(regs, regs.map((_, k) => k))), A(union(a, b)), 1e-6);
  });
  it('trim / merge / crop / outline', () => {
    const stack = [{ path: rectPath(0, 0, 100, 100), fill: 'red' }, { path: rectPath(50, 0, 100, 100), fill: 'blue' }, { path: rectPath(120, 0, 50, 50), fill: 'red' }];
    const t = trim(stack); near(A(t[0].path), 5000, 1e-9); near(A(t[1].path), 8500, 1e-9);
    assert.equal(merge(stack).length, 2);
    const c = crop([{ path: rectPath(0, 0, 100, 100), fill: 'a' }, { path: rectPath(50, 50, 100, 100), fill: 'clip' }]); near(A(c[0].path), 2500, 1e-9);
    const o = outline([rectPath(0, 0, 100, 100), rectPath(50, 0, 100, 100)]); assert.ok(o.length >= 6);
  });
  it('clipping open paths keeps curves and the inside pieces', () => {
    const line = parsePathData('M-50 0 C0 -40 50 40 150 0'); const cl = clipPath(line, rectPath(0, -50, 100, 100));
    assert.equal(cl.subpaths.length, 1); assert.ok(cl.subpaths[0].anchors.every(p => p.x >= -1e-6 && p.x <= 100 + 1e-6));
  });
});
