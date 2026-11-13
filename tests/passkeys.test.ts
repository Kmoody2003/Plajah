import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createPasskeyRouter, memoryPasskeyStore } from '../routes/passkeys';
import { createTelaSignRouter, memorySignStore, signerToken, checkSeal } from '../routes/telaSign';
import { ALG, verifyAssertion, type StoredPasskey } from '../services/auth/passkeyCore';
import { verifyAudit, type Envelope } from '../services/tela/sign/signCore';

const ORIGIN = 'https://plajah.test', RP = 'plajah.test', SECRET = 'k';
const b64 = (b: Buffer) => b.toString('base64url');
const sha = (b: Buffer | string) => nodeCrypto.createHash('sha256').update(b).digest();

/** A pretend phone / Windows Hello: makes a key pair and signs like a WebAuthn authenticator. */
function fakeDevice(kind: 'ec' | 'ed25519' = 'ec', opts: { uv?: boolean; rp?: string; origin?: string } = {}) {
  const { privateKey, publicKey } = kind === 'ec' ? nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }) : nodeCrypto.generateKeyPairSync('ed25519');
  const credentialId = b64(nodeCrypto.randomBytes(16));
  const authData = (counter: number) => {
    const b = Buffer.alloc(37); sha(opts.rp ?? RP).copy(b, 0); b[32] = 0x01 | (opts.uv === false ? 0 : 0x04); b.writeUInt32BE(counter, 33); return b;
  };
  let counter = 0;
  return {
    credentialId,
    register(challenge: string) {
      // Like a real browser: the challenge bytes (our string, UTF-8) come back base64url-encoded.
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: b64(Buffer.from(challenge, 'utf8')), origin: opts.origin ?? ORIGIN }));
      return { credentialId, challenge, clientDataJSON: b64(cd), authenticatorData: b64(authData(0)), publicKey: b64(publicKey.export({ format: 'der', type: 'spki' }) as Buffer), alg: kind === 'ec' ? ALG.ES256 : ALG.EdDSA, label: 'Test phone' };
    },
    sign(challenge: string, c = ++counter) {
      const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: opts.origin ?? ORIGIN }));
      const ad = authData(c);
      const msg = Buffer.concat([ad, sha(cd)]);
      const signature = kind === 'ec' ? nodeCrypto.sign('sha256', msg, privateKey) : nodeCrypto.sign(null, msg, privateKey);
      return { credentialId, clientDataJSON: b64(cd), authenticatorData: b64(ad), signature: b64(signature) };
    },
  };
}

async function withApp(fn: (base: string, sign: ReturnType<typeof memorySignStore>) => Promise<void>) {
  const keys = memoryPasskeyStore(), sign = memorySignStore();
  const auth = (req: any, res: any, next: any) => { const h = String(req.headers.authorization || ''); if (!h.startsWith('Bearer ')) return res.status(401).json({}); req.uid = h.slice(7); next(); };
  const app = express();
  app.use(createPasskeyRouter({ authMiddleware: auth, store: keys, secret: () => SECRET, origin: () => ORIGIN }));
  app.use(createTelaSignRouter({
    authMiddleware: auth, optionalUid: async (req) => { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7) : null; },
    store: sign, passkeys: keys, secret: () => SECRET, origin: () => ORIGIN,
  }));
  const srv = app.listen(0);
  try { await fn(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`, sign); } finally { srv.close(); }
}
const call = async (base: string, method: string, path: string, body?: unknown, uid?: string) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(uid ? { authorization: `Bearer ${uid}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() as any };
};

test('enrol a passkey: the server keeps only the public key and refuses bad answers', async () => {
  await withApp(async (base) => {
    const phone = fakeDevice('ec');
    const opt = await call(base, 'POST', '/api/passkeys/register/options', {}, 'ana');
    assert.equal(opt.body.rp.id, RP);
    assert.equal(opt.body.authenticatorSelection.userVerification, 'required');
    const saved = await call(base, 'POST', '/api/passkeys/register', phone.register(opt.body.challenge), 'ana');
    assert.equal(saved.status, 201);
    assert.equal((await call(base, 'POST', '/api/passkeys/register', phone.register(opt.body.challenge), 'ana')).status, 409, 'no duplicates');

    // A challenge minted for someone else, a forged challenge, another website, or no device unlock are all refused.
    const other = await call(base, 'POST', '/api/passkeys/register/options', {}, 'mallory');
    assert.equal((await call(base, 'POST', '/api/passkeys/register', fakeDevice().register(other.body.challenge), 'ana')).status, 400);
    assert.equal((await call(base, 'POST', '/api/passkeys/register', fakeDevice().register('forged.x.y'), 'ana')).status, 400);
    const o2 = (await call(base, 'POST', '/api/passkeys/register/options', {}, 'ana')).body.challenge;
    assert.match((await call(base, 'POST', '/api/passkeys/register', fakeDevice('ec', { origin: 'https://evil.test' }).register(o2), 'ana')).body.error, /different website/);
    const o3 = (await call(base, 'POST', '/api/passkeys/register/options', {}, 'ana')).body.challenge;
    assert.match((await call(base, 'POST', '/api/passkeys/register', fakeDevice('ec', { uv: false }).register(o3), 'ana')).body.error, /fingerprint, face or device PIN/);

    const list = await call(base, 'GET', '/api/passkeys', undefined, 'ana');
    assert.equal(list.body.passkeys.length, 1);
    assert.ok(!('publicKey' in list.body.passkeys[0]));
    assert.equal((await call(base, 'DELETE', `/api/passkeys/${phone.credentialId}`, undefined, 'mallory')).status, 404, 'only the owner can remove it');
  });
});

