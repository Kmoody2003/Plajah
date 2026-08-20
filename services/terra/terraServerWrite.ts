/**
 * Terra — SERVER-SIDE persistence (service account, rules-exempt).
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The ingestion worker runs on the server with no signed-in user. The client
 * Firestore SDK (services/firebase.ts `db`) is therefore unauthenticated there,
 * so writes to `terraParcels` / `terraCivic` are DENIED by the security rules
 * (`write: if isAdmin()`). The platform's canonical server write path is the
 * service account over Firestore REST (firebaseAdminRest.fsSet), which is
 * rules-exempt — the same mechanism the rest of the backend uses.
 *
 * So: the browser-facing terraService (reads, agent listing writes) stays on the
 * client SDK; the INGESTION worker persists through here. Requires
 * GOOGLE_SERVICE_ACCOUNT_JSON on the server (or Cloud Run's runtime identity).
 * Server-only — never import from a browser bundle.
 */

import { fsGet, fsSet } from '../firebaseAdminRest';
import type { TerraParcel, TerraCivicRecord, TerraIngestionSummary } from './terraTypes';

const PARCELS = 'terraParcels';
const CIVIC = 'terraCivic';
const RUNS = 'terraIngestionRuns';

/** Doc ids carry a colon (`detroit:16004044.`); encode so the REST path segment
 *  isn't parsed as a Google `:method` suffix. Firestore decodes it back, so the
 *  stored id matches what the client SDK reads. */
const docPath = (collection: string, id: string) => `${collection}/${encodeURIComponent(id)}`;

/** Run N async tasks with bounded concurrency; returns how many succeeded. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<boolean>): Promise<number> {
  let ok = 0;
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      try { if (await fn(item)) ok++; } catch { /* count as failure */ }
    }
  });
  await Promise.all(workers);
  return ok;
}

function envelope<T>(id: string, data: T): Record<string, unknown> {
  const now = Date.now();
  // firstSeenAt isn't preserved per-doc here (that would need a read each write);
  // parcels don't depend on it, and the vintage the UI shows comes from the
  // record's own `sources[].retrievedAt`, which is authoritative.
  return { id, data, firstSeenAt: now, lastVerifiedAt: now, updatedAt: now };
}

export async function saveParcelsServer(parcels: TerraParcel[], concurrency = 8): Promise<number> {
  return pool(parcels, concurrency, p => fsSet(docPath(PARCELS, p.id), envelope(p.id, p)));
}

export async function saveCivicServer(records: TerraCivicRecord[], concurrency = 8): Promise<number> {
  return pool(records, concurrency, r => fsSet(docPath(CIVIC, r.id), envelope(r.id, r)));
}

export async function recordRunServer(summary: TerraIngestionSummary): Promise<boolean> {
  const ok = await fsSet(docPath(RUNS, summary.id), envelope(summary.id, summary));
  // Also keep a stable pointer to the most recent run so the status endpoint can
  // read it with a single get — no orderBy, so no composite-index trap.
  await fsSet(docPath(RUNS, '__latest__'), envelope('__latest__', summary));
  return ok;
}

// ── Cursor (also SA — a client-SDK read would be denied on the server) ──────
const cursorId = (key: string) => `__cursor__${key}`;

export async function getCursorServer(key: string): Promise<number> {
  const doc = await fsGet(docPath(RUNS, cursorId(key)));
  const offset = doc ? Number((doc as any).offset) : 0;
  return Number.isFinite(offset) && offset >= 0 ? offset : 0;
}

export async function setCursorServer(key: string, offset: number): Promise<void> {
  await fsSet(docPath(RUNS, cursorId(key)), { key, offset: Math.max(0, Math.floor(offset)), updatedAt: Date.now() });
}
