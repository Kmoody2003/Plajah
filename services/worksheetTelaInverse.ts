// worksheetTelaInverse — the missing return leg of the worksheet ⇄ Tela bridge.
//
// worksheetTelaAdapter.worksheetToTelaDoc() turns a scanned/reviewed worksheet into an authorable
// Tela document (a BASE device holds the questions as TelaField[] + validation/answer key, a VECTOR
// device holds the editable page art/text). After a teacher refines that doc on the Tela canvas —
// editing questions, fixing the answer key, adding/removing fields — we need to read their changes
// back so the published, auto-gradable DigitalWorksheet reflects the authoring. That inverse is here.
//
// Design: the DigitalWorksheet stays authoritative for grading/turn-in/fillable; this MERGES the
// authored answer model from the doc's BASE device onto a base worksheet, preserving everything the
// Tela doc can't carry (points, standardIds, ordinal, confidence). It is the exact inverse of the
// WorksheetField → TelaField.validation encoding in worksheetTelaAdapter.ts.
//
//   npx tsx --test tests/worksheetTelaInverse.test.ts

import type { TelaDoc, TelaBaseDevice, TelaField } from '../types';
import type { DigitalWorksheet, WorksheetField } from './worksheetDigitizer';

type WSType = WorksheetField['type'];

const isTrueFalse = (options?: string[]): boolean => {
  if (!options || options.length !== 2) return false;
  const s = options.map(o => (o || '').trim().toLowerCase()).sort();
  return s[0] === 'false' && s[1] === 'true';
};

/** Recover a worksheet field type from a Tela field's validation/options, keeping the original
 *  text nuance (short/long/fill) when the validation doesn't pin it down. */
function inferType(field: TelaField, original?: WorksheetField): WSType {
  const mode = field.validation?.mode;
  if (mode === 'NUMERIC_TOLERANCE') return 'numeric';
  if (mode === 'CHOICE') return isTrueFalse(field.options) ? 'true-false' : 'multiple-choice';
  if (original && (original.type === 'short-text' || original.type === 'long-text' || original.type === 'fill-blank')) return original.type;
  return field.type === 'NUMBER' ? 'numeric' : field.type === 'SELECT' ? 'multiple-choice' : 'short-text';
}

/** The BASE device carries the authored answer model (worksheetToTelaDoc builds exactly one). */
export function findBaseDevice(doc: TelaDoc): TelaBaseDevice | undefined {
  return Object.values(doc.devices).find((d): d is TelaBaseDevice => d.type === 'BASE');
}

/**
 * Merge a teacher-authored Tela doc's answer model back into `base`, returning an updated
 * DigitalWorksheet ready for publishWorksheet(). Fields are matched by id; fields added on the Tela
 * side become new questions, removed ones drop out. Non-answer metadata (points, standards, ordinal)
 * is preserved from the matching original. If the doc has no BASE device, `base` is returned unchanged
 * except for the title.
 */
export function telaDocToWorksheet(doc: TelaDoc, base: DigitalWorksheet): DigitalWorksheet {
  const baseDevice = findBaseDevice(doc);
  const byId = new Map(base.fields.map(f => [f.id, f]));
  const title = doc.title || base.title;

  if (!baseDevice) return { ...base, title };

  const fields: WorksheetField[] = baseDevice.fields.map(tf => {
    const orig = byId.get(tf.id);
    const v = tf.validation;
    const expected = v?.expected;
    const manual = !v || v.mode === 'MANUAL' || expected === undefined || expected === '';
    const type = inferType(tf, orig);
    const layout = tf.layout;
    const box = layout
      ? { x: layout.x, y: layout.y, width: layout.w, height: layout.h }
      : (orig?.box || { x: 10, y: 10, width: 30, height: 6 });
    const choices = tf.options && tf.options.length && !isTrueFalse(tf.options) ? tf.options.slice() : orig?.choices;

    const field: WorksheetField = {
      id: tf.id,
      label: tf.name || orig?.label || 'Question',
      type,
      box,
      points: orig?.points ?? 1,
      needsManualGrade: manual,
    };
    if (!manual) field.correctAnswer = String(expected);
    if (v?.mode === 'NUMERIC_TOLERANCE' && typeof v.tolerance === 'number') field.tolerance = v.tolerance;
    else if (orig?.tolerance !== undefined) field.tolerance = orig.tolerance;
    if (choices?.length) field.choices = choices;
    if (orig?.standardIds?.length) field.standardIds = orig.standardIds.slice();
    if (orig?.ordinal) field.ordinal = orig.ordinal;
    if (orig?.confidence !== undefined) field.confidence = orig.confidence;
    return field;
  });

  const standardIds = Array.from(new Set(fields.flatMap(f => f.standardIds || [])));

  return {
    ...base,
    title,
    fields,
    standardIds: standardIds.length ? standardIds : base.standardIds,
    hasManualFields: fields.some(f => f.needsManualGrade),
  };
}
