import { createPortal } from 'react-dom';
import React, { useState, useEffect } from 'react';
import { gridSrc } from '../services/imageDerivatives';
import { Photo, UserProfile } from '../types';
import PageHeader from './PageHeader';
import { 
  Heart, 
  UserPlus, 
  Maximize2, 
  Share2, 
  Sparkles, 
  Camera, 
  Image as ImageIcon,
  Cloud,
  QrCode,
  Wand2,
  Layers,
  Upload,
  Landmark,
  GraduationCap,
  Frame,
  Trophy,
  Search,
  MoreHorizontal,
  Compass,
  Bot,
  Users,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchGlobalPhotos, favoritePhoto, followUser, auth, fetchThemePresets, updateUserProfile, fetchUserProfile, fetchUserProfiles, fetchUserPhotos } from '../services/backendService';
import { useShellNext } from '../hooks/useShellNext';
import { useSpatial } from '../contexts/SpatialContext';
import SpatialImage from './SpatialImage';
import DepthAnalyzer from './DepthAnalyzer';
import SpatialMedia from './SpatialMedia';
import PhotoEditPanel from './PhotoEditPanel';
import FromSocialGallery from './FromSocialGallery';
import PhotoCritiquePanel from './PhotoCritiquePanel';
import SchoolView from './school/SchoolView';
import PortfolioRoom from './photo/PortfolioRoom';
import WeeklySalon from './photo/WeeklySalon';
import { PHOTO_ART_SCHOOL } from '../data/photoArtCurriculum';
import { PHOTO_IMPORT_SOURCES, PHOTOGRAPHER_PRO_FEATURES } from '../services/photoEditingService';
import ChipRail from './ui/ChipRail';

interface GlobalPhotosViewProps {
  onVisitUser: (uid: string) => void;
  initialMode?: 'WATERFALL' | 'GALLERY' | 'THEMES' | 'EVENTS' | 'IMPORTS' | 'PRO' | 'SOCIAL' | 'SCHOOL' | 'SALON' | 'SYNTHETIC' | 'HYBRID';
  /** Opens the classical Art Museum (ArtGalleryView) — masters + open-access collections. */
  onOpenArtMuseum?: () => void;
}

