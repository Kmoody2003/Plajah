import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Users, Volume2, PartyPopper, ChevronRight } from 'lucide-react';
import { parseVictories, congratsFor, victoryHeadline, Victory } from '../services/worldCupVictory';
import { fetchWorldCupWindow } from '../services/sportsService';

const SEEN_KEY = 'plajah_wc_seen_wins_v1';

const loadSeen = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); }
};
const saveSeen = (s: Set<string>) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch { /* */ } };

/** Lightweight confetti — colored pieces falling, tinted to the winner's colors + gold. */
const Confetti: React.FC<{ colors: string[] }> = ({ colors }) => {
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: (i % 10) * 0.15,
    dur: 2.4 + (i % 5) * 0.5,
    color: colors[i % colors.length],
    size: 6 + (i % 4) * 2,
    rot: (i * 53) % 360,
  })), [colors]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          initial={{ y: -40, opacity: 0, rotate: p.rot }}
          animate={{ y: '110%', opacity: [0, 1, 1, 0.8], rotate: p.rot + 360 }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'linear' }}
          style={{ position: 'absolute', left: `${p.left}%`, width: p.size, height: p.size * 1.6, background: p.color, borderRadius: 1 }}
        />
      ))}
    </div>
  );
};

interface Props {
  onOpenFanRoom?: (matchId: string, event: any) => void;
}

