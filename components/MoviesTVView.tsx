import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Info, ChevronRight, ChevronLeft, Star,
  Plus, Share2, Users, Rocket, UserPlus,
  BookOpen, Moon, CloudLightning, Ghost, Zap, Sparkles,
  Calendar, Film, Bookmark, Settings, Search, Menu, Globe,
  Monitor, Shield, Bell, CreditCard, Home, Map as ExploreIcon,
  Library, User as PersonIcon, TrendingUp, History, Maximize2,
  MoreHorizontal, X,
} from 'lucide-react';
import { Album, Video, Universe, VideoPlaylist, IPWorld, Character } from '../types';
import {
  fetchAllPublicAlbums, fetchUniverses, syncPublicDomainAsset,
  fetchSystemSettingsConfig, fetchVideoPlaylistsByIds, fetchAllVideos, auth,
  fetchAllPublicWorlds, fetchWorldCharacters,
} from '../services/backendService';
import SignInPrompt from './SignInPrompt';
import { fetchArchiveVideos, fetchArchiveByAllGenres, GenreCollection, ArchiveVideo, getArchiveItemFiles, getBestVideoUrl } from '../services/archiveContentService';
import { TelevisionView } from './TelevisionView';
import { ExploreView } from './ExploreView';
import { MoviesSpecificView } from './MoviesSpecificView';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import ScrollableTabRow from './ScrollableTabRow';
import PlajahPlusBanner from './PlajahPlusBanner';
import { fetchPublicClubs, fetchVideoById } from '../services/backendService';
import HoverPreviewThumb, { previewSourceFor } from './HoverPreviewThumb';
import { getContinueWatching, WatchEntry } from '../services/watchHistoryService';
import PersonalVideoLocker from './PersonalVideoLocker';
import type { Club } from '../types';
import TaleoFilmMuseum from './TaleoFilmMuseum';
import { Landmark } from 'lucide-react';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';

interface MoviesTVViewProps {
  onBack: () => void;
  onSelectMovie: (item: any) => void;
  onNavigate?: (view: 'WORLDS' | 'USER_PROFILE' | 'TALEO_HISTORY' | 'FILM_SCHOOL') => void;
}

type SubView = 'HOME' | 'TV' | 'HIVE' | 'MY_NEBULA' | 'ALLY_VIEW' | 'MOVIES' | 'UNIVERSE' | 'LIBRARY' | 'MUSEUM' | 'CLUBS';

