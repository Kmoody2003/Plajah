// FollowedPodcastsCarousel — a horizontal row of the podcasts a user follows, each surfacing its
// most recent episode with a Resume / Play action + progress marker. Sits above "Latest Releases"
// on the profile. Uses the shared episode-progress store so Resume picks up where the listener left off.

import React, { useState } from 'react';
import { Headphones, Play, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Album, Track } from '../types';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { getProgress, progressFraction, isResumable, resumeTime, clearProgress, fmtTime } from '../services/episodeProgressService';

const latestEpisode = (album: Album): Track | null => {
  const eps = album.tracks || [];
  if (!eps.length) return null;
  const byNum = [...eps].sort((a, b) => (b.podcastMetadata?.episodeNumber || 0) - (a.podcastMetadata?.episodeNumber || 0));
  return byNum[0] || eps[eps.length - 1];
};

const FollowedPodcastsCarousel: React.FC<{ podcasts: Album[]; onOpen?: (album: Album) => void }> = ({ podcasts, onOpen }) => {
  const { playTrack } = useGlobalPlayer();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  const list = (podcasts || []).filter(p => (p.tracks?.length || 0) > 0);
  if (!list.length) return null;

  const scroll = (dir: -1 | 1) => scrollRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-white flex items-center gap-3">
          <Headphones size={12} className="text-small-orange" /> Following · Latest Episodes
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => scroll(-1)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60"><ChevronLeft size={16} /></button>
          <button onClick={() => scroll(1)} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 snap-x" style={{ scrollbarWidth: 'thin' }}>
        {list.map(album => {
          const ep = latestEpisode(album);
          if (!ep) return null;
          const saved = getProgress(ep.id);
          const frac = progressFraction(saved);
          const resumable = isResumable(saved);
          const play = (at: number) => { playTrack(ep, album, 'LIBRARY', at); force(x => x + 1); };
          return (
            <div key={album.id} className="snap-start shrink-0 w-[260px] p-4 bg-white/[0.03] border border-white/5 rounded-3xl hover:bg-white/[0.06] transition-colors">
              <button onClick={() => onOpen?.(album)} className="block w-full text-left">
                <div className="aspect-square rounded-2xl overflow-hidden mb-3 bg-white/5">
                  {album.coverImage && <img src={album.coverImage} loading="lazy" alt={album.title} className="w-full h-full object-cover" />}
                </div>
                <h4 className="text-xs font-black uppercase tracking-widest text-white truncate">{album.title}</h4>
              </button>
              <p className="mt-1 text-[10px] font-semibold text-white/40 truncate">Latest: {ep.title}</p>
              {frac > 0 && (
                <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-small-orange rounded-full" style={{ width: `${Math.round(frac * 100)}%` }} />
                </div>
              )}
              <div className="mt-3 flex items-center gap-1.5">
                {resumable ? (
                  <>
                    <button onClick={() => play(resumeTime(ep.id))} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest" title={`Resume at ${fmtTime(resumeTime(ep.id))}`}><Play size={11} fill="currentColor" /> Resume</button>
                    <button onClick={() => { clearProgress(ep.id); play(0); }} title="Start from beginning" className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-white/50 hover:text-white"><RotateCcw size={13} /></button>
                  </>
                ) : (
                  <button onClick={() => play(0)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10"><Play size={11} fill="currentColor" /> {saved?.completed ? 'Replay' : 'Play'}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FollowedPodcastsCarousel;
