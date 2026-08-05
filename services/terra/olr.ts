/**
 * Open Listing Record (OLR) — Terra's open, mirrorable listing schema.
 *
 * ── The core design decision ────────────────────────────────────────────────
 * OLR is NOT a competing standard. It is a permissively-published projection of
 * the industry's own vocabulary: field names follow the RESO Data Dictionary, so
 *   · an MLS feed maps into OLR almost by identity (see resoClient.ts), and
 *   · anything that already speaks RESO can consume an OLR feed unmodified.
 *
 * Terra-specific fields are namespaced `X_Terra_*` — RESO's documented convention
 * for local extensions, which conformant consumers ignore rather than choke on.
 *
 * ── Honesty note ────────────────────────────────────────────────────────────
 * Field NAMES here follow RESO Data Dictionary conventions, but this file has NOT
 * been validated against a specific DD version's `$metadata`. Before connecting a
 * real MLS feed, pin the DD version and diff against that server's metadata
 * document — enumerations in particular drift between versions and between MLSs
 * (many carry local extensions to StandardStatus / PropertySubType). Treat
 * `RESO_DD_TARGET` below as an intent, not a certification.
 */

export const OLR_VERSION = '0.1.0';

/** The Data Dictionary version this mapping is written against. Verify per-feed. */
export const RESO_DD_TARGET = '1.7';

// ─── RESO enumerations (core subset) ─────────────────────────────────────────

/** RESO StandardStatus. The MLS-agnostic lifecycle; MlsStatus carries local text. */
export type StandardStatus =
  | 'Active' | 'ActiveUnderContract' | 'Pending' | 'Closed'
  | 'Expired' | 'Canceled' | 'Withdrawn' | 'Hold' | 'ComingSoon' | 'Incomplete' | 'Delete';

export type PropertyType =
  | 'Residential' | 'ResidentialLease' | 'ResidentialIncome'
  | 'Land' | 'Farm'
  | 'CommercialSale' | 'CommercialLease' | 'BusinessOpportunity'
  | 'ManufacturedInPark';

/** Where a record came from. Drives the vintage stamp the UI is required to show. */
export interface OlrSource {
  /** Stable id, e.g. "detroit-open-data:parcel_file_current" or "reso:<mls-id>" */
  system: string;
  /** Human label rendered next to the data. */
  label: string;
  /** Canonical URL of the source record or dataset. */
  url?: string;
  /** When the SOURCE last updated this fact (not when we fetched it). */
  sourceUpdatedAt?: number;
  /** When Terra retrieved it. */
  retrievedAt: number;
  /** Whether the value was measured/recorded, or modelled/interpolated. */
  observed?: 'observed' | 'estimated' | 'interpolated' | 'unknown';
  /** Verbatim attribution string, where a licence mandates exact wording. */
  attribution?: string;
}

export interface OlrMedia {
  MediaKey: string;
  MediaURL: string;
  Order?: number;
  MediaCategory?: 'Photo' | 'Video' | 'FloorPlan' | 'Document' | 'Tour';
  ShortDescription?: string;
  /** SHA-256 of the bytes, when Terra has hashed them. See provenance below. */
  X_Terra_ContentHash?: string;
}

// ─── The record ──────────────────────────────────────────────────────────────

export interface OpenListingRecord {
  // ── OLR envelope ──
  OlrVersion: string;
  /** Globally unique within SourceSystemKey. */
  ListingKey: string;
  /** Human-facing MLS number, where one exists. */
  ListingId?: string;
  SourceSystemKey: string;
  SourceSystemName: string;

  // ── RESO core: status & type ──
  StandardStatus: StandardStatus;
  /** The MLS's own status text, preserved unmapped. */
  MlsStatus?: string;
  PropertyType: PropertyType;
  PropertySubType?: string;

  // ── Price ──
  ListPrice?: number;
  OriginalListPrice?: number;
  ClosePrice?: number;

  // ── Address & location ──
  UnparsedAddress?: string;
  StreetNumber?: string;
  StreetName?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  CountyOrParish?: string;
  Country?: string;
  Latitude?: number;
  Longitude?: number;

  // ── Structure ──
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  BathroomsFull?: number;
  BathroomsHalf?: number;
  LivingArea?: number;
  LivingAreaUnits?: 'Square Feet' | 'Square Meters';
  LotSizeSquareFeet?: number;
  LotSizeAcres?: number;
  YearBuilt?: number;
  Stories?: number;
  GarageSpaces?: number;

