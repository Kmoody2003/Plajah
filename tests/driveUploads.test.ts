// routes/drive.ts over HTTP with fake auth, store and S3: switch, quota, reservations, true-size
// check, multipart, org departments. Run: npx tsx --test tests/driveUploads.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createDriveRouter, type DriveRouteDeps } from '../routes/drive';
import { GiB, TiB } from '../services/drive/plans';

type Doc = Record<string, any>;
const NOW = Date.UTC(2026, 11, 1, 12);
const MB = 1024 ** 2;

function world(opts: { enabled?: boolean; plan?: string; headSize?: (key: string) => number | null } = {}) {
  const docs = new Map<string, Doc>();
  const s3calls: Array<{ method: string; url: string }> = [];
  const objects = new Map<string, number>(); // key → size the "store" holds
  let n = 0, t = NOW;
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    s3calls.push({ method, url });
    const key = decodeURIComponent(new URL(url).pathname.split('/').slice(2).join('/'));
    if (method === 'POST' && url.includes('uploads=')) return new Response('<InitiateMultipartUploadResult><UploadId>mp-1</UploadId></InitiateMultipartUploadResult>');
    if (method === 'POST' && url.includes('uploadId=')) return new Response('<CompleteMultipartUploadResult/>');
    if (method === 'HEAD') {
      const size = opts.headSize ? opts.headSize(key) : objects.get(key) ?? null;
      return size === null ? new Response(null, { status: 404 }) : new Response(null, { status: 200, headers: { 'content-length': String(size) } });
    }
    if (method === 'DELETE') { objects.delete(key); return new Response(null, { status: 204 }); }
    return new Response('?', { status: 400 });
  }) as unknown as typeof fetch;

  docs.set('organizations/org_grace01', { creatorId: 'owner', staffUids: ['vol'], ministries: [{ id: 'worship', headUids: [] }], departmentUids: { worship: ['vol'] } });
  docs.set('orgDrive/org_grace01', { poolSkus: ['pool_1t'], departmentCaps: { worship: 10 * GiB }, memberCaps: {} });

  const deps: DriveRouteDeps = {
    callerUid: async req => (req.headers.authorization ? req.headers.authorization.slice(7) : null),
    enabled: () => opts.enabled ?? true,
    store: { get: async p => docs.get(p) ?? null, set: async (p, d) => { docs.set(p, structuredClone(d)); return true; } },
    s3: () => ({ endpoint: 'https://s3.us-east-005.backblazeb2.com', region: 'us-east-005', bucket: 'plajah-dev', keyId: 'kid', appKey: 'secret' }),
    fetch: fakeFetch,
    personal: async () => ({ plan: (opts.plan as any) ?? 'nova', addOnSkus: [] }),
    orgPool: async id => { const d = docs.get(`orgDrive/${id}`); return d ? { poolSkus: d.poolSkus, departmentCaps: d.departmentCaps, memberCaps: d.memberCaps } : null; },
    orgAccess: async (uid, orgId) => { const o = docs.get(`organizations/${orgId}`); if (!o) return null; return o.creatorId === uid ? 'admin' : (o.staffUids || []).includes(uid) ? 'staff' : null; },
    inDepartment: async (uid, orgId, d) => (docs.get(`organizations/${orgId}`)?.departmentUids?.[d] || []).includes(uid),
    now: () => t,
    newId: () => `id_${String(++n).padStart(8, '0')}`,
    query: async (coll, field, value) => [...docs].filter(([p, d]) => p.startsWith(coll + '/') && d[field] === value).map(([p, d]) => ({ id: p.split('/')[1], data: structuredClone(d) })),
    remove: async p => docs.delete(p),
  };
  return { deps, docs, objects, s3calls, advance: (ms: number) => { t += ms; } };
}

async function call(deps: DriveRouteDeps, method: string, path: string, uid: string | null, body?: Doc) {
  const app = express();
  app.use('/api/drive', express.json(), createDriveRouter(deps));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/drive${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() as Doc };
  } finally { server.close(); }
}

test('off by default and signed-in only', async () => {
  const off = world({ enabled: false });
  assert.equal((await call(off.deps, 'GET', '/usage', 'user0001')).status, 503);
  const w = world();
  assert.equal((await call(w.deps, 'GET', '/usage', null)).status, 401);
});

