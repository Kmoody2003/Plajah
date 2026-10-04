// musicAccess — who may hear a priced release in full.
//
// Rule: priced music streams in full. ONLY when the artist deliberately sets album.previewOnly does a
// non-buyer get a PREVIEW_SECONDS preview (artist and buyers always hear it all). A buyer's licence (users/{uid}/contentLicenses, kind album|track, minted by the Stripe
// webhook) is cached here on sign-in so the player can decide synchronously on every timeupdate.
//
// This is a soft, client-side gate: the audio URLs themselves are not signed, so it keeps honest
// listeners honest and drives the buy flow, but is not DRM. Hard protection needs signed, expiring
// URLs minted server-side (follow-up).

import type { Album, Track } from '../types';
import { listContentLicenses } from './contentLicense';

export const PREVIEW_SECONDS = 30;
export const MUSIC_LOCKED_EVENT = 'plajah:music-locked';

const owned = new Set<string>();
let loadedFor = '';

export const albumKey = (albumId: string) => `album:${albumId}`;
export const trackKey = (albumId: string, trackId: string) => `track:${albumId}__${trackId}`;

/** Load (or reload) the signed-in user's purchased albums/tracks. Call on sign-in and after a purchase. */
export async function loadOwnedMusic(uid: string | undefined | null, force = false): Promise<void> {
  if (!uid) { owned.clear(); loadedFor = ''; return; }
  if (!force && loadedFor === uid) return;
  const licenses = await listContentLicenses(uid);
  owned.clear();
  for (const l of licenses) {
    if (l.expiresAt != null && l.expiresAt <= Date.now()) continue;
    if (l.kind === 'album') owned.add(albumKey(l.contentId));
    else if (l.kind === 'track') owned.add(`track:${l.contentId}`);
  }
  loadedFor = uid;
}

export function ownsRelease(albumId: string, trackId?: string): boolean {
  return owned.has(albumKey(albumId)) || (!!trackId && owned.has(trackKey(albumId, trackId)));
}

/** Is this track preview-only? Only when the artist deliberately chose it (album.previewOnly) AND it has a price.
 *  A price alone never gates playback: Chora streams in full, and buying means owning / downloading. */
export function isPreviewOnly(track: Track | null | undefined, album: Album | null | undefined): boolean {
  if (!track || !album) return false;
  if ((track as any).isPersonalMedia) return false;                 // locker copies are the user's own
  return !!album.previewOnly && ((album.price ?? 0) > 0 || (track.price ?? 0) > 0);
}

/** May this user hear the whole track? Synchronous — relies on loadOwnedMusic having run. */
export function canPlayFull(track: Track | null | undefined, album: Album | null | undefined, uid?: string | null): boolean {
  if (!isPreviewOnly(track, album)) return true;
  if (uid && album && album.ownerId === uid) return true;
  return !!album && !!track && ownsRelease(album.id, track.id);
}
