// ─── Generation credential vault ─────────────────────────────────────────────
// SERVER-SIDE ONLY — do not import from browser/React code.
//
// Per-user API keys for external generation services, encrypted at rest with AES-256-GCM under the
// same `ENCRYPTION_KEY` the fediverse credentials use. The wire format is identical
// ("{iv}:{tag}:{ciphertext}") so there is one thing to rotate, not two.
//
// Rules this file exists to enforce:
//   - a key is written once and never read back to the client, only used server-side;
//   - `listLinked` and every response shape expose presence and a masked hint, never the value;
//   - keys are scoped by uid+provider, so one user's key can never be used for another's job.
//
// Storage is left to the caller (`VaultStore`) so this stays testable and doesn't bind to a
// particular Firestore access path.

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (raw.length < 16) {
    throw new Error('ENCRYPTION_KEY env var must be at least 16 chars (64 hex chars ideal)');
  }
  return Buffer.from(raw.padEnd(64, '0').slice(0, 64), 'hex');
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}

export function decryptSecret(raw: string): string {
  const parts = String(raw).split(':');
  if (parts.length < 3) throw new Error('Stored credential is malformed — re-link the account.');
  const [ivHex, tagHex, ...rest] = parts;
  const decipher = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(rest.join(':'), 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

/** Last four characters only — enough for a user to tell two keys apart, useless to anyone else. */
export function maskKey(key: string): string {
  const k = String(key || '');
  return k.length <= 4 ? '••••' : `••••${k.slice(-4)}`;
}

export interface VaultRecord {
  provider: string;
  secret: string;      // encrypted
  hint: string;        // masked, safe to return to the client
  linkedAt: number;
}

/** Whatever the host uses to persist records, keyed by uid. */
export interface VaultStore {
  read(uid: string): Promise<Record<string, VaultRecord>>;
  write(uid: string, records: Record<string, VaultRecord>): Promise<void>;
}

/** In-memory store — used by tests, and as a dev fallback when no persistent store is configured.
 *  Deliberately NOT a default in production paths: a restart must not silently drop a user's key
 *  without them being told to re-link. */
export function memoryVaultStore(): VaultStore {
  const mem = new Map<string, Record<string, VaultRecord>>();
  return {
    async read(uid) { return mem.get(uid) || {}; },
    async write(uid, records) { mem.set(uid, records); },
  };
}

export async function saveKey(store: VaultStore, uid: string, provider: string, key: string): Promise<VaultRecord> {
  const trimmed = String(key || '').trim();
  if (!uid) throw new Error('Not signed in.');
  if (!trimmed) throw new Error('No key provided.');
  const records = await store.read(uid);
  const rec: VaultRecord = {
    provider,
    secret: encryptSecret(trimmed),
    hint: maskKey(trimmed),
    linkedAt: Date.now(),
  };
  records[provider] = rec;
  await store.write(uid, records);
  return rec;
}

/** The decrypted key, for server-side use only. Never return this to a client. */
export async function readKey(store: VaultStore, uid: string, provider: string): Promise<string | null> {
  const rec = (await store.read(uid))[provider];
  if (!rec?.secret) return null;
  try { return decryptSecret(rec.secret); } catch { return null; }
}

export async function revokeKey(store: VaultStore, uid: string, provider: string): Promise<boolean> {
  const records = await store.read(uid);
  if (!records[provider]) return false;
  delete records[provider];
  await store.write(uid, records);
  return true;
}

/** Safe summary for the client: which providers are linked, and a masked hint. No secrets. */
export async function listLinked(store: VaultStore, uid: string): Promise<{ provider: string; hint: string; linkedAt: number }[]> {
  const records = await store.read(uid);
  return Object.values(records).map((r) => ({ provider: r.provider, hint: r.hint, linkedAt: r.linkedAt }));
}
