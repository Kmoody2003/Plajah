/**
 * Terra — RESO Web API client.
 *
 * Lets an agent bring their OWN MLS access into Terra, so they keep the tools and
 * memberships they already pay for and Terra becomes where they actually work.
 * RESO Web API is OData v4; the Data Dictionary supplies the field vocabulary —
 * which is why the map to an Open Listing Record is nearly an identity function.
 *
 * ── Read this before promising anything about distribution ──────────────────
 *
 * RESO Web API is, in practice, a READ/replication standard. This client
 * deliberately implements retrieval only. Do not add a `createListing()` here
 * without first confirming, per-MLS, that write is exposed AND that the licence
 * agreement permits it. Two hard constraints:
 *
 *   1. Most MLSs expose no third-party write path at all. Listing entry happens
 *      in the MLS's own system. There is no general "post a listing via RESO".
 *
 *   2. There is NO public API for publishing a for-sale listing to Zillow or the
 *      other major portals. Their inventory arrives via MLS syndication and
 *      direct broker agreements, not an open endpoint. Terra cannot push there,
 *      and neither can anyone else without such an agreement.
 *
 * The outbound story is therefore the Open Listing Record feed (see olr.ts) —
 * we publish an open, mirrorable standard rather than queue for a syndication
 * slot. Direction inverted on purpose.
 *
 * ── Access reality ──────────────────────────────────────────────────────────
 * The standard is universal; ACCESS is not. Feed credentials are granted per-MLS
 * under a licence agreement, usually to a broker/agent member. So this client
 * takes credentials rather than shipping any — onboarding is paperwork per market,
 * and the code should never imply otherwise.
 */

import type { OpenListingRecord, OlrSource, StandardStatus, PropertyType } from './olr';
import { validateListingRecord } from './olr';

export interface ResoConnection {
  /** OData service root, e.g. https://api.<mls>.com/reso/odata */
  baseUrl: string;
  /** Bearer token. Obtained by the member from their MLS. */
  accessToken: string;
  /** Stable id for provenance, e.g. "reso:realcomp". */
  systemKey: string;
  /** Human label rendered next to imported data. */
  systemName: string;
  /** Attribution string, where the feed licence mandates exact wording. */
  attribution?: string;
}

export interface ResoQueryOptions {
  /** Replication cursor — ISO timestamp; fetches records modified after it. */
  since?: string;
  top?: number;
  skip?: number;
  /** Extra OData $filter, ANDed with `since`. */
  filter?: string;
  select?: string[];
  /** Pull the Media collection inline. Costly; off by default. */
  expandMedia?: boolean;
  signal?: AbortSignal;
}

export interface ResoPage {
  records: OpenListingRecord[];
  /** Highest ModificationTimestamp seen — pass back as `since` to continue. */
  nextSince?: string;
  /** Server-provided continuation, when present. */
  nextLink?: string;
  /** Records the server returned that failed validation, with reasons. */
  rejected: { key: string; errors: string[] }[];
}

function odataEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function odataGet(conn: ResoConnection, path: string, params: URLSearchParams, signal?: AbortSignal): Promise<any> {
  const url = `${conn.baseUrl.replace(/\/$/, '')}/${path}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${conn.accessToken}`,
      Accept: 'application/json',
    },
    signal,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('RESO feed rejected the credentials. Confirm the token and that the account is licensed for this feed.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`RESO HTTP ${res.status} on ${path}${body ? `: ${body.slice(0, 300)}` : ''}`);
  }
  return res.json();
}

/**
 * Fetch the service metadata document. Worth calling once per connection at
 * setup: it is the only reliable way to learn which Data Dictionary version and
 * which local enumeration extensions a given MLS actually serves.
 */
export async function fetchResoMetadata(conn: ResoConnection, signal?: AbortSignal): Promise<string> {
  const url = `${conn.baseUrl.replace(/\/$/, '')}/$metadata`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/xml' },
    signal,
  });
  if (!res.ok) throw new Error(`RESO metadata HTTP ${res.status}`);
  return res.text();
}

