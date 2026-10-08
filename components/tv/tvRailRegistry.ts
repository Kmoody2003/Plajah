/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  TV RAIL REGISTRY — the one place web content sections get mirrored onto the TV screens.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *  WHEN YOU ADD A CONTENT SECTION TO THE WEB (Chora / MusicView, Reello / VideoTab · RelloView,
 *  Taleo / MoviesTVView), REGISTER A TV RAIL FOR IT HERE. That is all it takes for it to reach the
 *  television: each TV screen asks this registry for the rails of the section it is showing and
 *  merges them with its built-in rails (see composeSection below). No TV view code changes.
 *
 *  A rail is { id, title, section, position, load(ctx) } where:
 *   · `section`  — the TV section it belongs to (Chora: 'NEW' | 'FOR_YOU' | 'AUDIUS' | …;
 *                  Reello: 'HOME' | 'LIVE' | 'SUBSCRIPTIONS' | …; Taleo has one screen: 'HOME').
 *   · `position` — 'start' puts it above the section's built-in rails, 'end' (default) below.
 *   · `load`     — returns the cards. CALL THE SAME LOADER THE WEB VIEW CALLS (the exported service
 *                  function, or a pure loader extracted from the web view) and map with the
 *                  vertical's item mapper (albumItem / videoItem / vItem / archItem / …). Never
 *                  re-implement a query here: a second implementation is how the TV drifts.
 *  Keep loads bounded (a `limit`/slice) — the TV is a 2GB box. Return [] when there is nothing;
 *  empty rails are dropped. A load that throws is treated as empty, so one bad source never blanks
 *  a section.
 *
 *  Item shapes and what OK does per vertical:
 *   · Chora  → TvItem       (choraTvSections.ts): ALBUM | TRACK | ARTIST | ERA | LOAD_ALBUM
 *   · Reello → TvVideoItem  (reelloTvSections.ts): VIDEO | CHANNEL | FASTCHANNEL | LIVESOURCE | PLAYLIST
 *   · Taleo  → TaleoItem    (moviesTvSections.ts): ITEM | RESUME | ARCHIVE | CHANNEL | LIVESOURCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

import type { Album, Playlist, Video } from '../../types';
import {
  fetchSystemSettingsConfig, fetchPlaylistsByIds, fetchVideoPlaylistsByIds, fetchPlaylistVideos,
  fetchLiveFeedsOnce, fetchPersonalVideos, fetchFollowedArtists,
} from '../../services/backendService';
import { buildDailyMix } from '../../services/dailyMixService';
import {
  getHistory, mergeRemote, recentTracks, recentAlbums, recentMixes, recentPlaylists, mostPlayedTracks,
  type ListenEntry,
} from '../../services/listenHistoryService';
import {
  fetchAudiusUnderground, fetchAudiusTrendingPlaylists, fetchAudiusPlaylistTracks, fetchAudiusArtistById,
  audiusAlbumToNativeAlbum,
} from '../../services/audiusService';
import { CURATED_KOFA_FILMS, CURATED_EUROPEANA_FILMS, type ArchiveTrack } from '../../services/archiveContentService';
import { getClipsByUser, clipSourceUrl, clipThumbnailUrl } from '../../services/liveClipService';
import { getTvArtists } from '../../services/tv/tvCatalogCache';
import { albumItem, audiusItem, playlistItem, type BaseData, type TvItem, type TvRail } from './choraTvSections';
import { videoItem, channelItem, isShort, type ReelloBase, type TvVideoItem, type TvVideoRail } from './reelloTvSections';
import { vItem, archItem, type TaleoItem, type TaleoRail } from './moviesTvSections';

export interface TvRailDef<Ctx, Item> {
  id: string;
  title: string;
  section: string;
  position?: 'start' | 'end';
  /** Where this rail's content comes from on the web — for the next person keeping them in step. */
  webSource: string;
  load: (ctx: Ctx) => Promise<Item[]> | Item[];
}

interface Rail<Item> { id: string; title: string; items: Item[] }

// ── Shared, cached reads used by more than one rail ────────────────────────────

