// Content HQ on B2 (routes/hqB2.ts + services/hq/b2Store.ts) over HTTP with fake auth, store and S3.
// Run: npx tsx --test tests/hqB2.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createHqB2Router, addOnBytes, type HqB2RouteDeps } from '../routes/hqB2';
import { b2ObjectRequest, hqB2Key, isB2Path } from '../services/hq/b2Store';
import { hqObjectPathInScope } from '../services/hqAccessPolicy';

type Doc = Record<string, any>;
const NOW = Date.UTC(2026, 11, 1, 12);
const MB = 1024 ** 2, GB = 1024 ** 3;
const CFG = { endpoint: 'https://s3.us-east-005.backblazeb2.com', region: 'us-east-005', bucket: 'plajah-dev', keyId: 'kid', appKey: 'secret' };

function world(opts: { enabled?: boolean; cap?: number; used?: number } = {}) {
  const docs = new Map<string, Doc>();
  const objects = new Map<string, number>();
  const s3calls: Array<{ method: string; key: string }> = [];
  let n = 0, t = NOW;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    const key = decodeURIComponent(new URL(url).pathname.split('/').slice(2).join('/'));
    s3calls.push({ method, key });
    if (method === 'POST' && url.includes('uploads=')) return new Response('<InitiateMultipartUploadResult><UploadId>mp-1</UploadId></InitiateMultipartUploadResult>');
    if (method === 'POST' && url.includes('uploadId=')) return new Response('<CompleteMultipartUploadResult/>');
    if (method === 'HEAD') { const s = objects.get(key); return s === undefined ? new Response(null, { status: 404 }) : new Response(null, { headers: { 'content-length': String(s) } }); }
    if (method === 'DELETE') { objects.delete(key); return new Response(null, { status: 204 }); }
    return new Response('?', { status: 400 });
  }) as unknown as typeof fetch;
  docs.set('organizations/org_grace01', { creatorId: 'owner01', staffUids: ['staff001'] });
  const deps: HqB2RouteDeps = {
    callerUid: async req => (req.headers.authorization ? req.headers.authorization.slice(7) : null),
    enabled: () => opts.enabled ?? true,
    s3: () => CFG,
    fetch: fakeFetch,
    get: async p => docs.get(p) ?? null,
    set: async (p, d) => { docs.set(p, structuredClone(d)); return true; },
    remove: async p => docs.delete(p),
    pendingFor: async scopeId => [...docs].filter(([p, d]) => p.startsWith('hqUploads/') && d.scopeId === scopeId && d.status === 'pending').map(([p, d]) => ({ id: p.split('/')[1], data: d })),
    canWrite: async (uid, kind, scopeId) => (kind === 'user' ? uid === scopeId : kind === 'org' && ['owner01', 'staff001'].includes(uid)),
    usedBytes: async () => opts.used ?? 0,
    capBytes: async () => opts.cap ?? 100 * GB,
    canWriteFile: async (uid, a) => (a.scopeKind === 'user' ? a.scopeId === uid : uid === 'owner01'),
    versionPaths: async assetId => [...docs].filter(([p, d]) => p.startsWith('hqAssetVersions/') && d.assetId === assetId).map(([, d]) => d.storagePath),
    now: () => t,
    newId: () => `id_${String(++n).padStart(8, '0')}`,
  };
  return { deps, docs, objects, s3calls, advance: (ms: number) => { t += ms; } };
}

async function call(deps: HqB2RouteDeps, method: string, path: string, uid: string | null, body?: Doc) {
  const app = express();
  app.use('/api/hq/b2', express.json(), createHqB2Router(deps));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/hq/b2${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() as Doc };
  } finally { server.close(); }
}

const file = (over: Doc = {}) => ({ scopeKind: 'user', scopeId: 'user0001', name: 'Brand guide.pdf', size: 3 * MB, mime: 'application/pdf', folder: 'Brand', ...over });

test('off by default answers b2_off so the browser falls back; sign-in required', async () => {
  const off = world({ enabled: false });
  const r = await call(off.deps, 'POST', '/uploads', 'user0001', file());
  assert.equal(r.status, 503); assert.equal(r.body.code, 'b2_off');
  assert.equal((await call(world().deps, 'POST', '/uploads', null, file())).status, 401);
});

