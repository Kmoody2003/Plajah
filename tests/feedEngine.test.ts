import test from 'node:test';
import assert from 'node:assert/strict';
import { rankForYou, rankTrending, isColdStart, type RankableItem, type ForYouViewerContext } from '../services/forYouRanker';
import {
  defaultFeedPreferences, applyFeedPreferences, showLessLikeThis, showMoreLikeThis, muteTopic, unmuteTopic, toggleContentType,
  preferenceMultiplier, resetFeedPreferences, sanitizeFeedPreferences, postTopics, primaryContentType, decayedWeight, PREF_HALF_LIFE_MS,
} from '../services/feedPreferencesCore';
import {
  interleaveCards, filterCards, liveFeedToCard, albumToCard, videoToCard, clubPostToCard, eventToCard, historyMomentCard,
  type FeedCardItem, type FeedCardKind,
} from '../services/feedCardsCore';
import { kWayMerge, drainMerged, filterFeedItems, diffHead, prependNew, dedupeById, chunk, type StreamState } from '../services/feedPaginationCore';

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);
const H = 3_600_000;

let seq = 0;
const mk = (o: Partial<RankableItem> & { ageH?: number; mediaType?: string } = {}): RankableItem => {
  const { ageH = 1, mediaType, ...rest } = o;
  seq++;
  return {
    id: rest.id ?? `p${seq}`, authorId: rest.authorId ?? `u${seq}`, text: rest.text ?? `post ${seq}`,
    timestamp: NOW - ageH * H, likesCount: 0, commentsCount: 0,
    ...(mediaType ? { media: [{ type: mediaType }] } : {}),
    ...rest,
  };
};
const ctx = (o: Partial<ForYouViewerContext> = {}): ForYouViewerContext => ({ viewerId: 'me', followedAuthorIds: new Set(['f1', 'f2', 'f3']), ...o });
const maxRun = <T,>(xs: T[], key: (x: T) => string) => {
  let best = 0, run = 0, prev = '';
  for (const x of xs) { const k = key(x); run = k === prev ? run + 1 : 1; prev = k; best = Math.max(best, run); }
  return best;
};

// ─── preferences ──────────────────────────────────────────────────────────────

test('applyFeedPreferences: muted topics (hashtags + tags), content types, own posts exempt', () => {
  let p = defaultFeedPreferences();
  p = muteTopic(p, '#Spoilers'); p = toggleContentType(p, 'VIDEO');
  const items = [
    mk({ id: 'a', authorId: 'x', text: 'no spoilers here #spoilers' }),
    mk({ id: 'b', authorId: 'x', tags: ['SPOILERS'] }),
    mk({ id: 'c', authorId: 'x', mediaType: 'VIDEO' }),
    mk({ id: 'd', authorId: 'x', mediaType: 'PHOTO' }),
    mk({ id: 'e', authorId: 'me', text: '#spoilers mine', mediaType: 'VIDEO' }),
  ];
  assert.deepEqual(applyFeedPreferences(items, p, { viewerId: 'me', now: NOW }).map(i => i.id), ['d', 'e']);
  assert.deepEqual(applyFeedPreferences(items, unmuteTopic(p, 'spoilers'), { viewerId: 'me', now: NOW }).map(i => i.id), ['a', 'b', 'd', 'e']);
  assert.equal(applyFeedPreferences(items, null).length, 5);
});

test('show less: soft weight lowers multiplier, repeats hard-hide the author, decays, reset clears', () => {
  const post = mk({ authorId: 'spam', text: 'hi #crypto', mediaType: 'PHOTO' });
  let p = defaultFeedPreferences();
  assert.equal(preferenceMultiplier(post, p, NOW), 1);
  p = showLessLikeThis(p, post, NOW);
  const once = preferenceMultiplier(post, p, NOW);
  assert.ok(once < 0.75 && once > 0.15, `once=${once}`);
  assert.equal(applyFeedPreferences([post], p, { now: NOW }).length, 1);           // one tap = soft only
  p = showLessLikeThis(showLessLikeThis(p, post, NOW), post, NOW);
  assert.equal(applyFeedPreferences([post], p, { now: NOW }).length, 0);           // 3 taps = hidden author
  // decays by half after one half-life
  assert.ok(Math.abs(decayedWeight(p.weights.authors.spam, NOW + PREF_HALF_LIFE_MS)) < Math.abs(decayedWeight(p.weights.authors.spam, NOW)) * 0.55);
  assert.equal(applyFeedPreferences([post], p, { now: NOW + 8 * PREF_HALF_LIFE_MS }).length, 1);   // long after: visible again
  // show more raises
  const more = showMoreLikeThis(defaultFeedPreferences(), post, NOW);
  assert.ok(preferenceMultiplier(post, more, NOW) > 1);
  assert.deepEqual(resetFeedPreferences(NOW).weights, { authors: {}, topics: {}, types: {} });
});

