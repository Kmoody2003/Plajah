// Orbital mechanics for the orrery.
//
// Worth testing because these are the numbers the eye checks without knowing it:
// if perihelion is wrong the planet doesn't visibly speed up near the Sun, and
// if the traced path and the planet disagree the planet skates beside its own
// orbit line. Both are silent in code and glaring on screen.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS, solveKepler, orbitalPosition, orbitPath } from '../components/museion/orrery/orbits';

const NAMES = Object.keys(ELEMENTS);

test('Kepler solver inverts its own equation', () => {
  // Feed a known E through M = E − e·sin E and demand the solver recovers it.
  for (const e of [0, 0.0167, 0.0934, 0.2056, 0.5]) {
    for (let k = 0; k < 60; k++) {
      const E0 = -Math.PI + (k / 59) * Math.PI * 2;
      const M = E0 - e * Math.sin(E0);
      const E = solveKepler(M, e);
      assert.ok(
        Math.abs(E - E0) < 1e-6,
        `e=${e} E=${E0.toFixed(4)} recovered ${E.toFixed(8)}`,
      );
    }
  }
});

test('solver stays stable for mean anomalies far outside one revolution', () => {
  // Elapsed time grows without bound while the module is open, so M does too.
  for (const turns of [-40, -3, 5, 120]) {
    const M = turns * Math.PI * 2 + 0.7;
    const E = solveKepler(M, 0.2056);
    assert.ok(Number.isFinite(E), `M=${M} produced ${E}`);
  }
});

test('every orbit is an ellipse with the Sun at a focus', () => {
  // The distance to the origin must sweep between a(1−e) and a(1+e). A circle —
  // which is what the module drew before — holds it constant.
  const a = 10;
  for (const name of NAMES) {
    const el = ELEMENTS[name];
    let lo = Infinity;
    let hi = -Infinity;
    for (let s = 0; s < 500; s++) {
      const p = orbitalPosition(el, a, (s / 500) * el.period);
      const r = Math.hypot(p[0], p[1], p[2]);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    assert.ok(Math.abs(lo - a * (1 - el.e)) < 0.02, `${name} perihelion ${lo}`);
    assert.ok(Math.abs(hi - a * (1 + el.e)) < 0.02, `${name} aphelion ${hi}`);
  }
});

test('each planet returns to its start after exactly one period', () => {
  for (const name of NAMES) {
    const el = ELEMENTS[name];
    const p0 = orbitalPosition(el, 10, 0);
    const p1 = orbitalPosition(el, 10, el.period);
    const drift = Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]);
    assert.ok(drift < 1e-4, `${name} drifted ${drift} over one period`);
  }
});

test('inclined orbits actually leave the ecliptic plane', () => {
  // The old scene was flat. If this fails, it is flat again.
  for (const name of NAMES) {
    const el = ELEMENTS[name];
    if (el.i < 0.001) continue;                  // Earth defines the plane
    const path = orbitPath(el, 10, 128);
    let maxY = 0;
    for (let s = 0; s <= 128; s++) maxY = Math.max(maxY, Math.abs(path[s * 3 + 1]));
    assert.ok(maxY > 0.001, `${name} has inclination ${el.i} but no vertical spread`);
  }
});

test('a planet sits on the orbit line drawn for it', () => {
  // The path is sampled in eccentric anomaly and the position solved from time;
  // if those two ever disagree the planet visibly skates beside its own orbit.
  const a = 12;
  for (const name of NAMES) {
    const el = ELEMENTS[name];
    const path = orbitPath(el, a, 512);
    for (const frac of [0, 0.17, 0.42, 0.63, 0.88]) {
      const p = orbitalPosition(el, a, frac * el.period);
      // Distance to the LINE, not to the nearest sample point. Measuring to
      // vertices only measures how finely the path was sampled: on Mercury,
      // the most eccentric orbit here, half a segment is already ~0.07 units.
      let best = Infinity;
      for (let s = 0; s < 512; s++) {
        const ax = path[s * 3], ay = path[s * 3 + 1], az = path[s * 3 + 2];
        const bx = path[s * 3 + 3], by = path[s * 3 + 4], bz = path[s * 3 + 5];
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const len2 = dx * dx + dy * dy + dz * dz;
        const t = len2 > 0
          ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy + (p[2] - az) * dz) / len2))
          : 0;
        best = Math.min(best, Math.hypot(
          ax + dx * t - p[0], ay + dy * t - p[1], az + dz * t - p[2],
        ));
      }
      assert.ok(best < 0.005, `${name} at t=${frac}P is ${best.toFixed(5)} off its path`);
    }
  }
});

test('orbit path closes on itself', () => {
  for (const name of NAMES) {
    const path = orbitPath(ELEMENTS[name], 10, 256);
    const gap = Math.hypot(
      path[0] - path[256 * 3], path[1] - path[256 * 3 + 1], path[2] - path[256 * 3 + 2],
    );
    assert.ok(gap < 1e-6, `${name} orbit line has a ${gap} gap at the seam`);
  }
});

test('planets move faster at perihelion than at aphelion', () => {
  // Kepler's second law, and the reason an elliptical orbit reads as motion
  // rather than as a turntable.
  for (const name of NAMES) {
    const el = ELEMENTS[name];
    if (el.e < 0.02) continue;                   // too circular to measure cleanly
    const a = 10;
    const dt = el.period / 2000;
    let nearR = Infinity, farR = -Infinity, nearV = 0, farV = 0;
    for (let s = 0; s < 400; s++) {
      const t = (s / 400) * el.period;
      const p = orbitalPosition(el, a, t);
      const q = orbitalPosition(el, a, t + dt);
      const r = Math.hypot(p[0], p[1], p[2]);
      const v = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) / dt;
      if (r < nearR) { nearR = r; nearV = v; }
      if (r > farR) { farR = r; farV = v; }
    }
    assert.ok(nearV > farV, `${name}: perihelion speed ${nearV} not above aphelion ${farV}`);
  }
});
