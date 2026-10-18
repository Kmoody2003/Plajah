import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PageHeader from './PageHeader';
import PlajahPlusButton from './PlajahPlusButton';
import {
  Plus,
  Users,
  Scroll,
  History,
  Edit3,
  Eye,
  Globe,
  Lock,
  Unlock,
  Sparkles,
  LayoutGrid,
  ArrowLeft,
  ChevronRight,
  BookOpen,
  Zap,
  Network,
  Box,
  Music2,
  MapPin,
  Calendar,
  Volume2,
  VolumeX,
  Image as ImageIcon,
  Play,
  Cpu,
  GitMerge,
  CheckCircle2,
  Film,
  PenTool,
  Layers,
  Search,
} from 'lucide-react';
import {
  IPWorld,
  Character,
  LoreEntry,
  TimelineEvent,
  UserProfile,
  AppView,
  Video,
  Album,
} from '../types';
import {
  fetchUserWorlds,
  fetchWorldCharacters,
  fetchWorldLore,
  fetchWorldTimeline,
  publishWorld,
  auth,
  fetchAllPublicAlbums,
  fetchUserVideos,
  fetchAllPublicWorlds,
  seedDemoWorlds,
  createIPWorld,
} from '../services/backendService';
import {
  detectDuplicates,
  mergeEntries,
  DuplicateCluster,
} from '../services/worldHub';
import { onAuthStateChanged } from 'firebase/auth';
import WorldGraphView from './WorldGraphView';
import CharacterDetailModal from './CharacterDetailModal';
import { HoldNavigate } from './HoldNavigate';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import ChipRail from './ui/ChipRail';
import {
  Universe3DCoverId,
  UNIVERSE_3D_COVER_PRESETS,
  SHOWCASE_WORLDS,
  ShowcaseWorld,
  STORY_INTEL_PIPELINE_STEPS,
} from '../data/worldsShowcaseData';
import { UniverseHero3DStage } from './Worlds/UniverseHero3DStage';
import { WorldsLandingPortalView } from './Worlds/WorldsLandingPortalView';

export interface WorldsViewProps {
  onNavigate?: (view: AppView | any) => void;
  onEdit?: (world: IPWorld) => void;
  userProfile?: UserProfile | null;
  artistUid?: string;
  onSelectAlbum?: (album: Album) => void;
  onSelectVideo?: (video: Video) => void;
  /** One-shot deep-open: land on this world (and open this character's entry). */
  focus?: { worldId?: string; characterId?: string; tab?: string } | null;
  onFocusConsumed?: () => void;
  onOpenWorldInApp?: (
    worldId: string,
    app: 'FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO'
  ) => void;
}

type WorldDetailTab = 'Overview' | 'Characters' | 'Lore' | 'Timeline' | 'Graph' | 'WorldHub';

const STUDIO_APPS: {
  app: 'FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO';
  name: string;
  role: string;
  viewTarget: string;
  icon: React.FC<{ className?: string; size?: number }>;
  accent: string;
}[] = [
  {
    app: 'FABULA',
    name: 'Fabula',
    role: 'Story Architect & Beat Board',
    viewTarget: 'FABULA',
    icon: Sparkles,
    accent: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
  },
  {
    app: 'LOREA_BOOK',
    name: 'Lorea Book',
    role: 'Novel & Manuscript Studio',
    viewTarget: 'BOOK_STUDIO',
    icon: BookOpen,
    accent: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
  },
  {
    app: 'LOREA_SCRIPT',
    name: 'Lorea Script',
    role: 'Screenplay & Showrunner',
    viewTarget: 'SCRIPT_STUDIO',
    icon: Film,
    accent: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
  },
  {
    app: 'CHORA',
    name: 'Chora',
    role: 'Orchestral & Leitmotif Score',
    viewTarget: 'LIVING_COMPOSER',
    icon: Music2,
    accent: 'text-purple-400 border-purple-500/30 bg-purple-500/10',
  },
  {
    app: 'TALEO',
    name: 'Taleo',
    role: 'Cinema & Living Graphic Novel',
    viewTarget: 'COMIC_BUILDER',
    icon: PenTool,
    accent: 'text-rose-400 border-rose-500/30 bg-rose-500/10',
  },
];

