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
