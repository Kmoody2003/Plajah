/**
 * Terra data notice + source credits.
 *
 * Plain-language draft in our own words, FOR COUNSEL TO REVIEW BEFORE LAUNCH
 * (same posture as services/safety/terms.ts). Acceptance is versioned: changing
 * the notice text materially means bumping TERRA_NOTICE_VERSION so everyone
 * accepts the new version. Accepted per account via /api/terra/notice
 * (routes/terraNotice.ts) and mirrored locally for signed-out use.
 *
 * Every layer Terra shows is listed in TERRA_SOURCES with its publisher, the
 * licence AS THE PUBLISHER STATES IT (checked against each ArcGIS item on
 * 2026-11-18), and its accuracy. Where a publisher states no licence we say so
 * rather than inventing one.
 */

export const TERRA_NOTICE_VERSION = '2026-11-18';

export const TERRA_NOTICE: Array<{ heading: string; body: string }> = [
  {
    heading: 'Information, not a survey',
    body: 'Terra computes dimensions, bearings, angles, areas, traverse closures, setbacks and fits from public records. None of it is a boundary survey, a mortgage or ALTA/NSPS survey, a plat, a title search or an engineering study. It does not establish property corners, lines, easements, encroachments or rights of way. Only a professional surveyor licensed in Michigan can do that, on the ground.',
  },
  {
    heading: 'Never use Terra to decide where to dig',
    body: 'Terra does not show water mains, sewer mains, service lines, gas, electric or telecom lines. Those records are not public. The manholes and catch basins shown were detected by software in street photos, so they can be wrong, missing or duplicated. Before any excavation, Michigan law (the MISS DIG Underground Facility Damage Prevention and Safety Act) requires you to notify MISS DIG 811 (call 811 or visit missdig811.org) ahead of digging, and to wait for the facilities to be marked.',
  },
  {
    heading: 'Public records can be wrong',
    body: 'Parcel lines, legal descriptions, zoning, building footprints and utility records come from the agencies listed under Sources. They can be out of date, incomplete or inconsistent with each other. Some recorded legal descriptions do not close, and the city\'s map is compiled from plats and is typically only good to a few feet. Terra flags the disagreements it finds, but finding none does not mean the records are correct. Official zoning is the City Planning Commission\'s published maps, not this layer.',
  },
  {
    heading: 'Not professional advice',
    body: 'Nothing in Terra is legal, title, zoning, surveying, engineering, architectural, construction, appraisal or investment advice. Before you buy, sell, finance, design, permit, build, excavate or resolve a boundary question, use the qualified professional for that decision: a licensed surveyor, professional engineer, architect, attorney or title company. Check with the City of Detroit and the utilities as well.',
  },
  {
    heading: 'Provided as is: limits and release',
    body: 'Terra and its data are provided "as is" and "as available", without warranties of any kind, including accuracy, completeness, fitness for a particular purpose or non-infringement. To the fullest extent the law allows, you take on the risk of using Terra. You also release Plajah, its people and its partners from claims arising from that use, including damage to underground facilities, construction errors, boundary disputes and financial loss. Some places do not allow some of these limits. Where they cannot apply, they apply as far as the law permits.',
  },
  {
    heading: 'Indemnity',
    body: 'If someone makes a claim against Plajah because of how you used Terra\'s information (for example, a drawing or export you relied on or gave to others), you agree to cover the reasonable costs of that claim, to the extent the law allows.',
  },
  {
    heading: 'Whose data this is',
    body: 'The data belongs to the agencies and projects credited under Sources. Plajah is not affiliated with or endorsed by the City of Detroit, the Detroit Water and Sewerage Department, the Public Lighting Authority, Mapillary, SEMCOG, the State of Michigan or the federal government. Downloads (DXF, CSV) repeat these credits. Layers licensed CC BY-SA 4.0 keep that licence when you share data drawn from them.',
  },
];

/** One-line form for map footers, exports and the survey panel. */
export const TERRA_SHORT_NOTICE =
  'Computed from public records. Not a survey, not legal or engineering advice, and not for locating underground utilities: call MISS DIG 811 before you dig.';

export interface TerraSource {
  id: string;
  name: string;
  publisher: string;
  /** Layer endpoint or page the data is read from. */
  url: string;
  /** Licence/terms as the publisher states them. */
  licence: string;
  accuracy: string;
  /** Short credit for footers and exports. */
  credit: string;
}

const DETROIT_PORTAL = 'https://data.detroitmi.gov';
const ORG = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/arcgis/rest/services';
const NO_LICENCE = 'Public record published on the City of Detroit Open Data Portal. The item states no licence; used subject to the portal\'s terms of use.';

