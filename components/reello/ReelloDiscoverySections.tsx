// Reello discovery sections — Trending and Watch Later.
//
// Trending is computed client-side over the recent window using relloFeedService.computeTrending
// (likes/comments/plays velocity with gravity decay), restricted to the last ~7 days so the board
// reflects momentum rather than lifetime totals.
//
// Watch Later reads the reserved WATCH_LATER system playlist.

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Flame, Clock, Loader2, Play, Trash2 } from 'lucide-react';
import { Video } from '../../types';
import { computeTrending } from '../../services/relloFeedService';
import {
  auth, fetchAllVideos, fetchWatchLaterPlaylist, fetchPlaylistVideos, removeFromWatchLater,
} from '../../services/backendService';
import WatchLaterButton, { invalidateWatchLaterCache } from './WatchLaterButton';
import LearnChip from '../LearnChip';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const thumbFor = (v?: Partial<Video> | null): string => {
  if (!v) return '';
  if ((v as any).muxPlaybackId) return `https://image.mux.com/${(v as any).muxPlaybackId}/thumbnail.png?width=640&height=360&time=5`;
  return v.thumbnailUrl || (v as any).coverImageUrl || (v as any).coverImage || '';
};

const fmtCount = (n?: number) => {
  const v = n || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
};

const Empty: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="py-16 text-center space-y-3">
    <div className="flex justify-center opacity-20">{icon}</div>
    <p className="text-[11px] font-black uppercase tracking-widest text-white/30">{text}</p>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Trending — ranked leaderboard over the last 7 days
// ─────────────────────────────────────────────────────────────────────────────
export const TrendingSection: React.FC<{
  /** Already-fetched videos (VideoTab's discover pool). Falls back to a fetch when empty. */
  videos?: Video[];
  onPlay: (v: Video) => void;
  limit?: number;
}> = ({ videos, onPlay, limit = 40 }) => {
  const [fetched, setFetched] = useState<Video[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (videos?.length) return;
    let alive = true;
    setLoading(true);
    fetchAllVideos()
      .then(v => { if (alive) setFetched((v || []) as Video[]); })
      .catch(() => { if (alive) setFetched([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [videos?.length]);

  const pool = videos?.length ? videos : (fetched || []);

  const ranked = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS;
    // Prefer the last 7 days; if the window is thin (young platform), widen to everything
    // so the tab is never empty for the wrong reason.
    const recent = pool.filter(v => (v.timestamp || 0) >= cutoff && !(v as any).isPrivate);
    const source = recent.length >= 6 ? recent : pool.filter(v => !(v as any).isPrivate);
    return computeTrending(source)
      .filter(v => ((v.likesCount || 0) + (v.commentsCount || 0) + (v.playsCount || 0)) > 0 || source.length < 12)
      .slice(0, limit);
  }, [pool, limit]);

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>;
  if (!ranked.length) return <Empty icon={<Flame size={34} />} text="Nothing trending yet" />;

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2.5">
          <Flame className="text-small-orange" size={16} /> Trending
        </h2>
        <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/25">Last 7 days</span>
      </div>

      <div className="space-y-2">
        {ranked.map((v, i) => (
          <motion.div
            key={v.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.015, 0.3) }}
            onClick={() => onPlay(v)}
            className="group flex items-center gap-3 sm:gap-4 p-2.5 rounded-2xl hover:bg-white/[0.04] cursor-pointer transition-colors"
          >
            <span className={`w-7 sm:w-9 shrink-0 text-center font-display font-black tabular-nums ${
              i < 3 ? 'text-xl sm:text-2xl text-small-orange' : 'text-base sm:text-lg text-white/20'
            }`}>{i + 1}</span>

            <div className="relative w-32 sm:w-44 aspect-video rounded-xl overflow-hidden bg-white/[0.04] border border-white/10 shrink-0">
              {thumbFor(v)
                ? <img src={thumbFor(v)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                : <div className="w-full h-full flex items-center justify-center"><Play size={18} className="text-white/20" /></div>}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-white leading-tight line-clamp-2 group-hover:text-small-orange transition-colors">{v.title}</h3>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest truncate mt-1">{v.artist || (v as any).ownerName || 'Creator'}</p>
              <div className="flex items-center gap-2 mt-1 text-[8px] font-bold text-white/25 uppercase tracking-widest">
                <span>{fmtCount(v.playsCount)} views</span>
                <span>·</span>
                <span>{fmtCount(v.likesCount)} likes</span>
                {!!v.commentsCount && <><span>·</span><span>{fmtCount(v.commentsCount)} comments</span></>}
              </div>
              <div className="mt-1.5 hidden sm:block" onClick={e => e.stopPropagation()}>
                <LearnChip tags={v.tags} text={v.title} compact />
              </div>
            </div>

            <div onClick={e => e.stopPropagation()} className="shrink-0">
              <WatchLaterButton video={v} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Watch Later — the reserved system playlist
// ─────────────────────────────────────────────────────────────────────────────
export const WatchLaterSection: React.FC<{ onPlay: (v: Video) => void }> = ({ onPlay }) => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const uid = auth.currentUser?.uid;

  useEffect(() => {
    let alive = true;
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const pl = await fetchWatchLaterPlaylist();
        const vids = pl?.videoIds?.length ? await fetchPlaylistVideos(pl.videoIds) : [];
        if (alive) setVideos(vids);
      } catch {
        if (alive) setVideos([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uid]);

  const handleRemove = async (id: string) => {
    setVideos(prev => prev.filter(v => v.id !== id));
    await removeFromWatchLater(id).catch(() => {});
    invalidateWatchLaterCache();
  };

  if (!uid) return <Empty icon={<Clock size={34} />} text="Sign in to save videos for later" />;
  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-white/30" /></div>;
  if (!videos.length) return <Empty icon={<Clock size={34} />} text="Nothing saved for later yet" />;

  return (
    <div className="pt-2">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2.5">
          <Clock className="text-small-orange" size={16} /> Watch Later
        </h2>
        <span className="text-[8px] font-black uppercase tracking-[0.25em] text-white/25">{videos.length} saved</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
        {videos.map(v => (
          <div key={v.id} className="group">
            <button onClick={() => onPlay(v)} className="w-full text-left">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/[0.04] border border-white/10">
                {thumbFor(v)
                  ? <img src={thumbFor(v)} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  : <div className="w-full h-full flex items-center justify-center"><Play size={22} className="text-white/20" /></div>}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/30 transition-opacity">
                  <Play size={26} className="text-white" fill="currentColor" />
                </div>
              </div>
              <p className="mt-2 text-[11px] font-black uppercase tracking-widest text-white line-clamp-2 group-hover:text-small-orange transition-colors">{v.title}</p>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mt-1 truncate">{v.artist || (v as any).ownerName || 'Creator'}</p>
            </button>
            <div className="flex items-center gap-2 mt-2">
              <LearnChip tags={v.tags} text={v.title} compact />
              <div className="flex-1" />
              <button
                onClick={() => handleRemove(v.id)}
                title="Remove from Watch Later"
                className="p-1.5 text-white/20 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
