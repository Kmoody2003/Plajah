import type { Album, Playlist, Track, UserProfile } from '../../types';
import {
  fetchAllPublicPlaylists,
  fetchPersonalAlbums,
  fetchPersonalPlaylists,
  fetchPersonalTracks,
  fetchRadioTracks,
  fetchUserLibraryTracks,
  fetchUserProfile,
} from '../../services/backendService';
import { fetchArchiveAudiobooks, VAULT_SHELVES, type ArchiveTrack } from '../../services/archiveContentService';
import { fetchTopVoted, fetchTrending, searchStations, type RadioStation } from '../../services/radioBrowser';
import { PUBLIC_RADIO_SHELVES, GENRE_SHELVES } from '../../data/radioShelves';
import { MUSIC_HISTORY_ERAS } from '../../data/musicHistory';
import { fetchAudiusTrending, audiusTrackToNativeAlbum } from '../../services/audiusService';

/**
 * What each Chora section shows on television.
 *
 * The screen renders one shape — a titled rail of square cards — so navigation stays the single
 * declared grid regardless of which section is open. Everything a section can show is therefore
 * flattened into TvItem here rather than in the view, which keeps the view's job to layout and
 * focus and nothing else.
 *
 * The sources are the same ones the phone uses (see components/MusicView.tsx); this file is a
 * TV-shaped projection of them, not a second implementation. Two of MusicView's quirks are
 * deliberately NOT carried over, both noted at their call sites below.
 */

export interface TvItem {
  id: string;
  title: string;
  subtitle?: string;
  image?: string;
  /** What OK does. Resolved by the view, which owns the player and the router. */
  action: TvAction;
}

export type TvAction =
  | { kind: 'ALBUM'; album: Album }
  | { kind: 'TRACK'; track: Track; album: Album | null; source: 'LIBRARY' | 'RADIO' }
  | { kind: 'ERA'; eraId: string }
  | { kind: 'ARTIST'; artist: UserProfile };

export interface TvRail { id: string; title: string; items: TvItem[] }

const albumItem = (a: Album): TvItem => ({
  id: a.id,
  title: a.title || 'Untitled',
  subtitle: a.artist,
  image: a.coverImage,
  action: { kind: 'ALBUM', album: a },
});

/** The Vault, audiobooks and archive podcasts all arrive as ArchiveTrack, whose cover field is
 *  `thumbnailUrl` — not `coverImage`. Getting this wrong yields a rail of blank squares. */
/** Audius track → TV card. Distinct from archiveItem: it must keep the `audius:` id scheme that
 *  audiusTrackToNativeAlbum produces, since the player routes on it, and must NOT be flagged
 *  isGlobalArchive or titled as the Vault. */
const audiusItem = (t: ArchiveTrack): TvItem => {
  const album = audiusTrackToNativeAlbum(t);
  return {
    id: t.id,
    title: t.title,
    subtitle: t.artist || 'Audius',
    image: t.thumbnailUrl,
    action: { kind: 'TRACK', track: album.tracks[0], album, source: 'LIBRARY' },
  };
};

const archiveItem = (t: ArchiveTrack): TvItem => {
  const track: Track = {
    id: t.id,
    title: t.title,
    artist: t.artist,
    url: t.url,
    albumCover: t.thumbnailUrl,
    genre: t.genre,
    isGlobalArchive: true,
  } as Track;
  const album: Album = {
    id: `archive-${t.id}`,
    title: t.collection || 'The Vault Archive',
    artist: t.artist,
    coverImage: t.thumbnailUrl,
    tracks: [track],
    isGlobalArchive: true,
  } as unknown as Album;
  return {
    id: t.id,
    title: t.title,
    subtitle: t.artist || t.year?.toString(),
    image: t.thumbnailUrl,
    action: { kind: 'TRACK', track, album, source: 'LIBRARY' },
  };
};

