import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeMessagePages, slideMessageWindow, activeTypers, shouldSendTyping, groupNotifications, actorPhrase,
  blueskyKey, mastodonKey, mastodonAddress, isInviteCode, makeInviteCode, canRedeemInvite, INVITE_REDEEM_WINDOW_MS,
  parseSharePath, buildShareCard,
} from '../services/socialPerfCore';
import { sharedSubscription, sharedSubscriptionCount } from '../services/sharedSubscription';

// ── message paging ──
test('mergeMessagePages dedupes by id (live wins) and sorts ascending', () => {
  const older = [{ id: 'a', timestamp: 1 }, { id: 'b', timestamp: 2, v: 'old' }];
  const live = [{ id: 'b', timestamp: 2, v: 'new' }, { id: 'c', timestamp: 3 }];
  const m = mergeMessagePages<any>(older, live);
  assert.deepEqual(m.map(x => x.id), ['a', 'b', 'c']);
  assert.equal(m[1].v, 'new');
});

test('slideMessageWindow keeps messages that slid out of a full window, drops deletions inside it', () => {
  const prev = [{ id: 'a', timestamp: 1 }, { id: 'b', timestamp: 2 }, { id: 'c', timestamp: 3 }];
  // window of 2 slid forward: b,c → c,d ; a and b are older than the window and must stay
  assert.deepEqual(slideMessageWindow(prev, [{ id: 'c', timestamp: 3 }, { id: 'd', timestamp: 4 }], true).map(x => x.id), ['a', 'b', 'c', 'd']);
  // c deleted inside the window (window now b,d) → c disappears, a stays
  assert.deepEqual(slideMessageWindow(prev, [{ id: 'b', timestamp: 2 }, { id: 'd', timestamp: 4 }], true).map(x => x.id), ['a', 'b', 'd']);
  // not full = whole history → live is the truth
  assert.deepEqual(slideMessageWindow(prev, [{ id: 'c', timestamp: 3 }], false).map(x => x.id), ['c']);
});

// ── typing ──
test('activeTypers honours TTL and excludes self', () => {
  const now = 100_000;
  assert.deepEqual(activeTypers({ me: now, a: now - 1000, b: now - 10_000, c: 'x' as any }, now, 'me').sort(), ['a']);
  assert.deepEqual(activeTypers(undefined, now, 'me'), []);
});

test('shouldSendTyping: ≤1 "typing" per 3s, "stopped" only after "typing"', () => {
  assert.equal(shouldSendTyping(undefined, true, 0), true);
  assert.equal(shouldSendTyping({ lastSentAt: 0, lastValue: true }, true, 1000), false);
  assert.equal(shouldSendTyping({ lastSentAt: 0, lastValue: true }, true, 3000), true);
  assert.equal(shouldSendTyping({ lastSentAt: 0, lastValue: true }, false, 10), true);
  assert.equal(shouldSendTyping({ lastSentAt: 0, lastValue: false }, false, 10), false);
  assert.equal(shouldSendTyping(undefined, false, 10), false);
  assert.equal(shouldSendTyping({ lastSentAt: 5, lastValue: false }, true, 6), true);
});

// ── notification grouping ──
const n = (id: string, type: string, extra: any = {}) => ({ id, type, senderId: `s${id}`, senderName: `User${id}`, title: 't', message: 'm', timestamp: 1000, isRead: false, ...extra });

test('groupNotifications collapses likes on the same post into "X and N others liked your post"', () => {
  const list = [
    ...Array.from({ length: 10 }, (_, i) => n(String(i), 'LIKE', { targetId: 'p1', timestamp: 10_000 - i })),
    n('x', 'LIKE', { targetId: 'p2', timestamp: 5 }),
    n('m', 'MESSAGE', { targetId: 'p1', timestamp: 20_000 }),
  ];
  const g = groupNotifications(list);
  assert.equal(g.length, 3);
  assert.equal(g[0].lead.type, 'MESSAGE');
  assert.equal(g[1].title, 'User0 and 9 others liked your post');
  assert.equal(g[1].count, 10);
  assert.equal(g[1].items.length, 10);
  assert.equal(g[2].count, 1);
  assert.equal(g[2].title, 't'); // single keeps its own title
});

test('groupNotifications: same sender counted once, follows group together, window splits, read state', () => {
  const g = groupNotifications([
    n('1', 'FOLLOW', { timestamp: 100, isRead: true }),
    n('2', 'FOLLOW', { timestamp: 90, isRead: true }),
    n('3', 'COMMENT', { targetId: 'p', senderId: 'same', senderName: 'Ana', timestamp: 80 }),
    n('4', 'COMMENT', { targetId: 'p', senderId: 'same', senderName: 'Ana', timestamp: 70, isRead: true }),
    n('5', 'LIKE', { targetId: 'q', timestamp: 3 * 24 * 3600_000 }),
    n('6', 'LIKE', { targetId: 'q', timestamp: 1 }), // > 48h older → its own group
  ]);
  const follows = g.find(x => x.lead.type === 'FOLLOW')!;
  assert.equal(follows.title, 'User1 and User2 started following you');
  assert.equal(follows.isRead, true);
  const comments = g.find(x => x.lead.type === 'COMMENT')!;
  assert.equal(comments.count, 1);
  assert.equal(comments.items.length, 2);
  assert.equal(comments.isRead, false);
  assert.equal(g.filter(x => x.lead.type === 'LIKE').length, 2);
  assert.equal(new Set(g.map(x => x.key)).size, g.length); // stable unique keys for React
});

