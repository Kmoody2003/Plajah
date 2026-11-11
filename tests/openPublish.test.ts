// Open publishing (PeerTube + Funkwhale): policy, SSRF guard, connect, publish, status, delete, disconnect.
// No network: the remote servers are a fake fetch + fake DNS; the router runs on a loopback port with an in-memory store.
// Run: npx tsx --test tests/openPublish.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import {
  instanceOrigin, assertPublicHost, guardedFetch, cleanMeta, OpenPublishError, type NetCtx,
} from '../services/peertube/publish';
import { funkwhaleAuthorizeUrl } from '../services/funkwhale/api';
import {
  createOpenPublishRouter, videoBlockers, albumBlockers, isMinorAccount, ACCOUNTS, JOBS,
  type OpenPublishDeps, type OpenPublishStore,
} from '../routes/openPublish';

// ─── Fakes ──────────────────────────────────────────────────────────────────

type Call = { method: string; url: string; headers: Record<string, string>; body: any };
type Handler = (c: Call) => Response | Promise<Response> | undefined;

function fakeNet(handlers: Handler[], dns: Record<string, string[]> = {}) {
  const calls: Call[] = [];
  let now = 1_800_000_000_000;
  const ctx: NetCtx = {
    now: () => now,
    resolve: async (h) => dns[h] ?? ['93.184.216.34'],
    fetch: async (url, init = {}) => {
      const headers: Record<string, string> = {};
      new Headers(init.headers as any).forEach((v, k) => { headers[k] = v; });
      const c: Call = { method: (init.method || 'GET').toUpperCase(), url, headers, body: init.body };
      calls.push(c);
      for (const h of handlers) { const r = await h(c); if (r) return r; }
      return new Response('not found', { status: 404 });
    },
  };
  return { ctx, calls, tick: (ms: number) => { now += ms; } };
}

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...headers } });

