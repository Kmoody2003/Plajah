import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Music, Disc, Waves } from 'lucide-react';
import { Album, Track } from '../types';
import { motion, AnimatePresence } from 'motion/react';

interface MiniMusicPlayerProps {
  album: Album;
  autoPlay?: boolean;
}

const MiniMusicPlayer: React.FC<MiniMusicPlayerProps> = ({ album, autoPlay = false }) => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentTrack = album.tracks[currentTrackIndex];

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (autoPlay && audioRef.current) {
            audioRef.current.play().catch(e => {
              if (e.name === 'AbortError' || e.message?.includes('interrupted')) return;
              console.log("Autoplay blocked", e);
            });
            setIsPlaying(true);
          }
        } else {
          if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        }
      },
      { threshold: 0.5 } // Play when 50% visible
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [autoPlay]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateProgress = () => {
      setProgress((audio.currentTime / audio.duration) * 100);
    };

    const handleEnded = () => {
      if (currentTrackIndex < album.tracks.length - 1) {
        setCurrentTrackIndex(prev => prev + 1);
      } else {
        setIsPlaying(false);
        setProgress(0);
      }
    };

    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateProgress);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentTrackIndex, album.tracks.length]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => {
          if (e.name === 'AbortError' || e.message?.includes('interrupted')) return;
          console.error("Playback failed:", e);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const nextTrack = () => {
    if (currentTrackIndex < album.tracks.length - 1) {
      setCurrentTrackIndex(prev => prev + 1);
      setIsPlaying(true);
    }
  };

  const prevTrack = () => {
    if (currentTrackIndex > 0) {
      setCurrentTrackIndex(prev => prev - 1);
      setIsPlaying(true);
    }
  };

  return (
    <div ref={containerRef} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-3xl p-4 overflow-hidden group">
      <div className="flex items-center gap-4">
        {/* Album Art */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <img 
            src={album.coverImage} 
            alt={album.title} 
            className={`w-full h-full object-cover rounded-2xl shadow-lg transition-transform duration-1000 ${isPlaying ? 'animate-spin-slow' : ''}`}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-2xl">
            <button 
              onClick={togglePlay}
              className="w-8 h-8 bg-white text-black rounded-full flex items-center justify-center hover:scale-110 transition-all"
            >
              {isPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" className="ml-0.5" />}
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-black uppercase tracking-widest truncate text-white">{currentTrack?.title || album.title}</h4>
          <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest truncate">{album.artist}</p>
          
          {/* Progress Bar */}
          <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-small-orange"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', bounce: 0, duration: 0.2 }}
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button onClick={prevTrack} className="p-2 text-white/40 hover:text-white transition-all">
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button onClick={nextTrack} className="p-2 text-white/40 hover:text-white transition-all">
            <SkipForward size={16} fill="currentColor" />
          </button>
          {/* The Breakdown */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', {
              detail: { track: album.tracks[currentTrackIndex], album },
            }))}
            title="The Breakdown — music theory analysis"
            className="p-2 text-white/25 hover:text-orange-400 transition-all"
          >
            <Waves size={15} />
          </button>
        </div>
      </div>

      {/* Track List (Hidden by default, shown on hover or toggle) */}
      <div className="mt-4 max-h-0 group-hover:max-h-32 overflow-y-auto transition-all duration-500 scrollbar-hide">
        {album.tracks.map((track, idx) => (
          <button 
            key={track.id}
            onClick={() => { setCurrentTrackIndex(idx); setIsPlaying(true); }}
            className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all ${idx === currentTrackIndex ? 'bg-white/10 text-small-orange' : 'hover:bg-white/5 text-white/40'}`}
          >
            <div className="w-6 h-6 rounded-lg bg-black/20 flex items-center justify-center text-[10px] font-black">
              {idx === currentTrackIndex && isPlaying ? (
                <div className="flex items-end gap-0.5 h-2">
                  <div className="w-0.5 h-full bg-small-orange animate-music-bar-1" />
                  <div className="w-0.5 h-2/3 bg-small-orange animate-music-bar-2" />
                  <div className="w-0.5 h-full bg-small-orange animate-music-bar-3" />
                </div>
              ) : (
                idx + 1
              )}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest truncate">{track.title}</span>
          </button>
        ))}
      </div>

      {currentTrack && (
        <audio 
          ref={audioRef}
          src={currentTrack.url}
          autoPlay={isPlaying}
        />
      )}
    </div>
  );
};

export default MiniMusicPlayer;
