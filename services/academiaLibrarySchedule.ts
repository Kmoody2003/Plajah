// Lesson Library scheduling for Academia classes (a teacher's own `classrooms`, no org needed).
// Delivery goes through the normal Academia homework path (publishWorksheet: answer keys stay server-side,
// students and guardians are notified); this module only lists and moves what the library scheduled.
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { publishWorksheet } from './worksheetAssignmentService';
import { loadClassRoster, type TeachingClass } from './teacherClasses';
import type { IngestedCurriculumUnit } from './curriculumIngestionService';

export interface ScheduledHomework {
  id: string;
  title: string;
  unitId?: string;
  kind?: string;
  dueAt: number;
  opensAt?: number;
}

const rosterCache = new Map<string, Promise<Array<{ id: string; name: string }>>>();
const rosterFor = (cls: TeachingClass) => {
  if (!rosterCache.has(cls.id)) rosterCache.set(cls.id, loadClassRoster(cls));
  return rosterCache.get(cls.id)!;
};

export async function publishLibraryUnitToClass(cls: TeachingClass, unit: IngestedCurriculumUnit, teacher: { uid: string; name: string }, when: { dueAt: number; opensAt?: number }) {
  const students = await rosterFor(cls);
  const res = await publishWorksheet({
    sheet: { ...unit.worksheet, title: unit.title, createdBy: teacher.uid },
    classId: cls.id,
    className: cls.title,
    students,
    teacher,
    dueDate: when.dueAt,
    opensAt: when.opensAt,
    librarySource: { unitId: unit.id, kind: unit.libraryCategory || unit.kind },
  });
  if (!res.ok) throw new Error(`Couldn’t send “${unit.title}” to ${cls.title}.`);
  return res;
}

/** Homework this teacher has assigned to one class, newest due last. */
export async function listClassHomework(teacherUid: string, classId: string): Promise<ScheduledHomework[]> {
  const snap = await getDocs(query(collection(db, 'worksheet_assignments'), where('teacherUid', '==', teacherUid), where('classId', '==', classId))).catch(() => null);
  return (snap?.docs || [])
    .map(d => {
      const a = d.data() as Record<string, any>;
      return { id: d.id, title: String(a.title || 'Worksheet'), unitId: a.librarySource?.unitId, kind: a.librarySource?.kind, dueAt: Number(a.dueDate || a.createdAt || 0), opensAt: a.opensAt ? Number(a.opensAt) : undefined };
    })
    .filter(h => h.dueAt > 0)
    .sort((a, b) => a.dueAt - b.dueAt);
}

/** Moves homework to new dates, on the assignment and every student's copy (their lists and guardians' calendars read those). */
export async function rescheduleClassHomework(assignmentId: string, at: { dueAt: number; opensAt?: number | null }): Promise<boolean> {
  const patch = { dueDate: at.dueAt, opensAt: at.opensAt && at.opensAt > Date.now() ? at.opensAt : null };
  try {
    const ref = doc(db, 'worksheet_assignments', assignmentId);
    const a = (await getDoc(ref)).data() as { worksheetId?: string; studentIds?: string[] } | undefined;
    await updateDoc(ref, patch);
    // Each student's copy is worksheet_submissions/{worksheetId}_{studentId} (publishWorksheet).
    if (a?.worksheetId) await Promise.all((a.studentIds || []).map(sid => updateDoc(doc(db, 'worksheet_submissions', `${a.worksheetId}_${sid}`), patch).catch(() => null)));
    return true;
  } catch {
    return false;
  }
}

/** Students' homework lists: hide work scheduled to open later. */
export const isHomeworkOpen = (a: { opensAt?: number | null }, now = Date.now()) => !a.opensAt || a.opensAt <= now;
