// Shared data helpers for the Christian Ed hub, class clubs and review queue.
import { useCallback, useEffect, useState } from 'react';
import type { ChurchProgram } from '../../../services/churchEducationService';
import type { IngestedQuestion } from '../../../services/curriculumIngestionService';
import {
  listDeskAssignments,
  mergeRemoteDeskAssignments,
  applyReturnedSubmissions,
  type UniversalDeskAssignment,
} from '../../../services/universalStudentDeskService';
import {
  fetchProgramAssignments,
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
  return a.unitSnapshot.questions.some(isWritten);
}

export function currentWeekIndex(p: ChurchProgram): number {
  if (p.weeks.length === 0) return -1;
  return Math.min(Math.max(p.currentWeek ?? 0, 0), p.weeks.length - 1);
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
/** First weekday named in the schedule text ("Sundays · 9:15 AM"), or -1. */
export function scheduleWeekday(schedule?: string): number {
  const s = (schedule || '').toLowerCase();
  let best = -1;
  let at = Infinity;
  DAYS.forEach((d, i) => {
    const k = s.indexOf(d);
    if (k >= 0 && k < at) {
      at = k;
      best = i;
    }
  });
  return best;
}

/** Next occurrence (today counts) of a weekday at 9:00 local. */
export function nextWeekday(day: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  const diff = (day - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

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
        const [remote, subs, reqs] = await Promise.all([
          fetchProgramAssignments(p.id),
          opts.asTeacher ? fetchProgramSubmissions(p.id) : Promise.resolve([] as EduSubmissionRecord[]),
          opts.asTeacher ? fetchJoinRequests(p.id) : Promise.resolve([] as EduJoinRequest[]),
        ]);
        mergeRemoteDeskAssignments(remote);
        const local = listDeskAssignments({ classroomId: p.id });
        const byId = new Map<string, UniversalDeskAssignment>();
        for (const a of [...local, ...remote]) byId.set(a.id, a);
        const assignments = Array.from(byId.values()).sort((a, b) => b.assignedAt - a.assignedAt);
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
