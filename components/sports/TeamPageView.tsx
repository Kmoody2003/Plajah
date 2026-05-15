import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft, Pin, PinOff, MapPin, Building2, Calendar, Trophy,
  Newspaper, Users, Star, ExternalLink, User, Globe,
  ChevronRight, Clock, TrendingUp, Shield,
} from 'lucide-react';
import {
  fetchRichTeamPage, fetchTeamFullSchedule, fetchPlayerProfile, LEAGUE_CHAMPIONS,
  type SportsTeam, type RichTeamPage, type LegendPlayer,
} from '../../services/sportsService';
import type { StaticTeamData } from '../../data/leagueTeams';

type TeamTab = 'overview' | 'roster' | 'schedule' | 'legends' | 'news' | 'history';

interface Props {
  team: SportsTeam;
  tab: string;
  staticData?: StaticTeamData;
  pinnedIds: string[];
  onBack: () => void;
  onTogglePin: (id: string) => void;
  onSelectPlayer: (p: { id: string; name: string }) => void;
  leagueNews: any[];
}

export const TeamPageView: React.FC<Props> = ({
  team, tab, staticData, pinnedIds, onBack, onTogglePin, onSelectPlayer, leagueNews,
}) => {
  const [activeTab, setActiveTab]         = useState<TeamTab>('overview');
  const [richData, setRichData]           = useState<RichTeamPage | null>(null);
  const [loading, setLoading]             = useState(true);
  const [schedule, setSchedule]           = useState<any[]>([]);
  const [scheduleLoading, setSchLoading]  = useState(false);
  const [historyNews, setHistoryNews]     = useState<any[]>([]);

  const logo      = staticData?.logo      || team.logo;
  const color     = staticData?.color     || team.color     || '#1a1a1a';
  const altColor  = staticData?.altColor  || team.altColor  || '#FF8C00';
  const website   = staticData?.officialWebsite;
  const stadium   = staticData?.stadium   || richData?.stadium || '';
  const city      = staticData?.city      || richData?.city     || team.location;
  const founded   = staticData?.founded   || richData?.founded  || '';
  const desc      = staticData?.description || richData?.description || '';
  const badge     = richData?.badge       || logo;
  const fanart    = richData?.fanart      || '';
  const champions = LEAGUE_CHAMPIONS[tab] ?? [];
  const isPinned  = pinnedIds.includes(team.id);

  // â”€â”€ load rich data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    setLoading(true);
    setRichData(null);
    fetchRichTeamPage(tab, team.id, team.nickname, team.location)
      .then(d => { setRichData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [team.id, tab]);

  // â”€â”€ schedule lazy-load â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (activeTab !== 'schedule') return;
    setSchLoading(true);
    fetchTeamFullSchedule(tab, team.id)
      .then(evts => { setSchedule(evts); setSchLoading(false); })
      .catch(() => setSchLoading(false));
  }, [activeTab, team.id, tab]);

  // â”€â”€ history news â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (activeTab !== 'history') return;
    // use league news filtered for team if rich news empty
    const articles = richData?.news?.length ? richData.news : leagueNews;
    setHistoryNews(articles);
  }, [activeTab, richData, leagueNews]);

  const accentOk = altColor !== '#ffffff' && altColor !== '#FFFFFF';
  const accent = accentOk ? altColor : '#FF8C00';

  const tabs: { id: TeamTab; label: string }[] = [
    { id: 'overview',  label: 'Overview' },
    { id: 'roster',    label: 'Roster' },
    { id: 'schedule',  label: 'Schedule' },
    { id: 'legends',   label: 'Legends' },
    { id: 'news',      label: 'Headlines' },
    { id: 'history',   label: 'History' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative min-h-screen">

      {/* â”€â”€ HERO HEADER â”€ music-page fade style â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative w-full overflow-hidden" style={{ height: '420px' }}>
        {/* blurred cover layer */}
        <div className="absolute inset-0 z-0">
          <img loading="lazy" decoding="async"
            src={fanart || badge || logo}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: 'blur(32px) brightness(0.28) saturate(1.6)' }}
          />
        </div>
        {/* gradient overlay fading to app background */}
        <div
          className="absolute inset-0 z-10"
          style={{
            background: `linear-gradient(to bottom, ${color}18 0%, rgba(0,0,0,0.25) 30%, rgba(0,0,0,0.70) 65%, #000000 100%)`,
            WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, black 0%, black 55%, transparent 100%)',
          }}
        />

        {/* back + pin bar */}
        <div className="absolute top-5 left-5 right-5 z-20 flex items-center gap-3">
          <button onClick={onBack}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-all">
            <ChevronLeft size={12} /> Back
          </button>
          <button onClick={() => onTogglePin(team.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border backdrop-blur-md ${
              isPinned
                ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]'
                : 'bg-black/40 border-white/10 text-white/50 hover:text-white'
            }`}>
            {isPinned ? <><PinOff size={10} /> Unpin</> : <><Pin size={10} /> Pin</>}
          </button>
          {website && (
            <a href={`https://www.${website}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-all ml-auto">
              <Globe size={10} /> Official Site <ExternalLink size={9} />
            </a>
          )}
        </div>

        {/* team identity */}
        <div className="absolute bottom-0 left-0 right-0 z-20 px-6 pb-8 flex items-end gap-6">
          <div className="shrink-0 w-28 h-28 rounded-[2rem] flex items-center justify-center overflow-hidden"
            style={{ background: `${color}30`, border: `1px solid ${color}40` }}>
            <img loading="lazy" decoding="async" src={badge} alt={team.name} className="w-full h-full object-contain p-2 drop-shadow-2xl"
              onError={e => { (e.target as HTMLImageElement).src = logo; }} />
          </div>
          <div className="flex-1 pb-1">
            <p className="text-[9px] font-black uppercase tracking-[0.45em] text-white/35 mb-1">{tab} Â· {staticData?.conference ?? ''}</p>
            <h1 className="text-5xl font-black uppercase tracking-tighter leading-none text-white drop-shadow-2xl">
              {team.location}
            </h1>
            <h2 className="text-3xl font-black uppercase tracking-tight leading-none mt-0.5" style={{ color: accent }}>
              {team.nickname}
            </h2>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {team.record && (
                <span className="px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[9px] font-black uppercase tracking-widest">{team.record}</span>
              )}
              {city && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-white/45">
                  <MapPin size={9} />{city}
                </span>
              )}
              {founded && (
                <span className="text-[9px] font-bold text-white/35">Est. {founded}</span>
              )}
              {stadium && (
                <span className="flex items-center gap-1 text-[9px] font-bold text-white/35">
                  <Building2 size={9} />{stadium}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€ TAB STRIP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-2xl border-b border-white/8 px-5 py-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-5 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                activeTab === t.id
                  ? 'bg-[#FF8C00] text-black shadow-[0_0_18px_rgba(255,140,0,0.35)]'
                  : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* â”€â”€ TAB CONTENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="px-5 py-6">
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-[2rem] bg-white/5 animate-pulse" />)}
          </div>
        )}

        {!loading && (
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

              {/* â”€â”€ OVERVIEW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {desc && (
                    <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/8 space-y-3">
                      <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2"><Newspaper size={10} /> Team History</h4>
                      <p className="text-sm text-white/65 leading-relaxed">{desc}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {city && <StatCard icon={<MapPin size={18} className="text-[#FF8C00]" />} label="City" value={city} />}
                    {founded && <StatCard icon={<Calendar size={18} className="text-[#FF8C00]" />} label="Founded" value={founded} />}
                    {stadium && <StatCard icon={<Building2 size={18} className="text-[#FF8C00]" />} label="Venue" value={stadium} />}
                    {team.record && <StatCard icon={<Trophy size={18} className="text-[#FF8C00]" />} label="Record" value={team.record} />}
                    {staticData?.division && <StatCard icon={<Shield size={18} className="text-[#FF8C00]" />} label="Division" value={staticData.division} />}
                    {website && (
                      <a href={`https://www.${website}`} target="_blank" rel="noopener noreferrer"
                        className="p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8 hover:border-[#FF8C00]/30 hover:bg-white/[0.07] transition-all text-center space-y-1.5 group">
                        <Globe size={18} className="mx-auto text-[#FF8C00]" />
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Website</p>
                        <p className="text-[9px] font-black uppercase text-white/60 group-hover:text-white transition-colors truncate">{website}</p>
                      </a>
                    )}
                  </div>

                  {/* Recent games */}
                  {(richData?.recentGames?.length ?? 0) > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2"><Calendar size={10} /> Recent Games</h4>
                        <button onClick={() => setActiveTab('schedule')} className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00]/60 hover:text-[#FF8C00] transition-colors flex items-center gap-1">Full Schedule <ChevronRight size={10} /></button>
                      </div>
                      <div className="space-y-2">
                        {richData!.recentGames.slice(0, 6).map((game: any, i: number) => {
                          const comps = game.competitions?.[0];
                          const away  = comps?.competitors?.find((c: any) => c.homeAway === 'away');
                          const home  = comps?.competitors?.find((c: any) => c.homeAway === 'home');
                          const done  = comps?.status?.type?.completed;
                          const isHome = home?.team?.id === team.id;
                          const mine   = isHome ? home : away;
                          const opp    = isHome ? away : home;
                          const won    = done && mine?.winner;
                          return (
                            <div key={i} className="flex items-center justify-between px-5 py-3 bg-white/[0.03] rounded-2xl border border-white/5 hover:bg-white/[0.06] transition-all">
                              <div className="flex items-center gap-2">
                                <span className="text-[7px] font-black uppercase text-white/20">{isHome ? 'vs' : '@'}</span>
                                <img loading="lazy" decoding="async" src={opp?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-70" />
                                <span className="text-[9px] font-black uppercase">{opp?.team?.abbreviation}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[8px] font-bold text-white/35">{game.status?.type?.shortDetail || ''}</span>
                                {done && (
                                  <>
                                    <span className="text-[9px] font-black text-white">{away?.score} â€“ {home?.score}</span>
                                    <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full ${won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{won ? 'W' : 'L'}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* â”€â”€ ROSTER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {activeTab === 'roster' && (
                <div className="space-y-6">
                  <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Tap a player to view profile & stats</p>
                  {(!richData?.roster || richData.roster.length === 0) && (
                    <div className="py-16 text-center space-y-3">
                      <Users size={36} className="mx-auto text-white/10" />
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Roster loading...</p>
                    </div>
                  )}
                  {richData?.roster?.map((group, gi) => (
                    <div key={gi} className="space-y-2">
                      <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 px-1">{group.group}</p>
                      <div className="grid gap-2">
                        {group.athletes.map((a: any, ai: number) => (
                          <button key={ai}
                            onClick={() => a.id && onSelectPlayer({ id: String(a.id), name: a.fullName || a.displayName })}
                            className="flex items-center gap-4 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.07] rounded-2xl border border-white/5 hover:border-[#FF8C00]/20 transition-all group text-left w-full">
                            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/10 border border-white/10">
                              {a.headshot?.href
                                ? <img src={a.headshot.href} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                                : <div className="w-full h-full flex items-center justify-center"><User size={14} className="text-white/20" /></div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-black uppercase tracking-tight truncate group-hover:text-[#FF8C00] transition-colors">{a.fullName || a.displayName}</p>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {(a.position?.displayName || a.position?.abbreviation) && <span className="text-[8px] font-bold text-white/40 uppercase">{a.position.displayName || a.position.abbreviation}</span>}
                                {a.jersey && <span className="text-[8px] font-bold text-white/25">#{a.jersey}</span>}
                                {a.age && <span className="text-[8px] font-bold text-white/20">{a.age} yrs</span>}
                              </div>
                            </div>
                            {a.jersey && (
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 border border-white/10" style={{ background: `${color}40` }}>{a.jersey}</div>
                            )}
                            <ChevronRight size={12} className="text-white/15 group-hover:text-[#FF8C00]/50 transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* â”€â”€ SCHEDULE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {activeTab === 'schedule' && (
                <div className="space-y-3">
                  {scheduleLoading && (
                    <div className="space-y-2">{[...Array(10)].map((_, i) => <div key={i} className="h-14 rounded-2xl bg-white/5 animate-pulse" />)}</div>
                  )}
                  {!scheduleLoading && schedule.length === 0 && (
                    <div className="py-16 text-center space-y-3">
                      <Calendar size={36} className="mx-auto text-white/10" />
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Schedule unavailable</p>
                    </div>
                  )}
                  {!scheduleLoading && schedule.length > 0 && (
                    <>
                      {['pre', 'in', 'post'].map(state => {
                        const games = schedule.filter((g: any) => {
                          const s = g.competitions?.[0]?.status?.type?.state ?? g.status?.type?.state;
                          return state === 'post' ? (s === 'post' || !s) : s === state;
                        });
                        if (games.length === 0) return null;
                        const label = state === 'pre' ? 'Upcoming' : state === 'in' ? 'â— Live Now' : 'Results';
                        return (
                          <div key={state} className="space-y-2">
                            <p className={`text-[8px] font-black uppercase tracking-[0.4em] ${state === 'in' ? 'text-red-400' : 'text-white/30'}`}>{label}</p>
                            {games.map((game: any, i: number) => {
                              const comps = game.competitions?.[0];
                              const away  = comps?.competitors?.find((c: any) => c.homeAway === 'away');
                              const home  = comps?.competitors?.find((c: any) => c.homeAway === 'home');
                              const done  = comps?.status?.type?.completed;
                              const isHome = home?.team?.id === team.id;
                              const mine   = isHome ? home : away;
                              const opp    = isHome ? away : home;
                              const won    = done && mine?.winner;
                              return (
                                <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${state === 'in' ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'}`}>
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {done && <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{won ? 'W' : 'L'}</span>}
                                    <span className="text-[7px] font-black uppercase text-white/20 shrink-0">{isHome ? 'vs' : '@'}</span>
                                    <img src={opp?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-70 shrink-0" loading="lazy" />
                                    <span className="text-[9px] font-black uppercase truncate">{opp?.team?.displayName || opp?.team?.abbreviation}</span>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    {done && <span className="text-[9px] font-black">{mine?.score} â€“ {opp?.score}</span>}
                                    {state === 'in' && <span className="text-[7px] font-black text-red-400 animate-pulse">{comps?.status?.type?.shortDetail}</span>}
                                    {state === 'pre' && comps?.date && <span className="text-[8px] font-bold text-white/30">{new Date(comps.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {/* â”€â”€ LEGENDS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {activeTab === 'legends' && (
                <div className="space-y-4">
                  {(!richData?.legends || richData.legends.length === 0) && (
                    <div className="py-16 text-center space-y-3">
                      <Star size={36} className="mx-auto text-white/10" />
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Building sports archive...</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {(richData?.legends ?? []).map((player: LegendPlayer, i: number) => (
                      <motion.div key={player.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                        className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden hover:border-white/20 hover:bg-white/[0.06] transition-all group cursor-pointer"
                        onClick={() => player.id && onSelectPlayer({ id: player.id, name: player.name })}>
                        <div className="aspect-[3/4] overflow-hidden bg-white/5 relative">
                          {player.thumb
                            ? <img src={player.thumb} alt={player.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                            : <div className="w-full h-full flex items-center justify-center"><Star size={28} className="text-white/10" /></div>}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-[9px] font-black uppercase tracking-tight text-white line-clamp-1">{player.name}</p>
                            {player.position && <p className="text-[7px] font-bold uppercase" style={{ color: accent }}>{player.position}</p>}
                          </div>
                        </div>
                        {(player.description || player.nationality) && (
                          <div className="p-3 space-y-1">
                            {player.description && <p className="text-[8px] text-white/40 leading-relaxed line-clamp-3">{player.description}</p>}
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/20">
                              {[player.nationality, player.birthDate ? new Date(player.birthDate).getFullYear().toString() : ''].filter(Boolean).join(' Â· ')}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* â”€â”€ NEWS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {activeTab === 'news' && (
                <div className="space-y-3">
                  {(richData?.news?.length ? richData.news : leagueNews).slice(0, 20).map((article: any, i: number) => (
                    <NewsCard key={i} article={article} />
                  ))}
                  {!richData?.news?.length && !leagueNews.length && (
                    <p className="text-[9px] font-black uppercase text-white/20 tracking-widest py-8 text-center">No headlines available</p>
                  )}
                </div>
              )}

              {/* â”€â”€ HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {activeTab === 'history' && (
                <div className="space-y-8">
                  {/* Championships */}
                  {champions.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2"><Trophy size={10} /> Championship History</h4>
                      <div className="space-y-2">
                        {champions.map((c, i) => {
                          const isChamp = c.champion.toLowerCase().includes(team.location.toLowerCase()) || c.champion.toLowerCase().includes(team.nickname.toLowerCase());
                          return (
                            <div key={i} className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl border transition-all ${isChamp ? 'bg-yellow-500/8 border-yellow-500/20' : 'bg-white/[0.03] border-white/5'}`}>
                              <div className="shrink-0 w-10 text-center">
                                <p className="text-[10px] font-black text-white/50">{c.year}</p>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-black uppercase tracking-tight ${isChamp ? 'text-yellow-400' : 'text-white/80'}`}>{c.champion}</p>
                                {c.opponent && <p className="text-[8px] font-bold text-white/30 mt-0.5">vs {c.opponent} {c.series ? `Â· ${c.series}` : ''}</p>}
                                {c.note && <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mt-0.5">{c.note}</p>}
                              </div>
                              {isChamp && <Trophy size={14} className="text-yellow-400 shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Archive news */}
                  <div className="space-y-3">
                    <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2">
                      <Clock size={10} /> Team Archives â€” Trades, Contracts, Moves
                    </h4>
                    {historyNews.slice(0, 30).map((article: any, i: number) => (
                      <NewsCard key={i} article={article} />
                    ))}
                    {historyNews.length === 0 && (
                      <div className="py-12 text-center space-y-3">
                        <TrendingUp size={32} className="mx-auto text-white/10" />
                        <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Archive loading...</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
};

// â”€â”€ Small reusable components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8 text-center space-y-1.5">
      <div className="flex justify-center">{icon}</div>
      <p className="text-[7px] font-black uppercase tracking-widest text-white/25">{label}</p>
      <p className="text-[10px] font-black uppercase leading-tight">{value}</p>
    </div>
  );
}

function NewsCard({ article }: { article: any }) {
  return (
    <a href={article.links?.web?.href || article.url || '#'} target="_blank" rel="noopener noreferrer"
      className="flex gap-4 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group">
      {article.images?.[0]?.url && (
        <img src={article.images[0].url} alt="" className="w-20 h-14 object-cover rounded-xl shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" loading="lazy" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold leading-snug line-clamp-2 group-hover:text-[#FF8C00] transition-colors">{article.headline || article.title}</p>
        <p className="text-[7px] font-black uppercase tracking-widest text-white/25 mt-1.5">
          {article.published ? new Date(article.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
          {article.byline ? ` Â· ${article.byline}` : ''}
        </p>
      </div>
      <ExternalLink size={12} className="text-white/20 shrink-0 group-hover:text-white/60 transition-colors mt-0.5" />
    </a>
  );
}

export default TeamPageView;
