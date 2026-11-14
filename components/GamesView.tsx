import React, { useState, useEffect } from 'react';
import { Gamepad2, Play, Users, Trophy, TrendingUp, ChevronLeft, Search, Globe, Library, ExternalLink, Cpu, Smartphone, ShieldCheck, Tv, Sparkles, UserPlus, Radio } from 'lucide-react';
import PageHeader from './PageHeader';
import { motion, AnimatePresence } from 'motion/react';
import { Game, UserProfile } from '../types';
import { fetchGames, updateGamePlayCount, fetchUserProfile, auth } from '../services/backendService';
import ChipRail from './ui/ChipRail';
import { ERA_CLASH_GAME } from '../packages/first-party-games/games/era-clash/registry';
import { PLAJAH_GAMES_CATALOG, getPlajahGameById, type PlajahGameEntry } from '../data/plajahGamesCatalog';
import type { GameId as KithGameId } from './kithParty/catalog';
import { gamer, failed, isSignedIn, type GamerProfile } from '../services/gamerNet/client';
const KithParty = React.lazy(() => import('./kithParty/KithParty'));
const EraClashFrame = React.lazy(() => import('./games/EraClashFrame'));
const EraClash3DFrame = React.lazy(() => import('./games/EraClash3DFrame'));
const RavencrestGameFrame = React.lazy(() => import('./taleo/RavencrestGameFrame').then(m => ({ default: m.RavencrestGameFrame })));
const CyberTicTacToe = React.lazy(() => import('./games/CyberTicTacToe'));
const GamerHub = React.lazy(() => import('./games/GamerHub'));
const LiveGamesStudio = React.lazy(() => import('./liveGames/LiveGamesStudio'));
const LiveNowStrip = React.lazy(() => import('./liveGames/LiveNowStrip'));
const GameDetailPage = React.lazy(() => import('./games/GameDetailPage'));
const UniversalPassportShowcase = React.lazy(() => import('./UniversalPassportShowcase').then(m => ({ default: m.UniversalPassportShowcase })));
import GamesConcourse from './games/concourse/GamesConcourse';
import { useConcourseFont, logPlay } from './games/concourse/shared';

// Uploaded copies of tic tac toe open the first-party Cyber Tic Tac Toe (mobile, same-device + online play).
const isTicTacToe = (g: { title?: string }) => /tic[\s-]*tac[\s-]*toe/i.test(g.title || '');
// Uploaded copies of Era Clash (e.g. the Muse build) open the first-party copy at /games/era-clash.
const isEraClash = (g: { title?: string }) => /era[\s-]*clash/i.test(g.title || '');

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
  onLaunchFse?: () => void;
  /** Signed-in account: Kith Party's Voca Word Boost uses the reader's level, review words and child speech consent. */
  user?: { uid?: string | null } | null;
  profile?: any;
}

