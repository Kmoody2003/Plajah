/**
 * ChallengeVsScreen
 *
 * Full-screen UFC/Mortal Kombat–style fight card that fires when someone
 * challenges your post. Triggered by:
 *   - Scrolling past a challenged post in the feed
 *   - Clicking a DEBATE_CHALLENGE notification
 *
 * Dispatch globally: window.dispatchEvent(new CustomEvent('CHALLENGE_VS', { detail: { debateId } }))
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import {
  Swords, Trophy, Star, Users, BookOpen, Music, Video,
  FileText, Award, Zap, Shield, ChevronRight, X,
} from 'lucide-react';
import { auth, fetchUserProfile, fetchUserAlbums } from '../services/backendService';
import { acceptDebate, declineDebate, getDebateStats, type DebateStats } from '../services/debateService';
import { UserProfile, Album, Debate } from '../types';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../services/backendService';

// ─── Bio parsing ──────────────────────────────────────────────────────────────

const DEGREE_RE = /\b(Ph\.?D\.?|M\.?D\.?|J\.?D\.?|M\.?B\.?A\.?|M\.?S\.?|B\.?S\.?|B\.?A\.?|M\.?A\.?|D\.?O\.?|D\.?D\.?S\.?|Pharm\.?D\.?|Ed\.?D\.?)\b/gi;
const TITLE_RE  = /\b(CEO|CTO|CFO|COO|Director|Founder|Co-?Founder|Engineer|Developer|Doctor|Professor|Professor|Scientist|Author|Writer|Artist|Musician|Producer|Lawyer|Attorney|Consultant)\b/gi;

function extractBioHighlights(bio?: string): string[] {
  if (!bio) return [];
  const found: string[] = [];

  // Degrees
  const degrees = [...bio.matchAll(DEGREE_RE)].map(m => m[0]);
  if (degrees.length) found.push(degrees.slice(0, 2).join(' · '));

  // Professional titles
  const titles = [...bio.matchAll(TITLE_RE)].map(m => m[0]);
  if (titles.length) found.push(titles.slice(0, 2).join(' · '));

  // First meaningful sentence as a life blurb
  const first = bio.split(/[.!?\n]/)[0].trim();
  if (first.length > 12 && first.length < 90 && !found.some(f => first.includes(f))) {
    found.push(first);
  }

  return found.slice(0, 3);
}

function fmtNum(n?: number): string {
  if (!n) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function tierLabel(profile?: UserProfile | null): string {
  if (profile?.isPioneer) return 'PIONEER';
  if (profile?.tier === 'ELITE') return 'ELITE';
  if (profile?.tier === 'PRO') return 'PRO';
  if (profile?.accountType) return profile.accountType;
  return 'MEMBER';
}

function accountTitle(profile?: UserProfile | null): string {
  const t = profile?.accountType;
  if (!t) return 'Community Member';
  return t[0] + t.slice(1).toLowerCase();
}

function debateRecord(stats: DebateStats): string {
  return `${stats.wins}W · ${stats.losses}L${stats.draws > 0 ? ` · ${stats.draws}D` : ''}`;
}

// ─── Fighter card data ─────────────────────────────────────────────────────────

interface FighterData {
  uid: string;
  name: string;
  photo: string;
  profile: UserProfile | null;
  albums: Album[];
  stats: DebateStats;
}

async function loadFighter(uid: string, name: string, photo: string): Promise<FighterData> {
  const [profile, albums, stats] = await Promise.all([
    fetchUserProfile(uid).catch(() => null),
    fetchUserAlbums(uid).catch(() => [] as Album[]),
    getDebateStats(uid).catch(() => ({ wins: 0, losses: 0, draws: 0, total: 0 })),
  ]);
  return { uid, name: profile?.displayName || name, photo: profile?.photoURL || photo, profile, albums, stats };
}

// ─── Stat rows ────────────────────────────────────────────────────────────────

interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
  delay: number;
  flip?: boolean;
}

const StatRow: React.FC<StatRowProps> = ({ icon, label, value, accent, delay, flip }) => (
  <motion.div
    initial={{ opacity: 0, x: flip ? 40 : -40 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    className={`flex items-center gap-2 ${flip ? 'flex-row-reverse text-right' : ''}`}
  >
    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
      {icon}
    </div>
    <div className={`min-w-0 ${flip ? 'items-end' : 'items-start'} flex flex-col`}>
      <p className="text-[8px] font-black uppercase tracking-[0.18em] text-white/30 leading-none">{label}</p>
      <p className="text-[13px] font-black text-white leading-tight">{value}</p>
    </div>
  </motion.div>
);

// ─── Fighter panel ────────────────────────────────────────────────────────────

interface FighterPanelProps {
  fighter: FighterData;
  side: 'left' | 'right';
  isYou: boolean;
}

const FighterPanel: React.FC<FighterPanelProps> = ({ fighter, side, isYou }) => {
  const flip    = side === 'right';
  const isRed   = side === 'left';
  const accent  = isRed ? 'bg-red-500/20 text-red-400'  : 'bg-emerald-500/20 text-emerald-400';
  const glow    = isRed ? '#ef4444' : '#10b981';
  const border  = isRed ? 'border-red-500/40' : 'border-emerald-500/40';
  const textCol = isRed ? 'text-red-400' : 'text-emerald-400';
  const highlights = extractBioHighlights(fighter.profile?.bio);

  const musicAlbums  = fighter.albums.filter(a => a.type === 'MUSIC').length;
  const videoAlbums  = fighter.albums.filter(a => a.type === 'VIDEO').length;
  const bookAlbums   = fighter.albums.filter(a => a.type === 'BOOK').length;
  const articleCount = fighter.profile?.articles?.length ?? 0;
  const totalContent = musicAlbums + videoAlbums + bookAlbums + articleCount;

  const contentParts: string[] = [];
  if (musicAlbums)  contentParts.push(`${musicAlbums} ${musicAlbums === 1 ? 'Album' : 'Albums'}`);
  if (videoAlbums)  contentParts.push(`${videoAlbums} Video`);
  if (bookAlbums)   contentParts.push(`${bookAlbums} ${bookAlbums === 1 ? 'Book' : 'Books'}`);
  if (articleCount) contentParts.push(`${articleCount} ${articleCount === 1 ? 'Article' : 'Articles'}`);
  const contentStr = totalContent > 0 ? contentParts.join(' · ') : 'Building';

  return (
    <div className={`flex flex-col ${flip ? 'items-end' : 'items-start'} gap-4 flex-1`}>
      {/* Fighter portrait */}
      <motion.div
        initial={{ x: flip ? 300 : -300, opacity: 0, scale: 0.8 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 22, delay: 0.3 }}
        className={`relative ${flip ? 'self-end' : 'self-start'}`}
      >
        {/* Glow aura */}
        <div
          className="absolute inset-0 rounded-3xl blur-2xl opacity-40"
          style={{ background: glow, transform: 'scale(1.15)' }}
        />

        {/* Photo */}
        <div
          className={`relative w-36 h-44 sm:w-44 sm:h-56 rounded-3xl overflow-hidden border-2 ${border}`}
          style={{ transform: flip ? 'skewX(3deg)' : 'skewX(-3deg)' }}
        >
          <img
            src={fighter.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${fighter.uid}`}
            alt={fighter.name}
            className="w-full h-full object-cover object-top"
          />
          {/* Bottom gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* Name overlay at bottom */}
          <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
            <p className={`text-xs font-black uppercase tracking-[0.12em] ${textCol} leading-none`}>
              {isYou ? 'YOU' : accountTitle(fighter.profile)}
            </p>
            <p className="text-white font-black text-sm leading-tight truncate">
              {fighter.name.split(' ')[0].toUpperCase()}
            </p>
          </div>
        </div>

        {/* Tier badge */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.85, type: 'spring', stiffness: 400, damping: 15 }}
          className={`absolute -top-3 ${flip ? '-left-3' : '-right-3'} px-2 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest ${
            isRed ? 'bg-red-500 text-white' : 'bg-emerald-500 text-white'
          }`}
        >
          {tierLabel(fighter.profile)}
        </motion.div>
      </motion.div>

      {/* Full name + handle */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.65, duration: 0.4 }}
        className={flip ? 'text-right' : 'text-left'}
      >
        <p className="text-white font-black text-xl sm:text-2xl leading-tight uppercase tracking-wide">
          {fighter.name}
        </p>
        <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${textCol} mt-0.5`}>
          {isYou ? 'Defender' : 'Challenger'}
        </p>
      </motion.div>

      {/* Stats grid */}
      <div className="w-full space-y-2.5">
        <StatRow delay={0.7}  icon={<Swords size={13} />}   label="Debate Record" value={debateRecord(fighter.stats)}              accent={accent} flip={flip} />
        <StatRow delay={0.78} icon={<Zap size={13} />}      label="Platform Points" value={`${fmtNum(fighter.profile?.totalPoints)} pts`} accent={accent} flip={flip} />
        <StatRow delay={0.86} icon={<Users size={13} />}    label="Followers"      value={fmtNum(fighter.profile?.followerCount)}   accent={accent} flip={flip} />
        <StatRow delay={0.94} icon={<Star size={13} />}     label="Content"        value={contentStr}                               accent={accent} flip={flip} />
        {highlights[0] && (
          <StatRow delay={1.02} icon={<Award size={13} />}  label="Accolades"      value={highlights[0]}                           accent={accent} flip={flip} />
        )}
        {highlights[1] && (
          <StatRow delay={1.08} icon={<Shield size={13} />} label="Background"     value={highlights[1]}                           accent={accent} flip={flip} />
        )}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

