import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, 
  Users, 
  Trophy, 
  Calendar, 
  ExternalLink, 
  Play, 
  Newspaper,
  Zap,
  TrendingUp
} from 'lucide-react';
import { Team, PlayerStats, AppView } from '../types';
import { callGemini } from '../services/geminiService';

interface TeamDetailViewProps {
  teamName: string;
  onBack: () => void;
  onNavigate: (view: AppView) => void;
  onSelectPlayer: (player: PlayerStats) => void;
}

export const TeamDetailView: React.FC<TeamDetailViewProps> = ({ teamName, onBack, onNavigate, onSelectPlayer }) => {
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'ROSTER' | 'RESULTS' | 'HIGHLIGHTS' | 'NEWS' | 'HISTORY' | 'FACTS' | 'STATS'>('NEWS');

  const fetchTeamData = async () => {
    setLoading(true);
    try {
      const resolutionPrompt = `
      Identify the sports team "${teamName}".
      Return a JSON response with:
      - leaguePath: The ESPN API path for the league (e.g. 'basketball/nba', 'football/nfl', 'baseball/mlb', 'hockey/nhl', 'racing/f1', 'racing/nascar').
      - teamId: The ESPN numerical ID or string ID used in their API for this team.
      - league: The common abbreviation for the league (e.g. 'NBA', 'NFL', 'F1').
      - facts: an array of interesting facts about the team (strings).
      - history: a short paragraph about the team's history.
      - owners: string of the team owners.
      - valuation: string of estimated valuation.
      - highlights: array of {id, title, thumbnailUrl, videoUrl} for recent team highlights.
      - news: array of {id, title, content, source, url, timestamp} for recent team news.
      `;
      
      const responseText = await callGemini(resolutionPrompt, { responseMimeType: 'application/json', tools: [{ googleSearch: {} }] }, "gemini-3-flash-preview");
      const info = JSON.parse(responseText || '{}');
      
      let teamInfo: any = {};
      let rosterData: any = { athletes: [] };

      if (info.leaguePath && info.teamId) {
          try {
              const [teamRes, rosterRes] = await Promise.all([
                  fetch(`https://site.api.espn.com/apis/site/v2/sports/${info.leaguePath}/teams/${info.teamId}`),
                  fetch(`https://site.api.espn.com/apis/site/v2/sports/${info.leaguePath}/teams/${info.teamId}/roster`).catch(() => ({ json: () => ({ athletes: [] }) }))
              ]);
              if (teamRes.ok) {
                 const tData = await teamRes.json();
                 teamInfo = tData.team || {};
              }
              if ('json' in rosterRes) {
                 rosterData = await rosterRes.json();
              }
          } catch(e) {
              console.log("ESPN API fetch failed for team", e);
          }
      }

      const mappedTeam: Team = {
        id: teamInfo.id || info.teamId || teamName,
        name: teamInfo.displayName || teamName,
        location: teamInfo.location || '',
        abbreviation: teamInfo.abbreviation || '',
        logo: teamInfo.logos?.[0]?.href || `https://picsum.photos/seed/${teamName}/200/200`,
        league: info.league || 'Sports',
        color: teamInfo.color || 'FF8C00',
        roster: (rosterData.athletes || []).flatMap((group: any) => 
          (group.items || []).map((a: any) => ({
            id: a.id,
            name: a.displayName,
            position: a.position?.abbreviation,
            number: a.jersey,
            photoUrl: a.headshot?.href || 'https://a.espncdn.com/combiner/i?img=/i/headshots/nophoto.png',
            stats: {}
          }))
        ),
        recentResults: teamInfo.nextEvent ? [teamInfo.nextEvent] : [],
        highlights: info.highlights || [],
      };

      (mappedTeam as any).news = info.news || [];
      (mappedTeam as any).facts = info.facts || [];
      (mappedTeam as any).history = info.history || '';
      (mappedTeam as any).owners = info.owners || 'Unknown';
      (mappedTeam as any).valuation = info.valuation || 'Unknown';

      setTeam(mappedTeam);
    } catch (e) {
      console.error("Failed to fetch team data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, [teamName]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-white">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs font-black uppercase tracking-widest opacity-40">Synchronizing Team Data...</p>
      </div>
    );
  }

  if (!team) return <div className="p-8 text-white">Team not found.</div>;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black text-white">
      {/* Header */}
      <header 
        className="relative p-8 lg:p-16 border-b border-white/10"
        style={{ background: `linear-gradient(to bottom, #${team.color}44, transparent)` }}
      >
        <button 
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-all"
        >
          <ChevronLeft size={16} /> Back to Newsstand
        </button>

        <div className="flex flex-col md:flex-row items-center md:items-end gap-8">
          <div className="w-32 h-32 md:w-48 md:h-48 group">
            <img src={team.logo || undefined} className="w-full h-full object-contain filter drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]" />
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-4 mb-2">
              <span className="px-3 py-1 bg-white/10 border border-white/10 rounded text-[10px] font-black uppercase tracking-widest">{team.league}</span>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40">{team.location}</span>
            </div>
            <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
              {team.name}
            </h1>
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-6">
               <div className="flex items-center gap-2 opacity-60">
                 <Users size={16} className="text-primary" />
                 <span className="text-xs font-black uppercase tracking-widest">{team.roster.length} Players</span>
               </div>
               <div className="flex items-center gap-2 opacity-60">
                 <Trophy size={16} className="text-primary" />
                 <span className="text-xs font-black uppercase tracking-widest">{team.abbreviation} Franchise</span>
               </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex items-center gap-8 px-8 lg:px-16 py-6 border-b border-white/5 overflow-x-auto no-scrollbar">
        {(['NEWS', 'ROSTER', 'RESULTS', 'HIGHLIGHTS', 'HISTORY', 'FACTS', 'STATS'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`text-xs font-black uppercase tracking-[0.3em] pb-2 border-b-2 transition-all whitespace-nowrap ${activeSubTab === tab ? 'text-primary border-primary' : 'opacity-20 border-transparent hover:opacity-40'}`}
          >
            {tab}
           </button>
        ))}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8 lg:p-16 no-scrollbar pb-32">
        <div className="max-w-7xl mx-auto">
          {activeSubTab === 'ROSTER' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
              {team.roster.map(player => (
                <motion.div
                  key={player.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => onSelectPlayer(player)}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-[3/4] rounded-3xl overflow-hidden bg-white/5 border border-white/10 mb-4">
                    <img src={player.photoUrl || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60" />
                    <div className="absolute bottom-4 left-4">
                      <span className="text-4xl font-black italic opacity-20 group-hover:opacity-100 transition-opacity">#{player.number}</span>
                    </div>
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight group-hover:text-primary transition-colors">{player.name}</h3>
                  <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{player.position}</p>
                </motion.div>
              ))}
            </div>
          )}

          {activeSubTab === 'RESULTS' && (
            <div className="space-y-6">
              {team.recentResults.length > 0 ? (
                team.recentResults.map((event: any, idx) => (
                  <div key={idx} className="p-8 bg-white/5 border border-white/10 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-8 order-2 md:order-1">
                       <span className="text-sm font-black italic uppercase opacity-20">{event.status?.type?.detail || 'Upcoming'}</span>
                    </div>
                    <div className="flex items-center gap-12 order-1 md:order-2">
                       <div className="text-center">
                          <img src={event.competitions?.[0]?.competitors?.[0]?.team?.logo || undefined} className="w-16 h-16 mx-auto mb-2" />
                          <p className="text-xs font-black uppercase tracking-widest">{event.competitions?.[0]?.competitors?.[0]?.team?.displayName}</p>
                       </div>
                       <div className="text-4xl font-black italic text-primary">VS</div>
                       <div className="text-center">
                          <img src={event.competitions?.[0]?.competitors?.[1]?.team?.logo || undefined} className="w-16 h-16 mx-auto mb-2" />
                          <p className="text-xs font-black uppercase tracking-widest">{event.competitions?.[0]?.competitors?.[1]?.team?.displayName}</p>
                       </div>
                    </div>
                    <button className="px-6 py-3 bg-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all flex items-center gap-2 order-3">
                      View Stats <ChevronLeft size={14} className="rotate-180" />
                    </button>
                  </div>
                ))
              ) : (
                <div className="py-20 text-center opacity-20">
                   <Calendar size={48} className="mx-auto mb-4" />
                   <p className="text-sm font-black uppercase tracking-widest">No recent games found</p>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'HIGHLIGHTS' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {team.highlights.map((h, i) => (
                <div key={i} className="group cursor-pointer">
                  <div className="relative aspect-video rounded-3xl overflow-hidden border border-white/10 mb-4">
                    <img src={h.thumbnailUrl || undefined} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center scale-0 group-hover:scale-100 transition-transform">
                        <Play size={20} fill="white" />
                      </div>
                    </div>
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-tight group-hover:text-primary transition-colors leading-tight">{h.title}</h3>
                </div>
              ))}
              {team.highlights.length === 0 && (
                <div className="col-span-full py-20 text-center opacity-20">
                   <Zap size={48} className="mx-auto mb-4" />
                   <p className="text-sm font-black uppercase tracking-widest">Scanning broadcast archives for highlights...</p>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'NEWS' && (
            <div className="space-y-12">
              {(team as any).news?.map((n: any, i: number) => (
                <div key={i} className="group cursor-pointer border-l-2 border-white/5 pl-8 hover:border-primary transition-colors">
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary">{n.source || 'News'}</span>
                    <span className="text-[10px] font-bold opacity-20">•</span>
                    <span className="text-[10px] font-bold opacity-20 uppercase tracking-widest">{new Date(n.timestamp || Date.now()).toLocaleDateString()}</span>
                  </div>
                  <h3 className="text-2xl md:text-4xl font-black uppercase tracking-tighter italic leading-none mb-4 group-hover:text-primary transition-colors">
                    {n.title}
                  </h3>
                  <p className="text-sm opacity-40 leading-relaxed font-medium line-clamp-2 max-w-3xl">
                    {n.content}
                  </p>
                  <button className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-all">
                    Full Coverage <ExternalLink size={12} />
                  </button>
                </div>
              ))}
              {!(team as any).news?.length && (
                <div className="py-20 text-center opacity-20">
                   <Newspaper size={48} className="mx-auto mb-4" />
                   <p className="text-sm font-black uppercase tracking-widest">No recent headlines found</p>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'HISTORY' && (
             <div className="max-w-4xl p-8 bg-white/5 border border-white/10 rounded-3xl">
                <h2 className="text-2xl font-black uppercase tracking-widest mb-6 text-primary flex items-center gap-3">
                   <Calendar size={24} /> Franchise History
                </h2>
                <p className="text-lg opacity-80 leading-relaxed font-medium">
                   {(team as any).history || 'History details are currently unavailable.'}
                </p>

                <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div className="bg-black/50 p-6 rounded-2xl border border-white/5">
                      <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Team Owners</h3>
                      <p className="text-lg font-bold">{(team as any).owners}</p>
                   </div>
                   <div className="bg-black/50 p-6 rounded-2xl border border-white/5">
                      <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">Team Valuation</h3>
                      <p className="text-lg font-bold">{(team as any).valuation}</p>
                   </div>
                </div>
             </div>
          )}

          {activeSubTab === 'FACTS' && (
             <div className="max-w-4xl">
                <h2 className="text-2xl font-black uppercase tracking-widest mb-8 text-primary flex items-center gap-3">
                   <Zap size={24} /> Fast Facts
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {(team as any).facts?.map((fact: string, idx: number) => (
                      <div key={idx} className="bg-white/5 p-6 rounded-2xl border border-white/5 flex items-start gap-4 hover:border-primary/50 transition-colors">
                         <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-black shrink-0">
                            {idx + 1}
                         </div>
                         <p className="text-sm opacity-80 font-medium leading-relaxed">{fact}</p>
                      </div>
                   ))}
                   {!(team as any).facts?.length && (
                       <p className="opacity-40">No facts available at this time.</p>
                   )}
                </div>
             </div>
          )}

          {activeSubTab === 'STATS' && (
             <div className="py-20 text-center opacity-20">
                <TrendingUp size={48} className="mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest">Season Statistics & Analytics incoming</p>
             </div>
          )}
        </div>
      </main>
    </div>
  );
};
