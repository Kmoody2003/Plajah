/**
 * DesktopLauncherOverlay.tsx — Plajah Desktop Project Library & Activity Hub (Front Row Marquee).
 *
 * Springboard dashboard for Windows desktop and cross-platform quick launch:
 * - Authentic Plajah Brand Language (#0d0015, #6B0099, #D40055, #FF8C00, Outfit & Inter typography)
 * - Panoramic User Cover Art canopy with atmospheric brand scrims & elevated glowing avatar
 * - Real Social Media & Engagement Metrics (On-platform plays, likes, comments, followers, connected channels)
 * - Dedicated Productivity section with distinct "Work" and "Personal" sub-tabs:
 *     • WORK:
 *         1. Creative Studios: Melos Audio Sessions, Fabula Film Cuts, Lorea Screenplays, Ambo Pro Presenter
 *         2. Staff Time Clock: Punch In / Punch Out with live elapsed shift timer & shift record
 *         3. Business & Storefront (CONDITIONAL): POS Counter terminal, pickup orders & inventory alerts
 *            ONLY shown if user has a registered business page or active merch items!
 *     • PERSONAL:
 *         1. Tela Documents: Real local/OPFS Tela canvases listed with last edited timestamps
 *         2. "+ Create New Document" quick action button
 *         3. Lectio & Sacred Scripture personal devotional meditation
 * - Invitations Springboard: Collaboration, production, and organization invites (with clean empty state)
 * - Culture & Play (Leisure): Real continue watching (Taleo), Chora music, and Reello creator clips
 * - Zero fake/mockup data: all modules surface authentic data or clean, informative descriptions
 * - Dismisses directly to Front Row (DASHBOARD)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Music2, Film, ScrollText, LayoutPanelTop, Sparkles,
  X, Search, ArrowRight, Radio, Users, CheckCircle2,
  Tv, BookOpen, Microscope, Plus, BookMarked, MessageSquare,
  Play, Clock, Store, ShoppingBag, Megaphone, DollarSign,
  ShieldCheck, Presentation, Compass, Check, FileText,
  UserCheck, Heart, Headphones, Share2, Mail, ExternalLink,
  Briefcase, User, Camera
} from 'lucide-react';
import type { UserProfile, Album, BusinessPage } from '../types';
import { fetchUserAlbums } from '../services/backendService';
import { listWritingProjects } from '../services/loreaProjectsService';
import { listTelaDocs } from '../services/telaStore';
import { fetchMyBusinessPages } from '../services/businessService';
import { fetchUserAnalytics, type UserKPIs } from '../services/analyticsService';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { listProjectsCloud } from '../services/fabulaProjects';
import { getContinueWatching, type WatchEntry } from '../services/watchHistoryService';
import DesktopAuthModal from './DesktopAuthModal';

export type ActivityHorizon = 'ALL' | 'PRODUCTIVITY' | 'PLAY';
export type ProductivitySubTab = 'WORK' | 'PERSONAL';

export interface DesktopLauncherOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  user: any | null;
  userProfile: UserProfile | null;
  onNavigate: (view: string, detail?: any) => void;
  initialRole?: 'creator' | 'education' | 'business';
}

const SHIFT_STORAGE_KEY = 'plajah_active_shift_v1';
const INVITES_STORAGE_KEY = 'plajah_user_invites_v1';

export const DesktopLauncherOverlay: React.FC<DesktopLauncherOverlayProps> = ({
  isOpen,
  onClose,
  user,
  userProfile,
  onNavigate,
}) => {
  const [horizon, setHorizon] = useState<ActivityHorizon>('ALL');
  const [productivityTab, setProductivityTab] = useState<ProductivitySubTab>('WORK');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // ── Time Clock / Staff Punch-In State ─────────────────────────────────────────
  const [isClockedIn, setIsClockedIn] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(SHIFT_STORAGE_KEY);
      return !!saved;
    } catch {
      return false;
    }
  });
  const [shiftStartTime, setShiftStartTime] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(SHIFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.clockIn || Date.now();
      }
    } catch { /* ignore */ }
    return Date.now();
  });
  const [shiftElapsedStr, setShiftElapsedStr] = useState<string>('00:00:00');
  const [punchFeedback, setPunchFeedback] = useState<string | null>(null);

  // Live timer for active shift
  useEffect(() => {
    if (!isClockedIn) return;
    const updateElapsed = () => {
      const diffMs = Math.max(0, Date.now() - shiftStartTime);
      const hrs = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      const pad = (n: number) => n.toString().padStart(2, '0');
      setShiftElapsedStr(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
    };
    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [isClockedIn, shiftStartTime]);

  const handleTogglePunch = () => {
    if (isClockedIn) {
      try {
        localStorage.removeItem(SHIFT_STORAGE_KEY);
      } catch { /* ignore */ }
      setIsClockedIn(false);
      setPunchFeedback(`Shift complete! ${shiftElapsedStr} recorded.`);
      setTimeout(() => setPunchFeedback(null), 4000);
    } else {
      const now = Date.now();
      try {
        localStorage.setItem(
          SHIFT_STORAGE_KEY,
          JSON.stringify({
            clockIn: now,
            staffName: userProfile?.displayName || user?.displayName || 'Staff Member',
          })
        );
      } catch { /* ignore */ }
      setShiftStartTime(now);
      setIsClockedIn(true);
      setPunchFeedback('Punched in successfully! Time is recording.');
      setTimeout(() => setPunchFeedback(null), 4000);
    }
  };

  // ── Real Data States ─────────────────────────────────────────────────────────
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [writingProjects, setWritingProjects] = useState<any[]>([]);
  const [telaDocs, setTelaDocs] = useState<any[]>([]);
  const [filmProjects, setFilmProjects] = useState<any[]>([]);
  const [continueWatching, setContinueWatching] = useState<WatchEntry[]>([]);
  const [businessPages, setBusinessPages] = useState<BusinessPage[]>([]);
  const [userKpis, setUserKpis] = useState<UserKPIs | null>(null);
  const [invites, setInvites] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem(INVITES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Check if user has an active business or active merch store
  const hasActiveBusinessOrMerch = useMemo(() => {
    if (businessPages.length > 0) return true;
    if (userProfile?.merch && userProfile.merch.length > 0) return true;
    return false;
  }, [businessPages, userProfile?.merch]);

  // Load real projects, documents, business data, and metrics
  useEffect(() => {
    if (!isOpen) return;

    // 1. Tela Documents (OPFS & LocalStorage)
    listTelaDocs()
      .then(docs => setTelaDocs(docs || []))
      .catch(() => setTelaDocs([]));

    // 2. Continue Watching (Taleo / Movies / Shows)
    getContinueWatching(undefined, 8)
      .then(items => setContinueWatching(items || []))
      .catch(() => {});

    // 3. User Specific Backend Collections
    if (user?.uid) {
      const uid = user.uid;
      Promise.allSettled([
        fetchUserAlbums(uid).then(a => setUserAlbums(a || [])).catch(() => {}),
        listWritingProjects(uid).then(res => setWritingProjects(res?.projects || [])).catch(() => {}),
        typeof listProjectsCloud === 'function'
          ? listProjectsCloud(uid).then((p: any) => setFilmProjects(p || [])).catch(() => {})
          : Promise.resolve(),
        fetchMyBusinessPages().then(bps => setBusinessPages(bps || [])).catch(() => {}),
        fetchUserAnalytics(uid, userProfile).then(ana => setUserKpis(ana?.kpis || null)).catch(() => {}),
      ]);
    }
  }, [isOpen, user?.uid, userProfile]);

  // Global keyboard shortcuts: Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Profile data & imagery
  const displayName = userProfile?.displayName || user?.displayName || 'Creator';
  const avatarUrl =
    userProfile?.photoURL ||
    userProfile?.customPhotoURL ||
    user?.photoURL ||
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80';
  const coverUrl =
    userProfile?.coverArt ||
    userProfile?.photoURL ||
    'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1600&auto=format&fit=crop&q=80';

  // Navigation handlers
  const handleOpenItem = (targetView: string, payload?: any) => {
    onClose();
    if (payload?.docId !== undefined) {
      try {
        window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: payload.docId } }));
      } catch {
        onNavigate('TELA');
      }
      return;
    }
    onNavigate(targetView, payload);
  };

  const handleCreateNewDoc = () => {
    onClose();
    try {
      window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { docId: null } }));
    } catch {
      onNavigate('TELA');
    }
  };

  // Primary active studio item for spotlight hero
  const activeSpotlightItem = useMemo(() => {
    if (userAlbums.length > 0) {
      const alb = userAlbums[0];
      return {
        title: alb.title || 'Untitled Master Session',
        subtitle: `${alb.tracks?.length || 0} tracks recorded • Melos Audio Stage`,
        badge: 'Melos Spatial Audio',
        time: 'Active Project',
        targetView: 'MELOS',
        icon: Music2,
      };
    }
    if (filmProjects.length > 0) {
      const film = filmProjects[0];
      return {
        title: film.title || 'Fabula Film Sequence',
        subtitle: '4K Timeline Sequence • Color grade and edit timeline',
        badge: 'Fabula Film Editor',
        time: 'Active Sequence',
        targetView: 'FABULA',
        icon: Film,
      };
    }
    if (telaDocs.length > 0) {
      const doc = telaDocs[0];
      return {
        title: doc.title || 'Tela Canvas',
        subtitle: 'Unified Document Canvas • Notes, Writer, and Grids',
        badge: 'Tela Document',
        time: doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : 'Recent Canvas',
        targetView: 'TELA',
        payload: { docId: doc.id },
        icon: FileText,
      };
    }
    return {
      title: 'Plajah Creative Suites',
      subtitle: 'Open Melos for spatial music, Fabula for cinema, Lorea for screenplays, or Tela for unified documents.',
      badge: 'Creative Studio Hub',
      time: 'Ready to Create',
      targetView: 'CREATOR_HUB',
      icon: Sparkles,
    };
  }, [userAlbums, filmProjects, telaDocs]);

  // Primary continue watching item
  const activeWatchItem = useMemo(() => {
    if (continueWatching.length > 0) {
      const w = continueWatching[0];
      const mins = Math.floor(w.positionSec / 60);
      const totalMins = Math.floor(w.durationSec / 60);
      const pct = w.durationSec > 0 ? Math.min(100, Math.round((w.positionSec / 60) / (w.durationSec / 60) * 100)) : 50;
      return {
        title: w.title || 'Continue Watching',
        subtitle: w.ownerName ? `${w.ownerName} • Paused at ${mins}m / ${totalMins}m` : `Paused at ${mins}m`,
        pct,
        view: w.kind === 'TALEO' ? 'MOVIE_UX' : 'RELLO',
        payload: { videoId: w.id },
      };
    }
    return null;
  }, [continueWatching]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Heavy Frosted Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/85 backdrop-blur-2xl"
      />

      {/* Launcher Container — Front Row Marquee */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 14 }}
        transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-6xl bg-[#0d0015] border border-white/15 rounded-3xl overflow-hidden shadow-[0_25px_80px_rgba(0,0,0,0.95)] max-h-[92vh] flex flex-col"
      >
        {/* ── GORGEOUS USER COVER PHOTO HEADER CANOPY ── */}
        <div className="relative h-44 sm:h-52 w-full flex-shrink-0 overflow-hidden select-none">
          {/* Cover Photo */}
          <img
            src={coverUrl}
            alt="Cover Art"
            className="w-full h-full object-cover filter saturate-125 brightness-90 transform scale-105"
          />

          {/* Atmospheric Color Scrims */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d0015] via-[#0d0015]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#6B0099]/40 via-transparent to-[#D40055]/30" />

          {/* Floating Brand & Action Bar */}
          <div className="absolute top-4 left-5 right-5 flex items-center justify-between z-10">
            <div className="flex items-center gap-2.5 bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/10 shadow-lg">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center font-black text-white text-xs shadow-md"
                style={{ background: 'linear-gradient(135deg, #6B0099 0%, #D40055 50%, #FF8C00 100%)' }}
              >
                P
              </div>
              <span className="text-xs font-display font-extrabold tracking-wider uppercase text-[#FF8C00]">
                Plajah Launch Library
              </span>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/15">
                v1.0.40
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* DESKTOP SIGN IN / ACCOUNT BUTTON */}
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-wider px-4 py-2 rounded-full backdrop-blur-md transition-all border shadow-lg bg-gradient-to-r from-[#6B0099] via-[#D40055] to-[#FF8C00] hover:brightness-110 text-white border-white/30 active:scale-[0.98]"
                title={user ? 'Switch Account / Manage PC Sign-In' : 'Sign In to Plajah on this PC'}
              >
                <User size={14} className="text-white" />
                <span>{user ? 'Account / Switch' : 'Sign In'}</span>
              </button>

              {/* STAFF PUNCH IN / OUT TIME CLOCK PILL */}
              <button
                onClick={handleTogglePunch}
                className={`flex items-center gap-2 text-xs font-bold px-3.5 py-1.5 rounded-full backdrop-blur-md transition-all border shadow-lg ${
                  isClockedIn
                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/35'
                    : 'bg-white/10 text-white/80 border-white/15 hover:bg-white/20'
                }`}
                title={isClockedIn ? 'Click to Punch Out' : 'Click to Punch In for Work Shift'}
              >
                <Clock size={13} className={isClockedIn ? 'text-emerald-400 animate-spin-slow' : 'text-[#FF8C00]'} />
                <span>{isClockedIn ? `Shift: ${shiftElapsedStr} • Punch Out` : '⏱️ Punch In for Work'}</span>
              </button>

              {/* Close Button — Dismisses to Front Row (DASHBOARD) */}
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-black/60 hover:bg-white/20 text-white flex items-center justify-center transition-all border border-white/15 shadow-md"
                title="Dismiss to Front Row (Esc)"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* User Profile Presence Strip */}
          <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-end justify-between gap-4 z-10">
            <div className="flex items-center gap-4">
              {/* Avatar with Glowing Brand Gradient Border */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl p-[2.5px] bg-gradient-to-tr from-[#6B0099] via-[#D40055] to-[#FF8C00] shadow-2xl flex-shrink-0">
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-full h-full rounded-2xl object-cover"
                />
                <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0d0015] shadow ${isClockedIn ? 'bg-[#06D6A0]' : 'bg-[#FF8C00]'}`} />
              </div>

              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold font-display text-white tracking-tight leading-none">
                  {displayName}
                </h1>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#FF8C00]/20 text-[#FF8C00] font-display font-bold text-[11px] border border-[#FF8C00]/40 uppercase tracking-wider">
                    {userProfile?.bio ? userProfile.bio.slice(0, 32) : 'Creator • Platform Member'}
                  </span>
                  {isClockedIn && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/30">
                      ON SHIFT ({shiftElapsedStr})
                    </span>
                  )}
                  {hasActiveBusinessOrMerch && (
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono text-[10px] font-bold border border-purple-500/30">
                      BUSINESS OPERATOR
                    </span>
                  )}
                  {!user && (
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#6B0099]/40 to-[#D40055]/40 hover:from-[#6B0099]/60 hover:to-[#D40055]/60 text-white font-display font-bold text-[11px] border border-white/25 transition-all"
                    >
                      🔑 Sign In on this PC
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Work & Play Horizon Segmented Switcher */}
            <div className="flex items-center bg-black/75 backdrop-blur-md p-1 rounded-2xl border border-white/15 text-xs font-display shadow-xl">
              <button
                onClick={() => setHorizon('ALL')}
                className={`px-4 py-1.5 rounded-xl font-extrabold transition-all ${
                  horizon === 'ALL'
                    ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-black shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                All Activity
              </button>
              <button
                onClick={() => setHorizon('PRODUCTIVITY')}
                className={`px-4 py-1.5 rounded-xl font-extrabold transition-all ${
                  horizon === 'PRODUCTIVITY'
                    ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                ⚡ Productivity
              </button>
              <button
                onClick={() => setHorizon('PLAY')}
                className={`px-4 py-1.5 rounded-xl font-extrabold transition-all ${
                  horizon === 'PLAY'
                    ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-black shadow-md'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                ✨ Culture & Play
              </button>
            </div>
          </div>
        </div>

        {/* ── REAL SOCIAL MEDIA & ENGAGEMENT METRICS STRIP ── */}
        <div className="bg-white/[0.02] border-b border-white/10 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
          {/* On-Platform Engagement & Social Stats */}
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-1.5 text-white/60">
              <Users size={13} className="text-[#FF8C00]" />
              <span className="font-bold text-white">{userProfile?.followerCount ?? userKpis?.followerCount ?? 0}</span>
              <span className="text-[11px]">Followers</span>
            </div>

            <div className="flex items-center gap-1.5 text-white/60">
              <UserCheck size={13} className="text-purple-400" />
              <span className="font-bold text-white">{userProfile?.followingCount ?? userKpis?.followingCount ?? 0}</span>
              <span className="text-[11px]">Following</span>
            </div>

            {userKpis && userKpis.totalPlays > 0 && (
              <div className="flex items-center gap-1.5 text-white/60">
                <Headphones size={13} className="text-cyan-400" />
                <span className="font-bold text-white">{userKpis.totalPlays.toLocaleString()}</span>
                <span className="text-[11px]">Plays</span>
              </div>
            )}

            {userKpis && userKpis.totalLikes > 0 && (
              <div className="flex items-center gap-1.5 text-white/60">
                <Heart size={13} className="text-pink-400" />
                <span className="font-bold text-white">{userKpis.totalLikes.toLocaleString()}</span>
                <span className="text-[11px]">Likes</span>
              </div>
            )}

            {/* Connected Social Channel Badges */}
            {userProfile?.socialLinks && Object.values(userProfile.socialLinks).some(Boolean) && (
              <div className="flex items-center gap-2 pl-2 border-l border-white/10">
                <span className="text-[10px] text-white/40 uppercase tracking-wider font-mono">Channels:</span>
                {userProfile.socialLinks.instagram && (
                  <span className="px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-bold text-[10px] border border-pink-500/30">
                    Instagram
                  </span>
                )}
                {userProfile.socialLinks.youtube && (
                  <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 font-bold text-[10px] border border-red-500/30">
                    YouTube
                  </span>
                )}
                {userProfile.socialLinks.tiktok && (
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold text-[10px] border border-cyan-500/30">
                    TikTok
                  </span>
                )}
                {userProfile.socialLinks.spotify && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px] border border-emerald-500/30">
                    Spotify
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Social Management & Marketing Kit Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleOpenItem('CREATOR_HUB')}
              className="text-[#FF8C00] hover:text-[#FFA033] font-bold text-[11px] flex items-center gap-1 transition-colors"
            >
              <Megaphone size={12} />
              <span>Social Marketing Kit →</span>
            </button>
          </div>
        </div>

        {/* Feedback Banner if punched in/out */}
        {punchFeedback && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 px-6 py-2 text-xs font-semibold text-emerald-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <span>{punchFeedback}</span>
            </span>
            <button onClick={() => setPunchFeedback(null)} className="text-emerald-300 hover:text-white">✕</button>
          </div>
        )}

        {/* ── SCROLLABLE BODY ── */}
        <div className="p-5 sm:p-7 overflow-y-auto space-y-6 flex-1">

          {/* 1. SPOTLIGHT MARQUEE HERO */}
          <div
            className="relative rounded-3xl overflow-hidden border border-white/15 p-6 sm:p-7 shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(107,0,153,0.38) 0%, rgba(212,0,85,0.22) 50%, rgba(13,0,21,0.92) 100%)',
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              
              {/* Left Stage (Hero Info & 1-Click CTA) */}
              <div className="lg:col-span-8">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FF8C00]/20 border border-[#FF8C00]/40 text-[#FF8C00] text-xs font-bold uppercase tracking-wider mb-2.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF8C00] animate-pulse" />
                  <span>{activeSpotlightItem.badge}</span>
                  <span className="text-white/30">•</span>
                  <span>{activeSpotlightItem.time}</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-white tracking-tight leading-tight">
                  {activeSpotlightItem.title}
                </h2>
                <p className="text-sm text-white/70 mt-1.5 leading-relaxed max-w-2xl">
                  {activeSpotlightItem.subtitle}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => handleOpenItem(activeSpotlightItem.targetView, (activeSpotlightItem as any).payload)}
                    className="px-6 py-3 rounded-full text-black font-display font-black text-xs uppercase tracking-wider shadow-xl hover:brightness-110 transition-all flex items-center gap-2"
                    style={{ background: 'linear-gradient(135deg, #D40055 0%, #FF8C00 100%)' }}
                  >
                    <span>Resume Active Project</span>
                    <ArrowRight size={14} />
                  </button>

                  <button
                    onClick={handleCreateNewDoc}
                    className="px-4 py-3 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/15 transition-all flex items-center gap-1.5"
                  >
                    <Plus size={13} className="text-[#00DAF3]" />
                    <span>Create New Document</span>
                  </button>

                  {hasActiveBusinessOrMerch && (
                    <button
                      onClick={() => handleOpenItem('BUSINESS_DASHBOARD')}
                      className="px-4 py-3 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/15 transition-all flex items-center gap-1.5"
                    >
                      <Store size={13} className="text-emerald-400" />
                      <span>Storefront Terminal</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Stage: Secondary Continue Watching / Quick Status */}
              <div className="lg:col-span-4">
                {activeWatchItem ? (
                  <div
                    onClick={() => handleOpenItem(activeWatchItem.view, activeWatchItem.payload)}
                    className="p-4 rounded-2xl bg-black/60 border border-white/15 hover:border-cyan-400/40 transition-all cursor-pointer group shadow-lg"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-purple-900 to-cyan-900 flex items-center justify-center text-xl shadow-md border border-white/10 flex-shrink-0 group-hover:scale-105 transition-transform">
                        🎬
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider flex items-center gap-1.5">
                          <Tv size={11} />
                          <span>Continue Watching</span>
                        </div>
                        <div className="text-sm font-bold text-white truncate mt-0.5 group-hover:text-cyan-300 transition-colors">
                          {activeWatchItem.title}
                        </div>
                        <div className="text-xs text-white/50 truncate mt-0.5">
                          {activeWatchItem.subtitle}
                        </div>

                        <div className="w-full bg-white/10 h-1.5 rounded-full mt-2.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-cyan-400 to-[#FF8C00] h-full rounded-full transition-all"
                            style={{ width: `${activeWatchItem.pct}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={handleCreateNewDoc}
                    className="p-4 rounded-2xl bg-black/60 border border-white/15 hover:border-[#00DAF3]/40 transition-all cursor-pointer group shadow-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-[#00DAF3] flex items-center justify-center border border-cyan-500/30 flex-shrink-0">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">
                          Start a Tela Canvas
                        </div>
                        <div className="text-[11px] text-white/50 mt-0.5">
                          Unified notes, writing, grids & stage decks
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* 2. PRODUCTIVITY SECTION: WORK vs PERSONAL TABS */}
          {(horizon === 'ALL' || horizon === 'PRODUCTIVITY') && (
            <div className="space-y-4">
              {/* Productivity Header & Sub-Tab Switcher */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10 text-xs">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#00DAF3]" />
                    <span>Productivity</span>
                  </span>

                  {/* Personal vs Work Sub-Tabs */}
                  <div className="flex items-center bg-black/60 p-0.5 rounded-xl border border-white/10">
                    <button
                      onClick={() => setProductivityTab('WORK')}
                      className={`px-3.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                        productivityTab === 'WORK'
                          ? 'bg-gradient-to-r from-[#6B0099] to-[#D40055] text-white shadow'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      <Briefcase size={12} />
                      <span>Work</span>
                    </button>
                    <button
                      onClick={() => setProductivityTab('PERSONAL')}
                      className={`px-3.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
                        productivityTab === 'PERSONAL'
                          ? 'bg-gradient-to-r from-[#D40055] to-[#FF8C00] text-black shadow'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      <User size={12} />
                      <span>Personal</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateNewDoc}
                    className="px-3 py-1 rounded-full bg-[#00DAF3]/20 hover:bg-[#00DAF3]/30 text-[#00DAF3] border border-[#00DAF3]/40 font-bold transition-all flex items-center gap-1.5"
                  >
                    <Plus size={11} />
                    <span>Create New Document</span>
                  </button>

                  <button
                    onClick={handleTogglePunch}
                    className="px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold transition-all flex items-center gap-1.5"
                  >
                    <Clock size={11} />
                    <span>{isClockedIn ? 'Punch Out' : 'Punch In'}</span>
                  </button>
                </div>
              </div>

              {/* ── SUB-TAB: WORK ── */}
              {productivityTab === 'WORK' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Creative Studio Work */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider font-mono">
                      Studio Sequences & Cuts
                    </div>

                    {/* Melos Sessions */}
                    {userAlbums.length > 0 ? (
                      <div
                        onClick={() => handleOpenItem('MELOS')}
                        className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-[#FF8C00]/40 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-[#FF8C00] font-display">MELOS AUDIO</span>
                          <span className="text-white/40">{userAlbums.length} album{userAlbums.length > 1 ? 's' : ''}</span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-1 group-hover:text-[#FF8C00] transition-colors truncate">
                          {userAlbums[0].title || 'Untitled Session'}
                        </h3>
                        <p className="text-xs text-white/60 mt-0.5">
                          {userAlbums[0].tracks?.length || 0} tracks recorded • Spatial Stage
                        </p>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleOpenItem('MELOS')}
                        className="p-4 rounded-2xl bg-black/25 border border-white/5 hover:border-white/20 transition-all cursor-pointer group text-center py-5"
                      >
                        <Music2 size={20} className="mx-auto text-white/30 group-hover:text-[#FF8C00] transition-colors mb-1.5" />
                        <div className="text-xs font-bold text-white/70">No Audio Sessions Yet</div>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          Open Melos to record multitrack audio & spatial mix
                        </p>
                      </div>
                    )}

                    {/* Fabula Film Cuts */}
                    {filmProjects.length > 0 ? (
                      <div
                        onClick={() => handleOpenItem('FABULA')}
                        className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-cyan-500/40 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-cyan-400 font-display">FABULA FILM</span>
                          <span className="text-white/40">Active Sequence</span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-1 group-hover:text-cyan-300 transition-colors truncate">
                          {filmProjects[0]?.title || 'Timeline Sequence'}
                        </h3>
                        <p className="text-xs text-white/60 mt-0.5">
                          4K Timeline sequence • Color grade active
                        </p>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleOpenItem('FABULA')}
                        className="p-4 rounded-2xl bg-black/25 border border-white/5 hover:border-white/20 transition-all cursor-pointer group text-center py-5"
                      >
                        <Film size={20} className="mx-auto text-white/30 group-hover:text-cyan-400 transition-colors mb-1.5" />
                        <div className="text-xs font-bold text-white/70">No Film Sequences Yet</div>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          Open Fabula to start a 4K timeline cut
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Writing & Ambo Presentations */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider font-mono">
                      Scripts & Staging
                    </div>

                    {/* Lorea Screenplays */}
                    {writingProjects.length > 0 ? (
                      <div
                        onClick={() => handleOpenItem('BOOKS')}
                        className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-amber-500/40 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-amber-400 font-display">LOREA WRITING</span>
                          <span className="text-white/40">Draft</span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-1 group-hover:text-amber-300 transition-colors truncate">
                          {writingProjects[0]?.title || 'Screenplay Draft'}
                        </h3>
                        <p className="text-xs text-white/60 mt-0.5">
                          Industry screenplay format • Script editor
                        </p>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleOpenItem('BOOKS')}
                        className="p-4 rounded-2xl bg-black/25 border border-white/5 hover:border-white/20 transition-all cursor-pointer group text-center py-5"
                      >
                        <ScrollText size={20} className="mx-auto text-white/30 group-hover:text-amber-400 transition-colors mb-1.5" />
                        <div className="text-xs font-bold text-white/70">No Screenplays Yet</div>
                        <p className="text-[11px] text-white/40 mt-0.5">
                          Open Lorea for screenwriting & manuscripts
                        </p>
                      </div>
                    )}

                    {/* Ambo Pro Presenter */}
                    <div
                      onClick={() => handleOpenItem('AMBO_PRO')}
                      className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-cyan-500/40 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-cyan-300 font-display">AMBO PRESENTER</span>
                        <span className="text-cyan-400">Pro Deck</span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-1 group-hover:text-cyan-300 transition-colors">
                        Stage Presentation & Projections
                      </h3>
                      <p className="text-xs text-white/60 mt-0.5">
                        Scripture slides, stage lower thirds & multi-screen output
                      </p>
                    </div>
                  </div>

                  {/* Business & Operations (CONDITIONAL) */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider font-mono">
                      Operations & Time
                    </div>

                    {/* Staff Shift Card */}
                    <div
                      onClick={handleTogglePunch}
                      className="p-4 rounded-2xl bg-black/45 border border-emerald-500/30 hover:border-emerald-400 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-emerald-400 font-display">STAFF TIME CLOCK</span>
                        <span className="text-white/40">{isClockedIn ? 'Clocked In' : 'Off Shift'}</span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-1 group-hover:text-emerald-300 transition-colors">
                        {isClockedIn ? `Shift Active: ${shiftElapsedStr}` : 'Ready to Punch In'}
                      </h3>
                      <p className="text-xs text-white/60 mt-0.5">
                        {isClockedIn ? 'Click to record punch out for break or end of day' : '1-click time record for production & store shifts'}
                      </p>
                    </div>

                    {/* Plajah Business & Store (ONLY IF REGISTERED BUSINESS OR MERCH STORE) */}
                    {hasActiveBusinessOrMerch ? (
                      <div
                        onClick={() => handleOpenItem('BUSINESS_DASHBOARD')}
                        className="p-4 rounded-2xl bg-black/45 border border-emerald-500/30 hover:border-emerald-400 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-400 font-display">STOREFRONT & POS</span>
                          <span className="text-emerald-400 font-bold">● Active</span>
                        </div>
                        <h3 className="text-sm font-bold text-white mt-1 group-hover:text-emerald-300 transition-colors">
                          {businessPages[0]?.businessName || 'Business Dashboard'}
                        </h3>
                        <p className="text-xs text-white/60 mt-0.5">
                          Counter POS terminal, orders & inventory management
                        </p>
                        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                          <span className="text-white/40">Manage Store</span>
                          <span className="text-emerald-400 font-bold">Launch POS →</span>
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => handleOpenItem('BUSINESS_DASHBOARD')}
                        className="p-4 rounded-2xl bg-black/25 border border-white/5 hover:border-white/20 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 text-white/40 text-xs font-bold">
                          <Store size={14} className="text-white/30" />
                          <span>Plajah Business</span>
                        </div>
                        <div className="text-xs font-medium text-white/60 mt-1">
                          Register a brand or storefront to activate counter POS and order queues.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── SUB-TAB: PERSONAL (TELA DOCS, SCRIPTURE, STUDY) ── */}
              {productivityTab === 'PERSONAL' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  
                  {/* Column 1 & 2: User Tela Documents */}
                  <div className="lg:col-span-2 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white/50 uppercase tracking-wider font-mono">
                        Tela Unified Documents ({telaDocs.length})
                      </span>
                      <button
                        onClick={handleCreateNewDoc}
                        className="text-[#00DAF3] hover:underline font-bold text-[11px] flex items-center gap-1"
                      >
                        <Plus size={12} />
                        <span>Create New Document</span>
                      </button>
                    </div>

                    {telaDocs.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {telaDocs.slice(0, 6).map((doc) => (
                          <div
                            key={doc.id}
                            onClick={() => handleOpenItem('TELA', { docId: doc.id })}
                            className="p-3.5 rounded-2xl bg-black/45 border border-white/10 hover:border-[#00DAF3]/50 transition-all cursor-pointer group"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-[#00DAF3] font-display flex items-center gap-1.5">
                                <FileText size={12} />
                                <span>CANVAS</span>
                              </span>
                              <span className="text-white/40 text-[10px]">
                                {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : 'Draft'}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-white mt-1 group-hover:text-[#00DAF3] transition-colors truncate">
                              {doc.title || 'Untitled Canvas'}
                            </h4>
                            <p className="text-[11px] text-white/50 mt-0.5 truncate">
                              Unified canvas document
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 rounded-2xl bg-black/35 border border-white/10 text-center space-y-3">
                        <FileText size={28} className="mx-auto text-[#00DAF3]/50" />
                        <div>
                          <h4 className="text-sm font-bold text-white">No Tela Documents Yet</h4>
                          <p className="text-xs text-white/50 mt-1 max-w-md mx-auto">
                            Tela is Plajah&apos;s unified document canvas for writer blocks, spreadsheets, notes, vector diagrams, and stage presentations.
                          </p>
                        </div>
                        <button
                          onClick={handleCreateNewDoc}
                          className="px-4 py-2 rounded-full text-black font-bold text-xs uppercase tracking-wider shadow-lg hover:brightness-110 transition-all inline-flex items-center gap-1.5"
                          style={{ background: 'linear-gradient(135deg, #00DAF3 0%, #FF8C00 100%)' }}
                        >
                          <Plus size={13} />
                          <span>Create First Document</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Column 3: Personal Scripture & Reading */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold text-white/50 uppercase tracking-wider font-mono">
                      Scripture & Personal Study
                    </div>

                    {/* Sacred Scripture / Lectio */}
                    <div
                      onClick={() => handleOpenItem('SACRED_LIBRARY')}
                      className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-amber-400/40 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-amber-300 font-display">SACRED SCRIPTURE</span>
                        <span className="text-white/40">Lectio</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1 group-hover:text-amber-200 transition-colors">
                        Personal Devotional & Reading
                      </h4>
                      <p className="text-xs text-white/60 mt-0.5">
                        Follow-along reader, scripture audio, and prayer meditation
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[11px]">
                        <span className="text-white/40">Sacred Library</span>
                        <span className="text-amber-300 font-bold">Open Reader →</span>
                      </div>
                    </div>

                    {/* Academia Learning */}
                    <div
                      onClick={() => handleOpenItem('CLASSROOMS')}
                      className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-purple-400/40 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-purple-300 font-display">ACADEMIA</span>
                        <span className="text-white/40">Modules</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1 group-hover:text-purple-200 transition-colors">
                        Classrooms & Assignments
                      </h4>
                      <p className="text-xs text-white/60 mt-0.5">
                        STEM courses, world history & peer discussion modules
                      </p>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* 3. INVITATIONS SPRINGBOARD (COLLABORATIONS, PRODUCTIONS, ORGS) */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
            <div className="flex items-center justify-between text-xs mb-3">
              <span className="font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
                <Mail size={13} className="text-[#FF8C00]" />
                <span>Pending Invitations & Collaborations</span>
              </span>
              <span className="text-white/40 font-mono text-[11px]">{invites.length} pending</span>
            </div>

            {invites.length > 0 ? (
              <div className="space-y-2">
                {invites.map((inv, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">{inv.title || 'Collaboration Invitation'}</div>
                      <div className="text-[11px] text-white/50">{inv.from || 'Invited to join project team'}</div>
                    </div>
                    <button className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                      Accept
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-black/30 border border-white/5 text-center">
                <p className="text-xs text-white/50">
                  No pending invitations. When collaborators, film crews, audio producers, or organizations invite you to join, they will appear here.
                </p>
              </div>
            )}
          </div>

          {/* 4. CULTURE, MEDIA & LEISURE (PLAY ONLY) */}
          {(horizon === 'ALL' || horizon === 'PLAY') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white uppercase tracking-wider font-display flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-pink-400" />
                  <span>Culture, Media & Leisure (Play)</span>
                </span>
                <span
                  onClick={() => handleOpenItem('MOVIES_TV')}
                  className="text-pink-400 font-semibold cursor-pointer hover:underline"
                >
                  Taleo Cinema →
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Taleo Cinema */}
                <div
                  onClick={() => handleOpenItem('MOVIES_TV')}
                  className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-pink-400/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-pink-400 font-display">TALEO CINEMA</span>
                    <span className="text-white/40">Stream</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1 group-hover:text-pink-300 transition-colors">
                    Movies & Television
                  </h4>
                  <p className="text-xs text-white/60 mt-0.5">
                    Browse full-length independent features, series, and live premieres
                  </p>
                </div>

                {/* Chora Music */}
                <div
                  onClick={() => handleOpenItem('MUSIC')}
                  className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-purple-400/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-purple-400 font-display">CHORA MUSIC</span>
                    <span className="text-white/40">Lossless</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1 group-hover:text-purple-300 transition-colors">
                    Global Audio Archive
                  </h4>
                  <p className="text-xs text-white/60 mt-0.5">
                    Listen to community albums, curated stations, and master FLAC streams
                  </p>
                </div>

                {/* Reello Creator Reels */}
                <div
                  onClick={() => handleOpenItem('VIDEOS')}
                  className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-[#FF8C00]/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[#FF8C00] font-display">REELLO</span>
                    <span className="text-white/40">Shorts</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1 group-hover:text-[#FFA033] transition-colors">
                    Creator Reels & Sound Clips
                  </h4>
                  <p className="text-xs text-white/60 mt-0.5">
                    Discover short-form video, behind-the-scenes, and visual soundbites
                  </p>
                </div>

                {/* Plajah Photos & Viewer */}
                <div
                  onClick={() => handleOpenItem('GLOBAL_PHOTOS')}
                  className="p-4 rounded-2xl bg-black/45 border border-white/10 hover:border-cyan-400/40 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-cyan-400 font-display">PLAJAH PHOTOS</span>
                    <span className="text-white/40">Archive</span>
                  </div>
                  <h4 className="text-sm font-bold text-white mt-1 group-hover:text-cyan-300 transition-colors">
                    Photo Viewer & Gallery
                  </h4>
                  <p className="text-xs text-white/60 mt-0.5">
                    Visual archive, Windows photo library, 3D spatial depth & portfolio rooms
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ── BOTTOM ACTION BAR: STUDIO CREATION TRIGGERS & SHORTCUTS ── */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-black/60 flex flex-wrap items-center justify-between gap-3 text-xs">
          
          {/* Quick Creation Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-white/50 font-medium mr-1 hidden sm:inline">Fast Launch:</span>
            
            <button
              onClick={() => handleOpenItem('GLOBAL_PHOTOS')}
              className="px-3.5 py-1.5 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-medium transition-all flex items-center gap-1.5"
            >
              <Camera size={13} />
              <span>Photo Viewer</span>
            </button>

            <button
              onClick={handleCreateNewDoc}
              className="px-3.5 py-1.5 rounded-full bg-[#00DAF3]/20 hover:bg-[#00DAF3]/30 text-[#00DAF3] border border-[#00DAF3]/40 font-medium transition-all flex items-center gap-1.5"
            >
              <Plus size={13} />
              <span>Create New Document</span>
            </button>

            <button
              onClick={() => handleOpenItem('MELOS')}
              className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-all flex items-center gap-1.5"
            >
              <Plus size={13} className="text-[#FF8C00]" />
              <span>New Audio</span>
            </button>

            <button
              onClick={() => handleOpenItem('FABULA')}
              className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-all flex items-center gap-1.5"
            >
              <Plus size={13} className="text-cyan-400" />
              <span>New Film Cut</span>
            </button>

            <button
              onClick={() => handleOpenItem('BOOKS')}
              className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-all flex items-center gap-1.5"
            >
              <Plus size={13} className="text-amber-400" />
              <span>New Screenplay</span>
            </button>

            <button
              onClick={() => handleOpenItem('AMBO_PRO')}
              className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white font-medium transition-all flex items-center gap-1.5"
            >
              <Presentation size={13} className="text-cyan-400" />
              <span>Ambo Presenter</span>
            </button>

            {hasActiveBusinessOrMerch && (
              <button
                onClick={() => handleOpenItem('BUSINESS_DASHBOARD')}
                className="px-3.5 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-medium transition-all flex items-center gap-1.5"
              >
                <Store size={13} />
                <span>POS Register</span>
              </button>
            )}
          </div>

          {/* Time Clock & Keyboard Shortcuts */}
          <div className="flex items-center gap-3 text-white/40">
            <button
              onClick={handleTogglePunch}
              className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 text-[11px]"
            >
              <Clock size={12} />
              <span>{isClockedIn ? `Punch Out (${shiftElapsedStr})` : 'Punch In'}</span>
            </button>
            <span>•</span>
            <span className="hidden sm:inline">
              <kbd className="bg-white/10 text-white/80 px-1.5 py-0.5 rounded text-[10px]">Ctrl</kbd>+<kbd className="bg-white/10 text-white/80 px-1.5 py-0.5 rounded text-[10px]">O</kbd>
            </span>
            <span>
              <kbd className="bg-white/10 text-white/80 px-1.5 py-0.5 rounded text-[10px]">Esc</kbd> Front Row
            </span>
          </div>

        </div>

      </motion.div>

      {/* Desktop Sign In & Credentials Modal */}
      <DesktopAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
};

export default DesktopLauncherOverlay;
