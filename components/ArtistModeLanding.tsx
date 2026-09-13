import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import {
  X, Play, Music2, Film, BookOpen, Sparkles, Globe, ExternalLink,
  Clock, Zap, ShoppingBag, Pin, Share2, Link2, User,
} from 'lucide-react';
import { UserProfile, Track, Video, Album, Article, MerchItem } from '../types';
import { getSocialLinks } from '../services/socialLinks';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  profile: UserProfile;
  albums?: Album[];
  onDismiss: () => void;
  onSelectTrack?: (track: Track) => void;
  onSelectVideo?: (video: Video) => void;
  onSelectAlbum?: (album: Album) => void;
  onSelectArticle?: (article: Article) => void;
  onSelectMerch?: (item: MerchItem) => void;
  onShareProfile?: (platform: 'x' | 'bluesky' | 'threads' | 'copy') => void;
}

const LANDING_DURATION = 30;

// ── Social link helpers ───────────────────────────────────────────────────────
function resolvedSocialLinks(profile: UserProfile) {
  return getSocialLinks(profile).map(link => ({ label: link.label, href: link.url, platform: link.platform }));
}

// ── Placeholder — shown when a section has no data ────────────────────────────
const EmptySlot: React.FC<{ text: string; icon?: React.ReactNode; className?: string }> = ({ text, icon, className = '' }) => (
  <div className={`border border-dashed border-white/[0.08] rounded-[10px] bg-white/[0.01] flex items-center gap-2 px-3 py-2 ${className}`}>
    {icon && <span className="text-white/[0.06] shrink-0">{icon}</span>}
    <p className="text-[9px] text-white/[0.15] leading-relaxed">{text}</p>
  </div>
);

