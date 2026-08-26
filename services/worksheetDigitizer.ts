// worksheetDigitizer — the linchpin of one-tap assignment authoring.
//
// A teacher captures/uploads a worksheet photo or document image; this service turns it into a
// structured, themeable, auto-gradable DigitalWorksheet in a single Gemini vision pass. The teacher's
// only required action is the capture — digitization, answer-key extraction, subject/objective
// understanding, and standards tagging all happen here automatically.
//
// Fields carry 0–100% bounding boxes (same convention as geminiService.analyzeThemeBackground) so the
// fillable version renders as an interactive overlay ON the original scan — it looks like the real
// worksheet. Grading is pure and local (autoGradeWorksheet): Phase 1 covers math / science / fact-based
// subjects whose answers aren't open to interpretation, so exact/numeric matching is trustworthy.
// Open-response fields are captured too but flagged needsManualGrade for the teacher to review.
//
// This service is intentionally UI-agnostic and side-effect-free apart from the Gemini call. Wiring the
// result into the platform (assignment doc, parent push, tutor, ledger) is done by callers so each seam
// stays testable. Mirrors learningLedgerService's "own-interfaces, guarded, non-fatal" style.

import { Type } from '@google/genai';
import type { GeminiCallResult } from './geminiService';
import { digitizeWorksheetOnDevice, readCompletedWorksheetOnDevice } from './worksheetLocalVision';

// ── Model ───────────────────────────────────────────────────────────────────────

export type WorksheetFieldType =
  | 'numeric'         // a number; graded with tolerance
  | 'short-text'      // a word/phrase; graded case/space-insensitive
  | 'multiple-choice' // one of `choices`
  | 'true-false'
  | 'fill-blank'      // blank inside a sentence; short-text grading
  | 'long-text';      // open response — captured but needsManualGrade

/** One answerable region on the worksheet, positioned as a 0–100% box over the source image. */
export interface WorksheetField {
  id: string;
  /** The question/prompt text as read from the sheet (blank shown as ____). */
  label: string;
  type: WorksheetFieldType;
  /** Bounding box of the ANSWER area, so the input overlays the right spot on the scan. */
  box: { x: number; y: number; width: number; height: number };
  /** Choices for multiple-choice, in the order printed. */
  choices?: string[];
  /** The correct answer for auto-grading. Absent ⇒ needsManualGrade. */
  correctAnswer?: string;
  /** For numeric answers, allowed +/- tolerance (absolute). Defaults to 0. */
  tolerance?: number;
  points: number;
  /** Education standards this specific field evidences (feeds the Learner Ledger). */
  standardIds?: string[];
  /** True for open-response the model couldn't key — teacher grades it. */
  needsManualGrade?: boolean;
  /** Model confidence 0..1. Low-confidence fields are always highlighted for teacher review. */
  confidence?: number;
  /** Printed question number/label, when present. */
  ordinal?: string;
}

export interface WorksheetSegment {
  id: string;
  kind: 'heading' | 'instructions' | 'question' | 'answer-region' | 'image' | 'diagram' | 'table' | 'decoration';
  box: { x: number; y: number; width: number; height: number };
  text?: string;
  fieldIds?: string[];
  confidence: number;
  style?: { fontSize?: number; fontWeight?: number; align?: 'left' | 'center' | 'right'; lineHeight?: number };
}

export interface WorksheetScanAssessment {
  score: number;
  textConfidence: number;
  layoutFidelity: number;
  fieldCoverage: number;
  understandingConfidence: number;
  teacherCorrections?: number;
  teacherRating?: number;
}

export interface WorksheetAutoFormatMetadata {
  profile: 'PLAJAH_PLUS';
  version: 1;
  appliedAt: number;
  confidence: number;
  headingsCreated: number;
  questionsOrganized: number;
  fieldsAligned: number;
  /** A short human-readable audit shown before a teacher publishes. */
  summary: string;
}

