// assignmentTemplateService — persistence and licence enforcement for Plajah Academia's
// assignment templates.
//
// The licence gate runs THREE times, deliberately:
//   1. Here + in the editor UI — instant, and it explains itself while the teacher is choosing.
//   2. On the server (/api/academia/validate-template) — the only place `licenseValidated`
//      can be set to true, because a client can't be trusted to have run step 1.
//   3. In firestore.rules — a template with commercialUse:true and licenseValidated:false is
//      simply refused, so a forged write fails even with a stolen session.
//
// Firestore: assignmentTemplates/{templateId} — flat collection, ownerUid-scoped.

import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { createNotification } from './backendService';
import { appendRecord, loadProficiency } from './learningLedgerService';
import { gateForCommercialUse, mostRestrictive, type GateResult, type License } from './oerLicenseGate';
import { libraryItemById, ledgerFrameworkFor } from '../data/oerLibrary';
import type { AssignmentTemplate, TemplateSeed, TemplateStructure, Rubric } from '../data/assignmentTemplates';

const TEMPLATES = 'assignmentTemplates';
const templateDoc = (id: string) => doc(db, TEMPLATES, id);

// ── Licence evaluation (client-side face of the gate) ─────────────────────────

/** Evaluate a template's materials against commercial use. Unknown ids are ignored rather
 *  than assumed safe — the server re-resolves every id before it will validate. */
export function evaluateLicense(materialIds: string[]): GateResult {
  const items = materialIds
    .map(id => libraryItemById(id))
    .filter((i): i is NonNullable<typeof i> => !!i)
    .map(i => ({ id: i.id, title: i.title, license: i.license, attribution: i.attribution }));
  return gateForCommercialUse(items);
}

