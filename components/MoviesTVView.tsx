import React, { useState, useEffect, useMemo } from 'react';
import { requestAutoplay } from '../services/filmAutoplay';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, Info, ChevronRight, ChevronLeft, Star,
  Plus, Share2, Users, Rocket, UserPlus,
  BookOpen, Moon, CloudLightning, Ghost, Zap, Sparkles,
  Calendar, Film, Bookmark, Settings, Search, Menu, Globe,
  Monitor, Shield, Bell, CreditCard, Home, Map as ExploreIcon,
  Library, User as PersonIcon, TrendingUp, History, Maximize2,
  MoreHorizontal, X, Check, Flame, Shuffle,
} from 'lucide-react';
import { Album, Video, Universe, VideoPlaylist, IPWorld, Character } from '../types';
import { getPlatformInfo } from '../hooks/usePlatform';
import {
  fetchAllPublicAlbums, fetchUniverses, syncPublicDomainAsset,
  fetchSystemSettingsConfig, fetchVideoPlaylistsByIds, fetchAllVideos, auth,
  fetchAllPublicWorlds, fetchWorldCharacters,
  addToWatchlist, removeFromWatchlist, fetchWatchlist, WatchlistItem, fetchProjectFromCloud,
  createPost, loginWithGoogle,
} from '../services/backendService';
import SignInPrompt from './SignInPrompt';
import {
  fetchArchiveVideos, fetchArchiveByAllGenres, GenreCollection, ArchiveVideo,
  getArchiveItemFiles, getBestVideoUrl, CURATED_EUROPEANA_FILMS, CURATED_KOFA_FILMS,
  CURATED_HALLOWEEN_FILMS, CURATED_INTERNATIONAL_FILMS, CURATED_US_CLASSIC_FILMS,
  CURATED_DIRECTOR_VAULT_FILMS, CURATED_ANIME_AND_ANIMATION_FILMS, CURATED_PUBLIC_DOMAIN_TV_SERIES, ALL_CURATED_ARCHIVE_FILMS,
  HALLOWEEN_CURATED_SECTIONS, HALLOWEEN_DOUBLE_FEATURES,
  PUMPKIN_PATCH_HERO_ALBUM, archiveVideoToAlbum, fetchArchiveVideoById,
} from '../services/archiveContentService';
import {
  hydrateSelfHostedFilmsFromServer,
  ensureFilmNativelyOnPlatform,
} from '../services/selfHostedFilms';
import { isPeerTubeItem, resolvePeerTubeVideo, peerTubeVideoToAlbum } from '../services/peertubeService';
import { TelevisionView } from './TelevisionView';
import { ExploreView } from './ExploreView';
import { MoviesSpecificView } from './MoviesSpecificView';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import ScrollableTabRow from './ScrollableTabRow';
import ChipRail from './ui/ChipRail';
import PlajahPlusBanner from './PlajahPlusBanner';
import { fetchPublicClubs, fetchVideoById } from '../services/backendService';
import HoverPreviewThumb, { previewSourceFor } from './HoverPreviewThumb';
import { getContinueWatching, removeEntry, WatchEntry } from '../services/watchHistoryService';
import { shareAsset, buildShareUrl } from '../services/deepLinkService';
import ShareButton from './ShareButton';
import PersonalVideoLocker from './PersonalVideoLocker';
import type { Club } from '../types';
import TaleoFilmMuseum from './TaleoFilmMuseum';
import TaleoUniverseBrowser from './TaleoUniverseBrowser';
import TaleoFilmCurator from './TaleoFilmCurator';
import { Landmark } from 'lucide-react';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { coverGridSrc } from '../services/imageDerivatives';
import {
  ClassicDirectorsShowcaseSection,
  ClassicDirectorDossierModal,
  HalloweenCurationStoryIntelSection,
  CharacterActorModal,
  EnrichedPortrait,
  findPlayableFilmById,
} from './taleo/ClassicCinemaDossier';
import { getDirectorProfile, type ClassicDirectorProfile } from '../data/classicDirectors';
import {
  getCharactersForFilm,
  getHalloweenStoryIntelBundle,
  type HalloweenCharacterWithActor,
} from '../data/halloweenStoryIntel';
import { HalloweenVaultChatAndFanRoom } from './taleo/HalloweenVaultChatAndFanRoom';
import { HauntedCastleExhibition } from './taleo/HauntedCastleExhibition';
import { RavencrestGameFrame } from './taleo/RavencrestGameFrame';

interface MoviesTVViewProps {
  onBack: () => void;
  onSelectMovie: (item: any) => void;
  onNavigate?: (view: 'WORLDS' | 'USER_PROFILE' | 'TALEO_HISTORY' | 'FILM_SCHOOL') => void;
}

type SubView = 'HOME' | 'HALLOWEEN' | 'HAUNTED_EXHIBIT' | 'MOVIES' | 'TV' | 'CURATOR' | 'MUSEUM' | 'CLUBS' | 'UNIVERSE' | 'LIBRARY' | 'HIVE' | 'MY_NEBULA' | 'ALLY_VIEW';

const TaleoTabNav: React.FC<{
  currentSubView: SubView;
  setCurrentSubView: (v: SubView) => void;
  onNavigate?: (view: 'WORLDS' | 'USER_PROFILE') => void;
}> = ({ currentSubView, setCurrentSubView, onNavigate }) => (
  // Platform Chip Rail treatment (components/ui/ChipRail — same rail as the
  // Global Archive + Chora). Explore/Profile are honest doors: they navigate
  // away, so they carry the ↗.
  <div className="sticky top-16 z-40 bg-[#131314]/90 backdrop-blur-xl border-b border-white/5 px-2 py-2 flex justify-center">
    <ChipRail
      items={[
        { id: 'HOME',            icon: <Home size={13} />,        label: 'Home'         },
        { id: 'HALLOWEEN',       icon: <Ghost size={13} className="text-orange-400" />, label: '🎃 Halloween Vault' },
        { id: 'HAUNTED_EXHIBIT', icon: <Flame size={13} className="text-amber-400" />,  label: '🏰 Haunted Crossroads' },
        { id: 'MOVIES',          icon: <Film size={13} />,        label: 'Movies'       },
        { id: 'TV',              icon: <Monitor size={13} />,     label: 'TV'           },
        { id: 'CURATOR',         icon: <Sparkles size={13} />,    label: 'Curator'      },
        { id: 'MUSEUM',          icon: <Landmark size={13} />,    label: 'Museum'       },
        { id: 'CLUBS',           icon: <Users size={13} />,       label: 'Clubs'        },
        { id: 'UNIVERSE',        icon: <Globe size={13} />,       label: 'Universe'     },
        { id: 'EXPLORE',         icon: <ExploreIcon size={13} />, label: 'Explore', door: true },
        { id: 'LIBRARY',         icon: <Library size={13} />,     label: 'Library'      },
        { id: 'PROFILE',         icon: <PersonIcon size={13} />,  label: 'Profile', door: true },
      ]}
      activeId={currentSubView === 'HIVE' ? 'EXPLORE' : currentSubView}
      onSelect={(id) => {
        if (id === 'EXPLORE')      onNavigate?.('WORLDS');
        else if (id === 'PROFILE') onNavigate?.('USER_PROFILE');
        else                       setCurrentSubView(id as SubView);
      }}
    />
  </div>
);

