/**
 * FeedPagingUI — the three small primitives that go with services/feedPagination.useFeedPages.
 *
 *   <NewPostsPill count onClick />   sticky "↑ N new posts" button; render only when count > 0
 *   <FeedSkeleton count? />          placeholder post cards for the INITIAL load (not for empty state)
 *   <InfiniteSentinel onVisible />   invisible 1px element; fires onVisible when it nears the viewport
 */

import React, { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';

export const NewPostsPill: React.FC<{
  count: number;
  onClick: () => void;
  className?: string;
}> = ({ count, onClick, className = '' }) => {
  if (count <= 0) return null;
  return (
    <div className={`sticky top-3 z-30 flex justify-center pointer-events-none ${className}`} role="status" aria-live="polite">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none"
        style={{ background: 'var(--pj-grad-ember)', boxShadow: 'var(--pj-glow-orange)' }}
      >
        <ArrowUp size={14} aria-hidden />
        {count === 1 ? '1 new post' : `${count > 99 ? '99+' : count} new posts`}
      </button>
    </div>
  );
};

const SkeletonCard: React.FC<{ withMedia: boolean }> = ({ withMedia }) => (
  <div
    className="rounded-3xl border p-4 space-y-3 animate-pulse"
    style={{ background: 'var(--pj-glass-1)', borderColor: 'var(--pj-border)' }}
    aria-hidden
  >
    <div className="flex items-center gap-3">
      <div className="h-10 w-10 rounded-full" style={{ background: 'var(--pj-glass-3)' }} />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 rounded-full" style={{ background: 'var(--pj-glass-3)' }} />
        <div className="h-2.5 w-1/5 rounded-full" style={{ background: 'var(--pj-glass-2)' }} />
      </div>
    </div>
    <div className="space-y-2">
      <div className="h-3 w-full rounded-full" style={{ background: 'var(--pj-glass-2)' }} />
      <div className="h-3 w-4/5 rounded-full" style={{ background: 'var(--pj-glass-2)' }} />
    </div>
    {withMedia && <div className="aspect-video w-full rounded-2xl" style={{ background: 'var(--pj-glass-2)' }} />}
    <div className="flex gap-6 pt-1">
      <div className="h-3 w-10 rounded-full" style={{ background: 'var(--pj-glass-2)' }} />
      <div className="h-3 w-10 rounded-full" style={{ background: 'var(--pj-glass-2)' }} />
      <div className="h-3 w-10 rounded-full" style={{ background: 'var(--pj-glass-2)' }} />
    </div>
  </div>
);

export const FeedSkeleton: React.FC<{ count?: number; className?: string }> = ({ count = 3, className = '' }) => (
  <div className={`space-y-4 ${className}`} role="status" aria-label="Loading feed">
    {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} withMedia={i % 2 === 0} />)}
  </div>
);

export const InfiniteSentinel: React.FC<{
  onVisible: () => void;
  /** Stop observing (nothing left to load, or a load is already running). */
  disabled?: boolean;
  /** The scroll container, when it is not the viewport (FeedView's feedScrollRef.current). */
  root?: Element | null;
  rootMargin?: string;
}> = ({ onVisible, disabled = false, root = null, rootMargin = '600px 0px' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible); cb.current = onVisible;

  useEffect(() => {
    if (disabled) return;
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { cb.current(); return; }
    const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) cb.current(); }, { root, rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [disabled, root, rootMargin]);

  return <div ref={ref} aria-hidden className="h-px w-full" />;
};
