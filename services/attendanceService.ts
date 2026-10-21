/**
 * Attendance, taken on Plajah. One Firestore doc per student per class per day:
 *   attendance/{classId}_{YYYY-MM-DD}_{studentId}
 * so a student or guardian can read their own rows without ever seeing classmates'. Only the
 * class owner writes (firestore.rules checks classrooms/{classId}.ownerId). Every query here uses
 * equality / array-contains filters only and sorts in memory, so no composite index is needed
 * ([[plajah-firestore-gotchas]]: an undeployed composite index fails silently at read time).
 */
import { collection, doc, getDocs, query, where, limit, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

export type AttendanceStatus = 'present' | 'tardy' | 'absent' | 'excused';
export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'tardy', 'absent', 'excused'];
export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; short: string; color: string }> = {
  present: { label: 'Present', short: 'P', color: '#3B82F6' },
  tardy: { label: 'Tardy', short: 'T', color: '#F5B83D' },
  absent: { label: 'Absent', short: 'A', color: '#ff6b8a' },
  excused: { label: 'Excused', short: 'E', color: '#a78bfa' },
};

export interface AttendanceRecord {
  id: string;
  classId: string;
  className: string;
  teacherUid: string;
  studentId: string;
  guardianUids: string[];
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  status: AttendanceStatus;
  note?: string;
  markedAt: number;
}

/** Local-time calendar key — a 7:55am mark belongs to today, not to UTC's yesterday. */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const recordId = (classId: string, date: string, studentId: string) => `${classId}_${date}_${studentId}`;
const toRecords = (snap: any): AttendanceRecord[] => snap.docs.map((d: any) => ({ ...(d.data() as Omit<AttendanceRecord, 'id'>), id: d.id }));

/** One class, one day: studentId → mark. */
export async function loadClassDay(teacherUid: string, classId: string, date: string): Promise<Record<string, AttendanceRecord>> {
  try {
    const snap = await getDocs(query(collection(db, 'attendance'), where('teacherUid', '==', teacherUid), where('classId', '==', classId), where('date', '==', date), limit(200)));
    return Object.fromEntries(toRecords(snap).map(r => [r.studentId, r]));
  } catch (e) {
    console.warn('[attendance] class day read failed:', (e as Error)?.message);
    return {};
  }
}

export interface DayMark { status: AttendanceStatus; note?: string; guardianUids: string[] }

/** Save a class's marks for a day. Batches of 10 keep each commit well inside the rules' get() budget. */
export async function saveClassDay(input: { teacherUid: string; classId: string; className: string; date: string; marks: Record<string, DayMark> }): Promise<boolean> {
  const entries = Object.entries(input.marks);
  try {
    for (let i = 0; i < entries.length; i += 10) {
      const batch = writeBatch(db);
      for (const [studentId, m] of entries.slice(i, i + 10)) {
        const rec: Omit<AttendanceRecord, 'id'> = {
          classId: input.classId, className: input.className, teacherUid: input.teacherUid, studentId,
          guardianUids: m.guardianUids, date: input.date, status: m.status, markedAt: Date.now(),
          ...(m.note ? { note: m.note.slice(0, 200) } : {}),
        };
        batch.set(doc(db, 'attendance', recordId(input.classId, input.date, studentId)), rec);
      }
      await batch.commit();
    }
    return true;
  } catch (e) {
    console.warn('[attendance] save failed:', (e as Error)?.message);
    return false;
  }
}

/** A student's history as a given viewer is allowed to read it. */
export async function loadStudentAttendance(studentId: string, viewer: { role: 'teacher' | 'student' | 'guardian'; uid: string }): Promise<AttendanceRecord[]> {
  try {
    const q = viewer.role === 'teacher'
      ? query(collection(db, 'attendance'), where('teacherUid', '==', viewer.uid), where('studentId', '==', studentId), limit(400))
      : viewer.role === 'guardian'
        ? query(collection(db, 'attendance'), where('guardianUids', 'array-contains', viewer.uid), limit(800))
        : query(collection(db, 'attendance'), where('studentId', '==', studentId), limit(400));
    return toRecords(await getDocs(q)).filter(r => r.studentId === studentId);
  } catch (e) {
    console.warn('[attendance] history read failed:', (e as Error)?.message);
    return [];
  }
}

export interface AttendanceSummary {
  /** Days with at least one mark. */
  days: number;
  counts: Record<AttendanceStatus, number>;
  /** Share of marked days the student was in class (present or tardy), 0–100; null with no marks. */
  rate: number | null;
  /** One entry per school day, oldest first, the worst mark of the day when several classes marked it. */
  recent: Array<{ date: string; status: AttendanceStatus }>;
}

const SEVERITY: Record<AttendanceStatus, number> = { present: 0, excused: 1, tardy: 2, absent: 3 };

export function summarizeAttendance(records: AttendanceRecord[], recentDays = 20): AttendanceSummary {
  const byDay = new Map<string, AttendanceStatus>();
  for (const r of records) {
    const cur = byDay.get(r.date);
    if (!cur || SEVERITY[r.status] > SEVERITY[cur]) byDay.set(r.date, r.status);
  }
  const counts: Record<AttendanceStatus, number> = { present: 0, tardy: 0, absent: 0, excused: 0 };
  for (const s of byDay.values()) counts[s]++;
  const days = byDay.size;
  const recent = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-recentDays).map(([date, status]) => ({ date, status }));
  return { days, counts, rate: days ? Math.round(((counts.present + counts.tardy) / days) * 100) : null, recent };
}
