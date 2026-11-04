/**
 * Terra search — one box for a business name, a street address, a zip code or
 * a parcel number, answered live from the city's own layers.
 *
 * Why live and not Firestore: the map's old box only filtered the parcels
 * already loaded in the viewport, so anything off-screen (and every zip code
 * and business name) silently matched nothing. Firestore can't do substring
 * matching; the city's ArcGIS layers can (`UPPER(field) LIKE '%…%'`), city-wide,
 * with no ingestion lag.
 *
 * What "for sale" means here, stated honestly:
 *  · LAND BANK — the Detroit Land Bank Authority's own inventory statuses
 *    ("Marketed Structure For Sale", "Side Lot For Sale", …). Real, public,
 *    updated daily — but it is property, not operating businesses.
 *  · TERRA LISTINGS — Open Listing Records posted on Terra by owners/brokers
 *    (PropertyType BusinessOpportunity / CommercialSale / etc). This is the only
 *    source of "a business for sale"; no public register of those exists.
 */

import { queryArcGisGeoJson, DETROIT_LAYERS } from './detroitAdapter';
import { fetchPublishableListings } from './terraService';
import type { OpenListingRecord, PropertyType } from './olr';

export type TerraHitKind = 'parcel' | 'business' | 'landbank' | 'listing';

export interface TerraSearchHit {
  kind: TerraHitKind;
  id: string;
  title: string;
  subtitle?: string;
  /** Parcel this hit sits on (detroit:<parcel_id>) — opens the inspector/passport. */
  parcelId?: string;
  lat?: number;
  lng?: number;
  /** Listing hits only. */
  listing?: OpenListingRecord;
}

export interface TerraSearchResult {
  query: string;
  mode: 'zip' | 'parcel' | 'text';
  /** True when the query reads as a street address — the UI leads with parcels. */
  addressLike: boolean;
  parcels: TerraSearchHit[];
  businesses: TerraSearchHit[];
  landBank: TerraSearchHit[];
  listings: TerraSearchHit[];
  /** Layers that failed to answer — shown, never swallowed into "no results". */
  errors: string[];
}

const PER_GROUP = 8;

