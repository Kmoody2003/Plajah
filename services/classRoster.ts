// Class rosters live on classrooms/{id}/private/roster, not the world-readable class doc.
//   classMembers/{classId_uid}  server-written marker: what rules check, and how a person lists their classes
//   classrooms/{id}.enrolledCount  public seat count
//
// Callers keep reading `classroom.enrolledStudents`: hydrateClassRosters fills it for classes the viewer teaches or
// is in. Everywhere else it holds only the viewer, or nothing, and enrolledCount gives the size.
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';

export const classRosterRef = (classId: string) => doc(db, 'classrooms', classId, 'private', 'roster');

export async function myClassIds(uid: string): Promise<Set<string>> {
  const snap = await getDocs(query(collection(db, 'classMembers'), where('uid', '==', uid))).catch(() => null);
  return new Set((snap?.docs || []).map(d => String(d.data().classId)));
}

/** The roster, or null when this viewer can't read it. */
export async function loadClassRoster(classId: string): Promise<string[] | null> {
  try {
    const snap = await getDoc(classRosterRef(classId));
    return snap.exists() ? (snap.data().enrolledStudents || []) : [];
  } catch { return null; }
}

export async function hydrateClassRosters<T extends { id: string; ownerId: string; enrolledStudents?: string[] }>(classes: T[], uid?: string | null): Promise<T[]> {
  const mine = uid ? await myClassIds(uid) : new Set<string>();
  return Promise.all(classes.map(async c => {
    const legacy = Array.isArray(c.enrolledStudents) ? c.enrolledStudents : [];
    if (!uid || (c.ownerId !== uid && !mine.has(c.id))) return { ...c, enrolledStudents: uid && legacy.includes(uid) ? [uid] : [] };
    return { ...c, enrolledStudents: (await loadClassRoster(c.id)) ?? legacy };
  }));
}

/** The classes this person is in, by id. For a child, the server checks the caller is their guardian or teacher. */
export async function fetchClassIdsOf(uid: string): Promise<Set<string>> {
  const me = auth.currentUser;
  if (!me) return new Set();
  if (me.uid === uid) return myClassIds(uid);
  try {
    const r = await fetch('/api/learner-auth/classes-of', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await me.getIdToken()}` }, body: JSON.stringify({ uid }),
    });
    return new Set(r.ok ? ((await r.json()).classIds || []) : []);
  } catch { return new Set(); }
}

/** Seats taken, for any viewer. */
export const classSeatCount = (c: { enrolledCount?: number; enrolledStudents?: string[] }): number =>
  Math.max(c.enrolledCount || 0, (c.enrolledStudents || []).length);
