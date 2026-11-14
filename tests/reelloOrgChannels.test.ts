import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  postableDepartmentIds, canPostToDepartment, postsForWholeOrg, isPublicVideo, pushFront, deptChannelId, orgDepartments,
} from '../services/reello/orgChannelsCore.ts';

const org = {
  creatorId: 'owner', accountUid: 'orgAcct', itAdminUids: ['it'],
  ministries: [
    { id: 'youth', name: 'Youth', headUids: ['youthHead'] },
    { id: 'media', name: 'Media' },
    { id: 'finance', name: 'Finance', kind: 'DEPARTMENT' },
    { name: 'no id' },
  ],
};

test('orgDepartments drops malformed entries', () => {
  assert.deepEqual(orgDepartments(org).map(d => d.id), ['youth', 'media', 'finance']);
  assert.deepEqual(orgDepartments(null), []);
});

test('owner, org account, IT admin and org admins post for every department', () => {
  for (const uid of ['owner', 'orgAcct', 'it']) assert.deepEqual(postableDepartmentIds(uid, org, null), ['youth', 'media', 'finance']);
  assert.ok(postsForWholeOrg('a', org, { status: 'ACTIVE', role: 'ADMIN' }));
  assert.ok(!postsForWholeOrg('a', org, { status: 'PENDING', role: 'ADMIN' }));
});

test('members post only for departments they belong to or lead', () => {
  assert.deepEqual(postableDepartmentIds('youthHead', org, null), ['youth']);
  assert.deepEqual(postableDepartmentIds('m', org, { status: 'ACTIVE', role: 'MEMBER', ministryIds: ['media'] }), ['media']);
  assert.deepEqual(postableDepartmentIds('m', org, { status: 'ACTIVE', role: 'STAFF', ministryRoles: [{ ministryId: 'finance', roleKey: 'X' }] }), ['finance']);
  assert.deepEqual(postableDepartmentIds('m', org, { status: 'ACTIVE', role: 'MEMBER' }), []);
  // A pending or banned membership grants nothing; unknown department ids never come back.
  assert.deepEqual(postableDepartmentIds('m', org, { status: 'PENDING', role: 'MEMBER', ministryIds: ['media'] }), []);
  assert.deepEqual(postableDepartmentIds('m', org, { status: 'ACTIVE', role: 'MEMBER', ministryIds: ['ghost'] }), []);
  assert.ok(canPostToDepartment('youthHead', org, null, 'youth'));
  assert.ok(!canPostToDepartment('youthHead', org, null, 'media'));
  assert.ok(!canPostToDepartment('', org, null, 'youth'));
});

test('only public, released, unheld videos show on a channel', () => {
  const now = 1_000_000;
  assert.ok(isPublicVideo({ isPrivate: false }, now));
  assert.ok(isPublicVideo({}, now));
  assert.ok(!isPublicVideo({ isPrivate: true }, now));
  assert.ok(!isPublicVideo({ isScheduled: true, releaseDate: now + 1 }, now));
  assert.ok(isPublicVideo({ isScheduled: true, releaseDate: now - 1 }, now));
  assert.ok(!isPublicVideo({ copyrightHold: { at: 1 } }, now));
  assert.ok(!isPublicVideo(null, now));
});

test('pushFront moves to the front, dedupes and caps', () => {
  assert.deepEqual(pushFront(['a', 'b', 'c'], 'b', 10), ['b', 'a', 'c']);
  assert.deepEqual(pushFront(undefined, 'x', 10), ['x']);
  assert.deepEqual(pushFront(['a', 'b', 'c'], 'z', 2), ['z', 'a']);
  assert.equal(deptChannelId('o', 'd'), 'o__d');
});

// ── the route, end to end on an in-memory store ──────────────────────────────
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createReelloOrgChannelsRouter, type OrgChannelsStore } from '../routes/reelloOrgChannels.ts';

function memStore(seed: Record<string, any>): OrgChannelsStore & { docs: Map<string, any> } {
  const docs = new Map<string, any>(Object.entries(seed));
  return {
    docs,
    async get(p) { return docs.has(p) ? structuredClone(docs.get(p)) : null; },
    async patch(p, d) { docs.set(p, { ...(docs.get(p) || {}), ...structuredClone(d) }); return true; },
    async query(c, f) {
      return [...docs.entries()].filter(([k, v]) => k.startsWith(`${c}/`) && k.split('/').length === 2 && f.every(x => v[x.field] === x.value))
        .map(([k, v]) => ({ id: k.split('/')[1], data: v }));
    },
  };
}

