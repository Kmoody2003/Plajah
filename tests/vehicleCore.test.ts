import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVin, vinCheckDigit, validateVin, vinModelYearHint, normalizePlate, vehicleKey, checkMileage, addMileage, milesPerMonth, hasRollbackFlag, cleanVehicleInput, serializeVehicle, parseVehicle, type Vehicle, type MileageReading } from '../services/vehicleCore';

const D = 86_400_000;
const NOW = 1_700_000_000_000;
const R = (odometer: number, daysAgo: number, extra: Partial<MileageReading> = {}): MileageReading => ({ odometer, at: NOW - daysAgo * D, source: 'test', ...extra });

describe('VIN', () => {
  test('known-good VINs have the right check digit', () => {
    assert.equal(vinCheckDigit('1M8GDM9AXKP042788'), 'X');       // textbook example
    assert.equal(vinCheckDigit('11111111111111111'), '1');
    assert.equal(validateVin('1M8GDM9AXKP042788').checkDigitOk, true);
  });
  test('bad check digit WARNS but stays valid (not enforced in every market)', () => {
    const c = validateVin('1M8GDM9A1KP042788');
    assert.equal(c.valid, true); assert.equal(c.checkDigitOk, false); assert.ok(c.warnings.length); assert.deepEqual(c.errors, []);
  });
  test('length and I/O/Q block', () => {
    assert.equal(validateVin('1M8GDM9AXKP04278').valid, false);
    assert.match(validateVin('1M8GDM9AXKP04278O').errors[0], /I, O or Q/);
    assert.equal(validateVin('').valid, false);
    assert.equal(validateVin('1M8GDM9AXKP0427888').valid, false);
  });
  test('normalizes scans: case, spaces, dashes, Code-39 leading I', () => {
    assert.equal(normalizeVin(' 1m8gdm9a-xkp 042788 '), '1M8GDM9AXKP042788');
    assert.equal(normalizeVin('I1M8GDM9AXKP042788'), '1M8GDM9AXKP042788');
  });
  test('model year hint', () => { assert.equal(vinModelYearHint('2HGFC2F69KH500000', 2026), 2019); assert.equal(vinModelYearHint('short'), null); });
});

describe('plates and keys', () => {
  test('plate normalisation', () => { assert.equal(normalizePlate(' kxt-4410 '), 'KXT4410'); });
  test('key prefers a valid VIN, falls back to plate+state, else null', () => {
    assert.equal(vehicleKey({ vin: '1m8gdm9axkp042788', plate: 'x' }), 'vin_1M8GDM9AXKP042788');
    assert.equal(vehicleKey({ vin: 'bad', plate: 'kxt 4410', state: 'tx' }), 'plate_TX_KXT4410');
    assert.equal(vehicleKey({ plate: 'KXT4410' }), null);
    assert.equal(vehicleKey({}), null);
  });
});

describe('mileage', () => {
  test('first reading ok; increasing ok', () => {
    assert.equal(checkMileage([], 40000, NOW).ok, true);
    assert.equal(checkMileage([R(40000, 90)], 42000, NOW).ok, true);
  });
  test('cannot decrease without override; override flags rollback', () => {
    const h = [R(40000, 90)];
    const bad = checkMileage(h, 39000, NOW); assert.equal(bad.ok, false); assert.match(bad.error!, /lower/);
    const ok = addMileage(h, R(39000, 0, { source: 'ro' }), { override: true });
    assert.equal(ok.check.ok, true); assert.equal(ok.check.rollback, true); assert.equal(hasRollbackFlag(ok.history), true);
    assert.equal(addMileage(h, R(39000, 0)).history.length, 1);
  });
  test('garbage rejected, huge jump only warns', () => {
    assert.equal(checkMileage([], -5, 1).ok, false); assert.equal(checkMileage([], NaN, 1).ok, false); assert.equal(checkMileage([], 9_999_999, 1).ok, false);
    const w = checkMileage([R(10000, 2)], 60000, NOW); assert.equal(w.ok, true); assert.ok(w.warning);
  });
  test('milesPerMonth from own history, ignoring rollback points, null when thin', () => {
    assert.equal(milesPerMonth([R(10000, 0)]), null);
    assert.equal(milesPerMonth([R(10000, 5), R(10200, 0)]), null);                    // < 14 days
    const m = milesPerMonth([R(10000, 300), R(20000, 0)]); assert.ok(m! > 950 && m! < 1050, String(m));
    assert.notEqual(milesPerMonth([R(30000, 200), R(20000, 100, { rollback: true }), R(31000, 0)]), null);
  });
});

describe('input cleaning + codec', () => {
  test('cleanVehicleInput blocks bad VIN, normalises the rest', () => {
    assert.ok(cleanVehicleInput({ vin: 'nope' }).errors.length);
    const c = cleanVehicleInput({ vin: '1m8gdm9axkp042788', plate: 'ab-12', state: 'tx', year: '2019', make: ' Honda ', ownerEmail: 'bad' });
    assert.deepEqual(c.errors, []); assert.equal(c.value.vin, '1M8GDM9AXKP042788'); assert.equal(c.value.plate, 'AB12'); assert.equal(c.value.year, 2019); assert.equal(c.value.make, 'Honda'); assert.equal(c.value.ownerEmail, undefined);
  });
  test('serialize/parse round-trips with no undefined values', () => {
    const v: Vehicle = { id: 'v1', businessUid: 'b', key: 'vin_X', vin: '1M8GDM9AXKP042788', make: 'Honda', mileage: [R(1000, 1)], services: [{ key: 'oil', at: 1 }], notes: [], photos: [], createdAt: 1, updatedAt: 2 };
    const s = serializeVehicle(v); for (const x of Object.values(s)) assert.notEqual(x, undefined);
    const p = parseVehicle(s); assert.equal(p.make, 'Honda'); assert.equal(p.mileage.length, 1); assert.equal(p.model, undefined); assert.equal(p.services[0].key, 'oil');
  });
});
