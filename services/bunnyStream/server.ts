// services/bunnyStream/server.ts — Bunny Stream API calls + signing. SERVER ONLY (holds the library key).
// Checked against bunny.net/docs 2026-11-24 (create/get/delete/upload video, TUS uploads, webhooks).

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isBunnyGuid, type BunnyStreamConfig } from './core';

type Fetch = typeof fetch;
const API = 'https://video.bunnycdn.com';

export interface BunnyVideo {
  guid: string;
  title: string;
  status: number;
  /** seconds */
  length: number;
  width: number;
  height: number;
  availableResolutions: string | null;
  encodeProgress: number;
  storageSize?: number;
  hasMP4Fallback?: boolean;
}

async function call<T>(cfg: BunnyStreamConfig, method: string, path: string, body?: unknown, f: Fetch = fetch): Promise<T> {
  const r = await f(`${API}/library/${cfg.libraryId}${path}`, {
    method,
    headers: { AccessKey: cfg.apiKey, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Bunny ${method} ${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

/** Creates an empty video and returns its guid. thumbnailTimeMs picks the poster frame. */
export async function createVideo(cfg: BunnyStreamConfig, title: string, thumbnailTimeMs?: number, f?: Fetch): Promise<BunnyVideo> {
  const clean = String(title || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200) || 'Untitled video';
  return call<BunnyVideo>(cfg, 'POST', '/videos', { title: clean, ...(thumbnailTimeMs ? { thumbnailTime: Math.round(thumbnailTimeMs) } : {}) }, f);
}

export async function getVideo(cfg: BunnyStreamConfig, guid: string, f?: Fetch): Promise<BunnyVideo> {
  if (!isBunnyGuid(guid)) throw new Error('bad Bunny video id');
  return call<BunnyVideo>(cfg, 'GET', `/videos/${guid}`, undefined, f);
}

/** Irreversible. Only ever call for videos Plajah created and that have no live reference. */
export async function deleteVideo(cfg: BunnyStreamConfig, guid: string, f?: Fetch): Promise<void> {
  if (!isBunnyGuid(guid)) throw new Error('bad Bunny video id');
  await call(cfg, 'DELETE', `/videos/${guid}`, undefined, f);
}

/** Server-side upload of a whole file into an existing video (migration path: master → Bunny). */
export async function uploadVideoBody(cfg: BunnyStreamConfig, guid: string, body: ReadableStream | Buffer | Blob, size: number, f: Fetch = fetch): Promise<void> {
  if (!isBunnyGuid(guid)) throw new Error('bad Bunny video id');
  const q = cfg.resolutions ? `?enabledResolutions=${encodeURIComponent(cfg.resolutions)}` : '';
  const r = await f(`${API}/library/${cfg.libraryId}/videos/${guid}${q}`, {
    method: 'PUT',
    headers: { AccessKey: cfg.apiKey, 'content-type': 'application/octet-stream', 'content-length': String(size) },
    body: body as any,
    duplex: 'half',
  } as RequestInit);
  if (!r.ok) throw new Error(`Bunny upload ${guid}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
}

export interface TusUploadAuth {
  endpoint: string;
  headers: { AuthorizationSignature: string; AuthorizationExpire: string; VideoId: string; LibraryId: string; EnabledResolutions?: string };
  expiresAt: number;
}

/** Headers that let the browser TUS-upload straight to Bunny for ONE video, without ever seeing the key.
 *  signature = SHA256 hex of (library_id + api_key + expiration_time + video_id), no separators. */
export function tusUploadAuth(cfg: BunnyStreamConfig, guid: string, ttlSec = 24 * 3600, nowSec = Math.floor(Date.now() / 1000)): TusUploadAuth {
  if (!isBunnyGuid(guid)) throw new Error('bad Bunny video id');
  const expiresAt = nowSec + Math.max(3600, ttlSec); // Bunny re-checks expiry on every PATCH; docs recommend ≥1 h
  const sig = createHash('sha256').update(cfg.libraryId + cfg.apiKey + String(expiresAt) + guid).digest('hex');
  return {
    endpoint: `${API}/tusupload`,
    headers: {
      AuthorizationSignature: sig, AuthorizationExpire: String(expiresAt), VideoId: guid, LibraryId: cfg.libraryId,
      ...(cfg.resolutions ? { EnabledResolutions: cfg.resolutions } : {}),
    },
    expiresAt,
  };
}

/** Webhooks: X-BunnyStream-Signature = lowercase hex HMAC-SHA256(raw body bytes, read-only API key).
 *  Must be the exact bytes received; never re-serialised JSON. */
export function verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, readOnlyKey: string): boolean {
  const h = (n: string) => { const v = headers[n] ?? headers[n.toLowerCase()]; return Array.isArray(v) ? v[0] : v; };
  const sig = String(h('x-bunnystream-signature') || '');
  const version = String(h('x-bunnystream-signature-version') || 'v1');
  const alg = String(h('x-bunnystream-signature-algorithm') || 'hmac-sha256').toLowerCase();
  if (version !== 'v1' || alg !== 'hmac-sha256' || !/^[0-9a-f]{64}$/i.test(sig) || !readOnlyKey) return false;
  const want = createHmac('sha256', readOnlyKey).update(rawBody).digest();
  return timingSafeEqual(want, Buffer.from(sig.toLowerCase(), 'hex'));
}
