// services/genCloud/store.ts — persistence for the credit ledger and jobs. SERVER ONLY.
//
// Ledger: one doc per owner (uid or team pool) at genCloudLedgers/{owner}, written with
// compare-and-swap (services/casCore) so two Cloud Run instances can never both spend the same
// credits: read → apply the pure ledger function → guarded write → on conflict re-read and retry.
// The ledger is stored as one JSON string (holds are keyed by job id; a string keeps Firestore field
// names out of it). Jobs live at genCloudJobs/{id} with a few top-level fields for querying.
// Both collections are server-only: no client rule matches them, so Firestore denies clients.

import { casUpdate, type CasStore } from '../casCore';
import { emptyLedger, LedgerError, type Ledger } from './ledger';
import type { GenJob } from './gateway';

export const LEDGER_COLLECTION = 'genCloudLedgers';
export const JOB_COLLECTION = 'genCloudJobs';

const parse = (owner: string, doc: Record<string, any> | null): Ledger => {
  if (!doc?.json) return emptyLedger(owner);
  try { return JSON.parse(String(doc.json)) as Ledger; } catch { throw new Error(`ledger ${owner} is unreadable`); }
};

export function ledgerStore(cas: CasStore, now: () => number = Date.now) {
  return {
    async read(owner: string): Promise<Ledger> {
      const d = await cas.get(owner);
      return parse(owner, d ? d.data : null);
    },
    /** Atomic read-modify-write. Errors thrown by `fn` (e.g. LedgerError insufficient) pass through untouched. */
    async update(owner: string, fn: (l: Ledger) => Ledger): Promise<Ledger> {
      let thrown: unknown;
      const out = await casUpdate<Ledger | null>(cas, owner, cur => {
        const before = parse(owner, cur);
        let after: Ledger;
        try { after = fn(before); } catch (e) { thrown = e; return { abort: true, result: null }; }
        if (after === before) return { abort: true, result: before }; // no-op (idempotent repeat): no write
        return { patch: { owner, json: JSON.stringify(after), updatedAt: now() }, result: after };
      });
      if (thrown) throw thrown;
      if (out.ok) return out.result!;
      if (out.reason === 'ABORT') return out.result!;
      throw new Error(`ledger ${owner}: ${out.reason}`);
    },
  };
}

export interface JobDocStore {
  get(path: string): Promise<Record<string, any> | null>;
  set(path: string, data: Record<string, unknown>): Promise<boolean>;
}

export function jobStore(fs: JobDocStore) {
  return {
    async save(job: GenJob): Promise<void> {
      const ok = await fs.set(`${JOB_COLLECTION}/${job.id}`, {
        uid: job.uid, owner: job.owner, engine: job.engine, status: job.status,
        createdAt: job.createdAt, updatedAt: job.updatedAt, json: JSON.stringify(job),
      });
      if (!ok) throw new Error(`job ${job.id}: write failed`);
    },
    async get(id: string): Promise<GenJob | null> {
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
      const d = await fs.get(`${JOB_COLLECTION}/${id}`);
      if (!d?.json) return null;
      try { return JSON.parse(String(d.json)) as GenJob; } catch { return null; }
    },
  };
}

export { LedgerError };
