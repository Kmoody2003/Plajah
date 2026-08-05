/**
 * usePresence — ambient "who's here right now" for ANY surface, no media.
 *
 * The lightest slice of the real-time backbone: it writes a heartbeat doc under
 * presence/{key}/here/{uid} and listens to the set, so a book page, a track, a
 * world, or a live hub can show "12 people here right now" and turn solitary
 * consumption social. Guests can read the count; signed-in users also appear.
 *
 * Separate from rtc_sessions on purpose — presence-only members must never be
 * mistaken for media peers by the WebRTC topology.
 */

import { useEffect, useRef, useState } from 'react';
import { auth, db } from '../services/backendService';
import {
  doc, collection, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';

const STALE_MS = 70_000;        // drop members we haven't heard from in 70s
const HEARTBEAT_MS = 25_000;    // refresh our own heartbeat every 25s

export interface PresencePerson { uid: string; name?: string; photo?: string; ts?: number }

export function usePresence(
  key: string | null,
  opts: { publishSelf?: boolean } = { publishSelf: true },
): { count: number; people: PresencePerson[] } {
  const [people, setPeople] = useState<PresencePerson[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!key) { setPeople([]); return; }
    const uid = auth.currentUser?.uid;
    const publish = opts.publishSelf !== false && !!uid;
    const myDoc = uid ? doc(db, 'presence', key, 'here', uid) : null;

    const write = () => {
      if (!publish || !myDoc) return;
      setDoc(myDoc, {
        uid,
        name: auth.currentUser?.displayName || 'Guest',
        photo: auth.currentUser?.photoURL || '',
        ts: Date.now(),
        heartbeat: serverTimestamp(),
      }).catch(() => {});
    };
    write();
    if (publish) heartbeatRef.current = setInterval(write, HEARTBEAT_MS);

    const unsub = onSnapshot(collection(db, 'presence', key, 'here'), snap => {
      const now = Date.now();
      const list = snap.docs
        .map(d => d.data() as PresencePerson)
        .filter(p => !p.ts || now - p.ts < STALE_MS);
      setPeople(list);
    }, () => {});

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      unsub();
      if (myDoc) deleteDoc(myDoc).catch(() => {});
    };
  }, [key, opts.publishSelf]);

  return { count: people.length, people };
}