async function serve(store: OrgChannelsStore) {
  const app = express();
  app.use(express.json());
  app.use('/oc', createReelloOrgChannelsRouter({ store, callerUid: async req => (req.headers['x-uid'] as string) || null }));
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/oc`;
  const call = async (path: string, uid?: string, body?: unknown) => {
    const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(uid ? { 'x-uid': uid } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() as any };
  };
  return { call, close: () => srv.close() };
}

test('a department channel appears only after it posts, and only members can post', async () => {
  const now = Date.now();
  const store = memStore({
    'organizations/org1': { name: 'Grace Chapel', creatorId: 'owner', accountUid: 'acct', ministries: [{ id: 'youth', name: 'Youth', iconEmoji: '🔥' }, { id: 'media', name: 'Media' }] },
    'orgMemberships/m1': { orgId: 'org1', userId: 'amy', status: 'ACTIVE', role: 'MEMBER', ministryIds: ['youth'] },
    'videos/v1': { ownerId: 'amy', title: 'Youth night', isPrivate: false, timestamp: now },
    'videos/v2': { ownerId: 'amy', title: 'Draft', isPrivate: true, timestamp: now },
    'videos/v3': { ownerId: 'bob', title: 'Not mine', isPrivate: false, timestamp: now },
    'live_feeds/f1': { ownerId: 'amy', title: 'Media live', status: 'LIVE', lastActiveAt: now, isPublic: true },
  });
  const { call, close } = await serve(store);
  try {
    assert.deepEqual((await call('/org?orgId=org1')).body.channels, []);

    const mine = await call('/mine', 'amy');
    assert.deepEqual(mine.body.orgs.map((o: any) => o.departments.map((d: any) => d.id)), [['youth']]);
    assert.equal((await call('/mine')).status, 401);

    // Not her department, not her video, bad kind.
    assert.equal((await call('/attach', 'amy', { kind: 'video', id: 'v1', orgId: 'org1', departmentId: 'media' })).status, 403);
    assert.equal((await call('/attach', 'amy', { kind: 'video', id: 'v3', orgId: 'org1', departmentId: 'youth' })).status, 403);
    assert.equal((await call('/attach', 'amy', { kind: 'nope', id: 'v1', orgId: 'org1', departmentId: 'youth' })).status, 400);

    // A private video alone doesn't make the channel appear.
    assert.equal((await call('/attach', 'amy', { kind: 'video', id: 'v2', orgId: 'org1', departmentId: 'youth' })).status, 200);
    assert.deepEqual((await call('/org?orgId=org1')).body.channels, []);

    assert.equal((await call('/attach', 'amy', { kind: 'video', id: 'v1', orgId: 'org1', departmentId: 'youth' })).status, 200);
    const org = await call('/org?orgId=org1');
    assert.deepEqual(org.body.channels.map((c: any) => [c.departmentId, c.videoCount, c.live]), [['youth', 1, false]]);
    assert.equal(store.docs.get('videos/v1').orgChannel.departmentName, 'Youth');

    const chan = await call('/channel?orgId=org1&departmentId=youth');
    assert.deepEqual(chan.body.videos.map((v: any) => v.id), ['v1']);
    assert.equal(chan.body.org.accountUid, 'acct');

    // The org account's own channel lists the same departments.
    assert.deepEqual((await call('/by-account?uid=acct')).body.channels.map((c: any) => c.departmentId), ['youth']);

    // The owner streams for Media: Media appears, live first.
    assert.equal((await call('/attach', 'owner', { kind: 'live', id: 'f1', orgId: 'org1', departmentId: 'media' })).status, 403); // not the owner's feed
    store.docs.set('live_feeds/f1', { ...store.docs.get('live_feeds/f1'), ownerId: 'owner' });
    assert.equal((await call('/attach', 'owner', { kind: 'live', id: 'f1', orgId: 'org1', departmentId: 'media' })).status, 200);
    assert.deepEqual((await call('/org?orgId=org1')).body.channels.map((c: any) => [c.departmentId, c.live]), [['media', true], ['youth', false]]);

    // Taking the only public video off hides Youth again.
    assert.equal((await call('/detach', 'amy', { kind: 'video', id: 'v1', orgId: 'org1', departmentId: 'youth' })).status, 200);
    assert.deepEqual((await call('/org?orgId=org1')).body.channels.map((c: any) => c.departmentId), ['media']);
    assert.equal(store.docs.get('videos/v1').orgChannel, null);
  } finally { close(); }
});
