// Plajah ID core — the format of an identity number and its tamper-evident history (docs/plajah-id.md).
// Server-side (node:crypto). Pure functions only: no Firestore here, so the tests and the backfill share it.
//
// ID:       PJ-XXXX-XXXX-XXXX-XXXX (person) / PJO-XXXX-XXXX-XXXX-XXXX (organization)
//           15 random Crockford base32 characters (75 bits from crypto.randomBytes) + 1 check character.
//           Crockford's alphabet has no I, L, O or U, so no look-alike letters; typed I/L read as 1, O as 0.
//           The check character (Luhn mod 32) catches every single-character typo and most swaps.
//           Never derived from an email, name or uid: knowing anything about a person tells you nothing
//           about their ID, and nobody can choose one.
// History:  append-only events, each carrying the SHA-256 of the one before (prevHash). Changing or
//           deleting any past event breaks every hash after it, so verifyChain() finds it.

import { createHash, randomBytes } from 'node:crypto';

export type IdentityKind = 'person' | 'org';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const RANDOM_CHARS = 15;
export const PREFIX: Record<IdentityKind, string> = { person: 'PJ', org: 'PJO' };

function luhnMod32(chars: string): string {
  // Luhn mod N (N = 32): double every second code point from the right, fold the base-N digits.
  let factor = 2, sum = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const cp = ALPHABET.indexOf(chars[i]);
    let addend = factor * cp;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / 32) + (addend % 32);
    sum += addend;
  }
  return ALPHABET[(32 - (sum % 32)) % 32];
}

const group = (body: string) => body.match(/.{1,4}/g)!.join('-');

/** A new random Plajah ID. `rand` is injectable for tests only. */
export function generatePlajahId(kind: IdentityKind, rand: (n: number) => Uint8Array = n => randomBytes(n)): string {
  const bytes = rand(RANDOM_CHARS);
  let body = '';
  // One byte per character, folded to 5 bits (256 is a multiple of 32, so no bias).
  for (let i = 0; i < RANDOM_CHARS; i++) body += ALPHABET[bytes[i] & 31];
  return `${PREFIX[kind]}-${group(body + luhnMod32(body))}`;
}

/** Normalize what someone typed (case, spaces, look-alikes). Returns the canonical ID, or null if invalid. */
export function parsePlajahId(input: string): { id: string; kind: IdentityKind } | null {
  const raw = (input || '').toUpperCase().replace(/[\s_]/g, '');
  const m = raw.match(/^(PJO|PJ)-?([0-9A-Z-]+)$/);
  if (!m) return null;
  const kind: IdentityKind = m[1] === 'PJO' ? 'org' : 'person';
  const body = m[2].replace(/-/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  if (body.length !== RANDOM_CHARS + 1 || [...body].some(c => !ALPHABET.includes(c))) return null;
  const payload = body.slice(0, RANDOM_CHARS);
  if (luhnMod32(payload) !== body[RANDOM_CHARS]) return null;
  return { id: `${PREFIX[kind]}-${group(body)}`, kind };
}

export function isPlajahId(input: string): boolean {
  return parsePlajahId(input)?.id === input;
}

/** Firestore doc id for a history event (zero-padded so ids sort in sequence). */
export const seqDocId = (seq: number) => String(seq).padStart(8, '0');

// ── History ───────────────────────────────────────────────────────────────────────────────────────

export type IdentityEventType =
  | 'created'          // the identity was minted
  | 'login_linked'     // a sign-in (Firebase uid) was attached
  | 'controller_added' // org: a person ID can control this org
  | 'org_linked';      // org: bound to organizations/{orgId}

export interface IdentityEvent {
  seq: number;
  type: IdentityEventType;
  /** ms since epoch, server clock. */
  at: number;
  /** Who did it: a Plajah ID, or 'system' (backfill / server). */
  actor: string;
  data: Record<string, unknown>;
  /** SHA-256 hex of the previous event ('' for seq 0). */
  prevHash: string;
  /** SHA-256 hex of this event's other fields. */
  hash: string;
}

/** JSON with object keys sorted at every level, so the same event always hashes the same. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

export function eventHash(id: string, e: Omit<IdentityEvent, 'hash'>): string {
  return createHash('sha256')
    .update(canonicalJson({ id, seq: e.seq, type: e.type, at: e.at, actor: e.actor, data: e.data, prevHash: e.prevHash }))
    .digest('hex');
}

/** The next event in a chain whose newest event is `head` (null for a new identity). */
export function nextEvent(id: string, head: Pick<IdentityEvent, 'seq' | 'hash'> | null, type: IdentityEventType, actor: string, data: Record<string, unknown>, at = Date.now()): IdentityEvent {
  const base = { seq: head ? head.seq + 1 : 0, type, at, actor, data, prevHash: head ? head.hash : '' };
  return { ...base, hash: eventHash(id, base) };
}

/** Check a whole history, oldest first. `brokenAt` = the first event that doesn't verify. */
export function verifyChain(id: string, events: IdentityEvent[]): { ok: true } | { ok: false; brokenAt: number; reason: string } {
  let prev = '';
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.seq !== i) return { ok: false, brokenAt: i, reason: 'missing or out-of-order event' };
    if (e.prevHash !== prev) return { ok: false, brokenAt: i, reason: 'link to the previous event does not match' };
    const { hash, ...rest } = e;
    if (eventHash(id, rest) !== hash) return { ok: false, brokenAt: i, reason: 'event was changed after it was written' };
    prev = hash;
  }
  return { ok: true };
}
