/**
 * Data Commons — federal place profile (Terra).
 *
 * Given a point, answer "what do federal datasets say about this spot?":
 * Census geography, FEMA flood zone, Opportunity Zone status, ground elevation
 * and the county's disaster history. All keyless public APIs.
 *
 * ── Fair-housing rule ────────────────────────────────────────────────────────
 * This profile is PROPERTY-level facts only: hazards, incentives, terrain. It
 * deliberately carries NO demographics (income, race, age, population). Terra's
 * Site Scout is the only surface allowed to show those, for commercial siting
 * (see siteScoutService.ts). Do not add demographic layers here.
 *
 * ── Honesty rules ────────────────────────────────────────────────────────────
 * - Each layer fails on its own; "unavailable" is never rendered as "safe".
 * - FEMA flood maps are regulatory maps, not a risk forecast and not an
 *   elevation certificate. Many areas outside mapped zones still flood.
 * - Disaster declarations are COUNTY-wide; they say nothing about one parcel.
 */

import { cached, fetchJson, layer, prov, isValidLatLng, type Layer } from './core';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CensusGeography {
  state?: string;
  /** Two-letter postal code, e.g. "MI" — what USAspending filters on. */
  stateAbbr?: string;
  stateFips?: string;
  county?: string;
  countyFips?: string;
  tractGeoid?: string;
  place?: string;
  /** SF-424 item 16 format, e.g. "MI-013" ("MI-AL" for at-large states). */
  congressionalDistrict?: string;
}

export interface FloodZone {
  zone: string;
  subtype?: string;
  /** Special Flood Hazard Area — where federally backed mortgages require flood insurance. */
  inSpecialFloodHazardArea: boolean;
  plain: string;
}

export interface OpportunityZone { tractGeoid: string; designated: true }

export interface Elevation { feet: number }

export interface DisasterSummary {
  county: string;
  sinceYear: number;
  declarations: number;
  byType: { type: string; count: number }[];
  recent: { number: number; title: string; type: string; date: string }[];
}

export interface FederalPlaceProfile {
  lat: number;
  lng: number;
  geography: Layer<CensusGeography>;
  flood: Layer<FloodZone>;
  opportunityZone: Layer<OpportunityZone>;
  elevation: Layer<Elevation>;
  disasters: Layer<DisasterSummary>;
  generatedAt: number;
}

// ─── Pure helpers (unit-tested) ──────────────────────────────────────────────

/** Plain-language reading of an NFHL zone code. Guidance, not a determination. */
export function describeFloodZone(zone: string, sfha: boolean, subtype?: string): string {
  const z = zone.toUpperCase();
  if (sfha) {
    return `Zone ${zone} is a Special Flood Hazard Area (roughly a 1% annual chance of flooding). `
      + 'Federally backed mortgages generally require flood insurance here.';
  }
  if (z === 'X') {
    return /0\.2|500/i.test(subtype || '')
      ? 'Zone X (shaded): moderate flood hazard — between the 1% and 0.2% annual-chance floodplains.'
      : 'Zone X: outside the mapped 1%-annual-chance floodplain. This is not a guarantee against flooding.';
  }
  if (z === 'D') return 'Zone D: flood hazard is possible but undetermined — the area has not been studied.';
  return `Zone ${zone}: see FEMA's map service center for what this designation means.`;
}