function memStore() {
  const docs = new Map<string, Record<string, any>>();
  let n = 0;
  const store: OpenPublishStore = {
    get: async (p) => (docs.has(p) ? structuredClone(docs.get(p)!) : null),
    set: async (p, d) => { docs.set(p, structuredClone(d) as any); return true; },
    patch: async (p, d) => { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
    create: async (c, d) => { const id = `doc${String(++n).padStart(4, '0')}`; docs.set(`${c}/${id}`, structuredClone(d) as any); return id; },
    query: async (c, f, l) => [...docs.entries()]
      .filter(([k, v]) => k.startsWith(c + '/') && k.split('/').length === 2 && f.every(x => v[x.field] === x.value))
      .slice(0, l).map(([k, v]) => ({ id: k.split('/')[1], data: structuredClone(v) })),
    delete: async (p) => docs.delete(p),
  };
  return { store, docs };
}

// Fake "encryption" that is visibly not the plain value, so tests can assert nothing raw is stored.
const enc = (o: object) => 'ENC:' + Buffer.from(JSON.stringify(o)).toString('base64');
const dec = (s: string) => JSON.parse(Buffer.from(s.slice(4), 'base64').toString());

async function harness(handlers: Handler[], opts: { users?: Record<string, any> } = {}) {
  const net = fakeNet(handlers);
  const { store, docs } = memStore();
  const pending: Promise<void>[] = [];
  const deps: Partial<OpenPublishDeps> = {
    store, net: net.ctx, encrypt: enc, decrypt: dec,
    verify: async (t) => (t.startsWith('tok-') ? t.slice(4) : null),
    getUser: async (uid) => opts.users?.[uid] ?? { uid },
    defer: (fn) => { pending.push(fn()); },
    appBase: 'https://plajah.test',
  };
  const app = express();
  app.use(express.json());
  app.use('/api/open-publish', createOpenPublishRouter(deps));
  const server = await new Promise<import('node:http').Server>(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/open-publish`;
  const call = async (method: string, path: string, body?: unknown, uid = 'alice') => {
    // Real fetch, but only to our own loopback test server.
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer tok-${uid}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) as any };
  };
  const drain = async () => { while (pending.length) await pending.shift(); };
  return { ...net, docs, call, drain, close: () => new Promise<void>(r => server.close(() => r())) };
}

const PT = 'https://tube.example.org';
const FW = 'https://music.example.net';

const peertubeAuth: Handler = (c) => {
  if (c.url === `${PT}/api/v1/oauth-clients/local`) return json({ client_id: 'cid', client_secret: 'csec' });
  if (c.url === `${PT}/api/v1/users/token`) {
    const p = new URLSearchParams(String(c.body));
    if (p.get('grant_type') === 'password') return p.get('password') === 'hunter2' ? json({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, refresh_token_expires_in: 1_209_600 }) : json({ error: 'invalid_grant' }, 400);
    if (p.get('grant_type') === 'refresh_token' && p.get('refresh_token') === 'RT1') return json({ access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, refresh_token_expires_in: 1_209_600 });
    return json({ error: 'invalid_grant' }, 400);
  }
  if (c.url === `${PT}/api/v1/users/me`) return json({ username: 'alice', account: { displayName: 'Alice' }, videoChannels: [{ id: 7, name: 'alice_channel', displayName: 'Alice TV' }] });
  return undefined;
};

const goodVideo = { ownerId: 'alice', title: 'My Reel', description: 'hi', muxPlaybackId: 'AbCdEf0123456789', tags: ['music'], timestamp: 1 };

// ─── Pure policy + guard ────────────────────────────────────────────────────

test('instanceOrigin: https only, public hostnames, no paths or odd ports', () => {
  assert.equal(instanceOrigin('tube.example.org'), PT);
  assert.equal(instanceOrigin('https://tube.example.org/'), PT);
  for (const bad of ['http://tube.example.org', 'https://localhost', 'https://10.0.0.5', 'https://169.254.169.254', 'https://box.internal', 'https://tube.example.org:8443', 'https://u:p@tube.example.org', 'ftp://x.org', '']) {
    assert.throws(() => instanceOrigin(bad), OpenPublishError, bad);
  }
});

test('assertPublicHost blocks hostnames that resolve to private addresses; guardedFetch refuses redirects', async () => {
  const net = fakeNet([(c) => (c.url.endsWith('/hop') ? new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } }) : undefined)], { 'evil.example.com': ['10.0.0.8'], 'mixed.example.com': ['93.184.216.34', '::1'] });
  await assert.rejects(assertPublicHost(net.ctx, 'https://evil.example.com/'), /private network/);
  await assert.rejects(assertPublicHost(net.ctx, 'https://mixed.example.com/'), /private network/);
  await assertPublicHost(net.ctx, PT);
  await assert.rejects(guardedFetch(net.ctx, PT, `${PT}/hop`), /redirected/);
  await assert.rejects(guardedFetch(net.ctx, PT, 'https://other.example.org/x'), /off its own address/);
});

test('videoBlockers: private, unreleased, paywalled, exclusive, rights hold, child owner, no source', () => {
  const now = 1_800_000_000_000;
  assert.deepEqual(videoBlockers(goodVideo, { uid: 'alice' }, now), []);
  const codes = (v: any, o: any = {}) => videoBlockers({ ...goodVideo, ...v }, o, now).map(b => b.code);
  assert.deepEqual(codes({ isPrivate: true }), ['private']);
  assert.deepEqual(codes({ isScheduled: true, releaseDate: now + 1000 }), ['unreleased']);
  assert.deepEqual(codes({ isScheduled: true, releaseDate: now - 1000 }), []);
  assert.deepEqual(codes({ price: 2.99 }), ['paywalled']);
  assert.deepEqual(codes({ isPaywalled: true }), ['paywalled']);
  assert.deepEqual(codes({ isExclusive: true }), ['exclusive']);
  assert.deepEqual(codes({ copyrightHold: { noticeId: 'n1' } }), ['rights_held']);
  assert.deepEqual(codes({}, { accountType: 'CHILD' }), ['child_account']);
  assert.deepEqual(codes({}, { birthYear: new Date(now).getUTCFullYear() - 15 }), ['child_account']);
  assert.deepEqual(codes({ muxPlaybackId: undefined, url: '' }), ['no_source']);
  assert.equal(isMinorAccount({ birthYear: 1990 }, now), false);
});

test('albumBlockers: album-level stops all; songs need cleared/recorded rights; paid or video tracks excluded', () => {
  const cleared = { writing: 'sole', source: 'original', deal: 'none' };
  const album = {
    ownerId: 'alice', title: 'LP', isPublic: true,
    tracks: [
      { id: 't1', title: 'Clear', url: 'https://cdn.example.com/1.mp3', trackMeta: { rights: cleared } },
      { id: 't2', title: 'Cowrite', url: 'https://cdn.example.com/2.mp3', trackMeta: { rights: { ...cleared, writing: 'cowriters' } } },
      { id: 't3', title: 'Unanswered', url: 'https://cdn.example.com/3.mp3' },
      { id: 't4', title: 'Talk', kind: 'PODCAST', url: 'https://cdn.example.com/4.mp3' },
      { id: 't5', title: 'Paid', url: 'https://cdn.example.com/5.mp3', price: 1, trackMeta: { rights: cleared } },
      { id: 't6', title: 'Clip', mediaKind: 'VIDEO', url: 'https://cdn.example.com/6.mp4' },
      { id: 't7', title: 'Declared', url: 'https://cdn.example.com/7.mp3', trackMeta: { rights: { ...cleared, source: 'cover', proof: 'Licensed via HFA 2026' } } },
    ],
  };
  const p = albumBlockers(album, {}, 1);
  assert.deepEqual(p.album, []);
  assert.deepEqual(p.eligible.map(t => t.id), ['t1', 't4', 't7']);
  assert.deepEqual(Object.fromEntries(p.tracks.map(b => [b.trackId, b.code])), { t2: 'rights_held', t3: 'rights_held', t5: 'paywalled', t6: 'not_audio' });
  assert.deepEqual(albumBlockers({ ...album, isDraft: true }, {}, 1).album.map(b => b.code), ['unreleased']);
  assert.deepEqual(albumBlockers({ ...album, price: 9.99 }, {}, 1).album.map(b => b.code), ['paywalled']);
  assert.deepEqual(albumBlockers({ ...album, isPublic: false }, {}, 1).album.map(b => b.code), ['private']);
});

test('cleanMeta keeps PeerTube limits', () => {
  const m = cleanMeta({ channelId: 1, name: 'ab', privacy: 'unlisted', tags: ['#ok', 'x', 'y'.repeat(40), 'a1', 'b2', 'c3', 'd4', 'e5'] });
  assert.ok(m.name.length >= 3);
  assert.deepEqual(m.tags, ['ok', 'a1', 'b2', 'c3', 'd4']);
  assert.equal(m.privacy, 'unlisted');
});

// ─── PeerTube via the router ────────────────────────────────────────────────

test('PeerTube connect: password used once, never stored; tokens encrypted; channels listed', async () => {
  const h = await harness([peertubeAuth]);
  try {
    assert.equal((await h.call('GET', '/accounts', undefined, '')).status, 401);
    const bad = await h.call('POST', '/peertube/connect', { instance: 'tube.example.org', username: 'alice', password: 'nope' });
    assert.equal(bad.status, 401);
    const r = await h.call('POST', '/peertube/connect', { instance: 'tube.example.org', username: 'alice', password: 'hunter2' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.account.instance, PT);
    assert.deepEqual(r.body.channels.map((c: any) => c.id), [7]);
    assert.equal(r.body.account.credsEnc, undefined);
    const dump = JSON.stringify([...h.docs.values()]);
    assert.ok(!dump.includes('hunter2'), 'password must never be stored');
    assert.ok(!dump.includes('AT1'), 'token must be stored encrypted');
    const list = await h.call('GET', '/accounts');
    assert.equal(list.body.accounts.length, 1);
    const blocked = await h.call('POST', '/peertube/connect', { instance: 'https://127.0.0.1', username: 'a', password: 'b' });
    assert.equal(blocked.status, 400);
  } finally { await h.close(); }
});

test('child accounts cannot connect', async () => {
  const h = await harness([peertubeAuth], { users: { kid: { isChild: true } } });
  try {
    const r = await h.call('POST', '/peertube/connect', { instance: PT, username: 'k', password: 'hunter2' }, 'kid');
    assert.equal(r.status, 403);
  } finally { await h.close(); }
});

test('PeerTube publish: Mux MP4 → import by URL → processing → done; link + views on the video', async () => {
  let state = 3; // TO_IMPORT
  const h = await harness([
    peertubeAuth,
    (c) => (c.method === 'HEAD' && c.url === 'https://stream.mux.com/AbCdEf0123456789/capped-1080p.mp4' ? new Response(null, { status: 404 }) : undefined),
    (c) => (c.method === 'HEAD' && c.url === 'https://stream.mux.com/AbCdEf0123456789/high.mp4' ? new Response(null, { status: 200 }) : undefined),
    (c) => {
      if (c.method === 'POST' && c.url === `${PT}/api/v1/videos/imports`) {
        const fd = c.body as FormData;
        assert.equal(fd.get('targetUrl'), 'https://stream.mux.com/AbCdEf0123456789/high.mp4');
        assert.equal(fd.get('channelId'), '7');
        assert.equal(fd.get('privacy'), '2');
        assert.match(String(fd.get('description')), /Originally on Plajah: https:\/\/plajah\.test\/share\?type=video&id=vid0001/);
        assert.equal(c.headers.authorization, 'Bearer AT1');
        return json({ video: { id: 42, uuid: 'u-42', shortUUID: 's42' } });
      }
      return undefined;
    },
    (c) => (c.method === 'GET' && c.url === `${PT}/api/v1/videos/42` ? json({ id: 42, state: { id: state, label: 'x' }, views: 17 }) : undefined),
    (c) => (c.url.startsWith(`${PT}/api/v1/users/me/videos/imports`) ? json({ data: [{ state: { id: 6 }, video: { id: 42 } }] }) : undefined),
  ]);
  try {
    const conn = await h.call('POST', '/peertube/connect', { instance: PT, username: 'alice', password: 'hunter2' });
    const accountId = conn.body.account.id;
    h.docs.set('videos/vid0001', { ...goodVideo });
    const pub = await h.call('POST', '/peertube/publish', { accountId, videoId: 'vid0001', channelId: 7, privacy: 'unlisted' });
    assert.equal(pub.status, 202, JSON.stringify(pub.body));
    await h.drain();
    let job = (await h.call('GET', `/jobs/${pub.body.jobId}`)).body.job;
    assert.equal(job.method, 'import');
    assert.equal(job.items[0].url, `${PT}/w/s42`);
    assert.equal(job.uid, undefined);
    const vid = h.docs.get('videos/vid0001')!;
    assert.equal(vid.openPublishLinks[0].remoteId, '42');
    assert.equal(vid.openPublishLinks[0].state, 'processing');

    state = 1; h.tick(5000);
    job = (await h.call('GET', `/jobs/${pub.body.jobId}`)).body.job;
    assert.equal(job.status, 'done');
    const links = (await h.call('GET', '/links?kind=video&id=vid0001')).body.links;
    assert.equal(links[0].state, 'published');
    assert.equal(links[0].views, 17);

    const again = await h.call('POST', '/peertube/publish', { accountId, videoId: 'vid0001', channelId: 7 });
    assert.equal(again.status, 409);
  } finally { await h.close(); }
});

test('PeerTube publish: import disabled (409) → resumable upload streamed in chunks; expired token refreshed', async () => {
  const size = 20 * 1024 * 1024 + 123; // 3 chunks of 8 MiB
  const puts: string[] = [];
  const h = await harness([
    peertubeAuth,
    (c) => (c.method === 'HEAD' && c.url.endsWith('/capped-1080p.mp4') ? new Response(null, { status: 200 }) : undefined),
    (c) => (c.method === 'POST' && c.url === `${PT}/api/v1/videos/imports` ? json({ error: 'disabled' }, 409) : undefined),
    (c) => (c.method === 'GET' && c.url === 'https://stream.mux.com/AbCdEf0123456789/capped-1080p.mp4'
      ? new Response(new Uint8Array(size), { headers: { 'content-type': 'video/mp4', 'content-length': String(size) } }) : undefined),
    (c) => {
      if (c.method === 'POST' && c.url === `${PT}/api/v1/videos/upload-resumable`) {
        assert.equal(c.headers['x-upload-content-length'], String(size));
        assert.equal(c.headers.authorization, 'Bearer AT2');
        return new Response(null, { status: 201, headers: { location: '/api/v1/videos/upload-resumable?upload_id=abc' } });
      }
      if (c.method === 'PUT' && c.url === `${PT}/api/v1/videos/upload-resumable?upload_id=abc`) {
        puts.push(c.headers['content-range']);
        const end = Number(/-(\d+)\//.exec(c.headers['content-range'])![1]);
        return end === size - 1 ? json({ video: { id: 9, uuid: 'u9', shortUUID: 's9' } }) : new Response(null, { status: 308, headers: { range: `bytes=0-${end}` } });
      }
      return undefined;
    },
  ]);
  try {
    const conn = await h.call('POST', '/peertube/connect', { instance: PT, username: 'alice', password: 'hunter2' });
    h.tick(2 * 3600_000); // access token (1h) expired → refresh to AT2
    h.docs.set('videos/vid0002', { ...goodVideo });
    const pub = await h.call('POST', '/peertube/publish', { accountId: conn.body.account.id, videoId: 'vid0002', channelId: 7 });
    await h.drain();
    const job = h.docs.get(`${JOBS}/${pub.body.jobId}`)!;
    assert.equal(job.status, 'processing', job.error);
    assert.equal(job.method, 'upload');
    assert.deepEqual(puts, [`bytes 0-8388607/${size}`, `bytes 8388608-16777215/${size}`, `bytes 16777216-${size - 1}/${size}`]);
    const acct = h.docs.get(`${ACCOUNTS}/${conn.body.account.id}`)!;
    assert.equal(dec(acct.credsEnc).refreshToken, 'RT2');
  } finally { await h.close(); }
});

test('PeerTube publish refuses blocked and foreign videos', async () => {
  const h = await harness([peertubeAuth]);
  try {
    const conn = await h.call('POST', '/peertube/connect', { instance: PT, username: 'alice', password: 'hunter2' });
    h.docs.set('videos/paid0001', { ...goodVideo, price: 5 });
    h.docs.set('videos/bobs0001', { ...goodVideo, ownerId: 'bob' });
    const paid = await h.call('POST', '/peertube/publish', { accountId: conn.body.account.id, videoId: 'paid0001', channelId: 7 });
    assert.equal(paid.status, 422);
    assert.equal(paid.body.blockers[0].code, 'paywalled');
    const foreign = await h.call('POST', '/peertube/publish', { accountId: conn.body.account.id, videoId: 'bobs0001', channelId: 7 });
    assert.equal(foreign.status, 403);
    const otherUsersAccount = await h.call('POST', '/peertube/publish', { accountId: conn.body.account.id, videoId: 'bobs0001', channelId: 7 }, 'bob');
    assert.equal(otherUsersAccount.status, 404);
  } finally { await h.close(); }
});

test('delete remote copy and disconnect', async () => {
  let deleted = false; let revoked = false;
  const h = await harness([
    peertubeAuth,
    (c) => (c.method === 'DELETE' && c.url === `${PT}/api/v1/videos/42` ? (deleted = true, new Response(null, { status: 204 })) : undefined),
    (c) => (c.url === `${PT}/api/v1/users/revoke-token` ? (revoked = true, json({})) : undefined),
  ]);
  try {
    const conn = await h.call('POST', '/peertube/connect', { instance: PT, username: 'alice', password: 'hunter2' });
    const accountId = conn.body.account.id;
    const lid = `peertube_${accountId}_42`;
    h.docs.set('videos/vid0003', { ...goodVideo, openPublishLinks: [{ id: lid, network: 'peertube', accountId, instance: PT, remoteId: '42', url: `${PT}/w/s42`, state: 'published', jobId: 'j', createdAt: 1 }] });
    const del = await h.call('DELETE', '/links', { kind: 'video', id: 'vid0003', linkId: lid });
    assert.equal(del.status, 200);
    assert.ok(deleted);
    assert.deepEqual(h.docs.get('videos/vid0003')!.openPublishLinks, []);
    const dis = await h.call('DELETE', `/accounts/${accountId}`);
    assert.equal(dis.status, 200);
    assert.ok(revoked);
    assert.equal(h.docs.has(`${ACCOUNTS}/${accountId}`), false);
  } finally { await h.close(); }
});

// ─── Funkwhale via the router ───────────────────────────────────────────────

test('Funkwhale: OOB code connect, channel album + uploads, import status → track links', async () => {
  const uploads: FormData[] = [];
  let status = 'pending';
  const h = await harness([
    (c) => (c.method === 'POST' && c.url === `${FW}/api/v1/oauth/apps/` ? json({ client_id: 'fwcid', client_secret: 'fwsec' }) : undefined),
    (c) => {
      if (c.method === 'POST' && c.url === `${FW}/api/v1/oauth/token/`) {
        const p = new URLSearchParams(String(c.body));
        assert.equal(p.get('redirect_uri'), 'urn:ietf:wg:oauth:2.0:oob');
        return p.get('code') === 'GOOD' ? json({ access_token: 'FWAT', refresh_token: 'FWRT', expires_in: 36000 }) : json({ error: 'invalid_grant' }, 400);
      }
      return undefined;
    },
    (c) => (c.url === `${FW}/api/v1/users/me/` ? json({ username: 'alice', full_username: 'alice@music.example.net' }) : undefined),
    (c) => (c.url.startsWith(`${FW}/api/v1/libraries/`) ? json({ results: [{ uuid: 'aaaaaaaa-1111', name: 'Mine', privacy_level: 'everyone' }] }) : undefined),
    (c) => (c.url.startsWith(`${FW}/api/v1/channels/`) ? json({ results: [{ uuid: 'cccccccc-2222', artist: { id: 55, name: 'Alice Band' } }] }) : undefined),
    (c) => (c.method === 'POST' && c.url === `${FW}/api/v1/albums/` ? (assert.equal(JSON.parse(String(c.body)).artist, 55), json({ id: 900 })) : undefined),
    (c) => (c.method === 'GET' && c.url.startsWith('https://cdn.example.com/') ? new Response(new Uint8Array(1000), { headers: { 'content-type': 'audio/mpeg', 'content-length': '1000' } }) : undefined),
    (c) => {
      if (c.method === 'POST' && c.url === `${FW}/api/v1/uploads/`) { uploads.push(c.body as FormData); return json({ uuid: `up-${uploads.length}`, import_status: 'pending' }, 201); }
      const m = /\/api\/v1\/uploads\/(up-\d)\/$/.exec(c.url);
      if (m && c.method === 'GET') return json({ uuid: m[1], import_status: status, track: status === 'finished' ? { id: Number(m[1].slice(3)) + 100 } : null });
      return undefined;
    },
  ]);
  try {
    const start = await h.call('POST', '/funkwhale/connect/start', { instance: 'music.example.net' });
    assert.equal(start.status, 200, JSON.stringify(start.body));
    assert.match(start.body.authorizeUrl, /^https:\/\/music\.example\.net\/authorize\?response_type=code&client_id=fwcid/);
    assert.equal((await h.call('GET', '/accounts')).body.accounts.length, 0, 'pending accounts are hidden');
    assert.equal((await h.call('POST', '/funkwhale/connect/finish', { accountId: start.body.accountId, code: 'BAD' })).status, 401);
    const fin = await h.call('POST', '/funkwhale/connect/finish', { accountId: start.body.accountId, code: 'GOOD' });
    assert.equal(fin.status, 200, JSON.stringify(fin.body));
    assert.ok(!JSON.stringify([...h.docs.values()]).includes('FWAT'));
    const targets = (await h.call('GET', `/accounts/${start.body.accountId}/targets`)).body;
    assert.equal(targets.channels[0].artistId, 55);

    const cleared = { writing: 'sole', source: 'original', deal: 'none' };
    h.docs.set('albums/alb00001', { ownerId: 'alice', title: 'LP', isPublic: true, tracks: [
      { id: 't1', title: 'One', url: 'https://cdn.example.com/1.mp3', trackMeta: { rights: cleared } },
      { id: 't2', title: 'Two', url: 'https://cdn.example.com/2.flac', trackMeta: { rights: cleared } },
      { id: 't3', title: 'Held', url: 'https://cdn.example.com/3.mp3', trackMeta: { rights: { ...cleared, deal: 'publisher' } } },
    ] });
    const chk = (await h.call('POST', '/check', { kind: 'album', id: 'alb00001' })).body;
    assert.deepEqual(chk.eligibleTrackIds, ['t1', 't2']);
    const pub = await h.call('POST', '/funkwhale/publish', { accountId: start.body.accountId, albumId: 'alb00001', target: { type: 'channel', uuid: 'cccccccc-2222', artistId: 55 } });
    assert.equal(pub.status, 202, JSON.stringify(pub.body));
    assert.equal(pub.body.skipped[0].trackId, 't3');
    await h.drain();
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0].get('channel'), 'cccccccc-2222');
    assert.equal(JSON.parse(String(uploads[1].get('import_metadata'))).album, 900);
    assert.equal(JSON.parse(String(uploads[1].get('import_metadata'))).position, 2);
    assert.equal((uploads[1].get('audio_file') as File).name, 'Two.flac');

    status = 'finished'; h.tick(5000);
    const job = (await h.call('GET', `/jobs/${pub.body.jobId}`)).body.job;
    assert.equal(job.status, 'done');
    const links = h.docs.get('albums/alb00001')!.openPublishLinks;
    assert.deepEqual(links.map((l: any) => [l.trackId, l.url]), [['t1', `${FW}/library/tracks/101`], ['t2', `${FW}/library/tracks/102`]]);
  } finally { await h.close(); }
});

test('funkwhaleAuthorizeUrl uses the out-of-band redirect', () => {
  const u = new URL(funkwhaleAuthorizeUrl(FW, 'id1', 'st'));
  assert.equal(u.searchParams.get('redirect_uri'), 'urn:ietf:wg:oauth:2.0:oob');
  assert.equal(u.searchParams.get('scope'), 'read write');
});
