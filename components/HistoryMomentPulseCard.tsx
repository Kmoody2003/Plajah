/**
 * HistoryMomentPulseCard
 *
 * A compact, self-contained "Platform Pulse" card that surfaces a user-specific
 * history moment anywhere on the platform.  The figure shown is seeded from the
 * viewer's UID so every user gets a different person each day.  An internal timer
 * auto-rotates to the next figure (offset+1, offset+2…) every ~10 s, creating
 * the feeling of a live history broadcast rather than a static card.
 *
 * Sizes:
 *   "sidebar"  – narrow right-column card (used in Chora, Taleo sidebars)
 *   "feed"     – wider card injected between feed posts
 *   "profile"  – medium card inside the Profile Smart Card Pulse panel
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, ChevronRight, Sparkles, Music2, Film } from 'lucide-react';
import { getUserDailyFigure, HistoryFigure } from '../services/historyData';

interface Props {
  uid?: string | null;
  /** Which figure pool to pull from. 'MIX' alternates music/film on each rotation. */
  category?: 'MUSIC' | 'FILM_TV' | 'MIX';
  size?: 'sidebar' | 'feed' | 'profile';
  /** Called when the user taps "See More" — navigate to the full history view */
  onNavigate?: (view: 'CHORA_HISTORY' | 'TALEO_HISTORY') => void;
  /** How many seconds between auto-rotations (default 10) */
  rotationIntervalSeconds?: number;
  /** Starting offset — lets feed injections at different positions start on different figures */
  startOffset?: number;
  className?: string;
}

const ERA_COLORS: Record<string, { border: string; badge: string; glow: string }> = {
  Baroque:    { border: 'border-purple-500/30', badge: 'bg-purple-900/60 text-purple-300', glow: 'rgba(139,92,246,0.15)' },
  Classical:  { border: 'border-blue-500/30',   badge: 'bg-blue-900/60 text-blue-300',   glow: 'rgba(59,130,246,0.15)' },
  Romantic:   { border: 'border-amber-500/30',  badge: 'bg-amber-900/60 text-amber-300', glow: 'rgba(245,158,11,0.15)' },
  Impressionist:{ border:'border-cyan-500/30',  badge: 'bg-cyan-900/60 text-cyan-300',   glow: 'rgba(6,182,212,0.15)'  },
  Modern:     { border: 'border-emerald-500/30',badge: 'bg-emerald-900/60 text-emerald-300',glow:'rgba(16,185,129,0.15)'},
  Jazz:       { border: 'border-yellow-500/30', badge: 'bg-yellow-900/60 text-yellow-300',glow: 'rgba(234,179,8,0.15)' },
  Blues:      { border: 'border-indigo-500/30', badge: 'bg-indigo-900/60 text-indigo-300',glow: 'rgba(99,102,241,0.15)'},
  Ragtime:    { border: 'border-orange-500/30', badge: 'bg-orange-900/60 text-orange-300',glow: 'rgba(249,115,22,0.15)'},
  Silent:     { border: 'border-slate-400/30',  badge: 'bg-slate-800/60 text-slate-300',  glow: 'rgba(148,163,184,0.1)'},
  Golden:     { border: 'border-yellow-400/30', badge: 'bg-yellow-900/60 text-yellow-300',glow: 'rgba(250,204,21,0.15)'},
};
const DEFAULT_ERA = { border: 'border-violet-500/30', badge: 'bg-violet-900/60 text-violet-300', glow: 'rgba(124,58,237,0.15)' };

function eraStyle(era: string) {
  for (const key of Object.keys(ERA_COLORS)) {
    if (era.includes(key)) return ERA_COLORS[key];
  }
  return DEFAULT_ERA;
}

function bioSnippet(bio: string, maxLen = 120): string {
  if (bio.length <= maxLen) return bio;
  return bio.slice(0, bio.lastIndexOf(' ', maxLen)) + '…';
}