const stationItem = (s: RadioStation): TvItem => {
  const track: Track = {
    id: `station-${s.uuid}`,
    title: s.name,
    artist: s.country || 'Live radio',
    url: s.url,
    albumCover: s.favicon,
  } as Track;
  const album: Album = {
    id: `station-${s.uuid}`,
    title: s.name,
    artist: s.country || 'Live radio',
    coverImage: s.favicon,
    tracks: [track],
  } as unknown as Album;
  return {
    id: s.uuid,
    title: s.name,
    subtitle: [s.country, s.codec].filter(Boolean).join(' · '),
    image: s.favicon,
    action: { kind: 'TRACK', track, album, source: 'RADIO' },
  };
};

const trackItem = (t: Track, source: 'LIBRARY' | 'RADIO' = 'LIBRARY'): TvItem => ({
  id: t.id,
  title: t.title || 'Untitled',
  subtitle: t.artist,
  image: (t as any).albumCover,
  action: { kind: 'TRACK', track: t, album: null, source },
});

const playlistItem = (p: Playlist): TvItem => ({
  id: p.id,
  title: p.title || 'Playlist',
  subtitle: `${p.trackIds?.length || 0} tracks`,
  image: (p as any).coverImage || (p as any).coverUrl,
  action: { kind: 'ALBUM', album: { ...(p as any), tracks: p.tracks || [] } as Album },
});

const artistItem = (u: UserProfile): TvItem => ({
  id: u.uid,
  title: (u as any).displayName || 'Artist',
  subtitle: `${(u as any).followerCount || 0} followers`,
  image: (u as any).photoURL,
  action: { kind: 'ARTIST', artist: u },
});

const GENRES = ['Hip Hop', 'R&B', 'Electronic', 'Jazz', 'Rock', 'Pop', 'Lo-Fi', 'Ambient', 'Classical', 'Folk', 'World'];

const byPlays = (list: Album[]) => [...list].sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
const byRecent = (list: Album[]) => [...list].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
const nonEmpty = (rails: TvRail[]) => rails.filter(r => r.items.length > 0);

/** Everything the base load already has in memory. Synchronous — no section should re-fetch it. */
export interface BaseData {
  albums: Album[];
  upcoming: Album[];
  artists: UserProfile[];
  userProfile: UserProfile | null;
}

export function syncRails(section: string, base: BaseData): TvRail[] | null {
  const { albums, upcoming, artists, userProfile } = base;
  switch (section) {
    case 'NEW':
      return nonEmpty([
        { id: 'recent', title: 'Just Added', items: byRecent(albums).slice(0, 20).map(albumItem) },
        { id: 'soon', title: 'Coming Soon', items: upcoming.slice(0, 20).map(albumItem) },
        { id: 'charts', title: 'Charts', items: byPlays(albums).slice(0, 20).map(albumItem) },
      ]);

    case 'FOR_YOU': {
      const following = userProfile?.following || [];
      return nonEmpty([
        { id: 'follow', title: 'From Artists You Follow', items: albums.filter(a => following.includes(a.ownerId || '')).map(albumItem) },
        { id: 'soon', title: 'Coming Soon', items: upcoming.slice(0, 20).map(albumItem) },
        { id: 'suggest', title: 'Artists To Discover', items: artists.filter(a => !following.includes(a.uid)).slice(0, 20).map(artistItem) },
      ]);
    }

    case 'ALBUMS':
      return nonEmpty([
        { id: 'all', title: 'All Albums', items: byRecent(albums).map(albumItem) },
        { id: 'trend', title: 'Trending', items: byPlays(albums).filter(a => (a.playCount || 0) > 0).slice(0, 20).map(albumItem) },
      ]);

    case 'ARTISTS':
      return nonEmpty([
        { id: 'trend', title: 'Trending Artists', items: [...artists].sort((a, b) => ((b as any).followerCount || 0) - ((a as any).followerCount || 0)).slice(0, 20).map(artistItem) },
        { id: 'all', title: 'All Artists', items: artists.map(artistItem) },
      ]);

    case 'GENRES':
      return nonEmpty(GENRES.map(g => ({
        id: `genre-${g}`,
        title: g,
        items: byPlays(albums.filter(a => a.genre?.toLowerCase() === g.toLowerCase())).map(albumItem),
      })));

    case 'CONSERVATORY':
      // History lives here now rather than as a separate top-level route. The Music Theory Studio
      // is deliberately absent: it is a pointer-driven tool and does not survive a D-pad.
      return [{
        id: 'history',
        title: 'A History Of Music',
        items: MUSIC_HISTORY_ERAS.map(e => ({
          id: e.id,
          title: e.title,
          subtitle: e.span,
          action: { kind: 'ERA', eraId: e.id } as TvAction,
        })),
      }];

    default:
      return null;   // needs fetching
  }
}

