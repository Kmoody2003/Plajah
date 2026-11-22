import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileClipDurations, sourceLimit, clampWindow, hasRealDuration } from '../services/fabula/mediaDuration.ts';

const POOL = [
  { id: 'long', type: 'video', duration: 42.5, durProbed: true },
  { id: 'short', type: 'video', duration: 2.0, durProbed: true },
  { id: 'pending', type: 'video', duration: 5 },                 // placeholder, not probed
  { id: 'legacy', type: 'video', duration: 30, durProbed: true, legacyPlaceholder: true },
  { id: 'img', type: 'image', duration: 0 },
];

test('placeholder length is not a real length', () => {
  assert.equal(hasRealDuration(POOL[2]), false);
  assert.equal(hasRealDuration(POOL[0]), true);
  assert.equal(sourceLimit({ assetId: 'pending' }, POOL), Infinity);
  assert.equal(sourceLimit({ assetId: 'img' }, POOL), Infinity);
});

test('auto-length clips snap to the full source, frame-floored', () => {
  const clips = [{ id: 'c', trackId: 'v1', start: 0, duration: 5, srcIn: 0, assetId: 'long', durAuto: true }];
  const out = reconcileClipDurations(clips, POOL, 24);
  assert.equal(out[0].duration, Math.floor(42.5 * 24) / 24);
  assert.equal(out[0].durAuto, undefined);
});

test('clips past the end of their source are clamped (no frozen tail)', () => {
  const clips = [{ id: 'c', trackId: 'v1', start: 10, duration: 5, srcIn: 0, assetId: 'short' }];
  assert.equal(reconcileClipDurations(clips, POOL, 30)[0].duration, 2);
});

test('auto-length growth stops at the next clip on the track', () => {
  const clips = [
    { id: 'a', trackId: 'v1', start: 0, duration: 5, srcIn: 0, assetId: 'long', durAuto: true },
    { id: 'b', trackId: 'v1', start: 8, duration: 2, srcIn: 0, assetId: 'short' },
  ];
  assert.equal(reconcileClipDurations(clips, POOL, 24).find((c) => c.id === 'a').duration, 8);
});

test('linked A/V pair stays the same length', () => {
  const clips = [
    { id: 'v', trackId: 'v1', start: 0, duration: 5, srcIn: 0, assetId: 'long', linkId: 'L', durAuto: true },
    { id: 'a', trackId: 'a1', start: 0, duration: 5, srcIn: 0, assetId: 'long', linkId: 'L', durAuto: true },
  ];
  const out = reconcileClipDurations(clips, POOL, 24);
  assert.equal(out[0].duration, out[1].duration);
  assert.ok(out[0].duration > 42);
});

test('legacy 5 s clips of a re-probed asset extend; trimmed ones do not', () => {
  const clips = [
    { id: 'x', trackId: 'v1', start: 0, duration: 5, srcIn: 0, assetId: 'legacy' },
    { id: 'y', trackId: 'v2', start: 0, duration: 3, srcIn: 0, assetId: 'legacy' },
  ];
  const out = reconcileClipDurations(clips, POOL, 24);
  assert.equal(out.find((c) => c.id === 'x').duration, 30);
  assert.equal(out.find((c) => c.id === 'y').duration, 3);
});

test('unchanged timelines return the same array (no re-render / autosave)', () => {
  const clips = [{ id: 'c', trackId: 'v1', start: 0, duration: 2, srcIn: 0, assetId: 'long' }];
  assert.equal(reconcileClipDurations(clips, POOL, 24), clips);
});

test('slip/trim window never leaves the source', () => {
  assert.deepEqual(clampWindow(-1, 3, 10, 1 / 24), { srcIn: 0, duration: 3 });
  assert.deepEqual(clampWindow(9, 3, 10, 1 / 24), { srcIn: 7, duration: 3 });
  assert.deepEqual(clampWindow(0, 12, 10, 1 / 24), { srcIn: 0, duration: 10 });
  assert.deepEqual(clampWindow(50, 3, Infinity, 1 / 24), { srcIn: 50, duration: 3 });
});
