// Pure party sync math — follow targets, clock offset, drift correction, liveness, host claim.
//
//   npx tsx --test tests/partySync.test.ts

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeFollowTarget, computeServerFollowTarget, refineClockOffset, planDriftCorrection, hostLiveness,
  pickClaimant, isPartyDiscoverable, countdownRemaining, publicPartyContent, shouldResync,
  HOST_RECONNECTING_MS, HOST_GONE_MS, SEEK_BACKOFF_MS, MAX_RATE, MIN_RATE,
} from '../services/partySync';

test('computeFollowTarget: paused host holds position, no fudge', () => {
  const r = computeFollowTarget({ isPlaying: false, positionSec: 42 }, 1000, 9000);
  assert.deepEqual(r, { targetPositionSec: 42, shouldPlay: false });
});

test('computeFollowTarget: playing host advances from local receipt + fudge', () => {
  const r = computeFollowTarget({ isPlaying: true, positionSec: 10 }, 1000, 3000, 0.4);
  assert.equal(r.shouldPlay, true);
  assert.ok(Math.abs(r.targetPositionSec - 12.4) < 1e-9);
});

test('computeFollowTarget: null playback → 0, paused', () => {
  assert.deepEqual(computeFollowTarget(null, 0, 0), { targetPositionSec: 0, shouldPlay: false });
});

test('computeServerFollowTarget: late joiner extrapolates from the SERVER write time', () => {
  // Host wrote pos 100 at server t=50_000. We join at local 80_000 with offset +10_000 (server 90_000).
  const r = computeServerFollowTarget({ isPlaying: true, positionSec: 100 }, {
    updatedAtServerMs: 50_000, offsetMs: 10_000, receiptLocalMs: 80_000, nowLocalMs: 80_000,
  });
  assert.equal(r.targetPositionSec, 140);   // 40s later, not 0.4s
});

test('computeServerFollowTarget: falls back to local receipt without an offset', () => {
  const r = computeServerFollowTarget({ isPlaying: true, positionSec: 5 }, {
    updatedAtServerMs: 1, offsetMs: null, receiptLocalMs: 1000, nowLocalMs: 2000,
  });
  assert.ok(Math.abs(r.targetPositionSec - 6.4) < 1e-9);
});

test('computeServerFollowTarget: an ahead-of-server estimate never rewinds below the written position', () => {
  const r = computeServerFollowTarget({ isPlaying: true, positionSec: 20 }, {
    updatedAtServerMs: 10_000, offsetMs: -5_000, receiptLocalMs: 12_000, nowLocalMs: 12_000,
  });
  assert.equal(r.targetPositionSec, 20);
});

test('refineClockOffset: midpoint of the probe bracket, prefers tighter RTT', () => {
  const a = refineClockOffset(null, { sendLocalMs: 1000, receiptLocalMs: 1400, serverMs: 6200 });
  assert.deepEqual(a, { offsetMs: 5000, rttMs: 400 });
  const b = refineClockOffset(a, { sendLocalMs: 2000, receiptLocalMs: 2100, serverMs: 7060 });
  assert.deepEqual(b, { offsetMs: 5010, rttMs: 100 });
  // A much worse sample doesn't replace the good one.
  const c = refineClockOffset(b, { sendLocalMs: 3000, receiptLocalMs: 5000, serverMs: 9000 });
  assert.equal(c, b);
});

test('refineClockOffset: rejects nonsense samples', () => {
  assert.equal(refineClockOffset(null, { sendLocalMs: 2000, receiptLocalMs: 1000, serverMs: 5 }), null);
  assert.equal(refineClockOffset(null, { sendLocalMs: 0, receiptLocalMs: 10, serverMs: 0 }), null);
});

test('planDriftCorrection: in sync → none', () => {
  assert.deepEqual(planDriftCorrection(10, 10.1, { playing: true, nowMs: 0 }), { kind: 'none', rate: 1 });
});

test('planDriftCorrection: small drift nudges rate inside 0.95–1.05, no seek', () => {
  const behind = planDriftCorrection(10, 11, { playing: true, nowMs: 0 });
  assert.equal(behind.kind, 'rate');
  assert.ok(behind.rate > 1 && behind.rate <= MAX_RATE);
  const ahead = planDriftCorrection(12.5, 10, { playing: true, nowMs: 0 });
  assert.equal(ahead.kind, 'rate');
  assert.ok(ahead.rate < 1 && ahead.rate >= MIN_RATE);
});

test('planDriftCorrection: ≥3s drift hard-seeks', () => {
  assert.deepEqual(planDriftCorrection(10, 20, { playing: true, nowMs: 0 }), { kind: 'seek', seekTo: 20, rate: 1 });
});

