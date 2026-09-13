import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Album, Track, Video, UserProfile } from '../types';
import { fetchArtistAlbums, fetchUserVideos, fetchUserProfile, followUser, unfollowUser, isFollowing } from '../services/backendService';
import { auth } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, Play, Pause, Share2, UserPlus, UserMinus, ExternalLink,
  Music2, Film, ShoppingBag, CalendarDays, User, Heart, Disc,
  Clock, ChevronRight, Sparkles, Globe
} from 'lucide-react';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  ChoraArtistPage — Editorial Gallery layout
 *  Music-centric artist profile page for Chora.
 *  Tabs: Music · Music Videos · About · Events · Merch
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Tab = 'MUSIC' | 'VIDEOS' | 'ABOUT' | 'EVENTS' | 'MERCH';

interface Props {
  artistId: string;
  onBack: () => void;
  onSelectAlbum: (album: Album) => void;
  onVisitProfile: (uid: string) => void;
  onPlayTrack?: (track: Track, album: Album) => void;
}

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'MUSIC',  label: 'Music',        icon: Music2 },
  { id: 'VIDEOS', label: 'Music Videos',  icon: Film },
  { id: 'ABOUT',  label: 'About',         icon: User },
  { id: 'EVENTS', label: 'Events',        icon: CalendarDays },
  { id: 'MERCH',  label: 'Merch',         icon: ShoppingBag },
];

