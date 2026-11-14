// teacherClassMastery — a teacher's real class mastery and recorded assessments, through routes/academiaClass.ts
// (the ledger is student/guardian-only in firestore.rules). Signed out or offline, both return null and Teacher
// Tools shows its empty "no evidence yet" state instead of numbers.
import { auth } from './firebase';

export type ClassMasteryMap = Record<string, Record<string, number>>;

async function post<T>(path: string, body: unknown): Promise<T | null> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return null;
  try {
    const res = await fetch(`/api/academia/class/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return res.ok ? await res.json() as T : null;
  } catch { return null; }
}

/** studentId → standardId → 0..100, for every enrolled student (empty map for no evidence yet). */
export async function fetchClassMastery(classId: string): Promise<ClassMasteryMap | null> {
  const out = await post<{ students: Array<{ id: string; byStandard: Record<string, number> }> }>('mastery', { classId });
  return out ? Object.fromEntries(out.students.map(s => [s.id, s.byStandard])) : null;
}

export async function recordClassAssessment(input: { classId: string; studentId: string; standardId: string; framework: string; mastery: number; evidence?: string }): Promise<boolean> {
  return !!(await post<{ ok: boolean }>('assess', input))?.ok;
}
