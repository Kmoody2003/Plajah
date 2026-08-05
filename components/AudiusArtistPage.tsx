import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Play, Pause, Music2, ExternalLink,
  Sparkles, Disc3, List,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { Album, Track } from '../types';
import {
  AudiusArtist, AudiusAlbum,
  fetchAudiusArtistTracks, fetchAudiusArtistAlbums, fetchAudiusArtistPlaylists,
  fetchAudiusRelatedArtists, getAudiusStreamUrl,
} from '../services/audiusService';
import type { ArchiveTrack } from '../services/archiveContentService';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';

interface Props {
  artist: AudiusArtist;
  onBack: () => void;
  onSelectAlbum: (album: AudiusAlbum) => void;
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

const PURPLE = { bg: 'rgba(126,34,206,0.2)', border: 'rgba(168,85,247,0.3)', text: '#a855f7', accent: '#7e22ce' } as const;

const AudiusArtistPage: React.FC<Props> = ({ artist, onBack, onSelectAlbum }) => {
  const { playTrack, currentTrack, isPlaying, pause, resume } = useGlobalPlayer();

  const [tracks, setTracks]   = useState<ArchiveTrack[]>([]);
  const [albums, setAlbums]   = useState<AudiusAlbum[]>([]);
  const [playlists, setPlaylists] = useState<AudiusAlbum[]>([]);
  const [related, setRelated] = useState<AudiusArtist[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'TRACKS' | 'ALBUMS' | 'PLAYLISTS'>('TRACKS');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAudiusArtistTracks(artist.id, 20),
      fetchAudiusArtistAlbums(artist.id),
      fetchAudiusArtistPlaylists(artist.id),
      fetchAudiusRelatedArtists(artist.id, 6),
    ]).then(([t, a, p, r]) => {
      setTracks(t);
      setAlbums(a);
      setPlaylists(p);
      setRelated(r.filter(r => r.id !== artist.id));
      setLoading(false);
    });
  }, [artist.id]);

  const buildAlbum = (trackList: ArchiveTrack[]): Album => ({
    id: `audius_artist_${artist.id}`,
    title: artist.name,
    artist: artist.name,
    coverImage: artist.profilePicture,
    themeColor: '#7e22ce',
    createdAt: Date.now(),
    description: '',
    tracks: trackList.map(t => ({
      id: t.id, title: t.title, artist: t.artist,
      url: t.url, albumCover: t.thumbnailUrl, genre: t.genre,
    } as Track)),
  });

  const handlePlayTrack = async (track: ArchiveTrack) => {
    const isCurrent = currentTrack?.id === track.id;
    if (isCurrent) { isPlaying ? pause() : resume(); return; }
    const url = await getAudiusStreamUrl(track.id);
    const t: Track = { id: track.id, title: track.title, artist: track.artist, url, albumCover: track.thumbnailUrl, genre: track.genre } as Track;
    playTrack(t, buildAlbum(tracks), 'RADIO');
  };

  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    handlePlayTrack(tracks[0]);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="min-h-full"
    >
      {/* ── Hero ── */}
      <div className="relative overflow-hidden">
        {/* Cover photo background */}
        <div className="absolute inset-0">
          {artist.coverPhoto ? (
            <img src={artist.coverPhoto} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${PURPLE.accent}60 0%, transparent 100%)` }} />
          )}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)' }} />
        </div>

        {/* Back button */}
        <button
          onClick={onBack}
          className="absolute top-6 left-6 z-50 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-all"
        >
          <ArrowLeft size={16} />
          <span className="text-[9px] font-black uppercase tracking-widest">Back</span>
        </button>

        {/* Artist info */}
        <div className="relative z-10 px-8 lg:px-16 pt-24 pb-10 flex flex-col md:flex-row items-end gap-8">
          {/* Profile picture */}
          <div className="w-40 h-40 lg:w-56 lg:h-56 rounded-3xl overflow-hidden shrink-0 shadow-2xl"
            style={{ boxShadow: `0 0 0 4px ${PURPLE.border}` }}>
            {artist.profilePicture ? (
              <img src={thumb(artist.profilePicture, THUMB.large) || undefined} onError={onThumbError(artist.profilePicture)} loading="lazy" decoding="async" className="w-full h-full object-cover" alt={artist.name} />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                <Music2 size={56} style={{ color: PURPLE.text }} />
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0 pb-2">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-[8px] font-black uppercase tracking-[0.4em]" style={{ color: PURPLE.text }}>
                Audius Artist
              </span>
              {artist.verified && (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black"
                  style={{ background: PURPLE.bg, color: PURPLE.text, border: `1px solid ${PURPLE.border}` }}>
                  <Sparkles size={9} /> Verified
                </div>
              )}
            </div>
            <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-none text-white mb-3 truncate">
              {artist.name}
            </h1>
            <p className="text-sm font-bold mb-4" style={{ color: PURPLE.text }}>@{artist.handle}</p>

            {artist.bio && (
              <p className="text-sm text-white/60 leading-relaxed max-w-2xl line-clamp-3 mb-5">{artist.bio}</p>
            )}

            {/* Stats row */}
            <div className="flex items-center gap-6 mb-6">
              <div className="text-center">
                <p className="text-lg font-black text-white">{fmt(artist.followerCount)}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Followers</p>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="text-center">
                <p className="text-lg font-black text-white">{fmt(artist.trackCount)}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Tracks</p>
              </div>
              {albums.length > 0 && (
                <>
                  <div className="w-px h-8 bg-white/10" />
                  <div className="text-center">
                    <p className="text-lg font-black text-white">{albums.length}</p>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Albums</p>
                  </div>
                </>
              )}
            </div>

            {/* Built-for-you CTA — the outreach funnel entry point (see
                docs/AUDIUS_OUTREACH_AND_INTEGRATION.md). Turns passive discovery of an
                Audius artist into an onboarding prompt. */}
            <div className="mb-6 rounded-2xl p-4 border max-w-2xl" style={{ background: PURPLE.bg, borderColor: PURPLE.border }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(168,85,247,0.25)' }}>
                  <Sparkles size={16} style={{ color: PURPLE.text }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white">Plajah is built for you too</p>
                  <p className="text-[11px] text-white/60 leading-snug mt-0.5">
                    Your Audius music already streams natively here — plus the Breakdown, the Pixels visualizer, DJ mode, live, and memberships. Claim your page to make it yours.
                  </p>
                  <div className="flex items-center gap-2 mt-2.5">
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'LANDING' } }))}
                      className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest text-white" style={{ background: PURPLE.accent }}>
                      Claim your page
                    </button>
                    <a href={`https://audius.co/${artist.handle}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold text-white/70 bg-white/5 hover:bg-white/10 transition-colors">
                      <ExternalLink size={11} /> On Audius
                    </a>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handlePlayAll}
                disabled={tracks.length === 0}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-full text-black font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-30"
                style={{ background: PURPLE.text }}
              >
                <Play size={15} fill="currentColor" /> Play All
              </button>
              <a
                href={`https://audius.co/${artist.handle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-3.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all hover:bg-white/5"
                style={{ borderColor: PURPLE.border, color: PURPLE.text }}
              >
                <ExternalLink size={13} /> Audius
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section tabs ── */}
      <div className="px-8 lg:px-16 border-b border-white/10 flex gap-6 mt-2">
        {(['TRACKS', 'ALBUMS', 'PLAYLISTS'] as const).map(s => (
          <button
            key={s}
            onClick={() => setActiveSection(s)}
            className={`py-4 text-[9px] font-black uppercase tracking-widest border-b-2 transition-all ${
              activeSection === s
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-white/30 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="px-8 lg:px-16 py-8 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeSection === 'TRACKS' && (
              <motion.div key="tracks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {tracks.length === 0 ? (
                  <p className="text-center text-white/30 py-16 text-[10px] font-black uppercase tracking-widest">No tracks found</p>
                ) : (
                  <div className="space-y-1">
                    {tracks.map((track, i) => {
                      const isCurrent = currentTrack?.id === track.id;
                      return (
                        <button
                          key={track.id}
                          onClick={() => handlePlayTrack(track)}
                          className={`w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all text-left group ${
                            isCurrent
                              ? 'bg-purple-500/15 border border-purple-500/30'
                              : 'hover:bg-white/5 border border-transparent'
                          }`}
                        >
                          {/* Index / playing indicator */}
                          <div className="w-6 text-center shrink-0">
                            {isCurrent && isPlaying ? (
                              <div className="flex items-end justify-center gap-[2px] h-4">
                                {[0, 1, 2].map(b => (
                                  <div key={b} className="w-[3px] rounded-full animate-bounce bg-purple-400"
                                    style={{ height: `${[12, 8, 10][b]}px`, animationDelay: `${b * 0.1}s` }} />
                                ))}
                              </div>
                            ) : (
                              <span className={`text-[11px] font-bold ${isCurrent ? 'text-purple-400' : 'text-white/30 group-hover:hidden'}`}>{i + 1}</span>
                            )}
                            <Play size={14} className="hidden group-hover:block text-white/60 mx-auto" style={isCurrent ? { display: 'none' } : {}} />
                          </div>

                          {/* Artwork */}
                          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10">
                            {track.thumbnailUrl ? (
                              <img src={thumb(track.thumbnailUrl, THUMB.small) || undefined} onError={onThumbError(track.thumbnailUrl)} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                                <Music2 size={14} style={{ color: PURPLE.text }} />
                              </div>
                            )}
                          </div>

                          {/* Title + genre */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-black truncate ${isCurrent ? 'text-purple-300' : 'text-white'}`}>{track.title}</p>
                            {track.genre && <p className="text-[9px] font-bold uppercase tracking-widest text-white/30 truncate">{track.genre}</p>}
                          </div>

                          {/* Duration */}
                          {track.duration && (
                            <span className="text-[10px] font-mono text-white/30 shrink-0">{fmtDur(track.duration)}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === 'ALBUMS' && (
              <motion.div key="albums" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {albums.length === 0 ? (
                  <p className="text-center text-white/30 py-16 text-[10px] font-black uppercase tracking-widest">No albums found</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {albums.map(album => (
                      <button key={album.id} onClick={() => onSelectAlbum(album)} className="group text-left">
                        <div className="aspect-square rounded-2xl overflow-hidden mb-3 relative border"
                          style={{ borderColor: PURPLE.border }}>
                          {album.artworkUrl ? (
                            <img src={thumb(album.artworkUrl, THUMB.card) || undefined} onError={onThumbError(album.artworkUrl)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" loading="lazy" decoding="async" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                              <Disc3 size={32} style={{ color: PURPLE.text }} />
                            </div>
                          )}
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            style={{ background: 'rgba(0,0,0,0.5)' }}>
                            <Play size={32} style={{ color: PURPLE.text }} />
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest"
                            style={{ background: PURPLE.accent, color: '#e9d5ff' }}>
                            Album
                          </div>
                        </div>
                        <p className="text-xs font-black truncate text-white">{album.title}</p>
                        <p className="text-[9px] font-bold" style={{ color: PURPLE.text }}>{album.trackCount} tracks</p>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {activeSection === 'PLAYLISTS' && (
              <motion.div key="playlists" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {playlists.length === 0 ? (
                  <p className="text-center text-white/30 py-16 text-[10px] font-black uppercase tracking-widest">No playlists found</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                    {playlists.map(pl => (
                      <button key={pl.id} onClick={() => onSelectAlbum(pl)} className="group text-left">
                        <div className="aspect-square rounded-2xl overflow-hidden mb-3 relative border"
                          style={{ borderColor: PURPLE.border }}>
                          {pl.artworkUrl ? (
                            <img src={thumb(pl.artworkUrl, THUMB.card) || undefined} onError={onThumbError(pl.artworkUrl)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" loading="lazy" decoding="async" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                              <List size={32} style={{ color: PURPLE.text }} />
                            </div>
                          )}
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            style={{ background: 'rgba(0,0,0,0.5)' }}>
                            <Play size={32} style={{ color: PURPLE.text }} />
                          </div>
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest"
                            style={{ background: 'rgba(126,34,206,0.6)', color: '#e9d5ff' }}>
                            Playlist
                          </div>
                        </div>
                        <p className="text-xs font-black truncate text-white">{pl.title}</p>
                        <p className="text-[9px] font-bold" style={{ color: PURPLE.text }}>{pl.trackCount} tracks</p>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ── Related Artists ── */}
        {!loading && related.length > 0 && (
          <div className="pt-8 border-t border-white/10">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] mb-6" style={{ color: PURPLE.text }}>
              Related Artists
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
              {related.map(r => (
                <button key={r.id} className="group text-center" onClick={() => {
                  // Dispatch event to navigate to this artist — handled by parent
                  window.dispatchEvent(new CustomEvent('audius-artist', { detail: r }));
                }}>
                  <div className="aspect-square rounded-2xl overflow-hidden mb-2 mx-auto w-full max-w-[100px] border"
                    style={{ borderColor: PURPLE.border }}>
                    {r.profilePicture ? (
                      <img src={thumb(r.profilePicture, THUMB.small) || undefined} onError={onThumbError(r.profilePicture)} className="w-full h-full object-cover group-hover:scale-110 transition-transform" alt="" loading="lazy" decoding="async" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                        <Music2 size={24} style={{ color: PURPLE.text }} />
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] font-black truncate text-white">{r.name}</p>
                  <p className="text-[8px]" style={{ color: PURPLE.text }}>{fmt(r.followerCount)} followers</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AudiusArtistPage;
