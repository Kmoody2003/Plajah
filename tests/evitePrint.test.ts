// Printed Evites — layout math, at-cost pricing, JPEG checks, and the server flow (quote / upload / checkout / webhook)
// against in-memory Firestore, a fake Stripe and a fake printer. No real provider or Stripe calls.
// Run: npx tsx --test tests/evitePrint.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PRINT_MARGIN_PCT, PRINT_PRODUCTS, printLayout, printProduct, printPaper, quotePrint, cleanAddress, checkPrintOrder, coverRect,
  jpegSize, setJpegDpi, checkPrintFile, gelatoProductUid, type Rect,
} from '../services/evite/evitePrintCore';
import { registerEvitePrintRoutes, fulfillEvitePrint, type GelatoAdapter } from '../services/evite/evitePrintServer';
import { grossUpCents } from '../services/giftFees';
import { cleanFields } from '../services/evite/eviteCore';
import { DEFAULT_SETTINGS, DEFAULT_GIFTS, type EviteDoc } from '../services/evite/eviteTypes';

const P5x7 = printProduct('card_5x7')!, P4x6 = printProduct('card_4x6')!, PA6 = printProduct('card_a6')!;
const inside = (a: Rect, b: Rect) => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;

/** Smallest JPEG-shaped bytes the parser accepts: SOI, JFIF APP0, SOF0 with the size, EOI. */
function fakeJpeg(w: number, h: number): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 0xff, h & 0xff, (w >> 8) & 0xff, w & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9]);
}

describe('print layout', () => {
  test('5×7 at 300 dpi: 1/8 in bleed each side, safe box 1/8 in inside the trim', () => {
    const L = printLayout(P5x7);
    assert.equal(L.dpi, 300);
    assert.deepEqual([L.widthPx, L.heightPx], [1575, 2175]);          // (5 + 0.25) × 300, (7 + 0.25) × 300
    assert.equal(L.bleedPx, 37.5);
    assert.deepEqual(L.trim, { x: 37.5, y: 37.5, w: 1500, h: 2100 });  // exactly 5 × 7 in
    assert.deepEqual(L.safe, { x: 75, y: 75, w: 1425, h: 2025 });
  });
  test('4×6 and A6 sizes', () => {
    assert.deepEqual([printLayout(P4x6).widthPx, printLayout(P4x6).heightPx], [1275, 1875]);
    const a6 = printLayout(PA6);
    assert.deepEqual([a6.widthPx, a6.heightPx], [1315, 1823]);         // 105 × 148 mm + bleed
    assert.ok(Math.abs(a6.trim.w - (105 / 25.4) * 300) < 1e-6);
  });
  test('text and QR stay inside the safe box and never overlap', () => {
    for (const p of PRINT_PRODUCTS) {
      const L = printLayout(p);
      assert.ok(inside(L.safe, L.trim) && inside(L.trim, L.bleed), p.id);
      assert.ok(inside(L.text, L.safe), `${p.id} text in safe`);
      assert.ok(inside(L.qr, L.safe), `${p.id} qr in safe`);
      assert.ok(L.text.y + L.text.h < L.qr.y, `${p.id} text above qr`);
      assert.equal(L.qr.w, 210);                                         // 0.7 in at 300 dpi
      assert.ok(L.text.h > 500, `${p.id} has room for text`);
      assert.equal(L.scrim.y + L.scrim.h, L.heightPx);
    }
  });
  test('preview scale shrinks everything proportionally', () => {
    const S = printLayout(P5x7, { scale: 0.5 });
    assert.equal(S.dpi, 150);
    assert.deepEqual([S.widthPx, S.heightPx], [788, 1088]);
    assert.ok(Math.abs(S.safe.w - 1425 / 2) <= 1, 'within the rounding of the file edge');
  });
  test('plate covers the bleed box with no gaps (812×1224 plate)', () => {
    const L = printLayout(P5x7);
    const c = coverRect(812, 1224, L.bleed);
    assert.ok(c.x <= 0 && c.y <= 0 && c.x + c.w >= L.widthPx - 1e-9 && c.y + c.h >= L.heightPx - 1e-9);
    assert.ok(c.scale > 1.9 && c.scale < 2);                            // upscaled ~1.94× for 5×7
  });
});

