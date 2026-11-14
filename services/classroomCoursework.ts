/**
 * Classroom coursework — the private half of a `classrooms/{id}` doc.
 *
 * The public classroom doc is world-readable (the catalog and course pages need it), so it must
 * never carry the actual coursework. Lessons (video links, lesson text) and assignments live in
 * `classrooms/{classId}/private/coursework`, readable only by the owner, enrolled students and
 * admins. The public doc keeps `lessons: []` / `assignments: []` plus a safe preview:
 * `lessonOutline` (ids + titles only) and `assignmentCount`.
 *
 * Classes created before the split still have their coursework embedded in the public doc; the
 * first time the OWNER opens one, `migrateLegacyCoursework` copies it across and blanks it.
 */
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import type { Classroom, Lesson, Assignment } from '../types';

export interface ClassroomCoursework {
  lessons: Lesson[];
  assignments: Assignment[];
  updatedAt: number;
}

const courseworkRef = (classId: string) => doc(db, 'classrooms', classId, 'private', 'coursework');

/** Firestore throws on `undefined` anywhere in a value (e.g. `contentUrl: undefined` in a lesson). */
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));

const isDenied = (e: any) => e?.code === 'permission-denied' || /permission/i.test(String(e?.message || ''));

/** The catalog-safe preview: titles only, never content or URLs. */
export function courseworkPreview(lessons: Lesson[]): Pick<Classroom, 'lessonOutline'>;
export function courseworkPreview(lessons: Lesson[], assignments: Assignment[]): Pick<Classroom, 'lessonOutline' | 'assignmentCount'>;
export function courseworkPreview(lessons: Lesson[], assignments?: Assignment[]) {
  const lessonOutline = [...lessons].sort((a, b) => (a.order || 0) - (b.order || 0)).map(l => ({ id: l.id, title: l.title }));
  return assignments ? { lessonOutline, assignmentCount: assignments.length } : { lessonOutline };
}

/** Counts for cards: the public preview, falling back to legacy embedded arrays. */
export const lessonCountOf = (c: Pick<Classroom, 'lessons' | 'lessonOutline'>) =>
  c.lessonOutline?.length ?? c.lessons?.length ?? 0;
export const assignmentCountOf = (c: Pick<Classroom, 'assignments' | 'assignmentCount'>) =>
  typeof c.assignmentCount === 'number' ? c.assignmentCount : (c.assignments?.length ?? 0);

/** Does the public doc still embed coursework (a pre-split class)? */
export const hasLegacyCoursework = (c: Pick<Classroom, 'lessons' | 'assignments'>) =>
  (c.lessons?.length ?? 0) > 0 || (c.assignments?.length ?? 0) > 0;

/**
 * Display-only lesson stubs built from the public outline, for curriculum lists shown to visitors.
 * They carry titles and nothing else — never feed them to an editor or a save.
 */
export function outlineLessons(c: Pick<Classroom, 'lessonOutline'>): Lesson[] {
  return (c.lessonOutline || []).map((l, i) => {
    const stub: Lesson = { id: l.id, title: l.title, description: '', type: 'TEXT', order: i + 1 };
    outlineStubs.add(stub);
    return stub;
  });
}
/** Stubs handed out above — a save that still contains one would wipe the real lesson content. */
const outlineStubs = new WeakSet<Lesson>();

/**
 * Read the private coursework. Returns null when the viewer may not read it (not owner/enrolled).
 * A class with no private doc yet reads as empty coursework (updatedAt 0).
 */
export async function fetchClassroomCoursework(classId: string): Promise<ClassroomCoursework | null> {
  try {
    const snap = await getDoc(courseworkRef(classId));
    if (!snap.exists()) return { lessons: [], assignments: [], updatedAt: 0 };
    const d: any = snap.data();
    return {
      lessons: Array.isArray(d.lessons) ? d.lessons : [],
      assignments: Array.isArray(d.assignments) ? d.assignments : [],
      updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
    };
  } catch (e) {
    if (isDenied(e)) return null;
    throw e;
  }
}

/**
 * Owner save. Writes the private doc first (so nothing is lost if the second write fails), then
 * refreshes the public preview and blanks any embedded coursework. Either field may be omitted;
 * the other is left as it is.
 */
