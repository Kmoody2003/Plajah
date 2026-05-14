import React, { useState, useEffect } from 'react';
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
  TrendingUp,
  Filter,
  Eye
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchGlobalPhotos, favoritePhoto, followUser, auth, fetchThemePresets, updateUserProfile, fetchUserProfile } from '../services/backendService';
import { useSpatial } from '../contexts/SpatialContext';
import SpatialImage from './SpatialImage';
import DepthAnalyzer from './DepthAnalyzer';

interface GlobalPhotosViewProps {
  onVisitUser: (uid: string) => void;
  initialMode?: 'WATERFALL' | 'GALLERY' | 'THEMES';
}

const GlobalPhotosView: React.FC<GlobalPhotosViewProps> = ({ onVisitUser, initialMode = 'WATERFALL' }) => {
  const { isSpatialMode } = useSpatial();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [mode, setMode] = useState<'WATERFALL' | 'GALLERY' | 'THEMES'>(initialMode);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  
  // Theme gallery state
  const [themes, setThemes] = useState<any[]>([]);
  const [selectedTheme, setSelectedTheme] = useState<any | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      if (mode === 'THEMES') {
        const data = await fetchThemePresets();
        setThemes(data.filter(t => t.isPublic));
      } else {
        const data = await fetchGlobalPhotos(mode === 'GALLERY');
        setPhotos(data);
      }
      setIsLoading(false);
    };
    loadData();
  }, [mode]);

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

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-small-orange border-t-transparent rounded-full animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-white/40">Developing Archive...</p>
        </div>
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
              {mode === 'THEMES' ? 'Plajah Theme Gallery' : mode === 'GALLERY' ? 'Plajah Art Gallery' : 'Plajah Global Waterfall'}
            </PageHeader>
            <p className="text-lg font-medium text-white/40 italic max-w-2xl">
              {mode === 'THEMES'
                 ? 'A curated collection of visual aesthetics to transform your space.'
                 : mode === 'GALLERY' 
                ? 'A curated showcase of the most profound visual captures from the community.' 
                : 'A continuous stream of visual consciousness. Every photo is a signal from the collective.'}
            </p>
          </div>

          <div className="flex items-center bg-white/5 p-1 rounded-full border border-white/10 self-start">
            <button 
              onClick={() => setMode('WATERFALL')}
              className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'WATERFALL' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}
            >
              Waterfall
            </button>
            <button 
              onClick={() => setMode('GALLERY')}
              className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'GALLERY' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}
            >
              Art Gallery
            </button>
            <button 
              onClick={() => setMode('THEMES')}
              className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'THEMES' ? 'bg-white text-black shadow-xl' : 'text-white/40 hover:text-white'}`}
            >
              Theme Gallery
            </button>
          </div>
        </div>
      </header>

      {/* Main Mode Rendering */}
      <main className="px-6 lg:px-12">
        {mode === 'THEMES' ? (
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 space-y-6">
              {themes.map(theme => (
                 <div key={theme.id} className="bg-white/5 border border-white/10 rounded-[2rem] overflow-hidden group cursor-pointer hover:border-white/30 transition-all" onClick={() => setSelectedTheme(theme)}>
                    <div className="aspect-video relative bg-black/50 overflow-hidden">
                       {theme.coverImage ? (
                          <img src={theme.coverImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" />
                       ) : theme.assets && theme.assets.length > 0 ? (
                          theme.assets[0].type === 'PHOTO' ? <img src={theme.assets[0].url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt="" /> : <video src={theme.assets[0].url} className="w-full h-full object-cover" muted loop autoPlay />
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
                  <video 
                    src={photo.url || null} 
                    className="w-full h-auto object-cover"
                    muted
                    loop
                    onMouseOver={e => {
                      const playPromise = e.currentTarget.play();
                      if (playPromise !== undefined) {
                        playPromise.catch(error => {
                          if (error.name !== 'AbortError' && !error.message?.includes('interrupted')) {
                            console.error("Playback failed:", error);
                          }
                        });
                      }
                    }}
                    onMouseOut={e => e.currentTarget.pause()}
                  />
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

      {/* Theme Detail Modal */}
      <AnimatePresence>
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
                             <img src={asset.url} className="w-full h-full object-cover" alt="" />
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
      </AnimatePresence>

      {/* Photo Detail Modal */}
      <AnimatePresence>
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
                  <video src={selectedPhoto.url || undefined} controls autoPlay loop className="max-w-full max-h-full" />
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
                      <img src={`https://picsum.photos/seed/${selectedPhoto.ownerId}/200/200`} alt="" className="w-full h-full object-cover" />
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
                  <DepthAnalyzer imageUrl={selectedPhoto.url} />
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

                  <div className="flex flex-col items-center gap-1">
                    <button className="w-14 h-14 rounded-full bg-white/5 text-white/40 flex items-center justify-center hover:text-white hover:bg-white/10 transition-all">
                      <Eye size={24} />
                    </button>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/40">View Full</span>
                  </div>
                </div>

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
      </AnimatePresence>
    </div>
  );
};

export default GlobalPhotosView;
