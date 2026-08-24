// The headset session's contract.
//
// Almost nothing about WebXR is testable off a headset — there is no pose, no reference space
// and no GL context here. What IS testable is everything the picture and the sound depend on
// being right BEFORE a frame is drawn: the matrix maths that turns a pixel into a world ray,
// where voices are placed around a listener, and the comfort constants that are the actual
// design rather than settings on top of it.
//
// The comfort assertions look trivial. They are guard rails: they exist so that a later change
// that adds locomotion, or moves content inside the vergence minimum, fails here rather than
// in someone's inner ear twenty minutes into a session.
//
//   npx tsx --test tests/stillnessXr.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AUDIO_DISTANCE_M, HEADSET_GAIN, XR_COMFORT,
  invert, invViewProj, multiply, spatialPlacement,
} from '../services/ora/stillness/xrSession';

/** Column-major, matching WebXR's own matrices. */
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** A plausible headset projection: 90° vertical FOV, square aspect, near 0.1. */
function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

function translation(x: number, y: number, z: number): Float32Array {
  const m = new Float32Array(IDENTITY);
  m[12] = x; m[13] = y; m[14] = z;
  return m;
}

/** Rotation about Y, which is what turning your head actually is. */
function rotY(a: number): Float32Array {
  const c = Math.cos(a), s = Math.sin(a);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function xform(m: Float32Array, v: [number, number, number, number]): number[] {
  const o = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += m[k * 4 + r] * v[k];
    o[r] = sum;
  }
  return o;
}

/** The eye shader's ray reconstruction, in TypeScript, so it can be checked. */
function rayFor(invVP: Float32Array, ndcX: number, ndcY: number): [number, number, number] {
  const n = xform(invVP, [ndcX, ndcY, -1, 1]);
  const f = xform(invVP, [ndcX, ndcY, 1, 1]);
  const d: [number, number, number] = [
    f[0] / f[3] - n[0] / n[3],
    f[1] / f[3] - n[1] / n[3],
    f[2] / f[3] - n[2] / n[3],
  ];
  const len = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / len, d[1] / len, d[2] / len];
}

// ── Matrix maths ─────────────────────────────────────────────────────────────

test('invert undoes a transform', () => {
  const m = multiply(translation(0.3, 1.6, -0.8), rotY(0.7));
  const back = multiply(m, invert(m));
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(back[i] - IDENTITY[i]) < 1e-4, `element ${i} was ${back[i]}`);
  }
});

test('a singular matrix does not produce NaN', () => {
  // A degenerate projection is what a headset can hand you for one frame during a reset. The
  // shader would happily render NaN as a black eye; returning zeros keeps it merely wrong.
  const flat = invert(new Float32Array(16));
  assert.ok(Array.from(flat).every(Number.isFinite));
});

test('the centre pixel looks straight ahead', () => {
  const invVP = invViewProj(perspective(Math.PI / 2, 1, 0.1, 100), IDENTITY);
  const dir = rayFor(invVP, 0, 0);
  // -z is forward. Anything else and the field is behind the viewer at rest.
  assert.ok(dir[2] < -0.99, `centre ray was ${dir.join(', ')}`);
  assert.ok(Math.abs(dir[0]) < 1e-5 && Math.abs(dir[1]) < 1e-5);
});

test('turning the head turns the field the same amount, and only that amount', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const turn = 0.6;
  // XRView.transform.inverse.matrix is the world-to-view matrix; a head turned by +turn about
  // Y has the inverse of that rotation as its view matrix.
  const dir = rayFor(invViewProj(proj, invert(rotY(turn))), 0, 0);

  const az = Math.atan2(dir[0], -dir[2]);
  assert.ok(Math.abs(az - turn) < 1e-4, `looked ${az} rad after a ${turn} rad turn`);
  // Yaw must not leak into pitch. A horizon that tilts when you turn your head is the single
  // most reliable way to make someone sick.
  assert.ok(Math.abs(dir[1]) < 1e-5, `horizon tilted by ${dir[1]}`);
});

test('translating the head does not move a field at infinity', () => {
  const proj = perspective(Math.PI / 2, 1, 0.1, 100);
  const still = rayFor(invViewProj(proj, invert(IDENTITY)), 0.4, -0.2);
  const stepped = rayFor(invViewProj(proj, invert(translation(0.4, 0, -0.9))), 0.4, -0.2);
  // This is what licenses rendering the field ONCE for both eyes: at optical infinity there is
  // no parallax to render, so a second pass would cost double for nothing.
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(still[i] - stepped[i]) < 1e-4, `axis ${i} moved by ${still[i] - stepped[i]}`);
  }
});

