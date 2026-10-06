/**
 * bookmarkService — private saved posts + collections.
 *
 *   users/{uid}/bookmarks/{postId}       { postId, authorId, collectionId|null, savedAt, snippet, thumb }
 *   users/{uid}/bookmarkCollections/{id} { id, name, createdAt }
 *
 * Owner-only (see firestore.rules). Adding a bookmark also emits the existing
 * BOOKMARK feed-score signal via recordFeedInteraction (we call it, never edit it).
 */
import {
  collection, doc, setDoc, deleteDoc, updateDoc, addDoc, query, where, getDocs, writeBatch,
} from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db } from './firebase';
import { recordFeedInteraction } from './backendService';
import { stripUndefined } from './postingLogic';

export interface BookmarkDoc {
  postId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  collectionId: string | null;
  savedAt: number;
  snippet: string;
  thumb: string;
  source: 'feed' | 'posts';
}
export interface BookmarkCollection { id: string; name: string; createdAt: number }

/** What a bookmark needs to know about the post (any Post satisfies this). */
export interface BookmarkablePost {
  id: string;
  authorId: string;
  authorName?: string;
  authorPhoto?: string;
  text?: string;
  sourceCollection?: 'feed' | 'posts' | 'private_posts';
  media?: { type?: string; url?: string; thumbnail?: string }[];
}

const bookmarksCol = (uid: string) => collection(db, 'users', uid, 'bookmarks');
const collectionsCol = (uid: string) => collection(db, 'users', uid, 'bookmarkCollections');
const ms = (v: any): number => (typeof v === 'number' ? v : typeof v?.toMillis === 'function' ? v.toMillis() : 0);

export function toBookmarkDoc(post: BookmarkablePost, collectionId: string | null, now = Date.now()): BookmarkDoc {
  const m = post.media?.find(x => x && (x.thumbnail || x.url));
  return {
    postId: post.id,
    authorId: post.authorId,
    authorName: post.authorName || '',
    authorPhoto: post.authorPhoto || '',
    collectionId,
    savedAt: now,
    snippet: (post.text || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').slice(0, 140),
    thumb: m ? (m.thumbnail || (m.type === 'PHOTO' || m.type === 'GIF' ? m.url || '' : '')) || '' : '',
    source: post.sourceCollection === 'feed' ? 'feed' : 'posts',
  };
}

export async function addBookmark(uid: string, post: BookmarkablePost, collectionId: string | null = null): Promise<void> {
  await setDoc(doc(bookmarksCol(uid), post.id), stripUndefined(toBookmarkDoc(post, collectionId)));
  // Feed-score signal (best effort; the engine no-ops if the post doc is missing).
  recordFeedInteraction(post.id, 'BOOKMARK', post.sourceCollection === 'feed' ? 'feed' : 'posts').catch(() => {});
}

export const removeBookmark = (uid: string, postId: string) => deleteDoc(doc(bookmarksCol(uid), postId));

export const moveBookmark = (uid: string, postId: string, collectionId: string | null) =>
  updateDoc(doc(bookmarksCol(uid), postId), { collectionId });

export function listenToBookmarks(uid: string, cb: (items: BookmarkDoc[]) => void, onError?: (e: unknown) => void) {
  return onSnapshot(bookmarksCol(uid), snap => {
    cb(snap.docs.map(d => ({ ...(d.data() as BookmarkDoc), postId: d.id, savedAt: ms((d.data() as any).savedAt) }))
      .sort((a, b) => b.savedAt - a.savedAt));
  }, e => onError?.(e));
}

export function listenToCollections(uid: string, cb: (items: BookmarkCollection[]) => void, onError?: (e: unknown) => void) {
  return onSnapshot(collectionsCol(uid), snap => {
    cb(snap.docs.map(d => ({ id: d.id, name: String((d.data() as any).name || 'Untitled'), createdAt: ms((d.data() as any).createdAt) }))
      .sort((a, b) => a.createdAt - b.createdAt));
  }, e => onError?.(e));
}

export async function createCollection(uid: string, name: string): Promise<string> {
  const clean = name.trim().slice(0, 40) || 'Untitled';
  const ref = await addDoc(collectionsCol(uid), { name: clean, createdAt: Date.now() });
  return ref.id;
}

export const renameCollection = (uid: string, id: string, name: string) =>
  updateDoc(doc(collectionsCol(uid), id), { name: name.trim().slice(0, 40) || 'Untitled' });

/** Deletes the collection; its bookmarks are kept and returned to "All saved". */
export async function deleteCollection(uid: string, id: string): Promise<void> {
  const inside = await getDocs(query(bookmarksCol(uid), where('collectionId', '==', id)));
  const batch = writeBatch(db);
  inside.docs.forEach(d => batch.update(d.ref, { collectionId: null }));
  batch.delete(doc(collectionsCol(uid), id));
  await batch.commit();
}