let settingsP: Promise<any> | null = null;
let settingsAt = 0;
/** System settings (staff picks live here). Cached 5 min — read by Chora AND Taleo rails. */
const settings = () => {
  if (!settingsP || Date.now() - settingsAt > 5 * 60_000) {
    settingsAt = Date.now();
    settingsP = fetchSystemSettingsConfig().catch(() => ({}));
  }
  return settingsP;
};

/** A staff-pick music playlist → the same pseudo-album MusicView builds when one is opened. */
const staffPickItem = (pl: Playlist): TvItem => ({
  ...playlistItem(pl),
  action: {
    kind: 'ALBUM',
    album: {
      id: pl.id, ownerId: (pl as any).ownerId, title: pl.title, artist: (pl as any).authorName || 'Curator',
      coverImage: (pl as any).coverImage || '', tracks: pl.tracks || [], type: 'MUSIC', subType: 'PLAYLIST',
      createdAt: (pl as any).timestamp, isPublic: true,
    } as unknown as Album,
  },
});

/** Listen-history entry → card, resolved against the loaded catalogue (RecentRail's rules). */
function historyItem(e: ListenEntry, byId: Map<string, Album>, asAlbum: boolean): TvItem | null {
  const album = byId.get(e.albumId);
  if (!album) return null;
  if (asAlbum) return { ...albumItem(album), id: `h-${e.albumId}` };
  const track = (album.tracks || []).find(t => t.id === e.trackId);
  if (!track) return null;
  return {
    id: `h-${e.trackId}`, title: e.title || track.title, subtitle: e.artist || track.artist,
    image: e.cover || (track as any).albumCover || album.coverImage,
    action: { kind: 'TRACK', track, album, source: 'LIBRARY' },
  };
}

function history(ctx: BaseData): { list: ListenEntry[]; byId: Map<string, Album> } {
  const uid = ctx.userProfile?.uid;
  try { mergeRemote(uid, (ctx.userProfile as any)?.choraRecents); } catch { /* best effort */ }
  let list: ListenEntry[] = [];
  try { list = getHistory(uid); } catch { /* storage blocked */ }
  return { list, byId: new Map(ctx.albums.map(a => [a.id, a])) };
}

const compact = <T,>(xs: (T | null)[]) => xs.filter(Boolean) as T[];

// ═══ CHORA ═══════════════════════════════════════════════════════════════════════

