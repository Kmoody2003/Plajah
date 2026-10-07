// Tests for the track-advance guard.
//
// The bug class: several independent signals (ended event, stall watchdog, Media Session, native
// remote command, failure handlers) each advanced the queue on their own, so two of them firing for
// the same moment skipped TWO tracks, and a dead network could skip a track every few seconds.
// These tests pin the rules that make advancing idempotent and make failure skips bounded.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdvanceGuard } from '../services/playbackAdvanceGuard';

const clock = () => { let t = 1_000_000; return { now: () => t, tick: (ms: number) => { t += ms; } }; };

test('an automatic signal advances a track instance exactly once', () => {
  const g = createAdvanceGuard();
  g.begin();
  assert.equal(g.claim('ended').ok, true);
  const dup = g.claim('stall-watchdog');
  assert.equal(dup.ok, false);
  assert.equal(dup.why, 'duplicate');
  assert.equal(g.claim('ended').ok, false, 'the same signal firing twice is also a duplicate');
});

test('ended + stall watchdog + ended-fallback racing for one track yield one advance', () => {
  const g = createAdvanceGuard();
  g.begin();
  const results = (['stall-watchdog', 'ended', 'ended-fallback'] as const).map(r => g.claim(r).ok);
  assert.deepEqual(results, [true, false, false]);
});

test('a new track instance re-arms automatic advancing', () => {
  const g = createAdvanceGuard();
  g.begin();
  assert.equal(g.claim('ended').ok, true);
  g.begin();
  assert.equal(g.claim('ended').ok, true);
});

test('a signal armed for an older instance is stale and cannot advance the new track', () => {
  const g = createAdvanceGuard();
  const armed = g.begin();          // watchdog armed while track A plays
  g.begin();                        // user (or ended) moved on to track B
  const r = g.claim('stall-watchdog', armed);
  assert.equal(r.ok, false);
  assert.equal(r.why, 'stale');
});

test('a signal armed for the current instance is accepted', () => {
  const g = createAdvanceGuard();
  const armed = g.begin();
  assert.equal(g.claim('stall-watchdog', armed).ok, true);
});

test('external commands are de-duplicated inside the window and allowed after it', () => {
  const c = clock();
  const g = createAdvanceGuard({ now: c.now, externalDedupeMs: 700 });
  g.begin();
  assert.equal(g.claim('remote-command').ok, true);
  g.begin();                                  // the advance started the next track
  c.tick(200);
  const dup = g.claim('media-session');       // same press reported by a second layer
  assert.equal(dup.ok, false);
  assert.equal(dup.why, 'external-duplicate');
  c.tick(600);                                // a deliberate second press, 800ms after the first
  assert.equal(g.claim('remote-command').ok, true);
});

test('an external command right after an automatic advance is treated as a duplicate', () => {
  const c = clock();
  const g = createAdvanceGuard({ now: c.now });
  g.begin();
  assert.equal(g.claim('ended').ok, true);
  g.begin();
  c.tick(100);
  assert.equal(g.claim('media-session').ok, false);
});

test('an in-app tap is never blocked, even twice in a row', () => {
  const c = clock();
  const g = createAdvanceGuard({ now: c.now });
  g.begin();
  assert.equal(g.claim('user').ok, true);
  assert.equal(g.claim('user').ok, true);
});

test('a failure skip is allowed once, then the chain limit stops a run through the queue', () => {
  const g = createAdvanceGuard();
  g.begin();
  assert.equal(g.claim('start-failed').ok, true, 'first failure may skip ONE track');
  g.begin();
  const second = g.claim('start-failed');
  assert.equal(second.ok, false);
  assert.equal(second.why, 'failure-chain-limit');
  g.begin();
  assert.equal(g.claim('stream-failed').ok, false, 'still refused — never loops through the queue');
  assert.equal(g.failureChain(), 1);
});

test('a track that really plays clears the failure chain', () => {
  const g = createAdvanceGuard();
  g.begin();
  assert.equal(g.claim('start-failed').ok, true);
  g.begin();
  g.markHealthy();
  g.begin();
  assert.equal(g.claim('stream-failed').ok, true);
});

test('a natural end or a user skip also clears the failure chain', () => {
  const g = createAdvanceGuard();
  g.begin();
  g.claim('start-failed');
  g.begin();
  assert.equal(g.claim('ended').ok, true);   // the skipped-to track played through to its end
  g.begin();
  assert.equal(g.claim('start-failed').ok, true);

  const h = createAdvanceGuard();
  h.begin();
  h.claim('start-failed');
  h.begin();
  h.claim('user');
  h.begin();
  assert.equal(h.claim('start-failed').ok, true);
});

test('failure signals share the one-advance-per-instance rule with natural ones', () => {
  const g = createAdvanceGuard({ maxFailureChain: 5 });
  g.begin();
  assert.equal(g.claim('ended').ok, true);
  assert.equal(g.claim('start-failed').ok, false, 'already advanced past this track');
});

test('maxFailureChain is configurable', () => {
  const g = createAdvanceGuard({ maxFailureChain: 2 });
  g.begin(); assert.equal(g.claim('start-failed').ok, true);
  g.begin(); assert.equal(g.claim('start-failed').ok, true);
  g.begin(); assert.equal(g.claim('start-failed').ok, false);
});
