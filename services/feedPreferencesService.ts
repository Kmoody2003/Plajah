/**
 * feedPreferencesService — persistence + hook for per-user feed preferences.
 *
 * Doc: `users/{uid}/prefs/feed` (owner-only rules, see firestore.rules "feedPreferences region").
 * The model, the pure `applyFeedPreferences(items, prefs)` and `preferenceMultiplier` live in
 * feedPreferencesCore.ts (re-exported here) so ranking/tests do not need Firebase.
 *
 *   const fp = useFeedPreferences();            // uid defaults to the signed-in user; or pass one
 *   fp.prefs                  FeedPreferences (defaults while loading / signed out)
 *   fp.loading
 *   fp.showLessLikeThis(post) / fp.showMoreLikeThis(post)
 *   fp.muteTopic(t) / fp.unmuteTopic(t) / fp.toggleContentType(type) / fp.toggleCardKind(kind)
 *   fp.setDefaultTab('FOR_YOU' | 'FOLLOWING')
 *   fp.reset()
 *   applyFeedPreferences(posts, fp.prefs, { viewerId })     // hard filters; keep order
 *
 * Updates are optimistic (local state first) then written with setDoc (whole doc, no undefined values).
 * Writes are serialised through a tiny queue so rapid taps cannot interleave.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onSnapshot } from './safeSnapshot';
import {
  defaultFeedPreferences, sanitizeFeedPreferences, showLessLikeThis as showLessCore, showMoreLikeThis as showMoreCore,
  muteTopic as muteTopicCore, unmuteTopic as unmuteTopicCore, toggleContentType as toggleTypeCore,
  toggleCardKind as toggleCardCore, resetFeedPreferences,
  type FeedPreferences, type FeedContentType, type FeedDefaultTab, type PrefPostLike,
} from './feedPreferencesCore';

export * from './feedPreferencesCore';

const prefDoc = (uid: string) => doc(db, 'users', uid, 'prefs', 'feed');

/** Firestore throws on `undefined`; our model has none, but JSON round-trip guarantees it. */
const clean = (p: FeedPreferences): FeedPreferences => JSON.parse(JSON.stringify(p));

export async function saveFeedPreferences(uid: string, prefs: FeedPreferences): Promise<void> {
  await setDoc(prefDoc(uid), clean(prefs));
}

export interface UseFeedPreferences {
  prefs: FeedPreferences;
  loading: boolean;
  showLessLikeThis: (post: PrefPostLike) => void;
  showMoreLikeThis: (post: PrefPostLike) => void;
  muteTopic: (topic: string) => void;
  unmuteTopic: (topic: string) => void;
  toggleContentType: (type: FeedContentType) => void;
  toggleCardKind: (kind: string) => void;
  setDefaultTab: (tab: FeedDefaultTab) => void;
  reset: () => void;
}

export function useFeedPreferences(uidIn?: string | null): UseFeedPreferences {
  const [authUid, setAuthUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  useEffect(() => auth.onAuthStateChanged(u => setAuthUid(u?.uid ?? null)), []);
  const uid = uidIn === undefined ? authUid : uidIn;

  const [prefs, setPrefs] = useState<FeedPreferences>(defaultFeedPreferences);
  const [loading, setLoading] = useState(true);
  const ref = useRef(prefs); ref.current = prefs;
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!uid) { setPrefs(defaultFeedPreferences()); setLoading(false); return; }
    setLoading(true);
    return onSnapshot(prefDoc(uid), snap => {
      // ignore our own optimistic echo (hasPendingWrites) — local state is already ahead
      if (snap.metadata.hasPendingWrites) return;
      setPrefs(snap.exists() ? sanitizeFeedPreferences(snap.data()) : defaultFeedPreferences());
      setLoading(false);
    }, () => setLoading(false));
  }, [uid]);

  const commit = useCallback((next: FeedPreferences) => {
    ref.current = next; setPrefs(next);
    if (!uid) return;
    queue.current = queue.current
      .then(() => saveFeedPreferences(uid, ref.current))
      .catch(e => console.warn('[feedPreferences] save failed', (e as Error)?.message));
  }, [uid]);

  return {
    prefs, loading,
    showLessLikeThis: useCallback(p => commit(showLessCore(ref.current, p)), [commit]),
    showMoreLikeThis: useCallback(p => commit(showMoreCore(ref.current, p)), [commit]),
    muteTopic: useCallback(t => commit(muteTopicCore(ref.current, t)), [commit]),
    unmuteTopic: useCallback(t => commit(unmuteTopicCore(ref.current, t)), [commit]),
    toggleContentType: useCallback(t => commit(toggleTypeCore(ref.current, t)), [commit]),
    toggleCardKind: useCallback(k => commit(toggleCardCore(ref.current, k)), [commit]),
    setDefaultTab: useCallback(tab => commit({ ...ref.current, defaultTab: tab, updatedAt: Date.now() }), [commit]),
    reset: useCallback(() => commit(resetFeedPreferences()), [commit]),
  };
}
