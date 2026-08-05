import { collection, doc, setDoc, deleteDoc, query, where, serverTimestamp, Timestamp } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';
import { db } from './firebase';
import { NowActiveEntry } from '../types';

const COLLECTION = 'now_active';
const TRACK_TTL_MS  = 45 * 60 * 1000;  // 45 min — clears if they close without pausing
const VIDEO_TTL_MS  = 3 * 60 * 60 * 1000; // 3 hrs

// ── Write ─────────────────────────────────────────────────────────────────────

export async function writePresence(uid: string, entry: Omit<NowActiveEntry, 'uid' | 'startedAt' | 'expiresAt'>): Promise<void> {
  const ttl = entry.type === 'TRACK' || entry.type === 'RADIO' ? TRACK_TTL_MS : VIDEO_TTL_MS;
  const now = Date.now();
  await setDoc(doc(db, COLLECTION, uid), {
    ...entry,
    uid,
    startedAt: now,
    expiresAt: now + ttl,
  } satisfies NowActiveEntry);
}

export async function clearPresence(uid: string): Promise<void> {
  try {
    await deleteDoc(doc(db, COLLECTION, uid));
  } catch {
    // not present — fine
  }
}

// ── Listen: one user ──────────────────────────────────────────────────────────

export function listenToMyPresence(uid: string, cb: (entry: NowActiveEntry | null) => void): () => void {
  return onSnapshot(doc(db, COLLECTION, uid), snap => {
    if (!snap.exists()) { cb(null); return; }
    const data = snap.data() as NowActiveEntry;
    if (data.expiresAt < Date.now()) { clearPresence(uid); cb(null); return; }
    cb(data);
  });
}

// ── Listen: batch of followed users (chunked — Firestore in[] limit is 30) ────

export function listenToFollowedPresence(
  followedUids: string[],
  cb: (entries: NowActiveEntry[]) => void,
): () => void {
  if (followedUids.length === 0) { cb([]); return () => {}; }

  const active = new Map<string, NowActiveEntry>();
  const unsubs: (() => void)[] = [];

  // Chunk into groups of 30 (Firestore `in` limit)
  const chunks: string[][] = [];
  for (let i = 0; i < followedUids.length; i += 30) {
    chunks.push(followedUids.slice(i, i + 30));
  }

  const emit = () => {
    const now = Date.now();
    const valid = [...active.values()].filter(e => e.expiresAt > now);
    // Sort: most recent first
    valid.sort((a, b) => b.startedAt - a.startedAt);
    cb(valid);
  };

  for (const chunk of chunks) {
    const q = query(collection(db, COLLECTION), where('uid', 'in', chunk));
    const unsub = onSnapshot(q, snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'removed') {
          active.delete(change.doc.id);
        } else {
          const entry = change.doc.data() as NowActiveEntry;
          if (entry.expiresAt > Date.now()) {
            active.set(entry.uid, entry);
          } else {
            active.delete(entry.uid);
          }
        }
      });
      emit();
    });
    unsubs.push(unsub);
  }

  return () => unsubs.forEach(u => u());
}
