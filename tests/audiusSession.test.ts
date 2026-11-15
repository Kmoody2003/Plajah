// The Audius connection follows the Plajah account (routes/audiusSession.ts): save, read back on another device,
// disconnect leaves a marker (so an old device can't re-upload), and a failed read never looks like "no connection".
// Run: npx tsx --test --experimental-test-module-mocks tests/audiusSession.test.ts
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);

const store = new Map<string, Record<string, any>>();
let readFails = false;
mock.module('../services/firebaseAdminRest.ts', {
  namedExports: {
    verifyIdToken: async (t: string) => (t.startsWith('uid:') ? t.slice(4) : null),
    fsGetStrict: async (p: string) => { if (readFails) throw new Error('HTTP 503'); return store.get(p) ?? null; },
    fsSet: async (p: string, d: Record<string, any>) => { store.set(p, d); return true; },
    fsGet: async (p: string) => store.get(p) ?? null,
    fsDelete: async (p: string) => { store.delete(p); return true; },
    fsList: async () => [], fsQuery: async () => [], fsPatch: async () => true, fsCreate: async () => null,
  },
});

const { audiusSessionRouter, cleanAudiusSession } = await import('../routes/audiusSession.ts');
const app = express();
app.use('/api/audius/session', express.json(), audiusSessionRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/audius/session`;
const call = (method: string, uid: string | null, body?: unknown) => fetch(base, {
  method,
  headers: { ...(uid ? { Authorization: `Bearer uid:${uid}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

const session = {
  userId: 'eJ57D', handle: 'kmoody', name: 'K', verified: false, scope: 'write',
  accessToken: 'AT1', refreshToken: 'RT1', accessExpiresAt: Date.now() + 3600_000, connectedAt: Date.now(), extra: 'dropped',
};

test('needs a signed-in caller', async () => {
  assert.equal((await call('GET', null)).status, 401);
  assert.equal((await call('PUT', null, { session })).status, 401);
});

test('saved on one device, read back on another — encrypted at rest', async () => {
  assert.equal((await call('PUT', 'u1', { session })).status, 200);
  const raw = JSON.stringify(store.get('users/u1/private/audius'));
  assert.ok(!raw.includes('AT1') && !raw.includes('RT1'), 'tokens are not stored in the clear');
  const got = await (await call('GET', 'u1')).json();
  assert.equal(got.session.accessToken, 'AT1');
  assert.equal(got.session.refreshToken, 'RT1');
  assert.equal(got.session.extra, undefined, 'unknown fields are not kept');
});

test('one account never reads another account\'s connection', async () => {
  const got = await (await call('GET', 'u2')).json();
  assert.equal(got.session, null);
});

test('disconnect leaves a marker instead of nothing', async () => {
  assert.equal((await call('DELETE', 'u1')).status, 200);
  const got = await (await call('GET', 'u1')).json();
  assert.equal(got.session, null);
  assert.ok(got.disconnectedAt > 0);
});

test('a failed read is an error, not "no connection"', async () => {
  readFails = true;
  try { assert.equal((await call('GET', 'u1')).status, 502); } finally { readFails = false; }
});

test('rejects things that are not an Audius session', async () => {
  assert.equal((await call('PUT', 'u1', { session: { handle: 'x' } })).status, 400);
  assert.equal(cleanAudiusSession({ userId: 'a', accessToken: 'b', scope: 'admin' })?.scope, 'read');
  server.close();
});
