// services/universalStudentDeskService.ts
// Universal Platform-Wide Student Desk & Digital Classroom Assignment Workflow (Powered by Tela)
// Shared across Academia (K-12, Higher Ed, Homeschool), Christian Education,
// and Plajah Elevate Organizational Training.

import {
  gradeAndRecordUnitSubmission,
  type IngestedCurriculumUnit,
  type StudentUnitSubmission,
} from './curriculumIngestionService';
import { getDefaultLivingTemplateForUnit } from './council/livingDocumentTemplates';
import { auth } from './firebase';
import { adoptFromSharedDesk, deskAssignmentsKey } from './hqScopeWall';
import { appendRecord } from './learningLedgerService';
import { mirrorAssignment, mirrorDraft, mirrorTurnIn, type EduSubmissionRecord } from './christianEdSync';
import { afterDueOf, canTurnIn, isLate, turnInState, type AfterDue, type ExtensionLike } from './edu/assignmentPolicy';
import { logEduEvent, type LedgerEvent } from './edu/eduLedger';

export type DeskContextDomain = 'CHRISTIAN_EDUCATION' | 'ACADEMIA' | 'ORG_TRAINING';

export type DeskAssignmentStatus =
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'READY_TO_TURN_IN'
  | 'TURNED_IN'
  | 'RETURNED_WITH_FEEDBACK';

export interface DeskAssignmentToolsConfig {
  allowSacredLibraryAndReferences: boolean;
  allowSelfCheckBeforeTurnIn: boolean;
  allowScratchpadNotes: boolean;
  allowHandRaiseQuestion: boolean;
}

export interface UniversalDeskAssignment {
  id: string;
  unitId: string;
  telaDocId: string;
  domain: DeskContextDomain;
  orgId: string;
  orgName: string;
  classroomId: string;
  classroomName: string;
  departmentFolder: string;
  title: string;
  subtitle: string;
  instructions: string;
  unitKind: IngestedCurriculumUnit['kind'];
  livingTemplateId: string;
  assignedByUid: string;
  assignedByName: string;
  assignedAt: number;
  dueAt: number;
  dueLabel: string;
  /** Scheduled ahead: students see it from this time (the class's teachers always do). Absent = straight away. */
  opensAt?: number;
  /** Last time its dates were moved; the newer of this and assignedAt wins when copies disagree. */
  rescheduledAt?: number;
  /** The class date it belongs to (the calendar shows it here); absent = the due date. */
  scheduledFor?: number;
  /** After the due date: 'lock' (default — only with a granted extension) or 'accept_late' (marked late). */
  afterDue?: AfterDue;
  totalPoints: number;
  questionCount: number;
  toolsConfig: DeskAssignmentToolsConfig;
  /** Embedded snapshot of the unit so the Student Desk always renders offline or across tabs */
  unitSnapshot: IngestedCurriculumUnit;
}

export interface StudentDeskWorkspaceState {
  assignmentId: string;
  studentUid: string;
  studentName: string;
  status: DeskAssignmentStatus;
  /** Student's chosen Living Template override on their desk (optional) */
  deskLivingTemplateId?: string;
  /** Draft or final answers keyed by question.id */
  answers: Record<string, string>;
  /** Student's personal margin notes / scratchpad on the desk */
  scratchpadNotes: string;
  /** Flagged question IDs where student raised their hand or asked for a hint */
  flaggedQuestionIds: string[];
  /** Question asked to the teacher from the desk */
  studentQuestionToTeacher?: string;
  /** Number of self-checks run before turning in */
  selfCheckCount: number;
  lastSavedAt: number;
  turnedInAt?: number;
  /** Populated once turned in and auto-graded */
  submission?: StudentUnitSubmission;
  teacherFeedbackNote?: string;
  /** Turned in after the due date (an accept-late assignment). */
  late?: boolean;
}

/** The old desk every account on a browser shared. Read once to move each person's own work out of it. */
const SHARED_DESK_KEY = 'plajah_universal_desk_assignments_v1';
const DESK_WORKSPACE_KEY = (studentUid: string) =>
  `plajah_universal_desk_workspace_v1_${studentUid || 'default_student'}`;

