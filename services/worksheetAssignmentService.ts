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

import { collection, doc, addDoc, arrayUnion, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from './firebase';
import { createNotification, fetchUserProfiles } from './backendService';
import { unlockAchievementByTrigger } from './achievementService';
import { appendRecord } from './learningLedgerService';
import { autoGradeWorksheet, type DigitalWorksheet, type GradeResult } from './worksheetDigitizer';
import { readCompletedWorksheet } from './worksheetDigitizer';
import { preAssessWorksheet, buildTurnInBrief, type WorksheetPreAssessment, type TurnInBrief } from './worksheetGrading';
import { recordAssignmentQualityEvent } from './assignmentQualityService';

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
  /** Untouched camera/file original. Stored beside the digitized Tela form for audit/re-edit. */
  originalFile?: File;
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
export async function saveWorksheet(sheet: DigitalWorksheet, originalFile?: File): Promise<string | null> {
  try {
    const { id: _drop, ...rest } = sheet;
    const signedInUid = auth.currentUser?.uid;
    const worksheetRef = await addDoc(collection(db, 'digital_worksheets'), {
      ...rest,
      // Rules bind authorship to the signed-in teacher. Existing callers still provide createdBy,
      // but a stale demo identity must never become the owner of a production document.
      createdBy: signedInUid || rest.createdBy,
      status: 'published',
      savedAt: Date.now(),
    });
    if (originalFile && auth.currentUser) {
      try {
        const safe = originalFile.name.replace(/[^\w.\-]+/g, '_').slice(-64) || 'worksheet.jpg';
        const path = `users/${auth.currentUser.uid}/academia/worksheets/${worksheetRef.id}/original_${safe}`;
        const snap = await uploadBytes(ref(storage, path), originalFile, { contentType: originalFile.type || 'image/jpeg' });
        const originalImageUrl = await getDownloadURL(snap.ref);
        await updateDoc(worksheetRef, { originalImageUrl, originalStoragePath: path });
      } catch (uploadError) {
        console.warn('[worksheetAssignment] original scan upload failed; worksheet draft remains saved', uploadError);
      }
    }
    return worksheetRef.id;
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
  const { sheet, classId, className, students, teacher, dueDate, simulate, originalFile } = input;
  const result: WireResult = {
    ok: false, worksheetId: null, assignmentId: null,
    studentsNotified: 0, parentsNotified: 0,
    tutorAttached: true, autoGradeArmed: true, simulated: !!simulate,
  };

  // 1. Persist the worksheet (real even in demo — it's the teacher's own content).
  const worksheetId = await saveWorksheet({
    ...sheet,
    createdBy: auth.currentUser?.uid || teacher.uid,
    accessUids: Array.from(new Set([...(sheet.accessUids || []), ...students.map(student => student.id)])),
  }, originalFile);
  result.worksheetId = worksheetId;

  // 2. Assignment record — the class-scoped link that carries the tutor + auto-grade flags.
  if (worksheetId) {
    try {
      const assignedAt = Date.now();
      const ref = await addDoc(collection(db, 'worksheet_assignments'), {
        worksheetId, classId, className,
        teacherUid: teacher.uid,
        title: sheet.title, subject: sheet.subject, objective: sheet.objective,
        standardIds: sheet.standardIds,
        studentIds: students.map(s => s.id),
        dueDate: dueDate || null,
        tutorEnabled: true,     // attaches the in-worksheet Plajah tutor
        autoGrade: true,        // arms auto-grade on turn-in
        createdAt: assignedAt,
        qualitySummary: { totalEvents: 0, failureEvents: 0, totalFeedback: 0, ratingTotal: 0, updatedAt: assignedAt },
      });
      result.assignmentId = ref.id;
      if (!simulate) {
        await Promise.all(students.map(student => setDoc(doc(db, 'worksheet_submissions', `${worksheetId}_${student.id}`), {
          worksheetId, assignmentId: ref.id, studentId: student.id, studentName: student.name,
          status: 'assigned', assignedAt,
          timeline: arrayUnion({ status: 'ASSIGNED', at: assignedAt, actorId: teacher.uid, actorName: teacher.name }),
        }, { merge: true })));
      }
    } catch (e) {
      console.error('[worksheetAssignment] assignment record failed:', e);
      void recordAssignmentQualityEvent({ worksheetId, title: sheet.title, actorId: teacher.uid, actorName: teacher.name, actorRole: 'TEACHER', kind: 'SUBMISSION_FAILURE', severity: 'ERROR', source: 'publishWorksheet', message: e instanceof Error ? e.message : 'Assignment record failed', simulate });
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
    const guardianUids = Array.from(new Set(guardianMap.pairs.map(pair => pair.guardianUid)));
    // The assignment was already created so students could be notified immediately. Extend the
    // same access boundary to guardians before sending their deep links.
    if (guardianUids.length && worksheetId) {
      await updateDoc(doc(db, 'digital_worksheets', worksheetId), {
        accessUids: arrayUnion(...guardianUids),
      }).catch(error => console.warn('[worksheetAssignment] guardian worksheet access update failed', error));
      // A guardian may see only their own child's submission, never the whole class roster.
      for (const student of students) {
        const studentGuardianUids = guardianMap.pairs
          .filter(pair => pair.studentId === student.id)
          .map(pair => pair.guardianUid);
        if (studentGuardianUids.length) {
          await updateDoc(doc(db, 'worksheet_submissions', `${worksheetId}_${student.id}`), {
            guardianUids: arrayUnion(...studentGuardianUids),
          }).catch(error => console.warn('[worksheetAssignment] guardian submission access update failed', error));
        }
      }
    }
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
  assignmentId?: string;
  sheet: DigitalWorksheet;
  studentId: string;
  studentName: string;
  answers: Record<string, string>;
  teacher?: TeacherRef;
  simulate?: boolean;
  /** Optional untouched photo of a completed paper worksheet. */
  completedScanFile?: File;
}

export interface TurnInResult {
  grade: GradeResult;
  standardsRecorded: number;
  teacherNotified: boolean;
  audit: { studentId: string; studentName: string; submittedAt: number; turnedInAt: number; durationMs: number };
}

/**
 * Completed-paper pre-assessment: read a student's turned-in photo into the worksheet's fields and
 * produce the reviewable "how did they do" summary the teacher dashboard shows. Handwriting OCR is
 * best-effort — anything unreadable and every open-response field is routed to needs_review, and
 * ink-density still records that the work was DONE, so completion is accurate either way.
 */
export async function preAssessCompletedScan(
  sheet: DigitalWorksheet,
  imageBase64: string,
  mimeType: string,
  student: { id: string; name: string },
  options?: { handwriting?: 'auto' | 'require' | 'skip'; onProgress?: (message: string) => void; now?: number },
): Promise<WorksheetPreAssessment> {
  const reading = await readCompletedWorksheet(imageBase64, mimeType, sheet, options);
  return preAssessWorksheet(sheet, reading, student, options?.now ?? Date.now());
}

// The teacher's turn-in brief aggregates per-student pre-assessments for the dashboard.
export { buildTurnInBrief };
export type { WorksheetPreAssessment, TurnInBrief };

/** Mark the first real open once; repeated visits preserve the original start time. */
export async function markWorksheetOpened(input: {
  worksheetId: string; assignmentId?: string; studentId: string; studentName: string; assignedAt?: number; simulate?: boolean;
}): Promise<number> {
  const openedAt = Date.now();
  if (input.simulate) return openedAt;
  const submissionRef = doc(db, 'worksheet_submissions', `${input.worksheetId}_${input.studentId}`);
  try {
    const existing = await getDoc(submissionRef);
    const previous = existing.exists() ? existing.data() : {};
    if (typeof previous.openedAt === 'number') return previous.openedAt;
    await setDoc(submissionRef, {
      worksheetId: input.worksheetId, assignmentId: input.assignmentId || previous.assignmentId || null,
      studentId: input.studentId, studentName: input.studentName, status: 'opened',
      assignedAt: previous.assignedAt || input.assignedAt || null, openedAt,
      timeline: arrayUnion({ status: 'OPENED', at: openedAt, actorId: input.studentId, actorName: input.studentName }),
    }, { merge: true });
  } catch (error) {
    console.warn('[worksheetAssignment] open audit failed:', error);
    void recordAssignmentQualityEvent({ worksheetId: input.worksheetId, assignmentId: input.assignmentId, actorId: input.studentId, actorName: input.studentName, actorRole: 'STUDENT', kind: 'SUBMISSION_FAILURE', severity: 'WARNING', source: 'markWorksheetOpened', message: error instanceof Error ? error.message : 'Could not log assignment open' });
  }
  return openedAt;
}

/**
 * Student turns in a worksheet: persist answers, auto-grade, credit standards to the ledger, and
 * alert the teacher (needs-review when open-response fields exist).
 */
export async function turnInWorksheet(input: TurnInInput): Promise<TurnInResult> {
  const { worksheetId, assignmentId, sheet, studentId, studentName, answers, teacher, simulate, completedScanFile } = input;
  const submittedAt = Date.now();
  const grade = autoGradeWorksheet(sheet, answers);
  let standardsRecorded = 0;
  let teacherNotified = false;
  let openedAt = submittedAt;
  let turnedInAt = submittedAt;

  if (!simulate) {
    // 1. Persist the submission (one doc per student per worksheet).
    try {
      const submissionRef = doc(db, 'worksheet_submissions', `${worksheetId}_${studentId}`);
      const previous = await getDoc(submissionRef).catch(() => null);
      const previousData = previous?.exists() ? previous.data() : {};
      openedAt = typeof previousData.openedAt === 'number' ? previousData.openedAt : submittedAt;
      let completedScanUrl: string | null = null;
      let completedScanStoragePath: string | null = null;
      if (completedScanFile && auth.currentUser?.uid === studentId) {
        const safe = completedScanFile.name.replace(/[^\w.\-]+/g, '_').slice(-64) || 'completed.jpg';
        completedScanStoragePath = `users/${studentId}/academia/worksheet-submissions/${worksheetId}/${Date.now()}_${safe}`;
        const uploaded = await uploadBytes(ref(storage, completedScanStoragePath), completedScanFile, { contentType: completedScanFile.type || 'image/jpeg' });
        completedScanUrl = await getDownloadURL(uploaded.ref);
      }
      turnedInAt = Date.now();
      await setDoc(submissionRef, {
        worksheetId, assignmentId: assignmentId || previousData.assignmentId || null, studentId, studentName, answers,
        score: grade.score, maxScore: grade.maxScore, percent: grade.percent,
        needsManualReview: grade.needsManualReview,
        status: 'turned-in', submittedAt, turnedInAt, gradedAt: turnedInAt,
        openedAt, durationMs: Math.max(0, submittedAt - openedAt), submittedBy: { id: studentId, name: studentName },
        timeline: arrayUnion(
          { status: 'SUBMITTED', at: submittedAt, actorId: studentId, actorName: studentName },
          { status: 'TURNED_IN', at: turnedInAt, actorId: studentId, actorName: studentName },
        ),
        completedScanUrl, completedScanStoragePath,
      }, { merge: true });
    } catch (e) {
      console.error('[worksheetAssignment] submission persist failed:', e);
      void recordAssignmentQualityEvent({ worksheetId, assignmentId, title: sheet.title, actorId: studentId, actorName: studentName, actorRole: 'STUDENT', kind: 'SUBMISSION_FAILURE', severity: 'ERROR', source: 'turnInWorksheet', message: e instanceof Error ? e.message : 'Submission persist failed' });
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

  return { grade, standardsRecorded, teacherNotified, audit: { studentId, studentName, submittedAt, turnedInAt, durationMs: Math.max(0, submittedAt - openedAt) } };
}

// ── internals ───────────────────────────────────────────────────────────────────────

/** Resolve each student's guardian uids from their profiles. In simulate mode, estimate (~1/student). */
async function resolveGuardians(
  students: RosterStudent[],
  simulate?: boolean,
): Promise<{ pairs: { guardianUid: string; studentId: string; childName: string }[]; estimated: number }> {
  if (simulate) return { pairs: [], estimated: students.length };
  try {
    const profiles = await fetchUserProfiles(students.map(s => s.id));
    const byId = new Map(profiles.map(p => [(p as any).uid, p]));
    const pairs: { guardianUid: string; studentId: string; childName: string }[] = [];
    const seen = new Set<string>();
    for (const st of students) {
      const p: any = byId.get(st.id);
      if (!p) continue;
      const guardians: string[] = [p.guardianUid, ...(p.coGuardianUids || [])].filter(Boolean);
      for (const g of guardians) {
        const key = `${g}|${st.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push({ guardianUid: g, studentId: st.id, childName: st.name.split(' ')[0] });
      }
    }
    return { pairs, estimated: pairs.length };
  } catch {
    return { pairs: [], estimated: 0 };
  }
}
