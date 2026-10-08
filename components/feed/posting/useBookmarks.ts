/**
 * useBookmarks — the signed-in user's saved posts, shared by every card.
 *
 * One Firestore listener (module singleton, ref-counted) feeds all consumers, so
 * 50 BookmarkButtons do not open 50 listeners.
 *
 *   const { ids, bookmarks, collections, isBookmarked, toggle, loading } = useBookmarks();
 *   await toggle(post, collectionId?)   // optimistic; resolves to the NEW saved state
 *
 * Adding a bookmark emits the BOOKMARK feed-score signal (bookmarkService).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../services/firebase';
import {
  listenToBookmarks, listenToCollections, addBookmark, removeBookmark, toBookmarkDoc,
  type BookmarkDoc, type BookmarkCollection, type BookmarkablePost,
} from '../../../services/bookmarkService';

interface Snapshot {
  uid: string | null;
  bookmarks: Map<string, BookmarkDoc>;
  collections: BookmarkCollection[];
  loading: boolean;
}

let snap: Snapshot = { uid: null, bookmarks: new Map(), collections: [], loading: true };
const subs = new Set<() => void>();
let unsubs: Array<() => void> = [];
let attachedUid: string | null = null;
let authUnsub: (() => void) | null = null;

const emit = () => subs.forEach(f => f());
const set = (patch: Partial<Snapshot>) => { snap = { ...snap, ...patch }; emit(); };

function attach(uid: string | null) {
  if (uid === attachedUid) return;
  unsubs.forEach(u => u()); unsubs = [];
  attachedUid = uid;
  if (!uid) { set({ uid: null, bookmarks: new Map(), collections: [], loading: false }); return; }
  set({ uid, loading: true });
  unsubs.push(listenToBookmarks(uid, items => set({ bookmarks: new Map(items.map(b => [b.postId, b] as [string, BookmarkDoc])), loading: false }), () => set({ loading: false })));
  unsubs.push(listenToCollections(uid, cols => set({ collections: cols })));
}

function retain() {
  if (!authUnsub) {
    authUnsub = onAuthStateChanged(auth, u => attach(u?.uid ?? null));
    attach(auth.currentUser?.uid ?? null);
  }
}
function release() {
  if (subs.size === 0) {
    unsubs.forEach(u => u()); unsubs = []; attachedUid = null;
    authUnsub?.(); authUnsub = null;
  }
}

export function useBookmarks() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force(n => n + 1);
    subs.add(f); retain();
    return () => { subs.delete(f); release(); };
  }, []);

  const toggle = useCallback(async (post: BookmarkablePost, collectionId: string | null = null): Promise<boolean> => {
    const uid = snap.uid;
    if (!uid) return false;
    const was = snap.bookmarks.has(post.id);
    // Optimistic local update; the snapshot listener reconciles.
    const next = new Map(snap.bookmarks);
    if (was) next.delete(post.id); else next.set(post.id, toBookmarkDoc(post, collectionId));
    set({ bookmarks: next });
    try {
      if (was) await removeBookmark(uid, post.id); else await addBookmark(uid, post, collectionId);
      return !was;
    } catch {
      const back = new Map(snap.bookmarks);
      if (was) back.set(post.id, toBookmarkDoc(post, collectionId)); else back.delete(post.id);
      set({ bookmarks: back });
      return was;
    }
  }, []);

  const ids = useMemo(() => new Set(snap.bookmarks.keys()), [snap.bookmarks]);
  const bookmarks = useMemo(() => [...snap.bookmarks.values()].sort((a, b) => b.savedAt - a.savedAt), [snap.bookmarks]);
  const isBookmarked = useCallback((postId: string) => snap.bookmarks.has(postId), [snap.bookmarks]);

  return { ids, bookmarks, collections: snap.collections, isBookmarked, toggle, loading: snap.loading, uid: snap.uid };
}
