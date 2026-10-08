import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankSuggestions, scoreCandidate, isEligibleCandidate, regionMatch, hash01, pickMode,
  type DiscoveryProfile, type DiscoveryContext,
} from '../services/discoveryScoring';
import { chunkArray, mergeByTimestamp, uniqueIds } from '../services/followGraphUtils';

const NOW = Date.UTC(2026, 9, 5);
const DAY = 86_400_000;
const P = (uid: string, o: Partial<DiscoveryProfile> = {}): DiscoveryProfile => ({ uid, displayName: uid, photoURL: '', followerCount: 0, ...o });
const ctx = (o: Partial<DiscoveryContext> = {}): DiscoveryContext => ({
  viewer: P('me'), followingIds: new Set(), hiddenUids: new Set(), now: NOW, seed: 'me:2026-10-05', ...o,
});

test('hard exclusions: self, followed, hidden, dismissed, child, employee, opted-out, private', () => {
  const c = ctx({ followingIds: new Set(['f']), hiddenUids: new Set(['h']), dismissedUids: new Set(['d']) });
  assert.equal(isEligibleCandidate(P('ok'), c), true);
  for (const bad of [
    P('me'), P('f'), P('h'), P('d'),
    P('kid', { isChild: true }), P('kid2', { accountType: 'CHILD' }),
    P('emp', { isEmployee: true }), P('emp2', { accountType: 'EMPLOYEE' }),
    P('opt', { hideFromSuggestions: true }), P('priv', { isPrivate: true }),
  ]) assert.equal(isEligibleCandidate(bad, c), false, bad.uid);
});

test('shared club outranks popularity and gives a human reason', () => {
  const c = ctx({ sharedClubs: new Map([['a', ['Lo-fi Beats']]]) });
  const a = scoreCandidate(P('a'), c, 'existing')!;
  const b = scoreCandidate(P('b', { followerCount: 50_000, publicInterests: [] }), c, 'new-user')!;
  assert.equal(a.reason, 'Also in Lo-fi Beats club');
  assert.ok(a.score > b.score);
});

test('mutual follows + interests + type reasons', () => {
  const viewer = P('me', { publicInterests: ['Jazz', 'Chess'], isArtist: true });
  const c = ctx({ viewer, mutualCounts: new Map([['m', 3]]) });
  assert.equal(scoreCandidate(P('m'), c, 'existing')!.reason, '3 mutual follows');
  assert.equal(scoreCandidate(P('j', { publicInterests: ['jazz'] }), c, 'existing')!.reason, 'Likes jazz');
  assert.equal(scoreCandidate(P('t', { isArtist: true }), c, 'existing')!.reason, 'Fellow artist');
});

test('existing mode drops candidates with no real signal; new-user falls back to popularity', () => {
  const c = ctx();
  assert.equal(scoreCandidate(P('x', { followerCount: 500 }), c, 'existing'), null);
  assert.ok(scoreCandidate(P('x', { followerCount: 500 }), c, 'new-user'));
});

test('freshness: < 14 days gets a bonus + "Joined N days ago"', () => {
  const c = ctx();
  const fresh = scoreCandidate(P('n', { createdAt: NOW - 2 * DAY }), c, 'new-user')!;
  const old = scoreCandidate(P('o', { createdAt: NOW - 60 * DAY, followerCount: 3 }), c, 'new-user')!;
  assert.equal(fresh.reason, 'Joined 2 days ago');
  assert.equal(fresh.isNew, true);
  assert.ok(fresh.score > old.score);
  assert.equal(scoreCandidate(P('o', { createdAt: NOW - 60 * DAY }), c, 'new-members'), null);
});

test('popularity is log damped', () => {
  const c = ctx();
  const a = scoreCandidate(P('a', { followerCount: 1_000 }), c, 'new-user')!.score;
  const b = scoreCandidate(P('b', { followerCount: 1_000_000 }), c, 'new-user')!.score;
  assert.ok(b < a * 2.2, `${a} vs ${b}`);
});

