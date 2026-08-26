// worksheetGrading — pre-assessment of turned-in work + the teacher's turn-in brief.
//
// This is the deterministic heart of the "photograph the completed paper → the teacher's dashboard
// shows how each student did" workflow. It is pure and side-effect-free so it runs identically in the
// browser and in node:test; the DOM/model work (reading handwriting off a scan) lives in the reader.
//
// A PRE-assessment is exactly that: an automated first pass the teacher reviews, never authoritative
// grading. Anything the machine can't read confidently, and every open-response field, is routed to
// `needs_review` rather than silently scored — so the teacher is never shown a wrong number as fact.

import { autoGradeWorksheet, type DigitalWorksheet, type WorksheetField } from './worksheetDigitizer';

/** How one field's response landed after the automated pass. */
export type FieldResponseStatus = 'correct' | 'incorrect' | 'needs_review' | 'blank';

export interface FieldResponse {
  fieldId: string;
  label: string;
  /** Best-effort read of the student's answer (may be empty). */
  extracted: string;
  /** Ink/text was present in the answer area. */
  answered: boolean;
  /** 0..1 confidence in the READ (low ⇒ routed to needs_review, never auto-scored). */
  readConfidence: number;
  status: FieldResponseStatus;
  /** The answer key, when the field has one. */
  expected?: string;
  points: number;
  awarded: number;
  /** For a keyed field routed to needs_review (e.g. a handwriting read), the tentative key-match
   *  the teacher can confirm with one click. Undefined when there is no key or no answer. */
  suggestedCorrect?: boolean;
}

export interface WorksheetPreAssessment {
  studentId: string;
  studentName: string;
  totalFields: number;
  answeredCount: number;
  /** answered / total, 0..100. */
  completionPct: number;
  /** Fields that carry an answer key (auto-gradable). */
  autoGradableCount: number;
  correctCount: number;
  incorrectCount: number;
  needsReviewCount: number;
  /** Score over AUTO-GRADABLE points only, 0..100, or null when nothing was auto-gradable. */
  estimatedScorePct: number | null;
  /** Mean read confidence over answered fields, 0..1. */
  overallConfidence: number;
  recommendation: 'ready_to_finalize' | 'needs_review' | 'mostly_blank';
  /** Human-facing flags for the dashboard (e.g. 'blank_submission', 'illegible_answers'). */
  flags: string[];
  perField: FieldResponse[];
  gradedAt: number;
}

/** What the reader hands in for one student's completed scan. */
export interface CompletedReading {
  /** fieldId → best-effort extracted answer text. */
  answers: Record<string, string>;
  /** fieldId → 0..1 read confidence. */
  confidence?: Record<string, number>;
  /** fieldId → whether ink/marks were present (defaults to: extracted text is non-empty). */
  answered?: Record<string, boolean>;
}

const READ_TRUST = 0.5; // below this, we refuse to auto-score and route to the teacher

const hasKey = (field: WorksheetField) => !field.needsManualGrade && field.correctAnswer !== undefined && String(field.correctAnswer).trim() !== '';

/**
 * Turn one student's completed-scan reading into a reviewable pre-assessment.
 * Reuses `autoGradeWorksheet` for the actual key-matching, then layers on read confidence,
 * answered/blank, and a teacher-facing recommendation.
 */
