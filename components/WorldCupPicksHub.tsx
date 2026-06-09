// World Cup 2026 — Picks & Predictions Hub
// Free-to-play prediction game. No money, just bragging rights and points.
//
// Pick types:
//   1. Match picks — H / D / A (+ optional exact score for bonus pts)
//   2. Tournament picks — champion, runner-up, semi-finalists
//   3. Golden Boot — who scores the most goals
//
// Points:
//   Correct result: 3 pts  |  Exact score: +5 pts bonus
//   Correct champion: 10 pts  |  Golden Boot: 15 pts  |  Finalist: 5 pts  |  SF: 4 pts

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Target, Star, Clock, CheckCircle, History, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { WC26_MATCHES, WC26_TEAMS, getTeam, ROUND_LABELS, type WC26Round } from '../data/worldCup2026';
import { WC26_PLAYERS } from '../data/worldCupPlayers';
import { auth } from '../services/backendService';
import {
  subscribeToPicks, saveMatchPick, saveTournamentPicks,
  POINTS, type PicksDoc, type MatchResult,
} from '../services/picksService';
import { UserProfile } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────
function totalUserPoints(picks: PicksDoc | null, matches: typeof WC26_MATCHES): number {
  if (!picks) return 0;
  let pts = 0;
  for (const match of matches) {
    if (match.status !== 'FINISHED') continue;
    const pick = picks.matchPicks?.[match.id];
    if (!pick) continue;
    const actual: MatchResult = match.homeScore! > match.awayScore! ? 'H' : match.homeScore === match.awayScore ? 'D' : 'A';
    if (pick.result !== actual) continue;
    pts += POINTS.correctResult;
    if (pick.homeScore === match.homeScore && pick.awayScore === match.awayScore) pts += POINTS.exactScore;
  }
  return pts;
}

// ── Points info pill ──────────────────────────────────────────────────────────
const PtsPill: React.FC<{ label: string; pts: number }> = ({ label, pts }) => (
  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#FF8C00]/10 border border-[#FF8C00]/20 rounded-full">
    <Zap size={9} className="text-[#FF8C00]" />
    <span className="text-[7px] font-black text-[#FF8C00]">{pts} pts</span>
    <span className="text-[7px] text-white/25">·</span>
    <span className="text-[7px] text-white/40">{label}</span>
  </div>
);

