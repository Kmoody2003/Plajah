import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PageHeader from './PageHeader';
import {
  Plus, Map, Users, Scroll, History, Edit3, Eye, Globe, Lock,
  Unlock, Sparkles, LayoutGrid, ArrowLeft, ChevronRight, BookOpen,
  Zap, Network, Box, Music2, MapPin, Calendar, Volume2, VolumeX,
  Image as ImageIcon, Play
} from 'lucide-react';
import {
  IPWorld, Character, LoreEntry, TimelineEvent, UserProfile,
  AppView, Video, Album
} from '../types';
import {
  fetchUserWorlds, fetchWorldCharacters, fetchWorldLore,
  fetchWorldTimeline, publishWorld, auth, updateIPWorld,
  fetchAllPublicAlbums, fetchUserVideos, fetchAllPublicWorlds,
  seedDemoWorld, seedDemoWorlds
} from '../services/backendService';
import WorldGraphView from './WorldGraphView';
import CharacterDetailModal from './CharacterDetailModal';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';

interface WorldsViewProps {
  onNavigate: (view: AppView) => void;
  onEdit?: (world: IPWorld) => void;
  userProfile: UserProfile | null;
  artistUid: string;
}

// ── World Background ──────────────────────────────────────────────────────────
function WorldBackground({ world }: { world: IPWorld | null }) {
  const [slideIdx, setSlideIdx] = useState(0);
  const cfg = world?.backgroundConfig;

  useEffect(() => {
    setSlideIdx(0);
    if (cfg?.type !== 'SLIDESHOW' || !cfg.images?.length) return;
    const interval = cfg.slideshowInterval ?? 5000;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % (cfg.images!.length)), interval);
    return () => clearInterval(t);
  }, [world?.id, cfg?.type]);

  if (!cfg && !world?.themeConfig?.customBackgroundImage) return null;

  if (cfg?.type === 'VIDEO' && cfg.videoUrl) {
    return (
      <video
        src={cfg.videoUrl}
        autoPlay loop muted playsInline
        className="fixed inset-0 w-full h-full object-cover -z-20 pointer-events-none"
        style={{ opacity: cfg.opacity ?? 0.4 }}
      />
    );
  }

  const images = cfg?.type === 'SLIDESHOW'
    ? (cfg.images ?? [])
    : cfg?.images?.length
    ? [cfg.images[0]]
    : world?.themeConfig.customBackgroundImage
    ? [world.themeConfig.customBackgroundImage]
    : [];

  if (!images.length) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={slideIdx}
        initial={{ opacity: 0 }} animate={{ opacity: cfg?.opacity ?? 0.4 }} exit={{ opacity: 0 }}
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

  const bgAlbum = albums.find(a => a.id === world?.backgroundMusicAlbumId);

  useEffect(() => {
    setVisible(!!bgAlbum);
  }, [bgAlbum?.id]);

  if (!bgAlbum || !visible) return null;

  const isThisAlbumPlaying = currentAlbum?.id === bgAlbum.id && isPlaying;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-5 py-3 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-full shadow-2xl"
    >
      <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
        <img src={bgAlbum.coverImage} className="w-full h-full object-cover" alt="" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-widest text-white/40">World Ambient</p>
        <p className="text-xs font-black text-white truncate max-w-[160px]">{bgAlbum.title}</p>
      </div>
      <button
        onClick={() => {
          if (isThisAlbumPlaying) {
            pause();
          } else if (currentAlbum?.id === bgAlbum.id) {
            resume();
          } else if (bgAlbum.tracks[0]) {
            playTrack(bgAlbum.tracks[0], bgAlbum, 'LIBRARY');
          }
        }}
        className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0"
      >
        {isThisAlbumPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}
      </button>
      <button onClick={() => setVisible(false)} className="text-white/20 hover:text-white/60 transition-colors flex-shrink-0 text-[10px]">✕</button>
    </motion.div>
  );
}