describe('at-cost pricing', () => {
  test('the margin constant is zero until the owner decides', () => assert.equal(PRINT_MARGIN_PCT, 0));
  test('total = provider + shipping + Stripe fee grossed up, so Plajah nets exactly zero', () => {
    const r = quotePrint({ product: 'card_5x7', paper: 'silk', qty: 25, providerUnitCents: 120, shippingCents: 599 });
    assert.equal(r.ok, true);
    const q = (r as any).value;
    assert.equal(q.itemsCents, 3000); assert.equal(q.shippingCents, 599); assert.equal(q.marginCents, 0);
    const g = grossUpCents(3599);
    assert.equal(q.totalCents, g.grossCents); assert.equal(q.processingCents, g.feeCents);
    assert.equal(q.totalCents - q.processingCents, 3599);
    const stripeTakes = Math.round(q.totalCents * 0.029 + 30);
    assert.ok(q.totalCents - stripeTakes >= 3599 && q.totalCents - stripeTakes <= 3600, 'after Stripe, Plajah has the provider cost and no more than a cent over');
    assert.equal(q.perCardCents, Math.ceil(q.totalCents / 25));
  });
  test('provider line total wins over unit price; fee overrides apply; margin only when set', () => {
    const a = (quotePrint({ product: 'card_4x6', paper: 'matte', qty: 10, providerUnitCents: 999, providerItemsCents: 1234, shippingCents: 0, fee: { rate: 0, fixedCents: 0 } }) as any).value;
    assert.deepEqual([a.itemsCents, a.processingCents, a.totalCents], [1234, 0, 1234]);
    const m = (quotePrint({ product: 'card_4x6', paper: 'matte', qty: 10, providerItemsCents: 1000, shippingCents: 0, fee: { rate: 0, fixedCents: 0 }, marginPct: 10 }) as any).value;
    assert.equal(m.marginCents, 100); assert.equal(m.totalCents, 1100);
  });
  test('rejects bad inputs in plain words', () => {
    assert.match((quotePrint({ product: 'card_5x7', paper: 'silk', qty: 7, providerUnitCents: 100, shippingCents: 0 }) as any).error, /quantity/);
    assert.match((quotePrint({ product: 'poster' as any, paper: 'silk', qty: 10, providerUnitCents: 100, shippingCents: 0 }) as any).error, /size/);
    assert.match((quotePrint({ product: 'card_5x7', paper: 'silk', qty: 10, shippingCents: 0 }) as any).error, /price/);
  });
});

describe('address, order, files', () => {
  const good = { name: 'Dana Moss', line1: '12 Elm St', city: 'Atlanta', state: 'GA', postalCode: '30301', country: 'us' };
  test('address is cleaned and checked; no undefined keys survive (Firestore rejects them)', () => {
    const a = cleanAddress(good) as any;
    assert.equal(a.ok, true); assert.equal(a.value.country, 'US');
    assert.ok(!Object.values(a.value).includes(undefined));
    assert.match((cleanAddress({ ...good, state: '' }) as any).error, /state/);
    assert.match((cleanAddress({ ...good, postalCode: '3030' }) as any).error, /ZIP/);
    assert.match((cleanAddress({ ...good, country: 'KP' }) as any).error, /country/);
    assert.equal(cleanAddress({ ...good, country: 'GB', state: '', postalCode: 'sw1a 1aa' }).ok, true);
  });
  test('order needs a real product, paper and tier', () => {
    assert.equal(checkPrintOrder({ product: 'card_5x7', paper: 'silk', qty: 25, address: good }).ok, true);
    assert.equal(checkPrintOrder({ product: 'card_5x7', paper: 'gold', qty: 25, address: good }).ok, false);
    assert.equal(checkPrintOrder({ product: 'card_5x7', paper: 'silk', qty: 26, address: good }).ok, false);
  });
  test('JPEG size, 300 dpi stamp, and exact-size file check', () => {
    const j = fakeJpeg(1575, 2175);
    assert.deepEqual(jpegSize(j), { width: 1575, height: 2175 });
    assert.equal(jpegSize(Buffer.from('not a jpeg')), null);
    const s = setJpegDpi(j, 300);
    assert.deepEqual([s[13], (s[14] << 8) | s[15], (s[16] << 8) | s[17]], [1, 300, 300]);
    assert.equal(j[13], 0, 'original untouched');
    assert.equal(checkPrintFile(j, P5x7).ok, true);
    assert.match((checkPrintFile(fakeJpeg(812, 1224), P5x7) as any).error, /1575 × 2175/);
  });
  test('Gelato product uid is built from product + paper', () => {
    assert.equal(gelatoProductUid(P5x7, printPaper('silk')!), 'cards_pf_5r_pt_350-gsm-coated-silk_cl_4-0_ver');
  });
});

