import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as nodeCrypto from 'node:crypto';
import express from 'express';
import { canPublishOrgMedia, canViewOrgMedia, groupPlaylists, parseTarget } from '../services/orgPublish/audienceCore.ts';
import { signMuxPlayback, signingKeyFromEnv } from '../services/orgPublish/muxSign.ts';
import { createOrgMediaRouter, type OrgMediaStore } from '../routes/orgMedia.ts';

const org = {
  creatorId: 'owner', accountUid: 'orgAcct', admins: ['admin'], staffUids: ['staff'],
  ministries: [{ id: 'ced', name: 'Christian Ed', headUids: ['cedHead'] }, { id: 'youth', name: 'Youth' }],
  departmentUids: { ced: ['cedVolunteer'] },
};
const cls = { orgId: 'org1', departmentId: 'ced', teacherUids: ['teacher'], studentUids: ['student'], createdBy: 'teacher' };
const member = { orgId: 'org1', status: 'ACTIVE', role: 'MEMBER' };

test('PUBLIC is open; internal audiences need the org', () => {
  assert.ok(canViewOrgMedia('', { orgId: 'org1', audience: 'PUBLIC' }, { org: null, membership: null }));
  assert.ok(!canViewOrgMedia('', { orgId: 'org1', audience: 'ORG' }, { org, membership: null }));
  assert.ok(!canViewOrgMedia('stranger', { orgId: 'org1', audience: 'ORG' }, { org, membership: null }));
  assert.ok(canViewOrgMedia('m', { orgId: 'org1', audience: 'ORG' }, { org, membership: member }));
  assert.ok(canViewOrgMedia('staff', { orgId: 'org1', audience: 'ORG' }, { org, membership: null }));
  assert.ok(!canViewOrgMedia('m', { orgId: 'org1', audience: 'ORG' }, { org, membership: { ...member, status: 'PENDING' } }));
});

test('DEPARTMENT: its members, heads, volunteers and whole-org admins only', () => {
  const t = { orgId: 'org1', audience: 'DEPARTMENT' as const, departmentId: 'ced' };
  assert.ok(canViewOrgMedia('cedHead', t, { org, membership: null }));
  assert.ok(canViewOrgMedia('cedVolunteer', t, { org, membership: null }));
  assert.ok(canViewOrgMedia('owner', t, { org, membership: null }));
  assert.ok(canViewOrgMedia('m', t, { org, membership: { ...member, ministryIds: ['ced'] } }));
  assert.ok(!canViewOrgMedia('m', t, { org, membership: member }));
  assert.ok(!canViewOrgMedia('m', t, { org, membership: { ...member, ministryIds: ['youth'] } }));
});

test('CLASS: teachers, enrolled students, department staff; not other members', () => {
  const t = { orgId: 'org1', audience: 'CLASS' as const, classId: 'c1' };
  for (const uid of ['teacher', 'student', 'cedHead', 'cedVolunteer', 'admin'.replace('admin', 'owner')]) {
    assert.ok(canViewOrgMedia(uid, t, { org, membership: null, cls }), uid);
  }
  assert.ok(!canViewOrgMedia('m', t, { org, membership: member, cls }));
  assert.ok(!canViewOrgMedia('student', t, { org, membership: null, cls: null }));
  // A class from another org never grants access.
  assert.ok(!canViewOrgMedia('student', t, { org, membership: null, cls: { ...cls, orgId: 'other' } }));
});

test('publishing: admins anywhere, dept members to their dept, teachers to their class', () => {
  assert.ok(canPublishOrgMedia('owner', { orgId: 'org1', audience: 'PUBLIC' }, { org, membership: null }));
  assert.ok(!canPublishOrgMedia('m', { orgId: 'org1', audience: 'ORG' }, { org, membership: member }));
  assert.ok(canPublishOrgMedia('cedHead', { orgId: 'org1', audience: 'DEPARTMENT', departmentId: 'ced' }, { org, membership: null }));
  assert.ok(!canPublishOrgMedia('cedHead', { orgId: 'org1', audience: 'DEPARTMENT', departmentId: 'youth' }, { org, membership: null }));
  assert.ok(canPublishOrgMedia('teacher', { orgId: 'org1', audience: 'CLASS', classId: 'c1' }, { org, membership: null, cls }));
  assert.ok(!canPublishOrgMedia('student', { orgId: 'org1', audience: 'CLASS', classId: 'c1' }, { org, membership: null, cls }));
});

test('parseTarget validates audiences and ids', () => {
  assert.equal(parseTarget({}), 'Missing orgId.');
  assert.equal(parseTarget({ orgId: 'o', audience: 'NOPE' }), 'Unknown audience.');
  assert.equal(parseTarget({ orgId: 'o', audience: 'CLASS' }), 'Pick a class.');
  assert.equal(parseTarget({ orgId: 'a/b', audience: 'ORG' }), 'Missing orgId.');
  assert.deepEqual(parseTarget({ orgId: 'o', audience: 'CLASS', classId: 'c' }), { orgId: 'o', audience: 'CLASS', classId: 'c' });
});

test('groupPlaylists groups by name, newest first, unnamed into Uploads', () => {
  const g = groupPlaylists([{ playlist: 'Revelation II', createdAt: 1 }, { createdAt: 3 }, { playlist: 'Revelation II', createdAt: 2 }]);
  assert.deepEqual(g.map(x => [x.name, x.items.map(i => i.createdAt)]), [['Uploads', [3]], ['Revelation II', [2, 1]]]);
});

const { privateKey, publicKey } = nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();

