import type { Album, Playlist, Track, UserProfile } from '../../types';
import {
  fetchAllPublicPlaylists,
  fetchPersonalAlbums,
  fetchPersonalPlaylists,
  fetchRadioTracks,
  fetchUserLibraryTracks,
} from '../../services/backendService';
import { fetchArchiveAudiobooks, VAULT_SHELVES, type ArchiveTrack } from '../../services/archiveContentService';
import { fetchTrending, type RadioStation } from '../../services/radioBrowser';
import { MUSIC_HISTORY_ERAS } from '../../data/musicHistory';

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
      const [platform, live] = await Promise.all([
        fetchRadioTracks().catch(() => [] as Track[]),
        fetchTrending(40).catch(() => [] as RadioStation[]),
      ]);
      return nonEmpty([
        // A station whose stream is plain http cannot play inside an https page. Showing it would
        // be offering a button that is guaranteed to fail.
        { id: 'live', title: 'Live Radio', items: live.filter(s => !s.blockedMixedContent).map(stationItem) },
        { id: 'platform', title: 'Chora Radio', items: (platform || []).slice(0, 30).map(t => trackItem(t, 'RADIO')) },
      ]);
    }

    case 'MY_LIBRARY': {
      const ids = base.userProfile?.library || [];
      const [saved, personalAlbums, personalPlaylists] = await Promise.all([
        ids.length ? fetchUserLibraryTracks(ids).catch(() => [] as Track[]) : Promise.resolve([] as Track[]),
        fetchPersonalAlbums().catch(() => [] as Album[]),
        fetchPersonalPlaylists().catch(() => [] as Playlist[]),
      ]);
      return nonEmpty([
        { id: 'saved', title: 'Saved Tracks', items: (saved || []).map(t => trackItem(t)) },
        { id: 'mine', title: 'My Uploads', items: (personalAlbums || []).map(albumItem) },
        { id: 'lists', title: 'My Playlists', items: (personalPlaylists || []).map(playlistItem) },
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
