// storeShopCore — Test Suite. Run with: npm run test:store
// Pins the online-store rules: shop settings, shipping quotes, discount codes, online refunds
// (items + tax + shipping, never more than was paid), emails, CSV safety and the sales report.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseShopSettings, DEFAULT_SHOP_SETTINGS, quoteShipping, returnPolicyText, shippingPolicyText,
  parseShopCode, applyShopCode, normalizeCode, onlineRefundOrder, planOnlineRefund, remainingRefundLines,
  externalRefundEntry, refundableCents, orderEmail, packingSlipHtml, ordersCsv, csvCell, salesReport, parseSizeChart,
} from '../services/storeShopCore';
import { storeOrderFees } from '../services/payments/saleFees';

describe('shop settings', () => {
  test('defaults fill missing fields and junk is dropped', () => {
    const s = parseShopSettings({ shipping: { standardCents: 'abc', countries: ['ca', 'US', 'zz9', 'GB'] }, contactEmail: 'nope' });
    assert.equal(s.shipping.standardCents, DEFAULT_SHOP_SETTINGS.shipping.standardCents);
    assert.deepEqual(s.shipping.countries, ['CA', 'GB']);   // domestic US removed, bad code removed
    assert.equal(s.contactEmail, '');
    assert.equal(s.shipping.international, false);          // not switched on
  });
  test('max processing days never below min; JSON strings parse', () => {
    const s = parseShopSettings(JSON.stringify({ shipping: { processingDaysMin: 5, processingDaysMax: 2 } }));
    assert.equal(s.shipping.processingDaysMax, 5);
  });
  test('international needs at least one country', () => {
    assert.equal(parseShopSettings({ shipping: { international: true, countries: [] } }).shipping.international, false);
  });
  test('policy text says the real terms', () => {
    assert.match(returnPolicyText({ ...DEFAULT_SHOP_SETTINGS.returns, accepts: false }), /final/);
    assert.match(returnPolicyText({ ...DEFAULT_SHOP_SETTINGS.returns, restockingFeePct: 15 }), /15% restocking/);
    assert.match(shippingPolicyText(DEFAULT_SHOP_SETTINGS.shipping), /\$5\.99/);
    assert.match(shippingPolicyText(DEFAULT_SHOP_SETTINGS.shipping), /US only/);
  });
});

describe('shipping quotes', () => {
  const s = parseShopSettings({ shipping: { standardCents: 500, additionalItemCents: 100, freeOverCents: 5000, expressCents: 1500, international: true, countries: ['CA'], internationalCents: 2000, internationalAdditionalCents: 300 } }).shipping;
  test('domestic per-item, free over threshold, express kept', () => {
    const q = quoteShipping(s, { itemCount: 3, subtotalCents: 2000 });
    assert.ok(q.ok); if (!q.ok) return;
    assert.equal(q.options[0].amountCents, 700);
    assert.equal(q.options[1].amountCents, 1700);
    const free = quoteShipping(s, { itemCount: 3, subtotalCents: 5000 });
    assert.ok(free.ok && free.options[0].amountCents === 0);
  });
  test('international only to listed countries, never auto-free', () => {
    const ca = quoteShipping(s, { itemCount: 2, subtotalCents: 9000, toCountry: 'ca' });
    assert.ok(ca.ok && ca.options[0].amountCents === 2300 && ca.country === 'CA');
    const de = quoteShipping(s, { itemCount: 1, subtotalCents: 100, toCountry: 'DE' });
    assert.equal(de.ok, false);
  });
  test('free-shipping code zeroes standard', () => {
    const q = quoteShipping(s, { itemCount: 1, subtotalCents: 100, freeShipping: true });
    assert.ok(q.ok && q.options[0].amountCents === 0);
  });
});

