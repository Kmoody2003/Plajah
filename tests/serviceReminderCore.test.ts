import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { predictNextService, resolveIntervals, classifyLine, DEFAULT_INTERVALS, reminderMessage, DEFAULT_MILES_PER_MONTH } from '../services/serviceReminderCore';
import { buildEntry, canReadEntries, visibleToShop, makeClaimCode, normalizeClaimCode, formatShareToken, parseShareToken, renderPassportHtml, type PassportEntry } from '../services/passportCore';

const D = 86_400_000, MONTH = 30.4375 * D;
const NOW = 1_800_000_000_000;
const oil = resolveIntervals().filter(i => i.key === 'oil');

describe('predictNextService', () => {
  test('unknown when never serviced', () => {
    const p = predictNextService({ mileage: [], services: [], now: NOW });
    assert.ok(p.every(x => x.status === 'UNKNOWN'));
  });
  test('mileage overdue wins even before the date', () => {
    const [p] = predictNextService({ now: NOW, intervals: oil, mileage: [{ odometer: 56000, at: NOW, source: 't' }], services: [{ key: 'oil', odometer: 50000, at: NOW - 2 * MONTH }] });
    assert.equal(p.status, 'OVERDUE'); assert.equal(p.dueAtMiles, 55000); assert.ok(p.milesLeft! < 0);
  });
  test('time overdue when miles are fine', () => {
    const [p] = predictNextService({ now: NOW, intervals: oil, mileage: [{ odometer: 50500, at: NOW, source: 't' }], services: [{ key: 'oil', odometer: 50000, at: NOW - 8 * MONTH }] });
    assert.equal(p.status, 'OVERDUE');
  });
  test('due soon from the vehicle\'s OWN driving rate; falls back to default otherwise', () => {
    const hist = [{ odometer: 40000, at: NOW - 6 * MONTH, source: 't' }, { odometer: 46000, at: NOW, source: 't' }];   // 1000 mi/mo
    const a = predictNextService({ now: NOW, intervals: oil, mileage: hist, services: [{ key: 'oil', odometer: 41300, at: NOW - 1 * MONTH }] })[0];
    assert.equal(a.rateSource, 'HISTORY'); assert.ok(Math.abs(a.rate - 1000) < 30);
    assert.equal(a.status, 'DUE_SOON'); assert.ok(a.estimatedDueDate! > NOW);
    const b = predictNextService({ now: NOW, intervals: oil, mileage: [{ odometer: 46000, at: NOW, source: 't' }], services: [{ key: 'oil', odometer: 46000, at: NOW }] })[0];
    assert.equal(b.rateSource, 'DEFAULT'); assert.equal(b.rate, DEFAULT_MILES_PER_MONTH); assert.equal(b.status, 'OK');
  });
  test('a fast driver is due sooner than a slow one for the same service', () => {
    const mk = (perMonth: number) => predictNextService({ now: NOW, intervals: oil, mileage: [{ odometer: 20000, at: NOW - 4 * MONTH, source: 't' }, { odometer: 20000 + 4 * perMonth, at: NOW, source: 't' }], services: [{ key: 'oil', odometer: 20000 + 4 * perMonth - 1000, at: NOW - 1 * MONTH }] })[0];
    assert.ok(mk(2500).estimatedDueDate! < mk(400).estimatedDueDate!);
  });
  test('results sorted most urgent first', () => {
    const p = predictNextService({ now: NOW, mileage: [{ odometer: 60000, at: NOW, source: 't' }], services: [{ key: 'oil', odometer: 59000, at: NOW - D }, { key: 'rotation', odometer: 40000, at: NOW - 12 * MONTH }] });
    assert.equal(p[0].key, 'rotation'); assert.equal(p[0].status, 'OVERDUE');
  });
});

describe('intervals', () => {
  test('shop and vehicle overrides layer; 0 disables an axis; labelled defaults', () => {
    const r = resolveIntervals({ oil: { miles: 7500 } }, { oil: { months: 0 }, rotation: { miles: 8000 } });
    const o = r.find(i => i.key === 'oil')!; assert.equal(o.miles, 7500); assert.equal(o.months, undefined);
    assert.equal(r.find(i => i.key === 'rotation')!.miles, 8000);
    assert.ok(DEFAULT_INTERVALS.length >= 8);
  });
  test('classify ticket lines', () => {
    assert.deepEqual(classifyLine('Oil & filter change (full synthetic)'), ['oil']); assert.ok(classifyLine('Tire rotation & balance').includes('rotation'));
    assert.deepEqual(classifyLine('Mystery fee'), []);
  });
  test('reminder wording is labelled a shop reminder, never OEM-required', () => {
    const m = reminderMessage('Joe', '2019 Honda Civic', { label: 'Oil & filter change', status: 'DUE_SOON', milesLeft: 340 });
    assert.match(m.body, /typical intervals/); assert.ok(!/manufacturer requires|OEM/i.test(m.body));
  });
});