export interface DigitalWorksheet {
  id: string;
  title: string;
  subject: string;          // 'Math' | 'Science' | 'History' | …
  objective: string;        // one-line learning objective the model inferred
  gradeBand?: string;       // e.g. 'g34' — matches Classroom.gradeBand when known
  framework?: string;       // standards framework, e.g. 'CCSS_MATH'
  standardIds: string[];    // union of field standards, for roll-ups
  fields: WorksheetField[];
  sourceImageUrl?: string;  // the original scan (set by caller after upload)
  createdBy: string;        // teacher uid
  /** Students/guardians allowed to open the published copy. The teacher remains `createdBy`. */
  accessUids?: string[];
  createdAt: number;
  status: 'draft' | 'published';
  /** Optional theming the teacher applies; render layer reads this. Absent ⇒ default look. */
  theme?: { accent?: string; background?: string; font?: string; name?: string };
  /** True when any field needs manual grading — surfaces "review required" to the teacher. */
  hasManualFields: boolean;
  segments?: WorksheetSegment[];
  /** Overall OCR/layout confidence. The teacher review UI never hides this. */
  confidence?: number;
  reviewIssues?: string[];
  originalImageUrl?: string;
  cleanedImageUrl?: string;
  telaDocId?: string;
  intelligence?: { primary: 'on-device' | 'pokee' | 'claude' | 'manual'; ocr?: string; segmentation?: string; cloudCalls: number };
  scanAssessment?: WorksheetScanAssessment;
  autoFormat?: WorksheetAutoFormatMetadata;
}

// ── Digitize — local-first; cloud reasoning is an optional enhancement ────────────

const FIELD_TYPES: WorksheetFieldType[] = [
  'numeric', 'short-text', 'multiple-choice', 'true-false', 'fill-blank', 'long-text',
];

const WORKSHEET_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    subject: { type: Type.STRING },
    objective: { type: Type.STRING },
    gradeBand: { type: Type.STRING },
    framework: { type: Type.STRING },
    fields: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING },
          type: { type: Type.STRING, enum: FIELD_TYPES as unknown as string[] },
          box: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER }, y: { type: Type.NUMBER },
              width: { type: Type.NUMBER }, height: { type: Type.NUMBER },
            },
            required: ['x', 'y', 'width', 'height'],
          },
          choices: { type: Type.ARRAY, items: { type: Type.STRING } },
          correctAnswer: { type: Type.STRING },
          tolerance: { type: Type.NUMBER },
          points: { type: Type.NUMBER },
          standardIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.NUMBER },
          ordinal: { type: Type.STRING },
        },
        required: ['id', 'label', 'type', 'box', 'points'],
      },
    },
    segments: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING }, kind: { type: Type.STRING }, text: { type: Type.STRING },
          box: { type: Type.OBJECT, properties: { x: { type: Type.NUMBER }, y: { type: Type.NUMBER }, width: { type: Type.NUMBER }, height: { type: Type.NUMBER } }, required: ['x','y','width','height'] },
          fieldIds: { type: Type.ARRAY, items: { type: Type.STRING } }, confidence: { type: Type.NUMBER },
        },
        required: ['id','kind','box','confidence'],
      },
    },
    confidence: { type: Type.NUMBER },
    reviewIssues: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['title', 'subject', 'objective', 'fields'],
};

const DIGITIZE_PROMPT = `You are digitizing a school worksheet from an image so it becomes an interactive, auto-gradable assignment.

Read the sheet carefully and return JSON describing it. Requirements:
- First understand the page layout. Separate headings, instructions, questions, answer regions,
  illustrations, diagrams, tables and decoration into segments. Do not merge nearby questions.
- title: the worksheet's title (or a short descriptive one if none is printed).
- subject: the academic subject (e.g. "Math", "Science", "History").
- objective: a single concise sentence describing what the worksheet teaches/assesses.
- gradeBand: your best guess at the grade level as one of g_k2, g34, g56, g78, g912 — omit if unsure.
- framework: the standards framework if identifiable (e.g. "CCSS_MATH", "NGSS"), else omit.
- fields: ONE entry per answerable item (each question, each blank, each choice group).
  For every field:
    - label: the question/prompt text exactly as printed; show a blank as "____".
    - type: one of numeric, short-text, multiple-choice, true-false, fill-blank, long-text.
    - box: the bounding box of the ANSWER area (where the student writes/selects) as percentages
      0-100 of the image: x,y = top-left corner, width,height = size. Be precise so an input can
      overlay that exact spot.
    - choices: for multiple-choice, the options in printed order.
    - correctAnswer: the correct answer. This is CRITICAL — determine it from the problem itself
      (solve the math, know the fact). For multiple-choice give the exact choice text. For
      true-false give "true" or "false". If the item is genuinely open-ended/opinion-based and has
      no single correct answer, OMIT correctAnswer and set type to long-text.
    - tolerance: for numeric answers only, an acceptable +/- range (0 if exact).
    - points: point value; if none printed, assign 1.
    - standardIds: education standard codes if you can identify them, else omit.
    - confidence: 0 to 1 confidence that the prompt, answer region and answer key are correct.
    - ordinal: the printed question number/letter if present.

- segments: every meaningful page region with kind, 0-100 bounding box, extracted text,
  related fieldIds and confidence. Images/diagrams must be separate segments so Plajah can crop,
  describe, move or replace them without baking them into the text.
- confidence: overall OCR + layout confidence from 0 to 1.
- reviewIssues: short, specific uncertainties the teacher should verify (cropped edge, glare,
  unreadable symbol, ambiguous key, overlapping handwriting). Empty when none.

Only include correctAnswer when you are confident it is objectively correct. Do not guess answers for
open-ended prompts.`;

