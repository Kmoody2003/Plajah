// services/livewire/cdn.ts — viewer playback URLs through the CDN (Bunny), signed when private.
//
// Public streams use plain URLs (cacheable, nothing to leak). Private / club / ticketed streams
// get a Bunny "advanced" token scoped to the stream's directory, embedded in the path so the
// player's relative segment requests inherit it:
//   https://<host>/bcdn_token=<t>&expires=<e>&token_path=<enc dir>/live/<id>/master.m3u8
// token = base64url(SHA256(securityKey + signedPath + expires + "token_path=" + dir)), no padding.
// VERIFY against Bunny's token-auth docs on the staging pull zone before relying on it — this is
// written from their documented scheme and only tested against itself.

import { createHash } from 'node:crypto';

export interface CdnConfig {
  /** Pull-zone hostname, e.g. live.plajah.b-cdn.net or live.plajah.com */
  host: string;
  /** Bunny pull-zone token authentication key. Empty = unsigned URLs only. */
  securityKey?: string;
}

export const masterPath = (streamId: string) => `/live/${streamId}/master.m3u8`;

export function publicPlaybackUrl(cfg: CdnConfig, streamId: string): string {
  return `https://${cfg.host}${masterPath(streamId)}`;
}

export function bunnyDirectoryToken(securityKey: string, dir: string, expires: number): string {
  const signedPath = dir;
  const params = `token_path=${dir}`;
  return createHash('sha256').update(securityKey + signedPath + String(expires) + params).digest('base64url');
}

export function signedPlaybackUrl(cfg: CdnConfig, streamId: string, ttlSec = 6 * 3600, nowSec = Math.floor(Date.now() / 1000)): string {
  if (!cfg.securityKey) throw new Error('CDN security key not configured');
  const dir = `/live/${streamId}/`;
  const expires = nowSec + ttlSec;
  const token = bunnyDirectoryToken(cfg.securityKey, dir, expires);
  return `https://${cfg.host}/bcdn_token=${token}&expires=${expires}&token_path=${encodeURIComponent(dir)}${masterPath(streamId)}`;
}
