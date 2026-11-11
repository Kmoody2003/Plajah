// Build the public Podcasting 2.0 feed for one album: access rules → eligible tracks → URLs for chapters and
// transcripts → generatePodcastRSS with podcast:* tags. Pure (no I/O), so the route and tests share it.

import type { Album } from '../../types';
import { generatePodcastRSS } from '../podcastRSSService';
import { albumFeedBlock, publicFeedAlbum, type FeedBlock } from './access';
import { hasChapters } from './chapters';
import { trackCues } from './transcript';
import { podcastGuidFor } from './guid';
import type { Podcast20FeedContext, Podcast20Settings } from './types';

export const feedBase = (env: Record<string, string | undefined> = process.env): string =>
  (env.PODCAST_FEED_BASE || env.VITE_APP_URL || 'https://plajah.com').replace(/\/+$/, '');

export function podcastUrls(base: string, albumId: string) {
  const a = encodeURIComponent(albumId);
  return {
    feed: `${base}/podcast/${a}/feed.xml`,
    chapters: (trackId: string) => `${base}/podcast/${a}/chapters/${encodeURIComponent(trackId)}.json`,
    transcript: (trackId: string, fmt: 'vtt' | 'srt' | 'json') => `${base}/podcast/${a}/transcript/${encodeURIComponent(trackId)}.${fmt}`,
  };
}

/** The guid this album's feed has / will have: pinned in settings, else derived from the canonical feed URL. */
export const guidForAlbum = (base: string, albumId: string, settings?: Podcast20Settings | null) =>
  settings?.guid || podcastGuidFor(podcastUrls(base, albumId).feed);

export type PublicFeedResult = { ok: true; xml: string; trackCount: number } | { ok: false; block: FeedBlock };

export function renderPublicFeed(albumId: string, album: Album | null, settings: Podcast20Settings | null, base: string, now = Date.now()): PublicFeedResult {
  const block = albumFeedBlock(album, settings, now);
  if (block || !album) return { ok: false, block: block ?? 'not_found' };
  const pub = publicFeedAlbum(album, now) as Album;
  const urls = podcastUrls(base, albumId);
  const s: Podcast20Settings = settings ?? {};
  const byId = new Map(pub.tracks.map(t => [t.id, t]));
  const ctx: Podcast20FeedContext = {
    settings: s,
    feedUrl: urls.feed,
    albumLicenseId: album.license,
    chaptersUrl: (trackId) => {
      const t = byId.get(trackId);
      return t && hasChapters(pub, t, s) ? urls.chapters(trackId) : undefined;
    },
    transcriptUrls: (trackId) => {
      const t = byId.get(trackId);
      if (!t || !trackCues(t).length) return [];
      return [
        { url: urls.transcript(trackId, 'vtt'), type: 'text/vtt', captions: true },
        { url: urls.transcript(trackId, 'srt'), type: 'application/x-subrip', captions: true },
        { url: urls.transcript(trackId, 'json'), type: 'application/json' },
      ];
    },
  };
  const explicit = pub.tracks.some(t => t.podcastMetadata?.isExplicit) || !!(album as any).releaseMeta?.explicit;
  const xml = generatePodcastRSS(pub, { siteUrl: `${base}/share?type=album&id=${encodeURIComponent(albumId)}`, feedUrl: urls.feed, explicit, podcast20: ctx });
  return { ok: true, xml, trackCount: pub.tracks.length };
}
