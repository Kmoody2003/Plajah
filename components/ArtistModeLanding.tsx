import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { X, Play, Music2, Film, BookOpen, Sparkles, Globe, ExternalLink, Clock, Zap } from 'lucide-react';
import { UserProfile, Track, Video, Album, Article } from '../types';

interface Props {
  profile: UserProfile;
  albums?: Album[];
  onDismiss: () => void;
  onSelectTrack?: (track: Track) => void;
  onSelectVideo?: (video: Video) => void;
  onSelectAlbum?: (album: Album) => void;
  onSelectArticle?: (article: Article) => void;
}

const LANDING_DURATION = 30;

// ── Social link helpers ───────────────────────────────────────────────────────
function socialLinks(profile: UserProfile): { label: string; href: string; icon: React.ReactNode }[] {
  const links: { label: string; href: string; icon: React.ReactNode }[] = [];
  if (profile.xUrl || profile.xHandle)
    links.push({ label: 'X', href: profile.xUrl || `https://x.com/${profile.xHandle}`, icon: <XIcon /> });
  if (profile.blueskyHandle)
    links.push({ label: 'Bluesky', href: `https://bsky.app/profile/${profile.blueskyHandle}`, icon: <BskyIcon /> });
  if (profile.threadsHandle)
    links.push({ label: 'Threads', href: `https://threads.net/@${profile.threadsHandle}`, icon: <ThreadsIcon /> });
  if (profile.mastodonHandle && profile.mastodonInstance)
    links.push({ label: 'Mastodon', href: `https://${profile.mastodonInstance}/@${profile.mastodonHandle}`, icon: <Globe size={14} /> });
  return links;
}

// Minimal SVG icons (no external dep)
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.733-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
const BskyIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C2.566.944 1.561 1.266.902 1.565.139 1.908 0 3.08 0 3.768c0 .69.378 5.65.624 6.479.815 2.736 3.713 3.66 6.383 3.364.136-.02.275-.039.415-.056-.138.022-.276.04-.415.056-3.912.58-7.387 2.005-2.83 7.078 5.013 5.19 6.87-1.113 7.823-4.308.953 3.195 2.05 9.271 7.733 4.308 4.267-4.308 1.172-6.498-2.74-7.078a8.741 8.741 0 0 1-.415-.056c.14.017.279.036.415.056 2.67.297 5.568-.628 6.383-3.364.246-.828.624-5.79.624-6.478 0-.69-.139-1.861-.902-2.204-.659-.299-1.664-.62-4.3 1.24C16.046 4.748 13.087 8.687 12 10.8z"/>
  </svg>
);
const ThreadsIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
    <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.012 5.467l-2.04.136c-.124-1.71-.938-3.07-2.254-4.082-1.389-1.062-3.264-1.6-5.578-1.618-2.96.024-5.197.837-6.648 2.419-1.44 1.569-2.184 3.963-2.21 7.115.027 3.153.772 5.546 2.211 7.115 1.451 1.582 3.688 2.395 6.648 2.419 2.139-.017 3.768-.489 4.976-1.443.963-.75 1.545-1.79 1.788-3.17h-6.777v-2.04h8.857l.024.445c.065 5.44-3.23 8.528-9.012 8.566"/>
  </svg>
);