describe('vehicle passport rules', () => {
  const entry = (shopUid: string, at = 1): PassportEntry => buildEntry({ id: 'e' + at + shopUid, passportKey: 'vin_X', shopUid, shopName: 'Joe', ticketId: 't', ticketNumber: 'RO-1', at, odometer: 1000.4, lines: [{ kind: 'SERVICE', description: 'Oil', approval: 'APPROVED' }, { kind: 'PART', description: 'Declined thing', approval: 'DECLINED' }] }).entry!;
  test('entry drops declined work and has no prices or customer data', () => {
    const e = entry('s1'); assert.equal(e.work.length, 1); assert.equal(e.odometer, 1000); assert.equal(e.verified, true);
    const json = JSON.stringify(e); assert.ok(!/price|phone|email|cents/i.test(json));
    assert.ok(buildEntry({ id: 'x', passportKey: 'k', shopUid: 's', shopName: 'n', ticketId: 't', ticketNumber: 'r', at: 1, lines: [{ kind: 'X', description: 'd', approval: 'PENDING' }] }).error);
  });
  test('owner reads; strangers do not; shop sees only its own unless shared', () => {
    assert.equal(canReadEntries({ ownerUid: 'o', viewerUid: 'o' }), true);
    assert.equal(canReadEntries({ ownerUid: 'o', viewerUid: 'x' }), false);
    assert.equal(canReadEntries({ ownerUid: '', viewerUid: '' }), false);
    assert.equal(canReadEntries({ ownerUid: 'o', viewerUid: 'x', shareOk: true }), true);
    const all = [entry('s1', 1), entry('s2', 2), entry('s1', 3)];
    assert.deepEqual(visibleToShop(all, 's1', false).map(e => e.at), [3, 1]);
    assert.equal(visibleToShop(all, 's1', true).length, 3);
    assert.equal(visibleToShop(all, 'nobody', false).length, 0);
  });
  test('claim codes', () => { const c = makeClaimCode([1, 2, 3, 4, 5, 6, 7, 8]); assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.equal(normalizeClaimCode(c.toLowerCase()), c.replace('-', '')); });
  test('share token: valid, expired, tampered', () => {
    const mac = (b: string) => 'mac' + b.length.toString().padStart(2, '0') + 'abcdefghijklmnopq';
    const tok = formatShareToken({ key: 'vin_1M8GDM9AXKP042788', scope: 'shop', exp: NOW + 1000 }, mac);
    const ok = parseShareToken(tok, mac, NOW); assert.ok(!('error' in ok)); if (!('error' in ok)) { assert.equal(ok.key, 'vin_1M8GDM9AXKP042788'); assert.equal(ok.scope, 'shop'); }
    assert.deepEqual(parseShareToken(tok, mac, NOW + 2000), { error: 'EXPIRED' });
    const strict = (b: string) => nodeCrypto.createHmac('sha256', 'k').update(b).digest('base64url').slice(0, 24);
    const t2 = formatShareToken({ key: 'k1', scope: 'view', exp: NOW + 1000 }, strict);
    const forged = t2.split('.')[0].slice(0, -2) + 'AA.' + t2.split('.')[1];
    assert.deepEqual(parseShareToken(forged, strict, NOW), { error: 'BAD_SIGNATURE' });
    assert.deepEqual(parseShareToken('garbage', strict, NOW), { error: 'MALFORMED' });
  });
  test('printable history escapes and states provenance', () => {
    const e = { ...entry('s1'), shopName: '<b>Evil</b>' };
    const h = renderPassportHtml({ make: 'Honda', model: 'Civic<script>' }, [e]);
    assert.ok(!h.includes('<b>Evil</b>')); assert.ok(!h.includes('Civic<script>')); assert.match(h, /not a manufacturer record/);
  });
});
