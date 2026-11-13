// services/enrollmentCore.ts — the Enrolled Student record, one shape for every kind of course on Plajah.
//
// A person enrolled in a course holds the Enrolled Student role for it: one doc in plajah-ops `enrollments`,
// written only by the server (routes/enrollments.ts, services/enrollmentServer.ts). Whatever the course
// is — a Christian Ed class in an org, an Academia class, a paid creator course — the same record says who
// is a student where, so any part of the platform can ask "is this person enrolled, and in what?".
//
// Being enrolled never opens a course's lesson library: students see a lesson once it is assigned to them.
// Pure (no Firebase) so the roster diff is tested on its own.

export type EnrollmentKind = 'christian_ed' | 'academia';
export type EnrollmentStatus = 'active' | 'ended';

/** The role an enrollment grants. One role today; a course may add others (auditor, assistant) later. */
export const ENROLLED_STUDENT = 'ENROLLED_STUDENT' as const;
export type EnrollmentRole = typeof ENROLLED_STUDENT;

export interface Enrollment {
  id: string;
  uid: string;
  kind: EnrollmentKind;
  /** churchPrograms id for christian_ed, classrooms id for academia. */
  courseId: string;
  courseTitle: string;
  /** The org that runs the course; '' for a course with no org. */
  orgId: string;
  role: EnrollmentRole;
  status: EnrollmentStatus;
  /** What put them there: the class roster, a join code, an open course, a payment. */
  source: string;
  enrolledAt: number;
  endedAt: number;
  updatedAt: number;
}

export const ENROLLMENTS_COL = 'enrollments';

/** One record per person per course, so writing it again is always safe. */
export const enrollmentId = (kind: EnrollmentKind, courseId: string, uid: string) =>
  `${kind}_${courseId}_${uid}`.replace(/\//g, '_');

const realUid = (u: unknown): u is string => typeof u === 'string' && u.length > 0 && u.length <= 128 && !u.includes('/');

export function newEnrollment(p: { uid: string; kind: EnrollmentKind; courseId: string; courseTitle?: string; orgId?: string; source: string }, now = Date.now()): Enrollment {
  return {
    id: enrollmentId(p.kind, p.courseId, p.uid),
    uid: p.uid,
    kind: p.kind,
    courseId: p.courseId,
    courseTitle: (p.courseTitle || '').slice(0, 200),
    orgId: p.orgId || '',
    role: ENROLLED_STUDENT,
    status: 'active',
    source: p.source,
    enrolledAt: now,
    endedAt: 0,
    updatedAt: now,
  };
}

/**
 * What a class roster means for its enrollment records. Everyone on the roster gets (or keeps) an active
 * record; anyone with an active record who left the roster has it ended. Ended records are kept as history,
 * and someone re-added is enrolled again with a fresh date.
 */
export function diffRoster(
  roster: readonly unknown[],
  existing: readonly Pick<Enrollment, 'uid' | 'status' | 'courseTitle' | 'orgId'>[],
  course: { kind: EnrollmentKind; courseId: string; courseTitle: string; orgId: string; source: string },
  now = Date.now(),
): { enroll: Enrollment[]; end: string[]; retitle: string[] } {
  const want = new Set(roster.filter(realUid));
  const active = new Map(existing.filter(e => e.status === 'active').map(e => [e.uid, e] as const));
  const enroll = [...want].filter(uid => !active.has(uid)).map(uid => newEnrollment({ uid, ...course }, now));
  const end = [...active.keys()].filter(uid => !want.has(uid));
  // A renamed class (or one moved under an org) keeps its students; their records just catch up.
  const retitle = [...active.entries()].filter(([uid, e]) => want.has(uid) && (e.courseTitle !== course.courseTitle.slice(0, 200) || e.orgId !== course.orgId)).map(([uid]) => uid);
  return { enroll, end, retitle };
}

/** The students on a Christian Ed class doc: its studentUids index plus any roster row with an account. */
export function programRoster(p: { studentUids?: unknown; students?: unknown } | null | undefined): string[] {
  if (!p) return [];
  const ids = Array.isArray(p.studentUids) ? p.studentUids : [];
  const rows = Array.isArray(p.students) ? (p.students as Array<{ uid?: unknown }>).map(s => s?.uid) : [];
  return [...new Set([...ids, ...rows].filter(realUid))];
}
