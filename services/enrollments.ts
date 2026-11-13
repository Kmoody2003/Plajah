// services/enrollments.ts — the browser side of the Enrolled Student role (services/enrollmentCore.ts).
// Records are written only by the server; this asks it to follow a class roster and reads them back.

import { auth } from './firebase';
import type { Enrollment } from './enrollmentCore';

export { ENROLLED_STUDENT, type Enrollment } from './enrollmentCore';

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const token = await user.getIdToken();
    return await fetch(`/api/enrollments${path}`, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  } catch {
    return null;
  }
}

// The roster each class was last synced with on this page, so saving a week or a title doesn't call the server.
const lastRoster = new Map<string, string>();

/** After a Christian Ed class is saved: enroll its new students, end the ones who left. Best-effort. */
export async function syncProgramEnrollments(programId: string, studentUids: readonly string[]): Promise<void> {
  const sig = [...studentUids].sort().join(',');
  if (lastRoster.get(programId) === sig) return;
  const res = await call('/sync-program', { method: 'POST', body: JSON.stringify({ programId }) });
  if (res?.ok) lastRoster.set(programId, sig);
}

/** A class was deleted: its students' enrollments in it end. */
export async function endProgramEnrollments(programId: string): Promise<void> {
  lastRoster.delete(programId);
  await call('/end-program', { method: 'POST', body: JSON.stringify({ programId }) });
}

/** Every course on Plajah the signed-in person is enrolled in right now. */
export async function fetchMyEnrollments(): Promise<Enrollment[]> {
  const res = await call('/mine');
  if (!res?.ok) return [];
  return ((await res.json()) as { enrollments?: Enrollment[] }).enrollments || [];
}

/** An org's enrolled students, for its staff. */
export async function fetchOrgEnrollments(orgId: string): Promise<Enrollment[]> {
  const res = await call(`/org?orgId=${encodeURIComponent(orgId)}`);
  if (!res?.ok) return [];
  return ((await res.json()) as { enrollments?: Enrollment[] }).enrollments || [];
}

export async function isEnrolledStudent(courseId?: string): Promise<boolean> {
  const mine = await fetchMyEnrollments();
  return courseId ? mine.some(e => e.courseId === courseId) : mine.length > 0;
}