const WorldCupVictory: React.FC<Props> = ({ onOpenFanRoom }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => loadSeen());
  const [celebrating, setCelebrating] = useState<Victory | null>(null); // full-screen takeover
  const [heroDismissed, setHeroDismissed] = useState(false);
  const prevStates = useRef<Record<string, string>>({});

  // Self-poll the World Cup window so victories are caught the moment they happen.
  useEffect(() => {
    let alive = true;
    const load = () => fetchWorldCupWindow().then(ev => { if (alive) setEvents(ev || []); }).catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const victories = useMemo(() => parseVictories(events), [events]);
  const unseen = useMemo(() => victories.filter(v => !seen.has(v.id)), [victories, seen]);

  // Detect a win that just happened THIS session (was live last poll → now final) and take over.
  useEffect(() => {
    for (const ev of events || []) {
      const id = String(ev?.id);
      const state = ev?.status?.type?.state;
      const was = prevStates.current[id];
      if (was === 'in' && state === 'post') {
        const v = victories.find(x => x.id === id);
        if (v && !seen.has(id)) { setCelebrating(v); break; }
      }
    }
    const next: Record<string, string> = {};
    for (const ev of events || []) next[String(ev?.id)] = ev?.status?.type?.state;
    prevStates.current = next;
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close the full-screen takeover after a beat.
  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(null), 14000);
    return () => clearTimeout(t);
  }, [celebrating]);

  const acknowledge = (ids: string[]) => {
    setSeen(prev => { const n = new Set(prev); ids.forEach(i => n.add(i)); saveSeen(n); return n; });
  };
  const dismissHero = () => { acknowledge(unseen.map(v => v.id)); setHeroDismissed(true); };
  const closeTakeover = () => { if (celebrating) acknowledge([celebrating.id]); setCelebrating(null); };

  const colorsFor = (v: Victory) => [v.winnerWc?.primaryColor || '#39B54A', v.winnerWc?.secondaryColor || '#FFD100', '#FFB514', '#ffffff'];

  const latest = unseen[0];
  const showHero = !!latest && !heroDismissed;

  return (
    <>
      {/* ── Dominant victory hero (wins you haven't acknowledged) ─────────────── */}
      <AnimatePresence>
        {showHero && latest && (
          <motion.div
            initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
            className="relative overflow-hidden rounded-3xl"
            style={{ background: `linear-gradient(115deg, ${latest.winnerWc?.primaryColor || '#0a0a0a'} 0%, #0a0a0a 55%, ${latest.winnerWc?.secondaryColor || '#111'}55 100%)`, border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Confetti colors={colorsFor(latest)} />
            <div className="absolute -top-24 -left-10 w-80 h-80 rounded-full blur-3xl opacity-30" style={{ background: latest.winnerWc?.secondaryColor || '#FFB514' }} />
            <div className="relative px-6 py-6 sm:px-8 sm:py-7 flex flex-col sm:flex-row items-center gap-5">
              <div className="text-6xl sm:text-7xl leading-none drop-shadow-lg select-none">{latest.winnerWc?.flag || '🏆'}</div>
              <div className="flex-1 min-w-0 text-center sm:text-left">
                <div className="flex items-center gap-2 justify-center sm:justify-start mb-1">
                  <PartyPopper size={14} className="text-white" />
                  <span className="text-[9px] font-black uppercase tracking-[0.35em] text-white/80">Victory · You may have missed this</span>
                </div>
                <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white leading-none">{victoryHeadline(latest)}</h2>
                <p className="text-white/75 text-xs sm:text-sm mt-2 leading-relaxed max-w-lg">{congratsFor(latest)}</p>
                <div className="mt-2 inline-flex items-center gap-2 text-white/90 font-black">
                  <span>{latest.winnerWc?.flag}</span><span className="tabular-nums text-lg">{latest.winnerScore}</span>
                  <span className="text-white/40">–</span>
                  <span className="tabular-nums text-lg text-white/60">{latest.loserScore}</span><span>{latest.loserWc?.flag}</span>
                  {latest.penalties && <span className="text-[8px] font-black uppercase tracking-widest text-white/60 ml-1">on pens</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={() => { setCelebrating(latest); }}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-white/90 transition-all"
                >
                  <Trophy size={13} /> Celebrate
                </button>
                {onOpenFanRoom && (
                  <button
                    onClick={() => onOpenFanRoom(latest.id, latest.event)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-white/10 border border-white/20 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                  >
                    <Users size={13} /> Fan Room
                  </button>
                )}
              </div>
              <button onClick={dismissHero} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white/60 hover:text-white transition-colors">
                <X size={15} />
              </button>
            </div>
            {/* Other unseen wins */}
            {unseen.length > 1 && (
              <div className="relative px-6 sm:px-8 pb-4 flex items-center gap-2 flex-wrap">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/50">Also won:</span>
                {unseen.slice(1, 7).map(v => (
                  <button key={v.id} onClick={() => setCelebrating(v)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 border border-white/10 text-white/80 text-[10px] font-bold hover:bg-black/50 transition-all">
                    <span>{v.winnerWc?.flag || '🏆'}</span> {v.winnerWc?.shortName || v.winnerName} <span className="text-white/40 tabular-nums">{v.winnerScore}-{v.loserScore}</span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Full-screen victory takeover ──────────────────────────────────────── */}
      <AnimatePresence>
        {celebrating && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-4"
            style={{ background: `radial-gradient(120% 120% at 50% 0%, ${celebrating.winnerWc?.primaryColor || '#0a0a0a'}ee, #000000f2 70%)` }}
            onClick={closeTakeover}
          >
            <Confetti colors={colorsFor(celebrating)} />
            <motion.div
              initial={{ scale: 0.85, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              onClick={e => e.stopPropagation()}
              className="relative text-center max-w-lg w-full"
            >
              <motion.div
                initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
                className="text-[110px] sm:text-[150px] leading-none drop-shadow-2xl select-none"
              >
                {celebrating.winnerWc?.flag || '🏆'}
              </motion.div>
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/70 mt-2">{celebrating.roundText} · FIFA World Cup 2026</p>
              <h1 className="text-5xl sm:text-7xl font-black uppercase tracking-tighter text-white leading-none mt-1" style={{ textShadow: '0 4px 30px rgba(0,0,0,0.5)' }}>
                {victoryHeadline(celebrating)}
              </h1>
              <div className="mt-4 inline-flex items-center gap-3 text-white font-black text-2xl">
                <span>{celebrating.winnerWc?.flag}</span>
                <span className="tabular-nums">{celebrating.winnerScore}</span>
                <span className="text-white/40 text-lg">–</span>
                <span className="tabular-nums text-white/60">{celebrating.loserScore}</span>
                <span>{celebrating.loserWc?.flag}</span>
              </div>
              <p className="text-white/75 text-sm mt-4 leading-relaxed max-w-md mx-auto">{congratsFor(celebrating)}</p>
              {celebrating.winnerWc?.anthem && (
                <p className="text-white/40 text-[11px] mt-2 flex items-center gap-1.5 justify-center"><Volume2 size={12} /> {celebrating.winnerWc.anthem}</p>
              )}
              <div className="flex items-center gap-3 justify-center mt-6">
                {onOpenFanRoom && (
                  <button onClick={() => { onOpenFanRoom(celebrating.id, celebrating.event); closeTakeover(); }} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black text-[11px] font-black uppercase tracking-widest hover:bg-white/90 transition-all">
                    <Users size={14} /> Join the celebration
                  </button>
                )}
                <button onClick={closeTakeover} className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white/10 border border-white/20 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                  Continue <ChevronRight size={14} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default WorldCupVictory;
