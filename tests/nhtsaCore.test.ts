import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecodeVin, parseRecalls, decodeUrl, recallsUrl, recallCacheKey, isFresh, RECALL_TTL_MS, fetchJsonWithRetry, recallInspectionLine } from '../services/nhtsaCore';
import { DECODE_OK, DECODE_CHECKDIGIT_AND_PARTIAL, DECODE_GARBAGE, RECALLS_OK, RECALLS_NONE } from './fixtures/nhtsa-fixtures';

describe('NHTSA parsers (FIXTURES, not live captures)', () => {
  test('clean decode', () => {
    const r = parseDecodeVin(DECODE_OK, '2hgfc2f69kh500000');
    assert.equal(r.ok, true); const v = r.vehicle!;
    assert.deepEqual([v.year, v.make, v.model, v.trim], [2019, 'Honda', 'Civic', 'EX']);
    assert.equal(v.engine, '2.0L 4-cyl 158 hp'); assert.equal(v.drivetrain, 'FWD'); assert.equal(v.body, 'Sedan'); assert.equal(v.vin, '2HGFC2F69KH500000'); assert.deepEqual(r.warnings, []);
  });
  test('check digit + partial decode: ok with warnings, series used as trim fallback, turbo shown', () => {
    const r = parseDecodeVin(DECODE_CHECKDIGIT_AND_PARTIAL, '1FTEW1EP5KFA00000');
    assert.equal(r.ok, true); assert.equal(r.vehicle!.make, 'Ford'); assert.equal(r.vehicle!.trim, 'XLT'); assert.match(r.vehicle!.engine!, /turbo/); assert.ok(r.warnings.length >= 2);
  });
  test('no-data decode is a soft failure', () => { const r = parseDecodeVin(DECODE_GARBAGE, '11111111111111111'); assert.equal(r.ok, false); assert.ok(r.error); });
  test('defensive: junk shapes never throw', () => {
    for (const j of [null, undefined, 5, 'x', {}, { Results: [] }, { Results: [null] }, { Results: 'a' }, { Results: [{ ModelYear: { a: 1 }, Make: 7 }] }]) {
      assert.doesNotThrow(() => parseDecodeVin(j as any, 'x'));
    }
    assert.equal(parseDecodeVin({ Results: [] }, 'x').ok, false);
  });
  test('recalls: de-duplicated, skips junk, parkIt kept', () => {
    const r = parseRecalls(RECALLS_OK); assert.equal(r.ok, true); assert.equal(r.recalls.length, 2);
    assert.equal(r.recalls[0].campaign, '20V314000'); assert.match(r.recalls[0].component, /FUEL PUMP/); assert.equal(r.recalls[1].parkIt, true);
  });
  test('zero recalls is success; garbage is failure; never throws', () => {
    assert.deepEqual(parseRecalls(RECALLS_NONE), { ok: true, recalls: [] });
    for (const j of [null, {}, { results: 'x' }, 7]) { const r = parseRecalls(j as any); assert.equal(r.ok, false); }
  });
  test('urls and cache keys', () => {
    assert.equal(decodeUrl('ABC'), 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/ABC?format=json');
    assert.equal(recallsUrl('Mercedes-Benz', 'GLC 300', 2020), 'https://api.nhtsa.gov/recalls/recallsByVehicle?make=Mercedes-Benz&model=GLC%20300&modelYear=2020');
    assert.equal(recallCacheKey('Honda', 'CR-V', 2019), '2019_honda_cr-v');
  });
  test('cache freshness: recalls 24h', () => {
    const now = 10 * RECALL_TTL_MS;
    assert.equal(isFresh(now - 1000, RECALL_TTL_MS, now), true); assert.equal(isFresh(now - RECALL_TTL_MS - 1, RECALL_TTL_MS, now), false);
    assert.equal(isFresh(undefined, RECALL_TTL_MS, now), false); assert.equal(isFresh(0, RECALL_TTL_MS, now), false);
  });
  test('recall line is $0, SAFETY group, labelled as dealer-performed', () => {
    const l = recallInspectionLine(parseRecalls(RECALLS_OK).recalls[0]);
    assert.equal(l.unitPriceCents, 0); assert.equal(l.group, 'SAFETY'); assert.match(l.notes, /free to you/); assert.match(l.notes, /dealer/);
  });
});

describe('fetchJsonWithRetry', () => {
  const res = (ok: boolean, status: number, body: any = {}) => ({ ok, status, json: async () => body });
  test('retries 5xx then succeeds', async () => {
    let n = 0; const r = await fetchJsonWithRetry('u', async () => (++n < 3 ? res(false, 503) : res(true, 200, { a: 1 })), { retries: 2, backoffMs: 1 });
    assert.deepEqual(r, { ok: true, json: { a: 1 } }); assert.equal(n, 3);
  });
  test('does not retry 4xx', async () => { let n = 0; const r = await fetchJsonWithRetry('u', async () => { n++; return res(false, 404); }, { retries: 3, backoffMs: 1 }); assert.equal(r.ok, false); assert.equal(n, 1); });
  test('times out and degrades gracefully', async () => {
    const r = await fetchJsonWithRetry('u', (_u, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => { const e: any = new Error('aborted'); e.name = 'AbortError'; rej(e); })), { timeoutMs: 20, retries: 1, backoffMs: 1 });
    assert.deepEqual(r, { ok: false, error: 'timeout' });
  });
  test('network exception never throws', async () => { const r = await fetchJsonWithRetry('u', async () => { throw new Error('ECONNRESET'); }, { retries: 0 }); assert.equal(r.ok, false); });
});
