import { createPortal } from 'react-dom';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Image, Play, Pause, Music, Plus, X, ChevronLeft, ChevronRight, Maximize2, Sparkles, Layout, Globe, Palette, Aperture } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Photo, Track } from '../types';
import { fetchUserPhotos, uploadPhoto, fetchRadioTracks, fetchUserWorldPhotos } from '../services/backendService';
import { fetchExif, type ExifData } from '../services/exifService';

interface PhotoGalleryProps {
  uid: string;
  isOwner: boolean;
  /**
   * Navigate to the digital Art Gallery / The Masters museum.
   * Wire in App.tsx to `setView('ART_GALLERY')` — see INTEGRATION SPEC.
   */
  onOpenArtGallery?: () => void;
}

// ── EXIF chip strip for the lightbox ─────────────────────────────────────────
const ExifStrip: React.FC<{ photo: Photo }> = ({ photo }) => {
  const [exif, setExif] = useState<ExifData | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    setExif(null);
    setChecked(false);
    if (!photo.url) { setChecked(true); return; }
    fetchExif(photo.url).then(d => { if (alive) { setExif(d); setChecked(true); } });
    return () => { alive = false; };
  }, [photo.url]);

  // Metadata we always have on the Photo record, shown as a fallback / supplement.
  const stored: [string, string][] = [];
  if (photo.tags?.length) stored.push(['Tags', photo.tags.slice(0, 4).join(' · ')]);
  stored.push(['Added', new Date(photo.timestamp).toLocaleDateString()]);

  const fields: [string, string][] = [];
  if (exif) {
    if (exif.camera) fields.push(['Camera', exif.camera]);
    if (exif.lens) fields.push(['Lens', exif.lens]);
    if (exif.focalLength) fields.push(['Focal', exif.focalLength]);
    if (exif.aperture) fields.push(['Aperture', exif.aperture]);
    if (exif.shutter) fields.push(['Shutter', exif.shutter]);
    if (exif.iso) fields.push(['ISO', exif.iso.replace('ISO ', '')]);
    if (exif.dimensions) fields.push(['Size', exif.dimensions]);
    if (exif.dateTaken) fields.push(['Taken', exif.dateTaken]);
  }
  const rows = fields.length ? fields : stored;

  return (
    <div className="pointer-events-auto max-w-[92vw] mx-auto flex flex-wrap items-center justify-center gap-2">
      <span className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.3em] text-white/40">
        <Aperture size={11} /> {fields.length ? 'EXIF' : 'Details'}
      </span>
      {!checked ? (
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/25">Reading metadata…</span>
      ) : rows.map(([k, v]) => (
        <span key={k} className="px-2.5 py-1 rounded-full bg-white/[0.06] border border-white/10 text-[9px] font-bold text-white/70">
          <span className="text-white/35">{k}</span> {v}
        </span>
      ))}
    </div>
  );
};

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ uid, isOwner, onOpenArtGallery }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [worldPhotos, setWorldPhotos] = useState<Photo[]>([]);
  const [activeTab, setActiveTab] = useState<'ALL' | 'FROM_WORLDS'>('ALL');
  const [loading, setLoading] = useState(true);

  // Lightbox: pure full-frame, no chrome (separate from slideshow)
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);
  const [lightboxList, setLightboxList] = useState<Photo[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Slideshow
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [availableMusic, setAvailableMusic] = useState<Track[]>([]);
  const [selectedMusic, setSelectedMusic] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayedPhotos = activeTab === 'FROM_WORLDS' ? worldPhotos : photos;

  useEffect(() => {
    const loadPhotos = async () => {
      const [userPhotos, wPhotos, radioTracks] = await Promise.all([
        fetchUserPhotos(uid),
        fetchUserWorldPhotos(uid),
        fetchRadioTracks()
      ]);
      const filteredPhotos = isOwner ? userPhotos : userPhotos.filter(p => p.isPublic);
      setPhotos(filteredPhotos);
      setWorldPhotos(isOwner ? wPhotos : wPhotos.filter(p => p.isPublic));
      setAvailableMusic(radioTracks);
      setLoading(false);
    };
    loadPhotos();
  }, [uid, isOwner]);

  // Slideshow auto-advance
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSlideshowActive && isPlaying) {
      interval = setInterval(() => {
        setActivePhotoIndex((prev) => (prev !== null ? (prev + 1) % photos.length : 0));
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isSlideshowActive, isPlaying, photos.length]);

  // Lightbox keyboard navigation
  const lightboxPrev = useCallback(() => {
    setLightboxIndex(i => {
      const next = (i - 1 + lightboxList.length) % lightboxList.length;
      setLightboxPhoto(lightboxList[next]);
      return next;
    });
  }, [lightboxList]);

  const lightboxNext = useCallback(() => {
    setLightboxIndex(i => {
      const next = (i + 1) % lightboxList.length;
      setLightboxPhoto(lightboxList[next]);
      return next;
    });
  }, [lightboxList]);

  useEffect(() => {
    if (!lightboxPhoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxPhoto(null);
      if (e.key === 'ArrowLeft') lightboxPrev();
      if (e.key === 'ArrowRight') lightboxNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxPhoto, lightboxPrev, lightboxNext]);

  const openLightbox = (photo: Photo, list: Photo[], index: number) => {
    setLightboxPhoto(photo);
    setLightboxList(list);
    setLightboxIndex(index);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadPhoto(file, { title: file.name });
      const updated = await fetchUserPhotos(uid);
      setPhotos(updated);
    }
  };

  const toggleSlideshow = () => {
    if (!isSlideshowActive) {
      setActivePhotoIndex(0);
      setIsSlideshowActive(true);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.play().catch(error => {
          if (error.name !== 'AbortError' && !error.message?.includes('interrupted')) {
            console.error("Playback failed:", error);
          }
        });
      }
    } else {
      setIsSlideshowActive(false);
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
  };

  if (loading) return <div className="p-12 text-center opacity-20">Loading Gallery...</div>;

  return (
    <div className="space-y-10">
      {/* Gallery Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-small-orange/20 rounded-2xl">
            <Image className="text-small-orange" size={20} />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tightest">Photo Gallery</h3>
            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{photos.length} Captures</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {onOpenArtGallery && (
            <button
              onClick={onOpenArtGallery}
              className="px-6 py-3 bg-white/5 border border-white/10 rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-white/10 transition-all"
              title="Explore the digital art museum and The Masters"
            >
              <Palette size={14} className="text-[#C9A55C]" /> Art Gallery · The Masters
            </button>
          )}
          {isOwner && (
            <label className="px-6 py-3 bg-white/5 border border-white/10 rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-white/10 transition-all cursor-pointer">
              <Plus size={14} /> Upload Photo
              <input type="file" className="hidden" onChange={handleUpload} accept="image/*" />
            </label>
          )}
          <button
            onClick={toggleSlideshow}
            className="px-6 py-3 bg-small-orange text-black rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            <Play size={14} fill="currentColor" /> Start Slideshow
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-2">
        {(['ALL', 'FROM_WORLDS'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
              activeTab === tab ? 'bg-small-orange text-black' : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab === 'FROM_WORLDS' && <Globe size={11} />}
            {tab === 'ALL' ? 'All Photos' : 'From Worlds'}
            {tab === 'FROM_WORLDS' && worldPhotos.length > 0 && (
              <span className="ml-0.5 opacity-70">({worldPhotos.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Photo Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {displayedPhotos.map((photo, index) => (
          <motion.button
            key={photo.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => openLightbox(photo, displayedPhotos, index)}
            className="group aspect-square rounded-[2.5rem] overflow-hidden border border-white/10 bg-white/[0.02] relative"
          >
            <img
              src={photo.url || null}
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700"
              alt={photo.title}
            />
            {photo.worldId && (
              <div className="absolute top-3 right-3 p-1.5 bg-black/50 rounded-full">
                <Globe size={10} className="text-primary" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
              <Maximize2 size={24} />
            </div>
          </motion.button>
        ))}

        {displayedPhotos.length === 0 && (
          <div className="col-span-full p-24 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center text-center">
            {activeTab === 'FROM_WORLDS' ? (
              <>
                <Globe size={48} className="text-white/10 mb-6" />
                <p className="text-xs font-black uppercase tracking-widest text-white/20">No world images yet</p>
                <p className="text-[10px] text-white/10 mt-2">Upload images in the World Architecture editor</p>
              </>
            ) : (
              <>
                <Image size={48} className="text-white/10 mb-6" />
                <p className="text-xs font-black uppercase tracking-widest text-white/20">No photos shared yet</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Full-Frame Lightbox — portaled so it opens in the current viewport ── */}
      {createPortal(<AnimatePresence>
        {lightboxPhoto && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[110] bg-black flex items-center justify-center"
            onClick={() => setLightboxPhoto(null)}
          >
            {/* Close */}
            <button
              onClick={() => setLightboxPhoto(null)}
              className="absolute top-5 right-5 z-10 p-3 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all"
            >
              <X size={20} />
            </button>

            {/* Prev */}
            {lightboxList.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); lightboxPrev(); }}
                className="absolute left-5 z-10 p-4 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {/* Image — stop click propagation so clicking the image doesn't close */}
            <AnimatePresence mode="wait">
              <motion.img
                key={lightboxPhoto.id}
                src={lightboxPhoto.url}
                alt={lightboxPhoto.title}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.18 }}
                className="max-w-full max-h-full object-contain select-none"
                onClick={(e) => e.stopPropagation()}
              />
            </AnimatePresence>

            {/* Next */}
            {lightboxList.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); lightboxNext(); }}
                className="absolute right-5 z-10 p-4 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white transition-all"
              >
                <ChevronRight size={24} />
              </button>
            )}

            {/* Caption + EXIF (fades in at bottom) */}
            <div
              className="absolute bottom-0 inset-x-0 p-6 pt-16 bg-gradient-to-t from-black/85 via-black/40 to-transparent text-center pointer-events-none space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              {lightboxPhoto.title && <p className="font-black text-lg uppercase tracking-tight">{lightboxPhoto.title}</p>}
              {lightboxPhoto.description && <p className="text-white/50 text-sm">{lightboxPhoto.description}</p>}
              <ExifStrip photo={lightboxPhoto} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {/* ── Slideshow Overlay — portaled so it opens in the current viewport ── */}
      {createPortal(<AnimatePresence>
        {isSlideshowActive && activePhotoIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-3xl flex flex-col"
          >
            {/* Slideshow Header */}
            <div className="p-8 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-6">
                <button
                  onClick={() => setIsSlideshowActive(false)}
                  className="p-4 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all"
                >
                  <X size={24} />
                </button>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tightest">Gorgeous Slideshow</h3>
                  <p className="text-[10px] font-bold text-small-orange uppercase tracking-widest">
                    {activePhotoIndex + 1} of {photos.length}
                  </p>
                </div>
              </div>

              {/* Music Selector */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <button className="px-6 py-3 bg-white/5 border border-white/10 rounded-full font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-white/10 transition-all">
                    <Music size={14} className="text-small-orange" />
                    {selectedMusic ? selectedMusic.title : 'Select Music'}
                  </button>
                  <div className="absolute top-full right-0 mt-4 w-64 bg-theme border border-white/10 rounded-[2rem] shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all p-4 space-y-2 z-50">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-4 px-2">Radio Hits Library</h4>
                    {availableMusic.map(track => (
                      <button
                        key={track.id}
                        onClick={() => setSelectedMusic(track)}
                        className={`w-full p-3 rounded-xl text-left transition-all flex items-center gap-3 ${selectedMusic?.id === track.id ? 'bg-small-orange/20 text-small-orange' : 'hover:bg-white/5'}`}
                      >
                        <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                          <img src={track.images?.[0] || 'https://picsum.photos/seed/music/100/100'} className="w-full h-full object-cover" alt="Art" />
                        </div>
                        <div className="flex-1 truncate">
                          <p className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</p>
                          <p className="text-[8px] font-bold opacity-40 truncate">{track.artist}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                </button>
              </div>
            </div>

            {/* Main Image Area */}
            <div className="flex-1 relative flex items-center justify-center p-12">
              <button
                onClick={() => setActivePhotoIndex((prev) => (prev !== null ? (prev - 1 + photos.length) % photos.length : 0))}
                className="absolute left-8 p-6 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all z-10"
              >
                <ChevronLeft size={32} />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={activePhotoIndex}
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="w-full h-full max-w-5xl rounded-[4rem] overflow-hidden border-4 border-white/10 shadow-2xl relative"
                >
                  <img src={photos[activePhotoIndex].url || null} className="w-full h-full object-cover" alt="Slideshow" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent p-12 flex flex-col justify-end">
                    <h4 className="text-4xl font-black uppercase tracking-tightest mb-2">{photos[activePhotoIndex].title}</h4>
                    <p className="text-white/40 max-w-xl">{photos[activePhotoIndex].description}</p>
                  </div>
                </motion.div>
              </AnimatePresence>

              <button
                onClick={() => setActivePhotoIndex((prev) => (prev !== null ? (prev + 1) % photos.length : 0))}
                className="absolute right-8 p-6 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all z-10"
              >
                <ChevronRight size={32} />
              </button>
            </div>

            {/* Slideshow Footer */}
            <div className="p-8 border-t border-white/10 flex items-center justify-center gap-12">
              <div className="flex items-center gap-3">
                <Sparkles size={18} className="text-small-orange" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Immersive Experience</span>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div className="flex items-center gap-3">
                <Layout size={18} className="text-white/40" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Auto-Transition Active</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {selectedMusic && (
        <audio ref={audioRef} src={selectedMusic.url} loop autoPlay={isPlaying} />
      )}
    </div>
  );
};

export default PhotoGallery;
