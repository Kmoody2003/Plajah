// evitePrintServer — printed Plajah Evites: quote, upload the per-order print file, Stripe Checkout, and fulfilment
// from the Stripe webhook. Registered from server.ts with ONE call; every helper is injected (`EvitePrintDeps`), same
// shape as eviteServer, so tests run it against an in-memory Firestore and a fake printer.
//
//  POST /api/evite/print/quote     host only → provider price + shipping, sold AT COST (+ Stripe processing grossed up)
//  POST /api/evite/print/upload    host only → the rendered JPEG (base64 in JSON), checked byte-for-byte, stored privately
//  POST /api/evite/print/checkout  host only → re-quotes server-side, Stripe Checkout (Plajah is the merchant, no Connect)
//  fulfillEvitePrint(deps, session) from the Stripe webhook (metadata.type === 'evite_print'): idempotent per session
//
// Collections (server-only, written through the REST helpers; the browser never touches them):
//   evite_print_files/{fileId}     inviteId, ownerUid, product, url, bytes, createdAt
//   evite_print_orders/{orderId}   inviteId, ownerUid, status, json (address + quote + file), createdAt   (pre-payment)
//   evite_prints/{sessionId}       inviteId, ownerUid, orderId, status, providerOrderId, error, json, updatedAt
import nodeCrypto from 'node:crypto';
import {
  checkPrintOrder, quotePrint, gelatoProductUid, printProduct, checkPrintFile, PRINT_MAX_FILE_BYTES, PRINT_MARGIN_PCT,
  type PrintAddress, type PrintQuote, type PrintProduct, type PrintPaper,
} from './evitePrintCore';
import type { EviteDoc } from './eviteTypes';
import { isShortId } from './eviteCore';

type Row = Record<string, any>;

// ── Provider adapter ──────────────────────────────────────────────────────────────────────────────────────────────

export interface PrintProviderQuote {
  /** Provider's exact line total for qty cards, in cents. */
  itemsCents: number;
  shippingCents: number;
  shipmentMethodUid?: string;
  shipmentName?: string;
  minDays?: number;
  maxDays?: number;
}
export interface PrintProviderOrder {
  orderReferenceId: string;
  productUid: string;
  qty: number;
  fileUrl: string;
  address: PrintAddress;
  email?: string;
  shipmentMethodUid?: string;
}
/** The print provider (Gelato today). Tests pass a fake; production uses createGelatoAdapter(). */
export interface GelatoAdapter {
  /** False when the API key is missing: quote/checkout answer PRINT_NOT_CONFIGURED, fulfilment parks the order. */
  configured(): boolean;
  quote(i: { productUid: string; qty: number; address: PrintAddress; orderReferenceId: string; email?: string }): Promise<PrintProviderQuote>;
  createOrder(o: PrintProviderOrder): Promise<{ providerOrderId: string; status?: string }>;
}

export interface EvitePrintDeps {
  app: any; express: any; rateLimit: any; authMiddleware: any;
  firestoreRead: (c: string, id: string) => Promise<Row | null>;
  firestoreWrite: (c: string, id: string, data: object, requireSuccess?: boolean) => Promise<any>;
  firestoreCreateOnce: (c: string, id: string, data: Row) => Promise<'created' | 'exists' | 'error'>;
  getStripe: () => any;
  trustedRequestOrigin: (req: any) => string;
  gelato: GelatoAdapter;
  /** Store the print file and return a URL the printer can fetch (unguessable), or null on failure.
   *  In server.ts: gcsUploadWithDownloadToken + the firebasestorage download-token URL (see the report snippet). */
  uploadPrintFile: (objectPath: string, data: Buffer, contentType: string) => Promise<string | null>;
  /** Stripe fee overrides (STRIPE_FEE_RATE / STRIPE_FEE_FIXED_CENTS), same as the gift route. */
  feeParams?: () => { rate?: number; fixedCents?: number };
}