export const CHORA_TV_RAILS: TvRailDef<BaseData, TvItem>[] = [
  {
    id: 'daily-mix', title: 'Your Daily Mix', section: 'FOR_YOU', position: 'start',
    webSource: 'DailyMixCard → services/dailyMixService.buildDailyMix',
    load: async ctx => {
      if (!ctx.userProfile?.uid) return [];
      const mix = await buildDailyMix();
      if (!mix) return [];
      return [{
        id: mix.album.id, title: mix.title || 'Your Daily Mix',
        subtitle: `${mix.trackCount} tracks${mix.topGenres?.length ? ' · ' + mix.topGenres.slice(0, 2).join(', ') : ''}`,
        image: mix.album.coverImage, action: { kind: 'ALBUM', album: mix.album },
      }];
    },
  },
  {
    id: 'jump-back', title: 'Jump Back In', section: 'FOR_YOU', position: 'start',
    webSource: 'chora/RecentRail kind=JUMP → listenHistoryService.recentTracks',
    load: ctx => {
      const { list, byId } = history(ctx);
      const seen = new Set<string>();
      return compact(recentTracks(list, 40).map(e => {
        const collection = e.subType === 'PLAYLIST' || e.subType === 'MIX';
        const key = collection || !e.isLocker ? e.albumId : e.trackId;
        if (seen.has(key)) return null;
        seen.add(key);
        return historyItem(e, byId, !e.isLocker);
      })).slice(0, 10);
    },
  },
  {
    id: 'recent-songs', title: 'Recently Played', section: 'FOR_YOU',
    webSource: 'chora/RecentRail kind=SONGS',
    load: ctx => { const { list, byId } = history(ctx); return compact(recentTracks(list, 20).map(e => historyItem(e, byId, false))); },
  },
  {
    id: 'recent-albums', title: 'Recent Albums', section: 'FOR_YOU',
    webSource: 'chora/RecentRail kind=ALBUMS',
    load: ctx => { const { list, byId } = history(ctx); return compact(recentAlbums(list, 20).map(e => historyItem(e, byId, true))); },
  },
  {
    id: 'most-played', title: 'Most Played', section: 'FOR_YOU',
    webSource: 'chora/RecentRail kind=MOST_PLAYED',
    load: ctx => { const { list, byId } = history(ctx); return compact(mostPlayedTracks(list, 20).map(e => historyItem(e, byId, false))); },
  },
  {
    id: 'recent-mixes', title: 'Recent Mixes', section: 'MIXES', position: 'start',
    webSource: 'chora/RecentRail kind=MIXES',
    load: ctx => { const { list, byId } = history(ctx); return compact(recentMixes(list, 20).map(e => historyItem(e, byId, true))); },
  },
  {
    id: 'recent-playlists', title: 'Recent Playlists', section: 'PLAYLISTS', position: 'start',
    webSource: 'chora/RecentRail kind=PLAYLISTS',
    load: ctx => { const { list, byId } = history(ctx); return compact(recentPlaylists(list, 20).map(e => historyItem(e, byId, true))); },
  },
  {
    id: 'staff-picks', title: 'Staff Pick Playlists', section: 'NEW',
    webSource: 'MusicView loadData: fetchSystemSettingsConfig().curatedMusicPlaylists → fetchPlaylistsByIds',
    load: async () => {
      const ids: string[] = (await settings())?.curatedMusicPlaylists || [];
      if (!ids.length) return [];
      const lists = await fetchPlaylistsByIds(ids.slice(0, 20));
      return (lists || []).filter(Boolean).map(pl => staffPickItem(pl as Playlist));
    },
  },
  {
    id: 'staff-picks', title: 'Staff Pick Playlists', section: 'PLAYLISTS', position: 'start',
    webSource: 'MusicView Playlists tab (same staff picks)',
    load: async () => {
      const ids: string[] = (await settings())?.curatedMusicPlaylists || [];
      if (!ids.length) return [];
      const lists = await fetchPlaylistsByIds(ids.slice(0, 20));
      return (lists || []).filter(Boolean).map(pl => staffPickItem(pl as Playlist));
    },
  },
  {
    id: 'audius-underground', title: 'Audius Underground', section: 'AUDIUS',
    webSource: 'MusicView NEW → audiusService.fetchAudiusUnderground',
    load: async () => (await fetchAudiusUnderground(16)).map((t: ArchiveTrack) => audiusItem(t)),
  },
  {
    id: 'audius-playlists', title: 'Featured Audius Playlists', section: 'AUDIUS',
    webSource: 'MusicView NEW → fetchAudiusTrendingPlaylists; open = openAudiusAlbumNative',
    load: async () => (await fetchAudiusTrendingPlaylists(12)).map(pl => ({
      id: `audius-pl-${pl.id}`, title: pl.title, subtitle: `${pl.curator} · ${pl.trackCount} tracks`, image: pl.artworkUrl,
      // Same as MusicView.openAudiusAlbumNative: tracks + curator fetched on open, then a native album.
      action: {
        kind: 'LOAD_ALBUM',
        load: async () => {
          const [tracks, curator] = await Promise.all([
            fetchAudiusPlaylistTracks(pl.id).catch(() => [] as ArchiveTrack[]),
            pl.curatorId ? fetchAudiusArtistById(pl.curatorId).catch(() => null) : Promise.resolve(null),
          ]);
          return tracks.length ? audiusAlbumToNativeAlbum(pl, tracks, curator) : null;
        },
      },
    } as TvItem)),
  },
];

// ═══ REELLO ══════════════════════════════════════════════════════════════════════

