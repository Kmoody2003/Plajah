/**
 * Terra — Firestore persistence.
 *
 * Follows the knowledge-envelope contract already used by the sports ingestion
 * spine: every externally-sourced document is wrapped with its sources, a first-
 * seen time and a last-verified time, and writes merge rather than replace. That
 * envelope is what lets the UI honour the rule that no fact renders undated.
 *
 * Collections
 *   terraParcels/{jurisdiction}:{parcelNumber}
 *   terraCivic/{jurisdiction}:{kind}:{localId}
 *   terraZoningRules/{jurisdiction}:{district}:{useKey}
 *   terraListings/{listingKey}          — Open Listing Records
 *   terraIngestionRuns/{runId}
 */

import { collection, deleteDoc, doc, getDoc, getDocs, limit as fsLimit, query, setDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../backendService';
import type { OpenListingRecord } from './olr';
import { hashListingRecord, validateListingRecord } from './olr';
import { packParcel, unpackParcel, type TerraParcel, type TerraCivicRecord, type ZoningRule, type TerraIngestionSummary } from './terraTypes';
import { coverBounds, type GeoBounds } from './geohash';

export const TERRA_COLLECTIONS = {
  parcels: 'terraParcels',
  civic: 'terraCivic',
  zoningRules: 'terraZoningRules',
  listings: 'terraListings',
  runs: 'terraIngestionRuns',
} as const;

/** Firestore rejects undefined field values outright — strip before every write. */
function stripUndefined<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value as Record<string, any>)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out as T;
}

export interface TerraEnvelope<T> {
  id: string;
  data: T;
  firstSeenAt: number;
  lastVerifiedAt: number;
  updatedAt: number;
  version: number;
}

async function writeEnvelope<T>(collectionName: string, id: string, data: T): Promise<void> {
  try {
    const ref = doc(db, collectionName, id);
    const existing = await getDoc(ref);
    const prev = existing.exists() ? (existing.data() as TerraEnvelope<T>) : null;
    const now = Date.now();
    await setDoc(ref, stripUndefined({
      id,
      data,
      firstSeenAt: prev?.firstSeenAt ?? now,
      lastVerifiedAt: now,
      updatedAt: now,
      version: (prev?.version ?? 0) + 1,
    }), { merge: true });
  } catch (err) {
    console.warn('[terra] write skipped:', collectionName, id, (err as Error)?.message);
  }
}

/** Batched envelope write. Firestore caps a batch at 500 ops; we chunk at 400. */
async function writeEnvelopeBatch<T>(collectionName: string, rows: { id: string; data: T }[]): Promise<number> {
  if (!rows.length) return 0;
  let written = 0;
  for (let start = 0; start < rows.length; start += 400) {
    try {
      const batch = writeBatch(db);
      const now = Date.now();
      for (const row of rows.slice(start, start + 400)) {
        batch.set(doc(collection(db, collectionName), row.id), stripUndefined({
          id: row.id,
          data: row.data,
          // firstSeenAt is only authoritative on first write; merge preserves it.
          firstSeenAt: now,
          lastVerifiedAt: now,
          updatedAt: now,
        }), { merge: true });
      }
      await batch.commit();
      written += Math.min(400, rows.length - start);
    } catch (err) {
      console.warn('[terra] batch write skipped:', collectionName, (err as Error)?.message);
    }
  }
  return written;
}

// ─── Parcels ─────────────────────────────────────────────────────────────────

// Geometry crosses the Firestore boundary as a JSON string (nested GeoJSON
// arrays are invalid in Firestore) — pack on write, unpack on read. See the
// codec note in terraTypes.ts.
export const saveParcels = (parcels: TerraParcel[]) =>
  writeEnvelopeBatch(TERRA_COLLECTIONS.parcels, parcels.map(p => ({ id: p.id, data: packParcel(p) })));

