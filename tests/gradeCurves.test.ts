import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evalCurve, curveTable, buildCurveLut, isCurveIdentity, isCurvesIdentity, LUT_SIZE,
} from '../services/fabula/gradeCurves.ts';

test('empty / diagonal curve is identity and maps x→x', () => {
  assert.ok(isCurveIdentity(undefined));
  assert.ok(isCurveIdentity([]));
  assert.ok(isCurveIdentity([[0, 0], [1, 1]]));
  assert.ok(isCurveIdentity([[0.5, 0.5]]));
  for (const x of [0, 0.25, 0.5, 0.75, 1]) {
    assert.ok(Math.abs(evalCurve(undefined, x) - x) < 1e-6, `identity at ${x}`);
  }
});

test('a non-diagonal point makes the curve non-identity', () => {
  const c = { master: [[0.5, 0.7]] as [number, number][] };
  assert.ok(!isCurvesIdentity(c));
  // lifted midtone: eval at 0.5 rises above 0.5
  assert.ok(evalCurve(c.master, 0.5) > 0.55);
});

test('endpoints are respected and output stays in [0,1]', () => {
  const s = [[0, 0.05], [0.5, 0.55], [1, 0.98]] as [number, number][];
  assert.ok(Math.abs(evalCurve(s, 0) - 0.05) < 0.02, 'black point held');
  assert.ok(Math.abs(evalCurve(s, 1) - 0.98) < 0.02, 'white point held');
  for (let i = 0; i <= 100; i++) {
    const v = evalCurve(s, i / 100);
    assert.ok(v >= 0 && v <= 1, `in range at ${i}`);
  }
});

test('a monotone S-curve stays monotone (no Catmull-Rom overshoot escaping [0,1])', () => {
  const sCurve = [[0, 0], [0.25, 0.15], [0.75, 0.85], [1, 1]] as [number, number][];
  const t = curveTable(sCurve);
  assert.equal(t.length, LUT_SIZE);
  // never leaves the unit interval
  for (const v of t) assert.ok(v >= 0 && v <= 1);
  // generally increasing (allow tiny numerical wiggle)
  let drops = 0;
  for (let i = 1; i < t.length; i++) if (t[i] < t[i - 1] - 1e-3) drops++;
  assert.ok(drops === 0, `monotone S-curve had ${drops} descents`);
});

test('buildCurveLut packs R/G/B per-channel and master in alpha', () => {
  const lut = buildCurveLut({
    master: [[0, 0], [1, 1]],           // identity → alpha == index
    r: [[0.5, 0.9]] as [number, number][], // lifted red
    g: [[0, 0], [1, 1]],
    b: [[0, 0], [1, 1]],
  });
  assert.equal(lut.length, LUT_SIZE * 4);
  // alpha (master identity): texel i alpha ≈ i
  assert.equal(lut[3], 0);
  assert.equal(lut[(255) * 4 + 3], 255);
  // red channel lifted at the midpoint: r-out at index 128 exceeds the identity value
  const mid = 128;
  assert.ok(lut[mid * 4 + 0] > mid, 'red lifted above identity');
  // green/blue stay identity at the midpoint
  assert.ok(Math.abs(lut[mid * 4 + 1] - mid) <= 2);
  assert.ok(Math.abs(lut[mid * 4 + 2] - mid) <= 2);
});

test('identity curves build an identity-passing LUT (alpha and rgb == index)', () => {
  const lut = buildCurveLut(undefined);
  for (let i = 0; i < LUT_SIZE; i++) {
    for (let ch = 0; ch < 4; ch++) {
      assert.ok(Math.abs(lut[i * 4 + ch] - i) <= 1, `identity LUT at ${i},${ch}`);
    }
  }
});
