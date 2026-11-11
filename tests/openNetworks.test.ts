// Open-network bridges: Mobilizon, Lemmy, BookWyrm, Owncast, Matrix. No real network — remote servers are a fake
// fetch and DNS is a fake lookup; the router is exercised over loopback with an in-memory store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  normalizeServer, netFetch, assertSafeUrl, OpenNetworkError, canConnectOpenNetworks, orgAllowsNetwork, orgRequiresOptIn,
  federationBlockReason, accountDocId, ACCOUNT_ID_RE, textToHtml, type NetDeps, type AccountStore, type AccountDoc,
} from '../services/openNetworks/common';
import { buildMobilizonEvent, eventBlockReason, mobilizonLogin, mobilizonCreateEvent } from '../services/openNetworks/mobilizon';
import { lemmyLogin, lemmyCreatePost, lemmyListPosts, parseCommunity } from '../services/openNetworks/lemmy';
import { bookwyrmShelf, parseBookwyrmHandle, BOOKWYRM_WRITE_SUPPORTED } from '../services/openNetworks/bookwyrm';
import { owncastStatus, owncastSendChat, owncastIngestConfig } from '../services/openNetworks/owncast';
import { matrixDiscover, matrixPasswordLogin, matrixJoinedRooms, matrixSend, matrixMessages, parseRoomId } from '../services/openNetworks/matrix';
import { createOpenNetworksRouter, type OpenNetworksDeps, type OrgNetworkSettings } from '../routes/openNetworks';

// ─── fakes ──────────────────────────────────────────────────────────────────
type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeNet(routes: Record<string, Handler>, opts: { ips?: Record<string, string[]> } = {}) {
  const calls: Array<{ method: string; url: string; body?: any; headers: Record<string, string> }> = [];
  const deps: NetDeps = {
    lookup: async (h) => opts.ips?.[h] ?? ['93.184.216.34'],
    fetch: async (u, init = {}) => {
      const url = new URL(u);
      const method = (init.method || 'GET').toUpperCase();
      let body: any; try { body = init.body ? JSON.parse(String(init.body)) : undefined; } catch { body = init.body; }
      calls.push({ method, url: url.toString(), body, headers: (init.headers || {}) as Record<string, string> });
      const key = `${method} ${url.host}${decodeURIComponent(url.pathname)}`;
      const h = routes[key];
      if (!h) return json({ error: `no route ${key}` }, 404);
      return h(url, init);
    },
  };
  return { deps, calls };
}

function memStore(): AccountStore & { rows: Map<string, AccountDoc> } {
  const rows = new Map<string, AccountDoc>();
  return {
    rows,
    get: async (id) => (rows.has(id) ? structuredClone(rows.get(id)!) : null),
    set: async (id, d) => { rows.set(id, structuredClone(d)); return true; },
    delete: async (id) => rows.delete(id),
    listByUid: async (uid) => [...rows].filter(([, d]) => d.uid === uid).map(([id, data]) => ({ id, data })),
  };
}
const box = { seal: (s: Record<string, unknown>) => `sealed:${JSON.stringify(s)}`, open: (r: string) => JSON.parse(r.slice(7)) };

// ─── common: SSRF + policy ────────────────────────────────────────────────────
test('normalizeServer: https only, origin only, internal hosts refused', () => {
  assert.equal(normalizeServer('lemmy.world').origin, 'https://lemmy.world');
  assert.equal(normalizeServer('https://mobilizon.fr/some/path?x=1').origin, 'https://mobilizon.fr');
  for (const bad of ['http://lemmy.world', 'localhost', 'https://127.0.0.1', 'https://10.0.0.5', 'https://foo.internal', 'https://user:pw@x.org', 'https://x.org:22', 'ftp://x.org', '']) {
    assert.throws(() => normalizeServer(bad), OpenNetworkError, bad);
  }
});

