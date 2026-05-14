import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchLeagueTeams, fetchLeagueNews, fetchLeagueStandings, fetchLeagueScores,
  fetchRichTeamPage, fetchEsportsNews, fetchLeagueLeaders, fetchPlayerProfile,
  fetchTeamFullSchedule, fetchRacingSchedule, fetchRacingStandings, fetchRacingNews,
  getRacingCfg, ESPORTS_ORGS, LEAGUE_CHAMPIONS,
  type SportsTeam, type RichTeamPage, type EsportsOrg, type LeaderCategory,
  type RaceEvent, type RacingStanding, type ChampionEntry,
} from '../services/sportsService';
import {
  Search, ChevronLeft, Newspaper, Users, Trophy, Calendar,
  MapPin, Building2, Star, TrendingUp, User, ExternalLink,
  Pin, PinOff, RefreshCw, AlertCircle, Gamepad2, Globe, Flag, Clock,
  BarChart2, Award, Zap, Shield, ChevronRight, X,
} from 'lucide-react';

interface Props {
  selectedSportsTab: string;
}

type TeamTab = 'overview' | 'roster' | 'schedule' | 'legends' | 'news';

const LEAGUE_TABS = ['NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'ESPORTS'] as const;
const PINS_KEY = 'vibestream_sports_pins_v1';

function loadPins(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '[]'); } catch { return []; }
}
function savePins(ids: string[]) { localStorage.setItem(PINS_KEY, JSON.stringify(ids)); }

