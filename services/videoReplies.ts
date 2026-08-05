/**
 * Creator reply-with-video — Blueprint Part 1B.5.
 *
 * *"Creator reply-with-video on comments — a comment can be answered with a short;
 * threads the two (`replyVideoId` on `VideoComment`)."*
 *
 * The thread is a single field. A comment at `videos/{videoId}/comments/{commentId}`
 * gains `replyVideoId`, pointing at the short that answers it; the comment UI then
 * renders that short inline underneath. No new collection, no join table.
 *
 * Only the video's owner may attach a reply — the affordance is the *creator*
 * answering their audience. Ownership is checked here as a UX guard; Firestore rules
 * are the actual enforcement boundary (see the note in the task report).
 */

import { doc, updateDoc, deleteField, getDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { fetchVideoById, fetchUserVideos } from './backendService';
import type { Video, VideoComment } from '../types';

/**
 * Thread a short onto a comment. Resolves `true` on success.
 * Silently returns `false` when unauthenticated, mis-addressed, or the write is denied.
 */
export async function attachReplyVideo(
  videoId: string,
  commentId: string,
  replyVideoId: string,
): Promise<boolean> {
  if (!auth.currentUser || !videoId || !commentId || !replyVideoId) return false;
  try {
    // Never write undefined; replyVideoId is a validated non-empty string by here.
    await updateDoc(doc(db, 'videos', videoId, 'comments', commentId), { replyVideoId });
    return true;
  } catch (e) {
    console.warn('[videoReplies] attach failed:', (e as Error)?.message?.slice(0, 200));
    return false;
  }
}

/**
 * Unthread a short from a comment. Uses `deleteField()` rather than writing
 * `undefined` — Firestore rejects undefined field values outright.
 */
export async function clearReplyVideo(videoId: string, commentId: string): Promise<boolean> {
  if (!auth.currentUser || !videoId || !commentId) return false;
  try {
    await updateDoc(doc(db, 'videos', videoId, 'comments', commentId), { replyVideoId: deleteField() });
    return true;
  } catch (e) {
    console.warn('[videoReplies] clear failed:', (e as Error)?.message?.slice(0, 200));
    return false;
  }
}

/** The short answering `comment`, or null when there is none / it has been deleted. */
export async function fetchReplyVideo(comment: Pick<VideoComment, 'replyVideoId'> | null | undefined): Promise<Video | null> {
  if (!comment?.replyVideoId) return null;
  try {
    return await fetchVideoById(comment.replyVideoId);
  } catch {
    return null;
  }
}

/**
 * True when the signed-in user owns `videoId` and may therefore reply-with-video on
 * its comments. Resolves `false` rather than throwing on any read failure.
 */
export async function canReplyWithVideo(videoId: string, ownerIdHint?: string): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid || !videoId) return false;
  if (ownerIdHint) return ownerIdHint === uid;
  try {
    const snap = await getDoc(doc(db, 'videos', videoId));
    if (!snap.exists()) return false;
    const d: any = snap.data();
    return (d.ownerId || d.artistId || d.uid) === uid;
  } catch {
    return false;
  }
}

/**
 * The creator's own shorts, newest first — the candidate list for "answer with a video".
 * Excludes the video being commented on (a video can't answer itself) and privates.
 */
export async function fetchReplyCandidates(excludeVideoId?: string): Promise<Video[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const mine = await fetchUserVideos(uid);
    return (mine || [])
      .filter(v => v.id !== excludeVideoId && !v.isPrivate)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  } catch (e) {
    console.warn('[videoReplies] candidates failed:', (e as Error)?.message?.slice(0, 200));
    return [];
  }
}
