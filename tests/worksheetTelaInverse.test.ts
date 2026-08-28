// Tests for the worksheet ⇄ Tela inverse (telaDocToWorksheet).
//
// This is the return leg that lets a teacher's Tela authoring reach the published, auto-gradable
// worksheet. A silent mistake here means the answer key the class is graded against silently drifts
// from what the teacher authored — so it gets a real round-trip plus edit/add/remove assertions.
//
//   npx tsx --test tests/worksheetTelaInverse.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { worksheetToTelaDoc } from '../services/worksheetTelaAdapter';
import { telaDocToWorksheet, findBaseDevice } from '../services/worksheetTelaInverse';
import type { DigitalWorksheet } from '../services/worksheetDigitizer';

const SHEET: DigitalWorksheet = {
  id: 'w1', title: 'Fractions Practice', subject: 'Math', objective: 'Add fractions', gradeBand: 'g34',
  framework: 'CCSS_MATH', standardIds: ['CCSS.4.NF.1'],
  fields: [
    { id: 'f1', label: 'What is 2 + 2?', type: 'numeric', box: { x: 10, y: 10, width: 20, height: 5 }, correctAnswer: '4', tolerance: 0, points: 2, needsManualGrade: false, confidence: 0.9, standardIds: ['CCSS.4.NF.1'], ordinal: '1' },
    { id: 'f2', label: 'The sky is ___', type: 'multiple-choice', box: { x: 10, y: 20, width: 20, height: 5 }, choices: ['blue', 'red', 'green'], correctAnswer: 'blue', points: 1, confidence: 0.8 },
    { id: 'f3', label: 'Water is wet.', type: 'true-false', box: { x: 10, y: 30, width: 20, height: 5 }, correctAnswer: 'true', points: 1 },
    { id: 'f4', label: 'Explain why in your own words.', type: 'long-text', box: { x: 10, y: 40, width: 40, height: 10 }, points: 3, needsManualGrade: true },
  ],
  createdBy: 't1', createdAt: 0, status: 'draft', hasManualFields: true,
};

test('round-trip: worksheet → Tela doc → worksheet preserves the answer model', () => {
  const doc = worksheetToTelaDoc(SHEET, 't1');
  const back = telaDocToWorksheet(doc, SHEET);

  assert.equal(back.title, SHEET.title);
  assert.equal(back.fields.length, 4);
  const by = Object.fromEntries(back.fields.map(f => [f.id, f]));

  assert.equal(by.f1.type, 'numeric');
  assert.equal(by.f1.correctAnswer, '4');
  assert.equal(by.f1.tolerance, 0);
  assert.equal(by.f1.points, 2);          // points survive (Tela doesn't carry them — merged from base)
  assert.equal(by.f1.needsManualGrade, false);

  assert.equal(by.f2.type, 'multiple-choice');
  assert.deepEqual(by.f2.choices, ['blue', 'red', 'green']);
  assert.equal(by.f2.correctAnswer, 'blue');

  assert.equal(by.f3.type, 'true-false');
  assert.equal(by.f3.correctAnswer, 'true');

  assert.equal(by.f4.type, 'long-text');   // text nuance kept from the original
  assert.equal(by.f4.needsManualGrade, true);
  assert.equal(by.f4.correctAnswer, undefined);
  assert.equal(by.f4.points, 3);
});

test('editing a question + answer in the Tela doc reaches the worksheet', () => {
  const doc = worksheetToTelaDoc(SHEET, 't1');
  const baseDev = findBaseDevice(doc)!;
  assert.ok(baseDev, 'doc has a BASE device');
  // teacher edits on the canvas: rename Q1 and fix its answer
  const f1 = baseDev.fields.find(f => f.id === 'f1')!;
  f1.name = 'What is 3 + 3?';
  if (f1.validation) f1.validation.expected = '6';
  doc.title = 'Renamed by teacher';

  const back = telaDocToWorksheet(doc, SHEET);
  const q1 = back.fields.find(f => f.id === 'f1')!;
  assert.equal(back.title, 'Renamed by teacher');
  assert.equal(q1.label, 'What is 3 + 3?');
  assert.equal(q1.correctAnswer, '6');
});

test('adding and removing fields on the Tela doc is reflected', () => {
  const doc = worksheetToTelaDoc(SHEET, 't1');
  const baseDev = findBaseDevice(doc)!;
  // remove f3, add a brand-new question
  baseDev.fields = baseDev.fields.filter(f => f.id !== 'f3');
  baseDev.fields.push({ id: 'new1', name: 'New teacher question', type: 'TEXT', semanticRole: 'RESPONSE', validation: { mode: 'EXACT', expected: 'yes' } } as any);

  const back = telaDocToWorksheet(doc, SHEET);
  const ids = back.fields.map(f => f.id);
  assert.ok(!ids.includes('f3'), 'removed field is gone');
  assert.ok(ids.includes('new1'), 'added field is present');
  const nf = back.fields.find(f => f.id === 'new1')!;
  assert.equal(nf.correctAnswer, 'yes');
  assert.equal(nf.points, 1);              // sensible default for a field with no original
});

test('clearing the answer key marks a field for manual grading', () => {
  const doc = worksheetToTelaDoc(SHEET, 't1');
  const baseDev = findBaseDevice(doc)!;
  const f1 = baseDev.fields.find(f => f.id === 'f1')!;
  if (f1.validation) f1.validation = { mode: 'MANUAL' };
  const back = telaDocToWorksheet(doc, SHEET);
  const q1 = back.fields.find(f => f.id === 'f1')!;
  assert.equal(q1.needsManualGrade, true);
  assert.equal(q1.correctAnswer, undefined);
  assert.equal(back.hasManualFields, true);
});

test('a doc with no BASE device returns the base worksheet unchanged (bar title)', () => {
  const empty = { id: 'x', ownerId: 't1', title: 'T', frames: [], devices: {}, bindings: [], createdAt: 0, updatedAt: 0 };
  const back = telaDocToWorksheet(empty as any, SHEET);
  assert.equal(back.fields.length, SHEET.fields.length);
});
