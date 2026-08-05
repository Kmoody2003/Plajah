import React, { useMemo, useState, useEffect } from 'react';
import { scoreText } from '../src/lib/scoreText';
import { motion } from 'motion/react';
import { fetchBracket, WC_ROUND_LABEL, type WCRound, type WCLiveMatch, type WCLiveTeam } from '../services/worldCupLive';

// Knockout rounds in visual order — now driven by the REAL live ESPN bracket.
const KNOCKOUT_ROUNDS: WCRound[] = ['R32', 'R16', 'QF', 'SF', 'FINAL', '3RD'];

const EMPTY: Record<WCRound, WCLiveMatch[]> = { GROUP: [], R32: [], R16: [], QF: [], SF: [], FINAL: [], '3RD': [] };

// Tidy up ESPN's placeholder feeder names ("Round of 16 W7" → "R16 W7").
function feederLabel(name: string): string {
  return (name || 'TBD')
    .replace(/Round of 16/i, 'R16').replace(/Round of 32/i, 'R32')
    .replace(/Quarterfinal/i, 'QF').replace(/Semifinal/i, 'SF')
    .replace(/\bWinner\b/i, 'W').replace(/\bLoser\b/i, 'L')
    .trim();
}

// ── Single bracket match card ─────────────────────────────────────────────────
const BracketSlot: React.FC<{ match: WCLiveMatch; compact?: boolean }> = ({ match, compact }) => {
  const hasScore = match.home.score !== undefined && match.away.score !== undefined;
  const isLive = match.state === 'in';

  const teamRow = (team: WCLiveTeam) => (
    <div className={`flex items-center gap-2 py-1.5 px-2 transition-all ${team.winner ? 'bg-white/[0.08]' : ''}`}>
      <span className={`leading-none shrink-0 ${compact ? 'text-sm' : 'text-base'}`}>
        {team.tbd
          ? <span className="w-4 h-4 rounded bg-white/8 inline-block" />
          : team.flag
            ? team.flag
            : team.logo
              ? <img src={team.logo} alt="" className="w-4 h-4 object-contain" loading="lazy" />
              : <span className="w-4 h-4 rounded bg-white/10 inline-block" />}
      </span>
      <span className={`flex-1 font-black truncate ${compact ? 'text-[8px]' : 'text-[9px]'} ${team.tbd ? 'text-white/25 italic' : team.winner ? 'text-white' : 'text-white/60'}`}>
        {team.tbd ? feederLabel(team.name) : (team.abbr || team.name)}
      </span>
      {hasScore && !team.tbd && (
        <span className={`font-black ${compact ? 'text-xs' : 'text-sm'} ${team.winner ? 'text-white' : 'text-white/40'}`}>
          {scoreText(team.score)}
        </span>
      )}
    </div>
  );

  return (
    <div className={`rounded-xl border overflow-hidden min-w-[104px] ${
      isLive ? 'border-red-500/40 bg-red-500/5 shadow-[0_0_12px_rgba(239,68,68,0.12)]' : 'border-white/10 bg-white/[0.04]'
    }`}>
      {isLive && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20">
          <span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />
          <span className="text-[6px] font-black uppercase text-red-400">{match.detail || 'Live'}</span>
        </div>
      )}
      {!hasScore && !isLive && match.dateMs > 0 && (
        <div className="px-2 pt-1">
          <span className="text-[6px] text-white/25">{new Date(match.dateMs).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </div>
      )}
      <div className="divide-y divide-white/8">
        {teamRow(match.home)}
        {teamRow(match.away)}
      </div>
      {match.note && (
        <div className="px-2 py-0.5 bg-[#FF8C00]/10"><span className="text-[6px] font-bold text-[#FF8C00]/80">{match.note}</span></div>
      )}
      {match.city && !match.note && (
        <div className="px-2 pb-1"><span className="text-[6px] text-white/20">{match.city}</span></div>
      )}
    </div>
  );
};

