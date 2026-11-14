// worksheetKeys — keeps a worksheet's answer key off student and guardian devices.
//
//   digital_worksheets/{id}       the copy students and guardians open: every field's correctAnswer removed,
//                                 answerKeyWithheld: true.
//   digital_worksheet_keys/{id}   { createdBy, keys: { fieldId: correctAnswer } } — the teacher only.
// "Check my work" and turn-in grading run on the server (routes/worksheetGrading.ts), which merges the key
// back in; students get looks-good / try-again and per-field right/wrong, never the answer itself.
// Pure (no Firebase imports) so the server uses the same helpers.
import type { DigitalWorksheet } from './worksheetDigitizer';
import type { WorksheetPreAssessment } from './worksheetGrading';

export type WorksheetAnswerKeys = Record<string, string>;

export const hasEmbeddedKeys = (sheet: Pick<DigitalWorksheet, 'fields'>) =>
  (sheet.fields || []).some(f => f.correctAnswer !== undefined && f.correctAnswer !== null && String(f.correctAnswer).trim() !== '');

/** The student copy and the key, split apart. */
export function splitWorksheetKeys<T extends DigitalWorksheet>(sheet: T): { publicSheet: T & { answerKeyWithheld?: boolean }; keys: WorksheetAnswerKeys } {
  const keys: WorksheetAnswerKeys = {};
  const fields = (sheet.fields || []).map(f => {
    if (f.correctAnswer === undefined || f.correctAnswer === null) return f;
    keys[f.id] = String(f.correctAnswer);
    const { correctAnswer: _k, ...rest } = f;
    return rest;
  });
  const withheld = Object.keys(keys).length > 0;
  return { publicSheet: { ...sheet, fields, ...(withheld ? { answerKeyWithheld: true } : {}) }, keys };
}

/** The teacher's (or the grader's) full worksheet. */
export function withWorksheetKeys<T extends DigitalWorksheet>(sheet: T, keys?: WorksheetAnswerKeys | null): T {
  if (!keys) return sheet;
  return { ...sheet, fields: sheet.fields.map(f => (keys[f.id] !== undefined ? { ...f, correctAnswer: keys[f.id] } : f)) };
}

/** A pre-assessment as stored on the student's own submission: no answer key in it. */
export function withoutExpected(p: WorksheetPreAssessment): WorksheetPreAssessment {
  return { ...p, perField: p.perField.map(({ expected: _e, ...rest }) => rest) } as WorksheetPreAssessment;
}
