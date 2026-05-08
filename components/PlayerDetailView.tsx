import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  ChevronLeft, 
  TrendingUp, 
  BarChart2, 
  Newspaper, 
  ExternalLink,
  MessageSquare,
  Share2
} from 'lucide-react';
import { PlayerStats } from '../types';
import { callGemini } from '../services/geminiService';

interface PlayerDetailViewProps {
  player: PlayerStats;
  league: string;
  teamName: string;
  onBack: () => void;
}

export const PlayerDetailView: React.FC<PlayerDetailViewProps> = ({ player, league, teamName, onBack }) => {
  const [news, setNews] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [playerStats, setPlayerStats] = useState<any>(null);

  const fetchPlayerData = async () => {
    setLoadingNews(true);
    try {
      const responseText = await callGemini(
        `Search for detailed current season stats and recent news for the player ${player.name} of ${teamName} (${league}). 
        Return a JSON object with:
        careerStats: object with key-value pairs of stats,
        news: array of {id, title, content, source, url, timestamp}.`,
        {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        },
        "gemini-3-flash-preview"
      );

      const data = JSON.parse(responseText || '{"careerStats":{}, "news":[]}');
      setNews(data.news || []);
      setPlayerStats(data.careerStats || {});
    } catch (e) {
      console.error("Failed to fetch player news", e);
    } finally {
      setLoadingNews(false);
    }
  };

  useEffect(() => {
    fetchPlayerData();
  }, [player.id]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-black text-white">
      {/* Header */}
      <header className="relative h-[60vh] shrink-0 border-b border-white/10 overflow-hidden">
        <img src={player.photoUrl || null} className="absolute inset-0 w-full h-full object-cover object-top opacity-40 scale-105 blur-sm" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        
        <div className="absolute inset-0 flex flex-col justify-between p-8 lg:p-16">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest opacity-60 hover:opacity-100 transition-all z-10"
          >
            <ChevronLeft size={16} /> Back to Team
          </button>

          <div className="flex flex-col md:flex-row items-end justify-between gap-8 z-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-primary text-black text-[10px] font-black uppercase tracking-widest rounded">#{player.number}</span>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{player.position}</span>
                <span className="text-[10px] font-bold opacity-20">•</span>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{teamName}</span>
              </div>
              <h1 className="text-6xl md:text-[12rem] font-black uppercase tracking-tighter text-white leading-[0.8] italic select-none">
                {player.name}
              </h1>
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

      {/* Stats Bar */}
      <div className="p-8 lg:px-16 border-b border-white/5 bg-white/5 backdrop-blur-3xl overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto flex items-center gap-12">
           {playerStats && Object.entries(playerStats).map(([key, val]) => (
             <div key={key} className="shrink-0">
               <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">{key}</p>
               <p className="text-xl font-black italic">{val as any}</p>
             </div>
           ))}
           {!playerStats && (
             <div className="flex items-center gap-2 opacity-20">
               <TrendingUp size={16} />
               <span className="text-[10px] font-black uppercase tracking-widest">Loading Season Performance...</span>
             </div>
           )}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto no-scrollbar pb-32">
        <div className="max-w-7xl mx-auto p-8 lg:p-16">
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

            {/* Sidebar / Additional Info */}
            <div className="space-y-12">
              <section className="p-8 bg-white/5 border border-white/10 rounded-3xl">
                <div className="flex items-center gap-3 mb-6">
                  <BarChart2 size={16} className="text-primary" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest">Physical Profile</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Height</span>
                    <span className="text-xs font-black">6' 7"</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Weight</span>
                    <span className="text-xs font-black">230 lbs</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-white/5">
                    <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Draft Year</span>
                    <span className="text-xs font-black">2018</span>
                  </div>
                </div>
              </section>

              <section className="p-8 bg-primary/10 border border-primary/20 rounded-3xl">
                 <h3 className="text-lg font-black uppercase tracking-tight italic mb-2">Player Tip: "Stay Ready"</h3>
                 <p className="text-[10px] font-medium opacity-60 leading-relaxed uppercase tracking-widest">
                   Follow the flow. Don't fight the game. Let the score follow your rhythm.
                 </p>
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
