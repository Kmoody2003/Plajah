// Licence + rights ledger — server I/O and routes. Pure hashing/verification: services/ledger/licenseLedger.ts.
// Mounted in server.ts:  app.use('/api/ledger', createLedgerRouter({ ... }))
//
// Storage: licenseLedger/{entryId} (one doc per entry) + ledgerHeads/{workKey} (seq + head hash, a cache
// of the chain tip). Both are server-only in firestore.rules except that a reader may read entries about
// themselves. Appends are race-safe: the entry id is the sequence number, created with create-only
// semantics, so two concurrent appends can never both take the same slot.
//
// Endpoints
//   GET /api/ledger/mine                       auth: my licence history (all works)
//   GET /api/ledger/work/:kind/:id             author/admin: one work's full chain + verification

import { Router } from 'express';
import { fsGet, fsSet, fsQuery } from '../services/firebaseAdminRest';
import { fsCreateOnce } from '../services/safety/safetyServerIo';
import { GENESIS, entryIdOf, makeEntry, verifyChain, workKeyOf, type LedgerBody, type LedgerEntry } from '../services/ledger/licenseLedger';

const headId = (workKey: string) => workKey.replace(/[^\w:-]/g, '_').replace(/:/g, '__');

/** Append one event to its work's chain. Never throws: a ledger failure must not break a sale. */
export async function appendLedger(body: LedgerBody): Promise<LedgerEntry | null> {
  const workKey = workKeyOf(body.workKind, body.workId);
  try {
    const head = await fsGet(`ledgerHeads/${headId(workKey)}`);
    let seq = Number(head?.seq) || 0;
    let prevHash = typeof head?.hash === 'string' ? head.hash : GENESIS;
    for (let attempt = 0; attempt < 25; attempt++) {
      const entry = makeEntry(body, seq + 1, prevHash);
      const r = await fsCreateOnce('licenseLedger', entryIdOf(workKey, entry.seq), entry as unknown as Record<string, unknown>);
      if (r === 'created') {
        await fsSet(`ledgerHeads/${headId(workKey)}`, { workKey, seq: entry.seq, hash: entry.hash, updatedAt: Date.now() });
        return entry;
      }
      if (r === 'error') break;
      // Slot taken (a concurrent append, or the head cache lagged): step past it.
      const taken = await fsGet(`licenseLedger/${entryIdOf(workKey, seq + 1)}`);
      if (!taken?.hash) break;
      seq += 1; prevHash = taken.hash;
    }
  } catch (e: any) {
    console.error('[ledger] append failed', workKey, body.event, e?.message || e);
  }
  console.error('[ledger] could not append', workKey, body.event);
  return null;
}

export async function readChain(workKind: string, workId: string): Promise<LedgerEntry[]> {
  const rows = await fsQuery('licenseLedger', [{ field: 'workKey', value: workKeyOf(workKind, workId) }], 1000);
  return rows.map(r => r.data as LedgerEntry).sort((a, b) => a.seq - b.seq);
}

export interface LedgerRouterDeps {
  authMiddleware: any;
  isAdmin: (req: any) => Promise<boolean>;
}

export function createLedgerRouter(deps: LedgerRouterDeps): Router {
  const r = Router();

  r.get('/mine', deps.authMiddleware, async (req: any, res) => {
    const rows = await fsQuery('licenseLedger', [{ field: 'subjectUid', value: req.uid }], 500);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ entries: rows.map(x => x.data).sort((a: any, b: any) => b.at - a.at) });
  });

  r.get('/work/:kind/:id', deps.authMiddleware, async (req: any, res) => {
    const kind = String(req.params.kind), id = String(req.params.id);
    // Books, films and music all live in albums/{id}; the author of the work (or an admin) may audit it.
    const album = await fsGet(`albums/${encodeURIComponent(id)}`);
    const owner = String(album?.ownerId || album?.ownerUid || album?.creatorUid || '');
    if (owner !== req.uid && !(await deps.isAdmin(req))) return res.status(403).json({ error: 'Only the author can view this ledger' });
    const entries = await readChain(kind, id);
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ workKey: workKeyOf(kind, id), check: verifyChain(entries), entries });
  });

  return r;
}
