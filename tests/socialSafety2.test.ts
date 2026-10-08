import test from 'node:test';
import assert from 'node:assert/strict';
import { routePostCollection, readableAuthors, planMigrationBatches, shouldMovePost, parseMigrationMarker } from '../services/privatePostsCore';
import {
  planRequestFollow, declineCooldownRemaining, DECLINE_COOLDOWN_MS, planFollowRequestCounter, FR_MAX_PER_WINDOW, FR_WINDOW_MS, FR_MIN_GAP_MS, shouldReconcile,
} from '../services/socialSafetyCore';
import { triageReports, availableActions, removalPaths } from '../services/reportTriageCore';

test('routePostCollection', () => {
  assert.equal(routePostCollection({ isPrivate: true }), 'private_posts');
  assert.equal(routePostCollection({ isPrivate: false }), 'posts');
  assert.equal(routePostCollection(null), 'posts');
  assert.equal(routePostCollection({ isPrivate: true }, { orgAudience: 'DEPARTMENT' }), 'posts');
});

test('readableAuthors only returns followed authors/self, deduped and capped', () => {
  assert.deepEqual(readableAuthors(['a', 'b', 'a', 'me', 'c'], ['a', 'c'], 'me'), ['a', 'me', 'c']);
  assert.deepEqual(readableAuthors(['a', 'b'], [], 'me'), []);
  assert.equal(readableAuthors(['a', 'b', 'c'], ['a', 'b', 'c'], 'me', 2).length, 2);
});

test('migration helpers', () => {
  assert.deepEqual(planMigrationBatches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(shouldMovePost({ orgAudience: 'DEPARTMENT' }), false);
  assert.equal(shouldMovePost({}), true);
  assert.equal(parseMigrationMarker('toPrivate'), 'toPrivate');
  assert.equal(parseMigrationMarker('x'), null);
});

test('declined request: shown as pending inside cooldown, re-requestable after', () => {
  const now = 10_000_000_000;
  const fresh = { status: 'declined', resolvedAtMs: now - 1000 };
  assert.deepEqual(planRequestFollow(fresh, false, now), { action: 'none', shown: 'pending' });
  const old = { status: 'declined', resolvedAtMs: now - DECLINE_COOLDOWN_MS - 1 };
  assert.deepEqual(planRequestFollow(old, false, now), { action: 'recreate', reason: 'declined-cooldown-over' });
  assert.equal(declineCooldownRemaining(now - 1000, now), DECLINE_COOLDOWN_MS - 1000);
  assert.deepEqual(planRequestFollow(null, false, now), { action: 'create' });
  assert.deepEqual(planRequestFollow({ status: 'pending' }, false, now), { action: 'none', shown: 'pending' });
  assert.deepEqual(planRequestFollow({ status: 'approved' }, true, now), { action: 'none', shown: 'approved' });
  assert.deepEqual(planRequestFollow({ status: 'approved' }, false, now), { action: 'recreate', reason: 'stale-approved' });
});

test('follow-request counter mirrors the rules', () => {
  const now = 1_000_000_000;
  assert.deepEqual(planFollowRequestCounter(null, now), { ok: true, resetWindow: true, nextCount: 1 });
  assert.equal(planFollowRequestCounter({ frCount: 1, frWindowStartMs: now - 5000, lastFollowRequestAtMs: now - 500 }, now).ok, false); // gap
  assert.deepEqual(planFollowRequestCounter({ frCount: 3, frWindowStartMs: now - 60_000, lastFollowRequestAtMs: now - FR_MIN_GAP_MS }, now), { ok: true, resetWindow: false, nextCount: 4 });
  const capped = planFollowRequestCounter({ frCount: FR_MAX_PER_WINDOW, frWindowStartMs: now - 1000, lastFollowRequestAtMs: now - 10_000 }, now);
  assert.equal(capped.ok, false);
  assert.deepEqual(planFollowRequestCounter({ frCount: FR_MAX_PER_WINDOW, frWindowStartMs: now - FR_WINDOW_MS, lastFollowRequestAtMs: now - 10_000 }, now), { ok: true, resetWindow: true, nextCount: 1 });
});

test('shouldReconcile is daily', () => {
  const now = 5e12;
  assert.equal(shouldReconcile(null, now), true);
  assert.equal(shouldReconcile(now - 1000, now), false);
  assert.equal(shouldReconcile(now - 25 * 3600_000, now), true);
  assert.equal(shouldReconcile(now + 5000, now), true);
});

test('triageReports groups by target and ranks by severity', () => {
  const now = 1e12;
  const mk = (id: string, contentId: string, reason: string, reporterId: string, ageH = 1) => ({ id, contentId, contentType: 'post', reason, reporterId, authorId: 'au', createdAtMs: now - ageH * 3600_000 });
  const g = triageReports([mk('1', 'p1', 'spam', 'r1'), mk('2', 'p1', 'spam', 'r2'), mk('3', 'p2', 'sexual_minor_safety', 'r3'), mk('4', 'p3', 'other', 'r4', 70)], now);
  assert.equal(g.length, 3);
  assert.equal(g[0].contentId, 'p2');
  assert.equal(g.find(x => x.contentId === 'p1')!.reports.length, 2);
  assert.deepEqual(removalPaths({ contentType: 'comment', contentId: 'c', parentId: 'p' }), ['posts/p/comments/c', 'private_posts/p/comments/c']);
  assert.deepEqual(removalPaths({ contentType: 'profile', contentId: 'u' }), []);
  assert.ok(!availableActions({ contentType: 'profile', contentId: 'u' }).includes('remove_content'));
});
