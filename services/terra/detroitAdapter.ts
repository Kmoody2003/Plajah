/**
 * Terra — City of Detroit open-data adapter.
 *
 * Source: the city's ArcGIS Feature Services. Parcels, permits, blight tickets,
 * rental compliance, 311 and Land Bank inventory all update daily.
 *
 * ⚠️ Do not "fix" these host URLs against search results. A widely-indexed
 * third-party mirror of Detroit's layers exists whose zoning service is
 * internally named `Detroit_Zoning_2010` and was last edited in 2017. It ranks
 * well and looks authoritative. These are the city's live services.
 *
 * Licensing: Detroit publishes no explicit licence — the datasets return an empty
 * `licenseInfo` and the portal offers a warranty disclaimer (AS-IS, no fitness
 * guarantee) rather than a rights grant. Practically: open public record, no
 * redistribution ban found, but no affirmative grant either. We attribute and
 * disclaim; see docs/OPEN_LISTING_RECORD.md for how that propagates downstream.
 */

import type { OlrSource } from './olr';
import { geohashEncode } from './geohash';
import type { TerraParcel, TerraCivicRecord, GeoJsonGeometry } from './terraTypes';

const ORG = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services';

export const DETROIT_LAYERS = {
  parcels:          `${ORG}/parcel_file_current/FeatureServer/0`,
  zoning:           `${ORG}/Zoning_1/FeatureServer/0`,
  permits:          `${ORG}/bseed_building_permits/FeatureServer/0`,
  blightTickets:    `${ORG}/blight_tickets/FeatureServer/0`,
  rentalCompliance: `${ORG}/bseed_building_rental_compliance_public_view/FeatureServer/0`,
  serviceRequests:  `${ORG}/improve_detroit/FeatureServer/0`,
  landBank:         `${ORG}/DLBA_Owned_Properties/FeatureServer/0`,
  demolitionQueue:  `${ORG}/city_demolition_pipeline/FeatureServer/0`,
} as const;

export const DETROIT_ATTRIBUTION = 'Data: City of Detroit Open Data Portal (provided as-is, without warranty)';

function source(layer: keyof typeof DETROIT_LAYERS, sourceUpdatedAt?: number): OlrSource {
  return {
    system: `detroit-open-data:${layer}`,
    label: 'City of Detroit Open Data',
    url: DETROIT_LAYERS[layer],
    retrievedAt: Date.now(),
    sourceUpdatedAt,
    observed: 'observed',
    attribution: DETROIT_ATTRIBUTION,
  };
}

// ─── ArcGIS query plumbing ───────────────────────────────────────────────────

export interface ArcGisQueryOptions {
  where?: string;
  outFields?: string;
  returnGeometry?: boolean;
  /** Layer max is 1000; we page automatically. */
  pageSize?: number;
  /** Hard ceiling so a full-city pull can be bounded during development. */
  maxRecords?: number;
  resultOffset?: number;
  signal?: AbortSignal;
}

/**
 * ⚠️ ArcGIS returns HTTP 200 with an `error` object in the body on failure.
 * Checking response.ok is not enough and will silently yield zero features.
 */
function assertNoArcGisError(payload: any, url: string): void {
  if (payload && typeof payload === 'object' && payload.error) {
    const e = payload.error;
    throw new Error(`ArcGIS error ${e.code ?? '?'} on ${url}: ${e.message || 'unknown'}${
      Array.isArray(e.details) && e.details.length ? ` (${e.details.join('; ')})` : ''}`);
  }
}

