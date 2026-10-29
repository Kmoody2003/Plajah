// services/universalStudentDeskService.ts
// Universal Platform-Wide Student Desk & Digital Classroom Assignment Workflow (Powered by Tela)
// Shared across Academia (K-12, Higher Ed, Homeschool), Christian Education (Great Faith Ministries),
// and Plajah Elevate Organizational Training.

import {
  listIngestedUnits,
  ensureAllDetectedLinksOnboarded,
  gradeAndRecordUnitSubmission,
  type IngestedCurriculumUnit,
  type StudentUnitSubmission,
} from './curriculumIngestionService';
import {
  getDefaultLivingTemplateForUnit,
  getLivingTemplateById,
} from './council/livingDocumentTemplates';
import {
  GREAT_FAITH_MINISTRIES_DEFAULT_ID,
  GREAT_FAITH_MINISTRIES_NAME,
} from './orgAssets';
import { appendRecord } from './learningLedgerService';
import { mirrorAssignment, mirrorTurnIn, type EduSubmissionRecord } from './christianEdSync';

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
}

const DESK_ASSIGNMENTS_KEY = 'plajah_universal_desk_assignments_v1';
const DESK_WORKSPACE_KEY = (studentUid: string) =>
  `plajah_universal_desk_workspace_v1_${studentUid || 'default_student'}`;