export async function saveClassroomCoursework(classId: string, cw: { lessons?: Lesson[]; assignments?: Assignment[] }): Promise<void> {
  if (cw.lessons?.some(l => outlineStubs.has(l))) throw new Error('These lessons are a titles-only preview; reload the course before saving.');
  const now = Date.now();
  const priv: Record<string, any> = { updatedAt: now };
  const pub: Record<string, any> = {};
  if (cw.lessons) {
    priv.lessons = plain(cw.lessons);
    pub.lessons = [];
    pub.lessonOutline = courseworkPreview(cw.lessons).lessonOutline;
  }
  if (cw.assignments) {
    priv.assignments = plain(cw.assignments);
    pub.assignments = [];
    pub.assignmentCount = cw.assignments.length;
  }
  await setDoc(courseworkRef(classId), priv, { merge: true });
  if (Object.keys(pub).length) await updateDoc(doc(db, 'classrooms', classId), pub);
}

/**
 * Move a pre-split class's embedded coursework into the private doc. Owner only, and only when the
 * public doc still has lessons/assignments. A private doc that already holds coursework wins (it is
 * newer); the public copy is blanked either way. Returns the coursework now in force, or null if
 * there was nothing to do.
 */
export async function migrateLegacyCoursework(classroom: Classroom): Promise<ClassroomCoursework | null> {
  const uid = auth.currentUser?.uid;
  if (!uid || uid !== classroom.ownerId) return null;
  // Judge "legacy" from the stored doc, never from an in-memory copy (which may hold outline stubs
  // or already-merged coursework) — migrating those would overwrite the real thing.
  const legacy = await storedLegacyCoursework(classroom.id);
  if (!legacy) return null;
  const existing = await fetchClassroomCoursework(classroom.id).catch(() => null);
  const keep = existing && (existing.lessons.length || existing.assignments.length) ? existing : legacy;
  await saveClassroomCoursework(classroom.id, { lessons: keep.lessons, assignments: keep.assignments });
  return { lessons: keep.lessons, assignments: keep.assignments, updatedAt: Date.now() };
}

/** The coursework still embedded in the stored public doc, or null if it has none. */
async function storedLegacyCoursework(classId: string): Promise<ClassroomCoursework | null> {
  const snap = await getDoc(doc(db, 'classrooms', classId));
  if (!snap.exists()) return null;
  const c = snap.data() as Classroom;
  if (!hasLegacyCoursework(c)) return null;
  return { lessons: c.lessons || [], assignments: c.assignments || [], updatedAt: 0 };
}

/**
 * Everything a class page needs: the coursework if this viewer may see it (migrating a legacy class
 * when the owner opens it), else null. A legacy class not yet migrated still shows its embedded
 * coursework to members, because that data is still on the public doc until the owner visits.
 */
export async function loadClassroomCoursework(classroom: Classroom, uid?: string | null): Promise<ClassroomCoursework | null> {
  const owner = !!uid && uid === classroom.ownerId;
  const member = !!uid && (classroom.enrolledStudents || []).includes(uid);
  if (!owner && !member) return null;
  if (owner) {
    const migrated = await migrateLegacyCoursework(classroom).catch(e => { console.warn('[coursework] legacy migration failed', e); return null; });
    if (migrated) return migrated;
  }
  const cw = await fetchClassroomCoursework(classroom.id);
  if (!cw || (!cw.lessons.length && !cw.assignments.length)) {
    const legacy = hasLegacyCoursework(classroom) ? await storedLegacyCoursework(classroom.id).catch(() => null) : null;
    if (legacy) return legacy;
  }
  return cw;
}

/** A classroom with its coursework merged in when this viewer may see it, else the titles-only stubs. */
export async function withCoursework(classroom: Classroom, uid?: string | null): Promise<Classroom> {
  const cw = await loadClassroomCoursework(classroom, uid).catch(() => null);
  if (cw) return { ...classroom, lessons: cw.lessons, assignments: cw.assignments };
  return withOutline(classroom);
}

/** Display copy for visitors: empty public arrays replaced by the outline stubs. */
export function withOutline(classroom: Classroom): Classroom {
  return classroom.lessons?.length || !classroom.lessonOutline?.length ? classroom : { ...classroom, lessons: outlineLessons(classroom) };
}