test('prefs sanitize + extraction helpers', () => {
  const s = sanitizeFeedPreferences({ mutedTopics: ['#A.b', 3], mutedContentTypes: ['VIDEO', 'NOPE'], weights: { authors: { u: { w: 5, at: 1 }, bad: { w: 'x' } } }, defaultTab: 'FOLLOWING' });
  assert.deepEqual(s.mutedTopics, ['ab']);
  assert.deepEqual(s.mutedContentTypes, ['VIDEO']);
  assert.equal(s.weights.authors.u.w, 1);
  assert.ok(!('bad' in s.weights.authors));
  assert.equal(s.defaultTab, 'FOLLOWING');
  assert.equal(sanitizeFeedPreferences(null).defaultTab, 'FOR_YOU');
  assert.deepEqual(postTopics({ text: 'Hello #Lo-Fi #beats', tags: ['LoFi'] }).sort(), ['beats', 'lo-fi', 'lofi']);
  assert.equal(primaryContentType({ poll: {} }), 'POLL');
  assert.equal(primaryContentType({ media: [{ type: 'STICKER' }] }), 'GIF');
});

// ─── forYouRanker ─────────────────────────────────────────────────────────────

test('rankForYou: followed + recent + engaged outranks stranger + old', () => {
  const items = [
    mk({ id: 'old-stranger', authorId: 's1', ageH: 40, likesCount: 3 }),
    mk({ id: 'fresh-follow', authorId: 'f1', ageH: 1, likesCount: 5, commentsCount: 2 }),
  ];
  const r = rankForYou(items, ctx(), NOW);
  assert.equal(r[0].item.id, 'fresh-follow');
  assert.equal(r[0].why, 'From someone you follow');
  assert.equal(r[0].reason, 'FOLLOWING');
});

test('rankForYou: diversity — never more than 2 consecutive posts by one author', () => {
  const items: RankableItem[] = [];
  for (let i = 0; i < 12; i++) items.push(mk({ authorId: 'f1', ageH: 0.5 + i * 0.1, likesCount: 20, commentsCount: 5 }));   // prolific, top-scored
  for (let i = 0; i < 12; i++) items.push(mk({ authorId: i % 2 ? 'f2' : 'f3', ageH: 2 + i, likesCount: 2 }));
  const out = rankForYou(items, ctx(), NOW);
  assert.equal(out.length, 24);
  // the first 16 slots have enough other authors to satisfy the constraint entirely
  assert.ok(maxRun(out.slice(0, 16), r => r.item.authorId) <= 2, out.slice(0, 16).map(r => r.item.authorId).join(','));
  assert.equal(new Set(out.map(r => r.item.id)).size, 24);                          // nothing dropped / duplicated
});

test('rankForYou: diversity — media types are mixed (max 3 in a row when alternatives exist)', () => {
  const items: RankableItem[] = [];
  for (let i = 0; i < 12; i++) items.push(mk({ authorId: `f${(i % 3) + 1}`, ageH: 0.2 + i * 0.05, likesCount: 30, mediaType: 'VIDEO' }));
  for (let i = 0; i < 8; i++) items.push(mk({ authorId: `f${(i % 3) + 1}`, ageH: 3 + i, likesCount: 1, mediaType: 'PHOTO' }));
  const out = rankForYou(items, ctx(), NOW);
  const types = out.map(r => primaryContentType(r.item));
  assert.ok(maxRun(types.slice(0, 14), t => t) <= 3, types.join(','));
});

