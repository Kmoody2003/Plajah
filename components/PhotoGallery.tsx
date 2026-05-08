import React, { useState, useEffect, useRef } from 'react';
import { Image, Play, Pause, Music, Plus, X, ChevronLeft, ChevronRight, Maximize2, Sparkles, Layout } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Photo, Track } from '../types';
import { fetchUserPhotos, uploadPhoto, fetchRadioTracks } from '../services/backendService';

interface PhotoGalleryProps {
  uid: string;
  isOwner: boolean;
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ uid, isOwner }) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number | null>(null);
  const [isSlideshowActive, setIsSlideshowActive] = useState(false);
  const [availableMusic, setAvailableMusic] = useState<Track[]>([]);
  const [selectedMusic, setSelectedMusic] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const loadPhotos = async () => {
      const userPhotos = await fetchUserPhotos(uid);
      // Filter by isPublic if not owner
      const filteredPhotos = isOwner ? userPhotos : userPhotos.filter(p => p.isPublic);
      setPhotos(filteredPhotos);
      setLoading(false);
      
      const radioTracks = await fetchRadioTracks();
      setAvailableMusic(radioTracks);
    };
    loadPhotos();
  }, [uid, isOwner]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSlideshowActive && isPlaying) {
      interval = setInterval(() => {
        setActivePhotoIndex((prev) => (prev !== null ? (prev + 1) % photos.length : 0));
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isSlideshowActive, isPlaying, photos.length]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // For simulation, we'll use a local URL
      const url = URL.createObjectURL(file);
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
    <div className="space-y-12">
      {/* Gallery Header */}
      <div className="flex items-center justify-between">
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

      {/* Photo Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {photos.map((photo, index) => (
          <motion.button 
            key={photo.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              setActivePhotoIndex(index);
              setIsSlideshowActive(true);
            }}
            className="group aspect-square rounded-[2.5rem] overflow-hidden border border-white/10 bg-white/[0.02] relative"
          >
            <img 
              src={photo.url || null} 
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700" 
              alt={photo.title}
            />
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
              <Maximize2 size={24} />
            </div>
          </motion.button>
        ))}

        {photos.length === 0 && (
          <div className="col-span-full p-24 border-2 border-dashed border-white/5 rounded-[3rem] flex flex-col items-center justify-center text-center">
            <Image size={48} className="text-white/10 mb-6" />
            <p className="text-xs font-black uppercase tracking-widest text-white/20">No photos shared yet</p>
          </div>
        )}
      </div>

      {/* Slideshow Overlay */}
      <AnimatePresence>
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
                  
                  {/* Music Dropdown */}
                  <div className="absolute top-full right-0 mt-4 w-64 bg-theme border border-white/10 rounded-[2rem] shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all p-4 space-y-2 z-50">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-4 px-2">Radio Hits Library</h4>
                    {availableMusic.map(track => (
                      <button 
                        key={track.id}
                        onClick={() => setSelectedMusic(track)}
                        className={`w-full p-3 rounded-xl text-left transition-all flex items-center gap-3 ${
                          selectedMusic?.id === track.id ? 'bg-small-orange/20 text-small-orange' : 'hover:bg-white/5'
                        }`}
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
                  <img 
                    src={photos[activePhotoIndex].url || null} 
                    className="w-full h-full object-cover" 
                    alt="Slideshow"
                  />
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
      </AnimatePresence>

      {selectedMusic && (
        <audio 
          ref={audioRef}
          src={selectedMusic.url}
          loop
          autoPlay={isPlaying}
        />
      )}
    </div>
  );
};

export default PhotoGallery;