export interface ChallengeVsScreenProps {
  debateId: string;
  challengerId: string;
  challengerName: string;
  challengerPhoto: string;
  onDismiss: () => void;
}

const ChallengeVsScreen: React.FC<ChallengeVsScreenProps> = ({
  debateId,
  challengerId,
  challengerName,
  challengerPhoto,
  onDismiss,
}) => {
  const uid = auth.currentUser?.uid ?? '';
  const myName  = auth.currentUser?.displayName ?? 'You';
  const myPhoto = auth.currentUser?.photoURL ?? '';

  const [challenger, setChallenger] = useState<FighterData | null>(null);
  const [defender,   setDefender]   = useState<FighterData | null>(null);
  const [phase,      setPhase]      = useState<'loading' | 'entering' | 'ready' | 'accepted' | 'declined'>('loading');
  const [flashActive, setFlash]     = useState(false);
  const controls = useAnimation();

  // Load both fighters
  useEffect(() => {
    Promise.all([
      loadFighter(challengerId, challengerName, challengerPhoto),
      loadFighter(uid, myName, myPhoto),
    ]).then(([c, d]) => {
      setChallenger(c);
      setDefender(d);
      setPhase('entering');

      // Flash effect then shake
      setTimeout(() => {
        setFlash(true);
        setTimeout(() => setFlash(false), 120);
      }, 350);

      setTimeout(() => {
        controls.start({
          x: [0, -6, 6, -4, 4, -2, 2, 0],
          transition: { duration: 0.45 },
        });
      }, 900);

      setTimeout(() => setPhase('ready'), 800);
    });
  }, []);

  const handleAccept = useCallback(async () => {
    setPhase('accepted');
    await acceptDebate(debateId);
    setTimeout(onDismiss, 1200);
  }, [debateId, onDismiss]);

  const handleDecline = useCallback(async () => {
    setPhase('declined');
    await declineDebate(debateId);
    setTimeout(onDismiss, 1000);
  }, [debateId, onDismiss]);

  if (!challenger && !defender && phase === 'loading') {
    return (
      <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500/40 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        key="vs-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, scale: 1.05 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[9999] overflow-hidden"
        style={{ fontFamily: "'Arial Black', Impact, sans-serif" }}
      >
        {/* Screen flash overlay */}
        <AnimatePresence>
          {flashActive && (
            <motion.div
              initial={{ opacity: 0.9 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-white z-50 pointer-events-none"
            />
          )}
        </AnimatePresence>

        {/* Background — split red / black / green */}
        <div className="absolute inset-0">
          {/* Left red half */}
          <div
            className="absolute inset-y-0 left-0 w-1/2"
            style={{
              background: 'radial-gradient(ellipse at 30% 50%, #3d0808 0%, #1a0303 40%, #0a0000 100%)',
            }}
          />
          {/* Right green half */}
          <div
            className="absolute inset-y-0 right-0 w-1/2"
            style={{
              background: 'radial-gradient(ellipse at 70% 50%, #042810 0%, #021508 40%, #000500 100%)',
            }}
          />
          {/* Center black divider */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-32 bg-black" style={{ maskImage: 'linear-gradient(to right, transparent, black 40%, black 60%, transparent)' }} />

          {/* Scan line texture */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
            }}
          />

          {/* Diagonal slash divider */}
          <div
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-1 bg-gradient-to-b from-transparent via-white/20 to-transparent"
            style={{ transform: 'translateX(-50%) skewX(-8deg)' }}
          />
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 z-50 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
        >
          <X size={16} className="text-white/60" />
        </button>

        {/* CHALLENGED label */}
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 25 }}
          className="absolute top-0 left-0 right-0 flex justify-center pt-5 z-10"
        >
          <div className="flex items-center gap-3 px-6 py-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <p className="text-[9px] font-black uppercase tracking-[0.35em] text-white/70">
              Structured Debate Challenge
            </p>
            <Swords size={11} className="text-orange-400" />
          </div>
        </motion.div>

        {/* Main fight card */}
        <motion.div
          animate={controls}
          className="absolute inset-0 flex items-center justify-center px-4 sm:px-8 pt-16 pb-32"
        >
          <div className="w-full max-w-3xl flex items-start justify-between gap-4 sm:gap-8">
            {/* Challenger */}
            {challenger && (
              <FighterPanel fighter={challenger} side="left" isYou={false} />
            )}

            {/* VS center */}
            <div className="flex flex-col items-center justify-center shrink-0 gap-3 -mt-4">
              <motion.div
                initial={{ scale: 0, rotate: -25, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ delay: 0.9, type: 'spring', stiffness: 450, damping: 14 }}
                className="relative"
              >
                {/* VS glow ring */}
                <div className="absolute inset-0 rounded-full blur-xl opacity-60" style={{ background: 'radial-gradient(circle, #f97316 0%, transparent 70%)' }} />
                <div className="relative text-4xl sm:text-6xl font-black text-white leading-none"
                  style={{
                    textShadow: '0 0 30px #f97316, 0 0 60px #f97316aa, 2px 2px 0 #7c2d12',
                    letterSpacing: '-0.02em',
                  }}
                >
                  VS
                </div>
              </motion.div>

              {/* Swords icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.1, type: 'spring', stiffness: 400, damping: 15 }}
              >
                <Swords size={20} className="text-orange-400/60" />
              </motion.div>

              {/* Points at stake */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                className="text-center"
              >
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">At stake</p>
                <p className="text-xs font-black text-orange-400">100 pts</p>
              </motion.div>
            </div>

            {/* Defender (you) */}
            {defender && (
              <FighterPanel fighter={defender} side="right" isYou={true} />
            )}
          </div>
        </motion.div>

        {/* Bottom action bar */}
        <div className="absolute bottom-0 left-0 right-0 pb-safe">
          <div className="px-6 pb-8 pt-4">
            {/* Topic pill */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="text-center mb-4"
            >
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">The Challenge</p>
              <p className="text-xs text-white/60 font-medium leading-relaxed max-w-sm mx-auto line-clamp-2">
                {challengerName} has challenged your post to a structured debate
              </p>
            </motion.div>

            {/* Accept / Decline */}
            <AnimatePresence mode="wait">
              {phase === 'ready' && (
                <motion.div
                  key="buttons"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 20 }}
                  transition={{ delay: 1.3, type: 'spring', stiffness: 300, damping: 25 }}
                  className="flex items-center gap-3 max-w-sm mx-auto"
                >
                  <button
                    onClick={handleDecline}
                    className="flex-1 py-4 rounded-2xl bg-white/5 border border-white/10 text-white/50 text-xs font-black uppercase tracking-[0.15em] hover:bg-white/10 hover:text-white/80 transition-all active:scale-95"
                  >
                    Decline
                  </button>

                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleAccept}
                    className="flex-[2] py-4 rounded-2xl bg-orange-500 text-black text-sm font-black uppercase tracking-[0.15em] flex items-center justify-center gap-2 shadow-lg shadow-orange-500/30 hover:bg-orange-400 transition-all active:scale-95"
                    style={{ textShadow: 'none' }}
                  >
                    <Swords size={16} />
                    Accept Challenge
                    <ChevronRight size={16} />
                  </motion.button>
                </motion.div>
              )}

              {phase === 'accepted' && (
                <motion.div
                  key="accepted"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <p className="text-2xl font-black text-orange-400 uppercase tracking-widest"
                    style={{ textShadow: '0 0 20px #f97316' }}>
                    CHALLENGE ACCEPTED
                  </p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">24h clock starts now</p>
                </motion.div>
              )}

              {phase === 'declined' && (
                <motion.div
                  key="declined"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <p className="text-sm font-black text-white/40 uppercase tracking-widest">Challenge Declined</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 6h acceptance window note */}
            {phase === 'ready' && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6 }}
                className="text-center text-[8px] text-white/20 mt-3 uppercase tracking-widest"
              >
                6 hours to respond · Aria judges after 24 hours
              </motion.p>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ChallengeVsScreen;

// ─── Global event controller ──────────────────────────────────────────────────
// Drop <ChallengeVsController /> once anywhere in the app tree (done in App.tsx).

interface VSEvent {
  debateId: string;
  challengerId: string;
  challengerName: string;
  challengerPhoto: string;
}

export const ChallengeVsController: React.FC<{ onDebateAccepted?: (id: string) => void }> = ({ onDebateAccepted }) => {
  const [active, setActive] = useState<VSEvent | null>(null);
  const shown = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<VSEvent>).detail;
      if (!detail?.debateId) return;
      // Show only once per session per debate
      if (shown.current.has(detail.debateId)) return;
      shown.current.add(detail.debateId);
      setActive(detail);
    };
    window.addEventListener('CHALLENGE_VS', handler);
    return () => window.removeEventListener('CHALLENGE_VS', handler);
  }, []);

  if (!active) return null;

  return (
    <ChallengeVsScreen
      debateId={active.debateId}
      challengerId={active.challengerId}
      challengerName={active.challengerName}
      challengerPhoto={active.challengerPhoto}
      onDismiss={() => {
        setActive(null);
      }}
    />
  );
};
