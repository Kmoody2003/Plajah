import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Music2, Share2, Heart, Play, Plus, X, Check, Loader2,
  ChevronRight, Users, Headphones, BookOpen, Tag,
  ArrowLeft, Upload, Dumbbell, Moon, Brain, Zap, Coffee,
  ListMusic,
} from 'lucide-react';
import { CommunityPlaylist, Playlist, Track, UserProfile } from '../types';
import {
  fetchCommunityPlaylistsByTag,
  fetchAllCommunityPlaylists,
  fetchPersonalPlaylists,
  sharePlaylistToCommunity,
  likeCommunityPlaylist,
  incrementPlaylistPlays,
  fetchMySharedPlaylists,
} from '../services/backendService';

// ─── Tag config ────────────────────────────────────────────────────────────────
export const PLAYLIST_TAGS = [
  { id: 'workout',    label: 'Workout',    icon: Dumbbell,    color: '#06D6A0' },
  { id: 'wellness',   label: 'Wellness',   icon: Heart,       color: '#E63946' },
  { id: 'meditation', label: 'Meditation', icon: Brain,       color: '#748FFC' },
  { id: 'sleep',      label: 'Sleep',      icon: Moon,        color: '#9B5DE5' },
  { id: 'hype',       label: 'Hype',       icon: Zap,         color: '#FF8C00' },
  { id: 'study',      label: 'Study',      icon: BookOpen,    color: '#00B4D8' },
  { id: 'chill',      label: 'Chill',      icon: Coffee,      color: '#40C057' },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDuration = (secs?: number) => {
  if (!secs) return '';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const fmtCount = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

// ─── Playlist card ────────────────────────────────────────────────────────────
interface CardProps {
  playlist: CommunityPlaylist;
  onLike: () => void;
  onPlay: () => void;
  liked?: boolean;
}

const PlaylistCard: React.FC<CardProps> = ({ playlist, onLike, onPlay, liked }) => {
  const tagMeta = PLAYLIST_TAGS.filter(t => playlist.tags?.includes(t.id));
  const cover = playlist.coverUrl || playlist.coverImage || `https://picsum.photos/seed/${playlist.id}/400/400`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex flex-col bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden hover:border-white/18 transition-all"
    >
      {/* Cover */}
      <div className="relative aspect-square overflow-hidden">
        <img
          src={cover}
          alt={playlist.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Tags overlay */}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {tagMeta.slice(0, 2).map(t => {
            const Icon = t.icon;
            return (
              <span
                key={t.id}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[6px] font-black uppercase tracking-widest"
                style={{ background: `${t.color}30`, color: t.color }}
              >
                <Icon size={7} /> {t.label}
              </span>
            );
          })}
        </div>

        {/* Play button */}
        <button
          onClick={onPlay}
          className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-white/25 hover:scale-105 transition-all opacity-0 group-hover:opacity-100"
        >
          <Play size={14} className="text-white ml-0.5" />
        </button>
      </div>

      {/* Info */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div>
          <h4 className="text-xs font-black text-white leading-tight line-clamp-1">{playlist.title}</h4>
          {playlist.description && (
            <p className="text-[8px] text-white/35 mt-0.5 line-clamp-2 leading-relaxed">{playlist.description}</p>
          )}
        </div>

        {/* Creator */}
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full overflow-hidden bg-white/10 shrink-0">
            {playlist.authorPhoto
              ? <img src={playlist.authorPhoto} alt="" className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-[7px] font-black text-white/40">{playlist.authorName?.[0] ?? '?'}</span>
            }
          </div>
          <span className="text-[8px] font-black text-white/40 truncate">{playlist.authorName ?? 'Unknown'}</span>
        </div>

        {/* Stats + like */}
        <div className="flex items-center gap-3 mt-auto pt-2 border-t border-white/5">
          <span className="text-[7px] font-black uppercase text-white/25 flex items-center gap-1">
            <Headphones size={9} /> {fmtCount(playlist.plays ?? 0)}
          </span>
          <span className="text-[7px] text-white/25">{playlist.tracks?.length ?? playlist.trackIds?.length ?? 0} tracks</span>
          <button
            onClick={e => { e.stopPropagation(); onLike(); }}
            className={`ml-auto p-1.5 rounded-lg transition-all ${liked ? 'text-red-400' : 'text-white/20 hover:text-red-400'}`}
          >
            <Heart size={12} fill={liked ? 'currentColor' : 'none'} />
          </button>
          <span className="text-[7px] text-white/25">{fmtCount(playlist.likes ?? 0)}</span>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Track list modal ─────────────────────────────────────────────────────────
const TrackListModal: React.FC<{
  playlist: CommunityPlaylist;
  onClose: () => void;
  onPlay: (t: Track) => void;
}> = ({ playlist, onClose, onPlay }) => {
  const cover = playlist.coverUrl || playlist.coverImage || `https://picsum.photos/seed/${playlist.id}/400/400`;
  const tracks = playlist.tracks ?? [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#0d0d0d] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="relative h-32 overflow-hidden">
          <img src={cover} alt="" className="w-full h-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d0d] via-black/40 to-transparent" />
          <div className="absolute bottom-4 left-5 right-12">
            <h3 className="font-black text-white text-sm">{playlist.title}</h3>
            <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mt-0.5">{playlist.authorName} · {tracks.length} tracks</p>
          </div>
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Track list */}
        <div className="max-h-72 overflow-y-auto custom-scrollbar">
          {tracks.length === 0 ? (
            <div className="py-8 text-center">
              <ListMusic size={24} className="text-white/10 mx-auto mb-2" />
              <p className="text-[9px] text-white/25">No tracks in this playlist yet</p>
            </div>
          ) : (
            <div className="p-3 space-y-1">
              {tracks.map((t, i) => (
                <button
                  key={t.id || i}
                  onClick={() => onPlay(t)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left group"
                >
                  <span className="text-[8px] font-black text-white/20 w-5 text-center shrink-0">{i + 1}</span>
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-white/5 shrink-0">
                    {t.albumCover ? (
                      <img src={t.albumCover} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Music2 size={10} className="text-white/20" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white/80 truncate group-hover:text-white transition-colors">{t.title}</p>
                    <p className="text-[8px] text-white/30 truncate">{t.artist}</p>
                  </div>
                  {t.duration && (
                    <span className="text-[7px] font-mono text-white/20 shrink-0">{fmtDuration(t.duration)}</span>
                  )}
                  <Play size={11} className="text-white/20 group-hover:text-white/60 transition-colors shrink-0 opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Share playlist modal ─────────────────────────────────────────────────────
const ShareModal: React.FC<{
  playlists: Playlist[];
  onShare: (playlist: Playlist, tags: string[]) => Promise<void>;
  onClose: () => void;
}> = ({ playlists, onShare, onClose }) => {
  const [selected, setSelected] = useState<Playlist | null>(null);
  const [tags, setTags]         = useState<string[]>([]);
  const [sharing, setSharing]   = useState(false);
  const [done, setDone]         = useState(false);

  const toggle = (tag: string) =>
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const handleShare = async () => {
    if (!selected || !tags.length) return;
    setSharing(true);
    try {
      await onShare(selected, tags);
      setDone(true);
      setTimeout(onClose, 1500);
    } finally {
      setSharing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-[#0d0d0d] border border-white/10 rounded-[2rem] p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-white">Share Playlist</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        {/* Playlist picker */}
        <div className="space-y-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Choose Playlist</p>
          <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-1.5">
            {playlists.length === 0 ? (
              <p className="text-[9px] text-white/25 text-center py-4">No personal playlists found. Create one in Music first.</p>
            ) : playlists.map(pl => (
              <button
                key={pl.id}
                onClick={() => setSelected(pl)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${selected?.id === pl.id ? 'border-[#FF8C00]/40 bg-[#FF8C00]/5' : 'border-white/8 bg-white/[0.02] hover:border-white/14'}`}
              >
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-white/5 shrink-0">
                  {pl.coverUrl || pl.coverImage
                    ? <img src={pl.coverUrl ?? pl.coverImage} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Music2 size={12} className="text-white/20" /></div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-white truncate">{pl.title}</p>
                  <p className="text-[8px] text-white/30">{pl.trackIds?.length ?? pl.tracks?.length ?? 0} tracks</p>
                </div>
                {selected?.id === pl.id && <Check size={13} className="text-[#FF8C00] shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        {/* Tag selector */}
        <div className="space-y-2">
          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Tags (pick at least one)</p>
          <div className="flex flex-wrap gap-2">
            {PLAYLIST_TAGS.map(t => {
              const Icon = t.icon;
              const active = tags.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border"
                  style={active
                    ? { background: `${t.color}25`, borderColor: `${t.color}50`, color: t.color }
                    : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.35)' }
                  }
                >
                  <Icon size={9} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={handleShare}
          disabled={!selected || !tags.length || sharing || done}
          className="w-full py-3 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ background: done ? '#22c55e' : '#FF8C00', color: '#000' }}
        >
          {sharing ? <><Loader2 size={12} className="animate-spin" /> Sharing…</>
           : done ? <><Check size={12} /> Shared!</>
           : <><Share2 size={12} /> Share to Community</>}
        </button>
      </motion.div>
    </motion.div>
  );
};

// ─── Main component ────────────────────────────────────────────────────────────
interface Props {
  currentUser: UserProfile | null;
  initialTag?: string;
  onBack?: () => void;
  embedded?: boolean; // true = renders as a section, not full page
}

const CommunityPlaylistsView: React.FC<Props> = ({
  currentUser,
  initialTag = 'ALL',
  onBack,
  embedded = false,
}) => {
  const [playlists, setPlaylists]       = useState<CommunityPlaylist[]>([]);
  const [myPlaylists, setMyPlaylists]   = useState<Playlist[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeTag, setActiveTag]       = useState(initialTag);
  const [likedIds, setLikedIds]         = useState<Set<string>>(new Set());
  const [showShare, setShowShare]       = useState(false);
  const [trackModal, setTrackModal]     = useState<CommunityPlaylist | null>(null);

  const loadPlaylists = useCallback(async (tag: string) => {
    setLoading(true);
    try {
      const data = tag === 'ALL'
        ? await fetchAllCommunityPlaylists(40)
        : await fetchCommunityPlaylistsByTag(tag, 20);
      setPlaylists(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPlaylists(activeTag); }, [activeTag]);

  useEffect(() => {
    if (currentUser?.uid) {
      fetchPersonalPlaylists().then(p => setMyPlaylists(p ?? [])).catch(() => {});
      const liked = localStorage.getItem(`likedPlaylists_${currentUser.uid}`);
      if (liked) setLikedIds(new Set(JSON.parse(liked)));
    }
  }, [currentUser?.uid]);

  const handleLike = async (id: string) => {
    if (!currentUser?.uid) return;
    const already = likedIds.has(id);
    if (already) return;
    const next = new Set([...likedIds, id]);
    setLikedIds(next);
    localStorage.setItem(`likedPlaylists_${currentUser.uid}`, JSON.stringify([...next]));
    await likeCommunityPlaylist(id);
    setPlaylists(prev => prev.map(p => p.id === id ? { ...p, likes: (p.likes ?? 0) + 1 } : p));
  };

  const handlePlay = (playlist: CommunityPlaylist) => {
    incrementPlaylistPlays(playlist.id);
    setTrackModal(playlist);
  };

  const handleShare = async (playlist: Playlist, tags: string[]) => {
    const result = await sharePlaylistToCommunity(playlist, tags);
    if (result) {
      setPlaylists(prev => [result as unknown as CommunityPlaylist, ...prev]);
    }
  };

  const playTrack = (track: Track) => {
    window.dispatchEvent(new CustomEvent('PLAY_TRACK', { detail: { track } }));
  };

  const Wrapper = embedded ? 'div' : 'div';

  return (
    <Wrapper className={embedded ? 'space-y-5' : 'min-h-screen text-white'}>
      {/* Header (only in standalone mode) */}
      {!embedded && (
        <div className="sticky top-0 z-30 bg-[#0a0a0a]/90 backdrop-blur-2xl border-b border-white/5 px-5 lg:px-10 py-3">
          <div className="max-w-[1200px] mx-auto flex items-center gap-4">
            {onBack && (
              <button onClick={onBack} className="text-white/30 hover:text-white transition-colors">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="flex items-center gap-3 flex-1">
              <div className="w-8 h-8 rounded-xl bg-[#FF8C00]/12 border border-[#FF8C00]/25 flex items-center justify-center">
                <ListMusic size={14} className="text-[#FF8C00]" />
              </div>
              <h1 className="text-base font-black uppercase tracking-widest text-white">Community Playlists</h1>
            </div>
            {currentUser && (
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/30 text-[#FF8C00] text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/20 transition-all"
              >
                <Share2 size={12} /> Share Playlist
              </button>
            )}
          </div>
        </div>
      )}

      <div className={embedded ? '' : 'max-w-[1200px] mx-auto px-5 lg:px-10 py-6 space-y-6'}>

        {/* Section header (embedded mode) */}
        {embedded && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListMusic size={13} className="text-[#FF8C00]" />
              <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/60">Community Playlists</h3>
            </div>
            {currentUser && (
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/25 text-[#FF8C00] text-[8px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/20 transition-all"
              >
                <Share2 size={10} /> Share Yours
              </button>
            )}
          </div>
        )}

        {/* Tag filter pills */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setActiveTag('ALL')}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border ${
              activeTag === 'ALL' ? 'bg-[#FF8C00] border-[#FF8C00] text-black' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
            }`}
          >
            All
          </button>
          {PLAYLIST_TAGS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTag(t.id)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest transition-all border"
                style={activeTag === t.id
                  ? { background: t.color, borderColor: t.color, color: '#000' }
                  : { background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }
                }
              >
                <Icon size={9} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-[1.5rem] bg-white/5 animate-pulse aspect-square" />
            ))}
          </div>
        ) : playlists.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/8 flex items-center justify-center mx-auto">
              <Music2 size={22} className="text-white/15" />
            </div>
            <p className="text-sm font-black text-white/20">No community playlists yet</p>
            <p className="text-[10px] text-white/12 max-w-xs mx-auto leading-relaxed">
              Be the first to share a playlist to this category!
            </p>
            {currentUser && (
              <button
                onClick={() => setShowShare(true)}
                className="mx-auto flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#FF8C00] text-black text-[9px] font-black uppercase tracking-widest hover:bg-[#FF8C00]/80 transition-all"
              >
                <Share2 size={12} /> Share First Playlist
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {playlists.map(pl => (
              <PlaylistCard
                key={pl.id}
                playlist={pl}
                liked={likedIds.has(pl.id)}
                onLike={() => handleLike(pl.id)}
                onPlay={() => handlePlay(pl)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Track list modal */}
      <AnimatePresence>
        {trackModal && (
          <TrackListModal
            playlist={trackModal}
            onClose={() => setTrackModal(null)}
            onPlay={playTrack}
          />
        )}
      </AnimatePresence>

      {/* Share modal */}
      <AnimatePresence>
        {showShare && (
          <ShareModal
            playlists={myPlaylists}
            onShare={handleShare}
            onClose={() => setShowShare(false)}
          />
        )}
      </AnimatePresence>
    </Wrapper>
  );
};

export default CommunityPlaylistsView;