export const PRINT_NOT_CONFIGURED = 'PRINT_NOT_CONFIGURED';
const NOT_CONFIGURED_MSG = 'Printed invitations aren’t switched on yet. Your digital invite works as usual; we’ll let you know when printing opens.';

const parse = <T,>(row: Row | null | undefined): T | null => { try { return row?.json ? JSON.parse(row.json) as T : null; } catch { return null; } };
const isId = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{4,64}$/.test(s);
const newId = () => nodeCrypto.randomBytes(12).toString('base64url');

interface StoredOrder {
  orderId: string; inviteId: string; ownerUid: string; fileId: string; fileUrl: string;
  productUid: string; product: string; paper: string; qty: number; address: PrintAddress; quote: PrintQuote;
  shipmentMethodUid?: string; marginPct: number; createdAt: number;
}

export function registerEvitePrintRoutes(d: EvitePrintDeps) {
  const { app, express } = d;
  const jsonBody = express.json({ limit: '32kb' });
  // A 5×7 file at 300 dpi, q0.95, is typically 1.5–4 MB; base64 adds a third.
  const uploadBody = express.json({ limit: `${Math.ceil(PRINT_MAX_FILE_BYTES * 1.4 / (1024 * 1024))}mb` });
  const limiter = d.rateLimit({ windowMs: 10 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many tries. Give it a minute and try again.' } });
  const uploadLimiter = d.rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many print files. Try again later.' } });

  /** Owner only (co-hosts can't spend the owner's money or ship to their own door on the owner's invite). */
  const loadOwned = async (req: any, res: any): Promise<EviteDoc | null> => {
    const id = String(req.body?.id || '');
    const inv = isShortId(id) ? parse<EviteDoc>(await d.firestoreRead('evites', id)) : null;
    if (!inv) { res.status(404).json({ error: 'That invite no longer exists.' }); return null; }
    if (inv.ownerUid !== req.uid) { res.status(403).json({ error: 'Only the host who created this invite can order prints.' }); return null; }
    if (inv.status === 'cancelled') { res.status(409).json({ error: 'This event was cancelled.' }); return null; }
    return inv;
  };
  const notConfigured = (res: any) => res.status(503).json({ error: NOT_CONFIGURED_MSG, code: PRINT_NOT_CONFIGURED });

  /** Ask the printer, then apply the at-cost rule. Never trusts a client-sent price. */
  async function priced(o: { product: PrintProduct; paper: PrintPaper; qty: number; address: PrintAddress }, ref: string, email?: string) {
    const productUid = gelatoProductUid(o.product, o.paper);
    const pq = await d.gelato.quote({ productUid, qty: o.qty, address: o.address, orderReferenceId: ref, ...(email ? { email } : {}) });
    const q = quotePrint({ product: o.product.id, paper: o.paper.id, qty: o.qty, providerItemsCents: pq.itemsCents, shippingCents: pq.shippingCents, fee: d.feeParams?.() });
    return { productUid, pq, q };
  }

  app.post('/api/evite/print/quote', d.authMiddleware, limiter, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadOwned(req, res); if (!inv) return;
      if (!d.gelato.configured()) return notConfigured(res);
      const chk = checkPrintOrder(req.body);
      if (chk.ok === false) return res.status(400).json({ error: chk.error });
      const { pq, q } = await priced(chk.value, `quote-${inv.id}`, req.email);
      if (q.ok === false) return res.status(502).json({ error: q.error });
      res.json({
        quote: q.value, marginPct: PRINT_MARGIN_PCT,
        delivery: { name: pq.shipmentName || '', minDays: pq.minDays ?? null, maxDays: pq.maxDays ?? null },
        warning: inv.status === 'draft' ? 'This invite is still a draft, so the QR on the card won’t open until you publish it.' : undefined,
      });
    } catch (err: any) { console.error('/api/evite/print/quote', err?.message || err); res.status(502).json({ error: 'We couldn’t reach the printer for a price. Try again in a moment.' }); }
  });

  app.post('/api/evite/print/upload', d.authMiddleware, uploadLimiter, uploadBody, async (req: any, res: any) => {
    try {
      const inv = await loadOwned(req, res); if (!inv) return;
      if (!d.gelato.configured()) return notConfigured(res);
      const product = printProduct(req.body?.product);
      if (!product) return res.status(400).json({ error: 'Pick a card size.' });
      const b64 = typeof req.body?.jpegBase64 === 'string' ? req.body.jpegBase64.replace(/^data:image\/jpeg;base64,/, '') : '';
      if (!b64 || b64.length > PRINT_MAX_FILE_BYTES * 1.4 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) return res.status(400).json({ error: 'The print file didn’t come through. Try again.' });
      const buf = Buffer.from(b64, 'base64');
      const ok = checkPrintFile(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), product);
      if (ok.ok === false) return res.status(400).json({ error: ok.error });
      const fileId = newId();
      const url = await d.uploadPrintFile(`evite-prints/${inv.id}/${fileId}.jpg`, buf, 'image/jpeg');
      if (!url) return res.status(500).json({ error: 'We couldn’t store the print file. Try again.' });
      await d.firestoreWrite('evite_print_files', fileId, { inviteId: inv.id, ownerUid: inv.ownerUid, product: product.id, url, bytes: buf.byteLength, createdAt: Date.now() }, true);
      res.json({ fileId });
    } catch (err: any) { console.error('/api/evite/print/upload', err?.message || err); res.status(500).json({ error: 'We couldn’t store the print file. Try again.' }); }
  });

  app.post('/api/evite/print/checkout', d.authMiddleware, limiter, jsonBody, async (req: any, res: any) => {
    try {
      const inv = await loadOwned(req, res); if (!inv) return;
      if (!d.gelato.configured()) return notConfigured(res);
      const chk = checkPrintOrder(req.body);
      if (chk.ok === false) return res.status(400).json({ error: chk.error });
      const o = chk.value;
      const fileId = req.body?.fileId;
      const file = isId(fileId) ? await d.firestoreRead('evite_print_files', fileId) : null;
      if (!file || file.inviteId !== inv.id || file.ownerUid !== req.uid || file.product !== o.product.id || !file.url) return res.status(400).json({ error: 'The print file is missing. Go back and try again.' });
      const orderId = newId();
      const { productUid, pq, q } = await priced(o, orderId, req.email);
      if (q.ok === false) return res.status(502).json({ error: q.error });
      const quote = q.value;
      const order: StoredOrder = {
        orderId, inviteId: inv.id, ownerUid: inv.ownerUid, fileId, fileUrl: String(file.url), productUid, product: o.product.id, paper: o.paper.id,
        qty: o.qty, address: o.address, quote, marginPct: PRINT_MARGIN_PCT, createdAt: Date.now(),
        ...(pq.shipmentMethodUid ? { shipmentMethodUid: pq.shipmentMethodUid } : {}),
      };
      await d.firestoreWrite('evite_print_orders', orderId, { inviteId: inv.id, ownerUid: inv.ownerUid, status: 'PENDING_PAYMENT', json: JSON.stringify(order), createdAt: order.createdAt }, true);
      const origin = d.trustedRequestOrigin(req);
      const meta = {
        type: 'evite_print', orderId, inviteId: inv.id, ownerUid: inv.ownerUid, product: o.product.id, paper: o.paper.id, qty: String(o.qty),
        itemsCents: String(quote.itemsCents), shippingCents: String(quote.shippingCents), marginCents: String(quote.marginCents),
        processingCents: String(quote.processingCents), totalCents: String(quote.totalCents),
      };
      const session = await d.getStripe().checkout.sessions.create({
        mode: 'payment', payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd', unit_amount: quote.totalCents,
            product_data: { name: `Printed invitations · ${o.qty} × ${o.product.label} ${o.paper.label}`, description: `“${inv.fields.headline}”. Printing, shipping and card processing at cost.` },
          },
          quantity: 1,
        }],
        ...(req.email ? { customer_email: String(req.email) } : {}),
        payment_intent_data: { metadata: meta },
        metadata: meta,
        success_url: `${origin}/?evite=${encodeURIComponent(inv.id)}&print=thanks`, cancel_url: `${origin}/?evite=${encodeURIComponent(inv.id)}&print=cancelled`,
      });
      res.json({ url: session.url, orderId, quote });
    } catch (err: any) { console.error('/api/evite/print/checkout', err?.message || err); res.status(500).json({ error: 'Could not start the print checkout.' }); }
  });
}

