import { useEffect, useState, useCallback } from 'react';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { subscribeSocialSafety, getCachedSocialSafety } from '../services/socialSafetyService';

export interface UseSocialSafety {
  blocked: Set<string>;
  blockedBy: Set<string>;
  muted: Set<string>;
  /** blocked ∪ blockedBy ∪ muted — uids whose content the viewer should not see. */
  hidden: Set<string>;
  isHidden: (uid: string) => boolean;
  loading: boolean;
}

/**
 * Live block/mute state for the signed-in user. Backed by ONE shared set of Firestore
 * listeners (ref-counted in socialSafetyService), so mounting this in every PostCard is cheap.
 * Fails open: if a listener errors the corresponding set is just empty.
 */
export function useSocialSafety(): UseSocialSafety {
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  const [state, setState] = useState(() => getCachedSocialSafety());

  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), []);
  useEffect(() => subscribeSocialSafety(uid, setState), [uid]);

  const { hidden } = state;
  const isHidden = useCallback((u: string) => hidden.has(u), [hidden]);
  return { blocked: state.blocked, blockedBy: state.blockedBy, muted: state.muted, hidden, isHidden, loading: state.loading };
}

const followCache = new Map<string, boolean>();

/**
 * Does the signed-in viewer follow `authorUid`? One cached getDoc per author, only when
 * `enabled` (used for the private-account soft gate so public posts pay nothing).
 * Returns null while unknown.
 */
export function useViewerFollows(authorUid: string | undefined, enabled: boolean): boolean | null {
  const viewer = auth.currentUser?.uid;
  const k = viewer && authorUid ? `${viewer}_${authorUid}` : '';
  const [val, setVal] = useState<boolean | null>(() => (k && followCache.has(k) ? followCache.get(k)! : null));
  useEffect(() => {
    if (!enabled || !k) return;
    if (followCache.has(k)) { setVal(followCache.get(k)!); return; }
    let live = true;
    getDoc(doc(db, 'follows', k))
      .then(s => { followCache.set(k, s.exists()); if (live) setVal(s.exists()); })
      .catch(() => { if (live) setVal(false); });
    return () => { live = false; };
  }, [enabled, k]);
  return val;
}

export default useSocialSafety;