test('assertSafeUrl/netFetch: DNS to a private address is refused before any request', async () => {
  const { deps, calls } = fakeNet({ 'GET evil.example/api/status': () => json({ online: true }) }, { ips: { 'evil.example': ['93.184.216.34', '169.254.169.254'] } });
  await assert.rejects(assertSafeUrl('https://evil.example/', deps), /private/);
  await assert.rejects(netFetch(deps, 'https://evil.example/api/status'), /private/);
  assert.equal(calls.length, 0);
});

test('netFetch: redirects are not followed, bodies are capped, fetch gets redirect=manual', async () => {
  let seenRedirect: RequestRedirect | undefined;
  const { deps } = fakeNet({
    'GET a.example/r': (_u, init) => { seenRedirect = init.redirect; return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }); },
    'GET a.example/big': () => new Response('x'.repeat(5000)),
  });
  await assert.rejects(netFetch(deps, 'https://a.example/r'), /redirect/);
  assert.equal(seenRedirect, 'manual');
  await assert.rejects(netFetch({ ...deps, maxBytes: 1000 }, 'https://a.example/big'), /too large/);
});

test('child accounts can never connect; missing profile fails closed', () => {
  assert.equal(canConnectOpenNetworks({ isChild: true }).ok, false);
  assert.equal(canConnectOpenNetworks({ accountType: 'CHILD' }).ok, false);
  assert.equal(canConnectOpenNetworks({ birthYear: 2020 }, 2026).ok, false);
  assert.equal(canConnectOpenNetworks(null).ok, false);
  assert.equal(canConnectOpenNetworks({ accountType: 'ARTIST', birthYear: 1990 }, 2026).ok, true);
});

test('org opt-in: church/nonprofit/school off by default, others on, private orgs never', () => {
  const church = { orgType: 'CHURCH' }, school = { orgType: 'OTHER', category: 'Elementary School' }, brand = { orgType: 'BRAND' };
  assert.ok(orgRequiresOptIn(church) && orgRequiresOptIn({ orgType: 'NONPROFIT' }) && orgRequiresOptIn(school) && !orgRequiresOptIn(brand));
  assert.equal(orgAllowsNetwork(church, null, 'mobilizon'), false);
  assert.equal(orgAllowsNetwork(church, { enabled: { mobilizon: true } }, 'mobilizon'), true);
  assert.equal(orgAllowsNetwork(school, { enabled: { lemmy: true } }, 'mobilizon'), false);
  assert.equal(orgAllowsNetwork(brand, null, 'mobilizon'), true);
  assert.equal(orgAllowsNetwork(brand, { enabled: { mobilizon: false } }, 'mobilizon'), false);
  assert.equal(orgAllowsNetwork({ orgType: 'BRAND', isPrivate: true }, { enabled: { mobilizon: true } }, 'mobilizon'), false);
});

test('federationBlockReason: private, internal, members-only, paywalled all stay home', () => {
  assert.equal(federationBlockReason({ title: 'x' }), null);
  for (const item of [{ isPublic: false }, { isPrivate: true }, { visibility: 'members' }, { orgAudience: 'MEMBERS' }, { internal: true }, { sanctuaryMembersOnly: true }, { exclusive: true }, { price: 5 }]) {
    assert.ok(federationBlockReason(item), JSON.stringify(item));
  }
});

test('account doc ids are per uid+network and validated', () => {
  const id = accountDocId('uid123', 'lemmy', 'https://lemmy.world', 'me');
  assert.match(id, ACCOUNT_ID_RE);
  assert.ok(id.startsWith('uid123_lemmy_'));
  assert.equal(id, accountDocId('uid123', 'lemmy', 'https://LEMMY.world', 'ME'));
  assert.throws(() => accountDocId('../x', 'lemmy', 's', 'h'));
});

test('textToHtml escapes', () => {
  assert.equal(textToHtml('a <b>\nc\n\nd'), '<p>a &lt;b&gt;<br>c</p><p>d</p>');
});