test('planDriftCorrection: seek backoff prevents seek loops (clamped rate instead)', () => {
  const r = planDriftCorrection(10, 20, { playing: true, nowMs: 1000, lastHardSeekMs: 1000 - (SEEK_BACKOFF_MS - 1) });
  assert.deepEqual(r, { kind: 'rate', rate: MAX_RATE });
  const after = planDriftCorrection(10, 20, { playing: true, nowMs: 1000 + SEEK_BACKOFF_MS, lastHardSeekMs: 1000 });
  assert.equal(after.kind, 'seek');
});

test('planDriftCorrection: paused host → exact seek above 0.25s, never a rate change', () => {
  assert.deepEqual(planDriftCorrection(10, 10.2, { playing: false, nowMs: 0 }), { kind: 'none', rate: 1 });
  assert.deepEqual(planDriftCorrection(10, 11, { playing: false, nowMs: 0 }), { kind: 'seek', seekTo: 11, rate: 1 });
});

test('hostLiveness: thresholds on our own clock', () => {
  assert.equal(hostLiveness({ lastChangeLocalMs: 0, nowLocalMs: HOST_RECONNECTING_MS - 1 }), 'live');
  assert.equal(hostLiveness({ lastChangeLocalMs: 0, nowLocalMs: HOST_RECONNECTING_MS + 1 }), 'reconnecting');
  assert.equal(hostLiveness({ lastChangeLocalMs: 0, nowLocalMs: HOST_GONE_MS + 1 }), 'gone');
});

test('hostLiveness: orphaned party is stale on FIRST sight when the server clock is known', () => {
  // We just saw the heartbeat (lastChange = now) but it was written 10 minutes ago.
  const now = 1_000_000;
  assert.equal(hostLiveness({ lastChangeLocalMs: now, nowLocalMs: now, heartbeatServerMs: now - 600_000, offsetMs: 0 }), 'gone');
});

test('pickClaimant: first PRESENT co-host wins, in coHostIds order', () => {
  const viewers = [
    { uid: 'b', joinedAtMs: 5, fresh: true },
    { uid: 'c', joinedAtMs: 1, fresh: true },
    { uid: 'a', joinedAtMs: 2, fresh: false },
  ];
  assert.equal(pickClaimant({ hostId: 'h', coHostIds: ['a', 'b'], viewers }), 'b');
});

test('pickClaimant: openRemote → longest-present viewer; otherwise nobody', () => {
  const viewers = [
    { uid: 'x', joinedAtMs: 30, fresh: true },
    { uid: 'y', joinedAtMs: 10, fresh: true },
    { uid: 'h', joinedAtMs: 0, fresh: true },   // the absent host's stale doc never wins
  ];
  assert.equal(pickClaimant({ hostId: 'h', openRemote: true, viewers }), 'y');
  assert.equal(pickClaimant({ hostId: 'h', openRemote: false, viewers }), null);
});

test('isPartyDiscoverable: active + public + fresh heartbeat', () => {
  const now = 100_000;
  assert.equal(isPartyDiscoverable({ isActive: true, visibility: 'public', hostHeartbeatMs: now - 5_000 }, now), true);
  assert.equal(isPartyDiscoverable({ isActive: true, visibility: 'link', hostHeartbeatMs: now }, now), false);
  assert.equal(isPartyDiscoverable({ isActive: false, visibility: 'public', hostHeartbeatMs: now }, now), false);
  assert.equal(isPartyDiscoverable({ isActive: true, visibility: 'public', hostHeartbeatMs: now - 600_000 }, now), false);
});

test('countdownRemaining: ceil seconds against server time', () => {
  assert.equal(countdownRemaining(10_000, 7_100, 0), 3);
  assert.equal(countdownRemaining(10_000, 9_999, 0), 1);
  assert.equal(countdownRemaining(10_000, 10_000, 0), 0);
  assert.equal(countdownRemaining(10_000, 5_000, 2_500), 3);
  assert.equal(countdownRemaining(0, 5_000, 0), 0);
});

test('publicPartyContent: never carries a playable source', () => {
  const c = publicPartyContent({ type: 'VIDEO', id: 'v1', title: 'T', thumbnail: 'th.jpg', url: 'https://x/v.mp4', muxPlaybackId: 'abc' });
  assert.deepEqual(c, { type: 'VIDEO', id: 'v1', title: 'T', thumbnail: 'th.jpg' });
  assert.ok(!('url' in c) && !('muxPlaybackId' in c));
});

test('shouldResync: legacy threshold', () => {
  assert.equal(shouldResync(10, 11), false);
  assert.equal(shouldResync(10, 12), true);
});
