// The Audius For You / Latest feed as Social Stream posts, and posting an Audius comment.
// Run: npx tsx --test --experimental-test-module-mocks tests/audiusFeed.test.ts
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let token: string | null = 'tok';
mock.module('../services/audiusAuth.ts', {
  namedExports: {
    getAudiusSession: () => ({ userId: 'ME1', handle: 'me', name: 'Me', scope: 'write', accessToken: 'tok' }),
    getAudiusAccessToken: async () => token,
    loginWithAudius: async () => { throw new Error('no login in tests'); },
    startAudiusAuth: async () => { throw new Error('no login in tests'); },
    logoutAudius: async () => {},
    completeAudiusRedirect: async () => null,
    AUDIUS_SESSION_EVENT: 'audius-session',
  },
});

const fixture = JSON.parse(readFileSync(new URL('./fixtures/audiusForYouFeed.json', import.meta.url), 'utf8'));
const calls: { url: string; init: any }[] = [];
let personalStatus = 200;
(globalThis as any).fetch = async (input: any, init: any = {}) => {
  const url = String(input);
  calls.push({ url, init });
  const json = (b: any, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  if (url === 'https://api.audius.co') return json({ data: ['https://api.audius.co'] });
  if (url.includes('/feed')) {
    if (url.includes('user_id=') && personalStatus !== 200) return json({ error: 'nope' }, personalStatus);
    return json(fixture);
  }
  if (url.includes('/v1/tracks/trending')) {
    // Same artist three times: the public feed keeps at most two per artist.
    const t = fixture.data[0].item;
    return json({ data: [t, { ...t, id: `${t.id}b` }, { ...t, id: `${t.id}c` }, ...fixture.data.slice(1).map((x: any) => x.item)] });
  }
  if (url.includes('/v1/comments')) return json({ comment_id: 'C9', transaction_hash: '0x' }, 201);
  throw new Error(`unexpected ${url}`);
};

test('For You items become audio posts with the numeric id comments need', async () => {
  const { fetchAudiusFeed } = await import('../services/audiusService');
  const posts = await fetchAudiusFeed('for-you', { limit: 4 });
  assert.equal(posts.length, fixture.data.length);
  const p = posts[0], raw = fixture.data[0].item;
  assert.equal(p.id, `audius_${raw.id}`);
  assert.equal(p.protocol, 'audius');
  assert.equal(p.audiusTrackNumericId, raw.track_id);
  assert.equal(p.authorHandle, `@${raw.user.handle}`);
  assert.equal(p.createdAt, Date.parse(fixture.data[0].timestamp));
  assert.equal(p.media[0].type, 'audio');
  assert.match(p.media[0].url, new RegExp(`/v1/tracks/${raw.id}/stream`));
  assert.equal(p.audiusFeed, 'for-you');
  const feedCall = calls.find(c => c.url.includes('/feed/for-you'))!;
  assert.match(feedCall.url, /\/v1\/users\/ME1\/feed\/for-you\?/);
  assert.match(feedCall.url, /user_id=ME1/);
  assert.equal(feedCall.init.headers.Authorization, 'Bearer tok');
});

test('Latest uses the follow feed, and falls back to the public feed when the personal one is refused', async () => {
  const { fetchAudiusFeed } = await import('../services/audiusService');
  calls.length = 0; personalStatus = 403;
  const posts = await fetchAudiusFeed('latest');
  personalStatus = 200;
  assert.equal(posts.length, fixture.data.length);
  const feedCalls = calls.filter(c => /\/v1\/users\/ME1\/feed\?/.test(c.url));
  assert.equal(feedCalls.length, 2);
  assert.match(feedCalls[0].url, /user_id=ME1/);
  assert.doesNotMatch(feedCalls[1].url, /user_id=/);
  assert.match(feedCalls[1].url, /tracks_only=true/);
});

test('a track a follow reposted (from someone you do not follow) says so in Latest only', async () => {
  const { fetchAudiusFeed } = await import('../services/audiusService');
  const saved = fixture.data[0].item;
  fixture.data[0].item = { ...saved, followee_reposts: [{ user_id: 'F1' }], user: { ...saved.user, does_current_user_follow: false } };
  try {
    assert.equal((await fetchAudiusFeed('latest'))[0].repostedBy, 'Someone you follow');
    assert.equal((await fetchAudiusFeed('for-you'))[0].repostedBy, undefined);
  } finally { fixture.data[0].item = saved; }
});

test('posting a comment sends the camelCase body Audius documents', async () => {
  const { postAudiusTrackComment } = await import('../services/audiusService');
  calls.length = 0;
  const c = await postAudiusTrackComment(12345, '  great track  ', { trackTimestampS: 61.7 });
  assert.equal(c?.id, 'C9');
  assert.equal(c?.message, 'great track');
  const call = calls.find(x => x.url.includes('/v1/comments'))!;
  assert.equal(call.init.method, 'POST');
  assert.deepEqual(JSON.parse(call.init.body), { entityType: 'Track', entityId: 12345, body: 'great track', trackTimestampS: 61 });
  assert.match(call.url, /user_id=ME1/);
  assert.equal(call.init.headers.Authorization, 'Bearer tok');
});

test('Public feed (no Audius account) is trending, capped at two tracks per artist', async () => {
  const { fetchAudiusPublicFeed } = await import('../services/audiusService');
  calls.length = 0;
  const posts = await fetchAudiusPublicFeed('for-you', { limit: 20 });
  const first = fixture.data[0].item;
  assert.equal(posts.filter((p: any) => p.authorDid === `audius:${first.user.id}`).length <= 2, true);
  assert.ok(posts.length >= 2);
  assert.equal(posts[0].protocol, 'audius');
  assert.equal(posts[0].isLiked, false);
  assert.match(calls.find(c => c.url.includes('/tracks/trending'))!.url, /time=week/);
  const under = await fetchAudiusPublicFeed('latest', { limit: 5 });
  assert.ok(under.length > 0);
  assert.ok(calls.some(c => c.url.includes('/tracks/trending/underground')));
});

test('A post track becomes a native Chora album that links to the Audius artist, not audius.co', async () => {
  const { audiusTrackToNativeAlbum } = await import('../services/audiusService');
  const album: any = audiusTrackToNativeAlbum({ id: 'audius_T1', title: 'Song', artist: 'Ann', artistId: 'U7', url: 'u', thumbnailUrl: 'c', source: 'AUDIUS', sourcePageUrl: 'https://audius.co/ann/song' } as any);
  assert.equal(album.id, 'audius:album:single_T1');
  assert.equal(album.ownerId, 'audius:U7');
  assert.equal(album.tracks[0].id, 'audius_T1');
  assert.equal(album.tracks[0].artistId, 'audius:U7');
});
