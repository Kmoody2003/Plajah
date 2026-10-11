// Raster engine — every blend mode against hand-computed values (CPU reference path).
import test from 'node:test';
import assert from 'node:assert/strict';
import { blendChannel, blendStraight, compositeRaster, BLEND_MODE_INDEX } from '../services/tela/raster/blend';
import { BLEND_MODES, type BlendMode } from '../services/tela/raster/model';
import { createRaster } from '../services/tela/raster/buffer';

const near = (a: number, b: number, eps = 1e-5, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);

test('27 Photoshop blend modes are defined and indexed', () => {
  assert.equal(BLEND_MODES.length, 27);
  for (const m of BLEND_MODES) assert.ok(m in BLEND_MODE_INDEX, m);
  assert.equal(new Set(Object.values(BLEND_MODE_INDEX)).size, 27);
});

test('separable modes: b=0.6, s=0.3 (hand computed)', () => {
  const expect: Partial<Record<BlendMode, number>> = {
    normal: 0.3, darken: 0.3, multiply: 0.18, 'color-burn': 0, 'linear-burn': 0, lighten: 0.6, screen: 0.72,
    'color-dodge': 0.6 / 0.7, 'linear-dodge': 0.9, overlay: 0.44, 'soft-light': 0.504, 'hard-light': 0.36,
    'vivid-light': 1 - 0.4 / 0.6, 'linear-light': 0.2, 'pin-light': 0.6, 'hard-mix': 0, difference: 0.3, exclusion: 0.54,
    subtract: 0.3, divide: 1,
  };
  for (const [m, v] of Object.entries(expect)) near(blendChannel(m as BlendMode, 0.6, 0.3), v!, 1e-6, m);
});

test('separable modes: upper branches b=0.5, s=0.8 (hand computed)', () => {
  const expect: Partial<Record<BlendMode, number>> = {
    'color-burn': 0.375, 'color-dodge': 1, overlay: 0.8, 'soft-light': 0.2 + Math.SQRT1_2 * 0.6, 'hard-light': 0.8,
    'vivid-light': 1, 'linear-light': 1, 'pin-light': 0.6, 'hard-mix': 1, divide: 0.625, subtract: 0, 'linear-burn': 0.3,
  };
  for (const [m, v] of Object.entries(expect)) near(blendChannel(m as BlendMode, 0.5, 0.8), v!, 1e-6, m);
});

test('edge cases: burn/dodge/divide at 0 and 1', () => {
  near(blendChannel('color-burn', 1, 0), 1); near(blendChannel('color-burn', 0.5, 0), 0);
  near(blendChannel('color-dodge', 0, 1), 0); near(blendChannel('color-dodge', 0.5, 1), 1);
  near(blendChannel('divide', 0, 0), 0); near(blendChannel('divide', 0.2, 0), 1);
  near(blendChannel('vivid-light', 0.5, 0.5), 0.5, 1e-6);
});

test('non-separable modes (W3C SetLum/SetSat) hand computed', () => {
  const cb: [number, number, number, number] = [0.8, 0.4, 0.2, 1], cs: [number, number, number, number] = [0.2, 0.5, 0.9, 1];
  const check = (m: BlendMode, e: number[]) => { const r = blendStraight(m, cb, cs); e.forEach((v, i) => near(r[i], v, 1e-5, `${m}[${i}]`)); near(r[3], 1); };
  check('luminosity', [0.756, 0.356, 0.156]);
  check('color', [0.244, 0.544, 0.944]);
  check('saturation', [0.850333, 0.383667, 0.150333]);
  check('hue', [0.280286, 0.537429, 0.880286]);
  check('darker-color', [0.2, 0.5, 0.9]);
  check('lighter-color', [0.8, 0.4, 0.2]);
});

test('Porter-Duff source-over with blending, partial alpha (hand computed)', () => {
  const r = blendStraight('multiply', [0.6, 0.6, 0.6, 0.5], [0.3, 0.3, 0.3, 0.5]);
  near(r[3], 0.75); near(r[0], 0.27 / 0.75);
  const n = blendStraight('normal', [1, 0, 0, 1], [0, 0, 1, 0.25]);
  near(n[0], 0.75); near(n[2], 0.25); near(n[3], 1);
  const t = blendStraight('screen', [0, 0, 0, 0], [0.3, 0.2, 0.1, 0.6]); // over transparent = source
  near(t[0], 0.3); near(t[3], 0.6);
});

test('clipping (atop) keeps backdrop alpha', () => {
  const dst = createRaster(1, 1), src = createRaster(1, 1);
  dst.data.set([0.25, 0.25, 0.25, 0.5]); src.data.set([0.9, 0, 0, 0.9]);
  compositeRaster(dst, src, 'normal', 1, null, true);
  near(dst.data[3], 0.5); near(dst.data[0], 0.25 * 0.1 + 0.45 * 1); // cb(1-as) + as·ab·Cs
});

test('dissolve: coverage fraction ≈ alpha, colours are pure source or backdrop', () => {
  const W = 200, H = 200, dst = createRaster(W, H), src = createRaster(W, H);
  for (let i = 0; i < W * H; i++) { dst.data.set([0, 0, 1, 1], i * 4); src.data.set([0.4, 0, 0, 0.4], i * 4); }
  compositeRaster(dst, src, 'dissolve', 1);
  let red = 0; for (let i = 0; i < W * H; i++) { const r = dst.data[i * 4]; if (r > 0.99) red++; else assert.ok(r < 1e-6); }
  near(red / (W * H), 0.4, 0.02, 'dissolve fraction');
});
