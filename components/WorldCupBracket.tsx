import React, { useMemo, useState, useEffect } from 'react';
import { scoreText } from '../src/lib/scoreText';
import { motion } from 'motion/react';
import { WC26_MATCHES, WC26_TEAMS, getTeam, ROUND_LABELS, type WC26Round } from '../data/worldCup2026';
import { fetchLiveResults, resultForTeams, type LiveResult } from '../services/worldCupDepth';

// The WC 2026 knockout rounds in visual order
const KNOCKOUT_ROUNDS: WC26Round[] = ['R32', 'R16', 'QF', 'SF', 'FINAL', '3RD'];

interface SlotTeam {
  teamId?: string;
  score?: number;
  winner?: boolean;
}
interface BracketMatch {
  matchId?: string;
  home: SlotTeam;
  away: SlotTeam;
  venue?: string;
  city?: string;
  kickoffMs?: number;
  status?: string;
}

function getMatchesByRound(round: WC26Round, results: LiveResult[] = []): BracketMatch[] {
  const real = WC26_MATCHES.filter(m => m.round === round).sort((a, b) => a.kickoffMs - b.kickoffMs);
  if (real.length > 0) {
    return real.map(m => {
      // Overlay live ESPN scores when both teams are known.
      let hs = m.homeScore, as = m.awayScore, status = m.status;
      const ht = getTeam(m.homeTeamId), at = getTeam(m.awayTeamId);
      if (ht && at && results.length) {
        const r = resultForTeams(results, ht.name, at.name);
        if (r) { hs = r.homeScore; as = r.awayScore; status = (r.finished ? 'FINISHED' : r.state === 'in' ? 'LIVE' : status) as typeof status; }
      }
      const home = hs !== undefined ? { teamId: m.homeTeamId, score: hs, winner: hs! > as! } : { teamId: m.homeTeamId };
      const away = as !== undefined ? { teamId: m.awayTeamId, score: as, winner: as! > hs! } : { teamId: m.awayTeamId };
      return { matchId: m.id, home, away, venue: m.venue, city: m.city, kickoffMs: m.kickoffMs, status };
    });
  }
  // Placeholder slots
  const counts: Record<WC26Round, number> = { GROUP: 0, R32: 16, R16: 8, QF: 4, SF: 2, FINAL: 1, '3RD': 1 };
  return Array.from({ length: counts[round] || 0 }, (_, i) => ({
    matchId: undefined,
    home: {},
    away: {},
  }));
}

