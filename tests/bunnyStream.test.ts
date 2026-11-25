// Bunny Stream (on-demand video, Mux replacement): config switch, URLs, status maps, TUS + webhook signing,
// playback resolver, and the routes with fake Bunny/Firestore. Run: npx tsx --test tests/bunnyStream.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';

import {
  bunnyStreamConfig, bunnyHlsUrl, bunnyMp4Url, bunnyThumbnailUrl, isBunnyGuid, maxResolution, videoStatusState,
  webhookStatusState, DEFAULT_RESOLUTIONS, type BunnyStreamConfig,
} from '../services/bunnyStream/core';
import { tusUploadAuth, verifyWebhook, type BunnyVideo } from '../services/bunnyStream/server';
import { resolvePlayback, bunnyDocFields } from '../services/video/playback';
import { createBunnyStreamRouter, bunnyWebhookHandler, finishedDocPatch, type HostedVideoRecord } from '../routes/bunnyStream';
import { isOnBunny, isBunnyUploadRef, bunnyGuidOfRef } from '../services/video/bunnyUpload';

const GUID = '3f2b8c1e-9a4d-4e6f-b2a1-0c9d8e7f6a5b';
const ENV = {
  BUNNY_STREAM_ENABLED: '1', BUNNY_STREAM_LIBRARY_ID: '123456', BUNNY_STREAM_API_KEY: 'lib-key',
  BUNNY_STREAM_READONLY_KEY: 'ro-key', BUNNY_STREAM_CDN_HOST: 'https://vz-test.b-cdn.net/',
};
const CFG = bunnyStreamConfig(ENV) as BunnyStreamConfig;

test('config: off unless enabled and complete; host + resolutions normalised', () => {
  assert.equal(bunnyStreamConfig({ ...ENV, BUNNY_STREAM_ENABLED: '' }), null);
  assert.equal(bunnyStreamConfig({ ...ENV, BUNNY_STREAM_READONLY_KEY: '' }), null);
  assert.equal(bunnyStreamConfig({ ...ENV, BUNNY_STREAM_LIBRARY_ID: 'abc' }), null);
  assert.equal(CFG.cdnHost, 'vz-test.b-cdn.net');
  assert.equal(CFG.resolutions, DEFAULT_RESOLUTIONS);
  assert.equal(bunnyStreamConfig({ ...ENV, BUNNY_STREAM_RESOLUTIONS: '720p, 1080p, 2160p' })!.resolutions, '720p,1080p,2160p');
});

test('URLs: only real GUIDs reach a path', () => {
  assert.ok(isBunnyGuid(GUID));
  assert.ok(!isBunnyGuid('../../etc') && !isBunnyGuid('abc') && !isBunnyGuid(undefined));
  assert.equal(bunnyHlsUrl('h', GUID), `https://h/${GUID}/playlist.m3u8`);
  assert.equal(bunnyThumbnailUrl('h', GUID), `https://h/${GUID}/thumbnail.jpg`);
  assert.equal(bunnyMp4Url('h', GUID, 1080), `https://h/${GUID}/play_1080p.mp4`);
  assert.throws(() => bunnyHlsUrl('h', 'x/../y'));
});

test('status maps: Get Video and webhook enums are different', () => {
  assert.equal(videoStatusState(4), 'ready');
  assert.equal(videoStatusState(8), 'ready');
  assert.equal(videoStatusState(3), 'processing');
  assert.equal(videoStatusState(5), 'errored');
  assert.equal(videoStatusState(0), 'uploading');
  assert.equal(webhookStatusState(3), 'ready');      // 3 = Finished on webhooks (Transcoding on Get Video)
  assert.equal(webhookStatusState(4), 'processing'); // one resolution done, not all
  assert.equal(webhookStatusState(5), 'errored');
  assert.equal(webhookStatusState(32), 'deleted');
  assert.equal(webhookStatusState(9), null);         // captions etc. don't change playability
  assert.equal(maxResolution('360p,1080p,720p'), 1080);
  assert.equal(maxResolution(null), 0);
});