/** Page through a layer, returning raw GeoJSON features. */
export async function queryArcGisGeoJson(
  layerUrl: string,
  opts: ArcGisQueryOptions = {},
): Promise<any[]> {
  const pageSize = Math.min(opts.pageSize ?? 1000, 1000);
  const maxRecords = opts.maxRecords ?? Infinity;
  let offset = opts.resultOffset ?? 0;
  const features: any[] = [];

  while (features.length < maxRecords) {
    const params = new URLSearchParams({
      where: opts.where ?? '1=1',
      outFields: opts.outFields ?? '*',
      returnGeometry: String(opts.returnGeometry ?? true),
      outSR: '4326',
      f: 'geojson',
      resultOffset: String(offset),
      resultRecordCount: String(Math.min(pageSize, maxRecords - features.length)),
    });
    const url = `${layerUrl}/query?${params.toString()}`;
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status} on ${layerUrl}`);
    const payload = await res.json();
    assertNoArcGisError(payload, layerUrl);

    const page: any[] = payload.features ?? [];
    features.push(...page);

    // Stop when the server says there is no more, or it gave us a short page.
    const more = payload.properties?.exceededTransferLimit ?? payload.exceededTransferLimit ?? false;
    if (!more || page.length === 0) break;
    offset += page.length;
  }
  return features.slice(0, Number.isFinite(maxRecords) ? maxRecords : undefined);
}

// ─── Field access ────────────────────────────────────────────────────────────
//
// Casing differs across Detroit / state / regional sources for the same concept.
// Read through helpers rather than indexing properties directly.

function pick(props: Record<string, any>, ...names: string[]): any {
  if (!props) return undefined;
  for (const n of names) {
    if (props[n] !== undefined && props[n] !== null && props[n] !== '') return props[n];
    const lower = n.toLowerCase();
    for (const key of Object.keys(props)) {
      if (key.toLowerCase() === lower) {
        const v = props[key];
        if (v !== undefined && v !== null && v !== '') return v;
      }
    }
  }
  return undefined;
}

function num(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function str(v: any): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/** ArcGIS epoch-millis fields; also tolerates ISO strings. */
function ts(v: any): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
  const parsed = Date.parse(String(v));
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isoDate(v: any): string | undefined {
  const t = ts(v);
  return t === undefined ? undefined : new Date(t).toISOString().slice(0, 10);
}

/** Cheap centroid — average of the outer ring. Good enough for map pins. */
function centroidOf(geometry?: GeoJsonGeometry): { lat?: number; lng?: number } {
  if (!geometry) return {};
  try {
    let ring: any[] | undefined;
    if (geometry.type === 'Polygon') ring = geometry.coordinates?.[0];
    else if (geometry.type === 'MultiPolygon') ring = geometry.coordinates?.[0]?.[0];
    else if (geometry.type === 'Point') {
      const [lng, lat] = geometry.coordinates || [];
      return { lat: num(lat), lng: num(lng) };
    }
    if (!Array.isArray(ring) || !ring.length) return {};
    let sx = 0, sy = 0, n = 0;
    for (const pt of ring) {
      const x = num(pt?.[0]); const y = num(pt?.[1]);
      if (x === undefined || y === undefined) continue;
      sx += x; sy += y; n++;
    }
    return n ? { lat: sy / n, lng: sx / n } : {};
  } catch { return {}; }
}

// ─── Normalisers ─────────────────────────────────────────────────────────────

export function normalizeParcel(feature: any): TerraParcel | null {
  const p = feature?.properties ?? {};
  const parcelNumber = str(pick(p, 'parcel_id', 'parcelno', 'PARCELNO', 'parcel_number'));
  if (!parcelNumber) return null;

  const geometry: GeoJsonGeometry | undefined = feature.geometry ?? undefined;
  const { lat, lng } = centroidOf(geometry);

  return {
    id: `detroit:${parcelNumber}`,
    jurisdiction: 'detroit',
    parcelNumber,
    address: str(pick(p, 'address', 'property_address', 'ADDRESS')),
    city: str(pick(p, 'city')) ?? 'Detroit',
    stateOrProvince: 'MI',
    postalCode: str(pick(p, 'zip_code', 'zipcode', 'postal_code')),
    geometry,
    centroidLat: lat,
    centroidLng: lng,
    geohash: lat !== undefined && lng !== undefined ? geohashEncode(lat, lng, 7) : undefined,
    frontageFt: num(pick(p, 'frontage')),
    depthFt: num(pick(p, 'depth')),
    lotSqFt: num(pick(p, 'total_square_footage', 'total_sq_ft')),
    lotAcres: num(pick(p, 'total_acreage')),
    zoningDistrict: str(pick(p, 'zoning_district', 'zoning')),
    isImproved: (() => {
      const v = pick(p, 'is_improved');
      if (v === undefined) return undefined;
      const s = String(v).toLowerCase();
      return s === 'true' || s === 'yes' || s === '1' || v === 1 || v === true;
    })(),
    yearBuilt: num(pick(p, 'year_built')),
    floorAreaSqFt: num(pick(p, 'total_floor_area')),
    buildingStyle: str(pick(p, 'building_style')),
    buildingCount: num(pick(p, 'num_buildings')),
    propertyClass: str(pick(p, 'property_class')),
    useCode: str(pick(p, 'use_code')),
    assessedValue: num(pick(p, 'amt_assessed_value')),
    taxableValue: num(pick(p, 'amt_taxable_value')),
    taxStatus: str(pick(p, 'tax_status')),
    lastSaleDate: isoDate(pick(p, 'sale_date')),
    lastSalePrice: num(pick(p, 'amt_sale_price')),
    taxpayerName: str(pick(p, 'taxpayer_1', 'taxpayer_name')),
    taxpayerAddress: str(pick(p, 'taxpayer_street', 'taxpayer_address')),
    localHistoricDistrict: str(pick(p, 'local_historic_district')),
    nezDistrict: str(pick(p, 'nez_district', 'nez')),
    legalDescription: str(pick(p, 'legal_description')),
    ward: str(pick(p, 'ward')),
    sources: [source('parcels')],
    updatedAt: Date.now(),
  };
}

function civicFrom(
  feature: any,
  layer: keyof typeof DETROIT_LAYERS,
  kind: TerraCivicRecord['kind'],
  build: (p: Record<string, any>) => { summary: string; status?: string; occurredAt?: number; amount?: number },
): TerraCivicRecord | null {
  const p = feature?.properties ?? {};
  const built = build(p);
  if (!built.summary) return null;
  const { lat, lng } = centroidOf(feature?.geometry);
  const parcelNumber = str(pick(p, 'parcel_id', 'parcelno'));
  const localId = str(pick(p, 'ticket_number', 'record_id', 'permit_no', 'case_id', 'id', 'OBJECTID'))
    ?? `${Date.now()}-${Math.round(Math.random() * 1e6)}`;

  return {
    id: `detroit:${kind.toLowerCase()}:${localId}`,
    jurisdiction: 'detroit',
    kind,
    parcelNumber,
    address: str(pick(p, 'address', 'violation_address', 'site_address')),
    summary: built.summary,
    status: built.status,
    occurredAt: built.occurredAt,
    amount: built.amount,
    lat, lng,
    raw: p,
    sources: [source(layer)],
    updatedAt: Date.now(),
  };
}

export function normalizeBlightTicket(f: any): TerraCivicRecord | null {
  return civicFrom(f, 'blightTickets', 'BLIGHT_TICKET', p => ({
    summary: str(pick(p, 'ordinance_description', 'violation_description')) ?? 'Blight violation',
    status: str(pick(p, 'payment_status', 'disposition')),
    occurredAt: ts(pick(p, 'ticket_issued_date')),
    amount: num(pick(p, 'amt_balance_due', 'amt_judgment')),
  }));
}

export function normalizePermit(f: any): TerraCivicRecord | null {
  return civicFrom(f, 'permits', 'PERMIT', p => ({
    summary: str(pick(p, 'permit_type', 'description')) ?? 'Building permit',
    status: str(pick(p, 'status', 'permit_status')),
    occurredAt: ts(pick(p, 'permit_issued', 'issued_date')),
    amount: num(pick(p, 'amt_estimated_contractor_cost')),
  }));
}

export function normalizeRentalCompliance(f: any): TerraCivicRecord | null {
  return civicFrom(f, 'rentalCompliance', 'RENTAL_COMPLIANCE', p => {
    const cofc = ts(pick(p, 'current_cofc_issued_date'));
    const reg = ts(pick(p, 'current_reg_issued_date'));
    return {
      // The registered-but-uncertified gap is the headline civic metric here.
      summary: cofc ? 'Registered and certified' : 'Registered — no compliance certificate',
      status: cofc ? 'CERTIFIED' : 'UNCERTIFIED',
      occurredAt: cofc ?? reg,
    };
  });
}

export function normalizeServiceRequest(f: any): TerraCivicRecord | null {
  return civicFrom(f, 'serviceRequests', 'SERVICE_REQUEST', p => ({
    summary: str(pick(p, 'request_type_title', 'request_type')) ?? 'Service request',
    status: str(pick(p, 'status')),
    occurredAt: ts(pick(p, 'created_at')),
  }));
}

export function normalizeLandBank(f: any): TerraCivicRecord | null {
  return civicFrom(f, 'landBank', 'LAND_BANK', p => ({
    summary: str(pick(p, 'inventory_status_socrata', 'inventory_status')) ?? 'Land Bank owned',
    status: str(pick(p, 'inventory_status_socrata')),
  }));
}

export function normalizeDemolition(f: any): TerraCivicRecord | null {
  return civicFrom(f, 'demolitionQueue', 'DEMOLITION', p => ({
    summary: 'Scheduled for demolition',
    status: str(pick(p, 'demolition_contract_group', 'status')),
    occurredAt: ts(pick(p, 'demolition_date')),
  }));
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

export async function fetchDetroitParcels(opts: ArcGisQueryOptions = {}): Promise<TerraParcel[]> {
  const features = await queryArcGisGeoJson(DETROIT_LAYERS.parcels, opts);
  return features.map(normalizeParcel).filter((p): p is TerraParcel => p !== null);
}

const CIVIC_FETCHERS: Record<string, { layer: keyof typeof DETROIT_LAYERS; normalize: (f: any) => TerraCivicRecord | null }> = {
  blightTickets:    { layer: 'blightTickets',    normalize: normalizeBlightTicket },
  permits:          { layer: 'permits',          normalize: normalizePermit },
  rentalCompliance: { layer: 'rentalCompliance', normalize: normalizeRentalCompliance },
  serviceRequests:  { layer: 'serviceRequests',  normalize: normalizeServiceRequest },
  landBank:         { layer: 'landBank',         normalize: normalizeLandBank },
  demolitionQueue:  { layer: 'demolitionQueue',  normalize: normalizeDemolition },
};

export type CivicFeed = keyof typeof CIVIC_FETCHERS;
export const CIVIC_FEEDS = Object.keys(CIVIC_FETCHERS) as CivicFeed[];

export async function fetchDetroitCivic(feed: CivicFeed, opts: ArcGisQueryOptions = {}): Promise<TerraCivicRecord[]> {
  const spec = CIVIC_FETCHERS[feed];
  if (!spec) throw new Error(`Unknown civic feed: ${feed}`);
  const features = await queryArcGisGeoJson(DETROIT_LAYERS[spec.layer], { returnGeometry: true, ...opts });
  return features.map(spec.normalize).filter((r): r is TerraCivicRecord => r !== null);
}

/** Layer record count — cheap health check that also proves the endpoint is live. */
export async function fetchLayerCount(layerUrl: string, where = '1=1'): Promise<number> {
  const url = `${layerUrl}/query?where=${encodeURIComponent(where)}&returnCountOnly=true&f=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status} on ${layerUrl}`);
  const payload = await res.json();
  assertNoArcGisError(payload, layerUrl);
  return Number(payload.count ?? 0);
}
