import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Clock, Trophy, MapPin } from 'lucide-react';
import { scoreText } from '../src/lib/scoreText';
import { fetchScheduleBuckets, WC_ROUND_LABEL, type WCLiveMatch, type WCLiveTeam } from '../services/worldCupLive';

const openMatch = (m: WCLiveMatch) =>
  window.dispatchEvent(new CustomEvent('plajah:open-wc-match', { detail: { id: m.id, title: `${m.home.name} vs ${m.away.name}` } }));

const TeamRow: React.FC<{ team: WCLiveTeam; showScore: boolean }> = ({ team, showScore }) => (
  <div className="flex items-center gap-2 flex-1 min-w-0">
    <span className="text-lg leading-none shrink-0">
      {team.flag ? team.flag
        : team.logo ? <img src={team.logo} alt="" className="w-5 h-5 object-contain" loading="lazy" />
        : <span className="w-5 h-5 rounded bg-white/10 inline-block" />}
    </span>
    <span className={`font-black uppercase tracking-tight truncate text-[11px] ${team.winner ? 'text-white' : 'text-white/70'}`}>{team.name}</span>
    {showScore && team.score !== undefined && (
      <span className={`ml-auto font-black text-sm ${team.winner ? 'text-white' : 'text-white/40'}`}>{scoreText(team.score)}</span>
    )}
  </div>
);

const MatchRow: React.FC<{ match: WCLiveMatch }> = ({ match }) => {
  const done = match.finished;
  const live = match.state === 'in';
  const label = match.round === 'GROUP' ? (match.group ? `Group ${match.group.replace(/group\s*/i, '')}` : 'Group Stage') : WC_ROUND_LABEL[match.round];
  return (
    <motion.button
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      onClick={() => openMatch(match)}
      className={`w-full text-left rounded-2xl border p-3 transition-all ${live ? 'border-red-500/40 bg-red-500/[0.06]' : 'border-white/8 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[7px] font-black uppercase tracking-[0.3em] text-[#FF8C00]/70">{label}</span>
        {live ? <span className="flex items-center gap-1 text-[7px] font-black uppercase text-red-400"><span className="w-1 h-1 bg-red-500 rounded-full animate-pulse" />{match.detail || 'Live'}</span>
          : done ? <span className="text-[7px] font-black uppercase text-white/30">Full-time</span>
          : <span className="text-[7px] font-bold text-white/40">{match.dateMs ? new Date(match.dateMs).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</span>}
      </div>
      <div className="space-y-1.5">
        <TeamRow team={match.home} showScore={done || live} />
        <TeamRow team={match.away} showScore={done || live} />
      </div>
      {(match.note || match.venue) && (
        <div className="mt-2 pt-2 border-t border-white/5 flex items-center gap-1.5">
          {match.note
            ? <span className="text-[7px] font-bold text-[#FF8C00]/80">{match.note}</span>
            : <><MapPin size={8} className="text-white/20" /><span className="text-[7px] text-white/30 truncate">{match.venue}{match.city ? ` · ${match.city}` : ''}</span></>}
        </div>
      )}
    </motion.button>
  );
};

const WorldCupScheduleLive: React.FC = () => {
  const [buckets, setBuckets] = useState<{ live: WCLiveMatch[]; upcoming: WCLiveMatch[]; recent: WCLiveMatch[] }>({ live: [], upcoming: [], recent: [] });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let a = true;
    const load = () => fetchScheduleBuckets().then(b => { if (a) { setBuckets(b); setLoaded(true); } }).catch(() => setLoaded(true));
    load();
    const id = setInterval(load, 60_000);
    return () => { a = false; clearInterval(id); };
  }, []);

  // Group upcoming by calendar day for a clean fixture list.
  const upcomingByDay = useMemo(() => {
    const map = new Map<string, WCLiveMatch[]>();
    for (const m of buckets.upcoming) {
      const key = m.dateMs ? new Date(m.dateMs).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : 'TBD';
      (map.get(key) ?? map.set(key, []).get(key)!).push(m);
    }
    return [...map.entries()];
  }, [buckets.upcoming]);

  if (!loaded) return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{[...Array(6)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}</div>;

  return (
    <div className="space-y-6">
      {buckets.live.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 mb-3 flex items-center gap-2"><span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> Live Now</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{buckets.live.map(m => <MatchRow key={m.id} match={m} />)}</div>
        </div>
      )}

      {upcomingByDay.length > 0 && (
        <div className="space-y-4">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 flex items-center gap-2"><Clock size={10} /> Upcoming Fixtures</p>
          {upcomingByDay.map(([day, ms]) => (
            <div key={day} className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40">{day}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{ms.map(m => <MatchRow key={m.id} match={m} />)}</div>
            </div>
          ))}
        </div>
      )}

      {buckets.recent.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 flex items-center gap-2"><Trophy size={10} /> Recent Results</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{buckets.recent.map(m => <MatchRow key={m.id} match={m} />)}</div>
        </div>
      )}

      {buckets.live.length === 0 && buckets.upcoming.length === 0 && buckets.recent.length === 0 && (
        <div className="py-16 text-center"><Trophy size={32} className="text-white/10 mx-auto mb-3" /><p className="text-sm text-white/30">Schedule loading…</p></div>
      )}
    </div>
  );
};

export default WorldCupScheduleLive;
