import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHashtag, extractHashtags, findHashtagSpans, activeHashtagQuery, canReply, extractMentionUids,
  buildQuoteSnapshot, resolveQuoteTarget, repostDocId, pushRevision, serializeDraft, parseDraft, isDraftMeaningful,
  validateSchedule, isDue, dueScheduled, rankTrending, computeStreak, recordActiveDay, streakCopy, dayKey,
  detectMilestones, buildWeeklyRecap, digestDue, classifyImpression, engagementRate, topReferrer, hourlySeries,
  stripUndefined, composerPostExtras, WEEK_MS,
} from '../services/postingLogic';

test('normalizeHashtag: case-fold, unicode, limits, validity', () => {
  assert.equal(normalizeHashtag('#Music'), 'music');
  assert.equal(normalizeHashtag('ＭＵＳＩＣ'), 'music'); // NFKC fullwidth
  assert.equal(normalizeHashtag('#café'), 'café');
  assert.equal(normalizeHashtag('#東京'), '東京');
  assert.equal(normalizeHashtag('#2024'), null);       // no letter
  assert.equal(normalizeHashtag('#'), null);
  assert.equal(normalizeHashtag('#a'.padEnd(80, 'b'))!.length, 50);
  assert.equal(normalizeHashtag('#he-llo!'), 'hello');
});

test('extractHashtags: dedupe, order, skips URLs/mentions/glued', () => {
  assert.deepEqual(extractHashtags('Love #Jazz and #jazz plus #Blues!'), ['jazz', 'blues']);
  assert.deepEqual(extractHashtags('see https://x.com/a#section and #real'), ['real']);
  assert.deepEqual(extractHashtags('hi @[Bob #1](uid#2) #ok'), ['ok']);
  assert.deepEqual(extractHashtags('C# is fine, a#b too, #1 no'), []);
  assert.deepEqual(extractHashtags('#a1 #b2'), ['a1', 'b2']);
  const many = Array.from({ length: 50 }, (_, i) => `#t${String.fromCharCode(97 + (i % 26))}${i}`).join(' ');
  assert.equal(extractHashtags(many).length, 30);
});

test('findHashtagSpans offsets', () => {
  const s = findHashtagSpans('go #Team now');
  assert.equal(s.length, 1);
  assert.equal(s[0].start, 3);
  assert.equal(s[0].raw, '#Team');
  assert.equal(s[0].tag, 'team');
});

test('activeHashtagQuery', () => {
  assert.deepEqual(activeHashtagQuery('hello #mus', 10), { query: 'mus', anchor: 6 });
  assert.equal(activeHashtagQuery('hello mus', 9), null);
  assert.deepEqual(activeHashtagQuery('#', 1), { query: '', anchor: 0 });
});

test('canReply', () => {
  const p = (a?: any) => ({ authorId: 'A', replyAudience: a });
  assert.equal(canReply(p(), 'B', false), true);
  assert.equal(canReply(p('everyone'), 'B', false), true);
  assert.equal(canReply(p('everyone'), null, false), false);
  assert.equal(canReply(p('none'), 'B', true, ['B']), false);
  assert.equal(canReply(p('none'), 'A', false), true);        // author
  assert.equal(canReply(p('following'), 'B', true), true);
  assert.equal(canReply(p('following'), 'B', false), false);
  assert.equal(canReply(p('mentioned'), 'B', true, ['B']), true);
  assert.equal(canReply(p('mentioned'), 'C', true, new Set(['B'])), false);
  assert.deepEqual(extractMentionUids('hi @[Bob](u1) and @[Al](u2) @[Bob](u1)'), ['u1', 'u2']);
});

test('quote snapshot / repost', () => {
  const snap = buildQuoteSnapshot({ id: 'p', authorId: 'a', authorName: 'Ann', text: 'x'.repeat(400), timestamp: 5, media: [{ type: 'PHOTO', url: 'u' }] });
  assert.equal(snap.text.length, 280);
  assert.equal(snap.mediaThumb, 'u');
  assert.equal(Object.values(snap).includes(undefined as any), false);
  const noMedia = buildQuoteSnapshot({ id: 'p', authorId: 'a', text: 'hi' });
  assert.equal('mediaThumb' in noMedia, false);
  const wrapper = { id: 'w', authorId: 'b', repostOf: 'orig', quotedPost: snap } as any;
  assert.equal(resolveQuoteTarget(wrapper).id, 'orig');
  assert.equal(repostDocId('u', 'p'), 'repost_u_p');
});

test('pushRevision caps at 5', () => {
  let h: any[] | undefined;
  for (let i = 0; i < 8; i++) h = pushRevision(h, `v${i}`, i);
  assert.equal(h!.length, 5);
  assert.equal(h![0].text, 'v3');
  assert.equal(h![4].text, 'v7');
});