// ─── Mobilizon ────────────────────────────────────────────────────────────────
const EVENT = {
  id: 'ev1', title: 'Harvest Night', subtitle: 'Food + music', description: 'Bring a friend.', status: 'PUBLISHED',
  startDate: Date.UTC(2030, 0, 2, 18), endDate: Date.UTC(2030, 0, 2, 21), venueName: 'Grace Hall', venueAddress: '1 Main St', city: 'Detroit', state: 'MI', country: 'US',
  lat: 42.33, lng: -83.05, streamUrl: 'rtmp://secret', streamPassword: 'pw', tags: ['#community'], tiers: [{ price: 10 }],
  host: { kind: 'org' as const, id: 'org1' }, creatorUid: 'uA',
};

test('mobilizon: event mapping keeps stream secrets home and points participation at Plajah', () => {
  const v = buildMobilizonEvent(EVENT, '42', 'https://plajah.com/event/ev1');
  assert.equal(v.visibility, 'PUBLIC'); assert.equal(v.draft, false); assert.equal(v.joinOptions, 'EXTERNAL');
  assert.equal(v.externalParticipationUrl, 'https://plajah.com/event/ev1');
  assert.equal(v.beginsOn, '2030-01-02T18:00:00.000Z');
  assert.equal(v.physicalAddress?.geom, '-83.05;42.33');
  assert.deepEqual(v.tags, ['community']);
  assert.ok(!JSON.stringify(v).includes('secret') && !JSON.stringify(v).includes('"pw"'));
  assert.match(v.description, /Tickets and details on Plajah/);
});

test('mobilizon: only published public events', () => {
  assert.equal(eventBlockReason(EVENT), null);
  assert.ok(eventBlockReason({ ...EVENT, status: 'DRAFT' }));
  assert.ok(eventBlockReason({ ...EVENT, sanctuaryMembersOnly: true }));
  assert.ok(eventBlockReason({ ...EVENT, isPrivate: true }));
  assert.ok(eventBlockReason(null));
});

test('mobilizon: login → identity, createEvent refreshes an expired token once', async () => {
  let createCalls = 0;
  const { deps, calls } = fakeNet({
    'POST mob.example/api': (_u, init) => {
      const b = JSON.parse(String(init.body));
      const auth = (init.headers as any)?.Authorization;
      if (b.query.includes('login(')) return json({ data: { login: { accessToken: 'at1', refreshToken: 'rt1' } } });
      if (b.query.includes('loggedPerson')) return json({ data: { loggedPerson: { id: '42', preferredUsername: 'grace', name: 'Grace' } } });
      if (b.query.includes('refreshToken(')) return json({ data: { refreshToken: { accessToken: 'at2', refreshToken: 'rt2' } } });
      if (b.query.includes('createEvent')) {
        createCalls++;
        if (auth === 'Bearer at1') return json({ errors: [{ message: 'You need to be logged in', status_code: 401 }], data: null });
        return json({ data: { createEvent: { id: '7', uuid: 'u-7', url: 'https://mob.example/events/u-7' } } });
      }
      return json({ errors: [{ message: 'unknown' }] });
    },
  });
  const { tokens, identity } = await mobilizonLogin(deps, 'https://mob.example', 'g@x.org', 'pw');
  assert.deepEqual(identity, { actorId: '42', username: 'grace', name: 'Grace' });
  const out = await mobilizonCreateEvent(deps, 'https://mob.example', tokens, buildMobilizonEvent(EVENT, '42', 'https://plajah.com/event/ev1'));
  assert.equal(out.url, 'https://mob.example/events/u-7');
  assert.deepEqual(out.rotatedTokens, { accessToken: 'at2', refreshToken: 'rt2' });
  assert.equal(createCalls, 2);
  const create = calls.filter(c => c.body?.query?.includes('createEvent')).pop()!;
  assert.equal(create.body.variables.organizerActorId, '42');
  assert.equal(create.body.variables.onlineAddress, undefined);
});

