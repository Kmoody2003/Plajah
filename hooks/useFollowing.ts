// useFollowing — live set of uids a user follows, read from the `follows` collection
// (followerId == uid). This is the SOURCE OF TRUTH; `UserProfile.following` is legacy and
// was never written. One Firestore listener per uid is shared (ref-counted) by every hook
// instance, so mounting this in many components is cheap.

import { useEffect, useMemo, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import { db } from '../services/firebase';

const MAX_FOLLOWING = 2000;

interface Channel {
  ids: Set<string>;
  list: string[];
  loading: boolean;
  subs: Set<() => void>;
  unsub: (() => void) | null;
}

const channels = new Map<string, Channel>();
const EMPTY: Set<string> = new Set();
const EMPTY_LIST: string[] = [];

function acquire(uid: string, sub: () => void): () => void {
  let ch = channels.get(uid);
  if (!ch) {
    const created: Channel = { ids: EMPTY, list: EMPTY_LIST, loading: true, subs: new Set(), unsub: null };
    channels.set(uid, created);
    ch = created;
    const emit = () => created.subs.forEach(s => s());
    created.unsub = onSnapshot(
      query(collection(db, 'follows'), where('followerId', '==', uid), limit(MAX_FOLLOWING)),
      (snap) => {
        const list: string[] = [];
        snap.docs.forEach(d => { const id = d.data().followingId; if (typeof id === 'string' && !list.includes(id)) list.push(id); });
        created.list = list;
        created.ids = new Set(list);
        created.loading = false;
        emit();
      },
      () => { created.loading = false; emit(); },
    );
  }
  const channel = ch;
  channel.subs.add(sub);
  return () => {
    channel.subs.delete(sub);
    if (channel.subs.size === 0) {
      channel.unsub?.();
      channels.delete(uid);
    }
  };
}

export interface UseFollowing {
  ids: Set<string>;
  list: string[];
  loading: boolean;
}

export function useFollowing(uid?: string | null): UseFollowing {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!uid) return;
    return acquire(uid, () => bump(n => n + 1));
  }, [uid]);

  const ch = uid ? channels.get(uid) : undefined;
  const ids = ch?.ids ?? EMPTY;
  const list = ch?.list ?? EMPTY_LIST;
  const loading = uid ? (ch ? ch.loading : true) : false;
  return useMemo(() => ({ ids, list, loading }), [ids, list, loading]);
}

export default useFollowing;