/** SQL-literal escape for ArcGIS where clauses (single quotes doubled, wildcards dropped). */
function sqlText(s: string): string {
  return s.toUpperCase().replace(/'/g, "''").replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function str(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}

function centroid(geom: any): { lat?: number; lng?: number } {
  try {
    if (!geom) return {};
    if (geom.type === 'Point') return { lng: geom.coordinates[0], lat: geom.coordinates[1] };
    const ring = geom.type === 'Polygon' ? geom.coordinates?.[0]
      : geom.type === 'MultiPolygon' ? geom.coordinates?.[0]?.[0] : null;
    if (!Array.isArray(ring) || !ring.length) return {};
    let x = 0, y = 0;
    for (const p of ring) { x += p[0]; y += p[1]; }
    return { lng: x / ring.length, lat: y / ring.length };
  } catch { return {}; }
}

export function classifyQuery(raw: string): TerraSearchResult['mode'] {
  const q = raw.trim();
  if (/^\d{5}(-\d{4})?$/.test(q)) return 'zip';
  // Detroit parcel ids look like "02001910-5" / "22012345." — digits then a separator.
  if (/^\d{6,}[-.]?\w*\.?$/.test(q) && /[-.]/.test(q)) return 'parcel';
  return 'text';
}

const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

async function searchParcels(where: string): Promise<TerraSearchHit[]> {
  const feats = await queryArcGisGeoJson(DETROIT_LAYERS.parcels, {
    where, outFields: 'parcel_id,address,zip_code,property_class,is_improved', maxRecords: PER_GROUP, pageSize: PER_GROUP,
  });
  return feats.map(f => {
    const p = f.properties ?? {};
    const pid = str(p.parcel_id) ?? '';
    const { lat, lng } = centroid(f.geometry);
    return {
      kind: 'parcel' as const,
      id: `parcel:${pid}`,
      title: str(p.address) ?? `Parcel ${pid}`,
      subtitle: [p.zip_code && `Detroit ${p.zip_code}`, `PIN ${pid}`].filter(Boolean).join(' · '),
      parcelId: pid ? `detroit:${pid}` : undefined,
      lat, lng,
    };
  });
}

async function searchBusinesses(where: string, max = PER_GROUP): Promise<TerraSearchHit[]> {
  const feats = await queryArcGisGeoJson(DETROIT_LAYERS.businessLicenses, {
    where, returnGeometry: false, maxRecords: max, pageSize: max,
    outFields: 'record_id,business_name,address,zip_code,license_type,parcel_id,latitude,longitude',
  });
  return feats.map(f => {
    const p = f.properties ?? {};
    const pid = str(p.parcel_id);
    return {
      kind: 'business' as const,
      id: `biz:${str(p.record_id) ?? Math.random()}`,
      title: str(p.business_name) ?? 'Licensed business',
      subtitle: [str(p.address), str(p.zip_code), str(p.license_type)].filter(Boolean).join(' · '),
      parcelId: pid ? `detroit:${pid}` : undefined,
      lat: num(p.latitude), lng: num(p.longitude),
    };
  });
}

async function searchLandBank(where: string, max = PER_GROUP): Promise<TerraSearchHit[]> {
  const feats = await queryArcGisGeoJson(DETROIT_LAYERS.landBank, {
    where, returnGeometry: false, maxRecords: max, pageSize: Math.min(max, 1000),
    outFields: 'parcel_id,inventory_status_socrata,neighborhood,street_number,street_direction,street_name,street_type,latitude,longitude',
  });
  return feats.map(f => {
    const p = f.properties ?? {};
    const pid = str(p.parcel_id);
    const addr = [p.street_number, p.street_direction, p.street_name, p.street_type].map(str).filter(Boolean).join(' ');
    return {
      kind: 'landbank' as const,
      id: `dlba:${pid ?? Math.random()}`,
      title: addr || `Parcel ${pid}`,
      subtitle: [str(p.inventory_status_socrata), str(p.neighborhood)].filter(Boolean).join(' · '),
      parcelId: pid ? `detroit:${pid}` : undefined,
      lat: num(p.latitude), lng: num(p.longitude),
    };
  });
}

/** Land Bank's own "for sale" statuses all end in "For Sale". */
const DLBA_FOR_SALE = `inventory_status_socrata LIKE '%For Sale'`;

export const LISTING_TYPE_LABEL: Record<PropertyType, string> = {
  Residential: 'Home', ResidentialLease: 'Rental', ResidentialIncome: 'Income property',
  Land: 'Land', Farm: 'Farm', CommercialSale: 'Commercial', CommercialLease: 'Commercial lease',
  BusinessOpportunity: 'Business for sale', ManufacturedInPark: 'Manufactured',
};

function listingHit(r: OpenListingRecord): TerraSearchHit {
  const price = typeof r.ListPrice === 'number'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(r.ListPrice)
    : undefined;
  const place = [r.City, r.StateOrProvince, r.PostalCode].filter(Boolean).join(' ');
  return {
    kind: 'listing',
    id: `olr:${r.ListingKey}`,
    title: r.UnparsedAddress || [r.StreetNumber, r.StreetName].filter(Boolean).join(' ') || 'Listing',
    subtitle: [LISTING_TYPE_LABEL[r.PropertyType] ?? r.PropertyType, price, place].filter(Boolean).join(' · '),
    parcelId: (r as any).X_Terra_ParcelId,
    lat: r.Latitude, lng: r.Longitude,
    listing: r,
  };
}

let listingCache: { at: number; rows: OpenListingRecord[] } | null = null;
async function activeListings(): Promise<OpenListingRecord[]> {
  if (listingCache && Date.now() - listingCache.at < 60_000) return listingCache.rows;
  const rows = await fetchPublishableListings({ max: 1000 });
  listingCache = { at: Date.now(), rows };
  return rows;
}

function listingMatches(r: OpenListingRecord, needle: string): boolean {
  const hay = [r.UnparsedAddress, r.StreetNumber, r.StreetName, r.City, r.StateOrProvince, r.PostalCode,
    r.PublicRemarks, r.PropertySubType, r.ListOfficeName, r.ParcelNumber].filter(Boolean).join(' ').toUpperCase();
  return needle.split(' ').every(w => hay.includes(w));
}

/** Guarded runner: one failed layer is reported, never allowed to blank the rest. */
async function guard<T>(label: string, errors: string[], fn: () => Promise<T[]>): Promise<T[]> {
  try {
    // A slow source (a cold Firestore channel, a sluggish layer) must not hold
    // the whole answer hostage — after 8s it's reported as unreachable.
    return await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]);
  } catch (e) {
    console.warn('[terra search]', label, (e as Error)?.message);
    errors.push(label);
    return [];
  }
}

