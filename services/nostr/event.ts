// ─── NIP-01 events ────────────────────────────────────────────────────────────
// id = sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content])), sig = BIP-340 over id.

import { sha256, bytesToHex, schnorrSign, schnorrVerify, getPublicKey } from './schnorr';

export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}
export type UnsignedEvent = Omit<NostrEvent, 'id' | 'sig' | 'pubkey'> & { pubkey?: string };

export const KIND = {
  METADATA: 0, NOTE: 1, DELETE: 5, FILE_METADATA: 1063, CLIENT_AUTH: 22242,
  ZAP_REQUEST: 9734, ZAP_RECEIPT: 9735, MUSIC_TRACK: 31337,
} as const;

const HEX64 = /^[0-9a-f]{64}$/;
const MAX_CONTENT = 64_000;
const MAX_TAGS = 200;

export const nowSec = () => Math.floor(Date.now() / 1000);

export function serializeEvent(e: { pubkey: string; created_at: number; kind: number; tags: string[][]; content: string }): string {
  return JSON.stringify([0, e.pubkey, e.created_at, e.kind, e.tags, e.content]);
}
export const getEventHash = (e: Parameters<typeof serializeEvent>[0]) => bytesToHex(sha256(serializeEvent(e)));

/** Structural check only (types, sizes, hex). */
export function isWellFormed(e: unknown): e is NostrEvent {
  const x = e as NostrEvent;
  return !!x && typeof x === 'object'
    && typeof x.id === 'string' && HEX64.test(x.id)
    && typeof x.pubkey === 'string' && HEX64.test(x.pubkey)
    && typeof x.sig === 'string' && /^[0-9a-f]{128}$/.test(x.sig)
    && Number.isInteger(x.created_at) && x.created_at > 0
    && Number.isInteger(x.kind) && x.kind >= 0 && x.kind <= 65535
    && typeof x.content === 'string' && x.content.length <= MAX_CONTENT
    && Array.isArray(x.tags) && x.tags.length <= MAX_TAGS
    && x.tags.every(t => Array.isArray(t) && t.length > 0 && t.length <= 20 && t.every(v => typeof v === 'string' && v.length <= 2048));
}

/** Well-formed, id matches its content, and the signature is valid for pubkey. */
export function verifyEvent(e: unknown): e is NostrEvent {
  if (!isWellFormed(e)) return false;
  if (getEventHash(e) !== e.id) return false;
  return schnorrVerify(e.sig, e.id, e.pubkey);
}

/** Sign a template with a secret key (server-held key mode, and tests). */
export function finalizeEvent(t: UnsignedEvent, secHex: string): NostrEvent {
  const pubkey = getPublicKey(secHex);
  const base = { pubkey, created_at: t.created_at ?? nowSec(), kind: t.kind, tags: t.tags ?? [], content: t.content ?? '' };
  const id = getEventHash(base);
  return { ...base, id, sig: schnorrSign(id, secHex) };
}

export const tagValues = (e: { tags: string[][] }, name: string) => e.tags.filter(t => t[0] === name).map(t => t[1] ?? '');

const NSFW_WORDS = new Set(['nsfw', 'porn', 'nude', 'nudity', 'sex', 'xxx', 'explicit', 'adult', 'onlyfans', 'gore']);
/** True when an event carries a NIP-36 content-warning, an NSFW hashtag, or an NSFW NIP-32 label. */
export function isSensitive(e: { tags: string[][]; content: string }): boolean {
  if (e.tags.some(t => t[0] === 'content-warning')) return true;
  if (tagValues(e, 't').some(t => NSFW_WORDS.has(t.toLowerCase()))) return true;
  if (e.tags.some(t => t[0] === 'l' && /nsfw|porn|nudity|sexual|gore/i.test(t[1] ?? ''))) return true;
  if (e.tags.some(t => t[0] === 'L' && /content-warning/i.test(t[1] ?? ''))) return true;
  if (/(^|\s)#(nsfw|porn|xxx|nude|gore)\b/i.test(e.content)) return true;
  return false;
}
