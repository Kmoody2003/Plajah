import type { UserProfile, Video, VideoPlaylist } from '../../types';
import type { FastChannelListing } from '../../services/backendService';
import {
  fetchAllVideos,
  fetchFollowedArtists,
  fetchFollowedVideos,
  fetchPlaylistVideos,
  fetchUserVideos,
  fetchVideoPlaylists,
  fetchVideosByInterests,
  fetchWatchLaterPlaylist,
  getLikedVideos,
} from '../../services/backendService';
import { blendRelloFeed, computeTrending } from '../../services/relloFeedService';
import { getContinueWatching, type WatchEntry } from '../../services/watchHistoryService';

/**
 * What each Reello section shows on television.
 *
 * Same split as choraTvSections: this file decides WHAT is on screen, the view decides how it
 * looks and how focus moves. Cards here are 16:9 rather than square, which is the one structural
 * difference between the two screens — video is landscape and a square crop of a thumbnail throws
 * away the part that tells you what the video is.
 */

export interface TvVideoItem {
  id: string;
  title: string;
  /** Creator line. */
  subtitle?: string;
  image?: string;
  /** Seconds, rendered as a corner chip. */
  duration?: number;
  meta?: string;
  /** 0–1, drawn as a resume bar along the bottom of the thumbnail. */
  progress?: number;
  action: TvVideoAction;
}

export type TvVideoAction =
  | { kind: 'VIDEO'; video: Video }
  | { kind: 'CHANNEL'; profile: UserProfile }         // drill into a creator's video list
  | { kind: 'FASTCHANNEL'; profile: UserProfile }     // open the creator's FAST channel (live player)
  | { kind: 'PLAYLIST'; playlist: VideoPlaylist };

export interface TvVideoRail { id: string; title: string; items: TvVideoItem[] }

/**
 * Mux first, then the stored thumbnail, then the cover. Same order as VideoLibraryKit — a
 * different order here would mean the same video showed a different frame on TV than on the phone.
 */
export const videoThumb = (v: Video): string | undefined =>
  (v as any).muxPlaybackId
    ? `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=640&height=360&time=5`
    : v.thumbnailUrl || (v as any).coverImageUrl || (v as any).coverImage;

const views = (n?: number) => {
  if (!n) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
  return `${n} view${n === 1 ? '' : 's'}`;
};

export const videoItem = (v: Video): TvVideoItem => ({
  id: v.id,
  title: v.title || 'Untitled',
  subtitle: (v as any).artist || '',
  image: videoThumb(v),
  duration: v.duration,
  meta: views((v as any).playsCount),
  action: { kind: 'VIDEO', video: v },
});

const channelItem = (u: UserProfile): TvVideoItem => ({
  id: u.uid,
  title: (u as any).displayName || 'Channel',
  subtitle: `${(u as any).followerCount || 0} subscribers`,
  image: (u as any).photoURL,
  action: { kind: 'CHANNEL', profile: u },
});

/** A creator FAST channel card for Reello's Live section — opens the looping FastChannelPlayer. */
export const fastChannelItem = (c: FastChannelListing): TvVideoItem => ({
  id: `fast-${c.ownerId}`,
  title: c.number ? `${c.number} · ${c.name}` : c.name,
  subtitle: c.category ? `${c.category} · FAST` : 'FAST · Live',
  image: c.logoUrl,
  action: { kind: 'FASTCHANNEL', profile: c.profile },
});

const playlistItem = (p: VideoPlaylist): TvVideoItem => ({
  id: p.id,
  title: p.title || 'Playlist',
  subtitle: `${p.videoIds?.length || 0} videos`,
  image: p.thumbnailUrl,
  action: { kind: 'PLAYLIST', playlist: p },
});

const resumeItem = (e: WatchEntry, byId: Map<string, Video>): TvVideoItem | null => {
  const v = byId.get(e.id);
  if (!v) return null;
  return {
    ...videoItem(v),
    subtitle: e.ownerName || (v as any).artist || '',
    progress: e.durationSec ? Math.min(1, e.positionSec / e.durationSec) : undefined,
  };
};

/**
 * Cinema lives in Taleo, so it is filtered out of Reello. Same genre list and the same shape of
 * test RelloView uses — a video is a short unless it is a live recording or a cinema genre.
 */
const CINEMA_GENRES = ['Movie', 'Short Film', 'TV Series', 'Short', 'Teaser', 'Trailer', 'Feature Film'];
export const isShort = (v: Video): boolean =>
  (v as any).isRello === true ||
  ((v as any).isRello == null && !(v as any).isLiveRecording && !(v.genre && CINEMA_GENRES.includes(v.genre)));

const nonEmpty = (rails: TvVideoRail[]) => rails.filter(r => r.items.length > 0);
const recent = (list: Video[]) => [...list].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

export const REELLO_SECTIONS = [
  'HOME', 'TRENDING', 'SUBSCRIPTIONS', 'SHORTS', 'LIVE', 'PLAYLISTS', 'WATCH_LATER', 'HISTORY', 'LIKED',
] as const;
export type ReelloSectionId = typeof REELLO_SECTIONS[number];

export interface ReelloBase {
  videos: Video[];
  uid: string | null;
}