test('single upload writes an ordinary HQ record on a b2: path, after the true size checks out', async () => {
  const w = world();
  const b = await call(w.deps, 'POST', '/uploads', 'user0001', file());
  assert.equal(b.status, 200, JSON.stringify(b.body));
  assert.equal(b.body.mode, 'single');
  assert.match(b.body.url, /X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost/);
  const key = hqB2Key('user', 'user0001', b.body.assetId, 1);
  assert.ok(b.body.url.includes(encodeURI(key)) || b.body.url.includes(key), 'object lives under the owner space');
  // nothing uploaded yet → verify fails, record never written
  w.objects.set(key, 3 * MB - 1);
  const bad = await call(w.deps, 'POST', `/uploads/${b.body.uploadId}/complete`, 'user0001', {});
  assert.equal(bad.status, 422);
  assert.equal(w.docs.has(`orgAssets/${b.body.assetId}`), false);
  // a fresh, honest upload
  const b2 = await call(w.deps, 'POST', '/uploads', 'user0001', file());
  w.objects.set(hqB2Key('user', 'user0001', b2.body.assetId, 1), 3 * MB);
  const ok = await call(w.deps, 'POST', `/uploads/${b2.body.uploadId}/complete`, 'user0001', {});
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const a = ok.body.asset;
  assert.equal(a.storagePath, `b2:${hqB2Key('user', 'user0001', b2.body.assetId, 1)}`);
  assert.equal(a.scanStatus, 'PENDING'); assert.equal(a.status, 'DRAFT'); assert.equal(a.folder, 'Brand');
  assert.equal(a.kind, 'pdf'); assert.equal(a.url, `/api/hq/assets/${b2.body.assetId}/download`);
  assert.ok(w.docs.get(`hqAssetVersions/${a.currentVersionId}`)?.storagePath === a.storagePath);
  assert.equal(hqObjectPathInScope(a, a.storagePath), true);
});

test('cap counts files already there plus uploads in flight; a full HQ says so', async () => {
  const w = world({ cap: 10 * GB, used: 6 * GB });
  assert.equal((await call(w.deps, 'POST', '/uploads', 'user0001', file({ size: 3 * GB, mime: 'video/mp4', name: 'a.mp4' }))).status, 200);
  const second = await call(w.deps, 'POST', '/uploads', 'user0001', file({ size: 2 * GB, mime: 'video/mp4', name: 'b.mp4' }));
  assert.equal(second.status, 413); assert.equal(second.body.code, 'over_cap');
  w.advance(25 * 3600_000); // the first reservation expired
  assert.equal((await call(w.deps, 'POST', '/uploads', 'user0001', file({ size: 2 * GB, mime: 'video/mp4', name: 'b.mp4' }))).status, 200);
});

test('multipart for big files: parts signed in batches, complete sends every part', async () => {
  const w = world();
  const b = await call(w.deps, 'POST', '/uploads', 'owner01', file({ scopeKind: 'org', scopeId: 'org_grace01', size: 300 * MB, mime: 'video/mp4', name: 'Sunday.mp4' }));
  assert.equal(b.body.mode, 'multipart'); assert.equal(b.body.parts, 5);
  const parts = await call(w.deps, 'POST', `/uploads/${b.body.uploadId}/parts`, 'owner01', { partNumbers: [1, 2, 3, 4, 5] });
  assert.equal(parts.body.parts.length, 5);
  assert.equal((await call(w.deps, 'POST', `/uploads/${b.body.uploadId}/parts`, 'owner01', { partNumbers: [6] })).status, 400);
  assert.equal((await call(w.deps, 'POST', `/uploads/${b.body.uploadId}/complete`, 'owner01', { parts: [{ partNumber: 1, etag: 'x' }] })).status, 400);
  w.objects.set(hqB2Key('org', 'org_grace01', b.body.assetId, 1), 300 * MB);
  const done = await call(w.deps, 'POST', `/uploads/${b.body.uploadId}/complete`, 'owner01', { parts: [1, 2, 3, 4, 5].map(n => ({ partNumber: n, etag: `e${n}` })) });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  // someone else can't touch the upload
  assert.equal((await call(w.deps, 'POST', `/uploads/${b.body.uploadId}/parts`, 'staff001', { partNumbers: [1] })).status, 404);
});

