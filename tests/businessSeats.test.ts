import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSeats, withPageId, withoutPageId } from '../services/businessStaffServerCore';

test('private seats win over a stale public copy', () => {
  const merged = mergeSeats({ ownerId: 'o', staffUids: ['old'] }, { staffUids: ['new'], staffSeats: {} });
  assert.deepEqual(merged.staffUids, ['new']);
  assert.equal(merged.ownerId, 'o');
});
test('no private doc leaves the page alone', () => {
  assert.deepEqual(mergeSeats({ staffUids: ['a'] }, null), { staffUids: ['a'] });
});
test('page lists add once and remove cleanly', () => {
  assert.deepEqual(withPageId(['a'], 'a'), ['a']);
  assert.deepEqual(withPageId(undefined, 'a'), ['a']);
  assert.deepEqual(withoutPageId(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(withoutPageId(undefined, 'a'), []);
});