export async function fetchParcel(parcelId: string): Promise<TerraParcel | null> {
  try {
    const snap = await getDoc(doc(db, TERRA_COLLECTIONS.parcels, parcelId));
    return snap.exists() ? unpackParcel((snap.data() as TerraEnvelope<TerraParcel>).data) : null;
  } catch { return null; }
}

export async function fetchParcelByNumber(jurisdiction: string, parcelNumber: string): Promise<TerraParcel | null> {
  return fetchParcel(`${jurisdiction}:${parcelNumber}`);
}

/**
 * A page of parcels for the map.
 *
 * ⚠️ Not a spatial query. Firestore has no native geo-query, so this returns an
 * arbitrary page rather than "what's in the viewport". Fine while the map shows a
 * neighbourhood-sized slice; a geohash field on the parcel doc is the fix before
 * this serves the whole city. Deliberately not faked with a bounding-box filter,
 * which would need a composite index and silently return nothing without one.
 */
export async function fetchParcelsPage(max = 500): Promise<TerraParcel[]> {
  try {
    const snap = await getDocs(query(collection(db, TERRA_COLLECTIONS.parcels), fsLimit(Math.min(max, 1000))));
    return snap.docs
      .map(d => unpackParcel((d.data() as TerraEnvelope<TerraParcel>).data))
      .filter((p): p is TerraParcel => Boolean(p?.geometry || (p?.centroidLat && p?.centroidLng)));
  } catch { return []; }
}

/**
 * Parcels intersecting a map viewport, via geohash prefix-range queries — one
 * per covering cell (see services/terra/geohash.ts). Each is a single-field
 * range (`data.geohash`), so no composite index is needed. Returns [] for a
 * viewport too wide to cover — callers gate on zoom rather than pull the city.
 *
 * `perCellLimit`: densest Detroit blocks run ~2.5k parcels per precision-6
 * cell; 3000 keeps a cell whole without letting one query pull the world.
 */
const parcelCellCache = new Map<string, TerraParcel[]>();

/** Drop the cache (Refresh button) so the next viewport read hits Firestore. */
export function clearParcelCellCache(): void { parcelCellCache.clear(); }

export async function fetchParcelsInBounds(bounds: GeoBounds, perCellLimit = 3000): Promise<TerraParcel[]> {
  const cover = coverBounds(bounds, 32);
  if (!cover) return [];
  try {
    const missing = cover.cells.filter(c => !parcelCellCache.has(c));
    await Promise.all(missing.map(async cell => {
      const snap = await getDocs(query(
        collection(db, TERRA_COLLECTIONS.parcels),
        where('data.geohash', '>=', cell),
        where('data.geohash', '<=', cell + '~'),
        fsLimit(perCellLimit),
      )).catch(() => null);
      const rows: TerraParcel[] = [];
      for (const d of snap?.docs ?? []) {
        const p = unpackParcel((d.data() as TerraEnvelope<TerraParcel>).data);
        if (p && (p.geometry || (p.centroidLat && p.centroidLng))) rows.push(p);
      }
      // Cache even an empty cell — vacant ground shouldn't be re-queried every pan.
      parcelCellCache.set(cell, rows);
    }));
    // Bounded cache: evict oldest half once it outgrows a city-pan's worth.
    if (parcelCellCache.size > 120) {
      for (const key of [...parcelCellCache.keys()].slice(0, 60)) parcelCellCache.delete(key);
    }
    const seen = new Set<string>();
    const out: TerraParcel[] = [];
    for (const cell of cover.cells) {
      for (const p of parcelCellCache.get(cell) ?? []) {
        if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
      }
    }
    return out;
  } catch { return []; }
}

// ─── Civic records ───────────────────────────────────────────────────────────

export const saveCivicRecords = (records: TerraCivicRecord[]) =>
  writeEnvelopeBatch(TERRA_COLLECTIONS.civic, records.map(r => ({ id: r.id, data: r })));

/**
 * Civic history for one parcel. Single-field equality only — deliberately no
 * orderBy, because a where+orderBy pair needs a composite index and fails
 * silently at runtime without one. Sort client-side.
 */
