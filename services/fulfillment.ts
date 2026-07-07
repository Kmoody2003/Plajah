// fulfillment — a provider-agnostic layer so a store can plug into ANY fulfillment API.
//
// Printful and Gelato already have server-side integrations (/api/merch/*); those stay
// as-is and are represented here as delegating providers. The new capability is the
// generic, config-driven HTTP adapter: point it at any REST endpoint and orders POST
// there in a normalized shape — dropship, 3PL, a warehouse, a partner API, whatever.
// New providers register at runtime via registerFulfillmentProvider().

export interface FulfillmentAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  email?: string;
  phone?: string;
}

export interface FulfillmentLineItem {
  productId: string;
  title?: string;
  quantity: number;
  externalId?: string;   // the provider's catalog id for this product/variant
  variantId?: string;
  sku?: string;
}

export interface FulfillmentOrder {
  orderId: string;               // Plajah storeOrders id
  items: FulfillmentLineItem[];
  shipTo: FulfillmentAddress;
  note?: string;
}

export interface FulfillmentResult {
  ok: boolean;
  providerOrderId?: string;
  status?: string;               // e.g. 'submitted' | 'awaiting_manual' | 'error'
  trackingNumber?: string;
  error?: string;
}

export interface FulfillmentProvider {
  id: string;                    // 'manual' | 'printful' | 'gelato' | 'api' | custom
  label: string;
  /** Submit an order to the provider. */
  createOrder(order: FulfillmentOrder): Promise<FulfillmentResult>;
  /** Optional: poll a provider order's status. */
  getStatus?(providerOrderId: string): Promise<FulfillmentResult>;
  /** Optional: cancel a submitted order. */
  cancelOrder?(providerOrderId: string): Promise<FulfillmentResult>;
}

// ── Registry ───────────────────────────────────────────────────────────────────
const registry = new Map<string, FulfillmentProvider>();
export const registerFulfillmentProvider = (p: FulfillmentProvider): void => { registry.set(p.id, p); };
export const getFulfillmentProvider = (id: string): FulfillmentProvider | undefined => registry.get(id);
export const listFulfillmentProviders = (): FulfillmentProvider[] => [...registry.values()];

/** Dispatch an order to a provider by id. Falls back to manual if unknown. */
export const fulfillOrder = async (providerId: string | undefined, order: FulfillmentOrder): Promise<FulfillmentResult> => {
  const provider = registry.get(providerId || 'manual') || registry.get('manual')!;
  try {
    return await provider.createOrder(order);
  } catch (e: any) {
    return { ok: false, status: 'error', error: e?.message || 'Fulfillment failed' };
  }
};

// ── Built-in providers ───────────────────────────────────────────────────────

// Manual — the store owner ships it themselves. Always succeeds (nothing to call).
const manualProvider: FulfillmentProvider = {
  id: 'manual',
  label: 'Manual (self-fulfilled)',
  async createOrder() { return { ok: true, status: 'awaiting_manual' }; },
};

// Printful / Gelato — handled server-side by the existing checkout webhook
// (/api/merch/checkout → /api/merch/stripe-webhook). Represented here so they appear
// in the provider list and route intent; the client does not re-create the order.
const serverDelegated = (id: string, label: string): FulfillmentProvider => ({
  id, label,
  async createOrder() { return { ok: true, status: 'submitted_server_side' }; },
});

// Generic HTTP adapter — the "plug into any API" provider. Configure it once with an
// endpoint (+ optional auth header) and orders POST there in the normalized shape.
export interface GenericApiConfig {
  endpoint: string;
  method?: 'POST' | 'PUT';
  authHeader?: string;           // e.g. "Bearer sk_live_…"
  extraHeaders?: Record<string, string>;
  /** Map our FulfillmentResult out of the provider's JSON (best-effort default). */
  parseResult?: (json: any) => FulfillmentResult;
}

export const makeGenericApiProvider = (id: string, label: string, cfg: GenericApiConfig): FulfillmentProvider => ({
  id, label,
  async createOrder(order) {
    const res = await fetch(cfg.endpoint, {
      method: cfg.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.authHeader ? { Authorization: cfg.authHeader } : {}),
        ...(cfg.extraHeaders || {}),
      },
      body: JSON.stringify(order),
    });
    if (!res.ok) return { ok: false, status: 'error', error: `Provider responded ${res.status}` };
    const json = await res.json().catch(() => ({}));
    if (cfg.parseResult) return cfg.parseResult(json);
    return { ok: true, providerOrderId: json.id || json.orderId, status: json.status || 'submitted', trackingNumber: json.trackingNumber };
  },
});

// Register the built-ins on load.
registerFulfillmentProvider(manualProvider);
registerFulfillmentProvider(serverDelegated('printful', 'Printful (print-on-demand)'));
registerFulfillmentProvider(serverDelegated('gelato', 'Gelato (print-on-demand)'));