function resolveCategory(
  cat: 'MUSIC' | 'FILM_TV' | 'MIX',
  offset: number,
  uid?: string | null,
): 'MUSIC' | 'FILM_TV' {
  if (cat !== 'MIX') return cat;
  // Alternate music/film; flip based on uid parity so each user starts on a different type
  const flip = uid ? uid.charCodeAt(0) % 2 === 0 : true;
  return (offset % 2 === 0) === flip ? 'MUSIC' : 'FILM_TV';
}

// ── Component ──────────────────────────────────────────────────────────────────
const HistoryMomentPulseCard: React.FC<Props> = ({
  uid,
  category = 'MIX',
  size = 'sidebar',
  onNavigate,
  rotationIntervalSeconds = 10,
  startOffset = 0,
  className = '',
}) => {
  const [offset, setOffset] = useState(startOffset);
  const [prevOffset, setPrevOffset] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-rotate
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setOffset(o => {
        setPrevOffset(o);
        return o + 1;
      });
    }, rotationIntervalSeconds * 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [rotationIntervalSeconds]);

  const resolvedCat = resolveCategory(category, offset, uid);
  const figure = getUserDailyFigure(uid, resolvedCat, offset);
  const era = eraStyle(figure.era);
  const destView: 'CHORA_HISTORY' | 'TALEO_HISTORY' = resolvedCat === 'MUSIC' ? 'CHORA_HISTORY' : 'TALEO_HISTORY';

  if (size === 'sidebar') {
    return (
      <div className={`relative rounded-[1.75rem] overflow-hidden ${era.border} border ${className}`}
        style={{ boxShadow: `0 0 28px ${era.glow}` }}>
        {/* Blurred portrait bg */}
        {figure.imageUrl && (
          <div className="absolute inset-0">
            <img src={figure.imageUrl} alt="" className="w-full h-full object-cover object-top"
              style={{ filter: 'blur(20px) brightness(0.2) saturate(2)' }} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-black/70" />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={`${offset}-${figure.id || figure.name}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative p-4"
          >
            {/* Pulse header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-small-orange animate-pulse shrink-0" />
              <span className="text-[8px] font-black uppercase tracking-[0.35em] text-small-orange">Platform Pulse · History</span>
              <span className="ml-auto text-[8px] text-white/20 font-black">
                {resolvedCat === 'MUSIC' ? <Music2 size={9} /> : <Film size={9} />}
              </span>
            </div>

            {/* Portrait + info */}
            <div className="flex gap-3">
              <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-white/5 border border-white/10">
                {figure.imageUrl
                  ? <img src={figure.imageUrl} alt={figure.name} className="w-full h-full object-cover object-top" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <div className="w-full h-full flex items-center justify-center text-white/20 text-xl">
                      {resolvedCat === 'MUSIC' ? '🎵' : '🎬'}
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black text-white leading-tight truncate">{figure.name}</h4>
                <p className="text-[9px] text-white/50 truncate">{figure.subcategory}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Clock size={8} className="text-white/25" />
                  <span className="text-[8px] text-white/25 font-bold">{figure.lifespan}</span>
                </div>
              </div>
            </div>

            {/* Era badge */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${era.badge}`}>{figure.era}</span>
              {onNavigate && (
                <button
                  onClick={() => onNavigate(destView)}
                  className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
                >
                  More <ChevronRight size={9} />
                </button>
              )}
            </div>

            {/* Bio snippet */}
            <p className="text-[9px] text-white/45 leading-relaxed mt-2 line-clamp-3">
              {bioSnippet(figure.bio, 130)}
            </p>

            {/* Rotation dots */}
            <div className="flex gap-1 mt-3 justify-center">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === offset % 4 ? 'w-4 bg-small-orange' : 'w-1 bg-white/15'}`} />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  if (size === 'feed') {
    return (
      <div className={`relative rounded-[2rem] overflow-hidden ${era.border} border ${className}`}
        style={{ boxShadow: `0 0 40px ${era.glow}` }}>
        {figure.imageUrl && (
          <div className="absolute inset-0">
            <img src={figure.imageUrl} alt="" className="w-full h-full object-cover object-top"
              style={{ filter: 'blur(28px) brightness(0.18) saturate(2.5)' }} />
            <div className="absolute inset-0 bg-gradient-to-br from-black/30 via-transparent to-black/70" />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={`${offset}-${figure.id || figure.name}`}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative p-5"
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-1.5 rounded-full bg-small-orange animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-[0.35em] text-small-orange">Platform Pulse · History</span>
              <span className={`ml-auto px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${era.badge}`}>
                {resolvedCat === 'MUSIC' ? '🎵 Music' : '🎬 Cinema'}
              </span>
            </div>

            {/* Two-column layout */}
            <div className="flex gap-4 items-start">
              <div className="shrink-0 w-20 h-24 rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-2xl">
                {figure.imageUrl
                  ? <img src={figure.imageUrl} alt={figure.name} className="w-full h-full object-cover object-top"
                      onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <div className="w-full h-full flex items-center justify-center text-3xl opacity-30">
                      {resolvedCat === 'MUSIC' ? '🎵' : '🎬'}
                    </div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-black text-white leading-tight">{figure.name}</h3>
                <p className="text-[10px] text-white/50 font-bold">{figure.subcategory} · {figure.nationality}</p>
                <div className="flex items-center gap-1.5 mt-1 mb-3">
                  <Clock size={9} className="text-white/25" />
                  <span className="text-[9px] text-white/30 font-bold">{figure.lifespan}</span>
                </div>
                <p className="text-xs text-white/60 leading-relaxed">{bioSnippet(figure.bio, 160)}</p>
              </div>
            </div>

            {/* Key works strip */}
            {figure.keyWorks && figure.keyWorks.length > 0 && (
              <div className="flex gap-2 mt-4 overflow-x-auto no-scrollbar">
                {figure.keyWorks.slice(0, 3).map((w, i) => (
                  <div key={i} className="shrink-0 px-2 py-1 bg-white/5 border border-white/10 rounded-lg">
                    <p className="text-[8px] font-black text-white/60 whitespace-nowrap">{w.title}</p>
                    <p className="text-[7px] text-white/25">{w.year}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Footer row */}
            <div className="flex items-center justify-between mt-4">
              <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${era.badge}`}>{figure.era}</span>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === offset % 4 ? 'w-4 bg-small-orange' : 'w-1 bg-white/15'}`} />
                  ))}
                </div>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate(destView)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[8px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-all"
                  >
                    <Sparkles size={9} /> Full Story
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // size === 'profile'
  return (
    <div className={`relative rounded-[1.5rem] overflow-hidden ${era.border} border ${className}`}
      style={{ boxShadow: `0 0 24px ${era.glow}` }}>
      {figure.imageUrl && (
        <div className="absolute inset-0">
          <img src={figure.imageUrl} alt="" className="w-full h-full object-cover object-top"
            style={{ filter: 'blur(16px) brightness(0.15) saturate(2)' }} />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${offset}-${figure.id || figure.name}`}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative p-4 flex gap-3"
        >
          <div className="shrink-0 w-12 h-14 rounded-lg overflow-hidden bg-white/5 border border-white/10">
            {figure.imageUrl
              ? <img src={figure.imageUrl} alt={figure.name} className="w-full h-full object-cover object-top"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              : <div className="w-full h-full flex items-center justify-center text-lg opacity-20">
                  {resolvedCat === 'MUSIC' ? '🎵' : '🎬'}
                </div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1 mb-0.5">
              <h4 className="text-sm font-black text-white leading-tight truncate">{figure.name}</h4>
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[6px] font-black uppercase tracking-widest ${era.badge}`}>{figure.era}</span>
            </div>
            <p className="text-[9px] text-white/40 truncate">{figure.subcategory} · {figure.lifespan}</p>
            <p className="text-[9px] text-white/55 leading-snug mt-1 line-clamp-2">{bioSnippet(figure.bio, 90)}</p>
            {onNavigate && (
              <button
                onClick={() => onNavigate(destView)}
                className="mt-2 flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-small-orange/80 hover:text-small-orange transition-colors"
              >
                Read More <ChevronRight size={9} />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default HistoryMomentPulseCard;