export function preAssessWorksheet(
  sheet: DigitalWorksheet,
  reading: CompletedReading,
  student: { id: string; name: string },
  now: number,
): WorksheetPreAssessment {
  const answers = reading.answers || {};
  const confidence = reading.confidence || {};
  const answeredMap = reading.answered || {};
  const grade = autoGradeWorksheet(sheet, answers);
  const gradeByField = new Map(grade.perField.map(result => [result.fieldId, result]));

  const perField: FieldResponse[] = sheet.fields.map(field => {
    const extracted = (answers[field.id] ?? '').toString().trim();
    const answered = field.id in answeredMap ? !!answeredMap[field.id] : extracted !== '';
    const readConfidence = Math.max(0, Math.min(1, confidence[field.id] ?? (answered ? 0.6 : 0)));
    const graded = gradeByField.get(field.id);
    let status: FieldResponseStatus;
    let awarded = 0;
    if (!answered) {
      status = 'blank';
    } else if (!hasKey(field)) {
      status = 'needs_review'; // open response — a human grades it
    } else if (readConfidence < READ_TRUST) {
      status = 'needs_review'; // we read it, but not confidently enough to score
    } else if (graded?.correct === true) {
      status = 'correct'; awarded = field.points;
    } else {
      status = 'incorrect';
    }
    // Even when routed to review, surface the tentative key-match so the teacher sees a suggested grade.
    const suggestedCorrect = (answered && hasKey(field) && status === 'needs_review' && graded)
      ? graded.correct === true : undefined;
    return {
      fieldId: field.id, label: field.label, extracted, answered, readConfidence, status,
      expected: hasKey(field) ? String(field.correctAnswer) : undefined,
      points: field.points, awarded,
      ...(suggestedCorrect !== undefined ? { suggestedCorrect } : {}),
    };
  });

  const totalFields = perField.length;
  const answeredCount = perField.filter(r => r.answered).length;
  const autoGradableCount = sheet.fields.filter(hasKey).length;
  const correctCount = perField.filter(r => r.status === 'correct').length;
  const incorrectCount = perField.filter(r => r.status === 'incorrect').length;
  const needsReviewCount = perField.filter(r => r.status === 'needs_review').length;
  const gradablePoints = perField.filter(r => hasKey(sheet.fields.find(f => f.id === r.fieldId)!)).reduce((s, r) => s + r.points, 0);
  const awardedPoints = perField.reduce((s, r) => s + r.awarded, 0);
  const estimatedScorePct = gradablePoints > 0 ? Math.round((awardedPoints / gradablePoints) * 100) : null;
  const completionPct = totalFields ? Math.round((answeredCount / totalFields) * 100) : 0;
  const answeredConfidences = perField.filter(r => r.answered).map(r => r.readConfidence);
  const overallConfidence = answeredConfidences.length ? +(answeredConfidences.reduce((a, b) => a + b, 0) / answeredConfidences.length).toFixed(2) : 0;

  const flags: string[] = [];
  if (answeredCount === 0) flags.push('blank_submission');
  const lowConf = perField.filter(r => r.answered && r.readConfidence < READ_TRUST).length;
  if (lowConf >= Math.max(2, Math.ceil(answeredCount * 0.4))) flags.push('illegible_answers');
  if (autoGradableCount > 0 && correctCount === autoGradableCount && incorrectCount === 0) flags.push('all_correct');
  if (autoGradableCount > 0 && estimatedScorePct !== null && estimatedScorePct <= 40) flags.push('low_score');
  if (needsReviewCount > 0) flags.push('teacher_review_needed');

  let recommendation: WorksheetPreAssessment['recommendation'];
  if (completionPct < 25) recommendation = 'mostly_blank';
  else if (needsReviewCount > 0 || overallConfidence < 0.55) recommendation = 'needs_review';
  else recommendation = 'ready_to_finalize';

  return {
    studentId: student.id, studentName: student.name, totalFields, answeredCount, completionPct,
    autoGradableCount, correctCount, incorrectCount, needsReviewCount, estimatedScorePct,
    overallConfidence, recommendation, flags, perField, gradedAt: now,
  };
}

// ── Teacher turn-in brief ───────────────────────────────────────────────────────────

export interface TurnInBriefRow {
  studentId: string;
  studentName: string;
  status: 'turned_in' | 'not_turned_in';
  completionPct: number;
  estimatedScorePct: number | null;
  needsReviewCount: number;
  recommendation: WorksheetPreAssessment['recommendation'] | null;
  flags: string[];
}

export interface TurnInBrief {
  assignmentTitle: string;
  rosterSize: number;
  turnedIn: number;
  notTurnedIn: number;
  averageScorePct: number | null;
  averageCompletionPct: number;
  /** Students the teacher should look at first (not ready to finalize), worst-first. */
  needsReviewQueue: TurnInBriefRow[];
  /** Score distribution over students with an estimated score. */
  distribution: { band: string; count: number }[];
  /** Fields the class struggled with most (highest miss rate), for reteaching. */
  hardestFields: { fieldId: string; label: string; missRate: number; attempts: number }[];
  rows: TurnInBriefRow[];
  generatedAt: number;
}

const SCORE_BANDS: Array<{ band: string; min: number; max: number }> = [
  { band: '90–100', min: 90, max: 100 },
  { band: '80–89', min: 80, max: 89 },
  { band: '70–79', min: 70, max: 79 },
  { band: '60–69', min: 60, max: 69 },
  { band: '0–59', min: 0, max: 59 },
];

/**
 * Aggregate every student's pre-assessment into the brief the teacher sees on turn-in:
 * who's done, class average, who needs a look, and which questions the class struggled with.
 */
