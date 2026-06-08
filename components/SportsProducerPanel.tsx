/**
 * SportsProducerPanel — floating sports control room for the broadcaster.
 *
 * Mounted alongside LiveBroadcastControlPanel when streamType === 'SPORTS'.
 * Gives the producer:
 *  - Score + team name editing
 *  - Sport selector (Football, Basketball, Soccer, Hockey, Baseball)
 *  - Game clock (quarter / period, countdown, clock toggle)
 *  - Football-specific: down, distance
 *  - Instant replay trigger (flashes viewer overlays)
 *  - Highlight event log (TOUCHDOWN, GOAL, etc.) with auto AI commentary
 *  - Web Speech API commentary (free / default)
 *  - Cloud / local processing mode badge
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Zap, Play, Pause, SkipForward, ChevronUp, ChevronDown,
  Mic, MicOff, RotateCcw, Trophy, Radio, Activity, Volume2,
  VolumeX, RefreshCw, X,
} from 'lucide-react';
import {
  subscribeGameState, updateGameState, pushHighlight,
  initGameState, buildCommentaryLine, speakCommentary,
  buildPeriodLabel, defaultGameState,
  type GameState, type SportType, type HighlightType,
} from '../services/sportscastService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  feedId: string;
}

const SPORTS: { id: SportType; label: string }[] = [
  { id: 'FOOTBALL',   label: '🏈 American Football' },
  { id: 'BASKETBALL', label: '🏀 Basketball' },
  { id: 'SOCCER',     label: '⚽ Football' },
  { id: 'HOCKEY',     label: '🏒 Hockey' },
  { id: 'BASEBALL',   label: '⚾ Baseball' },
  { id: 'OTHER',      label: '🏆 Other' },
];

const HIGHLIGHTS: { type: HighlightType; label: string; color: string }[] = [
  { type: 'TOUCHDOWN',    label: 'Touchdown',    color: '#F59E0B' },
  { type: 'GOAL',         label: 'Goal',         color: '#F59E0B' },
  { type: 'THREE_POINTER',label: '3-Pointer',    color: '#8B5CF6' },
  { type: 'HOME_RUN',     label: 'Home Run',     color: '#EF4444' },
  { type: 'INTERCEPTION', label: 'Interception', color: '#06B6D4' },
  { type: 'SAVE',         label: 'Big Save',     color: '#22C55E' },
  { type: 'BIG_PLAY',     label: 'Big Play',     color: '#3B82F6' },
];

// ─── Clock helpers ────────────────────────────────────────────────────────────

function parseClock(str: string): number {
  const [m = '0', s = '0'] = str.split(':');
  return parseInt(m) * 60 + parseInt(s);
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SportsProducerPanel: React.FC<Props> = ({ feedId }) => {
  const [gs, setGs]           = useState<GameState | null>(null);
  const [initialised, setInit] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [lastComment, setLastComment] = useState('');
  const [hlFlash, setHlFlash] = useState<string | null>(null);

  // Clock tick interval ref
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockSecsRef = useRef(0);

  // Keep clockSecs in sync with Firestore state
  useEffect(() => {
    if (!gs) return;
    clockSecsRef.current = parseClock(gs.timeRemaining);
  }, [gs?.timeRemaining]);

  // Subscribe to Firestore game state
  useEffect(() => {
    const unsub = subscribeGameState(feedId, state => {
      setGs(state);
      if (state) setInit(true);
    });
    return unsub;
  }, [feedId]);

  // Auto-init on first mount if no state exists yet
  useEffect(() => {
    if (!initialised) {
      const timer = setTimeout(async () => {
        const current = gs;
        if (!current) await initGameState(feedId, 'FOOTBALL');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [feedId, gs, initialised]);

  // Client-side clock countdown
  useEffect(() => {
    if (!gs?.clockRunning) {
      if (clockRef.current) clearInterval(clockRef.current);
      return;
    }
    clockRef.current = setInterval(() => {
      clockSecsRef.current = Math.max(0, clockSecsRef.current - 1);
      const formatted = formatClock(clockSecsRef.current);
      updateGameState(feedId, { timeRemaining: formatted });
    }, 1000);
    return () => { if (clockRef.current) clearInterval(clockRef.current); };
  }, [gs?.clockRunning, feedId]);

  // ─── State update shortcuts ──────────────────────────────────────────────

  const patch = useCallback((delta: Partial<GameState>) => {
    updateGameState(feedId, delta);
  }, [feedId]);

  const adjustScore = (team: 'home' | 'away', delta: number) => {
    if (!gs) return;
    const key = team === 'home' ? 'homeScore' : 'awayScore';
    patch({ [key]: Math.max(0, gs[key] + delta) });
  };

  const adjustPeriod = (delta: number) => {
    if (!gs) return;
    const p = Math.max(1, gs.period + delta);
    patch({ period: p, periodLabel: buildPeriodLabel(gs.sport, p) });
  };

  const toggleClock = () => {
    if (!gs) return;
    patch({ clockRunning: !gs.clockRunning });
  };

  const resetClock = (sport: SportType = gs?.sport ?? 'FOOTBALL') => {
    const defaults: Record<SportType, string> = {
      FOOTBALL: '12:00', BASKETBALL: '12:00',
      HOCKEY: '20:00', SOCCER: '45:00',
      BASEBALL: '0:00', OTHER: '0:00',
    };
    patch({ timeRemaining: defaults[sport], clockRunning: false });
  };

  const changeSport = (sport: SportType) => {
    patch({ sport, periodLabel: buildPeriodLabel(sport, 1), period: 1 });
    resetClock(sport);
  };

  const triggerReplay = async () => {
    await patch({ replayActive: true });
    setTimeout(() => patch({ replayActive: false }), 8000);
    setHlFlash('⚡ REPLAY');
    setTimeout(() => setHlFlash(null), 3000);
  };

  const logHighlight = async (type: HighlightType, team: 'home' | 'away') => {
    if (!gs) return;
    const teamName = team === 'home' ? gs.homeTeam : gs.awayTeam;
    const commentary = buildCommentaryLine(type, teamName, gs);
    setLastComment(commentary);
    if (voiceOn) speakCommentary(commentary);
    await pushHighlight(feedId, {
      type,
      label: HIGHLIGHTS.find(h => h.type === type)?.label ?? type,
      team,
      commentaryText: commentary,
    });
    setHlFlash(HIGHLIGHTS.find(h => h.type === type)?.label ?? type);
    setTimeout(() => setHlFlash(null), 3000);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!gs) {
    return (
      <div className="fixed bottom-4 left-4 z-[800] flex items-center gap-2 px-4 py-3 bg-black/80 rounded-2xl border border-white/10 text-white/40 text-xs">
        <Activity size={14} className="animate-pulse" /> Initialising sportscast...
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: -24, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed bottom-4 left-4 z-[800] w-80 bg-[#0a0a12]/95 backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-white font-black text-xs uppercase tracking-widest">Sports Control Room</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVoiceOn(v => !v)}
            className={`p-1.5 rounded-lg transition-colors ${voiceOn ? 'text-amber-400 bg-amber-500/10' : 'text-white/20 hover:text-white/40'}`}
            title="AI Commentary voice">
            {voiceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button onClick={() => setCollapsed(c => !c)} className="text-white/30 hover:text-white p-1.5 rounded-lg transition-colors">
            {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4">

              {/* ── Sport selector ─────────────────────────────────────────── */}
              <div>
                <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Sport</p>
                <div className="flex flex-wrap gap-1.5">
                  {SPORTS.map(s => (
                    <button key={s.id} onClick={() => changeSport(s.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all ${gs.sport === s.id ? 'border-amber-500/50 bg-amber-500/15 text-amber-400' : 'border-white/8 bg-white/4 text-white/30 hover:border-white/20'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Team names ─────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-2">
                {(['home', 'away'] as const).map(side => (
                  <div key={side}>
                    <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">
                      {side === 'home' ? '🔵 Home' : '🔴 Away'}
                    </p>
                    <input
                      maxLength={12}
                      value={side === 'home' ? gs.homeTeam : gs.awayTeam}
                      onChange={e => patch(side === 'home' ? { homeTeam: e.target.value } : { awayTeam: e.target.value })}
                      className="w-full bg-white/4 border border-white/8 rounded-xl px-3 py-2 text-white text-xs font-bold outline-none focus:ring-1 ring-amber-500/40 uppercase tracking-wider"
                    />
                  </div>
                ))}
              </div>

              {/* ── Scoreboard ─────────────────────────────────────────────── */}
              <div className="grid grid-cols-2 gap-3">
                {(['home', 'away'] as const).map(side => (
                  <div key={side} className="bg-white/4 rounded-2xl p-3 border border-white/8">
                    <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-2 text-center">
                      {side === 'home' ? gs.homeTeam : gs.awayTeam}
                    </p>
                    <div className="flex items-center justify-between gap-1">
                      <button onClick={() => adjustScore(side, -1)}
                        className="w-8 h-8 rounded-xl bg-white/8 text-white/60 hover:bg-white/15 text-lg font-bold transition-colors flex items-center justify-center">
                        −
                      </button>
                      <span className="text-white font-black text-2xl tabular-nums">
                        {side === 'home' ? gs.homeScore : gs.awayScore}
                      </span>
                      <button onClick={() => adjustScore(side, 1)}
                        className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-lg font-bold transition-colors flex items-center justify-center">
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Clock + period ─────────────────────────────────────────── */}
              <div className="bg-white/4 rounded-2xl p-3 border border-white/8">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white/30 text-[10px] font-black uppercase tracking-widest">Clock</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => adjustPeriod(-1)}
                      className="w-6 h-6 rounded-lg bg-white/8 text-white/40 hover:bg-white/15 text-xs flex items-center justify-center">
                      <ChevronDown size={12} />
                    </button>
                    <span className="text-amber-400 text-xs font-black w-8 text-center">{gs.periodLabel}</span>
                    <button onClick={() => adjustPeriod(1)}
                      className="w-6 h-6 rounded-lg bg-white/8 text-white/40 hover:bg-white/15 text-xs flex items-center justify-center">
                      <ChevronUp size={12} />
                    </button>
                  </div>
                </div>

                {/* Clock display + editable input */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={gs.timeRemaining}
                    onChange={e => patch({ timeRemaining: e.target.value })}
                    className="flex-1 bg-black/40 border border-white/8 rounded-xl px-3 py-2 text-white font-mono text-sm font-bold outline-none focus:ring-1 ring-amber-500/40 text-center"
                    placeholder="12:00"
                  />
                  <button onClick={toggleClock}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${gs.clockRunning ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                    {gs.clockRunning ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={() => resetClock()} className="w-10 h-10 rounded-xl bg-white/8 text-white/40 hover:bg-white/15 flex items-center justify-center transition-colors">
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>

              {/* ── Football specifics ─────────────────────────────────────── */}
              {gs.sport === 'FOOTBALL' && (
                <div className="bg-white/4 rounded-2xl p-3 border border-white/8">
                  <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Down & Distance</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-white/20 text-[9px] font-bold uppercase mb-1">Down</p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => patch({ down: Math.max(1, (gs.down ?? 1) - 1) })}
                          className="w-5 h-5 rounded bg-white/8 text-white/40 text-xs flex items-center justify-center">−</button>
                        <span className="text-white text-sm font-black w-4 text-center">{gs.down}</span>
                        <button onClick={() => patch({ down: Math.min(4, (gs.down ?? 1) + 1) })}
                          className="w-5 h-5 rounded bg-white/8 text-white/40 text-xs flex items-center justify-center">+</button>
                      </div>
                    </div>
                    <div>
                      <p className="text-white/20 text-[9px] font-bold uppercase mb-1">Distance</p>
                      <input
                        type="number" min={1} max={99}
                        value={gs.distance ?? 10}
                        onChange={e => patch({ distance: parseInt(e.target.value) || 10 })}
                        className="w-full bg-black/30 border border-white/8 rounded px-1 py-1 text-white text-xs font-bold outline-none text-center"
                      />
                    </div>
                    <div>
                      <p className="text-white/20 text-[9px] font-bold uppercase mb-1">Possession</p>
                      <div className="flex gap-1">
                        {(['home', 'away'] as const).map(side => (
                          <button key={side} onClick={() => patch({ possession: gs.possession === side ? null : side })}
                            className={`flex-1 py-1 rounded text-[9px] font-black uppercase transition-colors ${gs.possession === side ? 'bg-amber-500/30 text-amber-400' : 'bg-white/8 text-white/30 hover:bg-white/15'}`}>
                            {side === 'home' ? gs.homeTeam.slice(0, 3) : gs.awayTeam.slice(0, 3)}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Highlight events ───────────────────────────────────────── */}
              <div>
                <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Log Highlight</p>
                <div className="space-y-1.5">
                  {HIGHLIGHTS.map(h => (
                    <div key={h.type} className="flex gap-1.5">
                      <button onClick={() => logHighlight(h.type, 'home')}
                        className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border border-white/8 bg-white/4 text-white/60 hover:bg-blue-500/15 hover:border-blue-500/30 hover:text-blue-400 transition-all">
                        {gs.homeTeam.slice(0, 6)} {h.label}
                      </button>
                      <button onClick={() => logHighlight(h.type, 'away')}
                        className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border border-white/8 bg-white/4 text-white/60 hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400 transition-all">
                        {gs.awayTeam.slice(0, 6)} {h.label}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Instant replay ─────────────────────────────────────────── */}
              <button onClick={triggerReplay}
                className="w-full py-3.5 bg-red-600/20 border border-red-500/30 rounded-2xl text-red-400 text-xs font-black uppercase tracking-widest hover:bg-red-600/30 transition-colors flex items-center justify-center gap-2">
                <Zap size={14} /> Trigger Instant Replay
              </button>

              {/* ── AI commentary console ──────────────────────────────────── */}
              {lastComment && (
                <div className="bg-white/4 border border-white/8 rounded-2xl p-3">
                  <p className="text-white/30 text-[9px] font-black uppercase tracking-widest mb-1.5">
                    <Mic size={10} className="inline mr-1" /> AI Commentary
                  </p>
                  <p className="text-white/70 text-[11px] leading-relaxed italic">{lastComment}</p>
                  {voiceOn && (
                    <button onClick={() => speakCommentary(lastComment)}
                      className="mt-2 text-amber-400 text-[10px] font-bold hover:text-amber-300 transition-colors">
                      ▶ Replay Voice
                    </button>
                  )}
                </div>
              )}

              {/* ── Processing mode ────────────────────────────────────────── */}
              <div className="flex items-center justify-between">
                <p className="text-white/20 text-[10px] font-black uppercase tracking-widest">Processing</p>
                <button onClick={() => patch({ processingMode: gs.processingMode === 'cloud' ? 'local' : 'cloud' })}
                  className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border transition-all ${
                    gs.processingMode === 'cloud'
                      ? 'border-sky-500/40 bg-sky-500/15 text-sky-400'
                      : 'border-purple-500/40 bg-purple-500/15 text-purple-400'
                  }`}>
                  {gs.processingMode === 'cloud' ? '☁ Cloud' : '💻 Local'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Highlight flash toast ─────────────────────────────────────────── */}
      <AnimatePresence>
        {hlFlash && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="absolute top-0 inset-x-0 text-center py-2 bg-amber-500 text-black text-xs font-black uppercase tracking-widest"
          >
            🔥 {hlFlash}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SportsProducerPanel;