export const TERRA_SOURCES: TerraSource[] = [
  { id: 'parcels', name: 'Parcels (current tax year)', publisher: 'City of Detroit, Office of the Assessor', url: `${ORG}/parcel_file_current/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Assessor parcel map compiled from plats; the city warns of inconsistencies with other layers. Legal descriptions are as entered on the assessment roll.', credit: 'Parcels & legal descriptions: City of Detroit Office of the Assessor' },
  { id: 'streets', name: 'Street centerlines', publisher: 'City of Detroit (Public Safety street centerline)', url: `${ORG}/Detroit_Street_Centerline/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Centerlines for orientation; not right-of-way lines.', credit: 'Streets: City of Detroit' },
  { id: 'zoning', name: 'Zoning', publisher: 'City of Detroit, City Planning Commission', url: `${ORG}/Zoning_1/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'The publisher notes the official zoning maps are the PDFs on the city website.', credit: 'Zoning: City Planning Commission' },
  { id: 'civic', name: 'Permits, blight tickets, rental compliance, 311, demolition, Land Bank', publisher: 'City of Detroit (BSEED, DAH, DLBA, Improve Detroit)', url: DETROIT_PORTAL, licence: NO_LICENCE,
    accuracy: 'Operational records; status can lag.', credit: 'Civic records: City of Detroit open data' },
  { id: 'hydrants', name: 'Fire hydrants', publisher: 'Detroit Water and Sewerage Department (via City of Detroit)', url: `${ORG}/City_of_Detroit_Fire_Hydrants/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Utility GIS positions, typically within a few feet.', credit: 'Hydrants: DWSD / City of Detroit' },
  { id: 'mapillary', name: 'Manholes, catch basins (Detroit Street View)', publisher: 'City of Detroit Enterprise GIS, from Mapillary street-level imagery', url: `${ORG}/Detroit_Street_View_Manholes/FeatureServer/0`,
    licence: 'CC BY-SA 4.0 (as stated by the publisher). Credit: Mapillary (mapillary.com) and City of Detroit Enterprise GIS. The publisher marks it "for location reference only", not authoritative, with no asset information.',
    accuracy: 'Machine-detected from photos: approximate, may duplicate or miss covers; utility not identified.', credit: 'Manholes & catch basins: © Mapillary, City of Detroit Enterprise GIS, CC BY-SA 4.0' },
  { id: 'streetlights', name: 'Streetlights', publisher: 'Public Lighting Authority of Detroit (via City of Detroit)', url: `${ORG}/streetlights/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Asset inventory positions.', credit: 'Streetlights: Public Lighting Authority' },
  { id: 'gsi', name: 'Green stormwater infrastructure', publisher: 'Detroit Water and Sewerage Department', url: `${ORG}/Green_Stormwater_Infrastructure_Locations_OpenDataPortal/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Project location points.', credit: 'Green stormwater: DWSD' },
  { id: 'water-work', name: 'Priority water replacements', publisher: 'Detroit Water and Sewerage Department', url: `${ORG}/Priority_Water_Replacements/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Job extents from a 2018 layer, not pipe alignments.', credit: 'Water replacement jobs: DWSD (2018)' },
  { id: 'row', name: 'Street & alley vacations and openings', publisher: 'City of Detroit, DPW Maps & Records Bureau', url: `${ORG}/right_of_way_street_and_alley_vacations/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Compiled from City Council journal records; the linked council PDF is the record.', credit: 'ROW vacations & openings: City of Detroit DPW Maps & Records' },
  { id: 'footprints', name: 'Building footprints', publisher: 'City of Detroit (with SEMCOG building attributes)', url: `${ORG}/Detroit_Building_Footprints_(Public_Safety)/FeatureServer/0`, licence: NO_LICENCE,
    accuracy: 'Roof outlines from imagery (2020); eaves read as building. Heights and stories are estimates.', credit: 'Building footprints: City of Detroit / SEMCOG' },
  { id: 'oakland-parcels', name: 'Parcels — Oakland County', publisher: 'Oakland County, Michigan (Tax Parcel Plus)', url: 'https://gisservices.oakgov.com/arcgis/rest/services/Enterprise/EnterpriseOpenParcelDataMapService/MapServer/1',
    licence: 'Published through Access Oakland; its terms of use provide the data as-is under Michigan law with no non-commercial restriction stated. Read live, not copied.',
    accuracy: 'County tax parcel map. Owner names are withheld on many records. No sale history in this layer.', credit: 'Parcels: Oakland County, Michigan' },
  { id: 'ottawa-parcels', name: 'Parcels — Ottawa County', publisher: 'County of Ottawa, Michigan (ParcelsPublic)', url: 'https://gis.miottawa.org/arcgis/rest/services/HostedServices/ParcelsPublic/FeatureServer/0',
    licence: '© County of Ottawa. Published for use in public applications; read live, not copied.',
    accuracy: 'County tax parcel map with legal descriptions as entered on the roll. No sale history in this layer.', credit: 'Parcels: © County of Ottawa, Michigan' },
];

/** Credits for the layers actually involved, for footers and exports. */
export function creditsFor(ids: string[]): string[] {
  return TERRA_SOURCES.filter(s => ids.includes(s.id)).map(s => s.credit);
}

export interface NoticeAcceptance { version: string; at: number }
const KEY = 'plajah.terra.notice';
export function localNoticeAcceptance(): NoticeAcceptance | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && v.version === TERRA_NOTICE_VERSION ? v : null; } catch { return null; }
}
export function saveLocalNoticeAcceptance(): NoticeAcceptance {
  const a = { version: TERRA_NOTICE_VERSION, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* private mode */ }
  return a;
}
