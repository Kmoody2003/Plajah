/**
 * Ad events — the one place the app tells the server an ad was shown or clicked.
 *
 * Fire-and-forget: a failed beacon never affects the viewer. The server (routes/adPlatform.ts) turns
 * these into the impression / click figures in the admin Ad Platform; before this nothing recorded them.
 */
export type AdSourceKind = 'config' | 'userAd' | 'album' | 'promo' | 'onair' | 'store' | 'product' | 'live' | 'profile' | 'plus' | 'other';

const recentImpressions = new Map<string, number>();
/** The same placement in the same panel counts once per this long, however often React re-renders it. */
const IMPRESSION_COOLDOWN_MS = 8_000;

export function reportAdEvent(adId: string | undefined | null, kind: 'impression' | 'click', sourceKind: AdSourceKind = 'other'): void {
  if (!adId || typeof window === 'undefined') return;
  const id = String(adId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
  if (!id) return;
  if (kind === 'impression') {
    const key = `${sourceKind}:${id}`;
    const last = recentImpressions.get(key) || 0;
    if (Date.now() - last < IMPRESSION_COOLDOWN_MS) return;
    recentImpressions.set(key, Date.now());
  }
  try {
    fetch('/api/ads/event', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adId: id, kind, sourceKind }),
    }).catch(() => { /* a lost beacon is acceptable */ });
  } catch { /* ignore */ }
}
