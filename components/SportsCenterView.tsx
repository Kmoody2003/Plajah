import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchLeagueTeams, fetchLeagueNews, fetchLeagueStandings, fetchLeagueScores,
  fetchEsportsNews, fetchLeagueLeaders, fetchPlayerProfile,
  fetchRacingSchedule, fetchRacingStandings, fetchRacingNews,
  getRacingCfg, ESPORTS_ORGS, LEAGUE_CHAMPIONS,
  getSpecialtySportCfg,
  type SportsTeam, type EsportsOrg, type LeaderCategory,
  type RaceEvent, type RacingStanding, type ChampionEntry,
} from '../services/sportsService';
import { TeamPageView } from './sports/TeamPageView';
import { getLeagueStaticTeams, findStaticTeam } from '../data/leagueTeams';
import ErrorBoundary from './ErrorBoundary';
const SportExplainerModule = lazy(() => import('./sports/SportExplainerModule'));
const StatCardBuilder       = lazy(() => import('./sports/StatCardBuilder').then(m => ({ default: m.StatCardBuilder })));
const RaceHistoryView       = lazy(() => import('./sports/RaceHistoryView').then(m => ({ default: m.RaceHistoryView })));
import {
  Search, ChevronLeft, Newspaper, Users, Trophy, Calendar,
  MapPin, Building2, Star, TrendingUp, User, ExternalLink,
  Pin, PinOff, RefreshCw, AlertCircle, Gamepad2, Globe, Flag, Clock,
  BarChart2, Award, Zap, Shield, ChevronRight, X, BookOpen, CreditCard, History,
  Sparkles,
} from 'lucide-react';

interface Props {
  selectedSportsTab: 'NBA' | 'NFL' | 'NHL' | 'MLB' | 'NCAA' | 'FIFA' | 'MLS' | 'ESPORTS' | 'F1' | 'NASCAR' | 'INDYCAR' | string;
}

const LEAGUE_TABS = ['NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'WNBA', 'FIFA', 'MLS', 'ESPORTS', 'UFC', 'MMA', 'BOXING', 'MARTIAL_ARTS', 'FENCING', 'TENNIS', 'GOLF', 'CRICKET', 'RUGBY', 'WRESTLING', 'VOLLEYBALL', 'LACROSSE'] as const;
const PINS_KEY = 'vibestream_sports_pins_v1';

function loadPins(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '[]'); } catch { return []; }
}
function savePins(ids: string[]) { localStorage.setItem(PINS_KEY, JSON.stringify(ids)); }

const EXPLAINER_LEAGUES = new Set(['NBA', 'NFL', 'NHL', 'MLB', 'FIFA', 'MLS']);

