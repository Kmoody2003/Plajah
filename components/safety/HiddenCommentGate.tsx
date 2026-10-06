import React, { useState } from 'react';
import { VolumeX } from 'lucide-react';
import { useSocialSafety } from '../../hooks/useSocialSafety';
import { filterHidden } from '../../services/socialSafetyCore';

/**
 * Comment-list hiding for CommentSection's owner (not wired here).
 *
 *   <HiddenCommentGate authorUid={c.uid}> …comment row… </HiddenCommentGate>
 *     blocked / blocked-by authors: renders nothing.
 *     muted authors: a collapsed one-line notice with "Show".
 *
 *   const visible = useVisibleComments(comments)   // pure list filter when you need counts/threads
 *     drops blocked/blocked-by AND muted authors (replies of hidden parents are the caller's call).
 */
export const HiddenCommentGate: React.FC<{ authorUid?: string | null; children: React.ReactNode }> = ({ authorUid, children }) => {
  const { blocked, blockedBy, muted } = useSocialSafety();
  const [shown, setShown] = useState(false);
  if (!authorUid) return <>{children}</>;
  if (blocked.has(authorUid) || blockedBy.has(authorUid)) return null;
  if (muted.has(authorUid) && !shown) {
    return (
      <div className="flex items-center gap-2 py-2 text-[11px] text-white/40">
        <VolumeX size={12} />
        <span>Comment from a muted account.</span>
        <button type="button" onClick={() => setShown(true)} className="underline hover:text-white/70">Show</button>
      </div>
    );
  }
  return <>{children}</>;
};

export function useVisibleComments<T>(comments: readonly T[]): T[] {
  const { hidden } = useSocialSafety();
  return filterHidden(comments, (c: any) => c.uid ?? c.authorId, hidden);
}

export default HiddenCommentGate;