// ─── Lemmy ────────────────────────────────────────────────────────────────────
const lemmyRoutes: Record<string, Handler> = {
  'POST lemmy.example/api/v3/user/login': (_u, init) => JSON.parse(String(init.body)).password === 'pw' ? json({ jwt: 'J' }) : json({ error: 'incorrect_login' }, 400),
  'GET lemmy.example/api/v3/community': (u) => u.searchParams.get('name') === 'plajah_gamers' ? json({ community_view: { community: { id: 9, title: 'Plajah Gamers', actor_id: 'https://lemmy.example/c/plajah_gamers' } } }) : json({ error: 'couldnt_find_community' }, 404),
  'POST lemmy.example/api/v3/post': (_u, init) => (init.headers as any).Authorization === 'Bearer J' ? json({ post_view: { post: { id: 101, ap_id: 'https://lemmy.example/post/101' } } }) : json({ error: 'not_logged_in' }, 401),
  'GET lemmy.example/api/v3/post/list': () => json({ posts: [
    { post: { id: 1, name: 'Tourney Friday', body: '<b>8pm</b>', ap_id: 'https://lemmy.example/post/1', published: '2026-11-01T00:00:00Z' }, creator: { name: 'kit', actor_id: 'https://lemmy.example/u/kit' }, community: { name: 'plajah_gamers' }, counts: { score: 12, comments: 3 } },
    { post: { id: 2, name: 'nsfw', nsfw: true }, community: { name: 'plajah_gamers' }, counts: {} },
    { post: { id: 3, name: 'gone', removed: true }, community: { name: 'plajah_gamers' }, counts: {} },
    { post: { id: 4, name: 'bad link', url: 'javascript:alert(1)', ap_id: 'javascript:x' }, creator: { name: 'z' }, community: { name: 'plajah_gamers' }, counts: {} },
  ] }),
};

test('lemmy: login, post with Bearer, wrong password', async () => {
  const { deps, calls } = fakeNet(lemmyRoutes);
  const { jwt } = await lemmyLogin(deps, 'https://lemmy.example', 'me', 'pw');
  assert.equal(jwt, 'J');
  await assert.rejects(lemmyLogin(deps, 'https://lemmy.example', 'me', 'nope'), /Wrong username or password/);
  const out = await lemmyCreatePost(deps, 'https://lemmy.example', jwt, { community: '!plajah_gamers', title: 'GG', body: 'nice' });
  assert.deepEqual(out, { id: 101, url: 'https://lemmy.example/post/101' });
  const p = calls.find(c => c.url.endsWith('/api/v3/post'))!;
  assert.equal(p.body.community_id, 9);
  await assert.rejects(lemmyCreatePost(deps, 'https://lemmy.example', jwt, { community: 'missing', title: 'x' }), /not found/);
  await assert.rejects(lemmyCreatePost(deps, 'https://lemmy.example', jwt, { community: 'plajah_gamers', title: 'x', url: 'javascript:alert(1)' }), /http/);
});

test('lemmy: public read drops nsfw/removed and unsafe links; community names validated', async () => {
  const { deps } = fakeNet(lemmyRoutes);
  const posts = await lemmyListPosts(deps, 'https://lemmy.example', 'plajah_gamers');
  assert.deepEqual(posts.map(p => p.id), [1, 4]);
  assert.equal(posts[0].body, '8pm');
  assert.equal(posts[1].url, undefined);
  assert.equal(posts[1].link, 'https://lemmy.example/post/4');
  assert.equal(parseCommunity('!games@lemmy.world'), 'games@lemmy.world');
  assert.throws(() => parseCommunity('../etc'));
});