/** Sections answerable from the already-loaded video list. */
export function syncVideoRails(section: string, base: ReelloBase): TvVideoRail[] | null {
  const { videos } = base;
  switch (section) {
    case 'TRENDING':
      return nonEmpty([{ id: 'trending', title: 'Trending', items: computeTrending(videos).map(videoItem) }]);

    case 'SHORTS':
      // VideoTab's shorts tab is just the 30 newest videos with no shorts test at all. Using the
      // real classifier instead, so this is actually shorts and not "recent".
      return nonEmpty([{ id: 'shorts', title: 'Shorts', items: recent(videos.filter(isShort)).slice(0, 40).map(videoItem) }]);

    case 'LIVE':
      return nonEmpty([{ id: 'live', title: 'Live & Recorded', items: recent(videos.filter(v => (v as any).isLiveRecording)).map(videoItem) }]);

    default:
      return null;
  }
}

export async function asyncVideoRails(
  section: string,
  base: ReelloBase,
  onPartial?: (rails: TvVideoRail[]) => void,
): Promise<TvVideoRail[]> {
  const { videos, uid } = base;

  switch (section) {
    case 'HOME': {
      // Continue Watching first — on a television the single most likely intent is "carry on with
      // the thing I was already watching", so it should not be below the fold.
      const byId = new Map(videos.map(v => [v.id, v]));
      const resume = await getContinueWatching('VIDEO', 20).catch(() => [] as WatchEntry[]);
      const resumeRail: TvVideoRail = {
        id: 'resume', title: 'Continue Watching',
        items: resume.map(e => resumeItem(e, byId)).filter(Boolean) as TvVideoItem[],
      };
      if (resumeRail.items.length) onPartial?.([resumeRail]);

      const [interest, followed] = await Promise.all([
        uid ? fetchVideosByInterests(uid).catch(() => [] as Video[]) : Promise.resolve([] as Video[]),
        uid ? fetchFollowedVideos(uid).catch(() => [] as Video[]) : Promise.resolve([] as Video[]),
      ]);
      const feed = blendRelloFeed({ interestVideos: interest, followedVideos: followed, recentVideos: recent(videos) });
      return nonEmpty([
        resumeRail,
        { id: 'foryou', title: 'For You', items: feed.slice(0, 40).map(videoItem) },
        { id: 'new', title: 'New On Reello', items: recent(videos).slice(0, 40).map(videoItem) },
        { id: 'trending', title: 'Trending', items: computeTrending(videos).slice(0, 20).map(videoItem) },
      ]);
    }

    case 'SUBSCRIPTIONS': {
      if (!uid) return [];
      const [channels, followedVideos] = await Promise.all([
        fetchFollowedArtists(uid).catch(() => [] as UserProfile[]),
        fetchFollowedVideos(uid).catch(() => [] as Video[]),
      ]);
      const rails: TvVideoRail[] = nonEmpty([
        { id: 'latest', title: 'Latest From Your Subscriptions', items: recent(followedVideos).map(videoItem) },
        { id: 'channels', title: 'Your Channels', items: channels.map(channelItem) },
      ]);
      if (rails.length) onPartial?.(rails);

      // Then a rail per channel, published as each resolves — a viewer with many subscriptions
      // should not wait on the slowest channel to see the first.
      const got: Record<string, TvVideoRail> = {};
      await Promise.all(channels.slice(0, 10).map(async c => {
        const own = await fetchUserVideos(c.uid).catch(() => [] as Video[]);
        if (!own.length) return;
        got[c.uid] = { id: `ch-${c.uid}`, title: (c as any).displayName || 'Channel', items: recent(own).map(videoItem) };
        onPartial?.([...rails, ...channels.map(x => got[x.uid]).filter(Boolean)]);
      }));
      return [...rails, ...channels.map(c => got[c.uid]).filter(Boolean)];
    }

    case 'PLAYLISTS': {
      const lists = await fetchVideoPlaylists(uid || undefined).catch(() => [] as VideoPlaylist[]);
      return nonEmpty([{ id: 'lists', title: 'Playlists', items: (lists || []).map(playlistItem) }]);
    }

    case 'WATCH_LATER': {
      const pl = await fetchWatchLaterPlaylist().catch(() => null);
      if (!pl?.videoIds?.length) return [];
      const vids = await fetchPlaylistVideos(pl.videoIds).catch(() => [] as Video[]);
      return nonEmpty([{ id: 'later', title: 'Watch Later', items: (vids || []).map(videoItem) }]);
    }

    case 'HISTORY': {
      const byId = new Map(videos.map(v => [v.id, v]));
      const entries = await getContinueWatching('VIDEO', 40).catch(() => [] as WatchEntry[]);
      return nonEmpty([{
        id: 'history', title: 'Keep Watching',
        items: entries.map(e => resumeItem(e, byId)).filter(Boolean) as TvVideoItem[],
      }]);
    }

    case 'LIKED': {
      const liked = await getLikedVideos(uid || undefined).catch(() => [] as Video[]);
      return nonEmpty([{ id: 'liked', title: 'Liked Videos', items: (liked || []).map(videoItem) }]);
    }

    default:
      return [];
  }
}

export { fetchAllVideos, fetchUserVideos };
