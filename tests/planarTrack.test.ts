import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decomposePlanar, invertHomography, solveHomography, transformPoint, multiplyMat3, flipYMat3, toPixelSpace, mat3ToCssMatrix3d, unitToQuad, containBox, type Mat3 } from '../services/fabula/planarTrack';
const pts = [{ x: .1, y: .1 }, { x: .8, y: .12 }, { x: .86, y: .78 }, { x: .08, y: .84 }];
describe('VectorTrack planar solve', () => {
  it('recovers a perspective homography from four surface points', () => { const truth: Mat3 = [1.1, .08, .04, -.05, .92, .07, .12, -.08, 1]; const dst = pts.map(p => transformPoint(truth, p)); const solve = solveHomography(pts, dst); assert.ok(solve); assert.ok(solve.rmsError < 1e-7); for (let i = 0; i < 9; i++) assert.ok(Math.abs(solve.matrix[i] - truth[i]) < 1e-6); assert.ok(solve.confidence > .99); });
  it('inverts motion and exposes affine transform components', () => { const m: Mat3 = [1.2, 0, .1, 0, 1.2, -.05, 0, 0, 1], inv = invertHomography(m); assert.ok(inv); const p = { x: .35, y: .6 }, q = transformPoint(inv!, transformPoint(m, p)); assert.ok(Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9); const d = decomposePlanar(m); assert.equal(d.tx, .1); assert.equal(d.scaleX, 1.2); });
  it('composes, flips and re-bases matrices consistently', () => {
    const a: Mat3 = [1, 0, .2, 0, 1, .1, 0, 0, 1], b: Mat3 = [2, 0, 0, 0, 2, 0, 0, 0, 1];
    const p = { x: .3, y: .4 };
    const ab = transformPoint(multiplyMat3(a, b), p), viaB = transformPoint(a, transformPoint(b, p));
    assert.ok(Math.abs(ab.x - viaB.x) < 1e-12 && Math.abs(ab.y - viaB.y) < 1e-12);
    // flipY: a y-down move of +.1 becomes a y-up move of -.1
    const f = flipYMat3(a); const q = transformPoint(f, { x: .3, y: .6 });
    assert.ok(Math.abs(q.x - .5) < 1e-12 && Math.abs(q.y - .5) < 1e-12);
    assert.deepEqual(flipYMat3(flipYMat3(a)).map(v => +v.toFixed(12)), a);
    // pixel space over a 200×100 box at (10,20): normalized (.5,.5) → (110,70) after +.2/+.1 → (150,80)
    const px = transformPoint(toPixelSpace(a, { x: 10, y: 20, w: 200, h: 100 }), { x: 110, y: 70 });
    assert.ok(Math.abs(px.x - 150) < 1e-9 && Math.abs(px.y - 80) < 1e-9);
    assert.match(mat3ToCssMatrix3d(a), /^matrix3d\(/);
  });
  it('maps the unit square onto a quad and fits contain boxes', () => {
    const Q = unitToQuad([{ x: .2, y: .2 }, { x: .8, y: .25 }, { x: .85, y: .8 }, { x: .15, y: .75 }])!;
    const br = transformPoint(Q, { x: 1, y: 1 });
    assert.ok(Math.abs(br.x - .85) < 1e-9 && Math.abs(br.y - .8) < 1e-9);
    assert.deepEqual(containBox(1920, 1080, 800, 800), { x: 0, y: 175, w: 800, h: 450 });
  });
});
