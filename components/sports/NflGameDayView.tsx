/**
 * NflGameDayView — Full-screen NFL live game experience.
 *
 * Tabs: Feed · Play-by-Play · Stats · Win Probability · Play Animator
 * Plus: Score bug header, highlights rail, polling, and legal disclaimer.
 *
 * Opened from NflSpotlight when user taps "Game Center" on a score card.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, RefreshCw, Zap, BarChart2, Activity, Play, Tv,
  ArrowUpRight, TrendingUp,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Surface } from '../ui/Surface';
import {
  fetchNflGameSummary, getPollingInterval,
  type NflGameSummary, type NflPlay, type NflDrive,
} from '../../services/nflGameService';
import { NflPlayAnimator } from './NflPlayAnimator';
import { NflWinProbabilityChart } from './NflWinProbabilityChart';
import { NflHighlightsRail } from './NflHighlightsRail';
import { scoreText } from '../../src/lib/scoreText';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  gameId: string;
  onBack: () => void;
}

type Tab = 'feed' | 'plays' | 'stats' | 'winprob' | 'animator';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'feed',     label: 'Feed',          icon: Zap },
  { id: 'plays',    label: 'Play-by-Play',  icon: Activity },
  { id: 'stats',    label: 'Stats',         icon: BarChart2 },
  { id: 'winprob',  label: 'Win Prob',      icon: TrendingUp },
  { id: 'animator', label: 'Animator',       icon: Play },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function NflGameDayView({ gameId, onBack }: Props) {
  const [game, setGame] = useState<NflGameSummary | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [selectedPlay, setSelectedPlay] = useState<NflPlay | null>(null);
  const [selectedDrive, setSelectedDrive] = useState<NflDrive | null>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  // ─── Polling ────────────────────────────────────────────────────────────────

  const fetchGame = useCallback(async (signal?: AbortSignal) => {
    try {
      const result = await fetchNflGameSummary(gameId, signal);
      setGame(result);
      setError(false);
    } catch (err: any) {
      if (err?.name !== 'AbortError') setError(true);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    fetchGame(controller.signal).then(() => {
      if (!alive) return;
      // Setup polling based on game state
      const interval = getPollingInterval(game?.situation.state ?? 'pre');
      timer = setInterval(() => {
        if (!alive || document.hidden) return;
        fetchGame(controller.signal);
      }, interval);
    });

    const visHandler = () => {
      if (!document.hidden && alive) fetchGame(controller.signal);
    };
    document.addEventListener('visibilitychange', visHandler);

    return () => {
      alive = false;
      controller.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', visHandler);
    };
  }, [gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-establish polling interval when game state changes
  useEffect(() => {
    if (!game) return;
    const controller = new AbortController();
    const interval = getPollingInterval(game.situation.state);
    const timer = setInterval(() => {
      if (document.hidden) return;
      fetchGame(controller.signal);
    }, interval);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [game?.situation.state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll feed to bottom on new plays
  useEffect(() => {
    if (activeTab === 'feed') {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [game?.drives.length, activeTab]);

  // Scoring plays for feed
  const scoringPlays = useMemo(() => game?.scoringPlays ?? [], [game]);

  // All plays flattened for the animator drive timeline
  const allPlays = useMemo(() => {
    if (!game) return [];
    return game.drives.flatMap(d => d.plays);
  }, [game]);

  // Handle play selection → switch to animator
  const animatePlay = useCallback((play: NflPlay, drive?: NflDrive) => {
    setSelectedPlay(play);
    if (drive) setSelectedDrive(drive);
    setActiveTab('animator');
  }, []);

  if (loading && !game) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-white/5 rounded-xl w-48" />
        <div className="h-28 bg-white/5 rounded-2xl" />
        <div className="h-8 bg-white/5 rounded-xl w-full" />
        <div className="h-64 bg-white/5 rounded-2xl" />
      </div>
    );
  }

  if (!game && error) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm">
          <ChevronLeft size={16} /> Back to scores
        </button>
        <Surface>
          <p className="type-body-md" style={{ color: 'var(--pj-warning)' }}>
            Unable to load game data. Please check your connection and try again.
          </p>
          <Button onClick={() => { setLoading(true); fetchGame(); }} icon={<RefreshCw />}>Retry</Button>
        </Surface>
      </div>
    );
  }

  if (!game) return null;

  const { home, away, situation } = game;
  const isLive = situation.state === 'in';
  const isPost = situation.state === 'post';

  return (
    <div className="space-y-5">
      {/* ── Back button ──────────────────────────────────────────────────────── */}
      <button onClick={onBack} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-medium">
        <ChevronLeft size={16} /> Back to scores
      </button>

      {/* ── Score bug header ─────────────────────────────────────────────────── */}
      <div
        style={{
          background: 'rgba(8, 8, 16, 0.85)',
          border: `1px solid ${isLive ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 20,
          padding: '20px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Red zone pulse */}
        {isLive && situation.isRedZone && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.08) 0%, transparent 70%)',
            animation: 'pulse 2s ease-in-out infinite',
            pointerEvents: 'none',
          }} />
        )}

        {/* Live badge */}
        {isLive && (
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400">Live</span>
            {situation.isRedZone && (
              <span className="text-[9px] font-black uppercase tracking-[0.3em] text-red-500 ml-2">🔴 Red Zone</span>
            )}
          </div>
        )}

        {/* Teams & score */}
        <div className="flex items-center justify-between gap-4">
          {/* Away team */}
          <div className="flex items-center gap-3 flex-1">
            {away.logo && <img src={away.logo} alt="" className="w-12 h-12 object-contain" />}
            <div>
              <p className="type-title-sm text-white">{away.displayName}</p>
              <p className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>
                {away.record ? `${away.record} · ` : ''}Away
              </p>
            </div>
          </div>

          {/* Score center */}
          <div className="text-center shrink-0">
            <div className="flex items-center gap-3">
              <span className="type-headline-md tabular-nums text-white" style={{ fontSize: 36, fontWeight: 900 }}>
                {away.score}
              </span>
              <span className="type-label-md" style={{ color: 'var(--text-secondary)' }}>—</span>
              <span className="type-headline-md tabular-nums text-white" style={{ fontSize: 36, fontWeight: 900 }}>
                {home.score}
              </span>
            </div>
            <p className="type-label-sm" style={{ color: '#F59E0B', fontWeight: 900 }}>
              {situation.periodLabel}
            </p>
            {situation.down != null && isLive && (
              <p className="type-label-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {situation.down}{['st', 'nd', 'rd', 'th'][Math.min((situation.down || 1) - 1, 3)]} & {situation.distance ?? '—'}
                {situation.yardLine != null && ` at ${situation.yardLine}`}
                {situation.possession && (
                  <span style={{ color: situation.possession === 'home' ? home.color : away.color }}>
                    {' '}●
                  </span>
                )}
              </p>
            )}
          </div>

          {/* Home team */}
          <div className="flex items-center gap-3 flex-1 justify-end text-right">
            <div>
              <p className="type-title-sm text-white">{home.displayName}</p>
              <p className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>
                {home.record ? `${home.record} · ` : ''}Home
              </p>
            </div>
            {home.logo && <img src={home.logo} alt="" className="w-12 h-12 object-contain" />}
          </div>
        </div>

        {/* Game info strip */}
        <div className="flex flex-wrap gap-3 mt-3 text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-secondary)' }}>
          {game.venue && <span>📍 {game.venue}</span>}
          {game.broadcast && <span>📺 {game.broadcast}</span>}
          {game.weather && <span>🌤️ {game.weather}</span>}
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
              style={{
                background: active ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
                borderColor: active ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)',
                color: active ? '#F59E0B' : 'rgba(255,255,255,0.45)',
              }}
            >
              <Icon size={11} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'feed' && <FeedTab game={game} onAnimate={animatePlay} feedEndRef={feedEndRef} />}
          {activeTab === 'plays' && <PlaysTab game={game} onAnimate={animatePlay} />}
          {activeTab === 'stats' && <StatsTab game={game} />}
          {activeTab === 'winprob' && <WinProbTab game={game} />}
          {activeTab === 'animator' && (
            <NflPlayAnimator
              play={selectedPlay}
              home={home}
              away={away}
              possessionSide={selectedPlay?.team ?? situation.possession}
              drivePlays={selectedDrive?.plays ?? allPlays.slice(-15)}
              onSelectPlay={setSelectedPlay}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── Highlights rail ──────────────────────────────────────────────────── */}
      <NflHighlightsRail game={game} />

      {/* ── Attribution & disclaimer ─────────────────────────────────────────── */}
      <div className="space-y-2 pt-2">
        <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
          ESPN · Updated {new Date(game.fetchedAt).toLocaleTimeString()} ·
          {isLive ? ' Refreshes every 8 seconds' : ' Refreshes every 60 seconds'} ·{' '}
          <a
            href={`https://www.espn.com/nfl/game/_/gameId/${encodeURIComponent(gameId)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View on ESPN <ArrowUpRight size={10} className="inline" />
          </a>
        </p>
        <p className="text-[8px] uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
          This application is not affiliated with, endorsed by, or sponsored by the National Football League (NFL) or the NFLPA. All team and league marks are used for descriptive, factual identification purposes only under nominative fair use.
        </p>
      </div>
    </div>
  );
}