const GamesView: React.FC<GamesViewProps> = ({ onBack, onSelectGame, onLaunchFse, user, profile }) => {
  const [showKithParty, setShowKithParty] = useState(false);
  const [kithInitialGame, setKithInitialGame] = useState<KithGameId | undefined>(undefined);
  const [showEraClash, setShowEraClash] = useState(false);
  const [showEraClash3d, setShowEraClash3d] = useState(false);
  const [showRavencrest, setShowRavencrest] = useState(false);
  const [showTtt, setShowTtt] = useState(false);
  const [liveGameKind, setLiveGameKind] = useState<null | 'pick' | 'sketch' | 'trivia' | 'crowd' | 'impostor'>(null);
  const [selectedDetailGame, setSelectedDetailGame] = useState<PlajahGameEntry | null>(null);
  const [gamerProfile, setGamerProfile] = useState<GamerProfile | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameOwners, setGameOwners] = useState<Record<string, UserProfile>>({});
  
  const [activeTab, setActiveTab] = useState<'HOME_BASE' | 'LEADERBOARDS' | 'PASSPORT' | 'GLOBAL'>('HOME_BASE');
  const [globalGames, setGlobalGames] = useState<FreeToGame[]>([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');

  // Admin-only visibility for the in-development first-party prototype (Pew Pew).
  // Hidden from the public until the status ladder advances it; see
  // packages/first-party-games/games/live-action/docs/platform-integration.md
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
      setIsAdmin(true);
    }
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

  useEffect(() => {
    if (!isSignedIn()) return;
    let alive = true;
    void gamer.me().then(r => { if (alive && !failed(r)) setGamerProfile(r.profile); });
    return () => { alive = false; };
  }, [user?.uid]);

  useConcourseFont();

  // Invite links land here: /?view=games&game=<catalog id> opens that game's page.
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('game');
      const g = id ? getPlajahGameById(id) : undefined;
      if (g) { setActiveTab('HOME_BASE'); setSelectedDetailGame(g); }
    } catch { /* no URL access */ }
  }, []);

  const launchCatalogGame = (entry: PlajahGameEntry) => {
    logPlay(entry);
    switch (entry.launch.type) {
      case 'era-clash-2d': setShowEraClash(true); break;
      case 'era-clash-3d': setShowEraClash3d(true); break;
      case 'ravencrest': setShowRavencrest(true); break;
      case 'kith-party': setKithInitialGame(entry.launch.gameId); setShowKithParty(true); break;
      case 'cyber-ttt': setShowTtt(true); break;
      case 'live-game': setLiveGameKind(entry.launch.kind); break;
    }
  };

  const handleLaunchGame = async (game: Game) => {
    if (isTicTacToe(game)) { setShowTtt(true); return; }
    if (isEraClash(game)) { setShowEraClash(true); return; }
    onSelectGame(game);
  };

  const genres = ['All', ...Array.from(new Set(globalGames.map(g => g.genre)))].sort();
  
  const filteredGlobalGames = globalGames.filter(g => 
    (selectedGenre === 'All' || g.genre === selectedGenre) &&
    (g.title.toLowerCase().includes(searchQuery.toLowerCase()) || g.short_description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (showTtt) return (
    <React.Suspense fallback={<div className="p-8">Loading Cyber Tic Tac Toe…</div>}>
      <CyberTicTacToe onExit={() => setShowTtt(false)} onOpenLeaderboard={() => { setShowTtt(false); setActiveTab('LEADERBOARDS'); }} />
    </React.Suspense>
  );
  if (liveGameKind) return <React.Suspense fallback={<div className="p-8">Loading live games…</div>}><LiveGamesStudio initialKind={liveGameKind === 'pick' ? undefined : liveGameKind} onExit={() => setLiveGameKind(null)} /></React.Suspense>;
  if (showEraClash) return <React.Suspense fallback={<div className="p-8">Loading Era Clash…</div>}><EraClashFrame onExit={() => setShowEraClash(false)} /></React.Suspense>;
  if (showEraClash3d) return <React.Suspense fallback={<div className="p-8">Loading Era Clash 3D Campaign…</div>}><EraClash3DFrame onExit={() => setShowEraClash3d(false)} /></React.Suspense>;
  if (showRavencrest) return (
    <React.Suspense fallback={<div className="p-8">Loading Ravencrest…</div>}>
      <RavencrestGameFrame
        onBack={() => setShowRavencrest(false)}
        classic={
          <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-3xl font-black mb-2">Ravencrest</h2>
            <p className="text-white/65 max-w-md mb-6">WebGPU is not active in this browser. Open the current live build directly or switch to a WebGPU-capable browser.</p>
            <div className="flex gap-3">
              <a href="/games/ravencrest/play/index.html" target="_blank" rel="noopener noreferrer" className="px-6 py-3 rounded-xl bg-white text-black font-black text-xs uppercase tracking-widest">Open Direct Build</a>
              <button onClick={() => setShowRavencrest(false)} className="px-6 py-3 rounded-xl bg-white/10 text-white font-black text-xs uppercase tracking-widest">Back to Arcade</button>
            </div>
          </div>
        }
      />
    </React.Suspense>
  );
  if (showKithParty) return <React.Suspense fallback={<div className="p-8">Loading Kith Party…</div>}><KithParty initialGame={kithInitialGame} onBack={() => { setShowKithParty(false); setKithInitialGame(undefined); }} profile={profile} uid={user?.uid ?? null} /></React.Suspense>;

  return (
    <div className="gcx h-full overflow-y-auto overflow-x-hidden">
      <header className="gcx-bar">
        <div className="gcx-wrap">
          {onBack && <button type="button" className="gcx-back" onClick={onBack} aria-label="Back"><ChevronLeft size={18} /></button>}
          <button type="button" className="gcx-mark" onClick={() => { setSelectedDetailGame(null); setActiveTab('HOME_BASE'); }}><i />Plajah <b>Games</b></button>
          <nav className="gcx-tabs" aria-label="Games sections">
            {([['HOME_BASE', 'Home'], ['LEADERBOARDS', 'Leaderboards'], ['PASSPORT', 'Passport'], ['GLOBAL', 'Community']] as const).map(([id, label]) => (
              <button key={id} type="button" aria-current={activeTab === id && !(id === 'HOME_BASE' && selectedDetailGame) ? 'page' : undefined} onClick={() => { setSelectedDetailGame(null); setActiveTab(id); }}>{label}</button>
            ))}
          </nav>
          <div className="gcx-barr">
            {onLaunchFse && <button type="button" className="gcx-couch" onClick={onLaunchFse} title="10-foot couch view with controller">Couch mode</button>}
            <div className="gcx-chip" title="Your Plajah gamer score">
              <span className="gcx-av">{gamerProfile?.photo ? <img src={gamerProfile.photo} alt="" /> : (gamerProfile?.name || profile?.displayName || 'P').charAt(0).toUpperCase()}</span>
              <span><small>Gamer score</small><strong>{gamerProfile ? gamerProfile.score.toLocaleString('en-US') : 'Sign in'}</strong></span>
            </div>
          </div>
        </div>
      </header>

      <div className="gcx-wrap" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        {activeTab === 'LEADERBOARDS' ? (
          <div className="max-w-7xl mx-auto gcx-pad">
            <React.Suspense fallback={<div className="p-8 text-white/50 text-sm">Loading leaderboards…</div>}><GamerHub /></React.Suspense>
          </div>
        ) : activeTab === 'PASSPORT' ? (
          <div className="max-w-7xl mx-auto gcx-pad">
            <React.Suspense fallback={<div className="p-8 text-white/50 text-sm">Loading Universal Gamer Passport…</div>}>
              <UniversalPassportShowcase
                userId={user?.uid || 'guest_plajah_pioneer'}
                username={profile?.displayName || profile?.name || 'Plajah Pioneer'}
              />
            </React.Suspense>
          </div>
        ) : activeTab === 'HOME_BASE' && selectedDetailGame ? (
          <React.Suspense fallback={<div className="p-8 text-white/50 text-sm">Loading game page…</div>}>
            <GameDetailPage
              game={selectedDetailGame}
              onBack={() => setSelectedDetailGame(null)}
              onPlayNow={launchCatalogGame}
              onGoLive={(g) => {
                if (g.launch.type === 'live-game') setLiveGameKind(g.launch.kind);
                else setLiveGameKind('pick');
              }}
            />
          </React.Suspense>
        ) : activeTab === 'HOME_BASE' ? (
           <GamesConcourse
             profile={gamerProfile}
             onOpenGame={(g) => setSelectedDetailGame(g)}
             onPlay={launchCatalogGame}
             onHostLive={() => setLiveGameKind('pick')}
             onOpenPassport={() => setActiveTab('PASSPORT')}
             onOpenLeaderboards={() => setActiveTab('LEADERBOARDS')}
           >
             {games.length > 0 && (
               <section className="gcx-shelf">
                 <div className="gcx-shelf-h"><h2>From Plajah creators</h2><span>Games artists host on their Home Base</span></div>
                 <div className="gcx-row">
                   {games.map((game) => (
                     <button key={game.id} type="button" className="gcx-card" onClick={() => handleLaunchGame(game)}>
                       <div className="gcx-thumb">
                         {game.thumbnailUrl ? <img src={game.thumbnailUrl} alt={game.title} loading="lazy" /> : <div className="gcx-cover" style={{ ['--gx-h' as any]: '#a63be6' }} aria-hidden><span>▶</span></div>}
                       </div>
                       <div className="gcx-meta">
                         <h3>{game.title}</h3>
                         <p>By {gameOwners[game.ownerId]?.displayName || 'Artist'}</p>
                         <div className="gcx-foot"><span>{game.playCount || 0} plays</span></div>
                       </div>
                     </button>
                   ))}
                 </div>
               </section>
             )}
             {isAdmin && (
               <section className="gcx-shelf">
                 <div className="gcx-shelf-h"><h2>In development</h2><span>Admins only</span></div>
                 <div className="gcx-row">
                   <a href="/pewpew/" target="_blank" rel="noopener noreferrer" className="gcx-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                     <div className="gcx-thumb"><div className="gcx-cover" style={{ ['--gx-h' as any]: '#ff8c00' }} aria-hidden><span>◎</span></div><span className="gcx-badge">Prototype</span></div>
                     <div className="gcx-meta"><h3>Pew Pew</h3><p>Live-action shooter feel test. Point your phone or headset at targets, hold to lock, release to fire.</p></div>
                   </a>
                 </div>
               </section>
             )}
           </GamesConcourse>
        ) : (
           <div className="max-w-7xl mx-auto flex flex-col gcx-pad">
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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-8 pb-20">
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
