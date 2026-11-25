/**
 * Terra — county parcel sources beyond Detroit (parcel-only jurisdictions).
 *
 * Detroit parcels are ingested into Firestore and joined to civic feeds and
 * zoning. These counties are read LIVE from each county's own ArcGIS layer,
 * filtered server-side to the viewport, so nothing is copied or redistributed:
 * Terra shows the county's record with the county's attribution, the same way
 * the survey adjoiners and street centrelines already read Detroit live.
 *
 * Only counties whose terms allow this are listed (checked 2026-11-25, see
 * docs/terra-transaction-room.md §11):
 *   - Oakland: Access Oakland terms of use — as-is, no non-commercial clause.
 *   - Ottawa:  "ParcelsPublic", published for public applications; export free.
 * Do NOT add Genesee (no redistribution), Lansing (CC BY-NC) or Grand Traverse
 * (sold data) here. Counties with a blank licence need written OK first.
 *
 * ⚠️ County layer names roll over (…_2025, …_2026). These two are the counties'
 * stable "current" services; if one starts returning errors, look the new name
 * up on the county hub rather than pointing at a third-party mirror.
 */

import type { OlrSource } from './olr';
import { geohashEncode } from './geohash';
import { queryArcGisGeoJson, type ArcGisQueryOptions } from './detroitAdapter';
import type { TerraParcel, GeoJsonGeometry, TerraJurisdiction } from './terraTypes';

export type CountyJurisdiction = Exclude<TerraJurisdiction, 'detroit'>;

interface Bbox { xmin: number; ymin: number; xmax: number; ymax: number }

export interface CountySource {
  id: CountyJurisdiction;
  label: string;
  /** Short name for search results ("Oakland Co."). */
  short: string;
  layerUrl: string;
  attribution: string;
  /** WGS84 extent of the layer (from returnExtentOnly), used to route viewports. */
  extent: Bbox;
  /** Map centre for the region switcher. */
  center: { lat: number; lng: number };
  pinField: string;
  addressField: string;
  zipField: string;
  /** Turn a typed PIN into the stored form, or null when it can't be one. */
  normalizePin: (raw: string) => string | null;
  normalize: (feature: any) => TerraParcel | null;
}

// ─── Field helpers ───────────────────────────────────────────────────────────

const str = (v: any): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};
const num = (v: any): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
/** A zero in a county roll means "not recorded", not "nothing there". */
const pos = (v: any): number | undefined => { const n = num(v); return n !== undefined && n > 0 ? n : undefined; };

function centroidOf(geometry?: GeoJsonGeometry): { lat?: number; lng?: number } {
  if (!geometry) return {};
  const ring = geometry.type === 'Polygon' ? geometry.coordinates?.[0]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates?.[0]?.[0] : null;
  if (!Array.isArray(ring) || !ring.length) return {};
  let sx = 0, sy = 0, n = 0;
  for (const pt of ring) {
    const x = num(pt?.[0]), y = num(pt?.[1]);
    if (x === undefined || y === undefined) continue;
    sx += x; sy += y; n++;
  }
  return n ? { lat: sy / n, lng: sx / n } : {};
}

/**
 * Michigan property class codes: the hundreds digit is the class (1 agricultural,
 * 2 commercial, 3 industrial, 4 residential, 5 timber-cutover, 6 developmental,
 * 7 exempt); the units digit 1 = improved, 2 = vacant (e.g. 401 / 402).
 */
function improvedFromClass(code?: string): boolean | undefined {
  if (!code || !/^\d{3}$/.test(code)) return undefined;
  if (code.endsWith('1')) return true;
  if (code.endsWith('2')) return false;
  return undefined;
}

function source(c: { id: string; label: string; layerUrl: string; attribution: string }): OlrSource {
  return {
    system: `${c.id}-county-gis:parcels`,
    label: c.label,
    url: c.layerUrl,
    retrievedAt: Date.now(),
    observed: 'observed',
    attribution: c.attribution,
  };
}

function base(c: CountySource, parcelNumber: string, geometry: GeoJsonGeometry | undefined): Pick<TerraParcel,
  'id' | 'jurisdiction' | 'parcelNumber' | 'geometry' | 'centroidLat' | 'centroidLng' | 'geohash' | 'stateOrProvince' | 'sources' | 'updatedAt'> {
  const { lat, lng } = centroidOf(geometry);
  return {
    id: `${c.id}:${parcelNumber}`,
    jurisdiction: c.id,
    parcelNumber,
    geometry,
    centroidLat: lat,
    centroidLng: lng,
    geohash: lat !== undefined && lng !== undefined ? geohashEncode(lat, lng, 7) : undefined,
    stateOrProvince: 'MI',
    sources: [source(c)],
    updatedAt: Date.now(),
  };
}

// ─── Oakland County ──────────────────────────────────────────────────────────