// ─── BookWyrm ─────────────────────────────────────────────────────────────────
test('bookwyrm: handle parsing and public shelf read with author names', async () => {
  assert.deepEqual(parseBookwyrmHandle('@reader@bookwyrm.example'), { name: 'reader', server: 'https://bookwyrm.example' });
  assert.deepEqual(parseBookwyrmHandle('https://bookwyrm.example/user/reader/books'), { name: 'reader', server: 'https://bookwyrm.example' });
  assert.throws(() => parseBookwyrmHandle('reader@localhost'));
  const { deps, calls } = fakeNet({
    'GET bookwyrm.example/user/reader/books/read': () => json({ type: 'OrderedCollectionPage', partOf: { totalItems: 2 }, orderedItems: [
      { id: 'https://bookwyrm.example/book/1', type: 'Edition', title: 'Beloved', authors: ['https://bookwyrm.example/author/9'], cover: { url: 'https://bookwyrm.example/images/c.jpg' }, isbn13: '9781400033416' },
      'https://bookwyrm.example/book/2',
    ] }),
    'GET bookwyrm.example/author/9': () => json({ name: 'Toni Morrison' }),
  });
  const r = await bookwyrmShelf(deps, 'reader@bookwyrm.example', 'read');
  assert.equal(r.total, 2);
  assert.equal(r.books[0].title, 'Beloved');
  assert.deepEqual(r.books[0].authors, ['Toni Morrison']);
  assert.equal(r.books[1].link, 'https://bookwyrm.example/book/2');
  assert.equal(r.writeSupported, false); assert.equal(BOOKWYRM_WRITE_SUPPORTED, false);
  assert.match(String(calls[0].headers.Accept), /activity\+json/);
});

// ─── Owncast ──────────────────────────────────────────────────────────────────
test('owncast: status, chat via integrations token, ingest config', async () => {
  const { deps, calls } = fakeNet({
    'GET live.example/api/status': () => json({ online: true, viewerCount: 17, streamTitle: 'Sunday', versionNumber: '0.2.0' }),
    'GET live.example/api/config': () => json({ name: 'Grace Live' }),
    'POST live.example/api/integrations/chat/send': (_u, init) => (init.headers as any).Authorization === 'Bearer T' ? json({ success: true }) : json({ error: 'unauthorized' }, 401),
    'GET notowncast.example/api/status': () => json({ hello: 1 }),
  });
  const s = await owncastStatus(deps, 'https://live.example', { withConfig: true });
  assert.equal(s.online, true); assert.equal(s.viewerCount, 17); assert.equal(s.name, 'Grace Live');
  await assert.rejects(owncastStatus(deps, 'https://notowncast.example'), /Owncast/);
  await owncastSendChat(deps, 'https://live.example', 'T', 'hello room');
  assert.deepEqual(calls.find(c => c.url.includes('chat/send'))!.body, { body: 'hello room' });
  await assert.rejects(owncastSendChat(deps, 'https://live.example', 'bad', 'x'), /token/);
  assert.deepEqual(owncastIngestConfig('https://live.example', 'KEY').rtmpUrl, 'rtmp://live.example/live');
  assert.equal(owncastIngestConfig('https://live.example', 'KEY', { rtmpHost: 'ingest.example', rtmpPort: 1936 }).rtmpUrl, 'rtmp://ingest.example:1936/live');
  assert.throws(() => owncastIngestConfig('https://live.example', ''));
});

