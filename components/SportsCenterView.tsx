import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  fetchLeagueTeams, fetchLeagueNews, fetchLeagueStandings, fetchLeagueScores,
  fetchRichTeamPage, fetchEsportsNews,
  ESPORTS_ORGS,
  type SportsTeam, type RichTeamPage, type EsportsOrg,
} from '../services/sportsService';
import {
  Search, ChevronLeft, Newspaper, Users, Trophy, Calendar,
  MapPin, Building2, Star, TrendingUp, User, ExternalLink,
  Pin, PinOff, RefreshCw, AlertCircle, Gamepad2, Globe,
} from 'lucide-react';

interface Props {
  selectedSportsTab: string;
}

type TeamTab = 'overview' | 'roster' | 'legends' | 'news';

const LEAGUE_TABS = ['NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'ESPORTS'] as const;

const PINS_KEY = 'vibestream_sports_pins_v1';

function loadPins(): string[] {
  try { return JSON.parse(localStorage.getItem(PINS_KEY) || '[]'); } catch { return []; }
}
function savePins(ids: string[]) {
  localStorage.setItem(PINS_KEY, JSON.stringify(ids));
}

export const SportsCenterView: React.FC<Props> = ({ selectedSportsTab }) => {
  const [teamSearch, setTeamSearch] = useState('');
  const [leagueTeams, setLeagueTeams] = useState<SportsTeam[]>([]);
  const [leagueLoading, setLeagueLoading] = useState(false);
  const [leagueError, setLeagueError] = useState(false);
  const [leagueScores, setLeagueScores] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [standings, setStandings] = useState<any[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => loadPins());

  const [selectedTeam, setSelectedTeam] = useState<SportsTeam | null>(null);
  const [selectedOrg, setSelectedOrg] = useState<EsportsOrg | null>(null);
  const [richData, setRichData] = useState<RichTeamPage | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamTab, setTeamTab] = useState<TeamTab>('overview');

  const isLeague = (LEAGUE_TABS as readonly string[]).includes(selectedSportsTab);
  const isEsports = selectedSportsTab === 'ESPORTS';

  // Filtered teams/orgs based on search
  const filteredTeams = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return leagueTeams;
    return leagueTeams.filter(t =>
      [t.name, t.location, t.nickname, t.abbreviation]
        .some(s => s.toLowerCase().includes(q))
    );
  }, [leagueTeams, teamSearch]);

  const filteredOrgs = useMemo(() => {
    const q = teamSearch.trim().toLowerCase();
    if (!q) return ESPORTS_ORGS;
    return ESPORTS_ORGS.filter(o =>
      [o.name, o.abbreviation, o.region, ...o.games]
        .some(s => s.toLowerCase().includes(q))
    );
  }, [teamSearch]);

  const pinnedTeams = useMemo(() =>
    leagueTeams.filter(t => pinnedIds.includes(t.id)),
    [leagueTeams, pinnedIds]
  );
  const pinnedOrgs = useMemo(() =>
    ESPORTS_ORGS.filter(o => pinnedIds.includes(o.id)),
    [pinnedIds]
  );

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

    Promise.all([
      fetchLeagueTeams(selectedSportsTab),
      fetchLeagueNews(selectedSportsTab),
      fetchLeagueStandings(selectedSportsTab),
      fetchLeagueScores(selectedSportsTab),
    ]).then(([teams, newsData, standingsData, scoresData]) => {
      setLeagueTeams(teams);
      setNews(newsData);
      setStandings(standingsData);
      setLeagueScores(scoresData);
      setLeagueLoading(false);
      if (teams.length === 0) setLeagueError(true);
    }).catch(() => {
      setLeagueLoading(false);
      setLeagueError(true);
    });
  }, [selectedSportsTab, isLeague, isEsports]);

  // Load on tab switch
  useEffect(() => {
    if (!isLeague) return;
    setSelectedTeam(null);
    setSelectedOrg(null);
    setRichData(null);
    setTeamSearch('');

    if (isEsports) {
      setLeagueLoading(true);
      fetchEsportsNews()
        .then(articles => { setNews(articles); setLeagueLoading(false); })
        .catch(() => setLeagueLoading(false));
    } else {
      loadLeague();
    }
  }, [selectedSportsTab]);

  // Load rich team page when selected
  useEffect(() => {
    if (!selectedTeam) return;
    setTeamLoading(true);
    setRichData(null);
    setTeamTab('overview');
    fetchRichTeamPage(selectedSportsTab, selectedTeam.id, selectedTeam.nickname, selectedTeam.location)
      .then(data => { setRichData(data); setTeamLoading(false); })
      .catch(() => setTeamLoading(false));
  }, [selectedTeam, selectedSportsTab]);

  if (!isLeague) return null;

  // ─── TEAM PAGE ────────────────────────────────────────────────────────────
  if (selectedTeam || selectedOrg) {
    const org = selectedOrg;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Back */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setSelectedTeam(null); setSelectedOrg(null); setRichData(null); }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
          >
            <ChevronLeft size={12} /> All {selectedSportsTab} {isEsports ? 'Orgs' : 'Teams'}
          </button>
          {(selectedTeam || org) && (
            <button
              onClick={() => togglePin((selectedTeam?.id || org!.id))}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                pinnedIds.includes(selectedTeam?.id || org!.id)
                  ? 'bg-[#FF8C00]/20 border-[#FF8C00]/40 text-[#FF8C00]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
              }`}
            >
              {pinnedIds.includes(selectedTeam?.id || org!.id)
                ? <><PinOff size={10} /> Unpin</>
                : <><Pin size={10} /> Pin to My Teams</>
              }
            </button>
          )}
        </div>

        {/* Fanart banner */}
        {richData?.fanart && (
          <div className="relative h-44 rounded-[2.5rem] overflow-hidden border border-white/10">
            <img src={richData.fanart} alt="" className="w-full h-full object-cover opacity-40" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
          </div>
        )}

        {/* Header */}
        {selectedTeam && (
          <div
            className="flex items-center gap-5 p-6 rounded-[2.5rem] border border-white/10 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${selectedTeam.color}22, transparent)` }}
          >
            <div className="absolute inset-0 opacity-5" style={{ background: selectedTeam.color }} />
            <img src={richData?.badge || selectedTeam.logo} alt={selectedTeam.name} className="w-20 h-20 object-contain drop-shadow-2xl relative z-10" />
            <div className="flex-1 relative z-10">
              <h2 className="text-3xl font-black uppercase tracking-tight leading-none">{selectedTeam.location}</h2>
              <h3 className="text-xl font-black uppercase tracking-tight" style={{ color: selectedTeam.altColor !== '#ffffff' ? selectedTeam.altColor : '#FF8C00' }}>
                {selectedTeam.nickname}
              </h3>
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
          <div
            className="flex items-center gap-5 p-6 rounded-[2.5rem] border border-white/10 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${org.color}22, transparent)` }}
          >
            <div className="absolute inset-0 opacity-5" style={{ background: org.color }} />
            <img
              src={org.logo}
              alt={org.name}
              className="w-20 h-20 object-contain drop-shadow-2xl relative z-10 rounded-2xl"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
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

        {/* Org description */}
        {org?.description && (
          <div className="p-5 bg-white/[0.03] rounded-[1.5rem] border border-white/8">
            <p className="text-sm text-white/60 leading-relaxed">{org.description}</p>
          </div>
        )}

        {/* Tab strip (only for regular teams with rich data) */}
        {selectedTeam && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {(['overview', 'roster', 'legends', 'news'] as TeamTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setTeamTab(tab)}
                className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all shrink-0 ${
                  teamTab === tab
                    ? 'bg-[#FF8C00] text-black shadow-[0_0_20px_rgba(255,140,0,0.35)]'
                    : 'bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab === 'overview' ? 'Overview' : tab === 'roster' ? 'Roster' : tab === 'legends' ? 'Legends' : 'Headlines'}
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
                      <h4 className="text-[8px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2"><Calendar size={10} /> Recent Schedule</h4>
                      <div className="space-y-2">
                        {richData.recentGames.slice(0, 6).map((game: any, i: number) => {
                          const comps = game.competitions?.[0];
                          const away = comps?.competitors?.find((c: any) => c.homeAway === 'away');
                          const home = comps?.competitors?.find((c: any) => c.homeAway === 'home');
                          const done = comps?.status?.type?.completed;
                          return (
                            <div key={i} className="flex items-center justify-between px-5 py-3 bg-white/[0.03] rounded-2xl border border-white/5 hover:bg-white/[0.06] transition-all">
                              <div className="flex items-center gap-2">
                                <img src={away?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-70" />
                                <span className="text-[9px] font-black uppercase">{away?.team?.abbreviation}</span>
                                <span className="text-[8px] text-white/25">@</span>
                                <img src={home?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-70" />
                                <span className="text-[9px] font-black uppercase">{home?.team?.abbreviation}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[8px] font-bold text-white/35">{game.status?.type?.shortDetail || ''}</span>
                                {done && <span className="text-[9px] font-black text-white">{away?.score} – {home?.score}</span>}
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
                          <div key={ai} className="flex items-center gap-4 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.07] rounded-2xl border border-white/5 transition-all group">
                            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-white/10 border border-white/10">
                              {a.headshot?.href
                                ? <img src={a.headshot.href} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                                : <div className="w-full h-full flex items-center justify-center"><User size={14} className="text-white/20" /></div>
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-black uppercase tracking-tight truncate">{a.fullName || a.displayName}</p>
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
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0 border border-white/10" style={{ background: `${selectedTeam.color}40` }}>
                                {a.jersey}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
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
                        className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden hover:border-white/20 hover:bg-white/[0.06] transition-all group"
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
                      className="flex gap-4 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group"
                    >
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

  // ─── LEAGUE VIEW ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          type="text"
          value={teamSearch}
          onChange={e => setTeamSearch(e.target.value)}
          placeholder={`Search ${selectedSportsTab} ${isEsports ? 'organizations' : 'teams'}...`}
          className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-full text-sm font-bold placeholder:text-white/20 focus:outline-none focus:border-[#FF8C00]/50 transition-all"
        />
      </div>

      {/* E-SPORTS SPECIFIC VIEW */}
      {isEsports && (
        <>
          {/* Pinned Orgs */}
          {pinnedOrgs.length > 0 && !teamSearch && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Pin size={10} /> Pinned Orgs</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {pinnedOrgs.map(org => (
                  <OrgCard key={org.id} org={org} isPinned pinnedIds={pinnedIds} onSelect={setSelectedOrg} onTogglePin={togglePin} />
                ))}
              </div>
            </div>
          )}

          {/* E-Sports News */}
          {news.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><Newspaper size={10} /> Esports Headlines</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {news.slice(0, 8).map((article: any, i: number) => (
                  <a key={i} href={article.links?.web?.href || '#'} target="_blank" rel="noopener noreferrer"
                    className="flex gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group"
                  >
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

          {/* Orgs Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2">
                <Gamepad2 size={10} /> Esports Organizations
                {teamSearch && ` · ${filteredOrgs.length} results`}
              </h4>
              {!teamSearch && <span className="text-[7px] text-white/20 font-bold uppercase">Tap to view · Pin to track</span>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filteredOrgs.map(org => (
                <OrgCard key={org.id} org={org} isPinned={pinnedIds.includes(org.id)} pinnedIds={pinnedIds} onSelect={setSelectedOrg} onTogglePin={togglePin} />
              ))}
              {filteredOrgs.length === 0 && teamSearch && (
                <div className="col-span-full py-10 text-center">
                  <p className="text-[9px] font-black uppercase text-white/20 tracking-widest">No orgs match "{teamSearch}"</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* STANDARD LEAGUE VIEW */}
      {!isEsports && (
        <>
          {/* Live Scores */}
          {leagueScores.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_red]" />
                <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">Live Scores</h4>
              </div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4">
                {leagueScores.slice(0, 12).map((event: any) => {
                  const comps = event.competitions?.[0];
                  const away = comps?.competitors?.find((c: any) => c.homeAway === 'away');
                  const home = comps?.competitors?.find((c: any) => c.homeAway === 'home');
                  const isLive = event.status?.type?.state === 'in';
                  return (
                    <div key={event.id} className={`min-w-[190px] bg-white/5 border rounded-[1.5rem] p-4 flex flex-col gap-2.5 shrink-0 ${isLive ? 'border-red-500/30' : 'border-white/8'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[7px] font-black uppercase tracking-widest text-white/25 truncate">{event.status?.type?.shortDetail}</span>
                        {isLive && <span className="text-[7px] font-black uppercase tracking-widest text-red-500 animate-pulse shrink-0">● Live</span>}
                      </div>
                      {[away, home].filter(Boolean).map((team: any) => (
                        <div key={team?.id} className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <img src={team?.team?.logo} alt="" className="w-5 h-5 object-contain opacity-80" loading="lazy" />
                            <span className={`text-[9px] font-black uppercase ${team?.winner ? 'text-white' : 'text-white/45'}`}>{team?.team?.abbreviation}</span>
                          </div>
                          <span className={`text-xs font-black ${team?.winner ? 'text-[#FF8C00]' : 'text-white/55'}`}>{team?.score ?? '–'}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
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
                      className="flex gap-3 p-4 bg-white/[0.03] border border-white/8 rounded-[1.5rem] hover:bg-white/[0.07] hover:border-white/20 transition-all group"
                    >
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
                {selectedSportsTab} Teams
                {teamSearch && filteredTeams.length < leagueTeams.length ? ` · ${filteredTeams.length} results` : ''}
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
                <button
                  onClick={loadLeague}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all"
                >
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

          {/* Standings */}
          {standings.length > 0 && !leagueLoading && (
            <div className="space-y-3">
              <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40 flex items-center gap-2"><TrendingUp size={10} /> Standings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {standings.slice(0, 2).map((conference: any, ci: number) => (
                  <div key={ci} className="bg-white/[0.03] border border-white/8 rounded-[1.5rem] overflow-hidden">
                    <div className="px-4 py-2.5 bg-white/5 border-b border-white/5">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/40">{conference.name || conference.abbreviation || `Conference ${ci + 1}`}</p>
                    </div>
                    <div className="divide-y divide-white/5">
                      {(conference.standings?.entries || conference.entries || []).slice(0, 8).map((entry: any, ei: number) => {
                        const tName = entry.team?.displayName || entry.team?.name || entry.displayName || '';
                        const wins = entry.stats?.find((s: any) => s.name === 'wins' || s.abbreviation === 'W')?.value ?? '';
                        const losses = entry.stats?.find((s: any) => s.name === 'losses' || s.abbreviation === 'L')?.value ?? '';
                        return (
                          <div key={ei} onClick={() => {
                            const found = leagueTeams.find(t =>
                              t.name.toLowerCase().includes((entry.team?.name || '').toLowerCase()) ||
                              t.abbreviation === entry.team?.abbreviation
                            );
                            if (found) setSelectedTeam(found);
                          }} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-all cursor-pointer">
                            <span className="text-[8px] font-black text-white/20 w-4">{ei + 1}</span>
                            <img src={entry.team?.logos?.[0]?.href || ''} alt="" className="w-5 h-5 object-contain opacity-60" loading="lazy" />
                            <span className="flex-1 text-[9px] font-black uppercase truncate">{tName}</span>
                            {(wins !== '' || losses !== '') && <span className="text-[8px] font-bold text-white/35">{wins}–{losses}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─── Shared sub-components ───────────────────────────────────────────────────

const TeamCard: React.FC<{
  team: SportsTeam;
  isPinned: boolean;
  pinnedIds: string[];
  onSelect: (t: SportsTeam) => void;
  onTogglePin: (id: string) => void;
}> = ({ team, isPinned, onSelect, onTogglePin }) => (
  <div className="relative group">
    <button
      onClick={() => onSelect(team)}
      className="w-full flex flex-col items-center gap-2 p-4 rounded-[1.5rem] border border-white/10 hover:border-[#FF8C00]/40 bg-white/[0.03] hover:bg-white/[0.07] transition-all overflow-hidden text-center"
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity rounded-[1.5rem]" style={{ background: team.color }} />
      <img src={team.logo} alt={team.abbreviation} className="w-10 h-10 object-contain drop-shadow group-hover:scale-110 transition-transform relative z-10" loading="lazy" />
      <div className="relative z-10">
        <p className="text-[9px] font-black uppercase tracking-tight leading-tight">{team.location}</p>
        <p className="text-[8px] font-bold text-white/40 uppercase">{team.nickname}</p>
        {team.record && <p className="text-[7px] font-bold text-white/25 mt-0.5">{team.record}</p>}
      </div>
    </button>
    <button
      onClick={e => { e.stopPropagation(); onTogglePin(team.id); }}
      className={`absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isPinned ? 'text-[#FF8C00] opacity-100' : 'text-white/30 hover:text-[#FF8C00] bg-black/40'}`}
      title={isPinned ? 'Unpin' : 'Pin to My Teams'}
    >
      <Pin size={10} />
    </button>
  </div>
);

const OrgCard: React.FC<{
  org: EsportsOrg;
  isPinned: boolean;
  pinnedIds: string[];
  onSelect: (o: EsportsOrg) => void;
  onTogglePin: (id: string) => void;
}> = ({ org, isPinned, onSelect, onTogglePin }) => (
  <div className="relative group">
    <button
      onClick={() => onSelect(org)}
      className="w-full flex flex-col items-center gap-2 p-4 rounded-[1.5rem] border border-white/10 hover:border-[#FF8C00]/40 bg-white/[0.03] hover:bg-white/[0.07] transition-all overflow-hidden text-center"
    >
      <div className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity rounded-[1.5rem]" style={{ background: org.color }} />
      <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 relative z-10 flex items-center justify-center">
        <img
          src={org.logo}
          alt={org.abbreviation}
          className="w-full h-full object-contain drop-shadow group-hover:scale-110 transition-transform"
          loading="lazy"
          onError={(e) => {
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
          {org.games.slice(0, 2).map(g => (
            <span key={g} className="text-[6px] font-black uppercase text-white/25">{g}</span>
          ))}
          {org.games.length > 2 && <span className="text-[6px] font-black uppercase text-white/25">+{org.games.length - 2}</span>}
        </div>
      </div>
    </button>
    <button
      onClick={e => { e.stopPropagation(); onTogglePin(org.id); }}
      className={`absolute top-2 right-2 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-all ${isPinned ? 'text-[#FF8C00] opacity-100' : 'text-white/30 hover:text-[#FF8C00] bg-black/40'}`}
      title={isPinned ? 'Unpin' : 'Pin'}
    >
      <Pin size={10} />
    </button>
  </div>
);