export async function fetchCivicForParcel(parcelNumber: string, max = 100): Promise<TerraCivicRecord[]> {
  try {
    const q = query(
      collection(db, TERRA_COLLECTIONS.civic),
      where('data.parcelNumber', '==', parcelNumber),
      fsLimit(max),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => (d.data() as TerraEnvelope<TerraCivicRecord>).data)
      .filter(Boolean)
      .sort((a, b) => (b.occurredAt ?? 0) - (a.occurredAt ?? 0));
  } catch { return []; }
}

// ─── Zoning rules ────────────────────────────────────────────────────────────

export const saveZoningRules = (rules: ZoningRule[]) =>
  writeEnvelopeBatch(TERRA_COLLECTIONS.zoningRules, rules.map(r => ({ id: r.id, data: r })));

export async function fetchZoningRule(jurisdiction: string, district: string, useKey: string): Promise<ZoningRule | null> {
  try {
    const snap = await getDoc(doc(db, TERRA_COLLECTIONS.zoningRules, `${jurisdiction}:${district}:${useKey}`));
    return snap.exists() ? ((snap.data() as TerraEnvelope<ZoningRule>).data ?? null) : null;
  } catch { return null; }
}

// ─── Listings (Open Listing Records) ─────────────────────────────────────────

/**
 * Persist a listing. Validates, fingerprints, and bumps the revision only when
 * the content actually changed — so a re-import of unchanged data does not
 * manufacture a false revision history.
 */
export async function saveListing(record: OpenListingRecord): Promise<{ ok: boolean; errors: string[] }> {
  const check = validateListingRecord(record);
  if (!check.valid) return { ok: false, errors: check.errors };

  try {
    const ref = doc(db, TERRA_COLLECTIONS.listings, record.ListingKey);
    const existing = await getDoc(ref);
    const prev = existing.exists() ? (existing.data() as TerraEnvelope<OpenListingRecord>) : null;

    const hashed = await hashListingRecord(record);
    const unchanged = prev?.data?.X_Terra_ContentHash === hashed.X_Terra_ContentHash;
    const revision = unchanged
      ? (prev?.data?.X_Terra_Revision ?? 1)
      : (prev?.data?.X_Terra_Revision ?? 0) + 1;

    const now = Date.now();
    await setDoc(ref, stripUndefined({
      id: record.ListingKey,
      data: { ...hashed, X_Terra_Revision: revision },
      firstSeenAt: prev?.firstSeenAt ?? now,
      lastVerifiedAt: now,
      updatedAt: now,
      version: (prev?.version ?? 0) + 1,
    }), { merge: true });

    return { ok: true, errors: [] };
  } catch (err) {
    return { ok: false, errors: [(err as Error)?.message || 'write failed'] };
  }
}

export async function saveListings(records: OpenListingRecord[]): Promise<{ saved: number; rejected: { key: string; errors: string[] }[] }> {
  let saved = 0;
  const rejected: { key: string; errors: string[] }[] = [];
  for (const record of records) {
    const result = await saveListing(record);
    if (result.ok) saved++;
    else rejected.push({ key: record.ListingKey, errors: result.errors });
  }
  return { saved, rejected };
}

/** Every listing this user owns, newest first. Equality filter only. */
export async function fetchListingsByLister(uid: string, max = 200): Promise<OpenListingRecord[]> {
  if (!uid) return [];
  try {
    const q = query(
      collection(db, TERRA_COLLECTIONS.listings),
      where('data.X_Terra_ListerUid', '==', uid),
      fsLimit(Math.min(max, 500)),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => (d.data() as TerraEnvelope<OpenListingRecord>).data)
      .filter(Boolean)
      .sort((a, b) => b.ModificationTimestamp.localeCompare(a.ModificationTimestamp));
  } catch { return []; }
}

