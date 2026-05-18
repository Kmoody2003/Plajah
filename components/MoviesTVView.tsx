import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PageHeader from './PageHeader';
import { 
  Play, Info, ChevronRight, ChevronLeft, Star, Clock, 
  Plus, Share2, Volume2, VolumeX, Users, Rocket, 
  BookOpen, Moon, CloudLightning, Ghost, Zap, Sparkles, 
  Calendar, Film, Bookmark, Settings, Search, Menu, Globe,
  Monitor, Shield, Bell, CreditCard, Home, Map as ExploreIcon, 
  Library, User as PersonIcon, TrendingUp, History, Maximize2,
  MoreHorizontal
} from 'lucide-react';
import { Album, Video, Universe, VideoPlaylist } from '../types';
import { fetchAllPublicAlbums, fetchUniverses, syncPublicDomainAsset, fetchSystemSettingsConfig, fetchVideoPlaylistsByIds, auth } from '../services/backendService';
import SignInPrompt from './SignInPrompt';
import { fetchArchiveVideos, fetchArchiveByAllGenres, GenreCollection, ArchiveVideo, getArchiveItemFiles, getBestVideoUrl } from '../services/archiveContentService';
import { TelevisionView } from './TelevisionView';
import { ExploreView } from './ExploreView';
import { MoviesSpecificView } from './MoviesSpecificView';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import ScrollableTabRow from './ScrollableTabRow';

interface MoviesTVViewProps {
  onBack: () => void;
  onSelectMovie: (item: any) => void;
  onNavigate?: (view: 'WORLDS' | 'USER_PROFILE') => void;
}

type SubView = 'HOME' | 'TV' | 'HIVE' | 'MY_NEBULA' | 'ALLY_VIEW' | 'MOVIES' | 'UNIVERSE' | 'LIBRARY';

const GENRE_ICONS: Record<string, React.ComponentType<any>> = {
  'Feature Films': Film,
  'Classic TV': Monitor,
  'Animation': Rocket,
  'Horror': Ghost,
  'Comedy': Sparkles,
  'Sci-Fi': Zap,
  'Western': ExploreIcon,
  'Documentary': BookOpen,
  'Film Noir': Moon,
  'Silent Film': History,
};