/**
  * Sections that reach the network. Called once per section and cached by the view.
  *
  * `onPartial` lets a section publish rails as they arrive instead of only at the end. The Vault
  * needs it: its shelves come from different archives, and archive.org answers in ~20s while
  * loc.gov answers in ~2s. Waiting for all of them means staring at a blank screen for the
  * slowest one when most of the content was ready almost immediately.
  */
export async function asyncRails(
  section: string,
  base: BaseData,
  onPartial?: (rails: TvRail[]) => void,
): Promise<TvRail[]> {
  switch (section) {
    case 'RADIO': {
      // The desktop Radio view is a directory — Plajah FM, then artist stations, then live
      // broadcast — and the television had flattened all of that into two undifferentiated
      // rails. This restores the directory's shape: the platform's own stations first (they are
      // the reason someone opens Chora rather than a tuner), then the artists who switched
      // their station on, then live radio grouped by genre the way the desktop groups it.
      const [platform, live, topVoted] = await Promise.all([
        fetchRadioTracks().catch(() => [] as Track[]),
        fetchTrending(60).catch(() => [] as RadioStation[]),
        fetchTopVoted(60).catch(() => [] as RadioStation[]),
      ]);

      // A station whose stream is plain http cannot play inside an https page. Showing it would
      // be offering a button that is guaranteed to fail.
      const playable = (list: RadioStation[]) => list.filter(s => !s.blockedMixedContent);

      // Artist stations, derived the same way the desktop derives them: the distinct artists
      // behind the platform's radio tracks, kept only where the artist opted in.
      const artistIds = Array.from(new Set((platform || []).map(t => (t as any).artistId).filter(Boolean))).slice(0, 24);
      const artistStations = artistIds.length
        ? (await Promise.all(artistIds.map(id => fetchUserProfile(id as string).catch(() => null))))
            .filter((p): p is UserProfile => !!p && !!(p as any).radioSettings?.enabled)
        : [];

      // Curated shelves — the SAME ones the desktop Live Radio browser leads with (see
      // data/radioShelves.ts): public broadcasters first (NPR, BBC, CBC, ABC, public-radio tag),
      // then genre/format shelves (classical, jazz, news). Each is a real Radio Browser query, run
      // in parallel and de-duplicated so a station never shows up under two shelves. This is what
      // brought the TV radio to parity with web — it was deriving genres from whatever tags the
      // trending pool happened to carry rather than showing the curated directory.
      const shelfDefs = [...PUBLIC_RADIO_SHELVES, ...GENRE_SHELVES];
      const shelfResults = await Promise.all(
        shelfDefs.map(s => (s.query ? searchStations(s.query).catch(() => [] as RadioStation[]) : Promise.resolve([] as RadioStation[]))),
      );
      const seen = new Set<string>();
      const shelfRails: TvRail[] = shelfDefs.map((s, i) => {
        const items = playable(shelfResults[i]).filter(st => !seen.has(st.uuid)).slice(0, 20);
        items.forEach(st => seen.add(st.uuid));
        return { id: `shelf-${s.id}`, title: s.title, items: items.map(stationItem) };
      });

      return nonEmpty([
        { id: 'platform', title: 'Chora Radio', items: (platform || []).slice(0, 30).map(t => trackItem(t, 'RADIO')) },
        { id: 'artists', title: 'Artist Stations', items: artistStations.map(artistItem) },
        ...shelfRails,
        { id: 'live', title: 'Trending Live', items: playable(live).slice(0, 24).map(stationItem) },
        { id: 'voted', title: 'Most Loved', items: playable(topVoted).slice(0, 24).map(stationItem) },
      ]);
    }

    case 'MY_LIBRARY': {
      // Organised the way a music library actually is — by Album, by Artist, by Playlist — plus a
      // Singles shelf for the tracks that belong to no album, rather than the old flat "saved /
      // locker" rails. Everything a viewer has (saved + private locker + their own uploads) is
      // pooled and then re-cut through those three lenses, so the same track is reachable however
      // you think of it. A grouped card is a pseudo-album that opens the normal album screen, so no
      // new view is needed and playback / the trackbar just work.
      const ids = base.userProfile?.library || [];
      const [saved, locker, personalAlbums, personalPlaylists] = await Promise.all([
        ids.length ? fetchUserLibraryTracks(ids).catch(() => [] as Track[]) : Promise.resolve([] as Track[]),
        fetchPersonalTracks().catch(() => [] as Track[]),
        fetchPersonalAlbums().catch(() => [] as Album[]),
        fetchPersonalPlaylists().catch(() => [] as Playlist[]),
      ]);
      const recentFirst = (list: Track[]) =>
        [...list].sort((a, b) => ((b as any).timestamp || 0) - ((a as any).timestamp || 0));

      // Loose tracks (saved + locker); the uploaded albums come through personalAlbums whole.
      const loose = [...(saved || []), ...(locker || [])];
      const cover = (t: Track) => (t as any).albumCover || (t as any).coverImage;

      // Group a track list into pseudo-album cards keyed by album title or by artist.
      const group = (tracks: Track[], keyOf: (t: Track) => string, prefix: string): TvItem[] => {
        const map = new Map<string, Track[]>();
        for (const t of tracks) {
          const k = (keyOf(t) || '').trim();
          if (!k) continue;
          const arr = map.get(k); if (arr) arr.push(t); else map.set(k, [t]);
        }
        return [...map.entries()].map(([k, ts]) => ({
          id: `${prefix}:${k}`,
          title: k,
          subtitle: prefix === 'artist' ? `${ts.length} track${ts.length === 1 ? '' : 's'}` : (ts[0].artist || ''),
          image: cover(ts[0]),
          action: {
            kind: 'ALBUM' as const,
            album: { id: `${prefix}:${k}`, title: k, artist: prefix === 'artist' ? k : (ts[0].artist || ''), coverImage: cover(ts[0]), tracks: recentFirst(ts) } as Album,
          },
        }));
      };

      const looseAlbums = group(loose.filter(t => (t as any).albumTitle), t => (t as any).albumTitle, 'album');
      const artistAlbums = group(loose, t => t.artist || '', 'artist');
      const singles = loose.filter(t => !(t as any).albumTitle && !(t as any).albumId);

      // The locker gets its OWN named rail, first. It was already being fetched here, but folding
      // it into the unlabelled Albums/Artists/Singles lenses meant a viewer looking for their own
      // uploads saw no such heading and reasonably concluded the TV just didn't have them. It
      // still also flows into the lenses below, so nothing becomes less reachable.
      // NOTE: locker media is private and must never be shared (services/musicLocker.ts) — this
      // only renders it for its signed-in owner on their own screen; do not add a share/cast
      // affordance to this rail.
      const lockerItems = recentFirst(locker || []).map(t => trackItem(t));
      return nonEmpty([
        { id: 'locker',  title: 'Your Locker', items: lockerItems },
        { id: 'albums',  title: 'Albums',    items: [...(personalAlbums || []).map(albumItem), ...looseAlbums] },
        { id: 'artists', title: 'Artists',   items: artistAlbums },
        { id: 'lists',   title: 'Playlists', items: (personalPlaylists || []).map(playlistItem) },
        { id: 'singles', title: 'Singles',   items: recentFirst(singles).map(t => trackItem(t)) },
      ]);
    }

    case 'PLAYLISTS': {
      const [mine, pub] = await Promise.all([
        fetchPersonalPlaylists().catch(() => [] as Playlist[]),
        fetchAllPublicPlaylists().catch(() => [] as Playlist[]),
      ]);
      return nonEmpty([
        { id: 'mine', title: 'My Playlists', items: (mine || []).map(playlistItem) },
        { id: 'pub', title: 'From The Community', items: (pub || []).slice(0, 30).map(playlistItem) },
      ]);
    }

    case 'AUDIUS': {
      // Audius was simply absent from the TV — no section, no rail, no import — even though this
      // file's own header claims parity with MusicView and lists its only two deliberate
      // omissions elsewhere. Public browse needs no auth, so it works on TV exactly as on the
      // phone; the connected-account library (OAuth, popup-based) is a separate piece of work.
      //
      // Genres are fetched independently and published as each lands, in declared order, so the
      // rails don't reshuffle as the slow ones arrive — the same shape VAULT uses below. Fewer
      // genres than the phone's six: the TV runs on a much smaller heap budget, and each of
      // these is a live network fan-out.
      const shelves: { id: string; title: string; genre?: string }[] = [
        { id: 'trending', title: 'Trending on Audius' },
        { id: 'electronic', title: 'Electronic', genre: 'Electronic' },
        { id: 'hiphop', title: 'Hip-Hop / Rap', genre: 'Hip-Hop/Rap' },
        { id: 'rnb', title: 'R&B / Soul', genre: 'R&B/Soul' },
      ];
      const got: Record<string, TvRail> = {};
      await Promise.all(shelves.map(async shelf => {
        const items = await fetchAudiusTrending(shelf.genre, 12).catch(() => [] as ArchiveTrack[]);
        if (!items.length) return;
        got[shelf.id] = { id: shelf.id, title: shelf.title, items: items.map(audiusItem) };
        onPartial?.(shelves.map(s => got[s.id]).filter(Boolean));
      }));
      return shelves.map(s => got[s.id]).filter(Boolean);
    }

    case 'VAULT': {
      // Fired independently and published as each lands, in the shelf order declared by the
      // taxonomy so the list does not reshuffle itself as the slow ones arrive.
      const got: Record<string, TvRail> = {};
      await Promise.all(VAULT_SHELVES.map(async shelf => {
        const items = await shelf.fetch(12).catch(() => [] as ArchiveTrack[]);
        if (!items.length) return;
        got[shelf.id] = { id: shelf.id, title: shelf.title, items: items.map(archiveItem) };
        onPartial?.(VAULT_SHELVES.map(s => got[s.id]).filter(Boolean));
      }));
      return VAULT_SHELVES.map(s => got[s.id]).filter(Boolean);
    }

    case 'AUDIO_BOOKS': {
      // MusicView reads audiobooks out of state that only fills after visiting the Vault, so its
      // Audiobooks tab is empty on a cold open. Fetching directly avoids inheriting that bug.
      const books = await fetchArchiveAudiobooks(40).catch(() => [] as ArchiveTrack[]);
      return nonEmpty([{ id: 'books', title: 'Audiobooks', items: (books || []).map(archiveItem) }]);
    }

    case 'PODCASTS': {
      const native = base.albums.filter(a => (a as any).subType === 'PODCAST');
      const top = await fetch('https://itunes.apple.com/us/rss/toppodcasts/limit=24/json')
        .then(r => r.json())
        .then(j => (j?.feed?.entry || []).map((e: any): TvItem => ({
          id: e.id?.attributes?.['im:id'] || e.id?.label,
          title: e['im:name']?.label || '',
          subtitle: e['im:artist']?.label || '',
          image: e['im:image']?.[2]?.label,
          // Episodes need a feed fetch and an episode list, which is a screen this build does not
          // have yet. Selecting one is a no-op rather than a broken player.
          action: { kind: 'ERA', eraId: '' } as TvAction,
        })))
        .catch(() => [] as TvItem[]);
      return nonEmpty([
        { id: 'native', title: 'On Plajah', items: native.map(albumItem) },
        { id: 'top', title: 'Top Podcasts', items: top },
      ]);
    }

    default:
      return [];
  }
}

export { MUSIC_HISTORY_ERAS };
