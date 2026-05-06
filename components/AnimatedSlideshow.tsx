import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useGlobalPlayerState } from '../contexts/GlobalPlayerContext';
import ThreeDImage from './ThreeDImage';
import { Sparkles, Zap } from 'lucide-react';

interface AnimatedSlideshowProps {
  images: string[];
  isPlaying: boolean;
  themeColor: string;
  artistNotes?: string[];
}

const AnimatedSlideshow: React.FC<AnimatedSlideshowProps> = ({ images, isPlaying, themeColor, artistNotes = [] }) => {
  const [index, setIndex] = useState(0);
  const [noteIndex, setNoteIndex] = useState(0);
  const { analyser, view, audioSource } = useGlobalPlayerState();
  const [pulse, setPulse] = useState(1);

  useEffect(() => {
    if (!images.length) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 8000); // 8 seconds per slide for more "editorial" feel
    return () => clearInterval(interval);
  }, [images.length]);

  useEffect(() => {
    if (!artistNotes.length) return;
    const interval = setInterval(() => {
      setNoteIndex((prev) => (prev + 1) % artistNotes.length);
    }, 12000); // Notes stay longer to be readable
    return () => clearInterval(interval);
  }, [artistNotes.length]);

  useEffect(() => {
    setPulse(1);
  }, []); // Permanently disabled sound reactivity

  if (!images.length) return null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
          animate={{ 
            opacity: 1, 
            scale: 1, 
            filter: 'blur(0px)',
            transition: { 
              opacity: { duration: 2, ease: "circOut" },
              scale: { duration: 0.1, ease: "linear" },
              filter: { duration: 2.5, ease: "circOut" }
            }
          }}
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(5px)', transition: { duration: 1.5 } }}
          className="absolute inset-0 w-full h-full"
        >
          {/* Main Visual Image with Immersive 3D Option */}
          <ThreeDImage
            src={images[index] || undefined}
            alt={`Slide ${index}`}
            className="w-full h-full object-cover"
            animate={{
               // Sublte continuous zoom-in independent of pulse
               scale: isPlaying ? [1 * pulse, 1.05 * pulse] : [1, 1.05],
            }}
            transition={{
              scale: { duration: 10, repeat: Infinity, repeatType: "reverse", ease: "linear" }
            }}
          />
          
          {/* Artist Sticky Note UI */}
          {artistNotes && artistNotes.length > 0 && (
            <AnimatePresence mode="wait">
              <motion.div
                key={noteIndex}
                initial={{ opacity: 0, y: 40, rotate: -2 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={{ opacity: 0, y: -20, rotate: 2 }}
                transition={{ duration: 1, ease: "backOut" }}
                className="absolute bottom-12 right-12 max-w-xs z-50 overflow-hidden"
              >
                <div className="relative p-8 bg-white/10 backdrop-blur-3xl border border-white/20 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden group">
                   <div className="absolute top-0 right-0 p-3 opacity-20"><Sparkles size={16} /></div>
                   <div className="flex items-center gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                        <Zap size={14} className="text-small-orange" />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">Production Note</span>
                   </div>
                   <p className="text-sm lg:text-base font-bold italic leading-relaxed text-white drop-shadow-sm font-sans tracking-wide">
                     "{artistNotes[noteIndex]}"
                   </p>
                   
                   {/* Progress Indicator for current note */}
                   <div className="absolute bottom-0 left-0 h-1 bg-small-orange/40 w-full">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 12, ease: "linear" }}
                        className="h-full bg-small-orange"
                      />
                   </div>
                </div>
              </motion.div>
            </AnimatePresence>
          )}

          {/* Floating Vibe Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
          <div 
            className="absolute inset-0 opacity-20 mix-blend-overlay pointer-events-none transition-colors duration-[2000ms]" 
            style={{ backgroundColor: themeColor }} 
          />
        </motion.div>
      </AnimatePresence>
      
      {/* Visual Accents - Particles or subtle glow */}
      <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-inherit overflow-hidden">
        <motion.div 
            animate={{ 
                opacity: isPlaying ? [0.1, 0.3, 0.1] : 0.1,
                scale: 1
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute inset-0 bg-radial-gradient from-white/10 to-transparent" 
        />
      </div>
    </div>
  );
};

export default AnimatedSlideshow;