const HomeView: React.FC<{
  universes: Universe[];
  movies: ArchiveVideo[];
  tvSeries: ArchiveVideo[];
  genreCollections: GenreCollection[];
  curatedPlaylists: VideoPlaylist[];
  featuredItem: ArchiveVideo | Album | null;
  onSelectArchiveItem: (item: ArchiveVideo) => void;
  onSelectMovie: (item: any) => void;
  setCurrentSubView: (view: SubView) => void;
  setActiveAllyUrl: (url: string | null) => void;
  onSelectCuratedPlaylist: (playlist: VideoPlaylist) => void;
  tabNav: React.ReactNode;
  onRequestSignIn: (action: string) => void;
}> = ({ universes, movies, tvSeries, genreCollections, curatedPlaylists, featuredItem, onSelectArchiveItem, onSelectMovie, setCurrentSubView, setActiveAllyUrl, onSelectCuratedPlaylist, tabNav, onRequestSignIn }) => {

  return (
    <div className="space-y-16">
      {/* Hero Section */}
      <section className="relative h-[75vh] w-full overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-1000" style={{ backgroundImage: `url(${featuredItem && 'thumbnailUrl' in featuredItem ? featuredItem.thumbnailUrl : (featuredItem as Album)?.headerImage || 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&q=80'})` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/20 to-transparent"></div>
        </div>

        <div className="relative h-full container mx-auto px-8 flex flex-col justify-center items-start pt-20">
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            className="max-w-2xl space-y-6"
          >
            <div className="flex items-center gap-3">
              <span className="bg-tertiary/20 text-tertiary px-3 py-1 rounded-md font-label text-xs tracking-tighter uppercase border border-tertiary/30 backdrop-blur-md">Feature Presentation</span>
              <span className="text-on-surface-variant font-label text-xs uppercase tracking-widest">{('genre' in (featuredItem || {})) ? (featuredItem as any).genre : 'Classic Cinema'}</span>
            </div>
            <h2 className="font-black text-5xl sm:text-7xl md:text-9xl text-on-surface leading-[0.85] tracking-widest drop-shadow-2xl uppercase break-words w-full">
              {featuredItem?.title?.split(' ').slice(0, 2).join(' ')} <br/> 
              <span className="text-primary italic">{featuredItem?.title?.split(' ').slice(2).join(' ') || ''}</span>
            </h2>
            <p className="text-on-surface-variant text-sm md:text-lg max-w-md font-light leading-relaxed line-clamp-3 w-full">
              {('description' in (featuredItem || {})) ? (featuredItem as any).description : ''}
            </p>
            <div className="flex items-center gap-6 pt-4">
              <button 
                onClick={() => featuredItem && ('identifier' in featuredItem ? onSelectArchiveItem(featuredItem as ArchiveVideo) : onSelectMovie(featuredItem))}
                className="aurora-bg text-on-primary px-10 py-4 rounded-full font-bebas text-xl flex items-center gap-3 hover:scale-105 transition-transform shadow-[0_0_20px_rgba(208,188,255,0.4)] tracking-[0.1em]"
              >
                <Play fill="currentColor" size={24} /> PLAY NOW
              </button>
              <button
                onClick={() => { if (!auth.currentUser) { onRequestSignIn('add to watchlist'); } }}
                className="glass px-8 py-4 rounded-full border border-white/10 hover:bg-white/5 transition-all"
                title="Add to Watchlist"
              >
                <Plus size={24} className="text-primary" />
              </button>
            </div>
          </motion.div>

          <div className="absolute right-20 top-1/2 -translate-y-1/2 hidden lg:block">
            <motion.div 
              initial={{ opacity: 0, rotate: 10, y: 50 }}
              animate={{ opacity: 1, rotate: 3, y: 0 }}
              className="glass p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4 max-w-[200px] hover:rotate-0 transition-transform duration-500"
            >
              <div className="w-12 h-12 rounded-full aurora-bg flex items-center justify-center mb-4">
                <TrendingUp size={24} className="text-on-primary-fixed" />
              </div>
              <p className="font-bebas text-3xl leading-tight uppercase">Trending in Galaxy</p>
              <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant">Top #1 this week</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Tab Bar — sticky below hero */}
      {tabNav}

      {/* Genres Row */}
      <section className="px-8 md:px-16 flex gap-6 overflow-x-auto pb-4 mask-fade-edges">
        {genreCollections.map(({ genre }) => {
          const Icon = GENRE_ICONS[genre] ?? Film;
          return (
            <button key={genre} className="flex flex-col items-center gap-2 group p-4 border border-white/5 rounded-xl hover:bg-white/5 transition-all shrink-0">
              <Icon size={20} className="text-white/40 group-hover:text-primary transition-colors" />
              <span className="font-black uppercase tracking-widest text-[8px] text-white/60 whitespace-nowrap">{genre}</span>
            </button>
          );
        })}
      </section>

      {/* Curated Playlists */}
      {curatedPlaylists.length > 0 && (
        <section className="px-8 md:px-16 pt-12">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Sparkles size={16} className="text-small-orange" />
                <span className="font-label text-[10px] uppercase tracking-widest text-small-orange">Staff Picks</span>
              </div>
              <h3 className="font-bebas text-5xl uppercase tracking-tighter text-white">Curated Collections</h3>
            </div>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar mask-fade-edges pb-8">
            {curatedPlaylists.map(pl => (
              <motion.div
                key={pl.id}
                whileHover={{ scale: 1.02 }}
                className="group w-64 aspect-[16/9] relative rounded-[2rem] overflow-hidden glass border border-white/5 hover:border-small-orange/30 transition-all duration-500 cursor-pointer shadow-lg flex-shrink-0"
                onClick={() => {
                  onSelectCuratedPlaylist(pl);
                }}
              >
                 <img src={pl.thumbnailUrl || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={pl.title} />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent"></div>
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                    <div className="w-16 h-16 rounded-full bg-small-orange/20 border border-small-orange/50 flex items-center justify-center">
                      <Play fill="currentColor" className="text-small-orange ml-1" size={24} />
                    </div>
                 </div>
                 <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none">
                    <h4 className="font-bold text-xl uppercase tracking-tight line-clamp-1 mb-1">{pl.title}</h4>
                    <p className="text-[10px] text-white/60 uppercase tracking-widest">{pl.videoIds?.length || 0} Videos</p>
                 </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Genre Rails — one row per genre collection from Archive.org */}
      <section className="px-8 md:px-16 pb-40 space-y-20 pt-12">
        {genreCollections.map(({ genre, items }) => {
          const GenreIcon = GENRE_ICONS[genre] ?? Film;
          return (
            <div key={genre}>
              <div className="mb-8 flex items-end justify-between">
                <div className="flex items-center gap-3">
                  <GenreIcon size={20} className="text-primary" />
                  <h3 className="font-bebas text-5xl uppercase tracking-tighter">{genre}</h3>
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/20 border border-white/10 px-2 py-0.5 rounded-lg">
                    Public Domain
                  </span>
                </div>
              </div>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-8">
                {items.map((item) => (
                  <motion.div
                    key={item.identifier}
                    whileHover={{ y: -6 }}
                    className="group w-40 flex-shrink-0 cursor-pointer"
                    onClick={() => onSelectArchiveItem(item)}
                  >
                    <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 relative border border-white/5 group-hover:border-white/20 transition-all duration-300">
                      <img src={item.thumbnailUrl || undefined} loading="lazy" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700" alt={item.title} />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
                          <Play fill="white" size={20} className="text-white ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <h4 className="font-black text-[10px] uppercase tracking-tight truncate mt-2.5 text-white/80 group-hover:text-white transition-colors">{item.title}</h4>
                    <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mt-0.5">{item.year || 'Classic'} · {item.genre}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};

const HiveView: React.FC<{
  universes: Universe[];
  setCurrentSubView: (view: SubView) => void;
  setActiveAllyUrl: (url: string | null) => void;
}> = ({ universes, setCurrentSubView, setActiveAllyUrl }) => {
  const partnerUniverses = universes.filter(u => u.type === 'ALLY');
  return (
    <main className="pt-8 pb-40 px-8 md:px-16 container mx-auto">
      <div className="mb-16">
        <span className="font-bebas text-xs uppercase tracking-[0.4em] text-tertiary mb-3 block">Streaming Partners</span>
        <h2 className="font-bebas text-6xl md:text-9xl font-black leading-[0.85] uppercase tracking-tighter">
          Discovery Partner <br/>
          <span className="text-primary italic">Ecosystems.</span>
        </h2>
        <p className="mt-6 text-on-surface-variant max-w-lg font-light text-lg leading-relaxed">
          Step outside the platform and explore our partner streaming worlds — curated gateways to independent and mainstream content.
        </p>
      </div>

      {partnerUniverses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl">
          {partnerUniverses.map((u) => (
            <motion.div
              key={u.id}
              whileHover={{ scale: 1.02, y: -4 }}
              className="group relative cursor-pointer"
              onClick={() => {
                setActiveAllyUrl(u.url || null);
                setCurrentSubView('ALLY_VIEW');
              }}
            >
              <div className="glass border border-white/10 rounded-[2rem] p-10 flex items-center gap-8 transition-all duration-500 hover:border-primary/30 hover:shadow-[0_0_40px_rgba(208,188,255,0.12)] hover:bg-white/[0.03]">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-all">
                  <ExploreIcon className="text-primary" size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bebas text-2xl uppercase tracking-tighter text-white group-hover:text-primary transition-colors">{u.name}</h3>
                  <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mt-1">Partner Ecosystem</p>
                </div>
                <ChevronRight size={18} className="text-white/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-[3rem] max-w-lg">
          <Globe className="text-white/10 mx-auto mb-4" size={48} />
          <p className="text-white/20 font-bebas text-2xl uppercase tracking-widest">No partner ecosystems configured yet.</p>
        </div>
      )}
    </main>
  );
};

const NebulaView: React.FC<{
    movies: ArchiveVideo[];
    localContent: Album[];
    onSelectArchiveItem: (item: ArchiveVideo) => void;
    onSelectMovie: (item: Album) => void;
}> = ({ movies, localContent, onSelectArchiveItem, onSelectMovie }) => (
  <div className="pt-32 pb-40 px-8 md:px-16 container mx-auto">
    {/* Profile Header */}
    <section className="relative mb-24">
      <div className="flex flex-col md:flex-row items-center md:items-end gap-10 md:gap-16">
        <div className="relative group">
          <div className="absolute -inset-1 aurora-bg blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
          <div className="relative glass p-2 rounded-[2.5rem] border border-white/10">
            <div className="w-48 h-48 md:w-64 md:h-64 rounded-[2rem] overflow-hidden">
              <img src="https://picsum.photos/seed/lyra/500/500" className="w-full h-full object-cover" />
            </div>
          </div>
          <div className="absolute -bottom-4 -right-4 bg-[#00DAF3] p-4 rounded-full shadow-2xl text-black">
            <Sparkles size={24} />
          </div>
        </div>
        
        <div className="flex-1 text-center md:text-left space-y-6">
          <span className="text-tertiary font-bebas text-xs uppercase tracking-[0.3em] font-black underline underline-offset-8">Premium Voyager</span>
          <h2 className="text-6xl md:text-9xl font-bebas transition-all duration-700 tracking-tighter uppercase leading-[0.85]">Lyra Nebula</h2>
          <p className="text-on-surface-variant max-w-md font-body leading-relaxed text-lg">
            Architect of dreams and curator of celestial cinema. Your journey through the <span className="italic text-primary">ethereal expanse</span> continues here.
          </p>
          <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-4">
            <button className="rounded-full aurora-bg px-10 py-4 text-on-primary font-bebas text-sm flex items-center gap-3 hover:scale-105 transition-transform ambient-glow uppercase tracking-widest shadow-2xl">
              Edit Persona
            </button>
            <button className="rounded-full glass px-8 py-4 text-on-surface border border-white/10 font-bebas text-sm flex items-center gap-3 hover:bg-white/5 transition-all uppercase tracking-widest">
              Preferences
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 w-full md:w-auto">
          <div className="glass p-8 rounded-3xl border border-white/5 text-center min-w-[160px] hover:border-primary/30 transition-all">
            <div className="text-4xl font-bebas text-primary mb-1">124</div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">Voyages</div>
          </div>
          <div className="glass p-8 rounded-3xl border border-white/5 text-center min-w-[160px] hover:border-secondary/30 transition-all">
            <div className="text-4xl font-bebas text-secondary mb-1">3.2k</div>
            <div className="text-[10px] uppercase tracking-widest text-on-surface-variant font-black">Minutes</div>
          </div>
        </div>
      </div>
    </section>

    {/* User Uploaded Videos Gallery */}
    <section className="mb-24 space-y-8">
      <div className="flex items-end justify-between px-4">
        <div>
          <span className="text-secondary font-label text-[10px] uppercase tracking-[0.3em] font-bold">Your Creations</span>
          <h3 className="text-5xl font-display uppercase leading-none mt-2 tracking-tighter">Your Videos</h3>
        </div>
        <button className="text-secondary font-label text-xs uppercase tracking-widest flex items-center gap-3 hover:gap-5 transition-all duration-300 font-black">
          Manage Collection <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        {localContent.length > 0 ? (
          localContent.map((video) => (
            <motion.div
              key={video.id}
              whileHover={{ scale: 1.05 }}
              className="group relative aspect-[2/3] rounded-2xl overflow-hidden glass border border-white/10 shadow-2xl cursor-pointer"
              onClick={() => onSelectMovie(video)}
            >
              <img src={video.coverImage || null} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 p-4 w-full">
                <h4 className="text-sm font-bold truncate uppercase tracking-tight">{video.title}</h4>
                <p className="text-[10px] text-white/60 uppercase tracking-widest mt-1">{video.artist}</p>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="col-span-full py-20 flex flex-col items-center justify-center glass rounded-3xl border border-dashed border-white/20">
            <Film className="text-white/20 mb-4" size={48} />
            <p className="text-white/40 font-bebas text-xl uppercase tracking-widest">No uploaded videos yet</p>
            <button className="mt-6 px-8 py-3 aurora-bg rounded-full font-bebas text-xs tracking-widest uppercase">Upload First Movie</button>
          </div>
        )}
      </div>
    </section>

    {/* Watchlist Timeline */}
    <div className="grid grid-cols-1 md:grid-cols-12 gap-16">
      <section className="md:col-span-8 space-y-12">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-tertiary font-label text-[10px] uppercase tracking-[0.3em] font-bold">The Collection</span>
            <h3 className="text-5xl font-display uppercase leading-none mt-2 tracking-tighter">My Watchlist</h3>
          </div>
          <button className="text-primary font-label text-xs uppercase tracking-widest flex items-center gap-3 hover:gap-5 transition-all duration-300 font-black">
            View All <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {movies.slice(6, 10).map((movie, i) => (
            <motion.div 
              key={movie.identifier}
              whileHover={{ scale: 1.02 }}
              className="group relative rounded-2xl overflow-hidden aspect-[16/10] bg-surface-variant/20 transition-all duration-500 shadow-xl border border-white/5"
              onClick={() => onSelectArchiveItem(movie)}
            >
              <img src={movie.thumbnailUrl || null} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-90"></div>
              <div className="absolute bottom-0 p-8 w-full space-y-4">
                <div className="flex justify-between items-center">
                  <span className="bg-secondary/20 text-secondary px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest backdrop-blur-md border border-secondary/30">{movie.genre || 'Classic'}</span>
                  <Star className="text-tertiary fill-tertiary" size={16} />
                </div>
                <h4 className="text-2xl font-headline text-on-surface uppercase tracking-tight line-clamp-1">{movie.title}</h4>
                <div className="flex items-center gap-6 text-on-surface-variant text-[10px] font-black uppercase tracking-widest">
                  <span>{movie.year || 'N/A'}</span>
                  <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                  <span>HD</span>
                </div>
              </div>
              <button className="absolute top-4 right-4 w-12 h-12 rounded-full glass border border-white/10 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10">
                <Bookmark size={20} />
              </button>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Recently Played */}
      <section className="md:col-span-4 space-y-12">
        <div className="flex flex-col gap-2">
          <span className="text-tertiary font-label text-[10px] uppercase tracking-[0.3em] font-bold">The Journey</span>
          <h3 className="text-4xl font-headline uppercase leading-none">Activity</h3>
        </div>
        <div className="relative pl-8 space-y-12 before:content-[''] before:absolute before:left-0 before:top-4 before:bottom-4 before:w-[2px] before:bg-gradient-to-b before:from-primary/50 before:via-secondary/50 before:to-transparent">
          {[
            { title: 'Across the Multiverse', meta: 'Episode 4', time: '2 hours ago', progress: 85 },
            { title: 'The Silent Forest', meta: 'Feature Film', time: 'Yesterday', progress: 100 },
            { title: 'Nebula Whispers', meta: 'Archive', time: '2 days ago', progress: 40 }
          ].map((activity, i) => (
            <div key={i} className="relative group cursor-pointer">
              <div className={`absolute -left-[37px] top-4 w-4 h-4 rounded-full ring-4 ring-background shadow-2xl transition-all ${i === 0 ? 'aurora-bg shadow-primary/40 scale-125' : 'bg-surface-variant border-2 border-white/20 opacity-60 group-hover:opacity-100'}`}></div>
              <div className="glass p-6 rounded-2xl border border-white/5 group-hover:border-primary/30 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h5 className="text-lg font-headline text-on-surface uppercase tracking-tight">{activity.title}</h5>
                    <p className="text-on-surface-variant text-[10px] font-black uppercase tracking-widest mt-1">{activity.meta}</p>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-[#00DAF3]">{activity.time}</span>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-white/40">
                    <span>{activity.progress}% Completed</span>
                    <span>Synced</span>
                  </div>
                  <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full ${i === 0 ? 'aurora-bg' : 'bg-tertiary opacity-40'} rounded-full`} style={{ width: `${activity.progress}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>

    {/* Orbit Controls (Settings) */}
    <section className="mt-40 space-y-12">
      <div className="flex flex-col gap-2">
        <span className="text-tertiary font-label text-[10px] uppercase tracking-[0.3em] font-bold">Orbit Controls</span>
        <h3 className="text-4xl font-headline uppercase leading-none">Account Nebula</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Personal Info', desc: 'Manage your identity and avatar across nebula.', icon: PersonIcon, color: 'text-primary' },
          { label: 'Security Vault', desc: 'Two-factor pulse and device orbit monitoring.', icon: Shield, color: 'text-secondary' },
          { label: 'Visual Alerts', desc: 'Configure how you receive cosmic transmissions.', icon: Bell, color: 'text-tertiary' },
          { label: 'Billing Stream', desc: 'Control your subscription and data essence.', icon: CreditCard, color: 'text-on-surface' }
        ].map((item, i) => (
          <div key={item.label} className="group glass p-10 rounded-3xl border border-white/5 hover:border-primary/40 transition-all duration-500 cursor-pointer hover:-translate-y-2 shadow-xl">
            <item.icon className={`${item.color} mb-8 block transition-all duration-500 group-hover:scale-125 group-hover:drop-shadow-[0_0_10px_currentColor]`} size={40} />
            <h5 className="text-xl font-headline text-on-surface uppercase tracking-tight mb-3">{item.label}</h5>
            <p className="text-[11px] text-on-surface-variant font-medium leading-relaxed uppercase tracking-wider">{item.desc}</p>
          </div>
        ))}
      </div>
    </section>
  </div>
);

const LibraryView: React.FC<{
  movies: ArchiveVideo[];
  localContent: Album[];
  onSelectArchiveItem: (item: ArchiveVideo) => void;
  onSelectMovie: (item: any) => void;
}> = ({ movies, localContent, onSelectArchiveItem, onSelectMovie }) => (
  <div className="pt-4 pb-40 px-8 md:px-16 container mx-auto">
    <div className="mb-12 pt-8">
      <span className="font-bebas text-xs uppercase tracking-[0.4em] text-tertiary mb-3 block">Your Collection</span>
      <h2 className="font-bebas text-6xl md:text-8xl font-black leading-[0.85] uppercase tracking-tighter">
        My <span className="text-primary italic">Library</span>
      </h2>
      <p className="mt-4 text-white/40 max-w-lg font-light text-sm leading-relaxed">
        Movies and shows you own, purchased, or added to your account.
      </p>
    </div>

    {localContent.filter(c => c.type === 'VIDEO').length > 0 ? (
      <div className="space-y-16">
        <section>
          <h3 className="font-bebas text-4xl uppercase tracking-tighter mb-8 text-white/80">Your Videos</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {localContent.filter(c => c.type === 'VIDEO').map(video => (
              <motion.div
                key={video.id}
                whileHover={{ scale: 1.03 }}
                className="group relative aspect-[2/3] rounded-2xl overflow-hidden glass border border-white/5 hover:border-primary/30 transition-all cursor-pointer"
                onClick={() => onSelectMovie(video)}
              >
                <img src={video.coverImage || null} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={video.title} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-0 p-4 w-full">
                  <h4 className="text-sm font-bold truncate uppercase tracking-tight">{video.title}</h4>
                  <p className="text-[10px] text-white/60 uppercase tracking-widest mt-1">{video.artist}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </div>
    ) : (
      <div className="py-32 flex flex-col items-center justify-center glass rounded-3xl border border-dashed border-white/10">
        <Library className="text-white/15 mb-6" size={56} />
        <p className="text-white/30 font-bebas text-2xl uppercase tracking-widest mb-2">Your library is empty</p>
        <p className="text-white/20 text-xs uppercase tracking-widest">Content you add or purchase will appear here</p>
      </div>
    )}
  </div>
);

const MoviesTVView: React.FC<MoviesTVViewProps> = ({ onBack, onSelectMovie, onNavigate }) => {
  const [movies, setMovies] = useState<ArchiveVideo[]>([]);
  const [tvSeries, setTvSeries] = useState<ArchiveVideo[]>([]);
  const [genreCollections, setGenreCollections] = useState<GenreCollection[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<VideoPlaylist[]>([]);
  const [localContent, setLocalContent] = useState<Album[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [activeAllyUrl, setActiveAllyUrl] = useState<string | null>(null);
  const [featuredItem, setFeaturedItem] = useState<ArchiveVideo | Album | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [currentSubView, setCurrentSubView] = useState<SubView>('HOME');
  const [activePlaylistItem, setActivePlaylistItem] = useState<any | null>(null);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const { playVideo, setTheme } = useGlobalPlayerState();

  useEffect(() => {
    setTheme('ETHEREAL');
    loadContent();
    return () => setTheme('DARK');
  }, []);

  const loadContent = async () => {
    try {
      setIsLoading(true);
      const [all, unis, allGenres, settings] = await Promise.all([
        fetchAllPublicAlbums(),
        fetchUniverses(),
        fetchArchiveByAllGenres(15),
        fetchSystemSettingsConfig()
      ]);

      setLocalContent(all.filter(a => a.type === 'VIDEO'));
      setGenreCollections(allGenres);
      const featureGenre = allGenres.find(g => g.genre === 'Feature Films');
      const tvGenre = allGenres.find(g => g.genre === 'Classic TV');
      setMovies(featureGenre?.items ?? []);
      setTvSeries(tvGenre?.items ?? []);
      setUniverses(unis);

      if (settings?.curatedVideoPlaylists?.length > 0) {
        const curPls = await fetchVideoPlaylistsByIds(settings.curatedVideoPlaylists);
        setCuratedPlaylists(curPls);
      }
      
      const featureItems = allGenres.find(g => g.genre === 'Feature Films')?.items ?? [];
      if (featureItems.length > 0) {
        setFeaturedItem(featureItems[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectCuratedPlaylist = (pl: VideoPlaylist) => {
    setActivePlaylistItem({
      id: pl.id,
      ownerId: pl.ownerId,
      title: pl.title,
      artist: 'Staff Curated',
      description: pl.description,
      coverImage: pl.thumbnailUrl || '',
      thumbnailUrl: pl.thumbnailUrl || '',
      type: 'VIDEO',
      subType: 'TV_SERIES',
      seasons: [{
          seasonNumber: 1,
          episodes: (pl.videos || []).map((v: any, i: number) => ({
            id: v.id,
            title: v.title,
            description: v.description || '',
            episodeNumber: i + 1,
            url: v.url,
            thumbnailUrl: v.thumbnail || pl.thumbnailUrl
          }))
      }],
      createdAt: pl.timestamp,
      isPublic: pl.isPublic
    });
    setCurrentSubView('TV');
  };

  const handleSelectArchiveItem = async (item: ArchiveVideo) => {
    // Show a small toast or loading state if needed, but for now we fetch files for better performance
    const files = await getArchiveItemFiles(item.identifier);
    const videoUrl = getBestVideoUrl(item.identifier, files);

    if (videoUrl) {
      syncPublicDomainAsset(item, videoUrl, 'VIDEO');
    }

    // Transform ArchiveVideo to Album-like structure for the player
    const transformed: Album = {
      id: item.identifier,
      title: item.title,
      artist: item.genre || 'Classic Cinema',
      coverImage: item.thumbnailUrl || '',
      headerImage: item.thumbnailUrl,
      description: item.description,
      type: 'VIDEO',
      subType: 'MOVIE',
      ownerId: 'internet-archive',
      createdAt: parseInt(item.year || '0'),
      themeColor: '#000000',
      tracks: videoUrl ? [{
        id: item.identifier,
        title: item.title,
        artist: item.genre || 'Classic Cinema',
        url: videoUrl,
        albumCover: item.thumbnailUrl || ''
      }] : [],
      customVideoUrl: videoUrl || undefined
    };
    onSelectMovie(transformed);
  };

  const TopAppBar = () => (
    <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-[#131314]/80 backdrop-blur-xl border-b border-white/5">
      <div className="flex items-center gap-3">
        <button className="text-white/60 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
        <span className="text-sm font-black uppercase tracking-[0.3em] text-white/80">Taleo</span>
      </div>
      <button className="text-white/60 hover:text-white transition-colors p-2">
        <Search size={20} />
      </button>
    </header>
  );

  const TabNav = () => (
    <div className="sticky top-16 z-40 bg-[#131314]/90 backdrop-blur-xl border-b border-white/5 px-2">
      <ScrollableTabRow innerClassName="max-w-2xl mx-auto py-1 justify-around gap-1">
        {[
          { id: 'HOME',    icon: Home,         label: 'Home'     },
          { id: 'MOVIES',  icon: Film,         label: 'Movies'   },
          { id: 'TV',      icon: Monitor,      label: 'TV'       },
          { id: 'UNIVERSE',icon: Globe,        label: 'Universe' },
          { id: 'EXPLORE', icon: ExploreIcon,  label: 'Explore'  },
          { id: 'LIBRARY', icon: Library,      label: 'Library'  },
          { id: 'PROFILE', icon: PersonIcon,   label: 'Profile'  },
        ].map(({ id, icon: Icon, label }) => {
          const isActive = currentSubView === id ||
            (id === 'HOME' && currentSubView === 'HOME') ||
            (id === 'EXPLORE' && currentSubView === 'HIVE');
          return (
            <button
              key={id}
              onClick={() => {
                if (id === 'EXPLORE')       { onNavigate?.('WORLDS'); }
                else if (id === 'PROFILE')  { onNavigate?.('USER_PROFILE'); }
                else                        { setCurrentSubView(id as SubView); }
              }}
              className={`flex flex-col items-center justify-center px-3 py-2.5 rounded-xl transition-all duration-200 flex-shrink-0 ${
                isActive
                  ? 'text-[#D0BCFF] bg-[#D0BCFF]/10'
                  : 'text-white/30 hover:text-white/70'
              }`}
            >
              <Icon size={18} />
              <span className="text-[7px] font-black uppercase tracking-wider mt-0.5">{label}</span>
            </button>
          );
        })}
      </ScrollableTabRow>
    </div>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen theme-ethereal bg-[#131314] flex items-center justify-center">
        <div className="flex flex-col items-center gap-8">
          <div className="w-24 h-24 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="font-headline text-[10px] uppercase tracking-[0.6em] text-primary">Syncing Galaxy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-ethereal bg-transparent text-[#E5E2E3] overflow-x-hidden selection:bg-primary selection:text-white font-body pb-32">
      <TopAppBar />
      
      {/* Decorative Blur Backgrounds */}
      <div className="fixed top-1/4 -left-20 w-[40rem] h-[40rem] aurora-bg blur-[150px] opacity-10 pointer-events-none -z-10" />
      <div className="fixed bottom-1/4 -right-20 w-[50rem] h-[50rem] bg-tertiary blur-[180px] opacity-5 pointer-events-none -z-10" />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentSubView}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          {currentSubView === 'HOME' && (
            <HomeView
              universes={universes}
              movies={movies}
              tvSeries={tvSeries}
              genreCollections={genreCollections}
              curatedPlaylists={curatedPlaylists}
              featuredItem={featuredItem}
              onSelectArchiveItem={handleSelectArchiveItem}
              onSelectMovie={onSelectMovie}
              setCurrentSubView={setCurrentSubView}
              setActiveAllyUrl={setActiveAllyUrl}
              onSelectCuratedPlaylist={handleSelectCuratedPlaylist}
              tabNav={<TabNav />}
              onRequestSignIn={action => setSignInAction(action)}
            />
          )}
          {currentSubView === 'TV' && (
            <div className="pt-16">
              <TabNav />
              <TelevisionView series={[...tvSeries, ...localContent.filter(c => c.subType === 'TV_SERIES' || c.tags?.includes('tv'))]} initialSelectedSeries={activePlaylistItem} onSelect={onSelectMovie} />
            </div>
          )}
          {currentSubView === 'MOVIES' && (
            <div className="pt-16">
              <TabNav />
              <MoviesSpecificView movies={movies} localContent={localContent} onSelect={onSelectMovie} />
            </div>
          )}
          {currentSubView === 'UNIVERSE' && (
            <div className="pt-16">
              <TabNav />
              <HiveView
                  universes={universes}
                  setCurrentSubView={setCurrentSubView}
                  setActiveAllyUrl={setActiveAllyUrl}
              />
            </div>
          )}
          {currentSubView === 'HIVE' && (
            <div className="pt-16">
              <TabNav />
              <ExploreView
                  movies={movies}
                  tvSeries={tvSeries}
                  localContent={localContent}
                  onSelect={onSelectMovie}
              />
            </div>
          )}
          {currentSubView === 'LIBRARY' && (
            <div className="pt-16">
              <TabNav />
              <LibraryView
                movies={movies}
                localContent={localContent}
                onSelectArchiveItem={handleSelectArchiveItem}
                onSelectMovie={onSelectMovie}
              />
            </div>
          )}
          {currentSubView === 'MY_NEBULA' && (
            <NebulaView
                movies={movies}
                localContent={localContent}
                onSelectArchiveItem={handleSelectArchiveItem}
                onSelectMovie={onSelectMovie}
            />
          )}
          {currentSubView === 'ALLY_VIEW' && activeAllyUrl && (
            <div className="pt-16 h-screen w-full">
                <TabNav />
                <iframe src={activeAllyUrl} className="w-full h-[calc(100vh-8rem)] border-none" />
                <div className="fixed top-32 left-8 flex gap-4 z-50">
                  <button
                    className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm"
                    onClick={() => setCurrentSubView('HOME')}
                  >← Back</button>
                  <a
                    href={activeAllyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-primary/20 text-white px-4 py-2 rounded-full font-bold backdrop-blur-sm text-sm"
                  >Open in New Tab</a>
                </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {signInAction && (
          <SignInPrompt action={signInAction} onClose={() => setSignInAction(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MoviesTVView;