const OAKLAND: CountySource = {
  id: 'oakland',
  label: 'Oakland County GIS',
  short: 'Oakland Co.',
  layerUrl: 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1',
  attribution: 'Data: Oakland County, Michigan — Access Oakland (provided as-is, without warranty)',
  extent: { xmin: -83.6944, ymin: 42.4261, xmax: -83.0744, ymax: 42.8936 },
  center: { lat: 42.5803, lng: -83.2455 }, // Birmingham / Troy
  pinField: 'PIN',
  addressField: 'SITEADDRESS',
  zipField: 'SITEZIP5',
  // Stored as 10 digits ("2504276018"); people type it as "25-04-276-018".
  normalizePin: raw => {
    const d = raw.replace(/[\s-]/g, '');
    return /^\d{10}$/.test(d) ? d : null;
  },
  normalize: f => {
    const p = f?.properties ?? {};
    const pin = str(p.PIN) ?? str(p.KEYPIN);
    if (!pin) return null;
    const owner = [str(p.NAME1), str(p.NAME2)].filter(Boolean).join(' ') || undefined;
    return {
      ...base(OAKLAND, pin, f.geometry ?? undefined),
      address: str(p.SITEADDRESS),
      city: str(p.SITECITY),
      postalCode: str(p.SITEZIP5),
      // Shape.area is in the county's state-plane feet, so it is square feet.
      lotSqFt: pos(p['Shape.area']) !== undefined ? Math.round(pos(p['Shape.area'])!) : undefined,
      lotAcres: pos(p['Shape.area']) !== undefined ? Math.round((pos(p['Shape.area'])! / 43560) * 1000) / 1000 : undefined,
      isImproved: improvedFromClass(str(p.CLASSCODE)),
      floorAreaSqFt: pos(p.LIVING_AREA_SQFT),
      buildingStyle: str(p.STRUCTURE_DESC),
      propertyClass: str(p.CLASSCODE),
      assessedValue: pos(p.ASSESSEDVALUE),
      taxableValue: pos(p.TAXABLEVALUE),
      taxpayerName: owner,
      taxpayerAddress: str(p.POSTALADDRESS),
      // The tax unit ("CITY OF TROY") — the closest thing Oakland gives to a ward.
      ward: str(p.CVTTAXDESCRIPTION),
    };
  },
};

// ─── Ottawa County ───────────────────────────────────────────────────────────

const OTTAWA: CountySource = {
  id: 'ottawa',
  label: 'Ottawa County GIS',
  short: 'Ottawa Co.',
  layerUrl: 'https://gis.miottawa.org/arcgis/rest/services/HostedServices/ParcelsPublic/FeatureServer/0',
  attribution: 'Data: © County of Ottawa, Michigan — public parcel layer (provided as-is, without warranty)',
  extent: { xmin: -86.2714, ymin: 42.7675, xmax: -85.7821, ymax: 43.2060 },
  center: { lat: 42.9634, lng: -86.0101 }, // Allendale / Jenison
  pinField: 'FinalPIN',
  addressField: 'PropertyAddress',
  zipField: 'PropertyZip',
  // Stored dashed ("70-14-17-408-017"); accept the packed 12-digit form too.
  normalizePin: raw => {
    const d = raw.replace(/[\s-]/g, '');
    if (!/^\d{12}$/.test(d)) return null;
    return `${d.slice(0, 2)}-${d.slice(2, 4)}-${d.slice(4, 6)}-${d.slice(6, 9)}-${d.slice(9, 12)}`;
  },
  normalize: f => {
    const p = f?.properties ?? {};
    const pin = str(p.FinalPIN) ?? str(p.ParentPIN);
    if (!pin) return null;
    const acres = pos(p.Acreage);
    return {
      ...base(OTTAWA, pin, f.geometry ?? undefined),
      address: str(p.PropertyAddress),
      city: str(p.PropertyCity),
      postalCode: str(p.PropertyZip),
      lotAcres: acres,
      lotSqFt: acres !== undefined ? Math.round(acres * 43560) : undefined,
      isImproved: improvedFromClass(str(p.PropertyClass)),
      propertyClass: str(p.PropertyClass),
      useCode: str(p.PropertyClassDescription),
      assessedValue: pos(p.AssessedValue),
      taxableValue: pos(p.TaxableValue),
      taxStatus: num(p.PrincipalResidenceExemption) !== undefined
        ? `Principal residence exemption ${num(p.PrincipalResidenceExemption)}%` : undefined,
      taxpayerName: str(p.OwnerName),
      taxpayerAddress: [str(p.MailingAddress), str(p.MailingCity), str(p.MailingState), str(p.MailingZip)].filter(Boolean).join(', ') || undefined,
      legalDescription: str(p.LegalDesc),
      ward: str(p.GovernmentUnitDescription),
    };
  },
};

export const COUNTY_SOURCES: Record<CountyJurisdiction, CountySource> = { oakland: OAKLAND, ottawa: OTTAWA };
export const COUNTY_LIST: CountySource[] = Object.values(COUNTY_SOURCES);

