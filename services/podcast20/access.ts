// Which albums and tracks may appear in a PUBLIC podcast feed. A feed is open to anyone and is copied
// by every podcast app and index, so anything private, paid, held or not yet released stays out.

import { canAirTrack, isSongTrack } from '../rights/trackClearance';
import type { Podcast20Settings } from './types';

type AlbumLike = Record<string, any>;
type TrackLike = Record<string, any>;

export type FeedBlock =
  | 'not_found' | 'draft' | 'private' | 'removed' | 'paywalled' | 'unreleased' | 'not_a_feed';

const isRemoved = (d: AlbumLike | TrackLike) => d?.moderationStatus === 'removed' || !!d?.copyrightHold;

/** Why this album has no public feed, or null when it may have one. */
export function albumFeedBlock(album: AlbumLike | null | undefined, settings?: Podcast20Settings | null, now = Date.now()): FeedBlock | null {
  if (!album) return 'not_found';
  if (album.isDraft) return 'draft';
  if (album.isPrivate || album.isPublic === false || album.isIntimateOnly) return 'private';
  if (isRemoved(album)) return 'removed';
  if (album.isPaywalled || album.sealed || (album.previewOnly && Number(album.price) > 0)) return 'paywalled';
  const release = Number(album.releaseDate);
  if (Number.isFinite(release) && release > now) return 'unreleased';
  const podcastShaped = album.subType === 'PODCAST' || (Array.isArray(album.tracks) && album.tracks.some((t: TrackLike) => t?.podcastMetadata || t?.kind === 'PODCAST'));
  if (!podcastShaped && !settings?.enabled) return 'not_a_feed';
  return null;
}

/** Track timestamps that mean "publish at" when present. */
const trackRelease = (t: TrackLike) => Number(t.releaseDate ?? t.publishAt ?? t.scheduledAt);

/** Why one track is left out of the public feed, or null when it goes in. */
export function trackFeedBlock(album: AlbumLike, track: TrackLike, now = Date.now()): string | null {
  if (!track || typeof track.id !== 'string' || !track.id) return 'no_id';
  if (!track.url) return 'no_audio';
  if (track.isPaywalled || track.isExclusive) return 'paywalled';
  if (album.previewOnly && Number(track.price) > 0) return 'paywalled';
  if (track.isDraft || track.isPrivate) return 'private';
  if (isRemoved(track)) return 'removed';
  const rel = trackRelease(track);
  if (Number.isFinite(rel) && rel > now) return 'unreleased';
  // Songs follow the same clearance rule as radio: an uncleared cover/sample or a song still waiting on a
  // co-writer's or publisher's sign-off doesn't go out to third-party apps (or collect streamed value).
  if (isSongTrack(track) && !canAirTrack(track)) return 'rights_held';
  return null;
}

export function publicFeedTracks<T extends TrackLike>(album: AlbumLike, now = Date.now()): T[] {
  const tracks: T[] = Array.isArray(album.tracks) ? album.tracks : [];
  return tracks.filter(t => trackFeedBlock(album, t, now) === null);
}

/** The album as the public feed may show it: same object shape, only eligible tracks. */
export function publicFeedAlbum<A extends AlbumLike>(album: A, now = Date.now()): A {
  return { ...album, tracks: publicFeedTracks(album, now) };
}
