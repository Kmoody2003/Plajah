// hooks/useFaithContentScope.ts
// A member's own choice of which tradition-specific assets (hymns, prayers…) they see: tailored to
// their church by default, or from every tradition. Saved on their profile (users/{uid}.faithContentScope);
// signed-out viewers keep it on this device only.

import { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { updateUserProfile } from '../services/backendService';
import type { FaithContentScope } from '../services/elevateTruth';

const LOCAL_KEY = 'plajah:faithContentScope';

const readLocal = (): FaithContentScope => {
  try { return localStorage.getItem(LOCAL_KEY) === 'ALL' ? 'ALL' : 'ORG'; } catch { return 'ORG'; }
};

export function useFaithContentScope(uid?: string | null): [FaithContentScope, (next: FaithContentScope) => void] {
  const [scope, setScope] = useState<FaithContentScope>(readLocal);

  useEffect(() => {
    if (!uid) { setScope(readLocal()); return; }
    let alive = true;
    getDoc(doc(db, 'users', uid))
      .then(s => { if (alive) setScope((s.data() as any)?.faithContentScope === 'ALL' ? 'ALL' : 'ORG'); })
      .catch(() => { /* keep the local value */ });
    return () => { alive = false; };
  }, [uid]);

  const update = useCallback((next: FaithContentScope) => {
    setScope(next);
    try { localStorage.setItem(LOCAL_KEY, next); } catch { /* */ }
    if (uid) updateUserProfile(uid, { faithContentScope: next }).catch(() => { /* */ });
  }, [uid]);

  return [scope, update];
}
