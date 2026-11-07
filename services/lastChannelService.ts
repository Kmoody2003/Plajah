// The Live TV channel a viewer last watched, so the TV opens where they left off on any device.
//
// Instant from localStorage; mirrored to users/{uid}/private/liveTv (owner-only per firestore.rules,
// so what someone watches never lands on their public profile card). Newest write wins between the
// device copy and the account copy.

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export interface LastChannel { id?: string; number?: string; at: number }

const keyFor = (uid?: string | null) => `plajah.liveTv.lastChannel.${uid || 'guest'}`;
const remoteRef = (uid: string) => doc(db, 'users', uid, 'private', 'liveTv');

export function getLocalLastChannel(uid?: string | null): LastChannel | null {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(uid)) || 'null');
    return v && (v.id || v.number) ? { id: v.id, number: v.number, at: Number(v.at) || 0 } : null;
  } catch { return null; }
}

/** Account copy, or null when signed out / missing / unreadable. Never throws. */
export async function fetchRemoteLastChannel(uid?: string | null): Promise<LastChannel | null> {
  if (!uid) return null;
  try {
    const v = (await getDoc(remoteRef(uid))).data()?.lastChannel;
    return v && (v.id || v.number) ? { id: v.id, number: v.number, at: Number(v.at) || 0 } : null;
  } catch { return null; }
}

// Channel surfing settles a new channel every few hundred ms — only the one the viewer stays on
// needs to reach the account.
let pending: ReturnType<typeof setTimeout> | null = null;

export function saveLastChannel(uid: string | null | undefined, ch: { id?: string; number?: string }): void {
  const rec: LastChannel = { at: Date.now() };
  if (ch.id) rec.id = ch.id;
  if (ch.number != null) rec.number = String(ch.number);
  const prev = getLocalLastChannel(uid);
  try { localStorage.setItem(keyFor(uid), JSON.stringify(rec)); } catch { /* private mode */ }
  if (!uid || (prev && prev.id === rec.id && prev.number === rec.number)) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    setDoc(remoteRef(uid), { lastChannel: rec }, { merge: true })
      .catch(e => console.warn('[liveTv] last channel sync failed, kept locally', e));
  }, 4000);
}
