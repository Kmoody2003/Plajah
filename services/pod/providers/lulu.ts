// Lulu Print API provider (REAL direct integration). Server-side only.
//
// VERIFICATION STATUS (docs at api.lulu.com/docs are a JS app and could not be fetched as text on 2026-10-08):
//  confirmed from multiple independent client implementations / Lulu pages:
//    - token: POST {base}/auth/realms/glasstree/protocol/openid-connect/token, Basic base64(key:secret), body grant_type=client_credentials
//    - bases: https://api.lulu.com and https://api.sandbox.lulu.com (separate sandbox account + keys)
//    - POST {base}/print-jobs/ with contact_email, external_id, line_items[{external_id, printable_normalization:{cover:{source_url}, interior:{source_url}, pod_package_id}, quantity, title}], shipping_address, shipping_level
//    - webhook signature: header `Lulu-HMAC-SHA256`, HMAC-SHA256 of the RAW body keyed with the API client secret (hex)
//  NOT verified (best recollection; must be exercised against the sandbox before production):
//    - POST /print-job-cost-calculations/ request/response field names, POST /cover-dimensions/, status PUT for cancel,
//      status enum names, tracking field names. Parsing is defensive and surfaces PodError('LULU_UNEXPECTED_SHAPE').
import * as crypto from 'node:crypto';
import { PodError } from '../podTypes';
import type { PodProvider, PodQuote, PodQuoteRequest, PodPrintJobRequest, PodJobStatus, PodStatus } from '../podTypes';
import { luluPodPackageId } from '../printSpec';

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; text(): Promise<string>; headers?: any }>;

export interface LuluConfig {
  clientKey?: string; clientSecret?: string; sandbox?: boolean;
  fetchImpl?: FetchLike; sleep?: (ms: number) => Promise<void>; maxRetries?: number; contactEmail?: string;
}

export const LULU_STATUS_MAP: Record<string, PodStatus> = {
  CREATED: 'created', UNPAID: 'awaiting_payment', PAYMENT_IN_PROGRESS: 'awaiting_payment',
  PRODUCTION_READY: 'in_production', PRODUCTION_DELAYED: 'in_production', IN_PRODUCTION: 'in_production',
  SHIPPED: 'shipped', REJECTED: 'rejected', CANCELED: 'canceled', CANCELLED: 'canceled',
};