test('rankForYou: ~15% exploration slots go to good non-followed posts, never the first slot', () => {
  const items: RankableItem[] = [];
  for (let i = 0; i < 40; i++) items.push(mk({ authorId: `f${(i % 3) + 1}`, ageH: 0.3 + i * 0.4, likesCount: 8 }));          // followed, strong
  for (let i = 0; i < 10; i++) items.push(mk({ authorId: `s${i}`, ageH: 20 + i, likesCount: 6, commentsCount: 2 }));          // strangers, good but older
  const out = rankForYou(items, ctx(), NOW);
  const exploration = out.map((r, i) => [r, i] as const).filter(([r]) => r.exploration);
  assert.ok(exploration.length >= 5, `exploration=${exploration.length}`);
  assert.ok(exploration.every(([, i]) => i > 0));
  assert.ok(exploration.every(([r]) => !ctx().followedAuthorIds.has(r.item.authorId)));
  // within the first 20 positions: floor(20*0.15) = 3 slots
  assert.equal(exploration.filter(([, i]) => i < 20).length, 3);
  assert.ok(exploration.every(([r]) => r.why.length > 0));
});

test('rankForYou: cold start (follows nobody) → trending + newest quality, no exploration slots', () => {
  const c = ctx({ followedAuthorIds: new Set() });
  assert.equal(isColdStart(c), true);
  const items = [
    mk({ id: 'viral', authorId: 's1', ageH: 3, likesCount: 80, commentsCount: 20 }),
    mk({ id: 'fresh', authorId: 's2', ageH: 0.2, likesCount: 1 }),
    mk({ id: 'stale-nothing', authorId: 's3', ageH: 60, likesCount: 0 }),
  ];
  const out = rankForYou(items, c, NOW);
  assert.equal(out[0].item.id, 'viral');
  assert.equal(out[0].why, 'Trending');
  assert.equal(out[out.length - 1].item.id, 'stale-nothing');
  assert.ok(out.every(r => !r.exploration));
  assert.ok(out.every(r => r.reason !== 'FOLLOWING'));
});

test('rankForYou: explanations (club, interest), hidden uids, prefs, dedupe, determinism', () => {
  const items = [
    mk({ id: 'club', authorId: 'm1', ageH: 2, likesCount: 9 }),
    mk({ id: 'int', authorId: 's9', ageH: 2, likesCount: 4, text: 'new #lofi beats' }),
    mk({ id: 'blocked', authorId: 'b1', ageH: 0.1, likesCount: 99 }),
    mk({ id: 'dup', authorId: 'f1', ageH: 5, text: 'exactly the same long cross posted text', likesCount: 1 }),
    mk({ id: 'dup2', authorId: 'f1', ageH: 6, text: 'exactly the same long cross posted text', likesCount: 9 }),
    mk({ id: 'muted', authorId: 's5', ageH: 1, likesCount: 9, text: '#nope' }),
  ];
  const c = ctx({
    sharedClubAuthorIds: new Set(['m1']), clubNameByAuthor: { m1: 'Lo-fi Beats' }, interests: ['lofi'],
    hiddenUids: new Set(['b1']), prefs: muteTopic(defaultFeedPreferences(), 'nope'),
  });
  const out = rankForYou([...items, items[0]], c, NOW);
  const by = Object.fromEntries(out.map(r => [r.item.id, r]));
  assert.equal(by.club.why, 'Popular in Lo-fi Beats');
  assert.equal(by.int.why, 'Popular in Lofi');
  assert.ok(!by.blocked && !by.muted);
  assert.equal(out.filter(r => r.item.id.startsWith('dup')).length, 1);
  assert.equal(by.dup2?.item.id, 'dup2');                                           // the better copy wins
  assert.deepEqual(rankForYou(items, c, NOW).map(r => r.item.id), rankForYou(items, c, NOW).map(r => r.item.id));
  assert.deepEqual(rankForYou([], c, NOW), []);
});

test('rankForYou: unavoidable same-author run is emitted, not dropped', () => {
  const out = rankForYou([1, 2, 3, 4].map(i => mk({ authorId: 'f1', ageH: i })), ctx(), NOW);
  assert.equal(out.length, 4);
});

