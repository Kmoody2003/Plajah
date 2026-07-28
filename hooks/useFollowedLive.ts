// useFollowedLive — "someone you follow is live right now". Listens to the live_feeds discovery
// mirror (status == 'LIVE') and keeps only feeds owned by people the current user follows, one per
// creator. Powers the pop-up pills that greet you on app open.

import { useEffect, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { db, fetchFollowedArtists } from '../services/backendService';
import type { LiveFeed } from '../types';

export function useFollowedLive(uid: string | null | undefined): LiveFeed[] {
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [live, setLive] = useState<LiveFeed[]>([]);

  useEffect(() => {
    if (!uid) { setFollowed(new Set()); return; }
    let alive = true;
    fetchFollowedArtists(uid).then(list => { if (alive) setFollowed(new Set((list || []).map(a => a.uid))); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  useEffect(() => {
    if (!uid || followed.size === 0) { setLive([]); return; }
    const q = query(collection(db, 'live_feeds'), where('status', '==', 'LIVE'), limit(60));
    const unsub = onSnapshot(q, snap => {
      const byOwner = new Map<string, LiveFeed>();
      snap.docs.forEach(d => {
        const f = { id: d.id, ...(d.data() as any) } as LiveFeed;
        if (!f.ownerId || f.ownerId === uid) return;
        if ((f as any).isPublic === false) return;
        if (!followed.has(f.ownerId)) return;
        if (!byOwner.has(f.ownerId)) byOwner.set(f.ownerId, f);   // one pill per creator
      });
      setLive(Array.from(byOwner.values()));
    }, () => {});
    return () => unsub();
  }, [uid, followed]);

  return live;
}
