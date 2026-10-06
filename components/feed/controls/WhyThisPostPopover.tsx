import React, { useEffect, useRef, useState } from 'react';
import { Info, ThumbsDown, ThumbsUp } from 'lucide-react';

/**
 * "Why am I seeing this?" — a small info button that opens an anchored popover with the ranker's `why`
 * string (RankedItem.why from services/forYouRanker). Optional show-less / show-more buttons wire straight to
 * useFeedPreferences().showLessLikeThis(post) / showMoreLikeThis(post).
 */
const WhyThisPostPopover: React.FC<{
  why: string;
  onShowLess?: () => void;
  onShowMore?: () => void;
  className?: string;
}> = ({ why, onShowLess, onShowMore, className = '' }) => {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<'less' | 'more' | null>(null);
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down); document.addEventListener('touchstart', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('touchstart', down); document.removeEventListener('keydown', key); };
  }, [open]);

  if (!why) return null;
  return (
    <span ref={root} className={`relative inline-block ${className}`}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-label="Why am I seeing this post?" aria-expanded={open}
        className="rounded-full p-1.5 opacity-50 transition-opacity hover:opacity-100">
        <Info size={14} />
      </button>
      {open && (
        <div role="dialog" aria-label="Why this post"
          className="absolute right-0 top-full z-40 mt-1 w-60 rounded-2xl border p-3 text-left backdrop-blur-xl"
          style={{ background: 'var(--pj-menu-bg)', borderColor: 'var(--pj-border-strong)', boxShadow: 'var(--pj-elev-3)' }}>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Why you are seeing this</p>
          <p className="mt-1 text-sm font-bold">{why}</p>
          {(onShowLess || onShowMore) && (
            <div className="mt-3 flex gap-2">
              {onShowMore && (
                <button type="button" onClick={() => { onShowMore(); setDone('more'); }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-bold"
                  style={{ height: 'var(--pj-ctl-h-xs)', borderColor: 'var(--pj-border)' }}>
                  <ThumbsUp size={12} /> {done === 'more' ? 'Noted' : 'More like this'}
                </button>
              )}
              {onShowLess && (
                <button type="button" onClick={() => { onShowLess(); setDone('less'); }}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-2 text-[11px] font-bold"
                  style={{ height: 'var(--pj-ctl-h-xs)', borderColor: 'var(--pj-border)' }}>
                  <ThumbsDown size={12} /> {done === 'less' ? 'Noted' : 'Less like this'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
};

export default WhyThisPostPopover;