test('the equirect lookup is continuous across the seam', () => {
  // u = atan2(z,x)/2pi + 0.5 wraps at the -x axis. The texture is set to REPEAT on S for
  // exactly this reason; clamped, there would be a vertical seam standing in the room.
  const u = (d: [number, number, number]) => Math.atan2(d[2], d[0]) / (2 * Math.PI) + 0.5;
  const eps = 1e-4;
  const a = u([-1, 0, eps]);
  const b = u([-1, 0, -eps]);
  // One approaches 1 from below, the other 0 from above — a wrap, not a jump in the field.
  assert.ok(Math.min(a, 1 - a) < 1e-4 && Math.min(b, 1 - b) < 1e-4, `${a} / ${b}`);
});

// ── Comfort ──────────────────────────────────────────────────────────────────

test('locomotion is not offered, at any speed', () => {
  assert.equal(XR_COMFORT.allowsLocomotion, false);
});

test('nothing visual sits inside the vergence minimum', () => {
  assert.ok(XR_COMFORT.minContentMetres >= 2,
    'sustained vergence nearer than about two metres is a headache, not a preference');
});

test('the field updates far slower than the display', () => {
  // The whole reason one texture serves ninety frames. If this ever crept up to display rate
  // the headset would be re-rendering a shader that moves at 0.05 screen-widths a second,
  // ninety times a second, for nothing.
  assert.ok(XR_COMFORT.fieldHz <= 30 && XR_COMFORT.fieldHz >= 10);
});

test('a floor-relative space is preferred over a head-relative one', () => {
  // `viewer` moves with the head. It is the last resort precisely because a horizon anchored to
  // your own skull is not a horizon.
  assert.equal(XR_COMFORT.referenceSpaces[0], 'local-floor');
  assert.equal(XR_COMFORT.referenceSpaces[XR_COMFORT.referenceSpaces.length - 1], 'viewer');
});

// ── Placement ────────────────────────────────────────────────────────────────

test('voices are always behind the listener', () => {
  for (let pan = -1; pan <= 1.0001; pan += 0.25) {
    for (const depth of [0, 0.5, 1]) {
      const z = spatialPlacement(pan, depth)[2];
      // +z is behind, since the engine and WebXR both face -z. Sound from in front is something
      // addressing you, and a session is not addressing you.
      assert.ok(z > 0, `pan ${pan} depth ${depth} placed a voice at z=${z}`);
    }
  }
});

test('pan still separates left from right', () => {
  const left = spatialPlacement(-1, 0.5)[0];
  const right = spatialPlacement(1, 0.5)[0];
  assert.ok(right - left > 1, `the ensemble collapsed to a point: ${left} to ${right}`);
});

test('depth lifts the ensemble rather than pushing it away', () => {
  const near = spatialPlacement(0, 0);
  const deep = spatialPlacement(0, 1);
  assert.ok(deep[1] > near[1] + 0.5, 'the deep phase should drift overhead');
  const d = (p: [number, number, number]) => Math.hypot(p[0], p[2]);
  assert.ok(Math.abs(d(deep) - d(near)) < 1e-6, 'horizontal distance should not change with depth');
});

test('every placement holds a constant horizontal distance', () => {
  for (let pan = -1; pan <= 1.0001; pan += 0.2) {
    const p = spatialPlacement(pan, 0.4);
    assert.ok(Math.abs(Math.hypot(p[0], p[2]) - AUDIO_DISTANCE_M) < 1e-5);
  }
});

test('the headset trim exactly undoes the spatial stage attenuation', () => {
  // spatial.rs: atten = 1 / (1 + 0.6 * max(0, d - 1)). The ensemble's levels were balanced at
  // one metre; without this the headset would just be a quieter mix from a new direction.
  const atten = (d: number) => 1 / (1 + 0.6 * Math.max(0, d - 1));
  const restored = atten(AUDIO_DISTANCE_M) * HEADSET_GAIN;
  assert.ok(Math.abs(restored - atten(1.0)) < 1e-6, `net gain was ${restored}, wanted ${atten(1.0)}`);
});

test('the audio distance is not tied to the visual minimum', () => {
  // Vergence is a property of eyes. Pushing sound out to match the picture would make it
  // quieter and vaguer for no reason at all.
  assert.ok(AUDIO_DISTANCE_M < XR_COMFORT.minContentMetres);
  assert.ok(AUDIO_DISTANCE_M > 1, 'and still further than the flat-screen placement');
});