test('rankTrending: velocity beats raw volume, 24h window, hidden + min engagement', () => {
  const items = [
    mk({ id: 'hot-new', authorId: 'a', ageH: 1, likesCount: 20, commentsCount: 5 }),
    mk({ id: 'big-old', authorId: 'b', ageH: 22, likesCount: 60, commentsCount: 6 }),
    mk({ id: 'outside', authorId: 'c', ageH: 30, likesCount: 500 }),
    mk({ id: 'quiet', authorId: 'd', ageH: 1, likesCount: 1 }),
    mk({ id: 'hidden', authorId: 'h', ageH: 1, likesCount: 100 }),
  ];
  const out = rankTrending(items, NOW, { hiddenUids: new Set(['h']) });
  assert.deepEqual(out.map(i => i.id), ['hot-new', 'big-old']);
});

// ─── cards ────────────────────────────────────────────────────────────────────

const card = (kind: FeedCardKind, id: string, score = 0.5): FeedCardItem =>
  ({ kind, id, timestamp: NOW, score, data: {} as any }) as FeedCardItem;
const posts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `post${i}` }));

test('interleaveCards: never first, never adjacent, ~every 6-8 posts, kinds rotate, no repeats', () => {
  const cards = [
    card('LIVE_NOW', 'l1', 1), card('LIVE_NOW', 'l2', 0.95), card('NEW_RELEASE', 'r1', 0.9), card('NEW_RELEASE', 'r2', 0.85),
    card('NEW_VIDEO', 'v1', 0.8), card('CLUB_HIGHLIGHT', 'c1', 0.7), card('LIVE_NOW', 'l1', 1),   // duplicate id dropped
  ];
  const out = interleaveCards(posts(60), cards);
  assert.equal(out[0].type, 'post');
  const idx = out.map((e, i) => (e.type === 'card' ? i : -1)).filter(i => i >= 0);
  assert.equal(idx.length, 6);                                                               // 6 unique cards
  for (const i of idx) { assert.notEqual(out[i - 1].type, 'card'); assert.notEqual(out[i + 1]?.type, 'card'); }
  const postsBetween = idx.slice(1).map((v, k) => v - idx[k] - 1);
  assert.ok(postsBetween.every(g => g >= 6 && g <= 8), postsBetween.join(','));
  assert.ok(idx[0] - 0 >= 4);
  const kinds = idx.map(i => (out[i] as any).card.kind);
  for (let k = 1; k < kinds.length; k++) assert.notEqual(kinds[k], kinds[k - 1], kinds.join(','));
  assert.equal(new Set(out.map(e => e.key)).size, out.length);                               // unique React keys
  assert.equal(out.filter(e => e.type === 'post').length, 60);                               // every post preserved, in order
  assert.deepEqual(out.filter(e => e.type === 'post').map(e => (e as any).post.id), posts(60).map(p => p.id));
});

test('interleaveCards: few posts / no cards / maxCards / modules do not collide with cards', () => {
  assert.equal(interleaveCards(posts(3), [card('LIVE_NOW', 'x')]).filter(e => e.type === 'card').length, 0);
  assert.equal(interleaveCards(posts(10), []).length, 10);
  assert.equal(interleaveCards(posts(80), Array.from({ length: 9 }, (_, i) => card('NEW_VIDEO', `v${i}`)), { maxCards: 2 }).filter(e => e.type === 'card').length, 2);

  const out = interleaveCards(posts(60),
    [card('LIVE_NOW', 'a'), card('NEW_RELEASE', 'b'), card('NEW_VIDEO', 'c'), card('EVENT_SOON', 'd')],
    { modules: [{ id: 'people', firstAfter: 5, every: 12 }, { id: 'clubs', firstAfter: 10, every: 20, max: 2 }] });
  const inserts = out.map((e, i) => (e.type !== 'post' ? i : -1)).filter(i => i >= 0);
  assert.ok(inserts.length >= 6);
  for (let k = 1; k < inserts.length; k++) assert.ok(inserts[k] - inserts[k - 1] >= 3, `adjacent inserts at ${inserts[k - 1]},${inserts[k]}`);
  assert.notEqual(out[0].type, 'module');
  assert.equal(out.filter(e => e.type === 'module' && (e as any).module.id === 'people').length >= 2, true);
  assert.equal(out.filter(e => e.type === 'module' && (e as any).module.id === 'clubs').length <= 2, true);
  assert.equal(new Set(out.map(e => e.key)).size, out.length);
});