export async function searchTerra(raw: string): Promise<TerraSearchResult> {
  const query = raw.trim();
  const mode = classifyQuery(query);
  const errors: string[] = [];
  const t = sqlText(query);
  const addressLike = mode === 'parcel' || /^\d+\s/.test(t);
  const empty: TerraSearchResult = { query, mode, addressLike, parcels: [], businesses: [], landBank: [], listings: [], errors };
  if (t.length < 2) return empty;

  // Land Bank stores the street name alone ("NORMILE"), so match on the longest
  // non-numeric word of the query rather than the full typed address.
  const streetWord = t.split(' ').filter(w => !/^\d+$/.test(w) && w.length > 2)
    .filter(w => !['ST', 'AVE', 'RD', 'BLVD', 'DR', 'CT', 'PL', 'LN', 'HWY', 'PKWY', 'STREET', 'AVENUE', 'ROAD'].includes(w))
    .sort((a, b) => b.length - a.length)[0];
  const houseNo = t.match(/^(\d+)\s/)?.[1];

  let parcelWhere: string | null;
  let bizWhere: string | null;
  let dlbaWhere: string | null;
  if (mode === 'zip') {
    const zip = t.slice(0, 5);
    parcelWhere = `zip_code = '${zip}'`;
    bizWhere = `zip_code = '${zip}'`;
    dlbaWhere = null; // the Land Bank layer carries no zip field
  } else if (mode === 'parcel') {
    parcelWhere = `parcel_id = '${t}'`;
    bizWhere = `parcel_id = '${t}'`;
    dlbaWhere = `parcel_id = '${t}'`;
  } else {
    parcelWhere = /\d/.test(t) || streetWord ? `UPPER(address) LIKE '%${t}%'` : null;
    // A business name OR a street address — both are things people type here.
    bizWhere = `UPPER(business_name) LIKE '%${t}%' OR UPPER(address) LIKE '%${t}%'`;
    // Only for address-shaped queries ("4127 McGraw", "McGraw St"): a business
    // name like "McGraw Market" would otherwise list every lot on McGraw.
    const STREET_SUFFIX = /\b(ST|AVE|RD|BLVD|DR|CT|PL|LN|HWY|PKWY|STREET|AVENUE|ROAD|WAY|TER|CIR)$/;
    const addressShaped = !!houseNo || STREET_SUFFIX.test(t) || t.split(' ').length === 1;
    dlbaWhere = streetWord && addressShaped
      ? `UPPER(street_name) LIKE '%${streetWord}%'${houseNo ? ` AND street_number = ${Number(houseNo)}` : ''} AND ${DLBA_FOR_SALE}`
      : null;
  }

  const needle = t;
  const [parcels, businesses, landBank, listings] = await Promise.all([
    parcelWhere ? guard('City parcels', errors, () => searchParcels(parcelWhere!)) : Promise.resolve([]),
    bizWhere ? guard('Business licences', errors, () => searchBusinesses(bizWhere!, mode === 'zip' ? 40 : PER_GROUP)) : Promise.resolve([]),
    dlbaWhere ? guard('Land Bank', errors, () => searchLandBank(dlbaWhere!)) : Promise.resolve([]),
    guard('Terra listings', errors, async () =>
      (await activeListings()).filter(r => listingMatches(r, needle)).slice(0, PER_GROUP).map(listingHit)),
  ]);
  return { query, mode, addressLike, parcels, businesses, landBank, listings, errors };
}

// ─── For-sale browse ─────────────────────────────────────────────────────────

export type ForSaleScope = 'detroit' | 'michigan';

export interface ForSaleResult {
  /** Terra listings — businesses for sale first, then commercial, then the rest. */
  listings: TerraSearchHit[];
  /** Detroit Land Bank property marketed for sale (Detroit scope only). */
  landBank: TerraSearchHit[];
  landBankTotal?: number;
  errors: string[];
}

const TYPE_ORDER: PropertyType[] = ['BusinessOpportunity', 'CommercialSale', 'CommercialLease', 'ResidentialIncome', 'Land', 'Residential'];

export async function browseForSale(scope: ForSaleScope, opts: { businessesOnly?: boolean } = {}): Promise<ForSaleResult> {
  const errors: string[] = [];
  const inScope = (r: OpenListingRecord) => {
    const st = (r.StateOrProvince ?? '').toUpperCase();
    const isMi = st === 'MI' || st === 'MICHIGAN';
    if (scope === 'michigan') return isMi;
    return isMi && (r.City ?? '').toUpperCase().trim() === 'DETROIT';
  };
  const [listings, landBank, landBankTotal] = await Promise.all([
    guard('Terra listings', errors, async () => (await activeListings())
      .filter(r => r.PropertyType !== 'ResidentialLease' && r.PropertyType !== 'CommercialLease')
      .filter(inScope)
      .filter(r => !opts.businessesOnly || r.PropertyType === 'BusinessOpportunity' || r.PropertyType === 'CommercialSale')
      .sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.PropertyType), bi = TYPE_ORDER.indexOf(b.PropertyType);
        return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
      })
      .slice(0, 100)
      .map(listingHit)),
    scope === 'detroit' && !opts.businessesOnly
      // Structures first — "Marketed Structure For Sale" is the useful slice;
      // 27k vacant neighbourhood lots would bury it.
      ? guard('Land Bank', errors, () => searchLandBank(`inventory_status_socrata LIKE '%Structure For Sale'`, 60).then(async first => {
          if (first.length >= 60) return first;
          return [...first, ...await searchLandBank(`inventory_status_socrata = 'Improved Lot For Sale'`, 40)];
        }))
      : Promise.resolve([]),
    scope === 'detroit' && !opts.businessesOnly ? countLandBankForSale().catch(() => undefined) : Promise.resolve(undefined),
  ]);
  return { listings, landBank, landBankTotal, errors };
}

async function countLandBankForSale(): Promise<number> {
  const url = `${DETROIT_LAYERS.landBank}/query?where=${encodeURIComponent(DLBA_FOR_SALE)}&returnCountOnly=true&f=json`;
  const res = await fetch(url);
  const j = await res.json();
  return Number(j.count ?? 0);
}