// ── Round column ──────────────────────────────────────────────────────────────
const RoundColumn: React.FC<{ round: WCRound; matches: WCLiveMatch[] }> = ({ round, matches }) => (
  <div className="flex flex-col gap-1 min-w-[120px]">
    <div className="px-1 mb-2 text-center">
      <p className="text-[7px] font-black uppercase tracking-[0.25em] text-white/30">{WC_ROUND_LABEL[round]}</p>
      <p className="text-[6px] text-white/15">{matches.length} match{matches.length !== 1 ? 'es' : ''}</p>
    </div>
    <div className="flex flex-col gap-2">
      {matches.map((m, i) => (
        <motion.div key={m.id ?? i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
          <BracketSlot match={m} compact={round === 'R32'} />
        </motion.div>
      ))}
      {matches.length === 0 && (
        <div className="text-center py-8"><p className="text-[8px] text-white/15">Draws pending</p></div>
      )}
    </div>
  </div>
);

// ── Champion display ───────────────────────────────────────────────────────────
const ChampionDisplay: React.FC<{ final?: WCLiveMatch }> = ({ final }) => {
  const champ = final && final.finished
    ? (final.home.winner ? final.home : final.away.winner ? final.away : undefined)
    : undefined;
  return (
    <div className="flex flex-col items-center gap-2 min-w-[90px]">
      <p className="text-[7px] font-black uppercase tracking-[0.25em] text-[#FF8C00] mb-2">Champion</p>
      <div className="w-20 h-20 rounded-2xl border-2 border-[#FF8C00]/40 bg-[#FF8C00]/10 flex items-center justify-center"
        style={champ?.color ? { borderColor: `${champ.color}66` } : {}}>
        {champ
          ? (champ.flag ? <span className="text-4xl">{champ.flag}</span> : champ.logo ? <img src={champ.logo} alt="" className="w-12 h-12 object-contain" /> : <span className="text-2xl">🏆</span>)
          : <span className="text-2xl opacity-20">🏆</span>}
      </div>
      {champ ? (
        <div className="text-center">
          <p className="text-xs font-black text-white">{champ.name}</p>
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
  const [rounds, setRounds] = useState<Record<WCRound, WCLiveMatch[]>>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let a = true;
    const load = () => fetchBracket().then(r => { if (a) { setRounds(r); setLoaded(true); } }).catch(() => setLoaded(true));
    load();
    const id = setInterval(load, 60_000);
    return () => { a = false; clearInterval(id); };
  }, []);

  const totalSet = useMemo(
    () => KNOCKOUT_ROUNDS.reduce((n, r) => n + rounds[r].filter(m => !m.home.tbd && !m.away.tbd).length, 0),
    [rounds],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[8px] font-black uppercase tracking-[0.3em] text-[#FF8C00]">Knockout Stage · Live</p>
          <p className="text-xs text-white/35 mt-0.5">
            {!loaded ? 'Loading bracket…' : totalSet > 0 ? `${totalSet} matchups set` : 'Draws published after the group stage'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 rounded-xl">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          <span className="text-[8px] font-bold text-white/40">Auto-updates</span>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[7px] text-white/25 font-bold uppercase tracking-wider">
        {[{ c: 'bg-red-500 animate-pulse', l: 'Live' }, { c: 'bg-white/30', l: 'Scheduled' }, { c: 'bg-[#FF8C00]', l: 'Complete' }].map(x => (
          <div key={x.l} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${x.c}`} />{x.l}</div>
        ))}
      </div>

      <div className="overflow-x-auto pb-4 -mx-1 px-1">
        <div className="flex items-start gap-4 min-w-max py-2">
          <RoundColumn round="R32" matches={rounds.R32.slice(0, 8)} />
          <RoundColumn round="R16" matches={rounds.R16.slice(0, 4)} />
          <RoundColumn round="QF" matches={rounds.QF.slice(0, 2)} />
          <RoundColumn round="SF" matches={rounds.SF.slice(0, 1)} />
          <div className="flex flex-col items-center gap-4 pt-4">
            <RoundColumn round="FINAL" matches={rounds.FINAL} />
            <ChampionDisplay final={rounds.FINAL[0]} />
            <RoundColumn round="3RD" matches={rounds['3RD']} />
          </div>
          <RoundColumn round="SF" matches={rounds.SF.slice(1, 2)} />
          <RoundColumn round="QF" matches={rounds.QF.slice(2, 4)} />
          <RoundColumn round="R16" matches={rounds.R16.slice(4, 8)} />
          <RoundColumn round="R32" matches={rounds.R32.slice(8, 16)} />
        </div>
      </div>

      <details className="group">
        <summary className="cursor-pointer text-[8px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors py-2">View as list ▼</summary>
        <div className="mt-3 space-y-6">
          {KNOCKOUT_ROUNDS.map(r => rounds[r].length > 0 && (
            <div key={r}>
              <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/40 mb-2">{WC_ROUND_LABEL[r]}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {rounds[r].map((m, i) => <BracketSlot key={m.id ?? i} match={m} />)}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
};

export default WorldCupBracket;