test('filterCards: hidden uids, muted kinds, dedupe', () => {
  const a = { ...card('LIVE_NOW', '1'), authorId: 'bad' } as FeedCardItem;
  const out = filterCards([a, card('NEW_VIDEO', '2'), card('NEW_VIDEO', '2'), card('EVENT_SOON', '3')], { hiddenUids: new Set(['bad']), mutedKinds: ['EVENT_SOON'] });
  assert.deepEqual(out.map(c => c.id), ['2']);
});

test('card builders: liveness, scoping, windows', () => {
  const f = new Set(['f1']); const c = new Set(['club1']);
  const base = { id: 'x', ownerId: 'f1', title: 'T', status: 'LIVE', lastActiveAt: NOW - 30_000, url: 'u', streamId: 's' };
  assert.equal(liveFeedToCard(base, NOW, { followingIds: f, clubIds: c, viewerId: 'me' })?.kind, 'LIVE_NOW');
  assert.equal(liveFeedToCard({ ...base, lastActiveAt: NOW - 10 * 60_000 }, NOW, { followingIds: f, clubIds: c }), null);   // stale heartbeat = not live
  assert.equal(liveFeedToCard({ ...base, status: 'ENDED' }, NOW, { followingIds: f, clubIds: c }), null);
  assert.equal(liveFeedToCard({ ...base, ownerId: 'stranger' }, NOW, { followingIds: f, clubIds: c }), null);
  assert.equal(liveFeedToCard({ ...base, ownerId: 'stranger', clubId: 'club1', isPublic: false }, NOW, { followingIds: f, clubIds: c })?.kind, 'LIVE_NOW');
  assert.equal(liveFeedToCard({ ...base, ownerId: 'me' }, NOW, { followingIds: new Set(['me']), clubIds: c, viewerId: 'me' }), null);

  const album = { id: 'a', ownerId: 'f1', title: 'LP', coverImage: 'c', tracks: [1, 2], createdAt: NOW - 2 * 24 * H, type: 'MUSIC' };
  assert.equal(albumToCard(album, NOW)?.kind, 'NEW_RELEASE');
  assert.equal(albumToCard({ ...album, isDraft: true }, NOW), null);
  assert.equal(albumToCard({ ...album, type: 'BOOK' }, NOW), null);
  assert.equal(albumToCard({ ...album, createdAt: NOW - 60 * 24 * H }, NOW), null);
  assert.equal(albumToCard({ ...album, releaseDate: NOW + 5 * H }, NOW), null);          // scheduled, not out yet

  assert.equal(videoToCard({ id: 'v', ownerId: 'f1', title: 'V', timestamp: NOW - H }, NOW)?.kind, 'NEW_VIDEO');
  assert.equal(videoToCard({ id: 'v', ownerId: 'f1', title: 'V', timestamp: NOW - H, isPrivate: true }, NOW), null);

  const cp = { id: 'p', clubId: 'club1', authorId: 'm', content: 'hello club', likes: ['a', 'b'], commentCount: 3, timestamp: NOW - H };
  assert.equal(clubPostToCard(cp, 'Club', NOW, 'me')?.kind, 'CLUB_HIGHLIGHT');
  assert.equal(clubPostToCard({ ...cp, authorId: 'me' }, 'Club', NOW, 'me'), null);
  assert.equal(clubPostToCard({ ...cp, timestamp: NOW - 10 * 24 * H }, 'Club', NOW), null);

  const ev = { id: 'e', ownerId: 'f1', title: 'Show', status: 'UPCOMING', startTime: NOW + 24 * H, price: 5 };
  assert.equal(eventToCard(ev, NOW)?.kind, 'EVENT_SOON');
  assert.equal(eventToCard({ ...ev, startTime: NOW - H }, NOW), null);
  assert.equal(eventToCard({ ...ev, startTime: NOW + 30 * 24 * H }, NOW), null);
  assert.equal(historyMomentCard('me', NOW).kind, 'HISTORY_MOMENT');
});

// ─── pagination core ──────────────────────────────────────────────────────────

const t = (id: string, h: number) => ({ id, timestamp: NOW - h * H });

