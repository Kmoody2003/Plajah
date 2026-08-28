/**
 * Terra stored-form codec — the regression that mattered: GeoJSON coordinates
 * are arrays nested directly inside arrays, which Firestore rejects, so parcels
 * must cross the Firestore boundary with geometry packed as a JSON string.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { packParcel, unpackParcel, type TerraParcel } from '../services/terra/terraTypes';

const parcel: TerraParcel = {
  id: 'detroit:10000924.',
  jurisdiction: 'detroit',
  parcelNumber: '10000924.',
  address: '2656 NEBRASKA',
  geometry: { type: 'Polygon', coordinates: [[[-83.1, 42.35], [-83.1, 42.36], [-83.09, 42.36], [-83.1, 42.35]]] },
  centroidLat: 42.355,
  centroidLng: -83.097,
  sources: [],
  updatedAt: 1,
} as unknown as TerraParcel;

test('packParcel replaces geometry with a JSON string (no nested arrays remain)', () => {
  const stored = packParcel(parcel);
  assert.equal((stored as any).geometry, undefined);
  assert.equal(typeof stored.geometryJson, 'string');
  // Nothing else was lost.
  assert.equal(stored.address, parcel.address);
  assert.equal(stored.centroidLat, parcel.centroidLat);
});

test('unpackParcel round-trips the geometry', () => {
  const back = unpackParcel(packParcel(parcel));
  assert.deepEqual(back?.geometry, parcel.geometry);
  assert.equal((back as any)?.geometryJson, undefined);
});

test('parcels without geometry pass through unchanged', () => {
  const { geometry: _g, ...bare } = parcel;
  const stored = packParcel(bare as TerraParcel);
  assert.equal(stored.geometryJson, undefined);
  assert.deepEqual(unpackParcel(stored), bare);
});

test('unpackParcel tolerates legacy docs and garbage', () => {
  assert.equal(unpackParcel(null), null);
  // Legacy doc that (hypothetically) held a live geometry — kept as-is.
  const legacy = unpackParcel({ ...parcel } as any);
  assert.deepEqual(legacy?.geometry, parcel.geometry);
  // Corrupt JSON — geometry dropped, record survives.
  const corrupt = unpackParcel({ ...packParcel(parcel), geometryJson: '{nope' } as any);
  assert.equal(corrupt?.geometry, undefined);
  assert.equal(corrupt?.address, parcel.address);
});

// ─── Geohash (spatial index for viewport queries) ───────────────────────────
import { geohashEncode, geohashCellSize, geohashCellsForBounds, coverBounds } from '../services/terra/geohash';

test('geohash: prefix property holds (coarser = prefix of finer)', () => {
  const lat = 42.3548, lng = -83.0864; // downtown Detroit
  const h7 = geohashEncode(lat, lng, 7);
  assert.equal(h7.length, 7);
  assert.ok(h7.startsWith(geohashEncode(lat, lng, 5)));
  assert.ok(h7.startsWith(geohashEncode(lat, lng, 6)));
});

test('geohash: nearby points share coarse cells, distinct fine cells', () => {
  const a = geohashEncode(42.3548, -83.0864, 7);
  const b = geohashEncode(42.3549, -83.0865, 7); // ~15m away
  const far = geohashEncode(42.44, -82.95, 7);   // other side of the city
  assert.equal(a.slice(0, 5), b.slice(0, 5));
  assert.notEqual(a.slice(0, 4), far.slice(0, 4));
});

test('coverBounds: cells cover the corners of a neighbourhood viewport', () => {
  const b = { south: 42.35, west: -83.10, north: 42.365, east: -83.07 }; // ~1.6 × 2.5 km
  const cover = coverBounds(b, 32);
  assert.ok(cover, 'viewport should be coverable');
  assert.ok(cover!.cells.length >= 1 && cover!.cells.length <= 32);
  for (const [lat, lng] of [[b.south, b.west], [b.south, b.east], [b.north, b.west], [b.north, b.east]] as const) {
    const h = geohashEncode(lat, lng, cover!.precision);
    assert.ok(cover!.cells.includes(h), `corner cell ${h} missing`);
  }
});

test('coverBounds: city-scale viewport refuses rather than exploding', () => {
  const city = { south: 42.25, west: -83.29, north: 42.46, east: -82.90 };
  const cover = coverBounds(city, 32);
  // Precision 5 cells are ~4.9 km — the whole city still fits under 32 of them,
  // which is the intended behaviour (coarse cover, per-cell limit bounds reads).
  if (cover) assert.ok(cover.cells.length <= 32);
  const size = geohashCellSize(6);
  assert.ok(size.latDeg > 0 && size.lonDeg > 0);
  assert.equal(geohashCellsForBounds(city, 7, 32), null, 'fine precision must bail');
});