test('seal a signature with a passkey: the device signs the exact envelope state', async () => {
  await withApp(async (base, store) => {
    const phone = fakeDevice('ed25519');
    const o = await call(base, 'POST', '/api/passkeys/register/options', {}, 'ana-uid');
    assert.equal((await call(base, 'POST', '/api/passkeys/register', phone.register(o.body.challenge), 'ana-uid')).status, 201);

    // Passkey sealing requires an account-bound signer.
    const bad = await call(base, 'POST', '/api/tela/sign/envelopes', {
      title: 'Lease', docType: 'lease', docText: 'x', signers: [{ id: 'a', name: 'Ana', email: 'a@x.co', requirePasskey: true }],
      fields: [{ signerId: 'a', type: 'signature', page: 1, x: 1, y: 1, w: 10, h: 5 }],
    }, 'landlord');
    assert.equal(bad.status, 400);

    const created = await call(base, 'POST', '/api/tela/sign/envelopes', {
      title: 'Commercial lease', docType: 'lease', docText: 'Suite 4, 12 months.', senderName: 'Pat',
      signers: [{ id: 'a', name: 'Ana Ruiz', email: 'ana@x.co', auth: 'plajah_account', uid: 'ana-uid', requirePasskey: true }],
      fields: [{ id: 'sig', signerId: 'a', type: 'signature', page: 1, x: 1, y: 1, w: 10, h: 5 }, { id: 'd', signerId: 'a', type: 'date_signed', page: 1, x: 20, y: 1, w: 10, h: 5 }],
    }, 'landlord');
    const id = created.body.envelope.id;
    await call(base, 'POST', `/api/tela/sign/envelopes/${id}/send`, {}, 'landlord');
    const as = { s: 'a', t: signerToken(SECRET, id, 'a') };
    const seen = await call(base, 'GET', `/api/tela/sign/envelopes/${id}/signer?s=a&t=${as.t}`, undefined, 'ana-uid');
    assert.equal(seen.body.you.requirePasskey, true);
    await call(base, 'POST', `/api/tela/sign/envelopes/${id}/consent`, as, 'ana-uid');
    await call(base, 'POST', `/api/tela/sign/envelopes/${id}/field`, { ...as, fieldId: 'sig', value: { method: 'typed', data: 'Ana Ruiz' } }, 'ana-uid');

    // Without a passkey the sender's requirement holds.
    const plain = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/finish`, as, 'ana-uid');
    assert.equal(plain.status, 409); assert.match(plain.body.error, /fingerprint, face or Windows Hello/);

    const ch = await call(base, 'GET', `/api/tela/sign/envelopes/${id}/seal-challenge?s=a&t=${as.t}`, undefined, 'ana-uid');
    assert.equal(ch.body.allowCredentials[0].id, phone.credentialId);

    // A signature over a different challenge (say, a stale state) is refused.
    const stale = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/finish`, { ...as, passkey: phone.sign('c3RhbGU') }, 'ana-uid');
    assert.equal(stale.status, 409); assert.match(stale.body.error, /different request/);

    const done = await call(base, 'POST', `/api/tela/sign/envelopes/${id}/finish`, { ...as, passkey: phone.sign(ch.body.challenge) }, 'ana-uid');
    assert.equal(done.status, 200); assert.equal(done.body.status, 'completed');

    const env = JSON.parse(store.rows.get(id)!) as Envelope;
    assert.ok(verifyAudit(env).ok);
    assert.match(env.audit.find((e) => e.event === 'signed')!.detail!, /Sealed with a passkey, verified on the device/);
    assert.ok(checkSeal(env, 'a', ORIGIN), 'the seal re-checks from the stored record alone');

    const v = await call(base, 'GET', `/api/tela/sign/verify/${env.finalHash}`);
    assert.deepEqual(v.body.signers[0].passkey, { sealed: true, valid: true, verifiedOnDevice: true });

    // Change the signed value afterwards: the seal no longer matches.
    const forged = structuredClone(env);
    (forged.fields.find((f) => f.id === 'sig')!.value as any).data = 'Someone Else';
    assert.equal(checkSeal(forged, 'a', ORIGIN), false);
  });
});

test('counter going backwards flags a copied passkey; synced passkeys (counter 0) are fine', () => {
  const dev = fakeDevice('ec');
  const reg = dev.register('x');
  const key: StoredPasskey = { credentialId: reg.credentialId, uid: 'u', publicKey: reg.publicKey, alg: ALG.ES256, signCount: 5, label: '', userVerified: true, backedUp: false, createdAt: 0 };
  assert.throws(() => verifyAssertion(dev.sign('abc', 3), key, { challenge: 'abc', origin: ORIGIN, rpId: RP }), /copied/);
  assert.equal(verifyAssertion(dev.sign('abc', 6), key, { challenge: 'abc', origin: ORIGIN, rpId: RP }).signCount, 6);
  assert.equal(verifyAssertion(dev.sign('abc', 0), { ...key, signCount: 0 }, { challenge: 'abc', origin: ORIGIN, rpId: RP }).signCount, 0);
});