test('TUS signature = sha256hex(library + key + expiry + guid), at least 1 h', () => {
  const a = tusUploadAuth(CFG, GUID, 60, 1_000_000);
  assert.equal(a.expiresAt, 1_000_000 + 3600);
  const want = createHash('sha256').update('123456' + 'lib-key' + String(a.expiresAt) + GUID).digest('hex');
  assert.equal(a.headers.AuthorizationSignature, want);
  assert.equal(a.headers.VideoId, GUID);
  assert.equal(a.headers.LibraryId, '123456');
  assert.equal(a.headers.EnabledResolutions, DEFAULT_RESOLUTIONS);
  assert.ok(!JSON.stringify(a).includes('lib-key'), 'library key never leaves the server');
});

const signed = (body: string, key = 'ro-key') => ({
  'x-bunnystream-signature-version': 'v1', 'x-bunnystream-signature-algorithm': 'hmac-sha256',
  'x-bunnystream-signature': createHmac('sha256', key).update(Buffer.from(body)).digest('hex'),
});

test('webhook signature: raw bytes, read-only key, constant-time', () => {
  const body = JSON.stringify({ VideoLibraryId: 123456, VideoGuid: GUID, Status: 3 });
  assert.ok(verifyWebhook(Buffer.from(body), signed(body), 'ro-key'));
  assert.ok(!verifyWebhook(Buffer.from(body + ' '), signed(body), 'ro-key'), 'any byte change fails');
  assert.ok(!verifyWebhook(Buffer.from(body), signed(body, 'other'), 'ro-key'));
  assert.ok(!verifyWebhook(Buffer.from(body), { ...signed(body), 'x-bunnystream-signature': 'zz' }, 'ro-key'));
  assert.ok(!verifyWebhook(Buffer.from(body), { ...signed(body), 'x-bunnystream-signature-version': 'v2' }, 'ro-key'));
  assert.ok(!verifyWebhook(Buffer.from(body), signed(body), ''));
});

test('resolver: Bunny > Mux > direct; Bunny docs keep old players working via url', () => {
  const both = { bunnyVideoId: GUID, bunnyCdnHost: 'vz-test.b-cdn.net', muxPlaybackId: 'abcdefghij12345' };
  assert.equal(resolvePlayback(both)!.provider, 'bunny');
  assert.equal(resolvePlayback({ ...both, bunnyCdnHost: 'evil.com/x?' })!.provider, 'mux', 'bad host falls back');
  assert.equal(resolvePlayback({ muxPlaybackId: 'abcdefghij12345' })!.src, 'https://stream.mux.com/abcdefghij12345.m3u8');
  assert.deepEqual(resolvePlayback({ url: 'https://x/v.m3u8?t=1' }), { provider: 'direct', src: 'https://x/v.m3u8?t=1', isHls: true, poster: undefined });
  assert.equal(resolvePlayback({ bunnyVideoId: GUID, bunnyCdnHost: 'h', thumbnailUrl: 'own.png' })!.poster, 'own.png');
  assert.equal(resolvePlayback({}), null);
  const f = bunnyDocFields(GUID, 'h');
  assert.equal(f.url, `https://h/${GUID}/playlist.m3u8`);
  assert.equal(f.videoHost, 'bunny');
});

test('upload refs + isOnBunny: Bunny videos are never re-ingested into Mux', () => {
  assert.ok(isBunnyUploadRef(`bunny:${GUID}`) && !isBunnyUploadRef('Mux123abc') && !isBunnyUploadRef(null));
  assert.equal(bunnyGuidOfRef(`bunny:${GUID}`), GUID);
  assert.ok(isOnBunny({ bunnyVideoId: GUID }));
  assert.ok(isOnBunny({ videoHost: 'bunny' }));
  assert.ok(isOnBunny({ muxUploadId: `bunny:${GUID}` }), 'still uploading to Bunny');
  assert.ok(isOnBunny({ url: `https://vz-test.b-cdn.net/${GUID}/playlist.m3u8` }), 'bare Bunny url (createMuxAssetFromUrl choke point)');
  assert.ok(!isOnBunny({ url: 'https://firebasestorage.googleapis.com/v0/b/x/o/v.mp4' }));
  assert.ok(!isOnBunny({ muxUploadId: 'abc', url: 'https://cdn.example.com/a.b-cdn.net/x' }));
  assert.ok(!isOnBunny(null));
});

