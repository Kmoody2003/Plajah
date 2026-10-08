// lessonOverlayService: teacher versions of lessons. Local-first (a teacher never loses work, and it works offline), mirrored to
// Firestore `lessonOverlays` when signed in so students in the class and other teachers can see it. The model and its rules are in
// components/learn/lesson/lessonOverlay.ts.
import { db } from './firebase';
import { doc, setDoc, deleteDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { fetchClassrooms } from './backendService';
import { validateOverlay, adoptOverlay, type LessonOverlay } from '../components/learn/lesson/lessonOverlay';

const KEY = (uid: string) => `plajah:overlays:${uid}`;
const readLocal = (uid: string): LessonOverlay[] => { try { return JSON.parse(localStorage.getItem(KEY(uid)) || '[]'); } catch { return []; } };
const writeLocal = (uid: string, list: LessonOverlay[]) => { try { localStorage.setItem(KEY(uid), JSON.stringify(list)); } catch { /* private mode */ } };
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const newest = (a: LessonOverlay[]) => [...a].sort((x, y) => y.updatedAt - x.updatedAt);

/** Class ids this person teaches or is enrolled in. */
export async function classIdsFor(uid: string): Promise<string[]> {
  try { const all: any[] = (await fetchClassrooms()) || []; return all.filter(c => c?.ownerId === uid || (c?.enrolledStudents || []).includes(uid)).map(c => c.id).filter(Boolean); } catch { return []; }
}
export interface ClassOption { id: string; title: string }
export async function myTeachingClasses(uid: string): Promise<ClassOption[]> {
  try { const all: any[] = (await fetchClassrooms()) || []; return all.filter(c => c?.ownerId === uid).map(c => ({ id: c.id, title: c.title || c.name || 'Class' })); } catch { return []; }
}

export interface SaveResult { ok: boolean; errors: string[]; where?: 'cloud' | 'device' }
/** Saves a version. Always written to this device; also to the cloud when possible. */
export async function saveOverlay(o: LessonOverlay): Promise<SaveResult> {
  const errors = validateOverlay(o); if (errors.length) return { ok: false, errors };
  const next = { ...o, updatedAt: Date.now() };
  const mine = readLocal(o.authorUid).filter(x => x.id !== o.id); mine.push(next); writeLocal(o.authorUid, mine);
  try { await setDoc(doc(db, 'lessonOverlays', o.id), clean(next)); return { ok: true, errors: [], where: 'cloud' }; }
  catch { return { ok: true, errors: [], where: 'device' }; }
}
export async function removeOverlay(o: LessonOverlay): Promise<void> {
  writeLocal(o.authorUid, readLocal(o.authorUid).filter(x => x.id !== o.id));
  try { await deleteDoc(doc(db, 'lessonOverlays', o.id)); } catch { /* local copy is already gone */ }
}

/** This teacher's own versions of a lesson. */
export const myOverlaysFor = (uid: string, lessonId: string): LessonOverlay[] => newest(readLocal(uid).filter(o => o.baseLessonId === lessonId));

/** Versions other teachers have shared for a lesson (cloud). */
export async function sharedFor(lessonId: string): Promise<LessonOverlay[]> {
  try { const s = await getDocs(query(collection(db, 'lessonOverlays'), where('baseLessonId', '==', lessonId), where('visibility', '==', 'shared'))); return newest(s.docs.map(d => d.data() as LessonOverlay)); } catch { return []; }
}

/**
 * The version a person should see for a lesson: a student sees the newest version made for one of their classes; a teacher sees
 * their own newest version (and can switch to the original). Returns null when nobody has customized it for them.
 */
export async function activeOverlay(lessonId: string, uid: string, classIds: string[]): Promise<LessonOverlay | null> {
  const own = myOverlaysFor(uid, lessonId); if (own.length) return own[0];
  if (!classIds.length) return null;
  const found: LessonOverlay[] = [];
  try {
    for (let i = 0; i < classIds.length; i += 10) {
      const s = await getDocs(query(collection(db, 'lessonOverlays'), where('baseLessonId', '==', lessonId), where('classIds', 'array-contains-any', classIds.slice(i, i + 10))));
      s.docs.forEach(d => found.push(d.data() as LessonOverlay));
    }
  } catch { return null; }
  return newest(found)[0] || null;
}

/** Another teacher's shared version becomes this teacher's own copy, credited to its author. */
export async function adopt(src: LessonOverlay, me: { uid: string; name: string; school?: string }, classIds: string[]): Promise<{ overlay: LessonOverlay; result: SaveResult }> {
  const overlay = adoptOverlay(src, me, classIds);
  return { overlay, result: await saveOverlay(overlay) };
}
