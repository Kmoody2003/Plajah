// services/enrollmentServer.ts — the only writer of `enrollments` (see services/enrollmentCore.ts).
// Server-side: reads and writes with the server's credentials, so every caller checks access first.

import { fsGet, fsPatch, fsQuery, fsSet } from './firebaseAdminRest';
import { ENROLLMENTS_COL, diffRoster, enrollmentId, newEnrollment, programRoster, type Enrollment, type EnrollmentKind } from './enrollmentCore';

const MAX_ROSTER = 2000;

async function courseRecords(kind: EnrollmentKind, courseId: string): Promise<Enrollment[]> {
  const rows = await fsQuery(ENROLLMENTS_COL, [{ field: 'kind', value: kind }, { field: 'courseId', value: courseId }], MAX_ROSTER);
  return rows.map(r => r.data as Enrollment);
}

/** Enrolls one person (or re-activates an ended record). Idempotent. */
export async function recordEnrollment(p: { uid: string; kind: EnrollmentKind; courseId: string; courseTitle?: string; orgId?: string; source: string }): Promise<boolean> {
  const id = enrollmentId(p.kind, p.courseId, p.uid);
  const prev = await fsGet(`${ENROLLMENTS_COL}/${id}`);
  if (prev?.status === 'active') return true;
  return fsSet(`${ENROLLMENTS_COL}/${id}`, newEnrollment(p) as unknown as Record<string, unknown>);
}

export async function endEnrollment(kind: EnrollmentKind, courseId: string, uid: string, now = Date.now()): Promise<boolean> {
  return fsPatch(`${ENROLLMENTS_COL}/${enrollmentId(kind, courseId, uid)}`, { status: 'ended', endedAt: now, updatedAt: now });
}

/** An Academia class (or paid course) seat was granted: the learner holds the Enrolled Student role for it. */
export async function recordClassEnrollment(classId: string, uid: string, source: string): Promise<boolean> {
  const cls = await fsGet(`classrooms/${classId}`);
  if (!cls) return false;
  return recordEnrollment({ uid, kind: 'academia', courseId: classId, courseTitle: String(cls.title || ''), orgId: String(cls.orgId || ''), source });
}

/**
 * Brings a Christian Ed class's enrollment records in line with its roster (churchPrograms is saved from the
 * browser by the class's staff, so the roster is the truth and this follows it).
 */
export async function syncProgramEnrollments(programId: string): Promise<{ enrolled: number; ended: number } | null> {
  const p = await fsGet(`churchPrograms/${programId}`);
  if (!p) return null;
  const course = { kind: 'christian_ed' as const, courseId: programId, courseTitle: String(p.name || ''), orgId: String(p.orgId || ''), source: 'class_roster' };
  const { enroll, end, retitle } = diffRoster(programRoster(p), await courseRecords('christian_ed', programId), course);
  const now = Date.now();
  await Promise.all([
    ...enroll.map(e => fsSet(`${ENROLLMENTS_COL}/${e.id}`, e as unknown as Record<string, unknown>)),
    ...end.map(uid => endEnrollment('christian_ed', programId, uid, now)),
    ...retitle.map(uid => fsPatch(`${ENROLLMENTS_COL}/${enrollmentId('christian_ed', programId, uid)}`, { courseTitle: course.courseTitle.slice(0, 200), orgId: course.orgId, updatedAt: now })),
  ]);
  return { enrolled: enroll.length, ended: end.length };
}

/** A deleted class: its students are no longer enrolled in it. */
export async function endCourseEnrollments(kind: EnrollmentKind, courseId: string): Promise<number> {
  const active = (await courseRecords(kind, courseId)).filter(e => e.status === 'active');
  const now = Date.now();
  await Promise.all(active.map(e => endEnrollment(kind, courseId, e.uid, now)));
  return active.length;
}

/** Who may change a Christian Ed class's roster, and so sync it: the same people the class rules allow. */
export function canManageProgram(uid: string, program: Record<string, any> | null, org: Record<string, any> | null): boolean {
  if (!uid || !program) return false;
  if (program.createdBy === uid || (program.teacherUids || []).includes(uid)) return true;
  if (!org) return false;
  return org.creatorId === uid
    || [org.admins, org.itAdminUids, org.pastorUids, org.staffUids, org.eduTeacherUids].some(list => (list || []).includes(uid));
}

export async function enrollmentsOf(uid: string, includeEnded = false): Promise<Enrollment[]> {
  const rows = await fsQuery(ENROLLMENTS_COL, [{ field: 'uid', value: uid }], 500);
  return rows.map(r => r.data as Enrollment).filter(e => includeEnded || e.status === 'active');
}

export async function orgEnrollments(orgId: string): Promise<Enrollment[]> {
  const rows = await fsQuery(ENROLLMENTS_COL, [{ field: 'orgId', value: orgId }, { field: 'status', value: 'active' }], 5000);
  return rows.map(r => r.data as Enrollment);
}