/**
 * Turn a captured worksheet image into a structured DigitalWorksheet draft.
 * @param imageBase64  base64 (no data: prefix) of the worksheet image
 * @param mimeType     e.g. 'image/jpeg' | 'image/png'
 * @param createdBy    teacher uid
 * Returns null on failure (non-fatal — caller shows a retry).
 */
export async function digitizeWorksheet(
  imageBase64: string,
  mimeType: string,
  createdBy: string,
): Promise<DigitalWorksheet | null> {
  const result = await digitizeWorksheetDetailed(imageBase64, mimeType, createdBy);
  return result.ok ? result.sheet : null;
}

export interface WorksheetDigitizeResult {
  ok: boolean;
  sheet: DigitalWorksheet | null;
  error?: GeminiCallResult;
}

export async function digitizeWorksheetDetailed(
  imageBase64: string,
  mimeType: string,
  createdBy: string,
): Promise<WorksheetDigitizeResult> {
  try {
    const local = await digitizeWorksheetOnDevice(`data:${mimeType};base64,${imageBase64}`, createdBy);
    return { ok: true, sheet: local.sheet };
  } catch (err) {
    console.error('[worksheetDigitizer] on-device OCR failed:', err);
    return { ok: false, sheet: null, error: { ok: false, text: '', code: 'NETWORK_ERROR', message: (err as Error)?.message || 'On-device worksheet OCR failed. The scan was not uploaded.' } };
  }
}

// ── Auto-grade (pure, local, Phase-1 trustworthy) ─────────────────────────────────

export interface FieldResult {
  fieldId: string;
  correct: boolean | null; // null = needs manual grade
  awarded: number;
  max: number;
}
export interface GradeResult {
  perField: FieldResult[];
  score: number;
  maxScore: number;
  /** 0–100, over auto-gradable points only. */
  percent: number;
  /** True if any field still needs a human — teacher must review before finalizing. */
  needsManualReview: boolean;
  /** standardId → 0..1 correctness ratio on that standard, for ledger mastery deltas. */
  standardScores: Record<string, number>;
}

/** Grade a set of student answers (fieldId → value) against the worksheet's answer key. */
export function autoGradeWorksheet(
  worksheet: DigitalWorksheet,
  answers: Record<string, string>,
): GradeResult {
  const perField: FieldResult[] = [];
  let score = 0;
  let maxScore = 0;
  let needsManualReview = false;
  const stdCorrect: Record<string, number> = {};
  const stdTotal: Record<string, number> = {};

  for (const field of worksheet.fields) {
    const given = answers[field.id];
    if (field.needsManualGrade || field.correctAnswer === undefined) {
      perField.push({ fieldId: field.id, correct: null, awarded: 0, max: field.points });
      needsManualReview = true;
      continue;
    }
    maxScore += field.points;
    const correct = matchesAnswer(field, given);
    perField.push({
      fieldId: field.id,
      correct,
      awarded: correct ? field.points : 0,
      max: field.points,
    });
    if (correct) score += field.points;
    for (const sid of field.standardIds || []) {
      stdTotal[sid] = (stdTotal[sid] || 0) + 1;
      if (correct) stdCorrect[sid] = (stdCorrect[sid] || 0) + 1;
    }
  }

  const standardScores: Record<string, number> = {};
  for (const sid of Object.keys(stdTotal)) {
    standardScores[sid] = (stdCorrect[sid] || 0) / stdTotal[sid];
  }

  return {
    perField,
    score,
    maxScore,
    percent: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    needsManualReview,
    standardScores,
  };
}