function readStoredAssignments(): UniversalDeskAssignment[] {
  try {
    const raw = localStorage.getItem(DESK_ASSIGNMENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredAssignments(list: UniversalDeskAssignment[]): void {
  try {
    localStorage.setItem(DESK_ASSIGNMENTS_KEY, JSON.stringify(list));
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

/**
 * Builds starter Academia units so the Universal Student Desk showcases both
 * Christian Education (Great Faith Ministries) AND Academia (STEM / ELA / History) out of the box.
 */
function buildStarterAcademiaUnits(): IngestedCurriculumUnit[] {
  const now = Date.now();
  return [
    {
      id: 'acad_unit_ela_odyssey',
      orgId: 'academia-campus',
      programId: 'class-ela-honors',
      departmentFolder: 'Academia · Humanities & ELA',
      title: 'ELA Reading Quest: The Odyssey & Heroic Perseverance Worksheet',
      subtitle: 'Interactive Tela Literary Analysis · 3 Questions · 6 Pts · Paired with Lorea Classic Reader',
      kind: 'ASSIGNMENT',
      sourceKind: 'GOOGLE_DOC',
      sourceLabel: 'The Odyssey Book IX Analytical Worksheet (Google Doc)',
      answerKeySourceLabel: 'ELA Department Master Rubric',
      livingTemplateId: 'std-ws-kinfolk-editorial',
      telaDocId: 'tela_acad_ela_odyssey',
      lessonBlocks: [
        {
          id: 'b1',
          kind: 'h1',
          text: 'Homer’s Odyssey: Ingenuity, Hubris & Homecoming',
        },
        {
          id: 'b2',
          kind: 'p',
          text: 'In Book IX of the Odyssey, Odysseus recounts his encounter with the Cyclops Polyphemus. Homer contrasts brute force with metis (wise resourcefulness and strategic patience), while warning how prideful boasting endangers the entire crew.',
        },
      ],
      questions: [
        {
          id: 'acad_ela_q1',
          number: 1,
          prompt: 'How does Odysseus use strategic foresight (metis) rather than sheer physical strength to escape Polyphemus’ cave?',
          type: 'multiple_choice',
          options: [
            'A) By concealing his identity as "Nobody" (Outis) and binding his men beneath the wool of the giant rams',
            'B) By summoning an Athenian fleet to storm the island',
            'C) By bribing Polyphemus with golden shields',
            'D) By waiting for winter snows to freeze the Aegean Sea',
          ],
          correctAnswer: 'A) By concealing his identity as "Nobody" (Outis) and binding his men beneath the wool of the giant rams',
          explanation: 'Odysseus’ "Outis" ("Nobody") wordplay prevents the other Cyclopes from intervening, and hiding beneath the rams allows his crew to pass undetected.',
          points: 2,
          skillId: 'skill_ela_textual_evidence',
        },
        {
          id: 'acad_ela_q2',
          number: 2,
          prompt: 'What critical error of hubris (excessive pride) does Odysseus commit as his ship pulls away from the shore?',
          type: 'multiple_choice',
          options: [
            'A) He shouts his true name and lineage back to Polyphemus, enabling the Cyclops to call upon Poseidon’s wrath',
            'B) He abandons his rudder in the cave',
            'C) He refuses to share food with his oarsmen',
            'D) He sails directly into Charybdis',
          ],
          correctAnswer: 'A) He shouts his true name and lineage back to Polyphemus, enabling the Cyclops to call upon Poseidon’s wrath',
          explanation: 'By boasting his real name and father’s name (Laertes of Ithaca), Odysseus turns a clean escape into a ten-year curse from Poseidon.',
          points: 2,
          skillId: 'skill_ela_character_arc',
        },
        {
          id: 'acad_ela_q3',
          number: 3,
          prompt: 'Short Reflection: Compare ancient Greek metis (strategic wisdom) with biblical wisdom in Proverbs 16:18 ("Pride goes before destruction"). How do both texts warn leaders about pride?',
          type: 'short_answer',
          correctAnswer: 'humility',
          explanation: 'Look for synthesis comparing Odysseus’ boastful hubris with the proverb that humility and restraint protect a leader’s household and mission.',
          points: 2,
          skillId: 'skill_ela_comparative_synthesis',
        },
      ],
      masterySkills: [
        { id: 'skill_ela_textual_evidence', title: 'ELA · Textual Evidence & Close Reading' },
        { id: 'skill_ela_character_arc', title: 'ELA · Character Motivation & Hubris' },
        { id: 'skill_ela_comparative_synthesis', title: 'ELA · Comparative Literary Synthesis' },
      ],
      sacredLibrarySupplements: [],
      totalPoints: 6,
      createdAt: now - 86400_000,
    },
    {
      id: 'acad_unit_stem_astrolabe',
      orgId: 'academia-campus',
      programId: 'class-stem-lab',
      departmentFolder: 'Academia · STEM & Quantitative Lab',
      title: 'STEM & Astronomy: Celestial Coordinates, Ratios & Proportional Reasoning',
      subtitle: 'Interactive Tela Lab Check · 3 Questions · 6 Pts · Celestial Astrolabe Template',
      kind: 'QUIZ',
      sourceKind: 'GOOGLE_FORM',
      sourceLabel: 'STEM Celestial Navigation Formative Check (Google Form)',
      answerKeySourceLabel: 'STEM Lab Auto-Grading Key',
      livingTemplateId: 'ws-celestial-astrolabe',
      telaDocId: 'tela_acad_stem_astrolabe',
      lessonBlocks: [
        {
          id: 's1',
          kind: 'h1',
          text: 'Angular Altitude, Ratios & Celestial Navigation',
        },
        {
          id: 's2',
          kind: 'p',
          text: 'Mariners and astronomers used brass astrolabes to measure the altitude angle of Polaris (the North Star) above the horizon. Because Earth is spherical, the altitude angle of Polaris in degrees equals the observer’s latitude in the Northern Hemisphere.',
        },
      ],
      questions: [
        {
          id: 'acad_stem_q1',
          number: 1,
          prompt: 'If an astronomer in Ephesus measures Polaris at an altitude angle of 38° above the northern horizon, what is the approximate latitude of Ephesus?',
          type: 'multiple_choice',
          options: [
            'A) 38° North Latitude',
            'B) 52° South Latitude',
            'C) 0° Equator',
            'D) 90° North Pole',
          ],
          correctAnswer: 'A) 38° North Latitude',
          explanation: 'The altitude of the celestial pole above the horizon equals the observer’s latitude (Ephesus is at ~37.9° N).',
          points: 2,
          skillId: 'skill_stem_angular_geometry',
        },
        {
          id: 'acad_stem_q2',
          number: 2,
          prompt: 'A full circle on an astrolabe rim is divided into 360°. If 8 equal star-sector arcs span 240° in total, how many degrees does each individual sector arc measure?',
          type: 'multiple_choice',
          options: [
            'A) 30° per sector arc',
            'B) 45° per sector arc',
            'C) 15° per sector arc',
            'D) 60° per sector arc',
          ],
          correctAnswer: 'A) 30° per sector arc',
          explanation: '240° ÷ 8 equal sectors = 30° per sector.',
          points: 2,
          skillId: 'skill_stem_proportional_ratios',
        },
        {
          id: 'acad_stem_q3',
          number: 3,
          prompt: 'True or False: As a traveler journeys northward from Alexandria (31° N) toward Smyrna (38.4° N), the altitude of Polaris above the northern horizon increases.',
          type: 'true_false',
          options: ['True', 'False'],
          correctAnswer: 'True',
          explanation: 'Moving northward increases latitude, which directly raises the altitude angle of Polaris above the horizon.',
          points: 2,
          skillId: 'skill_stem_angular_geometry',
        },
      ],
      masterySkills: [
        { id: 'skill_stem_angular_geometry', title: 'STEM · Angular Geometry & Latitude' },
        { id: 'skill_stem_proportional_ratios', title: 'STEM · Proportional Ratios & Rates' },
      ],
      sacredLibrarySupplements: [],
      totalPoints: 6,
      createdAt: now - 43200_000,
    },
  ];
}

/**
 * Ensures the Universal Student Desk has default digital assignments across both
 * Great Faith Ministries (Christian Education) and Academia so the student desk is
 * immediately populated and ready to test.
 */
export async function ensureUniversalStudentDeskSeeded(
  orgId: string = GREAT_FAITH_MINISTRIES_DEFAULT_ID
): Promise<UniversalDeskAssignment[]> {
  const cleanOrgId =
    !orgId || orgId === 'demo-grace-chapel' || orgId.startsWith('demo-')
      ? GREAT_FAITH_MINISTRIES_DEFAULT_ID
      : orgId;

  // Ensure all 9 Revelation 2: Course Connection documents are onboarded first
  const churchUnits = await ensureAllDetectedLinksOnboarded(cleanOrgId);
  const existing = readStoredAssignments();

  const existingUnitIds = new Set(existing.map(a => a.unitId));
  const additions: UniversalDeskAssignment[] = [];
  const now = Date.now();

  // Seed the Revelation 2 units into Great Faith Ministries Christian Education classrooms
  const classroomRotation = [
    { id: 'prog-adult-bible-study', name: 'Wednesday Sanctuary Bible Study (Rev 2)' },
    { id: 'prog-sunday-school', name: 'Sunday Morning Christian Education' },
    { id: 'prog-theology-track', name: 'Great Faith Leadership & Theology Track' },
  ];

  churchUnits.forEach((unit, idx) => {
    if (existingUnitIds.has(unit.id)) return;
    const targetClass = classroomRotation[idx % classroomRotation.length];
    const tpl = unit.livingTemplateId
      ? getLivingTemplateById(unit.livingTemplateId)
      : getDefaultLivingTemplateForUnit(unit.kind, unit.title);

    additions.push({
      id: `desk_assign_${unit.id}`,
      unitId: unit.id,
      telaDocId: unit.telaDocId,
      domain: 'CHRISTIAN_EDUCATION',
      orgId: cleanOrgId,
      orgName: GREAT_FAITH_MINISTRIES_NAME,
      classroomId: targetClass.id,
      classroomName: targetClass.name,
      departmentFolder: unit.departmentFolder || 'Christian Education',
      title: unit.title,
      subtitle: unit.subtitle,
      instructions:
        unit.kind === 'QUIZ' || unit.kind === 'TEST'
          ? 'Complete all assessment prompts on your Tela Desk, review your Sacred Library primary sources, and click Turn In to auto-grade and update your Mastery Graph.'
          : 'Read the Frame 1 Scripture & Lesson guide, inspect the attached Lorea Sacred Library primary sources in your Desk Reference Drawer, fill out each worksheet prompt, and Turn In to your instructor.',
      unitKind: unit.kind,
      livingTemplateId: tpl.id,
      assignedByUid: 'instructor_great_faith',
      assignedByName: 'Pastor & Christian Education Faculty',
      assignedAt: now - (9 - idx) * 3600_000,
      dueAt: now + ((idx % 4) + 1) * 86400_000,
      dueLabel:
        idx === 0
          ? 'Due Today · Sunday 9:15 AM'
          : idx === 1
          ? 'Due Tomorrow · 11:59 PM'
          : `Due in ${(idx % 5) + 2} Days`,
      totalPoints: unit.totalPoints,
      questionCount: unit.questions.length,
      toolsConfig: {
        allowSacredLibraryAndReferences: true,
        allowSelfCheckBeforeTurnIn: true,
        allowScratchpadNotes: true,
        allowHandRaiseQuestion: true,
      },
      unitSnapshot: unit,
    });
  });

  // Also seed the 2 Academia units so Academia & Universal views have STEM & ELA work ready
  const acadUnits = buildStarterAcademiaUnits();
  acadUnits.forEach((unit, idx) => {
    if (existingUnitIds.has(unit.id)) return;
    additions.push({
      id: `desk_assign_${unit.id}`,
      unitId: unit.id,
      telaDocId: unit.telaDocId,
      domain: 'ACADEMIA',
      orgId: 'academia-campus',
      orgName: 'Plajah Academia',
      classroomId: unit.programId || 'class-academia',
      classroomName: idx === 0 ? 'Honors Humanities & Literature' : 'STEM Quantitative & Astronomy Lab',
      departmentFolder: unit.departmentFolder || 'Academia',
      title: unit.title,
      subtitle: unit.subtitle,
      instructions:
        'Complete the interactive Tela worksheet on your Student Desk. Use the Self-Check tool to verify your answers before turning in.',
      unitKind: unit.kind,
      livingTemplateId: unit.livingTemplateId || 'ws-celestial-astrolabe',
      assignedByUid: 'teacher_academia',
      assignedByName: 'Prof. Elena Vance · Academia Faculty',
      assignedAt: now - 14400_000,
      dueAt: now + (idx + 1) * 86400_000,
      dueLabel: idx === 0 ? 'Due Tomorrow · 3:30 PM' : 'Due Friday · 5:00 PM',
      totalPoints: unit.totalPoints,
      questionCount: unit.questions.length,
      toolsConfig: {
        allowSacredLibraryAndReferences: true,
        allowSelfCheckBeforeTurnIn: true,
        allowScratchpadNotes: true,
        allowHandRaiseQuestion: true,
      },
      unitSnapshot: unit,
    });
  });

  if (additions.length > 0) {
    const merged = [...additions, ...existing];
    writeStoredAssignments(merged);
    return merged;
  }

  return existing;
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

  const updatedUnit: IngestedCurriculumUnit = {
    ...params.unit,
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
    instructions:
      params.instructions?.trim() ||
      'Read the lesson materials and Sacred Library primary sources, fill out each prompt on your Tela Student Desk, and click Turn In when finished.',
    unitKind: params.unit.kind,
    livingTemplateId: tplId,
    assignedByUid: params.assignedByUid || 'instructor_great_faith',
    assignedByName: params.assignedByName || 'Class Instructor',
    assignedAt: Date.now(),
    dueAt: params.dueAt || Date.now() + 2 * 86400_000,
    dueLabel: params.dueLabel || 'Due This Week',
    ...(params.opensAt && params.opensAt > Date.now() ? { opensAt: params.opensAt } : {}),
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
  return assignment;
}

/** Which copy of an assignment is newest (assigned, or later moved on the calendar). */
export const deskStamp = (a: Pick<UniversalDeskAssignment, 'assignedAt' | 'rescheduledAt'>) => Math.max(a.assignedAt || 0, a.rescheduledAt || 0);

/** Students see scheduled work from its open time; whoever assigned it always sees it. */
export function isOpenFor(a: Pick<UniversalDeskAssignment, 'opensAt' | 'assignedByUid'>, uid: string, now = Date.now()): boolean {
  return !a.opensAt || a.opensAt <= now || a.assignedByUid === uid;
}

/** Moves an assigned item to new dates (calendar drag or edit). Returns the updated assignment, or null if it isn't on this device. */
export function rescheduleDeskAssignment(id: string, at: { dueAt: number; dueLabel: string; opensAt?: number | null }): UniversalDeskAssignment | null {
  const all = readStoredAssignments();
  const cur = all.find(a => a.id === id);
  if (!cur) return null;
  const { opensAt: _old, ...rest } = cur;
  const next: UniversalDeskAssignment = { ...rest, dueAt: at.dueAt, dueLabel: at.dueLabel, rescheduledAt: Date.now(), ...(at.opensAt && at.opensAt > Date.now() ? { opensAt: at.opensAt } : {}) };
  writeStoredAssignments(all.map(a => (a.id === id ? next : a)));
  void mirrorAssignment(next);
  return next;
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
  return updated;
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
}): {
  workspace: StudentDeskWorkspaceState;
  submission: StudentUnitSubmission;
} {
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
  };

  map[params.assignment.id] = workspace;
  writeWorkspaceMap(params.studentUid, map);
  void mirrorTurnIn(params.assignment, workspace);

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
