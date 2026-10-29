// Lab-only stand-in for contexts/GlobalPlayerContext: one <audio> element, enough for
// PublicDomainLibrary's playTrack/currentTrack without the app's auth and Firestore.
import React, { createContext, useContext, useRef, useState } from 'react';
import type { Track } from '../../types';

interface LabPlayer {
  playTrack: (track: Track, ...rest: unknown[]) => void;
  currentTrack: Track | null;
}

const Ctx = createContext<LabPlayer | null>(null);

export const GlobalPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const audio = useRef<HTMLAudioElement>(null);
  const [currentTrack, setCurrent] = useState<Track | null>(null);
  const playTrack = (track: Track) => {
    setCurrent(track);
    const el = audio.current;
    if (el && track.url) { el.src = track.url; el.play().catch(() => {}); }
  };
  return (
    <Ctx.Provider value={{ playTrack, currentTrack }}>
      {children}
      <div className="fixed bottom-0 inset-x-0 bg-black/90 border-t border-white/10 px-4 py-2 flex items-center gap-3 text-white">
        <span className="text-[11px] font-bold truncate flex-1" data-testid="now-playing">
          {currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'Nothing playing'}
        </span>
        <audio ref={audio} controls className="h-8" />
      </div>
    </Ctx.Provider>
  );
};

export const useGlobalPlayer = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGlobalPlayer must be used within the lab GlobalPlayerProvider');
  return v;
};