export function summarizeDisasters(rows: any[], county: string, sinceYear: number): DisasterSummary {
  // OpenFEMA returns one row per (disaster × county designation); count each disaster once.
  const byNumber = new Map<number, any>();
  for (const r of rows) {
    const n = Number(r?.disasterNumber);
    if (Number.isFinite(n) && !byNumber.has(n)) byNumber.set(n, r);
  }
  const unique = [...byNumber.values()].sort((a, b) =>
    String(b.declarationDate).localeCompare(String(a.declarationDate)));
  const counts = new Map<string, number>();
  for (const r of unique) {
    const t = String(r.incidentType || 'Other');
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return {
    county,
    sinceYear,
    declarations: unique.length,
    byType: [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    recent: unique.slice(0, 5).map(r => ({
      number: Number(r.disasterNumber),
      title: String(r.declarationTitle || '').slice(0, 120),
      type: String(r.incidentType || ''),
      date: String(r.declarationDate || '').slice(0, 10),
    })),
  };
}

export function parseGeography(json: any): CensusGeography | null {
  const g = json?.result?.geographies;
  if (!g) return null;
  const state = g['States']?.[0];
  const county = g['Counties']?.[0];
  const tract = g['Census Tracts']?.[0];
  const place = g['Incorporated Places']?.[0] || g['Census Designated Places']?.[0];
  if (!state && !county) return null;
  // The layer key carries the Congress number ("120th Congressional Districts") and changes every term.
  const cdKey = Object.keys(g).find(k => /Congressional Districts/i.test(k));
  const cdRaw = cdKey ? g[cdKey]?.[0] : undefined;
  const cdNum = cdRaw ? String(cdRaw[Object.keys(cdRaw).find(k => /^CD\d+$/.test(k)) || ''] ?? '') : '';
  let congressionalDistrict: string | undefined;
  if (state?.STUSAB && cdNum) {
    // 00 = at-large, 98 = non-voting delegate; SF-424 wants "XX-AL" for single-district areas.
    congressionalDistrict = /^(00|98)$/.test(cdNum) ? `${state.STUSAB}-AL` : `${state.STUSAB}-${cdNum.padStart(3, '0')}`;
  }
  return {
    state: state?.NAME,
    stateAbbr: state?.STUSAB,
    stateFips: state?.STATE,
    county: county?.NAME,
    countyFips: county?.COUNTY,
    tractGeoid: tract?.GEOID,
    place: place?.NAME,
    congressionalDistrict,
  };
}

// ─── Fetchers ────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60_000;

/** Round to ~11 m so near-identical clicks share a cache entry. */
function cell(n: number): string { return n.toFixed(4); }

async function geographyAt(lat: number, lng: number): Promise<CensusGeography | null> {
  const url = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinates?'
    + `x=${lng}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const json = await cached(`geo:${cell(lat)},${cell(lng)}`, 30 * DAY, () => fetchJson<any>(url, { timeoutMs: 20_000 }));
  return parseGeography(json);
}

async function floodAt(lat: number, lng: number): Promise<FloodZone | null> {
  const url = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?'
    + `geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects`
    + '&outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF&returnGeometry=false&f=json';
  const json = await cached(`flood:${cell(lat)},${cell(lng)}`, 7 * DAY, () => fetchJson<any>(url, { timeoutMs: 25_000 }));
  if (json?.error) throw new Error(`FEMA NFHL: ${json.error.message || 'query error'}`);
  const a = json?.features?.[0]?.attributes;
  if (!a?.FLD_ZONE) return null; // unmapped — NOT the same as "no hazard"
  const sfha = a.SFHA_TF === 'T';
  return {
    zone: String(a.FLD_ZONE),
    subtype: a.ZONE_SUBTY ? String(a.ZONE_SUBTY) : undefined,
    inSpecialFloodHazardArea: sfha,
    plain: describeFloodZone(String(a.FLD_ZONE), sfha, a.ZONE_SUBTY),
  };
}

async function opportunityZoneAt(lat: number, lng: number): Promise<OpportunityZone | null> {
  const url = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Opportunity_Zones/FeatureServer/13/query?'
    + `geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects`
    + '&outFields=GEOID10&returnGeometry=false&f=json';
  const json = await cached(`oz:${cell(lat)},${cell(lng)}`, 30 * DAY, () => fetchJson<any>(url, { timeoutMs: 20_000 }));
  if (json?.error) throw new Error(`Opportunity Zones: ${json.error.message || 'query error'}`);
  const a = json?.features?.[0]?.attributes;
  // No feature means "not a designated zone" — a real answer, so the layer is 'none', not unavailable.
  return a?.GEOID10 ? { tractGeoid: String(a.GEOID10), designated: true } : null;
}

async function elevationAt(lat: number, lng: number): Promise<Elevation | null> {
  const url = `https://epqs.nationalmap.gov/v1/json?x=${lng}&y=${lat}&wkid=4326&units=Feet&includeDate=false`;
  const json = await cached(`elev:${cell(lat)},${cell(lng)}`, 90 * DAY, () => fetchJson<any>(url, { timeoutMs: 20_000, retry: true }));
  const v = Number(json?.value);
  // The service returns -1000000 for "no data" (open water, outside coverage).
  return Number.isFinite(v) && v > -9000 ? { feet: Math.round(v * 10) / 10 } : null;
}

async function disastersFor(g: CensusGeography | null): Promise<DisasterSummary | null> {
  if (!g?.stateFips || !g.countyFips) throw new Error('county unknown');
  const sinceYear = new Date().getFullYear() - 10;
  const filter = `fipsStateCode eq '${g.stateFips}' and fipsCountyCode eq '${g.countyFips}'`
    + ` and declarationDate ge '${sinceYear}-01-01T00:00:00.000z'`;
  const url = 'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?'
    + `$filter=${encodeURIComponent(filter)}&$top=500&$select=disasterNumber,declarationTitle,incidentType,declarationDate`
    + '&$orderby=declarationDate%20desc';
  const json = await cached(`dis:${g.stateFips}${g.countyFips}`, DAY, () => fetchJson<any>(url, { timeoutMs: 25_000 }));
  const rows = Array.isArray(json?.DisasterDeclarationsSummaries) ? json.DisasterDeclarationsSummaries : [];
  return summarizeDisasters(rows, g.county || `${g.stateFips}${g.countyFips}`, sinceYear);
}

export async function getFederalPlaceProfile(lat: number, lng: number): Promise<FederalPlaceProfile> {
  if (!isValidLatLng(lat, lng)) throw new Error('lat/lng outside the United States');

  const geography = await layer(
    prov('U.S. Census Bureau', 'Geocoder — geographies (current)', 'https://geocoding.geo.census.gov/geocoder/'),
    () => geographyAt(lat, lng),
  );

  const [flood, opportunityZone, elevation, disasters] = await Promise.all([
    layer(prov('FEMA', 'National Flood Hazard Layer', 'https://www.fema.gov/flood-maps/national-flood-hazard-layer'),
      () => floodAt(lat, lng)),
    layer(prov('HUD', 'Opportunity Zones', 'https://hudgis-hud.opendata.arcgis.com/datasets/opportunity-zones'),
      () => opportunityZoneAt(lat, lng)),
    layer(prov('USGS', '3DEP Elevation Point Query Service', 'https://apps.nationalmap.gov/epqs/'),
      () => elevationAt(lat, lng)),
    layer(prov('FEMA', 'OpenFEMA Disaster Declarations (county-wide)', 'https://www.fema.gov/openfema-data-page/disaster-declarations-summaries-v2'),
      () => disastersFor(geography.data ?? null)),
  ]);

  return { lat, lng, geography, flood, opportunityZone, elevation, disasters, generatedAt: Date.now() };
}

// ─── Address → location ──────────────────────────────────────────────────────

export interface GeocodedAddress {
  matchedAddress: string;
  lat: number;
  lng: number;
  geography: CensusGeography | null;
}

/** Census one-line geocoder. Returns null when the address does not match — never a guess. */
export async function geocodeAddress(address: string): Promise<GeocodedAddress | null> {
  const a = address.trim().slice(0, 200);
  if (a.length < 5) throw new Error('address too short');
  const url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?'
    + `address=${encodeURIComponent(a)}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`;
  const json = await cached(`addr:${a.toLowerCase()}`, 30 * DAY, () => fetchJson<any>(url, { timeoutMs: 20_000 }));
  const m = json?.result?.addressMatches?.[0];
  if (!m?.coordinates) return null;
  const lat = Number(m.coordinates.y);
  const lng = Number(m.coordinates.x);
  if (!isValidLatLng(lat, lng)) return null;
  return {
    matchedAddress: String(m.matchedAddress || a),
    lat, lng,
    geography: parseGeography({ result: { geographies: m.geographies } }),
  };
}
