import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Radio, ChevronDown, ChevronRight, Clock, Users } from 'lucide-react';

// Open the live fan room for a specific match. A window event avoids threading a nav
// callback through the whole World Cup component tree — App.tsx listens and routes.
const openFanRoom = (matchId: string) => window.dispatchEvent(new CustomEvent('plajah:open-fanroom', { detail: { matchId } }));
import { fetchWorldCupWindow, fetchSoccerSummary } from '../services/sportsService';
import { scoreText } from '../src/lib/scoreText';

/**
 * WorldCupTopBoard — FIFA World Cup 2026 pinned to the very top of the sports
 * page: live scores (auto-refreshing), recent results, and what's next, with
 * tap-to-open play-by-play on any live match. Renders nothing when there's no
 * World Cup data so it never shows an empty box.
 */

const stateOf = (e: any): 'pre' | 'in' | 'post' | undefined => e?.status?.type?.state;
const compOf = (e: any) => e?.competitions?.[0];
const side = (e: any, ha: 'home' | 'away') => compOf(e)?.competitors?.find((c: any) => c.homeAway === ha);
const teamName = (t: any) => t?.team?.shortDisplayName || t?.team?.abbreviation || t?.team?.displayName || '—';
const kickoff = (e: any) => {
  try { return new Date(e.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
};

const Crest: React.FC<{ side: any; size?: number }> = ({ side, size = 22 }) => (
  side?.team?.logo
    ? <img src={side.team.logo} alt="" width={size} height={size} className="object-contain shrink-0" loading="lazy" />
    : <div style={{ width: size, height: size }} className="rounded-full bg-white/10 shrink-0" />
);

// ── Live match card with expandable play-by-play ────────────────────────────
const LiveMatchCard: React.FC<{ event: any }> = ({ event }) => {
  const [open, setOpen] = useState(false);
  const [plays, setPlays] = useState<{ time: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const a = side(event, 'away'); const h = side(event, 'home');

  const loadPlays = useCallback(async () => {
    setLoading(true);
    try { setPlays(await fetchSoccerSummary(event.id)); } finally { setLoading(false); }
  }, [event.id]);

  // Refresh commentary while open (it's a live match).
  useEffect(() => {
    if (!open) return;
    loadPlays();
    const id = setInterval(loadPlays, 30_000);
    return () => clearInterval(id);
  }, [open, loadPlays]);

  return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] overflow-hidden">
      <div className="p-4">
        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400">{event.status?.type?.shortDetail || 'Live'}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <Crest side={a} size={30} />
            <span className="text-sm font-black uppercase tracking-tight text-white truncate">{teamName(a)}</span>
          </div>
          <div className="text-2xl font-black tabular-nums text-white shrink-0 px-2">
            {scoreText(a?.score) || '0'}<span className="text-white/30 mx-1.5">–</span>{scoreText(h?.score) || '0'}
          </div>
          <div className="flex items-center gap-2.5 flex-1 min-w-0 justify-end">
            <span className="text-sm font-black uppercase tracking-tight text-white truncate text-right">{teamName(h)}</span>
            <Crest side={h} size={30} />
          </div>
        </div>
      </div>
      <div className="flex border-t border-red-500/15">
        <button onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[9px] font-black uppercase tracking-[0.25em] text-red-300/80 hover:bg-red-500/10 transition-colors">
          <Radio size={11} /> Play-by-play <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <button onClick={() => openFanRoom(event.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 border-l border-red-500/15 text-[9px] font-black uppercase tracking-[0.25em] text-[#FF8C00] hover:bg-[#FF8C00]/10 transition-colors">
          <Users size={11} /> Fan Room
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="max-h-64 overflow-y-auto custom-scrollbar px-4 py-3 space-y-2.5 bg-black/30">
              {loading && plays.length === 0 && <p className="text-[10px] text-white/40 text-center py-3">Loading commentary…</p>}
              {!loading && plays.length === 0 && <p className="text-[10px] text-white/40 text-center py-3">No play-by-play available for this match yet.</p>}
              {plays.map((p, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-[9px] font-black tabular-nums text-red-400/80 shrink-0 w-8 pt-0.5">{p.time}</span>
                  <span className="text-[11px] leading-relaxed text-white/70">{p.text}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Compact result / upcoming chip ──────────────────────────────────────────
const MatchChip: React.FC<{ event: any; kind: 'result' | 'upcoming' }> = ({ event, kind }) => {
  const a = side(event, 'away'); const h = side(event, 'home');
  return (
    <button onClick={() => openFanRoom(event.id)} title="Open the fan room"
      className="group text-left shrink-0 w-[190px] rounded-2xl border border-white/8 bg-white/[0.03] p-3 hover:border-[#FF8C00]/40 hover:bg-[#FF8C00]/[0.05] transition-colors">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30 truncate">
          {kind === 'result' ? (event.status?.type?.shortDetail || 'Full Time') : kickoff(event)}
        </p>
        <span className="flex items-center gap-1 text-[7px] font-black uppercase tracking-[0.2em] text-[#FF8C00] opacity-0 group-hover:opacity-100 transition-opacity"><Users size={9} /> Room</span>
      </div>
      <div className="space-y-1.5">
        {[a, h].map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Crest side={s} size={18} />
              <span className="text-[11px] font-bold text-white/80 truncate">{teamName(s)}</span>
            </div>
            {kind === 'result'
              ? <span className="text-[12px] font-black tabular-nums text-white shrink-0">{scoreText(s?.score) || '0'}</span>
              : <span className="text-[8px] font-black text-white/20 shrink-0">—</span>}
          </div>
        ))}
      </div>
    </button>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-2">
    <p className="text-[8px] font-black uppercase tracking-[0.4em] text-white/35">{label}</p>
    <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">{children}</div>
  </div>
);

const WorldCupTopBoard: React.FC<{ onOpenFull?: () => void }> = ({ onOpenFull }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try { setEvents(await fetchWorldCupWindow()); } catch { /* keep prior */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, 30_000); // live refresh
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  const live = events.filter(e => stateOf(e) === 'in');
  const results = events.filter(e => stateOf(e) === 'post').sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 8);
  const upcoming = events.filter(e => stateOf(e) === 'pre').sort((a, b) => +new Date(a.date) - +new Date(b.date)).slice(0, 8);

  // Nothing to show → render nothing (no empty box).
  if (loaded && live.length === 0 && results.length === 0 && upcoming.length === 0) return null;
  if (!loaded && events.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 animate-pulse h-28" />
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-white/10 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 90% 70% at 12% 0%, rgba(212,0,85,0.16) 0%, transparent 55%), radial-gradient(ellipse 70% 60% at 90% 100%, rgba(107,0,153,0.16) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 60% 40%, rgba(255,140,0,0.08) 0%, transparent 60%), #0b0b10' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-[#FF8C00]/15 border border-[#FF8C00]/30 flex items-center justify-center shrink-0">
            <Trophy size={17} className="text-[#FF8C00]" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-black uppercase tracking-tight text-white truncate">FIFA World Cup 2026</h2>
            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40">Live · Results · What’s next</p>
          </div>
          {live.length > 0 && (
            <span className="ml-1 flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/15 border border-red-500/30 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[8px] font-black uppercase tracking-widest text-red-400">{live.length} Live</span>
            </span>
          )}
        </div>
        {onOpenFull && (
          <button onClick={onOpenFull} className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-white/45 hover:text-white shrink-0">
            Full hub <ChevronRight size={12} />
          </button>
        )}
      </div>

      <div className="px-5 pb-5 space-y-4">
        {live.length > 0 && (
          <div className="space-y-2.5">
            {live.slice(0, 4).map(e => <LiveMatchCard key={e.id} event={e} />)}
          </div>
        )}
        {results.length > 0 && (
          <Row label="Recent results">
            {results.map(e => <MatchChip key={e.id} event={e} kind="result" />)}
          </Row>
        )}
        {upcoming.length > 0 && (
          <Row label="Coming up">
            {upcoming.map(e => <MatchChip key={e.id} event={e} kind="upcoming" />)}
          </Row>
        )}
      </div>
    </motion.div>
  );
};

export default WorldCupTopBoard;
