// iceConfig.ts — the ICE/TURN servers every real-time feature uses. STUN alone fails across
// symmetric NATs / strict firewalls (~10-20% of connections); a TURN relay makes WebRTC reliable.
//
// Resolution order:
//   1. resolveIceServers(): short-lived TURN creds from our server (GET /api/rtc/ice — see
//      routes/rtcIce.ts; Cloudflare Realtime TURN or Metered, keys live only in server env),
//      cached until shortly before they expire.
//   2. getIceServers() (sync fallback): build-env TURN (VITE_TURN_URLS comma-separated +
//      VITE_TURN_USERNAME + VITE_TURN_CREDENTIAL), else a best-effort public relay.

import { auth } from './firebase';

let cached: RTCIceServer[] | null = null;

const STUN: RTCIceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] };

export function getIceServers(): RTCIceServer[] {
  if (cached) return cached;
  const env: any = (import.meta as any).env || {};
  const servers: RTCIceServer[] = [STUN];

  const turnUrls = String(env.VITE_TURN_URLS || '').split(',').map((s: string) => s.trim()).filter(Boolean);
  if (turnUrls.length && env.VITE_TURN_USERNAME) {
    servers.push({ urls: turnUrls, username: String(env.VITE_TURN_USERNAME), credential: String(env.VITE_TURN_CREDENTIAL || '') });
  } else {
    // Best-effort public TURN fallback (rate-limited). Configure CLOUDFLARE_TURN_* or METERED_* on
    // the server (routes/rtcIce.ts) for production-grade reliability.
    servers.push(
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
    );
  }

  cached = servers;
  return servers;
}

let remote: { servers: RTCIceServer[] | null; until: number } | null = null;
let inflight: Promise<RTCIceServer[] | null> | null = null;

async function fetchRemote(): Promise<RTCIceServer[] | null> {
  const token = await auth.currentUser?.getIdToken?.().catch(() => undefined);
  if (!token) return null;
  const res = await fetch('/api/rtc/ice', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const body = await res.json().catch(() => null) as { iceServers?: RTCIceServer[]; ttl?: number } | null;
  const list = Array.isArray(body?.iceServers) ? body!.iceServers!.filter(s => s && s.urls) : [];
  const hasTurn = list.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => /^turns?:/.test(String(u))));
  if (!hasTurn) return null;
  const ttlMs = Math.max(60, Number(body?.ttl) || 3600) * 1000;
  remote = { servers: [STUN, ...list], until: Date.now() + ttlMs - 5 * 60_000 };
  return remote.servers;
}

/** Best available ICE list. Never takes longer than `timeoutMs` (falls back to getIceServers()). */
export async function resolveIceServers(timeoutMs = 1500): Promise<RTCIceServer[]> {
  if (remote && Date.now() < remote.until) return remote.servers || getIceServers();
  if (!inflight) {
    inflight = fetchRemote()
      .catch(() => null)
      .then(r => {
        // Not configured / failed: remember for a minute so every join doesn't re-ask.
        if (!r) remote = { servers: null, until: Date.now() + 60_000 };
        return r;
      })
      .finally(() => { inflight = null; });
  }
  const timeout = new Promise<null>(r => setTimeout(() => r(null), timeoutMs));
  const got = await Promise.race([inflight, timeout]);
  return got || getIceServers();
}

/** Warm the cache (call when a live surface mounts so the join itself doesn't wait). */
export function prefetchIceServers(): void { void resolveIceServers(10_000); }
