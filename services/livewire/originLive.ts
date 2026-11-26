// services/livewire/originLive.ts — Plajah's own live origin (plajah-live-1 + Bunny) as a drop-in
// for Mux Live. SERVER ONLY (holds the signing + pull secrets).
//
// LIVE_PROVIDER=livewire switches both live paths off Mux:
//   • in-app Go Live  → services/liveMuxRelayServer.ts pushes the host's program here over RTMP
//   • OBS / encoders  → /api/mux/live/create hands out this origin's RTMP/SRT + a signed key
// Viewers play the Bunny pull zone: https://<LIVE_CDN_HOST>/live/<streamId>/src/index.m3u8.
// Runbook + server files: deploy/live-origin/README.md.

import { signPublishToken, STREAM_ID_RE } from './token';

export interface OriginLiveConfig {
  /** Origin IP/host (RTMP :1935, SRT :8890, HLS :8888). */
  originHost: string;
  /** Bunny pull zone host, e.g. plajahlive.b-cdn.net. */
  cdnHost: string;
  /** LIVEWIRE_SECRET — signs publish tokens; same value as on the origin. */
  secret: string;
  /** LIVE_PULL_SECRET — lets the API read the origin directly (Bearer, MediaMTX CDN mode). */
  pullSecret: string;
}

type Env = Record<string, string | undefined>;

/** The origin config, or null when any piece is missing. */
export function originLiveConfig(env: Env = process.env): OriginLiveConfig | null {
  const originHost = (env.LIVE_ORIGIN_HOST || '').trim();
  const cdnHost = (env.LIVE_CDN_HOST || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const secret = env.LIVEWIRE_SECRET || '';
  const pullSecret = env.LIVE_PULL_SECRET || '';
  if (!originHost || !cdnHost || secret.length < 32 || !pullSecret) return null;
  return { originHost, cdnHost, secret, pullSecret };
}

/** 'livewire' only when switched on AND fully configured; anything else keeps Mux. */
export function liveProvider(env: Env = process.env): 'livewire' | 'mux' {
  return (env.LIVE_PROVIDER || '').trim().toLowerCase() === 'livewire' && originLiveConfig(env) ? 'livewire' : 'mux';
}

/** Ids for OBS-path streams (the in-app path reuses the Plajah stream id). */
export function newOriginStreamId(rand: () => string = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20)): string {
  return `lw_${rand()}`;
}

export const isOriginStreamId = (id: string) => /^lw_[A-Za-z0-9]{6,64}$/.test(id);

/** Publish credentials for one stream. The token is the whole secret: short-lived and path-bound. */
export function originIngest(cfg: OriginLiveConfig, streamId: string, uid: string, ttlSec = 12 * 3600, nowSec = Date.now() / 1000) {
  if (!STREAM_ID_RE.test(streamId)) throw new Error('bad stream id');
  const token = signPublishToken({ streamId, uid, expiresAt: nowSec + ttlSec }, cfg.secret);
  const q = `user=pub&pass=${encodeURIComponent(token)}`;
  return {
    /** Full RTMP URL (ffmpeg / relay). */
    rtmpUrl: `rtmp://${cfg.originHost}/live/${streamId}/src?${q}`,
    /** OBS splits it: Server + Stream Key. */
    obsServer: `rtmp://${cfg.originHost}/live/${streamId}`,
    obsStreamKey: `src?${q}`,
    srtUrl: `srt://${cfg.originHost}:8890?streamid=publish:live/${streamId}/src:pub:${token}`,
    expiresAt: Math.floor(nowSec + ttlSec),
  };
}

/** What viewers load (through Bunny). */
export function originPlaybackUrl(cfg: OriginLiveConfig, streamId: string): string {
  return `https://${cfg.cdnHost}/live/${streamId}/src/index.m3u8`;
}

/** True once the origin is receiving this stream (asks the origin directly, not the CDN cache). */
export async function originIsLive(cfg: OriginLiveConfig, streamId: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!STREAM_ID_RE.test(streamId)) return false;
  try {
    const r = await fetchFn(`http://${cfg.originHost}:8888/live/${streamId}/src/index.m3u8`, {
      headers: { Authorization: `Bearer ${cfg.pullSecret}` },
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    });
    return r.status === 200;
  } catch { return false; }
}
