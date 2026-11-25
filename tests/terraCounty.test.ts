import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTY_SOURCES, countiesInBounds, isCountyJurisdiction } from '../services/terra/countyParcels';

// Attribute shapes copied from live county records (2026-11-25).
const ring = [[-83.0841, 42.4481], [-83.0851, 42.4481], [-83.0851, 42.4474], [-83.0841, 42.4474], [-83.0841, 42.4481]];

test('Oakland record normalises to a Terra parcel', () => {
  const p = COUNTY_SOURCES.oakland.normalize({
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { PIN: '2504276018', CLASSCODE: '401', NAME1: null, SITEADDRESS: '134 TECUMSEH ST', SITECITY: 'TROY', SITEZIP5: '48017',
      POSTALADDRESS: '134 TECUMSEH ST', ASSESSEDVALUE: 123520, TAXABLEVALUE: 100090, STRUCTURE_DESC: 'Bungalow', LIVING_AREA_SQFT: 1131,
      CVTTAXDESCRIPTION: 'CITY OF CLAWSON', 'Shape.area': 6000.12 },
  })!;
  assert.equal(p.id, 'oakland:2504276018');
  assert.equal(p.jurisdiction, 'oakland');
  assert.equal(p.lotSqFt, 6000);
  assert.equal(p.isImproved, true);
  assert.equal(p.taxpayerName, undefined); // withheld owner stays empty, not "null"
  assert.ok(p.geohash && p.centroidLat! > 42.44);
});

test('Ottawa record keeps the legal description and acreage', () => {
  const p = COUNTY_SOURCES.ottawa.normalize({
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: { FinalPIN: '70-14-17-408-017', OwnerName: 'OWNER', PropertyAddress: '3467 DREW CT', PropertyCity: 'HUDSONVILLE', PropertyZip: '49426',
      PropertyClass: '402', LegalDesc: 'LOT 30 & W 85 FT OF LOT 34. GRAND VIEW ESTATES NO 2', AssessedValue: 0, TaxableValue: 229945, Acreage: 0.5796 },
  })!;
  assert.equal(p.id, 'ottawa:70-14-17-408-017');
  assert.equal(p.isImproved, false);
  assert.equal(p.assessedValue, undefined); // 0 means not recorded
  assert.equal(p.lotSqFt, 25247);
  assert.match(p.legalDescription!, /GRAND VIEW ESTATES/);
});

test('typed PINs normalise to each county\'s stored form', () => {
  assert.equal(COUNTY_SOURCES.oakland.normalizePin('25-04-276-018'), '2504276018');
  assert.equal(COUNTY_SOURCES.ottawa.normalizePin('701417408017'), '70-14-17-408-017');
  assert.equal(COUNTY_SOURCES.oakland.normalizePin('02001910-5'), null); // Detroit id
});

test('viewports route only to the counties they touch', () => {
  assert.deepEqual(countiesInBounds({ south: 42.33, north: 42.34, west: -83.06, east: -83.04 }).map(c => c.id), []); // downtown Detroit
  assert.deepEqual(countiesInBounds({ south: 42.57, north: 42.59, west: -83.26, east: -83.23 }).map(c => c.id), ['oakland']);
  assert.ok(isCountyJurisdiction('ottawa') && !isCountyJurisdiction('detroit'));
});