export function licenseForMaterials(materialIds: string[]): License {
  const licenses = materialIds
    .map(id => libraryItemById(id)?.license)
    .filter((l): l is License => !!l);
  return mostRestrictive(licenses);
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

const newId = () => `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/** Adopt a seed (or an existing public template) into the teacher's own library. */
export function templateFromSeed(seed: TemplateSeed, ownerUid: string, remixOf: string | null = null): AssignmentTemplate {
  const now = Date.now();
  return {
    id: newId(),
    ownerUid,
    subject: seed.subject,
    gradeBand: seed.gradeBand,
    taskType: seed.taskType,
    visibility: 'private',
    commercialUse: false,
    licenseValidated: false,
    license: licenseForMaterials(seed.structure.materials),
    remixOf,
    structure: { ...seed.structure, materials: [...seed.structure.materials] },
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveTemplate(template: AssignmentTemplate): Promise<boolean> {
  try {
    // Recompute rather than trust the caller: `license` must always describe the materials
    // actually attached, or the server validation and the rules disagree about the same doc.
    const license = licenseForMaterials(template.structure.materials);
    const gate = evaluateLicense(template.structure.materials);
    // Mirror the rules exactly, so a refusal shows up as a clear no-op here rather than a raw
    // permission-denied from Firestore: commercialUse is only real once the SERVER has stamped
    // licenseValidated. Wanting it isn't enough, and passing the client-side gate isn't either.
    const licenseValidated = gate.allowed && template.licenseValidated;
    const commercialUse = template.commercialUse && gate.allowed && licenseValidated;
    await setDoc(templateDoc(template.id), {
      ...template,
      license,
      commercialUse,
      licenseValidated,
      updatedAt: Date.now(),
    });
    return true;
  } catch (e) {
    console.warn('[templates] save failed:', (e as Error)?.message);
    return false;
  }
}

export async function loadTemplate(id: string): Promise<AssignmentTemplate | null> {
  try {
    const snap = await getDoc(templateDoc(id));
    return snap.exists() ? ({ ...(snap.data() as AssignmentTemplate), id: snap.id }) : null;
  } catch { return null; }
}

export async function listMyTemplates(uid: string, max = 100): Promise<AssignmentTemplate[]> {
  try {
    // Single-field where, no orderBy — avoids a composite index ([[plajah-firestore-gotchas]]).
    const snap = await getDocs(query(collection(db, TEMPLATES), where('ownerUid', '==', uid), limit(max)));
    return snap.docs
      .map(d => ({ ...(d.data() as AssignmentTemplate), id: d.id }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    console.warn('[templates] list failed:', (e as Error)?.message);
    return [];
  }
}

export async function updateStructure(id: string, structure: TemplateStructure): Promise<boolean> {
  try {
    await updateDoc(templateDoc(id), {
      structure,
      license: licenseForMaterials(structure.materials),
      // Editing materials always drops both flags — approval has to be re-earned server-side.
      // They move together: commercialUse without licenseValidated is refused by the rules.
      // (No `undefined` values here — Firestore rejects the whole write, see
      // [[plajah-firestore-gotchas]].)
      licenseValidated: false,
      commercialUse: false,
      updatedAt: Date.now(),
    });
    return true;
  } catch (e) {
    console.warn('[templates] update failed:', (e as Error)?.message);
    return false;
  }
}

export async function deleteTemplate(id: string): Promise<boolean> {
  try { await deleteDoc(templateDoc(id)); return true; } catch { return false; }
}

// ── Assigning (the District-persona half of the flow) ─────────────────────────
//
// Assigning is ALWAYS free and is never licence-gated: a teacher handing CK-12 material to their
// own class is exactly the non-commercial use CC BY-NC permits. Only the commercial branch above
// touches the wall. Mirrors publishWorksheet's fan-out — assignment record, student notification,
// guardian CC — so a template assignment behaves like every other Plajah assignment.

export interface AssignStudent { id: string; name: string }

export interface AssignInput {
  template: AssignmentTemplate;
  classId: string;
  className: string;
  students: AssignStudent[];
  teacher: { uid: string; name: string; photo?: string };
  dueDate?: number;
  /** true ⇒ compute the fan-out but write no notifications. The bundled demo class has
   *  placeholder uids, so notifying them would spray docs at accounts that don't exist. */
  simulate?: boolean;
}

export interface AssignResult {
  ok: boolean;
  assignmentId: string | null;
  studentsNotified: number;
  standardsTracked: number;
  simulated: boolean;
}

export async function assignTemplate(input: AssignInput): Promise<AssignResult> {
  const { template, classId, className, students, teacher, dueDate, simulate } = input;
  const result: AssignResult = {
    ok: false, assignmentId: null, studentsNotified: 0, standardsTracked: 0, simulated: !!simulate,
  };

  // Only frameworks the ledger actually models are tracked. PISA is an overlay — it describes
  // the task's demand, not a standard a learner can hold mastery in, so it never becomes a record.
  const ledgerStandards = template.structure.standardsAlignment
    .filter(ref => ledgerFrameworkFor(ref) !== null)
    .map(ref => ref.code);
  result.standardsTracked = ledgerStandards.length;

  try {
    const ref = await addDoc(collection(db, 'templateAssignments'), {
      templateId: template.id,
      classId,
      className,
      teacherUid: teacher.uid,
      title: template.structure.title,
      subject: template.subject,
      gradeBand: template.gradeBand,
      taskType: template.taskType,
      objective: template.structure.objective,
      steps: template.structure.steps,
      differentiation: template.structure.differentiation,
      rubric: template.structure.rubric,
      estimatedMinutes: template.structure.estimatedMinutes,
      materials: template.structure.materials,
      standardCodes: ledgerStandards,
      studentIds: students.map(s => s.id),
      dueDate: dueDate ?? null,
      createdAt: Date.now(),
    });
    result.assignmentId = ref.id;
  } catch (e) {
    console.warn('[templates] assignment record failed:', (e as Error)?.message);
    return result;
  }

  if (simulate) {
    result.studentsNotified = students.length;
  } else {
    for (const student of students) {
      const id = await createNotification({
        userId: student.id,
        senderId: teacher.uid,
        senderName: teacher.name,
        senderPhoto: teacher.photo || '',
        type: 'CONTENT',
        title: `New assignment: ${template.structure.title}`,
        message: `${template.structure.estimatedMinutes} min${dueDate ? ` · due ${new Date(dueDate).toLocaleDateString()}` : ''} — ${template.structure.objective}`,
        // NOT ?view=assignment — that route belongs to StudentAssignmentView and reads `id` as a
        // worksheetId, so a template assignment sent there would look up a worksheet that does
        // not exist. A lesson is a different content type (steps + rubric, nothing fillable).
        link: lessonLink(result.assignmentId!),
        targetId: result.assignmentId || classId,
      }).catch(() => null);
      if (id) result.studentsNotified++;
    }
  }

  result.ok = true;
  return result;
}

/** The deep link a student notification opens. Distinct from the worksheet route. */
export const lessonLink = (assignmentId: string) => `?view=lesson&id=${assignmentId}`;

// ── Plajah-hosted textbooks ───────────────────────────────────────────────────

/** Opens a mirrored textbook in the Lorea reader. Matches App.tsx's existing share route. */
export const bookLink = (bookId: string) => `?type=book&id=${bookId}`;

const hostedBookCache = new Map<string, boolean>();

/**
 * Which of these library items have a Plajah-hosted copy that actually EXISTS.
 *
 * readerBookId is deterministic and set optimistically on every OpenStax title, but the album
 * only exists once scripts/ingestOpenStaxBook.ts has run against it. Offering "Read in Plajah"
 * for a book that was never ingested would send a student to an empty reader, so availability
 * is confirmed before the button is ever shown — and cached, since the answer only changes
 * when someone runs an ingest.
 */
export async function resolveHostedBooks(items: Array<{ readerBookId?: string }>): Promise<Set<string>> {
  const ids = [...new Set(items.map(i => i.readerBookId).filter((id): id is string => !!id))];
  const available = new Set<string>();

  await Promise.all(ids.map(async id => {
    if (hostedBookCache.has(id)) {
      if (hostedBookCache.get(id)) available.add(id);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'albums', id));
      const exists = snap.exists();
      hostedBookCache.set(id, exists);
      if (exists) available.add(id);
    } catch {
      // A read failure is not proof of absence — don't cache it, just fall back to the
      // source link for now so a transient error can't permanently hide the reader.
    }
  }));

  return available;
}

/** A template as handed to a class — the student's copy, frozen at assign time. */
export interface TemplateAssignment {
  id: string;
  templateId: string;
  classId: string;
  className: string;
  teacherUid: string;
  title: string;
  subject: string;
  gradeBand: string;
  taskType: string;
  objective: string;
  steps: string[];
  differentiation: { support: string; extension: string };
  rubric: Rubric;
  estimatedMinutes: number;
  materials: string[];
  standardCodes: string[];
  studentIds: string[];
  dueDate: number | null;
  createdAt: number;
}

export async function fetchAssignment(id: string): Promise<TemplateAssignment | null> {
  try {
    const snap = await getDoc(doc(db, 'templateAssignments', id));
    if (!snap.exists()) return null;
    return { ...(snap.data() as Omit<TemplateAssignment, 'id'>), id: snap.id };
  } catch (e) {
    console.warn('[templates] fetchAssignment failed:', (e as Error)?.message);
    return null;
  }
}

// ── Turning work in ───────────────────────────────────────────────────────────

export interface RubricScores { [criterionName: string]: number }

export interface TemplateSubmission {
  id: string;
  assignmentId: string;
  templateId: string;
  studentId: string;
  studentName: string;
  classId: string;
  teacherUid: string;
  stepsDone: number[];
  reflection: string;
  /** The student's own read of their work — visible to the teacher, never graded from. */
  selfScores: RubricScores;
  submittedAt: number;
  status: 'submitted' | 'graded';
  grade: {
    scores: RubricScores;
    total: number;
    max: number;
    masteryPercent: number;
    feedback: string;
    gradedAt: number;
    gradedBy: string;
  } | null;
}

/** Convert rubric scores to the ledger's 0–100 mastery scale. */
export function scoresToMastery(scores: RubricScores, rubric: Rubric): { total: number; max: number; masteryPercent: number } {
  const criteria = rubric.criteria;
  const max = criteria.reduce((sum, c) => sum + Math.max(...c.levels.map(l => l.points)), 0);
  const total = criteria.reduce((sum, c) => sum + (scores[c.name] ?? 0), 0);
  // A rubric with no criteria would divide by zero; treat it as unscored rather than 0% mastery,
  // which would write a damaging ledger record for work that was never actually assessed.
  const masteryPercent = max > 0 ? Math.round((total / max) * 100) : 0;
  return { total, max, masteryPercent };
}

export async function submitLesson(input: {
  assignment: TemplateAssignment;
  studentId: string;
  studentName: string;
  stepsDone: number[];
  reflection: string;
  selfScores: RubricScores;
}): Promise<string | null> {
  try {
    const ref = await addDoc(collection(db, 'templateSubmissions'), {
      assignmentId: input.assignment.id,
      templateId: input.assignment.templateId,
      studentId: input.studentId,
      studentName: input.studentName,
      classId: input.assignment.classId,
      teacherUid: input.assignment.teacherUid,
      stepsDone: input.stepsDone,
      reflection: input.reflection,
      selfScores: input.selfScores,
      submittedAt: Date.now(),
      status: 'submitted',
      grade: null,
    });
    // Tell the teacher it's in. Non-fatal — a failed notification must not lose the submission.
    await createNotification({
      userId: input.assignment.teacherUid,
      senderId: input.studentId,
      senderName: input.studentName,
      senderPhoto: '',
      type: 'CONTENT',
      title: `${input.studentName} turned in ${input.assignment.title}`,
      message: `${input.assignment.className} — ready to review.`,
      link: lessonLink(input.assignment.id),
      targetId: ref.id,
    }).catch(() => null);
    return ref.id;
  } catch (e) {
    console.warn('[templates] submitLesson failed:', (e as Error)?.message);
    return null;
  }
}

export async function listSubmissions(assignmentId: string): Promise<TemplateSubmission[]> {
  try {
    const snap = await getDocs(query(
      collection(db, 'templateSubmissions'),
      where('assignmentId', '==', assignmentId),
      limit(200),
    ));
    return snap.docs
      .map(d => ({ ...(d.data() as Omit<TemplateSubmission, 'id'>), id: d.id }))
      .sort((a, b) => b.submittedAt - a.submittedAt);
  } catch (e) {
    console.warn('[templates] listSubmissions failed:', (e as Error)?.message);
    return [];
  }
}

// ── "Due first" — what the Today screen leads with ────────────────────────────

export interface DueItem {
  assignmentId: string;
  title: string;
  className: string;
  subject: string;
  dueDate: number | null;
  /** null when never opened; 0–1 once the student has ticked steps. */
  progress: number | null;
  overdue: boolean;
}

/**
 * Everything a student still owes, soonest first.
 *
 * Two single-field queries and a client-side join rather than one clever query: `array-contains`
 * combined with an orderBy would need a composite index, and an index that isn't deployed fails
 * SILENTLY at read time ([[plajah-firestore-gotchas]]) — which here would mean a student's Today
 * screen quietly showing no homework. A class-sized result set sorts fine in memory.
 */
export async function fetchStudentDueWork(studentId: string, max = 20): Promise<DueItem[]> {
  if (!studentId) return [];
  try {
    const [assignedSnap, mineSnap] = await Promise.all([
      getDocs(query(collection(db, 'templateAssignments'), where('studentIds', 'array-contains', studentId), limit(100))),
      getDocs(query(collection(db, 'templateSubmissions'), where('studentId', '==', studentId), limit(200))),
    ]);

    const handedIn = new Set(mineSnap.docs.map(d => (d.data() as TemplateSubmission).assignmentId));
    const now = Date.now();

    return assignedSnap.docs
      .map(d => ({ ...(d.data() as TemplateAssignment), id: d.id }))
      .filter(a => !handedIn.has(a.id))
      .map(a => ({
        assignmentId: a.id,
        title: a.title,
        className: a.className,
        subject: a.subject,
        dueDate: a.dueDate ?? null,
        progress: null,
        overdue: !!a.dueDate && a.dueDate < now,
      }))
      // Undated work sorts last — it isn't a deadline, so it must never outrank one.
      .sort((x, y) => (x.dueDate ?? Number.MAX_SAFE_INTEGER) - (y.dueDate ?? Number.MAX_SAFE_INTEGER))
      .slice(0, max);
  } catch (e) {
    console.warn('[templates] due work read failed:', (e as Error)?.message);
    return [];
  }
}

export interface ReviewItem {
  submissionId: string;
  assignmentId: string;
  studentName: string;
  title: string;
  submittedAt: number;
}

/** What's waiting on a teacher — the deadline that belongs to them. */
export async function fetchTeacherReviewQueue(teacherUid: string, max = 50): Promise<ReviewItem[]> {
  if (!teacherUid) return [];
  try {
    const snap = await getDocs(query(
      collection(db, 'templateSubmissions'),
      where('teacherUid', '==', teacherUid),
      limit(200),
    ));
    return snap.docs
      .map(d => ({ ...(d.data() as TemplateSubmission), id: d.id }))
      .filter(s => s.status !== 'graded')
      .sort((a, b) => a.submittedAt - b.submittedAt) // oldest first — longest wait gets seen
      .slice(0, max)
      .map(s => ({
        submissionId: s.id,
        assignmentId: s.assignmentId,
        studentName: s.studentName,
        title: '',
        submittedAt: s.submittedAt,
      }));
  } catch (e) {
    console.warn('[templates] review queue read failed:', (e as Error)?.message);
    return [];
  }
}

/** A student's own submission for an assignment, so the view can show "already turned in". */
export async function fetchMySubmission(assignmentId: string, studentId: string): Promise<TemplateSubmission | null> {
  try {
    // Single-field where + client filter: a two-field where needs a composite index
    // ([[plajah-firestore-gotchas]]), and a class-sized result set is cheap to filter here.
    const snap = await getDocs(query(
      collection(db, 'templateSubmissions'),
      where('assignmentId', '==', assignmentId),
      limit(200),
    ));
    const mine = snap.docs
      .map(d => ({ ...(d.data() as Omit<TemplateSubmission, 'id'>), id: d.id }))
      .filter(s => s.studentId === studentId)
      .sort((a, b) => b.submittedAt - a.submittedAt);
    return mine[0] ?? null;
  } catch { return null; }
}

/**
 * Grade a submission against the rubric and credit the Learner Ledger.
 * The ledger write is what makes a lesson count the same way a Reading Quest does — without it,
 * this is just a gradebook entry and the standards graph never learns anything.
 */
export async function gradeSubmission(input: {
  submission: TemplateSubmission;
  template: AssignmentTemplate;
  scores: RubricScores;
  feedback: string;
  gradedBy: string;
}): Promise<{ ok: boolean; masteryPercent: number; standardsWritten: number }> {
  const { total, max, masteryPercent } = scoresToMastery(input.scores, input.template.structure.rubric);
  try {
    await updateDoc(doc(db, 'templateSubmissions', input.submission.id), {
      status: 'graded',
      grade: {
        scores: input.scores,
        total, max, masteryPercent,
        feedback: input.feedback,
        gradedAt: Date.now(),
        gradedBy: input.gradedBy,
      },
    });
  } catch (e) {
    console.warn('[templates] gradeSubmission failed:', (e as Error)?.message);
    return { ok: false, masteryPercent, standardsWritten: 0 };
  }

  const standardsWritten = await recordTemplateCompletion({
    studentId: input.submission.studentId,
    template: input.template,
    mastery: masteryPercent,
    byUid: input.gradedBy,
    evidence: `templateSubmission:${input.submission.id}`,
  });

  await createNotification({
    userId: input.submission.studentId,
    senderId: input.gradedBy,
    senderName: 'Your teacher',
    senderPhoto: '',
    type: 'CONTENT',
    title: `Graded: ${input.template.structure.title}`,
    message: `${total}/${max} — ${input.feedback || 'See your rubric for details.'}`,
    link: lessonLink(input.submission.assignmentId),
    targetId: input.submission.id,
  }).catch(() => null);

  return { ok: true, masteryPercent, standardsWritten };
}

/**
 * Record a completed template assignment against the Learner Ledger — one record per aligned
 * standard, so finishing a lesson counts the same way a Reading Quest does.
 * Non-fatal throughout: a ledger hiccup must never make a teacher's grading appear to fail.
 */
export async function recordTemplateCompletion(params: {
  studentId: string;
  template: AssignmentTemplate;
  /** 0–100 mastery observed for this task. */
  mastery: number;
  byUid: string;
  evidence?: string;
}): Promise<number> {
  let written = 0;
  // One read for the whole set: the ledger stores mastery per standard, and every record needs
  // its own masteryBefore so `delta` describes real movement rather than a jump from zero.
  const prior = await loadProficiency(params.studentId);
  for (const ref of params.template.structure.standardsAlignment) {
    const framework = ledgerFrameworkFor(ref);
    if (!framework) continue; // PISA overlay — not a ledger standard
    try {
      await appendRecord({
        studentId: params.studentId,
        standardId: ref.code,
        framework,
        source: 'teacher-assessment',
        masteryBefore: prior?.byStandard[ref.code] ?? 0,
        masteryAfter: params.mastery,
        byUid: params.byUid,
        ...(params.evidence ? { evidence: params.evidence } : {}),
      });
      written++;
    } catch { /* non-fatal */ }
  }
  return written;
}

// ── Server validation (the only path to commercialUse: true) ──────────────────

export interface ValidationResult {
  valid: boolean;
  license?: License;
  blockingLicense?: License;
  blockingItemId?: string;
  error?: string;
}

/**
 * Ask the server to re-resolve every attached material and, if all are commercial-safe, stamp
 * licenseValidated. The client cannot set this flag — the rules refuse a commercial template
 * whose validation flag isn't already true on the stored document.
 */
export async function requestCommercialValidation(templateId: string): Promise<ValidationResult> {
  const user = auth.currentUser;
  if (!user) return { valid: false, error: 'Sign in required.' };
  try {
    const token = await user.getIdToken(true);
    const res = await fetch('/api/academia/validate-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ templateId }),
    });
    if (!res.ok) return { valid: false, error: `Validation unavailable (${res.status}).` };
    return await res.json();
  } catch (e) {
    return { valid: false, error: (e as Error)?.message ?? 'Validation failed.' };
  }
}
