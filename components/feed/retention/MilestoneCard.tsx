/**
 * MilestoneCard — a one-time celebration (first post, 10/100/1000 followers, a post
 * with 10/100/1000 likes).
 *
 * Props:
 *   uid                 signed-in user's uid
 *   allowSharePost?     default true: offers "Share it" which auto-posts a short note
 *   onShared?(postId)   called after the optional auto-post
 *   className?
 * Shows the oldest unseen milestone; dismissing (or sharing) marks it seen forever.
 * Renders nothing when there is none.
 */
import React, { useEffect, useState } from 'react';
import { fetchPendingMilestones, acknowledgeMilestones, postMilestone } from '../../../services/retentionService';
import type { MilestoneDef } from '../../../services/postingLogic';

export interface MilestoneCardProps { uid?: string | null; allowSharePost?: boolean; onShared?: (postId: string) => void; className?: string }

const MilestoneCard: React.FC<MilestoneCardProps> = ({ uid, allowSharePost = true, onShared, className = '' }) => {
  const [queue, setQueue] = useState<MilestoneDef[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    fetchPendingMilestones(uid).then(m => { if (alive) setQueue(m); });
    return () => { alive = false; };
  }, [uid]);

  const cur = queue[0];
  if (!uid || !cur) return null;

  const done = async (share: boolean) => {
    setBusy(true);
    if (share) {
      const id = await postMilestone(cur).catch(() => undefined);
      if (id) onShared?.(id);
    }
    await acknowledgeMilestones(uid, [cur.id]);
    setQueue(q => q.slice(1));
    setBusy(false);
  };

  return (
    <div className={`rounded-3xl border border-small-orange/30 bg-gradient-to-br from-small-orange/10 to-transparent p-4 sm:p-5 flex items-center gap-4 ${className}`}>
      <div className="text-3xl shrink-0" aria-hidden>{cur.emoji}</div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-black">{cur.title}</h3>
        <p className="text-xs text-white/55 mt-0.5">{cur.body}</p>
        <div className="flex gap-2 mt-2.5">
          {allowSharePost && (
            <button disabled={busy} onClick={() => void done(true)} className="px-3.5 py-1.5 rounded-full bg-small-orange text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Share it</button>
          )}
          <button disabled={busy} onClick={() => void done(false)} className="px-3.5 py-1.5 rounded-full bg-white/8 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
            {allowSharePost ? 'Thanks' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MilestoneCard;