test('draft serialisation drops blobs and files, round-trips', () => {
  const raw = serializeDraft({
    text: 'hello', theme: 'STANDARD', replyAudience: 'everyone', contentLabels: [],
    attachments: [
      { type: 'PHOTO', url: 'blob:abc', file: {} },
      { type: 'PHOTO', url: 'https://x/y.jpg', alt: 'a cat' },
    ],
  }, 'd1', 100);
  const d = parseDraft(raw)!;
  assert.equal(d.id, 'd1');
  assert.equal(d.attachments.length, 1);
  assert.equal(d.attachments[0].alt, 'a cat');
  assert.equal(d.replyAudience, undefined);
  assert.equal(parseDraft('not json'), null);
  assert.equal(parseDraft(null), null);
  assert.equal(isDraftMeaningful({ text: '  ', attachments: [{ type: 'PHOTO', url: 'blob:x' }] }), false);
  assert.equal(isDraftMeaningful({ text: 'a', attachments: [] }), true);
});

test('schedule due logic', () => {
  const now = 1_000_000;
  assert.equal(validateSchedule(now + 30_000, now).ok, false);
  assert.equal(validateSchedule(now + 120_000, now).ok, true);
  assert.equal(validateSchedule(now + 400 * 86400_000, now).ok, false);
  assert.equal(validateSchedule(NaN, now).ok, false);
  const l = [
    { id: 'a', authorId: 'u', publishAt: now - 10, status: 'PENDING' as const },
    { id: 'b', authorId: 'u', publishAt: now + 10, status: 'PENDING' as const },
    { id: 'c', authorId: 'u', publishAt: now - 50, status: 'PENDING' as const },
    { id: 'd', authorId: 'u', publishAt: now - 5, status: 'PUBLISHED' as const },
    { id: 'e', authorId: 'u', publishAt: now - 5, status: 'PENDING' as const, attempts: 3 },
  ];
  assert.deepEqual(dueScheduled(l, now).map(x => x.id), ['c', 'a']);
  assert.equal(isDue(l[0], now), true);
});

test('rankTrending: authors beat spam, window respected', () => {
  const now = 100 * 3600_000;
  const posts = [
    { authorId: '1', hashtags: ['spam'], timestamp: now - 1000 },
    { authorId: '1', hashtags: ['spam'], timestamp: now - 2000 },
    { authorId: '1', hashtags: ['spam'], timestamp: now - 3000 },
    { authorId: '2', hashtags: ['real'], timestamp: now - 1000 },
    { authorId: '3', hashtags: ['real'], timestamp: now - 2000 },
    { authorId: '4', hashtags: ['old'], timestamp: now - 30 * 3600_000 },
    { authorId: '5', hashtags: ['priv'], timestamp: now - 100, isPublic: false },
  ];
  const r = rankTrending(posts, now, 24);
  assert.deepEqual(r.map(x => x.tag), ['real', 'spam']);
  assert.equal(r[0].authors, 2);
});

test('streak math is gentle', () => {
  assert.deepEqual(computeStreak([], '2026-10-05'), { current: 0, best: 0, activeToday: false });
  assert.equal(computeStreak(['2026-10-03', '2026-10-04', '2026-10-05'], '2026-10-05').current, 3);
  // yesterday still counts: not broken until a full day is missed
  const y = computeStreak(['2026-10-03', '2026-10-04'], '2026-10-05');
  assert.equal(y.current, 2);
  assert.equal(y.activeToday, false);
  assert.equal(computeStreak(['2026-10-01', '2026-10-02'], '2026-10-05').current, 0);
  assert.equal(computeStreak(['2026-09-01', '2026-09-02', '2026-09-03', '2026-10-05'], '2026-10-05').best, 3);
  assert.equal(computeStreak(['2026-09-30', '2026-10-01'], '2026-10-01').current, 2); // month boundary
  assert.deepEqual(recordActiveDay(['2026-10-04'], '2026-10-05', 2), ['2026-10-04', '2026-10-05']);
  assert.equal(recordActiveDay(['2026-10-05'], '2026-10-05').length, 1);
  const copy = [0, 1, 3, 10, 40].map(n => streakCopy({ current: n, best: n, activeToday: true })).join(' ');
  assert.ok(!/miss|lost|break|lose/i.test(copy));
  assert.equal(dayKey(Date.UTC(2026, 9, 5, 23, 0), 0), '2026-10-05');
  assert.equal(dayKey(Date.UTC(2026, 9, 5, 23, 0), 300), '2026-10-05'); // UTC-5 evening
  assert.equal(dayKey(Date.UTC(2026, 9, 5, 2, 0), 300), '2026-10-04');
});

