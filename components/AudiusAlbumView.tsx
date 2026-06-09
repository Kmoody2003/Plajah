import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Play, Pause, Shuffle, ExternalLink, Music2, Disc3, Clock, Waves, Hash, Zap, BarChart2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { Album, Track } from '../types';
import {
  AudiusAlbum, AudiusArtist,
  fetchAudiusPlaylistTracks, fetchAudiusArtistById, getAudiusStreamUrl,
} from '../services/audiusService';
import type { ArchiveTrack } from '../services/archiveContentService';
import { getAllBreakdowns, type StoredBreakdown } from './TrackBreakdownModal';

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

// ─── Mini note grid for breakdown results ──────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  MELODY: '#f97316', HARMONY: '#a855f7', BASS: '#10b981', ACCENT: '#ef4444',
};

const MiniStaff: React.FC<{ notes: StoredBreakdown['theory']['notes'] }> = ({ notes }) => (
  <svg width="100%" viewBox="0 0 300 48" className="w-full opacity-80">
    {[12, 20, 28, 36, 44].map((y, i) => (
      <line key={i} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
    ))}
    {notes.slice(0, 16).map((note, i) => {
      const x = 8 + i * 18;
      const y = Math.max(8, Math.min(44, 44 - ((note.midi - 48) / 30) * 36));
      return (
        <ellipse key={i} cx={x} cy={y} rx={5} ry={3.5}
          fill={ROLE_COLOR[note.role] ?? '#f97316'}
          opacity={0.85}
          transform={`rotate(-12,${x},${y})`}
        />
      );
    })}
  </svg>
);

// ─── Breakdown results panel ───────────────────────────────────────────────────

