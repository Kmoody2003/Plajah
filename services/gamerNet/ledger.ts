// Plajah Gamer Ledger — the pure half. One append-only, hash-chained history per player: every match,
// achievement and imported record from another platform. The universal gamer score, ratings and record
// are a pure fold over this chain (services/gamerNet/score.ts), so anyone holding the entries can
// re-verify the chain AND recompute the score — the history belongs to the player, not to a store.
//
// Same construction as the licence ledger (services/ledger/licenseLedger.ts): canonical JSON, sha-256,
// each entry carries the previous hash. A chain head can later be anchored externally without changing entries.

import { createHash } from 'node:crypto';
import { canonical } from '../ledger/licenseLedger';

export type GamerEvent =
  | 'MATCH_RESULT'     // a first-party online match the server refereed
  | 'ACHIEVEMENT'      // earned in a first-party game (server-verified) or imported
  | 'LOCAL_PLAY'       // same-device / vs-CPU game: history only, never scored
  | 'EXTERNAL_IMPORT'; // playtime/achievements from another platform (Steam, Xbox, PSN, a partner game …)

/** How much the network trusts where a record came from. Scored by score.ts → SOURCE_TRUST. */
export type GamerSource = 'first-party' | 'partner' | 'linked' | 'self';

export interface GamerEventBody {
  event: GamerEvent;
  uid: string;
  at: number;
  /** Idempotency key: the same real-world event is never appended twice (e.g. `match:<id>`). */
  key: string;
  source: GamerSource;
  game?: string;
  matchId?: string;
  opponentUid?: string;
  result?: 'win' | 'loss' | 'draw';
  rated?: boolean;
  reason?: 'line' | 'draw' | 'timeout' | 'resign';
  ratingBefore?: number;
  ratingAfter?: number;
  achievementId?: string;
  points?: number;
  platform?: string;
  externalGameId?: string;
  hours?: number;
  achievementsUnlocked?: number;
  note?: string;
}

export interface GamerEntry extends GamerEventBody { seq: number; prevHash: string; hash: string }

export const GENESIS = '0'.repeat(64);
export const entryId = (uid: string, seq: number) => `${uid.replace(/[^\w-]/g, '_')}_${String(seq).padStart(8, '0')}`;

export function hashEntry(e: Omit<GamerEntry, 'hash'>): string {
  const { hash: _drop, ...rest } = e as GamerEntry;
  return createHash('sha256').update(canonical(rest)).digest('hex');
}

export function makeEntry(body: GamerEventBody, seq: number, prevHash: string): GamerEntry {
  const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== '')) as unknown as GamerEventBody;
  const base = { ...clean, seq, prevHash };
  return { ...base, hash: hashEntry(base) };
}

export interface ChainCheck { ok: boolean; length: number; head: string; problem?: string }

export function verifyChain(entries: ReadonlyArray<GamerEntry>): ChainCheck {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.seq !== i + 1) return { ok: false, length: sorted.length, head: prev, problem: `missing entry before #${e.seq}` };
    if (e.prevHash !== prev) return { ok: false, length: sorted.length, head: prev, problem: `entry #${e.seq} does not follow #${e.seq - 1}` };
    if (hashEntry(e) !== e.hash) return { ok: false, length: sorted.length, head: prev, problem: `entry #${e.seq} was altered` };
    prev = e.hash;
  }
  return { ok: true, length: sorted.length, head: prev };
}