// ── Server flow ─────────────────────────────────────────────────────────────

const fields = cleanFields({ headline: 'Max is six', hostName: 'Dana', startsAt: Date.UTC(2026, 9, 24, 18), address: '12 Elm St', venueName: 'The Yard', honoree: 'Max' });
const invite = (over: Partial<EviteDoc> = {}): EviteDoc => ({
  id: 'abcd2345', ownerUid: 'host1', coHostUids: ['cohost'], templateId: 'kids_boy/dino', fields, look: { motion: true, sound: false },
  settings: { ...DEFAULT_SETTINGS }, questions: [], bringList: [], gifts: { ...DEFAULT_GIFTS }, status: 'live', createdAt: 1, updatedAt: 1, sentCount: 0, viewCount: 0, ...over,
});
const address = { name: 'Dana Moss', line1: '12 Elm St', city: 'Atlanta', state: 'GA', postalCode: '30301', country: 'US' };
const order = { id: 'abcd2345', product: 'card_5x7', paper: 'silk', qty: 25, address };

function harness(opts: { configured?: boolean; failOrder?: boolean } = {}) {
  const db = new Map<string, Record<string, any>>();
  const routes: Record<string, any> = {};
  const stripeCalls: any[] = [], uploads: string[] = [], providerOrders: any[] = [], providerQuotes: any[] = [];
  let configured = opts.configured ?? true;
  const reg = (m: string) => (path: string, ...h: any[]) => { routes[`${m} ${path}`] = h[h.length - 1]; };
  const gelato: GelatoAdapter = {
    configured: () => configured,
    quote: async (i) => { providerQuotes.push(i); return { itemsCents: 3000, shippingCents: 599, shipmentMethodUid: 'std', shipmentName: 'Standard', minDays: 3, maxDays: 6 }; },
    createOrder: async (o) => { if (opts.failOrder) throw new Error('Gelato 500'); providerOrders.push(o); return { providerOrderId: 'gl_1', status: 'created' }; },
  };
  const deps = {
    app: { get: reg('GET'), post: reg('POST') }, express: { json: () => (_q: any, _s: any, n: any) => n() },
    rateLimit: () => (_q: any, _s: any, n: any) => n(), authMiddleware: (_q: any, _s: any, n: any) => n(),
    firestoreRead: async (c: string, id: string) => db.get(`${c}/${id}`) || null,
    firestoreWrite: async (c: string, id: string, data: any) => {
      for (const [k, v] of Object.entries(data)) if (v === undefined) throw new Error(`undefined field ${k}`);   // mirrors the real REST helper's pitfall
      db.set(`${c}/${id}`, { ...(db.get(`${c}/${id}`) || {}), ...data });
    },
    firestoreCreateOnce: async (c: string, id: string, data: any) => { if (db.has(`${c}/${id}`)) return 'exists' as const; db.set(`${c}/${id}`, data); return 'created' as const; },
    getStripe: () => ({ checkout: { sessions: { create: async (a: any) => { stripeCalls.push(a); return { id: `cs_${stripeCalls.length}`, url: 'https://checkout.stripe.test/s' }; } } } }),
    trustedRequestOrigin: () => 'https://plajah.com',
    uploadPrintFile: async (p: string) => { uploads.push(p); return `https://files.test/${p}?token=t`; },
    gelato,
  };
  registerEvitePrintRoutes(deps);
  db.set('evites/abcd2345', { ownerUid: 'host1', status: 'live', json: JSON.stringify(invite()) });
  const call = async (key: string, req: any) => {
    let status = 200, body: any;
    const res: any = { status(c: number) { status = c; return this; }, json(b: any) { body = b; return this; }, send(b: any) { body = b; return this; }, set() { return this; } };
    await routes[key]({ params: {}, query: {}, body: {}, headers: {}, ...req }, res, () => {});
    return { status, body };
  };
  return { db, call, deps, stripeCalls, uploads, providerOrders, providerQuotes, setConfigured: (v: boolean) => { configured = v; } };
}

