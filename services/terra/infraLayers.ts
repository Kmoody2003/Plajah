/**
 * Terra infrastructure overlays — the public layers a civil engineer, architect
 * or contractor wants over a parcel, from the City of Detroit's own ArcGIS
 * services. Every layer carries where it comes from and how exact it is.
 *
 * ⚠️ What is NOT here, because it is not published: water mains, sewer mains,
 * gas and electric lines. Those are critical-infrastructure records; the legal
 * route is MISS DIG 811 before digging and record drawings from DWSD / DTE.
 * Manholes, catch basins and hydrants are the visible surface of the water and
 * sewer network and are the best public proxy for where it runs.
 */

import type { GeoJsonGeometry } from './terraTypes';
import { queryArcGisGeoJson } from './detroitAdapter';

const ORG = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services';

export type InfraKind =
  | 'HYDRANT' | 'MANHOLE' | 'CATCH_BASIN' | 'STREETLIGHT' | 'GSI'
  | 'WATER_WORK' | 'ROW_VACATION' | 'ROW_OPENING' | 'FOOTPRINT';

export interface InfraLayerSpec {
  id: InfraKind;
  label: string;
  color: string;
  group: 'Utilities' | 'Right of way' | 'Buildings';
  url: string;
  outFields: string;
  geom: 'point' | 'line' | 'polygon';
  /** Don't load below this zoom — point layers are dense. */
  minZoom: number;
  /** Shown in the legend tooltip and the popup footer. */
  source: string;
  /** How exact the position is. */
  accuracy: string;
  summarize: (p: Record<string, any>) => { title: string; lines: string[]; link?: string };
}

const yr = (ms?: number | string) => {
  const t = typeof ms === 'string' ? Number(ms) : ms;
  return t && Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : undefined;
};
const clean = (v: any) => (v === null || v === undefined || String(v).trim() === '' || v === 'N/A' ? undefined : String(v).trim());

