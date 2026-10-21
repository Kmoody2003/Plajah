// commerceBus — pure helper tests
// Run with: npm run test:commerce
//
// The price board is what a menu TV, a signage slide and the org shop render — it must agree with the
// storefront on "sold out" / "only N left", hide drafts, respect explicit product order, and honour
// hideSoldOut. activeDeals decides which offers a DEAL slide may show.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { priceBoard, activeDeals, dealHeadline, boardPrice, mapOrderDoc, applySaleLocally } from '../services/commerceBus';
import type { StoreProduct } from '../types';
import type { BusinessOffer } from '../services/offersCore';

const p = (o: Partial<StoreProduct> = {}): StoreProduct => ({
  id: 'p1', sellerId: 's1', sellerName: 'Shop', title: 'Latte', description: '', category: 'OTHER',
  price: 4.5, images: [], stock: 20, isDigital: false, isActive: true, createdAt: 0, updatedAt: 0, ...o,
});

describe('priceBoard', () => {
  test('maps stock status with inventoryCore rules', () => {
    const rows = priceBoard([
      p({ id: 'a', title: 'A', stock: 20 }),
      p({ id: 'b', title: 'B', stock: 3 }),
      p({ id: 'c', title: 'C', stock: 0 }),
      p({ id: 'd', title: 'D', stock: 0, fulfillmentSource: 'printful' }),
      p({ id: 'e', title: 'E', stock: 0, allowBackorder: true }),
    ]);
    const by = Object.fromEntries(rows.map(r => [r.id, r]));
    assert.equal(by.a.status, 'in');
    assert.equal(by.b.status, 'low');
    assert.equal(by.b.badge, 'Only 3 left');
    assert.equal(by.c.status, 'out');
    assert.equal(by.c.badge, 'Sold out');
    assert.equal(by.d.status, 'in', 'print-on-demand is never sold out');
    assert.equal(by.e.status, 'in', 'backorder keeps selling');
  });

  test('variant stock decides sold out', () => {
    const v = p({ id: 'v', stock: 0, variants: [{ id: 'v_s', name: 'S', stock: 0 }, { id: 'v_m', name: 'M', stock: 0 }], variantStock: { v_s: 0, v_m: 9 } });
    const [row] = priceBoard([v]);
    assert.equal(row.status, 'in');
    assert.equal(row.hasOptions, true);
  });

  test('hides inactive products and sorts by title', () => {
    const rows = priceBoard([p({ id: 'z', title: 'Zest' }), p({ id: 'h', title: 'Hidden', isActive: false }), p({ id: 'a', title: 'Americano' })]);
    assert.deepEqual(rows.map(r => r.id), ['a', 'z']);
  });

  test('productIds keeps the given order and drops unknown ids', () => {
    const rows = priceBoard([p({ id: 'a', title: 'A' }), p({ id: 'b', title: 'B' }), p({ id: 'c', title: 'C' })], { productIds: ['c', 'x', 'a'] });
    assert.deepEqual(rows.map(r => r.id), ['c', 'a']);
  });

  test('category matches category or tag, case-insensitively', () => {
    const rows = priceBoard([
      p({ id: 'a', category: 'APPAREL' }),
      p({ id: 'b', category: 'OTHER', tags: ['Drinks'] }),
      p({ id: 'c', category: 'OTHER' }),
    ], { category: 'drinks' });
    assert.deepEqual(rows.map(r => r.id), ['b']);
    assert.deepEqual(priceBoard([p({ id: 'a', category: 'APPAREL' }), p({ id: 'c' })], { category: 'apparel' }).map(r => r.id), ['a']);
  });

  test('hideSoldOut removes out rows only', () => {
    const rows = priceBoard([p({ id: 'a', title: 'A', stock: 0 }), p({ id: 'b', title: 'B', stock: 2 })], { hideSoldOut: true });
    assert.deepEqual(rows.map(r => r.id), ['b']);
  });

  test('compareAtPrice only when it is higher than price', () => {
    const [a, b] = priceBoard([p({ id: 'a', title: 'A', price: 10, compareAtPrice: 12 }), p({ id: 'b', title: 'B', price: 10, compareAtPrice: 8 })]);
    assert.equal(a.compareAtPrice, 12);
    assert.equal(b.compareAtPrice, undefined);
  });
});

describe('activeDeals', () => {
  const o = (x: Partial<BusinessOffer> & Record<string, any>): BusinessOffer => ({ id: 'o', label: 'Deal', kind: 'PERCENT', value: 10, active: true, ...x } as BusinessOffer);
  test('filters inactive and out-of-window offers', () => {
    const now = 1_000_000;
    const list = activeDeals([
      o({ id: 'a' }),
      o({ id: 'b', active: false }),
      o({ id: 'c', startsAt: now + 1 }),
      o({ id: 'd', endsAt: now }),
      o({ id: 'e', startsAt: now - 10, endsAt: now + 10 }),
    ], now);
    assert.deepEqual(list.map(x => x.id), ['a', 'e']);
  });
  test('tolerates empty input', () => { assert.deepEqual(activeDeals(undefined as any), []); });
});

describe('formatting', () => {
  test('dealHeadline', () => {
    assert.equal(dealHeadline({ id: '1', label: '', kind: 'PERCENT', value: 10, active: true }), '10% off');
    assert.equal(dealHeadline({ id: '2', label: '', kind: 'AMOUNT', value: 5, minSubtotalCents: 4000, active: true }), '$5 off $40+');
    assert.equal(dealHeadline({ id: '3', label: '', kind: 'PERCENT', value: 15, membersOnly: true, active: true }), 'Members: 15% off');
  });
  test('boardPrice drops .00 only', () => {
    assert.equal(boardPrice(5), '$5');
    assert.equal(boardPrice(4.5), '$4.50');
    assert.equal(boardPrice(3.999), '$4');
  });
  test('mapOrderDoc parses JSON items and falls back to sellerId', () => {
    const o = mapOrderDoc('x', { sellerId: 's1', buyerId: 'b1', items: '[{"productId":"p","title":"T","qty":2,"unitAmount":100}]', status: 'CONFIRMED', createdAt: 5 });
    assert.equal(o.businessUid, 's1');
    assert.equal(o.customerUid, 'b1');
    assert.equal(o.items[0].qty, 2);
    assert.equal(mapOrderDoc('y', { items: 'not json' }).items.length, 0);
  });
});

describe('applySaleLocally', () => {
  test('decrements stock and variant stock, flipping the board', () => {
    const before = [p({ id: 'a', title: 'A', stock: 3 }), p({ id: 'v', title: 'V', stock: 4, variants: [{ id: 'v_s', name: 'S', stock: 1 }, { id: 'v_m', name: 'M', stock: 3 }], variantStock: { v_s: 1, v_m: 3 } }), p({ id: 'u', title: 'U' })];
    const after = applySaleLocally(before, [{ productId: 'a', qty: 3 }, { productId: 'v', variantId: 'v_m', qty: 1 }]);
    assert.equal(after[0].stock, 0);
    assert.equal(after[1].variantStock!.v_m, 2);
    assert.equal(after[1].variantStock!.v_s, 1);
    assert.equal(after[2], before[2], 'untouched products keep identity');
    assert.equal(priceBoard(after)[0].status, 'out');
    assert.equal(before[0].stock, 3, 'input not mutated');
  });
  test('never goes below zero', () => {
    assert.equal(applySaleLocally([p({ id: 'a', stock: 1 })], [{ productId: 'a', qty: 5 }])[0].stock, 0);
  });
});