async function paidSession(h: ReturnType<typeof harness>) {
  const up = await h.call('POST /api/evite/print/upload', { uid: 'host1', body: { id: 'abcd2345', product: 'card_5x7', jpegBase64: fakeJpeg(1575, 2175).toString('base64') } });
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const co = await h.call('POST /api/evite/print/checkout', { uid: 'host1', email: 'dana@example.com', body: { ...order, fileId: up.body.fileId } });
  assert.equal(co.status, 200, JSON.stringify(co.body));
  const s = h.stripeCalls[h.stripeCalls.length - 1];
  return { id: `cs_${h.stripeCalls.length}`, payment_status: 'paid', amount_total: s.line_items[0].price_data.unit_amount, payment_intent: 'pi_1', customer_details: { email: 'dana@example.com' }, metadata: s.metadata };
}

describe('print routes', () => {
  test('quote: owner only (co-hosts and strangers get 403), priced at cost from the provider', async () => {
    const h = harness();
    assert.equal((await h.call('POST /api/evite/print/quote', { uid: 'other', body: order })).status, 403);
    assert.equal((await h.call('POST /api/evite/print/quote', { uid: 'cohost', body: order })).status, 403);
    assert.equal((await h.call('POST /api/evite/print/quote', { uid: 'host1', body: { ...order, id: 'zzzz9999' } })).status, 404);
    const r = await h.call('POST /api/evite/print/quote', { uid: 'host1', body: order });
    assert.equal(r.status, 200);
    assert.equal(r.body.quote.totalCents, grossUpCents(3599).grossCents);
    assert.equal(r.body.marginPct, 0);
    assert.equal(h.providerQuotes[0].productUid, 'cards_pf_5r_pt_350-gsm-coated-silk_cl_4-0_ver');
    assert.equal((await h.call('POST /api/evite/print/quote', { uid: 'host1', body: { ...order, address: { ...address, postalCode: '' } } })).status, 400);
  });

  test('quote without provider credentials → PRINT_NOT_CONFIGURED with a friendly message', async () => {
    const h = harness({ configured: false });
    const r = await h.call('POST /api/evite/print/quote', { uid: 'host1', body: order });
    assert.equal(r.status, 503); assert.equal(r.body.code, 'PRINT_NOT_CONFIGURED'); assert.match(r.body.error, /aren’t switched on yet/);
    assert.equal(h.providerQuotes.length, 0);
  });

  test('upload: owner only, must be a JPEG at the exact print size', async () => {
    const h = harness();
    const b64 = fakeJpeg(1575, 2175).toString('base64');
    assert.equal((await h.call('POST /api/evite/print/upload', { uid: 'other', body: { id: 'abcd2345', product: 'card_5x7', jpegBase64: b64 } })).status, 403);
    assert.equal((await h.call('POST /api/evite/print/upload', { uid: 'host1', body: { id: 'abcd2345', product: 'card_5x7', jpegBase64: fakeJpeg(800, 1200).toString('base64') } })).status, 400);
    assert.equal((await h.call('POST /api/evite/print/upload', { uid: 'host1', body: { id: 'abcd2345', product: 'card_5x7', jpegBase64: Buffer.from('<svg/>').toString('base64') } })).status, 400);
    const ok = await h.call('POST /api/evite/print/upload', { uid: 'host1', body: { id: 'abcd2345', product: 'card_5x7', jpegBase64: b64 } });
    assert.equal(ok.status, 200);
    assert.match(h.uploads[0], /^evite-prints\/abcd2345\/[A-Za-z0-9_-]+\.jpg$/);
    assert.equal(h.db.get(`evite_print_files/${ok.body.fileId}`)?.ownerUid, 'host1');
  });

  test('checkout: Plajah is the merchant, server re-quotes (client price ignored), metadata type evite_print', async () => {
    const h = harness();
    const up = await h.call('POST /api/evite/print/upload', { uid: 'host1', body: { id: 'abcd2345', product: 'card_5x7', jpegBase64: fakeJpeg(1575, 2175).toString('base64') } });
    assert.equal((await h.call('POST /api/evite/print/checkout', { uid: 'host1', body: { ...order, fileId: 'nope1234' } })).status, 400, 'unknown file');
    assert.equal((await h.call('POST /api/evite/print/checkout', { uid: 'host1', body: { ...order, product: 'card_4x6', fileId: up.body.fileId } })).status, 400, 'file rendered for another size');
    assert.equal((await h.call('POST /api/evite/print/checkout', { uid: 'other', body: { ...order, fileId: up.body.fileId } })).status, 403);
    const co = await h.call('POST /api/evite/print/checkout', { uid: 'host1', email: 'dana@example.com', body: { ...order, fileId: up.body.fileId, totalCents: 1 } });
    assert.equal(co.status, 200); assert.equal(co.body.url, 'https://checkout.stripe.test/s');
    const s = h.stripeCalls[0];
    assert.equal(s.metadata.type, 'evite_print'); assert.equal(s.payment_intent_data.metadata.type, 'evite_print');
    assert.equal(s.metadata.inviteId, 'abcd2345'); assert.equal(s.metadata.orderId, co.body.orderId); assert.equal(s.metadata.marginCents, '0');
    assert.equal(s.payment_intent_data.transfer_data, undefined, 'no Connect destination');
    assert.equal(s.payment_intent_data.application_fee_amount, undefined);
    assert.equal(s.line_items[0].price_data.unit_amount, grossUpCents(3599).grossCents);
    assert.equal(s.customer_email, 'dana@example.com');
    const stored = JSON.parse(h.db.get(`evite_print_orders/${co.body.orderId}`)!.json);
    assert.equal(stored.fileUrl, `https://files.test/evite-prints/abcd2345/${up.body.fileId}.jpg?token=t`);
    assert.equal(stored.address.postalCode, '30301');
  });
});

