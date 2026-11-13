import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createTelaSignRouter, memorySignStore, signerToken } from '../routes/telaSign';
import { verifyAudit, type Envelope } from '../services/tela/sign/signCore';

const SECRET = 'test-secret';
const uidOf = (req: any) => (String(req.headers.authorization || '').startsWith('Bearer ') ? String(req.headers.authorization).slice(7) : null);

async function withServer(fn: (base: string, store: ReturnType<typeof memorySignStore>, clock: { t: number }) => Promise<void>) {
  const store = memorySignStore();
  const clock = { t: Date.UTC(2026, 10, 13, 15) };
  const app = express();
  app.set('trust proxy', true);
  app.use(createTelaSignRouter({
    authMiddleware: (req: any, res: any, next: any) => { const u = uidOf(req); if (!u) return res.status(401).json({ error: 'Unauthorized' }); req.uid = u; next(); },
    optionalUid: async (req) => uidOf(req),
    store, secret: () => SECRET, origin: () => 'https://plajah.test', now: () => clock.t,
  }));
  const srv = app.listen(0);
  try { await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`, store, clock); } finally { srv.close(); }
}

const call = async (base: string, method: string, path: string, body?: unknown, uid?: string, extra: Record<string, string> = {}) => {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(uid ? { authorization: `Bearer ${uid}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
};

const DRAFT = {
  title: 'Sidewalk café permit', docType: 'permit', docText: 'Seating stays inside the marked area.', pages: 1, senderName: 'Jordan Hale', senderOrg: 'Sample City',
  signers: [
    { id: 'ana', name: 'Ana Ruiz', email: 'ana@example.com', order: 1, accessCode: '4719' },
    { id: 'city', name: 'Jordan Hale', email: 'jordan@sample-city.gov', order: 2, auth: 'plajah_account', uid: 'staff-1', consumer: false },
  ],
  fields: [
    { id: 'agree', signerId: 'ana', type: 'checkbox', page: 1, x: 10, y: 60, w: 4, h: 4 },
    { id: 'sigA', signerId: 'ana', type: 'signature', page: 1, x: 10, y: 80, w: 30, h: 8 },
    { id: 'sigC', signerId: 'city', type: 'signature', page: 1, x: 55, y: 80, w: 30, h: 8 },
  ],
};

test('server-run envelope: create, send, sign in order, verify publicly', async () => {
  await withServer(async (base, store) => {
    const created = await call(base, 'POST', '/api/tela/sign/envelopes', DRAFT, 'staff-1');
    assert.equal(created.status, 201);
    const id = created.body.envelope.id as string;
    assert.match(id, /^env_[0-9a-f]{20}$/);
    assert.equal(created.body.envelope.sender.id, 'staff-1', 'the sender comes from the session, not the body');
    assert.ok(!JSON.stringify(created.body).includes('4719'), 'the access code is never stored or returned in plain text');

    // Only the sender can read or send it.
    assert.equal((await call(base, 'GET', `/api/tela/sign/envelopes/${id}`, undefined, 'someone-else')).status, 404);
    const sent = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/send`, {}, 'staff-1');
    assert.equal(sent.status, 200);
    const link = sent.body.links.find((l: any) => l.signerId === 'ana');
    assert.match(link.url, /^https:\/\/plajah\.test\/\?view=sign&env=env_/);
    const t = signerToken(SECRET, id, 'ana');
    assert.ok(link.url.endsWith(`t=${t}`));

    // A forged token is refused; the right token without the access code is asked for it.
    assert.equal((await call(base, 'GET', `/api/tela/sign/envelopes/${id}/signer?s=ana&t=forged`)).status, 403);
    const noCode = await call(base, 'GET', `/api/tela/sign/envelopes/${id}/signer?s=ana&t=${t}`);
    assert.equal(noCode.status, 401); assert.equal(noCode.body.needs, 'access_code');

    const seen = await call(base, 'GET', `/api/tela/sign/envelopes/${id}/signer?s=ana&t=${t}&code=4719`, undefined, undefined, { 'user-agent': 'TestPhone/1', 'x-forwarded-for': '203.0.113.7' });
    assert.equal(seen.status, 200);
    assert.ok(!JSON.stringify(seen.body).includes('jordan@sample-city.gov'), 'signers never see other recipients’ emails');
    assert.ok(!JSON.stringify(seen.body).includes('staff-1'), 'or their account ids');

    // The city can't sign before Ana: wrong turn is refused by the server.
    const tc = signerToken(SECRET, id, 'city');
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { s: 'city', t: tc, fieldId: 'sigC', value: { method: 'typed', data: 'Jordan Hale' } }, 'staff-1')).status, 409);

    const as = { s: 'ana', t, code: '4719' };
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/finish`, as)).status, 409, 'consumer must consent first');
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/consent`, as)).status, 200);
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { ...as, fieldId: 'sigC', value: { method: 'typed', data: 'x' } })).status, 409, 'cannot fill someone else’s field');
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { ...as, fieldId: 'agree', value: true })).status, 200);
    const sig = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { ...as, fieldId: 'sigA', value: { method: 'drawn', data: 'M1 1 L20 5', at: 1 } });
    assert.equal(sig.status, 200);
    assert.notEqual(sig.body.fields.find((f: any) => f.id === 'sigA').value.at, 1, 'the server sets the signature time');
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/finish`, as)).status, 200);

    // The city signer must be signed in as the right Plajah account.
    const asCity = { s: 'city', t: tc };
    const anon = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { ...asCity, fieldId: 'sigC', value: { method: 'typed', data: 'Jordan Hale' } });
    assert.equal(anon.status, 401); assert.equal(anon.body.needs, 'plajah_account');
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { ...asCity, fieldId: 'sigC', value: { method: 'typed', data: 'Jordan Hale' } }, 'intruder')).status, 401);
    assert.equal((await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { ...asCity, fieldId: 'sigC', value: { method: 'typed', data: 'Jordan Hale' } }, 'staff-1')).status, 200);
    const done = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/finish`, asCity, 'staff-1');
    assert.equal(done.body.status, 'completed');

    // Stored record: intact chain, server context on events, final fingerprint.
    const env = JSON.parse(store.rows.get(id)!) as Envelope;
    assert.ok(verifyAudit(env).ok);
    const viewed = env.audit.find((e) => e.event === 'viewed' && e.actor === 'ana')!;
    assert.equal(viewed.userAgent, 'TestPhone/1');
    assert.equal(viewed.ip, '203.0.113.7');
    assert.match(env.finalHash!, /^[0-9a-f]{64}$/);

    // Public verify by final fingerprint: names and dates, no emails.
    const v = await call(base, 'GET', `/api/tela/sign/verify/${env.finalHash}`);
    assert.equal(v.body.found, true); assert.equal(v.body.matched, 'final'); assert.equal(v.body.auditIntact, true);
    assert.deepEqual(v.body.signers.map((s: any) => s.name), ['Ana Ruiz', 'Jordan Hale']);
    assert.ok(!JSON.stringify(v.body).includes('@'));
    assert.equal((await call(base, 'GET', `/api/tela/sign/verify/${'0'.repeat(64)}`)).body.found, false);
    assert.equal((await call(base, 'GET', '/api/tela/sign/verify/nothex')).status, 400);

    // Tampering with the stored record shows up in verification.
    env.audit[2].at -= 86_400_000; store.rows.set(id, JSON.stringify(env));
    assert.equal((await call(base, 'GET', `/api/tela/sign/verify/${env.finalHash}`)).body.auditIntact, false);
  });
});

test('create refuses what the server cannot honour', async () => {
  await withServer(async (base) => {
    assert.equal((await call(base, 'POST', '/api/tela/sign/envelopes', DRAFT)).status, 401, 'senders must be signed in');
    const will = await call(base, 'POST', '/api/tela/sign/envelopes', { ...DRAFT, title: 'Last will and testament', docType: 'will' }, 'u1');
    assert.equal(will.status, 400); assert.match(will.body.error, /Wills/);
    const sms = await call(base, 'POST', '/api/tela/sign/envelopes', { ...DRAFT, signers: [{ ...DRAFT.signers[0], auth: 'sms_code' }] }, 'u1');
    assert.equal(sms.status, 400); assert.match(sms.body.error, /isn’t available yet/);
    const mismatch = await call(base, 'POST', '/api/tela/sign/envelopes', { ...DRAFT, docHash: 'a'.repeat(64) }, 'u1');
    assert.equal(mismatch.status, 400); assert.match(mismatch.body.error, /doesn’t match/);
  });
});

test('expired envelopes close on the next request and two writers cannot fork history', async () => {
  await withServer(async (base, store, clock) => {
    const { body } = await call(base, 'POST', '/api/tela/sign/envelopes', { ...DRAFT, expiresInDays: 1 }, 'staff-1');
    const id = body.envelope.id;
    await call(base, 'POST', `/api/tela/sign/envelopes/${id}/send`, {}, 'staff-1');
    const as = { s: 'ana', t: signerToken(SECRET, id, 'ana'), code: '4719' };

    // Fire several writes at once: every one either succeeds or is refused, and the chain stays linear.
    const results = await Promise.all([1, 2, 3, 4].map(() => call(base, 'POST', `/api/tela/sign/envelopes/${id}/consent`, as)));
    assert.ok(results.every((r) => r.status === 200 || r.status === 409));
    const env = JSON.parse(store.rows.get(id)!) as Envelope;
    assert.ok(verifyAudit(env).ok);
    assert.deepEqual(env.audit.map((e) => e.seq), env.audit.map((_, i) => i));

    clock.t += 2 * 86_400_000;
    const late = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/consent`, as);
    assert.equal(late.status, 409);
    assert.equal((JSON.parse(store.rows.get(id)!) as Envelope).status, 'expired');
  });
});