test('kWayMerge: ordered, deduped, capped', () => {
  const a = [t('a1', 1), t('a2', 4), t('a3', 9)];
  const b = [t('b1', 2), t('b2', 3), t('a2', 4)];
  const c = [t('c1', 0.5)];
  assert.deepEqual(kWayMerge([a, b, c]).map(x => x.id), ['c1', 'a1', 'b1', 'b2', 'a2', 'a3']);
  assert.deepEqual(kWayMerge([a, b, c], 3).map(x => x.id), ['c1', 'a1', 'b1']);
  assert.deepEqual(kWayMerge([[], []]), []);
});

test('drainMerged: only emits while every live stream has a frontier; resumes after fetch', () => {
  const A: StreamState<ReturnType<typeof t>> = { buffer: [t('a1', 1), t('a2', 5)], exhausted: false };
  const B: StreamState<ReturnType<typeof t>> = { buffer: [t('b1', 2), t('b2', 3)], exhausted: true };
  const seen = new Set<string>();
  let r = drainMerged([A, B], 10, seen);
  // a1, b1, b2 are safe; after b2 stream B is exhausted (fine) but A still has a2 (5h) → can emit a2 too, then A is dry.
  assert.deepEqual(r.out.map(x => x.id), ['a1', 'b1', 'b2', 'a2']);
  assert.deepEqual(r.needFetch, [0]);
  // A fetches an item newer than nothing — but older than a2; then drain continues
  A.buffer.push(t('a3', 6)); A.exhausted = true;
  r = drainMerged([A, B], 10, seen);
  assert.deepEqual(r.out.map(x => x.id), ['a3']);
  assert.deepEqual(r.needFetch, []);

  // a dry live stream blocks emission even when others have items (its next could be newer)
  const X: StreamState<ReturnType<typeof t>> = { buffer: [], exhausted: false };
  const Y: StreamState<ReturnType<typeof t>> = { buffer: [t('y1', 1)], exhausted: false };
  const r2 = drainMerged([X, Y], 5, new Set());
  assert.deepEqual(r2.out, []);
  assert.deepEqual(r2.needFetch, [0]);

  // page size honoured, seen ids skipped
  const P: StreamState<ReturnType<typeof t>> = { buffer: [t('p1', 1), t('p2', 2), t('p3', 3)], exhausted: true };
  assert.deepEqual(drainMerged([P], 2, new Set(['p1'])).out.map(x => x.id), ['p2', 'p3']);
});

test('filterFeedItems: private, hidden, expired Today, no timestamp', () => {
  const items = [
    { ...t('pub', 1), authorId: 'a', isPublic: true },
    { ...t('priv', 1), authorId: 'a', isPublic: false },
    { ...t('mine', 1), authorId: 'me', isPublic: false },
    { ...t('hid', 1), authorId: 'blocked' },
    { ...t('exp', 1), authorId: 'a', isToday: true, expiresAt: NOW - 1 },
    { ...t('live-today', 1), authorId: 'a', isToday: true, expiresAt: NOW + H },
    { id: 'nots', timestamp: 0, authorId: 'a' },
  ];
  assert.deepEqual(filterFeedItems(items, { viewerId: 'me', hiddenUids: new Set(['blocked']), now: NOW }).map(i => i.id), ['pub', 'mine', 'live-today']);
});

test('diffHead / prependNew / dedupeById / chunk', () => {
  const known = new Set(['k1', 'k2']);
  const d = diffHead([
    { type: 'added', item: t('n1', 0.1) }, { type: 'added', item: t('n2', 0.05) },
    { type: 'modified', item: t('k1', 3) }, { type: 'removed', item: t('k2', 4) },
  ], known);
  assert.deepEqual(d.fresh.map(x => x.id), ['n2', 'n1']);          // newest first
  assert.deepEqual(d.updated.map(x => x.id), ['k1']);
  assert.deepEqual(d.removed, ['k2']);
  assert.deepEqual(prependNew([t('k1', 3)], [t('n1', 0.1), t('k1', 3), t('n2', 0.05)]).map(x => x.id), ['n2', 'n1', 'k1']);
  assert.deepEqual(dedupeById([{ id: 'a' }, { id: 'b' }, { id: 'a' }]).map(x => x.id), ['a', 'b']);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(chunk(Array.from({ length: 25 }, (_, i) => i), 10).length, 3);       // 25 followed authors → 3 `in` queries, no 9-cap
});

// ─── CARDS2: debate / achievement / sports cards, author priority, public-achievement core ───

