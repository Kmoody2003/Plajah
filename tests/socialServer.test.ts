import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkUnlockable, userAchievementDocId, buildUserAchievementDoc, planPublicAchievement, rateAllow,
  computeDebateAward, POINTS_DEBATE_WIN, POINTS_DEBATE_DRAW,
  isClaimable, selectDue, claimFields, failureFields, scheduledPostId, planScheduledPost,
  MAX_PUBLISH_ATTEMPTS, STALE_CLAIM_MS, type ScheduledRow, type DebateLike,
} from '../services/socialServerCore';

// ── achievements ──
test('checkUnlockable: catalog required, KITH_* refused (by id and triggerType), inactive hidden', () => {
  const cat = { title: 'First Song', triggerType: 'FIRST_SONG', isActive: true };
  assert.deepEqual(checkUnlockable('abc123', cat), { ok: true });
  assert.equal((checkUnlockable('', cat) as any).status, 400);
  assert.equal((checkUnlockable('a/b', cat) as any).status, 400);
  assert.equal((checkUnlockable(5, cat) as any).status, 400);
  assert.equal((checkUnlockable('abc123', null) as any).status, 404);
  assert.equal((checkUnlockable('abc123', { ...cat, isActive: false }) as any).status, 404);
  assert.equal((checkUnlockable('KITH_SIGHTING_10', cat) as any).status, 403);
  assert.equal((checkUnlockable('xyz', { ...cat, triggerType: 'KITH_SIGHTING_50' }) as any).status, 403);
});

test('achievement doc ids / shapes', () => {
  assert.equal(userAchievementDocId('u1', 'a9'), 'u1_a9');
  assert.deepEqual(buildUserAchievementDoc('u1', 'a9', 5), { userId: 'u1', achievementId: 'a9', unlockedAt: 5, isNew: true, timestamp: 5 });
});

test('planPublicAchievement: honours shareAchievements / private / default-on / titleless', () => {
  const cat = { title: 'Trophy', description: 'd', icon: 'Trophy', pointsValue: 10, triggerType: 'FIRST_SIGN_IN' };
  const p = planPublicAchievement('u1', 'a9', cat, {}, 99);
  assert.equal(p?.id, 'u1_a9');
  assert.equal(p?.data.userId, 'u1');
  assert.equal(p?.data.earnedAt, 99);
  assert.equal(planPublicAchievement('u1', 'a9', cat, { shareAchievements: false }, 1), null);
  assert.equal(planPublicAchievement('u1', 'a9', cat, { isPrivate: true }, 1), null);
  assert.equal(planPublicAchievement('u1', 'a9', cat, null, 1), null);
  assert.equal(planPublicAchievement('u1', 'a9', { description: 'x' }, {}, 1), null);
});

test('rateAllow: fixed window', () => {
  const m = new Map();
  assert.equal(rateAllow(m, 'k', 2, 1000, 0), true);
  assert.equal(rateAllow(m, 'k', 2, 1000, 1), true);
  assert.equal(rateAllow(m, 'k', 2, 1000, 2), false);
  assert.equal(rateAllow(m, 'k', 2, 1000, 1001), true);
  assert.equal(rateAllow(m, 'other', 2, 1000, 2), true);
});

// ── debates ──
const judged = (over: Partial<DebateLike> = {}): DebateLike => ({
  status: 'JUDGED', endsAt: 1000, challengerId: 'c', defenderId: 'd',
  challengerSupporters: ['x', 'y'], defenderSupporters: ['z'], disqualified: [], verdict: { winner: 'CHALLENGER' }, ...over,
});

test('computeDebateAward: winner by votes; recomputed, not trusted from verdict', () => {
  const a = computeDebateAward(judged({ verdict: { winner: 'DEFENDER' } }), 2000);
  assert.ok(a.ok);
  if (a.ok) { assert.equal(a.winner, 'CHALLENGER'); assert.deepEqual(a.awards, [{ uid: 'c', points: POINTS_DEBATE_WIN }]); }
  const d = computeDebateAward(judged({ challengerSupporters: [], defenderSupporters: ['q'] }), 2000);
  assert.ok(d.ok && d.winner === 'DEFENDER');
});

