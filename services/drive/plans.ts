// services/drive/plans.ts — Plajah Drive storage: what each plan includes and what add-ons cost.
//
// Owner decision 2026-11-08: Drive files, Transfers and storage add-ons live on Backblaze B2, with
// downloads served through Bunny CDN (B2 → Bunny egress is free). Firebase Storage would cost
// ~$26/TB-month plus ~$120/TB downloaded, which no storage plan can carry.
// Prices are the proposal from the pricing plan; change them here only. Pure.

export const GiB = 1024 ** 3;
export const TiB = 1024 * GiB;

export type DrivePlan = 'free' | 'spark' | 'glow' | 'nova' | 'all_access' | 'studio_max' | 'studio_team' | 'production_house';

/** Storage included with the plan (team plans: one shared pool). */
export const INCLUDED_BYTES: Record<DrivePlan, number> = {
  free: 5 * GiB,
  spark: 50 * GiB,
  glow: 75 * GiB,
  nova: 100 * GiB,
  all_access: 250 * GiB,
  studio_max: 1 * TiB,
  studio_team: 3 * TiB,
  production_house: 10 * TiB,
};

/** Largest single file a plan may upload (B2 allows 10 TB per object via multipart). */
export const MAX_FILE_BYTES: Record<DrivePlan, number> = {
  free: 2 * GiB,
  spark: 20 * GiB,
  glow: 20 * GiB,
  nova: 50 * GiB,
  all_access: 100 * GiB,
  studio_max: 250 * GiB,
  studio_team: 250 * GiB,
  production_house: 500 * GiB,
};

export interface AddOn { sku: string; bytes: number; priceUsd: number; scope: 'personal' | 'org' }

export const ADD_ONS: AddOn[] = [
  { sku: 'drive_250g', bytes: 250 * GiB, priceUsd: 2.99, scope: 'personal' },
  { sku: 'drive_1t', bytes: 1 * TiB, priceUsd: 7.99, scope: 'personal' },
  { sku: 'drive_2t', bytes: 2 * TiB, priceUsd: 13.99, scope: 'personal' },
  { sku: 'drive_5t', bytes: 5 * TiB, priceUsd: 34.99, scope: 'personal' },
  { sku: 'pool_1t', bytes: 1 * TiB, priceUsd: 9.99, scope: 'org' },
  { sku: 'pool_5t', bytes: 5 * TiB, priceUsd: 39.99, scope: 'org' },
  { sku: 'pool_10t', bytes: 10 * TiB, priceUsd: 69.99, scope: 'org' },
  { sku: 'pool_25t', bytes: 25 * TiB, priceUsd: 149.99, scope: 'org' },
];

/** Org pools past 25 TB: per extra TB per month. */
export const POOL_EXTRA_TB_USD = 6.5;

export const addOnBySku = (sku: string) => ADD_ONS.find(a => a.sku === sku);

// ── Cost model (estimates, Nov 2026 — verify backblaze.com / bunny.net pricing) ──────────────────

export const B2_PER_TB_MONTH = 6.95;
/** Trash (30 days), old versions and thumbnails on top of live bytes. */
export const OVERHEAD = 1.2;
export const BUNNY_PER_GB = 0.01;
/** Share of stored data downloaded per month (previews, shares, syncing devices). */
export const MONTHLY_READ_RATIO = 0.1;

/** Platform cost per month for `bytes` of allowance at a given fill ratio (0..1). */
export function monthlyCostUsd(bytes: number, fill: number): number {
  const tb = (bytes * fill) / TiB;
  const storage = tb * B2_PER_TB_MONTH * OVERHEAD;
  const delivery = tb * 1024 * MONTHLY_READ_RATIO * BUNNY_PER_GB;
  return Math.round((storage + delivery) * 100) / 100;
}

/** Stripe's estimated cut (2.9% + 30¢) — Plajah keeps the rest. */
export const afterStripe = (usd: number) => Math.round((usd - (usd * 0.029 + 0.3)) * 100) / 100;
