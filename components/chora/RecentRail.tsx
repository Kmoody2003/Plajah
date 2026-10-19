import React, { useMemo } from 'react';
import { thumb, onThumbError, THUMB } from '../../src/lib/imageThumb';
import { useGlobalPlayerState } from '../../contexts/GlobalPlayerContext';
import {
  useListenHistory, recentTracks, recentAlbums, recentArtists, recentPlaylists, recentMixes,
  recentLocker, mostPlayedTracks, type ListenEntry,
} from '../../services/listenHistoryService';
import {
  audiusStreamUrlSync, audiusTrackToNativeAlbum, resolveNativeAudiusAlbum, isAudiusOwner,
} from '../../services/audiusService';
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
  /** Show a short hint instead of nothing while there is no history yet (used on For You so the feature is discoverable). */
  showEmpty?: boolean;
}

const TITLES: Record<RecentKind, string> = {
  JUMP: 'Jump back in', SONGS: 'Recent songs', ARTISTS: 'Recent artists', ALBUMS: 'Recent albums',
  PLAYLISTS: 'Recent playlists', MIXES: 'Recent mixes', LOCKER: 'Recently played from your library', MOST_PLAYED: 'Most played',
};

type Card = { key: string; e: ListenEntry; round: boolean; label: string; sub: string; isAudius?: boolean; act: () => void };

const isAudiusEntry = (e: ListenEntry): boolean =>
  (e.trackId || '').startsWith('audius_') ||
  (e.albumId || '').startsWith('audius:') ||
  isAudiusOwner(e.artistId);

const buildAudiusSingleAlbumFromEntry = (e: ListenEntry): Album =>
  audiusTrackToNativeAlbum({
    id: e.trackId.startsWith('audius_') ? e.trackId : `audius_${e.trackId}`,
    title: e.title || e.albumTitle || 'Audius Track',
    artist: e.artist || 'Audius Artist',
    artistId: e.artistId ? e.artistId.replace(/^audius:/, '') : undefined,
    url: audiusStreamUrlSync(e.trackId),
    thumbnailUrl: e.cover || '',
    source: 'AUDIUS',
  });

const RecentRail: React.FC<Props> = ({ kind, albums, uid, remote, onSelectAlbum, onVisitUser, title, showEmpty }) => {
  const history = useListenHistory(uid, remote);
  const { playTrack } = useGlobalPlayerState();

  const cards = useMemo<Card[]>(() => {
    const byId = new Map(albums.map(a => [a.id, a] as const));
    const playSong = (e: ListenEntry) => () => {
      const album = byId.get(e.albumId) || null;
      const track = album?.tracks?.find(t => t.id === e.trackId);
      if (track) {
        playTrack(track, album, 'LIBRARY');
        return;
      }
      if ((e.trackId || '').startsWith('audius_')) {
        const audiusAlbum = buildAudiusSingleAlbumFromEntry(e);
        if (audiusAlbum.tracks?.[0]) {
          playTrack(audiusAlbum.tracks[0], audiusAlbum, 'LIBRARY');
        }
      }
    };
    const openAlbum = (e: ListenEntry) => () => {
      const a = byId.get(e.albumId);
      if (a) {
        onSelectAlbum(a);
        return;
      }
      if ((e.albumId || '').startsWith('audius:album:single_') || (e.trackId || '').startsWith('audius_') && !(e.albumId || '').startsWith('audius:album:')) {
        onSelectAlbum(buildAudiusSingleAlbumFromEntry(e));
        return;
      }
      if ((e.albumId || '').startsWith('audius:album:')) {
        void resolveNativeAudiusAlbum(e.albumId).then(resolved => {
          if (resolved) onSelectAlbum(resolved);
          else if ((e.trackId || '').startsWith('audius_')) onSelectAlbum(buildAudiusSingleAlbumFromEntry(e));
        });
      }
    };
    const song = (e: ListenEntry): Card | null => {
      const isAud = (e.trackId || '').startsWith('audius_');
      const resolvable = isAud || e.isLocker || (byId.get(e.albumId)?.tracks?.some(t => t.id === e.trackId));
      if (!resolvable || (!isAud && e.isLocker && !byId.get(e.albumId))) return null;
      return { key: 's' + e.trackId, e, round: false, label: e.title, sub: e.artist, isAudius: isAud, act: playSong(e) };
    };
    const album = (e: ListenEntry): Card | null => {
      const isAud = isAudiusEntry(e);
      if (!byId.has(e.albumId) && !isAud) return null;
      return { key: 'a' + (e.albumId || e.trackId), e, round: false, label: e.albumTitle || e.title, sub: e.artist, isAudius: isAud, act: openAlbum(e) };
    };
    const artist = (e: ListenEntry): Card | null => e.artistId
      ? { key: 'u' + e.artistId, e, round: true, label: e.artist, sub: isAudiusOwner(e.artistId) ? 'Audius Artist' : 'Artist', isAudius: isAudiusOwner(e.artistId), act: () => onVisitUser(e.artistId, 'CONTENT') } : null;
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

  if (!cards.length) {
    if (!showEmpty) return null;
    return (
      <section aria-label={title || TITLES[kind]} className="space-y-2">
        <h3 className="text-lg sm:text-xl font-bold text-white">{title || TITLES[kind]}</h3>
        <p className="text-sm text-white/55">Songs, albums and artists you play will show up here, so you can jump straight back in. Listen to something for about 20 seconds to start.</p>
      </section>
    );
  }
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
            <div className={`relative w-full aspect-square overflow-hidden bg-white/5 border border-white/10 ${c.round ? 'rounded-full' : 'rounded-xl'}`}>
              {c.e.cover
                ? <img src={thumb(c.e.cover, THUMB.card) || undefined} onError={onThumbError(c.e.cover)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                : null}
              {c.isAudius && !c.round && (
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#7E1BCC]/90 text-[7px] font-black uppercase tracking-widest text-white shadow">
                  Audius
                </span>
              )}
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
