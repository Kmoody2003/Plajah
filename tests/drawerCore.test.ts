// drawerCore + registerAuth tests. Run with: npm run test:tax (runs both files)
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { expectedCash, cashVariance, varianceLabel, buildZReport, buildSalesReport, normalizeOrder, normalizeRefund, sanitizeMovement } from '../services/drawerCore';
import { registerPermissionsFor, registerCan, isValidPin, recordAttempt, isLocked, canApprove } from '../services/registerAuthCore';
import { hashPin, verifyPin, signSession, verifySession } from '../services/registerAuthServer';

const order = (o: any) => normalizeOrder({
  id: 'o', createdAt: 1000, staffId: 's1', staffName: 'Ana', subtotalCents: 1000, discountCents: 0, taxCents: 83, tipCents: 0, totalCents: 1083,
  tenders: JSON.stringify([{ type: 'CASH', amountCents: 1083 }]),
  items: JSON.stringify([{ productId: 'p1', title: 'Coffee', qty: 2, chargeCents: 1083, taxCents: 83 }]), ...o,
});

describe('drawer', () => {
  test('expected cash = float + cash sales - cash refunds +/- movements', () => {
    const os = [order({}), order({ tenders: JSON.stringify([{ type: 'CARD', amountCents: 1083 }]) })];
    const rf = [normalizeRefund({ amountCents: 300, taxCents: 20, allocations: JSON.stringify([{ type: 'CASH', amountCents: 300 }]) })];
    const mv = [{ type: 'PAID_IN' as const, amountCents: 500, at: 1 }, { type: 'PAID_OUT' as const, amountCents: 200, at: 2 }, { type: 'DROP' as const, amountCents: 1000, at: 3 }];
    assert.equal(expectedCash(10000, os, rf, mv), 10000 + 1083 - 300 + 500 - 200 - 1000);
  });
  test('variance sign and label', () => {
    assert.equal(cashVariance(9000, 9500), -500);
    assert.equal(varianceLabel(-500), 'Short $5.00'); assert.equal(varianceLabel(0), 'Balanced'); assert.equal(varianceLabel(250), 'Over $2.50');
  });
  test('movement validation', () => {
    assert.equal(sanitizeMovement({ type: 'DROP', amountCents: 0 }, 1).ok, false);
    assert.equal(sanitizeMovement({ type: 'NOPE', amountCents: 5 }, 1).ok, false);
    assert.equal(sanitizeMovement({ type: 'PAID_OUT', amountCents: 500, note: 'ice' }, 1).ok, true);
  });
  test('legacy order (single tender string) normalises', () => {
    const o = normalizeOrder({ id: 'x', totalCents: 700, tender: 'CASH', createdAt: 5, subtotalCents: 700 });
    assert.deepEqual(o.tenders, [{ type: 'CASH', amountCents: 700 }]);
  });
});