// ── Lore expanded panel ───────────────────────────────────────────────────────
function LoreDetailPanel({ entry, onClose }: { entry: LoreEntry; onClose: () => void }) {
  const [imgIdx, setImgIdx] = useState(0);
  const images = entry.gallery ?? [];

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-3xl bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] overflow-hidden max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 border-b border-white/5 flex items-center gap-4">
          <div className="w-10 h-10 bg-small-orange/20 rounded-2xl flex items-center justify-center text-small-orange flex-shrink-0">
            {entry.type === 'LOCATION' ? <MapPin size={18} /> : <Scroll size={18} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/30">{entry.type}</p>
            <h3 className="text-xl font-black uppercase tracking-tight text-white">{entry.title}</h3>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white">✕</button>
        </div>

        <div className="p-8 space-y-8">
          {/* Gallery */}
          {images.length > 0 && (
            <div className="space-y-3">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
                <img src={images[imgIdx]} className="w-full h-full object-cover" alt="" />
                {images.length > 1 && (
                  <div className="absolute bottom-3 right-3 flex gap-1">
                    {images.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${i === imgIdx ? 'bg-white' : 'bg-white/20'}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Clips */}
          {(entry.clips?.length ?? 0) > 0 && (
            <div className="space-y-3">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Video Clips</p>
              <div className="grid grid-cols-2 gap-3">
                {entry.clips!.map((url, i) => (
                  <video key={i} src={url} controls className="w-full rounded-xl bg-black" />
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="space-y-3">
            <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Chronicle</p>
            <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{entry.content}</p>
          </div>

          {/* Tags */}
          {entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {entry.tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-white/5 text-white/30 text-[7px] font-black uppercase tracking-widest rounded-full border border-white/5">#{tag}</span>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ── Event detail panel ────────────────────────────────────────────────────────
function EventDetailPanel({ event, characters, onClose }: { event: TimelineEvent; characters: Character[]; onClose: () => void }) {
  const images = event.gallery ?? [];
  const [imgIdx, setImgIdx] = useState(0);
  const SIGNIFICANCE_COLOR: Record<string, string> = { MINOR: 'text-white/40', MAJOR: 'text-yellow-400', PIVOTAL: 'text-red-400' };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-[#0c0c0c] border border-white/10 rounded-[2.5rem] overflow-hidden max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 border-b border-white/5 flex items-center gap-4">
          <div className="w-10 h-10 bg-small-orange/20 rounded-2xl flex items-center justify-center text-small-orange flex-shrink-0">
            <Calendar size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[8px] font-black uppercase tracking-widest mb-0.5 ${event.significance ? SIGNIFICANCE_COLOR[event.significance] : 'text-small-orange/60'}`}>
              {event.year} {event.significance ? `· ${event.significance}` : ''}
            </p>
            <h3 className="text-xl font-black uppercase tracking-tight text-white">{event.title}</h3>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white">✕</button>
        </div>

        <div className="p-8 space-y-6">
          {images.length > 0 && (
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
              <img src={images[imgIdx]} className="w-full h-full object-cover" alt="" />
            </div>
          )}
          <p className="text-sm text-white/70 leading-relaxed">{event.description}</p>
          {(event.linkedCharacterIds?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-[8px] font-black uppercase tracking-widest text-white/20">Involved Characters</p>
              <div className="flex flex-wrap gap-2">
                {event.linkedCharacterIds!.map(id => {
                  const c = characters.find(ch => ch.id === id);
                  return c ? (
                    <div key={id} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl border border-white/10">
                      <img src={c.imageUrl} className="w-5 h-5 rounded-full object-cover" alt="" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-white/60">{c.name}</span>
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

// ── Main component ────────────────────────────────────────────────────────────
const WorldsView: React.FC<WorldsViewProps> = ({ onNavigate, onEdit, userProfile, artistUid }) => {
  const [worlds, setWorlds] = useState<IPWorld[]>([]);
  const [selectedWorld, setSelectedWorld] = useState<IPWorld | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [lore, setLore] = useState<LoreEntry[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [userAlbums, setUserAlbums] = useState<Album[]>([]);
  const [userVideos, setUserVideos] = useState<Video[]>([]);
  const [activeTab, setActiveTab] = useState<'Overview' | 'Characters' | 'Lore' | 'Timeline' | 'Graph'>('Overview');
  const [viewMode, setViewMode] = useState<'GALLERY' | 'DETAIL'>('GALLERY');
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDiscoverMode, setIsDiscoverMode] = useState(false);

  // Expanded modals
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [selectedLore, setSelectedLore] = useState<LoreEntry | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const isOwner = auth.currentUser?.uid === artistUid;

  useEffect(() => { loadWorlds(); }, [artistUid, isDiscoverMode]);

  const loadWorlds = async () => {
    setLoading(true);
    try {
      if (isDiscoverMode) {
        setWorlds(await fetchAllPublicWorlds());
      } else {
        const all = await fetchUserWorlds(artistUid);
        setWorlds(isOwner ? all : all.filter(w => w.status === 'PUBLISHED'));
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedWorld && viewMode === 'DETAIL') loadWorldContent(selectedWorld.id);
  }, [selectedWorld, viewMode, isPreviewMode]);

  const loadWorldContent = async (worldId: string) => {
    const onlyPublished = !isOwner;
    const [chars, loreEntries, events, albums, videos] = await Promise.all([
      fetchWorldCharacters(worldId, onlyPublished),
      fetchWorldLore(worldId, onlyPublished),
      fetchWorldTimeline(worldId, onlyPublished),
      fetchAllPublicAlbums(),
      fetchUserVideos(artistUid),
    ]);
    setCharacters(chars);
    setLore(loreEntries);
    setTimeline(events);
    setUserAlbums(albums);
    setUserVideos(videos);
  };

  const handlePublishAll = async () => {
    if (!selectedWorld) return;
    setIsPublishing(true);
    try {
      await publishWorld(selectedWorld.id);
      const updated = await fetchUserWorlds(artistUid);
      const next = updated.find(w => w.id === selectedWorld.id);
      if (next) setSelectedWorld(next);
      setWorlds(isOwner ? updated : updated.filter(w => w.status === 'PUBLISHED'));
      await loadWorldContent(selectedWorld.id);
      alert('World published to live!');
    } catch (e) { console.error(e); }
    finally { setIsPublishing(false); }
  };

  if (loading && viewMode === 'GALLERY') {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── GALLERY VIEW ────────────────────────────────────────────────────────────
  if (viewMode === 'GALLERY') {
    return (
      <div className="space-y-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Globe className="text-small-orange" size={24} />
              <span className="text-xs font-black uppercase tracking-[0.5em] text-white/40">Architectural Archive</span>
            </div>
            <PageHeader>Plajah Worlds</PageHeader>
            <p className="text-white/40 text-xs font-black uppercase tracking-widest mt-6 max-w-2xl">
              {isDiscoverMode ? 'Discover universes from all architects.' : 'Explore projects from this architect.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDiscoverMode(!isDiscoverMode)}
              className={`px-8 py-4 rounded-full font-black uppercase tracking-widest text-xs transition-all flex items-center gap-3 shadow-xl ${isDiscoverMode ? 'bg-primary text-white' : 'bg-white/5 border border-white/10 text-white/40 hover:bg-white/10'}`}
            >
              <Globe size={18} /> {isDiscoverMode ? 'Global Archive' : 'View Global Archive'}
            </button>
            {isOwner && (
              <button onClick={() => onNavigate('WORLD_MANAGER')}
                className="px-8 py-4 bg-small-orange text-black rounded-full font-black uppercase tracking-widest text-xs hover:scale-105 transition-transform flex items-center gap-3 shadow-xl">
                <Plus size={18} /> New World
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {worlds.map(world => (
            <motion.div key={world.id} whileHover={{ y: -10 }}
              onClick={() => { setSelectedWorld(world); setViewMode('DETAIL'); setActiveTab('Overview'); }}
              className="group relative aspect-[16/10] rounded-[2.5rem] overflow-hidden cursor-pointer bg-white/5 border border-white/10 hover:border-white/30 transition-all shadow-2xl"
            >
              <img src={world.coverImage || `https://picsum.photos/seed/${world.id}/800/500`}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000 opacity-60 group-hover:opacity-100" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-8">
                <div className="flex items-center gap-3 mb-3">
                  {world.status === 'PUBLISHED'
                    ? <span className="px-3 py-1 bg-green-500/20 text-green-400 text-[8px] font-black uppercase tracking-widest rounded-full border border-green-500/20 flex items-center gap-1.5"><Globe size={10} /> Live</span>
                    : <span className="px-3 py-1 bg-white/10 text-white/40 text-[8px] font-black uppercase tracking-widest rounded-full border border-white/10 flex items-center gap-1.5"><Lock size={10} /> Draft</span>
                  }
                  {world.backgroundMusicAlbumId && <span className="px-2 py-1 bg-white/10 text-white/30 text-[7px] font-black uppercase tracking-widest rounded-full border border-white/5 flex items-center gap-1"><Music2 size={8} /> Ambient</span>}
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-white mb-2 group-hover:text-small-orange transition-colors">{world.name}</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest line-clamp-2 leading-relaxed">{world.description}</p>
              </div>
            </motion.div>
          ))}

          {worlds.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-white/5 rounded-[3rem] bg-white/5">
              <Box size={48} className="text-white/5 mx-auto mb-4" />
              <p className="text-white/20 uppercase font-black tracking-[0.5em]">No Worlds created yet.</p>
              {isOwner && (
                <div className="flex flex-col items-center gap-4 mt-8">
                  <button onClick={() => onNavigate('WORLD_MANAGER')}
                    className="px-10 py-5 bg-white text-black hover:bg-small-orange hover:text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[10px] transition-all shadow-2xl">
                    Architect your first world
                  </button>
                  <button onClick={async () => { if (auth.currentUser) { await seedDemoWorlds(); loadWorlds(); } }}
                    className="text-white/20 hover:text-primary uppercase font-black text-[8px] tracking-[0.4em] transition-all">
                    Or Initialize Demo Universe
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ─────────────────────────────────────────────────────────────
  return (
    <>
      {/* World background imagery */}
      <WorldBackground world={selectedWorld} />
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm -z-10 pointer-events-none" />

      {/* Ambient music */}
      <AnimatePresence>
        {selectedWorld && <WorldMusicBar world={selectedWorld} albums={userAlbums} />}
      </AnimatePresence>

      {/* Character detail modal */}
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

      {/* Lore detail modal */}
      <AnimatePresence>
        {selectedLore && <LoreDetailPanel entry={selectedLore} onClose={() => setSelectedLore(null)} />}
      </AnimatePresence>

      {/* Event detail modal */}
      <AnimatePresence>
        {selectedEvent && <EventDetailPanel event={selectedEvent} characters={characters} onClose={() => setSelectedEvent(null)} />}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen relative">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12">

          {/* Header actions */}
          <div className="flex items-center justify-between mb-8 relative z-10">
            <button onClick={() => { setViewMode('GALLERY'); setSelectedWorld(null); }}
              className="flex items-center gap-2 px-6 py-3 bg-black/40 hover:bg-black/60 rounded-full text-white/60 hover:text-white transition-all border border-white/10 backdrop-blur-md">
              <ArrowLeft size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Back</span>
            </button>

            {isOwner && (
              <div className="flex items-center gap-3">
                <div className="p-1 bg-black/40 border border-white/10 rounded-full flex gap-1 backdrop-blur-md">
                  <button onClick={() => setIsPreviewMode(false)}
                    className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${!isPreviewMode ? 'bg-green-500 text-white' : 'text-white/40 hover:text-white'}`}>
                    <Globe size={12} className="inline mr-1" /> Published
                  </button>
                  <button onClick={() => setIsPreviewMode(true)}
                    className={`px-4 py-2 rounded-full text-[8px] font-black uppercase tracking-widest transition-all ${isPreviewMode ? 'bg-small-orange text-black' : 'text-white/40 hover:text-white'}`}>
                    <Eye size={12} className="inline mr-1" /> Preview
                  </button>
                </div>
                <button onClick={() => onEdit?.(selectedWorld!)}
                  className="px-5 py-3 bg-black/40 hover:bg-black/60 text-white rounded-full font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2 border border-white/10 backdrop-blur-md">
                  <Edit3 size={13} /> Edit
                </button>
                <button onClick={handlePublishAll} disabled={isPublishing}
                  className="px-5 py-3 bg-white text-black hover:bg-small-orange hover:text-white rounded-full font-black uppercase tracking-widest text-[9px] transition-all flex items-center gap-2 shadow-xl disabled:opacity-50">
                  {isPublishing ? '...' : <><Unlock size={13} /> Publish All</>}
                </button>
              </div>
            )}
          </div>

          {/* Hero */}
          <div className="relative h-[22rem] rounded-[3rem] overflow-hidden shadow-2xl mb-10 group/hero">
            <img src={selectedWorld?.coverImage || undefined} className="w-full h-full object-cover group-hover/hero:scale-105 transition-transform duration-1000" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent flex flex-col justify-end p-10">
              <div className="flex items-center gap-3 mb-3">
                <span className="px-4 py-1.5 bg-small-orange/20 text-small-orange text-[9px] font-black uppercase tracking-widest rounded-full border border-small-orange/20 backdrop-blur-md">
                  World Source Code Active
                </span>
                {selectedWorld?.status === 'DRAFT' && isOwner && (
                  <span className="px-4 py-1.5 bg-white/10 text-white/40 text-[9px] font-black uppercase tracking-widest rounded-full border border-white/10 backdrop-blur-md">Draft</span>
                )}
              </div>
              <PageHeader>{selectedWorld?.name}</PageHeader>
              <p className="text-white/60 text-base lg:text-lg font-medium max-w-2xl leading-relaxed mt-2">{selectedWorld?.description}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex overflow-x-auto gap-3 mb-10 no-scrollbar">
            {[
              { id: 'Overview',   icon: LayoutGrid },
              { id: 'Characters', icon: Users },
              { id: 'Lore',       icon: Scroll },
              { id: 'Timeline',   icon: History },
              { id: 'Graph',      icon: Network },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
                className={`px-7 py-3.5 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all flex items-center gap-2.5 whitespace-nowrap shadow-lg flex-shrink-0 ${activeTab === tab.id ? 'bg-small-orange text-black' : 'bg-black/40 backdrop-blur-md border border-white/10 text-white hover:bg-black/60'}`}>
                <tab.icon size={14} /> {tab.id}
              </button>
            ))}
          </div>

          {/* Content */}
          <AnimatePresence mode="wait">
            <motion.div key={activeTab} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}
              className="bg-black/50 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 min-h-[460px]">

              {/* ── OVERVIEW ── */}
              {activeTab === 'Overview' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
                      <Sparkles className="text-small-orange" size={20} /> World Narrative
                    </h3>
                    <p className="text-white/60 font-medium leading-loose">
                      {selectedWorld?.status === 'PUBLISHED'
                        ? 'This living universe is accessible to all. Explore the full experience below.'
                        : 'This world is under active development.'}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Characters', value: characters.length, icon: Users },
                        { label: 'Lore Entries', value: lore.length, icon: Scroll },
                        { label: 'Timeline Events', value: timeline.length, icon: History },
                      ].map(stat => (
                        <div key={stat.label} className="p-5 bg-white/5 rounded-2xl border border-white/10 text-center">
                          <stat.icon size={16} className="text-small-orange mx-auto mb-2" />
                          <p className="text-2xl font-black text-white">{stat.value}</p>
                          <p className="text-[7px] font-black uppercase tracking-widest text-white/30 mt-0.5">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30">Recent Activity</h4>
                    {[...characters, ...lore, ...timeline].slice(0, 5).map((item: any, i) => (
                      <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/5">
                        {item.imageUrl && <img src={item.imageUrl} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" alt="" />}
                        {!item.imageUrl && (
                          <div className="w-8 h-8 bg-small-orange/20 rounded-lg flex items-center justify-center text-small-orange flex-shrink-0">
                            {item.name ? <Users size={13} /> : <Scroll size={13} />}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-black uppercase tracking-tight text-white truncate">{item.name || item.title}</p>
                          <p className="text-[7px] font-bold text-white/20 uppercase tracking-widest">{item.role || item.type || 'Event'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── CHARACTERS ── */}
              {activeTab === 'Characters' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {characters.map(char => (
                    <motion.div key={char.id} whileHover={{ y: -6, scale: 1.02 }}
                      onClick={() => setSelectedCharacter(char)}
                      className="group bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden hover:border-white/20 transition-all shadow-xl cursor-pointer relative"
                    >
                      {/* Portrait banner */}
                      <div className="relative h-40 overflow-hidden">
                        <img src={char.imageUrl || `https://picsum.photos/seed/${char.id}/400/300`}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 opacity-70 group-hover:opacity-90" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        {!char.isPublished && isOwner && (
                          <span className="absolute top-3 right-3 px-2 py-0.5 bg-white/10 rounded text-[7px] font-black uppercase tracking-widest text-white/30 border border-white/10">Draft</span>
                        )}
                        {char.accentColor && (
                          <div className="absolute bottom-0 inset-x-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${char.accentColor}, transparent)` }} />
                        )}
                      </div>

                      <div className="p-5 space-y-3">
                        <div>
                          <p className="text-[7px] font-black uppercase tracking-widest text-small-orange/70 mb-0.5">{char.role}</p>
                          <h3 className="text-lg font-black uppercase tracking-tight text-white group-hover:text-small-orange transition-colors">{char.name}</h3>
                        </div>
                        <p className="text-xs text-white/50 font-medium leading-relaxed italic line-clamp-2">"{char.bio}"</p>

                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1.5">
                            {char.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-2 py-0.5 bg-white/5 text-white/25 text-[7px] font-black uppercase tracking-widest rounded-full border border-white/5">#{tag}</span>
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

                  {characters.length === 0 && (
                    <div className="col-span-full py-16 text-center border-2 border-dashed border-white/5 rounded-2xl">
                      <Users className="text-white/10 mx-auto mb-3" size={36} />
                      <p className="text-white/20 text-[9px] uppercase tracking-widest">No characters in this world yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── LORE ── */}
              {activeTab === 'Lore' && (
                <div className="space-y-5">
                  {lore.map(entry => (
                    <motion.div key={entry.id} whileHover={{ x: 4 }}
                      onClick={() => setSelectedLore(entry)}
                      className="p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/[0.08] hover:border-white/20 transition-all cursor-pointer group">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-small-orange/20 rounded-xl flex items-center justify-center text-small-orange flex-shrink-0 group-hover:bg-small-orange group-hover:text-black transition-all">
                            {entry.type === 'LOCATION' ? <MapPin size={16} /> : <Scroll size={16} />}
                          </div>
                          <div>
                            <h3 className="text-lg font-black uppercase tracking-tight text-white">{entry.title}</h3>
                            <div className="flex items-center gap-3">
                              <span className="text-[7px] font-black uppercase tracking-widest text-white/30">{entry.type}</span>
                              {(entry.gallery?.length ?? 0) > 0 && <span className="flex items-center gap-1 text-[7px] text-white/20"><ImageIcon size={8} /> {entry.gallery!.length} images</span>}
                              {!entry.isPublished && isOwner && <span className="text-[7px] font-black text-small-orange/40">Draft</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-2 py-0.5 bg-white/5 text-white/25 text-[7px] font-black uppercase tracking-widest rounded-full border border-white/5">{tag}</span>
                          ))}
                          <ChevronRight size={14} className="text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
                        </div>
                      </div>
                      <p className="text-xs text-white/50 mt-4 pl-14 line-clamp-2 leading-relaxed">{entry.content}</p>
                    </motion.div>
                  ))}
                  {lore.length === 0 && (
                    <div className="py-16 text-center border-2 border-dashed border-white/5 rounded-2xl">
                      <Scroll className="text-white/10 mx-auto mb-3" size={36} />
                      <p className="text-white/20 text-[9px] uppercase tracking-widest">No lore entries yet</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── TIMELINE ── */}
              {activeTab === 'Timeline' && (
                <div className="relative py-8">
                  {selectedWorld?.timelineConfig && (
                    <div className="mb-12 p-6 bg-white/5 border border-white/10 rounded-2xl">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <h4 className="text-lg font-black uppercase tracking-tight italic">Temporal Range</h4>
                          <p className="text-[8px] font-black uppercase tracking-widest text-white/30">Chronological boundaries</p>
                        </div>
                        <span className="text-2xl font-black text-small-orange">
                          {selectedWorld.timelineConfig.startYear} – {selectedWorld.timelineConfig.endYear}
                          <span className="text-[10px] text-white/20 ml-2">{selectedWorld.timelineConfig.unitName}</span>
                        </span>
                      </div>
                      <div className="relative h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
                        {timeline.map(event => {
                          const start = selectedWorld.timelineConfig?.startYear || 0;
                          const end = selectedWorld.timelineConfig?.endYear || 1000;
                          const left = ((event.year - start) / Math.max(1, end - start)) * 100;
                          const sig = event.significance;
                          return (
                            <motion.div key={event.id} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }}
                              className="absolute top-0 bottom-0 w-1 cursor-pointer hover:w-2 transition-all"
                              style={{ left: `${left}%`, background: sig === 'PIVOTAL' ? '#ef4444' : sig === 'MAJOR' ? '#eab308' : '#FF8C00', boxShadow: '0 0 8px currentColor' }}
                              onClick={() => setSelectedEvent(event)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="absolute left-1/2 top-72 bottom-0 w-px bg-white/10 -translate-x-1/2 hidden md:block" />

                  <div className="space-y-16 mt-4">
                    {timeline.sort((a, b) => (a.year || 0) - (b.year || 0)).map((event, i) => (
                      <motion.div key={event.id} initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }} whileInView={{ opacity: 1, x: 0 }}
                        className={`flex flex-col md:flex-row items-center justify-center gap-6 ${i % 2 === 0 ? 'md:flex-row-reverse md:text-right' : ''}`}>
                        <div className="flex-1 max-w-sm w-full space-y-3">
                          <div className="text-[9px] font-black uppercase tracking-[0.4em] text-small-orange/60">
                            {event.year} {selectedWorld?.timelineConfig?.unitName}
                            {event.significance && <span className={`ml-2 ${event.significance === 'PIVOTAL' ? 'text-red-400' : event.significance === 'MAJOR' ? 'text-yellow-400' : 'text-white/30'}`}>· {event.significance}</span>}
                          </div>
                          <h4 className="text-xl font-black uppercase tracking-tight text-white">{event.title}</h4>
                          <p className="text-sm text-white/50 leading-relaxed italic">"{event.description}"</p>
                          {(event.linkedCharacterIds?.length ?? 0) > 0 && (
                            <div className={`flex flex-wrap gap-2 mt-2 ${i % 2 === 0 ? 'md:justify-end' : ''}`}>
                              {event.linkedCharacterIds!.map(id => {
                                const char = characters.find(c => c.id === id);
                                return char ? (
                                  <button key={id} onClick={() => setSelectedCharacter(char)}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg text-[7px] font-black uppercase tracking-widest text-white/40 border border-white/10 hover:border-white/20 hover:text-white/70 transition-all">
                                    <img src={char.imageUrl} className="w-4 h-4 rounded-full object-cover" alt="" />
                                    {char.name}
                                  </button>
                                ) : null;
                              })}
                            </div>
                          )}
                        </div>

                        <div className="relative z-10 hidden md:block">
                          <div className="w-4 h-4 bg-small-orange rounded-full shadow-[0_0_20px_rgba(255,140,0,0.8)] border-4 border-black" />
                        </div>

                        <div className="flex-1 w-full flex md:block">
                          <motion.button whileHover={{ scale: 1.02 }}
                            onClick={() => setSelectedEvent(event)}
                            className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-left hover:bg-white/10 hover:border-white/20 transition-all group w-full md:w-auto">
                            <div className="flex items-center gap-2">
                              <Zap size={14} className="text-small-orange opacity-40 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/40 group-hover:text-white transition-colors">Expand Event</p>
                            </div>
                            {event.gallery?.length ? (
                              <p className="text-[7px] text-white/20 mt-1">{event.gallery.length} image{event.gallery.length > 1 ? 's' : ''}</p>
                            ) : null}
                          </motion.button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── GRAPH ── */}
              {activeTab === 'Graph' && selectedWorld && (
                <div className="w-full rounded-[2rem] overflow-hidden border border-white/10 relative" style={{ height: 'clamp(420px, 72vh, 900px)' }}>
                  <div className="absolute top-6 left-6 z-10 pointer-events-none">
                    <h4 className="text-lg font-black uppercase tracking-tight italic text-white flex items-center gap-2">
                      <Network className="text-small-orange" size={20} /> Neural Topology
                    </h4>
                    <p className="text-[8px] font-black uppercase tracking-widest text-white/30">High-fidelity universe connections</p>
                  </div>
                  <WorldGraphView
                    world={selectedWorld} characters={characters}
                    loreEntries={lore} timelineEvents={timeline}
                    albums={userAlbums} videos={userVideos}
                    isEmbedded={true}
                  />
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
