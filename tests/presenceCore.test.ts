// Tests for the presence/room-member staleness tracker and the room poll tally.
//
//   npx tsx --test tests/presenceCore.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { StaleTracker, toMillisLoose, STALE_MS } from '../services/presenceCore';
import { tallyPollVotes, pollPercent } from '../services/roomPollCore';

const T0 = 1_800_000_000_000;

test('fresh heartbeat on first sight is shown', () => {
  const t = new StaleTracker();
  t.observe([{ id: 'a', heartbeatMs: T0 - 5_000 }], T0);
  assert.equal(t.isFresh('a', T0), true);
});

test('hours-old ghost is stale on first sight', () => {
  const t = new StaleTracker();
  t.observe([{ id: 'ghost', heartbeatMs: T0 - 3 * 3600_000 }], T0);
  assert.equal(t.isFresh('ghost', T0), false);
});

test('member goes stale when heartbeat stops changing (reader clock only)', () => {
  const t = new StaleTracker();
  t.observe([{ id: 'a', heartbeatMs: T0 }], T0);
  t.observe([{ id: 'a', heartbeatMs: T0 }], T0 + 30_000); // unchanged
  assert.equal(t.isFresh('a', T0 + 30_000), true);
  assert.equal(t.isFresh('a', T0 + STALE_MS + 1), false);
  // a new heartbeat revives them
  t.observe([{ id: 'a', heartbeatMs: T0 + 80_000 }], T0 + 80_000);
  assert.equal(t.isFresh('a', T0 + 80_000), true);
});

test('writer clock skew is irrelevant once a change is observed', () => {
  const t = new StaleTracker();
  // reader clock is 5 minutes ahead of server: first sight looks old...
  const readerNow = T0 + 5 * 60_000;
  t.observe([{ id: 'a', heartbeatMs: T0 }], readerNow);
  assert.equal(t.isFresh('a', readerNow), false);
  // ...but the next heartbeat change makes them fresh on our own clock
  t.observe([{ id: 'a', heartbeatMs: T0 + 25_000 }], readerNow + 25_000);
  assert.equal(t.isFresh('a', readerNow + 25_000), true);
});

test('own-heartbeat clock sample corrects first-sight aging for a skewed reader', () => {
  const t = new StaleTracker();
  const skew = 5 * 60_000; // reader ahead by 5 min
  t.noteOwnHeartbeat(T0, T0 + skew); // server stamped T0 when we wrote at local T0+skew
  assert.equal(t.clockOffset, -skew);
  t.observe([{ id: 'b', heartbeatMs: T0 - 10_000 }], T0 + skew + 1_000);
  assert.equal(t.isFresh('b', T0 + skew + 1_000), true);
});

test('own-heartbeat sample ignored when server value did not change', () => {
  const t = new StaleTracker();
  t.noteOwnHeartbeat(T0, T0);
  t.noteOwnHeartbeat(T0, T0 + 25_000); // write failed: old server value, new local time
  assert.equal(t.clockOffset, 0);
});

test('pending serverTimestamp (null) counts as fresh now; removed members are forgotten', () => {
  const t = new StaleTracker();
  t.observe([{ id: 'me', heartbeatMs: null }, { id: 'x', heartbeatMs: T0 }], T0);
  assert.equal(t.isFresh('me', T0), true);
  t.observe([{ id: 'me', heartbeatMs: T0 + 100 }], T0 + 200);
  assert.deepEqual([...t.freshIds(T0 + 200)], ['me']);
});

test('legacy docs fall back to writer ts', () => {
  const t = new StaleTracker();
  t.observe([{ id: 'old', heartbeatMs: null, legacyTs: T0 - 2 * 3600_000 }, { id: 'new', heartbeatMs: null, legacyTs: T0 - 1_000 }], T0);
  assert.equal(t.isFresh('old', T0), false);
  assert.equal(t.isFresh('new', T0), true);
});

test('toMillisLoose handles Timestamp-likes', () => {
  assert.equal(toMillisLoose({ toMillis: () => 42 }), 42);
  assert.equal(toMillisLoose({ seconds: 2, nanoseconds: 5_000_000 }), 2005);
  assert.equal(toMillisLoose(new Date(7)), 7);
  assert.equal(toMillisLoose(null), null);
  assert.equal(toMillisLoose('nope'), null);
});

test('poll tally: one vote per uid, invalid choices dropped, my choice + leader', () => {
  const r = tallyPollVotes([
    { uid: 'a', choice: 0 }, { uid: 'b', choice: 1 }, { uid: 'c', choice: 1 },
    { uid: 'd', choice: 9 }, { uid: 'e', choice: -1 }, { uid: 'f', choice: 1.5 },
    { uid: '', choice: 0 },
  ], 3, 'b');
  assert.deepEqual(r.counts, [1, 2, 0]);
  assert.equal(r.total, 3);
  assert.equal(r.myChoice, 1);
  assert.equal(r.leader, 1);
  assert.equal(pollPercent(2, 3), 67);
  assert.equal(pollPercent(0, 0), 0);
});

test('poll tally: tie at top has no leader; empty has no leader', () => {
  assert.equal(tallyPollVotes([{ uid: 'a', choice: 0 }, { uid: 'b', choice: 1 }], 2).leader, null);
  const e = tallyPollVotes([], 2, 'z');
  assert.equal(e.leader, null);
  assert.equal(e.myChoice, null);
  assert.equal(e.total, 0);
});
