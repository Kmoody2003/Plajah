/**
 * RepostButton — one-tap repost (with 6s Undo) plus an optional Quote action.
 *
 * Props:
 *   post       the post being shared (original or a repost/quote wrapper; wrappers resolve to the original)
 *   onQuote?   (post) => void — lead opens the composer with `quoteOf={post}`; omit to hide the Quote icon
 *   onError?   (message) => void — default is silent
 *   showCount? default true (reads post.repostCount + post.quoteCount)
 *   className? wrapper classes
 * Own posts can't be reposted (the repost button is hidden; Quote still shows).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Repeat2, Quote } from 'lucide-react';
import { auth } from '../../../services/firebase';
import type { Post } from '../../../types';
import { repost, undoRepost, hasReposted } from '../../../services/postingService';
import { resolveQuoteTarget } from '../../../services/postingLogic';

export interface RepostButtonProps {
  post: Post;
  onQuote?: (post: Post) => void;
  onError?: (message: string) => void;
  showCount?: boolean;
  className?: string;
}

const RepostButton: React.FC<RepostButtonProps> = ({ post, onQuote, onError, showCount = true, className = '' }) => {
  const me = auth.currentUser?.uid;
  const target = resolveQuoteTarget(post as any);
  const isOwn = target.authorId === me;
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [delta, setDelta] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    if (me && !isOwn) hasReposted(post).then(v => { if (alive) setDone(v); });
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, [post.id, me, isOwn]);

  const toggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || !me) return;
    setBusy(true);
    try {
      if (done) {
        await undoRepost(post);
        setDone(false); setUndoOpen(false); setDelta(d => d - 1);
      } else {
        const created = await repost(post);
        setDone(true);
        if (created) {
          setDelta(d => d + 1);
          setUndoOpen(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setUndoOpen(false), 6000);
        }
      }
    } catch (err: any) {
      onError?.(err?.message || 'Could not repost right now');
    } finally { setBusy(false); }
  }, [busy, me, done, post, onError]);

  const undo = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try { await undoRepost(post); setDone(false); setDelta(d => d - 1); } catch { /* ignore */ }
    setUndoOpen(false); setBusy(false);
  };

  const count = Math.max(0, (post.repostCount || 0) + (post.quoteCount || 0) + delta);

  return (
    <div className={`relative inline-flex items-center gap-1 ${className}`}>
      {!isOwn && (
        <button
          onClick={toggle}
          disabled={busy || !me}
          aria-pressed={done}
          title={done ? 'Undo repost' : 'Repost'}
          className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all disabled:opacity-40 ${done ? 'text-emerald-400' : 'text-white/40 hover:text-white hover:bg-white/8'}`}
        >
          <Repeat2 size={16} />
          {showCount && count > 0 && <span className="tabular-nums">{count}</span>}
        </button>
      )}
      {onQuote && (
        <button
          onClick={(e) => { e.stopPropagation(); onQuote(post); }}
          title="Quote"
          className="p-1.5 rounded-xl text-white/40 hover:text-white hover:bg-white/8 transition-all"
        >
          <Quote size={15} />
        </button>
      )}
      {undoOpen && (
        <div className="absolute left-0 bottom-full mb-1 z-30 flex items-center gap-2 whitespace-nowrap rounded-full bg-[#141414] border border-white/10 px-3 py-1.5 shadow-xl text-[11px]">
          <span className="text-white/70">Reposted</span>
          <button onClick={undo} className="font-black text-small-orange hover:underline">Undo</button>
        </div>
      )}
    </div>
  );
};

export default RepostButton;