test('region gating: BOTH must opt in, and weatherCity/GPS never used', () => {
  const on = (r: string) => P('x', { discoverByRegion: true, discoveryRegion: r });
  assert.equal(regionMatch(on('Detroit, MI') as any, on('detroit mi')), 'detroit mi');
  assert.equal(regionMatch(on('Detroit'), on('Detroit, MI')), 'Detroit, MI');
  assert.equal(regionMatch(on('Detroit, MI'), P('y', { discoveryRegion: 'Detroit, MI' })), null);          // candidate off
  assert.equal(regionMatch(P('v', { discoveryRegion: 'Detroit, MI' }), on('Detroit, MI')), null);          // viewer off
  assert.equal(regionMatch(on('Detroit, MI'), on('Denver, CO')), null);
  assert.equal(regionMatch(on('Det'), on('Detroit, MI')), null);                                           // token boundary
  assert.equal(regionMatch(on(''), on('Detroit')), null);
  const sneaky: any = P('s', { discoverByRegion: false, weatherCity: 'Detroit' });
  const c = ctx({ viewer: P('me', { discoverByRegion: true, discoveryRegion: 'Detroit' }) });
  assert.equal(scoreCandidate(sneaky, c, 'new-user')!.reasonKind === 'region', false);
  const both = scoreCandidate(on('Detroit, MI'), c, 'existing')!;
  assert.equal(both.reasonKind, 'region');
});

test('deterministic per-viewer-per-day shuffle among near ties', () => {
  const pool = Array.from({ length: 40 }, (_, i) => P(`u${i}`, { followerCount: 20 }));
  const run = (seed: string) => rankSuggestions(pool, ctx({ seed }), { mode: 'new-user', limit: 10 }).map(s => s.uid);
  assert.deepEqual(run('a:2026-10-05'), run('a:2026-10-05'));
  assert.notDeepEqual(run('a:2026-10-05'), run('b:2026-10-05'));
  assert.notDeepEqual(run('a:2026-10-05'), run('a:2026-10-06'));
  assert.ok(hash01('x') >= 0 && hash01('x') < 1);
});

test('exposure cap: celebrities limited to 40% of the list, but list still fills', () => {
  const stars = Array.from({ length: 20 }, (_, i) => P(`s${i}`, { followerCount: 500_000 }));
  const normals = Array.from({ length: 20 }, (_, i) => P(`n${i}`, { followerCount: 30 }));
  const r = rankSuggestions([...stars, ...normals], ctx(), { mode: 'new-user', limit: 10 });
  assert.equal(r.length, 10);
  assert.ok(r.filter(s => s.uid.startsWith('s')).length <= 4);
  const onlyStars = rankSuggestions(stars, ctx(), { mode: 'new-user', limit: 10 });
  assert.equal(onlyStars.length, 10);
});

test('rank dedupes candidates and never returns excluded accounts', () => {
  const r = rankSuggestions([P('a'), P('a'), P('kid', { isChild: true }), P('me')], ctx(), { mode: 'new-user' });
  assert.deepEqual(r.map(s => s.uid), ['a']);
});

test('pickMode', () => {
  assert.equal(pickMode(P('v', { createdAt: NOW - DAY }), 50, NOW), 'new-user');
  assert.equal(pickMode(P('v', { createdAt: NOW - 90 * DAY }), 2, NOW), 'new-user');
  assert.equal(pickMode(P('v', { createdAt: NOW - 90 * DAY }), 30, NOW), 'existing');
});

test('follow graph utils: chunk, merge, dedupe', () => {
  assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.equal(chunkArray(Array.from({ length: 25 }, (_, i) => i)).length, 3);
  const m = mergeByTimestamp([[{ id: 'a', timestamp: 1 }, { id: 'b', timestamp: 5 }], [{ id: 'a', timestamp: 1 }, { id: 'c', timestamp: 9 }]], 2);
  assert.deepEqual(m.map(x => x.id), ['c', 'b']);
  assert.deepEqual(uniqueIds(['a', '', 'a', null, 'b']), ['a', 'b']);
});

import { filterForTab } from '../services/discoveryScoring';

test('tab filters: near requires both opted in; creators by type; ambassador boost for new users', () => {
  const viewer = P('me', { discoverByRegion: true, discoveryRegion: 'Detroit, MI' });
  const c = ctx({ viewer });
  const pool = [
    P('a', { discoverByRegion: true, discoveryRegion: 'detroit' }),
    P('b', { discoveryRegion: 'Detroit, MI' }),
    P('c', { isArtist: true }), P('d', { athleteSport: 'SOCCER' }),
  ];
  assert.deepEqual(filterForTab(pool, c, 'near').map(x => x.uid), ['a']);
  assert.deepEqual(filterForTab(pool, c, 'creators', 'artist').map(x => x.uid), ['c']);
  assert.deepEqual(filterForTab(pool, c, 'creators', 'athlete').map(x => x.uid), ['d']);
  const amb = scoreCandidate(P('amb', { isWelcomeAmbassador: true }), ctx(), 'new-user')!;
  assert.equal(amb.reasonKind, 'ambassador');
  assert.equal(scoreCandidate(P('amb', { isWelcomeAmbassador: true }), ctx(), 'existing'), null);
});