/** The active listing for a parcel, if one exists. Most parcels have none. */
export async function fetchListingForParcel(parcelId: string): Promise<OpenListingRecord | null> {
  if (!parcelId) return null;
  try {
    const q = query(
      collection(db, TERRA_COLLECTIONS.listings),
      where('data.X_Terra_ParcelId', '==', parcelId),
      fsLimit(10),
    );
    const snap = await getDocs(q);
    const rows = snap.docs
      .map(d => (d.data() as TerraEnvelope<OpenListingRecord>).data)
      .filter(Boolean);
    // Prefer a live listing over a closed one; otherwise most recently modified.
    const live = rows.filter(r => !['Closed', 'Withdrawn', 'Expired', 'Canceled'].includes(r.StandardStatus));
    const pool = live.length ? live : rows;
    return pool.sort((a, b) => b.ModificationTimestamp.localeCompare(a.ModificationTimestamp))[0] ?? null;
  } catch { return null; }
}

export async function deleteListing(listingKey: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, TERRA_COLLECTIONS.listings, listingKey));
    return true;
  } catch { return false; }
}

export async function fetchListing(listingKey: string): Promise<OpenListingRecord | null> {
  try {
    const snap = await getDoc(doc(db, TERRA_COLLECTIONS.listings, listingKey));
    return snap.exists() ? ((snap.data() as TerraEnvelope<OpenListingRecord>).data ?? null) : null;
  } catch { return null; }
}

/**
 * Listings for the public OLR feed. Equality filter only (no composite index),
 * with ordering and the `since` cursor applied client-side.
 */
export async function fetchPublishableListings(opts: { since?: string; max?: number } = {}): Promise<OpenListingRecord[]> {
  const max = Math.min(opts.max ?? 200, 1000);
  try {
    const q = query(
      collection(db, TERRA_COLLECTIONS.listings),
      where('data.StandardStatus', '==', 'Active'),
      fsLimit(max * 2),
    );
    const snap = await getDocs(q);
    let rows = snap.docs
      .map(d => (d.data() as TerraEnvelope<OpenListingRecord>).data)
      .filter(Boolean);
    if (opts.since) rows = rows.filter(r => r.ModificationTimestamp > opts.since!);
    return rows
      .sort((a, b) => a.ModificationTimestamp.localeCompare(b.ModificationTimestamp))
      .slice(0, max);
  } catch { return []; }
}

// ─── Ingestion cursors ───────────────────────────────────────────────────────
//
// Without a persisted offset, every scheduled run would re-fetch the SAME first
// page of parcels and the city would never finish loading. The cursor walks
// forward across runs and wraps to 0 when a pass comes back short — so a nightly
// bounded run eventually covers all ~378k parcels and then refreshes them.

const CURSOR_DOC = (key: string) => `__cursor__${key}`;

export async function getIngestionCursor(key: string): Promise<number> {
  try {
    const snap = await getDoc(doc(db, TERRA_COLLECTIONS.runs, CURSOR_DOC(key)));
    const offset = snap.exists() ? Number((snap.data() as any)?.offset) : 0;
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch { return 0; }
}

export async function setIngestionCursor(key: string, offset: number): Promise<void> {
  try {
    await setDoc(doc(db, TERRA_COLLECTIONS.runs, CURSOR_DOC(key)), {
      key, offset: Math.max(0, Math.floor(offset)), updatedAt: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn('[terra] cursor write skipped:', key, (err as Error)?.message);
  }
}

// ─── Ingestion run log ───────────────────────────────────────────────────────

export const recordIngestionRun = (summary: TerraIngestionSummary) =>
  writeEnvelope(TERRA_COLLECTIONS.runs, summary.id, summary);

export async function fetchRecentRuns(max = 20): Promise<TerraIngestionSummary[]> {
  try {
    const snap = await getDocs(query(collection(db, TERRA_COLLECTIONS.runs), fsLimit(max)));
    return snap.docs
      .map(d => (d.data() as TerraEnvelope<TerraIngestionSummary>).data)
      .filter(Boolean)
      .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  } catch { return []; }
}