  // ── Narrative ──
  PublicRemarks?: string;

  // ── Parcel / tax / zoning ──
  ParcelNumber?: string;
  Zoning?: string;
  ZoningDescription?: string;
  TaxAnnualAmount?: number;
  TaxYear?: number;
  TaxAssessedValue?: number;

  // ── Dates ──
  ListingContractDate?: string;
  OnMarketDate?: string;
  CloseDate?: string;
  OriginalEntryTimestamp?: string;
  /** RESO replication key. Consumers page on this. */
  ModificationTimestamp: string;
  DaysOnMarket?: number;

  // ── Agent / office ──
  ListAgentFullName?: string;
  ListAgentKey?: string;
  ListOfficeName?: string;

  // ── Media ──
  Media?: OlrMedia[];
  PhotosCount?: number;

  // ── Terra extensions (RESO consumers ignore these) ──
  /** Links the listing to the parcel spine — the join that makes Terra work. */
  X_Terra_ParcelId?: string;
  /** Canonical Property Passport URL. */
  X_Terra_PassportUrl?: string;
  /** Per-fact provenance. Required: the UI must never render a fact undated. */
  X_Terra_Sources?: OlrSource[];
  /** SHA-256 over the canonical record — see hashListingRecord(). */
  X_Terra_ContentHash?: string;
  /** When that hash was computed and published. */
  X_Terra_HashedAt?: number;
  /** Monotonic revision; a changed record publishes a new version, never mutates. */
  X_Terra_Revision?: number;
  /**
   * Owning Plajah uid. Drives write authorisation in firestore.rules.
   * ⚠️ PRIVATE — stripped by buildFeedPage() and never present in the public
   * feed. If you add another outbound path, strip it there too.
   */
  X_Terra_ListerUid?: string;
}

/** Fields held on the stored record but never published. Keep this exhaustive. */
export const OLR_PRIVATE_FIELDS: (keyof OpenListingRecord)[] = ['X_Terra_ListerUid'];

/** Remove private fields before a record leaves the building. */
export function toPublicRecord(record: OpenListingRecord): OpenListingRecord {
  const out = { ...record };
  for (const field of OLR_PRIVATE_FIELDS) delete out[field];
  return out;
}

// ─── Canonicalisation + provenance hashing ───────────────────────────────────
//
// Provenance decision (locked): hash and version NOW, anchor to a chain LATER.
// What this gives today is real and useful — a tamper-evident fingerprint over
// the record and its media, so an altered listing is detectable and a revision
// history is provable against a published hash. What it does NOT do is prove the
// hash existed at a given time — that needs an external timestamp authority and
// is deliberately deferred. Do not describe this as "blockchain-verified" in UI
// copy. (Same honesty discipline as services/creatorPassport.ts.)

/**
 * Keys excluded from the hash. Two reasons a key lands here:
 *   · it is ABOUT the hash (so including it would be circular), or
 *   · it is PRIVATE and stripped before publication.
 * The second case matters for correctness: the hash must cover exactly what a
 * consumer receives, or a published record will fail its own verification.
 */
const HASH_EXCLUDED = new Set(['X_Terra_ContentHash', 'X_Terra_HashedAt', 'X_Terra_ListerUid']);

/**
 * Deterministic JSON: object keys sorted, undefined dropped, arrays order-preserved.
 * Two semantically identical records must serialise byte-identically on any runtime.
 */
