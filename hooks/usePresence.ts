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
 *
 * Liveness: staleness is judged on the READER's clock from server heartbeats (see
 * services/presenceCore), never by comparing two devices' Date.now(). Each write also
 * carries `expireAt` (now + 10 min) so a Firestore TTL policy reaps abandoned docs:
 *   gcloud firestore fields ttls update expireAt --collection-group=here --enable-ttl --database=plajah-prod
 */

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../services/backendService';
import {
  doc, collection, setDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { onSnapshot } from '../services/safeSnapshot';
import {
  StaleTracker, toMillisLoose, STALE_MS, HEARTBEAT_MS, EXPIRE_MS, REFILTER_MS,
  type HeartbeatObservation,
} from '../services/presenceCore';

export interface PresencePerson { uid: string; name?: string; photo?: string; ts?: number; heartbeatMs?: number }

export function usePresence(
  key: string | null,
  opts: { publishSelf?: boolean } = { publishSelf: true },
): { count: number; people: PresencePerson[] } {
  const [people, setPeople] = useState<PresencePerson[]>([]);
  // Track auth so a sign-in that lands after mount still publishes (was captured once).
  const [uid, setUid] = useState<string | null>(() => auth.currentUser?.uid ?? null);
  useEffect(() => onAuthStateChanged(auth, u => setUid(u?.uid ?? null)), []);
  const publishSelf = opts.publishSelf !== false;

  useEffect(() => {
    if (!key) { setPeople([]); return; }
    const publish = publishSelf && !!uid;
    const myDoc = publish && uid ? doc(db, 'presence', key, 'here', uid) : null;
    const tracker = new StaleTracker(STALE_MS);
    let latest: PresencePerson[] = [];
    let lastEmit = '';
    let lastWriteLocal = 0;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const emit = () => {
      const fresh = tracker.freshIds(Date.now());
      const list = latest.filter(p => fresh.has(p.uid));
      const sig = list.map(p => `${p.uid}|${p.name ?? ''}|${p.photo ?? ''}`).join(',');
      if (sig === lastEmit) return;
      lastEmit = sig;
      setPeople(list);
    };

    const write = () => {
      if (!myDoc || !uid) return;
      const u = auth.currentUser;
      if (!u || u.uid !== uid) return;
      lastWriteLocal = Date.now();
      setDoc(myDoc, {
        uid,
        name: u.displayName || 'Guest',
        photo: u.photoURL || '',
        ts: lastWriteLocal,
        heartbeat: serverTimestamp(),
        expireAt: new Date(lastWriteLocal + EXPIRE_MS), // TTL policy target
      }).catch(() => {});
    };
    const startBeat = () => {
      if (!myDoc) return;
      if (heartbeat) clearInterval(heartbeat);
      write();
      heartbeat = setInterval(write, HEARTBEAT_MS);
    };
    const stopBeat = () => { if (heartbeat) { clearInterval(heartbeat); heartbeat = null; } };

    startBeat();

    const unsub = onSnapshot(collection(db, 'presence', key, 'here'), snap => {
      const now = Date.now();
      const obs: HeartbeatObservation[] = [];
      latest = snap.docs.map(d => {
        const data = d.data() as Record<string, unknown>;
        const hb = toMillisLoose(data.heartbeat);
        const ts = typeof data.ts === 'number' ? data.ts : undefined;
        if (uid && d.id === uid && !d.metadata.hasPendingWrites) tracker.noteOwnHeartbeat(hb, lastWriteLocal);
        obs.push({ id: d.id, heartbeatMs: hb, legacyTs: ts ?? null });
        const p: PresencePerson = { uid: d.id };
        if (typeof data.name === 'string') p.name = data.name;
        if (typeof data.photo === 'string') p.photo = data.photo;
        if (ts !== undefined) p.ts = ts;
        if (hb != null) p.heartbeatMs = hb;
        return p;
      });
      tracker.observe(obs, now);
      lastEmit = ''; // membership/metadata may have changed — always re-emit on a snapshot
      emit();
    }, () => {});

    // Ghosts age out on our own clock even when no new snapshot arrives.
    const refilter = setInterval(emit, REFILTER_MS);

    // Leaving the page: best-effort remove our doc; come back → re-publish immediately.
    const onPageHide = () => { stopBeat(); if (myDoc) deleteDoc(myDoc).catch(() => {}); };
    const onPageShow = () => { if (myDoc && !heartbeat) startBeat(); };
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && myDoc) startBeat();
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('pageshow', onPageShow);
      document.addEventListener('visibilitychange', onVisibility);
    }

    return () => {
      stopBeat();
      clearInterval(refilter);
      unsub();
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('pageshow', onPageShow);
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (myDoc) deleteDoc(myDoc).catch(() => {});
    };
  }, [key, publishSelf, uid]);

  return { count: people.length, people };
}