// ── Single bracket match card ─────────────────────────────────────────────────
const BracketSlot: React.FC<{ match: BracketMatch; accent: string; compact?: boolean }> = ({ match, accent, compact }) => {
  const homeTeam = match.home.teamId ? getTeam(match.home.teamId) : null;
  const awayTeam = match.away.teamId ? getTeam(match.away.teamId) : null;
  const hasScore  = match.home.score !== undefined && match.away.score !== undefined;
  const isLive    = match.status === 'LIVE';

  const renderTeamRow = (team: typeof homeTeam, slot: SlotTeam) => (
    <div className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all ${slot.winner ? 'bg-white/[0.07]' : ''}`}>
      <span className={`text-base leading-none ${compact ? 'text-sm' : ''}`}>
        {team?.flag ?? <span className="w-5 h-5 rounded bg-white/10 inline-block" />}
      </span>
      <span className={`flex-1 font-black text-white truncate ${compact ? 'text-[8px]' : 'text-[9px]'} ${slot.winner ? '' : 'opacity-70'}`}>
        {team?.shortName ?? '—'}
      </span>
      {hasScore && (
        <span className={`font-black ${compact ? 'text-xs' : 'text-sm'} ${slot.winner ? 'text-white' : 'text-white/40'}`}>
          {scoreText(slot.score)}
        </span>
      )}
    </div>
  );

  return (
    <div className={`rounded-xl border overflow-hidden min-w-[100px] ${
      isLive
        ? 'border-red-500/40 bg-red-500/5 shadow-[0_0_12px_rgba(239,68,68,0.1)]'
        : 'border-white/10 bg-white/[0.04]'
    }`}>
      {isLive && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20">
          <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[6px] font-black uppercase text-red-400">Live</span>
        </div>
      )}
      {!hasScore && match.kickoffMs && (
        <div className="px-2 pt-1">
          <span className="text-[6px] text-white/25">
            {new Date(match.kickoffMs).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
        </div>
      )}
      <div className="divide-y divide-white/8">
        {renderTeamRow(homeTeam, match.home)}
        {renderTeamRow(awayTeam, match.away)}
      </div>
      {match.city && (
        <div className="px-2 pb-1">
          <span className="text-[6px] text-white/20">{match.city}</span>
        </div>
      )}
    </div>
  );
};

// ── Round column ──────────────────────────────────────────────────────────────
const RoundColumn: React.FC<{ round: WC26Round; matches: BracketMatch[]; accent: string }> = ({ round, matches, accent }) => {
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="px-1 mb-2 text-center">
        <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/30">{ROUND_LABELS[round]}</p>
        <p className="text-[6px] text-white/15">{matches.length} match{matches.length !== 1 ? 'es' : ''}</p>
      </div>
      <div className="flex flex-col gap-2">
        {matches.map((m, i) => (
          <motion.div
            key={m.matchId ?? i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <BracketSlot match={m} accent={accent} compact={round === 'R32'} />
          </motion.div>
        ))}
        {matches.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[8px] text-white/15">Draws pending</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Champion display ───────────────────────────────────────────────────────────
const ChampionDisplay: React.FC<{ matches: BracketMatch[] }> = ({ matches }) => {
  const final = matches[0];
  const winner = final?.home.winner ? final.home.teamId : final?.away.winner ? final.away.teamId : undefined;
  const champion = winner ? getTeam(winner) : null;

  return (
    <div className="flex flex-col items-center gap-2 min-w-[90px]">
      <p className="text-[7px] font-black uppercase tracking-[0.25em] text-[#FF8C00] mb-2">Champion</p>
      <div
        className="w-20 h-20 rounded-2xl border-2 border-[#FF8C00]/40 bg-[#FF8C00]/10 flex items-center justify-center"
        style={champion ? { borderColor: `${getTeam(winner!)?.primaryColor ?? '#FF8C00'}66` } : {}}
      >
        {champion ? (
          <span className="text-4xl">{champion.flag}</span>
        ) : (
          <span className="text-2xl opacity-20">🏆</span>
        )}
      </div>
      {champion ? (
        <div className="text-center">
          <p className="text-xs font-black text-white">{champion.shortName}</p>
          <p className="text-[7px] text-[#FF8C00] font-bold">🏆 Champions</p>
        </div>
      ) : (
        <p className="text-[7px] text-white/20 text-center">TBD after Final</p>
      )}
    </div>
  );
};

// ── Main bracket ──────────────────────────────────────────────────────────────
const WorldCupBracket: React.FC = () => {
  const [results, setResults] = useState<LiveResult[]>([]);
  useEffect(() => {
    let a = true;
    const load = () => fetchLiveResults().then(r => { if (a) setResults(r || []); }).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => { a = false; clearInterval(id); };
  }, []);
  const rounds = useMemo(() =>
    KNOCKOUT_ROUNDS.reduce<Record<WC26Round, BracketMatch[]>>((acc, r) => {
      acc[r] = getMatchesByRound(r, results);
      return acc;
    }, {} as any),
    [results]
  );

  const totalSet = KNOCKOUT_ROUNDS.reduce((n, r) => {
    return n + rounds[r].filter(m => m.matchId).length;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FF8C00]">Knockout Stage</p>
          <p className="text-xs text-white/35 mt-0.5">
            {totalSet > 0 ? `${totalSet} matches drawn` : 'Draws published after group stage · June 2026'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-xl">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          <span className="text-[8px] font-bold text-white/40">Auto-updates</span>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 text-[7px] text-white/25 font-bold uppercase tracking-wider">
        {[
          { color: 'bg-red-500 animate-pulse', label: 'Live' },
          { color: 'bg-white/30', label: 'Scheduled' },
          { color: 'bg-[#FF8C00]', label: 'Complete' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${l.color}`} />
            {l.label}
          </div>
        ))}
      </div>

      {/* ── Scrollable bracket ── */}
      <div className="overflow-x-auto pb-4 -mx-1 px-1">
        <div className="flex items-start gap-4 min-w-max py-2">
          {/* Left side: R32 + R16 + QF left half */}
          <RoundColumn round="R32" matches={rounds.R32.slice(0, 8)} accent="#FF8C00" />
          <RoundColumn round="R16" matches={rounds.R16.slice(0, 4)} accent="#FF8C00" />
          <RoundColumn round="QF"  matches={rounds.QF.slice(0, 2)}  accent="#FF8C00" />
          <RoundColumn round="SF"  matches={rounds.SF.slice(0, 1)}  accent="#FF8C00" />

          {/* Center: Final + Champion */}
          <div className="flex flex-col items-center gap-4 pt-4">
            <RoundColumn round="FINAL" matches={rounds.FINAL} accent="#FF8C00" />
            <ChampionDisplay matches={rounds.FINAL} />
            <RoundColumn round="3RD" matches={rounds['3RD']} accent="#6B7280" />
          </div>

          {/* Right side: mirror */}
          <RoundColumn round="SF"  matches={rounds.SF.slice(1, 2)}  accent="#FF8C00" />
          <RoundColumn round="QF"  matches={rounds.QF.slice(2, 4)}  accent="#FF8C00" />
          <RoundColumn round="R16" matches={rounds.R16.slice(4, 8)} accent="#FF8C00" />
          <RoundColumn round="R32" matches={rounds.R32.slice(8, 16)} accent="#FF8C00" />
        </div>
      </div>

      {/* ── Mobile-friendly linear fallback ── */}
      <details className="group">
        <summary className="cursor-pointer text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors py-2">
          View as list ▼
        </summary>
        <div className="mt-3 space-y-6">
          {KNOCKOUT_ROUNDS.map(r => (
            rounds[r].length > 0 && (
              <div key={r}>
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">{ROUND_LABELS[r]}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {rounds[r].map((m, i) => (
                    <BracketSlot key={m.matchId ?? i} match={m} accent="#FF8C00" />
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </details>
    </div>
  );
};

export default WorldCupBracket;