test('Mux playback tokens are RS256 JWTs Mux can verify', () => {
  const key = signingKeyFromEnv({ MUX_SIGNING_KEY_ID: 'kid1', MUX_SIGNING_PRIVATE_KEY: Buffer.from(pem).toString('base64') });
  assert.ok(key);
  const jwt = signMuxPlayback('pb123', 'v', key!, 3600, 1_000_000_000_000);
  const [h, p, s] = jwt.split('.');
  const dec = (x: string) => JSON.parse(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  assert.deepEqual(dec(h), { alg: 'RS256', typ: 'JWT', kid: 'kid1' });
  assert.deepEqual(dec(p), { sub: 'pb123', aud: 'v', exp: 1_000_000_000 + 3600, kid: 'kid1' });
  const ok = nodeCrypto.createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  assert.ok(ok);
  assert.equal(signingKeyFromEnv({}), null);
});

function memStore(seed: Record<string, Record<string, any>>): OrgMediaStore {
  const db = new Map(Object.entries(seed));
  return {
    async get(p) { return db.get(p) ? { ...db.get(p)! } : null; },
    async set(p, d) { db.set(p, { ...d }); return true; },
    async patch(p, d) { db.set(p, { ...(db.get(p) || {}), ...d }); return true; },
    async query(c, f) {
      return [...db.entries()].filter(([k, v]) => k.startsWith(c + '/') && k.split('/').length === 2 && f.every(x => v[x.field] === x.value)).map(([k, v]) => ({ id: k.split('/')[1], data: v }));
    },
  };
}

test('route: teacher records a class live → only class members can play it (signed)', async () => {
  const store = memStore({
    'organizations/org1': org,
    'churchPrograms/c1': cls,
    'orgMemberships/m1': { ...member, userId: 'm' },
  });
  let uploads = 0;
  const mux = {
    async createUpload(o: { signed: boolean }) { uploads++; assert.equal(o.signed, true); return { id: 'up1', url: 'https://storage/up1' }; },
    async getUpload() { return { status: 'asset_created', assetId: 'as1' }; },
    async getAsset() { return { status: 'ready', playbackId: 'pb1', durationSec: 61.4 }; },
  };
  const key = { keyId: 'kid1', privateKeyPem: pem };
  const app = express();
  app.use(express.json());
  app.use('/m', createOrgMediaRouter({ mux, store, signingKey: () => key, callerUid: async req => (req.headers['x-uid'] as string) || null }));
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${(srv.address() as any).port}/m`;
  const call = async (method: string, path: string, uid: string, body?: any) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { 'x-uid': uid } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() as any };
  };
  try {
    // A student can't publish to the class; the teacher can.
    assert.equal((await call('POST', '/uploads', 'student', { orgId: 'org1', audience: 'CLASS', classId: 'c1', title: 'x' })).status, 403);
    const up = await call('POST', '/uploads', 'teacher', { orgId: 'org1', audience: 'CLASS', classId: 'c1', title: 'Revelation II · live', playlist: 'Revelation II', source: 'class-live' });
    assert.equal(up.status, 200);
    assert.equal(uploads, 1);
    const id = up.body.id;
    // Only the owner finalizes.
    assert.equal((await call('POST', `/${id}/finalize`, 'student')).status, 403);
    assert.equal((await call('POST', `/${id}/finalize`, 'teacher')).body.status, 'READY');
    // Listing: the class's student and the department volunteer see the playlist; a plain member doesn't.
    const forStudent = await call('GET', '/list?orgId=org1&classId=c1', 'student');
    assert.deepEqual(forStudent.body.playlists.map((p: any) => [p.name, p.items.length]), [['Revelation II', 1]]);
    assert.equal(forStudent.body.playlists[0].items[0].departmentId, 'ced');
    assert.equal(forStudent.body.playlists[0].items[0].muxPlaybackId, undefined); // signed: never in the listing
    assert.equal((await call('GET', '/list?orgId=org1&departmentId=ced', 'cedVolunteer')).body.playlists.length, 1);
    assert.equal((await call('GET', '/list?orgId=org1&classId=c1', 'm')).body.playlists.length, 0);
    assert.equal((await call('GET', '/list?orgId=org1&classId=c1', '')).body.playlists.length, 0);
    // Playing: tokens only for people the rules let in.
    const play = await call('GET', `/${id}/play`, 'student');
    assert.equal(play.status, 200);
    assert.equal(play.body.playbackId, 'pb1');
    assert.ok(play.body.token && play.body.thumbToken);
    assert.equal((await call('GET', `/${id}/play`, 'm')).status, 403);
    assert.equal((await call('GET', `/${id}/play`, '')).status, 403);
    // A member can't delete it; the teacher can, and it disappears.
    assert.equal((await call('DELETE', `/${id}`, 'm')).status, 403);
    assert.equal((await call('DELETE', `/${id}`, 'teacher')).status, 200);
    assert.equal((await call('GET', '/list?orgId=org1&classId=c1', 'student')).body.playlists.length, 0);
  } finally {
    srv.close();
  }
});

test('route: internal uploads refuse to start without a signing key', async () => {
  const store = memStore({ 'organizations/org1': org });
  const app = express();
  app.use(express.json());
  app.use('/m', createOrgMediaRouter({ mux: { createUpload: async () => ({ id: 'u', url: 'x' }), getUpload: async () => ({}), getAsset: async () => ({}) }, store, signingKey: () => null, callerUid: async () => 'owner' }));
  const srv = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${(srv.address() as any).port}/m/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId: 'org1', audience: 'ORG' }) });
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as any).code, 'NO_SIGNING_KEY');
  } finally {
    srv.close();
  }
});