test('single upload: signed PUT pins size + type, completes only after the store has the exact bytes', async () => {
  const w = world();
  const begin = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'Sermon notes.pdf', size: 3 * MB, mime: 'application/pdf' });
  assert.equal(begin.status, 200, JSON.stringify(begin.body));
  assert.equal(begin.body.mode, 'single');
  assert.match(begin.body.url, /X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost/);
  assert.ok(!begin.body.url.includes('Sermon'), 'file name never in the key');
  // Reserved immediately
  let usage = await call(w.deps, 'GET', '/usage', 'user0001');
  assert.equal(usage.body.reservedBytes, 3 * MB);
  // Nothing uploaded yet → verify fails, space released
  const early = await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/complete`, 'user0001', {});
  assert.equal(early.status, 422);
  usage = await call(w.deps, 'GET', '/usage', 'user0001');
  assert.deepEqual([usage.body.reservedBytes, usage.body.liveBytes], [0, 0]);
});

test('single upload happy path: file record written, usage moves from reserved to live', async () => {
  const w = world();
  const begin = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'logo.png', size: 2 * MB, mime: 'image/png' });
  const key = [...w.docs.entries()].find(([k]) => k === `driveUploads/${begin.body.uploadId}`)![1].key;
  w.objects.set(key, 2 * MB);
  const done = await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/complete`, 'user0001', {});
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.file.size, 2 * MB);
  assert.equal(w.docs.get(`driveFiles/${begin.body.fileId}`)!.scan, 'pending');
  const usage = await call(w.deps, 'GET', '/usage', 'user0001');
  assert.deepEqual([usage.body.liveBytes, usage.body.reservedBytes, usage.body.state], [2 * MB, 0, 'ok']);
  // A second complete is refused
  assert.equal((await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/complete`, 'user0001', {})).status, 409);
  // Someone else can't touch it
  assert.equal((await call(w.deps, 'DELETE', `/uploads/${begin.body.uploadId}`, 'user0002')).status, 404);
});

test('a client lying about size is caught by HEAD and the object is deleted', async () => {
  const w = world({ headSize: () => 9 * MB });
  const begin = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'a.bin', size: 1 * MB, mime: 'application/octet-stream' });
  const r = await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/complete`, 'user0001', {});
  assert.equal(r.status, 422);
  assert.ok(w.s3calls.some(c => c.method === 'DELETE'));
});

test('quota: reservations count, so parallel uploads cannot overshoot; full Drive says so', async () => {
  const w = world({ plan: 'free' }); // 5 GB, 2 GB max file
  const a = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'a.mov', size: 2 * GiB, mime: 'video/quicktime' });
  const b = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'b.mov', size: 2 * GiB, mime: 'video/quicktime' });
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  const c = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'c.mov', size: 2 * GiB, mime: 'video/quicktime' });
  assert.equal(c.status, 413);
  assert.equal(c.body.code, 'over_quota');
  const big = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'd.mov', size: 3 * GiB, mime: 'video/quicktime' });
  assert.equal(big.body.code, 'too_large');
  // Reservations expire after 24 h on their own
  w.advance(25 * 3600_000);
  const later = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'c.mov', size: 2 * GiB, mime: 'video/quicktime' });
  assert.equal(later.status, 200);
});