export const SportsCenterView: React.FC<Props> = ({ selectedSportsTab }) => {
  const [teamSearch, setTeamSearch]       = useState('');
  const [leagueTeams, setLeagueTeams]     = useState<SportsTeam[]>([]);
  const [showExplainer, setShowExplainer] = useState(false);
  const [leagueLoading, setLeagueLoading] = useState(true);  // true so skeleton shows immediately
  const [leagueError, setLeagueError]     = useState(false);
  const [leagueScores, setLeagueScores]   = useState<any[]>([]);
  const [news, setNews]                   = useState<any[]>([]);
  const [standings, setStandings]         = useState<any[]>([]);
  const [leagueLeaders, setLeagueLeaders] = useState<LeaderCategory[]>([]);
  const [pinnedIds, setPinnedIds]         = useState<string[]>(() => loadPins());
  const [predictions, setPredictions]     = useState<Record<string, 'home' | 'away'>>({});
  const [showStatCard, setShowStatCard]   = useState(false);
  const [showRaceHistory, setShowRaceHistory] = useState(false);

  const [selectedTeam, setSelectedTeam]   = useState<SportsTeam | null>(null);
  const [selectedOrg, setSelectedOrg]     = useState<EsportsOrg | null>(null);

  const [selectedPlayer, setSelectedPlayer]   = useState<{ id: string; name: string } | null>(null);
  const [playerProfile, setPlayerProfile]     = useState<any>(null);
  const [playerLoading, setPlayerLoading]     = useState(false);

  const isLeague  = (LEAGUE_TABS as readonly string[]).includes(selectedSportsTab);
  const isEsports = selectedSportsTab === 'ESPORTS';
  const isRacing  = !!getRacingCfg(selectedSportsTab);
  const specialtyCfg = getSpecialtySportCfg(selectedSportsTab);

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
    setLeagueError(false);

    // Pre-populate teams grid from static data immediately (no API wait)
    const staticTeams = specialtyCfg ? [] : getLeagueStaticTeams(selectedSportsTab).map(s => ({
      id: s.espnId || s.id,
      name: s.name,
      location: s.location,
      nickname: s.nickname,
      abbreviation: s.abbreviation,
      logo: s.logo,
      color: s.color,
      altColor: s.altColor,
      record: '',
      tsdbId: s.tsdbId,
    } as SportsTeam));
    if (staticTeams.length > 0) {
      setLeagueTeams(staticTeams);
      setLeagueLoading(false);
    } else {
      setLeagueLoading(true);
      setLeagueTeams([]);
    }

    Promise.allSettled([
      fetchLeagueTeams(selectedSportsTab),
      fetchLeagueNews(selectedSportsTab),
      fetchLeagueStandings(selectedSportsTab),
      fetchLeagueScores(selectedSportsTab),
      fetchLeagueLeaders(selectedSportsTab),
    ]).then(([teamsR, newsR, standingsR, scoresR, leadersR]) => {
      const apiTeams     = teamsR.status    === 'fulfilled' ? teamsR.value    : [];
      const newsData     = newsR.status     === 'fulfilled' ? newsR.value     : [];
      const standingsData= standingsR.status=== 'fulfilled' ? standingsR.value: [];
      const scoresData   = scoresR.status   === 'fulfilled' ? scoresR.value   : [];
      const leadersData  = leadersR.status  === 'fulfilled' ? leadersR.value  : [];

      // Merge API teams with static data: static provides logo/colors, API provides live record
      const merged: SportsTeam[] = apiTeams.length > 0 ? apiTeams.map(t => {
        const s = findStaticTeam(selectedSportsTab, t.name) ?? findStaticTeam(selectedSportsTab, t.abbreviation);
        return s ? { ...t, logo: s.logo || t.logo, color: s.color || t.color, altColor: s.altColor || t.altColor } : t;
      }) : staticTeams;

      setLeagueTeams(merged);
      setNews(newsData);
      setStandings(standingsData);
      setLeagueScores(scoresData);
      setLeagueLeaders(leadersData);
      setLeagueLoading(false);
      if (!specialtyCfg && merged.length === 0 && newsData.length === 0 && standingsData.length === 0) {
        setLeagueError(true);
      }
    });
  }, [selectedSportsTab, isLeague, isEsports, specialtyCfg]);

  useEffect(() => {
    if (!isLeague) return;
    setSelectedTeam(null);
    setSelectedOrg(null);
    setTeamSearch('');
    setSelectedPlayer(null);
    setPlayerProfile(null);
    setNews([]);
    setStandings([]);
    setLeagueScores([]);
    setLeagueLeaders([]);
    if (isEsports) {
      setLeagueLoading(true);
      fetchEsportsNews().then(a => { setNews(a); setLeagueLoading(false); }).catch(() => setLeagueLoading(false));
    } else {
      loadLeague();
    }
  }, [selectedSportsTab]);

  useEffect(() => {
    if (!selectedPlayer) return;
    setPlayerLoading(true);
    setPlayerProfile(null);
    fetchPlayerProfile(selectedSportsTab, selectedPlayer.id)
      .then(p => { setPlayerProfile(p); setPlayerLoading(false); })
      .catch(() => setPlayerLoading(false));
  }, [selectedPlayer, selectedSportsTab]);

  // â"€â"€â"€ RACING â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (isRacing) return <RacingCenterView tab={selectedSportsTab} />;
  if (!isLeague) return null;

  // ─── SPORT EXPLAINER ────────────────────────────────────────────────────────
  if (showExplainer && EXPLAINER_LEAGUES.has(selectedSportsTab)) {
    return (
      <ErrorBoundary>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-[--small-orange]/20 border-t-[--small-orange] rounded-full animate-spin" />
          </div>
        }>
          <SportExplainerModule
            league={selectedSportsTab as any}
            onBack={() => setShowExplainer(false)}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // â"€â"€â"€ PLAYER PROFILE MODAL â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
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
                  ? <img loading="lazy" decoding="async" src={playerProfile.headshot.href} alt="" className="w-full h-full object-cover object-top" />
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

  // â"€â"€â"€ TEAM PAGE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  if (selectedTeam) {
    const staticData = findStaticTeam(selectedSportsTab, selectedTeam.name)
      ?? findStaticTeam(selectedSportsTab, selectedTeam.abbreviation);
    return (
      <ErrorBoundary key={selectedTeam.id}>
        <TeamPageView
          team={selectedTeam}
          tab={selectedSportsTab}
          staticData={staticData}
          pinnedIds={pinnedIds}
          onBack={() => setSelectedTeam(null)}
          onTogglePin={togglePin}
          onSelectPlayer={(p) => { setSelectedPlayer(p); setPlayerProfile(null); }}
          leagueNews={news}
        />
      </ErrorBoundary>
    );
  }

  if (selectedOrg) {
    const org = selectedOrg;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Back + Pin */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setSelectedOrg(null); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all">
            <ChevronLeft size={12} /> All ESPORTS Orgs
          </button>
          {org && (
            <button onClick={() => togglePin(org.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                pinnedIds.includes(org.id)
                  ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
              }`}>
              {pinnedIds.includes(org.id) ? <><PinOff size={10} /> Unpin</> : <><Pin size={10} /> Pin</>}
            </button>
          )}
        </div>

        {/* Esports org header */}
        {org && (
          <div className="flex items-center gap-5 p-6 rounded-[2.5rem] border border-white/10 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${org.color}22, transparent)` }}>
            <div className="absolute inset-0 opacity-5" style={{ background: org.color }} />
            <img loading="lazy" decoding="async" src={org.logo} alt={org.name} className="w-20 h-20 object-contain drop-shadow-2xl relative z-10 rounded-2xl"
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
      </motion.div>
    );
  }

  // â"€â"€â"€ LEAGUE VIEW â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  return (
    <>
    <div className="space-y-10">

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input type="text" value={teamSearch} onChange={e => setTeamSearch(e.target.value)}
          placeholder={`Search ${selectedSportsTab} ${isEsports ? 'organizations' : 'teams'}...`}
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-full text-sm font-bold placeholder:text-white/20 focus:outline-none focus:border-[#FF8C00]/50 transition-all"
        />
      </div>

      {/* Action buttons row */}
      <div className="flex items-center gap-2 flex-wrap">
        <motion.button
          onClick={() => setShowStatCard(true)}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#FF8C00]/10 border border-[#FF8C00]/30 rounded-full text-xs font-black uppercase tracking-widest text-[#FF8C00] hover:bg-[#FF8C00]/20 transition-all"
        >
          <CreditCard size={11} /> Stat Cards
        </motion.button>
        {(selectedSportsTab === 'F1' || selectedSportsTab === 'NASCAR' || selectedSportsTab === 'INDYCAR') && (
          <motion.button
            onClick={() => setShowRaceHistory(true)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-full text-xs font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-[#FF8C00]/50 transition-all"
          >
            <History size={11} /> Race Deep Dive
          </motion.button>
        )}
        {/* Ask Aria — sports research agent, available for all leagues */}
        <motion.button
          onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', {
            detail: {
              prompt: `Act as Aria, Plajah's sports analytics expert. I'm looking at ${selectedSportsTab}. Give me a deep, insightful breakdown: current standings outlook, top performers to watch, key storylines this season, and 3 surprising stats most fans don't know. Be specific, data-driven, and fan-friendly.`,
            },
          }))}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 border border-purple-500/30 rounded-full text-xs font-black uppercase tracking-widest text-purple-400 hover:bg-purple-500/20 transition-all"
        >
          <Sparkles size={11} /> Ask Aria
        </motion.button>
      </div>

      {/* Learn How To Play button */}
      {EXPLAINER_LEAGUES.has(selectedSportsTab) && (
        <motion.button
          onClick={() => setShowExplainer(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-widest text-white/60 hover:text-white hover:border-[#FF8C00]/50 hover:bg-[#FF8C00]/5 transition-all"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          <BookOpen size={11} /> Learn How to Play
        </motion.button>
      )}

      {/* â"€â"€ ESPORTS â"€â"€ */}
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
                      <p className="text-xs font-bold leading-snug line-clamp-2 group-hover:text-[#FF8C00] transition-colors">{article.headline || article.title}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">{article.published ? new Date(article.published).toLocaleDateString() : ''}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Gamepad2 size={10} /> Esports Organizations{teamSearch && ` Â· ${filteredOrgs.length} results`}</h4>
              {!teamSearch && <span className="text-[7px] text-white/20 font-bold uppercase">Tap to view Â· Pin to track</span>}
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

      {/* â"€â"€ STANDARD LEAGUE â"€â"€ */}
      {!isEsports && (
        <>
          {specialtyCfg && (
            <div className="space-y-5">
              <div className="p-5 rounded-[2rem] bg-white/[0.03] border border-white/8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">{specialtyCfg.sportFamily}</p>
                    <h3 className="text-2xl font-black uppercase tracking-tight mt-1">{specialtyCfg.label}</h3>
                    <p className="text-sm text-white/50 leading-relaxed mt-2 max-w-2xl">{specialtyCfg.summary}</p>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('OPEN_ARIA', {
                      detail: {
                        prompt: `Act as Aria, Plajah's sports analytics expert. Build an interactive ${specialtyCfg.label} visualization using the latest public sports data available in Plajah Sports. Suggest chart types, key metrics, and a short fan-friendly story.`,
                      },
                    }))}
                    className="shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#FF8C00]/10 border border-[#FF8C00]/30 rounded-full text-[9px] font-black uppercase tracking-widest text-[#FF8C00] hover:bg-[#FF8C00]/20 transition-all"
                  >
                    <Sparkles size={11} /> Ask Aria
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {specialtyCfg.publicSources.map(source => (
                  <a
                    key={source.name}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 rounded-[1.5rem] bg-white/[0.03] border border-white/8 hover:border-[#FF8C00]/30 hover:bg-white/[0.06] transition-all group"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-black uppercase tracking-tight group-hover:text-[#FF8C00] transition-colors">{source.name}</p>
                      <ExternalLink size={12} className="text-white/20 group-hover:text-[#FF8C00]" />
                    </div>
                    <p className="text-[8px] text-white/35 leading-relaxed mt-2">{source.note}</p>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Today's Scoreboard â€" always rendered; shows skeleton while loading */}
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
                        {isLive && <span className="text-[7px] font-black text-red-400 animate-pulse shrink-0">â— Live</span>}
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
                            {team?.score ?? (isPre ? '' : 'â€"')}
                          </span>
                        </button>
                      ))}
                      {isPre && comps?.date && (
                        <p className="text-[7px] font-bold text-white/20 text-right">{new Date(comps.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                      )}
                      {isPre && away && home && (
                        <div className="flex gap-1.5 pt-1 border-t border-white/5">
                          {predictions[event.id] ? (
                            <p className="text-[7px] font-black uppercase tracking-widest text-[#FF8C00] w-full text-center">
                              Picked: {predictions[event.id] === 'away' ? away.team?.abbreviation : home.team?.abbreviation} ✓
                            </p>
                          ) : (
                            <>
                              <button
                                onClick={e => { e.stopPropagation(); setPredictions(p => ({ ...p, [event.id]: 'away' })); }}
                                className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-[#FF8C00]/20 border border-white/5 text-[6px] font-black uppercase tracking-widest text-white/40 hover:text-[#FF8C00] transition-all"
                              >{away.team?.abbreviation} wins</button>
                              <button
                                onClick={e => { e.stopPropagation(); setPredictions(p => ({ ...p, [event.id]: 'home' })); }}
                                className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-[#FF8C00]/20 border border-white/5 text-[6px] font-black uppercase tracking-widest text-white/40 hover:text-[#FF8C00] transition-all"
                              >{home.team?.abbreviation} wins</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Standings â€" always rendered for team/league sports */}
          {!specialtyCfg && <div className="space-y-3">
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
                          {/* Soccer leagues use W/D/L/Pts; all others use W/L/PCT/GB */}
                          {(selectedSportsTab === 'FIFA' || selectedSportsTab === 'MLS') ? (
                            <div className="hidden sm:flex items-center gap-3 text-[7px] font-black uppercase tracking-widest text-white/20">
                              <span className="w-4 text-right">W</span>
                              <span className="w-4 text-right">D</span>
                              <span className="w-4 text-right">L</span>
                              <span className="w-6 text-right">GD</span>
                              <span className="w-6 text-right text-[#FF8C00]">Pts</span>
                            </div>
                          ) : (
                            <div className="hidden sm:flex items-center gap-3 text-[7px] font-black uppercase tracking-widest text-white/20">
                              <span className="w-4 text-right">W</span>
                              <span className="w-4 text-right">L</span>
                              <span className="w-6 text-right">PCT</span>
                              <span className="w-5 text-right">GB</span>
                            </div>
                          )}
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
                            const isSoccer = selectedSportsTab === 'FIFA' || selectedSportsTab === 'MLS';
                            const wins  = getV(['wins', 'W', 'w']);
                            const losses= getV(['losses', 'L', 'l']);
                            const draws = getV(['ties', 'draws', 'D', 'd']);
                            const pct   = getV(['winPercent', 'PCT', 'pct', 'winPercentage']);
                            const gb    = getV(['gamesBehind', 'GB', 'gb', 'pointsBehind']);
                            const pts   = getV(['points', 'pts', 'Pts']);
                            const gd    = getV(['pointDifferential', 'goalsFor', 'GD', 'gd']);
                            return (
                              <button key={ei}
                                onClick={() => { const found = leagueTeams.find(t => t.name.toLowerCase().includes((entry.team?.name || '').toLowerCase()) || t.abbreviation === entry.team?.abbreviation); if (found) setSelectedTeam(found); }}
                                className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-white/5 transition-all group"
                              >
                                <span className={`text-[8px] font-black w-4 shrink-0 ${ei === 0 ? 'text-[#FF8C00]' : 'text-white/20'}`}>{ei + 1}</span>
                                <img src={entry.team?.logos?.[0]?.href || ''} alt="" className="w-5 h-5 object-contain opacity-60 shrink-0" loading="lazy" />
                                <span className="flex-1 text-xs font-black uppercase truncate group-hover:text-[#FF8C00] transition-colors text-left">{tName}</span>
                                {isSoccer ? (
                                  <div className="hidden sm:flex items-center gap-3 text-[8px] font-bold text-white/40 shrink-0">
                                    {wins  !== '' && <span className="w-4 text-right">{wins}</span>}
                                    {draws !== '' && <span className="w-4 text-right">{draws}</span>}
                                    {losses!== '' && <span className="w-4 text-right">{losses}</span>}
                                    {gd    !== '' && <span className="w-6 text-right text-white/25">{gd}</span>}
                                    {pts   !== '' && <span className="w-6 text-right text-[#FF8C00] font-black">{pts}</span>}
                                  </div>
                                ) : (
                                  <div className="hidden sm:flex items-center gap-3 text-[8px] font-bold text-white/40 shrink-0">
                                    {wins  !== '' && <span className="w-4 text-right">{wins}</span>}
                                    {losses!== '' && <span className="w-4 text-right">{losses}</span>}
                                    {pct   !== '' && <span className="w-6 text-right text-white/25">{typeof pct === 'number' ? Number(pct).toFixed(3) : pct}</span>}
                                    {gb    !== '' && <span className="w-5 text-right text-white/20">{gb}</span>}
                                  </div>
                                )}
                                <div className="sm:hidden text-[8px] font-bold text-white/35">{wins && losses ? `${wins}â€"${losses}` : ''}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>}

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
                          <span className="flex-1 text-xs font-bold truncate group-hover:text-[#FF8C00] transition-colors">{leader.name}</span>
                          <span className={`text-xs font-black shrink-0 ${li === 0 ? 'text-[#FF8C00]' : 'text-white/60'}`}>{leader.displayValue}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Champions History */}
          {(LEAGUE_CHAMPIONS[selectedSportsTab] ?? []).length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Award size={10} /> Championship History</h4>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
                {(LEAGUE_CHAMPIONS[selectedSportsTab] ?? []).map((c: ChampionEntry, i: number) => (
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
          {!specialtyCfg && pinnedTeams.length > 0 && !teamSearch && (
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
          {!specialtyCfg && <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">
                {selectedSportsTab} Teams{teamSearch && filteredTeams.length < leagueTeams.length ? ` Â· ${filteredTeams.length} results` : ''}
              </h4>
              {!teamSearch && leagueTeams.length > 0 && <span className="text-[7px] text-white/20 font-bold uppercase">Tap for team page Â· Pin to track</span>}
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
          </div>}
        </>
      )}
    </div>
      {/* ── Stat Card Builder ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showStatCard && (
          <Suspense fallback={null}>
            <StatCardBuilder
              onClose={() => setShowStatCard(false)}
              currentUser={null}
              initialTab={isEsports ? 'NBA' : selectedSportsTab}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* ── Race Deep Dive ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showRaceHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-xl overflow-y-auto custom-scrollbar"
          >
            <div className="max-w-4xl mx-auto px-4 py-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[0.4em] text-[#FF8C00]">Deep Dive</p>
                  <h2 className="text-2xl font-black uppercase tracking-tight text-white">{selectedSportsTab} Race History</h2>
                </div>
                <button onClick={() => setShowRaceHistory(false)} className="p-2.5 text-white/40 hover:text-white transition-colors bg-white/5 rounded-xl border border-white/10">
                  <X size={18} />
                </button>
              </div>
              <Suspense fallback={<div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-[#FF8C00]/20 border-t-[#FF8C00] rounded-full animate-spin" /></div>}>
                <RaceHistoryView tab={selectedSportsTab} />
              </Suspense>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

// â"€â"€â"€ TeamCard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€â"€ OrgCard â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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

// â"€â"€â"€ Racing Center View (F1 / NASCAR / IndyCar) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

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
                      <p className="text-[8px] font-bold text-white/35 mt-1 flex items-center gap-1"><MapPin size={8} />{race.venue}{race.city ? ` Â· ${race.city}` : ''}</p>
                    </div>
                    <span className="text-[7px] font-black uppercase tracking-widest text-red-400 animate-pulse shrink-0">â— Live</span>
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
                      <p className="text-xs font-bold leading-snug line-clamp-2 group-hover:text-[#FF8C00] transition-colors">{article.headline || article.title}</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mt-1">{article.published ? new Date(article.published).toLocaleDateString() : ''}</p>
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

          {/* ── F1 Race Deep Dive (OpenF1 data) ───────────────────────────── */}
          {tab === 'F1' && (
            <div className="mt-4">
              <div className="border-t border-white/8 pt-6">
                <div className="flex items-center gap-2 mb-5">
                  <History size={14} className="text-[#FF8C00]" />
                  <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/50">Race Deep Dive · OpenF1 Data</h4>
                </div>
                <Suspense fallback={<div className="h-24 bg-white/5 rounded-2xl animate-pulse" />}>
                  <RaceHistoryView tab="F1" />
                </Suspense>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};