export function isCountyJurisdiction(j: string): j is CountyJurisdiction {
  return Object.prototype.hasOwnProperty.call(COUNTY_SOURCES, j);
}

// ─── Queries ─────────────────────────────────────────────────────────────────

const intersects = (a: Bbox, b: Bbox) => a.xmin <= b.xmax && a.xmax >= b.xmin && a.ymin <= b.ymax && a.ymax >= b.ymin;

/** Counties whose layer overlaps a viewport (south/west/north/east, WGS84). */
export function countiesInBounds(b: { south: number; west: number; north: number; east: number }): CountySource[] {
  const box = { xmin: b.west, ymin: b.south, xmax: b.east, ymax: b.north };
  return COUNTY_LIST.filter(c => intersects(c.extent, box));
}

async function query(c: CountySource, opts: ArcGisQueryOptions): Promise<TerraParcel[]> {
  const feats = await queryArcGisGeoJson(c.layerUrl, opts);
  return feats.map(c.normalize).filter((p): p is TerraParcel => p !== null);
}

/**
 * Parcels in a viewport from every county layer it touches. `maxPerCounty`
 * bounds a dense suburban view (a zoom-14 view of Troy is ~4k lots).
 */
export async function fetchCountyParcelsInBounds(
  b: { south: number; west: number; north: number; east: number },
  opts: { signal?: AbortSignal; maxPerCounty?: number } = {},
): Promise<TerraParcel[]> {
  const envelope = { xmin: b.west, ymin: b.south, xmax: b.east, ymax: b.north };
  const results = await Promise.all(countiesInBounds(b).map(c =>
    query(c, { envelope, maxRecords: opts.maxPerCounty ?? 4000, signal: opts.signal })
      .catch(e => { console.warn('[terra county]', c.id, (e as Error)?.message); return [] as TerraParcel[]; })));
  return results.flat();
}

/** One county parcel by Terra id (`oakland:2504276018`), read live. */
export async function fetchCountyParcel(parcelId: string): Promise<TerraParcel | null> {
  const i = parcelId.indexOf(':');
  if (i < 0) return null;
  const j = parcelId.slice(0, i), pin = parcelId.slice(i + 1);
  if (!isCountyJurisdiction(j)) return null;
  const c = COUNTY_SOURCES[j];
  const rows = await query(c, { where: `${c.pinField} = '${pin.replace(/'/g, "''")}'`, maxRecords: 1 });
  return rows[0] ?? null;
}

/** Parcels near one county lot (survey adjoiners), read live. */
export async function fetchCountyParcelsAround(
  jurisdiction: CountyJurisdiction,
  envelope: Bbox,
  opts: { signal?: AbortSignal; maxRecords?: number } = {},
): Promise<TerraParcel[]> {
  return query(COUNTY_SOURCES[jurisdiction], { envelope, maxRecords: opts.maxRecords ?? 600, signal: opts.signal });
}

export interface CountySearchHit {
  parcelId: string;
  title: string;
  subtitle: string;
  lat?: number;
  lng?: number;
}

/**
 * Search every county layer by PIN, ZIP or address. `t` is the already
 * SQL-escaped uppercase query from terraSearch. Addresses are stored uppercase,
 * so no UPPER() on the column (it would defeat the index on ~490k rows).
 */
export async function searchCountyParcels(
  t: string,
  mode: 'zip' | 'parcel' | 'text',
  opts: { houseNo?: string; streetWord?: string; perCounty?: number } = {},
): Promise<CountySearchHit[]> {
  const per = opts.perCounty ?? 6;
  const runs = COUNTY_LIST.map(async c => {
    let where: string | null = null;
    const pin = c.normalizePin(t);
    if (pin) where = `${c.pinField} = '${pin}'`;
    else if (mode === 'zip') where = `${c.zipField} = '${t.slice(0, 5)}'`;
    else if (mode === 'text') {
      const bare = t.replace(/\s+(ST|AVE|RD|BLVD|DR|CT|PL|LN|HWY|PKWY|STREET|AVENUE|ROAD|WAY|TER|CIR)\.?$/, '');
      where = opts.houseNo ? `${c.addressField} LIKE '${bare}%'`
        : opts.streetWord ? `${c.addressField} LIKE '%${t}%'` : null;
    }
    if (!where) return [] as CountySearchHit[];
    const rows = await query(c, { where, maxRecords: per, pageSize: per });
    return rows.map(p => ({
      parcelId: p.id,
      title: p.address ?? `Parcel ${p.parcelNumber}`,
      subtitle: [p.city && `${titleCase(p.city)}${p.postalCode ? ` ${p.postalCode}` : ''}`, c.short, `PIN ${p.parcelNumber}`]
        .filter(Boolean).join(' · '),
      lat: p.centroidLat,
      lng: p.centroidLng,
    }));
  });
  return (await Promise.all(runs)).flat();
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, m => m.toUpperCase());
}
