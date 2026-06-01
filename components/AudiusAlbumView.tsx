import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, Pause, Shuffle, ExternalLink, Music2, Disc3, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { Album, Track } from '../types';
import {
  AudiusAlbum, AudiusArtist,
  fetchAudiusPlaylistTracks, fetchAudiusArtistById, getAudiusStreamUrl,
} from '../services/audiusService';
import type { ArchiveTrack } from '../services/archiveContentService';

interface Props {
  album: AudiusAlbum;
  onBack: () => void;
  onViewArtist?: (artist: AudiusArtist) => void;
}

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
  : String(n);

const fmtDur = (s?: number) => {
  if (!s) return '';
  const m = Math.floor(s / 60);
  const sec = String(Math.floor(s % 60)).padStart(2, '0');
  return `${m}:${sec}`;
};

const totalDur = (tracks: ArchiveTrack[]) => {
  const secs = tracks.reduce((acc, t) => acc + (t.duration ?? 0), 0);
  if (!secs) return '';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
};

const PURPLE = { bg: 'rgba(126,34,206,0.2)', border: 'rgba(168,85,247,0.3)', text: '#a855f7', accent: '#7e22ce' } as const;

const AudiusAlbumView: React.FC<Props> = ({ album, onBack, onViewArtist }) => {
  const { playTrack, currentTrack, isPlaying, pause, resume } = useGlobalPlayer();

  const [tracks, setTracks] = useState<ArchiveTrack[]>([]);
  const [artist, setArtist] = useState<AudiusArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [shuffled, setShuffled] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAudiusPlaylistTracks(album.id),
      album.curatorId ? fetchAudiusArtistById(album.curatorId) : Promise.resolve(null),
    ]).then(([t, a]) => {
      setTracks(t);
      setArtist(a);
      setLoading(false);
    });
  }, [album.id, album.curatorId]);

  const buildAlbum = (trackList: ArchiveTrack[]): Album => ({
    id: `audius_${album.id}`,
    title: album.title,
    artist: album.curator,
    coverImage: album.artworkUrl,
    themeColor: '#7e22ce',
    createdAt: Date.now(),
    description: album.description ?? '',
    tracks: trackList.map(t => ({
      id: t.id, title: t.title, artist: t.artist,
      url: t.url, albumCover: t.thumbnailUrl, genre: t.genre,
    } as Track)),
  });

  const handlePlayTrack = async (track: ArchiveTrack, queue: ArchiveTrack[]) => {
    const isCurrent = currentTrack?.id === track.id;
    if (isCurrent) { isPlaying ? pause() : resume(); return; }
    const url = await getAudiusStreamUrl(track.id);
    const t: Track = { id: track.id, title: track.title, artist: track.artist, url, albumCover: track.thumbnailUrl, genre: track.genre } as Track;
    playTrack(t, buildAlbum(queue), 'RADIO');
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    handlePlayTrack(tracks[0], tracks);
  };

  const handleShuffle = () => {
    if (tracks.length === 0) return;
    const shuffledTracks = [...tracks].sort(() => Math.random() - 0.5);
    handlePlayTrack(shuffledTracks[0], shuffledTracks);
    setShuffled(true);
    setTimeout(() => setShuffled(false), 1000);
  };

  const displayTracks = tracks;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-full"
    >
      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        {/* Blurred artwork background */}
        <div className="absolute inset-0">
          {album.artworkUrl ? (
            <img src={album.artworkUrl} className="w-full h-full object-cover scale-110 blur-2xl opacity-40" alt="" />
          ) : (
            <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${PURPLE.accent}60 0%, transparent 100%)` }} />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)' }} />
        </div>

        {/* Back */}
        <button
          onClick={onBack}
          className="absolute top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"
        >
          <ArrowLeft size={16} />
          <span className="text-[9px] font-black uppercase tracking-widest">Back</span>
        </button>

        {/* Album info */}
        <div className="relative z-10 px-8 lg:px-16 pt-20 pb-10 flex flex-col md:flex-row items-end gap-8">
          {/* Artwork */}
          <div className="w-44 h-44 lg:w-60 lg:h-60 rounded-3xl overflow-hidden shrink-0 shadow-[0_40px_80px_rgba(0,0,0,0.6)]"
            style={{ boxShadow: `0 0 0 1px ${PURPLE.border}` }}>
            {album.artworkUrl ? (
              <img src={album.artworkUrl} className="w-full h-full object-cover" alt={album.title} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                <Disc3 size={60} style={{ color: PURPLE.text }} />
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 pb-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: PURPLE.text }}>
                Audius {album.isAlbum ? 'Album' : 'Playlist'}
              </span>
            </div>
            <h1 className="text-3xl lg:text-5xl font-black uppercase tracking-tighter leading-none text-white mb-3">
              {album.title}
            </h1>

            {/* Artist link */}
            {artist ? (
              <button
                onClick={() => onViewArtist?.(artist)}
                className="flex items-center gap-3 mb-4 group"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden border border-white/20">
                  {artist.profilePicture ? (
                    <img src={artist.profilePicture} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <div className="w-full h-full" style={{ background: PURPLE.bg }} />
                  )}
                </div>
                <span className="text-sm font-black text-white/70 group-hover:text-white transition-colors">{artist.name}</span>
              </button>
            ) : (
              <p className="text-sm font-black mb-4" style={{ color: PURPLE.text }}>{album.curator}</p>
            )}

            {album.description && (
              <p className="text-sm text-white/50 leading-relaxed max-w-xl line-clamp-2 mb-4">{album.description}</p>
            )}

            {/* Meta */}
            <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-widest text-white/30 mb-6">
              <span>{album.trackCount} tracks</span>
              {!loading && tracks.length > 0 && totalDur(tracks) && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock size={10} /> {totalDur(tracks)}</span>
                </>
              )}
              {album.releaseDate && (
                <>
                  <span>·</span>
                  <span>{new Date(album.releaseDate).getFullYear()}</span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayAll}
                disabled={loading || tracks.length === 0}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-30 text-black"
                style={{ background: PURPLE.text }}
              >
                <Play size={15} fill="currentColor" /> Play
              </button>
              <button
                onClick={handleShuffle}
                disabled={loading || tracks.length === 0}
                className={`flex items-center gap-2 px-5 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest border transition-all disabled:opacity-30 ${
                  shuffled ? 'text-green-400 border-green-400/40' : ''
                }`}
                style={!shuffled ? { borderColor: PURPLE.border, color: PURPLE.text } : {}}
              >
                <Shuffle size={14} /> Shuffle
              </button>
              <a
                href={`https://audius.co/playlists/${album.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-3.5 rounded-full font-black text-[10px] uppercase tracking-widest border transition-all hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
              >
                <ExternalLink size={13} /> Audius
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tracklist ── */}
      <div className="px-8 lg:px-16 py-6">
        {/* Column headers */}
        <div className="flex items-center gap-4 px-4 mb-2 border-b border-white/5 pb-3">
          <span className="w-6 text-[9px] font-black uppercase tracking-widest text-white/20 text-center">#</span>
          <span className="flex-1 text-[9px] font-black uppercase tracking-widest text-white/20">Title</span>
          <span className="text-[9px] font-black uppercase tracking-widest text-white/20 w-14 text-right">
            <Clock size={10} className="inline" />
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : displayTracks.length === 0 ? (
          <p className="text-center text-white/30 py-16 text-[10px] font-black uppercase tracking-widest">No tracks found</p>
        ) : (
          <div className="space-y-0.5">
            {displayTracks.map((track, i) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <button
                  key={track.id}
                  onClick={() => handlePlayTrack(track, displayTracks)}
                  className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-left group ${
                    isCurrent
                      ? 'bg-purple-500/15 border border-purple-500/20'
                      : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  {/* Index */}
                  <div className="w-6 text-center shrink-0">
                    {isCurrent && isPlaying ? (
                      <div className="flex items-end justify-center gap-[2px] h-4">
                        {[0, 1, 2].map(b => (
                          <div key={b} className="w-[3px] rounded-full animate-bounce bg-purple-400"
                            style={{ height: `${[12, 8, 10][b]}px`, animationDelay: `${b * 0.1}s` }} />
                        ))}
                      </div>
                    ) : (
                      <>
                        <span className={`text-[11px] font-bold group-hover:hidden ${isCurrent ? 'text-purple-400' : 'text-white/30'}`}>{i + 1}</span>
                        <Play size={13} className="hidden group-hover:block text-white/60 mx-auto" />
                      </>
                    )}
                  </div>

                  {/* Artwork */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10">
                    {track.thumbnailUrl ? (
                      <img src={track.thumbnailUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                        <Music2 size={14} style={{ color: PURPLE.text }} />
                      </div>
                    )}
                  </div>

                  {/* Title */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-black truncate ${isCurrent ? 'text-purple-300' : 'text-white'}`}>{track.title}</p>
                    {track.genre && <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">{track.genre}</p>}
                  </div>

                  {/* Duration */}
                  <span className="text-[10px] font-mono text-white/30 w-14 text-right shrink-0">{fmtDur(track.duration)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AudiusAlbumView;
