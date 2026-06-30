// PodcastEpisodeList — the episode selector for a podcast. Each episode shows a progress marker
// (how far the listener got) and, when there's saved progress, both "Resume" (pick up where they
// left off) and "Start over" options. Reads/writes the on-device episode-progress store and drives
// playback through the global player's new startAt parameter.

import React, { useState } from 'react';
import { Play, RotateCcw, Check } from 'lucide-react';
import type { Album, Track } from '../types';
import { useGlobalPlayer, useGlobalPlayerProgress } from '../contexts/GlobalPlayerContext';
import { getProgress, progressFraction, isResumable, resumeTime, clearProgress, fmtTime } from '../services/episodeProgressService';

const PodcastEpisodeList: React.FC<{ album: Album }> = ({ album }) => {
  const { playTrack, currentTrack } = useGlobalPlayer();
  const { currentTime, duration } = useGlobalPlayerProgress();
  const [, force] = useState(0);
  const episodes: Track[] = album.tracks || [];

  const play = (track: Track, at: number) => playTrack(track, album, 'LIBRARY', at);

  if (!episodes.length) {
    return <p className="text-xs text-white/30 italic py-4">No episodes yet.</p>;
  }

  return (
    <div className="space-y-2">
      {episodes.map((ep, i) => {
        const isCur = currentTrack?.id === ep.id;
        const saved = getProgress(ep.id);
        const frac = isCur && duration ? currentTime / duration : progressFraction(saved);
        const resumable = !isCur && isResumable(saved);
        const done = !!saved?.completed;
        const epNum = ep.podcastMetadata?.episodeNumber ?? i + 1;

        return (
          <div key={ep.id} className="p-3 md:p-4 bg-white/[0.03] border border-white/5 rounded-2xl hover:bg-white/[0.05] transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-black text-white/25 w-6 text-center shrink-0">{epNum}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h5 className="text-sm font-bold text-white truncate">{ep.title}</h5>
                  {done && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-small-orange/15 text-small-orange text-[8px] font-black uppercase tracking-widest shrink-0">
                      <Check size={9} /> Played
                    </span>
                  )}
                  {isCur && !done && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 text-[8px] font-black uppercase tracking-widest shrink-0">Now playing</span>
                  )}
                </div>
                {/* progress marker */}
                <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-small-orange rounded-full transition-[width] duration-300" style={{ width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%` }} />
                </div>
                {saved && saved.currentTime > 1 && (
                  <span className="block mt-1 text-[10px] font-semibold text-white/30">
                    {done ? 'Finished' : `${fmtTime(saved.currentTime)}${saved.duration ? ` / ${fmtTime(saved.duration)}` : ''} listened`}
                  </span>
                )}
              </div>

              {/* episode selector actions: Resume + Start over, else Play */}
              <div className="flex items-center gap-1.5 shrink-0">
                {resumable ? (
                  <>
                    <button
                      onClick={() => play(ep, resumeTime(ep.id))}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110"
                      title={`Resume at ${fmtTime(resumeTime(ep.id))}`}
                    >
                      <Play size={11} fill="currentColor" /> Resume
                    </button>
                    <button
                      onClick={() => { clearProgress(ep.id); play(ep, 0); force(x => x + 1); }}
                      className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-white/50 hover:text-white hover:bg-white/10"
                      title="Start from beginning"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => play(ep, 0)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/10"
                  >
                    <Play size={11} fill="currentColor" /> {done ? 'Replay' : 'Play'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default PodcastEpisodeList;
