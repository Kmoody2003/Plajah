import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Calendar, Globe, Headphones, Lock, ChevronRight, MapPin, Clock, Mic2 } from 'lucide-react';
import {
  WC26_TEAMS, WC26_MATCHES, WC26_GROUPS, WC26_PODCASTS,
  getTeam, getTeamsByGroup, getGroupMatches, getUpcomingMatches, getLiveMatches,
  ROUND_LABELS, type WC26Match, type WC26Group,
} from '../data/worldCup2026';
import WorldCupCountryHub from './WorldCupCountryHub';
import WorldCupPredictionMarket from './WorldCupPredictionMarket';
import { UserProfile } from '../types';

// ── Feature flag — flip to true when prediction market is ready to ship ───────
const PREDICTIONS_LIVE = false;

type HubTab = 'groups' | 'schedule' | 'countries' | 'podcast' | 'predictions';

interface Props {
  currentUser: UserProfile | null;
}

// ── Match card ─────────────────────────────────────────────────────────────────
const MatchCard: React.FC<{ match: WC26Match; onOpenRoom?: (matchId: string) => void }> = ({ match, onOpenRoom }) => {
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  if (!home || !away) return null;

  const now = Date.now();
  const isLive = match.status === 'LIVE' ||
    (match.kickoffMs <= now && match.kickoffMs > now - 110 * 60 * 1000 && match.status === 'SCHEDULED');
  const isPast = match.status === 'FINISHED' || (!isLive && match.kickoffMs < now);
  const kickoff = new Date(match.kickoffMs);
  const timeStr = kickoff.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = kickoff.toLocaleDateString([], { month: 'short', day: 'numeric' });

  return (
    <motion.div
      layout
      className={`p-4 rounded-2xl border transition-all ${isLive
        ? 'bg-red-500/8 border-red-500/25 shadow-[0_0_20px_rgba(239,68,68,0.08)]'
        : 'bg-white/[0.03] border-white/8 hover:bg-white/[0.06] hover:border-white/15'
      }`}
    >
      {/* Round + live badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30">
          {match.group ? `Group ${match.group}` : ROUND_LABELS[match.round]}
        </span>
        {isLive ? (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded-full">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            <span className="text-[8px] font-black uppercase text-red-400">Live</span>
          </span>
        ) : (
          <span className="text-[8px] font-bold text-white/25">{dateStr} · {timeStr}</span>
        )}
      </div>

      {/* Teams */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 text-right">
          <p className="text-2xl leading-none mb-1">{home.flag}</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-white/70">{home.shortName}</p>
        </div>
        <div className="px-3 py-1.5 bg-white/5 rounded-xl text-center min-w-[52px]">
          {(match.homeScore !== undefined && match.awayScore !== undefined)
            ? <span className="text-sm font-black text-white">{match.homeScore} – {match.awayScore}</span>
            : <span className="text-xs font-bold text-white/30">vs</span>
          }
        </div>
        <div className="flex-1 text-left">
          <p className="text-2xl leading-none mb-1">{away.flag}</p>
          <p className="text-[9px] font-black uppercase tracking-wider text-white/70">{away.shortName}</p>
        </div>
      </div>

      {/* Venue */}
      <div className="flex items-center justify-center gap-1 mt-3">
        <MapPin size={9} className="text-white/20" />
        <span className="text-[8px] text-white/20">{match.city}</span>
      </div>

      {/* Live room button */}
      {(isLive || match.status === 'SCHEDULED') && onOpenRoom && (
        <button
          onClick={() => onOpenRoom(match.id)}
          className={`w-full mt-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isLive
            ? 'bg-red-500 text-white hover:bg-red-400'
            : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 hover:text-white/70'
          }`}
        >
          {isLive ? '⚡ Watch Live Room' : 'Open Fan Room'}
        </button>
      )}
    </motion.div>
  );
};

// ── Group table ────────────────────────────────────────────────────────────────
const GroupTable: React.FC<{ group: WC26Group }> = ({ group }) => {
  const teams = getTeamsByGroup(group);
  return (
    <div className="bg-white/[0.03] border border-white/8 rounded-2xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-white/8 flex items-center gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40">Group</span>
        <span className="text-sm font-black text-white">{group}</span>
      </div>
      <div className="divide-y divide-white/5">
        {teams.map(team => (
          <div key={team.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="text-lg leading-none">{team.flag}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black text-white truncate">{team.name}</p>
              <p className="text-[8px] text-white/30 uppercase tracking-wider">{team.confederation}</p>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-bold text-white/30">
              <span>P</span><span>W</span><span>D</span><span>L</span><span className="text-white/50">Pts</span>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-black text-white">
              <span>0</span><span>0</span><span>0</span><span>0</span><span className="text-[#FF8C00]">0</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Country grid card ──────────────────────────────────────────────────────────
const CountryCard: React.FC<{ team: typeof WC26_TEAMS[0]; onClick: () => void }> = ({ team, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.04 }}
    whileTap={{ scale: 0.97 }}
    onClick={onClick}
    className="relative overflow-hidden rounded-2xl border border-white/8 group aspect-[3/4]"
    style={{ background: `linear-gradient(135deg, ${team.primaryColor}33, ${team.secondaryColor}22)` }}
  >
    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
    <div className="relative h-full flex flex-col items-center justify-center gap-2 p-3">
      <span className="text-4xl leading-none">{team.flag}</span>
      <div className="text-center">
        <p className="text-[9px] font-black text-white uppercase tracking-widest">{team.shortName}</p>
        <p className="text-[7px] text-white/40 uppercase tracking-wider mt-0.5">Group {team.group}</p>
      </div>
    </div>
    <div
      className="absolute bottom-0 left-0 right-0 h-1"
      style={{ background: team.primaryColor }}
    />
  </motion.button>
);

// ── Podcast card ───────────────────────────────────────────────────────────────
const PodcastCard: React.FC<{ podcast: typeof WC26_PODCASTS[0]; onImport?: () => void }> = ({ podcast, onImport }) => (
  <div className="flex gap-3 p-3 bg-white/[0.03] border border-white/8 rounded-2xl hover:bg-white/[0.06] transition-colors group">
    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-white/10">
      <img src={podcast.coverUrl} alt={podcast.title} className="w-full h-full object-cover" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-black text-white truncate">{podcast.title}</p>
      <p className="text-[9px] text-white/35 line-clamp-2 mt-0.5 leading-relaxed">{podcast.description}</p>
      <span className="inline-block mt-1.5 px-2 py-0.5 bg-white/8 rounded-full text-[7px] font-black text-white/40 uppercase tracking-wider">{podcast.language}</span>
    </div>
    {onImport && (
      <button
        onClick={onImport}
        className="shrink-0 self-center px-3 py-1.5 bg-[#FF8C00]/15 border border-[#FF8C00]/30 rounded-xl text-[9px] font-black text-[#FF8C00] hover:bg-[#FF8C00]/25 transition-colors"
      >
        Add
      </button>
    )}
  </div>
);

// ── Main hub ──────────────────────────────────────────────────────────────────
const WorldCupHub: React.FC<Props> = ({ currentUser }) => {
  const [tab, setTab] = useState<HubTab>('groups');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  const upcoming = useMemo(() => getUpcomingMatches(12), []);
  const live = useMemo(() => getLiveMatches(), []);

  const now = Date.now();
  const tournamentStart = new Date('2026-06-11T18:00:00-05:00').getTime();
  const tournamentEnd   = new Date('2026-07-19T18:00:00-05:00').getTime();
  const msLeft = tournamentStart - now;
  const daysLeft = Math.max(0, Math.floor(msLeft / 86_400_000));
  const hoursLeft = Math.max(0, Math.floor((msLeft % 86_400_000) / 3_600_000));
  const isLive = now >= tournamentStart && now <= tournamentEnd;

  const TABS: { id: HubTab; label: string; icon: React.ElementType; hidden?: boolean }[] = [
    { id: 'groups',      label: 'Groups',      icon: Trophy },
    { id: 'schedule',    label: 'Schedule',     icon: Calendar },
    { id: 'countries',   label: 'Countries',    icon: Globe },
    { id: 'podcast',     label: 'Podcast',      icon: Headphones },
    { id: 'predictions', label: 'Predictions',  icon: Lock, hidden: !PREDICTIONS_LIVE },
  ];

  if (selectedCountry) {
    const team = getTeam(selectedCountry);
    if (team) {
      return (
        <WorldCupCountryHub
          team={team}
          currentUser={currentUser}
          onBack={() => setSelectedCountry(null)}
        />
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Hero banner ── */}
      <div
        className="relative rounded-[2rem] overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #000B18 0%, #001A35 50%, #000B18 100%)' }}
      >
        {/* Trophy watermark */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[120px] leading-none opacity-[0.07] select-none pointer-events-none">🏆</div>

        <div className="relative px-8 py-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="flex-1">
            <p className="text-[8px] font-black uppercase tracking-[0.5em] text-[#FF8C00] mb-2">FIFA</p>
            <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-[0.9] text-white">
              World Cup<br />
              <span style={{ color: '#FF8C00' }}>2026™</span>
            </h1>
            <p className="text-xs text-white/40 mt-3 leading-relaxed">USA · Canada · Mexico · June 11 – July 19</p>
          </div>

          {/* Countdown / live badge */}
          <div className="shrink-0">
            {isLive ? (
              <div className="flex items-center gap-2 px-5 py-3 bg-red-500/15 border border-red-500/30 rounded-2xl">
                <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm font-black text-red-400 uppercase tracking-widest">Live Now</span>
              </div>
            ) : msLeft > 0 ? (
              <div className="text-center">
                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-white/30 mb-2">Kicks off in</p>
                <div className="flex items-end gap-2">
                  <div className="text-center px-3 py-2 bg-white/5 rounded-xl">
                    <p className="text-3xl font-black text-white leading-none">{daysLeft}</p>
                    <p className="text-[7px] text-white/30 uppercase tracking-wider mt-1">days</p>
                  </div>
                  <span className="text-2xl font-black text-white/20 mb-1">:</span>
                  <div className="text-center px-3 py-2 bg-white/5 rounded-xl">
                    <p className="text-3xl font-black text-white leading-none">{hoursLeft}</p>
                    <p className="text-[7px] text-white/30 uppercase tracking-wider mt-1">hrs</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-2 bg-white/5 rounded-xl">
                <p className="text-xs font-bold text-white/30">Tournament Ended</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats strip */}
        <div className="border-t border-white/8 px-8 py-3 flex items-center gap-8 text-center">
          {[
            { label: 'Nations', value: '48' },
            { label: 'Groups',  value: '12' },
            { label: 'Matches', value: '104' },
            { label: 'Days',    value: '39' },
          ].map(s => (
            <div key={s.label}>
              <p className="text-base font-black text-white">{s.value}</p>
              <p className="text-[7px] font-black uppercase tracking-[0.3em] text-white/30">{s.label}</p>
            </div>
          ))}
          {live.length > 0 && (
            <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-red-500/15 border border-red-500/25 rounded-xl">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black text-red-400">{live.length} Match{live.length > 1 ? 'es' : ''} Live</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab nav ── */}
      <div className="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/8 rounded-2xl">
        {TABS.filter(t => !t.hidden).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              tab === t.id
                ? 'bg-[#FF8C00] text-black shadow-lg shadow-[#FF8C00]/25'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {React.createElement(t.icon as any, { size: 11 })}
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {/* GROUPS */}
          {tab === 'groups' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {WC26_GROUPS.map(g => <GroupTable key={g} group={g} />)}
            </div>
          )}

          {/* SCHEDULE */}
          {tab === 'schedule' && (
            <div className="space-y-3">
              {live.length > 0 && (
                <div className="mb-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 mb-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" /> Live
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {live.map(m => <MatchCard key={m.id} match={m} onOpenRoom={() => {}} />)}
                  </div>
                </div>
              )}
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-3 flex items-center gap-2">
                <Clock size={10} /> Upcoming
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcoming.map(m => <MatchCard key={m.id} match={m} onOpenRoom={() => {}} />)}
              </div>
              {upcoming.length === 0 && (
                <div className="py-16 text-center">
                  <Trophy size={32} className="text-white/10 mx-auto mb-3" />
                  <p className="text-sm text-white/30">No upcoming matches</p>
                </div>
              )}
            </div>
          )}

          {/* COUNTRIES */}
          {tab === 'countries' && (
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mb-4">
                48 Nations · Tap to open fan hub
              </p>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {WC26_TEAMS.map(team => (
                  <CountryCard
                    key={team.id}
                    team={team}
                    onClick={() => setSelectedCountry(team.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* PODCAST */}
          {tab === 'podcast' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FF8C00] mb-1 flex items-center gap-2">
                    <Mic2 size={10} /> Football Podcasts
                  </p>
                  <p className="text-xs text-white/35">Curated World Cup 2026 coverage — add any feed to your library</p>
                </div>
              </div>
              <div className="space-y-2">
                {WC26_PODCASTS.map(pod => (
                  <PodcastCard key={pod.rssUrl} podcast={pod} onImport={() => {}} />
                ))}
              </div>
            </div>
          )}

          {/* PREDICTIONS — hidden until PREDICTIONS_LIVE flag */}
          {tab === 'predictions' && PREDICTIONS_LIVE && (
            <WorldCupPredictionMarket currentUser={currentUser} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WorldCupHub;