export const INFRA_LAYERS: InfraLayerSpec[] = [
  {
    id: 'HYDRANT', label: 'Fire hydrants', color: '#FF5470', group: 'Utilities', geom: 'point', minZoom: 15,
    url: `${ORG}/City_of_Detroit_Fire_Hydrants/FeatureServer/0`,
    outFields: 'OBJECTID,LOCDESC,FACILITYID,DFDHYDRANTID,OWNERSHIP,HYDRANTTYP,MANUFACTURER,HYDMODEL,CASTINGYEAR,INSPECTDT',
    source: 'DWSD distribution system hydrants', accuracy: 'Utility GIS — typically within a few feet',
    summarize: p => ({
      title: `Hydrant ${clean(p.DFDHYDRANTID) ?? clean(p.FACILITYID) ?? ''}`.trim(),
      lines: [clean(p.LOCDESC), [clean(p.MANUFACTURER), clean(p.HYDMODEL)].filter(Boolean).join(' '), p.CASTINGYEAR ? `Cast ${p.CASTINGYEAR}` : undefined,
        clean(p.OWNERSHIP) ? `Owner ${p.OWNERSHIP}` : undefined, yr(p.INSPECTDT) ? `Inspected ${yr(p.INSPECTDT)}` : undefined].filter(Boolean) as string[],
    }),
  },
  {
    id: 'MANHOLE', label: 'Manholes', color: '#A0A8B8', group: 'Utilities', geom: 'point', minZoom: 16,
    url: `${ORG}/Detroit_Street_View_Manholes/FeatureServer/0`, outFields: 'OBJECTID,first_seen_at,last_seen_at',
    source: 'Detected in street-level imagery (Mapillary)', accuracy: 'Approximate — machine-detected, may duplicate or miss covers; utility not identified',
    summarize: p => ({ title: 'Manhole cover (detected)', lines: [yr(p.last_seen_at) ? `Last seen ${yr(p.last_seen_at)}` : '', 'Sewer, water or other utility — not identified'].filter(Boolean) }),
  },
  {
    id: 'CATCH_BASIN', label: 'Catch basins', color: '#4FC3D6', group: 'Utilities', geom: 'point', minZoom: 16,
    url: `${ORG}/Detroit_Street_View_Catch_Basins/FeatureServer/0`, outFields: 'OBJECTID,first_seen_at,last_seen_at',
    source: 'Detected in street-level imagery (Mapillary)', accuracy: 'Approximate — machine-detected storm inlets',
    summarize: p => ({ title: 'Catch basin (detected)', lines: [yr(p.last_seen_at) ? `Last seen ${yr(p.last_seen_at)}` : '', 'Storm inlet to the combined/storm sewer'].filter(Boolean) }),
  },
  {
    id: 'STREETLIGHT', label: 'Streetlights', color: '#FFD45C', group: 'Utilities', geom: 'point', minZoom: 16,
    url: `${ORG}/streetlights/FeatureServer/0`, outFields: 'ObjectId,streetlight_id,pla_id,feed_type,asset_owner,pole_type,pole_owner,nearest_address',
    source: 'Public Lighting Authority inventory', accuracy: 'Asset inventory position',
    summarize: p => ({
      title: `Streetlight ${clean(p.pla_id) ?? clean(p.streetlight_id) ?? ''}`.trim(),
      lines: [clean(p.nearest_address), [clean(p.pole_type), 'pole', clean(p.pole_owner) ? `(${p.pole_owner})` : ''].filter(Boolean).join(' '),
        clean(p.feed_type) ? `${p.feed_type} feed` : undefined, clean(p.asset_owner) ? `Owner ${p.asset_owner}` : undefined].filter(Boolean) as string[],
    }),
  },
  {
    id: 'GSI', label: 'Green stormwater', color: '#3DD68C', group: 'Utilities', geom: 'point', minZoom: 14,
    url: `${ORG}/Green_Stormwater_Infrastructure_Locations_OpenDataPortal/FeatureServer/0`,
    outFields: 'OBJECTID,PROJECT_NAME,PRACTICE_TYPE,ACRES_MANAGED,GALLONS_MANAGED_MG,CREDIT_RECEIVED,UNDERDRAIN,PIPE_DIAMETER,STORM_EVENT_SIZE,OWNER_TYPE',
    source: 'DWSD green stormwater infrastructure', accuracy: 'Project location point',
    summarize: p => ({
      title: clean(p.PROJECT_NAME) ?? 'Green stormwater practice',
      lines: [clean(p.PRACTICE_TYPE), p.ACRES_MANAGED ? `${p.ACRES_MANAGED} ac managed` : undefined,
        p.GALLONS_MANAGED_MG ? `${p.GALLONS_MANAGED_MG} MG managed` : undefined, clean(p.STORM_EVENT_SIZE) ? `Design storm ${p.STORM_EVENT_SIZE}` : undefined,
        clean(p.UNDERDRAIN) ? `Underdrain: ${p.UNDERDRAIN}` : undefined, clean(p.CREDIT_RECEIVED) ? `Drainage credit: ${p.CREDIT_RECEIVED}` : undefined].filter(Boolean) as string[],
    }),
  },
  {
    id: 'WATER_WORK', label: 'Water main work', color: '#5C8DFF', group: 'Utilities', geom: 'line', minZoom: 14,
    url: `${ORG}/Priority_Water_Replacements/FeatureServer/0`, outFields: 'OBJECTID,JobName,JobReference,StartDate,EndDate,ACTIVITY,LOCATION,JOBSTATUS',
    source: 'DWSD priority water replacement jobs (2018 layer)', accuracy: 'Job extent along the street — NOT the pipe alignment',
    summarize: p => ({
      title: clean(p.JobName) ?? 'Water replacement job',
      lines: [clean(p.ACTIVITY), clean(p.LOCATION), clean(p.JOBSTATUS) ? `Status ${p.JOBSTATUS}` : undefined,
        yr(p.StartDate) ? `Start ${yr(p.StartDate)}` : undefined].filter(Boolean) as string[],
    }),
  },
  {
    id: 'ROW_VACATION', label: 'Vacated streets & alleys', color: '#C9A6FF', group: 'Right of way', geom: 'polygon', minZoom: 14,
    url: `${ORG}/right_of_way_street_and_alley_vacations/FeatureServer/0`,
    outFields: 'ObjectId,vacation_type,right_of_way_type,right_of_way_name,jcc_page,jcc_date,jcc_url,street_alley_book,jurisdiction_description',
    source: 'DPW Maps & Records — City Council vacations', accuracy: 'Compiled from council records',
    summarize: p => ({
      title: `${clean(p.vacation_type) ?? 'Vacation'} · ${clean(p.right_of_way_type) ?? 'ROW'}${clean(p.right_of_way_name) ? ` · ${p.right_of_way_name}` : ''}`,
      lines: [p.jcc_page ? `JCC page ${p.jcc_page}${clean(p.jcc_date) ? ` (${p.jcc_date})` : ''}` : undefined,
        clean(p.street_alley_book) ? `Street & alley book ${p.street_alley_book}` : undefined,
        p.vacation_type === 'Easement' ? 'Public utility easement retained — check before building over it' : undefined].filter(Boolean) as string[],
      link: clean(p.jcc_url),
    }),
  },
  {
    id: 'ROW_OPENING', label: 'Opened streets & alleys', color: '#E8B33D', group: 'Right of way', geom: 'polygon', minZoom: 14,
    url: `${ORG}/right_of_way_street_and_alley_openings/FeatureServer/0`,
    outFields: 'ObjectId,right_of_way_type,right_of_way_name,record_type,jcc_page,jcc_date,document_url',
    source: 'DPW Maps & Records — openings / dedications', accuracy: 'Compiled from council records',
    summarize: p => ({
      title: `Opening · ${clean(p.right_of_way_type) ?? 'ROW'}${clean(p.right_of_way_name) ? ` · ${p.right_of_way_name}` : ''}`,
      lines: [clean(p.record_type), p.jcc_page ? `JCC page ${p.jcc_page}${clean(p.jcc_date) ? ` (${p.jcc_date})` : ''}` : undefined].filter(Boolean) as string[],
      link: clean(p.document_url),
    }),
  },
  {
    id: 'FOOTPRINT', label: 'Building footprints', color: '#FFFFFF', group: 'Buildings', geom: 'polygon', minZoom: 17,
    url: `${ORG}/Detroit_Building_Footprints_(Public_Safety)/FeatureServer/0`,
    outFields: 'OBJECTID,APN,parcelID,AKA,bldgType,STORIES,MEDIAN_HGT,YEAR_BUILT,RES_SQFT,NONRES_SQF,HOUSING_UN',
    source: 'City / SEMCOG building footprints (2020)', accuracy: 'Roof-line outline from imagery — a few feet',
    summarize: p => ({
      title: clean(p.AKA) ?? `${clean(p.bldgType) ?? 'Building'}`,
      lines: [p.STORIES ? `${p.STORIES} stories` : undefined, p.MEDIAN_HGT ? `~${p.MEDIAN_HGT} ft tall (median)` : undefined,
        p.YEAR_BUILT ? `Built ${p.YEAR_BUILT}` : undefined,
        (p.RES_SQFT || p.NONRES_SQF) ? `${Number((p.RES_SQFT || 0) + (p.NONRES_SQF || 0)).toLocaleString()} sq ft floor area` : undefined,
        clean(p.APN) ? `Parcel ${p.APN}` : undefined].filter(Boolean) as string[],
    }),
  },
];

