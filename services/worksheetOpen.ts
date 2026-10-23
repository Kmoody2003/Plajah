// worksheetOpen — open a specific worksheet assignment in-app (no URL reload), optionally pre-filled
// from a scanned paper copy. The hand-off lives in module memory (it can carry the photo File) with a
// sessionStorage copy of the ids so a reload still lands on the right assignment.

import type { DigitalWorksheet } from './worksheetDigitizer';

export interface WorksheetOpenIntent {
  worksheetId: string;
  assignmentId?: string;
  /** Pre-loaded sheet (skips a fetch when the scanner already has it). */
  sheet?: DigitalWorksheet;
  /** Answers read off the student's paper, with per-field read confidence. */
  prefill?: { answers: Record<string, string>; confidence: Record<string, number>; scanFile?: File; scanPreview?: string };
}

const KEY = 'plajah:openWorksheet';
let pending: WorksheetOpenIntent | null = null;

export function openWorksheetAssignment(intent: WorksheetOpenIntent): void {
  pending = intent;
  try { sessionStorage.setItem(KEY, JSON.stringify({ worksheetId: intent.worksheetId, assignmentId: intent.assignmentId })); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'STUDENT_ASSIGNMENT', params: { worksheetId: intent.worksheetId } } }));
}

/** Read (and clear) the pending intent. Falls back to the ids saved for a reload. */
export function takeWorksheetOpenIntent(): WorksheetOpenIntent | null {
  const out = pending;
  pending = null;
  let saved: WorksheetOpenIntent | null = null;
  try { const raw = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); saved = raw ? JSON.parse(raw) : null; } catch { /* */ }
  return out || saved;
}

// A teacher scanned a blank worksheet from the universal scanner: hand the photo to Teacher Tools.
let pendingTeacherScan: File | null = null;
export function queueTeacherWorksheetScan(file: File): void {
  pendingTeacherScan = file;
  try { sessionStorage.setItem('plajah:teacherTab', 'worksheet'); } catch { /* */ }
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target: 'TEACHER_TOOLS' } }));
}
export function takeTeacherWorksheetScan(): File | null { const f = pendingTeacherScan; pendingTeacherScan = null; return f; }
