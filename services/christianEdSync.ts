// christianEdSync — Firestore mirror for Christian Education desk work.
// The Student Desk keeps assignments and answers in localStorage so it stays fast and offline-safe.
// This mirrors the Christian Ed slice into the ops database so the loop crosses devices:
//   churchEduAssignments/{assignmentId}             teacher → class (programId)
//   churchEduSubmissions/{assignmentId}__{uid}      student → teacher, teacher feedback → student
//   churchEduJoinRequests/{programId}__{uid}        student asks to join with a class code
// Every call is best-effort: a failed write never blocks the local desk.
import { opsDb, auth } from './firebase';
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import type { UniversalDeskAssignment, StudentDeskWorkspaceState } from './universalStudentDeskService';

const strip = <T,>(o: T): T => JSON.parse(JSON.stringify(o));

export interface EduSubmissionRecord {
  id: string;
  orgId: string;
  programId: string;
  assignmentId: string;
  assignmentTitle: string;
  studentUid: string;
  studentName: string;
  status: StudentDeskWorkspaceState['status'];
  answers: Record<string, string>;
  /** Auto-grade summary from the desk turn-in. */
  earnedPoints: number;
  totalPoints: number;
  percentage: number;
  questionScores: Record<string, { correct: boolean; earnedPoints: number; maxPoints: number }>;
  /** Teacher review: per-question verdicts on written answers and a note back to the student. */
  reviewVerdicts?: Record<string, 'CORRECT' | 'PARTIAL' | 'RETRY'>;
  teacherFeedbackNote?: string;
  reviewedByUid?: string;
  reviewedAt?: number;
  turnedInAt: number;
  updatedAt: number;
}

export interface EduJoinRequest {
  id: string;
  orgId: string;
  programId: string;
  uid: string;
  name: string;
  code: string;
  createdAt: number;
}

/** Drop the bulky raw source text before mirroring (keeps docs well under the 1 MB limit). */
function slimAssignment(a: UniversalDeskAssignment, programId: string) {
  const { rawCurriculumText: _r, rawAnswerKeyText: _k, sacredLibrarySupplements: _s, ...unit } = a.unitSnapshot;
  return strip({ ...a, unitSnapshot: unit, programId, mirroredAt: Date.now() });
}

export async function mirrorAssignment(a: UniversalDeskAssignment): Promise<void> {
  if (a.domain !== 'CHRISTIAN_EDUCATION' || !auth.currentUser) return;
  try {
    await setDoc(doc(opsDb, 'churchEduAssignments', a.id), slimAssignment(a, a.classroomId));
  } catch {
    /* not a class teacher, offline, or demo org: the local desk still has it */
  }
}

export async function unmirrorAssignment(assignmentId: string): Promise<void> {
  try {
    await deleteDoc(doc(opsDb, 'churchEduAssignments', assignmentId));
  } catch {
    /* ignore */
  }
}

export async function fetchProgramAssignments(programId: string): Promise<UniversalDeskAssignment[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, 'churchEduAssignments'), where('classroomId', '==', programId)));
    return snap.docs.map(d => d.data() as UniversalDeskAssignment);
  } catch {
    return [];
  }
}

export const submissionId = (assignmentId: string, uid: string) => `${assignmentId}__${uid}`;

export async function mirrorTurnIn(a: UniversalDeskAssignment, ws: StudentDeskWorkspaceState): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (a.domain !== 'CHRISTIAN_EDUCATION' || !uid || uid !== ws.studentUid || !ws.submission) return;
  const s = ws.submission;
  const rec: EduSubmissionRecord = {
    id: submissionId(a.id, uid),
    orgId: a.orgId,
    programId: a.classroomId,
    assignmentId: a.id,
    assignmentTitle: a.title,
    studentUid: uid,
    studentName: ws.studentName,
    status: 'TURNED_IN',
    answers: ws.answers,
    earnedPoints: s.earnedPoints,
    totalPoints: s.totalPoints,
    percentage: s.percentage,
    questionScores: Object.fromEntries(
      Object.entries(s.questionScores).map(([k, v]) => [k, { correct: v.correct, earnedPoints: v.earnedPoints, maxPoints: v.maxPoints }])
    ),
    turnedInAt: ws.turnedInAt || Date.now(),
    updatedAt: Date.now(),
  };
  try {
    await setDoc(doc(opsDb, 'churchEduSubmissions', rec.id), strip(rec));
  } catch {
    /* not on the roster yet, or offline */
  }
}

export async function fetchProgramSubmissions(programId: string): Promise<EduSubmissionRecord[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, 'churchEduSubmissions'), where('programId', '==', programId)));
    return snap.docs.map(d => d.data() as EduSubmissionRecord);
  } catch {
    return [];
  }
}

export async function fetchMySubmissions(uid: string): Promise<EduSubmissionRecord[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, 'churchEduSubmissions'), where('studentUid', '==', uid)));
    return snap.docs.map(d => d.data() as EduSubmissionRecord);
  } catch {
    return [];
  }
}

/** Teacher returns reviewed work. Only review fields change; the student's answers stay as turned in. */
export async function returnSubmission(
  rec: EduSubmissionRecord,
  review: { verdicts: Record<string, 'CORRECT' | 'PARTIAL' | 'RETRY'>; note: string; earnedPoints: number; percentage: number }
): Promise<EduSubmissionRecord> {
  const next: EduSubmissionRecord = {
    ...rec,
    status: 'RETURNED_WITH_FEEDBACK',
    reviewVerdicts: review.verdicts,
    teacherFeedbackNote: review.note.trim() || undefined,
    earnedPoints: review.earnedPoints,
    percentage: review.percentage,
    reviewedByUid: auth.currentUser?.uid,
    reviewedAt: Date.now(),
    updatedAt: Date.now(),
  };
  await updateDoc(
    doc(opsDb, 'churchEduSubmissions', rec.id),
    strip({
      status: next.status,
      reviewVerdicts: next.reviewVerdicts,
      teacherFeedbackNote: next.teacherFeedbackNote ?? '',
      earnedPoints: next.earnedPoints,
      percentage: next.percentage,
      reviewedByUid: next.reviewedByUid,
      reviewedAt: next.reviewedAt,
      updatedAt: next.updatedAt,
    })
  );
  return next;
}

// ── Join with a class code ────────────────────────────────────────────────────
export async function requestToJoin(r: Omit<EduJoinRequest, 'id' | 'createdAt'>): Promise<void> {
  const id = `${r.programId}__${r.uid}`;
  await setDoc(doc(opsDb, 'churchEduJoinRequests', id), strip({ ...r, id, createdAt: Date.now() }));
}

export async function fetchJoinRequests(programId: string): Promise<EduJoinRequest[]> {
  try {
    const snap = await getDocs(query(collection(opsDb, 'churchEduJoinRequests'), where('programId', '==', programId)));
    return snap.docs.map(d => d.data() as EduJoinRequest);
  } catch {
    return [];
  }
}

export async function clearJoinRequest(id: string): Promise<void> {
  try {
    await deleteDoc(doc(opsDb, 'churchEduJoinRequests', id));
  } catch {
    /* ignore */
  }
}
