// RssFeedViewer — a collapsible podcast RSS feed reader for the profile page (sits under the bio).
// Hidden by default; expands to fetch + list episodes from an external feed, each playable with the
// same Resume / progress-marker behaviour as native episodes.

import React, { useState } from 'react';
import { Rss, ChevronDown, ChevronRight, Play, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { fetchPodcastFeed, type RssFeed, type RssEpisode } from '../services/podcastRssReader';
import { useGlobalPlayer } from '../contexts/GlobalPlayerContext';
import { getProgress, progressFraction, isResumable, resumeTime, clearProgress, fmtTime } from '../services/episodeProgressService';
import type { Track } from '../types';

const RssFeedViewer: React.FC<{ feedUrl: string; feedTitle?: string }> = ({ feedUrl, feedTitle }) => {
  const { playTrack, currentTrack } = useGlobalPlayer();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<RssFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [, force] = useState(0);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !feed && !loading) {
      setLoading(true); setError('');
      try { setFeed(await fetchPodcastFeed(feedUrl)); }
      catch (e: any) { setError(e?.message || 'Could not load the feed.'); }
      finally { setLoading(false); }
    }
  };

  const playEp = (ep: RssEpisode, at: number) => {
    if (!ep.audioUrl) return;
    const track = {
      id: ep.id, title: ep.title, url: ep.audioUrl,
      artist: feed?.title || feedTitle || 'Podcast',
      coverImage: ep.imageUrl || feed?.imageUrl,
      podcastMetadata: { episodeNumber: 0, showTitle: feed?.title || feedTitle || '' },
    } as unknown as Track;
    playTrack(track, null, 'LIBRARY', at);
    force(x => x + 1);
  };

  return (
    <div className="mt-4 rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <button onClick={toggle} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors">
        <Rss size={15} className="text-small-orange shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/70">RSS Feed</span>
        {feed && <span className="text-[10px] font-bold text-white/30 truncate">· {feed.title}</span>}
        <span className="ml-auto text-white/40">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>

      {open && (
        <div className="px-4 pb-4">
          {loading && <div className="flex items-center gap-2 py-4 text-white/40 text-xs"><Loader2 size={14} className="animate-spin" /> Loading feed…</div>}
          {error && <div className="flex items-center gap-2 py-3 text-red-300 text-xs font-semibold"><AlertCircle size={14} /> {error}</div>}
          {feed && (
            <>
              {feed.description && <p className="text-xs text-white/40 leading-relaxed mb-3 line-clamp-3">{feed.description}</p>}
              <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
                {feed.episodes.slice(0, 40).map(ep => {
                  const isCur = currentTrack?.id === ep.id;
                  const saved = getProgress(ep.id);
                  const frac = progressFraction(saved);
                  const resumable = !isCur && isResumable(saved);
                  return (
                    <div key={ep.id} className="p-3 bg-white/[0.03] border border-white/5 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm font-bold text-white truncate">{ep.title}</h5>
                          {ep.pubDate && <span className="text-[10px] text-white/30">{new Date(ep.pubDate).toLocaleDateString()}{ep.duration ? ` · ${ep.duration}` : ''}</span>}
                          {frac > 0 && (
                            <div className="mt-1.5 h-1 bg-white/10 rounded-full overflow-hidden">
                              <div className="h-full bg-small-orange rounded-full" style={{ width: `${Math.round(frac * 100)}%` }} />
                            </div>
                          )}
                        </div>
                        {ep.audioUrl && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            {resumable ? (
                              <>
                                <button onClick={() => playEp(ep, resumeTime(ep.id))} title={`Resume at ${fmtTime(resumeTime(ep.id))}`} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest"><Play size={11} fill="currentColor" /> Resume</button>
                                <button onClick={() => { clearProgress(ep.id); playEp(ep, 0); }} title="Start from beginning" className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-white/50 hover:text-white"><RotateCcw size={13} /></button>
                              </>
                            ) : (
                              <button onClick={() => playEp(ep, 0)} className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/5 text-white hover:bg-white/10"><Play size={13} fill="currentColor" /></button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default RssFeedViewer;
