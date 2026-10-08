// inventoryCore — Test Suite
// Run with: npm run test:inventory
//
// These pin the rules that stop a small shop from overselling: variant-aware stock, untracked
// (print-on-demand/digital) products, server-side line pricing, and the CSV importers that let a
// seller move from Shopify/Square/Etsy without retyping a catalog.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  isTracked, totalStock, availableFor, stockStatus, storefrontBadge, resolveLine, planDecrement,
  variantStockSeed, unitPriceCents, buildVariantMatrix, suggestSku, inventoryTotals, saleLinesFromOrder,
  summarizeSales, restockPlan, parseCsv, detectCsvFormat, rowsToDrafts, variantIdFor, marginPct, trackingUrl,
} from '../services/inventoryCore';
import type { StoreProduct } from '../types';

const base = (o: Partial<StoreProduct> = {}): StoreProduct => ({
  id: 'p1', sellerId: 's1', sellerName: 'Shop', title: 'Logo Tee', description: '', category: 'APPAREL',
  price: 28, images: [], stock: 10, isDigital: false, isActive: true, createdAt: 0, updatedAt: 0, ...o,
});
const withVariants = (o: Partial<StoreProduct> = {}) => base({
  stock: 7,
  variants: [
    { id: 'v_s', name: 'S', stock: 3 },
    { id: 'v_m', name: 'M', stock: 4, priceModifier: 2 },
    { id: 'v_l', name: 'L', stock: 0 },
  ],
  ...o,
});

describe('tracking', () => {
  test('print-on-demand, digital and external products are untracked', () => {
    assert.equal(isTracked(base()), true);
    assert.equal(isTracked(base({ fulfillmentSource: 'printful' })), false);
    assert.equal(isTracked(base({ isDigital: true })), false);
    assert.equal(isTracked(base({ fulfillmentSource: 'external' })), false);
  });
  test('explicit trackInventory beats the derived default', () => {
    assert.equal(isTracked(base({ fulfillmentSource: 'printful', trackInventory: true })), true);
    assert.equal(isTracked(base({ trackInventory: false })), false);
  });
  test('untracked is always sellable and never "out"', () => {
    const pod = base({ fulfillmentSource: 'printful', stock: 0 });
    assert.equal(availableFor(pod), Infinity);
    assert.equal(stockStatus(pod), 'UNTRACKED');
    assert.equal(storefrontBadge(pod).label, null);
  });
});

describe('stock', () => {
  test('live variantStock overrides the variants[] snapshot', () => {
    const p = withVariants({ variantStock: { v_s: 1, v_m: 9, v_l: 0 } });
    assert.equal(totalStock(p), 10);
    assert.equal(availableFor(p, 'v_s'), 1);
  });
  test('falls back to variants[].stock when the live map is absent', () => {
    assert.equal(totalStock(withVariants()), 7);
    assert.equal(availableFor(withVariants(), 'v_m'), 4);
  });
  test('unknown variant has zero availability', () => assert.equal(availableFor(withVariants(), 'nope'), 0));
  test('status: OUT / LOW / OK, and a gone size flags LOW even when total is healthy', () => {
    assert.equal(stockStatus(base({ stock: 0 })), 'OUT');
    assert.equal(stockStatus(base({ stock: 5 })), 'LOW');
    assert.equal(stockStatus(base({ stock: 50 })), 'OK');
    const sizeGone = base({ stock: 50, variants: [{ id: 'v_a', name: 'A', stock: 50 }, { id: 'v_b', name: 'B', stock: 0 }], lowStockThreshold: 0 });
    assert.equal(stockStatus(sizeGone), 'LOW');
  });
  test('backorder keeps selling at zero', () => {
    const p = base({ stock: 0, allowBackorder: true });
    assert.equal(availableFor(p), Infinity);
    assert.equal(resolveLine(p, { productId: 'p1', qty: 3 }).ok, true);
  });
  test('storefront badge is honest scarcity', () => {
    assert.deepEqual(storefrontBadge(base({ stock: 0 })), { soldOut: true, label: 'Sold out' });
    assert.equal(storefrontBadge(base({ stock: 3 })).label, 'Only 3 left');
    assert.equal(storefrontBadge(base({ stock: 40 })).label, null);
    assert.equal(storefrontBadge(withVariants(), 'v_l').soldOut, true);
  });
});

