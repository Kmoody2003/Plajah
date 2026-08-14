// worksheetAssignmentService — the "auto-wire" glue behind one-tap authoring.
//
// Turns a digitized DigitalWorksheet into a live assignment with zero further teacher effort:
//   publishWorksheet()  → persist the worksheet + an assignment record, notify every student that
//                         homework is available, and CC each student's guardians with a copy
//                         (createNotification fires the in-app notification AND the push).
//   turnInWorksheet()   → persist the student's answers, auto-grade against the key, write standard
//                         mastery into the Learner Ledger, and notify the teacher (+ parents) it's in.
//
// Wiring seams are all real, existing services — nothing new invented:
//   · createNotification / fetchUserProfiles  (backendService)  — notify + resolve guardians
//   · appendRecord                            (learningLedger)  — the knowledge-graph substrate
//   · autoGradeWorksheet                      (worksheetDigitizer)
// Firestore is written directly, matching learningLedgerService's standalone-service pattern.
//
// simulate:true computes the fan-out counts WITHOUT writing notifications — used by the demo class
// (whose roster isn't real accounts) so the UI can show the wire result honestly without spraying
// notification docs at placeholder uids. Real classrooms pass simulate:false.

import { collection, doc, addDoc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { createNotification, fetchUserProfiles } from './backendService';
import { unlockAchievementByTrigger } from './achievementService';
import { appendRecord } from './learningLedgerService';
import { autoGradeWorksheet, type DigitalWorksheet, type GradeResult } from './worksheetDigitizer';

export interface RosterStudent { id: string; name: string }
export interface TeacherRef { uid: string; name: string; photo?: string }

export interface PublishInput {
  sheet: DigitalWorksheet;
  classId: string;
  className: string;
  students: RosterStudent[];
  teacher: TeacherRef;
  dueDate?: number;
  /** true ⇒ compute counts but write no notifications (demo / preview). */
  simulate?: boolean;
}

export interface WireResult {
  ok: boolean;
  worksheetId: string | null;
  assignmentId: string | null;
  studentsNotified: number;
  parentsNotified: number;
  tutorAttached: boolean;
  autoGradeArmed: boolean;
  simulated: boolean;
}

// ── Persist the worksheet ─────────────────────────────────────────────────────────

/** The deep-link a student/parent notification opens to land directly on this assignment. */
export const assignmentLink = (worksheetId: string) => `?view=assignment&id=${worksheetId}`;

/** Load a persisted DigitalWorksheet by id (for the assignment deep-link). Null if missing/failed. */
export async function fetchWorksheet(id: string): Promise<DigitalWorksheet | null> {
  try {
    const snap = await getDoc(doc(db, 'digital_worksheets', id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<DigitalWorksheet, 'id'>) };
  } catch (e) {
    console.error('[worksheetAssignment] fetchWorksheet failed:', e);
    return null;
  }
}

/** Save a DigitalWorksheet to Firestore. Returns the new id, or null on failure (non-fatal). */
export async function saveWorksheet(sheet: DigitalWorksheet): Promise<string | null> {
  try {
    const { id: _drop, ...rest } = sheet;
    const ref = await addDoc(collection(db, 'digital_worksheets'), {
      ...rest,
      status: 'published',
      savedAt: Date.now(),
    });
    return ref.id;
  } catch (e) {
    console.error('[worksheetAssignment] saveWorksheet failed:', e);
    return null;
  }
}

// ── Publish + auto-wire ───────────────────────────────────────────────────────────

/**
 * Publish a digitized worksheet to a class: persist it, create the assignment record, notify every
 * student, and CC their guardians with a copy. All notification fan-out honors simulate.
 */
export async function publishWorksheet(input: PublishInput): Promise<WireResult> {
  const { sheet, classId, className, students, teacher, dueDate, simulate } = input;
  const result: WireResult = {
    ok: false, worksheetId: null, assignmentId: null,
    studentsNotified: 0, parentsNotified: 0,
    tutorAttached: true, autoGradeArmed: true, simulated: !!simulate,
  };

  // 1. Persist the worksheet (real even in demo — it's the teacher's own content).
  const worksheetId = await saveWorksheet(sheet);
  result.worksheetId = worksheetId;

  // 2. Assignment record — the class-scoped link that carries the tutor + auto-grade flags.
  if (worksheetId) {
    try {
      const ref = await addDoc(collection(db, 'worksheet_assignments'), {
        worksheetId, classId, className,
        teacherUid: teacher.uid,
        title: sheet.title, subject: sheet.subject, objective: sheet.objective,
        standardIds: sheet.standardIds,
        studentIds: students.map(s => s.id),
        dueDate: dueDate || null,
        tutorEnabled: true,     // attaches the in-worksheet Plajah tutor
        autoGrade: true,        // arms auto-grade on turn-in
        createdAt: Date.now(),
      });
      result.assignmentId = ref.id;
    } catch (e) {
      console.error('[worksheetAssignment] assignment record failed:', e);
    }
  }

  const link = worksheetId ? assignmentLink(worksheetId) : undefined;

  // 3. Notify students that homework is available.
  if (simulate) {
    result.studentsNotified = students.length;
  } else {
    for (const st of students) {
      const id = await createNotification({
        userId: st.id,
        senderId: teacher.uid, senderName: teacher.name, senderPhoto: teacher.photo || '',
        type: 'CONTENT',
        title: `New homework: ${sheet.title}`,
        message: `${sheet.subject}${dueDate ? ` · due ${new Date(dueDate).toLocaleDateString()}` : ''} — tap to start. Plajah can help.`,
        link, targetId: worksheetId || classId,
      }).catch(() => null);
      if (id) result.studentsNotified++;
    }
  }

  // 4. CC guardians with a copy + "homework available" alert.
  const guardianMap = await resolveGuardians(students, simulate);
  if (simulate) {
    result.parentsNotified = guardianMap.estimated;
  } else {
    for (const { guardianUid, childName } of guardianMap.pairs) {
      const id = await createNotification({
        userId: guardianUid,
        senderId: teacher.uid, senderName: teacher.name, senderPhoto: teacher.photo || '',
        type: 'CONTENT',
        title: `Homework assigned to ${childName}`,
        message: `${className}: ${sheet.title} (${sheet.subject}). You'll see progress as ${childName} works.`,
        link, targetId: worksheetId || classId,
      }).catch(() => null);
      if (id) result.parentsNotified++;
    }
  }

  result.ok = !!worksheetId;
  return result;
}

// ── Turn-in + auto-grade + ledger ──────────────────────────────────────────────────

export interface TurnInInput {
  worksheetId: string;
  sheet: DigitalWorksheet;
  studentId: string;
  studentName: string;
  answers: Record<string, string>;
  teacher?: TeacherRef;
  simulate?: boolean;
}

export interface TurnInResult {
  grade: GradeResult;
  standardsRecorded: number;
  teacherNotified: boolean;
}

/**
 * Student turns in a worksheet: persist answers, auto-grade, credit standards to the ledger, and
 * alert the teacher (needs-review when open-response fields exist).
 */
export async function turnInWorksheet(input: TurnInInput): Promise<TurnInResult> {
  const { worksheetId, sheet, studentId, studentName, answers, teacher, simulate } = input;
  const grade = autoGradeWorksheet(sheet, answers);
  let standardsRecorded = 0;
  let teacherNotified = false;

  if (!simulate) {
    // 1. Persist the submission (one doc per student per worksheet).
    try {
      await setDoc(doc(db, 'worksheet_submissions', `${worksheetId}_${studentId}`), {
        worksheetId, studentId, studentName, answers,
        score: grade.score, maxScore: grade.maxScore, percent: grade.percent,
        needsManualReview: grade.needsManualReview,
        status: 'turned-in', gradedAt: Date.now(),
      }, { merge: true });
    } catch (e) {
      console.error('[worksheetAssignment] submission persist failed:', e);
    }

    // 2. Credit each evidenced standard to the Learner Ledger (the decoupled knowledge graph).
    const framework = sheet.framework || 'CCSS_MATH';
    for (const [standardId, ratio] of Object.entries(grade.standardScores)) {
      const mastery = Math.round(ratio * 100);
      const rec = await appendRecord({
        studentId, standardId, framework,
        source: 'school-lesson',
        masteryBefore: mastery, masteryAfter: mastery,
        byUid: teacher?.uid, evidence: `worksheet:${worksheetId}`,
      }).catch(() => null);
      if (rec) standardsRecorded++;
    }

    // Platform achievements for the student (idempotent).
    unlockAchievementByTrigger(studentId, 'WORKSHEET_TURNED_IN').catch(() => {});
    if (grade.percent === 100 && grade.maxScore > 0) unlockAchievementByTrigger(studentId, 'WORKSHEET_PERFECT').catch(() => {});

    // 3. Notify the teacher it's in (flag review when manual fields exist).
    if (teacher?.uid) {
      const id = await createNotification({
        userId: teacher.uid,
        senderId: studentId, senderName: studentName, senderPhoto: '',
        type: 'CONTENT',
        title: `${studentName} turned in ${sheet.title}`,
        message: grade.needsManualReview
          ? `Auto-graded ${grade.percent}% — some open-response answers need your review.`
          : `Auto-graded ${grade.percent}%. Tap to review.`,
        link: assignmentLink(worksheetId), targetId: worksheetId,
      }).catch(() => null);
      teacherNotified = !!id;
    }
  } else {
    standardsRecorded = Object.keys(grade.standardScores).length;
  }

  return { grade, standardsRecorded, teacherNotified };
}

// ── internals ───────────────────────────────────────────────────────────────────────

/** Resolve each student's guardian uids from their profiles. In simulate mode, estimate (~1/student). */
async function resolveGuardians(
  students: RosterStudent[],
  simulate?: boolean,
): Promise<{ pairs: { guardianUid: string; childName: string }[]; estimated: number }> {
  if (simulate) return { pairs: [], estimated: students.length };
  try {
    const profiles = await fetchUserProfiles(students.map(s => s.id));
    const byId = new Map(profiles.map(p => [(p as any).uid, p]));
    const pairs: { guardianUid: string; childName: string }[] = [];
    const seen = new Set<string>();
    for (const st of students) {
      const p: any = byId.get(st.id);
      if (!p) continue;
      const guardians: string[] = [p.guardianUid, ...(p.coGuardianUids || [])].filter(Boolean);
      for (const g of guardians) {
        const key = `${g}|${st.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ guardianUid: g, childName: st.name.split(' ')[0] });
      }
    }
    return { pairs, estimated: pairs.length };
  } catch {
    return { pairs: [], estimated: 0 };
  }
}