function readJsonList<T>(key: string): T[] | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function readStoredAssignments(): UniversalDeskAssignment[] {
  try {
    const uid = auth.currentUser?.uid;
    const key = deskAssignmentsKey(uid);
    const own = readJsonList<UniversalDeskAssignment>(key);
    if (own) return own;
    if (!uid) return [];
    const { mine, rest } = adoptFromSharedDesk(readJsonList<UniversalDeskAssignment>(SHARED_DESK_KEY) || [], uid, new Set(Object.keys(readWorkspaceMap(uid))));
    localStorage.setItem(key, JSON.stringify(mine));
    if (rest.length) localStorage.setItem(SHARED_DESK_KEY, JSON.stringify(rest));
    else localStorage.removeItem(SHARED_DESK_KEY);
    return mine;
  } catch {
    return [];
  }
}

function writeStoredAssignments(list: UniversalDeskAssignment[]): void {
  try {
    localStorage.setItem(deskAssignmentsKey(auth.currentUser?.uid), JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('plajah:deskUpdated'));
  } catch {
    // Non-fatal
  }
}

function readWorkspaceMap(studentUid: string): Record<string, StudentDeskWorkspaceState> {
  try {
    const raw = localStorage.getItem(DESK_WORKSPACE_KEY(studentUid));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeWorkspaceMap(
  studentUid: string,
  map: Record<string, StudentDeskWorkspaceState>
): void {
  try {
    localStorage.setItem(DESK_WORKSPACE_KEY(studentUid), JSON.stringify(map));
    window.dispatchEvent(new CustomEvent('plajah:deskUpdated'));
  } catch {
    // Non-fatal
  }
}

export function listDeskAssignments(filter?: {
  domain?: DeskContextDomain | 'ALL';
  orgId?: string;
  classroomId?: string;
  /** A student's view: hides work scheduled to open later (unless they assigned it). */
  studentUid?: string;
}): UniversalDeskAssignment[] {
  const all = readStoredAssignments();
  return all.filter(item => {
    if (filter?.studentUid && !isOpenFor(item, filter.studentUid)) {
      return false;
    }
    if (filter?.domain && filter.domain !== 'ALL' && item.domain !== filter.domain) {
      return false;
    }
    if (filter?.orgId && item.domain === 'CHRISTIAN_EDUCATION' && item.orgId !== filter.orgId) {
      return false;
    }
    if (filter?.classroomId && item.classroomId !== filter.classroomId) {
      return false;
    }
    return true;
  });
}

/**
 * Teacher Action: Assign any interactive Tela unit / worksheet / quiz / test digitally to a class's Student Desk.
 */
export function assignUnitToClassroomDesk(params: {
  unit: IngestedCurriculumUnit;
  domain: DeskContextDomain;
  orgId: string;
  orgName: string;
  classroomId: string;
  classroomName: string;
  dueLabel: string;
  dueAt?: number;
  opensAt?: number;
  scheduledFor?: number;
  afterDue?: AfterDue;
  /** What the class ledger calls it (the auto-scheduler records 'auto_scheduled'). */
  ledgerEvent?: LedgerEvent;
  instructions?: string;
  livingTemplateId?: string;
  assignedByUid?: string;
  assignedByName?: string;
  toolsConfig?: Partial<DeskAssignmentToolsConfig>;
}): UniversalDeskAssignment {
  const all = readStoredAssignments();
  const tplId =
    params.livingTemplateId ||
    params.unit.livingTemplateId ||
    getDefaultLivingTemplateForUnit(params.unit.kind, params.unit.title).id;

  // The class gets its own copy of the lesson as it is now: editing (or deleting) the library original later
  // never changes work already handed out.
  const updatedUnit: IngestedCurriculumUnit = {
    ...(JSON.parse(JSON.stringify(params.unit)) as IngestedCurriculumUnit),
    livingTemplateId: tplId,
  };

  const assignment: UniversalDeskAssignment = {
    id: `desk_assign_${params.unit.id}_${params.classroomId}`,
    unitId: params.unit.id,
    telaDocId: params.unit.telaDocId,
    domain: params.domain,
    orgId: params.orgId,
    orgName: params.orgName,
    classroomId: params.classroomId,
    classroomName: params.classroomName,
    departmentFolder: params.unit.departmentFolder || 'Christian Education',
    title: params.unit.title,
    subtitle: params.unit.subtitle,
    // Only what the teacher wrote; the assignment itself is the original's content.
    instructions: params.instructions?.trim() || '',
    unitKind: params.unit.kind,
    livingTemplateId: tplId,
    assignedByUid: params.assignedByUid || auth.currentUser?.uid || 'class_instructor',
    assignedByName: params.assignedByName || 'Class Instructor',
    assignedAt: Date.now(),
    dueAt: params.dueAt || Date.now() + 2 * 86400_000,
    dueLabel: params.dueLabel || 'Due This Week',
    ...(params.opensAt && params.opensAt > Date.now() ? { opensAt: params.opensAt } : {}),
    ...(params.scheduledFor ? { scheduledFor: params.scheduledFor } : {}),
    afterDue: params.afterDue || 'lock',
    totalPoints: params.unit.totalPoints,
    questionCount: params.unit.questions.length,
    toolsConfig: {
      allowSacredLibraryAndReferences:
        params.toolsConfig?.allowSacredLibraryAndReferences ?? true,
      allowSelfCheckBeforeTurnIn: params.toolsConfig?.allowSelfCheckBeforeTurnIn ?? true,
      allowScratchpadNotes: params.toolsConfig?.allowScratchpadNotes ?? true,
      allowHandRaiseQuestion: params.toolsConfig?.allowHandRaiseQuestion ?? true,
    },
    unitSnapshot: updatedUnit,
  };

  const next = [assignment, ...all.filter(a => a.id !== assignment.id)];
  writeStoredAssignments(next);
  void mirrorAssignment(assignment);
  if (assignment.domain === 'CHRISTIAN_EDUCATION') void logEduEvent({
    orgId: assignment.orgId, programId: assignment.classroomId, assignmentId: assignment.id, assignmentTitle: assignment.title,
    event: params.ledgerEvent || 'assigned', actorName: assignment.assignedByName,
    detail: ledgerDates(assignment),
  });
  return assignment;
}

const ledgerDates = (a: Pick<UniversalDeskAssignment, 'opensAt' | 'scheduledFor' | 'dueAt' | 'afterDue'>) => ({
  opensAt: a.opensAt || null, scheduledFor: a.scheduledFor || null, dueAt: a.dueAt, afterDue: afterDueOf(a),
});

/** Takes an assignment off this device's desk (the teacher unassigned it). */
export function removeDeskAssignment(id: string): void {
  writeStoredAssignments(readStoredAssignments().filter(a => a.id !== id));
}

/** A class's work on this device, trimmed to what the class still has (unassigned work disappears). */
export function pruneClassAssignments(classroomId: string, keepIds: Set<string>): void {
  const all = readStoredAssignments();
  const next = all.filter(a => a.classroomId !== classroomId || keepIds.has(a.id));
  if (next.length !== all.length) writeStoredAssignments(next);
}

/** Which copy of an assignment is newest (assigned, or later moved on the calendar). */
export const deskStamp = (a: Pick<UniversalDeskAssignment, 'assignedAt' | 'rescheduledAt'>) => Math.max(a.assignedAt || 0, a.rescheduledAt || 0);

/** Students see scheduled work from its open time; whoever assigned it always sees it. */
export function isOpenFor(a: Pick<UniversalDeskAssignment, 'opensAt' | 'assignedByUid'>, uid: string, now = Date.now()): boolean {
  return !a.opensAt || a.opensAt <= now || a.assignedByUid === uid;
}

/** Moves an assigned item to new dates (calendar drag or edit). Returns the updated assignment, or null if it isn't on this device. */
export function rescheduleDeskAssignment(id: string, at: { dueAt: number; dueLabel: string; opensAt?: number | null; scheduledFor?: number | null; afterDue?: AfterDue }): UniversalDeskAssignment | null {
  const all = readStoredAssignments();
  const cur = all.find(a => a.id === id);
  if (!cur) return null;
  const { opensAt: _old, scheduledFor: _sf, ...rest } = cur;
  const scheduledFor = at.scheduledFor === undefined ? cur.scheduledFor : at.scheduledFor || undefined;
  const next: UniversalDeskAssignment = {
    ...rest, dueAt: at.dueAt, dueLabel: at.dueLabel, rescheduledAt: Date.now(),
    ...(at.opensAt && at.opensAt > Date.now() ? { opensAt: at.opensAt } : {}),
    ...(scheduledFor ? { scheduledFor } : {}),
    afterDue: at.afterDue || afterDueOf(cur),
  };
  writeStoredAssignments(all.map(a => (a.id === id ? next : a)));
  void mirrorAssignment(next);
  if (next.domain === 'CHRISTIAN_EDUCATION') {
    const policyOnly = next.dueAt === cur.dueAt && (next.opensAt || 0) === (cur.opensAt || 0) && (next.scheduledFor || 0) === (cur.scheduledFor || 0);
    void logEduEvent({
      orgId: next.orgId, programId: next.classroomId, assignmentId: next.id, assignmentTitle: next.title,
      event: policyOnly ? 'policy_changed' : 'rescheduled',
      detail: { ...ledgerDates(next), previousDueAt: cur.dueAt, previousOpensAt: cur.opensAt || null, previousAfterDue: afterDueOf(cur) },
    });
  }
  return next;
}

/** Why a turn-in was refused: past due on a locked assignment without a granted extension, or not open yet. */
export class TurnInLockedError extends Error {
  constructor(public readonly reason: 'past_due' | 'not_open') {
    super(reason === 'past_due' ? 'This was due already. Ask your teacher for an extension to turn it in.' : 'This is not open yet.');
  }
}

/**
 * Loads the student's saved workspace state for a specific desk assignment.
 */
export function getStudentDeskWorkspace(
  studentUid: string,
  assignmentId: string,
  studentName: string = 'Student'
): StudentDeskWorkspaceState {
  const map = readWorkspaceMap(studentUid);
  if (map[assignmentId]) {
    return map[assignmentId];
  }
  return {
    assignmentId,
    studentUid,
    studentName,
    status: 'ASSIGNED',
    answers: {},
    scratchpadNotes: '',
    flaggedQuestionIds: [],
    selfCheckCount: 0,
    lastSavedAt: Date.now(),
  };
}

/**
 * Lists all workspace states for a student across all assignments.
 */
export function getAllStudentDeskWorkspaces(
  studentUid: string
): Record<string, StudentDeskWorkspaceState> {
  return readWorkspaceMap(studentUid);
}

/**
 * Auto-saves the student's work-in-progress on their Desk (answers, scratchpad, template preference, hand-raise flags).
 */
export function saveStudentDeskDraft(params: {
  studentUid: string;
  studentName: string;
  assignment: UniversalDeskAssignment;
  answers: Record<string, string>;
  scratchpadNotes?: string;
  deskLivingTemplateId?: string;
  flaggedQuestionIds?: string[];
  studentQuestionToTeacher?: string;
  incrementSelfCheck?: boolean;
}): StudentDeskWorkspaceState {
  const map = readWorkspaceMap(params.studentUid);
  const prev = map[params.assignment.id];

  const answeredCount = params.assignment.unitSnapshot.questions.filter(
    q => (params.answers[q.id] || '').trim().length > 0
  ).length;
  const totalQ = params.assignment.unitSnapshot.questions.length;

  let nextStatus: DeskAssignmentStatus = prev?.status || 'ASSIGNED';
  if (nextStatus !== 'TURNED_IN' && nextStatus !== 'RETURNED_WITH_FEEDBACK') {
    if (answeredCount === 0 && !(params.scratchpadNotes || '').trim()) {
      nextStatus = 'ASSIGNED';
    } else if (answeredCount >= totalQ && totalQ > 0) {
      nextStatus = 'READY_TO_TURN_IN';
    } else {
      nextStatus = 'IN_PROGRESS';
    }
  }

  const updated: StudentDeskWorkspaceState = {
    assignmentId: params.assignment.id,
    studentUid: params.studentUid,
    studentName: params.studentName,
    status: nextStatus,
    deskLivingTemplateId: params.deskLivingTemplateId ?? prev?.deskLivingTemplateId,
    answers: { ...params.answers },
    scratchpadNotes: params.scratchpadNotes ?? prev?.scratchpadNotes ?? '',
    flaggedQuestionIds: params.flaggedQuestionIds ?? prev?.flaggedQuestionIds ?? [],
    studentQuestionToTeacher:
      params.studentQuestionToTeacher ?? prev?.studentQuestionToTeacher,
    selfCheckCount: (prev?.selfCheckCount || 0) + (params.incrementSelfCheck ? 1 : 0),
    lastSavedAt: Date.now(),
    turnedInAt: prev?.turnedInAt,
    submission: prev?.submission,
    teacherFeedbackNote: prev?.teacherFeedbackNote,
  };

  map[params.assignment.id] = updated;
  writeWorkspaceMap(params.studentUid, map);
  mirrorDraft(params.assignment, updated);
  return updated;
}

/**
 * The student's own saved work from their account onto this device: drafts saved on another device
 * (newer than this one's) and work already turned in there.
 */
export function applyMyDrafts(studentUid: string, recs: EduSubmissionRecord[]): void {
  const map = readWorkspaceMap(studentUid);
  let changed = false;
  for (const r of recs) {
    if (r.studentUid !== studentUid || r.status === 'RETURNED_WITH_FEEDBACK') continue;
    const prev = map[r.assignmentId];
    if (prev && (prev.lastSavedAt || 0) >= (r.updatedAt || 0)) continue;
    if (prev?.status === 'TURNED_IN' || prev?.status === 'RETURNED_WITH_FEEDBACK') continue;
    map[r.assignmentId] = {
      ...(prev || { scratchpadNotes: '', flaggedQuestionIds: [], selfCheckCount: 0 }),
      assignmentId: r.assignmentId,
      studentUid,
      studentName: r.studentName,
      status: r.status,
      answers: { ...r.answers },
      lastSavedAt: r.updatedAt || Date.now(),
      ...(r.turnedInAt ? { turnedInAt: r.turnedInAt } : {}),
    } as StudentDeskWorkspaceState;
    changed = true;
  }
  if (changed) writeWorkspaceMap(studentUid, map);
}

/**
 * Student Action: Turn in the completed worksheet/test from the Universal Student Desk.
 * - Auto-grades against the paired Answer Key
 * - Updates the Plajah Mastery Skill Graph (Christian Education & Organization Mastery)
 * - Credits the Academia Learner Ledger (`appendRecord`)
 * - Saves the official Turn-In Receipt on the Student's Desk
 */
export function turnInStudentDeskAssignment(params: {
  studentUid: string;
  studentName: string;
  assignment: UniversalDeskAssignment;
  answers: Record<string, string>;
  scratchpadNotes?: string;
  deskLivingTemplateId?: string;
  /** This student's extension request, if any: a granted one moves the deadline. */
  extension?: ExtensionLike | null;
}): {
  workspace: StudentDeskWorkspaceState;
  submission: StudentUnitSubmission;
} {
  // 0. The due date and after-due rule (the database rules check the same thing on the server copy).
  const a = params.assignment;
  const state = turnInState(a, params.extension);
  if (!canTurnIn(state)) {
    if (a.domain === 'CHRISTIAN_EDUCATION' && state.kind === 'locked') void logEduEvent({
      orgId: a.orgId, programId: a.classroomId, assignmentId: a.id, assignmentTitle: a.title, studentUid: params.studentUid,
      event: 'turn_in_refused', actorName: params.studentName, detail: { dueAt: state.dueAt, extension: state.extension || null },
    });
    throw new TurnInLockedError(state.kind === 'not_open' ? 'not_open' : 'past_due');
  }
  const late = isLate(a, params.extension, Date.now());

  // 1. Grade and update Mastery Graph via curriculumIngestionService
  const submission = gradeAndRecordUnitSubmission({
    unit: params.assignment.unitSnapshot,
    studentUid: params.studentUid,
    studentName: params.studentName,
    answers: params.answers,
  });

  // 2. Also record to Academia Learner Ledger so Academia Gradebook & Student Scoreboard reflect it
  try {
    appendRecord({
      studentId: params.studentUid,
      standardId:
        params.assignment.unitSnapshot.masterySkills[0]?.id ||
        `STD.${params.assignment.domain}.${params.assignment.unitId}`,
      framework: params.assignment.domain === 'CHRISTIAN_EDUCATION' ? 'CASE' : 'CCSS_ELA',
      source: 'ASSESSMENT',
      score: submission.percentage,
      artifactTitle: params.assignment.title,
    });
  } catch {
    // Non-fatal if ledger is unavailable
  }

  // 3. Persist TURN_IN state on the Student's Desk
  const map = readWorkspaceMap(params.studentUid);
  const prev = map[params.assignment.id];
  const now = Date.now();

  const workspace: StudentDeskWorkspaceState = {
    assignmentId: params.assignment.id,
    studentUid: params.studentUid,
    studentName: params.studentName,
    status: 'TURNED_IN',
    deskLivingTemplateId:
      params.deskLivingTemplateId ||
      prev?.deskLivingTemplateId ||
      params.assignment.livingTemplateId,
    answers: { ...params.answers },
    scratchpadNotes: params.scratchpadNotes ?? prev?.scratchpadNotes ?? '',
    flaggedQuestionIds: prev?.flaggedQuestionIds ?? [],
    studentQuestionToTeacher: prev?.studentQuestionToTeacher,
    selfCheckCount: prev?.selfCheckCount || 0,
    lastSavedAt: now,
    turnedInAt: now,
    submission,
    ...(late ? { late: true } : {}),
  };

  map[params.assignment.id] = workspace;
  writeWorkspaceMap(params.studentUid, map);
  void mirrorTurnIn(params.assignment, workspace);
  if (a.domain === 'CHRISTIAN_EDUCATION') void logEduEvent({
    orgId: a.orgId, programId: a.classroomId, assignmentId: a.id, assignmentTitle: a.title, studentUid: params.studentUid,
    event: late ? 'turned_in_late' : 'turned_in', actorName: params.studentName,
    detail: { dueAt: a.dueAt, turnedInAt: now, extended: state.kind === 'extended', percentage: submission.percentage },
  });

  return { workspace, submission };
}

/** Merge assignments fetched from the Christian Ed mirror into this device's desk. */
export function mergeRemoteDeskAssignments(remote: UniversalDeskAssignment[]): void {
  if (remote.length === 0) return;
  const all = readStoredAssignments();
  const byId = new Map(all.map(a => [a.id, a]));
  let changed = false;
  for (const r of remote) {
    const local = byId.get(r.id);
    if (!local || deskStamp(local) < deskStamp(r)) {
      byId.set(r.id, { ...local, ...r, unitSnapshot: { ...(local?.unitSnapshot || {}), ...r.unitSnapshot } });
      changed = true;
    }
  }
  if (changed) writeStoredAssignments(Array.from(byId.values()).sort((a, b) => b.assignedAt - a.assignedAt));
}

/** Bring teacher feedback from the mirror onto the student's local desk. */
export function applyReturnedSubmissions(studentUid: string, recs: EduSubmissionRecord[]): void {
  const returned = recs.filter(r => r.status === 'RETURNED_WITH_FEEDBACK');
  if (returned.length === 0) return;
  const map = readWorkspaceMap(studentUid);
  let changed = false;
  for (const r of returned) {
    const prev = map[r.assignmentId];
    if (prev?.status === 'RETURNED_WITH_FEEDBACK' && prev.teacherFeedbackNote === (r.teacherFeedbackNote || '') && prev.submission?.percentage === r.percentage) continue;
    map[r.assignmentId] = {
      ...(prev || {
        assignmentId: r.assignmentId,
        studentUid,
        studentName: r.studentName,
        answers: r.answers,
        scratchpadNotes: '',
        flaggedQuestionIds: [],
        selfCheckCount: 0,
        lastSavedAt: Date.now(),
      }),
      status: 'RETURNED_WITH_FEEDBACK',
      teacherFeedbackNote: r.teacherFeedbackNote || '',
      turnedInAt: r.turnedInAt,
      // The teacher's scores (and, now that it's returned, the expected answers) replace the desk's waiting ones.
      ...(prev?.submission ? { submission: { ...prev.submission, questionScores: { ...prev.submission.questionScores, ...r.questionScores }, earnedPoints: r.earnedPoints, percentage: r.percentage } } : {}),
    };
    changed = true;
  }
  if (changed) writeWorkspaceMap(studentUid, map);
}

/**
 * Allows a student to reopen a turned-in assignment for revision/retake on their Desk.
 */
export function reopenStudentDeskAssignmentForRevision(
  studentUid: string,
  assignmentId: string
): StudentDeskWorkspaceState | null {
  const map = readWorkspaceMap(studentUid);
  const existing = map[assignmentId];
  if (!existing) return null;
  const updated: StudentDeskWorkspaceState = {
    ...existing,
    status: 'IN_PROGRESS',
    lastSavedAt: Date.now(),
  };
  map[assignmentId] = updated;
  writeWorkspaceMap(studentUid, map);
  return updated;
}

/**
 * Helper to dispatch a global event to open the Universal Student Desk on a specific assignment or unit.
 */
export function openUniversalStudentDesk(detail?: {
  assignmentId?: string;
  unitId?: string;
  domain?: DeskContextDomain | 'ALL';
}): void {
  window.dispatchEvent(new CustomEvent('plajah:openStudentDesk', { detail: detail || {} }));
}
