// Licence + rights ledger — the pure half (hashing, entry shape, verification). Server I/O lives in
// routes/ledger.ts; only the server appends (firestore.rules deny client writes).
//
// One append-only chain per work (`book:<albumId>`, `film:<id>`, …). Every entry carries the previous
// entry's hash and its own hash over a canonical JSON of its fields, so any edit, deletion or reorder
// is detectable by re-walking the chain (verifyChain). No blockchain is needed for that; a chain head
// can later be anchored externally (Bitcoin inscription, OCME registry) without changing entries.

import { createHash } from 'node:crypto';

export type LedgerEvent =
  // licence events (subject = the reader who holds it)
  | 'MINT' | 'EDITION_UPGRADE' | 'REVOKE' | 'TRANSFER' | 'GIFT' | 'CLAIM' | 'POOL_CANCELLED'
  // rights / publication events (actor = the author)
  | 'VERSION_PUBLISHED' | 'EDITION_PUBLISHED' | 'RIGHTS_DECLARED';

export interface LedgerBody {
  event: LedgerEvent;
  workKind: string;
  workId: string;
  at: number;
  subjectUid?: string;
  actorUid?: string;
  licenseId?: string;
  edition?: number;
  editions?: number[];
  versionId?: string;
  paymentRef?: string;
  priceCents?: number;
  currency?: string;
  note?: string;
  /** RIGHTS_DECLARED: sha-256 of each file the declaration covers (absent on older entries, so their hashes are unchanged). */
  fileHashes?: string[];
}

export interface LedgerEntry extends LedgerBody {
  workKey: string;
  seq: number;
  prevHash: string;
  hash: string;
}

export const GENESIS = '0'.repeat(64);
export const workKeyOf = (workKind: string, workId: string) => `${workKind}:${workId}`;
/** Firestore doc id for an entry; zero-padded so ids sort in chain order. */
export const entryIdOf = (workKey: string, seq: number) => `${workKey.replace(/[^\w:-]/g, '_').replace(/:/g, '__')}_${String(seq).padStart(8, '0')}`;

/** Deterministic JSON: sorted keys, undefined dropped. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

const HASHED: ReadonlyArray<keyof LedgerEntry> = ['event', 'workKind', 'workId', 'at', 'subjectUid', 'actorUid', 'licenseId', 'edition', 'editions', 'versionId', 'paymentRef', 'priceCents', 'currency', 'note', 'fileHashes', 'workKey', 'seq', 'prevHash'];

export function hashEntry(e: Omit<LedgerEntry, 'hash'>): string {
  const picked: Record<string, unknown> = {};
  for (const k of HASHED) picked[k] = (e as any)[k];
  return createHash('sha256').update(canonical(picked)).digest('hex');
}

export function makeEntry(body: LedgerBody, seq: number, prevHash: string): LedgerEntry {
  const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== '')) as unknown as LedgerBody;
  const base = { ...clean, workKey: workKeyOf(body.workKind, body.workId), seq, prevHash };
  return { ...base, hash: hashEntry(base) };
}

export interface ChainCheck { ok: boolean; length: number; head: string; problem?: string; atSeq?: number }

/** Re-walk one work's chain (entries in any order). */
export function verifyChain(entries: ReadonlyArray<LedgerEntry>): ChainCheck {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.seq !== i + 1) return { ok: false, length: sorted.length, head: prev, problem: `missing entry before #${e.seq}`, atSeq: e.seq };
    if (e.prevHash !== prev) return { ok: false, length: sorted.length, head: prev, problem: `entry #${e.seq} does not follow #${e.seq - 1}`, atSeq: e.seq };
    const { hash, ...rest } = e;
    if (hashEntry(rest) !== hash) return { ok: false, length: sorted.length, head: prev, problem: `entry #${e.seq} was altered`, atSeq: e.seq };
    prev = hash;
  }
  return { ok: true, length: sorted.length, head: prev };
}
