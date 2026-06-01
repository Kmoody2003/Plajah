/**
 * Printful Service — Frontend proxy layer
 * All calls go to /api/merch/printful/* on the Plajah server.
 * The server holds the actual Printful API key — it never reaches the browser.
 */

import { auth } from './backendService';

const authHeader = async (): Promise<HeadersInit> => {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrintfulProduct {
  id: number;
  title: string;
  description: string;
  image: string;
  variants: PrintfulVariant[];
}

export interface PrintfulVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  color: string;
  size: string;
  availability_status: string;
}

export interface PrintfulMockup {
  placement: string;
  mockup_url: string;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const fetchPrintfulCatalog = async (): Promise<PrintfulProduct[]> => {
  const res = await fetch('/api/merch/printful/catalog', { headers: await authHeader() });
  const data = await res.json();
  return data.result ?? [];
};

export const fetchProductVariants = async (productId: number): Promise<PrintfulVariant[]> => {
  const res = await fetch(`/api/merch/printful/products/${productId}`, { headers: await authHeader() });
  const data = await res.json();
  return data.result?.variants ?? [];
};

// ─── File Upload ──────────────────────────────────────────────────────────────

export const uploadDesignFile = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('file', file);

  const headers = await authHeader();
  const res = await fetch('/api/merch/printful/files', {
    method: 'POST',
    headers, // no Content-Type override; browser sets multipart boundary
    body: formData,
  });

  const data = await res.json();
  if (!data.result?.url) throw new Error('Design upload failed: ' + JSON.stringify(data));
  return data.result.url as string;
};

// ─── Mockup Generation ────────────────────────────────────────────────────────

export const generateMockups = async (
  productId: number,
  variantIds: number[],
  designUrl: string,
  placement = 'front'
): Promise<string[]> => {
  const headers = await authHeader();

  // Create mockup task via backend proxy
  const res = await fetch(`/api/merch/printful/mockup/${productId}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variant_ids: variantIds,
      format: 'jpg',
      files: [{
        placement,
        image_url: designUrl,
        position: { area_width: 1800, area_height: 2400, width: 1800, height: 1800, top: 300, left: 0 },
      }],
    }),
  });

  const taskData = await res.json();
  const taskKey = taskData.result?.task_key;
  if (!taskKey) throw new Error('Mockup task creation failed');

  return pollMockupTask(taskKey, headers);
};

const pollMockupTask = async (taskKey: string, headers: HeadersInit, retries = 10): Promise<string[]> => {
  for (let i = 0; i < retries; i++) {
    await delay(2000);
    const res = await fetch(`/api/merch/printful/mockup/task?task_key=${taskKey}`, { headers });
    const data = await res.json();
    if (data.result?.status === 'completed') {
      return (data.result.mockups as PrintfulMockup[]).map(m => m.mockup_url);
    }
    if (data.result?.status === 'failed') throw new Error('Mockup generation failed');
  }
  throw new Error('Mockup generation timed out');
};

// ─── Sync Product ─────────────────────────────────────────────────────────────

export interface CreateSyncProductInput {
  artistId: string;
  productName: string;
  description: string;
  retailPrice: number;
  variantId: number;
  designUrl: string;
  placement?: string;
}

export const createSyncProduct = async (input: CreateSyncProductInput): Promise<{ syncProductId: number; thumbnailUrl: string }> => {
  const { artistId, productName, description, retailPrice, variantId, designUrl, placement = 'front' } = input;
  const headers = await authHeader();

  const res = await fetch('/api/merch/printful/products', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sync_product: {
        external_id: `${artistId}-${Date.now()}`,
        name: productName,
        description,
        is_ignored: false,
      },
      sync_variants: [{
        external_id: `${artistId}-variant-${variantId}`,
        variant_id: variantId,
        retail_price: retailPrice.toFixed(2),
        files: [{ placement, url: designUrl }],
      }],
    }),
  });

  const data = await res.json();
  if (!data.result) throw new Error('Sync product creation failed: ' + JSON.stringify(data));

  return {
    syncProductId: data.result.id as number,
    thumbnailUrl: data.result.thumbnail_url as string,
  };
};

// ─── Checkout ─────────────────────────────────────────────────────────────────

export interface MerchCheckoutItem {
  title: string;
  imageUrl: string;
  price: number;
  quantity: number;
  printfulSyncProductId?: number;
  printfulVariantId?: number;
}

/** Initiates a Stripe checkout session for merch — redirects to Stripe hosted page */
export const startMerchCheckout = async (
  items: MerchCheckoutItem[],
  artistId: string,
  fulfillmentSource: 'printful' | 'gelato'
): Promise<void> => {
  const headers = await authHeader();
  const res = await fetch('/api/merch/checkout', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, artistId, fulfillmentSource }),
  });
  const data = await res.json();
  if (!data.url) throw new Error('Checkout session creation failed');
  window.location.href = data.url; // redirect to Stripe
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Suggests a retail price at 2.5x the Printful base cost */
export const suggestRetailPrice = (baseCostStr: string): number => {
  const base = parseFloat(baseCostStr);
  return Math.ceil(base * 2.5);
};
