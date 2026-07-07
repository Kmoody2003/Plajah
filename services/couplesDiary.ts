import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './backendService';
import { encryptWith, decryptWith, hashSecret } from './cryptoService';
import type { CouplesDiary, DiaryEntry } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Shared Couples Diary — a private, safeword-locked notebook bound to an
// intimate DM pair. Firestore doc id === the DM room id; access is gated to
// the two participants by rules. NOTE-entry text is additionally encrypted
// with a key derived from the shared safeword (see cryptoService.encryptWith),
// so even a participant sees only ciphertext until the safeword is entered.
// ─────────────────────────────────────────────────────────────────────────

const COLLECTION = 'couplesDiaries';

/** Key material for entry encryption — requires BOTH the room and the shared safeword. */
const secretFor = (roomId: string, safeword: string) => `${roomId}::${safeword}`;

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** Read the diary for a room (participant-gated by rules). Null if none/denied. */
export async function getDiary(roomId: string): Promise<CouplesDiary | null> {
  try {
    const snap = await getDoc(doc(db, COLLECTION, roomId));
    return snap.exists() ? (snap.data() as CouplesDiary) : null;
  } catch {
    return null; // rules denial / offline
  }
}

/** Create the diary doc on first open if it doesn't exist yet. */
export async function ensureDiary(roomId: string, participantUids: string[]): Promise<CouplesDiary> {
  const existing = await getDiary(roomId);
  if (existing) return existing;
  const fresh: CouplesDiary = {
    roomId,
    participantUids: [...participantUids].slice(0, 2),
    createdAt: Date.now(),
    entries: [],
  };
  await setDoc(doc(db, COLLECTION, roomId), fresh);
  return fresh;
}

/** Whether a safeword has been set for this diary. */
export const hasSafeword = (diary: CouplesDiary | null): boolean => !!diary?.safewordHash;

/** Set (or change) the shared safeword. Stores only a hash — never the plaintext. */
export async function setSafeword(roomId: string, safeword: string): Promise<void> {
  const safewordHash = await hashSecret(safeword);
  await setDoc(doc(db, COLLECTION, roomId), { safewordHash }, { merge: true });
}

/** Verify an entered safeword against the stored hash. */
export async function verifySafeword(diary: CouplesDiary, safeword: string): Promise<boolean> {
  if (!diary.safewordHash) return false;
  return (await hashSecret(safeword)) === diary.safewordHash;
}

/** Append an entry. NOTE text is encrypted with the safeword-derived key. */
export async function addEntry(
  roomId: string,
  entry: Omit<DiaryEntry, 'id' | 'authorUid' | 'createdAt'>,
  safeword: string,
): Promise<DiaryEntry> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to write in the diary.');
  const diary = await getDiary(roomId);
  if (!diary) throw new Error('Diary not found.');

  const built: DiaryEntry = stripUndefined({
    id: crypto.randomUUID(),
    authorUid: uid,
    createdAt: Date.now(),
    kind: entry.kind,
    text: entry.text !== undefined ? await encryptWith(entry.text, secretFor(roomId, safeword)) : undefined,
    albumId: entry.albumId,
    trackId: entry.trackId,
    mediaTitle: entry.mediaTitle,
    mediaCover: entry.mediaCover,
    url: entry.url,
    title: entry.title,
    mood: entry.mood,
  });

  const entries = [...(diary.entries || []), built];
  await setDoc(doc(db, COLLECTION, roomId), { entries }, { merge: true });
  return built;
}

/** Decrypt a NOTE entry's text with the session safeword (returns '' for non-notes). */
export async function decryptEntryText(entry: DiaryEntry, roomId: string, safeword: string): Promise<string> {
  if (!entry.text) return '';
  return decryptWith(entry.text, secretFor(roomId, safeword));
}

/** Remove a single entry by id. */
export async function deleteEntry(roomId: string, entryId: string): Promise<void> {
  const diary = await getDiary(roomId);
  if (!diary) return;
  const entries = (diary.entries || []).filter((e) => e.id !== entryId);
  await setDoc(doc(db, COLLECTION, roomId), { entries }, { merge: true });
}

/** Wipe all entries + the safeword (used when the safeword is lost). */
export async function resetDiary(roomId: string): Promise<void> {
  await setDoc(doc(db, COLLECTION, roomId), { entries: [], safewordHash: null }, { merge: true });
}

/** Permanently delete the diary doc (called when a couple ends their connection). */
export async function deleteDiary(roomId: string): Promise<void> {
  try { await deleteDoc(doc(db, COLLECTION, roomId)); } catch { /* may not exist */ }
}