test('computeDebateAward: disqualification overrides votes; double DQ pays nobody; vote draw pays both', () => {
  const dq = computeDebateAward(judged({ disqualified: [{ uid: 'c' }] }), 2000);
  assert.ok(dq.ok && dq.winner === 'DEFENDER' && dq.awards[0].uid === 'd');
  const both = computeDebateAward(judged({ disqualified: [{ uid: 'c' }, { uid: 'd' }] }), 2000);
  assert.ok(both.ok && both.winner === 'DRAW' && both.awards.length === 0);
  const draw = computeDebateAward(judged({ challengerSupporters: ['a'], defenderSupporters: ['b'], verdict: { winner: 'DRAW' } }), 2000);
  assert.ok(draw.ok);
  if (draw.ok) assert.deepEqual(draw.awards, [{ uid: 'c', points: POINTS_DEBATE_DRAW }, { uid: 'd', points: POINTS_DEBATE_DRAW }]);
});

test('computeDebateAward: refusals', () => {
  assert.equal((computeDebateAward(null, 2000) as any).status, 404);
  assert.equal((computeDebateAward(judged({ status: 'ENDED' }), 2000) as any).status, 409);
  assert.equal((computeDebateAward(judged({ verdict: null }), 2000) as any).status, 409);
  assert.equal((computeDebateAward(judged({ verdict: { winner: 'BOGUS' } }), 2000) as any).status, 409);
  assert.equal((computeDebateAward(judged(), 999) as any).status, 409);                    // not ended yet
  assert.equal((computeDebateAward(judged({ pointsAwarded: true }), 2000) as any).status, 409);
  assert.equal((computeDebateAward(judged({ defenderId: 'c' }), 2000) as any).status, 409); // same participant
});

// ── scheduled posts ──
const row = (o: Partial<ScheduledRow> = {}): ScheduledRow => ({ id: 's1', authorId: 'u1', publishAt: 100, status: 'PENDING', attempts: 0, post: { text: 'hi' }, ...o });

test('isClaimable / selectDue: due PENDING, stale PUBLISHING, attempts cap, order, batch limit', () => {
  assert.equal(isClaimable(row(), 100), true);
  assert.equal(isClaimable(row(), 99), false);
  assert.equal(isClaimable(row({ status: 'PUBLISHED' }), 200), false);
  assert.equal(isClaimable(row({ status: 'CANCELLED' }), 200), false);
  assert.equal(isClaimable(row({ status: 'FAILED' }), 200), false);
  assert.equal(isClaimable(row({ attempts: MAX_PUBLISH_ATTEMPTS }), 200), false);
  assert.equal(isClaimable(row({ status: 'PUBLISHING', claimedAt: 150 }), 150 + STALE_CLAIM_MS), false);      // fresh claim
  assert.equal(isClaimable(row({ status: 'PUBLISHING', claimedAt: 150 }), 150 + STALE_CLAIM_MS + 1), true);   // crashed
  assert.equal(isClaimable(row({ publishAt: undefined }), 200), false);

  const rows = [row({ id: 'c', publishAt: 30 }), row({ id: 'a', publishAt: 10 }), row({ id: 'b', publishAt: 20 }), row({ id: 'z', publishAt: 999 })];
  assert.deepEqual(selectDue(rows, 100).map(r => r.id), ['a', 'b', 'c']);
  assert.deepEqual(selectDue(rows, 100, 2).map(r => r.id), ['a', 'b']);
});

