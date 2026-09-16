import { auth, db } from './firebase';
import { collection, getDocs, limit, orderBy, query, doc, setDoc } from 'firebase/firestore';

export interface HabitEntry {
  id: string;
  kind: 'CHORA' | 'RELLO' | 'TALEO' | 'VIDEO' | 'BOOK' | 'ARTICLE' | 'GAME';
  title?: string;
  thumbnailUrl?: string;
  ownerName?: string;
  updatedAt: number;
  uid: string;
  positionSec?: number;
  durationSec?: number;
  completed?: boolean;
  location?: string;
  albumId?: string;
}

const key = (uid: string) => `plajah_habits_${uid}`;
function local(uid: string): HabitEntry[] {
  try { return JSON.parse(localStorage.getItem(key(uid)) || '[]').filter((e: HabitEntry) => e.uid === uid); } catch { return []; }
}

export async function recordHabit(entry: Omit<HabitEntry, 'updatedAt' | 'uid'>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || !entry.id) return;
  const value = { ...entry, uid, updatedAt: Date.now() };
  const clean = Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
  try { localStorage.setItem(key(uid), JSON.stringify([value, ...local(uid).filter(e => e.id !== entry.id || e.kind !== entry.kind)].slice(0, 200))); } catch {}
  window.dispatchEvent(new Event('plajah:habits-updated'));
  try { await setDoc(doc(db, 'users', uid, 'activityHistory', `${entry.kind}_${encodeURIComponent(entry.id)}`), clean, { merge: true }); }
  catch { /* Owner-scoped local cache remains available offline. */ }
}

export async function loadHabits(uid: string): Promise<{ entries: HabitEntry[]; offline: boolean }> {
  if (auth.currentUser?.uid !== uid) throw new Error('Sign in to view your activity.');
  const results = await Promise.allSettled(['watchHistory', 'activityHistory'].map(name => getDocs(query(collection(db, 'users', uid, name), orderBy('updatedAt', 'desc'), limit(200)))));
  const entries = local(uid);
  try {
    entries.push(...JSON.parse(localStorage.getItem('plajah_watch_history_v1') || '[]').filter((e: HabitEntry) => e.uid === uid));
  } catch {}
  results.forEach(result => {
    if (result.status === 'fulfilled') entries.push(...result.value.docs.map(d => ({ ...d.data(), uid } as HabitEntry)));
  });
  if (auth.currentUser?.uid !== uid) throw new Error('Account changed.');
  const unique = new Map<string, HabitEntry>();
  entries.filter(e => e.uid === uid && Number.isFinite(e.updatedAt)).forEach(e => {
    const id = `${e.kind}:${e.id}`;
    if (!unique.has(id) || unique.get(id)!.updatedAt <= e.updatedAt) unique.set(id, e);
  });
  return { entries: [...unique.values()].sort((a, b) => b.updatedAt - a.updatedAt), offline: results.some(r => r.status === 'rejected') };
}