describe('resolveLine (the server-side sell decision)', () => {
  test('prices from the stored product + variant modifier, in cents', () => {
    const r = resolveLine(withVariants(), { productId: 'p1', variantId: 'v_m', qty: 2 });
    assert.ok(r.ok === true && r.line.unitAmount === 3000 && r.line.qty === 2 && r.line.variantName === 'M');
    assert.equal(unitPriceCents(withVariants(), 'v_m'), 3000);
  });
  test('refuses to oversell a variant and says how many are left', () => {
    const r = resolveLine(withVariants(), { productId: 'p1', variantId: 'v_s', qty: 5 });
    assert.ok(r.ok === false && r.code === 'INSUFFICIENT' && r.available === 3);
  });
  test('sold-out variant', () => {
    const r = resolveLine(withVariants(), { productId: 'p1', variantId: 'v_l', qty: 1 });
    assert.ok(r.ok === false && r.code === 'SOLD_OUT');
  });
  test('a product with variants requires a variant choice', () => {
    const r = resolveLine(withVariants(), { productId: 'p1', qty: 1 });
    assert.ok(r.ok === false && r.code === 'NEED_VARIANT');
  });
  test('hidden products, other sellers and $0 prices are rejected', () => {
    assert.ok(!resolveLine(base({ isActive: false }), { productId: 'p1', qty: 1 }).ok);
    assert.equal((resolveLine(base(), { productId: 'p1', qty: 1 }, { sellerId: 'other' }) as any).code, 'WRONG_SELLER');
    assert.equal((resolveLine(base({ price: 0 }), { productId: 'p1', qty: 1 }) as any).code, 'BAD_PRICE');
    assert.equal((resolveLine(null, { productId: 'zz', qty: 1 }) as any).code, 'NOT_FOUND');
  });
  test('POS may sell hidden items when allowed', () => {
    assert.ok(resolveLine(base({ isActive: false }), { productId: 'p1', qty: 1 }, { allowInactive: true }).ok);
  });
  test('the register (ignoreStock) sells through a wrong count instead of blocking the line', () => {
    const r = resolveLine(base({ stock: 0 }), { productId: 'p1', qty: 2 }, { ignoreStock: true });
    assert.ok(r.ok === true && r.line.qty === 2);
    assert.ok(!resolveLine(base({ stock: 0 }), { productId: 'p1', qty: 2 }).ok);
  });
  test('qty is clamped to 1..99', () => {
    const r = resolveLine(base({ stock: 500 }), { productId: 'p1', qty: 9999 });
    assert.ok(r.ok === true && r.line.qty === 99);
  });
});

describe('planDecrement / seed', () => {
  test('tracked product decrements total + the variant map entry and bumps soldCount', () => {
    assert.deepEqual(planDecrement(withVariants(), 'v_s', 2), { soldCount: 2, stock: -2, 'variantStock.v_s': -2 });
  });
  test('untracked product only counts the sale', () => {
    assert.deepEqual(planDecrement(base({ fulfillmentSource: 'printful' }), undefined, 3), { soldCount: 3 });
  });
  test('seeds variantStock for pre-existing products (and only when needed)', () => {
    assert.deepEqual(variantStockSeed(withVariants()), { v_s: 3, v_m: 4, v_l: 0 });
    assert.equal(variantStockSeed(withVariants({ variantStock: { v_s: 3, v_m: 4, v_l: 0 } })), null);
    assert.equal(variantStockSeed(base()), null);
  });
  test('unsafe variant ids are never used as field paths', () => {
    const p = base({ variants: [{ id: 'bad.id', name: 'X', stock: 2 }] });
    assert.deepEqual(planDecrement(p, 'bad.id', 1), { soldCount: 1, stock: -1 });
  });
});

describe('variant matrix + SKUs', () => {
  test('sizes × colors, SKUs auto-assigned and unique', () => {
    const vs = buildVariantMatrix({ title: 'Logo Hoodie', sizes: ['S', 'M'], colors: ['Black', 'Navy'] });
    assert.deepEqual(vs.map(v => v.name), ['S / Black', 'S / Navy', 'M / Black', 'M / Navy']);
    assert.equal(new Set(vs.map(v => v.sku)).size, 4);
    assert.ok(vs.every(v => /^[A-Za-z_][A-Za-z0-9_]*$/.test(v.id)));
  });
  test('regenerating keeps existing counts and ids', () => {
    const first = buildVariantMatrix({ title: 'Tee', sizes: ['S', 'M'], colors: [] }).map(v => ({ ...v, stock: 9 }));
    const next = buildVariantMatrix({ title: 'Tee', sizes: ['S', 'M', 'L'], colors: [], existing: first });
    assert.equal(next.length, 3);
    assert.equal(next[0].stock, 9);
    assert.equal(next[2].stock, 0);
    assert.equal(next[0].id, first[0].id);
  });
  test('removing an option drops it', () => {
    const first = buildVariantMatrix({ title: 'Tee', sizes: ['S', 'M'], colors: [] });
    assert.equal(buildVariantMatrix({ title: 'Tee', sizes: ['S'], colors: [], existing: first }).length, 1);
  });
  test('variant ids are deterministic', () => assert.equal(variantIdFor('Large / Black'), variantIdFor('large / black')));
  test('suggestSku avoids collisions', () => {
    const taken = new Set(['TEE-LG']);
    assert.notEqual(suggestSku('Tee', 'LG', taken), 'TEE-LG');
  });
});

