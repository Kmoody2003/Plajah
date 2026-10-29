// Shared data helpers for the Christian Ed hub, class clubs and review queue.
import { useCallback, useEffect, useState } from 'react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedQuestion } from '../../../services/curriculumIngestionService';
import {
  listDeskAssignments,
  mergeRemoteDeskAssignments,
  applyMyDrafts,
  applyReturnedSubmissions,
  isOpenFor,
  deskStamp,
  type UniversalDeskAssignment,
} from '../../../services/universalStudentDeskService';
import { auth } from '../../../services/firebase';
import {
  fetchProgramAssignments,
  fetchProgramAnswerKeys,
  mirrorAssignment,
  withAnswerKeys,
  fetchProgramSubmissions,
  fetchMySubmissions,
  fetchJoinRequests,
  type EduSubmissionRecord,
  type EduJoinRequest,
} from '../../../services/christianEdSync';

export const WRITTEN_TYPES: IngestedQuestion['type'][] = ['short-answer', 'essay', 'scripture-reflection'];
export const isWritten = (q: IngestedQuestion) => WRITTEN_TYPES.includes(q.type) || !q.correctAnswer;

export function isTeacherOf(p: ChurchProgram, uid: string, canEdit: boolean): boolean {
  if (canEdit) return true;
  if (!uid) return false;
  return p.createdBy === uid || (p.teacherUids || []).includes(uid) || (p.assignedTeam || []).some(t => t.uid === uid);
}
export const isStudentOf = (p: ChurchProgram, uid: string) => !!uid && (p.students || []).some(s => s.uid === uid);

/** Turned in, and has at least one written answer a teacher must read. Auto-graded-only work is done on turn-in. */
export function needsReview(sub: EduSubmissionRecord, a?: UniversalDeskAssignment): boolean {
  if (sub.status !== 'TURNED_IN') return false;
  if (!a) return true;
  // Students never hold the answer key, so a score their device sends for a keyed question can't be
  // trusted: anything with written or keyed questions waits for the teacher, whatever the turn-in claims.
  return a.unitSnapshot.questions.some(q => isWritten(q) || !!q.correctAnswer) || Object.values(sub.questionScores || {}).some(s => s.pending);
}

export function currentWeekIndex(p: ChurchProgram): number {
  if (p.weeks.length === 0) return -1;
  return Math.min(Math.max(p.currentWeek ?? 0, 0), p.weeks.length - 1);
}

// Class meeting days live with the course calendar helpers; re-exported for the hub's existing imports.
export { scheduleWeekday, nextWeekday } from '../../../services/edu/courseSchedule';

export const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export interface ClassWork {
  assignments: UniversalDeskAssignment[];
  submissions: EduSubmissionRecord[];
  joinRequests: EduJoinRequest[];
}

/**
 * Loads desk work for a set of classes: local desk assignments merged with the Firestore mirror,
 * plus mirrored submissions (teacher side) and join requests. Refreshes on desk updates.
 */
export function useClassWork(programs: ChurchProgram[], opts: { asTeacher: boolean }) {
  const [work, setWork] = useState<Record<string, ClassWork>>({});
  const [loading, setLoading] = useState(false);
  const ids = programs.map(p => p.id).join('|');

  const refresh = useCallback(async () => {
    if (programs.length === 0) {
      setWork({});
      return;
    }
    setLoading(true);
    const entries = await Promise.all(
      programs.map(async p => {
        const [remoteRaw, keys, subs, reqs] = await Promise.all([
          fetchProgramAssignments(p.id),
          opts.asTeacher ? fetchProgramAnswerKeys(p.id) : Promise.resolve({} as Awaited<ReturnType<typeof fetchProgramAnswerKeys>>),
          opts.asTeacher ? fetchProgramSubmissions(p.id) : Promise.resolve([] as EduSubmissionRecord[]),
          opts.asTeacher ? fetchJoinRequests(p.id) : Promise.resolve([] as EduJoinRequest[]),
        ]);
        // Teachers get the keys back onto the class copy; students only ever hold the key-free one.
        // A class copy mirrored before keys were withheld still carries them: rewrite it key-free.
        if (opts.asTeacher) for (const a of remoteRaw) if (!a.unitSnapshot.answerKeyWithheld && a.unitSnapshot.questions?.some(q => q.correctAnswer)) void mirrorAssignment(a);
        const remote = remoteRaw.map(a => withAnswerKeys(a, keys[a.id]));
        mergeRemoteDeskAssignments(remote);
        const local = listDeskAssignments({ classroomId: p.id });
        const byId = new Map<string, UniversalDeskAssignment>();
        for (const a of [...local, ...remote]) {
          const had = byId.get(a.id);
          if (!had || deskStamp(had) <= deskStamp(a)) byId.set(a.id, withAnswerKeys(a, keys[a.id]));
        }
        const me = auth.currentUser?.uid || '';
        // Students don't see work scheduled to open later.
        const assignments = Array.from(byId.values()).filter(a => opts.asTeacher || isOpenFor(a, me)).sort((a, b) => b.assignedAt - a.assignedAt);
        return [p.id, { assignments, submissions: subs, joinRequests: reqs }] as const;
      })
    );
    setWork(Object.fromEntries(entries));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, opts.asTeacher]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const h = () => void refresh();
    window.addEventListener('plajah:eduWorkChanged', h);
    return () => window.removeEventListener('plajah:eduWorkChanged', h);
  }, [refresh]);

  return { work, loading, refresh };
}

/** Student side: pull returned work from the mirror onto this device's desk. */
export async function syncMyReturnedWork(uid: string): Promise<EduSubmissionRecord[]> {
  if (!uid) return [];
  const mine = await fetchMySubmissions(uid);
  applyMyDrafts(uid, mine);
  applyReturnedSubmissions(uid, mine);
  return mine;
}

export const announceWorkChanged = () => window.dispatchEvent(new CustomEvent('plajah:eduWorkChanged'));

/** Ask Tela to open its Classwork tab scoped to a class (and optionally a week). */
export function openTelaClasswork(detail: {
  orgId: string;
  orgName: string;
  programId?: string;
  programName?: string;
  weekId?: string;
  domain?: 'CHRISTIAN_EDUCATION' | 'ACADEMIA' | 'ORG_TRAINING';
}) {
  try {
    sessionStorage.setItem('plajah:telaClasswork', JSON.stringify({ ...detail, at: Date.now() }));
  } catch {
    /* private mode: Tela opens the tab without a class preset */
  }
  window.dispatchEvent(new CustomEvent('plajah:openTela', { detail: { classwork: detail } }));
}