export const SportsCenterView: React.FC<Props> = ({ selectedSportsTab }) => {
  const [teamSearch, setTeamSearch]       = useState('');
  const [leagueTeams, setLeagueTeams]     = useState<SportsTeam[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(true);  // true so skeleton shows immediately
  const [leagueError, setLeagueError]     = useState(false);
  const [leagueScores, setLeagueScores]   = useState<any[]>([]);
  const [news, setNews]                   = useState<any[]>([]);
  const [standings, setStandings]         = useState<any[]>([]);
  const [leagueLeaders, setLeagueLeaders] = useState<LeaderCategory[]>([]);
  const [pinnedIds, setPinnedIds]         = useState<string[]>(() => loadPins());

  const [selectedTeam, setSelectedTeam]   = useState<SportsTeam | null>(null);
  const [selectedOrg, setSelectedOrg]     = useState<EsportsOrg | null>(null);
  const [richData, setRichData]           = useState<RichTeamPage | null>(null);
  const [teamLoading, setTeamLoading]     = useState(false);
  const [teamTab, setTeamTab]             = useState<TeamTab>('overview');

  const [teamSchedule, setTeamSchedule]       = useState<any[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [selectedPlayer, setSelectedPlayer]   = useState<{ id: string; name: string } | null>(null);
  const [playerProfile, setPlayerProfile]     = useState<any>(null);
  const [playerLoading, setPlayerLoading]     = useState(false);

  const isLeague  = (LEAGUE_TABS as readonly string[]).includes(selectedSportsTab);
  const isEsports = selectedSportsTab === 'ESPORTS';
  const isRacing  = !!getRacingCfg(selectedSportsTab);

  const champions: ChampionEntry[] = LEAGUE_CHAMPIONS[selectedSportsTab] ?? [];

  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return leagueTeams;
    return leagueTeams.filter(t =>
      [t.name, t.location, t.nickname, t.abbreviation].some(s => s.toLowerCase().includes(q))
    );
  }, [leagueTeams, teamSearch]);

  const filteredOrgs = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return ESPORTS_ORGS;
    return ESPORTS_ORGS.filter(o =>
      [o.name, o.abbreviation, o.region, ...o.games].some(s => s.toLowerCase().includes(q))
    );
  }, [teamSearch]);

  const pinnedTeams = useMemo(() => leagueTeams.filter(t => pinnedIds.includes(t.id)), [leagueTeams, pinnedIds]);
  const pinnedOrgs  = useMemo(() => ESPORTS_ORGS.filter(o => pinnedIds.includes(o.id)), [pinnedIds]);

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      savePins(next);
      return next;
    });
  }, []);

  const loadLeague = useCallback(() => {
    if (!isLeague || isEsports) return;
    setLeagueLoading(true);
    setLeagueError(false);
    setLeagueTeams([]);
    setNews([]);
    setStandings([]);
    setLeagueScores([]);
    setLeagueLeaders([]);

    Promise.allSettled([
      fetchLeagueTeams(selectedSportsTab),
      fetchLeagueNews(selectedSportsTab),
      fetchLeagueStandings(selectedSportsTab),
      fetchLeagueScores(selectedSportsTab),
      fetchLeagueLeaders(selectedSportsTab),
    ]).then(([teamsR, newsR, standingsR, scoresR, leadersR]) => {
      const teams        = teamsR.status    === 'fulfilled' ? teamsR.value    : [];
      const newsData     = newsR.status     === 'fulfilled' ? newsR.value     : [];
      const standingsData= standingsR.status=== 'fulfilled' ? standingsR.value: [];
      const scoresData   = scoresR.status   === 'fulfilled' ? scoresR.value   : [];
      const leadersData  = leadersR.status  === 'fulfilled' ? leadersR.value  : [];

      setLeagueTeams(teams);
      setNews(newsData);
      setStandings(standingsData);
      setLeagueScores(scoresData);
      setLeagueLeaders(leadersData);
      setLeagueLoading(false);
      // Only show error if all primary data is empty (true network failure)
      if (teams.length === 0 && newsData.length === 0 && standingsData.length === 0) {
        setLeagueError(true);
      }
    });
  }, [selectedSportsTab, isLeague, isEsports]);

  useEffect(() => {
    if (!isLeague) return;
    setSelectedTeam(null);
    setSelectedOrg(null);
    setRichData(null);
    setTeamSearch('');
    setSelectedPlayer(null);
    setPlayerProfile(null);
    if (isEsports) {
      setLeagueLoading(true);
      fetchEsportsNews().then(a => { setNews(a); setLeagueLoading(false); }).catch(() => setLeagueLoading(false));
    } else {
      loadLeague();
    }
  }, [selectedSportsTab]);

  useEffect(() => {
    if (!selectedTeam) return;
    setTeamLoading(true);
    setRichData(null);
    setTeamTab('overview');
    setTeamSchedule([]);
    fetchRichTeamPage(selectedSportsTab, selectedTeam.id, selectedTeam.nickname, selectedTeam.location)
      .then(data => { setRichData(data); setTeamLoading(false); })
      .catch(() => setTeamLoading(false));
  }, [selectedTeam, selectedSportsTab]);

  useEffect(() => {
    if (teamTab !== 'schedule' || !selectedTeam) return;
    setScheduleLoading(true);
    fetchTeamFullSchedule(selectedSportsTab, selectedTeam.id)
      .then(evts => { setTeamSchedule(evts); setScheduleLoading(false); })
      .catch(() => setScheduleLoading(false));
  }, [teamTab, selectedTeam, selectedSportsTab]);

  useEffect(() => {
    if (!selectedPlayer) return;
    setPlayerLoading(true);
    setPlayerProfile(null);
    fetchPlayerProfile(selectedSportsTab, selectedPlayer.id)
      .then(p => { setPlayerProfile(p); setPlayerLoading(false); })
      .catch(() => setPlayerLoading(false));
  }, [selectedPlayer, selectedSportsTab]);

  // ─── RACING ───────────────────────────────────────────────────────────────
  if (isRacing) return <RacingCenterView tab={selectedSportsTab} />;
  if (!isLeague) return null;

  // ─── PLAYER PROFILE MODAL ─────────────────────────────────────────────────
  if (selectedPlayer) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedPlayer(null); setPlayerProfile(null); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft size={12} /> Back
          </button>
        </div>

        {playerLoading && (
          <div className="flex flex-col items-center gap-6 py-12">
            <div className="w-32 h-32 rounded-[2rem] bg-white/5 animate-pulse" />
            <div className="space-y-2 w-48">
              <div className="h-5 rounded-full bg-white/5 animate-pulse" />
              <div className="h-3 rounded-full bg-white/5 animate-pulse w-3/4 mx-auto" />
            </div>
          </div>
        )}

        {!playerLoading && playerProfile && (
          <div className="space-y-6">
            {/* Hero */}
            <div className="flex items-start gap-6 p-6 bg-white/[0.03] rounded-[2.5rem] border border-white/8">
              <div className="w-28 h-28 rounded-[1.5rem] overflow-hidden bg-white/10 shrink-0">
                {playerProfile.headshot?.href
                  ? <img src={playerProfile.headshot.href} alt="" className="w-full h-full object-cover object-top" />
                  : <div className="w-full h-full flex items-center justify-center"><User size={32} className="text-white/20" /></div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-black uppercase tracking-tight">{playerProfile.fullName || selectedPlayer.name}</h2>
                <div className="flex flex-wrap gap-2 mt-2">
                  {playerProfile.position?.displayName && (
                    <span className="px-2.5 py-1 rounded-full bg-[#FF8C00]/15 border border-[#FF8C00]/30 text-[8px] font-black uppercase text-[#FF8C00]">{playerProfile.position.displayName}</span>
                  )}
                  {playerProfile.jersey && (
                    <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">#{playerProfile.jersey}</span>
                  )}
                  {playerProfile.team?.displayName && (
                    <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase text-white/50">{playerProfile.team.displayName}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  {[
                    { label: 'Age', val: playerProfile.age },
                    { label: 'Height', val: playerProfile.displayHeight },
                    { label: 'Weight', val: playerProfile.displayWeight },
                    { label: 'Experience', val: playerProfile.experience?.years ? `${playerProfile.experience.years}yr` : undefined },
                  ].filter(x => x.val).map(x => (
                    <div key={x.label} className="text-center p-2 bg-white/5 rounded-xl">
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/25">{x.label}</p>
                      <p className="text-[10px] font-black text-white/70 mt-0.5">{x.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Birth / college */}
            {(playerProfile.birthPlace?.city || playerProfile.college?.name) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {playerProfile.birthPlace?.city && (
                  <div className="flex items-center gap-3 p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8">
                    <MapPin size={16} className="text-[#FF8C00] shrink-0" />
                    <div>
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Hometown</p>
                      <p className="text-xs font-bold text-white/70">{[playerProfile.birthPlace.city, playerProfile.birthPlace.state, playerProfile.birthPlace.country].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                )}
                {playerProfile.college?.name && (
                  <div className="flex items-center gap-3 p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8">
                    <Building2 size={16} className="text-[#FF8C00] shrink-0" />
                    <div>
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/25">College</p>
                      <p className="text-xs font-bold text-white/70">{playerProfile.college.name}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stats */}
            {playerProfile.statistics?.splits?.categories && (
              <div className="space-y-3">
                <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><BarChart2 size={10} /> Season Stats</h4>
                {(playerProfile.statistics.splits.categories as any[]).slice(0, 2).map((cat: any, ci: number) => (
                  <div key={ci} className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden">
                    <div className="px-4 py-2 bg-white/5 border-b border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{cat.displayName || cat.name}</p>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 divide-x divide-white/5 divide-y divide-white/5">
                      {(cat.stats as any[]).slice(0, 10).map((stat: any, si: number) => (
                        <div key={si} className="p-3 text-center">
                          <p className="text-[7px] font-black uppercase tracking-widest text-white/25 truncate">{stat.shortDisplayName || stat.abbreviation || stat.name}</p>
                          <p className="text-sm font-black mt-0.5">{stat.displayValue ?? stat.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Bio */}
            {playerProfile.notes?.map && (
              <div className="p-5 bg-white/[0.03] rounded-[1.5rem] border border-white/8">
                <p className="text-sm text-white/55 leading-relaxed">{playerProfile.notes}</p>
              </div>
            )}
          </div>
        )}

        {!playerLoading && !playerProfile && (
          <div className="py-16 text-center space-y-3">
            <User size={36} className="mx-auto text-white/10" />
            <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Player data unavailable</p>
          </div>
        )}
      </motion.div>
    );
  }

  // ─── TEAM PAGE ─────────────────────────────────────────────────────────────
  if (selectedTeam || selectedOrg) {
    const org = selectedOrg;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Back + Pin */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedTeam(null); setSelectedOrg(null); setRichData(null); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft size={12} /> All {selectedSportsTab} {isEsports ? 'Orgs' : 'Teams'}
          </button>
          {(selectedTeam || org) && (
            <button onClick={() => togglePin(selectedTeam?.id || org!.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                pinnedIds.includes(selectedTeam?.id || org!.id)
                  ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
              }`}>
              {pinnedIds.includes(selectedTeam?.id || org!.id) ? <><PinOff size={10} /> Unpin</> : <><Pin size={10} /> Pin</>}
            </button>
          )}
        </div>

        {/* Fanart */}
        {richData?.fanart && (
          <div className="relative h-44 rounded-[2.5rem] overflow-hidden border border-white/10">
            <img src={richData.fanart} alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          </div>
        )}

        {/* Team header */}
        {selectedTeam && (
          <div className="flex items-center gap-5 p-6 rounded-[2.5rem] border border-white/10 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${selectedTeam.color}22, transparent)` }}>
            <div className="absolute inset-0 opacity-5" style={{ background: selectedTeam.color }} />
            <img src={richData?.badge || selectedTeam.logo} alt={selectedTeam.name} className="w-20 h-20 object-contain drop-shadow-2xl relative z-10" />
            <div className="flex-1 relative z-10">
              <h2 className="text-3xl font-black uppercase tracking-tight leading-none">{selectedTeam.location}</h2>
              <h3 className="text-xl font-black uppercase tracking-tight" style={{ color: selectedTeam.altColor !== '#ffffff' ? selectedTeam.altColor : '#FF8C00' }}>{selectedTeam.nickname}</h3>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                {selectedTeam.record && <span className="text-[9px] font-bold text-white/40 uppercase">{selectedTeam.record}</span>}
                {richData?.city && <span className="flex items-center gap-1 text-[9px] font-bold text-white/30 uppercase"><MapPin size={9} />{richData.city}</span>}
                {richData?.founded && <span className="text-[9px] font-bold text-white/30 uppercase">Est. {richData.founded}</span>}
                {richData?.stadium && <span className="flex items-center gap-1 text-[9px] font-bold text-white/30 uppercase"><Building2 size={9} />{richData.stadium}</span>}
              </div>
            </div>
          </div>
        )}

        {/* Esports org header */}
        {org && (
          <div className="flex items-center gap-5 p-6 rounded-[2.5rem] border border-white/10 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${org.color}22, transparent)` }}>
            <div className="absolute inset-0 opacity-5" style={{ background: org.color }} />
            <img src={org.logo} alt={org.name} className="w-20 h-20 object-contain drop-shadow-2xl relative z-10 rounded-2xl"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <div className="flex-1 relative z-10">
              <h2 className="text-3xl font-black uppercase tracking-tight leading-none">{org.name}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <span className="text-[9px] font-bold text-white/40 uppercase">{org.region} Region</span>
                {org.founded && <span className="text-[9px] font-bold text-white/30 uppercase">Est. {org.founded}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {org.games.map(g => (
                  <span key={g} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[8px] font-black uppercase tracking-widest text-white/50">{g}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {org?.description && (
          <div className="p-5 bg-white/[0.03] rounded-[1.5rem] border border-white/8">
            <p className="text-sm text-white/60 leading-relaxed">{org.description}</p>
          </div>
        )}

        {/* Tab strip */}
        {selectedTeam && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {(['overview', 'roster', 'schedule', 'legends', 'news'] as TeamTab[]).map(tab => (
              <button key={tab} onClick={() => setTeamTab(tab)}
                className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                  teamTab === tab
                    ? 'bg-[#FF8C00] text-black shadow-[0_0_20px_rgba(255,140,0,0.35)]'
                    : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                }`}>
                {tab === 'overview' ? 'Overview' : tab === 'roster' ? 'Roster' : tab === 'schedule' ? 'Schedule' : tab === 'legends' ? 'Legends' : 'Headlines'}
              </button>
            ))}
          </div>
        )}

        {teamLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => <div key={i} className="h-28 rounded-[2rem] bg-white/5 animate-pulse" />)}
          </div>
        )}

        {!teamLoading && richData && selectedTeam && (
          <AnimatePresence mode="wait">
            <motion.div key={teamTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

              {/* OVERVIEW */}
              {teamTab === 'overview' && (
                <div className="space-y-6">
                  {richData.description && (
                    <div className="p-6 bg-white/[0.03] rounded-[2rem] border border-white/8 space-y-3">
                      <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2"><Newspaper size={10} /> Team History</h4>
                      <p className="text-sm text-white/65 leading-relaxed">{richData.description}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {richData.city && (
                      <div className="p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8 text-center space-y-1.5">
                        <MapPin size={18} className="mx-auto text-[#FF8C00]" />
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/25">City</p>
                        <p className="text-[10px] font-black uppercase">{richData.city}</p>
                      </div>
                    )}
                    {richData.founded && (
                      <div className="p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8 text-center space-y-1.5">
                        <Calendar size={18} className="mx-auto text-[#FF8C00]" />
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Founded</p>
                        <p className="text-[10px] font-black uppercase">{richData.founded}</p>
                      </div>
                    )}
                    {richData.stadium && (
                      <div className="p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8 text-center space-y-1.5">
                        <Building2 size={18} className="mx-auto text-[#FF8C00]" />
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Venue</p>
                        <p className="text-[10px] font-black uppercase leading-tight">{richData.stadium}</p>
                      </div>
                    )}
                    {selectedTeam.record && (
                      <div className="p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/8 text-center space-y-1.5">
                        <Trophy size={18} className="mx-auto text-[#FF8C00]" />
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/25">Record</p>
                        <p className="text-[10px] font-black uppercase">{selectedTeam.record}</p>
                      </div>
                    )}
                  </div>
                  {richData.recentGames.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2"><Calendar size={10} /> Recent Games</h4>
                        <button onClick={() => setTeamTab('schedule')} className="text-[8px] font-black uppercase tracking-widest text-[#FF8C00]/60 hover:text-[#FF8C00] transition-colors flex items-center gap-1">Full Schedule <ChevronRight size={10} /></button>
                      </div>
                      <div className="space-y-2">
                        {richData.recentGames.slice(0, 6).map((game: any, i: number) => {
                          const comps = game.competitions?.[0];
                          const away  = comps?.competitors?.find((c: any) => c.homeAway === 'away');
                          const home  = comps?.competitors?.find((c: any) => c.homeAway === 'home');
                          const done  = comps?.status?.type?.completed;
                          const isTeamHome = home?.team?.id === selectedTeam.id;
                          const myComp = isTeamHome ? home : away;
                          const won = done && myComp?.winner;
                          return (
                            <div key={i} className="flex items-center justify-between px-5 py-3 bg-white/[0.03] rounded-2xl border border-white/5 hover:bg-white/[0.06] transition-all">
                              <div className="flex items-center gap-2">
                                <span className="text-[7px] font-black uppercase text-white/20">{isTeamHome ? 'vs' : '@'}</span>
                                <img src={isTeamHome ? away?.team?.logo : home?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-70" />
                                <span className="text-[9px] font-black uppercase">{isTeamHome ? away?.team?.abbreviation : home?.team?.abbreviation}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[8px] font-bold text-white/35">{game.status?.type?.shortDetail || ''}</span>
                                {done && (
                                  <>
                                    <span className="text-[9px] font-black text-white">{away?.score} – {home?.score}</span>
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

              {/* ROSTER */}
              {teamTab === 'roster' && (
                <div className="space-y-6">
                  <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">Tap a player for profile &amp; stats</p>
                  {richData.roster.length === 0 && (
                    <div className="py-12 text-center">
                      <Users size={32} className="mx-auto text-white/10 mb-3" />
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Roster unavailable</p>
                    </div>
                  )}
                  {richData.roster.map((group, gi) => (
                    <div key={gi} className="space-y-2">
                      <p className="text-[7px] font-black uppercase tracking-[0.4em] text-white/25 px-1">{group.group}</p>
                      <div className="grid gap-2">
                        {group.athletes.map((a: any, ai: number) => (
                          <button key={ai}
                            onClick={() => a.id && setSelectedPlayer({ id: String(a.id), name: a.fullName || a.displayName })}
                            className="flex items-center gap-4 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.07] rounded-2xl border border-white/5 hover:border-[#FF8C00]/20 transition-all group text-left w-full"
                          >
                            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/10 border border-white/10">
                              {a.headshot?.href
                                ? <img src={a.headshot.href} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                                : <div className="w-full h-full flex items-center justify-center"><User size={14} className="text-white/20" /></div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-black uppercase tracking-tight truncate group-hover:text-[#FF8C00] transition-colors">{a.fullName || a.displayName}</p>
                                {a.status?.type?.name && a.status.type.name !== 'active' && (
                                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full shrink-0">{a.status.type.abbreviation || a.status.type.name}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                {(a.position?.displayName || a.position?.abbreviation) && <span className="text-[8px] font-bold text-white/40 uppercase">{a.position.displayName || a.position.abbreviation}</span>}
                                {a.jersey && <span className="text-[8px] font-bold text-white/25">#{a.jersey}</span>}
                                {a.age && <span className="text-[8px] font-bold text-white/20">{a.age} yrs</span>}
                              </div>
                            </div>
                            {a.jersey && (
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 border border-white/10" style={{ background: `${selectedTeam.color}40` }}>{a.jersey}</div>
                            )}
                            <ChevronRight size={12} className="text-white/15 group-hover:text-[#FF8C00]/50 transition-colors shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* SCHEDULE */}
              {teamTab === 'schedule' && (
                <div className="space-y-3">
                  {scheduleLoading && (
                    <div className="space-y-2">{[...Array(10)].map((_, i) => <div key={i} className="h-14 rounded-2xl bg-white/5 animate-pulse" />)}</div>
                  )}
                  {!scheduleLoading && teamSchedule.length === 0 && (
                    <div className="py-16 text-center space-y-3">
                      <Calendar size={36} className="mx-auto text-white/10" />
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Schedule unavailable</p>
                    </div>
                  )}
                  {!scheduleLoading && teamSchedule.length > 0 && (
                    <>
                      {['pre', 'in', 'post'].map(state => {
                        const games = teamSchedule.filter((g: any) => {
                          const s = g.competitions?.[0]?.status?.type?.state ?? g.status?.type?.state;
                          return state === 'post' ? (s === 'post' || !s) : s === state;
                        });
                        if (games.length === 0) return null;
                        const label = state === 'pre' ? 'Upcoming' : state === 'in' ? '● Live' : 'Results';
                        return (
                          <div key={state} className="space-y-2">
                            <p className={`text-[8px] font-black uppercase tracking-[0.4em] ${state === 'in' ? 'text-red-400' : 'text-white/30'}`}>{label}</p>
                            {games.map((game: any, i: number) => {
                              const comps = game.competitions?.[0];
                              const away  = comps?.competitors?.find((c: any) => c.homeAway === 'away');
                              const home  = comps?.competitors?.find((c: any) => c.homeAway === 'home');
                              const done  = comps?.status?.type?.completed;
                              const isTeamHome = home?.team?.id === selectedTeam.id;
                              const myComp = isTeamHome ? home : away;
                              const opp    = isTeamHome ? away : home;
                              const won    = done && myComp?.winner;
                              return (
                                <div key={i} className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${state === 'in' ? 'bg-red-500/5 border-red-500/20' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'}`}>
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    {done && (
                                      <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${won ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{won ? 'W' : 'L'}</span>
                                    )}
                                    <span className="text-[7px] font-black uppercase text-white/20 shrink-0">{isTeamHome ? 'vs' : '@'}</span>
                                    <img src={opp?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-70 shrink-0" loading="lazy" />
                                    <span className="text-[9px] font-black uppercase truncate">{opp?.team?.displayName || opp?.team?.abbreviation}</span>
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    {done && <span className="text-[9px] font-black">{myComp?.score} – {opp?.score}</span>}
                                    {state === 'in' && <span className="text-[7px] font-black text-red-400 animate-pulse">{comps?.status?.type?.shortDetail}</span>}
                                    {state === 'pre' && comps?.date && (
                                      <span className="text-[8px] font-bold text-white/30">{new Date(comps.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                    )}
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

              {/* LEGENDS */}
              {teamTab === 'legends' && (
                <div className="space-y-4">
                  {richData.legends.length === 0 && (
                    <div className="py-16 text-center space-y-3">
                      <Star size={36} className="mx-auto text-white/10" />
                      <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Building sports archive...</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {richData.legends.map((player, i) => (
                      <motion.div key={player.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                        className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden hover:border-white/20 hover:bg-white/[0.06] transition-all group cursor-pointer"
                        onClick={() => player.id && setSelectedPlayer({ id: player.id, name: player.name })}
                      >
                        <div className="aspect-[3/4] overflow-hidden bg-white/5 relative">
                          {player.thumb
                            ? <img src={player.thumb} alt={player.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                            : <div className="w-full h-full flex items-center justify-center"><Star size={28} className="text-white/10" /></div>
                          }
                          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                          <div className="absolute bottom-2 left-2 right-2">
                            <p className="text-[9px] font-black uppercase tracking-tight text-white line-clamp-1">{player.name}</p>
                            {player.position && <p className="text-[7px] font-bold text-[#FF8C00]/80 uppercase">{player.position}</p>}
                          </div>
                        </div>
                        {(player.description || player.nationality || player.birthDate) && (
                          <div className="p-3 space-y-1">
                            {player.description && <p className="text-[8px] text-white/40 leading-relaxed line-clamp-3">{player.description}</p>}
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/20">
                              {[player.nationality, player.birthDate ? new Date(player.birthDate).getFullYear().toString() : ''].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* NEWS */}
              {teamTab === 'news' && (
                <div className="space-y-3">
                  {(richData.news.length > 0 ? richData.news : news).slice(0, 15).map((article: any, i: number) => (
                    <a key={i} href={article.links?.web?.href || article.url || '#'} target="_blank" rel="noopener noreferrer"
                      className="flex gap-4 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group">
                      {article.images?.[0]?.url && <img src={article.images[0].url} alt="" className="w-20 h-14 object-cover rounded-xl shrink-0 opacity-75 group-hover:opacity-100 transition-opacity" loading="lazy" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold leading-snug line-clamp-2 group-hover:text-[#FF8C00] transition-colors">{article.headline || article.title}</p>
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/25 mt-1.5">{article.published ? new Date(article.published).toLocaleDateString() : ''}{article.byline ? ` · ${article.byline}` : ''}</p>
                      </div>
                      <ExternalLink size={12} className="text-white/20 shrink-0 group-hover:text-white/60 transition-colors mt-0.5" />
                    </a>
                  ))}
                  {richData.news.length === 0 && news.length === 0 && <p className="text-[9px] font-black uppercase text-white/20 tracking-widest py-8 text-center">No headlines available</p>}
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        )}

        {!teamLoading && !richData && selectedTeam && (
          <div className="py-12 text-center space-y-3">
            <AlertCircle size={32} className="mx-auto text-white/10" />
            <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Could not load team details</p>
          </div>
        )}
      </motion.div>
    );
  }

  // ─── LEAGUE VIEW ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-10">

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input type="text" value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
          placeholder={`Search ${selectedSportsTab} ${isEsports ? 'organizations' : 'teams'}...`}
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-full text-sm font-bold placeholder:text-white/20 focus:outline-none focus:border-[#FF8C00]/50 transition-all"
        />
      </div>

      {/* ── ESPORTS ── */}
      {isEsports && (
        <>
          {pinnedOrgs.length > 0 && !teamSearch && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Pin size={10} /> Pinned Orgs</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {pinnedOrgs.map(org => <OrgCard key={org.id} org={org} isPinned pinnedIds={pinnedIds} onSelect={setSelectedOrg} onTogglePin={togglePin} />)}
              </div>
            </div>
          )}
          {news.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Newspaper size={10} /> Esports Headlines</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {news.slice(0, 8).map((article: any, i: number) => (
                  <a key={i} href={article.links?.web?.href || '#'} target="_blank" rel="noopener noreferrer"
                    className="flex gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group">
                    {article.images?.[0]?.url && <img src={article.images[0].url} alt="" className="w-14 h-10 object-cover rounded-lg shrink-0 opacity-75 group-hover:opacity-100 transition-opacity" loading="lazy" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold leading-snug line-clamp-2 group-hover:text-[#FF8C00] transition-colors">{article.headline || article.title}</p>
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mt-1">{article.published ? new Date(article.published).toLocaleDateString() : ''}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Gamepad2 size={10} /> Esports Organizations{teamSearch && ` · ${filteredOrgs.length} results`}</h4>
              {!teamSearch && <span className="text-[7px] text-white/20 font-bold uppercase">Tap to view · Pin to track</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredOrgs.map(org => <OrgCard key={org.id} org={org} isPinned={pinnedIds.includes(org.id)} pinnedIds={pinnedIds} onSelect={setSelectedOrg} onTogglePin={togglePin} />)}
              {filteredOrgs.length === 0 && teamSearch && (
                <div className="col-span-full py-10 text-center"><p className="text-[9px] font-black uppercase text-white/20 tracking-widest">No orgs match "{teamSearch}"</p></div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── STANDARD LEAGUE ── */}
      {!isEsports && (
        <>
          {/* Today's Scoreboard — always rendered; shows skeleton while loading */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {leagueScores.some((e: any) => e.status?.type?.state === 'in') && (
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />
              )}
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">
                {leagueScores.some((e: any) => e.status?.type?.state === 'in') ? 'Live & Today\'s Games' : 'Today\'s Games'}
              </h4>
            </div>
            {leagueLoading ? (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {[...Array(5)].map((_, i) => <div key={i} className="min-w-[200px] h-28 rounded-[1.5rem] bg-white/5 animate-pulse shrink-0" />)}
              </div>
            ) : leagueScores.length === 0 ? (
              <div className="flex items-center justify-center h-20 bg-white/[0.02] border border-white/5 rounded-[1.5rem]">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/20">No games scheduled today</p>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
                {leagueScores.slice(0, 16).map((event: any) => {
                  const comps  = event.competitions?.[0];
                  const away   = comps?.competitors?.find((c: any) => c.homeAway === 'away');
                  const home   = comps?.competitors?.find((c: any) => c.homeAway === 'home');
                  const isLive = event.status?.type?.state === 'in';
                  const isPre  = event.status?.type?.state === 'pre';
                  const isPost = event.status?.type?.state === 'post';
                  return (
                    <div key={event.id} className={`min-w-[200px] border rounded-[1.5rem] p-4 flex flex-col gap-2.5 shrink-0 transition-all ${
                      isLive ? 'bg-red-500/5 border-red-500/25' : 'bg-white/[0.03] border-white/8'
                    }`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[7px] font-black uppercase tracking-widest text-white/25 truncate">{event.status?.type?.shortDetail}</span>
                        {isLive && <span className="text-[7px] font-black text-red-400 animate-pulse shrink-0">● Live</span>}
                        {isPre  && <span className="text-[7px] font-black text-white/20 shrink-0 uppercase">Upcoming</span>}
                        {isPost && <span className="text-[7px] font-black text-white/20 shrink-0 uppercase">Final</span>}
                      </div>
                      {[away, home].filter(Boolean).map((team: any) => (
                        <button key={team?.id}
                          onClick={() => { const t = leagueTeams.find(lt => lt.id === String(team?.team?.id)); if (t) setSelectedTeam(t); }}
                          className="flex items-center justify-between gap-2 group/btn"
                        >
                          <div className="flex items-center gap-2">
                            <img src={team?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-80" loading="lazy" />
                            <div>
                              <span className={`text-[9px] font-black uppercase group-hover/btn:text-[#FF8C00] transition-colors ${team?.winner ? 'text-white' : 'text-white/50'}`}>{team?.team?.abbreviation}</span>
                              {team?.records?.[0]?.summary && <p className="text-[6px] text-white/20">{team.records[0].summary}</p>}
                            </div>
                          </div>
                          <span className={`text-xs font-black ${team?.winner ? 'text-[#FF8C00]' : isPost ? 'text-white/40' : isPre ? 'text-white/15' : 'text-white/70'}`}>
                            {team?.score ?? (isPre ? '' : '–')}
                          </span>
                        </button>
                      ))}
                      {isPre && comps?.date && (
                        <p className="text-[7px] font-bold text-white/20 text-right">{new Date(comps.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Standings — always rendered */}
          <div className="space-y-3">
            <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><TrendingUp size={10} /> Standings</h4>
            {leagueLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(2)].map((_, i) => <div key={i} className="h-48 rounded-[1.5rem] bg-white/5 animate-pulse" />)}
              </div>
            ) : standings.length === 0 ? (
              <div className="flex items-center justify-center h-20 bg-white/[0.02] border border-white/5 rounded-[1.5rem]">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Standings unavailable</p>
              </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {standings.slice(0, 4).map((conference: any, ci: number) => {
                    const entries: any[] = conference.standings?.entries ?? conference.entries ?? [];
                    const confName = conference.name || conference.abbreviation || `Conference ${ci + 1}`;
                    return (
                      <div key={ci} className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden">
                        <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 flex items-center justify-between">
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{confName}</p>
                          <div className="hidden sm:flex items-center gap-3 text-[7px] font-black uppercase tracking-widest text-white/20">
                            <span className="w-4 text-right">W</span>
                            <span className="w-4 text-right">L</span>
                            <span className="w-6 text-right">PCT</span>
                            <span className="w-5 text-right">GB</span>
                          </div>
                        </div>
                        <div className="divide-y divide-white/5">
                          {entries.slice(0, 10).map((entry: any, ei: number) => {
                            const tName = entry.team?.displayName || entry.team?.name || entry.displayName || '';
                            const getV  = (names: string[]) => {
                              for (const n of names) {
                                const s = entry.stats?.find((s: any) => s.name === n || s.abbreviation?.toLowerCase() === n.toLowerCase());
                                if (s !== undefined) return s.displayValue ?? (s.value !== undefined ? String(s.value) : '');
                              }
                              return '';
                            };
                            const wins  = getV(['wins', 'W', 'w']);
                            const losses= getV(['losses', 'L', 'l']);
                            const pct   = getV(['winPercent', 'PCT', 'pct', 'winPercentage']);
                            const gb    = getV(['gamesBehind', 'GB', 'gb', 'pointsBehind']);
                            return (
                              <button key={ei}
                                onClick={() => { const found = leagueTeams.find(t => t.name.toLowerCase().includes((entry.team?.name || '').toLowerCase()) || t.abbreviation === entry.team?.abbreviation); if (found) setSelectedTeam(found); }}
                                className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-white/5 transition-all group"
                              >
                                <span className={`text-[8px] font-black w-4 shrink-0 ${ei === 0 ? 'text-[#FF8C00]' : 'text-white/20'}`}>{ei + 1}</span>
                                <img src={entry.team?.logos?.[0]?.href || ''} alt="" className="w-5 h-5 object-contain opacity-60 shrink-0" loading="lazy" />
                                <span className="flex-1 text-[9px] font-black uppercase truncate group-hover:text-[#FF8C00] transition-colors text-left">{tName}</span>
                                <div className="hidden sm:flex items-center gap-3 text-[8px] font-bold text-white/40 shrink-0">
                                  {wins  !== '' && <span className="w-4 text-right">{wins}</span>}
                                  {losses!== '' && <span className="w-4 text-right">{losses}</span>}
                                  {pct   !== '' && <span className="w-6 text-right text-white/25">{typeof pct === 'number' ? Number(pct).toFixed(3) : pct}</span>}
                                  {gb    !== '' && <span className="w-5 text-right text-white/20">{gb}</span>}
                                </div>
                                <div className="sm:hidden text-[8px] font-bold text-white/35">{wins && losses ? `${wins}–${losses}` : ''}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          {/* League Leaders */}
          {leagueLeaders.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><BarChart2 size={10} /> League Leaders</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {leagueLeaders.slice(0, 4).map((cat, ci) => (
                  <div key={ci} className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden">
                    <div className="px-4 py-2.5 bg-white/5 border-b border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{cat.displayName}</p>
                    </div>
                    <div className="divide-y divide-white/5">
                      {cat.leaders.map((leader, li) => (
                        <button key={li}
                          onClick={() => leader.athleteId && setSelectedPlayer({ id: leader.athleteId, name: leader.name })}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-all group ${li === 0 ? 'bg-[#FF8C00]/5' : ''}`}
                        >
                          <span className={`text-[8px] font-black w-3.5 shrink-0 ${li === 0 ? 'text-[#FF8C00]' : 'text-white/20'}`}>{li + 1}</span>
                          {leader.photo
                            ? <img src={leader.photo} alt="" className="w-6 h-6 rounded-full object-cover shrink-0" loading="lazy" />
                            : <div className="w-6 h-6 rounded-full bg-white/10 shrink-0" />
                          }
                          <span className="flex-1 text-[8px] font-bold truncate group-hover:text-[#FF8C00] transition-colors">{leader.name}</span>
                          <span className={`text-[9px] font-black shrink-0 ${li === 0 ? 'text-[#FF8C00]' : 'text-white/60'}`}>{leader.displayValue}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Champions History */}
          {champions.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Award size={10} /> Championship History</h4>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
                {champions.map((c, i) => (
                  <div key={c.year} className={`min-w-[150px] shrink-0 p-4 rounded-[1.5rem] border transition-all ${
                    i === 0 ? 'bg-[#FF8C00]/10 border-[#FF8C00]/30' : 'bg-white/[0.02] border-white/8'
                  }`}>
                    <p className={`text-2xl font-black ${i === 0 ? 'text-[#FF8C00]' : 'text-white/20'}`}>{c.year}</p>
                    <p className={`text-[9px] font-black uppercase leading-snug mt-1 ${i === 0 ? 'text-white' : 'text-white/55'}`}>{c.champion}</p>
                    {c.note && <p className="text-[7px] font-bold text-white/25 mt-1.5">{c.note}</p>}
                    {c.opponent && <p className="text-[7px] font-bold text-white/20 mt-1">def. {c.opponent}</p>}
                    {c.series && <p className={`text-[9px] font-black mt-1.5 ${i === 0 ? 'text-[#FF8C00]/70' : 'text-white/20'}`}>{c.series}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Headlines */}
          {(news.length > 0 || leagueLoading) && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Newspaper size={10} /> {selectedSportsTab} Headlines</h4>
              {leagueLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-[1.5rem] bg-white/5 animate-pulse" />)}</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {news.slice(0, 8).map((article: any, i: number) => (
                    <a key={i} href={article.links?.web?.href || '#'} target="_blank" rel="noopener noreferrer"
                      className="flex gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group">
                      {article.images?.[0]?.url && <img src={article.images[0].url} alt="" className="w-14 h-10 object-cover rounded-lg shrink-0 opacity-75 group-hover:opacity-100 transition-opacity" loading="lazy" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold leading-snug line-clamp-2 group-hover:text-[#FF8C00] transition-colors">{article.headline || article.title}</p>
                        <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mt-1">{article.published ? new Date(article.published).toLocaleDateString() : ''}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Pinned Teams */}
          {pinnedTeams.length > 0 && !teamSearch && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Pin size={10} /> Pinned Teams</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {pinnedTeams.map(team => (
                  <TeamCard key={team.id} team={team} isPinned pinnedIds={pinnedIds} onSelect={setSelectedTeam} onTogglePin={togglePin} />
                ))}
              </div>
            </div>
          )}

          {/* Teams Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">
                {selectedSportsTab} Teams{teamSearch && filteredTeams.length < leagueTeams.length ? ` · ${filteredTeams.length} results` : ''}
              </h4>
              {!teamSearch && leagueTeams.length > 0 && <span className="text-[7px] text-white/20 font-bold uppercase">Tap for team page · Pin to track</span>}
            </div>
            {leagueLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {[...Array(10)].map((_, i) => <div key={i} className="h-24 rounded-[1.5rem] bg-white/5 animate-pulse" />)}
              </div>
            ) : leagueError && leagueTeams.length === 0 ? (
              <div className="py-12 text-center space-y-4">
                <AlertCircle size={32} className="mx-auto text-white/15" />
                <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Could not load {selectedSportsTab} teams</p>
                <button onClick={loadLeague} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all">
                  <RefreshCw size={12} /> Retry
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredTeams.map(team => (
                  <TeamCard key={team.id} team={team} isPinned={pinnedIds.includes(team.id)} pinnedIds={pinnedIds} onSelect={setSelectedTeam} onTogglePin={togglePin} />
                ))}
                {filteredTeams.length === 0 && teamSearch && (
                  <div className="col-span-full py-10 text-center">
                    <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">No teams match "{teamSearch}"</p>
                  </div>
                )}
                {filteredTeams.length === 0 && !teamSearch && !leagueError && (
                  <div className="col-span-full py-10 text-center">
                    <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Loading {selectedSportsTab} teams...</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── TeamCard ─────────────────────────────────────────────────────────────────

const TeamCard: React.FC<{
  team: SportsTeam;
  isPinned: boolean;
  pinnedIds: string[];
  onSelect: (t: SportsTeam) => void;
  onTogglePin: (id: string) => void;
}> = ({ team, isPinned, onSelect, onTogglePin }) => (
  <div className="relative group">
    <button onClick={() => onSelect(team)}
      className="w-full flex flex-col items-center gap-2 p-4 rounded-[1.5rem] border border-white/10 hover:border-[#FF8C00]/40 bg-white/[0.03] hover:bg-white/[0.07] transition-all overflow-hidden text-center">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity rounded-[1.5rem]" style={{ background: team.color }} />
      <img src={team.logo} alt={team.abbreviation} className="w-10 h-10 object-contain drop-shadow group-hover:scale-110 transition-transform relative z-10" loading="lazy" />
      <div className="relative z-10">
        <p className="text-[9px] font-black uppercase tracking-tight leading-tight">{team.location}</p>
        <p className="text-[8px] font-bold text-white/40 uppercase">{team.nickname}</p>
        {team.record && <p className="text-[7px] font-bold text-white/25 mt-0.5">{team.record}</p>}
      </div>
    </button>
    <button onClick={e => { e.stopPropagation(); onTogglePin(team.id); }}
      className={`absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isPinned ? 'text-[#FF8C00] opacity-100' : 'text-white/30 hover:text-[#FF8C00] bg-black/40'}`}
      title={isPinned ? 'Unpin' : 'Pin to My Teams'}>
      <Pin size={10} />
    </button>
  </div>
);

// ─── OrgCard ──────────────────────────────────────────────────────────────────

const OrgCard: React.FC<{
  org: EsportsOrg;
  isPinned: boolean;
  pinnedIds: string[];
  onSelect: (o: EsportsOrg) => void;
  onTogglePin: (id: string) => void;
}> = ({ org, isPinned, onSelect, onTogglePin }) => (
  <div className="relative group">
    <button onClick={() => onSelect(org)}
      className="w-full flex flex-col items-center gap-2 p-4 rounded-[1.5rem] border border-white/10 hover:border-[#FF8C00]/40 bg-white/[0.03] hover:bg-white/[0.07] transition-all overflow-hidden text-center">
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity rounded-[1.5rem]" style={{ background: org.color }} />
      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 relative z-10 flex items-center justify-center">
        <img src={org.logo} alt={org.abbreviation}
          className="w-full h-full object-contain drop-shadow group-hover:scale-110 transition-transform"
          loading="lazy"
          onError={e => {
            const img = e.target as HTMLImageElement;
            img.style.display = 'none';
            const parent = img.parentElement!;
            parent.style.background = org.color;
            parent.innerHTML = `<span style="color:white;font-size:10px;font-weight:900;text-transform:uppercase">${org.abbreviation}</span>`;
          }}
        />
      </div>
      <div className="relative z-10">
        <p className="text-[9px] font-black uppercase tracking-tight leading-tight">{org.name}</p>
        <p className="text-[8px] font-bold text-white/40 uppercase">{org.region}</p>
        <div className="flex flex-wrap justify-center gap-0.5 mt-1">
          {org.games.slice(0, 2).map(g => <span key={g} className="text-[6px] font-black uppercase text-white/25">{g}</span>)}
          {org.games.length > 2 && <span className="text-[6px] font-black uppercase text-white/25">+{org.games.length - 2}</span>}
        </div>
      </div>
    </button>
    <button onClick={e => { e.stopPropagation(); onTogglePin(org.id); }}
      className={`absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isPinned ? 'text-[#FF8C00] opacity-100' : 'text-white/30 hover:text-[#FF8C00] bg-black/40'}`}
      title={isPinned ? 'Unpin' : 'Pin'}>
      <Pin size={10} />
    </button>
  </div>
);

// ─── Racing Center View (F1 / NASCAR / IndyCar) ───────────────────────────────

const RacingCenterView: React.FC<{ tab: string }> = ({ tab }) => {
  const cfg = getRacingCfg(tab)!;
  const [schedule, setSchedule] = useState<RaceEvent[]>([]);
  const [standings, setStandings] = useState<RacingStanding[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setSchedule([]);
    setStandings([]);
    setNews([]);

    Promise.all([
      fetchRacingSchedule(tab),
      fetchRacingStandings(tab),
      fetchRacingNews(tab),
    ]).then(([sched, stand, articles]) => {
      setSchedule(sched);
      setStandings(stand);
      setNews(articles);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      setError(true);
    });
  }, [tab]);

  const upcoming = schedule.filter(e => e.status === 'pre');
  const recent   = schedule.filter(e => e.status === 'post');
  const live     = schedule.filter(e => e.status === 'in');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="flex items-center gap-3">
        <Flag size={14} className="text-[#FF8C00]" />
        <h3 className="text-[11px] font-black uppercase tracking-[0.4em] text-white/60">{cfg.label}</h3>
      </div>

      {loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => <div key={i} className="h-20 rounded-[1.5rem] bg-white/5 animate-pulse" />)}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-[1.5rem] bg-white/5 animate-pulse" />)}</div>
        </div>
      )}

      {!loading && error && (
        <div className="py-16 text-center space-y-4">
          <AlertCircle size={32} className="mx-auto text-white/15" />
          <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">Could not load {cfg.label} data</p>
        </div>
      )}

      {!loading && !error && (
        <>
          {live.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-red-400 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live Now
              </h4>
              {live.map(race => (
                <div key={race.id} className="bg-red-500/5 border border-red-500/20 rounded-[1.5rem] p-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-black">{race.name}</p>
                      <p className="text-[8px] font-bold text-white/35 mt-1 flex items-center gap-1"><MapPin size={8} />{race.venue}{race.city ? ` · ${race.city}` : ''}</p>
                    </div>
                    <span className="text-[7px] font-black uppercase tracking-widest text-red-400 animate-pulse shrink-0">● Live</span>
                  </div>
                  {race.results.length > 0 && (
                    <div className="space-y-1.5">
                      {race.results.slice(0, 5).map((r, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-[8px] font-black text-white/30 w-4">{r.pos}</span>
                          {r.driverLogo && <img src={r.driverLogo} alt="" className="w-5 h-5 rounded-full object-cover opacity-80" loading="lazy" />}
                          <span className="flex-1 text-[9px] font-bold truncate">{r.driverName}</span>
                          <span className="text-[7px] font-bold text-white/35 truncate">{r.teamName}</span>
                          {r.time && <span className="text-[8px] font-black text-white/50 shrink-0">{r.time}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {standings.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Trophy size={10} /> Championship Standings</h4>
              <div className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden">
                <div className="divide-y divide-white/5">
                  {standings.slice(0, 20).map((s, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-all">
                      <span className={`text-[9px] font-black w-5 shrink-0 ${i === 0 ? 'text-[#FF8C00]' : i < 3 ? 'text-white/60' : 'text-white/20'}`}>{s.rank || i + 1}</span>
                      {s.driverLogo
                        ? <img src={s.driverLogo} alt="" className="w-6 h-6 rounded-full object-cover opacity-80 shrink-0" loading="lazy" />
                        : <div className="w-6 h-6 rounded-full bg-white/10 shrink-0 flex items-center justify-center"><User size={10} className="text-white/30" /></div>
                      }
                      <span className="flex-1 text-[9px] font-bold truncate">{s.driverName}</span>
                      <span className="text-[8px] font-bold text-white/30 truncate max-w-[90px] hidden md:block">{s.teamName}</span>
                      {s.wins > 0 && <span className="text-[7px] font-black text-[#FF8C00] shrink-0">{s.wins}W</span>}
                      <span className={`text-[9px] font-black shrink-0 ${i === 0 ? 'text-[#FF8C00]' : 'text-white/60'}`}>{s.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Calendar size={10} /> Upcoming Races</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {upcoming.slice(0, 6).map(race => (
                  <div key={race.id} className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] p-4 space-y-2 hover:bg-white/[0.06] hover:border-white/15 transition-all">
                    <p className="text-[9px] font-black leading-snug">{race.name}</p>
                    <p className="text-[7px] font-bold text-white/30 flex items-center gap-1"><MapPin size={7} />{race.venue || race.city}</p>
                    <p className="text-[7px] font-black text-[#FF8C00] flex items-center gap-1"><Clock size={7} />
                      {race.date ? new Date(race.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'TBD'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Clock size={10} /> Recent Results</h4>
              <div className="space-y-3">
                {recent.slice(0, 4).map(race => (
                  <div key={race.id} className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] p-4 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[9px] font-black">{race.name}</p>
                        <p className="text-[7px] font-bold text-white/30 mt-0.5">{race.city || race.venue}</p>
                      </div>
                      <span className="text-[7px] font-black uppercase tracking-widest text-white/20 shrink-0">
                        {race.date ? new Date(race.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>
                    {race.results.length > 0 && (
                      <div className="space-y-1.5">
                        {race.results.slice(0, 3).map((r, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className={`text-[8px] font-black w-4 shrink-0 ${i === 0 ? 'text-[#FF8C00]' : 'text-white/20'}`}>{r.pos}</span>
                            {r.driverLogo && <img src={r.driverLogo} alt="" className="w-5 h-5 rounded-full object-cover opacity-75" loading="lazy" />}
                            <span className="flex-1 text-[9px] font-bold truncate">{r.driverName}</span>
                            <span className="text-[7px] text-white/30 truncate">{r.teamName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {news.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Newspaper size={10} /> {cfg.label} News</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {news.slice(0, 8).map((article: any, i: number) => (
                  <a key={i} href={article.links?.web?.href || '#'} target="_blank" rel="noopener noreferrer"
                    className="flex gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group">
                    {article.images?.[0]?.url && (
                      <img src={article.images[0].url} alt="" className="w-14 h-10 object-cover rounded-lg shrink-0 opacity-75 group-hover:opacity-100 transition-opacity" loading="lazy" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[9px] font-bold leading-snug line-clamp-2 group-hover:text-[#FF8C00] transition-colors">{article.headline || article.title}</p>
                      <p className="text-[7px] font-black uppercase tracking-widest text-white/20 mt-1">{article.published ? new Date(article.published).toLocaleDateString() : ''}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {schedule.length === 0 && standings.length === 0 && news.length === 0 && (
            <div className="py-16 text-center space-y-4">
              <Flag size={32} className="mx-auto text-white/10" />
              <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">No {cfg.label} data available right now</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};