// ─── Matrix ───────────────────────────────────────────────────────────────────
const matrixRoutes: Record<string, Handler> = {
  'GET example.org/.well-known/matrix/client': () => json({ 'm.homeserver': { base_url: 'https://matrix.example.org' } }),
  'POST matrix.example.org/_matrix/client/v3/login': (_u, init) => JSON.parse(String(init.body)).password === 'pw' ? json({ access_token: 'MT', user_id: '@me:example.org', device_id: 'D' }) : json({ errcode: 'M_FORBIDDEN', error: 'Invalid password' }, 403),
  'GET matrix.example.org/_matrix/client/v3/account/whoami': (_u, init) => (init.headers as any).Authorization === 'Bearer MT' ? json({ user_id: '@me:example.org' }) : json({ errcode: 'M_UNKNOWN_TOKEN' }, 401),
  'GET matrix.example.org/_matrix/client/v3/joined_rooms': () => json({ joined_rooms: ['!abc:example.org', '!def:example.org', 'garbage'] }),
  'GET matrix.example.org/_matrix/client/v3/rooms/!abc:example.org/state/m.room.name': () => json({ name: 'Youth Huddle' }),
  'PUT matrix.example.org/_matrix/client/v3/rooms/!abc:example.org/send/m.room.message/txn-12345': () => json({ event_id: '$e1' }),
  'GET matrix.example.org/_matrix/client/v3/rooms/!abc:example.org/messages': () => json({ end: 't2', chunk: [
    { type: 'm.room.message', sender: '@b:example.org', content: { body: 'second' }, origin_server_ts: 2, event_id: '$2' },
    { type: 'm.room.encrypted', sender: '@c:example.org', content: {}, origin_server_ts: 1.5, event_id: '$x' },
    { type: 'm.room.member', sender: '@c:example.org', content: {}, origin_server_ts: 1.2, event_id: '$m' },
    { type: 'm.room.message', sender: '@a:example.org', content: { body: 'first' }, origin_server_ts: 1, event_id: '$1' },
  ] }),
};

test('matrix: discovery, login, rooms, send, read (oldest first, encrypted placeholder)', async () => {
  const { deps, calls } = fakeNet(matrixRoutes);
  const hs = await matrixDiscover(deps, 'example.org');
  assert.equal(hs, 'https://matrix.example.org');
  await assert.rejects(matrixPasswordLogin(deps, hs, 'me', 'bad'), /Wrong user or password/);
  const login = await matrixPasswordLogin(deps, hs, 'me', 'pw');
  assert.equal(login.accessToken, 'MT');
  const rooms = await matrixJoinedRooms(deps, hs, 'MT');
  assert.deepEqual(rooms, [{ roomId: '!abc:example.org', name: 'Youth Huddle' }, { roomId: '!def:example.org' }]);
  assert.deepEqual(await matrixSend(deps, hs, 'MT', '!abc:example.org', 'hi', 'txn-12345'), { eventId: '$e1' });
  assert.deepEqual(calls.find(c => c.method === 'PUT')!.body, { msgtype: 'm.text', body: 'hi' });
  const m = await matrixMessages(deps, hs, 'MT', '!abc:example.org');
  assert.deepEqual(m.messages.map(x => x.body), ['first', '(encrypted message — not readable here)', 'second']);
  assert.equal(m.next, 't2');
  assert.throws(() => parseRoomId('#alias:example.org'));
});

// ─── Router over loopback ─────────────────────────────────────────────────────
async function withServer(deps: OpenNetworksDeps, fn: (base: string) => Promise<void>) {
  const app = express();
  app.use('/api/open-networks', createOpenNetworksRouter(deps));
  const srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  try { await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/api/open-networks`); } finally { srv.close(); }
}

function routerDeps(over: Partial<OpenNetworksDeps> = {}) {
  const net = fakeNet({ ...lemmyRoutes, ...matrixRoutes,
    'GET live.example/api/status': () => json({ online: false, viewerCount: 0 }),
    'GET live.example/api/config': () => json({ name: 'Live' }),
    'POST mob.example/api': (_u, init) => {
      const b = JSON.parse(String(init.body));
      if (b.query.includes('login(')) return json({ data: { login: { accessToken: 'at', refreshToken: 'rt' } } });
      if (b.query.includes('loggedPerson')) return json({ data: { loggedPerson: { id: '42', preferredUsername: 'grace' } } });
      if (b.query.includes('createEvent')) return json({ data: { createEvent: { id: '7', url: 'https://mob.example/events/7' } } });
      return json({ errors: [{ message: '?' }] });
    },
  });
  const store = memStore();
  const orgSettings = new Map<string, OrgNetworkSettings>();
  const users: Record<string, any> = { uA: { accountType: 'ARTIST' }, kid: { isChild: true }, uB: { accountType: 'FAN' } };
  const orgs: Record<string, any> = { org1: { id: 'org1', orgType: 'CHURCH', creatorId: 'uA', admins: ['uA'] } };
  const events: Record<string, any> = { ev1: EVENT, evPriv: { ...EVENT, id: 'evPriv', sanctuaryMembersOnly: true } };
  const deps: OpenNetworksDeps = {
    net: net.deps, store, box,
    verify: async (t) => (t.startsWith('tok-') ? t.slice(4) : null),
    getUser: async (u) => users[u] ?? null,
    getOrg: async (id) => orgs[id] ?? null,
    getOrgSettings: async (id) => orgSettings.get(id) ?? null,
    setOrgSettings: async (id, s) => { orgSettings.set(id, s); return true; },
    getEvent: async (id) => events[id] ?? null,
    eventUrl: (id) => `https://plajah.com/event/${id}`,
    ...over,
  };
  return { deps, store, net };
}

