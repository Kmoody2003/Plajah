/**
 * QuotedPostEmbed — renders the embedded source of a quote post / repost.
 *
 * Props contract:
 *   post          the QUOTING post (reads post.quotedPost snapshot / post.quotedPostId)
 *   viewerUid?    defaults to the signed-in user (used for the private check)
 *   isHidden?     (uid) => boolean — pass useSocialSafety().isHidden so blocked/muted
 *                 authors collapse to a placeholder instead of showing their text
 *   resolveLive?  default true: one cached getDoc of the source to detect deleted /
 *                 now-private sources. false = trust the snapshot (cheaper in long lists)
 *   onOpenPost?   (postId) => void   tap on the card
 *   onVisitUser?  (uid) => void      tap on the author row
 *
 * Renders nothing when `post` has no quotedPost/quotedPostId.
 */
import React, { useEffect, useState } from 'react';
import { Lock, ImageOff } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../../../services/firebase';
import type { Post } from '../../../types';
import { RichText } from '../../../src/lib/richText';

type Snap = NonNullable<Post['quotedPost']>;
type Live = 'unknown' | 'ok' | 'gone' | 'private';

const liveCache = new Map<string, { state: Live; at: number }>();
const TTL = 5 * 60_000;

function useSourceState(id: string | undefined, authorId: string | undefined, viewerUid: string | undefined, enabled: boolean): Live {
  const [state, setState] = useState<Live>(() => (id ? liveCache.get(id)?.state ?? 'unknown' : 'unknown'));
  useEffect(() => {
    if (!id || !enabled) return;
    const hit = liveCache.get(id);
    if (hit && Date.now() - hit.at < TTL) { setState(hit.state); return; }
    let alive = true;
    getDoc(doc(db, 'posts', id)).then(s => {
      let next: Live = 'ok';
      if (!s.exists()) next = 'gone';
      else if ((s.data() as any).isPublic === false && (s.data() as any).authorId !== viewerUid) next = 'private';
      liveCache.set(id, { state: next, at: Date.now() });
      if (alive) setState(next);
    }).catch(err => {
      // permission-denied on a read == private/blocked for us; anything else: trust snapshot.
      const next: Live = (err?.code === 'permission-denied') ? 'private' : 'unknown';
      if (alive) setState(next);
    });
    return () => { alive = false; };
  }, [id, enabled, viewerUid, authorId]);
  return state;
}

const timeAgo = (ts: number) => {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const Placeholder: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="mt-2 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 flex items-center gap-2 text-xs text-white/40">
    {icon}<span>{text}</span>
  </div>
);

/** Presentational card for a snapshot (also used by the composer's quote preview). */
export const QuotedSnapshotCard: React.FC<{
  snap: Snap; onOpenPost?: (id: string) => void; onVisitUser?: (uid: string) => void; className?: string;
}> = ({ snap, onOpenPost, onVisitUser, className = '' }) => (
  <div
    role={onOpenPost ? 'button' : undefined}
    onClick={onOpenPost ? (e) => { e.stopPropagation(); onOpenPost(snap.id); } : undefined}
    className={`mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3 ${onOpenPost ? 'cursor-pointer hover:bg-white/[0.05]' : ''} transition-colors ${className}`}
  >
    <div
      className="flex items-center gap-2 mb-1.5"
      onClick={onVisitUser ? (e) => { e.stopPropagation(); onVisitUser(snap.authorId); } : undefined}
    >
      <img
        src={snap.authorPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${snap.authorId}`}
        className="w-5 h-5 rounded-full object-cover border border-white/10"
        alt="" loading="lazy" referrerPolicy="no-referrer"
      />
      <span className="text-xs font-black truncate text-white">{snap.authorName}</span>
      {snap.timestamp > 0 && <span className="text-[10px] text-white/30">· {timeAgo(snap.timestamp)}</span>}
    </div>
    {snap.text && (
      <div className="text-sm text-white/80 leading-relaxed line-clamp-5 whitespace-pre-wrap break-words">
        <RichText text={snap.text} scripture={false} scripturePreview={false} />
      </div>
    )}
    {snap.mediaThumb && (
      <img src={snap.mediaThumb} alt="" loading="lazy" className="mt-2 w-full max-h-56 object-cover rounded-xl border border-white/10" />
    )}
  </div>
);

export interface QuotedPostEmbedProps {
  post: Pick<Post, 'id' | 'quotedPost' | 'quotedPostId' | 'repostOf'>;
  viewerUid?: string;
  isHidden?: (uid: string) => boolean;
  resolveLive?: boolean;
  onOpenPost?: (postId: string) => void;
  onVisitUser?: (uid: string) => void;
}

const QuotedPostEmbed: React.FC<QuotedPostEmbedProps> = ({ post, viewerUid, isHidden, resolveLive = true, onOpenPost, onVisitUser }) => {
  const snap = post.quotedPost;
  const id = snap?.id || post.quotedPostId || post.repostOf;
  const viewer = viewerUid ?? auth.currentUser?.uid;
  const live = useSourceState(id, snap?.authorId, viewer, resolveLive && !!id);

  if (!id) return null;
  if (snap && isHidden?.(snap.authorId)) return <Placeholder icon={<Lock size={13} />} text="This post is hidden" />;
  if (live === 'gone') return <Placeholder icon={<ImageOff size={13} />} text="This post is no longer available" />;
  if (live === 'private') return <Placeholder icon={<Lock size={13} />} text="This post is private" />;
  if (!snap) return <Placeholder icon={<ImageOff size={13} />} text="Original post unavailable" />;
  return <QuotedSnapshotCard snap={snap} onOpenPost={onOpenPost} onVisitUser={onVisitUser} />;
};

export default QuotedPostEmbed;