// ── Result picker button ───────────────────────────────────────────────────────
const ResultBtn: React.FC<{
  label: string; value: MatchResult; selected: boolean; disabled: boolean; onClick: () => void;
}> = ({ label, value, selected, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
      selected
        ? 'bg-[#FF8C00] text-black border-[#FF8C00] shadow-lg shadow-[#FF8C00]/25'
        : disabled
        ? 'bg-white/5 text-white/20 border-white/8 cursor-not-allowed'
        : 'bg-white/[0.04] text-white/50 border-white/10 hover:bg-white/[0.08] hover:text-white/80'
    }`}
  >
    {label}
  </button>
);

// ── Single match pick card ────────────────────────────────────────────────────
const MatchPickCard: React.FC<{
  match: typeof WC26_MATCHES[0];
  saved: { result: MatchResult; homeScore?: number; awayScore?: number } | undefined;
  onPick: (matchId: string, result: MatchResult, hs?: number, as_?: number) => void;
  locked: boolean;
}> = ({ match, saved, onPick, locked }) => {
  const home = getTeam(match.homeTeamId)!;
  const away = getTeam(match.awayTeamId)!;
  const [showScore, setShowScore] = useState(false);
  const [hs, setHs] = useState(saved?.homeScore ?? 0);
  const [as_, setAs_] = useState(saved?.awayScore ?? 0);
  const isFinished = match.status === 'FINISHED';
  const actualResult: MatchResult | null = isFinished
    ? match.homeScore! > match.awayScore! ? 'H' : match.homeScore === match.awayScore ? 'D' : 'A'
    : null;

  const correct = saved && actualResult && saved.result === actualResult;
  const exactCorrect = correct && saved.homeScore === match.homeScore && saved.awayScore === match.awayScore;

  return (
    <div className={`p-4 rounded-2xl border transition-all ${
      exactCorrect ? 'border-[#FF8C00]/40 bg-[#FF8C00]/6' :
      correct      ? 'border-green-500/30 bg-green-500/5' :
      isFinished && saved ? 'border-red-500/20 bg-red-500/4' :
      saved         ? 'border-white/15 bg-white/[0.05]' :
                       'border-white/8 bg-white/[0.03]'
    }`}>
      {/* Round + date */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[7px] font-black uppercase tracking-widest text-white/25">
          {match.group ? `Group ${match.group}` : ROUND_LABELS[match.round as WC26Round]}
        </span>
        <span className="text-[7px] text-white/20">
          {new Date(match.kickoffMs).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex-1 flex items-center gap-2">
          <span className="text-2xl">{home.flag}</span>
          <span className="text-[10px] font-black text-white/80">{home.shortName}</span>
        </div>
        <div className="text-center px-3">
          {isFinished && match.homeScore !== undefined ? (
            <span className="text-sm font-black text-white">{match.homeScore} – {match.awayScore}</span>
          ) : (
            <span className="text-[10px] text-white/20 font-bold">vs</span>
          )}
        </div>
        <div className="flex-1 flex items-center gap-2 justify-end">
          <span className="text-[10px] font-black text-white/80">{away.shortName}</span>
          <span className="text-2xl">{away.flag}</span>
        </div>
      </div>

      {/* Result buttons */}
      {!locked && !isFinished ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ResultBtn label={home.shortName} value="H" selected={saved?.result === 'H'} disabled={false} onClick={() => onPick(match.id, 'H', hs, as_)} />
            <ResultBtn label="Draw"           value="D" selected={saved?.result === 'D'} disabled={false} onClick={() => onPick(match.id, 'D', hs, as_)} />
            <ResultBtn label={away.shortName} value="A" selected={saved?.result === 'A'} disabled={false} onClick={() => onPick(match.id, 'A', hs, as_)} />
          </div>

          {/* Exact score toggle */}
          {saved?.result && (
            <button
              onClick={() => setShowScore(s => !s)}
              className="flex items-center gap-1 text-[8px] text-white/30 hover:text-white/60 transition-colors"
            >
              {showScore ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              Predict exact score (+5 pts bonus)
            </button>
          )}
          {showScore && saved?.result && (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number" min={0} max={20} value={hs}
                onChange={e => { const v = Number(e.target.value); setHs(v); onPick(match.id, saved.result, v, as_); }}
                className="w-12 text-center bg-white/10 border border-white/15 rounded-lg py-1 text-sm font-black text-white"
              />
              <span className="text-white/30 font-bold">–</span>
              <input
                type="number" min={0} max={20} value={as_}
                onChange={e => { const v = Number(e.target.value); setAs_(v); onPick(match.id, saved.result, hs, v); }}
                className="w-12 text-center bg-white/10 border border-white/15 rounded-lg py-1 text-sm font-black text-white"
              />
              <span className="text-[8px] text-[#FF8C00] font-black">+5 pts if exact</span>
            </div>
          )}
        </div>
      ) : (
        /* Result display (locked or finished) */
        <div className="flex items-center gap-2">
          {saved ? (
            <>
              <span className={`px-3 py-1 rounded-xl text-[8px] font-black uppercase border ${
                correct ? 'bg-green-500/15 border-green-500/30 text-green-400' : isFinished ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-white/8 border-white/15 text-white/50'
              }`}>
                Your pick: {saved.result === 'H' ? home.shortName : saved.result === 'A' ? away.shortName : 'Draw'}
              </span>
              {correct && (
                <span className="flex items-center gap-1 text-[8px] font-black text-[#FF8C00]">
                  <CheckCircle size={11} />
                  +{exactCorrect ? POINTS.correctResult + POINTS.exactScore : POINTS.correctResult} pts
                </span>
              )}
            </>
          ) : (
            <span className="text-[8px] text-white/20">{isFinished ? 'No pick made' : 'Locked'}</span>
          )}
        </div>
      )}
    </div>
  );
};

// ── Tournament picks panel ────────────────────────────────────────────────────
const TournamentPicksPanel: React.FC<{
  picks: PicksDoc | null;
  onSave: (data: Parameters<typeof saveTournamentPicks>[1]) => void;
  locked: boolean;
}> = ({ picks, onSave, locked }) => {
  const [champion, setChampion]   = useState(picks?.champion ?? '');
  const [runnerUp, setRunnerUp]   = useState(picks?.runnerUp ?? '');
  const [sf1, setSf1]             = useState(picks?.sf1 ?? '');
  const [sf2, setSf2]             = useState(picks?.sf2 ?? '');
  const [goldenBoot, setGoldenBoot] = useState(picks?.goldenBoot ?? '');
  const [saved, setSaved]         = useState(false);

  const keyPlayers = useMemo(() => WC26_PLAYERS.filter(p => p.isKeyPlayer), []);

  const handleSave = () => {
    onSave({ champion, runnerUp, sf1, sf2, goldenBoot });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const TeamSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; pts: number }> = ({ label, value, onChange, pts }) => (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30">{label}</label>
        <PtsPill label="correct" pts={pts} />
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={locked}
        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white appearance-none disabled:opacity-40"
      >
        <option value="">— Select team —</option>
        {WC26_TEAMS.map(t => (
          <option key={t.id} value={t.id}>{t.flag} {t.name}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="space-y-4">
      <TeamSelect label="Tournament Champion"  value={champion}  onChange={setChampion}  pts={POINTS.correctChampion} />
      <TeamSelect label="Runner-Up / Finalist" value={runnerUp}  onChange={setRunnerUp}  pts={POINTS.correctFinalist} />
      <TeamSelect label="Semi-Finalist 1"      value={sf1}       onChange={setSf1}       pts={POINTS.correctSF} />
      <TeamSelect label="Semi-Finalist 2"      value={sf2}       onChange={setSf2}       pts={POINTS.correctSF} />

      {/* Golden Boot */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30">Golden Boot (Top Scorer)</label>
          <PtsPill label="correct" pts={POINTS.correctGoldenBoot} />
        </div>
        <select
          value={goldenBoot}
          onChange={e => setGoldenBoot(e.target.value)}
          disabled={locked}
          className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white appearance-none disabled:opacity-40"
        >
          <option value="">— Select player —</option>
          {keyPlayers.map(p => {
            const t = getTeam(p.teamId);
            return <option key={p.id} value={p.id}>{t?.flag ?? ''} {p.name} ({t?.shortName})</option>;
          })}
        </select>
      </div>

      {!locked && (
        <button
          onClick={handleSave}
          className={`w-full py-2.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
            saved ? 'bg-green-500 text-white' : 'bg-[#FF8C00] text-black hover:bg-[#FF9F1C]'
          }`}
        >
          {saved ? '✓ Saved' : 'Save Tournament Picks'}
        </button>
      )}
      {locked && (
        <p className="text-[8px] text-center text-white/20 pt-1">
          Tournament picks lock when the group stage ends
        </p>
      )}
    </div>
  );
};

// ── Leaderboard placeholder ────────────────────────────────────────────────────
const LeaderboardTeaser: React.FC = () => (
  <div className="p-5 rounded-2xl bg-gradient-to-br from-[#FF8C00]/10 to-transparent border border-[#FF8C00]/20 text-center space-y-2">
    <Trophy size={28} className="text-[#FF8C00] mx-auto" />
    <p className="text-sm font-black text-white">Global Leaderboard</p>
    <p className="text-[9px] text-white/40 leading-relaxed">
      Compete against Plajah users worldwide.<br />
      Leaderboard unlocks after Match Day 1.
    </p>
    <div className="flex items-center justify-center gap-2 pt-1">
      {['🇧🇷', '🇫🇷', '🇦🇷', '🏆', '🇩🇪'].map((e, i) => (
        <span key={i} className="text-xl">{e}</span>
      ))}
    </div>
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
type PicksTab = 'matches' | 'tournament' | 'board';

interface Props {
  currentUser: UserProfile | null;
}

const WorldCupPicksHub: React.FC<Props> = ({ currentUser }) => {
  const [tab, setTab]   = useState<PicksTab>('matches');
  const [picks, setPicks] = useState<PicksDoc | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'all' | 'finished'>('upcoming');

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    return subscribeToPicks(uid, setPicks);
  }, [uid]);

  const myPts = useMemo(() => totalUserPoints(picks, WC26_MATCHES), [picks]);
  const now   = Date.now();

  const filteredMatches = useMemo(() => {
    const base = WC26_MATCHES.filter(m => m.round !== 'GROUP' || true); // all matches
    if (filter === 'upcoming') return base.filter(m => m.kickoffMs > now - 3600_000 * 2 && m.status !== 'FINISHED').slice(0, 12);
    if (filter === 'finished') return base.filter(m => m.status === 'FINISHED');
    return base.slice(0, 30);
  }, [filter, now]);

  const handleMatchPick = useCallback(async (matchId: string, result: MatchResult, hs?: number, as_?: number) => {
    if (!uid) return;
    await saveMatchPick(uid, matchId, { result, homeScore: hs, awayScore: as_, pickedAt: Date.now() });
  }, [uid]);

  const handleTournamentSave = useCallback(async (data: Parameters<typeof saveTournamentPicks>[1]) => {
    if (!uid) return;
    await saveTournamentPicks(uid, data);
  }, [uid]);

  const tournamentLocked = now > new Date('2026-06-28T00:00:00Z').getTime();

  const TABS: { id: PicksTab; label: string; icon: React.ElementType }[] = [
    { id: 'matches',    label: 'Match Picks',  icon: Target },
    { id: 'tournament', label: 'Trophy Picks', icon: Trophy },
    { id: 'board',      label: 'Leaderboard',  icon: Star },
  ];

  if (!uid) {
    return (
      <div className="py-20 text-center space-y-3">
        <Target size={36} className="text-white/10 mx-auto" />
        <p className="text-sm font-black text-white/30">Sign in to make picks</p>
        <p className="text-[9px] text-white/15">Predict matches, earn points, track your history</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Score banner ── */}
      <div className="relative rounded-[2rem] overflow-hidden p-6 bg-gradient-to-br from-[#FF8C00]/15 via-black to-black border border-[#FF8C00]/20">
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[100px] leading-none opacity-[0.06] select-none">🎯</div>
        <div className="relative">
          <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00] mb-1">Your Score</p>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-black text-white">{myPts}</span>
            <span className="text-sm font-black text-white/30 mb-2">pts</span>
          </div>
          <p className="text-[9px] text-white/30 mt-1">
            {picks ? Object.keys(picks.matchPicks ?? {}).length : 0} picks made ·&nbsp;
            {WC26_MATCHES.filter(m => m.status === 'FINISHED').length} matches decided
          </p>

          {/* Points legend */}
          <div className="flex flex-wrap gap-2 mt-3">
            <PtsPill label="correct result" pts={POINTS.correctResult} />
            <PtsPill label="exact score"    pts={POINTS.exactScore} />
            <PtsPill label="champion"       pts={POINTS.correctChampion} />
            <PtsPill label="golden boot"    pts={POINTS.correctGoldenBoot} />
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              tab === t.id ? 'bg-[#FF8C00] text-black shadow-lg' : 'text-white/40 hover:text-white/70'
            }`}
          >
            {React.createElement(t.icon as any, { size: 10 })}
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {/* MATCH PICKS */}
          {tab === 'matches' && (
            <div className="space-y-4">
              {/* Filter strip */}
              <div className="flex items-center gap-2">
                {(['upcoming', 'all', 'finished'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest transition-all border ${
                      filter === f ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]' : 'bg-white/[0.03] border-white/8 text-white/30 hover:text-white/60'
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <Clock size={9} className="text-white/20" />
                  <span className="text-[7px] text-white/20">Pick locks at kickoff</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredMatches.map(match => (
                  <MatchPickCard
                    key={match.id}
                    match={match}
                    saved={picks?.matchPicks?.[match.id]}
                    onPick={handleMatchPick}
                    locked={match.kickoffMs <= now}
                  />
                ))}
                {filteredMatches.length === 0 && (
                  <div className="col-span-2 py-16 text-center">
                    <Target size={28} className="text-white/10 mx-auto mb-3" />
                    <p className="text-sm text-white/30">No matches in this view</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TOURNAMENT PICKS */}
          {tab === 'tournament' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy size={14} className="text-[#FF8C00]" />
                  <p className="text-xs font-black text-white">Tournament Predictions</p>
                  {tournamentLocked && (
                    <span className="ml-auto px-2 py-0.5 bg-red-500/15 border border-red-500/25 rounded-full text-[7px] font-black text-red-400">Locked</span>
                  )}
                </div>
                <TournamentPicksPanel picks={picks} onSave={handleTournamentSave} locked={tournamentLocked} />
              </div>

              {/* Pick summary */}
              {picks?.champion && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Your Trophy Picks</p>
                  {[
                    { label: '🏆 Champion',     value: getTeam(picks.champion ?? '')?.name },
                    { label: '🥈 Runner-Up',    value: getTeam(picks.runnerUp ?? '')?.name },
                    { label: '3️⃣ Semi-Finalist', value: getTeam(picks.sf1 ?? '')?.name },
                    { label: '4️⃣ Semi-Finalist', value: getTeam(picks.sf2 ?? '')?.name },
                  ].filter(r => r.value).map(row => (
                    <div key={row.label} className="flex items-center gap-3">
                      <span className="text-[9px] text-white/30 w-28">{row.label}</span>
                      <span className="text-[9px] font-black text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LEADERBOARD */}
          {tab === 'board' && (
            <div className="space-y-4">
              <LeaderboardTeaser />

              {/* Personal history */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/8">
                <div className="flex items-center gap-2 mb-3">
                  <History size={13} className="text-white/40" />
                  <p className="text-xs font-black text-white">Your Pick History</p>
                </div>
                {picks && Object.keys(picks.matchPicks ?? {}).length > 0 ? (
                  <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-none">
                    {Object.entries(picks.matchPicks ?? {}).slice(-10).reverse().map(([matchId, pick]) => {
                      const match = WC26_MATCHES.find(m => m.id === matchId);
                      if (!match) return null;
                      const home = getTeam(match.homeTeamId);
                      const away = getTeam(match.awayTeamId);
                      const finished = match.status === 'FINISHED';
                      const actual: MatchResult | null = finished
                        ? match.homeScore! > match.awayScore! ? 'H' : match.homeScore === match.awayScore ? 'D' : 'A'
                        : null;
                      const correct = actual && pick.result === actual;
                      return (
                        <div key={matchId} className="flex items-center gap-3 py-2 border-b border-white/5">
                          <span className="text-sm">{home?.flag}{away?.flag}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-bold text-white/70 truncate">
                              {home?.shortName} vs {away?.shortName}
                            </p>
                            <p className="text-[7px] text-white/25">
                              Picked: {pick.result === 'H' ? home?.shortName : pick.result === 'A' ? away?.shortName : 'Draw'}
                              {pick.homeScore !== undefined && ` (${pick.homeScore}–${pick.awayScore})`}
                            </p>
                          </div>
                          {finished ? (
                            <span className={`text-[8px] font-black ${correct ? 'text-green-400' : 'text-red-400'}`}>
                              {correct ? `+${POINTS.correctResult}` : '0'} pts
                            </span>
                          ) : (
                            <span className="text-[7px] text-white/20">Pending</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <p className="text-xs text-white/20">Make your first pick to see history</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WorldCupPicksHub;
