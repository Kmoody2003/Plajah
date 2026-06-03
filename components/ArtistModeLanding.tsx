import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import { X, Play, ChevronRight, Music2, Film, BookOpen, Image, Users, Calendar, Sparkles } from 'lucide-react';
import { UserProfile, Track, Video, Album, Article } from '../types';

interface Props {
  profile: UserProfile;
  onDismiss: () => void;
  onSelectTrack?: (track: Track) => void;
  onSelectVideo?: (video: Video) => void;
  onSelectAlbum?: (album: Album) => void;
  onSelectArticle?: (article: Article) => void;
}

const LANDING_DURATION = 30; // seconds

const ArtistModeLanding: React.FC<Props> = ({
  profile, onDismiss, onSelectTrack, onSelectVideo, onSelectAlbum, onSelectArticle,
}) => {
  const [timeLeft, setTimeLeft] = useState(LANDING_DURATION);
  const [phase, setPhase] = useState<'in' | 'visible' | 'out'>('in');
  const [bgIndex, setBgIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const parallaxX = useTransform(mouseX, [0, window.innerWidth], [-12, 12]);
  const parallaxY = useTransform(mouseY, [0, window.innerHeight], [-8, 8]);

  // Gather content for the landing page
  const latestTracks: Track[] = (profile.personalTracks ?? []).slice(0, 3);
  const latestVideos: Video[] = (profile.videos ?? []).slice(0, 3);
  const latestAlbums: Album[] = []; // albums come from fetched content
  const latestArticles: Article[] = (profile.articles ?? []).slice(0, 2);

  // Pick background images from profile slideshow or cover art
  const bgImages: string[] = [
    ...(profile.backgroundSlideshow?.items?.filter(i => i.type === 'PHOTO').map(i => i.url) ?? []),
    ...(profile.coverArt ? [profile.coverArt] : []),
  ].filter(Boolean).slice(0, 5);

  const currentBg = bgImages[bgIndex] ?? null;
  const brandColor = profile.brandColor ?? '#6B0099';

  // Cycle background images
  useEffect(() => {
    if (bgImages.length <= 1) return;
    const t = setInterval(() => setBgIndex(i => (i + 1) % bgImages.length), 6000);
    return () => clearInterval(t);
  }, [bgImages.length]);

  // Countdown and auto-dismiss
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

    return () => {
      clearInterval(timerRef.current!);
      clearTimeout(inTimeout);
    };
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
          style={{ cursor: 'default' }}
        >
          {/* Background layer */}
          <div className="absolute inset-0">
            {currentBg ? (
              <motion.div
                key={bgIndex}
                initial={{ opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                style={{ x: parallaxX, y: parallaxY }}
                className="absolute inset-[-5%] bg-cover bg-center"
              >
                <img src={currentBg} alt="" className="w-full h-full object-cover" style={{ filter: 'blur(1px) brightness(0.35) saturate(1.3)' }} />
              </motion.div>
            ) : (
              <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 30% 40%, ${brandColor}55 0%, #000000 60%)` }} />
            )}
            {/* Gradient overlay */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.8) 80%, rgba(0,0,0,0.97) 100%)' }} />
            {/* Atmospheric color tint */}
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 20% 30%, ${brandColor}22 0%, transparent 55%)` }} />
          </div>

          {/* Content */}
          <div className="absolute inset-0 flex flex-col">

            {/* Top bar: dismiss + timer */}
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
                {/* Circular progress timer */}
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

            {/* Main content */}
            <div className="flex-1 flex flex-col justify-end px-6 pb-8 overflow-hidden">

              {/* Artist identity */}
              <motion.div
                initial={{ y: 60, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="mb-6"
              >
                <div className="flex items-end gap-5 mb-4">
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
                    <motion.h1
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.7, duration: 0.6 }}
                      className="text-4xl md:text-6xl font-black text-white leading-none tracking-tight"
                      style={{ textShadow: '0 0 60px rgba(0,0,0,0.8)' }}
                    >
                      {profile.displayName}
                    </motion.h1>
                    {profile.accountType && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.9 }}
                        className="text-sm font-black uppercase tracking-widest mt-1"
                        style={{ color: brandColor }}
                      >
                        {profile.accountType === 'ARTIST' ? 'Artist' : profile.accountType.charAt(0) + profile.accountType.slice(1).toLowerCase()}
                      </motion.p>
                    )}
                  </div>
                </div>

                {profile.bio && (
                  <motion.p
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.85, duration: 0.5 }}
                    className="text-sm text-white/60 leading-relaxed max-w-xl"
                    style={{ textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}
                  >
                    {profile.bio.length > 180 ? profile.bio.slice(0, 177) + '…' : profile.bio}
                  </motion.p>
                )}

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.0 }}
                  className="flex items-center gap-5 mt-3 text-xs"
                >
                  <span className="text-white/40"><span className="font-black text-white">{profile.followerCount?.toLocaleString() ?? 0}</span> followers</span>
                  <span className="text-white/40"><span className="font-black text-white">{profile.followingCount?.toLocaleString() ?? 0}</span> following</span>
                </motion.div>
              </motion.div>

              {/* Content strips */}
              <div className="space-y-5">

                {/* Latest tracks */}
                {latestTracks.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.0, duration: 0.5 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Music2 size={11} className="text-white/30" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Latest Music</p>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
                      {latestTracks.map((track, i) => (
                        <motion.button
                          key={track.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.1 + i * 0.08 }}
                          onClick={() => onSelectTrack?.(track)}
                          className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white/[0.07] backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/[0.12] hover:border-white/25 transition-all group"
                        >
                          {track.albumCover ? (
                            <img src={track.albumCover} alt="" className="w-10 h-10 rounded-xl object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${brandColor}30` }}>
                              <Music2 size={16} style={{ color: brandColor }} />
                            </div>
                          )}
                          <div className="text-left">
                            <p className="text-xs font-black text-white truncate max-w-[120px]">{track.title}</p>
                            {track.albumTitle && <p className="text-[9px] text-white/40 truncate max-w-[120px]">{track.albumTitle}</p>}
                          </div>
                          <Play size={14} className="text-white/30 group-hover:text-white transition-colors ml-1" />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Latest videos */}
                {latestVideos.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.1, duration: 0.5 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Film size={11} className="text-white/30" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Latest Videos</p>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
                      {latestVideos.map((video, i) => (
                        <motion.button
                          key={video.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.2 + i * 0.08 }}
                          onClick={() => onSelectVideo?.(video)}
                          className="flex-shrink-0 relative w-32 h-20 rounded-2xl overflow-hidden border border-white/10 hover:border-white/30 transition-all group"
                        >
                          {video.thumbnailUrl ? (
                            <img src={video.thumbnailUrl} alt={video.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: `${brandColor}25` }}>
                              <Film size={20} style={{ color: brandColor }} />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                            <Play size={20} className="text-white" />
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80">
                            <p className="text-[9px] font-black text-white truncate">{video.title}</p>
                          </div>
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* Latest articles */}
                {latestArticles.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2, duration: 0.5 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen size={11} className="text-white/30" />
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Latest Posts</p>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1 hide-scrollbar">
                      {latestArticles.map((article, i) => (
                        <motion.button
                          key={article.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 1.3 + i * 0.08 }}
                          onClick={() => onSelectArticle?.(article)}
                          className="flex-shrink-0 w-48 p-3 bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/[0.10] hover:border-white/25 transition-all text-left"
                        >
                          <p className="text-xs font-black text-white line-clamp-2 leading-snug">{article.title}</p>
                          {article.subtitle && <p className="text-[9px] text-white/40 line-clamp-2 mt-1">{article.subtitle}</p>}
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>

          {/* Grain texture overlay for film-like quality */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }} />

          {/* Bottom fade line */}
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

// ── Settings toggle component (used on own profile) ───────────────────────────

export const ArtistModeToggle: React.FC<{
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}> = ({ enabled, onToggle }) => (
  <div className="flex items-center justify-between p-4 bg-white/[0.04] border border-white/8 rounded-2xl">
    <div>
      <p className="text-sm font-black text-white flex items-center gap-2">
        <Sparkles size={14} className="text-[#c084fc]" /> Artist Mode Landing Page
      </p>
      <p className="text-[10px] text-white/40 mt-0.5">When enabled, visitors see a 30-second immersive showcase before your full profile loads</p>
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
