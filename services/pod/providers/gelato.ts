// Gelato provider (SECONDARY, experimental). Server-side only.
//
// VERIFIED (via Gelato docs search snippets 2026-10-08): POST https://order.gelatoapis.com/v4/orders, header X-API-KEY,
//   body {orderType, orderReferenceId, customerReferenceId, currency, items[{itemReferenceId, productUid, quantity, files[{type:'default'|..., url}]}],
//   shipmentMethodUid, shippingAddress}. orderType "draft" lets you validate without producing.
// NOT VERIFIED (dashboard.gelato.com returned 403 to our fetcher): book/photobook productUid + pageCount semantics, the quote
//   endpoint (/v4/orders:quote), cancel (/v4/orders/{id}:cancel), webhook authentication, status names. The book productUid must
//   be supplied by the operator from Gelato's catalog (GELATO_BOOK_PRODUCT_UID); we do not guess one.
import { PodError } from '../podTypes';
import type { PodProvider, PodPrintJobRequest, PodJobStatus, PodStatus, PodQuoteRequest, PodQuote } from '../podTypes';
import * as crypto from 'node:crypto';

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
export interface GelatoConfig { apiKey?: string; productUid?: string; fetchImpl?: FetchLike; webhookSecret?: string; draft?: boolean }

const MAP: Record<string, PodStatus> = {
  created: 'created', passed: 'created', draft: 'created', pending_approval: 'awaiting_payment', not_connected: 'awaiting_payment',
  in_production: 'in_production', printed: 'in_production', shipped: 'shipped', delivered: 'delivered',
  canceled: 'canceled', cancelled: 'canceled', failed: 'error',
};

export class GelatoProvider implements PodProvider {
  id = 'gelato' as const;
  name = 'Gelato';
  capabilities = {
    directOrder: true, directPublish: false, quote: false, webhooks: true, hardcover: true, exportPack: false, requiresPartnership: false,
    summary: 'Direct connect (experimental): orders are placed through the Gelato API. Book product IDs must be configured by the operator; quote not wired.',
  };
  private cfg: GelatoConfig;
  constructor(cfg: GelatoConfig = {}) {
    this.cfg = { apiKey: process.env.GELATO_API_KEY, productUid: process.env.GELATO_BOOK_PRODUCT_UID, webhookSecret: process.env.GELATO_WEBHOOK_SECRET, draft: process.env.GELATO_ORDER_TYPE !== 'order', ...cfg };
  }
  configured() { return !!(this.cfg.apiKey && this.cfg.productUid); }
  private f(): FetchLike { return this.cfg.fetchImpl ?? ((u, i) => fetch(u, i) as any); }

  async quote(_r: PodQuoteRequest): Promise<PodQuote> { throw new PodError('Gelato quoting is not implemented', 'GELATO_NO_QUOTE', 501); }

  async createPrintJob(r: PodPrintJobRequest): Promise<PodJobStatus> {
    if (!this.configured()) throw new PodError('Gelato is not configured on this server', 'GELATO_NOT_CONFIGURED', 503);
    const res = await this.f()('https://order.gelatoapis.com/v4/orders', {
      method: 'POST', headers: { 'X-API-KEY': this.cfg.apiKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderType: this.cfg.draft ? 'draft' : 'order', orderReferenceId: r.externalId, customerReferenceId: r.address.email, currency: 'USD',
        items: [{
          itemReferenceId: `${r.externalId}-1`, productUid: this.cfg.productUid, quantity: r.quantity, pageCount: r.pageCount,
          files: [{ type: 'default', url: r.interiorUrl }, { type: 'cover', url: r.coverUrl }],
        }],
        shipmentMethodUid: 'normal',
        shippingAddress: {
          firstName: r.address.name.split(' ')[0], lastName: r.address.name.split(' ').slice(1).join(' ') || '-', addressLine1: r.address.street1,
          addressLine2: r.address.street2, city: r.address.city, state: r.address.stateCode, postCode: r.address.postcode,
          country: r.address.countryCode, email: r.address.email, phone: r.address.phone,
        },
      }),
    });
    const txt = await res.text();
    let j: any = {}; try { j = JSON.parse(txt); } catch { /* keep {} */ }
    if (!res.ok) throw new PodError(`Gelato rejected the order: ${(j.message || txt).toString().slice(0, 300)}`, 'GELATO_UPSTREAM', res.status === 400 ? 422 : 502, j);
    return this.toStatus(j);
  }

  toStatus(j: any): PodJobStatus {
    const raw = String(j?.fulfillmentStatus ?? j?.orderStatus ?? j?.status ?? '').toLowerCase();
    const item = (j?.items ?? [])[0] ?? {};
    const fr = (item.fulfillments ?? [])[0] ?? {};
    return { providerJobId: String(j?.id ?? j?.orderId ?? ''), rawStatus: raw, status: MAP[raw] ?? 'unknown', trackingId: fr.trackingCode, trackingUrls: fr.trackingUrl ? [fr.trackingUrl] : undefined, carrier: fr.shipmentMethodName };
  }

  /** Gelato's webhook auth scheme is unverified; we support an operator-chosen shared secret in header `x-pod-webhook-secret`. */
  verifyWebhook(_raw: Buffer | string, headers: Record<string, string | string[] | undefined>): boolean {
    const s = this.cfg.webhookSecret; if (!s) return false;
    const h = headers['x-pod-webhook-secret']; const given = String(Array.isArray(h) ? h[0] : h || '');
    const a = Buffer.from(given), b = Buffer.from(s);
    return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
  }
  parseWebhook(body: any): PodJobStatus | null { return body?.orderId || body?.id ? this.toStatus({ ...body, id: body.orderId ?? body.id }) : null; }
}
