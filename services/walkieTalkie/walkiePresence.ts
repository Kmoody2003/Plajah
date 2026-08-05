// walkiePresence.ts — lightweight online presence so hot contacts can connect in the background
// (without both opening the handset). A heartbeat writes walkiePresence/{uid} while the app is open;
// peers subscribe and treat presence as "online" only if the heartbeat is fresh.

import { db } from '../backendService';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';

export interface WalkiePresence { online: boolean; ts: number }

const FRESH_MS = 70_000;   // a heartbeat older than this = offline
const BEAT_MS = 25_000;

/** Begin broadcasting presence for this user. Returns a stop() that marks offline. */
export function startPresence(uid: string): () => void {
  const ref = doc(db, 'walkiePresence', uid);
  const beat = () => { setDoc(ref, { online: true, ts: Date.now() }, { merge: true }).catch(() => {}); };
  beat();
  const id = setInterval(beat, BEAT_MS);
  const goOffline = () => { setDoc(ref, { online: false, ts: Date.now() }, { merge: true }).catch(() => {}); };
  window.addEventListener('beforeunload', goOffline);
  return () => { clearInterval(id); window.removeEventListener('beforeunload', goOffline); goOffline(); };
}

/** Watch one user's presence. */
export function subscribePresence(uid: string, cb: (p: WalkiePresence | null) => void): () => void {
  return onSnapshot(doc(db, 'walkiePresence', uid),
    s => { const d = s.data() as any; cb(d ? { online: !!d.online, ts: d.ts || 0 } : null); },
    () => cb(null));
}

export const isOnline = (p: WalkiePresence | null): boolean => !!p && p.online && (Date.now() - p.ts) < FRESH_MS;
