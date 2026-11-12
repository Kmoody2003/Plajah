// The browser lifter: float16 weights decode, the network runs, and applying it keeps a take's shape and scale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeLifter } from '../services/mocap/lifter';
import type { RawTake } from '../services/mocap/types';

const f16 = (x: number) => { // float → half (normal range only, enough for a test)
  if (x === 0) return 0;
  const s = x < 0 ? 0x8000 : 0; x = Math.abs(x);
  const e = Math.floor(Math.log2(x)), m = Math.round((x / 2 ** e - 1) * 1024);
  return s | ((e + 15) << 10) | m;
};

/** A lifter whose output is a fixed T-shaped body, whatever it sees (all weights zero, biases set). */
function fixedLifter() {
  const window = 3, feat = 33 * 2 + 33 + 33 * 3, hidden = 4, IN = window * feat;
  const joints = ['hip', 'neck', 'head', 'lShldr', 'lForeArm', 'lHand', 'rShldr', 'rForeArm', 'rHand', 'lThigh', 'lShin', 'lFoot', 'rThigh', 'rShin', 'rFoot'];
  const body: Record<string, [number, number, number]> = { hip: [0, 0, 0], neck: [0, 1, 0], head: [0, 1.3, 0], lShldr: [0.4, 0.95, 0], lForeArm: [0.9, 0.95, 0], lHand: [1.3, 0.95, 0], rShldr: [-0.4, 0.95, 0], rForeArm: [-0.9, 0.95, 0], rHand: [-1.3, 0.95, 0], lThigh: [0.2, -0.1, 0], lShin: [0.2, -1, 0], lFoot: [0.2, -1.8, 0], rThigh: [-0.2, -0.1, 0], rShin: [-0.2, -1, 0], rFoot: [-0.2, -1.8, 0] };
  const tensors: { name: string; shape: number[]; offset: number }[] = []; const vals: number[] = [];
  const put = (name: string, shape: number[], fill: (i: number) => number) => { const n = shape.reduce((a, b) => a * b, 1); tensors.push({ name, shape, offset: vals.length }); for (let i = 0; i < n; i++) vals.push(fill(i)); };
  put('mu', [IN], () => 0); put('sd', [IN], () => 1);
  put('inp.weight', [hidden, IN], () => 0); put('inp.bias', [hidden], () => 0);
  put('blocks.0.n.weight', [hidden], () => 1); put('blocks.0.n.bias', [hidden], () => 0);
  for (const l of ['a', 'b']) { put(`blocks.0.${l}.weight`, [hidden, hidden], () => 0); put(`blocks.0.${l}.bias`, [hidden], () => 0); }
  put('n.weight', [hidden], () => 1); put('n.bias', [hidden], () => 0);
  put('out.weight', [45, hidden], () => 0); put('out.bias', [45], (i) => body[joints[Math.floor(i / 3)]][i % 3]);
  const bin = new Uint16Array(vals.map(f16));
  return { lifter: makeLifter({ format: 'plajah-lifter/1', window, feat, hidden, blocks: 1, joints, tensors }, bin.buffer), body };
}

const frame = (t: number) => ({ t, pts: Array.from({ length: 33 }, (_, i) => ({ x: 0.5 + (i % 5) * 0.01, y: 0.3 + i * 0.01, v: 0.9 })),
  world: Array.from({ length: 33 }, (_, i) => ({ x: (i % 3) * 0.1 - 0.1, y: [11, 12].includes(i) ? -0.5 : 0, z: 0, v: 0.9 })) });

test('the lifter runs and puts its body into the take at MediaPipe\'s scale and axes', () => {
  const { lifter } = fixedLifter();
  const take = { fps: 30, width: 1280, height: 720, hfovDeg: 60, frames: [frame(0), null, frame(2 / 30)], source: { kind: 'upload', label: 't', model: 'heavy' } } as unknown as RawTake;
  const pred = lifter.predict(take);
  assert.equal(pred[1], null);
  assert.ok(Math.abs(pred[0]![5 * 3] - 1.3) < 0.01, 'lHand x from the bias');
  const out = lifter.apply(take, false);
  assert.equal(out.frames[1], null);
  const w = out.frames[0]!.world;
  // Hips centred; left wrist out to +x; y down (feet below hips = positive y in MediaPipe axes).
  assert.ok(Math.abs((w[23].x + w[24].x) / 2) < 1e-6 && Math.abs((w[23].y + w[24].y) / 2) < 1e-6);
  assert.ok(w[15].x > w[13].x && w[13].x > w[11].x, 'left arm reaches out along +x');
  assert.ok(w[27].y > w[25].y && w[25].y > w[23].y, 'feet below knees below hips');
  // Scale follows MediaPipe's own torso length (0.5 m here): neck sits ~0.5 m above the hips' midpoint.
  const neckY = (w[11].y + w[12].y) / 2 - (w[23].y + w[24].y) / 2;
  assert.ok(Math.abs(neckY + 0.5 * 1.05) < 0.08, `neck height ${neckY}`);
});

test('the confidence gate keeps MediaPipe where the lifter strays far or the limbs are poorly seen', () => {
  const { lifter } = fixedLifter();
  const take = { fps: 30, width: 1280, height: 720, hfovDeg: 60, frames: [frame(0), frame(1 / 30), frame(2 / 30)], source: { kind: 'upload', label: 't', model: 'heavy' } } as unknown as RawTake;
  // MediaPipe's toy body here is nothing like the lifter's T-pose: a tight disagreement limit keeps MediaPipe.
  const kept = lifter.apply(take, { maxDisagreeDeg: 20 });
  assert.deepEqual(kept.frames[1]!.world.map((q) => q.x), take.frames[1]!.world.map((q) => q.x));
  // A loose limit lets the lifter through in full.
  const full = lifter.apply(take, { maxDisagreeDeg: 180 });
  assert.deepEqual(full.frames[1]!.world.map((q) => q.x), lifter.apply(take, false).frames[1]!.world.map((q) => q.x));
  // Poorly seen limbs fade it out again.
  const dim = { ...take, frames: take.frames.map((f) => ({ ...f!, pts: f!.pts.map((p) => ({ ...p, v: 0.1 })) })) } as RawTake;
  assert.deepEqual(lifter.apply(dim, { maxDisagreeDeg: 180 }).frames[1]!.world.map((q) => q.x), dim.frames[1]!.world.map((q) => q.x));
});
