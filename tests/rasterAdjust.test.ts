// Raster engine — every adjustment type against hand-computed values (CPU reference).
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAdjustment, curveLut, parseCube, bakeLut3d, sampleCube, applyAdjustmentRaster } from '../services/tela/raster/adjust';
import { defaultAdjustment, type Adjustment, type AdjustmentType } from '../services/tela/raster/model';
import { srgbToLinear, linearToSrgb, createRaster } from '../services/tela/raster/buffer';

const near = (a: number, b: number, eps = 1e-4, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} expected ${b}, got ${a}`);
const run = (adj: Adjustment, c: number[]) => { const x = [...c]; compileAdjustment(adj)(x); return x; };

test('every adjustment default is neutral (identity within 1/255)', () => {
  const types: AdjustmentType[] = ['levels', 'curves', 'hueSaturation', 'colorBalance', 'vibrance', 'exposure', 'brightnessContrast', 'photoFilter', 'channelMixer', 'selectiveColor', 'cssColor'];
  const samples = [[0.1, 0.5, 0.9], [0.8, 0.2, 0.3], [0.5, 0.5, 0.5], [0, 0, 0], [1, 1, 1]];
  for (const t of types) {
    const adj = t === 'photoFilter' ? { ...defaultAdjustment(t), density: 0 } as Adjustment : defaultAdjustment(t);
    for (const s of samples) run(adj, s).forEach((v, i) => near(v, s[i], 1.5 / 255, `${t} ${s}`));
  }
});

test('invert / posterize / threshold', () => {
  assert.deepEqual(run({ type: 'invert' }, [0.2, 0.5, 1]).map(v => +v.toFixed(6)), [0.8, 0.5, 0]);
  near(run({ type: 'posterize', levels: 4 }, [0.3, 0, 0])[0], 1 / 3);
  near(run({ type: 'posterize', levels: 2 }, [0.49, 0.5, 1])[0], 0); near(run({ type: 'posterize', levels: 2 }, [0.5, 0, 0])[0], 1);
  near(run({ type: 'threshold', level: 0.5 }, [0.6, 0.6, 0.6])[0], 1); near(run({ type: 'threshold', level: 0.5 }, [0.4, 0.4, 0.4])[1], 0);
});

test('levels: input range + gamma + output range', () => {
  const lv = (o: Partial<{ inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }>) => ({ type: 'levels', master: { inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 1, ...o } }) as Adjustment;
  near(run(lv({ inBlack: 0.2, inWhite: 0.8 }), [0.35, 0, 0])[0], 0.25);
  near(run(lv({ gamma: 2 }), [0.25, 0, 0])[0], 0.5);
  near(run(lv({ outBlack: 0.2, outWhite: 0.6 }), [0.5, 0, 0])[0], 0.4);
  // per-channel then master
  const r = run({ type: 'levels', master: { inBlack: 0, inWhite: 1, gamma: 1, outBlack: 0, outWhite: 0.5 }, r: { inBlack: 0, inWhite: 0.5, gamma: 1, outBlack: 0, outWhite: 1 } }, [0.25, 0.25, 0.25]);
  near(r[0], 0.25); near(r[1], 0.125);
});

test('curves: natural spline passes through points, flat outside', () => {
  const lut = curveLut([[0, 0], [0.5, 0.75], [1, 1]]);
  near(lut[Math.round(0.5 * 4095)], 0.75, 2e-3);
  near(run({ type: 'curves', master: [[0.25, 0.25], [0.75, 0.75]] }, [0.1, 0.9, 0.5])[0], 0.25);
  near(run({ type: 'curves', master: [[0, 1], [1, 0]] }, [0.3, 0, 0])[0], 0.7, 1e-3);
  near(run({ type: 'curves', master: [[0, 0], [1, 1]], g: [[0, 0], [1, 0.5]] }, [0.5, 0.5, 0.5])[1], 0.25, 1e-3);
});

test('exposure works in linear light', () => {
  const e = run({ type: 'exposure', exposure: 1, offset: 0, gamma: 1 }, [0.5, 0.2, 0.9]);
  near(e[0], linearToSrgb(srgbToLinear(0.5) * 2), 1e-5); near(e[1], linearToSrgb(srgbToLinear(0.2) * 2), 1e-5); near(e[2], 1, 1e-5);
  const g = run({ type: 'exposure', exposure: 0, offset: 0, gamma: 2 }, [0.5, 0, 0]);
  near(g[0], linearToSrgb(Math.sqrt(srgbToLinear(0.5))), 1e-5);
});

test('hue/saturation: rotate, desaturate, ranges, colorize', () => {
  const h = run({ type: 'hueSaturation', hue: 120, saturation: 0, lightness: 0 }, [1, 0, 0]);
  near(h[0], 0); near(h[1], 1); near(h[2], 0);
  const d = run({ type: 'hueSaturation', hue: 0, saturation: -100, lightness: 0 }, [1, 0, 0]);
  near(d[0], 0.5); near(d[1], 0.5);
  const l = run({ type: 'hueSaturation', hue: 0, saturation: 0, lightness: 100 }, [0.2, 0.4, 0.6]);
  l.forEach(v => near(v, 1));
  // Only reds move when editing the reds range.
  const adj: Adjustment = { type: 'hueSaturation', hue: 0, saturation: 0, lightness: 0, ranges: [{ range: 'reds', hue: 0, saturation: -100, lightness: 0 }] };
  near(run(adj, [1, 0, 0])[1], 0.5); const blue = run(adj, [0, 0, 1]); near(blue[2], 1); near(blue[0], 0);
  const cz = run({ type: 'hueSaturation', hue: 240, saturation: 100, lightness: 0, colorize: true }, [0.5, 0.5, 0.5]);
  assert.ok(cz[2] > cz[0] && cz[2] > cz[1], 'colorize blue');
});

test('black & white: Photoshop 6-slider model, defaults', () => {
  const bw = defaultAdjustment('blackWhite');
  near(run(bw, [1, 0, 0])[0], 0.4); near(run(bw, [1, 1, 0])[0], 0.6); near(run(bw, [0, 0, 1])[0], 0.2);
  near(run(bw, [0, 1, 1])[0], 0.6); near(run(bw, [1, 0, 1])[0], 0.8); near(run(bw, [0.5, 0.5, 0.5])[0], 0.5);
  // (1, .5, 0): min 0 + (mid−min)=.5·yellows(.6) + (max−mid)=.5·reds(.4) = .5
  near(run(bw, [1, 0.5, 0])[0], 0.5);
});

test('channel mixer / css colour / photo filter / gradient map', () => {
  const swap = run({ type: 'channelMixer', red: [0, 0, 100, 0], green: [0, 100, 0, 0], blue: [100, 0, 0, 0] }, [0.1, 0.2, 0.9]);
  near(swap[0], 0.9); near(swap[2], 0.1);
  const mono = run({ type: 'channelMixer', red: [30, 59, 11, 0], green: [0, 0, 0, 0], blue: [0, 0, 0, 0], monochrome: true }, [1, 0, 0]);
  near(mono[0], 0.3); near(mono[2], 0.3);
  const css = run({ type: 'cssColor', brightness: 1, contrast: 1, saturate: 0 }, [1, 0, 0]);
  near(css[0], 0.213); near(css[1], 0.213);
  near(run({ type: 'cssColor', brightness: 0.5, contrast: 1, saturate: 1 }, [0.8, 0, 0])[0], 0.4);
  near(run({ type: 'cssColor', brightness: 1, contrast: 2, saturate: 1 }, [0.6, 0, 0])[0], 0.7);
  const pf = run({ type: 'photoFilter', color: [255, 0, 0], density: 1, preserveLuminosity: false }, [0.5, 0.5, 0.5]);
  near(pf[0], 0.5); near(pf[1], 0);
  const gm = run({ type: 'gradientMap', gradient: { stops: [{ offset: 0, color: [255, 0, 0] }, { offset: 1, color: [0, 0, 255] }] } }, [0.5, 0.5, 0.5]);
  near(gm[0], 0.5, 2e-3); near(gm[2], 0.5, 2e-3);
});

test('color balance + selective color + vibrance move colours the right way', () => {
  const cb = run({ type: 'colorBalance', shadows: [0, 0, 0], midtones: [100, 0, 0], highlights: [0, 0, 0], preserveLuminosity: false }, [0.5, 0.5, 0.5]);
  assert.ok(cb[0] > 0.6 && Math.abs(cb[1] - 0.5) < 1e-6, `midtone red push ${cb}`);
  const sc = run({ type: 'selectiveColor', method: 'absolute', reds: [100, 0, 0, 0] }, [1, 0, 0]);
  near(sc[0], 0); // +100% cyan in reds kills red
  const neutral = run({ type: 'selectiveColor', method: 'absolute', reds: [100, 0, 0, 0] }, [0.5, 0.5, 0.5]);
  near(neutral[0], 0.5); // greys have no red weight
  const vib = run({ type: 'vibrance', vibrance: 100, saturation: 0 }, [0.6, 0.5, 0.5]);
  assert.ok(vib[0] - vib[1] > 0.1, 'vibrance boosts low saturation');
  const sat = run({ type: 'vibrance', vibrance: 100, saturation: 0 }, [1, 0, 0]);
  near(sat[0], 1); near(sat[1], 0); // saturated colours untouched
});

test('3D LUT: .cube parsing + tetrahedral interpolation', () => {
  const lines = ['TITLE "swap"', 'LUT_3D_SIZE 2'];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) lines.push(`${b} ${g} ${r}`); // swaps R and B
  const lut = parseCube(lines.join('\n'));
  assert.equal(lut.size, 2); assert.equal(lut.title, 'swap');
  const o = [0, 0, 0]; sampleCube(lut, 0.2, 0.5, 0.7, o); near(o[0], 0.7); near(o[1], 0.5); near(o[2], 0.2);
  const r = run({ type: 'lut3d', cube: lines.join('\n') }, [0.1, 0.3, 0.9]); near(r[0], 0.9); near(r[2], 0.1);
  assert.throws(() => parseCube('LUT_3D_SIZE 3\n0 0 0'));
});

test('baked 3D LUT reproduces the function (GPU path accuracy)', () => {
  const adj: Adjustment = { type: 'hueSaturation', hue: 30, saturation: 20, lightness: -10 };
  const fn = compileAdjustment(adj), n = 64, lut = bakeLut3d(fn, n);
  const data = new Float32Array(n * n * n * 3); for (let i = 0; i < n * n * n; i++) data.set(lut.subarray(i * 4, i * 4 + 3), i * 3);
  const cube = { size: n, data, domainMin: [0, 0, 0] as [number, number, number], domainMax: [1, 1, 1] as [number, number, number] };
  let worst = 0, sum = 0; const o = [0, 0, 0];
  for (let i = 0; i < 2000; i++) { const c = [Math.random(), Math.random(), Math.random()]; const e = [...c]; fn(e); sampleCube(cube, c[0], c[1], c[2], o); for (let k = 0; k < 3; k++) { const d = Math.abs(o[k] - e[k]); worst = Math.max(worst, d); sum += d; } }
  assert.ok(worst < 4 / 255, `max baked error ${worst * 255} /255`); assert.ok(sum / 6000 < 0.25 / 255, `mean baked error ${sum / 6000 * 255}`);
});

test('adjustment opacity/coverage lerps and leaves alpha alone', () => {
  const r = createRaster(2, 1); r.data.set([0.25, 0.25, 0.25, 0.5, 0.2, 0.2, 0.2, 1]);
  applyAdjustmentRaster(r, compileAdjustment({ type: 'invert' }), 0.5, new Float32Array([1, 0]));
  near(r.data[0], 0.25); near(r.data[3], 0.5); near(r.data[4], 0.2);
});