// ─── Feed Tab ─────────────────────────────────────────────────────────────────

function FeedTab({ game, onAnimate, feedEndRef }: {
  game: NflGameSummary;
  onAnimate: (play: NflPlay, drive?: NflDrive) => void;
  feedEndRef: React.RefObject<HTMLDivElement>;
}) {
  // Show scoring plays + current drive's latest plays
  const items = useMemo(() => {
    const scoring = game.scoringPlays.map(p => ({ ...p, _type: 'scoring' as const }));
    const recent = game.drives.slice(-2).flatMap(d =>
      d.plays.slice(-3).map(p => ({ ...p, _type: 'recent' as const, _drive: d }))
    );
    // Merge and deduplicate by id, sort by sequence
    const merged = [...scoring, ...recent];
    const seen = new Set<string>();
    return merged.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  }, [game]);

  return (
    <div className="space-y-2 max-h-[500px] overflow-y-auto">
      {items.length === 0 && (
        <Surface>
          <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>
            {game.situation.state === 'pre' ? 'The game hasn\'t started yet. Plays will appear here once kickoff begins.' : 'No plays to show.'}
          </p>
        </Surface>
      )}
      {items.map(play => (
        <button
          key={play.id}
          onClick={() => onAnimate(play, (play as any)._drive)}
          className="w-full text-left transition-all hover:scale-[1.01]"
          style={{
            background: play.scoringPlay ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
            border: `1px solid ${play.scoringPlay ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 14,
            padding: '12px 16px',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm"
              style={{
                background: play.scoringPlay ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              }}
            >
              {play.scoringPlay ? '🏈' : <Activity size={14} style={{ color: 'rgba(255,255,255,0.3)' }} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="type-body-sm text-white">{play.shortText || play.text}</p>
              <p className="type-label-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                {play.clock && `${play.clock} · `}Q{play.period}
                {play.scoringPlay && ` · +${play.scoreValue}`}
              </p>
            </div>
            <Play size={14} style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0, marginTop: 4 }} />
          </div>
        </button>
      ))}
      <div ref={feedEndRef} />
    </div>
  );
}

// ─── Plays Tab ────────────────────────────────────────────────────────────────

function PlaysTab({ game, onAnimate }: {
  game: NflGameSummary;
  onAnimate: (play: NflPlay, drive?: NflDrive) => void;
}) {
  const [expandedDrive, setExpandedDrive] = useState<string | null>(
    game.drives[game.drives.length - 1]?.id ?? null
  );

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto">
      {game.drives.length === 0 && (
        <Surface>
          <p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>Play-by-play data will appear once the game begins.</p>
        </Surface>
      )}
      {[...game.drives].reverse().map(drive => {
        const expanded = expandedDrive === drive.id;
        return (
          <div key={drive.id} style={{
            background: 'rgba(255,255,255,0.02)',
            border: `1px solid ${drive.isScoring ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.05)'}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            {/* Drive header */}
            <button
              onClick={() => setExpandedDrive(expanded ? null : drive.id)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
            >
              {drive.teamLogo && <img src={drive.teamLogo} alt="" className="w-6 h-6 object-contain shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="type-title-sm text-white">
                  {drive.teamAbbreviation} · {drive.result}
                  {drive.isScoring && <span className="ml-1.5 text-amber-400">★</span>}
                </p>
                <p className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>
                  {drive.plays.length} plays · {drive.yards} yds · {drive.timeOfPossession}
                </p>
              </div>
              <ChevronLeft
                size={14}
                style={{
                  color: 'rgba(255,255,255,0.3)',
                  transform: expanded ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              />
            </button>

            {/* Drive plays */}
            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="px-4 pb-3 space-y-1.5">
                    {drive.plays.map(play => (
                      <button
                        key={play.id}
                        onClick={() => onAnimate(play, drive)}
                        className="w-full text-left flex items-start gap-2.5 px-3 py-2 rounded-xl transition-all hover:bg-white/[0.04]"
                        style={{
                          background: play.scoringPlay ? 'rgba(245,158,11,0.06)' : 'transparent',
                        }}
                      >
                        {/* Down chip */}
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-black tabular-nums"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            color: 'rgba(255,255,255,0.4)',
                            minWidth: 32,
                            textAlign: 'center',
                          }}
                        >
                          {play.down > 0 ? `${play.down}&${play.distance}` : '—'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="type-body-sm" style={{ color: play.scoringPlay ? '#F59E0B' : 'rgba(255,255,255,0.75)' }}>
                            {play.text}
                          </p>
                          <p className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>
                            {play.clock} · Q{play.period}{play.yardsGained !== 0 ? ` · ${play.yardsGained > 0 ? '+' : ''}${play.yardsGained} yds` : ''}
                          </p>
                        </div>
                        <Play size={12} style={{ color: 'rgba(255,255,255,0.15)', flexShrink: 0, marginTop: 2 }} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function StatsTab({ game }: { game: NflGameSummary }) {
  const { home, away, teamStats, playerStats } = game;
  const [statView, setStatView] = useState<'team' | 'players'>('team');

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-1">
        {(['team', 'players'] as const).map(v => (
          <button
            key={v}
            onClick={() => setStatView(v)}
            className="px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border"
            style={{
              background: statView === v ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.03)',
              borderColor: statView === v ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)',
              color: statView === v ? '#F59E0B' : 'rgba(255,255,255,0.45)',
            }}
          >
            {v === 'team' ? 'Team Stats' : 'Player Stats'}
          </button>
        ))}
      </div>

      {statView === 'team' && (
        <div className="space-y-1">
          {/* Team header */}
          <div className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-2">
              {away.logo && <img src={away.logo} alt="" className="w-5 h-5 object-contain" />}
              <span className="type-label-sm font-bold" style={{ color: away.color }}>{away.abbreviation}</span>
            </div>
            <span className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>vs</span>
            <div className="flex items-center gap-2">
              <span className="type-label-sm font-bold" style={{ color: home.color }}>{home.abbreviation}</span>
              {home.logo && <img src={home.logo} alt="" className="w-5 h-5 object-contain" />}
            </div>
          </div>

          {teamStats.length === 0 && (
            <Surface><p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>Team stats will appear once the game begins.</p></Surface>
          )}

          {teamStats.map(stat => {
            const total = stat.homeRaw + stat.awayRaw;
            const homePct = total > 0 ? (stat.homeRaw / total) * 100 : 50;
            const awayPct = 100 - homePct;

            return (
              <div key={stat.label} style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 12,
                padding: '10px 14px',
              }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="type-title-sm tabular-nums" style={{ color: away.color }}>{stat.away}</span>
                  <span className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>{stat.label}</span>
                  <span className="type-title-sm tabular-nums" style={{ color: home.color }}>{stat.home}</span>
                </div>
                {/* Comparison bar */}
                <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ width: `${awayPct}%`, background: away.color, transition: 'width 0.5s' }} />
                  <div style={{ width: `${homePct}%`, background: home.color, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {statView === 'players' && (
        <div className="space-y-4">
          {playerStats.length === 0 && (
            <Surface><p className="type-body-sm" style={{ color: 'var(--text-secondary)' }}>Player stats will appear once the game begins.</p></Surface>
          )}
          {playerStats.map(cat => (
            <div key={cat.name}>
              <p className="type-label-md mb-2" style={{ color: '#F59E0B', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: 9 }}>
                {cat.displayName}
              </p>
              {/* Column headers */}
              <div className="flex gap-2 px-3 mb-1">
                <span className="flex-1 type-label-sm" style={{ color: 'var(--text-secondary)' }}>Player</span>
                {cat.labels.map(l => (
                  <span key={l} className="w-12 text-right type-label-sm" style={{ color: 'var(--text-secondary)', fontSize: 8 }}>{l}</span>
                ))}
              </div>
              {/* Home + away players merged and sorted */}
              {[...cat.home, ...cat.away].map(player => (
                <div
                  key={`${player.id}-${player.team}`}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-colors"
                >
                  {player.headshot && <img src={player.headshot} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="type-body-sm text-white truncate">{player.shortName}</p>
                    <p className="text-[8px]" style={{ color: player.team === 'home' ? home.color : away.color }}>
                      #{player.jersey} {player.position} · {player.team === 'home' ? home.abbreviation : away.abbreviation}
                    </p>
                  </div>
                  {player.stats.map((s, i) => (
                    <span key={i} className="w-12 text-right tabular-nums type-body-sm" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{s}</span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Win Probability Tab ──────────────────────────────────────────────────────

function WinProbTab({ game }: { game: NflGameSummary }) {
  return (
    <div className="space-y-3">
      <NflWinProbabilityChart
        data={game.winProbability}
        home={game.home}
        away={game.away}
      />
      {game.winProbability.length > 0 && (
        <p className="type-label-sm" style={{ color: 'var(--text-secondary)' }}>
          Current: {game.home.abbreviation} {game.winProbability[game.winProbability.length - 1]?.homeWinPct.toFixed(1)}% — {game.away.abbreviation} {(100 - game.winProbability[game.winProbability.length - 1]?.homeWinPct).toFixed(1)}%
        </p>
      )}
    </div>
  );
}
