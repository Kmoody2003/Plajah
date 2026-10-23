// teacherClasses — the signed-in teacher's real classes and rosters, for anything that assigns work.
// Reads the same `classrooms` docs ClassroomsView writes (ownerId + enrolledStudents) and resolves
// names/guardians through academiaDossier.loadTeacherRoster. Failure-tolerant: a rules denial or an
// offline read returns an empty list, and callers fall back to the demo class.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { loadTeacherRoster } from './academiaDossier';
import type { DigitalWorksheet } from './worksheetDigitizer';

export interface TeachingClass {
  id: string;
  title: string;
  gradeBand?: string;
  category?: string;
  enrolledStudents: string[];
  track?: string;
}

export async function loadMyTeachingClasses(uid: string | undefined): Promise<TeachingClass[]> {
  if (!uid) return [];
  try {
    const snap = await getDocs(query(collection(db, 'classrooms'), where('ownerId', '==', uid)));
    return snap.docs
      .filter(d => (d.data() as any).status !== 'ARCHIVED')
      .map((d): TeachingClass => { const c: any = d.data(); return { id: c.id || d.id, title: c.title || 'Class', gradeBand: c.gradeBand, category: c.category, track: c.track, enrolledStudents: Array.isArray(c.enrolledStudents) ? c.enrolledStudents : [] }; })
      .sort((a, b) => (b.track === 'ACADEMIC' ? 1 : 0) - (a.track === 'ACADEMIC' ? 1 : 0) || b.enrolledStudents.length - a.enrolledStudents.length);
  } catch (error) {
    console.warn('[teacherClasses] could not load classes', error);
    return [];
  }
}

export async function loadClassRoster(cls: TeachingClass): Promise<Array<{ id: string; name: string }>> {
  if (!cls.enrolledStudents.length) return [];
  const rows = await loadTeacherRoster([{ id: cls.id, title: cls.title, enrolledStudents: cls.enrolledStudents }]).catch(() => []);
  return rows.map(r => ({ id: r.uid, name: r.name }));
}

const SUBJECT_WORDS: Record<string, RegExp> = {
  Math: /\b(math|algebra|geometry|calculus|arithmetic|numeracy)\b/i,
  Science: /\b(science|biology|chemistry|physics|stem|earth)\b/i,
  'English Language Arts': /\b(ela|english|reading|writing|literacy|language arts)\b/i,
  History: /\b(history|social studies|civics|government)\b/i,
  Geography: /\b(geography|social studies)\b/i,
  'World Language': /\b(spanish|french|german|mandarin|language)\b/i,
};

/** Pick the class this worksheet most likely belongs to: grade band, then subject, then size. */
export function suggestClassFor(sheet: Pick<DigitalWorksheet, 'subject' | 'gradeBand'>, classes: TeachingClass[]): TeachingClass | null {
  if (!classes.length) return null;
  const scored = classes.map(c => {
    let score = c.enrolledStudents.length ? 1 : 0;
    if (sheet.gradeBand && c.gradeBand && sheet.gradeBand === c.gradeBand) score += 4;
    const words = SUBJECT_WORDS[sheet.subject];
    if (words && words.test(`${c.title} ${c.category || ''}`)) score += 3;
    if (c.track === 'ACADEMIC') score += 1;
    return { c, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0].c;
}

/** Homework default: the next school day at 8:00 AM local time. */
export function nextSchoolDay(now = new Date()): number {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.getTime();
}