export function canonicalize(value: unknown): string {
  const walk = (v: any): any => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, any> = {};
    for (const key of Object.keys(v).sort()) {
      if (HASH_EXCLUDED.has(key)) continue;
      const child = v[key];
      if (child === undefined) continue;
      out[key] = walk(child);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

/** Isomorphic SHA-256 (WebCrypto — present in browsers and Node 18+). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Fingerprint a listing. Returns a NEW record carrying the hash — the input is
 * not mutated, so a caller can diff old vs new to decide whether to bump revision.
 */
export async function hashListingRecord(record: OpenListingRecord): Promise<OpenListingRecord> {
  const hash = await sha256Hex(canonicalize(record));
  return { ...record, X_Terra_ContentHash: hash, X_Terra_HashedAt: Date.now() };
}

/** True when the record's stored hash still matches its content. */
export async function verifyListingRecord(record: OpenListingRecord): Promise<boolean> {
  if (!record.X_Terra_ContentHash) return false;
  return (await sha256Hex(canonicalize(record))) === record.X_Terra_ContentHash;
}

// ─── Validation ──────────────────────────────────────────────────────────────

const STANDARD_STATUSES: StandardStatus[] = [
  'Active', 'ActiveUnderContract', 'Pending', 'Closed',
  'Expired', 'Canceled', 'Withdrawn', 'Hold', 'ComingSoon', 'Incomplete', 'Delete',
];
const PROPERTY_TYPES: PropertyType[] = [
  'Residential', 'ResidentialLease', 'ResidentialIncome', 'Land', 'Farm',
  'CommercialSale', 'CommercialLease', 'BusinessOpportunity', 'ManufacturedInPark',
];

export interface OlrValidation { valid: boolean; errors: string[]; warnings: string[]; }

/**
 * Validate a record before it enters the public feed. Errors block publication;
 * warnings are quality signals worth surfacing to whoever created the listing.
 */
export function validateListingRecord(record: Partial<OpenListingRecord>): OlrValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!record.ListingKey) errors.push('ListingKey is required');
  if (!record.SourceSystemKey) errors.push('SourceSystemKey is required');
  if (!record.ModificationTimestamp) errors.push('ModificationTimestamp is required (replication key)');
  if (!record.StandardStatus) errors.push('StandardStatus is required');
  else if (!STANDARD_STATUSES.includes(record.StandardStatus)) {
    errors.push(`StandardStatus "${record.StandardStatus}" is not a RESO value — map it, and keep the original in MlsStatus`);
  }
  if (!record.PropertyType) errors.push('PropertyType is required');
  else if (!PROPERTY_TYPES.includes(record.PropertyType)) {
    errors.push(`PropertyType "${record.PropertyType}" is not a RESO value`);
  }

  if (record.ModificationTimestamp && Number.isNaN(Date.parse(record.ModificationTimestamp))) {
    errors.push('ModificationTimestamp must be an ISO 8601 datetime');
  }
  if (typeof record.ListPrice === 'number' && record.ListPrice < 0) {
    errors.push('ListPrice cannot be negative');
  }
  if (typeof record.Latitude === 'number' && Math.abs(record.Latitude) > 90) {
    errors.push('Latitude out of range');
  }
  if (typeof record.Longitude === 'number' && Math.abs(record.Longitude) > 180) {
    errors.push('Longitude out of range');
  }
  // A positive longitude in North America almost always means an unsigned source
  // value — a real and previously-observed failure mode in public datasets.
  if (typeof record.Longitude === 'number' && record.Longitude > 0 && record.CountyOrParish) {
    warnings.push('Longitude is positive — check the source is not storing an unsigned magnitude');
  }

  if (!record.X_Terra_Sources?.length) {
    warnings.push('No X_Terra_Sources — the UI cannot render a vintage stamp for this record');
  }
  if (!record.UnparsedAddress && !record.StreetName) warnings.push('No address');
  if (!record.Media?.length) warnings.push('No media attached');

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Feed shaping ────────────────────────────────────────────────────────────

export interface OlrFeedPage {
  olrVersion: string;
  resoDataDictionary: string;
  /** Terms under which the feed itself is offered. */
  license: string;
  licenseUrl: string;
  /** Attribution strings the consumer is obliged to render. */
  attribution: string[];
  generatedAt: string;
  count: number;
  /** RESO-style continuation: re-request with ?since=<value>. */
  nextSince?: string;
  value: OpenListingRecord[];
}

export const OLR_LICENSE = 'CC-BY-4.0';
export const OLR_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

export function buildFeedPage(input: OpenListingRecord[], extraAttribution: string[] = []): OlrFeedPage {
  // Strip private fields at the boundary. The hash excludes them too, so every
  // published record verifies against the bytes a consumer actually receives.
  const records = input.map(toPublicRecord);
  const attribution = Array.from(new Set([
    'Listing data via Plajah Terra — Open Listing Record',
    ...extraAttribution,
    ...records.flatMap(r => (r.X_Terra_Sources || []).map(s => s.attribution).filter(Boolean) as string[]),
  ]));
  const nextSince = records.length
    ? records.reduce((max, r) => (r.ModificationTimestamp > max ? r.ModificationTimestamp : max), records[0].ModificationTimestamp)
    : undefined;
  return {
    olrVersion: OLR_VERSION,
    resoDataDictionary: RESO_DD_TARGET,
    license: OLR_LICENSE,
    licenseUrl: OLR_LICENSE_URL,
    attribution,
    generatedAt: new Date().toISOString(),
    count: records.length,
    nextSince,
    value: records,
  };
}
