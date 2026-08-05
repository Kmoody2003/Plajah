/**
 * Gelato Service — Frontend proxy layer
 * All calls go to /api/merch/gelato/* on the Plajah server.
 * Best for: fastest global delivery (local printers in 32 countries, ships to 200+).
 * The server holds the actual Gelato API key — it never reaches the browser.
 */

import { auth } from './backendService';

const authHeader = async (): Promise<HeadersInit> => {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GelatoProduct {
  productUid: string;
  title: string;
  description: string;
  coverImageUrl: string;
  supportedCountries: string[];
}

export interface GelatoVariant {
  variantUid: string;
  title: string;
  price: number; // in cents
  currency: string;
  color?: string;
  size?: string;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export const fetchGelatoCatalog = async (): Promise<GelatoProduct[]> => {
  const res = await fetch('/api/merch/gelato/catalog', { headers: await authHeader() });
  const data = await res.json();
  return data.products ?? [];
};

export const fetchGelatoVariants = async (productUid: string): Promise<GelatoVariant[]> => {
  const res = await fetch(`/api/merch/gelato/products/${productUid}/variants`, {
    headers: await authHeader(),
  });
  const data = await res.json();
  return data.variants ?? [];
};

// ─── Mockup ───────────────────────────────────────────────────────────────────

export const fetchGelatoMockup = async (productUid: string, designUrl: string): Promise<string> => {
  const headers = await authHeader();
  const res = await fetch(`/api/merch/gelato/mockup/${productUid}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl: designUrl }),
  });
  const data = await res.json();
  return data.mockupUrl ?? '';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Suggests a retail price at 2.5x the Gelato base cost (base is in cents) */
export const suggestGelatoRetailPrice = (basePriceCents: number): number => {
  const base = basePriceCents / 100;
  return Math.ceil(base * 2.5);
};

/** Representative list of Gelato-supported country codes (200+ total) */
export const GELATO_SUPPORTED_COUNTRIES = [
  'US','CA','GB','DE','FR','IT','ES','NL','BE','SE','NO','DK','FI','PL','AU',
  'NZ','JP','KR','SG','HK','IN','BR','MX','ZA','AE','SA','NG','KE','GH','EG',
  'AR','CL','CO','PE','PT','IE','AT','CH','CZ','SK','HU','RO','BG','HR','SI',
  'RS','GR','TR','UA','IL','TH','MY','ID','PH','VN','PK','BD','LK','TW','CN',
];