export type FulfilResult = 'ignored' | 'exists' | 'unpaid' | 'missing_order' | 'AWAITING_PROVIDER_CONFIG' | 'SUBMITTED' | 'PROVIDER_ERROR' | 'error';

/**
 * Called from the Stripe webhook for `metadata.type === 'evite_print'` after payment. Idempotent per Checkout session:
 * the first call claims `evite_prints/{sessionId}` with firestoreCreateOnce; repeats return 'exists' and never re-order.
 * No provider key → the paid order is parked as AWAITING_PROVIDER_CONFIG (a person submits it once the key is set).
 */
export async function fulfillEvitePrint(
  d: Pick<EvitePrintDeps, 'firestoreRead' | 'firestoreWrite' | 'firestoreCreateOnce' | 'gelato'>, session: any,
): Promise<FulfilResult> {
  const meta = session?.metadata || {};
  if (meta.type !== 'evite_print' || !session?.id) return 'ignored';
  if (session.payment_status && session.payment_status !== 'paid') return 'unpaid';
  const sid = String(session.id);
  const order = isId(meta.orderId) ? parse<StoredOrder>(await d.firestoreRead('evite_print_orders', meta.orderId)) : null;
  const base = { inviteId: String(meta.inviteId || ''), ownerUid: String(meta.ownerUid || ''), orderId: String(meta.orderId || ''), amountCents: Number(session.amount_total) || 0, paymentIntent: String(session.payment_intent || '') };
  const claim = await d.firestoreCreateOnce('evite_prints', sid, { ...base, status: order ? 'SUBMITTING' : 'MISSING_ORDER', createdAt: Date.now(), updatedAt: Date.now() });
  if (claim === 'exists') return 'exists';
  if (claim === 'error') return 'error';
  if (!order) { console.error('[evite_print] paid session without an order', sid, meta.orderId); return 'missing_order'; }
  const paidMismatch = base.amountCents && base.amountCents !== order.quote.totalCents;
  const record = (status: string, extra: Row = {}) => d.firestoreWrite('evite_prints', sid, {
    status, updatedAt: Date.now(), json: JSON.stringify({ ...order, email: session.customer_details?.email || '', ...(paidMismatch ? { paidMismatch: true } : {}) }), ...extra,
  });
  await d.firestoreWrite('evite_print_orders', order.orderId, { status: 'PAID', sessionId: sid });

  if (!d.gelato.configured()) { await record('AWAITING_PROVIDER_CONFIG'); return 'AWAITING_PROVIDER_CONFIG'; }
  try {
    const r = await d.gelato.createOrder({
      orderReferenceId: order.orderId, productUid: order.productUid, qty: order.qty, fileUrl: order.fileUrl, address: order.address,
      email: session.customer_details?.email || undefined, shipmentMethodUid: order.shipmentMethodUid,
    });
    await record('SUBMITTED', { providerOrderId: r.providerOrderId, providerStatus: r.status || '' });
    return 'SUBMITTED';
  } catch (err: any) {
    // Paid but not placed: keep it visible for a person to retry; Stripe is not retried (the claim doc exists).
    console.error('[evite_print] provider order failed', sid, err?.message || err);
    await record('PROVIDER_ERROR', { error: String(err?.message || err).slice(0, 300) });
    return 'PROVIDER_ERROR';
  }
}

