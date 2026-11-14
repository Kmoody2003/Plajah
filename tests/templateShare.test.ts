// routes/templateShare.ts over HTTP with fake auth + Firestore: org policy against server-resolved roles,
// org detection without the orgOrigin tag, and server-side stripping.
//   npx tsx --test tests/templateShare.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createTemplateShareRouter, type TemplateShareDeps } from '../routes/templateShare';
import { orgsInDocument, resolveShareRoles } from '../services/templates/templateSharePolicy';

type Doc = Record<string, any>;
const ORG = { name: 'Grace Chapel', creatorId: 'owner', admins: ['owner'], staffUids: ['staff'] };

function world(policy: Doc | null) {
  const docs = new Map<string, Doc>([['organizations/o1', ORG]]);
  if (policy) docs.set('orgTemplatePolicies/o1', { orgId: 'o1', ...policy });
  const rows: Record<string, Array<{ id: string; data: Doc }>> = {
    orgMemberships: [
      { id: 'm1', data: { orgId: 'o1', userId: 'vol', role: 'VOLUNTEER', status: 'ACTIVE' } },
      { id: 'm2', data: { orgId: 'o1', userId: 'mem', role: 'MEMBER', status: 'ACTIVE' } },
      { id: 'm3', data: { orgId: 'o1', userId: 'teach', role: 'MEMBER', status: 'ACTIVE' } },
    ],
    churchPrograms: [{ id: 'c1', data: { orgId: 'o1', teacherUids: ['teach'] } }],
    organizations: [{ id: 'o1', data: ORG }],
  };
  const writes: Array<{ path: string; data: Doc }> = [];
  const deps: TemplateShareDeps = {
    verify: async (t: string) => (t ? { uid: t, isAnonymous: t === 'anon' } : null),
    get: async (p: string) => docs.get(p) || null,
    set: async (p: string, d: Doc) => { writes.push({ path: p, data: d }); return true; },
    query: async (c: string, f: Array<{ field: string; value: unknown }>) => (rows[c] || []).filter(r => f.every(x => r.data[x.field] === x.value)),
  };
  return { deps, writes };
}

async function share(deps: TemplateShareDeps, uid: string | null, doc: Doc, extra: Doc = {}) {
  const app = express();
  app.use('/s', express.json({ limit: '1mb' }), createTemplateShareRouter(deps));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${port}/s`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) },
      body: JSON.stringify({ bundleJson: JSON.stringify(doc), name: 'Harvest flyer', category: 'FLYER', ...extra }),
    });
    return { status: r.status, body: await r.json() as Doc };
  } finally { server.close(); }
}

const tela = (text: string, origin?: string): Doc => ({
  id: 'd1', title: 'Fall', ownerId: 'x', frames: [{ id: 'f1', w: 1080, h: 1350, deviceIds: ['v1'] }],
  devices: { v1: { id: 'v1', type: 'VECTOR', objects: [{ id: 'o', kind: 'TEXT', text, x: 0, y: 0, w: 10, h: 10 }] } },
  ...(origin ? { orgOrigin: { orgId: origin } } : {}),
});
const ON_STAFF = { allowPlatformSharing: true, roles: { admin: true, staff: true, teacher: false, volunteer: false, member: false } };
const ON_TEACHERS = { allowPlatformSharing: true, roles: { admin: false, staff: false, teacher: true, volunteer: false, member: false } };

test('signed out and anonymous are refused', async () => {
  const { deps } = world(ON_STAFF);
  assert.equal((await share(deps, null, tela('hi'))).status, 401);
  assert.equal((await share(deps, 'anon', tela('hi'))).status, 401);
});

test('no policy set: an org document cannot leave, even for the owner', async () => {
  const { deps, writes } = world(null);
  const r = await share(deps, 'owner', tela('Grace Chapel fall festival', 'o1'));
  assert.equal(r.status, 403);
  assert.match(r.body.error, /Grace Chapel doesn’t allow/);
  assert.equal(writes.length, 0);
});

test('dropping the orgOrigin tag does not dodge the policy: the org name gives it away', async () => {
  const { deps, writes } = world(null);
  const r = await share(deps, 'vol', tela('Join us at GRACE CHAPEL this Sunday'));
  assert.equal(r.status, 403);
  assert.equal(writes.length, 0);
});

test('staff may share when staff is on; the copy is stripped server-side', async () => {
  const { deps, writes } = world(ON_STAFF);
  const r = await share(deps, 'staff', tela('Grace Chapel fall festival — RSVP to pastor@grace.org', 'o1'));
  assert.equal(r.status, 200);
  assert.equal(writes.length, 1);
  const rec = writes[0].data;
  assert.equal(rec.tier, 'platform');
  assert.equal(rec.stripped, true);
  assert.equal(rec.fromOrgId, 'o1');
  assert.equal(rec.ownerUid, 'staff');
  assert.ok(!/grace|pastor/i.test(rec.bundleJson), 'org words must not survive the strip');
  assert.ok(!rec.bundleJson.includes('orgOrigin'));
});

test('roles come from the server, not the client: a volunteer is refused when only staff may share', async () => {
  const { deps } = world(ON_STAFF);
  assert.equal((await share(deps, 'vol', tela('x', 'o1'))).status, 403);
  assert.equal((await share(deps, 'mem', tela('x', 'o1'))).status, 403);
});

test('teacher role is resolved from the classes they teach', async () => {
  const { deps } = world(ON_TEACHERS);
  assert.equal((await share(deps, 'teach', tela('x', 'o1'))).status, 200);
  assert.equal((await share(deps, 'mem', tela('x', 'o1'))).status, 403);
});

test('a client-named org is checked even if the document shows no sign of it', async () => {
  const { deps } = world(null);
  assert.equal((await share(deps, 'owner', tela('plain words'), { fromOrgId: 'o1' })).status, 403);
});

test('a personal creation goes up as it is', async () => {
  const { deps, writes } = world(null);
  const r = await share(deps, 'stranger', tela('My own harvest flyer'));
  assert.equal(r.status, 200);
  assert.equal(writes[0].data.stripped, false);
  assert.equal(writes[0].data.fromOrgId, undefined);
  assert.ok(writes[0].data.bundleJson.includes('My own harvest flyer'));
});

test('rejects something that is not a Tela document', async () => {
  const { deps } = world(ON_STAFF);
  assert.equal((await share(deps, 'staff', { hello: 'world' })).status, 400);
});

test('resolveShareRoles and orgsInDocument', () => {
  assert.deepEqual(resolveShareRoles('owner', { org: ORG }), ['admin', 'member']);
  assert.deepEqual(resolveShareRoles('vol', { memberships: [{ role: 'VOLUNTEER' }] }), ['volunteer', 'member']);
  assert.deepEqual(resolveShareRoles('x', { memberships: [{ role: 'MEMBER', status: 'BANNED' }] }), []);
  assert.deepEqual(orgsInDocument(tela('see you at grace chapel') as never, [{ id: 'o1', name: 'Grace Chapel' }]), ['o1']);
  assert.deepEqual(orgsInDocument(tela('see you there') as never, [{ id: 'o1', name: 'Grace Chapel' }, { id: 'o2', name: 'Abc' }]), []);
});