describe('totals + margin', () => {
  test('inventory value and alert counts skip untracked items', () => {
    const t = inventoryTotals([
      base({ stock: 10, price: 20, costPrice: 8 }), base({ id: 'b', stock: 0 }), base({ id: 'c', stock: 3 }),
      base({ id: 'd', fulfillmentSource: 'printful', stock: 0 }),
    ]);
    assert.equal(t.units, 13); assert.equal(t.out, 1); assert.equal(t.low, 1); assert.equal(t.untracked, 1);
    assert.equal(t.retailValue, 10 * 20 + 3 * 28); assert.equal(t.costValue, 80);
  });
  test('margin', () => { assert.equal(marginPct(20, 8), 60); assert.equal(marginPct(20, 0), null); });
});

describe('sales velocity + restock plan', () => {
  const now = Date.UTC(2026, 9, 1);
  const day = 86_400_000;
  const spine = (items: any[], at: number, status = 'CONFIRMED') => ({ status, createdAt: at, items: JSON.stringify(items) });
  test('reads BOTH order shapes and ignores unpaid/cancelled orders', () => {
    const lines = [
      ...saleLinesFromOrder(spine([{ productId: 'p1', qty: 2, unitAmount: 2800 }], now - day)),
      ...saleLinesFromOrder({ status: 'DELIVERED', createdAt: now - day, items: [{ productId: 'p1', quantity: 1, price: 28 }] }),
      ...saleLinesFromOrder(spine([{ productId: 'p1', qty: 9, unitAmount: 2800 }], now, 'PENDING_PAYMENT')),
      ...saleLinesFromOrder(spine([{ productId: 'p1', qty: 9, unitAmount: 2800 }], now, 'CANCELLED')),
    ];
    const s = summarizeSales(lines, 30, now);
    assert.equal(s.units, 3); assert.equal(s.revenueCents, 8400);
  });
  test('old sales fall outside the window', () => {
    const s = summarizeSales(saleLinesFromOrder(spine([{ productId: 'p1', qty: 5, unitAmount: 100 }], now - 60 * day)), 30, now);
    assert.equal(s.units, 0);
  });
  test('restock plan: out first, then runs-out-before-resupply, with a sensible suggestion', () => {
    const lines = saleLinesFromOrder(spine([{ productId: 'fast', qty: 30, unitAmount: 1000 }], now - day));
    const sales = summarizeSales(lines, 30, now);                  // fast sells 1/day
    const plan = restockPlan([
      base({ id: 'ok', stock: 100 }),
      base({ id: 'fast', stock: 10 }),                              // 10 days cover < 14-day lead → SOON
      base({ id: 'gone', stock: 0 }),
      base({ id: 'pod', fulfillmentSource: 'printful', stock: 0 }),
    ], sales);
    assert.deepEqual(plan.map(r => r.product.id), ['gone', 'fast']);
    assert.equal(plan[1].urgency, 'SOON');
    assert.equal(plan[1].suggest, Math.ceil(1 * 44 - 10));
  });
  test('per-variant restock names the size', () => {
    const lines = saleLinesFromOrder(spine([{ productId: 'p1', variantId: 'v_s', qty: 15, unitAmount: 2800 }], now - day));
    const plan = restockPlan([withVariants()], summarizeSales(lines, 30, now));
    assert.ok(plan.some(r => r.variant?.id === 'v_s'));
  });
});

