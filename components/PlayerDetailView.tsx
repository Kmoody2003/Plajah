import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeft,
  TrendingUp,
  BarChart2,
  Newspaper,
  ExternalLink,
  MessageSquare,
  Share2,
  History,
  Users
} from 'lucide-react';
import { PlayerStats } from '../types';
import { callGemini } from '../services/geminiService';
import { fetchPlayerProfile, fetchPlayerCareer, type PlayerCareer } from '../services/sportsService';

interface PlayerDetailViewProps {
  player: PlayerStats;
  league: string;
  teamName: string;
  onBack: () => void;
}

// Normalize whatever league label we were handed into a LeagueTab the sports
// services understand ('nba', 'basketball/nba', 'NBA Basketball' → 'NBA').
const LEAGUE_TABS = ['NBA', 'NFL', 'NHL', 'MLB', 'NCAA', 'WNBA', 'FIFA', 'MLS'];
function normalizeLeague(league: string): string {
  const up = (league || '').toUpperCase();
  return LEAGUE_TABS.find(tab => up.includes(tab)) ?? 'NBA';
}

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player, league, teamName, onBack }) => {
  const [news, setNews] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [career, setCareer] = useState<PlayerCareer | null>(null);

  const tab = normalizeLeague(league);

  useEffect(() => {
    let cancelled = false;
    setProfile(null);
    setCareer(null);

    fetchPlayerProfile(tab, player.id)
      .then(p => { if (!cancelled) setProfile(p); })
      .catch(() => {});
    fetchPlayerCareer(tab, player.id)
      .then(c => { if (!cancelled) setCareer(c); })
      .catch(() => {});

    setLoadingNews(true);
    callGemini(
      `Search for recent news about ${player.name} of ${teamName} (${league}).
      Return a JSON object: { news: array of {id, title, content, source, url, timestamp} } with up to 6 items.`,
      { tools: [{ googleSearch: {} }], responseMimeType: 'application/json' },
      'gemini-3-flash-preview'
    )
      .then(text => { if (!cancelled) setNews(JSON.parse(text || '{"news":[]}').news || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingNews(false); });

    return () => { cancelled = true; };
  }, [player.id]);

  // Headline stats for the top bar: first category of the player's current
  // (or most recent) season statistics.
  const headlineStats: { label: string; value: string }[] =
    (profile?.statistics?.splits?.categories ?? [])
      .flatMap((cat: any) => cat.stats ?? [])
      .slice(0, 10)
      .map((s: any) => ({
        label: s.shortDisplayName || s.abbreviation || s.displayName || s.name,
        value: s.displayValue ?? String(s.value ?? ''),
      }));

  const primaryCareer = career?.categories?.[0] ?? null;
  const careerSeasons = primaryCareer ? [...primaryCareer.seasons].reverse() : [];
  const careerLabels = primaryCareer?.labels?.slice(0, 9) ?? [];

  const bioRows: { label: string; value: string }[] = [
    { label: 'Height', value: profile?.displayHeight },
    { label: 'Weight', value: profile?.displayWeight },
    { label: 'Age', value: profile?.age ? String(profile.age) : '' },
    { label: 'Born', value: profile?.birthPlace ? [profile.birthPlace.city, profile.birthPlace.state, profile.birthPlace.country].filter(Boolean).join(', ') : '' },
    { label: 'College', value: profile?.college?.name },
    { label: 'Debut', value: profile?.debutYear ? String(profile.debutYear) : '' },
    { label: 'Experience', value: profile?.experience?.years ? `${profile.experience.years} seasons` : '' },
    { label: 'Status', value: profile?.status?.name },
  ].filter(r => r.value);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black text-white">
      {/* Header */}
      <header className="relative h-[60vh] shrink-0 border-b border-white/10 overflow-hidden">
        <img src={profile?.headshot?.href || player.photoUrl || undefined} className="absolute inset-0 w-full h-full object-cover object-top opacity-40 scale-105 blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-between p-8 lg:p-16">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-all z-10"
          >
            <ChevronLeft size={16} /> Back to Team
          </button>

          <div className="flex flex-col md:flex-row items-end justify-between gap-8 z-10">
            <div className="flex items-end gap-8">
              {(profile?.headshot?.href || player.photoUrl) && (
                <div className="hidden md:block w-44 h-44 rounded-[2rem] overflow-hidden bg-white/10 border border-white/10 shrink-0">
                  <img src={profile?.headshot?.href || player.photoUrl} alt={player.name} className="w-full h-full object-cover object-top" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  {(profile?.jersey || player.number) && (
                    <span className="px-3 py-1 bg-primary text-black text-[10px] font-black uppercase tracking-widest rounded">#{profile?.jersey || player.number}</span>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{profile?.position?.displayName || player.position}</span>
                  <span className="text-[10px] font-bold opacity-20">•</span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{profile?.team?.displayName || teamName}</span>
                </div>
                <h1 className="text-6xl md:text-[9rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
                  {profile?.displayName || player.name}
                </h1>
              </div>
            </div>

            <div className="flex gap-4">
               <button className="p-4 bg-white/10 border border-white/10 rounded-full hover:bg-white/20 transition-all">
                 <Share2 size={20} />
               </button>
               <button className="p-4 bg-white/10 border border-white/10 rounded-full hover:bg-white/20 transition-all">
                 <MessageSquare size={20} />
               </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar — current/most recent season */}
      <div className="p-8 lg:px-16 border-b border-white/5 bg-white/5 backdrop-blur-3xl overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto flex items-center gap-12">
           {headlineStats.length > 0 && headlineStats.map(s => (
             <div key={s.label} className="shrink-0">
               <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">{s.label}</p>
               <p className="text-xl font-black italic">{s.value}</p>
             </div>
           ))}
           {headlineStats.length === 0 && (
             <div className="flex items-center gap-2 opacity-20">
               <TrendingUp size={16} />
               <span className="text-[10px] font-black uppercase tracking-widest">Loading Season Performance...</span>
             </div>
           )}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="max-w-7xl mx-auto p-8 lg:p-16 space-y-16">

          {/* Career history table */}
          {careerSeasons.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <History size={20} className="text-primary" />
                <h2 className="text-2xl font-black uppercase tracking-tight italic">Career — Season by Season</h2>
              </div>

              {/* Roster history chips */}
              {career && career.teamHistory.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {career.teamHistory.map(t => (
                    <span key={t.teamId}
                      className="px-3 py-1.5 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest"
                      style={{ backgroundColor: `${t.color}33` }}>
                      {t.teamAbbr || t.teamName} <span className="opacity-50">· {t.seasons.length} season{t.seasons.length > 1 ? 's' : ''}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="overflow-x-auto no-scrollbar rounded-2xl border border-white/8">
                <table className="w-full text-left min-w-[640px]">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-40">Season</th>
                      <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-40">Team</th>
                      {careerLabels.map(l => (
                        <th key={l} className="px-4 py-3 text-[8px] font-black uppercase tracking-widest opacity-40 text-right">{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {careerSeasons.map((row, i) => (
                      <tr key={`${row.year}-${row.teamId}`} className={`border-t border-white/5 ${i % 2 ? 'bg-white/[0.02]' : ''}`}>
                        <td className="px-4 py-2.5 text-xs font-black">{row.seasonDisplay}</td>
                        <td className="px-4 py-2.5 text-xs font-bold opacity-60">{row.teamAbbr || row.teamName}</td>
                        {careerLabels.map((_, ci) => (
                          <td key={ci} className="px-4 py-2.5 text-xs font-bold tabular-nums text-right opacity-80">{row.stats[ci] ?? '—'}</td>
                        ))}
                      </tr>
                    ))}
                    {primaryCareer?.careerTotals && (
                      <tr className="border-t-2 border-primary/30 bg-primary/5">
                        <td className="px-4 py-2.5 text-xs font-black text-primary uppercase">Career</td>
                        <td className="px-4 py-2.5" />
                        {careerLabels.map((_, ci) => (
                          <td key={ci} className="px-4 py-2.5 text-xs font-black tabular-nums text-right text-primary">{primaryCareer.careerTotals![ci] ?? ''}</td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-16">
            {/* News Feed */}
            <div className="lg:col-span-2 space-y-12">
              <div className="flex items-center gap-3 mb-4">
                <Newspaper size={20} className="text-primary" />
                <h2 className="text-2xl font-black uppercase tracking-tight italic">Player Frequency Feed</h2>
              </div>

              {loadingNews ? (
                <div className="space-y-8">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse space-y-4">
                      <div className="h-4 w-32 bg-white/5 rounded" />
                      <div className="h-10 w-full bg-white/5 rounded" />
                      <div className="h-4 w-2/3 bg-white/5 rounded" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-16">
                   {news.map((item, i) => (
                     <motion.div
                       key={i}
                       initial={{ opacity: 0, x: -20 }}
                       animate={{ opacity: 1, x: 0 }}
                       className="group border-l-2 border-white/5 pl-8 hover:border-primary transition-colors"
                     >
                       <div className="flex items-center gap-3 mb-3">
                         <span className="text-[9px] font-black uppercase tracking-widest text-primary">{item.source}</span>
                         <span className="text-[9px] font-bold opacity-20 uppercase tracking-widest">{new Date(item.timestamp).toLocaleDateString()}</span>
                       </div>
                       <h3
                         onClick={() => item.url && window.open(item.url, '_blank')}
                         className="text-2xl md:text-3xl font-black uppercase tracking-tighter italic leading-none mb-4 group-hover:text-primary cursor-pointer transition-colors"
                       >
                         {item.title}
                       </h3>
                       <p className="text-sm opacity-40 leading-relaxed font-medium line-clamp-3">
                         {item.content}
                       </p>
                       <button className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 group-hover:opacity-100 transition-all">
                         Expand Coverage <ExternalLink size={12} />
                       </button>
                     </motion.div>
                   ))}
                   {news.length === 0 && (
                     <div className="py-20 text-center opacity-20">
                        <p className="text-sm font-black uppercase tracking-widest">No recent player-specific news found</p>
                     </div>
                   )}
                </div>
              )}
            </div>

            {/* Sidebar: real bio facts */}
            <div className="space-y-12">
              <section className="p-8 bg-white/5 border border-white/10 rounded-3xl">
                <div className="flex items-center gap-3 mb-6">
                  <BarChart2 size={16} className="text-primary" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest">Player Profile</h3>
                </div>
                <div className="space-y-4">
                  {bioRows.map(row => (
                    <div key={row.label} className="flex justify-between items-center py-2 border-b border-white/5">
                      <span className="text-[9px] font-black uppercase tracking-widest opacity-40">{row.label}</span>
                      <span className="text-xs font-black text-right">{row.value}</span>
                    </div>
                  ))}
                  {bioRows.length === 0 && (
                    <p className="text-[10px] uppercase tracking-widest opacity-25 font-black">Loading profile…</p>
                  )}
                </div>
              </section>

              {career && career.teamHistory.length > 0 && (
                <section className="p-8 bg-white/5 border border-white/10 rounded-3xl">
                  <div className="flex items-center gap-3 mb-6">
                    <Users size={16} className="text-primary" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest">Roster History</h3>
                  </div>
                  <div className="space-y-3">
                    {career.teamHistory.map(t => (
                      <div key={t.teamId} className="flex justify-between items-center py-2 border-b border-white/5">
                        <span className="text-xs font-black">{t.teamName || t.teamAbbr}</span>
                        <span className="text-[9px] font-bold opacity-40 text-right">
                          {t.seasons[0]}{t.seasons.length > 1 ? ` – ${t.seasons[t.seasons.length - 1]}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
