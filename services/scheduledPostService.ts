/**
 * scheduledPostService — schedule a post for later.
 *
 * scheduled_posts/{id}: { authorId, publishAt, status, attempts, post: Partial<Post>, createdAt }
 *
 * PUBLISHING (client-side, today): publishDueScheduledPosts(uid) runs when the
 * author opens the app (the lead calls it once from App/FeedView mount). Each
 * due doc is CLAIMED in a transaction (PENDING -> PUBLISHING) so two tabs can't
 * double-publish, then posted with createPost, then marked PUBLISHED. A claim
 * stuck in PUBLISHING for > STALE_CLAIM_MS is treated as a crashed attempt.
 *
 * SERVER PUBLISHER: POST /api/social/publish-due-posts (routes/socialServer.ts, Cloud Scheduler every
 * minute, see scripts/scheduler/setup-scheduled-posts.md) claims due docs with an updateTime precondition
 * and writes the post with the deterministic id `sched_<scheduledId>`. This client publisher stays as a
 * harmless fallback — it uses the same id, so the two can never double-publish.
 *
 * Limitation: the payload must be self-contained — text + already-uploaded
 * (https) media. Local File/blob attachments can't be scheduled.
 */
import {
  collection, doc, addDoc, query, where, getDocs, runTransaction, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db } from './firebase';
import { createPost } from './backendService';
import type { Post } from '../types';
import {
  dueScheduled, validateSchedule, stripUndefined, extractHashtags, isPersistableUrl,
  STALE_CLAIM_MS, MAX_PUBLISH_ATTEMPTS, type ScheduleStatus,
} from './postingLogic';
import { recordHashtags } from './hashtagService';
import { scheduledPostId } from './socialServerCore';

export interface ScheduledPost {
  id: string;
  authorId: string;
  publishAt: number;
  status: ScheduleStatus;
  attempts: number;
  claimedAt?: number;
  publishedPostId?: string;
  post: Partial<Post>;
  createdAt: number;
}

const COL = 'scheduled_posts';

/** True if every attachment in `post.media` is already a remote URL. */
export const isSchedulable = (post: Partial<Post>) =>
  (post.media || []).every(m => isPersistableUrl(m.url) || !!m.muxPlaybackId);

export async function schedulePost(uid: string, post: Partial<Post>, publishAt: number, now = Date.now()): Promise<string> {
  const v = validateSchedule(publishAt, now);
  if (!v.ok) throw new Error(v.reason);
  if (!isSchedulable(post)) throw new Error('Scheduling supports text and media that is already uploaded.');
  const payload = stripUndefined({ ...post, hashtags: post.hashtags ?? extractHashtags(post.text || '') });
  const ref = await addDoc(collection(db, COL), stripUndefined({
    authorId: uid, publishAt, status: 'PENDING', attempts: 0, createdAt: now, post: payload,
  }));
  return ref.id;
}

export function listenToScheduled(uid: string, cb: (items: ScheduledPost[]) => void) {
  // Single equality filter: no composite index; sorted client-side.
  return onSnapshot(query(collection(db, COL), where('authorId', '==', uid)), snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ScheduledPost))
      .filter(p => p.status === 'PENDING' || p.status === 'PUBLISHING' || p.status === 'FAILED')
      .sort((a, b) => a.publishAt - b.publishAt));
  }, () => cb([]));
}

export const cancelScheduled = (id: string) => updateDoc(doc(db, COL, id), { status: 'CANCELLED' });
export const deleteScheduled = (id: string) => deleteDoc(doc(db, COL, id));
export const rescheduleScheduled = (id: string, publishAt: number) => {
  const v = validateSchedule(publishAt, Date.now());
  if (!v.ok) return Promise.reject(new Error(v.reason));
  return updateDoc(doc(db, COL, id), { publishAt, status: 'PENDING', attempts: 0 });
};

/** Claim a doc for publishing. Returns the claimed doc or null if someone else got it / it's not due. */
async function claim(id: string, now: number): Promise<ScheduledPost | null> {
  const ref = doc(db, COL, id);
  return runTransaction(db, async tx => {
    const s = await tx.get(ref);
    if (!s.exists()) return null;
    const d = { id, ...(s.data() as any) } as ScheduledPost;
    const stale = d.status === 'PUBLISHING' && now - (d.claimedAt || 0) > STALE_CLAIM_MS;
    if ((d.status !== 'PENDING' && !stale) || d.publishAt > now || (d.attempts || 0) >= MAX_PUBLISH_ATTEMPTS) return null;
    tx.update(ref, { status: 'PUBLISHING', claimedAt: now, attempts: (d.attempts || 0) + 1 });
    return d;
  });
}

/**
 * Publish everything of `uid`'s that is due. Safe to call repeatedly; returns
 * the ids of posts created. Never throws.
 */
export async function publishDueScheduledPosts(uid: string, now = Date.now()): Promise<string[]> {
  const published: string[] = [];
  try {
    const snap = await getDocs(query(collection(db, COL), where('authorId', '==', uid)));
    const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ScheduledPost));
    const stale = all.filter(p => p.status === 'PUBLISHING' && now - (p.claimedAt || 0) > STALE_CLAIM_MS)
      .map(p => ({ ...p, status: 'PENDING' as const }));
    const due = dueScheduled([...all.filter(p => p.status === 'PENDING'), ...stale], now);
    for (const p of due) {
      const claimed = await claim(p.id, now).catch(() => null);
      if (!claimed) continue;
      try {
        // Deterministic id shared with the server publisher (POST /api/social/publish-due-posts): both
        // paths claim the doc first AND write `sched_<id>`, so a double publish is impossible.
        const postId = await createPost({ ...claimed.post, timestamp: undefined } as Partial<Post>, { postId: scheduledPostId(p.id) });
        if (!postId) throw new Error('createPost returned no id');
        await updateDoc(doc(db, COL, p.id), { status: 'PUBLISHED', publishedPostId: postId });
        if (claimed.post.hashtags?.length) recordHashtags(claimed.post.hashtags);
        published.push(postId);
      } catch {
        const attempts = (claimed.attempts || 0) + 1;
        await updateDoc(doc(db, COL, p.id), { status: attempts >= MAX_PUBLISH_ATTEMPTS ? 'FAILED' : 'PENDING' }).catch(() => {});
      }
    }
  } catch { /* offline / rules: try again next open */ }
  return published;
}