export const toCents = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export class LuluProvider implements PodProvider {
  id = 'lulu' as const;
  name = 'Lulu Print API';
  capabilities = {
    directOrder: true, directPublish: false, quote: true, webhooks: true, hardcover: true, exportPack: false, requiresPartnership: false,
    summary: 'Direct connect: Plajah places print jobs with Lulu and tracks them. Not a retail listing; copies ship to the buyer or author.',
  };
  private cfg: Required<Pick<LuluConfig, 'maxRetries'>> & LuluConfig;
  private token: { value: string; exp: number } | null = null;
  constructor(cfg: LuluConfig = {}) {
    this.cfg = {
      clientKey: process.env.LULU_CLIENT_KEY, clientSecret: process.env.LULU_CLIENT_SECRET,
      sandbox: process.env.LULU_SANDBOX !== 'false', contactEmail: process.env.POD_CONTACT_EMAIL,
      maxRetries: 3, ...cfg,
    };
  }
  private get base() { return this.cfg.sandbox ? 'https://api.sandbox.lulu.com' : 'https://api.lulu.com'; }
  private f(): FetchLike { return this.cfg.fetchImpl ?? ((u, i) => fetch(u, i) as any); }
  private sleep(ms: number) { return (this.cfg.sleep ?? ((m: number) => new Promise(r => setTimeout(r, m))))(ms); }
  configured() { return !!(this.cfg.clientKey && this.cfg.clientSecret); }

  async getToken(force = false): Promise<string> {
    if (!this.configured()) throw new PodError('Lulu is not configured on this server', 'LULU_NOT_CONFIGURED', 503);
    if (!force && this.token && this.token.exp > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientKey}:${this.cfg.clientSecret}`).toString('base64');
    const res = await this.f()(`${this.base}/auth/realms/glasstree/protocol/openid-connect/token`, {
      method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials',
    });
    const txt = await res.text();
    if (!res.ok) throw new PodError('Lulu rejected our credentials', 'LULU_AUTH', 502, { status: res.status });
    const j = safeJson(txt);
    if (!j?.access_token) throw new PodError('Lulu token response had no access_token', 'LULU_UNEXPECTED_SHAPE');
    this.token = { value: j.access_token, exp: Date.now() + (Number(j.expires_in) || 300) * 1000 };
    return this.token.value;
  }

  /** Authenticated JSON call with 401-refresh and 429/5xx backoff. Maps failures to PodError. */
  async call(method: string, path: string, body?: unknown): Promise<any> {
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.getToken();
      const res = await this.f()(`${this.base}${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const txt = await res.text();
      if (res.ok) return safeJson(txt) ?? {};
      if (res.status === 401 && !refreshed) { refreshed = true; await this.getToken(true); continue; }
      if ((res.status === 429 || res.status >= 500) && attempt < this.cfg.maxRetries) { await this.sleep(Math.min(8000, 400 * 2 ** attempt)); continue; }
      const j = safeJson(txt);
      const detail = j?.detail || j?.message || j?.errors || txt.slice(0, 300);
      if (res.status === 400 || res.status === 422) throw new PodError(`Lulu rejected the request: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`, 'LULU_VALIDATION', 422, j);
      if (res.status === 404) throw new PodError('Lulu resource not found', 'LULU_NOT_FOUND', 404);
      if (res.status === 429) throw new PodError('Lulu rate limit reached; try again shortly', 'LULU_RATE_LIMIT', 429);
      throw new PodError(`Lulu error ${res.status}`, 'LULU_UPSTREAM', 502, j);
    }
  }

  podId(e: PodQuoteRequest['edition']): string {
    const id = luluPodPackageId(e.trimId, e.binding, e.paperColor, e.paperWeight === 50 ? 60 : e.paperWeight, !!e.colorInterior);
    if (!id) throw new PodError('This trim/paper/binding combination is not available on Lulu', 'LULU_UNSUPPORTED_SPEC', 422);
    return id;
  }

  async quote(req: PodQuoteRequest): Promise<PodQuote> {
    const podPackageId = this.podId(req.edition);
    const j = await this.call('POST', '/print-job-cost-calculations/', {
      line_items: [{ page_count: req.pageCount, pod_package_id: podPackageId, quantity: req.quantity }],
      shipping_address: {
        city: req.address.city, country_code: req.address.countryCode, postcode: req.address.postcode,
        state_code: req.address.stateCode, street1: req.address.street1, phone_number: req.address.phone,
      },
      shipping_option: req.shippingLevel,
    });
    const total = j.total_cost_incl_tax ?? j.total_cost_excl_tax;
    if (total === undefined) throw new PodError('Lulu cost response missing totals', 'LULU_UNEXPECTED_SHAPE', 502, j);
    const lineCost = (j.line_item_costs ?? []).reduce((s: number, l: any) => s + toCents(l.total_cost_excl_tax ?? l.total_cost_incl_tax), 0);
    const shipping = toCents(j.shipping_cost?.total_cost_excl_tax ?? j.shipping_cost?.total_cost_incl_tax);
    const fulfil = toCents(j.fulfillment_cost?.total_cost_excl_tax ?? j.fulfillment_cost?.total_cost_incl_tax);
    const tax = toCents(j.total_tax);
    return {
      currency: j.currency || 'USD', printCostCents: lineCost, fulfillmentCents: fulfil, shippingCents: shipping, taxCents: tax,
      totalCents: toCents(total), perCopyPrintCents: Math.round((lineCost + fulfil) / Math.max(1, req.quantity)),
      podPackageId, provider: 'lulu', estimated: false,
    };
  }

  /** Exact cover size from Lulu (use for hardcover). UNVERIFIED endpoint shape; returns inches. */
  async coverDimensions(podPackageId: string, pageCount: number): Promise<{ widthIn: number; heightIn: number }> {
    const j = await this.call('POST', '/cover-dimensions/', { pod_package_id: podPackageId, interior_page_count: pageCount, unit: 'inch' });
    const w = parseFloat(j.width), h = parseFloat(j.height);
    if (!(w > 0 && h > 0)) throw new PodError('Lulu cover-dimensions response unexpected', 'LULU_UNEXPECTED_SHAPE', 502, j);
    return { widthIn: w, heightIn: h };
  }

  async createPrintJob(r: PodPrintJobRequest): Promise<PodJobStatus> {
    const podPackageId = this.podId(r.edition);
    const body = {
      contact_email: r.address.email || this.cfg.contactEmail,
      external_id: r.externalId,
      line_items: [{
        external_id: `${r.externalId}-1`, title: r.title.slice(0, 200), quantity: r.quantity,
        printable_normalization: { pod_package_id: podPackageId, cover: { source_url: r.coverUrl }, interior: { source_url: r.interiorUrl } },
      }],
      shipping_address: {
        name: r.address.name, street1: r.address.street1, street2: r.address.street2, city: r.address.city,
        state_code: r.address.stateCode, country_code: r.address.countryCode, postcode: r.address.postcode, phone_number: r.address.phone,
      },
      shipping_level: r.shippingLevel,
    };
    const j = await this.call('POST', '/print-jobs/', body);
    return this.toStatus(j);
  }

  async getStatus(id: string): Promise<PodJobStatus> { return this.toStatus(await this.call('GET', `/print-jobs/${encodeURIComponent(id)}/`)); }
  async cancel(id: string): Promise<PodJobStatus> {
    await this.call('PUT', `/print-jobs/${encodeURIComponent(id)}/status/`, { name: 'CANCELED' });
    return this.getStatus(id);
  }

  toStatus(j: any): PodJobStatus {
    const raw = String(j?.status?.name ?? j?.status ?? '').toUpperCase();
    const li = (j?.line_items ?? [])[0] ?? {};
    return {
      providerJobId: String(j?.id ?? ''), rawStatus: raw, status: LULU_STATUS_MAP[raw] ?? 'unknown',
      message: Array.isArray(j?.status?.messages) ? j.status.messages.join('; ') : j?.status?.message,
      trackingId: li.tracking_id || (li.tracking_ids ?? [])[0] || undefined,
      trackingUrls: li.tracking_urls ?? undefined, carrier: li.carrier_name || undefined,
    };
  }

  verifyWebhook(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): boolean {
    return verifyLuluHmac(rawBody, headers, this.cfg.clientSecret || '');
  }
  parseWebhook(body: any): PodJobStatus | null {
    const data = body?.data ?? body;
    if (!data?.id) return null;
    return this.toStatus(data);
  }
}

export function verifyLuluHmac(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>, secret: string): boolean {
  try {
    if (!secret) return false;
    const h = headers['lulu-hmac-sha256'] ?? headers['Lulu-HMAC-SHA256'];
    const given = String(Array.isArray(h) ? h[0] : h || '').trim().toLowerCase();
    if (!given) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const a = Buffer.from(given), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

function safeJson(t: string): any { try { return JSON.parse(t); } catch { return null; } }