/** A live_feeds row that is live and free to watch, as a playable Video (VideoTab's Live Now). */
function liveFeedVideo(f: any): Video | null {
  if (f.status && f.status !== 'LIVE') return null;
  if (f.isPublic === false || f.sanctuaryOnly || (f.price && f.price > 0)) return null;
  const url: string = f.url || '';
  // `livestream:` feeds open LiveViewer on the web; the TV can play them only via their Mux id.
  if (url.startsWith('livestream:') && !f.muxPlaybackId) return null;
  return {
    ...f,
    url: url.startsWith('livestream:') ? `https://stream.mux.com/${f.muxPlaybackId}.m3u8` : url,
    artist: f.ownerName, thumbnailUrl: f.muxPlaybackId ? `https://image.mux.com/${f.muxPlaybackId}/thumbnail.jpg?width=480` : f.ownerPhoto,
    isLive: true,
  } as Video;
}

export const REELLO_TV_RAILS: TvRailDef<ReelloBase, TvVideoItem>[] = [
  {
    id: 'live-feeds', title: 'Live Now On Plajah', section: 'LIVE', position: 'start',
    webSource: 'VideoTab Live Now → fetchAllLiveFeeds (one-shot: fetchLiveFeedsOnce)',
    load: async () => compact((await fetchLiveFeedsOnce(60)).map(liveFeedVideo)).slice(0, 30)
      .map(v => ({ ...videoItem(v), meta: 'LIVE' })),
  },
  {
    id: 'my-clips', title: 'Your Live Clips', section: 'LIVE',
    webSource: 'reello/LiveClipStudio MyClipsSection → liveClipService.getClipsByUser',
    load: async ctx => {
      if (!ctx.uid) return [];
      const clips = await getClipsByUser(ctx.uid, 30);
      return clips.map(c => videoItem({
        id: c.videoId || c.id, title: c.title, url: clipSourceUrl(c),
        muxPlaybackId: c.clipPlaybackId || c.sourcePlaybackId, thumbnailUrl: clipThumbnailUrl(c),
        duration: c.durationSec, artist: c.sourceOwnerName,
      } as unknown as Video));
    },
  },
  {
    id: 'music-videos', title: 'Music Videos', section: 'HOME',
    webSource: "VideoTab: genre === 'Music Video' || category === 'MUSIC_VIDEO'",
    load: ctx => ctx.videos.filter(v => v.genre === 'Music Video' || (v as any).category === 'MUSIC_VIDEO').slice(0, 30).map(videoItem),
  },
  {
    id: 'premieres', title: 'Premieres', section: 'HOME',
    webSource: 'reello/ReelloDiscoverySections PremieresSection (isPremiere, live or upcoming)',
    load: ctx => {
      const now = Date.now();
      const startOf = (v: any) => v.premiereStartTime || v.premiereConfig?.premiereStartTime || 0;
      return ctx.videos
        .filter(v => (v as any).isPremiere === true && !(v as any).isPrivate)
        .filter(v => { const s = startOf(v); return s && now < s + ((v.duration || 180) * 1000); })
        .sort((a, b) => startOf(a) - startOf(b))
        .map(v => ({ ...videoItem(v), meta: startOf(v) <= now ? 'PREMIERING NOW' : new Date(startOf(v)).toLocaleString() }));
    },
  },
  {
    id: 'shorts-row', title: 'Shorts', section: 'HOME',
    webSource: 'RelloView shorts feed (isShort classifier)',
    load: ctx => [...ctx.videos].filter(isShort).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 24).map(videoItem),
  },
  {
    id: 'discover-channels', title: 'Discover Channels', section: 'SUBSCRIPTIONS',
    webSource: 'VideoTab renderChannelDirectory Discover (bounded: artists only)',
    load: async ctx => {
      const [people, followed] = await Promise.all([
        getTvArtists(),
        ctx.uid ? fetchFollowedArtists(ctx.uid).catch(() => []) : Promise.resolve([]),
      ]);
      const skip = new Set([ctx.uid, ...followed.map((f: any) => f.uid)]);
      return people.filter(p => !skip.has(p.uid)).slice(0, 18).map(channelItem);
    },
  },
];

// ═══ TALEO ═══════════════════════════════════════════════════════════════════════

