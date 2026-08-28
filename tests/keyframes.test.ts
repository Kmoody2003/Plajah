import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleTrack, sampleParam, addKey, removeKey, keyAt, hasKeys,
  isAnimated, prevKeyTime, nextKeyTime,
} from '../services/fabula/keyframes.ts';

test('no track → the static value (keyframing is additive)', () => {
  assert.equal(sampleTrack(undefined, 5, 1.5), 1.5);
  assert.equal(sampleTrack([], 5, 0.8), 0.8);
  assert.equal(sampleParam({ x: 42 }, 'x', 3, 42), 42);
});

test('linear interpolation between two keys', () => {
  const tr = [{ t: 0, v: 0, ease: 'linear' as const }, { t: 10, v: 100, ease: 'linear' as const }];
  assert.equal(sampleTrack(tr, 0, 0), 0);
  assert.equal(sampleTrack(tr, 5, 0), 50);
  assert.equal(sampleTrack(tr, 10, 0), 100);
});

test('clamps before the first and after the last key', () => {
  const tr = [{ t: 2, v: 10 }, { t: 8, v: 20 }];
  assert.equal(sampleTrack(tr, 0, 0), 10);   // before → first
  assert.equal(sampleTrack(tr, 99, 0), 20);  // after → last
});

test('hold ease keeps the left value until the next key', () => {
  const tr = [{ t: 0, v: 5, ease: 'hold' as const }, { t: 10, v: 50 }];
  assert.equal(sampleTrack(tr, 4.9, 0), 5);
  assert.equal(sampleTrack(tr, 9.99, 0), 5);
  assert.equal(sampleTrack(tr, 10, 0), 50);
});

test('smooth ease is monotone and hits both endpoints', () => {
  const tr = [{ t: 0, v: 0, ease: 'smooth' as const }, { t: 1, v: 1 }];
  assert.equal(sampleTrack(tr, 0, 0), 0);
  assert.equal(sampleTrack(tr, 1, 0), 1);
  const mid = sampleTrack(tr, 0.5, 0);
  assert.ok(Math.abs(mid - 0.5) < 1e-6);     // smoothstep symmetric at midpoint
  let prev = -1;
  for (let i = 0; i <= 20; i++) { const v = sampleTrack(tr, i / 20, 0); assert.ok(v >= prev - 1e-9); prev = v; }
});

test('addKey inserts sorted and replaces an existing key at the same time', () => {
  let tr = addKey(undefined, 5, 10);
  tr = addKey(tr, 0, 0);
  tr = addKey(tr, 10, 20);
  assert.deepEqual(tr.map((k) => k.t), [0, 5, 10]);
  tr = addKey(tr, 5, 99);                     // replace
  assert.equal(tr.length, 3);
  assert.equal(keyAt(tr, 5)?.v, 99);
});

test('removeKey / keyAt / neighbours', () => {
  const tr = [{ t: 0, v: 0 }, { t: 5, v: 1 }, { t: 10, v: 2 }];
  assert.ok(keyAt(tr, 5));
  assert.equal(removeKey(tr, 5).length, 2);
  assert.equal(prevKeyTime(tr, 6), 5);
  assert.equal(nextKeyTime(tr, 6), 10);
  assert.equal(prevKeyTime(tr, 0), null);
  assert.equal(nextKeyTime(tr, 10), null);
});

test('isAnimated / hasKeys', () => {
  assert.ok(!isAnimated({ x: 5 }));
  assert.ok(!isAnimated({ kf: {} }));
  assert.ok(!isAnimated({ kf: { x: [] } }));
  assert.ok(isAnimated({ kf: { x: [{ t: 0, v: 0 }] } }));
  assert.ok(hasKeys([{ t: 0, v: 0 }]));
  assert.ok(!hasKeys([]));
});