const TaleoTabNav: React.FC<{
  currentSubView: SubView;
  setCurrentSubView: (v: SubView) => void;
  onNavigate?: (view: 'WORLDS' | 'USER_PROFILE') => void;
}> = ({ currentSubView, setCurrentSubView, onNavigate }) => (
  <div className="sticky top-16 z-40 bg-[#131314]/90 backdrop-blur-xl border-b border-white/5 px-2">
    <ScrollableTabRow innerClassName="max-w-2xl mx-auto py-1 justify-around gap-1">
      {[
        { id: 'HOME',     icon: Home,        label: 'Home'     },
        { id: 'MOVIES',   icon: Film,        label: 'Movies'   },
        { id: 'TV',       icon: Monitor,     label: 'TV'       },
        { id: 'MUSEUM',   icon: Landmark,    label: 'Museum'   },
        { id: 'CLUBS',    icon: Users,       label: 'Clubs'    },
        { id: 'UNIVERSE', icon: Globe,       label: 'Universe' },
        { id: 'EXPLORE',  icon: ExploreIcon, label: 'Explore'  },
        { id: 'LIBRARY',  icon: Library,     label: 'Library'  },
        { id: 'PROFILE',  icon: PersonIcon,  label: 'Profile'  },
      ].map(({ id, icon: Icon, label }) => {
        const isActive =
          currentSubView === id ||
          (id === 'HOME' && currentSubView === 'HOME') ||
          (id === 'EXPLORE' && currentSubView === 'HIVE');
        return (
          <button
            key={id}
            onClick={() => {
              if (id === 'EXPLORE')      onNavigate?.('WORLDS');
              else if (id === 'PROFILE') onNavigate?.('USER_PROFILE');
              else                       setCurrentSubView(id as SubView);
            }}
            className={`flex flex-col items-center justify-center px-3 py-2.5 rounded-xl transition-all duration-200 flex-shrink-0 ${
              isActive ? 'text-[#D0BCFF] bg-[#D0BCFF]/10' : 'text-white/30 hover:text-white/70'
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

// ── Shared section header ──────────────────────────────────────────────────────
const SectionHeader: React.FC<{
  label: string;
  title: string;
  onSeeAll?: () => void;
  accent?: string;
}> = ({ label, title, onSeeAll, accent = '#D0BCFF' }) => (
  <div className="flex items-end justify-between mb-5">
    <div>
      <p className="text-[9px] font-black uppercase tracking-[0.3em] mb-1.5" style={{ color: accent }}>{label}</p>
      <h3 className="text-2xl font-black uppercase tracking-tight text-white">{title}</h3>
    </div>
    {onSeeAll && (
      <button onClick={onSeeAll} className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-colors">
        See All
      </button>
    )}
  </div>
);

// ── Generic poster card ────────────────────────────────────────────────────────
const PosterCard: React.FC<{
  title: string;
  subtitle?: string;
  image?: string | null;
  genre?: string;
  onPlay: () => void;
  width?: string;
  accentBorder?: boolean;
  /** When provided, hovering the poster plays a short muted trailer/preview. */
  previewItem?: any;
}> = ({ title, subtitle, image, genre, onPlay, width = 'w-36 flex-shrink-0', accentBorder, previewItem }) => {
  const preview = previewItem ? previewSourceFor(previewItem) : null;
  if (preview) {
    return (
      <div className={width}>
        <HoverPreviewThumb
          poster={image || undefined}
          title={title}
          subtitle={subtitle}
          preview={preview}
          accent={accentBorder ? '#D0BCFF' : '#FFB68D'}
          aspectClass="aspect-[2/3]"
          onClick={onPlay}
          fallbackIcon={<Film size={28} className="text-white/10" />}
        />
      </div>
    );
  }
  return (
  <motion.div whileHover={{ y: -5 }} onClick={onPlay} className={`group cursor-pointer ${width}`}>
    <div className={`aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative border transition-all duration-300 ${accentBorder ? 'border-[#D0BCFF]/20 group-hover:border-[#D0BCFF]/50' : 'border-white/8 group-hover:border-white/20'}`}>
      {image ? (
        <img src={thumb(image, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(image)} className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-all duration-500" alt={title} />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Film size={28} className="text-white/10" />
        </div>
      )}
      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <div className="w-11 h-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
          <Play fill="white" size={17} className="ml-0.5" />
        </div>
      </div>
      {genre && (
        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md">
          <span className="text-[7px] font-black uppercase tracking-widest text-white/50">{genre}</span>
        </div>
      )}
    </div>
    <h4 className="mt-2 text-[10px] font-black uppercase tracking-tight truncate text-white/70 group-hover:text-white transition-colors">{title}</h4>
    {subtitle && <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mt-0.5 truncate">{subtitle}</p>}
  </motion.div>
  );
};

// ── HomeView ───────────────────────────────────────────────────────────────────
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
  platformVideos?: any[];
  worlds?: IPWorld[];
  featuredCharacters?: Character[];
  filmClubs?: Club[];
  onNavigate?: (view: string) => void;
}> = ({
  universes, movies, tvSeries, genreCollections, curatedPlaylists,
  featuredItem, onSelectArchiveItem, onSelectMovie, setCurrentSubView,
  setActiveAllyUrl, onSelectCuratedPlaylist, tabNav, onRequestSignIn,
  platformVideos = [], worlds = [], featuredCharacters = [], filmClubs = [],
  onNavigate,
}) => {
  const [heroIdx, setHeroIdx] = useState(0);
  const [worldBannerIdx, setWorldBannerIdx] = useState(0);

  // Hero carousel: platform content first (latest), then archive classics
  const heroItems = useMemo(() => [
    ...platformVideos.slice(0, 6),
    ...movies.slice(0, 4).map(m => ({ ...m, _isArchive: true })),
  ], [platformVideos, movies]);

  // Auto-advance hero every 6s
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const t = setInterval(() => setHeroIdx(i => (i + 1) % heroItems.length), 6000);
    return () => clearInterval(t);
  }, [heroItems.length]);

  // Auto-advance worlds banner every 5s
  useEffect(() => {
    if (worlds.length <= 1) return;
    const t = setInterval(() => setWorldBannerIdx(i => (i + 1) % Math.min(worlds.length, 8)), 5000);
    return () => clearInterval(t);
  }, [worlds.length]);

  const hero = heroItems[heroIdx] || featuredItem;
  const heroImage = hero
    ? ((hero as any).thumbnailUrl || (hero as any).coverImage || (hero as any).headerImage)
    : null;
  const heroTitle = hero?.title || '';
  const heroDesc = ((hero as any)?.description || '').replace(/<[^>]*>?/gm, '').slice(0, 180);
  const heroGenre = (hero as any)?.genre || '';
  const heroIsplatform = !!(hero as any)?._isPlatform;
  const heroIsArchive = !!(hero as any)?._isArchive || !!(hero as any)?.identifier;

  const handleHeroPlay = () => {
    if (!hero) return;
    if (heroIsplatform) onSelectMovie((hero as any)._original);
    else if (heroIsArchive || (hero as any).identifier) onSelectArchiveItem(hero as ArchiveVideo);
    else onSelectMovie(hero);
  };

  const currentWorld = worlds[worldBannerIdx];

  // Section slices
  const newToTaleo      = platformVideos.slice(0, 12);
  const creatorFilms    = platformVideos;

  // Continue Watching (resume) — Taleo watch progress.
  const [continueWatching, setContinueWatching] = useState<WatchEntry[]>([]);
  useEffect(() => { getContinueWatching('TALEO').then(setContinueWatching).catch(() => {}); }, []);
  const resumeItem = async (entry: WatchEntry) => {
    const v = await fetchVideoById(entry.id).catch(() => null);
    if (v) onSelectMovie(v);
  };
  const trendingContent = [...platformVideos.slice(0, 8), ...movies.slice(0, 6)];
  const acclaimed       = movies.slice(0, 12);
  const belovedByUsers  = platformVideos.slice(0, 10);

  return (
    <div>
      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative h-[80vh] w-full overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={`hero-bg-${heroIdx}`}
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0"
          >
            {heroImage
              ? <img src={heroImage} className="w-full h-full object-cover" alt="" />
              : <div className="w-full h-full bg-gradient-to-br from-[#2A2040] to-[#131314]" />}
          </motion.div>
        </AnimatePresence>

        {/* Gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#131314]/10 via-[#131314]/40 to-[#131314]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#131314]/85 via-[#131314]/30 to-transparent" />

        {/* Hero copy */}
        <div className="absolute inset-0 flex flex-col justify-end pb-14 px-4 sm:px-6 md:px-12 max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={`hero-content-${heroIdx}`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.55 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="bg-white/10 text-white/70 text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg border border-white/12">
                  {heroIsplatform ? 'Platform Original' : 'Taleo Cinema'}
                </span>
                {heroGenre && (
                  <span className="text-[#FFB68D] text-[9px] font-black uppercase tracking-[0.2em]">{heroGenre}</span>
                )}
              </div>

              <h2 className="text-2xl sm:text-4xl md:text-6xl lg:text-8xl font-black uppercase tracking-tight leading-[0.88] text-white drop-shadow-2xl">
                {heroTitle.split(' ').slice(0, 3).join(' ')}
                {heroTitle.split(' ').length > 3 && (
                  <><br /><span className="text-[#D0BCFF]">{heroTitle.split(' ').slice(3).join(' ')}</span></>
                )}
              </h2>

              {heroDesc && (
                <p className="text-white/55 text-sm md:text-base max-w-md leading-relaxed line-clamp-2">{heroDesc}</p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleHeroPlay}
                  className="h-12 px-8 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-3 transition-all hover:scale-105 shadow-lg"
                >
                  <Play fill="currentColor" size={18} /> Watch Now
                </button>
                <button
                  onClick={() => { if (!auth.currentUser) onRequestSignIn('add to watchlist'); }}
                  className="h-12 px-6 bg-white/8 hover:bg-white/12 border border-white/15 text-white/70 font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2 transition-all"
                >
                  <Plus size={17} /> Watchlist
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot pagination */}
        {heroItems.length > 1 && (
          <div className="absolute bottom-5 right-3 sm:right-6 flex gap-1.5">
            {heroItems.map((_, i) => (
              <button
                key={i}
                onClick={() => setHeroIdx(i)}
                className={`transition-all duration-300 rounded-full ${i === heroIdx ? 'w-6 h-2 bg-[#D0BCFF]' : 'w-2 h-2 bg-white/20 hover:bg-white/40'}`}
              />
            ))}
          </div>
        )}

        {/* Prev / Next arrows */}
        {heroItems.length > 1 && (
          <>
            <button
              onClick={() => setHeroIdx(i => (i - 1 + heroItems.length) % heroItems.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/60 transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setHeroIdx(i => (i + 1) % heroItems.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-black/60 transition-all"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </section>

      {/* Sticky tab nav */}
      {tabNav}

      {/* ── CONTENT SECTIONS ─────────────────────────────────────────────── */}
      <div className="px-4 sm:px-5 md:px-10 space-y-12 sm:space-y-16 pb-40">

        {/* Plajah+ Banner */}
        <div className="pt-10">
          <PlajahPlusBanner />
        </div>

        {/* Taleo Discovery Hero Cards */}
        {onNavigate && (
          <section className="px-4 lg:px-8 mb-6">
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
              {/* Film History hero card */}
              <button
                onClick={() => onNavigate('TALEO_HISTORY')}
                className="shrink-0 relative w-[calc(100vw-32px)] max-w-72 h-40 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl"
                style={{ border: '1px solid rgba(203,213,225,0.2)' }}
              >
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Charlie_Chaplin.jpg/480px-Charlie_Chaplin.jpg"
                  alt="Film History"
                  className="absolute inset-0 w-full h-full object-cover object-top scale-110 group-hover:scale-125 transition-transform duration-500"
                  style={{ filter: 'brightness(0.45) saturate(0.4)' }}
                />
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 via-transparent to-black/80" />
                <div className="relative h-full flex flex-col justify-between p-5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-small-orange animate-pulse" />
                    <span className="text-[7px] font-black uppercase tracking-[0.35em] text-small-orange">Platform Pulse</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-300/80 mb-0.5">Today in Film History</p>
                    <h3 className="text-lg font-black text-white leading-tight">History Moments</h3>
                    <p className="text-[9px] text-white/50 mt-1">Directors, actors &amp; auteurs →</p>
                  </div>
                </div>
              </button>

              {/* Film School hero card */}
              <button
                onClick={() => onNavigate('FILM_SCHOOL')}
                className="shrink-0 relative w-[calc(100vw-32px)] max-w-72 h-40 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl"
                style={{ border: '1px solid rgba(245,158,11,0.35)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-amber-950/90 via-orange-900/60 to-red-950/80" />
                {/* Clapperboard graphic */}
                <div className="absolute right-4 top-4 opacity-15 text-[80px] leading-none select-none">🎬</div>
                <div className="relative h-full flex flex-col justify-between p-5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="text-[7px] font-black uppercase tracking-[0.35em] text-amber-400">Learn Filmmaking</span>
                  </div>
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-amber-300/80 mb-0.5">Story · Script · Direction · Camera</p>
                    <h3 className="text-lg font-black text-white leading-tight">Film &amp; TV School</h3>
                    <p className="text-[9px] text-white/50 mt-1">Script vault · Film history →</p>
                  </div>
                </div>
              </button>
            </div>
          </section>
        )}

        {/* Continue Watching (resume) */}
        {continueWatching.length > 0 && (
          <section>
            <SectionHeader label="Jump Back In" title="Continue Watching" accent="#3FBE85" />
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
              {continueWatching.map(e => {
                const pct = e.durationSec > 0 ? Math.min(100, (e.positionSec / e.durationSec) * 100) : 0;
                return (
                  <motion.div key={e.id} whileHover={{ y: -5 }} onClick={() => resumeItem(e)} className="w-56 flex-shrink-0 group cursor-pointer">
                    <div className="aspect-video rounded-xl overflow-hidden bg-white/5 relative border border-white/8 group-hover:border-[#3FBE85]/40 transition-all">
                      {e.thumbnailUrl
                        ? <img src={e.thumbnailUrl} loading="lazy" className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-all" alt={e.title || ''} />
                        : <div className="w-full h-full flex items-center justify-center"><Film size={26} className="text-white/10" /></div>}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-11 h-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm"><Play fill="white" size={17} className="ml-0.5" /></div>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40"><div className="h-full bg-[#3FBE85]" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <h4 className="mt-2 text-[10px] font-black uppercase tracking-tight truncate text-white/70 group-hover:text-white transition-colors">{e.title || 'Untitled'}</h4>
                    <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mt-0.5">{e.completed ? 'Watched' : `${Math.round(pct)}% · Resume`}</p>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* New to Taleo */}
        {newToTaleo.length > 0 && (
          <section>
            <SectionHeader label="Just Added" title="New to Taleo" accent="#D0BCFF" />
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
              {newToTaleo.map(v => (
                <PosterCard
                  key={v.identifier || v.id}
                  title={v.title}
                  subtitle={(v as any)._original?.ownerName || (v as any).ownerName}
                  image={v.thumbnailUrl || v.coverImage}
                  genre={v.genre}
                  previewItem={(v as any)._original || v}
                  onPlay={() => onSelectMovie((v as any)._original || v)}
                  accentBorder
                />
              ))}
            </div>
          </section>
        )}

        {/* Worlds Discovery Banner */}
        {worlds.length > 0 && currentWorld && (
          <section>
            <SectionHeader label="Explore IP" title="Discover Worlds" accent="#FFB68D" />
            <div className="relative h-56 md:h-64 rounded-2xl overflow-hidden border border-white/8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`world-${worldBannerIdx}`}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.7 }}
                  className="absolute inset-0"
                >
                  {(currentWorld as any).headerImage || (currentWorld as any).coverImage ? (
                    <img
                      src={thumb((currentWorld as any).headerImage || (currentWorld as any).coverImage, THUMB.large) || undefined}
                      loading="lazy"
                      decoding="async"
                      onError={onThumbError((currentWorld as any).headerImage || (currentWorld as any).coverImage)}
                      className="w-full h-full object-cover"
                      alt={currentWorld.name}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#2A2040] via-[#1A1530] to-[#131314]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#131314]/95 via-[#131314]/60 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-center px-5 sm:px-8 md:px-12 max-w-xl">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-2">IP Universe</p>
                    <h3 className="text-3xl md:text-5xl font-black uppercase text-white tracking-tight leading-tight">
                      {currentWorld.name}
                    </h3>
                    {currentWorld.description && (
                      <p className="text-white/45 text-xs mt-2 line-clamp-2 max-w-sm">{currentWorld.description}</p>
                    )}
                    <button className="mt-4 w-fit h-9 px-5 bg-[#FFB68D] hover:bg-[#FFC9A0] text-[#1C1B1F] font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all hover:scale-105">
                      <Globe size={13} /> Explore World
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Banner dots */}
              <div className="absolute bottom-3 right-4 flex gap-1.5">
                {Array.from({ length: Math.min(worlds.length, 8) }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setWorldBannerIdx(i)}
                    className={`transition-all duration-300 rounded-full ${i === worldBannerIdx ? 'w-5 h-1.5 bg-[#FFB68D]' : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'}`}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Films & Series by Creators */}
        {creatorFilms.length > 0 && (
          <section>
            <SectionHeader label="Platform Originals" title="Films & Series by Creators" accent="#D0BCFF" />
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
              {creatorFilms.map(v => {
                const orig = (v as any)._original || v;
                const ownerName = orig.ownerName || (v as any).ownerName || '';
                const image = v.thumbnailUrl || v.coverImage || orig.thumbnailUrl;
                return (
                  <motion.div
                    key={v.identifier || v.id}
                    whileHover={{ y: -5 }}
                    className="w-40 flex-shrink-0 group cursor-pointer"
                    onClick={() => onSelectMovie(orig)}
                  >
                    <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative border border-white/8 group-hover:border-[#D0BCFF]/40 transition-all duration-300">
                      {image ? (
                        <img src={thumb(image, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(image)} className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-all duration-500" alt={v.title} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film size={28} className="text-white/10" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-11 h-11 rounded-full bg-[#D0BCFF]/20 border border-[#D0BCFF]/40 flex items-center justify-center">
                          <Play fill="white" size={17} className="ml-0.5" />
                        </div>
                      </div>
                      {ownerName && (
                        <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/85 to-transparent">
                          <p className="text-[8px] text-[#D0BCFF] font-black uppercase tracking-widest truncate">{ownerName}</p>
                        </div>
                      )}
                    </div>
                    <h4 className="mt-2 text-[10px] font-black uppercase tracking-tight truncate text-white/70 group-hover:text-white transition-colors">{v.title}</h4>
                    {v.genre && <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mt-0.5">{v.genre}</p>}
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* Featured Characters */}
        {featuredCharacters.length > 0 && (
          <section>
            <SectionHeader label="IP & Worlds" title="Featured Characters" accent="#FFB68D" />
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-4">
              {featuredCharacters.map(char => (
                <div key={char.id} className="w-44 flex-shrink-0">
                  <div className="aspect-[3/4] rounded-2xl overflow-hidden bg-white/5 border border-white/8 mb-3 relative">
                    <img
                      src={thumb(char.imageUrl, THUMB.card) || `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=2A2040&color=D0BCFF&size=400`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      alt={char.name}
                      onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(char.name)}&background=2A2040&color=D0BCFF`; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    {char.actorName && (
                      <div className="absolute bottom-2 inset-x-2">
                        <p className="text-[8px] text-[#FFB68D] font-black uppercase tracking-wider truncate">{char.actorName}</p>
                      </div>
                    )}
                  </div>
                  <h4 className="text-sm font-black text-white uppercase tracking-tight leading-tight">{char.name}</h4>
                  {char.bio && (
                    <p className="text-[10px] text-white/40 mt-1 line-clamp-2 leading-relaxed">{char.bio}</p>
                  )}
                  {char.role && (
                    <p className="text-[9px] text-[#D0BCFF]/60 font-black uppercase tracking-widest mt-1.5">{char.role}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trending Now */}
        {trendingContent.length > 0 && (
          <section>
            <SectionHeader label="Popular Right Now" title="Trending" accent="#D0BCFF" />
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
              {trendingContent.map((v, i) => (
                <PosterCard
                  key={(v as any).identifier || (v as any).id || i}
                  title={v.title}
                  subtitle={(v as any).year || (v as any).genre}
                  image={(v as any).thumbnailUrl || (v as any).coverImage}
                  genre={(v as any).genre}
                  onPlay={() => {
                    if ((v as any)._isPlatform) onSelectMovie((v as any)._original);
                    else if ((v as any).identifier) onSelectArchiveItem(v as ArchiveVideo);
                    else onSelectMovie(v);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Critically Acclaimed */}
        {acclaimed.length > 0 && (
          <section>
            <SectionHeader label="Must Watch" title="Critically Acclaimed" accent="#FFB68D" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {acclaimed.slice(0, 8).map(m => (
                <motion.div
                  key={m.identifier}
                  whileHover={{ y: -4, scale: 1.01 }}
                  onClick={() => onSelectArchiveItem(m)}
                  className="group cursor-pointer relative aspect-video rounded-xl overflow-hidden bg-white/5 border border-white/8 hover:border-white/20 transition-all"
                >
                  {m.thumbnailUrl && (
                    <img src={thumb(m.thumbnailUrl, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(m.thumbnailUrl)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-600" alt={m.title} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-white/15 border border-white/30 flex items-center justify-center">
                      <Play fill="white" size={16} className="ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <p className="text-xs font-black text-white truncate">{m.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Star fill="currentColor" size={10} className="text-[#D0BCFF]" />
                      <p className="text-[9px] text-white/40 font-black uppercase">{m.year} · {m.genre}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Beloved by Users */}
        {belovedByUsers.length > 0 && (
          <section>
            <SectionHeader label="Highly Rated" title="Beloved by Users" accent="#D0BCFF" />
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
              {belovedByUsers.map(v => (
                <PosterCard
                  key={v.identifier || v.id}
                  title={v.title}
                  subtitle={(v as any).genre || 'Platform'}
                  image={v.thumbnailUrl || v.coverImage}
                  genre={v.genre}
                  previewItem={(v as any)._original || v}
                  onPlay={() => onSelectMovie((v as any)._original || v)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Film Clubs */}
        {filmClubs.length > 0 && (
          <section>
            <SectionHeader label="Fan Communities" title="Film Clubs" accent="#D0BCFF" />
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
              {filmClubs.map(club => (
                <motion.div
                  key={club.id}
                  whileHover={{ y: -4, scale: 1.02 }}
                  className="w-52 flex-shrink-0 group cursor-pointer"
                >
                  <div className="aspect-[3/2] rounded-2xl overflow-hidden bg-white/5 border border-white/8 group-hover:border-[#D0BCFF]/40 transition-all relative mb-3">
                    {club.coverImage ? (
                      <img src={thumb(club.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.coverImage)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={club.name} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2A2040] to-[#131314]">
                        <Users size={28} className="text-white/20" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-3 right-3 flex items-center gap-2">
                      {club.iconImage && (
                        <div className="w-6 h-6 rounded-lg overflow-hidden bg-white/10 shrink-0 border border-white/10">
                          <img src={thumb(club.iconImage, THUMB.micro) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.iconImage)} className="w-full h-full object-cover" alt="" />
                        </div>
                      )}
                      <p className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF] truncate">{club.memberCount || 0} members</p>
                    </div>
                  </div>
                  <h4 className="text-[10px] font-black uppercase tracking-tight truncate text-white/70 group-hover:text-white transition-colors">{club.name}</h4>
                  {club.description && (
                    <p className="text-[8px] text-white/30 mt-0.5 line-clamp-2 leading-relaxed">{club.description}</p>
                  )}
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Curated Collections */}
        {curatedPlaylists.length > 0 && (
          <section>
            <SectionHeader label="Staff Picks" title="Curated Collections" accent="#FFB68D" />
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-4">
              {curatedPlaylists.map(pl => (
                <motion.div
                  key={pl.id}
                  whileHover={{ scale: 1.02 }}
                  className="w-64 flex-shrink-0 group relative rounded-2xl overflow-hidden bg-white/5 border border-white/8 hover:border-white/20 transition-all cursor-pointer aspect-video"
                  onClick={() => onSelectCuratedPlaylist(pl)}
                >
                  {pl.thumbnailUrl && (
                    <img src={thumb(pl.thumbnailUrl, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(pl.thumbnailUrl)} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={pl.title} />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/15 border border-white/30 flex items-center justify-center">
                      <Play fill="white" size={20} className="ml-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-0 inset-x-0 p-4">
                    <h4 className="font-black text-sm uppercase tracking-tight text-white line-clamp-1">{pl.title}</h4>
                    <p className="text-[9px] text-white/40 font-black uppercase tracking-widest mt-0.5">{pl.videoIds?.length || 0} Videos</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Genre Rails — Archive.org content */}
        {genreCollections.map(({ genre, items }) => {
          const GenreIcon = GENRE_ICONS[genre] ?? Film;
          return (
            <section key={genre}>
              <div className="flex items-end justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <GenreIcon size={15} className="text-[#D0BCFF]" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-0.5">Public Domain</p>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-white">{genre}</h3>
                  </div>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 border border-white/10 px-2 py-0.5 rounded-lg">Archive.org</span>
              </div>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4">
                {items.map(item => (
                  <PosterCard
                    key={item.identifier}
                    title={item.title}
                    subtitle={`${item.year || 'Classic'} · ${item.genre}`}
                    image={item.thumbnailUrl}
                    genre={item.genre}
                    onPlay={() => onSelectArchiveItem(item)}
                  />
                ))}
              </div>
            </section>
          );
        })}

      </div>
    </div>
  );
};

// ── HiveView ───────────────────────────────────────────────────────────────────
const HiveView: React.FC<{
  universes: Universe[];
  setCurrentSubView: (view: SubView) => void;
  setActiveAllyUrl: (url: string | null) => void;
}> = ({ universes, setCurrentSubView, setActiveAllyUrl }) => {
  const partnerUniverses = universes.filter(u => u.type === 'ALLY');
  return (
    <main className="pt-8 pb-40 px-4 sm:px-6 md:px-12 container mx-auto">
      <div className="mb-6 sm:mb-12">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-3">Streaming Partners</p>
        <h2 className="text-3xl sm:text-5xl md:text-7xl font-black leading-[0.9] uppercase tracking-tight text-white">
          Discovery Partner<br />
          <span className="text-[#D0BCFF]">Ecosystems</span>
        </h2>
        <p className="mt-5 text-white/45 max-w-lg text-sm leading-relaxed">
          Step outside the platform and explore our partner streaming worlds — curated gateways to independent and mainstream content.
        </p>
      </div>

      {partnerUniverses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
          {partnerUniverses.map(u => (
            <motion.div
              key={u.id}
              whileHover={{ scale: 1.02, y: -4 }}
              className="group cursor-pointer bg-white/4 border border-white/8 hover:border-[#D0BCFF]/30 rounded-2xl p-4 sm:p-8 flex items-center gap-4 sm:gap-6 transition-all duration-400"
              onClick={() => { setActiveAllyUrl(u.url || null); setCurrentSubView('ALLY_VIEW'); }}
            >
              <div className="w-14 h-14 rounded-2xl bg-[#D0BCFF]/10 flex items-center justify-center shrink-0 group-hover:bg-[#D0BCFF]/20 transition-all">
                <ExploreIcon className="text-[#D0BCFF]" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-lg uppercase tracking-tight text-white group-hover:text-[#D0BCFF] transition-colors">{u.name}</h3>
                <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mt-1">Partner Ecosystem</p>
              </div>
              <ChevronRight size={17} className="text-white/20 group-hover:text-[#D0BCFF] group-hover:translate-x-1 transition-all" />
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="py-24 text-center border-2 border-dashed border-white/5 rounded-3xl max-w-lg">
          <Globe className="text-white/10 mx-auto mb-4" size={48} />
          <p className="text-white/20 font-black text-xl uppercase tracking-widest">No partner ecosystems configured yet.</p>
        </div>
      )}
    </main>
  );
};

// ── LibraryView ────────────────────────────────────────────────────────────────
const LibraryView: React.FC<{
  movies: ArchiveVideo[];
  localContent: Album[];
  onSelectArchiveItem: (item: ArchiveVideo) => void;
  onSelectMovie: (item: any) => void;
}> = ({ movies, localContent, onSelectArchiveItem, onSelectMovie }) => (
  <div className="pt-4 pb-40 px-4 sm:px-6 md:px-12 container mx-auto">
    <div className="mb-10 pt-8">
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-3">Your Collection</p>
      <h2 className="text-5xl md:text-7xl font-black leading-[0.9] uppercase tracking-tight text-white">
        My <span className="text-[#D0BCFF]">Library</span>
      </h2>
      <p className="mt-4 text-white/40 max-w-lg text-sm leading-relaxed">
        Your private movie & TV locker, plus content you own or purchased on your account.
      </p>
    </div>

    {/* Plex-style private locker — upload & stream your own movie/TV collection */}
    <PersonalVideoLocker onPlay={onSelectMovie} />

    {localContent.filter(c => c.type === 'VIDEO').length > 0 && (
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 mt-12 mb-4">On your account</p>
    )}
    {localContent.filter(c => c.type === 'VIDEO').length > 0 && (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {localContent.filter(c => c.type === 'VIDEO').map(video => (
          <motion.div
            key={video.id}
            whileHover={{ scale: 1.02 }}
            className="group relative aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/8 hover:border-[#D0BCFF]/30 transition-all cursor-pointer"
            onClick={() => onSelectMovie(video)}
          >
            <img src={thumb(video.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(video.coverImage)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={video.title} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-0 p-4 w-full">
              <h4 className="text-sm font-black truncate uppercase tracking-tight">{video.title}</h4>
              <p className="text-[10px] text-white/50 uppercase tracking-widest mt-1">{video.artist}</p>
            </div>
          </motion.div>
        ))}
      </div>
    )}
  </div>
);

// ── FilmClubsView ──────────────────────────────────────────────────────────────
// A simple browse listing of film clubs. Reuses the clubs fetched by loadContent
// via fetchPublicClubs('Film') — no new backend imports.
const FilmClubsView: React.FC<{
  clubs: Club[];
  loading: boolean;
}> = ({ clubs, loading }) => (
  <div className="pt-4 pb-40 px-4 sm:px-6 md:px-12 container mx-auto">
    <div className="mb-8 pt-8">
      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-3">Fan Communities</p>
      <h2 className="text-5xl md:text-7xl font-black leading-[0.9] uppercase tracking-tight text-white">
        Film <span className="text-[#D0BCFF]">Clubs</span>
      </h2>
      <p className="mt-4 text-white/40 max-w-lg text-sm leading-relaxed">
        Join a community around the films, genres, and eras you love — watch parties, weekly picks, and discussion.
      </p>
    </div>

    {loading ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="rounded-2xl overflow-hidden bg-white/[0.03] border border-white/8">
            <div className="aspect-[3/2] bg-white/5 animate-pulse" />
            <div className="p-4 space-y-2">
              <div className="h-3 w-2/3 bg-white/5 rounded-full animate-pulse" />
              <div className="h-2 w-full bg-white/5 rounded-full animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    ) : clubs.length > 0 ? (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {clubs.map(club => (
          <motion.div
            key={club.id}
            whileHover={{ y: -4, scale: 1.01 }}
            className="group cursor-pointer rounded-2xl overflow-hidden bg-white/[0.03] border border-white/8 hover:border-[#D0BCFF]/40 transition-all"
          >
            <div className="aspect-[3/2] relative overflow-hidden">
              {club.coverImage ? (
                <img src={thumb(club.coverImage, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.coverImage)} className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity" alt={club.name} />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#2A2040] to-[#131314]">
                  <Users size={32} className="text-white/15" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
              <div className="absolute bottom-3 left-4 right-4 flex items-center gap-2">
                {club.iconImage && (
                  <div className="w-7 h-7 rounded-lg overflow-hidden bg-white/10 shrink-0 border border-white/10">
                    <img src={thumb(club.iconImage, THUMB.micro) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.iconImage)} className="w-full h-full object-cover" alt="" />
                  </div>
                )}
                <p className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF]">{club.memberCount || 0} members</p>
              </div>
            </div>
            <div className="p-4">
              <h4 className="text-sm font-black uppercase tracking-tight text-white group-hover:text-[#D0BCFF] transition-colors truncate">{club.name}</h4>
              {club.description && (
                <p className="text-[11px] text-white/40 mt-1.5 line-clamp-2 leading-relaxed">{club.description}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    ) : (
      <div className="py-24 text-center border-2 border-dashed border-white/8 rounded-3xl max-w-lg">
        <Users className="text-white/10 mx-auto mb-4" size={48} />
        <p className="text-white/30 font-black text-lg uppercase tracking-widest mb-2">No film clubs yet</p>
        <p className="text-white/20 text-xs uppercase tracking-widest">Clubs are created from a film's page — open a film and start one.</p>
      </div>
    )}
  </div>
);

// ── MoviesTVView ───────────────────────────────────────────────────────────────
const MoviesTVView: React.FC<MoviesTVViewProps> = ({ onBack, onSelectMovie, onNavigate }) => {
  const [movies, setMovies] = useState<ArchiveVideo[]>([]);
  const [tvSeries, setTvSeries] = useState<ArchiveVideo[]>([]);
  const [genreCollections, setGenreCollections] = useState<GenreCollection[]>([]);
  const [curatedPlaylists, setCuratedPlaylists] = useState<VideoPlaylist[]>([]);
  const [localContent, setLocalContent] = useState<Album[]>([]);
  const [platformVideos, setPlatformVideos] = useState<Video[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [worlds, setWorlds] = useState<IPWorld[]>([]);
  const [featuredCharacters, setFeaturedCharacters] = useState<Character[]>([]);
  const [activeAllyUrl, setActiveAllyUrl] = useState<string | null>(null);
  const [featuredItem, setFeaturedItem] = useState<ArchiveVideo | Album | null>(null);
  const [filmClubs, setFilmClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [currentSubView, setCurrentSubView] = useState<SubView>('HOME');
  const [activePlaylistItem, setActivePlaylistItem] = useState<any | null>(null);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { setTheme } = useGlobalPlayerState();

  const adaptedPlatformVideos = useMemo(() => platformVideos.map(v => ({
    identifier: v.id,
    title: v.title,
    genre: v.genre || '',
    thumbnailUrl: (v as any).muxPlaybackId
      ? `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=400&height=600&time=5`
      : (v as any).thumbnailUrl || (v as any).coverImageUrl || '',
    coverImage: (v as any).coverImageUrl || (v as any).thumbnailUrl || '',
    description: (v as any).description || '',
    year: v.timestamp ? new Date(v.timestamp).getFullYear().toString() : '',
    ownerName: (v as any).ownerName || '',
    _isPlatform: true as const,
    _original: v,
  })), [platformVideos]);

  const searchResults = useMemo<any[]>(() => {
    if (searchQuery.trim().length < 2) return [];
    const q = searchQuery.toLowerCase();
    const archiveItems = [
      ...movies, ...tvSeries, ...genreCollections.flatMap(g => g.items ?? []),
    ].filter(Boolean).filter((item, idx, self) => self.findIndex(i => i.identifier === item.identifier) === idx);
    const combined = [...archiveItems, ...adaptedPlatformVideos];
    return combined.filter(item => {
      const title = String(Array.isArray(item.title) ? item.title[0] : item.title || '').toLowerCase();
      const genre = String(Array.isArray(item.genre) ? item.genre[0] : item.genre || '').toLowerCase();
      return title.includes(q) || genre.includes(q);
    }).slice(0, 36);
  }, [searchQuery, movies, tvSeries, genreCollections, adaptedPlatformVideos]);

  useEffect(() => {
    setTheme('DARK');
    loadContent();
    return () => setTheme('DARK');
  }, []);

  const TALEO_GENRES = ['Movie', 'Short Film', 'TV Series', 'Short', 'Teaser', 'Trailer', 'Feature Film'];

  const loadContent = async () => {
    try {
      setIsLoading(true);
      // Phase 1: fast Firestore calls — unblock the page immediately
      const [all, unis, settings, allPlatformVideos] = await Promise.all([
        fetchAllPublicAlbums(),
        fetchUniverses(),
        fetchSystemSettingsConfig(),
        fetchAllVideos(),
      ]);

      const cinemaVideos = allPlatformVideos.filter(v => v.genre && TALEO_GENRES.includes(v.genre));
      setPlatformVideos(cinemaVideos);
      setLocalContent(all.filter(a => a.type === 'VIDEO'));
      setUniverses(unis);

      if (settings?.curatedVideoPlaylists?.length > 0) {
        fetchVideoPlaylistsByIds(settings.curatedVideoPlaylists)
          .then(curPls => setCuratedPlaylists(curPls))
          .catch(() => {});
      }

      fetchPublicClubs('Film')
        .then(clubs => setFilmClubs(clubs.slice(0, 8)))
        .catch(() => {});

      // Fetch characters — non-blocking
      const worldIds = [...new Set(
        cinemaVideos.filter(v => (v as any).worldId).map(v => (v as any).worldId as string)
      )].slice(0, 4);
      if (worldIds.length > 0) {
        Promise.all(worldIds.map(id => fetchWorldCharacters(id)))
          .then(charArrays => setFeaturedCharacters(charArrays.flat().filter(c => c.imageUrl).slice(0, 12)))
          .catch(() => {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }

    // Phase 2: slow Archive.org + public worlds — load in background
    try {
      const [allGenres, publicWorlds] = await Promise.all([
        fetchArchiveByAllGenres(15),
        fetchAllPublicWorlds(),
      ]);
      const featureGenre = allGenres.find(g => g.genre === 'Feature Films');
      const tvGenre = allGenres.find(g => g.genre === 'Classic TV');
      setGenreCollections(allGenres);
      setMovies(featureGenre?.items ?? []);
      setTvSeries(tvGenre?.items ?? []);
      setWorlds(publicWorlds);
      const featureItems = featureGenre?.items ?? [];
      if (featureItems.length > 0) setFeaturedItem(prev => prev ?? featureItems[0]);
    } catch (err) {
      console.error('[Taleo] Archive fetch failed:', err);
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleSelectCuratedPlaylist = (pl: VideoPlaylist) => {
    setActivePlaylistItem({
      id: pl.id, ownerId: pl.ownerId, title: pl.title, artist: 'Staff Curated',
      description: pl.description, coverImage: pl.thumbnailUrl || '', thumbnailUrl: pl.thumbnailUrl || '',
      type: 'VIDEO', subType: 'TV_SERIES',
      seasons: [{ seasonNumber: 1, episodes: (pl.videos || []).map((v: any, i: number) => ({
        id: v.id, title: v.title, description: v.description || '', episodeNumber: i + 1, url: v.url, thumbnailUrl: v.thumbnail || pl.thumbnailUrl
      })) }],
      createdAt: pl.timestamp, isPublic: pl.isPublic,
    });
    setCurrentSubView('TV');
  };

  const handleSelectArchiveItem = async (item: ArchiveVideo) => {
    const files = await getArchiveItemFiles(item.identifier);
    const videoUrl = getBestVideoUrl(item.identifier, files);
    if (videoUrl) syncPublicDomainAsset(item, videoUrl, 'VIDEO');

    const transformed: Album = {
      id: item.identifier, title: item.title,
      artist: item.genre || 'Classic Cinema',
      coverImage: item.thumbnailUrl || '', headerImage: item.thumbnailUrl,
      description: item.description, type: 'VIDEO', subType: 'MOVIE',
      ownerId: 'internet-archive', createdAt: parseInt(item.year || '0'),
      themeColor: '#000000',
      tracks: videoUrl ? [{ id: item.identifier, title: item.title, artist: item.genre || 'Classic Cinema', url: videoUrl, albumCover: item.thumbnailUrl || '' }] : [],
      customVideoUrl: videoUrl || undefined,
    };
    onSelectMovie(transformed);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#131314]">
        {/* Tab nav stays visible so it feels interactive */}
        <TaleoTabNav currentSubView="HOME" setCurrentSubView={() => {}} onNavigate={onNavigate} />
        {/* Hero skeleton */}
        <div className="h-[80vh] bg-gradient-to-br from-[#1C1B2E] to-[#131314] animate-pulse" />
        {/* Section skeletons */}
        <div className="px-4 sm:px-6 md:px-12 py-10 space-y-10">
          {[1, 2, 3].map(i => (
            <div key={i} className="space-y-4">
              <div className="h-3 w-40 bg-white/5 rounded-full animate-pulse" />
              <div className="flex gap-4">
                {[1,2,3,4,5].map(j => (
                  <div key={j} className="w-36 flex-shrink-0">
                    <div className="aspect-[2/3] rounded-xl bg-white/5 animate-pulse" />
                    <div className="h-2 mt-2 bg-white/5 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const tabNavEl = (
    <TaleoTabNav
      currentSubView={currentSubView}
      setCurrentSubView={setCurrentSubView}
      onNavigate={onNavigate}
    />
  );

  return (
    <div className="min-h-screen bg-[#131314] text-white overflow-x-hidden pb-32">
      {/* Top header */}
      <header className="fixed top-0 w-full z-50 flex items-center px-4 h-16 bg-[#131314]/90 backdrop-blur-xl border-b border-white/5 gap-3">
        {showSearch ? (
          <>
            <button
              className="text-white/50 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5 shrink-0"
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
            >
              <ChevronLeft size={22} />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 focus-within:border-white/25 rounded-xl px-3 py-2 transition-all">
              <Search size={15} className="text-white/30 shrink-0" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search movies, shows, genres…"
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder-white/30 font-bold"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-white/30 hover:text-white transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <button className="text-white/60 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5 shrink-0" onClick={onBack}>
              <ChevronLeft size={22} />
            </button>
            <span className="flex-1 text-sm font-black uppercase tracking-[0.3em] text-white/80">Taleo</span>
            <button className="text-white/60 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5" onClick={() => setShowSearch(true)}>
              <Search size={20} />
            </button>
          </>
        )}
      </header>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-16 z-40 bg-[#131314] overflow-y-auto pb-40"
          >
            {searchQuery.trim().length < 2 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <Search size={40} className="text-white/10" />
                <p className="text-[11px] font-black uppercase tracking-widest text-white/20">Type to search films, shows, genres</p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <Film size={40} className="text-white/10" />
                <p className="text-sm font-black uppercase tracking-widest text-white/20">No results for "{searchQuery}"</p>
              </div>
            ) : (
              <div className="px-4 sm:px-6 md:px-12 pt-8">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-6">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {searchResults.map(item => (
                    <motion.div
                      key={item.identifier || (item as any).id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ y: -4 }}
                      className="group cursor-pointer"
                      onClick={() => {
                        if ((item as any)._isPlatform) onSelectMovie((item as any)._original);
                        else handleSelectArchiveItem(item);
                        setShowSearch(false);
                        setSearchQuery('');
                      }}
                    >
                      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-white/5 border border-white/8 group-hover:border-white/20 transition-all relative">
                        {item.thumbnailUrl ? (
                          <img src={thumb(item.thumbnailUrl, THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(item.thumbnailUrl)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={item.title} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film size={32} className="text-white/10" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm">
                            <Play fill="white" size={16} className="ml-0.5" />
                          </div>
                        </div>
                        {item.genre && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded-md">
                            <span className="text-[7px] font-black uppercase tracking-widest text-white/50">{item.genre}</span>
                          </div>
                        )}
                      </div>
                      <h4 className="mt-2 text-[10px] font-black uppercase tracking-tight truncate text-white/70 group-hover:text-white transition-colors">{item.title}</h4>
                      <p className="text-[8px] text-white/30 font-bold uppercase tracking-widest mt-0.5">{item.year || 'Classic'}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentSubView}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.45 }}
        >
          {currentSubView === 'HOME' && (
            <>
              <HomeView
                universes={universes}
                movies={movies}
                tvSeries={tvSeries}
                genreCollections={archiveLoading ? [] : genreCollections}
                curatedPlaylists={curatedPlaylists}
                featuredItem={featuredItem}
                onSelectArchiveItem={handleSelectArchiveItem}
                onSelectMovie={onSelectMovie}
                setCurrentSubView={setCurrentSubView}
                setActiveAllyUrl={setActiveAllyUrl}
                onSelectCuratedPlaylist={handleSelectCuratedPlaylist}
                tabNav={tabNavEl}
                onRequestSignIn={action => setSignInAction(action)}
                platformVideos={adaptedPlatformVideos}
                worlds={worlds}
                featuredCharacters={featuredCharacters}
                filmClubs={filmClubs}
                onNavigate={onNavigate}
              />
              {archiveLoading && (
                <div className="px-4 sm:px-6 md:px-12 py-8 space-y-8">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="space-y-3">
                      <div className="h-2.5 w-32 bg-white/5 rounded-full animate-pulse" />
                      <div className="flex gap-4 overflow-hidden">
                        {[1, 2, 3, 4, 5].map(j => (
                          <div key={j} className="w-36 flex-shrink-0">
                            <div className="aspect-[2/3] rounded-xl bg-white/[0.04] animate-pulse" />
                            <div className="h-2 mt-2 w-24 bg-white/[0.04] rounded animate-pulse" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {currentSubView === 'TV' && (
            <div className="pt-16">
              {tabNavEl}
              <TelevisionView
                series={[...tvSeries, ...localContent.filter(c => c.subType === 'TV_SERIES' || c.tags?.includes('tv'))]}
                initialSelectedSeries={activePlaylistItem}
                onSelect={onSelectMovie}
              />
            </div>
          )}
          {currentSubView === 'MOVIES' && (
            <div className="pt-16">
              {tabNavEl}
              <MoviesSpecificView movies={movies} localContent={localContent} onSelect={onSelectMovie} />
            </div>
          )}
          {currentSubView === 'UNIVERSE' && (
            <div className="pt-16">
              {tabNavEl}
              <HiveView universes={universes} setCurrentSubView={setCurrentSubView} setActiveAllyUrl={setActiveAllyUrl} />
            </div>
          )}
          {currentSubView === 'HIVE' && (
            <div className="pt-16">
              {tabNavEl}
              <ExploreView movies={movies} tvSeries={tvSeries} localContent={localContent} onSelect={onSelectMovie} />
            </div>
          )}
          {currentSubView === 'LIBRARY' && (
            <div className="pt-16">
              {tabNavEl}
              <LibraryView movies={movies} localContent={localContent} onSelectArchiveItem={handleSelectArchiveItem} onSelectMovie={onSelectMovie} />
            </div>
          )}
          {currentSubView === 'MUSEUM' && (
            <div className="pt-16">
              {tabNavEl}
              <TaleoFilmMuseum onBack={() => setCurrentSubView('HOME')} />
            </div>
          )}
          {currentSubView === 'CLUBS' && (
            <div className="pt-16">
              {tabNavEl}
              <FilmClubsView clubs={filmClubs} loading={isLoading} />
            </div>
          )}
          {currentSubView === 'ALLY_VIEW' && activeAllyUrl && (
            <div className="pt-16 h-screen w-full">
              {tabNavEl}
              <iframe src={activeAllyUrl} className="w-full h-[calc(100vh-8rem)] border-none" />
              <div className="fixed top-32 left-8 flex gap-4 z-50">
                <button className="bg-white text-black px-4 py-2 rounded-full font-bold text-sm" onClick={() => setCurrentSubView('HOME')}>← Back</button>
                <a href={activeAllyUrl} target="_blank" rel="noopener noreferrer" className="bg-[#D0BCFF]/20 text-white px-4 py-2 rounded-full font-bold backdrop-blur-sm text-sm">Open in New Tab</a>
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