// ── Gelato over HTTP (production) ─────────────────────────────────────────────────────────────────────────────────
// Endpoints follow Gelato's v4 order API (POST /v4/orders:quote, POST /v4/orders). Response shapes are read defensively;
// verify against Gelato's sandbox before go-live. Nothing here runs in tests.

const toCents = (v: unknown) => Math.round(Number(v) * 100);
const splitName = (n: string) => { const i = n.lastIndexOf(' '); return i > 0 ? { firstName: n.slice(0, i), lastName: n.slice(i + 1) } : { firstName: n, lastName: '-' }; };
const gelatoAddress = (a: PrintAddress, email?: string) => ({
  ...splitName(a.name), addressLine1: a.line1, ...(a.line2 ? { addressLine2: a.line2 } : {}), city: a.city, postCode: a.postalCode,
  ...(a.state ? { state: a.state } : {}), country: a.country, ...(email ? { email } : {}), ...(a.phone ? { phone: a.phone } : {}),
});

export function createGelatoAdapter(opts: { apiKey: () => string | undefined; draftOrders?: () => boolean; fetchImpl?: typeof fetch; base?: string } ): GelatoAdapter {
  const base = opts.base || 'https://order.gelatoapis.com';
  const f = opts.fetchImpl || fetch;
  const headers = () => ({ 'X-API-KEY': opts.apiKey() || '', 'Content-Type': 'application/json' });
  const post = async (path: string, body: unknown) => {
    const r = await f(`${base}${path}`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Gelato ${r.status}: ${String(data?.message || data?.error || '').slice(0, 200)}`);
    return data;
  };
  return {
    configured: () => !!opts.apiKey(),
    async quote({ productUid, qty, address, orderReferenceId, email }) {
      const data = await post('/v4/orders:quote', {
        orderReferenceId, customerReferenceId: orderReferenceId, currency: 'USD', allowMultipleQuotes: false,
        recipient: gelatoAddress(address, email),
        products: [{ itemReferenceId: `${orderReferenceId}-1`, productUid, quantity: qty }],
      });
      const quote = data?.quotes?.[0];
      const line = quote?.products?.[0];
      const methods: any[] = Array.isArray(quote?.shipmentMethods) ? quote.shipmentMethods : [];
      // Cheapest normal-speed method; the host isn't offered express (owner can add a choice later).
      const ship = methods.filter(m => Number.isFinite(Number(m?.price))).sort((a, b) => Number(a.price) - Number(b.price))[0];
      if (!line || !ship) throw new Error('Gelato returned no quote');
      const itemsCents = line.price !== undefined ? toCents(line.price) : toCents(line.unitPrice) * qty;
      return { itemsCents, shippingCents: toCents(ship.price), shipmentMethodUid: ship.shipmentMethodUid || ship.uid, shipmentName: ship.name, minDays: ship.minDeliveryDays, maxDays: ship.maxDeliveryDays };
    },
    async createOrder(o) {
      const data = await post('/v4/orders', {
        orderType: opts.draftOrders?.() ? 'draft' : 'order',
        orderReferenceId: o.orderReferenceId, customerReferenceId: o.orderReferenceId, currency: 'USD',
        items: [{ itemReferenceId: `${o.orderReferenceId}-1`, productUid: o.productUid, files: [{ type: 'default', url: o.fileUrl }], quantity: o.qty }],
        ...(o.shipmentMethodUid ? { shipmentMethodUid: o.shipmentMethodUid } : {}),
        shippingAddress: gelatoAddress(o.address, o.email),
      });
      return { providerOrderId: String(data?.id || ''), status: String(data?.fulfillmentStatus || data?.status || '') };
    },
  };
}
