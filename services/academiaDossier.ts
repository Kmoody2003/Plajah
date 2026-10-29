/**
 * Student Dossier — everything a teacher's own records say about one student, in one read.
 * Strictly classroom-scoped like the rest of the teacher lens: only this teacher's assignments and
 * submissions, the student's Learner Ledger, and DM threads the teacher is already part of.
 * Ora check-ins are never read here (they belong to the student; see WellbeingPanel).
 * Every loader is failure-tolerant — a rules denial or a missing doc is just "nothing yet".
 */
import { getDocs, collection, query, where, limit, orderBy } from 'firebase/firestore';
import { db, opsDb } from './firebase';
import { fetchUserProfiles, fetchChatRooms } from './backendService';
import { loadProficiency, loadRecords, globalBenchmark, type LearningRecord } from './learningLedgerService';
import { loadLearnerStats, type LearnerStats } from './academiaStats';
import { standardById, type Subject } from '../data/educationStandards';
import { fetchStudentDueWork, fetchAssignment, type DueItem, type TemplateAssignment, type TemplateSubmission } from './assignmentTemplateService';

export interface RosterStudent {
  uid: string;
  name: string;
  photo?: string;
  username?: string;
  guardianUid?: string;
  /** Every linked grown-up (guardianUid + coGuardianUids) — attendance rows are shared with all of them. */
  guardianUids: string[];
  classIds: string[];
  classTitles: string[];
}

/** Every student enrolled in the teacher's classes, with names. One profile read per student. */
export async function loadTeacherRoster(classes: Array<{ id: string; title?: string; name?: string; enrolledStudents?: string[] }>): Promise<RosterStudent[]> {
  const byUid = new Map<string, RosterStudent>();
  for (const c of classes) {
    for (const s of c.enrolledStudents || []) {
      const row = byUid.get(s) || { uid: s, name: '', guardianUids: [], classIds: [], classTitles: [] };
      row.classIds.push(c.id); row.classTitles.push(c.title || c.name || 'Class');
      byUid.set(s, row);
    }
  }
  const uids = [...byUid.keys()].slice(0, 300);
  const profiles = await fetchUserProfiles(uids).catch(() => [] as any[]);
  for (const p of profiles || []) {
    if (!p?.uid) continue;
    const row = byUid.get(p.uid); if (!row) continue;
    row.name = (p as any).displayName || (p as any).username || '';
    row.photo = (p as any).photoURL || undefined;
    row.username = (p as any).username || undefined;
    row.guardianUid = (p as any).guardianUid || undefined;
    row.guardianUids = [...new Set([(p as any).guardianUid, ...((p as any).coGuardianUids || [])].filter(Boolean))] as string[];
  }
  return [...byUid.values()].map(r => ({ ...r, name: r.name || 'Student' })).sort((a, b) => a.name.localeCompare(b.name));
}

export type WorkStatus = 'on-time' | 'late' | 'missing' | 'to-grade' | 'due';
export interface DossierWork { id: string; title: string; subject: string; className: string; due: number | null; status: WorkStatus; score: number | null; at: number }
export interface DossierMessage { roomId: string; with: 'student' | 'guardian'; who: string; text: string; at: number; mine: boolean }

export interface StudentDossier {
  student: RosterStudent;
  /** Mean rubric mastery across graded work, null until something is graded. */
  gradePct: number | null;
  /** Last graded scores in order, oldest first (for the trend line). */
  trend: Array<{ at: number; pct: number }>;
  /** Class-wide mean of the same teacher's graded work, for the comparison line. */
  classAvg: number | null;
  counts: { assigned: number; turnedIn: number; late: number; missing: number; toGrade: number; due: number };
  work: DossierWork[];
  /** Ledger mastery averaged per subject. */
  subjects: Array<{ subject: Subject; label: string; pct: number; standards: number }>;
  ledgerOverall: number | null;
  recentEvidence: LearningRecord[];
  apps: LearnerStats | null;
  messages: DossierMessage[];
}

