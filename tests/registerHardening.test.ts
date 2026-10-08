// Hardening tests: PIN storage, CAS-based concurrent refunds, loyalty clawback, discount gating, product pass-through.
// Run with: npm run test:tax
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { casUpdate, memoryCasStore } from '../services/casCore';
import { commitRefund, clawbackPoints, applyClawback, refundLogOf } from '../services/refundCore';
import { isValidNewPin, isValidPin, composeDiscounts } from '../services/registerAuthCore';
import { hashPin, verifyPin } from '../services/registerAuthServer';
import { mergeProductData } from '../services/inventoryCore';

const posOrder = (extra: any = {}) => ({
  sellerId: 'biz', source: 'POS', status: 'CONFIRMED', totalCents: 1000, paidCents: 1000, subtotalCents: 1000, discountCents: 0, pointsEarned: 10, customerUid: 'c1',
  items: JSON.stringify([{ productId: 'p1', title: 'Tee', qty: 1, chargeCents: 1000, taxCents: 0 }]),
  tenders: JSON.stringify([{ type: 'CASH', amountCents: 1000 }]), ...extra,
});

describe('PIN storage (no plaintext anywhere)', () => {
  test('PINs are exactly 6 digits for both setting and entry (no legacy PINs exist)', () => {
    assert.equal(isValidNewPin('123456'), true); assert.equal(isValidNewPin('1234'), false); assert.equal(isValidNewPin('1234567'), false); assert.equal(isValidNewPin('12345a'), false);
    assert.equal(isValidPin('123456'), true); assert.equal(isValidPin('1234'), false); assert.equal(isValidPin('12'), false);
  });
  test('verifyPin only trusts a salted hash - a plaintext field is ignored', () => {
    const h = hashPin('482915');
    assert.equal(verifyPin('482915', { pinHash: h.hash, pinSalt: h.salt }), true);
    assert.equal(verifyPin('000000', { pinHash: h.hash, pinSalt: h.salt }), false);
    assert.equal(verifyPin('482915', { pin: '482915' } as any), false);
    assert.notEqual(hashPin('482915').hash, h.hash);   // random salt
  });
  test('client code never writes or reads StaffMember.pin', () => {
    const svc = readFileSync('services/staffService.ts', 'utf8'), ui = readFileSync('components/StaffHRManager.tsx', 'utf8'), types = readFileSync('types.ts', 'utf8');
    assert.doesNotMatch(svc, /\.pin\b|\bpin:\s*'/);
    assert.doesNotMatch(ui, /\bm\.pin\b|addStaff\([^)]*\bpin\b/);
    assert.doesNotMatch(types.slice(types.indexOf('export interface StaffMember'), types.indexOf('export interface Shift')), /\bpin\??:|pinHash|pinSalt/);
    assert.match(svc, /\/api\/register\/clock/);
  });
  test('firestore.rules blocks pin material on staff docs and seals the secrets store', () => {
    const rules = readFileSync('firestore.rules', 'utf8');
    assert.match(rules, /hasAny\(\['pin', 'pinHash', 'pinSalt'\]\)/);
    assert.match(rules, /match \/staffSecrets\/\{id\} \{ allow read, write: if false; \}/);
    assert.match(rules, /match \/drawerState\/\{id\}\s+\{ allow read, write: if false; \}/);
  });
});

describe('concurrent refunds (CAS)', () => {
  test('two simultaneous refunds of the same line: exactly one succeeds, total never exceeds paid', async () => {
    const store = memoryCasStore({ o1: posOrder() });
    const mk = (id: string) => commitRefund(store, 'o1', { refundId: id, lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL', sellerId: 'biz' });
    const [a, b] = await Promise.all([mk('rf_a'), mk('rf_b')]);
    assert.equal([a, b].filter(r => r.ok).length, 1);
    const loser = [a, b].find(r => !r.ok)!;
    assert.equal(loser.ok === false && /already fully refunded/.test(loser.error), true);
    const doc = store.docs.get('o1')!.data;
    assert.equal(doc.refundedCents, 1000); assert.equal(refundLogOf(doc).length, 1); assert.equal(doc.status, 'REFUNDED');
  });
  test('many concurrent partial refunds never exceed qty / paid', async () => {
    const store = memoryCasStore({ o1: posOrder({ items: JSON.stringify([{ productId: 'p1', title: 'Tee', qty: 3, chargeCents: 1000, taxCents: 0 }]) }) });
    const rs = await Promise.all(['a', 'b', 'c', 'd', 'e'].map(i => commitRefund(store, 'o1', { refundId: 'rf_' + i, lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL', sellerId: 'biz' })));
    assert.equal(rs.filter(r => r.ok).length, 3);
    assert.equal(store.docs.get('o1')!.data.refundedCents, 1000);
  });
  test('same refund id replayed is idempotent', async () => {
    const store = memoryCasStore({ o1: posOrder() });
    const one = await commitRefund(store, 'o1', { refundId: 'rf_x', lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL', sellerId: 'biz' });
    const two = await commitRefund(store, 'o1', { refundId: 'rf_x', lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL', sellerId: 'biz' });
    assert.equal(one.ok && !one.duplicate, true); assert.equal(two.ok && two.duplicate, true);
    assert.equal(refundLogOf(store.docs.get('o1')!.data).length, 1);
  });
  test('wrong seller / online order / gate rejection write nothing', async () => {
    const store = memoryCasStore({ o1: posOrder(), o2: posOrder({ source: 'ONLINE' }) });
    assert.equal((await commitRefund(store, 'o1', { refundId: 'r', lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL', sellerId: 'other' })).ok, false);
    assert.equal((await commitRefund(store, 'o2', { refundId: 'r', lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL', sellerId: 'biz' })).ok, false);
    const g = await commitRefund(store, 'o1', { refundId: 'r', lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL', sellerId: 'biz', gate: () => ({ ok: false, error: 'need manager', code: 'MANAGER_PIN' }) });
    assert.equal(g.ok === false && g.code, 'MANAGER_PIN');
    assert.equal(store.docs.get('o1')!.data.refundLog, undefined);
  });
  test('casUpdate surfaces CONFLICT when the doc keeps changing', async () => {
    const store = memoryCasStore({ d: { n: 0 } });
    const real = store.put.bind(store);
    store.put = async () => 'conflict';
    const r = await casUpdate(store, 'd', () => ({ patch: { n: 1 }, result: 1 }), 3);
    assert.equal(r.ok === false && r.reason, 'CONFLICT'); void real;
  });
  test('drawer: concurrent movements are all kept (no lost update)', async () => {
    const store = memoryCasStore({ s1: { status: 'OPEN', movements: '[]' } });
    const add = (n: number) => casUpdate(store, 's1', cur => ({ patch: { movements: JSON.stringify([...JSON.parse(cur!.movements), { n }]) }, result: n }));
    await Promise.all([1, 2, 3, 4, 5].map(add));
    assert.equal(JSON.parse(store.docs.get('s1')!.data.movements).length, 5);
  });
  test('drawer: only one of two concurrent opens wins the pointer', async () => {
    const store = memoryCasStore();
    const open = (id: string) => casUpdate<string>(store, 'current', p => (p?.openId ? { abort: true, result: 'OPEN' } : { patch: { openId: id }, result: 'WON' }));
    const rs = await Promise.all([open('a'), open('b')]);
    assert.equal(rs.filter(r => r.ok).length, 1);
  });
});

describe('loyalty clawback', () => {
  test('partial refunds add up to exactly the earned points', () => {
    let prior = 0, total = 0;
    for (const net of [333, 333, 334]) { total += clawbackPoints({ earnedPoints: 10, orderNetCents: 1000, priorRefundNetCents: prior, thisRefundNetCents: net }); prior += net; }
    assert.equal(total, 10);
  });
  test('proportional, and never over-claws past the order', () => {
    assert.equal(clawbackPoints({ earnedPoints: 20, orderNetCents: 2000, priorRefundNetCents: 0, thisRefundNetCents: 500 }), 5);
    assert.equal(clawbackPoints({ earnedPoints: 20, orderNetCents: 2000, priorRefundNetCents: 1900, thisRefundNetCents: 500 }), 1);
    assert.equal(clawbackPoints({ earnedPoints: 0, orderNetCents: 2000, priorRefundNetCents: 0, thisRefundNetCents: 500 }), 0);
  });
  test('balance never goes below zero', () => {
    assert.deepEqual(applyClawback(3, 10), { newBalance: 0, clawed: 3 });
    assert.deepEqual(applyClawback(50, 10), { newBalance: 40, clawed: 10 });
    assert.deepEqual(applyClawback(0, 10), { newBalance: 0, clawed: 0 });
  });
  test('claw applied through CAS is idempotent per refund id and floored at zero', async () => {
    const store = memoryCasStore({ c1: { points: 4, clawedRefunds: '[]' } });
    const apply = (refundId: string, claw: number) => casUpdate<number>(store, 'c1', cur => {
      const applied: string[] = JSON.parse(cur!.clawedRefunds);
      if (applied.includes(refundId)) return { abort: true, result: -1 };
      const r = applyClawback(cur!.points, claw);
      return { patch: { points: r.newBalance, clawedRefunds: JSON.stringify([...applied, refundId]) }, result: r.clawed };
    });
    const first = await apply('rf1', 10); const again = await apply('rf1', 10);
    assert.equal(first.ok && first.result, 4); assert.equal(again.ok, false);
    assert.equal(store.docs.get('c1')!.data.points, 0);
  });
});

describe('discount gating', () => {
  const base = { subtotalCents: 10000, offerCents: 0, redeemCents: 0, limitPct: 10 };
  test('within the limit is not flagged; over it is', () => {
    assert.equal(composeDiscounts({ ...base, manual: { type: 'PCT', value: 10 } }).overLimit, false);
    const o = composeDiscounts({ ...base, manual: { type: 'PCT', value: 25 } });
    assert.equal(o.overLimit, true); assert.equal(o.manualCents, 2500);
  });
  test('dollar discounts are measured against the same limit', () => {
    assert.equal(composeDiscounts({ ...base, manual: { type: 'AMOUNT', value: 1000 } }).overLimit, false);
    assert.equal(composeDiscounts({ ...base, manual: { type: 'AMOUNT', value: 1001 } }).overLimit, true);
  });
  test('auto offers and loyalty are never gated (even when large)', () => {
    const d = composeDiscounts({ subtotalCents: 10000, offerCents: 5000, redeemCents: 2000, limitPct: 10 });
    assert.equal(d.overLimit, false); assert.equal(d.totalCents, 7000);
  });
  test('manual discount is capped by what is left and by 100%', () => {
    assert.equal(composeDiscounts({ subtotalCents: 1000, offerCents: 0, redeemCents: 900, manual: { type: 'PCT', value: 100 }, limitPct: 100 }).manualCents, 100);
    assert.equal(composeDiscounts({ ...base, manual: { type: 'PCT', value: 500 } }).manualCents, 10000);
    assert.equal(composeDiscounts({ ...base, manual: { type: 'PCT', value: -5 } }).manualCents, 0);
  });
  test('server never reads a client-supplied offer amount', () => {
    const src = readFileSync('server.ts', 'utf8');
    const seg = src.slice(src.indexOf("app.post('/api/store/pos-sale'"), src.indexOf("app.post('/api/store/pos-refund'"));
    assert.doesNotMatch(seg, /req\.body\??\.offerDiscountCents/);
    assert.match(seg, /bestOffer\(offers/);
    assert.match(seg, /DISCOUNT_PIN/);
  });
});

describe('product register fields reach Firestore', () => {
  test('taxClass / snapEligible / ageRestricted survive the merge', () => {
    const d = mergeProductData(undefined, { title: 'Milk', taxClass: 'GROCERY_FOOD', snapEligible: true, ageRestricted: 21 } as any, { id: 'p', stock: 4 });
    assert.equal(d.taxClass, 'GROCERY_FOOD'); assert.equal(d.snapEligible, true); assert.equal(d.ageRestricted, 21);
  });
  test('clearing a flag overwrites the live doc (explicit false/0), or undefined which removes the field', () => {
    const live = { taxClass: 'GROCERY_FOOD', snapEligible: true, ageRestricted: 21 } as any;
    const cleared = mergeProductData(live, { taxClass: 'STANDARD', snapEligible: false, ageRestricted: 0 } as any, {});
    assert.equal(cleared.snapEligible, false); assert.equal(cleared.ageRestricted, 0); assert.equal(cleared.taxClass, 'STANDARD');
    const removed = mergeProductData(live, { snapEligible: undefined } as any, {});
    assert.equal('snapEligible' in removed, false);   // undefined overrides then strips - safe too
    assert.match(readFileSync('components/inventory/ProductEditor.tsx', 'utf8'), /taxClass, snapEligible, ageRestricted:/);
  });
  test('saveProduct writes through mergeProductData and the data has no undefined', () => {
    assert.match(readFileSync('services/inventoryService.ts', 'utf8'), /mergeProductData\(cur, a\.fields,/);
    assert.equal(Object.values(mergeProductData({}, { sku: undefined, title: 'x' } as any, {})).includes(undefined as any), false);
  });
});

describe('receipts', () => {
  test('ESC/POS TOTAL line includes the tip', () => {
    assert.match(readFileSync('services/posPeripherals.ts', 'utf8'), /`TOTAL`\.padEnd\(18\) \+ money\(r\.totalCents \+ \(r\.tipCents \|\| 0\)\)/);
  });
});
