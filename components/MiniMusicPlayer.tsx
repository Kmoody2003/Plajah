import React, { useState, useRef, useEffect } from 'react';
import { useGlobalPlayerState, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { Play, Pause, SkipBack, SkipForward, Volume2, Music, Disc, Waves, Cast } from 'lucide-react';
import { Album, Track } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { thumb, onThumbError, THUMB } from '../src/lib/imageThumb';
import { TYPE } from '../src/lib/designSystem';

interface MiniMusicPlayerProps {
  album: Album;
  autoPlay?: boolean;
}

/** Albums a post auto-paused on scroll-away (so coming back resumes instead of restarting). */
const autoPausedAlbums = new Set<string>();
/** Albums a post started on its own (autoplay), not the listener. */
const autoStartedAlbums = new Set<string>();

const MiniMusicPlayer: React.FC<MiniMusicPlayerProps> = ({ album, autoPlay = false }) => {
  // Plays through the GLOBAL player (not a private <audio>), so the post's song is the one the mini
  // player, lock screen and queue know about, and its analyser drives the post's Show Mode visualizer.
  const gp = useGlobalPlayerState();
  const { currentTime, duration } = useGlobalPlayerProgress();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pickedIndex, setPickedIndex] = useState(0);

  const playingIndex = gp.currentTrack ? album.tracks.findIndex(t => t.id === gp.currentTrack!.id) : -1;
  const isOurs = playingIndex >= 0 && (!gp.currentAlbum || gp.currentAlbum.id === album.id || album.tracks.length === 1);
  const currentTrackIndex = isOurs ? playingIndex : pickedIndex;
  const currentTrack = album.tracks[currentTrackIndex];
  const isPlaying = isOurs && gp.isPlaying;
  const progress = isOurs && duration > 0 ? (currentTime / duration) * 100 : 0;

  const playIndex = (idx: number) => {
    const t = album.tracks[idx];
    if (!t) return;
    setPickedIndex(idx);
    gp.playTrack(t, album, 'LIBRARY');
  };

  // Autoplay (author opted in): only when it scrolls into view AND nothing else is playing — a post
  // never cuts off music the listener already chose. A song the post started on its own pauses again
  // when the post scrolls away; one the listener pressed play on keeps going.
  const autoStarted = {
    get current() { return autoStartedAlbums.has(album.id); },
    set current(v: boolean) { if (v) autoStartedAlbums.add(album.id); else autoStartedAlbums.delete(album.id); },
  };
  // Kept outside the component: the feed unmounts far-off cards, and the flag must survive that.
  const autoPaused = {
    get current() { return autoPausedAlbums.has(album.id); },
    set current(v: boolean) { if (v) autoPausedAlbums.add(album.id); else autoPausedAlbums.delete(album.id); },
  };
  useEffect(() => {
    if (!autoPlay || !containerRef.current) return;
    const el = containerRef.current;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !gp.isPlaying) {
        // back in view after we paused it → pick up where it left off; first time → start it
        if (autoPaused.current && isOurs) { autoPaused.current = false; autoStarted.current = true; gp.resume(); }
        else if (!isOurs) { autoStarted.current = true; playIndex(0); }
      } else if (!entry.isIntersecting && autoStarted.current && isOurs && gp.isPlaying) {
        autoStarted.current = false; autoPaused.current = true; gp.pause();
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, gp.isPlaying, isOurs]);

  // The feed can unmount a card that flew off-screen before the observer saw it leave: an autoplayed
  // song stops with it, the same as scrolling away.
  const latest = useRef({ gp, isOurs });
  latest.current = { gp, isOurs };
  useEffect(() => () => {
    const { gp: g, isOurs: ours } = latest.current;
    if (autoStartedAlbums.has(album.id) && ours && g.isPlaying) {
      autoStartedAlbums.delete(album.id); autoPausedAlbums.add(album.id); g.pause();
    }
  }, [album.id]);

  // Anything the listener presses makes the song theirs (no auto-pause on scroll-away).
  const userPlay = (idx: number) => { autoStarted.current = false; autoPaused.current = false; playIndex(idx); };
  const togglePlay = () => {
    autoStarted.current = false;
    autoPaused.current = false;
    if (isOurs) gp.togglePlay();
    else playIndex(currentTrackIndex);
  };

  const nextTrack = () => { if (currentTrackIndex < album.tracks.length - 1) userPlay(currentTrackIndex + 1); };
  const prevTrack = () => { if (currentTrackIndex > 0) userPlay(currentTrackIndex - 1); };

  return (
    <div ref={containerRef} className="bg-black/40 backdrop-blur-md border border-white/10 rounded-3xl p-4 overflow-hidden group">
      <div className="flex items-center gap-4">
        {/* Album Art */}
        <div className="relative w-16 h-16 flex-shrink-0">
          <img
            src={thumb(album.coverImage, THUMB.small) || undefined}
            alt={album.title}
            loading="lazy"
            decoding="async"
            onError={onThumbError(album.coverImage)}
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
          <p className={`${TYPE.labelMd} font-bold text-white/40 uppercase tracking-widest truncate`}>{album.artist}</p>
          
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
          <button onClick={prevTrack} className="tap p-2 text-white/40 hover:text-white transition-all">
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button onClick={nextTrack} className="tap p-2 text-white/40 hover:text-white transition-all">
            <SkipForward size={16} fill="currentColor" />
          </button>
          {/* The Breakdown */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('OPEN_BREAKDOWN', {
              detail: { track: album.tracks[currentTrackIndex], album },
            }))}
            title="The Breakdown — music theory analysis"
            className="tap p-2 text-white/25 hover:text-orange-400 transition-all"
          >
            <Waves size={15} />
          </button>
          {/* Google Cast / Wireless Speakers */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('plajah:open-cast'))}
            title="Cast to Device / Speakers"
            className="tap p-2 text-white/25 hover:text-cyan-400 transition-all"
          >
            <Cast size={15} />
          </button>
        </div>
      </div>

      {/* Track List (Hidden by default, shown on hover or toggle) */}
      <div className="mt-4 max-h-0 group-hover:max-h-32 overflow-y-auto transition-all duration-500 scrollbar-hide">
        {album.tracks.map((track, idx) => (
          <button 
            key={track.id}
            onClick={() => userPlay(idx)}
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

    </div>
  );
};

export default MiniMusicPlayer;