describe('webhook fulfilment', () => {
  test('submits the provider order once per session (idempotent)', async () => {
    const h = harness();
    const session = await paidSession(h);
    assert.equal(await fulfillEvitePrint(h.deps, session), 'SUBMITTED');
    assert.equal(await fulfillEvitePrint(h.deps, session), 'exists');
    assert.equal(h.providerOrders.length, 1);
    const o = h.providerOrders[0];
    assert.equal(o.qty, 25); assert.equal(o.address.line1, '12 Elm St'); assert.match(o.fileUrl, /^https:\/\/files\.test\/evite-prints\//);
    assert.equal(o.shipmentMethodUid, 'std'); assert.equal(o.email, 'dana@example.com');
    const rec = h.db.get(`evite_prints/${session.id}`)!;
    assert.equal(rec.status, 'SUBMITTED'); assert.equal(rec.providerOrderId, 'gl_1');
    assert.equal(h.db.get(`evite_print_orders/${session.metadata.orderId}`)!.status, 'PAID');
  });

  test('missing provider key parks the paid order as AWAITING_PROVIDER_CONFIG', async () => {
    const h = harness();
    const session = await paidSession(h);
    h.setConfigured(false);
    assert.equal(await fulfillEvitePrint(h.deps, session), 'AWAITING_PROVIDER_CONFIG');
    assert.equal(h.db.get(`evite_prints/${session.id}`)!.status, 'AWAITING_PROVIDER_CONFIG');
    assert.equal(h.providerOrders.length, 0);
    assert.equal(await fulfillEvitePrint(h.deps, session), 'exists');
  });

  test('provider failure is recorded, not retried by Stripe; other sessions are ignored or unpaid', async () => {
    const h = harness({ failOrder: true });
    const session = await paidSession(h);
    assert.equal(await fulfillEvitePrint(h.deps, session), 'PROVIDER_ERROR');
    assert.match(h.db.get(`evite_prints/${session.id}`)!.error, /Gelato 500/);
    assert.equal(await fulfillEvitePrint(h.deps, { id: 'cs_x', metadata: { type: 'evite_gift' } }), 'ignored');
    assert.equal(await fulfillEvitePrint(h.deps, { ...session, id: 'cs_y', payment_status: 'unpaid' }), 'unpaid');
  });
});