const KNOWN_STATUSES = new Set<string>([
  'Active', 'ActiveUnderContract', 'Pending', 'Closed',
  'Expired', 'Canceled', 'Withdrawn', 'Hold', 'ComingSoon', 'Incomplete', 'Delete',
]);
const KNOWN_TYPES = new Set<string>([
  'Residential', 'ResidentialLease', 'ResidentialIncome', 'Land', 'Farm',
  'CommercialSale', 'CommercialLease', 'BusinessOpportunity', 'ManufacturedInPark',
]);

/**
 * Map a RESO Property entity to an Open Listing Record.
 *
 * Mostly an identity mapping — that is the entire point of aligning OLR to the
 * Data Dictionary. Where an MLS serves a local enumeration extension we keep the
 * original in MlsStatus rather than silently coercing it.
 */
export function resoPropertyToOlr(entity: Record<string, any>, conn: ResoConnection): OpenListingRecord {
  const source: OlrSource = {
    system: conn.systemKey,
    label: conn.systemName,
    retrievedAt: Date.now(),
    sourceUpdatedAt: entity.ModificationTimestamp ? Date.parse(entity.ModificationTimestamp) : undefined,
    observed: 'observed',
    attribution: conn.attribution,
  };

  const rawStatus = String(entity.StandardStatus ?? '');
  const status: StandardStatus = KNOWN_STATUSES.has(rawStatus) ? (rawStatus as StandardStatus) : 'Active';
  const rawType = String(entity.PropertyType ?? '');
  const propertyType: PropertyType = KNOWN_TYPES.has(rawType) ? (rawType as PropertyType) : 'Residential';

  const media = Array.isArray(entity.Media)
    ? entity.Media.map((m: any, i: number) => ({
        MediaKey: String(m.MediaKey ?? `${entity.ListingKey}-${i}`),
        MediaURL: String(m.MediaURL ?? ''),
        Order: typeof m.Order === 'number' ? m.Order : i,
        MediaCategory: m.MediaCategory,
        ShortDescription: m.ShortDescription,
      })).filter((m: any) => m.MediaURL)
    : undefined;

  return {
    OlrVersion: '0.1.0',
    ListingKey: String(entity.ListingKey ?? entity.ListingId ?? ''),
    ListingId: entity.ListingId ? String(entity.ListingId) : undefined,
    SourceSystemKey: conn.systemKey,
    SourceSystemName: conn.systemName,

    StandardStatus: status,
    // Preserve the feed's own status text — never lose local vocabulary.
    MlsStatus: entity.MlsStatus ?? (KNOWN_STATUSES.has(rawStatus) ? undefined : rawStatus || undefined),
    PropertyType: propertyType,
    PropertySubType: entity.PropertySubType,

    ListPrice: entity.ListPrice,
    OriginalListPrice: entity.OriginalListPrice,
    ClosePrice: entity.ClosePrice,

    UnparsedAddress: entity.UnparsedAddress,
    StreetNumber: entity.StreetNumber,
    StreetName: entity.StreetName,
    City: entity.City,
    StateOrProvince: entity.StateOrProvince,
    PostalCode: entity.PostalCode,
    CountyOrParish: entity.CountyOrParish,
    Country: entity.Country,
    Latitude: entity.Latitude,
    Longitude: entity.Longitude,

    BedroomsTotal: entity.BedroomsTotal,
    BathroomsTotalInteger: entity.BathroomsTotalInteger,
    BathroomsFull: entity.BathroomsFull,
    BathroomsHalf: entity.BathroomsHalf,
    LivingArea: entity.LivingArea,
    LivingAreaUnits: entity.LivingAreaUnits,
    LotSizeSquareFeet: entity.LotSizeSquareFeet,
    LotSizeAcres: entity.LotSizeAcres,
    YearBuilt: entity.YearBuilt,
    Stories: entity.Stories,
    GarageSpaces: entity.GarageSpaces,

    PublicRemarks: entity.PublicRemarks,

    ParcelNumber: entity.ParcelNumber,
    Zoning: entity.Zoning,
    ZoningDescription: entity.ZoningDescription,
    TaxAnnualAmount: entity.TaxAnnualAmount,
    TaxYear: entity.TaxYear,
    TaxAssessedValue: entity.TaxAssessedValue,

    ListingContractDate: entity.ListingContractDate,
    OnMarketDate: entity.OnMarketDate,
    CloseDate: entity.CloseDate,
    OriginalEntryTimestamp: entity.OriginalEntryTimestamp,
    ModificationTimestamp: entity.ModificationTimestamp ?? new Date().toISOString(),
    DaysOnMarket: entity.DaysOnMarket,

    ListAgentFullName: entity.ListAgentFullName,
    ListAgentKey: entity.ListAgentKey,
    ListOfficeName: entity.ListOfficeName,

    Media: media,
    PhotosCount: entity.PhotosCount ?? media?.length,

    // Joined to the parcel spine downstream, by ParcelNumber where available.
    X_Terra_Sources: [source],
  };
}