import { debateToCard, achievementToCard, pickAchievementCards, sportsGameToCard, prioritizeAuthors } from '../services/feedCardsCore';
import { isShareableAchievement, sharingEnabled, buildPublicAchievementDoc, planBackfill, publicAchievementId } from '../services/publicAchievementsCore';
import { scoreText } from '../src/lib/scoreText';

test('debateToCard: only open ACTIVE debates the viewer is not in; followed participants outrank; hidden participant filtered', () => {
  const d = { id: 'd1', topic: 'Is X fair?', status: 'ACTIVE', challengerId: 'a', defenderId: 'b', endsAt: NOW + 5 * H, postCount: 4, challengerSupporters: ['s1'], defenderSupporters: ['s2', 's3'] };
  const c = debateToCard(d, NOW, { followingIds: new Set(['a']), viewerId: 'me' })!;
  assert.equal(c.kind, 'DEBATE');
  assert.equal((c.data as any).supporterCount, 3);
  assert.equal((c.data as any).involvesFollowed, true);
  const other = debateToCard(d, NOW, { followingIds: new Set(), viewerId: 'me' })!;
  assert.ok(c.score > other.score);
  assert.equal(debateToCard({ ...d, status: 'JUDGED' }, NOW), null);
  assert.equal(debateToCard({ ...d, status: 'PENDING' }, NOW), null);
  assert.equal(debateToCard({ ...d, endsAt: NOW - 1 }, NOW), null);
  assert.equal(debateToCard(d, NOW, { viewerId: 'a' }), null);                       // own debate lives in Pulse
  assert.equal(debateToCard({ ...d, topic: '' }, NOW), null);
  // authorId is only the challenger — the DEFENDER being blocked must also hide it
  assert.equal(filterCards([c], { hiddenUids: new Set(['b']) }).length, 0);
  assert.equal(filterCards([c], { hiddenUids: new Set(['zzz']) }).length, 1);
});

test('achievementToCard + pickAchievementCards: recent only, no self, one per person, firestore Timestamp tolerated', () => {
  const a = { id: 'u1_x', userId: 'u1', achievementId: 'x', title: 'On Air', description: 'Went live', pointsValue: 100, earnedAt: NOW - 2 * H };
  const c = achievementToCard(a, NOW, { name: 'Ana', photo: 'p' }, 'me')!;
  assert.equal(c.kind, 'ACHIEVEMENT');
  assert.equal((c.data as any).userName, 'Ana');
  assert.equal(achievementToCard(a, NOW, undefined, 'u1'), null);                   // not about myself
  assert.equal(achievementToCard({ ...a, earnedAt: NOW - 30 * 24 * H }, NOW), null);
  assert.equal(achievementToCard({ ...a, earnedAt: NOW + 3_600_000 }, NOW), null);    // future-dated = bogus
  assert.equal(achievementToCard({ ...a, earnedAt: { toMillis: () => NOW - H } }, NOW)?.kind, 'ACHIEVEMENT');
  assert.equal(achievementToCard({ ...a, title: '' }, NOW), null);
  const two = [c, achievementToCard({ ...a, id: 'u1_y', achievementId: 'y', earnedAt: NOW - 20 * H }, NOW)!, achievementToCard({ ...a, id: 'u2_x', userId: 'u2' }, NOW)!];
  const picked = pickAchievementCards(two, 3);
  assert.equal(picked.length, 2);
  assert.deepEqual(new Set(picked.map(p => p.authorId)), new Set(['u1', 'u2']));
});

const espn = (over: any = {}, state = 'in', scoreA: any = '3', scoreB: any = '1') => ({
  id: 'g1', league: 'NBA',
  event: {
    id: 'g1', date: new Date(NOW - 1 * H).toISOString(),
    competitions: [{ status: { type: { state, shortDetail: state === 'in' ? 'Q3 4:12' : 'Final' } }, competitors: [
      { homeAway: 'home', score: scoreA, winner: state === 'post' ? Number(scoreText(scoreA)) > Number(scoreText(scoreB)) : undefined, team: { id: '1', abbreviation: 'LAL', displayName: 'Los Angeles Lakers', logo: 'l.png' } },
      { homeAway: 'away', score: scoreB, team: { id: '2', abbreviation: 'BOS', displayName: 'Boston Celtics' } },
    ] }],
    ...over,
  },
});

