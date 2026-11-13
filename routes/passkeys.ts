// Passkeys on Plajah accounts: add, list, remove. Used by Tela Sign to seal signatures, and later for
// passwordless sign-in. Pure verification: services/auth/passkeyCore.ts.
//
// Storage: passkeys/{credentialId}  (server-only in firestore.rules). Public keys only — never biometrics.

import { Router } from 'express';
import express from 'express';
import { ALG, challengeValid, issueChallenge, verifyRegistration, type StoredPasskey } from '../services/auth/passkeyCore';

export interface PasskeyStore {
  listByUid(uid: string): Promise<StoredPasskey[]>;
  get(credentialId: string): Promise<StoredPasskey | null>;
  /** Create-only: false if the credential already exists. */
  add(p: StoredPasskey): Promise<boolean>;
  touch(credentialId: string, signCount: number, at: number): Promise<void>;
  remove(credentialId: string): Promise<void>;
}

export function memoryPasskeyStore(): PasskeyStore {
  const rows = new Map<string, StoredPasskey>();
  return {
    async listByUid(uid) { return [...rows.values()].filter((p) => p.uid === uid); },
    async get(id) { return rows.get(id) ?? null; },
    async add(p) { if (rows.has(p.credentialId)) return false; rows.set(p.credentialId, p); return true; },
    async touch(id, signCount, at) { const p = rows.get(id); if (p) rows.set(id, { ...p, signCount, lastUsedAt: at }); },
    async remove(id) { rows.delete(id); },
  };
}

export async function firestorePasskeyStore(): Promise<PasskeyStore> {
  const { fsGet, fsQuery, fsPatch, fsDelete } = await import('../services/firebaseAdminRest');
  const { fsCreateOnce } = await import('../services/safety/safetyServerIo');
  const path = (id: string) => `passkeys/${encodeURIComponent(id)}`;
  return {
    async listByUid(uid) { return (await fsQuery('passkeys', [{ field: 'uid', value: uid }], 50)).map((r) => r.data as StoredPasskey); },
    async get(id) { return (await fsGet(path(id))) as StoredPasskey | null; },
    async add(p) { return (await fsCreateOnce('passkeys', p.credentialId, p as unknown as Record<string, unknown>)) === 'created'; },
    async touch(id, signCount, at) { await fsPatch(path(id), { signCount, lastUsedAt: at }); },
    async remove(id) { await fsDelete(path(id)); },
  };
}

export interface PasskeyRouterDeps {
  authMiddleware: any;
  store: PasskeyStore | Promise<PasskeyStore>;
  secret: () => string;
  /** Public origin, e.g. https://plajah.com; the relying-party id is its host name. */
  origin: () => string;
  limiter?: any;
  now?: () => number;
}

export const rpIdOf = (origin: string) => new URL(origin).hostname;
const publicView = (p: StoredPasskey) => ({ credentialId: p.credentialId, label: p.label, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt ?? null, backedUp: p.backedUp });

export function createPasskeyRouter(deps: PasskeyRouterDeps): Router {
  const r = Router();
  const now = deps.now ?? (() => Date.now());
  const storeP = Promise.resolve(deps.store);
  const json = express.json({ limit: '32kb' });
  if (deps.limiter) r.use('/api/passkeys', deps.limiter);
  const noStore = (res: any) => res.setHeader('Cache-Control', 'private, no-store');

  r.post('/api/passkeys/register/options', deps.authMiddleware, async (req: any, res) => {
    const secret = deps.secret();
    if (!secret) return res.status(503).json({ error: 'Passkeys aren’t configured on this server.' });
    const existing = await (await storeP).listByUid(req.uid);
    if (existing.length >= 10) return res.status(400).json({ error: 'You have 10 passkeys. Remove one to add another.' });
    noStore(res);
    res.json({
      challenge: issueChallenge(secret, req.uid, 'register', now()),
      rp: { id: rpIdOf(deps.origin()), name: 'Plajah' },
      user: { id: Buffer.from(req.uid).toString('base64url'), name: String(req.email || req.uid), displayName: String(req.email || 'Plajah account') },
      pubKeyCredParams: [ALG.ES256, ALG.EdDSA, ALG.RS256].map((alg) => ({ type: 'public-key', alg })),
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      attestation: 'none',
      timeout: 120_000,
      excludeCredentials: existing.map((p) => ({ type: 'public-key', id: p.credentialId })),
    });
  });

  r.post('/api/passkeys/register', json, deps.authMiddleware, async (req: any, res) => {
    const secret = deps.secret();
    if (!secret) return res.status(503).json({ error: 'Passkeys aren’t configured on this server.' });
    const b = req.body || {};
    if (!challengeValid(secret, req.uid, 'register', String(b.challenge || ''), now())) return res.status(400).json({ error: 'That request expired. Try adding the passkey again.' });
    let key: StoredPasskey;
    try {
      key = verifyRegistration(b, { uid: req.uid, challenge: String(b.challenge), origin: deps.origin(), rpId: rpIdOf(deps.origin()), now: now() });
    } catch (e: any) { return res.status(400).json({ error: e.message }); }
    if (!(await (await storeP).add(key))) return res.status(409).json({ error: 'That passkey is already saved.' });
    noStore(res);
    res.status(201).json({ passkey: publicView(key) });
  });

  r.get('/api/passkeys', deps.authMiddleware, async (req: any, res) => {
    noStore(res);
    res.json({ passkeys: (await (await storeP).listByUid(req.uid)).map(publicView) });
  });

  r.delete('/api/passkeys/:id', deps.authMiddleware, async (req: any, res) => {
    const store = await storeP;
    const p = await store.get(String(req.params.id));
    if (!p || p.uid !== req.uid) return res.status(404).json({ error: 'Passkey not found.' });
    await store.remove(p.credentialId);
    res.json({ removed: true });
  });

  return r;
}