describe('discount codes', () => {
  const now = 1_000_000;
  test('validation', () => {
    assert.equal(parseShopCode({ code: 'a' }, now).ok, false);
    assert.equal(parseShopCode({ code: 'SAVE10', kind: 'PCT', value: 0 }, now).ok, false);
    assert.equal(parseShopCode({ code: 'OLD', kind: 'PCT', value: 10, expiresAt: now - 1 }, now).ok, false);
    const c = parseShopCode({ code: ' save 10! ', kind: 'PCT', value: 10 }, now);
    assert.ok(c.ok && c.code.code === 'SAVE10');
    assert.equal(normalizeCode('fall-25'), 'FALL-25');
  });
  test('apply: percent, amount capped, min, uses, expiry, inactive', () => {
    assert.deepEqual(applyShopCode({ code: 'P', kind: 'PCT', value: 10 }, 2599, now), { ok: true, discountCents: 260, freeShipping: false, code: 'P' });
    const amt = applyShopCode({ code: 'A', kind: 'AMOUNT', value: 5000 }, 1200, now);
    assert.ok(amt.ok && amt.discountCents === 1200);
    assert.equal(applyShopCode({ code: 'M', kind: 'PCT', value: 10, minSubtotalCents: 3000 }, 2000, now).ok, false);
    assert.equal(applyShopCode({ code: 'U', kind: 'PCT', value: 10, maxUses: 5, uses: 5 }, 2000, now).ok, false);
    assert.equal(applyShopCode({ code: 'E', kind: 'PCT', value: 10, expiresAt: now }, 2000, now).ok, false);
    assert.equal(applyShopCode({ code: 'I', kind: 'PCT', value: 10, active: false }, 2000, now).ok, false);
    const fs = applyShopCode({ code: 'F', kind: 'FREE_SHIP' }, 2000, now);
    assert.ok(fs.ok && fs.freeShipping && fs.discountCents === 0);
  });
});

describe('online refunds', () => {
  // 2 shirts @ $20 with $1.60 tax each, 1 mug $10 + $0.80 tax, shipping $5.99 untaxed. Paid $57.99.
  const order = {
    items: JSON.stringify([
      { productId: 'shirt', title: 'Shirt', qty: 2, unitAmount: 2000, chargeCents: 4320, taxCents: 320 },
      { productId: 'mug', title: 'Mug', qty: 1, unitAmount: 1000, chargeCents: 1080, taxCents: 80 },
    ]),
    shippingCents: 599, taxCents: 400, totalCents: 5999,
  };
  test('adapter adds a shipping line and one card tender', () => {
    const o = onlineRefundOrder(order);
    assert.equal(o.lines.length, 3);
    assert.equal(o.shippingIndex, 2);
    assert.equal(o.tenders[0].amountCents, 5999);
  });
  test('one shirt refunds its share with tax', () => {
    const p = planOnlineRefund(order, [{ index: 0, qty: 1, restock: true }]);
    assert.ok(p.ok); if (!p.ok) return;
    assert.equal(p.plan.amountCents, 2160);
    assert.equal(p.plan.taxCents, 160);
    assert.equal(p.plan.restock[0].productId, 'shirt');
  });
  test('everything adds up to exactly what was paid, and no more', () => {
    const all = remainingRefundLines(order);
    const p = planOnlineRefund(order, all);
    assert.ok(p.ok && p.plan.amountCents === 5999);
    assert.ok(all.every(l => l.index === 2 ? !l.restock : l.restock));
    const after = { ...order, refundLog: JSON.stringify([{ id: 'r1', ...(p.ok ? p.plan : {}), at: 1 }]), refundedCents: 5999 };
    assert.equal(planOnlineRefund(after, [{ index: 1, qty: 1 }]).ok, false);
    assert.equal(remainingRefundLines(after).length, 0);
    assert.equal(refundableCents(after), 0);
  });
  test('legacy orders without per-line tax get the order tax spread', () => {
    const legacy = { items: JSON.stringify([{ productId: 'a', title: 'A', qty: 1, unitAmount: 1000 }, { productId: 'b', title: 'B', qty: 1, unitAmount: 3000 }]), taxCents: 320, totalCents: 4320 };
    const o = onlineRefundOrder(legacy);
    assert.equal(o.lines[0].taxCents + o.lines[1].taxCents, 320);
    const p = planOnlineRefund(legacy, remainingRefundLines(legacy));
    assert.ok(p.ok && p.plan.amountCents === 4320);
  });
  test('external refunds only add what Plajah has not recorded', () => {
    assert.equal(externalRefundEntry({ refundedCents: 1000 }, 1000, 'x', 1), null);
    assert.equal(externalRefundEntry({ refundedCents: 1000 }, 1500, 'x', 1)?.amountCents, 500);
  });
});