const GENRE_ICONS: Record<string, React.ComponentType<any>> = {
  '🎃 Halloween Cinema': Ghost,
  '🏯 Classic Japanese Anime & Global Animation': Rocket,
  '🌍 World Cinema Masterworks': Globe,
  '🕵️ Film Noir, Hitchcock & US Classics': Moon,
  '🎬 Director Dossier Vault': Film,
  '📺 Public Domain TV Series & Serials': Monitor,
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
  'European Cinema': Globe,
  'Korean Classic Cinema': Film,
  'European Newsreels & TV': Monitor,
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

// ── Content-rating badge ───────────────────────────────────────────────────────
// `contentRating` already exists on Video (G / PG / PG-13 / R / NC-17 / TV-MA …).
// Mature ratings are tinted so they read at a glance in a poster row.
const MATURE_RATINGS = new Set(['R', 'NC-17', 'TV-MA', 'TV-14', '18', '16']);

const RatingBadge: React.FC<{ rating: string }> = ({ rating }) => {
  const label = String(rating).trim().toUpperCase();
  if (!label) return null;
  const mature = MATURE_RATINGS.has(label);
  return (
    <span
      title={`Content rating: ${label}`}
      className={`px-1.5 py-0.5 rounded-md backdrop-blur-sm border text-[7px] font-black uppercase tracking-widest ${
        mature
          ? 'bg-rose-950/70 border-rose-400/40 text-rose-200'
          : 'bg-black/60 border-white/15 text-white/60'
      }`}
    >
      {label}
    </span>
  );
};

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
  /** Content rating (G / PG-13 / R / TV-MA …). Rendered as a corner badge when present. */
  rating?: string;
  directorName?: string;
  filmId?: string;
  onSelectDirector?: (director: ClassicDirectorProfile) => void;
}> = ({
  title,
  subtitle,
  image,
  genre,
  onPlay,
  width = 'w-36 flex-shrink-0',
  accentBorder,
  previewItem,
  rating,
  directorName,
  filmId,
  onSelectDirector,
}) => {
  const preview = previewItem ? previewSourceFor(previewItem) : null;
  const badge = rating ? <RatingBadge rating={rating} /> : null;
  const directorProfile = useMemo(
    () => (directorName || filmId ? getDirectorProfile(directorName, filmId) : undefined),
    [directorName, filmId]
  );
  const hasStoryIntel = useMemo(
    () => (filmId ? !!getHalloweenStoryIntelBundle(filmId) : false),
    [filmId]
  );

  const directorChip = directorProfile ? (
    <div
      onClick={(ev) => {
        if (onSelectDirector) {
          ev.stopPropagation();
          onSelectDirector(directorProfile);
        }
      }}
      title={`${directorProfile.name} (${directorProfile.lifespan}) — Click for Director Biography & ${directorProfile.filmography.length}-Film Filmography`}
      className="mt-1.5 flex items-center gap-1.5 p-1 rounded-lg bg-white/[0.04] hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/40 transition cursor-pointer"
    >
      <EnrichedPortrait
        name={directorProfile.name}
        wikiSlug={directorProfile.wikiSlug}
        fallbackUrl={directorProfile.portraitUrl}
        className="w-5 h-5 rounded-full ring-1 ring-amber-400/50"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-black text-amber-300 truncate leading-tight">
          {directorProfile.name}
        </p>
        <p className="text-[7px] text-white/45 truncate leading-tight">
          Bio · {directorProfile.filmography.length} Films →
        </p>
      </div>
    </div>
  ) : null;

  if (preview) {
    return (
      <div className={`${width} relative`}>
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
        {badge && <div className="absolute top-2 right-2 pointer-events-none">{badge}</div>}
        {directorChip}
      </div>
    );
  }
  return (
    <motion.div whileHover={{ y: -5 }} onClick={onPlay} className={`group cursor-pointer ${width}`}>
      <div className={`aspect-[2/3] rounded-xl overflow-hidden bg-white/5 relative border transition-all duration-300 ${accentBorder ? 'border-[#D0BCFF]/20 group-hover:border-[#D0BCFF]/50' : 'border-white/8 group-hover:border-white/20'}`}>
        {image ? (
          <img src={thumb(image, THUMB.card) || undefined} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={onThumbError(image)} className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-all duration-500" alt={title} />
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
        {hasStoryIntel && (
          <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-orange-500/85 backdrop-blur-sm rounded text-[6.5px] font-black uppercase tracking-widest text-black shadow">
            Story Intel + Cast
          </div>
        )}
        {badge && <div className="absolute top-2 right-2">{badge}</div>}
      </div>
      <h4 className="mt-2 text-[10px] font-black uppercase tracking-tight truncate text-white/70 group-hover:text-white transition-colors">{title}</h4>
      {subtitle && <p className="text-[8px] text-white/30 font-black uppercase tracking-widest mt-0.5 truncate">{subtitle}</p>}
      {directorChip}
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
  localContent?: Album[];
  worlds?: IPWorld[];
  featuredCharacters?: Character[];
  filmClubs?: Club[];
  onNavigate?: (view: string) => void;
  watchlist?: WatchlistItem[];
  onToggleWatchlist?: (item: any) => void;
  onShareToast?: (msg: string) => void;
}> = ({
  universes, movies, tvSeries, genreCollections, curatedPlaylists,
  featuredItem, onSelectArchiveItem, onSelectMovie, setCurrentSubView,
  setActiveAllyUrl, onSelectCuratedPlaylist, tabNav, onRequestSignIn,
  platformVideos = [], localContent = [], worlds = [], featuredCharacters = [], filmClubs = [],
  onNavigate, watchlist = [], onToggleWatchlist, onShareToast,
}) => {
  const [heroIdx, setHeroIdx] = useState(0);
  const [worldBannerIdx, setWorldBannerIdx] = useState(0);
  const [selectedDirector, setSelectedDirector] = useState<ClassicDirectorProfile | null>(null);

  const pumpkinPatchHero = useMemo(() => {
    const found = localContent.find(a => a.id === PUMPKIN_PATCH_HERO_ALBUM.id || /pumpkin\s*patch/i.test(a.title || ''));
    if (!found) return PUMPKIN_PATCH_HERO_ALBUM;
    return {
      ...PUMPKIN_PATCH_HERO_ALBUM,
      ...found,
      // Showcase art always features Pumpkin Patch, whatever the stored album header holds.
      coverImage: found.coverImage || PUMPKIN_PATCH_HERO_ALBUM.coverImage,
      headerImage: PUMPKIN_PATCH_HERO_ALBUM.headerImage,
      year: '2025',
      movieMetadata: {
        ...PUMPKIN_PATCH_HERO_ALBUM.movieMetadata,
        ...(found as any).movieMetadata,
        releaseYear: 2025,
      },
    };
  }, [localContent]);

  const handlePlayFilmById = (filmId: string) => {
    if (filmId === pumpkinPatchHero.id || filmId === 'album_1787881859314_mlt23') {
      onSelectMovie(pumpkinPatchHero);
      return;
    }
    const found = findPlayableFilmById(filmId);
    if (found) {
      if ((found as ArchiveVideo).identifier) {
        onSelectArchiveItem(found as ArchiveVideo);
      } else {
        onSelectMovie(found);
      }
    }
  };

  // Hero carousel: Pumpkin Patch Halloween Hero first, platform content, featured Halloween classics, then archive classics
  const heroItems = useMemo(() => {
    const restPlatform = platformVideos.filter(v => (v.id || v.identifier) !== pumpkinPatchHero.id).slice(0, 4);
    return [
      {
        ...pumpkinPatchHero,
        identifier: pumpkinPatchHero.id,
        thumbnailUrl: pumpkinPatchHero.headerImage || pumpkinPatchHero.coverImage,
        _isPlatform: true,
        _isHalloween: true,
        _original: pumpkinPatchHero,
      },
      ...restPlatform,
      ...CURATED_HALLOWEEN_FILMS.slice(0, 3).map(m => ({ ...m, _isArchive: true, _isHalloween: true })),
      ...movies.slice(0, 3).map(m => ({ ...m, _isArchive: true })),
    ];
  }, [platformVideos, movies, pumpkinPatchHero]);

  // Auto-advance hero every 6s
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const isTv = getPlatformInfo().isTV;
    const t = setInterval(() => {
      if (isTv && document.activeElement && document.activeElement !== document.body) return;
      setHeroIdx(i => (i + 1) % heroItems.length);
    }, isTv ? 15000 : 6000);
    return () => clearInterval(t);
  }, [heroItems.length]);

  // Auto-advance worlds banner every 5s
  useEffect(() => {
    if (worlds.length <= 1) return;
    const t = setInterval(() => setWorldBannerIdx(i => (i + 1) % Math.min(worlds.length, 8)), getPlatformInfo().isTV ? 14000 : 5000);
    return () => clearInterval(t);
  }, [worlds.length]);

  const hero = heroItems[heroIdx] || featuredItem;
  const heroId = hero ? ((hero as any).identifier || (hero as any).id || (hero as any)._original?.id || '') : '';
  const heroInWatchlist = useMemo(() => watchlist.some(w => w.id === heroId), [watchlist, heroId]);
  const heroImage = hero
    ? ((hero as any).thumbnailUrl || (hero as any).coverImage || (hero as any).coverImageUrl || (hero as any).headerImage
        || (hero as any).promoKit?.tvBillboardUrl || (hero as any).promoKit?.keyArtUrl || (hero as any).posterUrl
        || (hero as any)._original?.coverImage || (hero as any)._original?.thumbnailUrl || (hero as any)._original?.coverImageUrl)
    : null;
  const heroTitle = hero?.title || '';
  const heroDesc = ((hero as any)?.description || '').replace(/<[^>]*>?/gm, '').slice(0, 180);
  const heroGenre = (hero as any)?.genre || '';
  const heroIsplatform = !!(hero as any)?._isPlatform;
  const heroIsArchive = !!(hero as any)?._isArchive || !!(hero as any)?.identifier;
  const heroIsHalloween = !!(hero as any)?._isHalloween;

  const handleHeroPlay = () => {
    if (!hero) return;
    if (heroIsplatform) onSelectMovie((hero as any)._original);
    else if (heroIsArchive || (hero as any).identifier) onSelectArchiveItem(hero as ArchiveVideo);
    else onSelectMovie(hero);
  };

  const handleHeroShare = async () => {
    if (!hero) return;
    const id = (hero as any).identifier || (hero as any).id || (hero as any)._original?.id;
    if (!id) return;
    const isArch = !!(hero as any).identifier && !heroIsplatform;
    const res = await shareAsset(isArch ? 'archive' : 'movie', id, {
      title: `${heroTitle} | Plajah Cinema`,
      text: `Watch "${heroTitle}" on Plajah Cinema`,
    });
    if (res === 'copied') onShareToast?.(`Link to "${heroTitle}" copied!`);
  };

  const handleShareHalloweenCollection = async () => {
    const res = await shareAsset('taleoCollection', 'halloween', {
      title: 'Cinema Halloween — 31 Nights of Cinema Terror | Plajah',
      text: 'Stream 12 restored horror masterpieces — Night of the Living Dead, House on Haunted Hill, Carnival of Souls, Nosferatu & more — free on Plajah Cinema!',
    });
    if (res === 'copied') onShareToast?.('Halloween Showcase link copied to clipboard!');
  };

  const currentWorld = worlds[worldBannerIdx];

  // Section slices
  const _taleoAlbumIds = new Set(localContent.map((a: any) => a.id));
  const _standaloneVideos = platformVideos.filter((v: any) => {
    const id = v.id || '';
    if (!id.startsWith('sys_')) return true;
    for (const aid of _taleoAlbumIds) if (id.startsWith(`sys_${aid}_`)) return false;
    return true;
  });
  const _byNewest = [...localContent, ..._standaloneVideos]
    .sort((a: any, b: any) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
  const newToTaleo = _byNewest.slice(0, 12);
  const creatorFilms    = platformVideos;

  // "New This Week" editorial row (Blueprint 2E). Strictly the last 7 days; when nothing
  // landed this week the row hides rather than faking freshness.
  const newThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return _byNewest.filter((v: any) => (v.timestamp || v.createdAt || 0) >= cutoff).slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localContent, platformVideos]);

  // Continue Watching (resume) — Taleo watch progress.
  const [continueWatching, setContinueWatching] = useState<WatchEntry[]>([]);
  useEffect(() => { getContinueWatching('TALEO').then(setContinueWatching).catch(() => {}); }, []);
  const resumeItem = async (entry: WatchEntry) => {
    const cleanId = entry.id.replace(/-main$/, '');
    // 1. Check in-memory Curated / Archive movies first
    const archMatch = [
      ...ALL_CURATED_ARCHIVE_FILMS,
      ...movies,
      ...tvSeries,
    ].find(m => m.identifier === cleanId || m.identifier === entry.id);
    if (archMatch) {
      onSelectArchiveItem(archMatch);
      return;
    }
    // 2. Check localContent (creator albums) and platformVideos
    const localMatch = localContent.find(a => a.id === cleanId || a.id === entry.id);
    if (localMatch) {
      onSelectMovie(localMatch);
      return;
    }
    const platMatch = platformVideos.find(v => (v.identifier || v.id) === cleanId || (v.identifier || v.id) === entry.id);
    if (platMatch) {
      onSelectMovie(platMatch._original || platMatch);
      return;
    }
    // 3. Remote fallback: videos -> albums -> archive.org
    const v = await fetchVideoById(cleanId).catch(() => null);
    if (v) { onSelectMovie(v); return; }
    const alb = await fetchProjectFromCloud(cleanId).catch(() => null);
    if (alb) { onSelectMovie(alb); return; }
    const remoteArch = await fetchArchiveVideoById(cleanId).catch(() => null);
    if (remoteArch) onSelectArchiveItem(remoteArch);
  };
  const handleRemoveContinueWatching = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeEntry(id);
    setContinueWatching(prev => prev.filter(item => item.id !== id));
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
                <span className={`text-[9px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-lg border ${
                  heroIsHalloween
                    ? 'bg-orange-500/20 text-orange-300 border-orange-500/40'
                    : 'bg-white/10 text-white/70 border-white/12'
                }`}>
                  {heroIsHalloween ? '🎃 Halloween Showcase' : heroIsplatform ? 'Platform Original' : 'Cinema'}
                </span>
                {heroGenre && (
                  <span className="text-[#FFB68D] text-[9px] font-black uppercase tracking-[0.2em]">{heroGenre}</span>
                )}
                {(hero as any)?.year && (
                  <span className="text-white/45 text-[9px] font-black uppercase tracking-[0.2em]">{(hero as any).year}</span>
                )}
                {(hero as any)?.runtime && (
                  <span className="text-white/45 text-[9px] font-black uppercase tracking-[0.2em]">· {(hero as any).runtime}</span>
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

              <div className="flex items-center gap-3 pt-1 flex-wrap">
                <button
                  onClick={handleHeroPlay}
                  className="h-12 px-8 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-3 transition-all hover:scale-105 shadow-lg cursor-pointer"
                >
                  <Play fill="currentColor" size={18} /> Watch Now
                </button>
                <button
                  onClick={() => hero && onToggleWatchlist?.(hero)}
                  className={`h-12 px-6 border font-black text-sm uppercase tracking-widest rounded-full flex items-center gap-2 transition-all cursor-pointer ${
                    heroInWatchlist
                      ? 'bg-[#D0BCFF]/20 border-[#D0BCFF]/50 text-[#D0BCFF]'
                      : 'bg-white/8 hover:bg-white/12 border-white/15 text-white/70'
                  }`}
                >
                  {heroInWatchlist ? <Check size={17} /> : <Plus size={17} />}
                  {heroInWatchlist ? 'In Watchlist' : 'Watchlist'}
                </button>
                <button
                  onClick={handleHeroShare}
                  title="Share this film"
                  className="h-12 w-12 bg-white/8 hover:bg-white/15 border border-white/15 text-white/70 hover:text-white rounded-full flex items-center justify-center transition-all cursor-pointer"
                >
                  <Share2 size={16} />
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
        <section className="px-4 lg:px-8 mb-6">
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
            {/* Halloween Vault hero card */}
            <button
              onClick={() => setCurrentSubView('HALLOWEEN')}
              className="shrink-0 relative w-[calc(100vw-32px)] max-w-72 h-40 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl cursor-pointer text-left"
              style={{ border: '1px solid rgba(251,146,60,0.45)' }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#3B120C] via-[#1E0F29] to-[#131314]" />
              <div className="absolute right-3 top-3 opacity-25 text-[68px] leading-none select-none">🎃</div>
              <div className="relative h-full flex flex-col justify-between p-5">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  <span className="text-[7px] font-black uppercase tracking-[0.35em] text-orange-300">Seasonal Showcase</span>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-orange-300/80 mb-0.5">31 Nights of Cinema Terror</p>
                  <h3 className="text-lg font-black text-white leading-tight">Halloween Vault</h3>
                  <p className="text-[9px] text-white/55 mt-1">12 Classics · Double Features · Share →</p>
                </div>
              </div>
            </button>

            {/* Virtual Film Historian hero card */}
            <button
              onClick={() => setCurrentSubView('CURATOR')}
              className="shrink-0 relative w-[calc(100vw-32px)] max-w-72 h-40 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl cursor-pointer text-left"
              style={{ border: '1px solid rgba(208,188,255,0.35)' }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#2A1B3D] via-[#1F172E] to-[#131314]" />
              <div className="absolute right-3 top-3 opacity-20 text-[70px] leading-none select-none">✨</div>
              <div className="relative h-full flex flex-col justify-between p-5">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#D0BCFF] animate-pulse" />
                  <span className="text-[7px] font-black uppercase tracking-[0.35em] text-[#D0BCFF]">Virtual Curator</span>
                </div>
                <div>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#D0BCFF]/80 mb-0.5">KOFA · Europeana · Silent Era</p>
                  <h3 className="text-lg font-black text-white leading-tight">Film Historian</h3>
                  <p className="text-[9px] text-white/50 mt-1">Curated pairings &amp; context →</p>
                </div>
              </div>
            </button>

            {/* Film History hero card */}
            {onNavigate && (
              <button
                onClick={() => onNavigate('TALEO_HISTORY')}
                className="shrink-0 relative w-[calc(100vw-32px)] max-w-72 h-40 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl cursor-pointer text-left"
                style={{ border: '1px solid rgba(203,213,225,0.2)' }}
              >
                <img
                  src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Charlie_Chaplin.jpg/480px-Charlie_Chaplin.jpg"
                  alt="Film History"
                  referrerPolicy="no-referrer"
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
            )}

            {/* Film School hero card */}
            {onNavigate && (
              <button
                onClick={() => onNavigate('FILM_SCHOOL')}
                className="shrink-0 relative w-[calc(100vw-32px)] max-w-72 h-40 rounded-[1.5rem] overflow-hidden group hover:scale-[1.03] transition-all duration-300 shadow-2xl cursor-pointer text-left"
                style={{ border: '1px solid rgba(245,158,11,0.35)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-amber-950/90 via-orange-900/60 to-red-950/80" />
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
            )}
          </div>
        </section>

        {/* Continue Watching (resume) */}
        {continueWatching.length > 0 && (
          <section>
            <SectionHeader label="Jump Back In" title="Continue Watching" accent="#3FBE85" />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
              {continueWatching.map(e => {
                const pct = e.durationSec > 0 ? Math.min(100, (e.positionSec / e.durationSec) * 100) : 0;
                return (
                  <motion.div key={e.id} whileHover={{ y: -5 }} onClick={() => resumeItem(e)} className="w-56 flex-shrink-0 group cursor-pointer relative">
                    <div className="aspect-video rounded-xl overflow-hidden bg-white/5 relative border border-white/8 group-hover:border-[#3FBE85]/40 transition-all">
                      {e.thumbnailUrl
                        ? <img src={e.thumbnailUrl} loading="lazy" className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-all" alt={e.title || ''} />
                        : <div className="w-full h-full flex items-center justify-center"><Film size={26} className="text-white/10" /></div>}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-11 h-11 rounded-full bg-white/15 border border-white/30 flex items-center justify-center backdrop-blur-sm"><Play fill="white" size={17} className="ml-0.5" /></div>
                      </div>
                      <button
                        type="button"
                        title="Remove from Continue Watching"
                        onClick={(ev) => handleRemoveContinueWatching(ev, e.id)}
                        className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/70 hover:bg-black text-white/60 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      >
                        <X size={12} />
                      </button>
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

        {/* My Watchlist rail (when non-empty) */}
        {watchlist.length > 0 && (
          <section>
            <SectionHeader
              label="Saved For Later"
              title="My Watchlist"
              accent="#D0BCFF"
              onSeeAll={() => setCurrentSubView('LIBRARY')}
            />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
              {watchlist.map(w => (
                <div key={`wl-${w.id}`} className="relative group/wl flex-shrink-0">
                  <PosterCard
                    title={w.title}
                    subtitle={w.genre || 'Saved'}
                    image={w.thumbnailUrl}
                    genre={w.genre}
                    onPlay={() => resumeItem({ id: w.id, title: w.title, thumbnailUrl: w.thumbnailUrl, kind: 'TALEO', positionSec: 0, durationSec: 0, updatedAt: w.addedAt, completed: false })}
                    accentBorder
                  />
                  <button
                    type="button"
                    title="Remove from Watchlist"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onToggleWatchlist?.({ id: w.id, title: w.title });
                    }}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/75 hover:bg-rose-600 text-white/70 hover:text-white flex items-center justify-center opacity-0 group-hover/wl:opacity-100 transition-opacity z-10"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── CURATED HALLOWEEN SHOWCASE BANNER & RAIL ───────────────────────── */}
        <section className="relative rounded-3xl overflow-hidden border border-orange-500/30 bg-gradient-to-br from-[#2B0E0B] via-[#190D24] to-[#131314] p-6 sm:p-10 shadow-[0_25px_70px_rgba(234,88,12,0.14)]">
          <div className="absolute -right-12 -top-12 w-72 h-72 rounded-full bg-orange-500/10 blur-3xl pointer-events-none" />
          <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center justify-between relative z-10">
            <div className="space-y-3 max-w-2xl">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 text-[9px] font-black uppercase tracking-[0.25em] border border-orange-500/40 flex items-center gap-1.5">
                  <Ghost size={12} /> Halloween Hero Feature · Featured Selection
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/45">
                  Directed by Brian James Gage · Planet Ween Universe + 12 Restored Classics
                </span>
              </div>
              <h3 className="text-2xl sm:text-4xl md:text-5xl font-black uppercase tracking-tight text-white leading-[0.95]">
                <span className="text-orange-400">Pumpkin Patch</span> &amp; The Halloween Vault
              </h3>
              <p className="text-xs sm:text-sm text-white/65 leading-relaxed">
                Headlined by Brian James Gage’s Halloween opus <span className="text-white font-semibold">Pumpkin Patch</span>—where a pumpkin-headed vigilante storms prison colony District 13 to rescue the President of Halloween—alongside 12 restored cinema nightmares (<span className="text-white font-semibold">Night of the Living Dead</span>, <span className="text-white font-semibold">House on Haunted Hill</span>, <span className="text-white font-semibold">Nosferatu</span> &amp; more).
              </p>
              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <button
                  onClick={() => onSelectMovie(pumpkinPatchHero)}
                  className="h-11 px-6 bg-orange-500 hover:bg-orange-400 text-[#131314] font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-lg cursor-pointer"
                >
                  <Play size={14} fill="currentColor" /> Watch Pumpkin Patch
                </button>
                <button
                  onClick={() => setCurrentSubView('HALLOWEEN')}
                  className="h-11 px-5 bg-white/10 hover:bg-white/15 border border-orange-400/35 text-orange-200 font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Ghost size={14} /> Halloween Vault &amp; Live Chat Room
                </button>
                <button
                  onClick={() => setCurrentSubView('HAUNTED_EXHIBIT')}
                  className="h-11 px-5 bg-gradient-to-r from-purple-950/90 via-stone-900 to-orange-950/90 hover:from-purple-900 hover:to-orange-900 border border-amber-400/45 text-amber-200 font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-lg cursor-pointer"
                >
                  <Flame size={14} className="text-orange-400" /> 🏰 Enter Haunted Castle &amp; Crossroads 3D Exhibit
                </button>
                <ShareButton
                  title={`Halloween Curation · Pumpkin Patch & ${CURATED_HALLOWEEN_FILMS.length} Classics`}
                  artist="Directed by Brian James Gage · Halloween Curation"
                  text={`Stream Brian James Gage’s "Pumpkin Patch" alongside ${CURATED_HALLOWEEN_FILMS.length} restored horror, Korean gothic & silent classics in the Halloween Curation`}
                  url={buildShareUrl('taleoCollection', 'halloween')}
                  imageUrl={pumpkinPatchHero.headerImage || pumpkinPatchHero.coverImage}
                  contentType="movie"
                  ctaText="🎃 EXPLORE HALLOWEEN CURATION"
                  plajahLabel="Share Halloween Curation to feed"
                  onPostToPlajah={async () => {
                    if (!auth.currentUser) {
                      await loginWithGoogle();
                      if (!auth.currentUser) throw new Error('Sign in required');
                    }
                    const img = pumpkinPatchHero.headerImage || pumpkinPatchHero.coverImage;
                    await createPost({
                      text: `🎃 Exploring the Halloween Curation — headlined by Brian James Gage’s "Pumpkin Patch" alongside ${CURATED_HALLOWEEN_FILMS.length} restored horror & Gothic classics!`,
                      isPublic: true,
                      tags: ['HalloweenCuration', 'Taleo', 'PumpkinPatch', 'HorrorCinema'],
                      assetEmbed: {
                        type: 'TALEO_COLLECTION',
                        id: 'halloween',
                        title: `🎃 Halloween Curation — Pumpkin Patch & ${CURATED_HALLOWEEN_FILMS.length} Classics`,
                        subtitle: 'Headlined by Brian James Gage’s Pumpkin Patch · Korean Gothic · Midnight Horror',
                        imageUrl: img,
                      },
                      media: img ? [{ type: 'PHOTO' as any, url: img, title: `🎃 Halloween Curation — Pumpkin Patch & ${CURATED_HALLOWEEN_FILMS.length} Classics` }] : undefined,
                    } as any);
                  }}
                  className="h-11 px-5 bg-white/5 hover:bg-white/10 border border-white/15 text-white/80 font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Share2 size={13} /> Share Halloween Selection
                </ShareButton>
              </div>
            </div>

            {/* Highlight poster trio: Pumpkin Patch Hero + 2 Classics */}
            <div className="flex gap-3 shrink-0 self-center">
              <div
                onClick={() => onSelectMovie(pumpkinPatchHero)}
                className="w-28 sm:w-36 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-orange-400/70 relative group cursor-pointer shadow-2xl hover:scale-105 transition-all"
              >
                <img src={pumpkinPatchHero.coverImage} alt={pumpkinPatchHero.title} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-orange-500 text-black text-[7px] font-black uppercase tracking-widest">
                  Hero Feature
                </div>
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-[7px] font-black uppercase text-orange-300">2025 · 58 min</p>
                  <p className="text-[9px] font-black text-white truncate">Pumpkin Patch</p>
                </div>
              </div>
              {CURATED_HALLOWEEN_FILMS.slice(0, 2).map(film => (
                <div
                  key={`hal-banner-${film.identifier}`}
                  onClick={() => onSelectArchiveItem(film)}
                  className="w-28 sm:w-36 aspect-[2/3] rounded-2xl overflow-hidden border border-orange-400/25 relative group cursor-pointer shadow-2xl hover:scale-105 transition-all"
                >
                  <img src={film.thumbnailUrl} alt={film.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-[7px] font-black uppercase text-orange-300">{film.year} · {film.runtime}</p>
                    <p className="text-[9px] font-black text-white truncate">{film.title}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Horizontal Shareable Halloween Rail inside the showcase */}
          <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-orange-300/90">
                🎃 Curated Halloween Lineup · Headlined by Pumpkin Patch
              </p>
              <button
                onClick={() => setCurrentSubView('HALLOWEEN')}
                className="text-[9px] font-black uppercase tracking-widest text-orange-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                Double Features &amp; Curator Notes <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
              <div className="w-36 flex-shrink-0 group/hcard relative">
                <PosterCard
                  title="Pumpkin Patch"
                  subtitle="2025 · Brian James Gage"
                  image={pumpkinPatchHero.coverImage}
                  genre="58 min · Action / Horror"
                  directorName="Brian James Gage"
                  filmId={pumpkinPatchHero.id}
                  onSelectDirector={setSelectedDirector}
                  onPlay={() => onSelectMovie(pumpkinPatchHero)}
                />
                <div onClick={ev => ev.stopPropagation()} className="absolute top-2 right-2 z-10 opacity-0 group-hover/hcard:opacity-100 [@media(hover:none)]:opacity-100 transition-all">
                  <ShareButton
                    title="Pumpkin Patch · Directed by Brian James Gage"
                    artist="Brian James Gage"
                    text='Watch Brian James Gage’s Halloween action-satire "Pumpkin Patch" on Cinema'
                    url={buildShareUrl('movie', pumpkinPatchHero.id)}
                    imageUrl={pumpkinPatchHero.coverImage}
                    contentType="movie"
                    ctaText="▶ STREAM PUMPKIN PATCH ON TALEO"
                    plajahLabel="Share Pumpkin Patch"
                    onPostToPlajah={async () => {
                      if (!auth.currentUser) {
                        await loginWithGoogle();
                        if (!auth.currentUser) throw new Error('Sign in required');
                      }
                      await createPost({
                        text: `🎃 Watching Brian James Gage’s "Pumpkin Patch" in the Cinema Halloween Curation!`,
                        isPublic: true,
                        tags: ['PumpkinPatch', 'HalloweenCuration', 'Taleo'],
                        assetEmbed: {
                          type: 'MOVIE',
                          id: pumpkinPatchHero.id,
                          title: 'Pumpkin Patch (2025)',
                          subtitle: 'Directed by Brian James Gage · Halloween Hero Feature',
                          imageUrl: pumpkinPatchHero.coverImage,
                        },
                        media: pumpkinPatchHero.coverImage ? [{ type: 'PHOTO' as any, url: pumpkinPatchHero.coverImage, title: 'Pumpkin Patch' }] : undefined,
                      } as any);
                    }}
                    iconSize={12}
                    className="w-7 h-7 rounded-full bg-black/75 hover:bg-orange-500 text-white hover:text-black border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                  />
                </div>
              </div>
              {CURATED_HALLOWEEN_FILMS.map(film => (
                <div key={`hal-rail-${film.identifier}`} className="w-36 flex-shrink-0 group/hcard relative">
                  <PosterCard
                    title={film.title}
                    subtitle={`${film.year} · ${film.director || 'Horror'}`}
                    image={film.thumbnailUrl}
                    genre={film.runtime || 'Horror'}
                    directorName={film.director}
                    filmId={film.identifier}
                    onSelectDirector={setSelectedDirector}
                    onPlay={() => onSelectArchiveItem(film)}
                  />
                  <div onClick={ev => ev.stopPropagation()} className="absolute top-2 right-2 z-10 opacity-0 group-hover/hcard:opacity-100 [@media(hover:none)]:opacity-100 transition-all">
                    <ShareButton
                      title={`${film.title} (${film.year})`}
                      artist={film.director ? `Dir. ${film.director} · Cinema Halloween` : 'Cinema Halloween'}
                      text={`Watch "${film.title}" (${film.year}) free in the Plajah Halloween Curation`}
                      url={buildShareUrl('archive', film.identifier)}
                      imageUrl={film.thumbnailUrl}
                      contentType="movie"
                      ctaText="▶ STREAM CLASSIC ON TALEO"
                      plajahLabel="Share to Plajah feed"
                      onPostToPlajah={async () => {
                        if (!auth.currentUser) {
                          await loginWithGoogle();
                          if (!auth.currentUser) throw new Error('Sign in required');
                        }
                        await createPost({
                          text: `🎬 Streaming "${film.title}" (${film.year}${film.director ? `, dir. ${film.director}` : ''}) in the Plajah Halloween Curation!`,
                          isPublic: true,
                          tags: ['HalloweenCuration', 'Taleo', 'ClassicHorror'],
                          assetEmbed: {
                            type: 'ARCHIVE',
                            id: film.identifier,
                            title: `${film.title} (${film.year})`,
                            subtitle: `${film.director ? `Dir. ${film.director} · ` : ''}Cinema Halloween Curation`,
                            imageUrl: film.thumbnailUrl,
                          },
                          media: film.thumbnailUrl ? [{ type: 'PHOTO' as any, url: film.thumbnailUrl, title: film.title }] : undefined,
                        } as any);
                      }}
                      iconSize={12}
                      className="w-7 h-7 rounded-full bg-black/75 hover:bg-orange-500 text-white hover:text-black border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* New This Week — editorial freshness row (2E) */}
        {newThisWeek.length > 0 && (
          <section>
            <SectionHeader label="Fresh · Last 7 Days" title="New This Week" accent="#3FBE85" />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
              {newThisWeek.map((v: any) => (
                <PosterCard
                  key={`ntw-${v.identifier || v.id}`}
                  title={v.title}
                  subtitle={v._original?.ownerName || v.ownerName}
                  image={v.thumbnailUrl || v.coverImage || (v as any).coverImageUrl || (v as any).posterUrl || (v as any).promoKit?.keyArtUrl}
                  genre={v.genre}
                  rating={v._original?.contentRating || v.contentRating}
                  previewItem={v._original || v}
                  onPlay={() => onSelectMovie(v._original || v)}
                />
              ))}
            </div>
          </section>
        )}

        {/* New to Taleo */}
        {newToTaleo.length > 0 && (
          <section>
            <SectionHeader label="Just Added" title="New to Cinema" accent="#D0BCFF" />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
              {newToTaleo.map(v => (
                <PosterCard
                  key={v.identifier || v.id}
                  title={v.title}
                  subtitle={(v as any)._original?.ownerName || (v as any).ownerName}
                  image={v.thumbnailUrl || v.coverImage || (v as any).coverImageUrl || (v as any).posterUrl || (v as any).promoKit?.keyArtUrl}
                  genre={v.genre}
                  rating={(v as any)._original?.contentRating || (v as any).contentRating}
                  previewItem={(v as any)._original || v}
                  onPlay={() => onSelectMovie((v as any)._original || v)}
                  accentBorder
                />
              ))}
            </div>
          </section>
        )}

        {/* Curated Heritage Showcase Banner */}
        <section className="relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-[#1F172E] via-[#161320] to-[#131314] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-8 items-center justify-between">
            <div className="space-y-3 max-w-xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-[#D0BCFF]/15 text-[#D0BCFF] text-[8px] font-black uppercase tracking-widest border border-[#D0BCFF]/30">
                  Global Archive Preservation
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Korean Film Archive &amp; Europeana</span>
              </div>
              <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white leading-tight">
                Curated Cinema Heritage
              </h3>
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed">
                Step into the preserved masterworks that shaped global cinema history. Restored classics from the Korean Film Archive, German Expressionist milestones, and early European avant-garde — complete with director portraits, biographies, and annotated filmographies of their other landmark works.
              </p>
              <div className="flex items-center gap-3 pt-2 flex-wrap">
                <button
                  onClick={() => setCurrentSubView('CURATOR')}
                  className="h-10 px-6 bg-[#D0BCFF] hover:bg-[#E8DAFF] text-[#1C1B1F] font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-lg cursor-pointer"
                >
                  <Sparkles size={14} /> Open Film Historian
                </button>
                <button
                  onClick={() => onSelectArchiveItem(CURATED_KOFA_FILMS[0])}
                  className="h-10 px-5 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Play size={13} fill="currentColor" /> Watch Spotlight Film
                </button>
              </div>
            </div>

            {/* Visual preview duo */}
            <div className="flex gap-3 shrink-0">
              <div
                onClick={() => onSelectArchiveItem(CURATED_KOFA_FILMS[0])}
                className="w-32 sm:w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 relative group cursor-pointer shadow-xl hover:scale-105 transition-all"
              >
                <img src={CURATED_KOFA_FILMS[0].thumbnailUrl} alt="The Housemaid" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-[7px] font-black uppercase text-[#D0BCFF]">KOFA Restored · Kim Ki-young</p>
                  <p className="text-[9px] font-black text-white truncate">{CURATED_KOFA_FILMS[0].title}</p>
                </div>
              </div>

              <div
                onClick={() => onSelectArchiveItem(CURATED_EUROPEANA_FILMS[1])}
                className="w-32 sm:w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-white/15 relative group cursor-pointer shadow-xl hover:scale-105 transition-all"
              >
                <img src={CURATED_EUROPEANA_FILMS[1].thumbnailUrl} alt="Metropolis" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-[7px] font-black uppercase text-[#FFB68D]">Europeana · Fritz Lang</p>
                  <p className="text-[9px] font-black text-white truncate">{CURATED_EUROPEANA_FILMS[1].title}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Golden Age of Korean Cinema (KOFA Restorations) */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1.5">Korean Film Archive Preservation · With Director Bios &amp; Filmographies</p>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">Golden Age of Korean Cinema</h3>
            </div>
            <button
              onClick={() => setCurrentSubView('CURATOR')}
              className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Sparkles size={11} /> Curator Notes
            </button>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
            {CURATED_KOFA_FILMS.map(film => (
              <PosterCard
                key={film.identifier}
                title={film.title}
                subtitle={`${film.year} · ${film.director || 'KOFA'}`}
                image={film.thumbnailUrl}
                genre={film.genre}
                directorName={film.director}
                filmId={film.identifier}
                onSelectDirector={setSelectedDirector}
                onPlay={() => onSelectArchiveItem(film)}
                accentBorder
              />
            ))}
          </div>
        </section>

        {/* European Avant-Garde & Expressionism (Europeana) */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1.5">Europeana Film Heritage · With Director Bios &amp; Filmographies</p>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">European Expressionism &amp; Avant-Garde</h3>
            </div>
            <button
              onClick={() => setCurrentSubView('CURATOR')}
              className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Sparkles size={11} /> Curator Notes
            </button>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
            {CURATED_EUROPEANA_FILMS.map(film => (
              <PosterCard
                key={film.identifier}
                title={film.title}
                subtitle={`${film.year} · ${film.director || 'Europeana'}`}
                image={film.thumbnailUrl}
                genre={film.genre}
                directorName={film.director}
                filmId={film.identifier}
                onSelectDirector={setSelectedDirector}
                onPlay={() => onSelectArchiveItem(film)}
              />
            ))}
          </div>
        </section>

        {/* World Cinema Masterworks (Japan, USSR, France, Denmark, Sweden, India, China, Mexico, Italy, Spain) */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#3FBE85] mb-1.5">Global Public Domain Preservation · Japan · USSR · France · Denmark · Sweden · India · China · Mexico</p>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">World Cinema Masterworks</h3>
            </div>
            <button
              onClick={() => setCurrentSubView('MOVIES')}
              className="text-[9px] font-black uppercase tracking-widest text-[#3FBE85] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Globe size={11} /> Explore All ({CURATED_INTERNATIONAL_FILMS.length})
            </button>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
            {CURATED_INTERNATIONAL_FILMS.map(film => (
              <PosterCard
                key={film.identifier}
                title={film.title}
                subtitle={`${film.year} · ${film.country || ''} · ${film.director || 'World Cinema'}`}
                image={film.thumbnailUrl}
                genre={film.genre}
                directorName={film.director}
                filmId={film.identifier}
                onSelectDirector={setSelectedDirector}
                onPlay={() => onSelectArchiveItem(film)}
                accentBorder
              />
            ))}
          </div>
        </section>

        {/* Film Noir, Hitchcock, Silent Slapstick & Golden Age US Classics */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1.5">Hollywood &amp; British Public Domain · Noir · Hitchcock · Keaton · Chaplin · Capra · Welles</p>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">Film Noir, Hitchcock &amp; US Classics</h3>
            </div>
            <button
              onClick={() => setCurrentSubView('MOVIES')}
              className="text-[9px] font-black uppercase tracking-widest text-[#FFB68D] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Film size={11} /> Explore All ({CURATED_US_CLASSIC_FILMS.length})
            </button>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
            {CURATED_US_CLASSIC_FILMS.map(film => (
              <PosterCard
                key={film.identifier}
                title={film.title}
                subtitle={`${film.year} · ${film.director || 'Classic'}`}
                image={film.thumbnailUrl}
                genre={film.genre}
                directorName={film.director}
                filmId={film.identifier}
                onSelectDirector={setSelectedDirector}
                onPlay={() => onSelectArchiveItem(film)}
              />
            ))}
          </div>
        </section>

        {/* Newly Unlocked Director Dossier Vault Films */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1.5">Auteur Filmography Vault · Murnau · Lang · Corman · Méliès · Vertov · Wiene · Dawley</p>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">Director Dossier Vault</h3>
            </div>
            <button
              onClick={() => setCurrentSubView('CURATOR')}
              className="text-[9px] font-black uppercase tracking-widest text-[#D0BCFF] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Sparkles size={11} /> {CURATED_DIRECTOR_VAULT_FILMS.length} Restored Works
            </button>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
            {CURATED_DIRECTOR_VAULT_FILMS.map(film => (
              <PosterCard
                key={film.identifier}
                title={film.title}
                subtitle={`${film.year} · ${film.director || 'Auteur Vault'}`}
                image={film.thumbnailUrl}
                genre={film.genre}
                directorName={film.director}
                filmId={film.identifier}
                onSelectDirector={setSelectedDirector}
                onPlay={() => onSelectArchiveItem(film)}
                accentBorder
              />
            ))}
          </div>
        </section>

        {/* Classic Japanese Anime & Global Animation (NFAJ Restorations, Toei, Eiken, Wan Brothers, Starevich, Fleischer, McCay) */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-1.5">NFAJ 1917–1943 Restorations · Toei 1958 · Eiken · China · France · Fleischer · McCay</p>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">🏯 Classic Japanese Anime &amp; Global Animation</h3>
            </div>
            <button
              onClick={() => setCurrentSubView('MOVIES')}
              className="text-[9px] font-black uppercase tracking-widest text-[#FFB68D] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Rocket size={11} /> Explore All ({CURATED_ANIME_AND_ANIMATION_FILMS.length})
            </button>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
            {CURATED_ANIME_AND_ANIMATION_FILMS.map(film => (
              <PosterCard
                key={film.identifier}
                title={film.title}
                subtitle={`${film.year} · ${film.country || ''} · ${film.director || 'Animation'}`}
                image={film.thumbnailUrl}
                genre={film.genre}
                directorName={film.director}
                filmId={film.identifier}
                onSelectDirector={setSelectedDirector}
                onPlay={() => onSelectArchiveItem(film)}
                accentBorder
              />
            ))}
          </div>
        </section>

        {/* Public Domain Television Series & Theatrical Serials (Multi-Episode) */}
        <section>
          <div className="flex items-end justify-between mb-5">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#3FBE85] mb-1.5">Multi-Episode Broadcasts &amp; Cliffhanger Serials · Verified Streams</p>
              <h3 className="text-2xl font-black uppercase tracking-tight text-white">Public Domain TV Series &amp; Serials</h3>
            </div>
            <button
              onClick={() => setCurrentSubView('TV')}
              className="text-[9px] font-black uppercase tracking-widest text-[#3FBE85] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Monitor size={11} /> Browse TV ({CURATED_PUBLIC_DOMAIN_TV_SERIES.length} Series)
            </button>
          </div>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
            {CURATED_PUBLIC_DOMAIN_TV_SERIES.map(seriesItem => {
              const epCount = seriesItem.seasons?.reduce((acc, s) => acc + (s.episodes?.length || 0), 0) || 1;
              return (
                <PosterCard
                  key={seriesItem.identifier}
                  title={seriesItem.title}
                  subtitle={`${seriesItem.year} · ${epCount} Episodes`}
                  image={seriesItem.thumbnailUrl}
                  genre={seriesItem.genre}
                  filmId={seriesItem.identifier}
                  onPlay={() => onSelectArchiveItem(seriesItem)}
                />
              );
            })}
          </div>
        </section>

        {/* Masters of Classic Cinema: Director Portraits, Biographies & Filmographies of Other Works */}
        <ClassicDirectorsShowcaseSection
          onPlayFilm={handlePlayFilmById}
        />

        {/* Halloween Curation: Full Story Intelligence, Characters & The Actors Behind Them */}
        <HalloweenCurationStoryIntelSection
          onPlayFilm={handlePlayFilmById}
          onOpenFilmStoryIntel={handlePlayFilmById}
        />

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
                    <button
                      onClick={() => onNavigate ? onNavigate('WORLDS') : setCurrentSubView('UNIVERSE')}
                      className="mt-4 w-fit h-9 px-5 bg-[#FFB68D] hover:bg-[#FFC9A0] text-[#1C1B1F] font-black text-[10px] uppercase tracking-widest rounded-full flex items-center gap-2 transition-all hover:scale-105 cursor-pointer"
                    >
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
            <SectionHeader label="Platform Originals" title="Films & Series by Creators" accent="#D0BCFF" onSeeAll={() => setCurrentSubView('MOVIES')} />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
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
                      {(orig.contentRating || (v as any).contentRating) && (
                        <div className="absolute top-2 right-2">
                          <RatingBadge rating={orig.contentRating || (v as any).contentRating} />
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
            <SectionHeader label="IP & Worlds" title="Featured Characters" accent="#FFB68D" onSeeAll={() => setCurrentSubView('UNIVERSE')} />
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
            <SectionHeader label="Popular Right Now" title="Trending" accent="#D0BCFF" onSeeAll={() => setCurrentSubView('MOVIES')} />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
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
            <SectionHeader label="Must Watch" title="Critically Acclaimed" accent="#FFB68D" onSeeAll={() => setCurrentSubView('CURATOR')} />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
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
            <SectionHeader label="Highly Rated" title="Beloved by Users" accent="#D0BCFF" onSeeAll={() => setCurrentSubView('MOVIES')} />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
              {belovedByUsers.map(v => (
                <PosterCard
                  key={v.identifier || v.id}
                  title={v.title}
                  subtitle={(v as any).genre || 'Platform'}
                  image={v.thumbnailUrl || v.coverImage || (v as any).coverImageUrl || (v as any).posterUrl || (v as any).promoKit?.keyArtUrl}
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
            <SectionHeader label="Fan Communities" title="Film Clubs" accent="#D0BCFF" onSeeAll={() => setCurrentSubView('CLUBS')} />
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
              {filmClubs.map(club => (
                <motion.div
                  key={club.id}
                  whileHover={{ y: -4, scale: 1.02 }}
                  onClick={() => { window.location.href = `/c/${encodeURIComponent(club.id)}`; }}
                  className="w-52 flex-shrink-0 group cursor-pointer"
                >
                  <div className="aspect-[3/2] rounded-2xl overflow-hidden bg-white/5 border border-white/8 group-hover:border-[#D0BCFF]/40 transition-all relative mb-3">
                    {club.coverImage ? (
                      <img src={thumb(coverGridSrc(club), THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.coverImage)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={club.name} />
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

        {/* Genre Rails — Archive.org, Europeana & Global Archives */}
        {genreCollections.map(({ genre, items }) => {
          const GenreIcon = GENRE_ICONS[genre] ?? Film;
          const firstItem = items[0];
          const sourceBadge = genre.includes('Halloween')
            ? 'Curated Showcase'
            : firstItem?.source === 'PEERTUBE'
            ? 'PeerTube'
            : firstItem?.source === 'EUROPEANA'
            ? 'Europeana'
            : firstItem?.source === 'KOFA'
            ? 'Korean Film Archive'
            : firstItem?.source === 'LIBRARY_OF_CONGRESS'
            ? 'Library of Congress'
            : 'Archive.org';
          const eyebrow = genre.includes('Halloween')
            ? '31 Nights of Terror'
            : firstItem?.source === 'PEERTUBE'
            ? 'Creative Commons'
            : firstItem?.source === 'EUROPEANA'
            ? 'European Heritage'
            : firstItem?.source === 'KOFA'
            ? 'Korean Classic Heritage'
            : 'Public Domain';
          return (
            <section key={genre}>
              <div className="flex items-end justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <GenreIcon size={15} className="text-[#D0BCFF]" />
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/25 mb-0.5">{eyebrow}</p>
                    <h3 className="text-2xl font-black uppercase tracking-tight text-white">{genre}</h3>
                  </div>
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/20 border border-white/10 px-2 py-0.5 rounded-lg">{sourceBadge}</span>
              </div>
              <div className="flex gap-6 overflow-x-auto no-scrollbar pb-4 pt-2">
                {items.map(item => (
                  <PosterCard
                    key={item.identifier}
                    title={item.title}
                    subtitle={`${item.year || 'Classic'} · ${item.genre}`}
                    image={item.thumbnailUrl}
                    genre={item.genre}
                    directorName={item.director}
                    filmId={item.identifier}
                    onSelectDirector={setSelectedDirector}
                    onPlay={() => onSelectArchiveItem(item)}
                  />
                ))}
              </div>
            </section>
          );
        })}

      </div>

      {selectedDirector && (
        <ClassicDirectorDossierModal
          director={selectedDirector}
          onClose={() => setSelectedDirector(null)}
          onPlayFilm={handlePlayFilmById}
        />
      )}
    </div>
  );
};

// ── HalloweenShowcaseView (Dedicated Shareable Halloween Vault) ──────────────
const HalloweenShowcaseView: React.FC<{
  onSelectArchiveItem: (item: ArchiveVideo) => void;
  onSelectMovie: (item: any) => void;
  localContent?: Album[];
  watchlist: WatchlistItem[];
  onToggleWatchlist: (item: any) => void;
  onShareToast: (msg: string) => void;
  onOpenHauntedExhibition: () => void;
}> = ({
  onSelectArchiveItem,
  onSelectMovie,
  localContent = [],
  watchlist,
  onToggleWatchlist,
  onShareToast,
  onOpenHauntedExhibition,
}) => {
  const [selectedDirector, setSelectedDirector] = useState<ClassicDirectorProfile | null>(null);
  const [selectedCharModal, setSelectedCharModal] = useState<{
    char: HalloweenCharacterWithActor;
    filmTitle: string;
  } | null>(null);

  const pumpkinPatchHero = useMemo(() => {
    const found = localContent.find(a => a.id === PUMPKIN_PATCH_HERO_ALBUM.id || /pumpkin\s*patch/i.test(a.title || ''));
    if (!found) return PUMPKIN_PATCH_HERO_ALBUM;
    return {
      ...PUMPKIN_PATCH_HERO_ALBUM,
      ...found,
      // Showcase art always features Pumpkin Patch, whatever the stored album header holds.
      coverImage: found.coverImage || PUMPKIN_PATCH_HERO_ALBUM.coverImage,
      headerImage: PUMPKIN_PATCH_HERO_ALBUM.headerImage,
      year: '2025',
      movieMetadata: {
        ...PUMPKIN_PATCH_HERO_ALBUM.movieMetadata,
        ...(found as any).movieMetadata,
        releaseYear: 2025,
      },
    };
  }, [localContent]);

  const handlePlayFilmById = (filmId: string) => {
    if (filmId === pumpkinPatchHero.id || filmId === 'album_1787881859314_mlt23') {
      onSelectMovie(pumpkinPatchHero);
      return;
    }
    const found = findPlayableFilmById(filmId);
    if (found) {
      if ((found as ArchiveVideo).identifier) {
        onSelectArchiveItem(found as ArchiveVideo);
      } else {
        onSelectMovie(found);
      }
    }
  };

  const isHeroInWatchlist = watchlist.some(w => w.id === pumpkinPatchHero.id);

  const [selectedShelfId, setSelectedShelfId] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('plajah:taleo:initialShelf');
      if (saved) {
        sessionStorage.removeItem('plajah:taleo:initialShelf');
        if (HALLOWEEN_CURATED_SECTIONS.some(s => s.id === saved)) return saved;
      }
    } catch {}
    return 'all';
  });

  const displayedFilms = useMemo(() => {
    if (selectedShelfId === 'all') return CURATED_HALLOWEEN_FILMS;
    const found = HALLOWEEN_CURATED_SECTIONS.find(s => s.id === selectedShelfId);
    return found ? found.items : CURATED_HALLOWEEN_FILMS;
  }, [selectedShelfId]);

  const halloweenShareUrl = buildShareUrl('taleoCollection', 'halloween');
  const halloweenShareImage = pumpkinPatchHero.headerImage || pumpkinPatchHero.coverImage;

  const handlePostHalloweenCollectionToPlajah = async (shelf?: string, shelfTitle?: string) => {
    if (!auth.currentUser) {
      await loginWithGoogle();
      if (!auth.currentUser) throw new Error('Sign in required');
    }
    const titleText = shelfTitle
      ? `🎃 ${shelfTitle} · Cinema Halloween Double Feature`
      : `🎃 Halloween Curation — Pumpkin Patch & ${CURATED_HALLOWEEN_FILMS.length} Classics`;
    await createPost({
      text: shelfTitle
        ? `🎃 Watching the "${shelfTitle}" Double Feature in the Halloween Curation on Cinema!`
        : `🎃 Exploring the Halloween Curation — headlined by Brian James Gage’s "Pumpkin Patch" alongside ${CURATED_HALLOWEEN_FILMS.length} restored horror, Korean gothic & silent classics on Cinema!`,
      isPublic: true,
      tags: ['HalloweenCuration', 'Taleo', 'PumpkinPatch', 'HorrorCinema'],
      assetEmbed: {
        type: 'TALEO_COLLECTION',
        id: 'halloween',
        ...(shelf ? { shelf } : {}),
        title: titleText,
        subtitle: 'Headlined by Brian James Gage’s Pumpkin Patch · Korean Gothic · Midnight Horror',
        imageUrl: halloweenShareImage,
      },
      media: halloweenShareImage
        ? [{ type: 'PHOTO' as any, url: halloweenShareImage, title: titleText }]
        : undefined,
    } as any);
    onShareToast(shelf ? 'Double Feature shared!' : 'Halloween Curation shared!');
  };

  const handleRandomFright = () => {
    const pick = CURATED_HALLOWEEN_FILMS[Math.floor(Math.random() * CURATED_HALLOWEEN_FILMS.length)];
    if (pick) onSelectArchiveItem(pick);
  };

  return (
    <div className="pb-40 bg-gradient-to-b from-[#0b0510] via-[#120818] to-[#0d0712] relative">
      {/* Spooky Halloween Atmospheric Top Marquee Bar */}
      <div className="border-b border-orange-500/30 bg-gradient-to-r from-orange-950/80 via-[#1a0926] to-orange-950/80 px-4 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🎃🕸️🦇</span>
            <span className="font-black uppercase tracking-widest text-orange-300 text-[10px]">
              Halloween Curation Vault · Midnight Coven Edition
            </span>
            <span className="hidden md:inline text-[11px] text-amber-200/70">
              Live Persistent Chat &amp; Fan Room · 6 Realistic Monster Face Filters · Found-Footage Night Beam · 3D Haunted Castle Crossroads
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="#halloween-vault-live-room"
              className="px-3 py-1 rounded-full bg-orange-500/20 hover:bg-orange-500/35 border border-orange-400/50 text-orange-200 text-[10px] font-black uppercase tracking-wider transition"
            >
              💬 Jump to Vault Chat &amp; Face Filters
            </a>
            <button
              onClick={onOpenHauntedExhibition}
              className="px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/50 text-emerald-200 text-[10px] font-black uppercase tracking-wider transition cursor-pointer"
            >
              🏰 Enter Haunted Castle &amp; Crossroads 3D Exhibit →
            </button>
          </div>
        </div>
      </div>

      {/* Halloween Hero Feature: Pumpkin Patch */}
      <section className="relative overflow-hidden border-b border-orange-500/30 bg-[#0d0614] py-14 sm:py-20 px-4 sm:px-8 md:px-14">
        {/* Cinematic backdrop */}
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={pumpkinPatchHero.headerImage || pumpkinPatchHero.coverImage}
            alt="Pumpkin Patch"
            className="w-full h-full object-cover opacity-30 scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b0510] via-[#13081c]/85 to-[#0b0510]/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0510] via-transparent to-[#0b0510]/60" />
        </div>
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 flex flex-col lg:flex-row gap-10 items-start lg:items-center justify-between">
          <div className="space-y-4 max-w-2xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-orange-500 text-black text-[9px] font-black uppercase tracking-[0.22em] flex items-center gap-1.5 shadow-lg">
                <Ghost size={12} /> Halloween Hero Feature · Featured Selection
              </span>
              <span className="px-3 py-1 rounded-full bg-white/10 border border-orange-400/30 text-orange-200 text-[9px] font-black uppercase tracking-widest">
                Planet Ween Universe · District 13
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">
                2025 · 58 min · Action / Horror / Satire
              </span>
            </div>

            <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight leading-[0.9] text-white drop-shadow-[0_4px_24px_rgba(249,115,22,0.3)]">
              Pumpkin <span className="text-orange-400">Patch</span>
            </h1>

            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#FFB68D]">
              Written &amp; Directed by Brian James Gage
            </p>

            <p className="text-sm sm:text-base text-white/75 leading-relaxed">
              When the West Hallow — one of the Four Guardians of Planet Ween — attacks Scare Force One, President Tepes crash-lands inside the dreaded prison colony District 13 carrying a mysterious hexagonal case. Commander Ichabod Crane, Special Agent Katrina Van Tassle, and cybernetic officer Robo Bones of the Monster Intelligence Agency enlist a bar-fighting vigilante with a pumpkin for a head and nothing left to lose to break in and save Halloween.
            </p>

            <div className="flex items-center gap-3 pt-2 flex-wrap">
              <button
                onClick={() => onSelectMovie(pumpkinPatchHero)}
                className="h-12 px-8 bg-orange-500 hover:bg-orange-400 text-[#131314] font-black text-xs uppercase tracking-widest rounded-full flex items-center gap-2.5 transition-all hover:scale-105 shadow-[0_0_25px_rgba(249,115,22,0.45)] cursor-pointer"
              >
                <Play size={16} fill="currentColor" /> Watch Pumpkin Patch
              </button>
              <button
                onClick={onOpenHauntedExhibition}
                className="h-12 px-6 bg-gradient-to-r from-emerald-600 via-teal-600 to-orange-600 hover:from-emerald-500 hover:to-orange-500 text-white font-black text-xs uppercase tracking-widest rounded-full flex items-center gap-2 transition-all hover:scale-105 shadow-[0_0_25px_rgba(16,185,129,0.35)] cursor-pointer"
              >
                <span>🏰</span> Enter Haunted Castle &amp; Crossroads 3D Exhibit
              </button>
              <button
                onClick={() => onToggleWatchlist(pumpkinPatchHero)}
                className={`h-12 px-5 rounded-full font-black text-xs uppercase tracking-widest flex items-center gap-2 border transition-all cursor-pointer ${
                  isHeroInWatchlist
                    ? 'bg-[#D0BCFF]/20 border-[#D0BCFF]/50 text-[#D0BCFF]'
                    : 'bg-white/10 hover:bg-white/15 border-white/20 text-white'
                }`}
              >
                {isHeroInWatchlist ? <Check size={15} /> : <Bookmark size={15} />}
                {isHeroInWatchlist ? 'In Watchlist' : '+ Watchlist'}
              </button>
              <ShareButton
                title="Pumpkin Patch · Directed by Brian James Gage"
                artist="Brian James Gage"
                text='Watch Brian James Gage’s Halloween action-satire "Pumpkin Patch" on Cinema'
                url={buildShareUrl('movie', pumpkinPatchHero.id)}
                imageUrl={pumpkinPatchHero.coverImage}
                contentType="movie"
                ctaText="▶ STREAM PUMPKIN PATCH ON TALEO"
                plajahLabel="Share Pumpkin Patch"
                onPostToPlajah={async () => {
                  if (!auth.currentUser) {
                    await loginWithGoogle();
                    if (!auth.currentUser) throw new Error('Sign in required');
                  }
                  await createPost({
                    text: `🎃 Watching Brian James Gage’s "Pumpkin Patch" in the Cinema Halloween Curation!`,
                    isPublic: true,
                    tags: ['PumpkinPatch', 'HalloweenCuration', 'Taleo'],
                    assetEmbed: {
                      type: 'MOVIE',
                      id: pumpkinPatchHero.id,
                      title: 'Pumpkin Patch (2025)',
                      subtitle: 'Directed by Brian James Gage · Halloween Hero Feature',
                      imageUrl: pumpkinPatchHero.coverImage,
                    },
                    media: pumpkinPatchHero.coverImage ? [{ type: 'PHOTO' as any, url: pumpkinPatchHero.coverImage, title: 'Pumpkin Patch' }] : undefined,
                  } as any);
                  onShareToast('Shared "Pumpkin Patch"!');
                }}
                className="h-12 px-5 bg-white/10 hover:bg-white/15 border border-orange-400/35 text-orange-200 font-black text-xs uppercase tracking-widest rounded-full flex items-center gap-2 transition-all cursor-pointer"
              >
                <Share2 size={14} /> Share Film
              </ShareButton>
              <button
                onClick={handleRandomFright}
                className="h-12 px-5 bg-white/5 hover:bg-white/10 border border-white/15 text-white/75 hover:text-white font-black text-xs uppercase tracking-widest rounded-full flex items-center gap-2 transition-all cursor-pointer"
              >
                <Shuffle size={14} /> Surprise Classic
              </button>
            </div>
          </div>

          {/* Right: Hero Poster + Shareable Halloween Vault Link Card */}
          <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center gap-6 shrink-0 w-full lg:w-auto">
            <div
              onClick={() => onSelectMovie(pumpkinPatchHero)}
              className="w-48 sm:w-56 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-orange-500/60 shadow-[0_20px_60px_rgba(0,0,0,0.8)] relative group cursor-pointer shrink-0"
            >
              <img
                src={pumpkinPatchHero.coverImage}
                alt="Pumpkin Patch Poster"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-orange-500 text-black flex items-center justify-center shadow-xl">
                  <Play size={22} fill="currentColor" className="ml-0.5" />
                </div>
              </div>
            </div>

            <div className="w-full sm:w-72 rounded-2xl bg-black/55 border border-orange-500/30 p-5 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-orange-300">Shareable Halloween Vault</span>
                <Flame size={14} className="text-orange-400" />
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                Share the entire Halloween curation — featuring <span className="text-white font-semibold">Pumpkin Patch</span> &amp; {CURATED_HALLOWEEN_FILMS.length} restored horror classics — with a rich preview card.
              </p>
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2">
                <span className="text-[10px] font-mono text-white/70 truncate flex-1">
                  {halloweenShareUrl}
                </span>
              </div>
              <ShareButton
                title={`Halloween Curation · Pumpkin Patch & ${CURATED_HALLOWEEN_FILMS.length} Classics`}
                artist="Headlined by Brian James Gage"
                text={`Stream Brian James Gage’s "Pumpkin Patch" alongside ${CURATED_HALLOWEEN_FILMS.length} restored horror, Korean gothic & silent classics in the Halloween Curation`}
                url={halloweenShareUrl}
                imageUrl={halloweenShareImage}
                contentType="movie"
                ctaText="🎃 EXPLORE HALLOWEEN CURATION"
                plajahLabel="Share Halloween Curation"
                onPostToPlajah={() => handlePostHalloweenCollectionToPlajah()}
                className="w-full py-2.5 px-4 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-orange-500/20"
              >
                <Share2 size={13} /> Share Halloween Curation
              </ShareButton>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-12 pt-10 space-y-16">
        {/* ── OPTIONAL INTERACTIVE 3D EXHIBITION PORTAL: HAUNTED CASTLE & LONESOME CROSSROADS ── */}
        <section className="relative rounded-3xl overflow-hidden border-2 border-orange-500/40 bg-gradient-to-r from-[#1a0b25] via-[#0e171f] to-[#240e08] p-6 sm:p-8 shadow-[0_0_60px_rgba(249,115,22,0.18)]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10px] font-black uppercase tracking-widest">
                  ✨ Optional Live Interactive 3D Exhibition
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-orange-500/20 border border-orange-400/40 text-orange-300 text-[10px] font-mono">
                  Powered by Story Intelligence + 26-Page Graphic Novel + Stills
                </span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-tight text-white">
                🏰 Virtual Haunted Castle &amp; <span className="text-orange-400">Lonesome Road Intersection</span>
              </h2>
              <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
                Step into a live spooky night landscape where the <span className="text-orange-300 font-semibold">curated Halloween movies are the directional road signs</span> at a lonesome highway intersection and appear on <span className="text-amber-300 font-semibold">dilapidated roadside billboards</span> down each road. Watch as <span className="text-emerald-300 font-semibold">Wicked Witch Miriam flies across the full moon with her laughing witch cackle and army of winged monkeys</span>, and <span className="text-orange-400 font-semibold">Pumpkin Patch himself materializes in the road igniting his dual plasma blades</span> before vanishing into the mist.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={onOpenHauntedExhibition}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-black font-black text-xs uppercase tracking-widest shadow-xl flex items-center gap-2 transition transform hover:scale-105 cursor-pointer"
                >
                  <span>🏰</span> Enter Haunted Castle &amp; Crossroads Exhibition
                </button>
                <a
                  href="#halloween-vault-live-room"
                  className="px-5 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-orange-400/40 text-orange-200 font-black text-xs uppercase tracking-widest transition"
                >
                  🎭 Open Live Chat &amp; Monster Face Filters
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 grid grid-cols-3 gap-2.5">
              <div
                onClick={onOpenHauntedExhibition}
                className="rounded-xl overflow-hidden border border-emerald-500/40 bg-black/60 cursor-pointer group relative h-36"
              >
                <img
                  src="/generated/comics/pumpkin_patch_v4/char_3_portrait.jpg"
                  alt="Miriam & Flying Monkeys"
                  className="w-full h-full object-cover group-hover:scale-110 transition"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute bottom-1.5 inset-x-1.5 text-[9px] font-bold text-emerald-300 leading-tight">
                  🧙‍♀️ Miriam + Flying Monkeys Sky Flyover
                </div>
              </div>
              <div
                onClick={onOpenHauntedExhibition}
                className="rounded-xl overflow-hidden border border-orange-500/50 bg-black/60 cursor-pointer group relative h-36"
              >
                <img
                  src="/covers/halloween/pumpkin-patch-still.jpg"
                  alt="Pumpkin Patch Dual Plasma Blades"
                  className="w-full h-full object-cover group-hover:scale-110 transition"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute bottom-1.5 inset-x-1.5 text-[9px] font-bold text-orange-300 leading-tight">
                  ⚔️ Pumpkin Patch Dual Blades in the Road
                </div>
              </div>
              <div
                onClick={onOpenHauntedExhibition}
                className="rounded-xl overflow-hidden border border-purple-500/40 bg-black/60 cursor-pointer group relative h-36"
              >
                <img
                  src="/generated/comics/pumpkin_patch_v4/panel_014.jpg"
                  alt="26-Page Graphic Novel & Billboards"
                  className="w-full h-full object-cover group-hover:scale-110 transition"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                <div className="absolute bottom-1.5 inset-x-1.5 text-[9px] font-bold text-purple-200 leading-tight">
                  🪧 Movie Road Signs &amp; Dilapidated Billboards
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── PERSISTENT HALLOWEEN VAULT CHAT ROOM, FAN COVEN ROOM & REALISTIC MONSTER FILTERS ── */}
        <section id="halloween-vault-live-room">
          <HalloweenVaultChatAndFanRoom
            onOpenHauntedExhibition={onOpenHauntedExhibition}
            onPlayFilmById={handlePlayFilmById}
          />
        </section>

        {/* Curated Double Features */}
        <section>
          <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-400 mb-1.5">Curator Pairings</p>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">Halloween Double Features</h2>
            </div>
            <p className="text-xs text-white/40">Four themed twin-bills programmed for a full evening of terror</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {HALLOWEEN_DOUBLE_FEATURES.map(df => (
              <div
                key={df.id}
                className="rounded-2xl border border-white/10 hover:border-orange-500/40 bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-5 flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-300 text-[8px] font-black uppercase tracking-widest">
                      {df.theme}
                    </span>
                    <ShareButton
                      title={`${df.title} · Cinema Halloween Double Feature`}
                      artist={df.theme}
                      text={`${df.curatorPitch}`}
                      url={buildShareUrl('taleoCollection', 'halloween', { shelf: df.id })}
                      imageUrl={df.films[0]?.thumbnailUrl || halloweenShareImage}
                      contentType="movie"
                      ctaText="🎃 WATCH DOUBLE FEATURE ON TALEO"
                      plajahLabel="Share Double Feature to Plajah feed"
                      onPostToPlajah={() => handlePostHalloweenCollectionToPlajah(df.id, df.title)}
                      className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-orange-300 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Share2 size={11} /> Share Bill
                    </ShareButton>
                  </div>

                  <h3 className="text-lg font-black uppercase tracking-tight text-white mb-2">{df.title}</h3>
                  <p className="text-xs text-white/55 leading-relaxed mb-4">{df.curatorPitch}</p>

                  {/* Twin posters */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {df.films.map((f, idx) => (
                      <div
                        key={f.identifier}
                        onClick={() => onSelectArchiveItem(f)}
                        className="group cursor-pointer rounded-xl overflow-hidden border border-white/10 hover:border-orange-400/50 bg-black/40 relative aspect-[2/3]"
                      >
                        <img src={f.thumbnailUrl} alt={f.title} referrerPolicy="no-referrer" className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[7px] font-black uppercase tracking-widest text-orange-300">
                          Feature #{idx + 1}
                        </div>
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-[10px] font-black text-white leading-tight truncate">{f.title}</p>
                          <p className="text-[8px] text-white/50 font-bold uppercase">{f.year} · {f.runtime}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => onSelectArchiveItem(df.films[0])}
                    className="flex-1 h-9 rounded-xl bg-orange-500/20 hover:bg-orange-500 text-orange-200 hover:text-black border border-orange-500/30 font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Play size={11} fill="currentColor" /> Play #{1}
                  </button>
                  <button
                    onClick={() => onSelectArchiveItem(df.films[1])}
                    className="flex-1 h-9 rounded-xl bg-white/8 hover:bg-white/15 text-white/80 border border-white/10 font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Play size={11} fill="currentColor" /> Play #{2}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Mood / Shelf Filter Pills */}
        <section>
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-1.5">Annotated Filmography · Director Bios · Story Intelligence · Cast &amp; Characters</p>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
                All Curated Halloween Classics ({displayedFilms.length})
              </h2>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedShelfId('all')}
                className={`px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                  selectedShelfId === 'all'
                    ? 'bg-orange-500 text-black border-orange-400'
                    : 'bg-white/5 text-white/60 border-white/10 hover:text-white'
                }`}
              >
                All {CURATED_HALLOWEEN_FILMS.length} Classics
              </button>
              {HALLOWEEN_CURATED_SECTIONS.map(sec => (
                <button
                  key={sec.id}
                  onClick={() => setSelectedShelfId(sec.id)}
                  className={`px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                    selectedShelfId === sec.id
                      ? 'bg-orange-500 text-black border-orange-400'
                      : 'bg-white/5 text-white/60 border-white/10 hover:text-white'
                  }`}
                >
                  {sec.badge}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayedFilms.map(film => {
              const inWl = watchlist.some(w => w.id === film.identifier);
              const dirProfile = getDirectorProfile(film.director, film.identifier);
              const chars = getCharactersForFilm(film.identifier);
              const intel = getHalloweenStoryIntelBundle(film.identifier);
              return (
                <motion.div
                  key={film.identifier}
                  whileHover={{ y: -4 }}
                  className="rounded-2xl overflow-hidden border border-white/10 hover:border-orange-400/40 bg-white/[0.02] flex flex-col justify-between transition-all group"
                >
                  <div>
                    <div
                      onClick={() => onSelectArchiveItem(film)}
                      className="aspect-video relative overflow-hidden bg-black cursor-pointer"
                    >
                      <img
                        src={film.thumbnailUrl}
                        alt={film.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover opacity-85 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#131314] via-black/30 to-transparent" />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-orange-400/30 text-[8px] font-black uppercase tracking-widest text-orange-300">
                          {film.year} · {film.runtime}
                        </span>
                        {intel && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/85 text-black text-[7.5px] font-black uppercase tracking-widest">
                            Story Intel Ready
                          </span>
                        )}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/35">
                        <div className="w-12 h-12 rounded-full bg-orange-500 text-black flex items-center justify-center shadow-lg">
                          <Play size={18} fill="currentColor" className="ml-0.5" />
                        </div>
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3
                            onClick={() => onSelectArchiveItem(film)}
                            className="text-base font-black uppercase tracking-tight text-white group-hover:text-orange-300 transition-colors cursor-pointer"
                          >
                            {film.title}
                          </h3>
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#D0BCFF]/80 mt-0.5">
                            Directed by {film.director || 'Archival Master'}
                          </p>
                        </div>
                      </div>

                      {/* Clickable Director Portrait + Bio + Other Works Filmography Strip */}
                      {dirProfile && (
                        <div
                          onClick={() => setSelectedDirector(dirProfile)}
                          className="p-2.5 rounded-xl bg-amber-500/[0.07] hover:bg-amber-500/[0.14] border border-amber-500/25 flex items-center gap-3 cursor-pointer transition"
                        >
                          <EnrichedPortrait
                            name={dirProfile.name}
                            wikiSlug={dirProfile.wikiSlug}
                            fallbackUrl={dirProfile.portraitUrl}
                            className="w-10 h-12 rounded-lg ring-1 ring-amber-400/40"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-black text-amber-300 truncate">
                                {dirProfile.name}
                              </span>
                              <span className="text-[9px] font-bold text-amber-200/80 shrink-0">
                                {dirProfile.filmography.length} Films →
                              </span>
                            </div>
                            <p className="text-[10px] text-white/60 line-clamp-1">
                              {dirProfile.bio}
                            </p>
                            <p className="text-[9px] text-amber-300/75 truncate mt-0.5">
                              Other works:{' '}
                              {dirProfile.filmography
                                .filter(w => w.platformFilmId !== film.identifier)
                                .slice(0, 2)
                                .map(w => `${w.title} (${w.year})`)
                                .join(', ')}
                            </p>
                          </div>
                        </div>
                      )}

                      <p className="text-xs text-white/60 line-clamp-2 leading-relaxed">{film.description}</p>

                      {/* Characters & The Actors Behind Them Strip */}
                      {chars.length > 0 && (
                        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase tracking-widest text-orange-300">
                              Characters &amp; The Actors Behind Them ({chars.length})
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {chars.slice(0, 3).map(c => (
                              <div
                                key={c.id}
                                onClick={() => setSelectedCharModal({ char: c, filmTitle: film.title })}
                                className="flex items-center gap-2 p-1.5 rounded-lg bg-black/40 hover:bg-orange-500/15 border border-white/5 hover:border-orange-500/30 cursor-pointer transition"
                              >
                                <EnrichedPortrait
                                  name={c.actorName}
                                  wikiSlug={c.actorWikiSlug}
                                  fallbackUrl={c.actorPortraitUrl}
                                  className="w-7 h-7 rounded-full ring-1 ring-orange-400/40"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-black text-white truncate leading-tight">
                                    {c.characterName}{' '}
                                    <span className="text-orange-300 font-semibold">
                                      ({c.role})
                                    </span>
                                  </p>
                                  <p className="text-[9px] text-white/55 truncate leading-tight">
                                    Actor: <span className="text-amber-200 font-semibold">{c.actorName}</span>{' '}
                                    {c.actorYears ? `(${c.actorYears})` : ''}
                                  </p>
                                </div>
                                <ChevronRight size={12} className="text-orange-300 shrink-0" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {film.curatorNote && (
                        <div className="rounded-xl bg-white/[0.03] border border-white/8 p-3">
                          <p className="text-[8px] font-black uppercase tracking-widest text-orange-300 mb-1">Curator’s Note</p>
                          <p className="text-[11px] text-white/55 leading-relaxed line-clamp-2">{film.curatorNote}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-2 flex items-center gap-2">
                    <button
                      onClick={() => onSelectArchiveItem(film)}
                      className="flex-1 h-9 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Play size={12} fill="currentColor" /> Watch &amp; Story Intel
                    </button>
                    <button
                      onClick={() => onToggleWatchlist(film)}
                      title={inWl ? 'Remove from Watchlist' : 'Add to Watchlist'}
                      className={`h-9 px-3 rounded-xl border font-black text-[9px] uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer ${
                        inWl
                          ? 'bg-[#D0BCFF]/20 border-[#D0BCFF]/50 text-[#D0BCFF]'
                          : 'bg-white/5 hover:bg-white/10 border-white/15 text-white/70'
                      }`}
                    >
                      {inWl ? <Check size={12} /> : <Plus size={12} />}
                      {inWl ? 'Saved' : 'List'}
                    </button>
                    <ShareButton
                      title={`${film.title} (${film.year})`}
                      artist={film.director ? `Dir. ${film.director} · Cinema Halloween` : 'Cinema Halloween'}
                      text={`Watch "${film.title}" (${film.year}) free in the Plajah Halloween Curation`}
                      url={buildShareUrl('archive', film.identifier)}
                      imageUrl={film.thumbnailUrl}
                      contentType="movie"
                      ctaText="▶ STREAM CLASSIC ON TALEO"
                      plajahLabel="Share to Plajah feed"
                      onPostToPlajah={async () => {
                        if (!auth.currentUser) {
                          await loginWithGoogle();
                          if (!auth.currentUser) throw new Error('Sign in required');
                        }
                        await createPost({
                          text: `🎬 Streaming "${film.title}" (${film.year}${film.director ? `, dir. ${film.director}` : ''}) in the Plajah Halloween Curation!`,
                          isPublic: true,
                          tags: ['HalloweenCuration', 'Taleo', 'ClassicHorror'],
                          assetEmbed: {
                            type: 'ARCHIVE',
                            id: film.identifier,
                            title: `${film.title} (${film.year})`,
                            subtitle: `${film.director ? `Dir. ${film.director} · ` : ''}Cinema Halloween Curation`,
                            imageUrl: film.thumbnailUrl,
                          },
                          media: film.thumbnailUrl ? [{ type: 'PHOTO' as any, url: film.thumbnailUrl, title: film.title }] : undefined,
                        } as any);
                        onShareToast(`Shared "${film.title}" to Plajah feed!`);
                      }}
                      className="h-9 px-3 rounded-xl bg-white/5 hover:bg-white/15 border border-white/15 text-white/70 hover:text-white font-black text-[9px] uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Share2 size={12} /> Share
                    </ShareButton>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* Full Story Intelligence, Character & Actor Dossiers Across All Halloween Films */}
        <HalloweenCurationStoryIntelSection
          onPlayFilm={handlePlayFilmById}
          onOpenFilmStoryIntel={handlePlayFilmById}
        />

        {/* Halloween Auteurs: Director Portraits, Biographies & Filmographies */}
        <ClassicDirectorsShowcaseSection
          filterMovement="HALLOWEEN"
          onPlayFilm={handlePlayFilmById}
          title="Halloween Auteurs: Directors, Biographies & Filmographies"
          subtitle="Meet the masters of horror, silent expressionism, and psychological dread — with their portraits, biographies, and complete filmographies of other works."
        />
      </div>

      {selectedDirector && (
        <ClassicDirectorDossierModal
          director={selectedDirector}
          onClose={() => setSelectedDirector(null)}
          onPlayFilm={handlePlayFilmById}
        />
      )}

      {selectedCharModal && (
        <CharacterActorModal
          character={selectedCharModal.char}
          filmTitle={selectedCharModal.filmTitle}
          onClose={() => setSelectedCharModal(null)}
        />
      )}
    </div>
  );
};

// ── LibraryView ────────────────────────────────────────────────────────────────
const LibraryView: React.FC<{
  movies: ArchiveVideo[];
  localContent: Album[];
  watchlist: WatchlistItem[];
  onToggleWatchlist: (item: any) => void;
  onSelectArchiveItem: (item: ArchiveVideo) => void;
  onSelectMovie: (item: any) => void;
}> = ({ movies, localContent, watchlist, onToggleWatchlist, onSelectArchiveItem, onSelectMovie }) => {
  const [libraryFilter, setLibraryFilter] = useState<'ALL' | 'ANIME' | 'TV' | 'WORLD' | 'US_NOIR' | 'DIRECTOR_VAULT' | 'HALLOWEEN' | 'KOFA_EURO'>('ALL');

  const handleOpenWatchlistItem = async (w: WatchlistItem) => {
    const archMatch = [...ALL_CURATED_ARCHIVE_FILMS, ...movies].find(m => m.identifier === w.id);
    if (archMatch) { onSelectArchiveItem(archMatch); return; }
    const localMatch = localContent.find(a => a.id === w.id);
    if (localMatch) { onSelectMovie(localMatch); return; }
    const v = await fetchVideoById(w.id).catch(() => null);
    if (v) { onSelectMovie(v); return; }
    const alb = await fetchProjectFromCloud(w.id).catch(() => null);
    if (alb) { onSelectMovie(alb); return; }
    const remoteArch = await fetchArchiveVideoById(w.id).catch(() => null);
    if (remoteArch) onSelectArchiveItem(remoteArch);
  };

  const filteredVaultCatalog = useMemo(() => {
    switch (libraryFilter) {
      case 'ANIME':
        return CURATED_ANIME_AND_ANIMATION_FILMS;
      case 'TV':
        return CURATED_PUBLIC_DOMAIN_TV_SERIES;
      case 'WORLD':
        return CURATED_INTERNATIONAL_FILMS;
      case 'US_NOIR':
        return CURATED_US_CLASSIC_FILMS;
      case 'DIRECTOR_VAULT':
        return CURATED_DIRECTOR_VAULT_FILMS;
      case 'HALLOWEEN':
        return CURATED_HALLOWEEN_FILMS;
      case 'KOFA_EURO':
        return [...CURATED_KOFA_FILMS, ...CURATED_EUROPEANA_FILMS];
      case 'ALL':
      default:
        return ALL_CURATED_ARCHIVE_FILMS;
    }
  }, [libraryFilter]);

  const LIBRARY_FILTERS: Array<{ id: typeof libraryFilter; label: string; count: number }> = [
    { id: 'ALL', label: 'All Platform Vault', count: ALL_CURATED_ARCHIVE_FILMS.length },
    { id: 'ANIME', label: '🏯 Classic Anime & Cartoons', count: CURATED_ANIME_AND_ANIMATION_FILMS.length },
    { id: 'TV', label: '📺 TV Series & Serials', count: CURATED_PUBLIC_DOMAIN_TV_SERIES.length },
    { id: 'WORLD', label: '🌍 World Cinema', count: CURATED_INTERNATIONAL_FILMS.length },
    { id: 'US_NOIR', label: '🕵️ US Classics & Noir', count: CURATED_US_CLASSIC_FILMS.length },
    { id: 'DIRECTOR_VAULT', label: '🎬 Director Vault', count: CURATED_DIRECTOR_VAULT_FILMS.length },
    { id: 'HALLOWEEN', label: '🎃 Halloween Vault', count: CURATED_HALLOWEEN_FILMS.length },
    { id: 'KOFA_EURO', label: '🇰🇷 KOFA & 🇪🇺 Europeana', count: CURATED_KOFA_FILMS.length + CURATED_EUROPEANA_FILMS.length },
  ];

  return (
    <div className="pt-4 pb-40 px-4 sm:px-6 md:px-12 container mx-auto">
      <div className="mb-10 pt-8">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#FFB68D] mb-3">Your Collection</p>
        <h2 className="text-5xl md:text-7xl font-black leading-[0.9] uppercase tracking-tight text-white">
          My <span className="text-[#D0BCFF]">Library</span>
        </h2>
        <p className="mt-4 text-white/40 max-w-lg text-sm leading-relaxed">
          Your saved Watchlist, private movie &amp; TV locker, and the complete {ALL_CURATED_ARCHIVE_FILMS.length}-title On-Platform Public Domain Cinema, Anime &amp; TV Vault.
        </p>
      </div>

      {/* Saved Watchlist */}
      <div className="mb-12">
        <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#D0BCFF] mb-4">
          My Watchlist ({watchlist.length})
        </p>
        {watchlist.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
            <Bookmark size={28} className="text-white/15 mx-auto mb-2" />
            <p className="text-xs font-bold uppercase tracking-widest text-white/35">Your Watchlist is empty</p>
            <p className="text-[11px] text-white/25 mt-1">Click "+ Watchlist" on any film or series below or across Cinema to save it here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
            {watchlist.map(w => (
              <div key={`lib-wl-${w.id}`} className="relative group">
                <PosterCard
                  title={w.title}
                  subtitle={w.genre || 'Saved'}
                  image={w.thumbnailUrl}
                  genre={w.genre}
                  width="w-full"
                  onPlay={() => handleOpenWatchlistItem(w)}
                  accentBorder
                />
                <button
                  type="button"
                  title="Remove from Watchlist"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWatchlist({ id: w.id, title: w.title });
                  }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 hover:bg-rose-600 text-white/70 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plex-style private locker — upload & stream your own movie/TV collection */}
      <PersonalVideoLocker onPlay={onSelectMovie} />

      {/* Complete On-Platform Public Domain Cinema, Anime & TV Vault Library */}
      <div className="mt-14 mb-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[#3FBE85] mb-1.5">
              Native On-Platform Vault · 3-Tier Unbreakable Stream Resolution
            </p>
            <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-white">
              Platform Cinema, Anime &amp; TV Library ({filteredVaultCatalog.length})
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-4 mb-4">
          {LIBRARY_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setLibraryFilter(f.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                libraryFilter === f.id
                  ? 'bg-[#D0BCFF] text-[#1C1B1F] border-[#D0BCFF] shadow-lg'
                  : 'bg-white/5 hover:bg-white/10 text-white/65 border-white/10'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {filteredVaultCatalog.map(item => {
            const inWl = watchlist.some(w => w.id === item.identifier);
            const epCount = item.seasons?.reduce((acc, s) => acc + (s.episodes?.length || 0), 0);
            return (
              <div key={`lib-vault-${item.identifier}`} className="relative group">
                <PosterCard
                  title={item.title}
                  subtitle={epCount ? `${item.year} · ${epCount} Eps` : `${item.year || ''} · ${item.country || item.director || 'Classic'}`}
                  image={item.thumbnailUrl}
                  genre={item.genre}
                  directorName={item.director}
                  filmId={item.identifier}
                  width="w-full"
                  onPlay={() => onSelectArchiveItem(item)}
                  accentBorder
                />
                <button
                  type="button"
                  title={inWl ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleWatchlist(item);
                  }}
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all z-10 cursor-pointer border ${
                    inWl
                      ? 'bg-[#3FBE85] text-black border-[#3FBE85]'
                      : 'bg-black/75 hover:bg-[#D0BCFF] text-white hover:text-black border-white/20 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {inWl ? <Check size={13} /> : <Bookmark size={12} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

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
              <img src={thumb(coverGridSrc(video), THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(video.coverImage)} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={video.title} />
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
};

// ── FilmClubsView ──────────────────────────────────────────────────────────────
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
            onClick={() => { window.location.href = `/c/${encodeURIComponent(club.id)}`; }}
            className="group cursor-pointer rounded-2xl overflow-hidden bg-white/[0.03] border border-white/8 hover:border-[#D0BCFF]/40 transition-all"
          >
            <div className="aspect-[3/2] relative overflow-hidden">
              {club.coverImage ? (
                <img src={thumb(coverGridSrc(club), THUMB.card) || undefined} loading="lazy" decoding="async" onError={onThumbError(club.coverImage)} className="w-full h-full object-cover opacity-85 group-hover:opacity-100 transition-opacity" alt={club.name} />
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

// ── Stale-While-Revalidate Session Cache (eliminates remount skeleton flash & duplicate traffic) ──
interface TaleoSessionSnapshot {
  movies: ArchiveVideo[];
  tvSeries: ArchiveVideo[];
  genreCollections: GenreCollection[];
  curatedPlaylists: VideoPlaylist[];
  localContent: Album[];
  platformVideos: Video[];
  universes: Universe[];
  worlds: IPWorld[];
  featuredCharacters: Character[];
  filmClubs: Club[];
  featuredItem: ArchiveVideo | Album | null;
  lastSubView: SubView;
  updatedAt: number;
}

let taleoSessionCache: TaleoSessionSnapshot | null = null;
const TALEO_CACHE_TTL_MS = 5 * 60 * 1000;

// ── MoviesTVView ───────────────────────────────────────────────────────────────
const MoviesTVView: React.FC<MoviesTVViewProps> = ({ onBack, onSelectMovie, onNavigate }) => {
  const [movies, setMovies] = useState<ArchiveVideo[]>(() => taleoSessionCache?.movies ?? [
    ...CURATED_HALLOWEEN_FILMS,
    ...CURATED_ANIME_AND_ANIMATION_FILMS,
    ...CURATED_INTERNATIONAL_FILMS,
    ...CURATED_US_CLASSIC_FILMS,
    ...CURATED_DIRECTOR_VAULT_FILMS,
    ...CURATED_KOFA_FILMS,
    ...CURATED_EUROPEANA_FILMS,
  ]);
  const [tvSeries, setTvSeries] = useState<ArchiveVideo[]>(() => taleoSessionCache?.tvSeries ?? CURATED_PUBLIC_DOMAIN_TV_SERIES);
  const [genreCollections, setGenreCollections] = useState<GenreCollection[]>(() => taleoSessionCache?.genreCollections ?? []);
  const [curatedPlaylists, setCuratedPlaylists] = useState<VideoPlaylist[]>(() => taleoSessionCache?.curatedPlaylists ?? []);
  const [localContent, setLocalContent] = useState<Album[]>(() => taleoSessionCache?.localContent ?? []);
  const [platformVideos, setPlatformVideos] = useState<Video[]>(() => taleoSessionCache?.platformVideos ?? []);
  const [universes, setUniverses] = useState<Universe[]>(() => taleoSessionCache?.universes ?? []);
  const [worlds, setWorlds] = useState<IPWorld[]>(() => taleoSessionCache?.worlds ?? []);
  const [featuredCharacters, setFeaturedCharacters] = useState<Character[]>(() => taleoSessionCache?.featuredCharacters ?? []);
  const [activeAllyUrl, setActiveAllyUrl] = useState<string | null>(null);
  const [featuredItem, setFeaturedItem] = useState<ArchiveVideo | Album | null>(() => taleoSessionCache?.featuredItem ?? CURATED_HALLOWEEN_FILMS[0]);
  const [filmClubs, setFilmClubs] = useState<Club[]>(() => taleoSessionCache?.filmClubs ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(() => !taleoSessionCache);
  const [archiveLoading, setArchiveLoading] = useState<boolean>(() => !taleoSessionCache || taleoSessionCache.genreCollections.length === 0);
  const [currentSubView, setCurrentSubView] = useState<SubView>(() => {
    try {
      const deepSub = sessionStorage.getItem('plajah:taleo:initialSubView') as SubView | null;
      if (deepSub) {
        sessionStorage.removeItem('plajah:taleo:initialSubView');
        return deepSub;
      }
      const sp = new URLSearchParams(window.location.search);
      const col = sp.get('collection') || (sp.get('type') === 'taleo' ? (sp.get('id') || 'halloween') : '');
      if (col && col.toLowerCase().includes('halloween')) {
        return 'HALLOWEEN';
      }
    } catch {}
    return taleoSessionCache?.lastSubView ?? 'HOME';
  });
  const [activePlaylistItem, setActivePlaylistItem] = useState<any | null>(null);
  const [signInAction, setSignInAction] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const { setTheme } = useGlobalPlayerState();

  const triggerShareToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(prev => (prev === msg ? null : prev)), 3200);
  };

  // Remember sub-view across detail page visits
  useEffect(() => {
    if (taleoSessionCache) taleoSessionCache.lastSubView = currentSubView;
  }, [currentSubView]);

  // Listen for in-app OPEN_TALEO_COLLECTION events (e.g. clicking a shared Halloween Curation card in Plajah feed)
  useEffect(() => {
    const onOpenCollection = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const colId = String(detail.id || 'halloween').toLowerCase();
      if (colId.includes('halloween')) {
        setCurrentSubView('HALLOWEEN');
      }
    };
    window.addEventListener('OPEN_TALEO_COLLECTION', onOpenCollection);
    return () => window.removeEventListener('OPEN_TALEO_COLLECTION', onOpenCollection);
  }, []);

  // Load Watchlist & listen for changes
  useEffect(() => {
    const syncWl = () => { fetchWatchlist().then(setWatchlist).catch(() => {}); };
    syncWl();
    window.addEventListener('plajah:watchlist-changed', syncWl);
    return () => window.removeEventListener('plajah:watchlist-changed', syncWl);
  }, []);

  const handleToggleWatchlist = async (item: any) => {
    const id = item?.identifier || item?.id || item?._original?.id;
    if (!id) return;
    const exists = watchlist.some(w => w.id === id);
    if (exists) {
      await removeFromWatchlist(id);
      setWatchlist(prev => prev.filter(w => w.id !== id));
      triggerShareToast(`Removed "${item.title || 'item'}" from Watchlist`);
    } else {
      const entry = {
        id,
        title: item.title || 'Untitled',
        type: 'VIDEO' as const,
        thumbnailUrl: item.thumbnailUrl || item.coverImage || item._original?.thumbnailUrl || `https://archive.org/services/img/${id}`,
        genre: item.genre || 'Cinema',
      };
      await addToWatchlist(entry);
      setWatchlist(prev => [{ ...entry, addedAt: Date.now() }, ...prev.filter(w => w.id !== id)]);
      triggerShareToast(`Added "${entry.title}" to Watchlist`);
    }
  };

  const adaptedPlatformVideos = useMemo(() => platformVideos.map(v => {
    const isPumpkin =
      v.id === 'album_1787881859314_mlt23' ||
      (v as any).identifier === 'album_1787881859314_mlt23' ||
      /pumpkin\s*patch/i.test(v.title || '');
    const explicitYear = isPumpkin
      ? '2025'
      : (v as any).movieMetadata?.releaseYear
      ? String((v as any).movieMetadata.releaseYear)
      : (v as any).year
      ? String((v as any).year)
      : v.timestamp
      ? new Date(v.timestamp).getFullYear().toString()
      : '';
    return {
      identifier: v.id,
      title: v.title,
      genre: v.genre || '',
      thumbnailUrl: (v as any).muxPlaybackId
        ? `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=400&height=600&time=5`
        : (v as any).thumbnailUrl || (v as any).coverImageUrl || '',
      coverImage: (v as any).coverImageUrl || (v as any).thumbnailUrl || '',
      description: (v as any).description || '',
      year: explicitYear,
      ownerName: (v as any).ownerName || '',
      contentRating: (v as any).contentRating || (v as any).filmDistribution?.contentRating || '',
      timestamp: (v as any).timestamp || 0,
      _isPlatform: true as const,
      _original: isPumpkin
        ? {
            ...v,
            year: '2025',
            movieMetadata: { ...(v as any).movieMetadata, releaseYear: 2025 },
          }
        : v,
    };
  }), [platformVideos]);

  const searchResults = useMemo<any[]>(() => {
    if (searchQuery.trim().length < 2) return [];
    const q = searchQuery.toLowerCase().trim();
    const archiveItems = [
      ...ALL_CURATED_ARCHIVE_FILMS,
      ...movies,
      ...tvSeries,
      ...genreCollections.flatMap(g => g.items ?? []),
    ].filter(Boolean).filter((item, idx, self) => self.findIndex(i => i.identifier === item.identifier) === idx);
    const combined = [...archiveItems, ...adaptedPlatformVideos];
    return combined.filter(item => {
      const title = String(Array.isArray(item.title) ? item.title[0] : item.title || '').toLowerCase();
      const genre = String(Array.isArray(item.genre) ? item.genre[0] : item.genre || '').toLowerCase();
      const director = String((item as any).director || (item as any).ownerName || '').toLowerCase();
      const country = String((item as any).country || '').toLowerCase();
      const year = String(item.year || '').toLowerCase();
      const isHalloweenMatch = (q === 'halloween' || q === 'spooky') && CURATED_HALLOWEEN_FILMS.some(h => h.identifier === item.identifier);
      const isAnimeMatch = (q === 'anime' || q === 'animation' || q === 'cartoon' || q === 'japanese') && CURATED_ANIME_AND_ANIMATION_FILMS.some(a => a.identifier === item.identifier);
      return isHalloweenMatch || isAnimeMatch || title.includes(q) || genre.includes(q) || director.includes(q) || country.includes(q) || year.includes(q);
    }).slice(0, 48);
  }, [searchQuery, movies, tvSeries, genreCollections, adaptedPlatformVideos]);

  useEffect(() => {
    setTheme('DARK');
    void hydrateSelfHostedFilmsFromServer().catch(() => {});
    const isFresh = taleoSessionCache && (Date.now() - taleoSessionCache.updatedAt < TALEO_CACHE_TTL_MS);
    if (!isFresh) {
      loadContent(!taleoSessionCache);
    }
    return () => setTheme('DARK');
  }, []);

  const TALEO_GENRES = ['Movie', 'Short Film', 'TV Series', 'Short', 'Teaser', 'Trailer', 'Feature Film'];

  const loadContent = async (showSpinner = true) => {
    let nextLocalContent = localContent;
    let nextPlatformVideos = platformVideos;
    let nextUniverses = universes;
    let nextCuratedPlaylists = curatedPlaylists;
    let nextFilmClubs = filmClubs;
    let nextFeaturedChars = featuredCharacters;

    try {
      if (showSpinner) setIsLoading(true);
      // Phase 1: fast Firestore calls — each guarded with .catch() so a single error never blanks Taleo
      const [all, unis, settings, allPlatformVideos] = await Promise.all([
        fetchAllPublicAlbums().catch(() => [] as Album[]),
        fetchUniverses().catch(() => [] as Universe[]),
        fetchSystemSettingsConfig().catch(() => null as any),
        fetchAllVideos().catch(() => [] as Video[]),
      ]);

      const normalizePumpkinYear = <T extends Record<string, any>>(item: T): T => {
        if (
          item?.id === 'album_1787881859314_mlt23' ||
          item?.identifier === 'album_1787881859314_mlt23' ||
          /pumpkin\s*patch/i.test(item?.title || '')
        ) {
          return {
            ...item,
            year: '2025',
            movieMetadata: {
              ...(item.movieMetadata || {}),
              releaseYear: 2025,
            },
          };
        }
        return item;
      };

      const cinemaVideos = allPlatformVideos
        .filter(v => (v.genre && TALEO_GENRES.includes(v.genre)) || (v as any).subType === 'MOVIE' || (v as any).subType === 'TV_SERIES')
        .map(normalizePumpkinYear);
      nextPlatformVideos = cinemaVideos;
      nextLocalContent = all.filter(a => a.type === 'VIDEO').map(normalizePumpkinYear);
      nextUniverses = unis;

      setPlatformVideos(cinemaVideos);
      setLocalContent(nextLocalContent);
      setUniverses(unis);

      if (settings?.curatedVideoPlaylists?.length > 0) {
        fetchVideoPlaylistsByIds(settings.curatedVideoPlaylists)
          .then(curPls => {
            nextCuratedPlaylists = curPls;
            setCuratedPlaylists(curPls);
            if (taleoSessionCache) taleoSessionCache.curatedPlaylists = curPls;
          })
          .catch(() => {});
      }

      fetchPublicClubs('Film')
        .then(clubs => {
          nextFilmClubs = clubs.slice(0, 8);
          setFilmClubs(nextFilmClubs);
          if (taleoSessionCache) taleoSessionCache.filmClubs = nextFilmClubs;
        })
        .catch(() => {});

      // Fetch characters — non-blocking
      const worldIds = [...new Set(
        cinemaVideos.filter(v => (v as any).worldId).map(v => (v as any).worldId as string)
      )].slice(0, 4);
      if (worldIds.length > 0) {
        Promise.all(worldIds.map(id => fetchWorldCharacters(id).catch(() => [])))
          .then(charArrays => {
            nextFeaturedChars = charArrays.flat().filter(c => c.imageUrl).slice(0, 12);
            setFeaturedCharacters(nextFeaturedChars);
            if (taleoSessionCache) taleoSessionCache.featuredCharacters = nextFeaturedChars;
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }

    // Phase 2: cached Archive.org + public worlds — load in background
    try {
      const [allGenres, publicWorlds] = await Promise.all([
        fetchArchiveByAllGenres(15).catch(() => [{ genre: '🎃 Halloween Cinema', items: CURATED_HALLOWEEN_FILMS }]),
        fetchAllPublicWorlds().catch(() => [] as IPWorld[]),
      ]);
      const featureGenre = allGenres.find(g => g.genre === 'Feature Films');
      const tvGenre = allGenres.find(g => g.genre === 'Classic TV');
      const euroGenre = allGenres.find(g => g.genre === 'European Cinema');
      const kofaGenre = allGenres.find(g => g.genre === 'Korean Classic Cinema');
      const euroTvGenre = allGenres.find(g => g.genre === 'European Newsreels & TV');

      const mergedMovies = [
        ...CURATED_HALLOWEEN_FILMS,
        ...CURATED_ANIME_AND_ANIMATION_FILMS,
        ...CURATED_INTERNATIONAL_FILMS,
        ...CURATED_US_CLASSIC_FILMS,
        ...CURATED_DIRECTOR_VAULT_FILMS,
        ...(featureGenre?.items ?? []),
        ...(euroGenre?.items ?? []),
        ...(kofaGenre?.items ?? []),
      ].filter((item, idx, self) => self.findIndex(i => i.identifier === item.identifier) === idx);

      const mergedTv = [
        ...CURATED_PUBLIC_DOMAIN_TV_SERIES,
        ...(tvGenre?.items ?? []),
        ...(euroTvGenre?.items ?? []),
      ].filter((item, idx, self) => self.findIndex(i => i.identifier === item.identifier) === idx);

      const nextFeatured = (featureGenre?.items?.[0]) || CURATED_HALLOWEEN_FILMS[0] || null;

      setGenreCollections(allGenres);
      setMovies(mergedMovies);
      setTvSeries(mergedTv);
      setWorlds(publicWorlds);
      if (nextFeatured) setFeaturedItem(prev => prev ?? nextFeatured);

      taleoSessionCache = {
        movies: mergedMovies,
        tvSeries: mergedTv,
        genreCollections: allGenres,
        curatedPlaylists: nextCuratedPlaylists,
        localContent: nextLocalContent,
        platformVideos: nextPlatformVideos,
        universes: nextUniverses,
        worlds: publicWorlds,
        featuredCharacters: nextFeaturedChars,
        filmClubs: nextFilmClubs,
        featuredItem: nextFeatured,
        lastSubView: currentSubView,
        updatedAt: Date.now(),
      };
    } catch (err) {
      console.error('[Cinema] Archive fetch failed:', err);
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
    // PeerTube films stream from their home server; never vault-sync or ingest them.
    if (isPeerTubeItem(item)) {
      const full = await resolvePeerTubeVideo(item.identifier).catch(() => ({ streamUrl: '', description: undefined }));
      onSelectMovie(peerTubeVideoToAlbum({ ...item, description: full.description || item.description }, full.streamUrl));
      return;
    }
    let videoUrl = item.videoUrl;
    if (!videoUrl && (!item.source || item.source === 'INTERNET_ARCHIVE')) {
      try {
        const files = await getArchiveItemFiles(item.identifier);
        videoUrl = getBestVideoUrl(item.identifier, files) || undefined;
      } catch {}
    }
    if (videoUrl) {
      void syncPublicDomainAsset(item, videoUrl, 'VIDEO').catch(() => {});
    }
    void ensureFilmNativelyOnPlatform({
      ...item,
      videoUrl: videoUrl || item.videoUrl,
    }).catch(() => {});
    const transformed = archiveVideoToAlbum(item, videoUrl);
    onSelectMovie(transformed);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#131314]">
        <TaleoTabNav currentSubView="HOME" setCurrentSubView={() => {}} onNavigate={onNavigate} />
        <div className="h-[80vh] bg-gradient-to-br from-[#1C1B2E] to-[#131314] animate-pulse" />
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

  const SEARCH_QUICK_PILLS = [
    { label: '🎃 Halloween Horror', query: 'Halloween' },
    { label: '🏯 Classic Anime', query: 'Anime' },
    { label: 'Film Noir', query: 'Film Noir' },
    { label: 'Sci-Fi', query: 'Sci-Fi' },
    { label: 'Silent Cinema', query: 'Silent' },
    { label: 'Thriller', query: 'Thriller' },
    { label: 'Comedy', query: 'Comedy' },
    { label: 'Documentary', query: 'Documentary' },
  ];

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
                placeholder="Search movies, directors, genres, Halloween classics…"
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
            <span className="flex-1 text-sm font-black uppercase tracking-[0.3em] text-white/80">Cinema</span>
            <button
              onClick={() => setCurrentSubView('HALLOWEEN')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/35 text-orange-300 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              <Ghost size={12} /> Halloween Vault
            </button>
            <button
              onClick={() => setCurrentSubView('HAUNTED_EXHIBIT')}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer"
            >
              <Flame size={12} className="text-orange-400" /> 🏰 Haunted Crossroads 3D
            </button>
            <button className="text-white/60 hover:text-white transition-colors p-2 rounded-xl hover:bg-white/5" onClick={() => setShowSearch(true)}>
              <Search size={20} />
            </button>
          </>
        )}
      </header>

      {/* Share / Watchlist Toast Notification */}
      <AnimatePresence>
        {shareToast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] px-5 py-3 rounded-full bg-[#1C1B1F] border border-orange-400/40 text-white text-xs font-black uppercase tracking-widest shadow-2xl flex items-center gap-2.5"
          >
            <Check size={14} className="text-orange-400" />
            <span>{shareToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search overlay */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 top-16 z-40 bg-[#131314] overflow-y-auto pb-40"
          >
            <div className="px-4 sm:px-6 md:px-12 pt-6">
              {/* Instant filter pills */}
              <div className="flex items-center gap-2 flex-wrap mb-6">
                {SEARCH_QUICK_PILLS.map(pill => (
                  <button
                    key={pill.label}
                    onClick={() => setSearchQuery(pill.query)}
                    className={`px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                      searchQuery.toLowerCase() === pill.query.toLowerCase()
                        ? 'bg-orange-500 text-black border-orange-400'
                        : 'bg-white/5 hover:bg-white/10 text-white/65 border-white/10'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {searchQuery.trim().length < 2 ? (
                <div className="space-y-6">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-orange-300">
                    🎃 Featured Halloween &amp; Archive Classics
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {CURATED_HALLOWEEN_FILMS.map(item => (
                      <PosterCard
                        key={`search-default-${item.identifier}`}
                        title={item.title}
                        subtitle={`${item.year} · ${item.director || 'Horror'}`}
                        image={item.thumbnailUrl}
                        genre={item.genre}
                        width="w-full"
                        onPlay={() => {
                          handleSelectArchiveItem(item);
                          setShowSearch(false);
                          setSearchQuery('');
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                  <Film size={40} className="text-white/10" />
                  <p className="text-sm font-black uppercase tracking-widest text-white/20">No results for "{searchQuery}"</p>
                </div>
              ) : (
                <div>
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
            </div>
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
                localContent={localContent}
                worlds={worlds}
                featuredCharacters={featuredCharacters}
                filmClubs={filmClubs}
                onNavigate={onNavigate}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onShareToast={triggerShareToast}
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
          {currentSubView === 'HALLOWEEN' && (
            <div className="pt-16">
              {tabNavEl}
              <HalloweenShowcaseView
                onSelectArchiveItem={handleSelectArchiveItem}
                onSelectMovie={onSelectMovie}
                localContent={localContent}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onShareToast={triggerShareToast}
                onOpenHauntedExhibition={() => setCurrentSubView('HAUNTED_EXHIBIT')}
              />
            </div>
          )}
          {currentSubView === 'HAUNTED_EXHIBIT' && (
            <div className="pt-16">
              {tabNavEl}
              <RavencrestGameFrame
                onBack={() => setCurrentSubView('HALLOWEEN')}
                onWatch={(filmId) => {
                  // Chosen in the game: the film page opens straight into playback (ident first);
                  // backing out of the player lands on that film's page.
                  requestAutoplay();
                  if (filmId === PUMPKIN_PATCH_HERO_ALBUM.id) { onSelectMovie(PUMPKIN_PATCH_HERO_ALBUM); return; }
                  const film = CURATED_HALLOWEEN_FILMS.find((f) => f.identifier === filmId);
                  if (film) handleSelectArchiveItem(film);
                }}
                classic={
                  <HauntedCastleExhibition
                    onBackToVault={() => setCurrentSubView('HALLOWEEN')}
                    onPlayPumpkinPatch={() => onSelectMovie(PUMPKIN_PATCH_HERO_ALBUM)}
                    onSelectArchiveFilm={handleSelectArchiveItem}
                    onOpenChatRoom={() => setCurrentSubView('HALLOWEEN')}
                  />
                }
              />
            </div>
          )}
          {currentSubView === 'TV' && (
            <div className="pt-16">
              {tabNavEl}
              <TelevisionView
                series={[...tvSeries, ...localContent.filter(c => c.subType === 'TV_SERIES' || c.tags?.includes('tv'))]}
                initialSelectedSeries={activePlaylistItem}
                onSelect={(item) => {
                  if (item && ('identifier' in item || item.mediatype === 'movies')) {
                    handleSelectArchiveItem(item);
                  } else {
                    onSelectMovie(item);
                  }
                }}
              />
            </div>
          )}
          {currentSubView === 'CURATOR' && (
            <div className="pt-16">
              {tabNavEl}
              <TaleoFilmCurator
                onSelectArchiveItem={handleSelectArchiveItem}
                onSelectMovie={onSelectMovie}
                onBack={() => setCurrentSubView('HOME')}
              />
            </div>
          )}
          {currentSubView === 'MOVIES' && (
            <div className="pt-16">
              {tabNavEl}
              <MoviesSpecificView
                movies={movies}
                localContent={localContent}
                onSelect={(item) => {
                  if (item && ('identifier' in item || item.mediatype === 'movies')) {
                    handleSelectArchiveItem(item);
                  } else {
                    onSelectMovie(item);
                  }
                }}
              />
            </div>
          )}
          {currentSubView === 'UNIVERSE' && (
            <div className="pt-16">
              {tabNavEl}
              <TaleoUniverseBrowser
                worlds={worlds}
                videos={platformVideos}
                universes={universes}
                onSelectVideo={onSelectMovie}
                onOpenAlly={(url) => { setActiveAllyUrl(url); setCurrentSubView('ALLY_VIEW'); }}
                onOpenWorlds={onNavigate ? () => onNavigate('WORLDS') : undefined}
              />
            </div>
          )}
          {currentSubView === 'HIVE' && (
            <div className="pt-16">
              {tabNavEl}
              <ExploreView
                movies={movies}
                tvSeries={tvSeries}
                localContent={localContent}
                onSelect={(item) => {
                  if (item && ('identifier' in item || item.mediatype === 'movies')) {
                    handleSelectArchiveItem(item);
                  } else {
                    onSelectMovie(item);
                  }
                }}
              />
            </div>
          )}
          {currentSubView === 'LIBRARY' && (
            <div className="pt-16">
              {tabNavEl}
              <LibraryView
                movies={movies}
                localContent={localContent}
                watchlist={watchlist}
                onToggleWatchlist={handleToggleWatchlist}
                onSelectArchiveItem={handleSelectArchiveItem}
                onSelectMovie={onSelectMovie}
              />
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