describe('CSV import', () => {
  test('parseCsv handles quotes, escaped quotes, CRLF and embedded newlines', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n"line1\nline2",z\r\n');
    assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['line1\nline2', 'z']]);
  });
  test('generic CSV with friendly headers', () => {
    const { format, drafts, warnings } = rowsToDrafts(parseCsv('Name,Price,Qty,Image\nSticker Pack,$8.00,120,https://x.co/a.jpg\nMug,14,30,'));
    assert.equal(format, 'generic');
    assert.equal(drafts.length, 2);
    assert.deepEqual([drafts[0].title, drafts[0].price, drafts[0].stock], ['Sticker Pack', 8, 120]);
    assert.deepEqual(drafts[0].images, ['https://x.co/a.jpg']);
    assert.equal(warnings.length, 0);
  });
  test('Shopify export: groups variant rows, base price + modifiers, image-only rows, drafts', () => {
    const csv = [
      'Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Inventory Qty,Variant Price,Image Src,Cost per item',
      'logo-hoodie,Logo Hoodie,<p>Warm &amp; soft</p>,Shop,Hoodie,"merch, winter",true,Size,S,HOOD-S,5,50.00,https://x.co/h1.jpg,20',
      'logo-hoodie,,,,,,,,M,HOOD-M,7,50.00,,',
      'logo-hoodie,,,,,,,,XL,HOOD-XL,2,54.00,https://x.co/h2.jpg,',
      'sticker,Sticker,,Shop,Sticker,,false,Title,Default Title,STK,100,4.00,https://x.co/s.jpg,',
    ].join('\n');
    const { format, drafts } = rowsToDrafts(parseCsv(csv));
    assert.equal(format, 'shopify');
    assert.equal(drafts.length, 2);
    const h = drafts[0];
    assert.equal(h.title, 'Logo Hoodie'); assert.equal(h.description, 'Warm & soft');
    assert.equal(h.price, 50); assert.equal(h.stock, 14); assert.equal(h.category, 'APPAREL'); assert.equal(h.costPrice, 20);
    assert.deepEqual(h.variants!.map(v => [v.name, v.stock, v.priceModifier]), [['S', 5, undefined], ['M', 7, undefined], ['XL', 2, 4]]);
    assert.deepEqual(h.images, ['https://x.co/h1.jpg', 'https://x.co/h2.jpg']);
    assert.equal(h.tags.length, 2);
    const s = drafts[1];
    assert.equal(s.variants, undefined); assert.equal(s.stock, 100); assert.equal(s.sku, 'STK'); assert.equal(s.isActive, false);
  });
  test('Square export: variations become variants, quantity column found by prefix', () => {
    const csv = 'Token,Item Name,Variation Name,SKU,Description,Categories,Price,Current Quantity Main St\n'
      + 't1,Candle,Small,C-S,Soy wax,Home,12,10\nt2,Candle,Large,C-L,Soy wax,Home,18,4\nt3,Mug,Regular,M,,Home,14,9';
    const { format, drafts } = rowsToDrafts(parseCsv(csv));
    assert.equal(format, 'square');
    const c = drafts.find(d => d.title === 'Candle')!;
    assert.deepEqual(c.variants!.map(v => [v.name, v.stock, v.priceModifier]), [['Small', 10, undefined], ['Large', 4, 6]]);
    assert.equal(c.price, 12); assert.equal(c.stock, 14);
    const m = drafts.find(d => d.title === 'Mug')!;
    assert.equal(m.variants, undefined); assert.equal(m.stock, 9);
  });
  test('Etsy export detected', () => {
    const f = detectCsvFormat(['TITLE', 'DESCRIPTION', 'PRICE', 'CURRENCY_CODE', 'QUANTITY', 'TAGS', 'IMAGE1']);
    assert.equal(f, 'etsy');
  });
  test('a $0 / unpriced item is never auto-published and is warned about', () => {
    const { drafts, warnings } = rowsToDrafts(parseCsv('title,price\nFree thing,\nReal thing,5'));
    assert.equal(drafts[0].isActive, false); assert.equal(drafts[1].isActive, true);
    assert.ok(warnings.some(w => w.includes('Free thing')));
  });
  test('missing title column is explained, not silent', () => {
    const { drafts, warnings } = rowsToDrafts(parseCsv('foo,bar\n1,2'));
    assert.equal(drafts.length, 0); assert.ok(warnings.some(w => /title/i.test(w)));
  });
});

describe('shipping', () => {
  test('tracking links for the common carriers, null when we cannot build one', () => {
    assert.match(trackingUrl('USPS', '9400 1000')!, /tools\.usps\.com.*9400%201000/);
    assert.match(trackingUrl('ups', '1Z999')!, /ups\.com\/track\?tracknum=1Z999/);
    assert.match(trackingUrl('FedEx', '123')!, /fedex\.com/);
    assert.equal(trackingUrl('Other', '123'), null);
    assert.equal(trackingUrl('USPS', '   '), null);
    assert.equal(trackingUrl(undefined, undefined), null);
  });
});
