// newsroomReview — Student Newsroom stories reviewed through Plajah Academia assignments.
//
// A teacher assigns a School of Journalism template (its seed carries a newsroom kit, so the
// assignment gets `newsroomKitId`). The student drafts in the newsroom and turns the story in:
// that is an ordinary templateSubmissions doc with a frozen `newsroom` snapshot. The teacher
// reviews it from their own account in the lesson's grading panel and either
//   • approves it — the rubric grade credits the Learner Ledger (gradeSubmission) and `review`
//     records the decision with the teacher's uid, or
//   • requests changes — status 'returned' with a note; the student revises and turns in again
//     (a fresh submission, so each round is kept).
// The reporter's device watches its own submissions and applies decisions to the local story
// (studentDesk.applyTeacherReview). Firestore rules let only the teacher write `review`.

import { addDoc, collection, doc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { onSnapshot } from '../safeSnapshot';
import { createNotification } from '../backendService';
import {
  gradeSubmission, lessonLink, type RubricScores, type TemplateAssignment, type TemplateSubmission,
} from '../assignmentTemplateService';
import type { AssignmentTemplate } from '../../data/assignmentTemplates';
import { toSnapshot, type NewsroomReview, type NewsroomSnapshot, type StudentStory } from './studentDesk';

export type { NewsroomReview, NewsroomSnapshot };

/** School of Journalism assignments handed to this student, newest first. */
export async function listMyNewsroomAssignments(studentId: string): Promise<TemplateAssignment[]> {
  if (!studentId) return [];
  try {
    const snap = await getDocs(query(collection(db, 'templateAssignments'), where('studentIds', 'array-contains', studentId), limit(100)));
    return snap.docs
      .map(d => ({ ...(d.data() as Omit<TemplateAssignment, 'id'>), id: d.id }))
      .filter(a => !!a.newsroomKitId)
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) {
    console.warn('[newsroom] assignments read failed:', (e as Error)?.message);
    return [];
  }
}

/** Turn a story in to an assignment. Returns the submission id, or null on failure. */
export async function turnInStory(input: { story: StudentStory; assignment: TemplateAssignment; studentId: string; studentName: string }): Promise<string | null> {
  const { story, assignment, studentId, studentName } = input;
  try {
    const ref = await addDoc(collection(db, 'templateSubmissions'), {
      assignmentId: assignment.id,
      templateId: assignment.templateId,
      studentId,
      studentName,
      classId: assignment.classId,
      teacherUid: assignment.teacherUid,
      guardianUids: assignment.guardianUids || [],
      // The newsroom workflow replaces the checklist; every step counts as worked through.
      stepsDone: assignment.steps.map((_, i) => i),
      reflection: '',
      selfScores: {},
      submittedAt: Date.now(),
      status: 'submitted',
      grade: null,
      newsroom: toSnapshot(story),
      review: null,
    });
    await createNotification({
      userId: assignment.teacherUid, senderId: studentId, senderName: studentName, senderPhoto: '', type: 'CONTENT',
      title: `${studentName} turned in a story: ${story.headline || assignment.title}`,
      message: `${assignment.className} — ready for your editorial review.`,
      link: lessonLink(assignment.id), targetId: ref.id,
    }).catch(() => null);
    return ref.id;
  } catch (e) {
    console.warn('[newsroom] turn-in failed:', (e as Error)?.message);
    return null;
  }
}

/** Teacher: send the story back with a note. */
export async function requestStoryChanges(input: { submission: TemplateSubmission; note: string; teacher: { uid: string; name: string } }): Promise<boolean> {
  const { submission, note, teacher } = input;
  const review: NewsroomReview = { decision: 'changes', note: note.trim(), byUid: teacher.uid, byName: teacher.name, at: Date.now() };
  try {
    await updateDoc(doc(db, 'templateSubmissions', submission.id), { status: 'returned', review });
    await createNotification({
      userId: submission.studentId, senderId: teacher.uid, senderName: teacher.name, senderPhoto: '', type: 'CONTENT',
      title: 'Your editor sent your story back', message: review.note || 'Revise it in the Student Newsroom and turn it in again.',
      link: lessonLink(submission.assignmentId), targetId: submission.id,
    }).catch(() => null);
    return true;
  } catch (e) {
    console.warn('[newsroom] request changes failed:', (e as Error)?.message);
    return false;
  }
}

/** Teacher: approve for publication and grade against the rubric (credits the ledger). */
export async function approveStory(input: {
  submission: TemplateSubmission; template: AssignmentTemplate; scores: RubricScores; feedback: string; teacher: { uid: string; name: string };
}): Promise<{ ok: boolean; masteryPercent: number; standardsWritten: number }> {
  const { submission, template, scores, feedback, teacher } = input;
  const out = await gradeSubmission({ submission, template, scores, feedback, gradedBy: teacher.uid });
  if (!out.ok) return out;
  const review: NewsroomReview = { decision: 'approved', note: feedback.trim(), byUid: teacher.uid, byName: teacher.name, at: Date.now() };
  try { await updateDoc(doc(db, 'templateSubmissions', submission.id), { review }); }
  catch (e) { console.warn('[newsroom] approval record failed:', (e as Error)?.message); return { ...out, ok: false }; }
  return out;
}

/** Reporter: live view of their own newsroom submissions (single-field query, no index needed). */
export function watchMyNewsroomSubmissions(studentId: string, cb: (subs: TemplateSubmission[]) => void): () => void {
  if (!studentId) return () => {};
  return onSnapshot(
    query(collection(db, 'templateSubmissions'), where('studentId', '==', studentId), limit(200)),
    snap => cb(snap.docs.map(d => ({ ...(d.data() as Omit<TemplateSubmission, 'id'>), id: d.id })).filter(s => !!s.newsroom)),
    () => cb([]),
  );
}