const GlobalPhotosView: React.FC<GlobalPhotosViewProps> = ({ onVisitUser, initialMode = 'WATERFALL', onOpenArtMuseum }) => {
  const { isSpatialMode } = useSpatial();
  const { enabled: shellNext } = useShellNext();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mode, setMode] = useState<'WATERFALL' | 'GALLERY' | 'THEMES' | 'EVENTS' | 'IMPORTS' | 'PRO' | 'SOCIAL' | 'SCHOOL' | 'SALON' | 'SYNTHETIC' | 'HYBRID'>(initialMode);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null);
  
  // Theme gallery state
  const [themes, setThemes] = useState<any[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<any | null>(null);

  // ── "The Wall" shell (flag-ON) state ─────────────────────────────────────────
  // Everything below only participates when shellNext is enabled; the classic path
  // never reads it. Photographers-to-follow are derived from the loaded feed.
  const [photographers, setPhotographers] = useState<{ uid: string; name: string; photo: string; count: number }[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [moreOpen, setMoreOpen] = useState(false);
  const [query, setQuery] = useState('');

  /** AI / generated detection — no dedicated flag exists yet, so infer from tags/text. */
  const AI_RE = /\b(ai|a\.i\.|synthetic|generated|generative|midjourney|dall.?e|stable.?diffusion|prompt(ed)?)\b/i;
  const isSynthetic = (p: Photo) =>
    (p.tags || []).some(t => AI_RE.test(t)) || AI_RE.test(p.title || '') || AI_RE.test(p.description || '');

  const q = query.trim().toLowerCase();
  const matchesQuery = (p: Photo) =>
    !q ||
    (p.title || '').toLowerCase().includes(q) ||
    (p.description || '').toLowerCase().includes(q) ||
    (p.tags || []).some(t => t.toLowerCase().includes(q));
  const displayPhotos = q ? photos.filter(matchesQuery) : photos;

  const handleFollowPhotographer = async (uid: string) => {
    if (!auth.currentUser || followed.has(uid)) return;
    setFollowed(prev => { const next = new Set(prev); next.add(uid); return next; });
    try { await followUser(uid); } catch { /* optimistic; leave marked */ }
  };

  // ── Portfolio room (Part 3C) ────────────────────────────────────────────────
  // The chrome-free presentation layer. A room is opened either for one photographer
  // (their whole body of work, fetched on demand) or for the currently loaded feed.
  const [room, setRoom] = useState<{
    photos: Photo[]; name: string; statement?: string; index: number;
  } | null>(null);
  const [openingRoom, setOpeningRoom] = useState(false);

  /** Open a photographer's own room — their full library, presented as prints. */
  const openPhotographerRoom = async (ownerId: string, startPhoto?: Photo) => {
    if (openingRoom) return;
    setOpeningRoom(true);
    try {
      const [profile, owned] = await Promise.all([
        fetchUserProfile(ownerId).catch(() => null),
        fetchUserPhotos(ownerId).catch(() => [] as Photo[]),
      ]);
      const works = (owned || []).filter(p => p?.url && p.mediaType !== 'VIDEO');
      // Degrade to whatever we already have on screen if their library can't be read.
      const fallback = startPhoto ? [startPhoto] : photos.filter(p => p.ownerId === ownerId);
      const list = works.length ? works : fallback;
      if (!list.length) return;
      const startIndex = startPhoto ? Math.max(0, list.findIndex(p => p.id === startPhoto.id)) : 0;
      setRoom({
        photos: list,
        name: profile?.displayName || 'Photographer',
        ...(profile?.bio ? { statement: profile.bio } : {}),
        index: startIndex,
      });
    } finally {
      setOpeningRoom(false);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      if (mode === 'SOCIAL') { setIsLoading(false); return; } // FromSocialGallery loads its own data
      if (mode === 'SCHOOL') { setIsLoading(false); return; } // SchoolView loads its own progress
      if (mode === 'SALON') { setIsLoading(false); return; }  // WeeklySalon loads its own entries
      setIsLoading(true);
      if (mode === 'THEMES') {
        const data = await fetchThemePresets();
        setThemes(data.filter(t => t.isPublic));
      } else {
        const data = await fetchGlobalPhotos(mode === 'GALLERY' || mode === 'PRO');
        setPhotos(data);
      }
      setIsLoading(false);
    };
    loadData();
  }, [mode]);

  // Derive the "Photographers to follow" rail from the loaded feed's owners
  // (deduped by ownerId, ranked by how many works are on the wall). Wall-only.
  useEffect(() => {
    if (!shellNext) return;
    if (!(mode === 'WATERFALL' || mode === 'GALLERY' || mode === 'HYBRID')) return;
    if (!photos.length) { setPhotographers([]); return; }
    const counts = new Map<string, number>();
    for (const p of photos) {
      if (p.ownerId) counts.set(p.ownerId, (counts.get(p.ownerId) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([uid]) => uid);
    let cancelled = false;
    (async () => {
      const profs = await fetchUserProfiles(top).catch(() => [] as any[]);
      if (cancelled) return;
      const byId = new Map(profs.map((p: any) => [p.uid, p]));
      setPhotographers(top.map(uid => {
        const pr: any = byId.get(uid);
        return {
          uid,
          name: pr?.displayName || 'Photographer',
          photo: pr?.photoURL || `https://picsum.photos/seed/${uid}/100/100`,
          count: counts.get(uid) || 0,
        };
      }));
    })();
    return () => { cancelled = true; };
  }, [photos, mode, shellNext]);

  const handleFavorite = async (photo: Photo) => {
    if (!auth.currentUser) return;
    const isFavorited = photo.favorites?.includes(auth.currentUser.uid);
    await favoritePhoto(photo.id, !isFavorited);
    // Optimistic update
    setPhotos(prev => prev.map(p => {
      if (p.id === photo.id) {
        const newFavorites = isFavorited 
          ? (p.favorites || []).filter(id => id !== auth.currentUser?.uid)
          : [...(p.favorites || []), auth.currentUser!.uid];
        return { ...p, favorites: newFavorites, likesCount: (p.likesCount || 0) + (isFavorited ? -1 : 1) };
      }
      return p;
    }));
  };

  const loadingSpinner = (
    <div className="flex-1 flex items-center justify-center bg-transparent py-40">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Developing Archive...</p>
      </div>
    </div>
  );

  // Classic (flag-OFF) keeps its full-screen loading gate, byte-for-byte.
  if (!shellNext && isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Developing Archive...</p>
        </div>
      </div>
    );
  }

  // ── Shared masonry renderer ─────────────────────────────────────────────────
  // Non-immersive output is identical to the classic Waterfall/Gallery grid, so
  // the flag-OFF path is unchanged. `immersive` tightens the grid (edge-to-edge
  // Wall) and `badge` stamps a per-tile kind chip (Synthetic / Hybrid).
  const renderMasonry = (list: Photo[], immersive = false, badge?: (p: Photo) => React.ReactNode) => (
    <>
      <div className={immersive
        ? "columns-2 md:columns-3 lg:columns-4 2xl:columns-5 gap-3 space-y-3"
        : "columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6"}>
        {list.map((photo) => (
          <motion.div
            key={photo.id}
            layoutId={photo.id}
            className={`relative break-inside-avoid overflow-hidden group cursor-pointer border border-white/5 shadow-2xl ${immersive ? 'rounded-xl mb-3' : 'rounded-3xl'}`}
            onClick={() => setSelectedPhoto(photo)}
          >
            {badge && badge(photo)}
            {photo.mediaType === 'VIDEO' ? (
              <SpatialMedia url={photo.url} type="VIDEO" className="w-full aspect-video" forceDepth={isSpatialMode} autoPlay muted loop />
            ) : (
              <div className="aspect-auto">
                <SpatialImage url={photo.url} is3D={isSpatialMode} />
              </div>
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-6 flex flex-col justify-end">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full overflow-hidden border border-white/20"
                    onClick={(e) => { e.stopPropagation(); onVisitUser(photo.ownerId); }}
                  >
                    <img src={`https://picsum.photos/seed/${photo.ownerId}/100/100`} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-widest truncate max-w-[120px]">{photo.title || 'Untitled Signal'}</h4>
                    <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Signal from the Archive</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleFavorite(photo); }}
                    className={`p-2 rounded-full backdrop-blur-md transition-all ${photo.favorites?.includes(auth.currentUser?.uid || '') ? 'bg-small-orange text-white' : 'bg-white/10 text-white/60 hover:text-white'}`}
                  >
                    <Heart size={14} fill={photo.favorites?.includes(auth.currentUser?.uid || '') ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {list.length === 0 && (
        <div className="py-40 text-center opacity-20">
          <Sparkles size={64} className="mx-auto mb-6" />
          <p className="text-xl font-black uppercase tracking-[0.5em]">No signals detected in this sector.</p>
        </div>
      )}
    </>
  );

  // Kind badge chip for Synthetic / Hybrid tiles.
  const kindBadge = (label: string, kind: 'ai' | 'photo' | 'art') => (
    <span
      className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide"
      style={{
        background: kind === 'ai'
          ? 'linear-gradient(135deg,#00DAF3,#6B0099)'
          : kind === 'art'
          ? 'linear-gradient(135deg,#FF8C00,#D40055)'
          : 'rgba(0,0,0,0.6)',
        color: '#fff',
      }}
    >
      {label}
    </span>
  );

  // ── Shared mode body ────────────────────────────────────────────────────────
  // The nine classic mode branches, rendered identically for flag-OFF and reused
  // (for the non-Explore lenses) inside the Wall shell.
  const renderModeBody = () => (
    <>
        {mode === 'SALON' ? (
          <WeeklySalon />
        ) : mode === 'SCHOOL' ? (
          <SchoolView curriculum={PHOTO_ART_SCHOOL} embedded />
        ) : mode === 'SOCIAL' ? (
          <div className="max-w-6xl mx-auto">
            <FromSocialGallery uid={auth.currentUser?.uid || ''} kinds={['PHOTO', 'GIF', 'STICKER']} emptyLabel="No photos shared to your feed yet" />
          </div>
        ) : mode === 'IMPORTS' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {PHOTO_IMPORT_SOURCES.map(source => (
                <div key={source.id} className="p-8 bg-white/5 border border-white/10 rounded-2xl">
                  <Cloud size={28} className="text-small-orange mb-6" />
                  <h3 className="text-xl font-black uppercase tracking-tight mb-3">{source.label}</h3>
                  <p className="text-xs font-bold text-white/40 leading-relaxed mb-6">{source.note}</p>
                  <button className="px-5 py-3 bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/50">
                    Connector Planned
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : mode === 'EVENTS' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-8">
            <div className="p-8 bg-white/5 border border-white/10 rounded-2xl">
              <QrCode size={32} className="text-small-orange mb-6" />
              <h3 className="text-4xl font-black uppercase tracking-tight mb-4">Live Photo Pools</h3>
              <p className="text-sm font-bold text-white/40 leading-relaxed max-w-2xl">
                Event guests can join through a QR code, upload photos and 30 second clips, and contribute to a shared live album connected to Live Hub, event pages, artist management, social live-now moments, and chat.
              </p>
            </div>
            <div className="p-8 bg-black/30 border border-white/10 rounded-2xl">
              <Upload size={28} className="text-white/40 mb-6" />
              <h4 className="text-xl font-black uppercase tracking-tight mb-4">Event Album Automation</h4>
              <p className="text-xs font-bold text-white/40 leading-relaxed">
                The existing event photo pool becomes the source for auto-generated albums, slideshows, moderation queues, and artist/team memory books.
              </p>
            </div>
          </div>
        ) : mode === 'PRO' ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.85fr] gap-8">
            <div className="p-8 bg-white/5 border border-white/10 rounded-2xl">
              <Sparkles size={32} className="text-small-orange mb-6" />
              <h3 className="text-5xl font-black uppercase tracking-tight mb-5">Photographer Rooms</h3>
              <p className="text-sm font-bold text-white/40 leading-relaxed max-w-3xl">
                A unified public/private portfolio layer for photographers, built from the same photo archive and editor framework.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8">
                {PHOTOGRAPHER_PRO_FEATURES.map(feature => (
                  <div key={feature} className="p-4 bg-black/30 border border-white/10 rounded-2xl text-xs font-bold text-white/50 leading-relaxed">
                    {feature}
                  </div>
                ))}
              </div>

              {/* Portfolio room — the chrome-free presentation layer (Part 3C) */}
              <div className="mt-8 p-6 bg-black/40 border border-white/10 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <Frame size={18} className="text-small-orange" />
                  <h4 className="text-sm font-black uppercase tracking-widest">Portfolio Room</h4>
                </div>
                <p className="text-xs font-bold text-white/40 leading-relaxed mb-6 max-w-xl">
                  Your work, full bleed, on black — no grid, no buttons, no feed. Arrow keys or swipe to move,
                  <span className="text-white/60"> i </span> for the wall label and capture data, <span className="text-white/60">esc</span> to leave.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => auth.currentUser && openPhotographerRoom(auth.currentUser.uid)}
                    disabled={!auth.currentUser || openingRoom}
                    className="px-6 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:scale-[1.02] transition-all"
                  >
                    {openingRoom ? 'Hanging the room…' : 'Enter my portfolio room'}
                  </button>
                  <button
                    onClick={() => {
                      const stills = photos.filter(p => p.mediaType !== 'VIDEO');
                      if (stills.length) setRoom({ photos: stills, name: 'The Gallery', statement: 'Selected work from the community archive.', index: 0 });
                    }}
                    disabled={!photos.some(p => p.mediaType !== 'VIDEO')}
                    className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white disabled:opacity-30 transition-all"
                  >
                    Present this gallery
                  </button>
                </div>
              </div>
            </div>
            <div className="p-8 bg-white/5 border border-white/10 rounded-2xl">
              <Layers size={28} className="text-cyan-300 mb-6" />
              <h4 className="text-2xl font-black uppercase tracking-tight mb-4">Platform Auto Depth</h4>
              <p className="text-xs font-bold text-white/40 leading-relaxed mb-6">
                Photos and videos can render with no-warp spatial depth across Plajah. It behaves like an ambient viewer enhancement: easy, reversible, and seamless.
              </p>
              <button
                disabled={!photos[0]}
                onClick={() => photos[0] && setEditingPhoto(photos[0])}
                className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
              >
                Open Edit Workflow
              </button>
            </div>
          </div>
        ) : mode === 'THEMES' ? (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 space-y-6">
              {themes.map(theme => (
                 <div key={theme.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group cursor-pointer hover:border-white/30 transition-all" onClick={() => setSelectedTheme(theme)}>
                    <div className="aspect-video relative bg-black/50 overflow-hidden">
                       {theme.coverImage ? (
                          <img loading="lazy" decoding="async" src={theme.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                       ) : theme.assets && theme.assets.length > 0 ? (
                          theme.assets[0].type === 'PHOTO' ? <img loading="lazy" decoding="async" src={theme.assets[0].url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" /> : <video src={theme.assets[0].url} className="w-full h-full object-cover" muted loop autoPlay />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center text-white/10">
                           <ImageIcon size={48} />
                         </div>
                       )}
                       <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black to-transparent">
                         <span className="text-[10px] font-black uppercase tracking-widest text-small-orange bg-black/50 px-2 py-1 rounded inline-block">{theme.mode}</span>
                       </div>
                    </div>
                    <div className="p-6">
                       <h3 className="font-bold text-lg mb-1 truncate">{theme.title}</h3>
                       <p className="text-xs opacity-50 line-clamp-2">{theme.description}</p>
                       <div className="mt-4 flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{theme.assets?.length || 0} Assets</span>
                       </div>
                    </div>
                 </div>
              ))}
              {themes.length === 0 && (
                <div className="col-span-full py-40 text-center opacity-20">
                  <Sparkles size={64} className="mx-auto mb-6" />
                  <p className="text-xl font-black uppercase tracking-[0.5em]">No themes available right now.</p>
                </div>
              )}
           </div>
        ) : (
          renderMasonry(photos)
        )}
    </>
  );

  // ── Shared overlays (modals + room + editor) ────────────────────────────────
  // Rendered by both the classic and Wall shells so every feature (detail modal,
  // Critique Circle, PortfolioRoom, favorites, follow, editor, spatial depth)
  // works from within the new shell exactly as before.
  const renderOverlays = () => (
    <>
      {/* Theme Detail Modal — portaled so it opens in the current viewport */}
      {createPortal(<AnimatePresence>
        {selectedTheme && (
           <motion.div
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 z-[200] flex items-center justify-center p-6 lg:p-20 bg-theme-card/95 backdrop-blur-3xl"
             onClick={() => setSelectedTheme(null)}
           >
              <div
                className="relative max-w-4xl w-full max-h-full bg-[#0a0a0a] rounded-[3rem] overflow-hidden border border-white/10 shadow-3xl flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                  <div className="p-8 flex items-start justify-between border-b border-white/10">
                     <div>
                       <h2 className="text-3xl font-black uppercase tracking-tightest text-white mb-2">{selectedTheme.title}</h2>
                       <p className="text-sm font-bold opacity-60 italic max-w-xl">{selectedTheme.description}</p>
                     </div>
                     <button onClick={() => setSelectedTheme(null)} className="p-2 text-white/40 hover:text-white transition-all bg-white/5 rounded-full">
                       <Maximize2 size={20} />
                     </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 bg-black/50 grid grid-cols-2 md:grid-cols-3 gap-4">
                     {selectedTheme.assets?.map((asset: any, i: number) => (
                        <div key={asset.id || i} className="aspect-square rounded-2xl overflow-hidden border border-white/10 relative group">
                           {asset.type === 'VIDEO' ? (
                             <video src={asset.url} className="w-full h-full object-cover" autoPlay muted loop />
                           ) : (
                             <img loading="lazy" decoding="async" src={gridSrc(asset)} className="w-full h-full object-cover" alt="" />
                           )}
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-white">{asset.type}</span>
                           </div>
                        </div>
                     ))}
                     {(!selectedTheme.assets || selectedTheme.assets.length === 0) && (
                        <div className="col-span-full py-20 text-center text-white/40 text-[10px] font-black uppercase tracking-widest">
                           No explicit assets. Only a cover image exists.
                        </div>
                     )}
                  </div>
                  <div className="p-6 border-t border-white/10 bg-[#050505] flex justify-end">
                     <button
                       onClick={async () => {
                          if (!auth.currentUser) return alert('Please log in');
                          try {
                             // Fetch current user and append theme ID to savedThemePresets
                             const myProfile = await fetchUserProfile(auth.currentUser!.uid);
                             if (myProfile) {
                               const currentSaved = myProfile.savedThemePresets || [];
                               if (!currentSaved.includes(selectedTheme.id)) {
                                  await updateUserProfile(auth.currentUser!.uid, { savedThemePresets: [...currentSaved, selectedTheme.id] });
                                  alert('Added to your personal theme library!');
                               } else {
                                  alert('Theme is already in your library.');
                               }
                             }
                          } catch(err) {
                             console.error('Failed to save theme', err);
                          }
                       }}
                       className="px-8 py-4 bg-small-orange text-white rounded-full text-xs font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
                     >
                        Add to My Theme Library
                     </button>
                  </div>
              </div>
           </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {/* Photo Detail Modal — portaled so it opens in the current viewport */}
      {createPortal(<AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 lg:p-20 bg-theme-card/95 backdrop-blur-3xl"
            onClick={() => setSelectedPhoto(null)}
          >
            <motion.div
              layoutId={selectedPhoto.id}
              className="relative max-w-6xl w-full max-h-full flex flex-col lg:flex-row bg-white/5 rounded-[3rem] overflow-hidden border border-white/10 shadow-3xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex-1 bg-theme border-r border-theme flex items-center justify-center overflow-hidden">
                {selectedPhoto.mediaType === 'VIDEO' ? (
                  <SpatialMedia url={selectedPhoto.url} type="VIDEO" className="w-full h-full min-h-[50vh]" forceDepth={isSpatialMode} controls autoPlay muted={false} loop />
                ) : (
                  <div className="w-full h-full p-4 lg:p-10">
                    <SpatialImage url={selectedPhoto.url} is3D={isSpatialMode} />
                  </div>
                )}
              </div>

              <div className="w-full lg:w-96 p-10 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full overflow-hidden border-2 border-small-orange cursor-pointer"
                      onClick={() => onVisitUser(selectedPhoto.ownerId)}
                    >
                      <img loading="lazy" decoding="async" src={`https://picsum.photos/seed/${selectedPhoto.ownerId}/200/200`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest">Artist Archive</h3>
                      <button
                        onClick={() => followUser(selectedPhoto.ownerId)}
                        className="text-[10px] font-black text-small-orange uppercase tracking-widest hover:text-white transition-all"
                      >
                        Follow Artist
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPhoto(null)} className="p-2 text-white/20 hover:text-white transition-all">
                    <Maximize2 size={20} />
                  </button>
                </div>

                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tightest mb-4">{selectedPhoto.title || 'Untitled Signal'}</h2>
                  <p className="text-sm font-medium text-white/60 leading-relaxed italic mb-8">
                    {selectedPhoto.description || 'No data transmitted with this signal.'}
                  </p>
                  <DepthAnalyzer imageUrl={selectedPhoto.url} mediaType={selectedPhoto.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE'} />
                </div>

                <div className="flex items-center gap-6 pt-6 border-t border-white/10">
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => handleFavorite(selectedPhoto)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${selectedPhoto.favorites?.includes(auth.currentUser?.uid || '') ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                    >
                      <Heart size={24} fill={selectedPhoto.favorites?.includes(auth.currentUser?.uid || '') ? 'currentColor' : 'none'} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{selectedPhoto.likesCount || 0}</span>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <button className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all">
                      <Share2 size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Share</span>
                  </div>

                  {/* Portfolio room — this photographer's body of work, chrome-free (Part 3C) */}
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => openPhotographerRoom(selectedPhoto.ownerId, selectedPhoto)}
                      disabled={openingRoom}
                      title="Open this photographer's portfolio room"
                      className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      <Frame size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {openingRoom ? 'Hanging…' : 'The Room'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => setEditingPhoto(selectedPhoto)}
                      className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all"
                    >
                      <Wand2 size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Edit</span>
                  </div>
                </div>

                {/* Critique circle — structured, opt-in peer feedback (Part 3C) */}
                <PhotoCritiquePanel photoId={selectedPhoto.id} ownerId={selectedPhoto.ownerId} />

                <div className="mt-auto pt-8 border-t border-white/10">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-2">Signal Timestamp</p>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    {new Date(selectedPhoto.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {/* Portfolio room — full-bleed, above everything (Part 3C) */}
      {room && (
        <PortfolioRoom
          photos={room.photos}
          photographerName={room.name}
          statement={room.statement}
          initialIndex={room.index}
          onClose={() => setRoom(null)}
        />
      )}

      {editingPhoto && (
        <PhotoEditPanel
          photo={editingPhoto}
          variant={mode === 'PRO' ? 'workflow' : 'drawer'}
          onClose={() => setEditingPhoto(null)}
          onApply={() => {}}
        />
      )}
    </>
  );

  // ── THE WALL (flag-ON shell) ────────────────────────────────────────────────
  if (shellNext) {
    const lensActive =
      (mode === 'WATERFALL' || mode === 'GALLERY') ? 'Explore'
      : mode === 'PRO' ? 'Rooms'
      : mode === 'SOCIAL' ? 'Feed'
      : mode === 'SYNTHETIC' ? 'Synthetic'
      : mode === 'HYBRID' ? 'Hybrid'
      : '';

    const lenses: { id: string; label: string; icon: React.ReactNode }[] = [
      { id: 'Explore', label: 'Explore', icon: <Compass size={14} /> },
      { id: 'Rooms', label: 'Rooms', icon: <Frame size={14} /> },
      { id: 'Feed', label: 'Feed', icon: <Share2 size={14} /> },
      { id: 'Synthetic', label: 'Synthetic', icon: <Bot size={14} /> },
      { id: 'Hybrid', label: 'Hybrid', icon: <Layers size={14} /> },
    ];

    const selectLens = (id: string) => {
      setMoreOpen(false);
      if (id === 'Explore') setMode('WATERFALL');
      else if (id === 'Rooms') setMode('PRO');
      else if (id === 'Feed') setMode('SOCIAL');
      else if (id === 'Synthetic') setMode('SYNTHETIC');
      else if (id === 'Hybrid') setMode('HYBRID');
    };

    const moreItems: { label: string; mode?: typeof mode; door?: boolean; icon: React.ReactNode }[] = [
      { label: 'Art Gallery', mode: 'GALLERY', icon: <Sparkles size={14} /> },
      { label: 'Events', mode: 'EVENTS', icon: <QrCode size={14} /> },
      { label: 'Imports', mode: 'IMPORTS', icon: <Cloud size={14} /> },
      { label: 'Themes', mode: 'THEMES', icon: <ImageIcon size={14} /> },
      { label: 'School', mode: 'SCHOOL', icon: <GraduationCap size={14} /> },
      { label: 'Salon', mode: 'SALON', icon: <Trophy size={14} /> },
      ...(onOpenArtMuseum ? [{ label: 'The Masters', door: true, icon: <Landmark size={14} /> }] : []),
    ];
    const moreActive = ['GALLERY', 'EVENTS', 'IMPORTS', 'THEMES', 'SCHOOL', 'SALON'].includes(mode);

    const syntheticPhotos = displayPhotos.filter(isSynthetic);

    const photogPanel = (
      <aside
        className="hidden lg:block w-[250px] flex-none self-start sticky top-16 pl-4 py-2 border-l"
        style={{ borderColor: 'var(--pj-border, rgba(255,255,255,0.08))' }}
      >
        <div className="pj-eyebrow mb-3" style={{ fontSize: '10px', letterSpacing: '0.18em' }}>Photographers to follow</div>
        {photographers.length === 0 && (
          <p className="text-[11px] text-white/30 font-medium">Owners of the photos on the wall will appear here.</p>
        )}
        <div className="space-y-1">
          {photographers.map(pg => (
            <div key={pg.uid} className="flex items-center gap-2.5 py-1.5">
              <img
                src={pg.photo}
                alt=""
                loading="lazy"
                decoding="async"
                onClick={() => openPhotographerRoom(pg.uid)}
                className="w-[34px] h-[34px] rounded-full object-cover flex-none cursor-pointer border border-white/10"
              />
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onVisitUser(pg.uid)}>
                <div className="font-bold text-[13px] truncate">{pg.name}</div>
                <div className="text-[11px] text-white/40">{pg.count} {pg.count === 1 ? 'work' : 'works'}</div>
              </div>
              <button
                onClick={() => handleFollowPhotographer(pg.uid)}
                disabled={followed.has(pg.uid)}
                className="pj-btn pj-btn--xs pj-btn--secondary"
              >
                {followed.has(pg.uid) ? 'Following' : 'Follow'}
              </button>
            </div>
          ))}
        </div>
        {photographers.length > 0 && (
          <button
            onClick={() => selectLens('Feed')}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.12em] text-white/40 hover:text-white transition"
          >
            <Users size={12} /> Explore all →
          </button>
        )}
      </aside>
    );

    let body: React.ReactNode;
    if (isLoading) {
      body = loadingSpinner;
    } else if (mode === 'WATERFALL' || mode === 'GALLERY') {
      body = (
        <div className="flex items-start">
          <div className="flex-1 min-w-0">{renderMasonry(displayPhotos, true)}</div>
          {photogPanel}
        </div>
      );
    } else if (mode === 'SYNTHETIC') {
      body = (
        <section>
          <div className="mb-6">
            <div className="pj-eyebrow" style={{ letterSpacing: '0.2em' }}>Synthetic</div>
            <h2 className="text-3xl font-black tracking-tight mt-1 mb-1">AI &amp; generated art</h2>
            <p className="text-sm text-white/40 font-medium max-w-2xl">Clearly labeled generative and AI-assisted work, kept distinct from camera-made photography.</p>
          </div>
          {syntheticPhotos.length > 0 ? (
            renderMasonry(syntheticPhotos, true, () => kindBadge('AI · synthetic', 'ai'))
          ) : (
            <div className="rounded-2xl border border-dashed py-24 px-8 text-center" style={{ borderColor: 'var(--pj-border, rgba(255,255,255,0.12))' }}>
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6" style={{ background: 'linear-gradient(135deg,#00DAF3,#6B0099)' }}>
                <Bot size={28} className="text-white" />
              </div>
              <h3 className="text-xl font-black tracking-tight mb-2">Synthetic — AI &amp; generated art, clearly labeled.</h3>
              <p className="text-sm text-white/40 font-medium max-w-md mx-auto">Coming online. Generated work will surface here as soon as it lands, always badged so it can never be confused with a photograph.</p>
            </div>
          )}
        </section>
      );
    } else if (mode === 'HYBRID') {
      body = (
        <section>
          <div className="mb-6">
            <div className="pj-eyebrow" style={{ letterSpacing: '0.2em' }}>Hybrid</div>
            <h2 className="text-3xl font-black tracking-tight mt-1 mb-1">All visual art, together</h2>
            <p className="text-sm text-white/40 font-medium max-w-2xl">Photography, synthetic work, and the museum masters in one unified wall — every item badged by kind.</p>
          </div>
          {onOpenArtMuseum && (
            <button
              onClick={onOpenArtMuseum}
              className="w-full mb-6 flex items-center gap-4 p-5 rounded-2xl border text-left transition hover:brightness-110"
              style={{ borderColor: 'transparent', backgroundImage: 'var(--pj-grad-ember, linear-gradient(135deg,#FF8C00,#D40055))' }}
            >
              <Landmark size={28} className="text-white flex-none" />
              <div className="flex-1">
                <div className="font-black text-white tracking-tight">The Masters</div>
                <div className="text-xs text-white/80 font-medium">Open the classical Art Museum — masters &amp; open-access collections.</div>
              </div>
              <span className="text-white/90 text-lg">→</span>
            </button>
          )}
          {renderMasonry(displayPhotos, true, (p) => isSynthetic(p) ? kindBadge('AI', 'ai') : kindBadge('Photo', 'photo'))}
        </section>
      );
    } else {
      body = renderModeBody();
    }

    return (
      <div className="flex-1 bg-transparent text-theme-content overflow-y-auto custom-scrollbar pb-40">
        {/* Slim top bar */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 px-4 lg:px-6 h-16 border-b backdrop-blur-xl"
          style={{ borderColor: 'var(--pj-border, rgba(255,255,255,0.08))', background: 'var(--pj-glass-1, rgba(255,255,255,0.045))' }}
        >
          <span className="font-black italic text-lg tracking-tight whitespace-nowrap mr-1">
            Plajah <span className="pj-text-brand" style={{ backgroundImage: 'var(--pj-grad-warm)' }}>Photos</span>
          </span>

          {/* Primary lenses */}
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar" role="tablist">
            {lenses.map(l => {
              const active = lensActive === l.id;
              return (
                <button
                  key={l.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectLens(l.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-bold whitespace-nowrap transition ${active ? 'text-white' : 'text-white/55 hover:text-white'}`}
                  style={active ? { background: 'var(--pj-glass-3, rgba(255,255,255,0.09))' } : undefined}
                >
                  {l.icon}{l.label}
                </button>
              );
            })}
          </nav>

          {/* More overflow — sits OUTSIDE the horizontally-scrolling lens nav, whose
              overflow-x-auto would otherwise clip this dropdown (so it opened invisibly). */}
          <div className="relative shrink-0">
              <button
                onClick={() => setMoreOpen(o => !o)}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                className={`inline-flex items-center gap-1 px-3.5 h-9 rounded-full text-[13px] font-bold whitespace-nowrap transition ${moreActive || moreOpen ? 'text-white' : 'text-white/55 hover:text-white'}`}
                style={moreActive ? { background: 'var(--pj-glass-3, rgba(255,255,255,0.09))' } : undefined}
              >
                <MoreHorizontal size={14} /> More <ChevronDown size={12} className={`transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 z-50 w-52 p-1.5 rounded-2xl border shadow-2xl pj-surface--3"
                    style={{ background: 'var(--pj-glass-3, rgba(20,16,25,0.95))', borderColor: 'var(--pj-border-strong, rgba(255,255,255,0.15))' }}
                  >
                    {moreItems.map(item => {
                      const active = !item.door && item.mode === mode;
                      return (
                        <button
                          key={item.label}
                          role="menuitem"
                          onClick={() => {
                            setMoreOpen(false);
                            if (item.door) onOpenArtMuseum?.();
                            else if (item.mode) setMode(item.mode);
                          }}
                          className={`w-full flex items-center gap-2.5 px-3 h-10 rounded-xl text-[13px] font-bold text-left transition ${active ? 'text-white bg-white/10' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                        >
                          <span className="opacity-70">{item.icon}</span>
                          {item.label}
                          {item.door && <span className="ml-auto text-[0.7em] opacity-60">↗</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

          {/* Search + Upload */}
          <div className="ml-auto flex items-center gap-2">
            <div
              className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-full border"
              style={{ background: 'var(--pj-glass-1, rgba(255,255,255,0.045))', borderColor: 'var(--pj-border, rgba(255,255,255,0.08))' }}
            >
              <Search size={14} className="text-white/40" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search photos…"
                className="bg-transparent outline-none text-[13px] w-24 lg:w-40 placeholder:text-white/30"
              />
            </div>
            <button
              onClick={() => { setMoreOpen(false); setMode('IMPORTS'); }}
              className="pj-btn pj-btn--sm pj-btn--primary"
              title="Bring photos into Plajah"
            >
              <Upload size={14} /> Upload
            </button>
          </div>
        </header>

        <main className="px-4 lg:px-6 pt-6">
          {body}
        </main>

        {renderOverlays()}
      </div>
    );
  }

  return (
    <div className="flex-1 bg-transparent text-theme-content overflow-y-auto custom-scrollbar pb-40">
      {/* Header */}
      <header className="px-6 lg:px-12 pt-12 mb-12">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Camera size={24} className="text-small-orange" />
              <span className="text-xs font-black uppercase tracking-[0.5em] text-white/40">Visual Signal Archive</span>
            </div>
            <PageHeader wrapperClassName="mb-4">
              Plajah Photos
            </PageHeader>
            <p className="text-lg font-medium text-white/40 italic max-w-2xl">
              {mode === 'SALON'
                 ? 'A themed challenge every week, judged by nobody and hung by everybody — the photographic salon, revived.'
                 : mode === 'SCHOOL'
                 ? 'A complete education in the visual arts — photography and art, beginner to master, taught with the world’s open museum collections.'
                 : mode === 'THEMES'
                 ? 'A curated collection of visual aesthetics to transform your space.'
                 : mode === 'GALLERY' 
                ? 'A curated art-gallery view inside the unified Plajah photo experience.'
                : mode === 'EVENTS'
                ? 'Live event buckets, QR photo pools, and shared albums for moments happening on platform.'
                : mode === 'IMPORTS'
                ? 'Bring libraries in from connected cloud and pro photography tools.'
                : mode === 'PRO'
                ? 'Portfolio-grade presentation and editing workflows for photographers.'
                : 'A continuous stream of photography, art, event media, and spatial captures from the community.'}
            </p>
          </div>

          {/* Platform Chip Rail treatment (components/ui/ChipRail).
              "The Masters" is an honest door — it navigates to the art museum. */}
          <ChipRail
            className="self-start"
            items={[
              { id: 'WATERFALL', label: 'Waterfall', icon: <Camera size={13} /> },
              { id: 'GALLERY', label: 'Art Gallery', icon: <Sparkles size={13} /> },
              { id: 'EVENTS', label: 'Events', icon: <QrCode size={13} /> },
              { id: 'IMPORTS', label: 'Import', icon: <Cloud size={13} /> },
              { id: 'PRO', label: 'Pro', icon: <Wand2 size={13} /> },
              { id: 'THEMES', label: 'Themes', icon: <ImageIcon size={13} /> },
              { id: 'SOCIAL', label: 'From Social', icon: <Share2 size={13} /> },
              { id: 'SCHOOL', label: 'School', icon: <GraduationCap size={13} /> },
              { id: 'SALON', label: 'Salon', icon: <Trophy size={13} /> },
              ...(onOpenArtMuseum ? [{ id: 'MASTERS', label: 'The Masters', icon: <Landmark size={13} />, color: '#C9A55C', door: true }] : []),
            ]}
            activeId={mode}
            onSelect={(id) => { if (id === 'MASTERS') onOpenArtMuseum?.(); else setMode(id as any); }}
          />
        </div>
      </header>

      {/* Main Mode Rendering */}
      <main className="px-6 lg:px-12">
        {mode === 'SALON' ? (
          <WeeklySalon />
        ) : mode === 'SCHOOL' ? (
          <SchoolView curriculum={PHOTO_ART_SCHOOL} embedded />
        ) : mode === 'SOCIAL' ? (
          <div className="max-w-6xl mx-auto">
            <FromSocialGallery uid={auth.currentUser?.uid || ''} kinds={['PHOTO', 'GIF', 'STICKER']} emptyLabel="No photos shared to your feed yet" />
          </div>
        ) : mode === 'IMPORTS' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {PHOTO_IMPORT_SOURCES.map(source => (
                <div key={source.id} className="p-8 bg-white/5 border border-white/10 rounded-2xl">
                  <Cloud size={28} className="text-small-orange mb-6" />
                  <h3 className="text-xl font-black uppercase tracking-tight mb-3">{source.label}</h3>
                  <p className="text-xs font-bold text-white/40 leading-relaxed mb-6">{source.note}</p>
                  <button className="px-5 py-3 bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/50">
                    Connector Planned
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : mode === 'EVENTS' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-8">
            <div className="p-8 bg-white/5 border border-white/10 rounded-2xl">
              <QrCode size={32} className="text-small-orange mb-6" />
              <h3 className="text-4xl font-black uppercase tracking-tight mb-4">Live Photo Pools</h3>
              <p className="text-sm font-bold text-white/40 leading-relaxed max-w-2xl">
                Event guests can join through a QR code, upload photos and 30 second clips, and contribute to a shared live album connected to Live Hub, event pages, artist management, social live-now moments, and chat.
              </p>
            </div>
            <div className="p-8 bg-black/30 border border-white/10 rounded-2xl">
              <Upload size={28} className="text-white/40 mb-6" />
              <h4 className="text-xl font-black uppercase tracking-tight mb-4">Event Album Automation</h4>
              <p className="text-xs font-bold text-white/40 leading-relaxed">
                The existing event photo pool becomes the source for auto-generated albums, slideshows, moderation queues, and artist/team memory books.
              </p>
            </div>
          </div>
        ) : mode === 'PRO' ? (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.85fr] gap-8">
            <div className="p-8 bg-white/5 border border-white/10 rounded-2xl">
              <Sparkles size={32} className="text-small-orange mb-6" />
              <h3 className="text-5xl font-black uppercase tracking-tight mb-5">Photographer Rooms</h3>
              <p className="text-sm font-bold text-white/40 leading-relaxed max-w-3xl">
                A unified public/private portfolio layer for photographers, built from the same photo archive and editor framework.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-8">
                {PHOTOGRAPHER_PRO_FEATURES.map(feature => (
                  <div key={feature} className="p-4 bg-black/30 border border-white/10 rounded-2xl text-xs font-bold text-white/50 leading-relaxed">
                    {feature}
                  </div>
                ))}
              </div>

              {/* Portfolio room — the chrome-free presentation layer (Part 3C) */}
              <div className="mt-8 p-6 bg-black/40 border border-white/10 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <Frame size={18} className="text-small-orange" />
                  <h4 className="text-sm font-black uppercase tracking-widest">Portfolio Room</h4>
                </div>
                <p className="text-xs font-bold text-white/40 leading-relaxed mb-6 max-w-xl">
                  Your work, full bleed, on black — no grid, no buttons, no feed. Arrow keys or swipe to move,
                  <span className="text-white/60"> i </span> for the wall label and capture data, <span className="text-white/60">esc</span> to leave.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => auth.currentUser && openPhotographerRoom(auth.currentUser.uid)}
                    disabled={!auth.currentUser || openingRoom}
                    className="px-6 py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30 hover:scale-[1.02] transition-all"
                  >
                    {openingRoom ? 'Hanging the room…' : 'Enter my portfolio room'}
                  </button>
                  <button
                    onClick={() => {
                      const stills = photos.filter(p => p.mediaType !== 'VIDEO');
                      if (stills.length) setRoom({ photos: stills, name: 'The Gallery', statement: 'Selected work from the community archive.', index: 0 });
                    }}
                    disabled={!photos.some(p => p.mediaType !== 'VIDEO')}
                    className="px-6 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white disabled:opacity-30 transition-all"
                  >
                    Present this gallery
                  </button>
                </div>
              </div>
            </div>
            <div className="p-8 bg-white/5 border border-white/10 rounded-2xl">
              <Layers size={28} className="text-cyan-300 mb-6" />
              <h4 className="text-2xl font-black uppercase tracking-tight mb-4">Platform Auto Depth</h4>
              <p className="text-xs font-bold text-white/40 leading-relaxed mb-6">
                Photos and videos can render with no-warp spatial depth across Plajah. It behaves like an ambient viewer enhancement: easy, reversible, and seamless.
              </p>
              <button
                disabled={!photos[0]}
                onClick={() => photos[0] && setEditingPhoto(photos[0])}
                className="w-full py-4 bg-white text-black rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-30"
              >
                Open Edit Workflow
              </button>
            </div>
          </div>
        ) : mode === 'THEMES' ? (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 space-y-6">
              {themes.map(theme => (
                 <div key={theme.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group cursor-pointer hover:border-white/30 transition-all" onClick={() => setSelectedTheme(theme)}>
                    <div className="aspect-video relative bg-black/50 overflow-hidden">
                       {theme.coverImage ? (
                          <img loading="lazy" decoding="async" src={theme.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                       ) : theme.assets && theme.assets.length > 0 ? (
                          theme.assets[0].type === 'PHOTO' ? <img loading="lazy" decoding="async" src={theme.assets[0].url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" /> : <video src={theme.assets[0].url} className="w-full h-full object-cover" muted loop autoPlay />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center text-white/10">
                           <ImageIcon size={48} />
                         </div>
                       )}
                       <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black to-transparent">
                         <span className="text-[10px] font-black uppercase tracking-widest text-small-orange bg-black/50 px-2 py-1 rounded inline-block">{theme.mode}</span>
                       </div>
                    </div>
                    <div className="p-6">
                       <h3 className="font-bold text-lg mb-1 truncate">{theme.title}</h3>
                       <p className="text-xs opacity-50 line-clamp-2">{theme.description}</p>
                       <div className="mt-4 flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{theme.assets?.length || 0} Assets</span>
                       </div>
                    </div>
                 </div>
              ))}
              {themes.length === 0 && (
                <div className="col-span-full py-40 text-center opacity-20">
                  <Sparkles size={64} className="mx-auto mb-6" />
                  <p className="text-xl font-black uppercase tracking-[0.5em]">No themes available right now.</p>
                </div>
              )}
           </div>
        ) : (
        <>
          <div className="columns-1 md:columns-2 lg:columns-3 xl:columns-4 gap-6 space-y-6">
            {photos.map((photo) => (
              <motion.div 
                key={photo.id}
                layoutId={photo.id}
                className="relative break-inside-avoid rounded-3xl overflow-hidden group cursor-pointer border border-white/5 shadow-2xl"
                onClick={() => setSelectedPhoto(photo)}
              >
                {photo.mediaType === 'VIDEO' ? (
                  <SpatialMedia url={photo.url} type="VIDEO" className="w-full aspect-video" forceDepth={isSpatialMode} autoPlay muted loop />
                ) : (
                  <div className="aspect-auto">
                    <SpatialImage url={photo.url} is3D={isSpatialMode} />
                  </div>
                )}
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all p-6 flex flex-col justify-end">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-8 h-8 rounded-full overflow-hidden border border-white/20"
                        onClick={(e) => { e.stopPropagation(); onVisitUser(photo.ownerId); }}
                      >
                        <img src={`https://picsum.photos/seed/${photo.ownerId}/100/100`} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      </div>
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest truncate max-w-[120px]">{photo.title || 'Untitled Signal'}</h4>
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Signal from the Archive</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleFavorite(photo); }}
                        className={`p-2 rounded-full backdrop-blur-md transition-all ${photo.favorites?.includes(auth.currentUser?.uid || '') ? 'bg-small-orange text-white' : 'bg-white/10 text-white/60 hover:text-white'}`}
                      >
                        <Heart size={14} fill={photo.favorites?.includes(auth.currentUser?.uid || '') ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {photos.length === 0 && (
            <div className="py-40 text-center opacity-20">
              <Sparkles size={64} className="mx-auto mb-6" />
              <p className="text-xl font-black uppercase tracking-[0.5em]">No signals detected in this sector.</p>
            </div>
          )}
        </>
        )}
      </main>

      {/* Theme Detail Modal — portaled so it opens in the current viewport */}
      {createPortal(<AnimatePresence>
        {selectedTheme && (
           <motion.div 
             initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
             className="fixed inset-0 z-[200] flex items-center justify-center p-6 lg:p-20 bg-theme-card/95 backdrop-blur-3xl"
             onClick={() => setSelectedTheme(null)}
           >
              <div 
                className="relative max-w-4xl w-full max-h-full bg-[#0a0a0a] rounded-[3rem] overflow-hidden border border-white/10 shadow-3xl flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                  <div className="p-8 flex items-start justify-between border-b border-white/10">
                     <div>
                       <h2 className="text-3xl font-black uppercase tracking-tightest text-white mb-2">{selectedTheme.title}</h2>
                       <p className="text-sm font-bold opacity-60 italic max-w-xl">{selectedTheme.description}</p>
                     </div>
                     <button onClick={() => setSelectedTheme(null)} className="p-2 text-white/40 hover:text-white transition-all bg-white/5 rounded-full">
                       <Maximize2 size={20} />
                     </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8 bg-black/50 grid grid-cols-2 md:grid-cols-3 gap-4">
                     {selectedTheme.assets?.map((asset: any, i: number) => (
                        <div key={asset.id || i} className="aspect-square rounded-2xl overflow-hidden border border-white/10 relative group">
                           {asset.type === 'VIDEO' ? (
                             <video src={asset.url} className="w-full h-full object-cover" autoPlay muted loop />
                           ) : (
                             <img loading="lazy" decoding="async" src={gridSrc(asset)} className="w-full h-full object-cover" alt="" />
                           )}
                           <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-[10px] font-black uppercase tracking-widest text-white">{asset.type}</span>
                           </div>
                        </div>
                     ))}
                     {(!selectedTheme.assets || selectedTheme.assets.length === 0) && (
                        <div className="col-span-full py-20 text-center text-white/40 text-[10px] font-black uppercase tracking-widest">
                           No explicit assets. Only a cover image exists.
                        </div>
                     )}
                  </div>
                  <div className="p-6 border-t border-white/10 bg-[#050505] flex justify-end">
                     <button 
                       onClick={async () => {
                          if (!auth.currentUser) return alert('Please log in');
                          try {
                             // Fetch current user and append theme ID to savedThemePresets
                             const myProfile = await fetchUserProfile(auth.currentUser!.uid);
                             if (myProfile) {
                               const currentSaved = myProfile.savedThemePresets || [];
                               if (!currentSaved.includes(selectedTheme.id)) {
                                  await updateUserProfile(auth.currentUser!.uid, { savedThemePresets: [...currentSaved, selectedTheme.id] });
                                  alert('Added to your personal theme library!');
                               } else {
                                  alert('Theme is already in your library.');
                               }
                             }
                          } catch(err) {
                             console.error('Failed to save theme', err);
                          }
                       }}
                       className="px-8 py-4 bg-small-orange text-white rounded-full text-xs font-black uppercase tracking-widest shadow-xl hover:scale-105 transition-all"
                     >
                        Add to My Theme Library
                     </button>
                  </div>
              </div>
           </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {/* Photo Detail Modal — portaled so it opens in the current viewport */}
      {createPortal(<AnimatePresence>
        {selectedPhoto && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-6 lg:p-20 bg-theme-card/95 backdrop-blur-3xl"
            onClick={() => setSelectedPhoto(null)}
          >
            <motion.div 
              layoutId={selectedPhoto.id}
              className="relative max-w-6xl w-full max-h-full flex flex-col lg:flex-row bg-white/5 rounded-[3rem] overflow-hidden border border-white/10 shadow-3xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex-1 bg-theme border-r border-theme flex items-center justify-center overflow-hidden">
                {selectedPhoto.mediaType === 'VIDEO' ? (
                  <SpatialMedia url={selectedPhoto.url} type="VIDEO" className="w-full h-full min-h-[50vh]" forceDepth={isSpatialMode} controls autoPlay muted={false} loop />
                ) : (
                  <div className="w-full h-full p-4 lg:p-10">
                    <SpatialImage url={selectedPhoto.url} is3D={isSpatialMode} />
                  </div>
                )}
              </div>
              
              <div className="w-full lg:w-96 p-10 flex flex-col gap-8 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-full overflow-hidden border-2 border-small-orange cursor-pointer"
                      onClick={() => onVisitUser(selectedPhoto.ownerId)}
                    >
                      <img loading="lazy" decoding="async" src={`https://picsum.photos/seed/${selectedPhoto.ownerId}/200/200`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest">Artist Archive</h3>
                      <button 
                        onClick={() => followUser(selectedPhoto.ownerId)}
                        className="text-[10px] font-black text-small-orange uppercase tracking-widest hover:text-white transition-all"
                      >
                        Follow Artist
                      </button>
                    </div>
                  </div>
                  <button onClick={() => setSelectedPhoto(null)} className="p-2 text-white/20 hover:text-white transition-all">
                    <Maximize2 size={20} />
                  </button>
                </div>

                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tightest mb-4">{selectedPhoto.title || 'Untitled Signal'}</h2>
                  <p className="text-sm font-medium text-white/60 leading-relaxed italic mb-8">
                    {selectedPhoto.description || 'No data transmitted with this signal.'}
                  </p>
                  <DepthAnalyzer imageUrl={selectedPhoto.url} mediaType={selectedPhoto.mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE'} />
                </div>

                <div className="flex items-center gap-6 pt-6 border-t border-white/10">
                  <div className="flex flex-col items-center gap-1">
                    <button 
                      onClick={() => handleFavorite(selectedPhoto)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${selectedPhoto.favorites?.includes(auth.currentUser?.uid || '') ? 'bg-small-orange text-white' : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'}`}
                    >
                      <Heart size={24} fill={selectedPhoto.favorites?.includes(auth.currentUser?.uid || '') ? 'currentColor' : 'none'} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">{selectedPhoto.likesCount || 0}</span>
                  </div>
                  
                  <div className="flex flex-col items-center gap-1">
                    <button className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all">
                      <Share2 size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Share</span>
                  </div>

                  {/* Portfolio room — this photographer's body of work, chrome-free (Part 3C) */}
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => openPhotographerRoom(selectedPhoto.ownerId, selectedPhoto)}
                      disabled={openingRoom}
                      title="Open this photographer's portfolio room"
                      className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      <Frame size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">
                      {openingRoom ? 'Hanging…' : 'The Room'}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      onClick={() => setEditingPhoto(selectedPhoto)}
                      className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all"
                    >
                      <Wand2 size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Edit</span>
                  </div>
                </div>

                {/* Critique circle — structured, opt-in peer feedback (Part 3C) */}
                <PhotoCritiquePanel photoId={selectedPhoto.id} ownerId={selectedPhoto.ownerId} />

                <div className="mt-auto pt-8 border-t border-white/10">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/20 mb-2">Signal Timestamp</p>
                  <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                    {new Date(selectedPhoto.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
      {/* Portfolio room — full-bleed, above everything (Part 3C) */}
      {room && (
        <PortfolioRoom
          photos={room.photos}
          photographerName={room.name}
          statement={room.statement}
          initialIndex={room.index}
          onClose={() => setRoom(null)}
        />
      )}

      {editingPhoto && (
        <PhotoEditPanel
          photo={editingPhoto}
          variant={mode === 'PRO' ? 'workflow' : 'drawer'}
          onClose={() => setEditingPhoto(null)}
          onApply={() => {}}
        />
      )}
    </div>
  );
};

export default GlobalPhotosView;