function formatCount(n?: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatDuration(s?: number): string {
  if (!s) return '--:--';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const ChoraArtistPage: React.FC<Props> = ({ artistId, onBack, onSelectAlbum, onVisitProfile, onPlayTrack }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('MUSIC');
  const [featuredAlbumId, setFeaturedAlbumId] = useState<string | null>(null);

  // ── Fetch data ──
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchUserProfile(artistId).catch(() => null),
      fetchArtistAlbums(artistId).catch(() => []),
      fetchUserVideos(artistId).catch(() => []),
      isFollowing(artistId).catch(() => false),
    ]).then(([p, a, v, f]) => {
      if (!alive) return;
      setProfile(p as UserProfile | null);
      setAlbums(a as Album[]);
      setVideos(v as Video[]);
      setFollowing(f as boolean);
      // Feature the newest album by default
      if ((a as Album[]).length > 0) setFeaturedAlbumId((a as Album[])[0].id);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [artistId]);

  // ── Popular tracks (aggregate from all albums, sort by playCount) ──
  const popularTracks = useMemo(() => {
    const all: { track: Track; album: Album }[] = [];
    for (const a of albums) {
      for (const t of a.tracks || []) {
        all.push({ track: t, album: a });
      }
    }
    all.sort((a, b) => (b.track.playCount || 0) - (a.track.playCount || 0));
    return all.slice(0, 8);
  }, [albums]);

  // ── Follow toggle ──
  const handleFollowToggle = useCallback(async () => {
    if (!auth.currentUser) return;
    if (following) {
      await unfollowUser(artistId);
      setFollowing(false);
      setProfile(prev => prev ? { ...prev, followerCount: prev.followerCount - 1 } : null);
    } else {
      await followUser(artistId);
      setFollowing(true);
      setProfile(prev => prev ? { ...prev, followerCount: prev.followerCount + 1 } : null);
    }
  }, [following, artistId]);

  const isOwn = auth.currentUser?.uid === artistId;

  // ── Loading state ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#0A0610]">
        <div className="w-8 h-8 border-2 border-white/20 border-t-[#D40055] rounded-full animate-spin" />
      </div>
    );
  }

  const heroImage = profile?.photoURL || albums[0]?.coverImage || '';
  const artistName = profile?.displayName || albums[0]?.artist || 'Unknown Artist';
  const bio = profile?.bio || albums[0]?.artistBio || '';
  const genres = [...new Set(albums.map(a => a.genre).filter(Boolean))].slice(0, 4) as string[];
  const totalPlays = albums.reduce((sum, a) => sum + (a.playCount || 0), 0) +
    albums.reduce((sum, a) => sum + (a.tracks || []).reduce((ts, t) => ts + (t.playCount || 0), 0), 0);

  return (
    <div className="h-full overflow-y-auto bg-[#0A0610] text-white relative">
      {/* ── Back button ── */}
      <button
        onClick={onBack}
        className="fixed top-5 left-5 z-50 flex items-center gap-1.5 text-white/60 hover:text-white text-xs font-bold uppercase tracking-widest transition-colors backdrop-blur-sm bg-black/30 rounded-full px-3 py-2"
      >
        <ArrowLeft size={14} /> Back
      </button>

      {/* ═══════════════════════════════════════════════════════
       *  HERO — Editorial split: photo left, info right
       * ═══════════════════════════════════════════════════════ */}
      <div className="relative px-6 lg:px-12 pt-16 pb-10 flex flex-col lg:flex-row gap-8 items-start">
        {/* Artist photo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-48 h-48 lg:w-64 lg:h-64 rounded-2xl overflow-hidden shrink-0 shadow-2xl shadow-purple-900/30 border border-white/10"
        >
          {heroImage ? (
            <img src={heroImage} alt={artistName} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#6B0099] to-[#D40055] flex items-center justify-center">
              <User size={64} className="text-white/30" />
            </div>
          )}
        </motion.div>

        {/* Info block */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex-1 min-w-0"
        >
          <h1 className="text-4xl lg:text-6xl font-black text-white leading-none tracking-tight">{artistName}</h1>

          {bio && (
            <p className="mt-3 text-white/50 text-sm leading-relaxed max-w-xl line-clamp-3">{bio}</p>
          )}

          {/* Genre pills */}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {genres.map(g => (
                <span key={g} className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-gradient-to-r from-[#6B0099]/40 to-[#D40055]/40 border border-white/10 text-white/70">
                  {g}
                </span>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-6 mt-5 text-sm">
            <div className="text-center">
              <span className="block text-lg font-black tabular-nums">{formatCount(profile?.followerCount)}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Followers</span>
            </div>
            <div className="text-center">
              <span className="block text-lg font-black tabular-nums">{albums.length}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Releases</span>
            </div>
            <div className="text-center">
              <span className="block text-lg font-black tabular-nums">{formatCount(totalPlays)}</span>
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Plays</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 mt-6">
            {!isOwn && (
              <button
                onClick={handleFollowToggle}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-full px-5 font-black text-[10px] uppercase tracking-widest transition-all ${
                  following
                    ? 'bg-white/10 text-white hover:bg-red-500/20 hover:text-red-400'
                    : 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white hover:scale-[1.02] active:scale-95'
                }`}
              >
                {following ? <UserMinus size={13} /> : <UserPlus size={13} />}
                {following ? 'Unfollow' : 'Follow'}
              </button>
            )}

            <button
              onClick={() => {
                navigator.clipboard?.writeText(window.location.origin + `/artist/${artistId}`);
              }}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 bg-white/8 hover:bg-white/15 text-white/70 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all border border-white/8"
            >
              <Share2 size={13} /> Share
            </button>

            <button
              onClick={() => onVisitProfile(artistId)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[#00DAF3] hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              <ExternalLink size={13} /> Plajah Profile
            </button>
          </div>
        </motion.div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  TAB BAR
       * ═══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 px-6 lg:px-12 bg-[#0A0610]/80 backdrop-blur-xl border-b border-white/8">
        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                activeTab === tab.id ? 'text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
              {activeTab === tab.id && (
                <motion.div layoutId="chora-artist-tab" className="absolute bottom-0 left-2 right-2 h-[2px] bg-gradient-to-r from-[#6B0099] to-[#D40055] rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
       *  TAB CONTENT
       * ═══════════════════════════════════════════════════════ */}
      <div className="px-6 lg:px-12 py-8">
        <AnimatePresence mode="wait">
          {/* ── MUSIC TAB ── */}
          {activeTab === 'MUSIC' && (
            <motion.div key="music" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {/* Popular Tracks */}
              {popularTracks.length > 0 && (
                <section className="mb-10">
                  <h2 className="text-xl font-black text-white mb-4 tracking-tight">Popular Tracks</h2>
                  <div className="space-y-1">
                    {popularTracks.map(({ track, album }, i) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => onPlayTrack?.(track, album)}
                        className="w-full flex items-center gap-4 px-4 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors group text-left"
                      >
                        <span className="w-6 text-right text-sm font-bold tabular-nums text-white/30 group-hover:hidden">{i + 1}</span>
                        <span className="w-6 hidden group-hover:flex items-center justify-center"><Play size={14} className="text-white" fill="white" /></span>
                        <img src={album.coverImage} alt="" className="w-10 h-10 rounded-md object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-sm font-bold text-white">{track.title}</span>
                          <span className="block truncate text-[11px] text-white/40">{album.title}</span>
                        </div>
                        <span className="text-[11px] tabular-nums text-white/30 font-mono">{formatCount(track.playCount)} plays</span>
                        <span className="text-[11px] tabular-nums text-white/30 font-mono">{formatDuration(track.duration)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Album Grid */}
              <section>
                <h2 className="text-xl font-black text-white mb-4 tracking-tight">Discography</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {albums.map(album => {
                    const isFeatured = album.id === featuredAlbumId;
                    return (
                      <motion.button
                        key={album.id}
                        type="button"
                        onClick={() => onSelectAlbum(album)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative rounded-2xl overflow-hidden border transition-colors text-left group ${
                          isFeatured
                            ? 'border-[#D40055]/40 bg-white/[0.06] col-span-2 row-span-2'
                            : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06]'
                        }`}
                        style={{ backdropFilter: 'blur(12px)' }}
                      >
                        <div className={`aspect-square overflow-hidden ${isFeatured ? '' : ''}`}>
                          <img src={album.coverImage} alt={album.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        </div>
                        {/* Artist's Pick badge */}
                        {isFeatured && (
                          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D40055]/80 backdrop-blur-sm text-[9px] font-black uppercase tracking-widest">
                            <Sparkles size={10} /> Artist's Pick
                          </div>
                        )}
                        <div className="p-3">
                          <h3 className="font-bold text-sm text-white truncate">{album.title}</h3>
                          <p className="text-[11px] text-white/40 mt-0.5">
                            {album.releaseDate ? new Date(album.releaseDate).getFullYear() : album.createdAt ? new Date(album.createdAt).getFullYear() : ''}
                            {' · '}
                            {album.tracks?.length || 0} tracks
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </section>

              {/* Appears On (albums where artist is credited but not owner) */}
              {/* TODO: Implement collaborative album query */}
            </motion.div>
          )}

          {/* ── MUSIC VIDEOS TAB ── */}
          {activeTab === 'VIDEOS' && (
            <motion.div key="videos" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <h2 className="text-xl font-black text-white mb-4 tracking-tight">Music Videos</h2>
              {videos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/30">
                  <Film size={40} className="mb-3" />
                  <p className="text-sm font-bold">No music videos yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {videos.map(video => (
                    <button
                      key={video.id}
                      type="button"
                      className="rounded-2xl overflow-hidden border border-white/8 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left group"
                    >
                      <div className="aspect-video overflow-hidden relative">
                        <img
                          src={(video as any).thumbnailUrl || (video as any).thumbnail || ''}
                          alt={(video as any).title || ''}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                            <Play size={20} className="text-white ml-0.5" fill="white" />
                          </div>
                        </div>
                      </div>
                      <div className="p-3">
                        <h3 className="font-bold text-sm text-white truncate">{(video as any).title || 'Untitled'}</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          {(video as any).timestamp ? new Date((video as any).timestamp).toLocaleDateString() : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── ABOUT TAB ── */}
          {activeTab === 'ABOUT' && (
            <motion.div key="about" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <div className="max-w-2xl">
                <h2 className="text-xl font-black text-white mb-4 tracking-tight">About {artistName}</h2>

                {bio ? (
                  <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">{bio}</p>
                ) : (
                  <p className="text-white/30 text-sm italic">No bio available</p>
                )}

                {/* Social Links */}
                {albums[0]?.socialLinks && (
                  <div className="mt-8">
                    <h3 className="text-sm font-black text-white/60 uppercase tracking-widest mb-3">Links</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(albums[0].socialLinks).filter(([, v]) => v).map(([key, url]) => (
                        <a
                          key={key}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/8 hover:bg-white/15 text-white/60 hover:text-white text-[10px] font-bold uppercase tracking-widest transition-colors border border-white/8"
                        >
                          <Globe size={12} />
                          {key}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Stats */}
                <div className="mt-8 grid grid-cols-3 gap-4">
                  <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4 text-center" style={{ backdropFilter: 'blur(12px)' }}>
                    <Disc size={20} className="mx-auto text-white/30 mb-2" />
                    <span className="block text-2xl font-black tabular-nums">{albums.length}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Releases</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4 text-center" style={{ backdropFilter: 'blur(12px)' }}>
                    <Music2 size={20} className="mx-auto text-white/30 mb-2" />
                    <span className="block text-2xl font-black tabular-nums">{albums.reduce((s, a) => s + (a.tracks?.length || 0), 0)}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Tracks</span>
                  </div>
                  <div className="rounded-xl bg-white/[0.04] border border-white/8 p-4 text-center" style={{ backdropFilter: 'blur(12px)' }}>
                    <Heart size={20} className="mx-auto text-white/30 mb-2" />
                    <span className="block text-2xl font-black tabular-nums">{formatCount(totalPlays)}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/35">Total Plays</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── EVENTS TAB ── */}
          {activeTab === 'EVENTS' && (
            <motion.div key="events" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <div className="flex flex-col items-center justify-center py-20 text-white/30">
                <CalendarDays size={40} className="mb-3" />
                <p className="text-sm font-bold">No upcoming events</p>
                <p className="text-[11px] mt-1">Check back later for live shows and appearances</p>
              </div>
            </motion.div>
          )}

          {/* ── MERCH TAB ── */}
          {activeTab === 'MERCH' && (
            <motion.div key="merch" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              {(!profile?.merch || profile.merch.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-20 text-white/30">
                  <ShoppingBag size={40} className="mb-3" />
                  <p className="text-sm font-bold">No merch available</p>
                  <p className="text-[11px] mt-1">This artist hasn't set up their store yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {profile.merch.map((item: any, i: number) => (
                    <div key={i} className="rounded-2xl overflow-hidden border border-white/8 bg-white/[0.03] text-left">
                      {item.imageUrl && (
                        <div className="aspect-square overflow-hidden">
                          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-3">
                        <h3 className="font-bold text-sm text-white truncate">{item.name}</h3>
                        {item.price != null && <p className="text-[11px] text-[#00DAF3] font-bold mt-0.5">${item.price}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ChoraArtistPage;
