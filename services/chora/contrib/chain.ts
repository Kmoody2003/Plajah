// Contribution ledger — hashing and verification (server side; uses node:crypto).
// Same construction as the licence ledger (services/ledger/licenseLedger.ts): each entry carries
// the previous entry's hash and its own hash over a canonical JSON of its fields, so an edit,
// deletion or reorder is detectable by re-walking the chain. A chain head can later be anchored
// on a public chain without changing any entry.

import { createHash } from 'node:crypto';
import { canonical, GENESIS } from '../../ledger/licenseLedger';
import type { ChainCheck, ContribEntry } from './types';

export { GENESIS };

const HASHED: ReadonlyArray<keyof ContribEntry> = [
  'projectId', 'seq', 'uid', 'name', 'at', 'kind', 'target', 'track', 'instrument', 'count', 'sha256',
  'origin', 'clientAt', 'sealedHead', 'label', 'prevHash',
];

export function hashContrib(e: Omit<ContribEntry, 'hash'>): string {
  const picked: Record<string, unknown> = {};
  for (const k of HASHED) picked[k] = (e as any)[k];
  return createHash('sha256').update(canonical(picked)).digest('hex');
}

export function makeContrib(body: Omit<ContribEntry, 'hash' | 'seq' | 'prevHash'>, seq: number, prevHash: string): ContribEntry {
  const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== '')) as typeof body;
  const base = { ...clean, seq, prevHash };
  return { ...base, hash: hashContrib(base) };
}

export const contribDocId = (projectId: string, seq: number) => `${projectId.replace(/[^\w-]/g, '_')}_${String(seq).padStart(8, '0')}`;

export function verifyContribChain(entries: ReadonlyArray<ContribEntry>): ChainCheck {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  let prev = GENESIS;
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.seq !== i + 1) return { ok: false, length: sorted.length, head: prev, problem: `missing entry before #${e.seq}`, atSeq: e.seq };
    if (e.prevHash !== prev) return { ok: false, length: sorted.length, head: prev, problem: `entry #${e.seq} does not follow #${e.seq - 1}`, atSeq: e.seq };
    const { hash, ...rest } = e;
    if (hashContrib(rest) !== hash) return { ok: false, length: sorted.length, head: prev, problem: `entry #${e.seq} was altered`, atSeq: e.seq };
    prev = hash;
  }
  return { ok: true, length: sorted.length, head: prev };
}

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const KINDS = new Set(['recorded', 'imported', 'generated', 'notes', 'beat', 'sound', 'lyrics', 'arranged', 'mixed', 'mastered']);

/** Validate one client event; null = drop it. The client never chooses uid/name/at/seq. 'sealed' only via /seal. */
export function sanitizeEvent(raw: any): Pick<ContribEntry, 'kind' | 'target' | 'track' | 'instrument' | 'count' | 'sha256' | 'origin' | 'clientAt'> | null {
  if (!raw || typeof raw !== 'object' || !KINDS.has(raw.kind)) return null;
  const target = str(raw.target, 160);
  if (!target) return null;
  const sha = Array.isArray(raw.sha256) ? raw.sha256.filter((s: unknown) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)).slice(0, 32) : undefined;
  const o = raw.origin && typeof raw.origin === 'object' ? raw.origin : undefined;
  const origin = o ? Object.fromEntries(Object.entries({
    app: str(o.app, 24), device: str(o.device, 80), input: str(o.input, 120), file: str(o.file, 160), engine: str(o.engine, 60),
    performer: typeof o.performer === 'string' && /^[\w-]{6,128}$/.test(o.performer) ? o.performer : undefined,
  }).filter(([, v]) => v)) : undefined;
  return {
    kind: raw.kind,
    target,
    track: str(raw.track, 80),
    instrument: str(raw.instrument, 24),
    count: Math.max(1, Math.min(100000, Math.floor(Number(raw.count) || 1))),
    sha256: sha?.length ? sha : undefined,
    origin: origin && Object.keys(origin).length ? origin : undefined,
    clientAt: Number.isFinite(Number(raw.clientAt)) ? Number(raw.clientAt) : Date.now(),
  };
}