// ── Share menu ────────────────────────────────────────────────────────────────
const ShareMenu: React.FC<{
  open: boolean;
  onClose: () => void;
  onShare: (platform: 'x' | 'bluesky' | 'threads' | 'copy') => void;
  brandColor: string;
}> = ({ open, onClose, onShare, brandColor }) => (
  <AnimatePresence>
    {open && (
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="absolute bottom-10 right-0 w-44 py-1.5 rounded-xl bg-black/85 border border-white/10 backdrop-blur-xl shadow-2xl z-50"
      >
        <p className="px-3.5 py-1 text-[8px] font-black uppercase tracking-[0.25em] text-white/25">Share this page</p>
        {([
          { id: 'x' as const, label: 'Post to X', icon: '\ud835\udd4f' },
          { id: 'bluesky' as const, label: 'Bluesky', icon: '\ud83e\udd8b' },
          { id: 'threads' as const, label: 'Threads', icon: '\ud83e\uddf5' },
        ]).map(s => (
          <button key={s.id} onClick={() => { onShare(s.id); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/5 transition-all text-left">
            <span className="text-xs">{s.icon}</span>
            <span className="text-[10px] text-white/60">{s.label}</span>
          </button>
        ))}
        <div className="mx-3 my-0.5 h-px bg-white/5" />
        <button onClick={() => { onShare('copy'); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/5 transition-all text-left">
          <Link2 size={12} className="text-white/30" />
          <span className="text-[10px] text-white/60">Copy Link</span>
        </button>
      </motion.div>
    )}
  </AnimatePresence>
);

// ══════════════════════════════════════════════════════════════════════════════
// ██  ARTIST MODE LANDING — A1 "Glass Canvas" (zero-scroll)                 ██
// ══════════════════════════════════════════════════════════════════════════════

const ArtistModeLanding: React.FC<Props> = ({
  profile, albums = [], onDismiss, onSelectTrack, onSelectVideo,
  onSelectAlbum, onSelectArticle, onSelectMerch, onShareProfile,
}) => {
  const [timeLeft, setTimeLeft] = useState(LANDING_DURATION);
  const [phase, setPhase] = useState<'in' | 'visible' | 'out'>('in');
  const [bgIndex, setBgIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const parallaxX = useTransform(mouseX, [0, typeof window !== 'undefined' ? window.innerWidth : 1920], [-8, 8]);
  const parallaxY = useTransform(mouseY, [0, typeof window !== 'undefined' ? window.innerHeight : 1080], [-5, 5]);

  // ── Derived content ─────────────────────────────────────────────────────────
  const now = Date.now();
  const publishedAlbums = albums.filter(a => !a.releaseDate || a.releaseDate <= now);
  const upcomingAlbums = albums.filter(a => a.releaseDate && a.releaseDate > now);
  const outNow = [...publishedAlbums].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0] ?? null;
  const comingSoon = [...upcomingAlbums].sort((a, b) => (a.releaseDate ?? 0) - (b.releaseDate ?? 0))[0] ?? null;

  const latestTracks: Track[] = (outNow?.tracks ?? profile.personalTracks ?? []).slice(0, 3);
  const latestVideo: Video | null = (profile.videos ?? []).slice(0, 1)[0] ?? null;
  const latestPost: Article | null = [...(profile.articles ?? [])].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))[0] ?? null;
  const merchItems: MerchItem[] = (profile.merch ?? []).slice(0, 3);
  const pinnedItems = (profile.pinnedItems ?? []).slice(0, 3);
  const links = resolvedSocialLinks(profile);

  const bgImages: string[] = [
    ...(profile.backgroundSlideshow?.items?.filter(i => i.type === 'PHOTO').map(i => i.url) ?? []),
    ...(profile.coverArt ? [profile.coverArt] : []),
    ...(outNow?.coverImage ? [outNow.coverImage] : []),
  ].filter(Boolean).slice(0, 6);

  const currentBg = bgImages[bgIndex] ?? null;
  const brandColor = profile.brandColor ?? '#6B0099';

  // ── Timers ──────────────────────────────────────────────────────────────────
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
        if (t <= 1) { clearInterval(timerRef.current!); setPhase('out'); setTimeout(onDismiss, 800); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { clearInterval(timerRef.current!); clearTimeout(inTimeout); };
  }, [onDismiss]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => { mouseX.set(e.clientX); mouseY.set(e.clientY); }, [mouseX, mouseY]);
  const handleDismiss = () => { clearInterval(timerRef.current!); setPhase('out'); setTimeout(onDismiss, 600); };
  const handleShare = (platform: 'x' | 'bluesky' | 'threads' | 'copy') => { onShareProfile?.(platform); };

  const progress = ((LANDING_DURATION - timeLeft) / LANDING_DURATION) * 100;
  const formatReleaseDate = (ts: number) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const circR = 11;
  const circC = 2 * Math.PI * circR;

  // ── Stagger helper ──────────────────────────────────────────────────────────
  const stagger = (delay: number) => ({
    initial: { opacity: 0, y: 16 } as const,
    animate: { opacity: 1, y: 0 } as const,
    transition: { delay, duration: 0.55, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  });

  return (
    <AnimatePresence>
      {phase !== 'out' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'visible' ? 1 : 0.6 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-[200] flex flex-col"
          onMouseMove={handleMouseMove}
        >
          {/* ── Background ── */}
          <div className="absolute inset-0">
            {currentBg ? (
              <motion.div key={bgIndex}
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                style={{ x: parallaxX, y: parallaxY }}
                className="absolute inset-[-4%]"
              >
                <img src={currentBg} alt="" className="w-full h-full object-cover" style={{ filter: 'blur(1px) brightness(0.25) saturate(1.3)' }} />
              </motion.div>
            ) : (
              <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 18% 20%, ${brandColor}38, transparent 50%), radial-gradient(ellipse at 85% 75%, #00204828, transparent 45%)` }} />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.08) 30%, rgba(0,0,0,0.6) 65%, rgba(0,0,0,0.95) 100%)' }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 20% 30%, ${brandColor}18, transparent 55%)` }} />
            {/* Film grain */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.02]"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")', backgroundRepeat: 'repeat', backgroundSize: '128px' }} />
          </div>

          {/* ── Top bar ── */}
          <motion.div {...stagger(0.15)} className="relative z-20 flex items-center justify-between px-4 md:px-5 pt-3 md:pt-3.5 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-1 h-5 rounded-full" style={{ background: brandColor }} />
              <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/25">Artist Showcase</span>
            </div>
            <div className="flex items-center gap-2.5">
              {/* Share */}
              <div className="relative">
                <button onClick={() => setShareOpen(o => !o)}
                  className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-white/[0.12] transition-all">
                  <Share2 size={12} className="text-white/40" />
                </button>
                <ShareMenu open={shareOpen} onClose={() => setShareOpen(false)} onShare={handleShare} brandColor={brandColor} />
              </div>
              {/* Timer */}
              <div className="relative w-7 h-7">
                <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
                  <circle cx="14" cy="14" r={circR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2" />
                  <circle cx="14" cy="14" r={circR} fill="none" stroke={brandColor} strokeWidth="2"
                    strokeDasharray={`${circC}`} strokeDashoffset={`${circC * (1 - progress / 100)}`}
                    strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s linear' }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white/50">{timeLeft}</span>
              </div>
              {/* Close */}
              <button onClick={handleDismiss}
                className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center hover:bg-white/[0.15] transition-all group">
                <X size={12} className="text-white/40 group-hover:text-white transition-colors" />
              </button>
            </div>
          </motion.div>

          {/* ════════════════════════════════════════════════════════════════════ */}
          {/* CONTENT — three horizontal bands, zero scroll                       */}
          {/* ════════════════════════════════════════════════════════════════════ */}
          <div className="relative z-10 flex-1 flex flex-col justify-center px-4 md:px-5 pb-3 min-h-0 gap-1.5 md:gap-2 max-w-[1100px] mx-auto w-full">

            {/* ═══ BAND 1: Hero identity ═══ */}
            <motion.div {...stagger(0.25)} className="flex items-start gap-3 md:gap-5 shrink-0">
              {/* Avatar */}
              {profile.photoURL && (
                <motion.div
                  initial={{ scale: 0.7, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  className="relative shrink-0"
                >
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden border border-white/10"
                    style={{ boxShadow: `0 12px 40px ${brandColor}25` }}>
                    <img src={profile.photoURL} alt={profile.displayName} className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 md:w-5 md:h-5 rounded-full border-2 border-black flex items-center justify-center" style={{ background: brandColor }}>
                    <Sparkles size={8} className="text-white" />
                  </div>
                </motion.div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-[0.9] tracking-tight" style={{ textShadow: '0 0 60px rgba(0,0,0,0.8)' }}>
                  {profile.displayName}
                </h1>
                {profile.accountType && (
                  <p className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.3em] mt-1" style={{ color: brandColor }}>
                    {profile.accountType === 'ARTIST' ? 'Artist' : profile.accountType.charAt(0) + profile.accountType.slice(1).toLowerCase()}
                  </p>
                )}
                {/* Bio */}
                {profile.bio ? (
                  <p className="text-[9px] md:text-[10px] text-white/20 leading-relaxed mt-1 max-w-md line-clamp-2">
                    {profile.bio.length > 200 ? profile.bio.slice(0, 197) + '\u2026' : profile.bio}
                  </p>
                ) : (
                  <p className="text-[9px] text-white/[0.12] mt-1 max-w-sm">{'\u270d\ufe0f'} Artist bio — story, influences, genre, career highlights shown here.</p>
                )}
                {/* Stats + socials */}
                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                  <span className="text-white/25 text-[9px]"><span className="font-black text-white text-[10px]">{profile.followerCount?.toLocaleString() ?? 0}</span> followers</span>
                  <span className="text-white/[0.08]">{'\u00b7'}</span>
                  <span className="text-white/25 text-[9px]"><span className="font-black text-white text-[10px]">{profile.followingCount?.toLocaleString() ?? 0}</span> following</span>
                  {links.length > 0 && (
                    <>
                      <span className="text-white/[0.08]">{'\u00b7'}</span>
                      {links.map(l => (
                        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="px-2 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-white/30 hover:text-white text-[8px] md:text-[9px] font-bold transition-all">
                          {l.label}
                        </a>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </motion.div>

            {/* ── Whisker ── */}
            <div className="h-px w-full shrink-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04) 15%, rgba(255,255,255,0.04) 85%, transparent)' }} />

            {/* ═══ BAND 2: Out Now + Upcoming + Video ═══ */}
            <div className="flex flex-col md:flex-row gap-3 md:gap-5 min-h-0 shrink-0">

              {/* OUT NOW — left ~55% */}
              <motion.div {...stagger(0.4)} className="md:flex-[3] min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-5 h-[2.5px] rounded-full bg-emerald-400" />
                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/80">{'\u26a1'} Out Now</span>
                </div>
                {outNow ? (
                  <div className="flex gap-3 items-start">
                    <button onClick={() => { onSelectAlbum?.(outNow); handleDismiss(); }}
                      className="w-20 h-20 md:w-28 md:h-28 rounded-2xl overflow-hidden shrink-0 group"
                      style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)' }}>
                      {outNow.coverImage ? (
                        <img src={outNow.coverImage} alt={outNow.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-900/20 to-black">
                          <Music2 size={28} className="text-white/[0.06]" />
                        </div>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-base md:text-lg font-black text-white truncate">{outNow.title}</h2>
                      <p className="text-[8px] md:text-[9px] text-white/25 mb-1.5">
                        {outNow.tracks?.length ?? 0} track{(outNow.tracks?.length ?? 0) !== 1 ? 's' : ''}
                        {outNow.createdAt ? ` \u00b7 ${formatReleaseDate(outNow.createdAt)}` : ''}
                      </p>
                      <div className="space-y-px">
                        {latestTracks.map((track, i) => (
                          <button key={track.id}
                            onClick={() => { onSelectTrack?.(track); handleDismiss(); }}
                            className="w-full flex items-center gap-2 md:gap-3 px-2 py-1 md:py-1.5 rounded-lg hover:bg-white/[0.03] transition-all text-left group">
                            <span className="text-[8px] text-white/[0.12] w-3 md:w-4 font-mono">{String(i + 1).padStart(2, '0')}</span>
                            <p className="text-[10px] md:text-[11px] font-semibold text-white/55 flex-1 truncate group-hover:text-white transition-colors">{track.title}</p>
                            <span className="text-[8px] text-white/[0.12]">{track.duration ? `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, '0')}` : ''}</span>
                          </button>
                        ))}
                      </div>
                      <button onClick={() => { onSelectAlbum?.(outNow); handleDismiss(); }}
                        className="mt-1.5 px-3.5 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest text-white hover:brightness-110 transition-all"
                        style={{ background: brandColor, boxShadow: `0 6px 20px ${brandColor}30` }}>
                        {'\u25b6'} Play Album
                      </button>
                    </div>
                  </div>
                ) : (
                  <EmptySlot text="Most current release — album art, title, track list, and play button." icon={<Music2 size={16} />} className="h-28" />
                )}
              </motion.div>

              {/* RIGHT STACK: Upcoming + Video */}
              <div className="md:flex-[2] flex flex-row md:flex-col gap-2 md:gap-3 min-w-0">
                {/* UPCOMING */}
                <motion.div {...stagger(0.5)} className="flex-1 md:flex-initial shrink-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-4 h-[2.5px] rounded-full bg-amber-400" />
                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/70">{'\ud83d\udd25'} Coming Soon</span>
                  </div>
                  {comingSoon ? (
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl overflow-hidden shrink-0 relative">
                        {comingSoon.coverImage
                          ? <img src={comingSoon.coverImage} alt="" className="w-full h-full object-cover blur-sm brightness-50" />
                          : <div className="w-full h-full" style={{ background: `${brandColor}20` }} />}
                        <div className="absolute inset-0 flex items-center justify-center"><Clock size={14} className="text-white/40" /></div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] md:text-xs font-bold text-white/35 truncate">{comingSoon.title}</p>
                        <p className="text-[8px] text-white/15">{comingSoon.releaseDate ? formatReleaseDate(comingSoon.releaseDate) : 'Upcoming'}</p>
                      </div>
                    </div>
                  ) : (
                    <EmptySlot text="Upcoming release — cover, title, date, pre-save." icon={<Clock size={14} />} />
                  )}
                </motion.div>

                {/* VIDEO */}
                <motion.div {...stagger(0.55)} className="flex-1 min-h-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-4 h-[2.5px] rounded-full bg-rose-400" />
                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-rose-400/60">{'\ud83c\udfac'} Latest Video</span>
                  </div>
                  {latestVideo ? (
                    <button onClick={() => { onSelectVideo?.(latestVideo); handleDismiss(); }}
                      className="w-full h-20 md:h-24 rounded-xl overflow-hidden relative group border border-white/[0.06]">
                      {latestVideo.thumbnailUrl ? (
                        <img src={latestVideo.thumbnailUrl} alt={latestVideo.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: `${brandColor}15` }}>
                          <Film size={20} style={{ color: brandColor }} className="opacity-30" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                        <Play size={20} className="text-white" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 px-2.5 py-1 bg-gradient-to-t from-black/40">
                        <p className="text-[9px] font-bold text-white/40 truncate">{latestVideo.title}</p>
                      </div>
                    </button>
                  ) : (
                    <EmptySlot text="Most recent video — thumbnail, title, play." icon={<Film size={14} />} className="h-20 md:h-24" />
                  )}
                </motion.div>
              </div>
            </div>

            {/* ── Whisker ── */}
            <div className="h-px w-full shrink-0" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04) 15%, rgba(255,255,255,0.04) 85%, transparent)' }} />

            {/* ═══ BAND 3: Post + Merch + Pinned ═══ */}
            <div className="flex flex-col md:flex-row gap-3 md:gap-5 min-h-0 shrink-0">

              {/* RECENT POST */}
              <motion.div {...stagger(0.6)} className="md:flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-4 h-[2.5px] rounded-full bg-sky-400" />
                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-white/25">{'\ud83d\udcdd'} Post</span>
                </div>
                {latestPost ? (
                  <button onClick={() => { onSelectArticle?.(latestPost); handleDismiss(); }}
                    className="w-full border border-dashed border-white/[0.06] rounded-[10px] bg-white/[0.01] p-2.5 text-left hover:bg-white/[0.025] transition-all">
                    <div className="flex items-center gap-2 mb-1.5">
                      {profile.photoURL && <img src={profile.photoURL} alt="" className="w-5 h-5 rounded-full object-cover" />}
                      <span className="text-[9px] font-bold text-white/40 truncate">{profile.displayName}</span>
                    </div>
                    <p className="text-[10px] font-bold text-white/60 line-clamp-2 leading-snug">{latestPost.title}</p>
                    {latestPost.subtitle && <p className="text-[8px] text-white/20 line-clamp-1 mt-0.5">{latestPost.subtitle}</p>}
                  </button>
                ) : (
                  <EmptySlot text="Latest feed post — text, image, likes & comments." icon={<BookOpen size={14} />} />
                )}
              </motion.div>

              {/* MERCH */}
              <motion.div {...stagger(0.65)} className="md:flex-[1.4] min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-4 h-[2.5px] rounded-full bg-orange-400" />
                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-white/25">{'\ud83d\udecd\ufe0f'} Merch</span>
                </div>
                {merchItems.length > 0 ? (
                  <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-0.5">
                    {merchItems.map(item => (
                      <button key={item.id} onClick={() => { onSelectMerch?.(item); handleDismiss(); }}
                        className="border border-dashed border-white/[0.06] rounded-[10px] bg-white/[0.01] p-1.5 flex flex-col items-center gap-1 min-w-[70px] md:min-w-[80px] shrink-0 hover:bg-white/[0.025] transition-all">
                        <div className="w-full aspect-square rounded-lg overflow-hidden bg-white/[0.015] flex items-center justify-center">
                          {item.imageUrl
                            ? <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                            : <ShoppingBag size={16} className="text-white/[0.06]" />}
                        </div>
                        <p className="text-[7px] md:text-[8px] text-white/20 truncate w-full text-center">${item.salePrice ?? item.price}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptySlot text="Recent merch — product image, name, price." icon={<ShoppingBag size={14} />} />
                )}
              </motion.div>

              {/* PINNED */}
              <motion.div {...stagger(0.7)} className="md:flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-4 h-[2.5px] rounded-full bg-yellow-400" />
                  <span className="text-[8px] md:text-[9px] font-black uppercase tracking-[0.2em] text-white/25">{'\ud83d\udccc'} Pinned</span>
                </div>
                {pinnedItems.length > 0 ? (
                  <div className="space-y-1">
                    {pinnedItems.map(pin => (
                      <div key={pin.id}
                        className="border border-dashed border-white/[0.06] rounded-[8px] bg-white/[0.01] px-2.5 py-1.5 flex items-center gap-2 hover:bg-white/[0.02] transition-all cursor-pointer">
                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/30 shrink-0" />
                        <span className="text-[9px] text-white/30 flex-1 truncate">Pinned {pin.type.toLowerCase()}</span>
                        <span className="text-[7px] text-white/[0.08] uppercase font-bold">{pin.type}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptySlot text="Top 3 pinned items visitors see first." icon={<Pin size={14} />} />
                )}
              </motion.div>
            </div>
          </div>

          {/* ── Bottom glow line ── */}
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