describe('emails, slips, CSV, report', () => {
  test('emails escape HTML and carry the right facts', () => {
    const e = orderEmail('CONFIRMED', { shopName: 'Shop <b>', orderId: 'so_123_abcdef12', lines: [{ title: '<script>', qty: 1, amountCents: 500 }], totalCents: 500, returnPolicy: 'Returns ok.', contactEmail: 'a@b.co' });
    assert.ok(!e.html.includes('<script>'));
    assert.match(e.subject, /#ABCDEF12/);
    assert.match(e.text, /Returns: Returns ok\./);
    const r = orderEmail('REFUNDED', { shopName: 'S', orderId: 'so_1_x', lines: [], refundCents: 1234 });
    assert.match(r.text, /\$12\.34/);
  });
  test('packing slip escapes and lists items', () => {
    const h = packingSlipHtml({ id: 'so_1_a', createdAt: 0, items: [{ title: 'Tee & Cap', qty: 2 }] }, { name: 'S' });
    assert.match(h, /Tee &amp; Cap/);
  });
  test('CSV defuses formulas and quotes commas', () => {
    assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
    assert.equal(csvCell('a,b'), '"a,b"');
    const csv = ordersCsv([
      { id: 'o1', status: 'CONFIRMED', createdAt: Date.UTC(2026, 0, 2), items: [{ title: 'Tee', qty: 2 }], subtotalCents: 4000, totalCents: 4599, refundedCents: 599 },
      { id: 'o2', status: 'PENDING_PAYMENT', createdAt: 0, items: [], subtotalCents: 1 },
    ]);
    assert.equal(csv.split('\r\n').length, 2);
    assert.match(csv, /2026-01-02,o1,CONFIRMED,Online/);
    assert.match(csv, /45\.99,5\.99,40\.00/);
  });
  test('sales report totals paid orders in range', () => {
    const r = salesReport([
      { id: 'a', status: 'DELIVERED', createdAt: 10, items: [{ productId: 'p', title: 'P', qty: 2, unitAmount: 1000 }], subtotalCents: 2000, taxCents: 160, shippingCents: 599, totalCents: 2759, refundedCents: 0 },
      { id: 'b', status: 'REFUNDED', createdAt: 20, items: [{ productId: 'p', title: 'P', qty: 1, unitAmount: 1000 }], subtotalCents: 1000, totalCents: 1000, refundedCents: 1000 },
      { id: 'c', status: 'CONFIRMED', createdAt: 999, items: [], subtotalCents: 5, totalCents: 5 },
      { id: 'd', status: 'PENDING_PAYMENT', createdAt: 15, items: [], subtotalCents: 5, totalCents: 5 },
    ], 0, 100);
    assert.equal(r.orders, 2);
    assert.equal(r.grossCents, 3759);
    assert.equal(r.netCents, 2759);
    assert.equal(r.taxCents, 160);
    assert.equal(r.byProduct[0].units, 3);
  });
  test('size chart cleans and caps', () => {
    assert.equal(parseSizeChart({ columns: [], rows: [] }), null);
    const c = parseSizeChart({ unit: 'cm', columns: ['Chest', 'Length'], rows: [{ size: 'S', values: ['90', '70', 'extra'] }, { size: '', values: [] }] });
    assert.deepEqual(c, { unit: 'cm', columns: ['Chest', 'Length'], rows: [{ size: 'S', values: ['90', '70'] }] });
  });
});

describe('store order fees', () => {
  test('5% on merchandise + shipping, never on tax; Plajah+ pays 0%', () => {
    const f = storeOrderFees({ merchandiseCents: 4000, shippingCents: 599, totalCents: 4919 }, false);
    assert.equal(f.platformFeeCents, 230);
    assert.equal(f.processingCents, Math.ceil(4919 * 0.029) + 30);
    assert.equal(f.applicationFeeCents, f.platformFeeCents + f.processingCents);
    assert.equal(storeOrderFees({ merchandiseCents: 4000, shippingCents: 0, totalCents: 4000 }, true).platformFeeCents, 0);
  });
});

import { shipFromReady, parcelWeightOz, shippoShipment, shippoRates, printerVariantId, printfulOrderBody, printfulTracking, sellerDisputeShare } from '../services/storeShopCore';

describe('labels, printing, chargebacks', () => {
  test('ship-from and parcel settings parse with defaults', () => {
    const s = parseShopSettings({ shipFrom: { name: 'Shop', street1: '1 Main', city: 'Detroit', zip: '48201' }, parcel: { lengthIn: 0 } });
    assert.equal(s.shipFrom.country, 'US');
    assert.equal(shipFromReady(s.shipFrom), false);          // US needs a state
    assert.equal(shipFromReady({ ...s.shipFrom, state: 'MI' }), true);
    assert.equal(s.parcel.lengthIn, 1);                      // clamped, not zero
  });
  test('label weight adds items to the box', () => {
    const p = DEFAULT_SHOP_SETTINGS.parcel;
    assert.equal(parcelWeightOz(p, [{ qty: 2, weightGrams: 283.495 }]), 23);   // 20 oz + 3 oz box
    assert.equal(parcelWeightOz(p, [{ qty: 1 }]), 11);                         // default 8 oz + 3
  });
  test('shipment body and rates', () => {
    const b = shippoShipment({ ...DEFAULT_SHOP_SETTINGS.shipFrom, name: 'S', street1: '1', city: 'D', state: 'MI', zip: '1' }, { name: 'B', line1: '2', city: 'C', state: 'OH', postal: '2', country: 'US' }, DEFAULT_SHOP_SETTINGS.parcel, 12, 'so_1_abc');
    assert.equal(b.parcels[0].weight, '12');
    assert.equal(b.address_to.street1, '2');
    const r = shippoRates({ rates: [{ object_id: 'b', provider: 'UPS', servicelevel: { name: 'Ground' }, amount: '9.10', currency: 'USD', estimated_days: 3 }, { object_id: 'a', provider: 'USPS', servicelevel: { name: 'Ground Advantage' }, amount: '5.20', currency: 'USD' }, { object_id: '', amount: '1' }] });
    assert.deepEqual(r.map(x => x.id), ['a', 'b']);
    assert.equal(r[0].days, null);
  });
  test('printer ids and Printful order', () => {
    const p = { variants: [{ id: 'v1', externalId: '555' }, { id: 'v2' }], fulfillmentExternalId: 'base-x' };
    assert.equal(printerVariantId(p, 'v1'), '555');
    assert.equal(printerVariantId(p, 'v2'), 'base-x');
    const body = printfulOrderBody('so_123_abc', { name: 'B', line1: '1', city: 'C', state: 'MI', postal: '1', country: 'US' }, [{ printerId: '555', qty: 2, retailCents: 2500 }, { printerId: 'my-sku', qty: 1 }]);
    assert.deepEqual(body.items[0], { sync_variant_id: 555, quantity: 2, retail_price: '25.00' });
    assert.deepEqual(body.items[1], { external_variant_id: 'my-sku', quantity: 1 });
    assert.equal(body.external_id, 'so_123_abc');
    assert.deepEqual(printfulTracking({ shipments: [{ carrier: 'USPS', tracking_number: '9400', tracking_url: 'u' }] }), { carrier: 'USPS', number: '9400', url: 'u' });
    assert.equal(printfulTracking({ shipments: [] }), null);
  });
  test('seller dispute share is pro rata plus the fee, capped', () => {
    assert.equal(sellerDisputeShare({ disputeCents: 10000, chargeCents: 10000, applicationFeeCents: 800, disputeFeeCents: 1500 }), 9200);   // capped at what they got
    assert.equal(sellerDisputeShare({ disputeCents: 5000, chargeCents: 10000, applicationFeeCents: 800, disputeFeeCents: 1500 }), 6100);
    assert.equal(sellerDisputeShare({ disputeCents: 100, chargeCents: 0, applicationFeeCents: 0 }), 0);
  });
});
