/**
 * GET /api/rtc/ice — short-lived TURN credentials for WebRTC (Live Talk, calls, rooms).
 *
 * TURN keys never ship in the client bundle. Configure ONE provider in server env:
 *   Cloudflare Realtime TURN:  CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN
 *   Metered:                   METERED_API_KEY + METERED_APP_DOMAIN (e.g. "plajah.metered.live")
 * Optional: RTC_TURN_TTL_SECONDS (default 14400 = 4h).
 *
 * Unconfigured → 200 { iceServers: [], provider: null } and the client keeps its static fallback
 * (services/iceConfig.ts). Credentials are cached per server instance for half their TTL.
 */
import { Router } from 'express';

interface Deps { authMiddleware: any; limiter?: any }

type Ice = { urls: string | string[]; username?: string; credential?: string };

/** Normalise provider responses: Cloudflare `/credentials/generate` returns { iceServers: {…} },
 *  `/generate-ice-servers` returns { iceServers: [...] }, Metered returns a bare array. */
export function normalizeIceResponse(body: any): Ice[] {
  const raw = Array.isArray(body) ? body : body?.iceServers;
  const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .filter(s => s && (typeof s.urls === 'string' || Array.isArray(s.urls)))
    .map(s => ({
      urls: s.urls,
      ...(typeof s.username === 'string' ? { username: s.username } : {}),
      ...(typeof s.credential === 'string' ? { credential: s.credential } : {}),
    }));
}

function ttlSeconds() {
  const n = Number(process.env.RTC_TURN_TTL_SECONDS);
  return Number.isFinite(n) && n >= 600 ? Math.min(n, 48 * 3600) : 4 * 3600;
}

let cache: { body: { iceServers: Ice[]; ttl: number; provider: string | null }; until: number } | null = null;

async function generate(): Promise<{ iceServers: Ice[]; ttl: number; provider: string | null }> {
  const ttl = ttlSeconds();
  const cfKey = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cfToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (cfKey && cfToken) {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cfKey)}/credentials/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }),
    });
    if (!r.ok) throw new Error(`cloudflare turn ${r.status}`);
    return { iceServers: normalizeIceResponse(await r.json()), ttl, provider: 'cloudflare' };
  }
  const meteredKey = process.env.METERED_API_KEY;
  const meteredDomain = process.env.METERED_APP_DOMAIN;
  if (meteredKey && meteredDomain) {
    const host = meteredDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const r = await fetch(`https://${host}/api/v1/turn/credentials?apiKey=${encodeURIComponent(meteredKey)}`);
    if (!r.ok) throw new Error(`metered turn ${r.status}`);
    // Metered credentials are long-lived per key; still tell the client to refresh periodically.
    return { iceServers: normalizeIceResponse(await r.json()), ttl, provider: 'metered' };
  }
  return { iceServers: [], ttl: 600, provider: null };
}

export function createRtcIceRouter({ authMiddleware, limiter }: Deps): Router {
  const r = Router();
  const mw = limiter ? [limiter, authMiddleware] : [authMiddleware];
  r.get('/', ...mw, async (_req: any, res: any) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      if (!cache || Date.now() > cache.until) {
        const body = await generate();
        cache = { body, until: Date.now() + (body.ttl * 1000) / 2 };
      }
      res.json(cache.body);
    } catch (e: any) {
      console.warn('[rtc/ice] TURN credential fetch failed:', e?.message || e);
      res.json({ iceServers: [], ttl: 60, provider: null });
    }
  });
  return r;
}
