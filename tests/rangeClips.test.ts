import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangeClips } from '../services/fabula/rangeClips.ts';

const A = { id: 'a', start: 0, duration: 10, srcIn: 0, label: 'A' };
const B = { id: 'b', start: 10, duration: 10, srcIn: 2, label: 'B' };

test('whole-range keeps every clip, shifted to a zero origin from 0', () => {
  const r = rangeClips([A, B], 0, 20);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((c) => [c.start, c.duration, c.srcIn]), [[0, 10, 0], [10, 10, 2]]);
});

test('In→Out drops non-overlapping clips and rebases to zero', () => {
  const r = rangeClips([A, B], 10, 20);   // only B
  assert.equal(r.length, 1);
  assert.equal(r[0].id, 'b');
  assert.equal(r[0].start, 0);            // rebased
  assert.equal(r[0].duration, 10);
  assert.equal(r[0].srcIn, 2);            // unchanged (range starts at B's head)
});

test('a range cutting mid-clip pushes srcIn forward by the trimmed head', () => {
  const r = rangeClips([A], 4, 8);
  assert.equal(r.length, 1);
  assert.equal(r[0].start, 0);            // 4 → 0
  assert.equal(r[0].duration, 4);         // 4..8
  assert.equal(r[0].srcIn, 4);            // source advanced by 4s so the frame matches
});

test('a clip spanning the range boundary is clipped on both sides', () => {
  const long = { id: 'l', start: 0, duration: 30, srcIn: 5 };
  const r = rangeClips([long], 10, 20);
  assert.equal(r[0].start, 0);
  assert.equal(r[0].duration, 10);
  assert.equal(r[0].srcIn, 15);           // 5 + (10 - 0)
});

test('zero-overlap range yields nothing', () => {
  assert.equal(rangeClips([A, B], 100, 110).length, 0);
});

test('marker segments partition the timeline without loss', () => {
  const clips = [A, B];
  const seg1 = rangeClips(clips, 0, 10);
  const seg2 = rangeClips(clips, 10, 20);
  const total = seg1.reduce((s, c) => s + c.duration, 0) + seg2.reduce((s, c) => s + c.duration, 0);
  assert.equal(total, 20); // full runtime preserved across segments
});