/** Fetch one page of Property records, mapped to OLR. */
export async function fetchResoProperties(conn: ResoConnection, opts: ResoQueryOptions = {}): Promise<ResoPage> {
  const filters: string[] = [];
  if (opts.since) filters.push(`ModificationTimestamp gt ${opts.since}`);
  if (opts.filter) filters.push(`(${opts.filter})`);

  const params = new URLSearchParams();
  if (filters.length) params.set('$filter', filters.join(' and '));
  params.set('$orderby', 'ModificationTimestamp asc');
  params.set('$top', String(Math.min(opts.top ?? 200, 1000)));
  if (opts.skip) params.set('$skip', String(opts.skip));
  if (opts.select?.length) params.set('$select', opts.select.join(','));
  if (opts.expandMedia) params.set('$expand', 'Media');

  const payload = await odataGet(conn, 'Property', params, opts.signal);
  const entities: any[] = payload.value ?? [];

  const records: OpenListingRecord[] = [];
  const rejected: { key: string; errors: string[] }[] = [];
  for (const entity of entities) {
    const mapped = resoPropertyToOlr(entity, conn);
    const check = validateListingRecord(mapped);
    if (check.valid) records.push(mapped);
    else rejected.push({ key: mapped.ListingKey || '(no key)', errors: check.errors });
  }

  const nextSince = records.length
    ? records.reduce((max, r) => (r.ModificationTimestamp > max ? r.ModificationTimestamp : max), records[0].ModificationTimestamp)
    : opts.since;

  return { records, nextSince, nextLink: payload['@odata.nextLink'], rejected };
}

/**
 * Replicate forward from a cursor, paging until drained or `maxRecords` is hit.
 * Returns the new cursor to persist for the next run.
 */
export async function replicateResoProperties(
  conn: ResoConnection,
  opts: { since?: string; maxRecords?: number; pageSize?: number; expandMedia?: boolean; signal?: AbortSignal } = {},
): Promise<{ records: OpenListingRecord[]; nextSince?: string; rejected: { key: string; errors: string[] }[] }> {
  const maxRecords = opts.maxRecords ?? 2000;
  const pageSize = Math.min(opts.pageSize ?? 200, 1000);
  const all: OpenListingRecord[] = [];
  const rejected: { key: string; errors: string[] }[] = [];
  let cursor = opts.since;

  while (all.length < maxRecords) {
    const page = await fetchResoProperties(conn, {
      since: cursor,
      top: Math.min(pageSize, maxRecords - all.length),
      expandMedia: opts.expandMedia,
      signal: opts.signal,
    });
    if (!page.records.length && !page.rejected.length) break;
    all.push(...page.records);
    rejected.push(...page.rejected);
    // Guard against a feed whose cursor does not advance (equal timestamps).
    if (!page.nextSince || page.nextSince === cursor) break;
    cursor = page.nextSince;
  }
  return { records: all, nextSince: cursor, rejected };
}

/** Probe a connection at setup: confirms credentials and reports what it serves. */
export async function testResoConnection(conn: ResoConnection): Promise<{
  ok: boolean; message: string; sampleCount?: number;
}> {
  try {
    const params = new URLSearchParams({ $top: '1' });
    const payload = await odataGet(conn, 'Property', params);
    const count = Array.isArray(payload.value) ? payload.value.length : 0;
    return { ok: true, message: `Connected to ${conn.systemName}.`, sampleCount: count };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Connection failed' };
  }
}