const ArtistModeLanding: React.FC<Props> = ({
  profile, albums = [], onDismiss, onSelectTrack, onSelectVideo, onSelectAlbum, onSelectArticle,
}) => {
  const [timeLeft, setTimeLeft] = useState(LANDING_DURATION);
  const [phase, setPhase] = useState<'in' | 'visible' | 'out'>('in');
  const [bgIndex, setBgIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const parallaxX = useTransform(mouseX, [0, window.innerWidth], [-12, 12]);
  const parallaxY = useTransform(mouseY, [0, window.innerHeight], [-8, 8]);

  // Derived content
  const now = Date.now();
  const publishedAlbums = albums.filter(a => !a.releaseDate || a.releaseDate <= now);
  const upcomingAlbums = albums.filter(a => a.releaseDate && a.releaseDate > now);
  const outNow = [...publishedAlbums].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
  const comingSoon = [...upcomingAlbums].sort((a, b) => (a.releaseDate ?? 0) - (b.releaseDate ?? 0))[0] ?? null;

  const latestTracks: Track[] = (profile.personalTracks ?? []).slice(0, 3);
  const latestVideos: Video[] = (profile.videos ?? []).slice(0, 2);
  const latestPost: Article | null = [...(profile.articles ?? [])].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0] ?? null;
  const links = socialLinks(profile);

  const bgImages: string[] = [
    ...(profile.backgroundSlideshow?.items?.filter(i => i.type === 'PHOTO').map(i => i.url) ?? []),
    ...(profile.coverArt ? [profile.coverArt] : []),
    ...(outNow?.coverImage ? [outNow.coverImage] : []),
  ].filter(Boolean).slice(0, 6);

  const currentBg = bgImages[bgIndex] ?? null;
  const brandColor = profile.brandColor ?? '#6B0099';

  useEffect(() => {
    if (bgImages.length <= 1) return;
    const t = setInterval(() => setBgIndex(i => (i + 1) % bgImages.length), 6000);
    return () => clearInterval(t);
  }, [bgImages.length]);

  useEffect(() => {
    setPhase('in');
    const inTimeout = setTimeout(() => setPhase('visible'), 600);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setPhase('out');
          setTimeout(onDismiss, 800);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { clearInterval(timerRef.current!); clearTimeout(inTimeout); };
  }, [onDismiss]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
  }, [mouseX, mouseY]);

  const handleDismiss = () => {
    clearInterval(timerRef.current!);
    setPhase('out');
    setTimeout(onDismiss, 600);
  };

  const progress = ((LANDING_DURATION - timeLeft) / LANDING_DURATION) * 100;

  const formatReleaseDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <AnimatePresence>
      {phase !== 'out' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'visible' ? 1 : 0.6 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] overflow-hidden"
          onMouseMove={handleMouseMove}
        >
          {/* Background */}
          <div className="absolute inset-0">
            {currentBg ? (
              <motion.div
                key={bgIndex}
                initial={{ opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                style={{ x: parallaxX, y: parallaxY }}
                className="absolute inset-[-5%]"
              >
                <img src={currentBg} alt="" className="w-full h-full object-cover" style={{ filter: 'blur(1px) brightness(0.3) saturate(1.3)' }} />
              </motion.div>
            ) : (
              <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 40%, ${brandColor}55 0%, #000 60%)` }} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 35%, rgba(0,0,0,0.75) 70%, rgba(0,0,0,0.97) 100%)' }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 20% 30%, ${brandColor}22 0%, transparent 55%)` }} />
          </div>

          {/* Top bar */}
          <motion.div
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="relative z-10 flex items-center justify-between px-6 pt-6 pb-3"
          >
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 rounded-full" style={{ background: brandColor }} />
              <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Artist Showcase</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative w-8 h-8">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2.5" />
                  <circle cx="16" cy="16" r="13" fill="none" stroke={brandColor} strokeWidth="2.5"
                    strokeDasharray={`${2 * Math.PI * 13}`}
                    strokeDashoffset={`${2 * Math.PI * 13 * (1 - progress / 100)}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white/70">{timeLeft}</span>
              </div>
              <button
                onClick={handleDismiss}
                className="w-9 h-9 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-all group"
              >
                <X size={15} className="text-white/70 group-hover:text-white transition-colors" />
              </button>
            </div>
          </motion.div>

          {/* Main content — two-col on wide, stacked on narrow */}
          <div className="absolute inset-0 flex flex-col justify-end px-4 md:px-8 pb-6 overflow-y-auto">
            <div className="flex flex-col lg:flex-row items-end lg:items-end gap-6 lg:gap-10 w-full max-w-5xl mx-auto">

              {/* ── LEFT: Identity + social ── */}
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="shrink-0 lg:max-w-xs w-full"
              >
                <div className="flex items-end gap-4 mb-4">
                  {profile.photoURL && (
                    <motion.div
                      initial={{ scale: 0.7, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.6, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                      className="relative shrink-0"
                    >
                      <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
                        <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-black flex items-center justify-center" style={{ background: brandColor }}>
                        <Sparkles size={9} className="text-white" />
                      </div>
                    </motion.div>
                  )}
                  <div>
                    <h1 className="text-3xl md:text-5xl font-black text-white leading-none tracking-tight" style={{ textShadow: '0 0 60px rgba(0,0,0,0.8)' }}>
                      {profile.displayName}
                    </h1>
                    {profile.accountType && (
                      <p className="text-xs font-black uppercase tracking-widest mt-1" style={{ color: brandColor }}>
                        {profile.accountType === 'ARTIST' ? 'Artist' : profile.accountType.charAt(0) + profile.accountType.slice(1).toLowerCase()}
                      </p>
                    )}
                  </div>
                </div>

                {profile.bio && (
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.85 }}
                    className="text-sm text-white/55 leading-relaxed mb-3"
                    style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}
                  >
                    {profile.bio.length > 150 ? profile.bio.slice(0, 147) + '…' : profile.bio}
                  </motion.p>
                )}

                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.0 }} className="flex items-center gap-5 text-xs mb-4">
                  <span className="text-white/40"><span className="font-black text-white">{profile.followerCount?.toLocaleString() ?? 0}</span> followers</span>
                  <span className="text-white/40"><span className="font-black text-white">{profile.followingCount?.toLocaleString() ?? 0}</span> following</span>
                </motion.div>

                {/* Social links */}
                {links.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1 }} className="flex flex-wrap gap-2">
                    {links.map(l => (
                      <a
                        key={l.label}
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.08] border border-white/10 hover:bg-white/15 hover:border-white/25 transition-all text-white/70 hover:text-white text-[10px] font-black uppercase tracking-wide"
                      >
                        {l.icon}
                        {l.label}
                        <ExternalLink size={9} className="opacity-50" />
                      </a>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              {/* ── RIGHT: Releases + content ── */}
              <div className="flex-1 min-w-0 space-y-4">

                {/* Out Now */}
                {outNow && (
                  <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Zap size={10} className="text-white/50" style={{ color: brandColor }} />
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: brandColor }}>Out Now</span>
                    </div>
                    <button
                      onClick={() => { onSelectAlbum?.(outNow); handleDismiss(); }}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl border border-white/10 hover:border-white/25 transition-all group text-left"
                      style={{ background: `linear-gradient(135deg, ${brandColor}18, rgba(0,0,0,0.4))` }}
                    >
                      {outNow.coverImage ? (
                        <img src={outNow.coverImage} alt="" className="w-14 h-14 rounded-xl object-cover shadow-lg shrink-0 group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center" style={{ background: `${brandColor}30` }}>
                          <Music2 size={20} style={{ color: brandColor }} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-base font-black text-white truncate">{outNow.title}</p>
                        {outNow.tracks && <p className="text-[10px] text-white/40">{outNow.tracks.length} track{outNow.tracks.length !== 1 ? 's' : ''}</p>}
                      </div>
                      <div className="ml-auto shrink-0 w-9 h-9 rounded-full flex items-center justify-center border border-white/20 group-hover:border-white/40 transition-all" style={{ background: `${brandColor}30` }}>
                        <Play size={14} className="text-white ml-0.5" />
                      </div>
                    </button>
                  </motion.div>
                )}

                {/* Coming Soon */}
                {comingSoon && (
                  <motion.div
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.95, duration: 0.5 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={10} className="text-white/30" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Coming Soon</span>
                    </div>
                    <div
                      className="flex items-center gap-4 p-3 rounded-2xl border border-white/[0.07]"
                      style={{ background: 'rgba(255,255,255,0.03)' }}
                    >
                      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 relative">
                        {comingSoon.coverImage
                          ? <img src={comingSoon.coverImage} alt="" className="w-full h-full object-cover blur-sm brightness-50" />
                          : <div className="w-full h-full" style={{ background: `${brandColor}20` }} />
                        }
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Clock size={16} className="text-white/50" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-white/70 truncate">{comingSoon.title}</p>
                        <p className="text-[9px] text-white/30 mt-0.5">{comingSoon.releaseDate ? formatReleaseDate(comingSoon.releaseDate) : 'Upcoming'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Latest tracks */}
                {latestTracks.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Music2 size={10} className="text-white/30" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Latest Tracks</span>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto pb-1 hide-scrollbar">
                      {latestTracks.map((track, i) => (
                        <motion.button
                          key={track.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.1 + i * 0.07 }}
                          onClick={() => { onSelectTrack?.(track); handleDismiss(); }}
                          className="flex-shrink-0 flex items-center gap-2.5 px-3 py-2.5 bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-xl hover:bg-white/[0.11] hover:border-white/25 transition-all group"
                        >
                          {track.albumCover
                            ? <img src={track.albumCover} alt="" className="w-8 h-8 rounded-lg object-cover" />
                            : <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${brandColor}25` }}><Music2 size={13} style={{ color: brandColor }} /></div>
                          }
                          <div className="text-left">
                            <p className="text-[10px] font-black text-white truncate max-w-[100px]">{track.title}</p>
                            {track.albumTitle && <p className="text-[8px] text-white/35 truncate max-w-[100px]">{track.albumTitle}</p>}
                          </div>
                          <Play size={12} className="text-white/30 group-hover:text-white transition-colors" />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Latest videos */}
                {latestVideos.length > 0 && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.15 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Film size={10} className="text-white/30" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Latest Videos</span>
                    </div>
                    <div className="flex gap-2.5 overflow-x-auto pb-1 hide-scrollbar">
                      {latestVideos.map((video, i) => (
                        <motion.button
                          key={video.id}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.2 + i * 0.07 }}
                          onClick={() => { onSelectVideo?.(video); handleDismiss(); }}
                          className="flex-shrink-0 relative w-28 h-16 rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group"
                        >
                          {video.thumbnailUrl
                            ? <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center" style={{ background: `${brandColor}20` }}><Film size={18} style={{ color: brandColor }} /></div>
                          }
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Play size={16} className="text-white" /></div>
                          <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-gradient-to-t from-black/80">
                            <p className="text-[8px] font-black text-white truncate">{video.title}</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Latest post */}
                {latestPost && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen size={10} className="text-white/30" />
                      <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Latest Post</span>
                    </div>
                    <button
                      onClick={() => { onSelectArticle?.(latestPost); handleDismiss(); }}
                      className="w-full flex items-start gap-3 p-3 bg-white/[0.05] border border-white/[0.08] rounded-xl hover:bg-white/[0.09] hover:border-white/20 transition-all text-left group"
                    >
                      {(latestPost as any).coverImage && (
                        <img src={(latestPost as any).coverImage} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white line-clamp-2 leading-snug">{latestPost.title}</p>
                        {latestPost.subtitle && <p className="text-[9px] text-white/35 line-clamp-1 mt-0.5">{latestPost.subtitle}</p>}
                      </div>
                      <ExternalLink size={11} className="text-white/20 group-hover:text-white/50 transition-colors mt-0.5 shrink-0" />
                    </button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Film grain */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }} />

          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
            className="absolute bottom-0 left-0 right-0 h-px origin-left"
            style={{ background: `linear-gradient(to right, transparent, ${brandColor}, transparent)` }}
          />

          <style>{`.hide-scrollbar::-webkit-scrollbar{display:none}.hide-scrollbar{-ms-overflow-style:none;scrollbar-width:none}`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ── Settings toggle component ──────────────────────────────────────────────────
export const ArtistModeToggle: React.FC<{
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}> = ({ enabled, onToggle }) => (
  <div className="flex items-center justify-between p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
    <div>
      <p className="text-sm font-black text-white flex items-center gap-2">
        <Sparkles size={14} className="text-[#c084fc]" /> Artist Mode Landing Page
      </p>
      <p className="text-[10px] text-white/40 mt-0.5">Visitors see a 30-second immersive showcase before your full profile loads</p>
    </div>
    <button
      onClick={() => onToggle(!enabled)}
      className={`relative w-12 h-6 rounded-full border transition-all ${enabled ? 'bg-[#6B0099] border-[#6B0099]' : 'bg-white/10 border-white/20'}`}
    >
      <motion.div
        animate={{ x: enabled ? 24 : 2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-lg"
      />
    </button>
  </div>
);

export default ArtistModeLanding;