export const TALEO_TV_RAILS: TvRailDef<void, TaleoItem>[] = [
  {
    id: 'my-locker', title: 'Your Video Locker', section: 'HOME', position: 'start',
    webSource: 'PersonalVideoLocker → backendService.fetchPersonalVideos',
    load: async () => (await fetchPersonalVideos()).slice(0, 40).map(vItem),
  },
  {
    id: 'kofa-golden', title: 'Golden Age of Korean Cinema', section: 'HOME',
    webSource: 'MoviesTVView HomeView → CURATED_KOFA_FILMS',
    load: () => CURATED_KOFA_FILMS.map(archItem),
  },
  {
    id: 'europeana-avant', title: 'European Expressionism & Avant-Garde', section: 'HOME',
    webSource: 'MoviesTVView HomeView → CURATED_EUROPEANA_FILMS',
    load: () => CURATED_EUROPEANA_FILMS.map(archItem),
  },
];

/**
 * Taleo's Curated Collections are one rail PER collection (each a staff-picked video playlist),
 * so they are produced here rather than as a single TvRailDef.
 * Web: MoviesTVView loadContent → fetchSystemSettingsConfig().curatedVideoPlaylists → fetchVideoPlaylistsByIds.
 */
export async function loadTaleoCuratedCollections(): Promise<TaleoRail[]> {
  const ids: string[] = (await settings())?.curatedVideoPlaylists || [];
  if (!ids.length) return [];
  const lists = await fetchVideoPlaylistsByIds(ids.slice(0, 8)).catch(() => []);
  const rails = await Promise.all(lists.map(async pl => {
    const vids = pl.videos?.length ? pl.videos : await fetchPlaylistVideos((pl.videoIds || []).slice(0, 30)).catch(() => [] as Video[]);
    return { id: `curated-${pl.id}`, title: pl.title || 'Curated Collection', items: (vids || []).map(vItem) };
  }));
  return rails.filter(r => r.items.length > 0);
}

// ═══ Composition ═════════════════════════════════════════════════════════════════

export const hasRegisteredRails = (defs: TvRailDef<any, any>[], section: string) =>
  defs.some(d => d.section === section);

/**
 * Merge a section's built-in rails with its registered ones. Built-ins publish first (they are
 * usually already in memory); registered rails are loaded in parallel and slotted in DECLARED
 * order as each lands, so the screen fills progressively without reshuffling.
 */
export async function composeSection<Ctx, Item>(
  defs: TvRailDef<Ctx, Item>[],
  section: string,
  ctx: Ctx,
  builtin: (onPartial: (rails: Rail<Item>[]) => void) => Promise<Rail<Item>[]>,
  onPartial?: (rails: Rail<Item>[]) => void,
): Promise<Rail<Item>[]> {
  const mine = defs.filter(d => d.section === section);
  const got: Record<string, Rail<Item>> = {};
  let base: Rail<Item>[] = [];
  const assemble = () => {
    const at = (pos: 'start' | 'end') => mine.filter(d => (d.position || 'end') === pos).map(d => got[d.id]).filter(Boolean);
    return [...at('start'), ...base, ...at('end')];
  };
  const publish = () => { const r = assemble(); if (r.length) onPartial?.(r); };

  const registered = Promise.all(mine.map(async d => {
    try {
      const items = await d.load(ctx);
      if (items && items.length) { got[d.id] = { id: d.id, title: d.title, items }; publish(); }
    } catch { /* a bad source never blanks the section */ }
  }));
  try {
    base = await builtin(partial => { base = partial; publish(); });
  } catch { base = []; }
  publish();
  await registered;
  return assemble();
}

/**
 * For sections whose built-in rails are computed synchronously from data already in memory (and
 * so must stay live as that data refreshes): cache ONLY the registered rails, and splice them
 * around the live built-ins at render time.
 */
export function spliceRegistered<Item>(
  defs: TvRailDef<any, Item>[],
  section: string,
  builtin: Rail<Item>[],
  registered: Rail<Item>[] | undefined,
): Rail<Item>[] {
  if (!registered?.length) return builtin;
  const pos = new Map(defs.filter(d => d.section === section).map(d => [d.id, d.position || 'end']));
  return [
    ...registered.filter(r => pos.get(r.id) === 'start'),
    ...builtin,
    ...registered.filter(r => pos.get(r.id) !== 'start'),
  ];
}

export type { TvRail, TvVideoRail, TaleoRail };
