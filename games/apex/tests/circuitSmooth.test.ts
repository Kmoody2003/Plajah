import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { smoothClosedPath } from '../src/circuitSmooth';

const region = JSON.parse(fs.readFileSync(new URL('../../../public/games/apex/region/region.json', import.meta.url), 'utf8'));
const circuit = region.circuits.ironport_grand_circuit as { xz: number[][]; y: number[] };

const headings = (xz: number[][]): number[] => xz.map((p, i) => { const q = xz[(i + 1) % xz.length]; return Math.atan2(q[0] - p[0], q[1] - p[1]); });
const turn = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));

test('a square corner becomes an arc with no sharp vertex and the points are evenly spaced', () => {
  const sq = [[0, 0], [60, 0], [60, 60], [0, 60]];
  const s = smoothClosedPath(sq, undefined, 12, 6);
  const h = headings(s.xz);
  const worst = Math.max(...h.map((a, i) => turn(a, h[(i + 1) % h.length])));
  assert.ok(worst < 0.52, `largest heading change per step ${worst}`);        // 12 m radius at 6 m steps is about 0.5 rad; a sharp vertex would be 1.57
  const d = s.xz.map((p, i) => Math.hypot(s.xz[(i + 1) % s.xz.length][0] - p[0], s.xz[(i + 1) % s.xz.length][1] - p[1]));
  assert.ok(Math.max(...d) - Math.min(...d) < 0.6, 'even spacing');
  assert.ok(s.xz.every((p) => p[0] >= -0.01 && p[0] <= 60.01 && p[1] >= -0.01 && p[1] <= 60.01), 'the arcs stay inside the original corner');
});

test('the city circuit: closed, no repeated point, corners rounded, close to the real streets, heights follow', () => {
  const s = smoothClosedPath(circuit.xz, circuit.y, 12, 6);
  assert.ok(s.xz.length > 400 && s.xz.length < 800, 'about 3.9 km at 6 m');
  const gaps = s.xz.map((p, i) => Math.hypot(s.xz[(i + 1) % s.xz.length][0] - p[0], s.xz[(i + 1) % s.xz.length][1] - p[1]));
  assert.ok(Math.min(...gaps) > 5 && Math.max(...gaps) < 6.5, `spacing ${Math.min(...gaps)}..${Math.max(...gaps)}`);
  const h = headings(s.xz);
  const worst = Math.max(...h.map((a, i) => turn(a, h[(i + 1) % h.length])));
  assert.ok(worst < 0.75, `sharpest turn per 6 m step ${(worst * 180 / Math.PI).toFixed(0)} degrees (the source has 91 degrees in one vertex)`);
  // never far from where the street really is
  let far = 0;
  for (const p of s.xz) { let best = 1e9; for (let i = 0; i < circuit.xz.length; i++) { const a = circuit.xz[i], b = circuit.xz[(i + 1) % circuit.xz.length]; const tx = b[0] - a[0], tz = b[1] - a[1], L2 = tx * tx + tz * tz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * tx + (p[1] - a[1]) * tz) / L2)); best = Math.min(best, Math.hypot(p[0] - a[0] - tx * t, p[1] - a[1] - tz * t)); } far = Math.max(far, best); }
  assert.ok(far < 6, `at most ${far.toFixed(1)} m from the street`);
  assert.ok(s.y.every((v) => Number.isFinite(v)) && Math.min(...s.y) >= Math.min(...circuit.y) - 0.01 && Math.max(...s.y) <= Math.max(...circuit.y) + 0.01);
});