test('sportsGameToCard: live / final, object scores coerced to text, outcome, upcoming+postponed+stale skipped', () => {
  const fav = { name: 'Los Angeles Lakers', league: 'NBA', espnId: '1' };
  const live = sportsGameToCard(espn(), fav, NOW)!;
  assert.equal(live.kind, 'SPORTS_MOMENT');
  assert.equal((live.data as any).state, 'in');
  assert.equal((live.data as any).home.score, '3');
  // schedule endpoints return score as an OBJECT — must never reach the UI as an object
  const obj = sportsGameToCard(espn({}, 'post', { value: 101, displayValue: '101' }, { value: 99, displayValue: '99' }), fav, NOW)!;
  assert.equal((obj.data as any).home.score, '101');
  assert.equal(typeof (obj.data as any).away.score, 'string');
  assert.equal((obj.data as any).outcome, 'W');
  const loss = sportsGameToCard(espn({}, 'post', '90', '100'), fav, NOW)!;
  assert.equal((loss.data as any).outcome, 'L');
  assert.ok(live.score > obj.score);                                                   // live outranks a final
  assert.equal(sportsGameToCard(espn({}, 'pre'), fav, NOW), null);
  assert.equal(sportsGameToCard(espn(), { name: 'Miami Heat', league: 'NBA', espnId: '9' }, NOW), null);
  assert.equal(sportsGameToCard(espn(), { ...fav, league: 'NFL' }, NOW), null);
  assert.equal(sportsGameToCard(espn({ date: new Date(NOW - 40 * H).toISOString() }, 'post'), fav, NOW), null);   // old final
  const postponed = espn(); postponed.event.competitions[0].status.type.shortDetail = 'Postponed';
  assert.equal(sportsGameToCard(postponed, fav, NOW), null);
  assert.equal(sportsGameToCard({ id: 'x', league: 'NBA', event: {} }, fav, NOW), null);   // malformed → no card, no throw
});

test('prioritizeAuthors: most recent follows first, then given order, viewer/dupes dropped, capped', () => {
  assert.deepEqual(prioritizeAuthors(['n3', 'n2'], ['o1', 'n2', 'me', 'o2', 'n3'], 'me', 4), ['n3', 'n2', 'o1', 'o2']);
  assert.deepEqual(prioritizeAuthors([], ['a', '', 'b'], undefined, 10), ['a', 'b']);
  assert.equal(prioritizeAuthors([], Array.from({ length: 100 }, (_, i) => `u${i}`), undefined, 40).length, 40);
});

test('publicAchievementsCore: KITH never shared, sharing default-on unless off/private, doc has no undefined, backfill plan', () => {
  assert.equal(isShareableAchievement({ id: 'a', title: 'T', triggerType: 'KITH_SIGHTING_10' }), false);
  assert.equal(isShareableAchievement({ id: 'a', title: 'T', triggerType: 'FIRST_UPLOAD' }), true);
  assert.equal(isShareableAchievement({ id: 'a' }), false);
  assert.equal(sharingEnabled({}), true);
  assert.equal(sharingEnabled({ shareAchievements: false }), false);
  assert.equal(sharingEnabled({ isPrivate: true }), false);
  assert.equal(sharingEnabled(null), false);
  const doc = buildPublicAchievementDoc('u', { id: 'a', title: 'T', pointsValue: 5 }, 123);
  assert.ok(Object.values(doc).every(v => v !== undefined));
  assert.equal(publicAchievementId('u', 'a'), 'u_a');
  const catalog = new Map([['a', { id: 'a', title: 'A' }], ['k', { id: 'k', title: 'K', triggerType: 'KITH_SIGHTING_FIRST' }]]);
  const plan = planBackfill([{ achievementId: 'a', unlockedAt: 5 }, { achievementId: 'k', unlockedAt: 9 }, { achievementId: 'z', unlockedAt: 8 }, { achievementId: 'a2', unlockedAt: undefined }], catalog, new Set(['a2']));
  assert.deepEqual(plan.map(p => p.achievement.id), ['a']);                          // kith + unknown + not-unlocked dropped
  assert.equal(planBackfill([{ achievementId: 'a', unlockedAt: 5 }], catalog, new Set(['a'])).length, 0);   // already published → idempotent
});
