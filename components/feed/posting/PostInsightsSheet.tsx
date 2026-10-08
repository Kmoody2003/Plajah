/**
 * PostInsightsSheet — author-only analytics for one post (portals to document.body).
 *
 * Props:
 *   post     the Post (needs id, authorId, likesCount, commentsCount, quoteCount?, repostCount?)
 *   onClose()
 * Shows reach (impressions / unique viewers), engagement rate, avg. view time,
 * profile visits, follows from this post, top referrer and an hour-of-day SVG chart.
 * Non-authors see nothing (rules also block the read).
 *
 * <PostInsightsButton post /> is the card entry point: renders only for the author.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart2, X } from 'lucide-react';
import { auth } from '../../../services/firebase';
import type { Post } from '../../../types';
import { fetchPostStats } from '../../../services/postAnalyticsService';
import { engagementRate, hourlySeries, topReferrer, type PostStatsDoc } from '../../../services/postingLogic';

const REFERRER_LABEL: Record<string, string> = {
  FEED: 'Home feed', PROFILE: 'Profile', SEARCH: 'Search', HASHTAG: 'Hashtag page', SHARE: 'Shared link', OTHER: 'Other',
};

const Stat: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
    <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{label}</p>
    <p className="text-xl font-black tabular-nums mt-0.5">{value}</p>
    {hint && <p className="text-[10px] text-white/30 mt-0.5">{hint}</p>}
  </div>
);

/** 24 bars, hour of day (viewer's local time). Plain SVG, no chart lib. */
export const HourlyChart: React.FC<{ series: number[] }> = ({ series }) => {
  const max = Math.max(1, ...series);
  const W = 288, H = 80, bw = W / 24;
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full h-auto" role="img" aria-label="Impressions by hour of day">
      {series.map((v, h) => {
        const bh = v > 0 ? Math.max(2, (v / max) * H) : 1;
        return (
          <g key={h}>
            <rect x={h * bw + 1} y={H - bh} width={bw - 2} height={bh} rx={2} fill={v > 0 ? 'var(--color-small-orange, #ff8c00)' : 'rgba(255,255,255,0.12)'}>
              <title>{`${h}:00 — ${v} impression${v === 1 ? '' : 's'}`}</title>
            </rect>
          </g>
        );
      })}
      {[0, 6, 12, 18].map(h => (
        <text key={h} x={h * bw + bw / 2} y={H + 11} fontSize="8" textAnchor="middle" fill="rgba(255,255,255,0.35)">{h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</text>
      ))}
    </svg>
  );
};

export interface PostInsightsSheetProps { post: Post; onClose: () => void }

const PostInsightsSheet: React.FC<PostInsightsSheetProps> = ({ post, onClose }) => {
  const [stats, setStats] = useState<PostStatsDoc | null | undefined>(undefined);
  const isAuthor = auth.currentUser?.uid === post.authorId;

  useEffect(() => {
    if (!isAuthor) return;
    let alive = true;
    fetchPostStats(post.id).then(s => { if (alive) setStats(s); });
    return () => { alive = false; };
  }, [post.id, isAuthor]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const series = useMemo(() => hourlySeries(stats), [stats]);
  if (!isAuthor || typeof document === 'undefined') return null;

  const imp = stats?.impressions || 0;
  const rate = engagementRate(stats, post);
  const ref = topReferrer(stats);
  const avgDwell = imp > 0 && stats?.dwellMs ? Math.round(stats.dwellMs / imp / 100) / 10 : 0;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0c0c0c] border border-white/10 p-5 space-y-4"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-label="Post insights"
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-small-orange" />
          <h3 className="text-sm font-black uppercase tracking-widest">Post insights</h3>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/8" aria-label="Close"><X size={16} /></button>
        </div>
        <p className="text-xs text-white/40 line-clamp-2">{post.text || 'Media post'}</p>

        {stats === undefined ? (
          <div className="h-40 rounded-2xl bg-white/[0.03] animate-pulse" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Impressions" value={imp.toLocaleString()} hint="Views, once per person per day" />
              <Stat label="People reached" value={(stats?.uniqueViewers || 0).toLocaleString()} hint="Approximate" />
              <Stat label="Engagement" value={imp ? `${rate}%` : '—'} hint="Likes, replies, quotes, reposts per impression" />
              <Stat label="Avg. view time" value={avgDwell ? `${avgDwell}s` : '—'} />
              <Stat label="Profile visits" value={(stats?.profileVisits || 0).toLocaleString()} />
              <Stat label="Follows from post" value={(stats?.followsFromPost || 0).toLocaleString()} />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-white/35">When people saw it</p>
                <p className="text-[10px] text-white/30">{ref ? `Top source: ${REFERRER_LABEL[ref.name] || ref.name}` : 'No source data yet'}</p>
              </div>
              <HourlyChart series={series} />
            </div>
            {imp === 0 && <p className="text-[11px] text-white/35 text-center">Numbers appear once other people have seen this post.</p>}
            <p className="text-[10px] text-white/25 text-center">Counts are approximate and only include signed-in viewers other than you.</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};

/** Author-only "Insights" entry point for the card's action row / menu. */
export const PostInsightsButton: React.FC<{ post: Post; className?: string; label?: boolean }> = ({ post, className = '', label = false }) => {
  const [open, setOpen] = useState(false);
  if (auth.currentUser?.uid !== post.authorId) return null;
  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Insights"
        className={`flex items-center gap-1.5 p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/8 transition-all ${className}`}
      >
        <BarChart2 size={16} />
        {label && <span className="text-[11px] font-bold">Insights</span>}
      </button>
      {open && <PostInsightsSheet post={post} onClose={() => setOpen(false)} />}
    </>
  );
};

export default PostInsightsSheet;
