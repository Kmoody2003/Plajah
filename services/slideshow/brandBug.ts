// The plajah.com bug: the Plajah mark with "plajah.com" under it, small, lower-right, burned
// into rendered videos and published (shared) shows on the Free and Spark plans. Plajah+
// plans from $9.99 a month (Glow and up) remove it (Kenne, 2026-11-18). Never shown in the
// studio's own preview. Drawn on the text layer, so grades and lenses never touch it.

import * as THREE from 'three';
import { fetchMySubscription } from '../subscriptionService';
import { genCloud } from '../genCloud/client';

/** Monthly price per plan (Help Center: Spark $4.99, Glow $9.99, Nova $14.99; the rest are higher). */
export const PLAN_PRICE_USD: Record<string, number> = {
  free: 0, spark: 4.99, glow: 9.99, nova: 14.99,
  all_access: 29.99, studio_max: 59.99, studio_team: 99.99, production_house: 199.99,
};
/** The bug comes off from this monthly price up. */
export const BUG_FREE_FROM_USD = 9.99;
const TIER_PLAN: Record<number, string> = { 1: 'spark', 2: 'glow', 3: 'nova' };

export const bugRemovedFor = (plan: string) => (PLAN_PRICE_USD[plan] ?? 0) >= BUG_FREE_FROM_USD;

/** The signed-in account's plan id ('free' when unknown or signed out). */
export async function myPlan(): Promise<string> {
  try {
    const b = await genCloud.balance();
    if (b.ok && (b as any).plan) return (b as any).plan as string;
  } catch { /* gen cloud off */ }
  try {
    const sub = await fetchMySubscription();
    if (sub) return (sub as any).planId || TIER_PLAN[Number(sub.tier)] || 'spark';
  } catch { /* no client read */ }
  return 'free';
}

/** True when renders and shares from this account carry the bug. */
export async function needsBrandBug(): Promise<boolean> { return !bugRemovedFor(await myPlan()); }

// --- drawing ------------------------------------------------------------------------------

let texP: Promise<THREE.Texture> | null = null;
export function loadBugTexture(): Promise<THREE.Texture> {
  texP ??= (async () => {
    const W = 360, H = 120;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    let icon: ImageBitmap | null = null;
    try { icon = await createImageBitmap(await (await fetch('/plajah-app-icon-192.png')).blob()); } catch { /* text only */ }
    g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 10;
    const s = 64;
    if (icon) {
      const x = W - s - 6, y = 4;
      g.save();
      g.beginPath(); g.roundRect(x, y, s, s, 14); g.clip();
      g.drawImage(icon, x, y, s, s);
      g.restore();
    }
    g.font = "700 34px 'Outfit', 'Inter', system-ui, sans-serif";
    g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillText('plajah.com', W - 6, H - 10);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  return texP;
}