describe('Z report', () => {
  const ebt = order({ id: 'e', staffId: 's2', staffName: 'Bo', subtotalCents: 1500, taxCents: 41, totalCents: 1541, tipCents: 0,
    tenders: JSON.stringify([{ type: 'EXTERNAL', kind: 'EBT_SNAP', amountCents: 1000, reference: 'A1B2' }, { type: 'CASH', amountCents: 541 }]),
    items: JSON.stringify([{ productId: 'p2', title: 'Rice', qty: 1, chargeCents: 1000, taxCents: 0 }, { productId: 'p1', title: 'Coffee', qty: 1, chargeCents: 541, taxCents: 41 }]) });
  const tipped = order({ id: 't', tipCents: 200, tenders: JSON.stringify([{ type: 'CARD', amountCents: 1283 }]) });
  const refund = normalizeRefund({ staffId: 's1', staffName: 'Ana', amountCents: 541, taxCents: 41, createdAt: 2000, allocations: JSON.stringify([{ type: 'CASH', amountCents: 541 }]) });
  const z = buildZReport([order({}), ebt, tipped], [refund], [], 5000, { from: 0, to: 9999 }, 7000);
  test('totals by tender include EBT separately', () => {
    const keys = Object.fromEntries(z.byTender.map(t => [t.key, t.salesCents]));
    assert.equal(keys.EBT_SNAP, 1000); assert.equal(keys.CASH, 1083 + 541); assert.equal(keys.CARD, 1283);
  });
  test('tax collected nets refunded tax; tips tracked; net sales', () => {
    assert.equal(z.taxCollectedCents, 83 + 41 + 83 - 41);
    assert.equal(z.tipsCents, 200);
    assert.equal(z.grossSalesCents, 1000 + 1500 + 1000);
    assert.equal(z.refundsNetCents, 500);
    assert.equal(z.netSalesCents, 3500 - 500);
  });
  test('cash block and variance', () => {
    assert.equal(z.cash.expectedCents, 5000 + 1083 + 541 - 541);
    assert.equal(z.cash.varianceCents, 7000 - z.cash.expectedCents);
  });
  test('by staff and top items', () => {
    assert.equal(z.byStaff.find(s => s.staffId === 's2')!.sales, 1);
    assert.equal(z.byStaff.find(s => s.staffId === 's1')!.refunds, 1);
    assert.equal(z.topItems[0].title, 'Coffee'); assert.equal(z.topItems.find(i => i.title === 'Rice')!.revenueCents, 1000);
  });
  test('range filter excludes outside orders', () => {
    assert.equal(buildZReport([order({ createdAt: 50000 })], [], [], 0, { from: 0, to: 100 }).saleCount, 0);
  });
});

describe('sales report margin', () => {
  test('margin uses cost only where known', () => {
    const r = buildSalesReport([order({})], [], { from: 0, to: 9999 }, { p1: 200 });
    assert.equal(r.byItem[0].marginCents, 1000 - 400);
    assert.equal(r.marginCents, 600);
    assert.equal(buildSalesReport([order({})], [], { from: 0, to: 9999 }).marginCents, null);
  });
});

describe('register auth', () => {
  test('role defaults + override', () => {
    assert.equal(registerCan(registerPermissionsFor('STAFF'), 'REFUND'), false);
    assert.equal(registerCan(registerPermissionsFor('STAFF'), 'RING_SALES'), true);
    assert.equal(registerCan(registerPermissionsFor('MANAGER'), 'CLOSE_DRAWER'), true);
    assert.equal(registerCan(registerPermissionsFor('STAFF', ['REFUND', 'BOGUS']), 'REFUND'), true);
    assert.equal(canApprove('STAFF', ['REFUND']), false); assert.equal(canApprove('MANAGER'), true);
  });
  test('pin format', () => { assert.equal(isValidPin('123456'), true); assert.equal(isValidPin('1234'), false); assert.equal(isValidPin('12345a'), false); });
  test('lockout after repeated failures, reset on success', () => {
    let st = recordAttempt(undefined, false, 1000);
    for (let i = 0; i < 4; i++) st = recordAttempt(st, false, 1000 + i);
    assert.equal(isLocked(st, 2000), true); assert.equal(isLocked(st, 1000 + 16 * 60_000), false);
    assert.equal(isLocked(recordAttempt(st, true, 3000), 3000), false);
  });
  test('hashed verify; wrong pin and missing hash fail', () => {
    const h = hashPin('123456');
    assert.equal(verifyPin('123456', { pinHash: h.hash, pinSalt: h.salt }), true);
    assert.equal(verifyPin('999999', { pinHash: h.hash, pinSalt: h.salt }), false);
    assert.equal(verifyPin('123456', {}), false);
  });
  test('session token round trip, tamper, expiry', () => {
    const t = signSession({ b: 'biz', sid: 's', name: 'Ana', role: 'STAFF', exp: Date.now() + 1000 });
    assert.equal(verifySession(t)!.name, 'Ana');
    assert.equal(verifySession(t.slice(0, -2) + 'xx'), null);
    assert.equal(verifySession(signSession({ b: 'b', sid: 's', name: 'n', role: 'STAFF', exp: 5 })), null);
    assert.equal(verifySession('garbage'), null);
  });
});
