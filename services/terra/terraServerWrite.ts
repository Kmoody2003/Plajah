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

import { fsBatchWrite, fsGet, fsSet } from '../firebaseAdminRest';
import { packParcel, type TerraParcel, type TerraCivicRecord, type TerraIngestionSummary, type TerraBuildingEnergy, type TerraBusinessLicense, type TerraRentalCompliance } from './terraTypes';

const PARCELS = 'terraParcels';
const CIVIC = 'terraCivic';
const RUNS = 'terraIngestionRuns';
const ENERGY = 'terraEnergy';
const BUSINESS = 'terraBusiness';
const RENTAL = 'terraRental';

/** Doc ids carry a colon (`detroit:16004044.`); encode so the REST path segment
 *  isn't parsed as a Google `:method` suffix. Firestore decodes it back, so the
 *  stored id matches what the client SDK reads. */
const docPath = (collection: string, id: string) => `${collection}/${encodeURIComponent(id)}`;

function envelope<T>(id: string, data: T): Record<string, unknown> {
  const now = Date.now();
  // firstSeenAt isn't preserved per-doc here (that would need a read each write);
  // parcels don't depend on it, and the vintage the UI shows comes from the
  // record's own `sources[].retrievedAt`, which is authoritative.
  return { id, data, firstSeenAt: now, lastVerifiedAt: now, updatedAt: now };
}

// Parcels/civic go through fsBatchWrite (500 docs per API call): a 5k-parcel run
// is ~10 round trips instead of 5k, and the doc id rides in the body, so the
// colon in `detroit:1234.` needs no path-encoding games. Geometry MUST be packed
// (GeoJSON's nested arrays are invalid in Firestore — see terraTypes codec).

export async function saveParcelsServer(parcels: TerraParcel[]): Promise<number> {
  return fsBatchWrite(parcels.map(p => ({ path: `${PARCELS}/${p.id}`, data: envelope(p.id, packParcel(p)) })));
}

export async function saveCivicServer(records: TerraCivicRecord[]): Promise<number> {
  return fsBatchWrite(records.map(r => ({ path: `${CIVIC}/${r.id}`, data: envelope(r.id, r) })));
}

/** Benchmarking rollups — ~112 docs, one per reporting parcel. */
export async function saveEnergyServer(records: TerraBuildingEnergy[]): Promise<number> {
  return fsBatchWrite(records.map(r => ({ path: `${ENERGY}/${r.id}`, data: envelope(r.id, r) })));
}

/** Active business licences — ~1,900 docs, keyed by record id. */
export async function saveBusinessServer(records: TerraBusinessLicense[]): Promise<number> {
  return fsBatchWrite(records.map(r => ({ path: `${BUSINESS}/${r.id}`, data: envelope(r.id, r) })));
}

/** Rental compliance rollups — ~22,600 docs, one per building parcel. */
export async function saveRentalServer(records: TerraRentalCompliance[]): Promise<number> {
  return fsBatchWrite(records.map(r => ({ path: `${RENTAL}/${r.id}`, data: envelope(r.id, r) })));
}

export async function recordRunServer(summary: TerraIngestionSummary): Promise<boolean> {
  const ok = await fsSet(docPath(RUNS, summary.id), envelope(summary.id, summary));
  // Also keep a stable pointer to the most recent run so the status endpoint can
  // read it with a single get — no orderBy, so no composite-index trap.
  // NOT `__latest__`: Firestore RESERVES doc ids matching `__.*__` and rejects
  // the write (which fsSet swallows). `__cursor__detroit_parcels` survives only
  // because it doesn't END in a double underscore.
  await fsSet(docPath(RUNS, 'latest'), envelope('latest', summary));
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
