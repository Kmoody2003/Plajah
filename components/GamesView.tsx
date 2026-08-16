import React, { useState, useEffect } from 'react';
import { Gamepad2, Play, Users, Trophy, TrendingUp, ChevronLeft, Search, Globe, Library, ExternalLink } from 'lucide-react';
import PageHeader from './PageHeader';
import { motion, AnimatePresence } from 'motion/react';
import { Game, UserProfile } from '../types';
import { fetchGames, updateGamePlayCount, fetchUserProfile, auth } from '../services/backendService';
import ChipRail from './ui/ChipRail';

interface FreeToGame {
  id: number;
  title: string;
  thumbnail: string;
  short_description: string;
  game_url: string;
  genre: string;
  platform: string;
  publisher: string;
  developer: string;
  release_date: string;
  freetogame_profile_url: string;
}

interface GamesViewProps {
  onBack?: () => void;
  onSelectGame: (game: Game) => void;
}

const GamesView: React.FC<GamesViewProps> = ({ onBack, onSelectGame }) => {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameOwners, setGameOwners] = useState<Record<string, UserProfile>>({});
  
  const [activeTab, setActiveTab] = useState<'HOME_BASE' | 'GLOBAL'>('HOME_BASE');
  const [globalGames, setGlobalGames] = useState<FreeToGame[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  // Admin-only visibility for the in-development first-party prototype (Pew Pew).
  // Hidden from the public until the status ladder advances it; see
  // packages/first-party-games/games/live-action/docs/platform-integration.md
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    if (u.email === 'kmoody2003@gmail.com') { setIsAdmin(true); return; }
    fetchUserProfile(u.uid)
      .then(p => { if (p && (p.role === 'admin' || p.role === 'staff')) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const loadGames = async () => {
      const allGames = await fetchGames();
      setGames(allGames);
      setLoading(false);

      // Fetch owners
      const owners: Record<string, UserProfile> = {};
      for (const game of allGames) {
        const profile = await fetchUserProfile(game.ownerId);
        if (profile) owners[game.ownerId] = profile;
      }
      setGameOwners(owners);
    };
    loadGames();
  }, []);

  useEffect(() => {
    if (activeTab === 'GLOBAL' && globalGames.length === 0) {
      const loadGlobal = async () => {
        setLoadingGlobal(true);
        try {
          // Attempting to fetch from FreeToGame API via generic proxies to avoid CORS
          let data;
          try {
            const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.freetogame.com/api/games?platform=browser')}`);
            if (!res.ok) throw new Error('allorigins failed');
            data = await res.json();
          } catch (e) {
            try {
              // Fallback proxy 1
              const res2 = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent('https://www.freetogame.com/api/games?platform=browser')}`);
              if (!res2.ok) throw new Error('codetabs failed');
              data = await res2.json();
            } catch (e2) {
              // Fallback proxy 2
              const res3 = await fetch(`https://corsproxy.io/?url=${encodeURIComponent('https://www.freetogame.com/api/games?platform=browser')}`);
              if (!res3.ok) throw new Error('corsproxy failed');
              data = await res3.json();
            }
          }

          if (Array.isArray(data)) {
            setGlobalGames(data);
          }
        } catch (e) {
          console.error("Failed to load global games", e);
        } finally {
          setLoadingGlobal(false);
        }
      };
      loadGlobal();
    }
  }, [activeTab]);

  const handleLaunchGame = async (game: Game) => {
    onSelectGame(game);
  };

  const genres = ['All', ...Array.from(new Set(globalGames.map(g => g.genre)))].sort();
  
  const filteredGlobalGames = globalGames.filter(g => 
    (selectedGenre === 'All' || g.genre === selectedGenre) &&
    (g.title.toLowerCase().includes(searchQuery.toLowerCase()) || g.short_description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="h-full bg-transparent text-white overflow-hidden flex flex-col">
      {/* Games Header */}
      <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {onBack && (
              <button onClick={onBack} className="lg:hidden p-3 bg-white/5 rounded-2xl">
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="p-3 bg-small-orange/20 rounded-2xl w-fit">
              <Gamepad2 className="text-small-orange" size={24} />
            </div>
          </div>
          <div>
            <PageHeader>Plajah Arcade</PageHeader>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-4">Web-Based Games Hosted by Artists</p>
          </div>
        </div>
      </div>

      {/* Platform Chip Rail treatment (components/ui/ChipRail) */}
      <div className="px-8 pt-6 pb-4 border-b border-white/5">
        <ChipRail
          items={[
            { id: 'HOME_BASE', label: 'Home Base', icon: <Library size={13} /> },
            { id: 'GLOBAL', label: 'Global Games Community', icon: <Globe size={13} /> },
          ]}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as any)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative">
        {activeTab === 'HOME_BASE' ? (
           loading ? (
             <div className="flex flex-col items-center justify-center p-20">
               <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin mb-4" />
               <p className="text-xs font-black uppercase tracking-widest opacity-40">Loading Game Library...</p>
             </div>
           ) : (
             <div className="max-w-7xl mx-auto space-y-12">
               {/* Plajah Originals — admin-only first-party prototype (Pew Pew) */}
               {isAdmin && (
               <div>
                 <div className="flex items-center gap-3 mb-8">
                   <Gamepad2 size={20} className="text-small-orange" />
                   <h3 className="text-xl font-black uppercase tracking-tightest">Plajah Originals</h3>
                   <span className="px-2.5 py-1 rounded-md bg-white/10 border border-white/15 text-[8px] font-black uppercase tracking-widest text-white/70">Prototype · Admin</span>
                 </div>
                 <div
                   className="relative rounded-[3rem] overflow-hidden border border-white/10 p-8 md:p-10"
                   style={{ background: 'radial-gradient(60rem 30rem at 80% -20%, rgba(255,140,0,0.18), transparent 60%), linear-gradient(135deg, rgba(107,0,153,0.35), rgba(212,0,85,0.25) 55%, rgba(255,140,0,0.15))' }}
                 >
                   <div className="flex flex-col md:flex-row md:items-center gap-8">
                     <div className="flex-1">
                       <h4 className="font-black tracking-tightest text-4xl md:text-5xl" style={{ background: 'linear-gradient(135deg,#FF8C00,#D40055)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>PEW PEW</h4>
                       <p className="text-white/70 text-sm mt-3 max-w-md leading-relaxed">The live-action shooter — early feel test. Point your phone (or headset) at targets, hold to lock, release to fire. Needs camera + motion, so open it on a phone.</p>
                     </div>
                     <div className="flex flex-col gap-3 w-full md:w-auto">
                       <a href="/pewpew/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-white text-black text-[11px] font-black uppercase tracking-widest hover:scale-105 transition-all">
                         <Play size={16} fill="currentColor" /> Play on Phone
                       </a>
                       <a href="/pewpew/xr.html" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-white/10 border border-white/15 text-white text-[11px] font-black uppercase tracking-widest hover:bg-white/20 transition-all">
                         <ExternalLink size={16} /> Headset (Quest)
                       </a>
                     </div>
                   </div>
                 </div>
               </div>
               )}

               {/* Trending Section */}
               {games.length > 0 && (
               <div>
                 <div className="flex items-center gap-3 mb-8">
                   <TrendingUp size={20} className="text-small-orange" />
                   <h3 className="text-xl font-black uppercase tracking-tightest">Most Popular</h3>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                   {games.slice(0, 3).map((game) => (
                     <motion.button 
                       key={game.id}
                       whileHover={{ scale: 1.02 }}
                       whileTap={{ scale: 0.98 }}
                       onClick={() => handleLaunchGame(game)}
                       className="group relative h-80 rounded-[3rem] overflow-hidden border border-white/10 bg-white/[0.02] transition-all media-lift"
                     >
                       <img 
                         src={game.thumbnailUrl || 'https://picsum.photos/seed/game/800/800'} 
                         className="w-full h-full object-cover opacity-60 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700" 
                         alt={game.title}
                       />
                       <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent p-8 flex flex-col justify-end text-left">
                         <h4 className="text-2xl font-black uppercase tracking-tightest mb-2">{game.title}</h4>
                         <p className="text-[10px] font-bold text-small-orange uppercase tracking-widest mb-4">
                           By {gameOwners[game.ownerId]?.displayName || 'Artist'}
                         </p>
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full">
                             <Users size={12} className="text-white/40" />
                             <span className="text-[9px] font-bold">{game.playCount || 0} Plays</span>
                           </div>
                           <div className="w-12 h-12 bg-white text-black rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-xl">
                             <Play size={20} fill="currentColor" className="ml-1" />
                           </div>
                         </div>
                       </div>
                     </motion.button>
                   ))}
                 </div>
               </div>
               )}

               {/* All Games Section */}
               {games.length > 0 && (
               <div>
                 <div className="flex items-center gap-3 mb-8">
                   <Gamepad2 size={20} className="text-small-orange" />
                   <h3 className="text-xl font-black uppercase tracking-tightest">All Platform Games</h3>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                   {games.map((game) => (
                     <motion.button 
                       key={game.id}
                       whileHover={{ scale: 1.05 }}
                       whileTap={{ scale: 0.95 }}
                       onClick={() => handleLaunchGame(game)}
                       className="group flex flex-col text-left"
                     >
                       <div className="aspect-square rounded-[2rem] overflow-hidden border border-white/10 bg-white/[0.02] mb-4 relative media-lift">
                         <img 
                           src={game.thumbnailUrl || 'https://picsum.photos/seed/game/400/400'} 
                           className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all" 
                           alt={game.title}
                         />
                         <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                           <Play size={24} fill="currentColor" />
                         </div>
                       </div>
                       <h5 className="text-xs font-black uppercase tracking-widest text-white mb-1 truncate">{game.title}</h5>
                       <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate">
                         {gameOwners[game.ownerId]?.displayName || 'Artist'}
                       </p>
                     </motion.button>
                   ))}
                 </div>
               </div>
               )}
               {games.length === 0 && (
                 <div className="p-12 bg-white/5 border border-white/10 rounded-[3rem] text-center max-w-2xl mx-auto">
                    <Gamepad2 size={48} className="text-white/20 mx-auto mb-6" />
                    <h3 className="text-2xl font-black uppercase tracking-widest mb-4">No Platform Games Yet</h3>
                    <p className="text-white/60 text-sm">Artists haven't uploaded any games to their Home Base. Switch to the Global Games Community tab to discover free community games.</p>
                 </div>
               )}
             </div>
           )
        ) : (
           <div className="max-w-7xl mx-auto flex flex-col h-full">
              <div className="flex flex-col md:flex-row gap-6 mb-8 items-center justify-between">
                 <div className="flex items-center gap-4 flex-1 w-full relative">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={20} />
                   <input
                     type="text"
                     placeholder="Search Global Database..."
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full bg-white/5 border border-white/10 rounded-full py-4 pl-12 pr-6 text-sm font-bold focus:outline-none focus:border-small-orange/50 transition-colors"
                   />
                 </div>
                 <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 custom-scrollbar">
                    {genres.map(g => (
                      <button
                        key={g}
                        onClick={() => setSelectedGenre(g)}
                        className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${selectedGenre === g ? 'bg-white text-black shadow-xl' : 'bg-white/5 hover:bg-white/10 text-white/60'}`}
                      >
                        {g}
                      </button>
                    ))}
                 </div>
              </div>

              {loadingGlobal ? (
                <div className="flex flex-col items-center justify-center p-20 flex-1">
                  <div className="w-16 h-16 border-4 border-[#00DAF3] border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest opacity-40">Connecting to FreeToGame & OSGL...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 pb-20">
                  {filteredGlobalGames.map((game) => (
                    <div key={game.id} className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col group hover:border-[#00DAF3]/30 transition-all media-lift">
                      <div className="h-48 relative overflow-hidden">
                        <img src={game.thumbnail} alt={game.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-duration-700" />
                        <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-widest">
                          {game.genre}
                        </div>
                      </div>
                      <div className="p-6 flex flex-col flex-1">
                        <h4 className="text-xl font-black uppercase tracking-tightest mb-2 line-clamp-1">{game.title}</h4>
                        <p className="text-xs text-white/60 mb-4 line-clamp-2 leading-relaxed">{game.short_description}</p>
                        
                        <div className="mt-auto pt-4 border-t border-white/5">
                           <div className="flex flex-col gap-2 mb-4">
                             <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
                               <span>Developer:</span>
                               <span className="text-white/80 line-clamp-1 text-right ml-2">{game.developer}</span>
                             </div>
                             <div className="flex justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest">
                               <span>Platform:</span>
                               <span className="text-[#00DAF3]">{game.platform}</span>
                             </div>
                           </div>
                           
                           <div className="flex gap-4">
                             <button 
                               onClick={() => onSelectGame({
                                 id: `global-${game.id}`,
                                 ownerId: 'global-freetogame',
                                 title: game.title,
                                 description: game.short_description,
                                 url: game.freetogame_profile_url || game.game_url,
                                 thumbnailUrl: game.thumbnail,
                                 playCount: 0,
                                 timestamp: Date.now(),
                                 tags: [game.genre, game.platform]
                               })}
                               className="flex-[2] flex items-center justify-center gap-2 py-3 bg-[#00DAF3] text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(0,218,243,0.3)]"
                             >
                               Play in App <Play size={14} fill="currentColor" />
                             </button>
                             <a 
                               href={game.game_url} 
                               target="_blank" 
                               rel="noopener noreferrer"
                               className="flex-[1] flex items-center justify-center gap-2 py-3 bg-[#00DAF3]/10 text-[#00DAF3] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#00DAF3]/20 transition-colors"
                               title="Open Developer Site Externally"
                             >
                               <ExternalLink size={14} />
                             </a>
                           </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {filteredGlobalGames.length === 0 && (
                    <div className="col-span-full py-20 text-center">
                      <Globe size={48} className="text-white/20 mx-auto mb-6" />
                      <h3 className="text-xl font-black uppercase tracking-widest text-white/60">No games found for this query.</h3>
                    </div>
                  )}
                </div>
              )}
              
              {!loadingGlobal && (
                 <div className="text-center py-8 opacity-40 hover:opacity-100 transition-opacity">
                   <p className="text-[10px] font-bold uppercase tracking-widest">Data provided by FreeToGame API & OSGL Project</p>
                   <p className="text-[9px] mt-1">100% Free for Personal & Commercial Use</p>
                 </div>
              )}
           </div>
        )}
      </div>
    </div>
  );
};

export default GamesView;