test('finishedDocPatch: Bunny fields + ready, keeps creator poster and measured duration', () => {
  const v = { width: 1080, height: 1920, length: 61 };
  const fresh = finishedDocPatch('h', GUID, {}, v);
  assert.equal(fresh.url, `https://h/${GUID}/playlist.m3u8`);
  assert.equal(fresh.muxUploadId, null);
  assert.equal(fresh.status, 'ready');
  assert.equal(fresh.thumbnailUrl, `https://h/${GUID}/thumbnail.jpg`);
  assert.equal(fresh.aspectRatio, 'VERTICAL');
  assert.equal(fresh.duration, 61);
  const kept = finishedDocPatch('h', GUID, { thumbnailUrl: 'own.png', duration: 60, aspectRatio: 'VERTICAL' }, v);
  assert.ok(!('thumbnailUrl' in kept) && !('duration' in kept) && !('aspectRatio' in kept));
});

// ── Routes with fakes ─────────────────────────────────────────────────────────────────────────────
function harness(opts: { enabled?: boolean; uid?: string; admin?: boolean; status?: number; onReady?: (g: string) => void } = {}) {
  const records = new Map<string, HostedVideoRecord>();
  const calls: string[] = [];
  const video = (): BunnyVideo => ({ guid: GUID, title: 't', status: opts.status ?? 4, length: 90, width: 1920, height: 1080, availableResolutions: '360p,720p,1080p', encodeProgress: 100, hasMP4Fallback: true });
  const deps = {
    config: () => (opts.enabled === false ? null : CFG),
    store: {
      get: async (g: string) => records.get(g) ?? null,
      set: async (g: string, r: HostedVideoRecord) => { records.set(g, r); return true; },
      patch: async (g: string, f: Partial<HostedVideoRecord>) => { records.set(g, { ...records.get(g)!, ...f }); return true; },
    },
    api: {
      createVideo: async (_c: BunnyStreamConfig, title: string) => { calls.push(`create:${title}`); return video(); },
      getVideo: async () => { calls.push('get'); return video(); },
      tusUploadAuth: (c: BunnyStreamConfig, g: string) => tusUploadAuth(c, g),
    },
    now: () => 1000,
  };
  const app = express();
  app.post('/api/bunny/webhook', express.raw({ type: '*/*' }), bunnyWebhookHandler({ ...deps, verify: verifyWebhook, onReady: async (_c, g) => { opts.onReady?.(g); } }));
  app.use('/api/video-host', express.json(), createBunnyStreamRouter({
    ...deps,
    uploadGuards: [(req, _res, next) => { (req as any).uid = opts.uid; next(); }],
    readGuards: [(req, _res, next) => { (req as any).uid = opts.uid; next(); }],
    isAdmin: async () => !!opts.admin,
  }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { records, calls, base, close: () => server.close() };
}

test('routes: off → provider mux + 503', async () => {
  const h = harness({ enabled: false, uid: 'u1' });
  try {
    assert.deepEqual(await (await fetch(`${h.base}/api/video-host/provider`)).json(), { provider: 'mux' });
    assert.equal((await fetch(`${h.base}/api/video-host/bunny/uploads`, { method: 'POST' })).status, 503);
  } finally { h.close(); }
});

test('routes: upload records owner first, returns signed TUS headers without the key', async () => {
  const h = harness({ uid: 'u1' });
  try {
    assert.deepEqual(await (await fetch(`${h.base}/api/video-host/provider`)).json(), { provider: 'bunny', cdnHost: 'vz-test.b-cdn.net' });
    const r = await fetch(`${h.base}/api/video-host/bunny/uploads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'My film', trace: 'ua=1' }) });
    const j = await r.json();
    assert.equal(r.status, 200);
    assert.equal(j.videoId, GUID);
    assert.equal(j.tus.headers.VideoId, GUID);
    assert.equal(j.playback.hlsUrl, `https://vz-test.b-cdn.net/${GUID}/playlist.m3u8`);
    assert.ok(!JSON.stringify(j).includes('lib-key') && !JSON.stringify(j).includes('ro-key'));
    assert.deepEqual(h.records.get(GUID), { provider: 'bunny', ownerUid: 'u1', title: 'My film', trace: 'ua=1', state: 'uploading', createdAt: 1000, updatedAt: 1000 });
  } finally { h.close(); }
});

test('routes: signed-out upload refused', async () => {
  const h = harness({});
  try { assert.equal((await fetch(`${h.base}/api/video-host/bunny/uploads`, { method: 'POST' })).status, 401); } finally { h.close(); }
});

test('routes: status is owner/admin only and updates the record', async () => {
  const h = harness({ uid: 'u2' });
  h.records.set(GUID, { provider: 'bunny', ownerUid: 'u1', title: 't', state: 'uploading', createdAt: 1, updatedAt: 1 });
  try {
    assert.equal((await fetch(`${h.base}/api/video-host/bunny/videos/${GUID}`)).status, 403);
    assert.equal((await fetch(`${h.base}/api/video-host/bunny/videos/not-a-guid`)).status, 400);
  } finally { h.close(); }
  const owner = harness({ uid: 'u1' });
  owner.records.set(GUID, { provider: 'bunny', ownerUid: 'u1', title: 't', state: 'uploading', createdAt: 1, updatedAt: 1 });
  try {
    const j = await (await fetch(`${owner.base}/api/video-host/bunny/videos/${GUID}`)).json();
    assert.equal(j.state, 'ready');
    assert.equal(j.mp4Url, `https://vz-test.b-cdn.net/${GUID}/play_1080p.mp4`);
    assert.equal(owner.records.get(GUID)!.state, 'ready');
    assert.equal(owner.records.get(GUID)!.durationSec, 90);
  } finally { owner.close(); }
});

test('resume: owner only, only while uploading, fresh signed headers', async () => {
  const rec = (ownerUid: string, state: string): HostedVideoRecord => ({ provider: 'bunny', ownerUid, title: 't', state, createdAt: 1, updatedAt: 1 });
  const post = (base: string) => fetch(`${base}/api/video-host/bunny/uploads/${GUID}/resume`, { method: 'POST' });
  const other = harness({ uid: 'u2' }); other.records.set(GUID, rec('u1', 'uploading'));
  try { assert.equal((await post(other.base)).status, 403); } finally { other.close(); }
  const done = harness({ uid: 'u1' }); done.records.set(GUID, rec('u1', 'ready'));
  try { assert.equal((await post(done.base)).status, 409); } finally { done.close(); }
  const owner = harness({ uid: 'u1' }); owner.records.set(GUID, rec('u1', 'uploading'));
  try {
    const j = await (await post(owner.base)).json();
    assert.equal(j.videoId, GUID);
    assert.equal(j.tus.headers.VideoId, GUID);
    assert.deepEqual(owner.calls, [], 'no new Bunny video is created on resume');
  } finally { owner.close(); }
});

test('webhook: bad signature 401; good one re-reads Bunny (never trusts the body); unknown videos ignored', async () => {
  const finished: string[] = [];
  const h = harness({ status: 4, onReady: g => finished.push(g) });
  h.records.set(GUID, { provider: 'bunny', ownerUid: 'u1', title: 't', state: 'processing', createdAt: 1, updatedAt: 1 });
  const post = (body: string, headers: Record<string, string>) => fetch(`${h.base}/api/bunny/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  try {
    const body = JSON.stringify({ VideoLibraryId: 123456, VideoGuid: GUID, Status: 3 });
    assert.equal((await post(body, signed(body, 'wrong'))).status, 401);
    assert.equal((await post(body, signed(body))).status, 200);
    assert.deepEqual(h.calls, ['get']);
    assert.equal(h.records.get(GUID)!.state, 'ready');
    assert.deepEqual(finished, [GUID], 'waiting docs are finished server-side');
    const other = JSON.stringify({ VideoLibraryId: 999, VideoGuid: GUID, Status: 3 });
    assert.equal((await (await post(other, signed(other))).json()).ignored, 'library');
    const stranger = JSON.stringify({ VideoLibraryId: 123456, VideoGuid: '00000000-0000-0000-0000-000000000000', Status: 3 });
    assert.equal((await (await post(stranger, signed(stranger))).json()).ignored, 'unknown video');
  } finally { h.close(); }
});
