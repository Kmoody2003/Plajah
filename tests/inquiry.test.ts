import test from 'node:test';
import assert from 'node:assert/strict';
import { mean, median, mode, stdev, linearFit, applyTransform, histogram, percentError, parseTable, fmt } from '../services/dataStats';
import { VIRTUAL_EXPERIMENTS, runTrial, seededRandom, experimentById } from '../data/virtualExperiments';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test('summary statistics', () => {
  close(mean([2, 4, 6, 8]), 5); close(median([9, 1, 5]), 5); close(median([1, 2, 3, 4]), 2.5);
  assert.deepEqual(mode([1, 2, 2, 3, 3, 4]), [2, 3]); assert.deepEqual(mode([1, 2, 3]), []);
  close(stdev([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7));
});

test('linear fit recovers a known line and reports r', () => {
  const xs = [1, 2, 3, 4, 5], ys = xs.map(x => 3 * x + 2);
  const f = linearFit(xs, ys)!; close(f.slope, 3); close(f.intercept, 2); close(f.r2, 1);
  const neg = linearFit(xs, xs.map(x => -2 * x + 10))!; close(neg.r, -1);
  assert.equal(linearFit([1, 1, 1], [1, 2, 3]), null); assert.equal(linearFit([1], [1]), null);
  const flat = linearFit([1, 2, 3], [5, 5, 5])!; close(flat.slope, 0); close(flat.r, 0);
});

test('transforms drop undefined points instead of inventing numbers', () => {
  assert.ok(Number.isNaN(applyTransform(0, 'ln'))); assert.ok(Number.isNaN(applyTransform(-4, 'sqrt'))); assert.ok(Number.isNaN(applyTransform(0, 'inverse')));
  close(applyTransform(3, 'square'), 9); close(applyTransform(Math.E, 'ln'), 1); close(applyTransform(4, 'inverse'), 0.25);
});

test('histogram counts add up; percent error; table parsing', () => {
  const h = histogram([1, 2, 2, 3, 9, 10], 3); assert.equal(h.reduce((a, b) => a + b.count, 0), 6);
  close(percentError(9.5, 10), 5);
  const t = parseTable('Length,Period\n0.2,0.9\n0.4,1.27'); assert.deepEqual(t.headers, ['Length', 'Period']); assert.equal(t.rows.length, 2);
  const nh = parseTable('1\t2\n3\t4'); assert.equal(nh.headers[0], 'Column 1'); assert.equal(nh.rows.length, 2);
  assert.equal(fmt(NaN), '—'); assert.equal(fmt(0.1 + 0.2), '0.3');
});

test('virtual experiments follow their laws: noisy data fit the truth within tolerance', () => {
  const rng = seededRandom(42);
  for (const e of VIRTUAL_EXPERIMENTS) {
    const xs: number[] = []; for (let x = e.independent.min; x <= e.independent.max + 1e-9; x += e.independent.step) xs.push(Math.round(x * 1000) / 1000);
    const ys = xs.map(x => runTrial(e, x, rng));
    xs.forEach((x, i) => assert.ok(Math.abs(ys[i] - e.model(x)) < e.noise * 6 + 0.01, `${e.id} trial too far from model at ${x}`));
  }
  // The pendulum's T^2 vs L slope is 4 pi^2 / g.
  const p = experimentById('pendulum')!; const Ls = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6];
  const T2 = Ls.map(L => applyTransform(runTrial(p, L, seededRandom(7 + Math.round(L * 10))), 'square'));
  close(linearFit(Ls, T2)!.slope, (4 * Math.PI ** 2) / 9.81, 0.25);
  // Cooling: ln(T - 22) vs t has slope -0.05.
  const c = experimentById('cooling')!; const ts = [0, 5, 10, 15, 20, 25, 30]; const rc = seededRandom(3);
  const lnT = ts.map(t => Math.log(runTrial(c, t, rc) - 22));
  close(linearFit(ts, lnT)!.slope, -0.05, 0.01);
  // Projectile range is symmetric about 45 degrees (noise-free model).
  const pr = experimentById('projectile')!; close(pr.model(30), pr.model(60), 1e-9);
  assert.ok(pr.model(45) > pr.model(30));
});