// ── Synthesize rich canonical Characters, Lore, Timeline, Albums & Videos for Showcase Worlds ──
function getShowcaseEntities(world: ShowcaseWorld): {
  characters: Character[];
  lore: LoreEntry[];
  timeline: TimelineEvent[];
  albums: Album[];
  videos: Video[];
} {
  const chars: Character[] = world.featuredCharacters.map((fc, idx) => ({
    id: fc.id,
    worldId: world.id,
    name: fc.name,
    role: fc.role,
    bio: `${fc.name} serves as ${fc.role} within ${fc.faction}. Canonical crossover protagonist tracked across Fabula, Lorea, Chora, and Taleo via Story Intelligence.`,
    imageUrl: fc.avatarUrl,
    tags: [fc.faction, fc.role, 'Story Intel Canonical'],
    isPublished: true,
    accentColor: idx === 0 ? '#22d3ee' : '#f59e0b',
    stats: { Affinity: 98, Appearances: 6, CanonLock: 100 },
    gallery: [fc.avatarUrl, world.coverImage],
    relationships:
      world.featuredCharacters.length > 1
        ? [
            {
              characterId: world.featuredCharacters[(idx + 1) % world.featuredCharacters.length].id,
              type: 'ALLY',
              note: 'Sworn covenant across the main narrative arc.',
            },
          ]
        : [],
  }));

  // Also include any character entries from world.entries not already in featuredCharacters
  for (const e of world.entries.filter((x) => x.category === 'characters')) {
    if (!chars.some((c) => c.name.toLowerCase() === e.name.toLowerCase())) {
      chars.push({
        id: e.id,
        worldId: world.id,
        name: e.name,
        role: 'Principal Cast',
        bio: e.description,
        imageUrl: e.imageUrl || world.coverImage,
        tags: e.tags,
        isPublished: true,
        accentColor: '#a855f7',
        stats: { Affinity: 94 },
      });
    }
  }

  const lore: LoreEntry[] = world.entries
    .filter((e) => e.category !== 'characters')
    .map((e) => ({
      id: e.id,
      worldId: world.id,
      title: e.name,
      content: e.description,
      tags: e.tags,
      type:
        e.category === 'locations'
          ? 'LOCATION'
          : e.category === 'factions'
          ? 'FACTION'
          : 'BACKSTORY',
      conflictsDetected: [],
      isPublished: true,
      gallery: e.imageUrl ? [e.imageUrl] : [world.coverImage],
      sourceApp: 'FABULA',
    }));

  const timeline: TimelineEvent[] = [
    {
      id: `${world.id}-ev-1`,
      worldId: world.id,
      year: 120,
      title: `The First Awakening of ${world.name}`,
      description: `The foundational covenant establishing the core realms and laws of ${world.name}.`,
      significance: 'PIVOTAL',
      linkedCharacterIds: chars.map((c) => c.id),
      gallery: [world.coverImage],
      isPublished: true,
    },
    {
      id: `${world.id}-ev-2`,
      worldId: world.id,
      year: 1450,
      title: 'The Fracture of the High Concord',
      description:
        'Rival factions contested control of the primary nexus, splitting the realm into autonomous sectors.',
      significance: 'MAJOR',
      linkedCharacterIds: chars.slice(0, 1).map((c) => c.id),
      isPublished: true,
    },
    {
      id: `${world.id}-ev-3`,
      worldId: world.id,
      year: 2890,
      title: 'Convergence of the Nine Chevrons',
      description:
        'Present-day narrative era where all active Fabula films, Lorea manuscripts, and Chora scores intersect.',
      significance: 'PIVOTAL',
      linkedCharacterIds: chars.map((c) => c.id),
      gallery: [world.coverImage],
      isPublished: true,
    },
  ];

  const albums: Album[] = [
    {
      id: `${world.id}-album-1`,
      title: `${world.name} — Original Orchestral Score`,
      artist: 'Chora Symphony',
      coverImage: world.coverImage,
      releaseYear: '2026',
      genre: 'Soundtrack',
      worldId: world.id,
      characterIds: chars.map((c) => c.id),
      tracks: [
        {
          id: `${world.id}-trk-1`,
          title: 'Overture of the First Gate',
          artist: 'Chora Symphony',
          duration: '4:12',
          audioUrl: '',
        },
      ],
    } as any,
  ];

  const videos: Video[] = [
    {
      id: `${world.id}-vid-1`,
      ownerId: world.creatorId,
      title: `${world.name} — Feature Pilot & Story Intel Master Cut`,
      url: '',
      thumbnailUrl: world.coverImage,
      coverImageUrl: world.coverImage,
      description: world.description,
      duration: 3420,
      genre: world.genre,
      worldId: world.id,
      characterIds: chars.map((c) => c.id),
      timestamp: Date.now(),
    },
  ];

  return { characters: chars, lore, timeline, albums, videos };
}