export const INFRA_BY_ID = Object.fromEntries(INFRA_LAYERS.map(l => [l.id, l])) as Record<InfraKind, InfraLayerSpec>;

export interface InfraFeature {
  id: string;
  kind: InfraKind;
  geometry: GeoJsonGeometry;
  props: Record<string, any>;
}

export interface Bounds { south: number; west: number; north: number; east: number }

/** One layer, one viewport. Server-side spatial filter, capped so a dense block can't run away. */
export async function fetchInfraLayer(kind: InfraKind, b: Bounds, opts: { maxRecords?: number; signal?: AbortSignal } = {}): Promise<InfraFeature[]> {
  const spec = INFRA_BY_ID[kind];
  const features = await queryArcGisGeoJson(spec.url, {
    envelope: { xmin: b.west, ymin: b.south, xmax: b.east, ymax: b.north },
    outFields: spec.outFields,
    maxRecords: opts.maxRecords ?? 2500,
    signal: opts.signal,
  });
  const out: InfraFeature[] = [];
  for (const f of features) {
    if (!f?.geometry) continue;
    const props = f.properties ?? {};
    out.push({ id: `${kind}:${props.OBJECTID ?? props.ObjectId ?? out.length}`, kind, geometry: f.geometry, props });
  }
  return out;
}