test('multipart: big file gets an upload id, parts signed in batches, complete sends every part', async () => {
  const w = world({ plan: 'studio_max' });
  const size = 10 * GiB;
  const begin = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'film.mov', size, mime: 'video/quicktime' });
  assert.equal(begin.body.mode, 'multipart', JSON.stringify(begin.body));
  assert.equal(begin.body.parts, Math.ceil(size / (64 * MB)));
  const parts = await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/parts`, 'user0001', { partNumbers: [1, 2, 3] });
  assert.equal(parts.body.parts.length, 3);
  assert.match(parts.body.parts[0].url, /partNumber=1/);
  assert.match(parts.body.parts[0].url, /uploadId=mp-1/);
  assert.equal((await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/parts`, 'user0001', { partNumbers: [99999] })).status, 400);
  const incomplete = await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/complete`, 'user0001', { parts: [{ partNumber: 1, etag: '"a"' }] });
  assert.equal(incomplete.body.code, 'bad_parts');
  const key = w.docs.get(`driveUploads/${begin.body.uploadId}`)!.key;
  w.objects.set(key, size);
  const all = Array.from({ length: begin.body.parts }, (_, i) => ({ partNumber: i + 1, etag: `"e${i}"` }));
  const done = await call(w.deps, 'POST', `/uploads/${begin.body.uploadId}/complete`, 'user0001', { parts: all });
  assert.equal(done.status, 200, JSON.stringify(done.body));
});

test('abort releases the reservation and aborts the multipart upload', async () => {
  const w = world({ plan: 'studio_max' });
  const begin = await call(w.deps, 'POST', '/uploads', 'user0001', { scope: { kind: 'u' }, name: 'film.mov', size: 1 * GiB, mime: 'video/quicktime' });
  assert.equal((await call(w.deps, 'DELETE', `/uploads/${begin.body.uploadId}`, 'user0001')).status, 200);
  assert.ok(w.s3calls.some(c => c.method === 'DELETE' && c.url.includes('uploadId=mp-1')));
  assert.equal((await call(w.deps, 'GET', '/usage', 'user0001')).body.reservedBytes, 0);
});

test('org pool: admin anywhere, staff only in own department, department cap enforced, outsiders refused', async () => {
  const w = world();
  const scope = (departmentId?: string) => ({ kind: 'o', orgId: 'org_grace01', ...(departmentId ? { departmentId } : {}) });
  assert.equal((await call(w.deps, 'POST', '/uploads', 'owner', { scope: scope(), name: 'budget.xlsx', size: MB, mime: 'application/vnd.ms-excel' })).status, 200);
  assert.equal((await call(w.deps, 'POST', '/uploads', 'vol', { scope: scope(), name: 'x.png', size: MB, mime: 'image/png' })).status, 403);
  assert.equal((await call(w.deps, 'POST', '/uploads', 'vol', { scope: scope('youth'), name: 'x.png', size: MB, mime: 'image/png' })).status, 403);
  assert.equal((await call(w.deps, 'POST', '/uploads', 'vol', { scope: scope('worship'), name: 'set.mp4', size: 4 * GiB, mime: 'video/mp4' })).status, 200);
  const capped = await call(w.deps, 'POST', '/uploads', 'vol', { scope: scope('worship'), name: 'set2.mp4', size: 7 * GiB, mime: 'video/mp4' });
  assert.equal(capped.body.code, 'department_cap');
  assert.equal((await call(w.deps, 'POST', '/uploads', 'stranger', { scope: scope(), name: 'x.png', size: MB, mime: 'image/png' })).status, 403);
  const usage = await call(w.deps, 'GET', '/usage?org=org_grace01', 'vol');
  assert.equal(usage.body.allowance, 1 * TiB);
});

test('bad input is refused before anything is reserved', async () => {
  const w = world();
  for (const body of [
    { scope: { kind: 'u' }, name: '../etc/passwd', size: MB, mime: 'text/plain' },
    { scope: { kind: 'u' }, name: 'a.txt', size: -1, mime: 'text/plain' },
    { scope: { kind: 'u' }, name: 'a.txt', size: MB, mime: 'not a mime' },
    { scope: { kind: 'x' }, name: 'a.txt', size: MB, mime: 'text/plain' },
  ]) assert.equal((await call(w.deps, 'POST', '/uploads', 'user0001', body)).status, 400, JSON.stringify(body));
  assert.equal([...w.docs.keys()].filter(k => k.startsWith('driveUsage/')).length, 0);
});

async function uploadSmall(w: ReturnType<typeof world>, uid: string, name: string, size: number, extra: Doc = {}) {
  const b = await call(w.deps, 'POST', '/uploads', uid, { scope: { kind: 'u' }, name, size, mime: 'text/plain', ...extra });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const up = w.docs.get(`driveUploads/${b.body.uploadId}`)!;
  w.objects.set(up.key, size);
  const c = await call(w.deps, 'POST', `/uploads/${b.body.uploadId}/complete`, uid, {});
  assert.equal(c.status, 200, JSON.stringify(c.body));
  return c.body.file;
}

test('library: folders, listing, breadcrumb, move, no folder inside itself', async () => {
  const w = world();
  const a = (await call(w.deps, 'POST', '/folders', 'user0001', { name: 'Projects' })).body.folder;
  const b = (await call(w.deps, 'POST', '/folders', 'user0001', { name: 'Album', parentId: a.id })).body.folder;
  const f = await uploadSmall(w, 'user0001', 'notes.txt', 1000, { parentId: b.id });
  assert.equal(f.ownerKey, 'u_user0001');
  const top = await call(w.deps, 'GET', '/items', 'user0001');
  assert.deepEqual(top.body.items.map((i: Doc) => i.name), ['Projects']);
  const inner = await call(w.deps, 'GET', `/items?parent=${b.id}`, 'user0001');
  assert.deepEqual(inner.body.items.map((i: Doc) => i.name), ['notes.txt']);
  assert.deepEqual(inner.body.path.map((p: Doc) => p.name), ['Projects', 'Album']);
  // someone else sees nothing and can't open it
  assert.equal((await call(w.deps, 'GET', `/items?parent=${b.id}`, 'user0002')).body.items.length, 0);
  assert.equal((await call(w.deps, 'PATCH', `/items/${f.id}`, 'user0002', { name: 'x' })).status, 404);
  // rename + move, and the cycle guard
  const moved = await call(w.deps, 'PATCH', `/items/${f.id}`, 'user0001', { name: 'notes v2.txt', parentId: null });
  assert.equal(moved.body.item.parentId, null);
  assert.equal(moved.body.item.name, 'notes v2.txt');
  assert.equal((await call(w.deps, 'PATCH', `/items/${a.id}`, 'user0001', { parentId: b.id })).status, 400);
  assert.equal((await call(w.deps, 'PATCH', `/items/${f.id}`, 'user0001', { name: 'a/b' })).status, 400);
});

test('library: trash moves bytes, restore brings the folder back, delete forever frees space', async () => {
  const w = world();
  const dir = (await call(w.deps, 'POST', '/folders', 'user0001', { name: 'Old' })).body.folder;
  const f1 = await uploadSmall(w, 'user0001', 'a.txt', 4000, { parentId: dir.id });
  await uploadSmall(w, 'user0001', 'b.txt', 6000);
  let u = (await call(w.deps, 'GET', '/usage', 'user0001')).body;
  assert.equal(u.liveBytes, 10000);
  const t = await call(w.deps, 'POST', `/items/${dir.id}/trash`, 'user0001', {});
  assert.deepEqual(t.body, { count: 2, bytes: 4000 });
  u = (await call(w.deps, 'GET', '/usage', 'user0001')).body;
  assert.equal(u.liveBytes, 6000); assert.equal(u.trashBytes, 4000);
  const trash = await call(w.deps, 'GET', '/items?trash=1', 'user0001');
  assert.deepEqual(trash.body.items.map((i: Doc) => i.name).sort(), ['Old', 'a.txt']);
  assert.ok(trash.body.items.every((i: Doc) => i.purgeAt > NOW));
  assert.equal((await call(w.deps, 'GET', '/items', 'user0001')).body.items.length, 1);
  // can't delete forever what isn't in the trash; download link works for live files
  const bId = (await call(w.deps, 'GET', '/items', 'user0001')).body.items[0].id;
  assert.equal((await call(w.deps, 'DELETE', `/items/${bId}`, 'user0001')).status, 409);
  const dl = await call(w.deps, 'GET', `/items/${bId}/download`, 'user0001');
  assert.match(dl.body.url, /response-content-disposition=attachment/);
  // restore the folder → its file comes back too
  assert.deepEqual((await call(w.deps, 'POST', `/items/${dir.id}/restore`, 'user0001', {})).body, { count: 2, bytes: 4000 });
  assert.equal((await call(w.deps, 'GET', `/items?parent=${dir.id}`, 'user0001')).body.items[0].id, f1.id);
  // trash again and purge: object deleted from B2, records gone, trash bytes freed
  await call(w.deps, 'POST', `/items/${dir.id}/trash`, 'user0001', {});
  const del = await call(w.deps, 'DELETE', `/items/${dir.id}`, 'user0001');
  assert.deepEqual(del.body, { count: 2, bytes: 4000 });
  assert.ok(w.s3calls.some(c => c.method === 'DELETE'));
  assert.equal(w.docs.has(`driveFiles/${f1.id}`), false);
  u = (await call(w.deps, 'GET', '/usage', 'user0001')).body;
  assert.equal(u.liveBytes, 6000); assert.equal(u.trashBytes, 0);
});

test('library: org staff see their department and the shared space, not other departments', async () => {
  const w = world();
  const shared = (await call(w.deps, 'POST', '/folders', 'owner', { org: 'org_grace01', name: 'Everyone' })).body.folder;
  const youth = (await call(w.deps, 'POST', '/folders', 'owner', { org: 'org_grace01', name: 'Youth', departmentId: 'youth' })).body.folder;
  const worship = (await call(w.deps, 'POST', '/folders', 'vol', { org: 'org_grace01', name: 'Set lists', departmentId: 'worship' }));
  assert.equal(worship.status, 200, JSON.stringify(worship.body));
  assert.equal((await call(w.deps, 'POST', '/folders', 'vol', { org: 'org_grace01', name: 'Nope' })).status, 403);
  assert.equal((await call(w.deps, 'POST', '/folders', 'vol', { org: 'org_grace01', name: 'Nope', parentId: youth.id })).status, 404);
  const seen = (await call(w.deps, 'GET', '/items?org=org_grace01', 'vol')).body.items.map((i: Doc) => i.name).sort();
  assert.deepEqual(seen, ['Everyone', 'Set lists']);
  const all = (await call(w.deps, 'GET', '/items?org=org_grace01', 'owner')).body.items.length;
  assert.equal(all, 3);
  assert.equal((await call(w.deps, 'GET', '/items?org=org_grace01', 'user0002')).status, 403);
  assert.ok(shared.id);
});