const BreakdownResultsPanel: React.FC<{
  tracks: ArchiveTrack[];
  onOpenBreakdown: (track: ArchiveTrack) => void;
}> = ({ tracks, onOpenBreakdown }) => {
  const [breakdowns, setBreakdowns] = useState<Record<string, StoredBreakdown>>({});

  useEffect(() => {
    setBreakdowns(getAllBreakdowns());
    // Refresh every 2s in case user opens a breakdown from another tab
    const id = setInterval(() => setBreakdowns(getAllBreakdowns()), 2000);
    return () => clearInterval(id);
  }, []);

  const stored = tracks
    .map(t => ({ track: t, result: breakdowns[t.id] }))
    .filter(x => x.result);

  const unanalyzed = tracks.filter(t => !breakdowns[t.id]);

  if (stored.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center py-24 gap-6"
      >
        <div className="w-16 h-16 rounded-3xl flex items-center justify-center border border-dashed border-white/15">
          <Waves size={28} className="text-white/20" />
        </div>
        <div className="text-center max-w-xs">
          <p className="text-sm font-black uppercase tracking-widest text-white/40 mb-2">No Breakdowns Yet</p>
          <p className="text-xs text-white/25 leading-relaxed">
            Play a track and tap the breakdown button to analyze its key, tempo, chord structure, and generate a live score.
          </p>
        </div>
        {tracks.length > 0 && (
          <button
            onClick={() => onOpenBreakdown(tracks[0])}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-xs uppercase tracking-widest transition-all"
            style={{ background: PURPLE.text, color: '#000' }}
          >
            <Waves size={13} /> Analyze First Track
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {/* Stored breakdowns */}
      {stored.map(({ track, result }, idx) => (
        <motion.div
          key={track.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.04 }}
          className="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden hover:border-purple-500/25 transition-all group"
        >
          {/* Track header */}
          <div className="flex items-center gap-3 px-4 pt-4 pb-3">
            <div className="w-8 h-8 rounded-xl overflow-hidden border border-white/10 shrink-0">
              {track.thumbnailUrl
                ? <img src={track.thumbnailUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}><Music2 size={12} style={{ color: PURPLE.text }} /></div>
              }
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white truncate">{track.title}</p>
              <p className="text-xs text-white/40">{track.artist}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {result.isReal ? (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 4px #34d399' }} />
                  <span className="text-[10px] font-black text-emerald-400">Live Analysis</span>
                </span>
              ) : (
                <span className="text-[10px] font-black text-white/25 px-2 py-0.5 rounded-full bg-white/5">Genre Estimate</span>
              )}
              <button
                onClick={() => onOpenBreakdown(track)}
                className="p-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-400 transition-all opacity-0 group-hover:opacity-100"
                title="Open Full Breakdown"
              >
                <Waves size={12} />
              </button>
            </div>
          </div>

          {/* Mini staff */}
          <div className="px-4 pb-2">
            <MiniStaff notes={result.theory.notes} />
          </div>

          {/* Theory stats */}
          <div className="grid grid-cols-4 divide-x divide-white/[0.06] border-t border-white/[0.06]">
            {[
              { icon: <Hash size={11} />, label: 'Key', value: result.theory.key },
              { icon: <Music2 size={11} />, label: 'Scale', value: result.theory.scale.split(' ').pop() ?? result.theory.scale },
              { icon: <Zap size={11} />, label: 'Tempo', value: `${result.theory.tempo}` },
              { icon: <BarChart2 size={11} />, label: 'Chord', value: result.theory.chordQuality },
            ].map(({ icon, label, value }) => (
              <div key={label} className="flex flex-col items-center py-3 gap-0.5">
                <span className="text-white/30">{icon}</span>
                <span className="text-[9px] font-black uppercase tracking-wider text-white/25">{label}</span>
                <span className="text-xs font-black text-white/80 truncate max-w-full px-1 text-center">{value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ))}

      {/* Unanalyzed tracks */}
      {unanalyzed.length > 0 && (
        <div className="pt-2">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/25 mb-3 px-1">
            {unanalyzed.length} track{unanalyzed.length !== 1 ? 's' : ''} not yet analyzed
          </p>
          <div className="space-y-1.5">
            {unanalyzed.map(track => (
              <button
                key={track.id}
                onClick={() => onOpenBreakdown(track)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border border-white/[0.05] hover:border-purple-500/25 hover:bg-purple-500/5 transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-lg overflow-hidden border border-white/10 shrink-0">
                  {track.thumbnailUrl
                    ? <img src={track.thumbnailUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                    : <div className="w-full h-full" style={{ background: PURPLE.bg }} />
                  }
                </div>
                <span className="flex-1 text-xs font-black text-white/40 group-hover:text-white/70 transition-colors truncate">{track.title}</span>
                <span className="flex items-center gap-1.5 text-[10px] font-black text-white/20 group-hover:text-purple-400 transition-colors shrink-0">
                  <Waves size={10} /> Analyze
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────

type AlbumTab = 'tracks' | 'breakdown';

const AudiusAlbumView: React.FC<Props> = ({ album, onBack, onViewArtist }) => {
  const { playTrack, currentTrack, isPlaying, pause, resume } = useGlobalPlayer();

  const [tracks, setTracks]   = useState<ArchiveTrack[]>([]);
  const [artist, setArtist]   = useState<AudiusArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [shuffled, setShuffled] = useState(false);
  const [activeTab, setActiveTab] = useState<AlbumTab>('tracks');

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

  const buildAlbum = useCallback((trackList: ArchiveTrack[]): Album => ({
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
  }), [album]);

  const handlePlayTrack = async (track: ArchiveTrack, queue: ArchiveTrack[]) => {
    const isCurrent = currentTrack?.id === track.id;
    if (isCurrent) { isPlaying ? pause() : resume(); return; }
    const url = await getAudiusStreamUrl(track.id);
    const t: Track = { id: track.id, title: track.title, artist: track.artist, url, albumCover: track.thumbnailUrl, genre: track.genre } as Track;
    playTrack(t, buildAlbum(queue), 'RADIO');
  };

  const openBreakdown = useCallback((track: ArchiveTrack) => {
    const t: Track = {
      id: track.id, title: track.title, artist: track.artist,
      url: track.url ?? '', albumCover: track.thumbnailUrl, genre: track.genre,
    } as Track;
    window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', { detail: { track: t, album: buildAlbum(tracks) } }));
  }, [tracks, buildAlbum]);

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
          <span className="text-xs font-black uppercase tracking-widest">Back</span>
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
              <span className="text-[10px] font-black uppercase tracking-[0.4em]" style={{ color: PURPLE.text }}>
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
            <div className="flex items-center gap-3 text-xs font-black uppercase tracking-widest text-white/30 mb-6">
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
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-full font-black text-xs uppercase tracking-widest transition-all disabled:opacity-30 text-black"
                style={{ background: PURPLE.text }}
              >
                <Play size={15} fill="currentColor" /> Play
              </button>
              <button
                onClick={handleShuffle}
                disabled={loading || tracks.length === 0}
                className={`flex items-center gap-2 px-5 py-3.5 rounded-full font-black text-xs uppercase tracking-widest border transition-all disabled:opacity-30 ${
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
                className="flex items-center gap-2 px-5 py-3.5 rounded-full font-black text-xs uppercase tracking-widest border transition-all hover:bg-white/5"
                style={{ borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}
              >
                <ExternalLink size={13} /> Audius
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="px-8 lg:px-16 pt-2 pb-0 flex items-center gap-1 border-b border-white/[0.06]">
        {([
          { id: 'tracks',    label: 'Tracks',    icon: <Music2 size={12} /> },
          { id: 'breakdown', label: 'Breakdown',  icon: <Waves size={12} /> },
        ] as { id: AlbumTab; label: string; icon: React.ReactNode }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-5 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all -mb-px ${
              activeTab === tab.id
                ? 'border-purple-400 text-purple-400'
                : 'border-transparent text-white/35 hover:text-white/65'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="px-8 lg:px-16 py-6">
        <AnimatePresence mode="wait">
          {activeTab === 'tracks' ? (
            <motion.div
              key="tracks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Column headers */}
              <div className="flex items-center gap-4 px-4 mb-2 border-b border-white/5 pb-3">
                <span className="w-6 text-[10px] font-black uppercase tracking-widest text-white/20 text-center">#</span>
                <span className="flex-1 text-[10px] font-black uppercase tracking-widest text-white/20">Title</span>
                <span className="w-8 text-[10px] font-black uppercase tracking-widest text-white/20 text-center">
                  <Waves size={10} className="inline" />
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20 w-14 text-right">
                  <Clock size={10} className="inline" />
                </span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                </div>
              ) : tracks.length === 0 ? (
                <p className="text-center text-white/30 py-16 text-xs font-black uppercase tracking-widest">No tracks found</p>
              ) : (
                <div className="space-y-0.5">
                  {tracks.map((track, i) => {
                    const isCurrent = currentTrack?.id === track.id;
                    return (
                      <div
                        key={track.id}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all group ${
                          isCurrent
                            ? 'bg-purple-500/15 border border-purple-500/20'
                            : 'hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        {/* Index / play indicator */}
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
                              <span className={`text-xs font-bold group-hover:hidden ${isCurrent ? 'text-purple-400' : 'text-white/30'}`}>{i + 1}</span>
                              <button
                                onClick={() => handlePlayTrack(track, tracks)}
                                className="hidden group-hover:flex items-center justify-center"
                              >
                                <Play size={13} className="text-white/60 mx-auto" />
                              </button>
                            </>
                          )}
                        </div>

                        {/* Artwork */}
                        <button
                          onClick={() => handlePlayTrack(track, tracks)}
                          className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10"
                        >
                          {track.thumbnailUrl ? (
                            <img src={track.thumbnailUrl} className="w-full h-full object-cover" alt="" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: PURPLE.bg }}>
                              <Music2 size={14} style={{ color: PURPLE.text }} />
                            </div>
                          )}
                        </button>

                        {/* Title */}
                        <button
                          onClick={() => handlePlayTrack(track, tracks)}
                          className="flex-1 min-w-0 text-left"
                        >
                          <p className={`text-sm font-black truncate ${isCurrent ? 'text-purple-300' : 'text-white'}`}>{track.title}</p>
                          {track.genre && <p className="text-xs font-bold uppercase tracking-wider text-white/30">{track.genre}</p>}
                        </button>

                        {/* Breakdown button — always visible */}
                        <button
                          onClick={() => openBreakdown(track)}
                          title="The Breakdown — analyze key, tempo, chords & sheet music"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#FF8C00]/10 hover:bg-[#FF8C00]/25 text-[#FF8C00]/60 hover:text-[#FF8C00] transition-all text-[9px] font-black uppercase tracking-widest shrink-0"
                        >
                          <Waves size={11} />
                          <span className="hidden sm:inline">Breakdown</span>
                        </button>

                        {/* Duration */}
                        <span className="text-xs font-mono text-white/30 w-14 text-right shrink-0">{fmtDur(track.duration)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="breakdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="mb-5">
                <h3 className="text-sm font-black uppercase tracking-widest text-white mb-1">Track Analysis</h3>
                <p className="text-xs text-white/35 leading-relaxed">
                  Play any track and tap <Waves size={10} className="inline mx-0.5" /> to run The Breakdown.
                  Results are stored here automatically.
                </p>
              </div>
              <BreakdownResultsPanel
                tracks={tracks}
                onOpenBreakdown={openBreakdown}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default AudiusAlbumView;