test('milestones fire once', () => {
  assert.deepEqual(detectMilestones({ postCount: 0, followerCount: 0, topPostLikes: 0 }, []), []);
  const a = detectMilestones({ postCount: 1, followerCount: 12, topPostLikes: 3 }, []);
  assert.deepEqual(a.map(m => m.id), ['FIRST_POST', 'FOLLOWERS_10']);
  const b = detectMilestones({ postCount: 5, followerCount: 120, topPostLikes: 11 }, ['FIRST_POST', 'FOLLOWERS_10']);
  assert.deepEqual(b.map(m => m.id), ['FOLLOWERS_100', 'POST_LIKES_10']);
  assert.equal(detectMilestones({ postCount: 1, followerCount: 1000, topPostLikes: 1000 }, []).length, 7);
});

test('weekly recap + digest guard', () => {
  const now = 100 * 86_400_000;
  const r = buildWeeklyRecap({
    now, viewerUid: 'me',
    followerTimestamps: [{ followerId: 'a', at: now - 1000 }, { followerId: 'b', at: now - 8 * 86_400_000 }],
    ownPosts: [
      { id: 'p1', authorId: 'me', text: 'one', timestamp: now - 1000, likesCount: 1, commentsCount: 0 },
      { id: 'p2', authorId: 'me', text: 'two', timestamp: now - 2000, likesCount: 4, commentsCount: 2 },
      { id: 'old', authorId: 'me', text: 'old', timestamp: now - 9 * 86_400_000, likesCount: 99 },
    ],
    recentPosts: [
      { id: 'f1', authorId: 'fr', text: 'hey', timestamp: now - 5000, likesCount: 5 },
      { id: 'f2', authorId: 'fr', text: 'hey2', timestamp: now - 6000, likesCount: 9 },
      { id: 'liked', authorId: 'fr2', text: 'x', timestamp: now - 5000, likedBy: ['me'] },
      { id: 'stranger', authorId: 'zz', text: 'x', timestamp: now - 5000, likesCount: 50 },
      { id: 'hid', authorId: 'blk', text: 'x', timestamp: now - 5000, likesCount: 50 },
    ],
    followingIds: new Set(['fr', 'fr2', 'blk']),
    hidden: new Set(['blk']),
  });
  assert.equal(r.newFollowerCount, 1);
  assert.equal(r.postCount, 2);
  assert.equal(r.topPost?.id, 'p2');
  assert.equal(r.repliesReceived, 2);
  assert.deepEqual(r.missed.map(m => m.postId), ['f2']);
  assert.equal(r.hasContent, true);
  assert.equal(buildWeeklyRecap({ now, viewerUid: 'me', followerTimestamps: [], ownPosts: [], recentPosts: [], followingIds: new Set() }).hasContent, false);
  assert.equal(digestDue(undefined, now), true);
  assert.equal(digestDue(now - WEEK_MS + 1, now), false);
  assert.equal(digestDue(now - WEEK_MS, now), true);
});

test('impression classification and stats helpers', () => {
  const d = { seenToday: new Set(['a']), seenEver: new Set(['a', 'b']) };
  assert.deepEqual(classifyImpression('a', d), { impression: false, unique: false });
  assert.deepEqual(classifyImpression('b', d), { impression: true, unique: false });
  assert.deepEqual(classifyImpression('c', d), { impression: true, unique: true });
  assert.equal(engagementRate({ impressions: 200 }, { likesCount: 10, commentsCount: 2, quoteCount: 0, repostCount: 0 }), 6);
  assert.equal(engagementRate(null, { likesCount: 3 }), 0);
  assert.deepEqual(topReferrer({ referrers: { FEED: 3, PROFILE: 9 } }), { name: 'PROFILE', count: 9 });
  assert.equal(topReferrer({}), null);
  assert.equal(hourlySeries({ hourly: { '3': 4 } })[3], 4);
  assert.equal(hourlySeries(undefined).length, 24);
});

test('stripUndefined + composerPostExtras never emit undefined', () => {
  const s = stripUndefined({ a: 1, b: undefined, c: [1, undefined, { d: undefined, e: 2 }] });
  assert.deepEqual(s, { a: 1, c: [1, { e: 2 }] });
  const e = composerPostExtras({ text: 'hi #Tag', replyAudience: 'everyone' });
  assert.deepEqual(e, { hashtags: ['tag'] });
  const q = composerPostExtras({ text: 'wow', replyAudience: 'none', quoteOf: { id: 'p', authorId: 'a', text: 'orig' } });
  assert.equal(q.quotedPostId, 'p');
  assert.equal(q.replyAudience, 'none');
  assert.equal(JSON.stringify(q).includes('undefined'), false);
});