test('claimFields / failureFields: attempts bump, retry until exhausted, error truncated', () => {
  assert.deepEqual(claimFields(row({ attempts: 1 }), 500), { status: 'PUBLISHING', claimedAt: 500, attempts: 2 });
  assert.equal(failureFields(1, 'boom').status, 'PENDING');
  assert.equal(failureFields(MAX_PUBLISH_ATTEMPTS, 'boom').status, 'FAILED');
  assert.equal(failureFields(1, 'x'.repeat(1000)).lastError.length, 300);
});

test('scheduledPostId is deterministic', () => {
  assert.equal(scheduledPostId('abc'), 'sched_abc');
  assert.equal(scheduledPostId('abc'), scheduledPostId('abc'));
});

test('planScheduledPost: public author → posts + feed mirror, forged fields stripped, nullish dropped', () => {
  const r = planScheduledPost(row({ post: {
    text: 'hello #x', authorId: 'attacker', likesCount: 9999, likedBy: ['a'], timestamp: 1, id: 'evil', isPublic: false,
    media: [{ type: 'PICTURE', url: 'https://cdn.x/y.png', title: 't', junk: 1 }], hashtags: ['x'], targetUserId: null,
  } }), { displayName: 'Ann', photoURL: 'https://p/a.png' }, 777);
  assert.ok(r.ok);
  if (!r.ok) return;
  const { plan } = r;
  assert.equal(plan.collection, 'posts');
  assert.equal(plan.id, 'sched_s1');
  assert.equal(plan.data.authorId, 'u1');
  assert.equal(plan.data.authorName, 'Ann');
  assert.equal(plan.data.likesCount, 0);
  assert.equal(plan.data.likedBy, undefined);
  assert.equal(plan.data.id, undefined);
  assert.equal(plan.data.timestamp, 777);
  assert.equal(plan.data.isPublic, true);
  assert.equal('targetUserId' in plan.data, false);
  assert.ok(plan.feed);
  assert.equal(plan.feed!.id, 'sched_s1');
  assert.equal(plan.feed!.data.type, 'PICTURE');
  assert.equal(plan.feed!.data.originalPostId, 'sched_s1');
  assert.equal(plan.feed!.data.imageUrl, 'https://cdn.x/y.png');
  assert.deepEqual(Object.keys((plan.feed!.data.media as any[])[0]).sort(), ['title', 'type', 'url']);
});

test('planScheduledPost: private author → private_posts, no feed mirror; DEPARTMENT stays in posts, private, no mirror', () => {
  const priv = planScheduledPost(row(), { isPrivate: true, displayName: 'P' }, 1);
  assert.ok(priv.ok && priv.plan.collection === 'private_posts' && priv.plan.feed === null);
  const dept = planScheduledPost(row({ post: { text: 'dept', orgAudience: 'DEPARTMENT' } }), { isPrivate: true }, 1);
  assert.ok(dept.ok);
  if (dept.ok) { assert.equal(dept.plan.collection, 'posts'); assert.equal(dept.plan.data.isPublic, false); assert.equal(dept.plan.feed, null); }
});

test('planScheduledPost: rejects empty, missing payload/author, local media; edu role derived', () => {
  assert.equal(planScheduledPost(row({ post: { text: '   ' } }), null, 1).ok, false);
  assert.equal(planScheduledPost(row({ post: undefined }), null, 1).ok, false);
  assert.equal(planScheduledPost(row({ authorId: undefined }), null, 1).ok, false);
  assert.equal(planScheduledPost(row({ post: { text: 'x', media: [{ type: 'PICTURE', url: 'blob:abc' }] } }), null, 1).ok, false);
  assert.equal(planScheduledPost(row({ post: { text: 'x', media: [{ type: 'VIDEO', url: '', muxPlaybackId: 'm1' }] } }), null, 1).ok, true);
  const t = planScheduledPost(row(), { accountType: 'TEACHER' }, 1);
  assert.ok(t.ok && t.plan.data.eduRole === 'TEACHER' && t.plan.data.isEduPost === true);
});