// ── World Background ──────────────────────────────────────────────────────────
function WorldBackground({ world }: { world: IPWorld | null }) {
  const [slideIdx, setSlideIdx] = useState(0);
  const cfg = world?.backgroundConfig;

  useEffect(() => {
    setSlideIdx(0);
    if (cfg?.type !== 'SLIDESHOW' || !cfg.images?.length) return;
    const interval = cfg.slideshowInterval ?? 5000;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % cfg.images!.length), interval);
    return () => clearInterval(t);
  }, [world?.id, cfg?.type]);

  if (!cfg && !world?.themeConfig?.customBackgroundImage) return null;

  if (cfg?.type === 'VIDEO' && cfg.videoUrl) {
    return (
      <video
        src={cfg.videoUrl}
        autoPlay
        loop
        muted
        playsInline
        className="fixed inset-0 w-full h-full object-cover -z-20 pointer-events-none"
        style={{ opacity: cfg.opacity ?? 0.4 }}
      />
    );
  }

  const images =
    cfg?.type === 'SLIDESHOW'
      ? cfg.images ?? []
      : cfg?.images?.length
      ? [cfg.images[0]]
      : world?.themeConfig?.customBackgroundImage
      ? [world.themeConfig.customBackgroundImage]
      : [];

  if (!images.length) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={slideIdx}
        initial={{ opacity: 0 }}
        animate={{ opacity: cfg?.opacity ?? 0.4 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1.2 }}
        className="fixed inset-0 -z-20 pointer-events-none"
        style={{
          backgroundImage: `url(${images[slideIdx % images.length]})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          filter: cfg?.blur ? 'blur(4px)' : undefined,
        }}
      />
    </AnimatePresence>
  );
}

// ── Ambient Music Bar ─────────────────────────────────────────────────────────
function WorldMusicBar({ world, albums }: { world: IPWorld | null; albums: Album[] }) {
  const { playTrack, currentAlbum, isPlaying, pause, resume } = useGlobalPlayerState();
  const [visible, setVisible] = useState(false);

  const bgAlbum = albums.find((a) => a.id === world?.backgroundMusicAlbumId);

  useEffect(() => {
    setVisible(!!bgAlbum);
  }, [bgAlbum?.id]);

  if (!bgAlbum || !visible) return null;

  const isThisAlbumPlaying = currentAlbum?.id === bgAlbum.id && isPlaying;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-5 py-3 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl"
    >
      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
        <img src={bgAlbum.coverImage} className="w-full h-full object-cover" alt="" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">
          World Ambient
        </p>
        <p className="text-xs font-black text-white truncate max-w-[160px]">{bgAlbum.title}</p>
      </div>
      <button
        onClick={() => {
          if (isThisAlbumPlaying) {
            pause();
          } else if (currentAlbum?.id === bgAlbum.id) {
            resume();
          } else if (bgAlbum.tracks?.[0]) {
            playTrack(bgAlbum.tracks[0], bgAlbum, 'LIBRARY');
          }
        }}
        className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0"
      >
        {isThisAlbumPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <button
        onClick={() => setVisible(false)}
        className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 text-[10px]"
      >
        ✕
      </button>
    </motion.div>
  );
}

// ── Lore Expanded Panel ───────────────────────────────────────────────────────
function LoreDetailPanel({ entry, onClose }: { entry: LoreEntry; onClose: () => void }) {
  const [imgIdx, setImgIdx] = useState(0);
  const images = entry.gallery ?? [];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-3xl bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] overflow-hidden max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b border-white/5 flex items-center gap-4">
          <div className="w-10 h-10 bg-small-orange/20 rounded-2xl flex items-center justify-center text-small-orange flex-shrink-0">
            {entry.type === 'LOCATION' ? <MapPin size={18} /> : <Scroll size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30">
              {entry.type}
            </p>
            <h3 className="text-xl font-black uppercase tracking-tight text-white">
              {entry.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-3 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-8 space-y-8">
          {images.length > 0 && (
            <div className="space-y-3">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
                <img src={images[imgIdx]} className="w-full h-full object-cover" alt="" />
                {images.length > 1 && (
                  <div className="absolute bottom-3 right-3 flex gap-1">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${
                          i === imgIdx ? 'bg-white' : 'bg-white/20'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {(entry.clips?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/20">
                Video Clips
              </p>
              <div className="grid grid-cols-2 gap-3">
                {entry.clips!.map((url, i) => (
                  <video key={i} src={url} controls className="w-full rounded-xl bg-black" />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20">
              Chronicle
            </p>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
              {entry.content}
            </p>
          </div>

          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-white/5 text-white/30 text-[7px] font-black uppercase tracking-widest rounded-full border border-white/5"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Event Detail Panel ────────────────────────────────────────────────────────
function EventDetailPanel({
  event,
  characters,
  onClose,
}: {
  event: TimelineEvent;
  characters: Character[];
  onClose: () => void;
}) {
  const images = event.gallery ?? [];
  const SIGNIFICANCE_COLOR: Record<string, string> = {
    MINOR: 'text-white/40',
    MAJOR: 'text-yellow-400',
    PIVOTAL: 'text-red-400',
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] overflow-hidden max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-8 border-b border-white/5 flex items-center gap-4">
          <div className="w-10 h-10 bg-small-orange/20 rounded-2xl flex items-center justify-center text-small-orange flex-shrink-0">
            <Calendar size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-[8px] font-black uppercase tracking-widest mb-0.5 ${
                event.significance
                  ? SIGNIFICANCE_COLOR[event.significance]
                  : 'text-small-orange/60'
              }`}
            >
              {event.year} {event.significance ? `· ${event.significance}` : ''}
            </p>
            <h3 className="text-xl font-black uppercase tracking-tight text-white">
              {event.title}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-3 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-8 space-y-6">
          {images.length > 0 && (
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
              <img src={images[0]} className="w-full h-full object-cover" alt="" />
            </div>
          )}
          <p className="text-sm text-white/70 leading-relaxed">{event.description}</p>
          {(event.linkedCharacterIds?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/20">
                Involved Characters
              </p>
              <div className="flex flex-wrap gap-2">
                {event.linkedCharacterIds!.map((id) => {
                  const c = characters.find((ch) => ch.id === id);
                  return c ? (
                    <div
                      key={id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10"
                    >
                      <img src={c.imageUrl} className="w-5 h-5 rounded-full object-cover" alt="" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/60">
                        {c.name}
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Main WorldsView Component ─────────────────────────────────────────────────
export const WorldsView: React.FC<WorldsViewProps> = ({
  onNavigate,
  onEdit,
  userProfile,
  artistUid = '',
  onSelectAlbum,
  onSelectVideo,
  focus,
  onFocusConsumed,
  onOpenWorldInApp,
}) => {
  const [worlds, setWorlds] = useState<IPWorld[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<(IPWorld | ShowcaseWorld) | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [lore, setLore] = useState<LoreEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateCluster[]>([]);

  const [activeTab, setActiveTab] = useState<WorldDetailTab>('Overview');
  const [viewMode, setViewMode] = useState<'GALLERY' | 'DETAIL'>('GALLERY');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDiscoverMode, setIsDiscoverMode] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // 3D Stage State
  const [active3DPreset, setActive3DPreset] = useState<Universe3DCoverId>('STARGATE_ODYSSEY');
  const [worldPresetOverrides, setWorldPresetOverrides] = useState<
    Record<string, Universe3DCoverId>
  >({});

  // Expanded Modals
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedLore, setSelectedLore] = useState<LoreEntry | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const detailSectionRef = useRef<HTMLDivElement | null>(null);

  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setAuthUid(u?.uid ?? null));
    return unsub;
  }, []);
  const isOwner = Boolean(authUid && (!artistUid || authUid === artistUid));

  useEffect(() => {
    loadWorlds();
  }, [artistUid, isDiscoverMode]);

  const loadWorlds = async () => {
    setLoading(true);
    try {
      if (isDiscoverMode || !artistUid) {
        const pub = await fetchAllPublicWorlds();
        setWorlds(Array.isArray(pub) ? pub : []);
      } else {
        const all = await fetchUserWorlds(artistUid);
        setWorlds(isOwner ? all : all.filter((w) => w.status === 'PUBLISHED'));
      }
    } catch (e) {
      console.error(e);
      setWorlds([]);
    } finally {
      setLoading(false);
    }
  };

  // Combine Flagship Showcase Worlds + User/Public Firebase Worlds
  const allDisplayWorlds = useMemo<(ShowcaseWorld | IPWorld)[]>(() => {
    const existingIds = new Set(worlds.map((w) => w.id));
    const showcaseFiltered = SHOWCASE_WORLDS.filter((sw) => !existingIds.has(sw.id));
    const combined = [...showcaseFiltered, ...worlds];
    if (!searchQuery.trim()) return combined;
    const q = searchQuery.toLowerCase();
    return combined.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.description || '').toLowerCase().includes(q)
    );
  }, [worlds, searchQuery]);

  const getPresetForWorld = (w: IPWorld | ShowcaseWorld): Universe3DCoverId => {
    if (worldPresetOverrides[w.id]) return worldPresetOverrides[w.id];
    if ('defaultCoverPreset' in w && w.defaultCoverPreset) return w.defaultCoverPreset;
    const text = `${w.name} ${w.description || ''}`.toLowerCase();
    if (text.includes('kingdom') || text.includes('crown') || text.includes('throne')) {
      return 'KINGDOM_CHRONICLES';
    }
    if (text.includes('sky') || text.includes('island') || text.includes('aether')) {
      return 'AETHER_ARCHIPELAGO';
    }
    return 'STARGATE_ODYSSEY';
  };

  useEffect(() => {
    if (selectedWorld && viewMode === 'DETAIL') {
      loadWorldContent(selectedWorld);
    }
  }, [selectedWorld, viewMode, isPreviewMode, isOwner]);

  // One-shot deep-open from focus prop
  const focusHandled = useRef(false);
  useEffect(() => {
    focusHandled.current = false;
  }, [focus?.worldId, focus?.characterId]);

  useEffect(() => {
    if (focusHandled.current || !focus?.worldId) return;
    const w =
      allDisplayWorlds.find((x) => x.id === focus.worldId) ||
      SHOWCASE_WORLDS.find((x) => x.id === focus.worldId);
    if (!w) return;
    setSelectedWorld(w);
    setViewMode('DETAIL');
    if (!focus.characterId) {
      focusHandled.current = true;
      onFocusConsumed?.();
    }
  }, [allDisplayWorlds, focus]);

  useEffect(() => {
    if (focusHandled.current || !focus?.characterId || !characters.length) return;
    const c = characters.find((x) => x.id === focus.characterId);
    if (c) {
      setSelectedCharacter(c);
      focusHandled.current = true;
      onFocusConsumed?.();
    }
  }, [characters, focus]);

  const loadWorldContent = async (world: IPWorld | ShowcaseWorld) => {
    if ('isShowcase' in world && world.isShowcase) {
      const synth = getShowcaseEntities(world);
      setCharacters(synth.characters);
      setLore(synth.lore);
      setTimeline(synth.timeline);
      setUserAlbums(synth.albums);
      setUserVideos(synth.videos);
      setDuplicates([]);
      return;
    }
    try {
      const onlyPublished = !isOwner;
      const [chars, loreEntries, events, albums, videos, dupes] = await Promise.all([
        fetchWorldCharacters(world.id, onlyPublished),
        fetchWorldLore(world.id, onlyPublished),
        fetchWorldTimeline(world.id, onlyPublished),
        fetchAllPublicAlbums(),
        artistUid ? fetchUserVideos(artistUid) : Promise.resolve([]),
        detectDuplicates(world.id).catch(() => []),
      ]);
      setCharacters(chars);
      setLore(loreEntries);
      setTimeline(events);
      setUserAlbums(albums);
      setUserVideos(videos);
      setDuplicates(dupes);
    } catch (e) {
      console.error('loadWorldContent failed:', e);
    }
  };

  const handlePublishAll = async () => {
    if (!selectedWorld || ('isShowcase' in selectedWorld && selectedWorld.isShowcase)) return;
    setIsPublishing(true);
    try {
      await publishWorld(selectedWorld.id);
      const updated = artistUid ? await fetchUserWorlds(artistUid) : await fetchAllPublicWorlds();
      const next = updated.find((w) => w.id === selectedWorld.id);
      if (next) setSelectedWorld(next);
      setWorlds(updated);
      await loadWorldContent(selectedWorld);
    } catch (e) {
      console.error(e);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleJumpToWorldTab = (tab: WorldDetailTab) => {
    setActiveTab(tab);
    detailSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const launchStudio = (
    worldId: string,
    app: 'FABULA' | 'LOREA_BOOK' | 'LOREA_SCRIPT' | 'CHORA' | 'TALEO'
  ) => {
    if (onOpenWorldInApp) {
      onOpenWorldInApp(worldId, app);
      return;
    }
    const found = STUDIO_APPS.find((s) => s.app === app);
    if (found?.viewTarget && onNavigate) {
      onNavigate(found.viewTarget);
    }
  };

  // ── GALLERY VIEW (Main Plajah Worlds Multiverse Portal Landing Page) ──
  if (viewMode === 'GALLERY') {
    return (
      <WorldsLandingPortalView
        worlds={allDisplayWorlds}
        isDiscoverMode={isDiscoverMode}
        onToggleDiscoverMode={() => setIsDiscoverMode(!isDiscoverMode)}
        isOwner={isOwner}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onEnterWorld={(world, initialTab = 'Overview') => {
          setSelectedWorld(world);
          setActive3DPreset(getPresetForWorld(world));
          setActiveTab(initialTab);
          setViewMode('DETAIL');
        }}
        onNewWorld={() => onNavigate?.('WORLD_MANAGER')}
        onSeedDemoWorlds={async () => {
          if (auth.currentUser) {
            await seedDemoWorlds();
            loadWorlds();
          }
        }}
        onLaunchStudio={launchStudio}
        getPresetForWorld={getPresetForWorld}
      />
    );
  }

  // ── DETAIL VIEW (World Source Code Active + 3D Cover + Original 5 Tabs + WorldHub) ──
  const activeDetailPreset = selectedWorld
    ? getPresetForWorld(selectedWorld)
    : active3DPreset;
  const worldAlbums = userAlbums.filter((a) => a.worldId === selectedWorld?.id);
  const worldVideos = userVideos.filter((v) => v.worldId === selectedWorld?.id);

  return (
    <>
      <WorldBackground world={selectedWorld} />
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm -z-10 pointer-events-none" />

      <AnimatePresence>
        {selectedWorld && <WorldMusicBar world={selectedWorld} albums={userAlbums} />}
      </AnimatePresence>

      <AnimatePresence>
        {selectedCharacter && (
          <CharacterDetailModal
            character={selectedCharacter}
            allCharacters={characters}
            albums={userAlbums}
            onClose={() => setSelectedCharacter(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedLore && (
          <LoreDetailPanel entry={selectedLore} onClose={() => setSelectedLore(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            characters={characters}
            onClose={() => setSelectedEvent(null)}
          />
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen relative">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8 space-y-10">
          {/* Header Actions (Preserved from HEAD:components/WorldsView.tsx) */}
          <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
            <button
              onClick={() => {
                setViewMode('GALLERY');
                setSelectedWorld(null);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-black/40 hover:bg-black/60 rounded-full text-white/60 hover:text-white transition-all border border-white/10 backdrop-blur-md"
            >
              <ArrowLeft size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Back to Worlds
              </span>
            </button>

            <div className="flex flex-wrap items-center gap-3">
              {isOwner && (
                <>
                  <div className="p-1 bg-black/40 border border-white/10 rounded-full flex gap-1 backdrop-blur-md">
                    <button
                      onClick={() => setIsPreviewMode(false)}
                      className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
                        !isPreviewMode
                          ? 'bg-green-500 text-white'
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      <Globe size={12} className="inline mr-1" /> Published
                    </button>
                    <button
                      onClick={() => setIsPreviewMode(true)}
                      className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${
                        isPreviewMode
                          ? 'bg-small-orange text-black'
                          : 'text-white/40 hover:text-white'
                      }`}
                    >
                      <Eye size={12} className="inline mr-1" /> Preview
                    </button>
                  </div>
                  <button
                    onClick={() => selectedWorld && onEdit?.(selectedWorld)}
                    className="px-5 py-3 bg-black/40 hover:bg-black/60 text-white rounded-full font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2 border border-white/10 backdrop-blur-md"
                  >
                    <Edit3 size={13} /> Edit in World Manager
                  </button>
                  <button
                    onClick={handlePublishAll}
                    disabled={isPublishing}
                    className="px-5 py-3 bg-white text-black hover:bg-small-orange hover:text-white rounded-full font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2 shadow-xl disabled:opacity-50"
                  >
                    {isPublishing ? (
                      '...'
                    ) : (
                      <>
                        <Unlock size={13} /> Publish All
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Interactive 3D World Hero Cover (Every World gets a real-time 3D interactive overworld cover!) */}
          {selectedWorld && (
            <UniverseHero3DStage
              activeUniverseId={activeDetailPreset}
              onSelectUniverse={(newPreset) =>
                setWorldPresetOverrides((prev) => ({
                  ...prev,
                  [selectedWorld.id]: newPreset,
                }))
              }
              isWorldDetailCover={true}
              worldTitle={selectedWorld.name}
              worldTagline={selectedWorld.description}
              worldStats={{
                characters: characters.length,
                lore: lore.length,
                timeline: timeline.length,
                albums: worldAlbums.length,
                videos: worldVideos.length,
              }}
              onBackToAllWorlds={() => {
                setViewMode('GALLERY');
                setSelectedWorld(null);
              }}
              onJumpToWorldTab={handleJumpToWorldTab}
              onOpenStudio={(studio) => launchStudio(selectedWorld.id, studio)}
            />
          )}

          {/* Creator Support (PlajahPlusButton) + Studio Launch Strip */}
          {selectedWorld && (
            <div
              ref={detailSectionRef}
              className="flex flex-wrap items-center justify-between gap-4 pt-2"
            >
              <div className="flex items-center gap-4">
                <PlajahPlusButton
                  creatorId={selectedWorld.creatorId}
                  creatorName={selectedWorld.name}
                  isOwnProfile={isOwner}
                />
                <span className="px-4 py-1.5 bg-small-orange/20 text-small-orange text-[9px] font-black uppercase tracking-widest rounded-full border border-small-orange/20">
                  World Source Code Active
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {STUDIO_APPS.map((st) => (
                  <button
                    key={st.app}
                    onClick={() => launchStudio(selectedWorld.id, st.app)}
                    className={`px-3.5 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all hover:scale-105 ${st.accent}`}
                  >
                    <st.icon className="w-3.5 h-3.5" />
                    <span>Open in {st.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Platform ChipRail Tabs (Overview, Characters, Lore, Timeline, Graph, WorldHub) */}
          <ChipRail
            className="mb-6"
            items={[
              { id: 'Overview', label: 'Overview', icon: <LayoutGrid size={13} /> },
              {
                id: 'Characters',
                label: `Characters (${characters.length})`,
                icon: <Users size={13} />,
              },
              { id: 'Lore', label: `Lore (${lore.length})`, icon: <Scroll size={13} /> },
              {
                id: 'Timeline',
                label: `Timeline (${timeline.length})`,
                icon: <History size={13} />,
              },
              { id: 'Graph', label: 'Neural Graph', icon: <Network size={13} /> },
              {
                id: 'WorldHub',
                label: 'Story Intel & Hub',
                icon: <Cpu size={13} />,
              },
            ]}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as WorldDetailTab)}
          />

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 min-h-[460px]"
            >
              {/* ── OVERVIEW TAB ── */}
              {activeTab === 'Overview' && (
                <div className="space-y-14">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3 text-white">
                        <Sparkles className="text-small-orange" size={20} /> World Narrative
                      </h3>
                      <p className="text-white/65 font-medium leading-loose">
                        {selectedWorld?.description ||
                          'This living universe is accessible across Fabula, Lorea, Chora, and Taleo.'}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Characters', value: characters.length, icon: Users, tab: 'Characters' as const },
                          { label: 'Lore Entries', value: lore.length, icon: Scroll, tab: 'Lore' as const },
                          { label: 'Timeline Events', value: timeline.length, icon: History, tab: 'Timeline' as const },
                        ].map((stat) => (
                          <button
                            key={stat.label}
                            onClick={() => setActiveTab(stat.tab)}
                            className="p-5 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 text-center transition-all"
                          >
                            <stat.icon size={16} className="text-small-orange mx-auto mb-2" />
                            <p className="text-2xl font-black text-white">{stat.value}</p>
                            <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-0.5">
                              {stat.label}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">
                        Recent Canon Activity
                      </h4>
                      {[...characters, ...lore, ...timeline].slice(0, 5).map((item: any, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5 cursor-pointer hover:bg-white/10 hover:border-white/15 transition-all"
                          onClick={() => {
                            if (item.name && item.bio !== undefined) setSelectedCharacter(item);
                            else if (item.title && item.content !== undefined) setSelectedLore(item);
                            else if (item.year !== undefined) setSelectedEvent(item);
                          }}
                        >
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
                              alt=""
                            />
                          ) : (
                            <div className="w-8 h-8 bg-small-orange/20 rounded-lg flex items-center justify-center text-small-orange flex-shrink-0">
                              {item.name ? <Users size={13} /> : <Scroll size={13} />}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black uppercase tracking-tight text-white truncate">
                              {item.name || item.title}
                            </p>
                            <p className="text-[7px] font-bold text-white/20 uppercase tracking-widest">
                              {item.role || item.type || 'Timeline Event'}
                            </p>
                          </div>
                          <ChevronRight size={12} className="text-white/20 shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Characters Quick-Access Rail */}
                  {characters.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2">
                          <Users size={11} /> Characters in This World
                        </h4>
                        <button
                          onClick={() => setActiveTab('Characters')}
                          className="text-[8px] font-black uppercase tracking-widest text-white/20 hover:text-white/60 transition-colors flex items-center gap-1"
                        >
                          See All <ChevronRight size={10} />
                        </button>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                        {characters.slice(0, 8).map((char) => (
                          <button
                            key={char.id}
                            onClick={() => setSelectedCharacter(char)}
                            className="flex-shrink-0 flex flex-col items-center gap-2 group"
                          >
                            <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-white/10 group-hover:border-white/30 transition-all shadow-lg">
                              <img
                                src={
                                  char.imageUrl || `https://picsum.photos/seed/${char.id}/200/200`
                                }
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                alt={char.name}
                              />
                              {char.accentColor && (
                                <div
                                  className="absolute bottom-0 left-0 right-0 h-0.5"
                                  style={{ background: char.accentColor }}
                                />
                              )}
                            </div>
                            <div className="text-center max-w-[72px]">
                              <p className="text-[9px] font-black uppercase tracking-tight text-white/80 group-hover:text-white transition-colors truncate">
                                {char.name}
                              </p>
                              <p className="text-[7px] text-white/30 uppercase tracking-widest truncate">
                                {char.role}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Music in This World (HoldNavigate + Character Pills) */}
                  {worldAlbums.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2">
                          <Music2 size={11} /> Music in This World
                        </h4>
                        <p className="text-[7px] text-white/20 uppercase tracking-widest">
                          Hold 5s to open
                        </p>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                        {worldAlbums.map((album) => (
                          <HoldNavigate
                            key={album.id}
                            onNavigate={() => onSelectAlbum?.(album)}
                            className="flex-shrink-0 group"
                          >
                            <div className="relative w-36 h-36 rounded-2xl overflow-hidden border border-white/10 group-hover:border-white/30 transition-all shadow-xl">
                              {album.coverImage ? (
                                <img
                                  src={album.coverImage}
                                  alt={album.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                              ) : (
                                <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                  <Music2 size={24} className="text-white/20" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                              <div className="absolute bottom-0 left-0 right-0 p-3">
                                <p className="text-[10px] font-black text-white truncate leading-tight">
                                  {album.title}
                                </p>
                                <p className="text-[8px] text-white/40 uppercase tracking-widest">
                                  {album.tracks?.length ?? 0} tracks
                                </p>
                              </div>
                            </div>
                            {(album.characterIds?.length ?? 0) > 0 && (
                              <div className="flex gap-1 mt-2 flex-wrap max-w-[144px]">
                                {album.characterIds!.slice(0, 3).map((cid) => {
                                  const c = characters.find((ch) => ch.id === cid);
                                  return c ? (
                                    <button
                                      key={cid}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCharacter(c);
                                      }}
                                      className="flex items-center gap-1 px-1.5 py-0.5 bg-white/8 border border-white/10 rounded-full hover:border-white/30 hover:bg-white/15 transition-all"
                                    >
                                      <img
                                        src={c.imageUrl}
                                        className="w-3.5 h-3.5 rounded-full object-cover"
                                        alt=""
                                      />
                                      <span className="text-[7px] font-black text-white/50 hover:text-white transition-colors truncate max-w-[50px]">
                                        {c.name}
                                      </span>
                                    </button>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </HoldNavigate>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Videos in This World (HoldNavigate + Character Pills) */}
                  {worldVideos.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-5">
                        <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 flex items-center gap-2">
                          <Play size={11} /> Videos & Films in This World
                        </h4>
                        <p className="text-[7px] text-white/20 uppercase tracking-widest">
                          Hold 5s to open
                        </p>
                      </div>
                      <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                        {worldVideos.map((video) => (
                          <HoldNavigate
                            key={video.id}
                            onNavigate={() => onSelectVideo?.(video)}
                            className="flex-shrink-0 group"
                          >
                            <div className="relative w-48 h-28 rounded-2xl overflow-hidden border border-white/10 group-hover:border-white/30 transition-all shadow-xl">
                              {video.thumbnailUrl ? (
                                <img
                                  src={video.thumbnailUrl}
                                  alt={video.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                              ) : (
                                <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                  <Play size={24} className="text-white/20" />
                                </div>
                              )}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                              <div className="absolute bottom-0 left-0 right-0 p-3">
                                <p className="text-[10px] font-black text-white truncate leading-tight">
                                  {video.title}
                                </p>
                              </div>
                            </div>
                            {(video.characterIds?.length ?? 0) > 0 && (
                              <div className="flex gap-1 mt-2 flex-wrap max-w-[192px]">
                                {video.characterIds!.slice(0, 4).map((cid) => {
                                  const c = characters.find((ch) => ch.id === cid);
                                  return c ? (
                                    <button
                                      key={cid}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCharacter(c);
                                      }}
                                      className="flex items-center gap-1 px-1.5 py-0.5 bg-white/8 border border-white/10 rounded-full hover:border-white/30 hover:bg-white/15 transition-all"
                                    >
                                      <img
                                        src={c.imageUrl}
                                        className="w-3.5 h-3.5 rounded-full object-cover"
                                        alt=""
                                      />
                                      <span className="text-[7px] font-black text-white/50 hover:text-white transition-colors truncate max-w-[60px]">
                                        {c.name}
                                      </span>
                                    </button>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </HoldNavigate>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── CHARACTERS TAB ── */}
              {activeTab === 'Characters' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {characters.map((char) => (
                    <motion.div
                      key={char.id}
                      whileHover={{ y: -6, scale: 1.02 }}
                      onClick={() => setSelectedCharacter(char)}
                      className="group bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden hover:border-white/20 transition-all shadow-xl cursor-pointer relative"
                    >
                      <div className="relative h-44 overflow-hidden">
                        <img
                          src={
                            char.imageUrl || `https://picsum.photos/seed/${char.id}/400/300`
                          }
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-75 group-hover:opacity-95"
                          alt={char.name}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        {!char.isPublished && isOwner && (
                          <span className="absolute top-3 right-3 px-2 py-0.5 bg-white/10 rounded text-[7px] font-black uppercase tracking-widest text-white/30 border border-white/10">
                            Draft
                          </span>
                        )}
                        {char.accentColor && (
                          <div
                            className="absolute bottom-0 inset-x-0 h-0.5"
                            style={{
                              background: `linear-gradient(90deg, transparent, ${char.accentColor}, transparent)`,
                            }}
                          />
                        )}
                      </div>

                      <div className="p-5 space-y-3">
                        <div>
                          <p className="text-[7px] font-black uppercase tracking-widest text-small-orange/70 mb-0.5">
                            {char.role}
                          </p>
                          <h3 className="text-lg font-black uppercase tracking-tight text-white group-hover:text-small-orange transition-colors">
                            {char.name}
                          </h3>
                        </div>
                        <p className="text-xs text-white/50 font-medium leading-relaxed italic line-clamp-2">
                          "{char.bio}"
                        </p>

                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1.5">
                            {char.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 bg-white/5 text-white/25 text-[7px] font-black uppercase tracking-widest rounded-full border border-white/5"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 text-white/20">
                            {char.playlistAlbumIds?.length ? <Music2 size={11} /> : null}
                            {(char.gallery?.length ?? 0) > 0 ? <ImageIcon size={11} /> : null}
                            {char.modelUrl ? <Box size={11} /> : null}
                          </div>
                        </div>

                        <div className="pt-1 border-t border-white/5">
                          <span className="text-[7px] font-black uppercase tracking-widest text-white/20 flex items-center gap-1">
                            <ChevronRight size={10} /> View full profile
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── LORE TAB ── */}
              {activeTab === 'Lore' && (
                <div className="space-y-5">
                  {lore.map((entry) => (
                    <motion.div
                      key={entry.id}
                      whileHover={{ x: 4 }}
                      onClick={() => setSelectedLore(entry)}
                      className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer group"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-small-orange/20 rounded-xl flex items-center justify-center text-small-orange flex-shrink-0 group-hover:bg-small-orange group-hover:text-black transition-all">
                            {entry.type === 'LOCATION' ? (
                              <MapPin size={16} />
                            ) : (
                              <Scroll size={16} />
                            )}
                          </div>
                          <div>
                            <h3 className="text-lg font-black uppercase tracking-tight text-white">
                              {entry.title}
                            </h3>
                            <div className="flex items-center gap-3">
                              <span className="text-[7px] font-black uppercase tracking-widest text-white/30">
                                {entry.type}
                              </span>
                              {(entry.gallery?.length ?? 0) > 0 && (
                                <span className="flex items-center gap-1 text-[7px] text-white/20">
                                  <ImageIcon size={8} /> {entry.gallery!.length} images
                                </span>
                              )}
                              {!entry.isPublished && isOwner && (
                                <span className="text-[7px] font-black text-small-orange/40">
                                  Draft
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-white/5 text-white/25 text-[7px] font-black uppercase tracking-widest rounded-full border border-white/5"
                            >
                              {tag}
                            </span>
                          ))}
                          <ChevronRight
                            size={14}
                            className="text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-white/50 mt-4 pl-14 line-clamp-2 leading-relaxed">
                        {entry.content}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* ── TIMELINE TAB ── */}
              {activeTab === 'Timeline' && (
                <div className="relative py-8">
                  {selectedWorld?.timelineConfig && (
                    <div className="mb-12 p-6 bg-white/5 border border-white/10 rounded-2xl">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="text-lg font-black uppercase tracking-tight italic text-white">
                            Temporal Range
                          </h4>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">
                            Chronological boundaries
                          </p>
                        </div>
                        <span className="text-2xl font-black text-small-orange">
                          {selectedWorld.timelineConfig.startYear} –{' '}
                          {selectedWorld.timelineConfig.endYear}
                          <span className="text-[10px] text-white/20 ml-2">
                            {selectedWorld.timelineConfig.unitName}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        {timeline.map((event) => {
                          const start = selectedWorld.timelineConfig?.startYear || 0;
                          const end = selectedWorld.timelineConfig?.endYear || 3000;
                          const left = ((event.year - start) / Math.max(1, end - start)) * 100;
                          const sig = event.significance;
                          return (
                            <motion.div
                              key={event.id}
                              initial={{ scaleY: 0 }}
                              animate={{ scaleY: 1 }}
                              className="absolute top-0 bottom-0 w-1.5 cursor-pointer hover:w-2.5 transition-all"
                              style={{
                                left: `${Math.min(98, Math.max(2, left))}%`,
                                background:
                                  sig === 'PIVOTAL'
                                    ? '#ef4444'
                                    : sig === 'MAJOR'
                                    ? '#eab308'
                                    : '#FF8C00',
                                boxShadow: '0 0 8px currentColor',
                              }}
                              onClick={() => setSelectedEvent(event)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-12 mt-4">
                    {[...timeline]
                      .sort((a, b) => (a.year || 0) - (b.year || 0))
                      .map((event, i) => (
                        <div
                          key={event.id}
                          className={`flex flex-col md:flex-row items-center justify-center gap-6 ${
                            i % 2 === 0 ? 'md:flex-row-reverse md:text-right' : ''
                          }`}
                        >
                          <div className="flex-1 max-w-sm w-full space-y-3">
                            <div className="text-[9px] font-black uppercase tracking-[0.4em] text-small-orange/60">
                              {event.year} {selectedWorld?.timelineConfig?.unitName}
                              {event.significance && (
                                <span
                                  className={`ml-2 ${
                                    event.significance === 'PIVOTAL'
                                      ? 'text-red-400'
                                      : event.significance === 'MAJOR'
                                      ? 'text-yellow-400'
                                      : 'text-white/30'
                                  }`}
                                >
                                  · {event.significance}
                                </span>
                              )}
                            </div>
                            <h4 className="text-xl font-black uppercase tracking-tight text-white">
                              {event.title}
                            </h4>
                            <p className="text-sm text-white/50 leading-relaxed italic">
                              "{event.description}"
                            </p>
                          </div>

                          <div className="relative z-10 hidden md:block">
                            <div className="w-4 h-4 bg-small-orange rounded-full shadow-[0_0_20px_rgba(255,140,0,0.8)] border-4 border-black" />
                          </div>

                          <div className="flex-1 w-full flex md:block">
                            <button
                              onClick={() => setSelectedEvent(event)}
                              className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-left hover:bg-white/10 hover:border-white/20 transition-all group"
                            >
                              <div className="flex items-center gap-2">
                                <Zap
                                  size={14}
                                  className="text-small-orange opacity-60 group-hover:opacity-100"
                                />
                                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60 group-hover:text-white">
                                  Expand Event
                                </p>
                              </div>
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* ── GRAPH TAB (WorldGraphView Neural Topology) ── */}
              {activeTab === 'Graph' && selectedWorld && (
                <div
                  className="w-full rounded-[2rem] overflow-hidden border border-white/10 relative"
                  style={{ height: 'clamp(420px, 72vh, 900px)' }}
                >
                  <div className="absolute top-6 left-6 z-10 pointer-events-none">
                    <h4 className="text-lg font-black uppercase tracking-tight italic text-white flex items-center gap-2">
                      <Network className="text-small-orange" size={20} /> Neural Topology
                    </h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/30">
                      High-fidelity universe connections
                    </p>
                  </div>
                  <WorldGraphView
                    world={selectedWorld}
                    characters={characters}
                    loreEntries={lore}
                    timelineEvents={timeline}
                    albums={userAlbums}
                    videos={userVideos}
                    isEmbedded={true}
                  />
                </div>
              )}

              {/* ── WORLD HUB & STORY INTEL TAB ── */}
              {activeTab === 'WorldHub' && selectedWorld && (
                <div className="space-y-8">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">
                        services/worldHub.ts × services/storyIntelBridge.ts
                      </span>
                      <h3 className="text-2xl font-black text-white mt-1">
                        Story Intelligence & Cross-Tool World Hub
                      </h3>
                      <p className="text-xs text-white/60 mt-1 max-w-2xl">
                        Automatically syncs private & published characters, locations, and
                        MacGuffins from Fabula, Lorea, Chora, and Taleo — and merges duplicate
                        crossover characters across films non-destructively.
                      </p>
                    </div>
                  </div>

                  {duplicates.length > 0 ? (
                    <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-400/30 space-y-4">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                        <GitMerge className="w-4 h-4" />
                        <span>
                          {duplicates.length} Candidate Crossover / Duplicate Cluster(s) Detected
                        </span>
                      </div>
                      {duplicates.map((cl, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl bg-black/50 border border-white/10 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div>
                            <div className="text-xs font-black text-white uppercase">
                              {cl.name} ({cl.kind})
                            </div>
                            <div className="text-[11px] text-white/50">
                              {cl.entries.length} entries across tools
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              const winner = cl.entries[0];
                              const losers = cl.entries.slice(1).map((e) => e.id);
                              await mergeEntries(selectedWorld.id, cl.kind, winner.id, losers);
                              await loadWorldContent(selectedWorld);
                            }}
                            className="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-black uppercase tracking-wider"
                          >
                            Merge into Canonical ID
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="text-sm font-black text-white">
                          100% Canonical Entity Integrity — Zero Unmerged Duplicates
                        </div>
                        <div className="text-xs text-white/60">
                          All characters and lore entries across Fabula, Lorea, Chora, and Taleo
                          share unified canonical IDs.
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {STORY_INTEL_PIPELINE_STEPS.map((st) => (
                      <div
                        key={st.step}
                        className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-2"
                      >
                        <div className="text-xs font-mono font-bold text-cyan-400">
                          STEP {st.step} · {st.subtitle}
                        </div>
                        <div className="text-sm font-black text-white">{st.title}</div>
                        <p className="text-xs text-white/60 leading-relaxed">{st.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
};

export default WorldsView;
