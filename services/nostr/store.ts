// ─── Nostr persistence, signed tickets, and at-rest encryption ────────────────
// Server-only collections (no firestore.rules entry needed — clients never read them directly):
//   nostr_accounts/{uid}          linked pubkey + settings (NO secrets)
//   nostr_keys/{uid}              encrypted secret key, only if the user explicitly generated a server-held key
//   nostr_names/{name}            NIP-05 name → { uid, pubkey }
//   nostr_pubkeys/{pubkey}        pubkey → { uid } (one Plajah account per key)
//   nostr_published/{uid}__{ref}  event ids we published for a post/track (for kind-5 deletes)
//   nostr_orgs/{orgId}            admin opt-in for church/school/nonprofit orgs

import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { fsGet, fsSet, fsPatch, fsDelete } from '../firebaseAdminRest';

export interface NostrStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<boolean>;
  patch(path: string, data: Record<string, unknown>): Promise<boolean>;
  delete(path: string): Promise<boolean>;
}
export const firestoreStore: NostrStore = { get: fsGet, set: fsSet, patch: fsPatch, delete: fsDelete };

/** In-memory store (tests, local dev). */
export function memoryStore(): NostrStore & { data: Map<string, Record<string, any>> } {
  const data = new Map<string, Record<string, any>>();
  return {
    data,
    async get(p) { const v = data.get(p); return v ? structuredClone(v) : null; },
    async set(p, d) { data.set(p, structuredClone(d) as any); return true; },
    async patch(p, d) { data.set(p, { ...(data.get(p) ?? {}), ...structuredClone(d) as any }); return true; },
    async delete(p) { data.delete(p); return true; },
  };
}

export interface NostrAccount {
  pubkey: string;
  npub: string;
  method: 'nip07' | 'nip46' | 'manual' | 'server';
  linkedAt: number;
  relays: string[];
  lud16?: string;
  nip05Name?: string;
  autoPublish: boolean;
  hasServerKey?: boolean;
}

// ── encryption (same AES-256-GCM scheme + ENCRYPTION_KEY as services/fediverse/auth.ts encryptCreds) ──
function encKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (raw.length < 16) throw new Error('ENCRYPTION_KEY env var must be at least 16 chars');
  return Buffer.from(raw.padEnd(64, '0').slice(0, 64), 'hex');
}
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${ct.toString('hex')}`;
}
export function decryptSecret(raw: string): string {
  const [iv, tag, ct] = String(raw).split(':');
  if (!iv || !tag || !ct) throw new Error('bad ciphertext');
  const d = createDecipheriv('aes-256-gcm', encKey(), Buffer.from(iv, 'hex'));
  d.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([d.update(Buffer.from(ct, 'hex')), d.final()]).toString('utf8');
}

// ── tickets: stateless HMAC-signed, short-lived proofs that the server prepared something ──
function ticketKey(): string {
  const k = process.env.NOSTR_TICKET_SECRET || process.env.ENCRYPTION_KEY || '';
  if (k.length < 16) throw new Error('NOSTR_TICKET_SECRET (or ENCRYPTION_KEY) must be set');
  return `nostr-ticket:${k}`;
}
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signTicket(payload: Record<string, unknown>, ttlSec = 600): string {
  const body = b64u(JSON.stringify({ ...payload, x: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${body}.${createHmac('sha256', ticketKey()).update(body).digest('base64url')}`;
}
export function readTicket<T = Record<string, any>>(ticket: unknown): (T & { x: number }) | null {
  if (typeof ticket !== 'string' || ticket.length > 4000) return null;
  const [body, mac] = ticket.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', ticketKey()).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!p || typeof p.x !== 'number' || p.x < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

/** Fingerprint of an event's signable body minus pubkey — ties a signed event to the template we prepared. */
export const templateHash = (e: { kind: number; created_at: number; tags: string[][]; content: string }) =>
  createHash('sha256').update(JSON.stringify([e.kind, e.created_at, e.tags, e.content])).digest('hex');

export const publishedPath = (uid: string, refType: string, refId: string) => `nostr_published/${uid}__${refType}_${refId}`.slice(0, 1400);