test('who may upload where; bad input refused before anything is reserved', async () => {
  const w = world();
  assert.equal((await call(w.deps, 'POST', '/uploads', 'user0002', file())).status, 403);
  assert.equal((await call(w.deps, 'POST', '/uploads', 'staff001', file({ scopeKind: 'org', scopeId: 'org_grace01' }))).status, 200);
  for (const bad of [{ name: 'a/b.pdf' }, { size: 0 }, { size: 26 * GB }, { mime: 'nope' }, { scopeKind: 'galaxy' }, { scopeId: '../x' }]) {
    assert.ok([400, 413].includes((await call(w.deps, 'POST', '/uploads', 'user0001', file(bad))).status), JSON.stringify(bad));
  }
  assert.equal([...w.docs.keys()].filter(k => k.startsWith('hqUploads/')).length, 1);
});

test('delete erases every B2 version and the record, only for someone who can write the file', async () => {
  const w = world();
  const p1 = `b2:${hqB2Key('user', 'user0001', 'asset0001', 1)}`;
  w.docs.set('orgAssets/asset0001', { scopeKind: 'user', scopeId: 'user0001', storagePath: p1 });
  w.docs.set('orgAssetText/asset0001', { text: 'x' });
  assert.equal((await call(w.deps, 'DELETE', '/assets/asset0001', 'user0002')).status, 403);
  const p2 = `b2:${hqB2Key('user', 'user0001', 'asset0001', 2)}`;
  w.docs.set('hqAssetVersions/ver00001', { assetId: 'asset0001', storagePath: p1 });
  w.docs.set('hqAssetVersions/ver00002', { assetId: 'asset0001', storagePath: p2 });
  w.docs.set('hqAssetVersions/ver00003', { assetId: 'asset0001', storagePath: 'protected-hq/user/user0001/asset0001/v3_x.pdf' });
  const ok = await call(w.deps, 'DELETE', '/assets/asset0001', 'user0001');
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.erased, 2, 'both B2 versions erased; the Firebase one is left to the sweep');
  assert.deepEqual(w.s3calls.filter(c => c.method === 'DELETE').map(c => c.key).sort(), [p1.slice(3), p2.slice(3)].sort());
  assert.equal(w.docs.has('orgAssets/asset0001'), false);
  assert.equal(w.docs.has('orgAssetText/asset0001'), false);
});

test('paths: b2 keys stay inside their owner space; signed GET passes Range through', () => {
  const asset = { scopeKind: 'org', scopeId: 'org_grace01' };
  assert.equal(hqObjectPathInScope(asset, 'b2:hq/org/org_grace01/a/v1'), true);
  assert.equal(hqObjectPathInScope(asset, 'b2:hq/org/other/a/v1'), false);
  assert.equal(hqObjectPathInScope(asset, 'b2://hq/org/org_grace01/a/v1'), false);
  assert.equal(hqObjectPathInScope(asset, 'b2:hq/org/org_grace01/../x'), false);
  assert.equal(hqObjectPathInScope(asset, 'protected-hq/org/org_grace01/a/x.pdf'), true);
  assert.equal(isB2Path('b2:hq/x'), true); assert.equal(isB2Path('protected-hq/x'), false);
  const r = b2ObjectRequest(CFG, 'b2:hq/org/org_grace01/a/v1', 'bytes=0-99', new Date(NOW));
  assert.match(r.url, /hq\/org\/org_grace01\/a\/v1\?X-Amz-Algorithm/);
  assert.equal(r.headers.Range, 'bytes=0-99');
});

test('Drive storage add-ons stack on the HQ cap', async () => {
  const docs: Record<string, Doc> = {
    'driveAccounts/user0001': { addOnSkus: ['drive_1t', 'pool_1t'] },
    'orgDrive/org_grace01': { poolSkus: ['pool_5t', 'drive_250g'] },
    'businessPages/biz00001': { ownerId: 'user0001' },
  };
  const get = async (p: string) => docs[p] ?? null;
  const TB = 1024 ** 4;
  assert.equal(await addOnBytes('user', 'user0001', 'user0001', get), TB);
  assert.equal(await addOnBytes('org', 'org_grace01', 'x', get), 5 * TB);
  assert.equal(await addOnBytes('business', 'biz00001', 'someone', get), TB);
  assert.equal(await addOnBytes('user', 'nobody01', 'nobody01', get), 0);
});
