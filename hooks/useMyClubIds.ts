// useMyClubIds — ids of the clubs the viewer is an ACTIVE member of (newest membership first, capped).
// Read once per uid per session from `clubMemberships` (same query shape as useFeedScoring/discoveryService,
// no orderBy so no composite index) and cached at module level; feeds CLUB_HIGHLIGHT cards in useFeedCards.

import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../services/firebase';

const MAX_CLUBS = 15;
const EMPTY: string[] = [];
const cache = new Map<string, Promise<string[]>>();

export function fetchMyClubIds(uid: string): Promise<string[]> {
  let p = cache.get(uid);
  if (!p) {
    p = getDocs(query(collection(db, 'clubMemberships'), where('userId', '==', uid), where('status', '==', 'ACTIVE'), limit(50)))
      .then(snap => snap.docs
        .map(d => d.data() as { clubId?: unknown; joinedAt?: unknown })
        .filter(m => typeof m.clubId === 'string')
        .sort((a, b) => (Number(b.joinedAt) || 0) - (Number(a.joinedAt) || 0))
        .map(m => m.clubId as string)
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .slice(0, MAX_CLUBS))
      .catch(() => { cache.delete(uid); return EMPTY; });
    cache.set(uid, p);
  }
  return p;
}

export function useMyClubIds(uid?: string): string[] {
  const [ids, setIds] = useState<string[]>(EMPTY);
  useEffect(() => {
    if (!uid) { setIds(EMPTY); return; }
    let alive = true;
    fetchMyClubIds(uid).then(r => { if (alive) setIds(r); });
    return () => { alive = false; };
  }, [uid]);
  return ids;
}
