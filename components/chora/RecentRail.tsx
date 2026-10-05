import React, { useMemo } from 'react';
import { thumb, onThumbError, THUMB } from '../../src/lib/imageThumb';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import {
  useListenHistory, recentTracks, recentAlbums, recentArtists, recentPlaylists, recentMixes,
  recentLocker, mostPlayedTracks, type ListenEntry,
} from '../../services/listenHistoryService';
import type { Album } from '../../types';

export type RecentKind = 'JUMP' | 'SONGS' | 'ARTISTS' | 'ALBUMS' | 'PLAYLISTS' | 'MIXES' | 'LOCKER' | 'MOST_PLAYED';

interface Props {
  kind: RecentKind;
  albums: Album[];
  uid?: string;
  remote?: unknown;
  onSelectAlbum: (album: Album) => void;
  onVisitUser: (uid: string, tab?: any) => void;
  title?: string;
}

const TITLES: Record<RecentKind, string> = {
  JUMP: 'Jump back in', SONGS: 'Recent songs', ARTISTS: 'Recent artists', ALBUMS: 'Recent albums',
  PLAYLISTS: 'Recent playlists', MIXES: 'Recent mixes', LOCKER: 'Recently played from your library', MOST_PLAYED: 'Most played',
};

type Card = { key: string; e: ListenEntry; round: boolean; label: string; sub: string; act: () => void };

const RecentRail: React.FC<Props> = ({ kind, albums, uid, remote, onSelectAlbum, onVisitUser, title }) => {
  const history = useListenHistory(uid, remote);
  const { playTrack } = useGlobalPlayerState();

  const cards = useMemo<Card[]>(() => {
    const byId = new Map(albums.map(a => [a.id, a] as const));
    const playSong = (e: ListenEntry) => () => {
      const album = byId.get(e.albumId) || null;
      const track = album?.tracks?.find(t => t.id === e.trackId);
      if (track) playTrack(track, album, 'LIBRARY');
    };
    const openAlbum = (e: ListenEntry) => () => { const a = byId.get(e.albumId); if (a) onSelectAlbum(a); };
    const song = (e: ListenEntry): Card | null => {
      const resolvable = e.isLocker || (byId.get(e.albumId)?.tracks?.some(t => t.id === e.trackId));
      if (!resolvable || e.isLocker && !byId.get(e.albumId)) return null;
      return { key: 's' + e.trackId, e, round: false, label: e.title, sub: e.artist, act: playSong(e) };
    };
    const album = (e: ListenEntry): Card | null => byId.has(e.albumId)
      ? { key: 'a' + e.albumId, e, round: false, label: e.albumTitle || e.title, sub: e.artist, act: openAlbum(e) } : null;
    const artist = (e: ListenEntry): Card | null => e.artistId
      ? { key: 'u' + e.artistId, e, round: true, label: e.artist, sub: 'Artist', act: () => onVisitUser(e.artistId, 'CONTENT') } : null;
    const clean = (c: (Card | null)[]) => c.filter(Boolean) as Card[];
    switch (kind) {
      case 'SONGS': return clean(recentTracks(history, 20).map(song)).slice(0, 12);
      case 'ARTISTS': return clean(recentArtists(history, 12).map(artist));
      case 'ALBUMS': return clean(recentAlbums(history, 20).map(album)).slice(0, 12);
      case 'PLAYLISTS': return clean(recentPlaylists(history, 20).map(album)).slice(0, 12);
      case 'MIXES': return clean(recentMixes(history, 20).map(album)).slice(0, 12);
      case 'LOCKER': return clean(recentLocker(history, 20).map(song)).slice(0, 12);
      case 'MOST_PLAYED': return clean(mostPlayedTracks(history, 20).map(song)).slice(0, 12);
      case 'JUMP': {
        const out: Card[] = []; const seen = new Set<string>();
        for (const e of recentTracks(history, 40)) {
          const isColl = e.subType === 'PLAYLIST' || e.subType === 'MIX';
          const c = isColl || e.isLocker ? (isColl ? album(e) : song(e)) : album(e);
          if (c && !seen.has(c.key)) { seen.add(c.key); out.push(c); }
          if (out.length >= 10) break;
        }
        return out;
      }
    }
  }, [history, albums, kind, playTrack, onSelectAlbum, onVisitUser]);

  if (!cards.length) return null;
  const heading = title || TITLES[kind];

  return (
    <section aria-label={heading} className="space-y-3">
      <h3 className="text-lg sm:text-xl font-bold text-white">{heading}</h3>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x" role="list">
        {cards.map(c => (
          <button
            key={c.key}
            type="button"
            role="listitem"
            onClick={c.act}
            aria-label={`${c.label}${c.sub ? ', ' + c.sub : ''}`}
            className="group shrink-0 w-32 sm:w-36 text-left snap-start focus:outline-none focus-visible:ring-2 focus-visible:ring-small-orange rounded-xl"
          >
            <div className={`w-full aspect-square overflow-hidden bg-white/5 border border-white/10 ${c.round ? 'rounded-full' : 'rounded-xl'}`}>
              {c.e.cover
                ? <img src={thumb(c.e.cover, THUMB.card) || undefined} onError={onThumbError(c.e.cover)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : null}
            </div>
            <p className={`mt-2 text-sm font-semibold text-white truncate ${c.round ? 'text-center' : ''}`}>{c.label}</p>
            <p className={`text-xs text-white/50 truncate ${c.round ? 'text-center' : ''}`}>{c.sub}</p>
          </button>
        ))}
      </div>
    </section>
  );
};

export default RecentRail;
