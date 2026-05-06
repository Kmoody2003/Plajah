import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, ChevronRight, Play, Volume2, VolumeX } from 'lucide-react';
import ThreeDImage from './ThreeDImage';

interface FeaturedItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  videoUrl?: string;
  linkUrl?: string;
  onClick?: () => void;
}

interface FeaturedCarouselProps {
  items: FeaturedItem[];
  autoPlayInterval?: number;
  className?: string;
}

const FeaturedCarousel: React.FC<FeaturedCarouselProps> = ({ 
  items, 
  autoPlayInterval = 5000,
  className = ""
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (items.length <= 1 || isHovered) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length);
    }, autoPlayInterval);

    return () => clearInterval(interval);
  }, [items.length, autoPlayInterval, isHovered]);

  const next = () => setCurrentIndex((prev) => (prev + 1) % items.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + items.length) % items.length);

  const currentItem = items[currentIndex];

  if (!currentItem) return null;

  return (
    <div 
      className={`relative w-full h-[30vh] lg:h-[45vh] overflow-hidden rounded-[2.5rem] bg-black group shadow-2xl ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={currentItem.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
          className="absolute inset-0 cursor-pointer"
          onClick={currentItem.onClick}
        >
          {currentItem.videoUrl && isHovered ? (
            <div className="w-full h-full">
              {(() => {
                const isYoutube = currentItem.videoUrl.includes('youtube.com') || currentItem.videoUrl.includes('youtu.be');
                const isVimeo = currentItem.videoUrl.includes('vimeo.com');
                
                if (isYoutube || isVimeo) {
                  let embedUrl = currentItem.videoUrl;
                  if (isYoutube) {
                    const vid = currentItem.videoUrl.split('v=')[1]?.split('&')[0] || currentItem.videoUrl.split('/').pop();
                    embedUrl = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=1&controls=0&loop=1&playlist=${vid}`;
                  } else if (isVimeo) {
                    const vid = currentItem.videoUrl.split('/').pop();
                    embedUrl = `https://player.vimeo.com/video/${vid}?autoplay=1&muted=1&background=1`;
                  }
                  return <iframe src={embedUrl} className="w-full h-full pointer-events-none" allow="autoplay; fullscreen" />;
                }
                
                return (
                  <video
                    ref={videoRef}
                    src={currentItem.videoUrl || undefined}
                    autoPlay
                    muted={isMuted}
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                );
              })()}
            </div>
          ) : (
            <ThreeDImage 
              src={currentItem.imageUrl || undefined} 
              alt={currentItem.title}
              className="w-full h-full object-cover"
            />
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent flex flex-col justify-end p-12 lg:p-20">
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-[2px] bg-small-orange" />
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-small-orange">
                  {currentItem.subtitle || "Featured Artist"}
                </span>
              </div>
              <h3 className="text-4xl lg:text-7xl font-display font-black uppercase tracking-tightest text-white leading-none">
                {currentItem.title}
              </h3>
              <div className="mt-8 flex items-center gap-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                <button className="px-8 py-3 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-small-orange hover:text-white transition-all">
                  View Profile
                </button>
                <button className="px-8 py-3 bg-white/10 backdrop-blur-md border border-white/10 text-white rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-white/20 transition-all">
                  Listen Now
                </button>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Controls */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-between px-4 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <button 
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all pointer-events-auto"
        >
          <ChevronLeft size={20} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all pointer-events-auto"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Indicators */}
      <div className="absolute bottom-6 right-8 flex gap-2">
        {items.map((_, idx) => (
          <button
            key={idx}
            onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
            className={`h-1 rounded-full transition-all ${idx === currentIndex ? 'w-8 bg-small-orange' : 'w-2 bg-white/20'}`}
          />
        ))}
      </div>

      {/* Mute Toggle */}
      {currentItem.videoUrl && isHovered && (
        <button
          onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
          className="absolute top-6 right-8 p-3 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all"
        >
          {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      )}
    </div>
  );
};

export default FeaturedCarousel;