test('actorPhrase', () => {
  assert.equal(actorPhrase([]), 'Someone');
  assert.equal(actorPhrase(['A']), 'A');
  assert.equal(actorPhrase(['A', 'B']), 'A and B');
  assert.equal(actorPhrase(['A', 'B', 'C']), 'A and 2 others');
});

// ── fediverse keys ──
test('fediverse handle keys', () => {
  assert.equal(blueskyKey('did:plc:abc123'), 'bluesky_did:plc:abc123');
  assert.equal(blueskyKey('alice.bsky.social'), null);
  assert.equal(mastodonAddress('@Kenne', 'https://mastodon.social'), 'kenne@mastodon.social');
  assert.equal(mastodonAddress('bob@Fosstodon.org', 'mastodon.social'), 'bob@fosstodon.org');
  assert.equal(mastodonKey('bob@fosstodon.org', 'x.y'), 'mastodon_bob@fosstodon.org');
  // the same person seen from two different home instances maps to ONE key
  assert.equal(mastodonKey('bob', 'fosstodon.org'), mastodonKey('bob@fosstodon.org', 'mastodon.social'));
  assert.equal(mastodonKey('', 'x.org'), null);
  assert.equal(mastodonKey('bad/name', 'x.org'), null);
});

// ── invites ──
test('invite codes + redemption rules', () => {
  let i = 0;
  const code = makeInviteCode(() => (i++ % 10) / 10);
  assert.equal(isInviteCode(code), true);
  assert.equal(isInviteCode('ABCDEFGH'), false);
  assert.equal(isInviteCode('abc'), false);
  const now = 10 * INVITE_REDEEM_WINDOW_MS;
  assert.deepEqual(canRedeemInvite({ inviterUid: 'a', redeemerUid: 'b', accountCreatedAt: now - 1000, now }), { ok: true });
  assert.equal((canRedeemInvite({ inviterUid: 'a', redeemerUid: 'a', accountCreatedAt: now, now }) as any).reason, 'own_code');
  assert.equal((canRedeemInvite({ inviterUid: null, redeemerUid: 'b', accountCreatedAt: now, now }) as any).reason, 'unknown_code');
  assert.equal((canRedeemInvite({ inviterUid: 'a', redeemerUid: 'b', accountCreatedAt: now - INVITE_REDEEM_WINDOW_MS - 1, now }) as any).reason, 'not_new');
  assert.equal((canRedeemInvite({ inviterUid: 'a', redeemerUid: 'b', accountCreatedAt: null, now }) as any).reason, 'not_new');
});

// ── share paths + cards ──
test('parseSharePath maps path-style links to existing boot params', () => {
  assert.deepEqual(parseSharePath('/c/club123'), { kind: 'club', id: 'club123', query: 'club=club123' });
  assert.equal(parseSharePath('/live/abc')!.query, 'livestream=abc');
  assert.equal(parseSharePath('/join/abcdefgh/')!.kind, 'join');
  assert.equal(parseSharePath('/c/'), null);
  assert.equal(parseSharePath('/c/a/b'), null);
  assert.equal(parseSharePath('/clubs/x'), null);
});

test('buildShareCard copy', () => {
  const fb = 'https://plajah.com/og-default.png';
  const club = buildShareCard('club', { name: 'Synth Nerds', count: 1200, description: 'Patches & gear' }, fb);
  assert.equal(club.title, 'Synth Nerds on Plajah');
  assert.match(club.description, /1,200 members · Patches & gear/);
  assert.equal(club.image, fb);
  const talk = buildShareCard('talk', { name: 'Late night', host: 'Ana', live: true, count: 1, image: 'x.jpg' }, fb);
  assert.equal(talk.title, '🔴 LIVE · Late night');
  assert.match(talk.description, /Ana is talking · 1 listener/);
  assert.equal(talk.image, 'x.jpg');
  assert.equal(buildShareCard('join', { host: 'Ana' }, fb).title, 'Ana invited you to Plajah');
  assert.match(buildShareCard('party', { host: 'Ben', contentTitle: 'Alien', live: false }, fb).description, /ended/);
});

// ── shared subscription ──
test('sharedSubscription: one upstream per key, replay to late subscribers, teardown on last unsubscribe', () => {
  let starts = 0, stops = 0;
  let emit: (v: number) => void = () => {};
  const start = (e: (v: number) => void) => { starts++; emit = e; return () => { stops++; }; };
  const a: number[] = [], b: number[] = [];
  const ua = sharedSubscription('k', start, v => a.push(v));
  emit(1);
  const ub = sharedSubscription('k', start, v => b.push(v));
  assert.equal(starts, 1);
  assert.deepEqual(b, [1]); // replayed
  emit(2);
  assert.deepEqual(a, [1, 2]); assert.deepEqual(b, [1, 2]);
  ua(); ua(); // idempotent
  assert.equal(stops, 0);
  ub();
  assert.equal(stops, 1);
  assert.equal(sharedSubscriptionCount(), 0);
  sharedSubscription('k', start, () => {})();
  assert.equal(starts, 2);
});