/** Live fill progress (0–100) for the teacher/parent dashboards, counting non-empty answers. */
export function completionPercent(
  worksheet: DigitalWorksheet,
  answers: Record<string, string>,
): number {
  const total = worksheet.fields.length;
  if (total === 0) return 0;
  const filled = worksheet.fields.filter(
    (f) => (answers[f.id] ?? '').toString().trim() !== '',
  ).length;
  return Math.round((filled / total) * 100);
}

// ── internals ─────────────────────────────────────────────────────────────────────

function matchesAnswer(field: WorksheetField, given: string | undefined): boolean {
  if (given === undefined || given === null) return false;
  const key = String(field.correctAnswer);
  if (field.type === 'numeric') {
    const g = parseFloat(String(given).replace(/[^0-9.\-]/g, ''));
    const k = parseFloat(key.replace(/[^0-9.\-]/g, ''));
    if (Number.isNaN(g) || Number.isNaN(k)) return false;
    return Math.abs(g - k) <= (field.tolerance || 0);
  }
  return norm(given) === norm(key);
}

const norm = (s: string) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

/** Normalize one raw field from the model into a WorksheetField with safe defaults. */
function normalizeField(f: any, i: number): WorksheetField {
  const type: WorksheetFieldType = FIELD_TYPES.includes(f?.type) ? f.type : 'short-text';
  const box = f?.box || {};
  const field: WorksheetField = {
    id: String(f?.id || `f${i + 1}`),
    label: String(f?.label || `Question ${i + 1}`),
    type,
    box: {
      x: clampPct(box.x), y: clampPct(box.y),
      width: clampPct(box.width, 10), height: clampPct(box.height, 6),
    },
    points: typeof f?.points === 'number' && f.points > 0 ? f.points : 1,
  };
  if (Array.isArray(f?.choices) && f.choices.length) field.choices = f.choices.map(String);
  if (typeof f?.tolerance === 'number') field.tolerance = f.tolerance;
  if (Array.isArray(f?.standardIds) && f.standardIds.length) {
    field.standardIds = f.standardIds.map(String);
  }
  field.confidence = clamp01(f?.confidence, .65);
  if (f?.ordinal) field.ordinal = String(f.ordinal);
  const hasKey = f?.correctAnswer !== undefined && f?.correctAnswer !== null && String(f.correctAnswer).trim() !== '';
  if (hasKey && type !== 'long-text') field.correctAnswer = String(f.correctAnswer);
  else field.needsManualGrade = true;
  return field;
}

/** Read handwriting/marks from a completed paper copy into the existing field ids. */
export async function readCompletedWorksheet(
  imageBase64: string,
  mimeType: string,
  sheet: DigitalWorksheet,
  options?: { handwriting?: 'auto' | 'require' | 'skip'; onProgress?: (message: string) => void },
): Promise<{ ok: boolean; answers: Record<string, string>; confidence: Record<string, number>; answered?: Record<string, boolean>; message?: string }> {
  return readCompletedWorksheetOnDevice(`data:${mimeType};base64,${imageBase64}`, sheet, options);
}

function normalizeSegment(s: any, i: number): WorksheetSegment {
  const allowed: WorksheetSegment['kind'][] = ['heading','instructions','question','answer-region','image','diagram','table','decoration'];
  const kind = allowed.includes(s?.kind) ? s.kind : 'question';
  return { id: String(s?.id || `seg${i + 1}`), kind, box: { x: clampPct(s?.box?.x), y: clampPct(s?.box?.y), width: clampPct(s?.box?.width, 10), height: clampPct(s?.box?.height, 6) }, ...(s?.text ? { text: String(s.text) } : {}), ...(Array.isArray(s?.fieldIds) ? { fieldIds: s.fieldIds.map(String) } : {}), confidence: clamp01(s?.confidence, .6) };
}

function clamp01(v: any, fallback = 0): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.max(0, Math.min(1, n));
}

function clampPct(v: any, fallback = 0): number {
  const n = typeof v === 'number' ? v : fallback;
  return Math.max(0, Math.min(100, n));
}

/** Parse JSON that may arrive wrapped in ```json fences or with stray prose. */
function safeParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* fall through */ }
    }
    return null;
  }
}
