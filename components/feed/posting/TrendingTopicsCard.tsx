/**
 * TrendingTopicsCard — "Trending now" hashtags for the feed sidebar / top of feed.
 *
 * Props:
 *   onPick(tag)     tag is normalised (no #) — lead opens the hashtag feed
 *   windowHours?    default 24
 *   max?            default 6
 *   className?
 * Computed client-side from recent posts, cached 5 min (see hashtagService). Renders
 * nothing while empty so a quiet network doesn't show a dead card.
 */
import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { fetchTrendingHashtags } from '../../../services/hashtagService';
import type { TrendingTag } from '../../../services/postingLogic';

export interface TrendingTopicsCardProps { onPick: (tag: string) => void; windowHours?: number; max?: number; className?: string }

const TrendingTopicsCard: React.FC<TrendingTopicsCardProps> = ({ onPick, windowHours = 24, max = 6, className = '' }) => {
  const [rows, setRows] = useState<TrendingTag[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchTrendingHashtags(windowHours, max).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [windowHours, max]);

  if (rows !== null && rows.length === 0) return null;
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.03] p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-small-orange" />
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-white/50">Trending now</h3>
      </div>
      {rows === null ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <div key={i} className="h-7 rounded-xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((r, i) => (
            <li key={r.tag}>
              <button onClick={() => onPick(r.tag)} className="w-full flex items-center gap-3 px-2 py-1.5 rounded-xl hover:bg-white/5 text-left transition-colors">
                <span className="text-[10px] font-black text-white/25 w-4 tabular-nums">{i + 1}</span>
                <span className="font-bold text-sm text-white truncate">#{r.tag}</span>
                <span className="ml-auto text-[10px] text-white/30 tabular-nums shrink-0">{r.authors} {r.authors === 1 ? 'person' : 'people'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TrendingTopicsCard;