const req = async (base: string, path: string, opts: { method?: string; uid?: string; body?: unknown } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.uid ? { Authorization: `Bearer tok-${opts.uid}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: await res.json() as any };
};

test('router: auth required, children refused, secrets never returned, password not stored', async () => {
  const { deps, store } = routerDeps();
  await withServer(deps, async (base) => {
    assert.equal((await req(base, '/accounts')).status, 401);
    const kid = await req(base, '/lemmy/connect', { method: 'POST', uid: 'kid', body: { server: 'lemmy.example', username: 'k', password: 'pw' } });
    assert.equal(kid.status, 403);
    const ok = await req(base, '/lemmy/connect', { method: 'POST', uid: 'uA', body: { server: 'lemmy.example', username: 'me', password: 'pw' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.account.secret, undefined);
    const doc = [...store.rows.values()][0];
    assert.ok(!JSON.stringify(doc).includes('"pw"'));
    assert.deepEqual(box.open(doc.secret), { jwt: 'J' });
    const list = await req(base, '/accounts', { uid: 'uA' });
    assert.equal(list.body.accounts.length, 1);
    assert.equal((await req(base, '/accounts', { uid: 'uB' })).body.accounts.length, 0);
    // another user can't use or delete it
    const id = list.body.accounts[0].id;
    assert.equal((await req(base, '/lemmy/post', { method: 'POST', uid: 'uB', body: { accountId: id, community: 'plajah_gamers', title: 'x' } })).status, 404);
    assert.equal((await req(base, `/accounts/${id}`, { method: 'DELETE', uid: 'uB' })).status, 404);
    const post = await req(base, '/lemmy/post', { method: 'POST', uid: 'uA', body: { accountId: id, community: 'plajah_gamers', title: 'GG' } });
    assert.equal(post.body.id, 101);
    assert.equal((await req(base, `/accounts/${id}`, { method: 'DELETE', uid: 'uA' })).status, 200);
    assert.equal(store.rows.size, 0);
  });
});

test('router: SSRF — private server refused at connect', async () => {
  const { deps } = routerDeps();
  deps.net = { ...deps.net, lookup: async () => ['10.1.2.3'] };
  await withServer(deps, async (base) => {
    const r = await req(base, '/lemmy/connect', { method: 'POST', uid: 'uA', body: { server: 'lemmy.example', username: 'me', password: 'pw' } });
    assert.equal(r.status, 400);
    assert.match(r.body.error, /private/);
    assert.equal((await req(base, '/lemmy/connect', { method: 'POST', uid: 'uA', body: { server: 'http://lemmy.example', username: 'me', password: 'pw' } })).status, 400);
  });
});

test('router: church event needs opt-in; members-only never goes; publish is idempotent', async () => {
  const { deps, net } = routerDeps();
  await withServer(deps, async (base) => {
    const c = await req(base, '/mobilizon/connect', { method: 'POST', uid: 'uA', body: { server: 'mob.example', email: 'g@x.org', password: 'pw' } });
    const accountId = c.body.account.id;
    const off = await req(base, '/mobilizon/publish-event', { method: 'POST', uid: 'uA', body: { accountId, eventId: 'ev1' } });
    assert.equal(off.status, 403); assert.equal(off.body.code, 'org-off');
    assert.equal((await req(base, '/orgs/org1/settings', { method: 'PUT', uid: 'uB', body: { enabled: { mobilizon: true } } })).status, 403);
    const set = await req(base, '/orgs/org1/settings', { method: 'PUT', uid: 'uA', body: { enabled: { mobilizon: true } } });
    assert.equal(set.body.effective.mobilizon, true); assert.equal(set.body.effective.lemmy, false);
    const priv = await req(base, '/mobilizon/publish-event', { method: 'POST', uid: 'uA', body: { accountId, eventId: 'evPriv' } });
    assert.equal(priv.status, 400);
    const pub = await req(base, '/mobilizon/publish-event', { method: 'POST', uid: 'uA', body: { accountId, eventId: 'ev1' } });
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assert.equal(pub.body.url, 'https://mob.example/events/7');
    const again = await req(base, '/mobilizon/publish-event', { method: 'POST', uid: 'uA', body: { accountId, eventId: 'ev1' } });
    assert.equal(again.body.already, true);
    assert.equal(net.calls.filter(x => x.body?.query?.includes('createEvent')).length, 1);
  });
});

test('router: public reads (lemmy board, owncast status) and owner-only ingest; matrix token connect', async () => {
  const { deps } = routerDeps();
  await withServer(deps, async (base) => {
    const posts = await req(base, '/lemmy/posts?server=lemmy.example&community=plajah_gamers');
    assert.equal(posts.status, 200); assert.equal(posts.body.posts.length, 2);
    // church board is off until opted in
    await req(base, '/orgs/org1/settings', { method: 'PUT', uid: 'uA', body: { lemmyBoards: [{ server: 'lemmy.example', community: 'plajah_gamers' }] } });
    assert.equal((await req(base, '/orgs/org1/lemmy-board')).body.board, null);
    await req(base, '/orgs/org1/settings', { method: 'PUT', uid: 'uA', body: { enabled: { lemmy: true } } });
    const board = await req(base, '/orgs/org1/lemmy-board');
    assert.equal(board.body.posts.length, 2);

    assert.deepEqual((await req(base, '/owncast/status?server=live.example')).body.online, false);
    const oc = await req(base, '/owncast/connect', { method: 'POST', uid: 'uA', body: { server: 'live.example', streamKey: 'SK', accessToken: 'T' } });
    assert.equal(oc.status, 200, JSON.stringify(oc.body));
    assert.ok(!JSON.stringify(oc.body).includes('SK'));
    const id = oc.body.account.id;
    assert.equal((await req(base, `/owncast/ingest/${id}`, { uid: 'uB' })).status, 404);
    const ing = await req(base, `/owncast/ingest/${id}`, { uid: 'uA' });
    assert.deepEqual([ing.body.rtmpUrl, ing.body.streamKey], ['rtmp://live.example/live', 'SK']);

    const mx = await req(base, '/matrix/connect', { method: 'POST', uid: 'uA', body: { homeserver: 'example.org', accessToken: 'MT' } });
    assert.equal(mx.status, 200, JSON.stringify(mx.body));
    assert.equal(mx.body.account.handle, '@me:example.org');
    const rooms = await req(base, `/matrix/rooms?accountId=${mx.body.account.id}`, { uid: 'uA' });
    assert.equal(rooms.body.rooms[0].name, 'Youth Huddle');
    const bad = await req(base, '/matrix/connect', { method: 'POST', uid: 'uA', body: { homeserver: 'example.org', accessToken: 'nope' } });
    assert.equal(bad.status, 401);
  });
});