const SUBJECT_LABEL: Record<string, string> = {
  ELA: 'Reading & writing', MATH: 'Math', SCIENCE: 'Science', SOCIAL: 'History & social studies', LANGUAGE: 'Languages',
  ARTS: 'Arts', CS: 'Computer science', FINLIT: 'Money', ECON: 'Economics', CIVICS: 'Civics', PHILOSOPHY: 'Philosophy', REALESTATE: 'Real estate',
};
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function loadStudentDossier(teacherUid: string, student: RosterStudent, me?: string): Promise<StudentDossier> {
  const [subsAll, asgAll, prof, records, apps, rooms] = await Promise.all([
    getDocs(query(collection(opsDb, 'templateSubmissions'), where('teacherUid', '==', teacherUid), limit(500)))
      .then(s => s.docs.map(d => ({ ...(d.data() as any), id: d.id } as TemplateSubmission))).catch(() => [] as TemplateSubmission[]),
    getDocs(query(collection(opsDb, 'templateAssignments'), where('teacherUid', '==', teacherUid), limit(300)))
      .then(s => s.docs.map(d => ({ ...(d.data() as any), id: d.id } as TemplateAssignment))).catch(() => [] as TemplateAssignment[]),
    loadProficiency(student.uid).catch(() => null),
    loadRecords(student.uid, 12).catch(() => [] as LearningRecord[]),
    loadLearnerStats(student.uid).catch(() => null),
    fetchChatRooms().catch(() => [] as any[]),
  ]);

  const now = Date.now();
  const subs = subsAll.filter(s => s.studentId === student.uid);
  const assigned = asgAll.filter(a => (a.studentIds || []).includes(student.uid));
  const subByAsg = new Map(subs.map(s => [s.assignmentId, s]));
  const work: DossierWork[] = assigned.map(a => {
    const s = subByAsg.get(a.id);
    let status: WorkStatus;
    if (!s) status = a.dueDate && a.dueDate < now ? 'missing' : 'due';
    else if (s.status !== 'graded') status = 'to-grade';
    else status = a.dueDate && s.submittedAt > a.dueDate ? 'late' : 'on-time';
    return { id: a.id, title: a.title, subject: a.subject, className: a.className, due: a.dueDate ?? null, status, score: s?.grade ? s.grade.masteryPercent : null, at: s?.submittedAt || a.dueDate || a.createdAt };
  }).sort((x, y) => y.at - x.at);

  const graded = subs.filter(s => s.status === 'graded' && s.grade).sort((a, b) => a.grade!.gradedAt - b.grade!.gradedAt);
  const classGraded = subsAll.filter(s => s.status === 'graded' && s.grade && student.classIds.includes(s.classId));

  const bySubject = new Map<string, number[]>();
  for (const [id, v] of Object.entries((prof?.byStandard || {}) as Record<string, number>)) {
    const subj = standardById(id)?.subject || 'OTHER';
    bySubject.set(subj, [...(bySubject.get(subj) || []), v]);
  }

  const studentRooms = (rooms || []).filter((r: any) => r?.type === 'PRIVATE' && Array.isArray(r.participants)
    && (r.participants.includes(student.uid) || (student.guardianUid && r.participants.includes(student.guardianUid))));
  const messages: DossierMessage[] = (await Promise.all(studentRooms.slice(0, 3).map(async (r: any) => {
    try {
      const snap = await getDocs(query(collection(db, 'chat_rooms', r.id, 'messages'), orderBy('timestamp', 'desc'), limit(4)));
      const withWho: DossierMessage['with'] = r.participants.includes(student.uid) ? 'student' : 'guardian';
      return snap.docs.map(d => {
        const m = d.data() as any;
        const ts = typeof m.timestamp === 'number' ? m.timestamp : m.timestamp?.toMillis?.() || 0;
        return { roomId: r.id, with: withWho, who: m.senderName || (withWho === 'student' ? student.name : 'Parent'), text: typeof m.text === 'string' ? m.text : (m.voiceUrl ? 'Voice note' : 'Attachment'), at: ts, mine: !!me && m.senderId === me };
      });
    } catch { return [] as DossierMessage[]; }
  }))).flat().sort((a, b) => b.at - a.at).slice(0, 6);

  const counts = {
    assigned: work.length,
    turnedIn: work.filter(w => w.status === 'on-time' || w.status === 'late' || w.status === 'to-grade').length,
    late: work.filter(w => w.status === 'late').length,
    missing: work.filter(w => w.status === 'missing').length,
    toGrade: work.filter(w => w.status === 'to-grade').length,
    due: work.filter(w => w.status === 'due').length,
  };

  return {
    student,
    gradePct: mean(graded.map(s => s.grade!.masteryPercent)),
    trend: graded.slice(-8).map(s => ({ at: s.grade!.gradedAt, pct: s.grade!.masteryPercent })),
    classAvg: mean(classGraded.map(s => s.grade!.masteryPercent)),
    counts,
    work: work.slice(0, 10),
    subjects: [...bySubject.entries()].filter(([k]) => k !== 'OTHER')
      .map(([k, v]) => ({ subject: k as Subject, label: SUBJECT_LABEL[k] || k, pct: mean(v) || 0, standards: v.length }))
      .sort((a, b) => b.standards - a.standards).slice(0, 6),
    ledgerOverall: prof && Object.keys(prof.byStandard).length ? globalBenchmark(prof).overall : null,
    recentEvidence: records.slice(0, 5),
    apps,
    messages,
  };
}

