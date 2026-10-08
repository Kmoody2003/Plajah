import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHidden, computeHidden, blockDocId, reportDocId, canViewerSeePost } from '../services/socialSafetyCore';
import { checkRate, limitFor, tryConsume, formatRetry, ESTABLISHED_LIMITS, NEW_ACCOUNT_LIMITS, NEW_ACCOUNT_AGE_MS } from '../services/socialRateLimit';
import { assessPostSpam, extractLinks } from '../services/socialSpamHeuristic';

test('filterHidden drops hidden authors, keeps uid-less items, accepts Set or array', () => {
  const items = [{ a: 'u1' }, { a: 'u2' }, { a: undefined }, { a: 'u3' }];
  assert.deepEqual(filterHidden(items, i => i.a, new Set(['u2'])).map(i => i.a), ['u1', undefined, 'u3']);
  assert.deepEqual(filterHidden(items, i => i.a, ['u1', 'u3']).map(i => i.a), ['u2', undefined]);
  assert.equal(filterHidden(items, i => i.a, new Set()).length, 4);
});

test('computeHidden unions blocked, blockedBy, muted', () => {
  const h = computeHidden(['a'], ['b'], ['a', 'c']);
  assert.deepEqual([...h].sort(), ['a', 'b', 'c']);
});

test('doc ids', () => {
  assert.equal(blockDocId('x', 'y'), 'x_y');
  assert.equal(reportDocId('u', 'post', 'a/b c'), 'u_post_a-b-c');
});

test('canViewerSeePost', () => {
  const follows = (u: string) => u === 'friend';
  assert.equal(canViewerSeePost({ authorId: 'p' }, null, follows), true);
  assert.equal(canViewerSeePost({ authorId: 'p', authorIsPrivate: true }, null, follows), false);
  assert.equal(canViewerSeePost({ authorId: 'p', authorIsPrivate: true }, 'p', follows), true);
  assert.equal(canViewerSeePost({ authorId: 'friend', authorIsPrivate: true }, 'me', follows), true);
  assert.equal(canViewerSeePost({ authorId: 'stranger', authorIsPrivate: true }, 'me', follows), false);
});

test('checkRate: window and cooldown', () => {
  const rule = { max: 3, windowMs: 1000, cooldownMs: 100 };
  assert.equal(checkRate([], rule, 5000).ok, true);
  const c = checkRate([4950], rule, 5000);
  assert.equal(c.ok, false);
  assert.equal(c.reason, 'cooldown');
  assert.equal(c.retryAfterMs, 50);
  const w = checkRate([4200, 4400, 4800], rule, 5000);
  assert.equal(w.ok, false);
  assert.equal(w.reason, 'window');
  assert.equal(w.retryAfterMs, 200); // oldest (4200) ages out at 5200
  assert.equal(checkRate([3000, 3500, 4000], rule, 5000).ok, true); // 3000 aged out
  assert.equal(checkRate([4200, 4400], rule, 5000).remaining, 1);
});

test('new accounts get tighter limits', () => {
  assert.deepEqual(limitFor('post', 1000), NEW_ACCOUNT_LIMITS.post);
  assert.deepEqual(limitFor('post', NEW_ACCOUNT_AGE_MS + 1), ESTABLISHED_LIMITS.post);
  assert.ok(NEW_ACCOUNT_LIMITS.follow.max < ESTABLISHED_LIMITS.follow.max);
  assert.deepEqual(limitFor('post', NaN), NEW_ACCOUNT_LIMITS.post);
});

test('tryConsume records and throttles (new account follows/hour)', () => {
  const mem: Record<string, string> = {};
  const store = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
  const created = 5_000;
  let now = 10_000;
  let ok = 0;
  for (let i = 0; i < 40; i++) {
    now += 3000; // beyond the 2s cooldown
    if (tryConsume('u', 'follow', created, now, store).ok) ok++;
  }
  assert.equal(ok, NEW_ACCOUNT_LIMITS.follow.max);
  const blocked = tryConsume('u', 'follow', created, now + 3000, store);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'window');
  // unknown creation date -> established limits
  assert.equal(tryConsume('v', 'follow', null, 1, store).ok, true);
  assert.equal(formatRetry(500), 'a moment');
  assert.equal(formatRetry(12_000), '12s');
  assert.equal(formatRetry(5 * 60_000), '5 min');
});

test('spam heuristic', () => {
  assert.equal(assessPostSpam('hello world, nice day').warn, false);
  assert.deepEqual(extractLinks('see https://a.com/x and www.b.com ok'), ['https://a.com/x', 'www.b.com']);
  const dup = assessPostSpam('Buy my thing now!!', ['buy my thing now']);
  assert.equal(dup.block, true);
  assert.ok(dup.reasons.includes('duplicate'));
  const links = assessPostSpam('a https://a.com b https://b.com c https://c.com d https://d.com');
  assert.ok(links.reasons.includes('too_many_links'));
  assert.equal(links.block, false);
  assert.equal(assessPostSpam('x https://a.com y https://b.com', [], { newAccount: true }).block, true);
  const rep = assessPostSpam('https://a.com/ and https://a.com');
  assert.ok(rep.reasons.includes('repeated_link'));
  assert.equal(assessPostSpam('aaaaaaaaaaaaaaaaaaaa').block, true);
  assert.equal(assessPostSpam('@a1 @b2 @c3 @d4 hi', [], { newAccount: true }).reasons.includes('too_many_mentions'), true);
  // link-only dup
  assert.equal(assessPostSpam('https://a.com', ['https://a.com/']).block, true);
});