export function buildTurnInBrief(
  assignmentTitle: string,
  assessments: WorksheetPreAssessment[],
  roster: Array<{ id: string; name: string }>,
  now: number,
): TurnInBrief {
  const byStudent = new Map(assessments.map(a => [a.studentId, a]));
  const rows: TurnInBriefRow[] = roster.map(student => {
    const a = byStudent.get(student.id);
    return a
      ? { studentId: student.id, studentName: student.name, status: 'turned_in' as const, completionPct: a.completionPct, estimatedScorePct: a.estimatedScorePct, needsReviewCount: a.needsReviewCount, recommendation: a.recommendation, flags: a.flags }
      : { studentId: student.id, studentName: student.name, status: 'not_turned_in' as const, completionPct: 0, estimatedScorePct: null, needsReviewCount: 0, recommendation: null, flags: [] };
  });

  const turnedInRows = rows.filter(r => r.status === 'turned_in');
  const scored = turnedInRows.filter(r => r.estimatedScorePct !== null).map(r => r.estimatedScorePct as number);
  const averageScorePct = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
  const averageCompletionPct = turnedInRows.length ? Math.round(turnedInRows.reduce((s, r) => s + r.completionPct, 0) / turnedInRows.length) : 0;

  const needsReviewQueue = turnedInRows
    .filter(r => r.recommendation !== 'ready_to_finalize')
    .sort((a, b) => (b.needsReviewCount - a.needsReviewCount) || ((a.estimatedScorePct ?? 101) - (b.estimatedScorePct ?? 101)));

  const distribution = SCORE_BANDS.map(({ band, min, max }) => ({
    band, count: scored.filter(s => s >= min && s <= max).length,
  }));

  // Per-field miss rate across all turned-in students (only auto-graded correct/incorrect count).
  const fieldStats = new Map<string, { label: string; miss: number; attempts: number }>();
  for (const a of assessments) for (const f of a.perField) {
    if (f.status !== 'correct' && f.status !== 'incorrect') continue;
    const cur = fieldStats.get(f.fieldId) || { label: f.label, miss: 0, attempts: 0 };
    cur.attempts++; if (f.status === 'incorrect') cur.miss++;
    fieldStats.set(f.fieldId, cur);
  }
  const hardestFields = [...fieldStats.entries()]
    .map(([fieldId, s]) => ({ fieldId, label: s.label, missRate: s.attempts ? +(s.miss / s.attempts).toFixed(2) : 0, attempts: s.attempts }))
    .filter(f => f.missRate > 0)
    .sort((a, b) => b.missRate - a.missRate || b.attempts - a.attempts)
    .slice(0, 5);

  return {
    assignmentTitle, rosterSize: roster.length, turnedIn: turnedInRows.length, notTurnedIn: roster.length - turnedInRows.length,
    averageScorePct, averageCompletionPct, needsReviewQueue, distribution, hardestFields, rows, generatedAt: now,
  };
}

// ── Demo support ────────────────────────────────────────────────────────────────────

/**
 * Deterministically simulate a class's turned-in work for demos and previews (no real roster).
 * Uses an FNV hash so the same class + worksheet always yields the same varied result: a couple of
 * students haven't turned in, some fields are blank, keyed answers are ~65% correct. High confidence
 * models a typed digital turn-in (keyed fields auto-grade); swap in real readings for live classes.
 */
export function simulateTurnIns(
  sheet: DigitalWorksheet,
  roster: Array<{ id: string; name: string }>,
  now: number,
): WorksheetPreAssessment[] {
  const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const out: WorksheetPreAssessment[] = [];
  for (const student of roster) {
    if (hash(student.id + '|' + sheet.id) % 100 < 15) continue; // ~15% haven't turned in
    const answers: Record<string, string> = {}, confidence: Record<string, number> = {}, answered: Record<string, boolean> = {};
    for (const field of sheet.fields) {
      const r = hash(student.id + '|' + field.id) % 100;
      if (r < 10) continue; // ~10% of fields left blank
      answered[field.id] = true;
      confidence[field.id] = 0.85; // typed digital turn-in
      if (hasKey(field)) answers[field.id] = r > 35 ? String(field.correctAnswer) : `${field.correctAnswer}x`; // ~65% correct
      else answers[field.id] = 'response';
    }
    out.push(preAssessWorksheet(sheet, { answers, confidence, answered }, student, now));
  }
  return out;
}