export interface LedgerRow { id: string; title: string; className: string; subject: string; due: number | null; status: WorkStatus; score: number | null }
export interface StudentScoreboard { gradePct: number | null; turnedIn: number; missing: number; graded: number; rows: LedgerRow[] }

/** The student's own view: what's due, what's handed in and how it was graded. */
export async function loadStudentScoreboard(uid: string): Promise<StudentScoreboard> {
  const [due, subs] = await Promise.all([
    fetchStudentDueWork(uid, 20).catch(() => [] as DueItem[]),
    getDocs(query(collection(opsDb, 'templateSubmissions'), where('studentId', '==', uid), limit(60)))
      .then(s => s.docs.map(d => ({ ...(d.data() as any), id: d.id } as TemplateSubmission))).catch(() => [] as TemplateSubmission[]),
  ]);
  const recent = [...subs].sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 8);
  const asg = await Promise.all(recent.map(s => fetchAssignment(s.assignmentId).catch(() => null)));
  const handed: LedgerRow[] = recent.map((s, i) => {
    const a = asg[i];
    const status: WorkStatus = s.status !== 'graded' ? 'to-grade' : a?.dueDate && s.submittedAt > a.dueDate ? 'late' : 'on-time';
    return { id: s.id, title: a?.title || 'Assignment', className: a?.className || '', subject: a?.subject || '', due: a?.dueDate ?? null, status, score: s.grade ? s.grade.masteryPercent : null };
  });
  const open: LedgerRow[] = due.map(d => ({ id: d.assignmentId, title: d.title, className: d.className, subject: d.subject, due: d.dueDate, status: d.overdue ? 'missing' : 'due', score: null }));
  const graded = subs.filter(s => s.status === 'graded' && s.grade);
  return {
    gradePct: mean(graded.map(s => s.grade!.masteryPercent)),
    turnedIn: subs.length, missing: due.filter(d => d.overdue).length, graded: graded.length,
    rows: [...open, ...handed],
  };
}

/** US-style letter for a 0–100 mastery score, for the "current grade" tile. */
export function letterFor(pct: number): string {
  if (pct >= 97) return 'A+'; if (pct >= 93) return 'A'; if (pct >= 90) return 'A−';
  if (pct >= 87) return 'B+'; if (pct >= 83) return 'B'; if (pct >= 80) return 'B−';
  if (pct >= 77) return 'C+'; if (pct >= 73) return 'C'; if (pct >= 70) return 'C−';
  if (pct >= 60) return 'D'; return 'F';
}

/** Shared color scale for scores across the dossier, scoreboards and parent snapshot. */
export function scoreTone(pct: number | null): string {
  if (pct == null) return '#94A3B8';
  return pct >= 88 ? '#06D6A0' : pct >= 78 ? '#00DAF3' : pct >= 70 ? '#F5B83D' : '#ff8aa3';
}
