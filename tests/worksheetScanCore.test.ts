import assert from 'node:assert/strict';
import test from 'node:test';
import {
  solveArithmetic, autoKeyWorksheet, applyAnswerKeyReading, parseNumberish, answerMatches,
  registerFieldsToScan, rankAssignmentsForScan, confidentMatch, selfCheckWorksheet,
  classifyScan, parseFlyer, textSimilarity,
} from '../services/worksheetScanCore';
import { autoGradeWorksheet, type DigitalWorksheet, type WorksheetField } from '../services/worksheetDigitizer';

const field = (id: string, label: string, extra: Partial<WorksheetField> = {}): WorksheetField => ({
  id, label, type: 'short-text', box: { x: 60, y: 10, width: 20, height: 5 }, points: 1, needsManualGrade: true, ...extra,
});
const sheetOf = (fields: WorksheetField[], extra: Partial<DigitalWorksheet> = {}): DigitalWorksheet => ({
  id: 'ws', title: 'Addition Practice', subject: 'Math', objective: '', standardIds: [], fields,
  createdBy: 't', createdAt: 1, status: 'draft', hasManualFields: true, ...extra,
});

test('solves printed arithmetic in the forms worksheets actually use', () => {
  assert.equal(solveArithmetic('1. 7 + 6 = ____')?.answer, '13');
  assert.equal(solveArithmetic('12 × 3 =')?.answer, '36');
  assert.equal(solveArithmetic('b) 48 ÷ 6 = ___')?.answer, '8');
  assert.equal(solveArithmetic('15 − 8 =')?.answer, '7');
  assert.equal(solveArithmetic('7 x 8 = ____')?.answer, '56');
  assert.equal(solveArithmetic('3.5 + 1.25 =')?.answer, '4.75');
  assert.equal(solveArithmetic('1/2 + 1/4 =')?.answer, '3/4');
  assert.equal(solveArithmetic('2,400 + 600 =')?.answer, '3000');
  assert.equal(solveArithmetic('(3 + 4) × 2 =')?.answer, '14');
  assert.equal(solveArithmetic('3 + 4 × 2 =')?.answer, '11');
  assert.equal(solveArithmetic('What is 9 + 9?')?.answer, '18');
  // missing operands
  assert.equal(solveArithmetic('____ + 5 = 12')?.answer, '7');
  assert.equal(solveArithmetic('8 × ___ = 56')?.answer, '7');
  assert.equal(solveArithmetic('20 - ___ = 13')?.answer, '7');
  assert.equal(solveArithmetic('___ ÷ 4 = 6')?.answer, '24');
});

test('refuses anything that is not unambiguous arithmetic', () => {
  assert.equal(solveArithmetic('Explain how you solved problem 3'), null);
  assert.equal(solveArithmetic('Name: ________'), null);
  assert.equal(solveArithmetic('What is the capital of France?'), null);
  assert.equal(solveArithmetic('Solve for x: 2x + 3 = 11'), null);
  assert.equal(solveArithmetic('5 ÷ 0 ='), null);
  assert.equal(solveArithmetic('2024'), null);
});

test('auto-key fills arithmetic keys, never overwrites a teacher key, grades fractions', () => {
  const s = sheetOf([
    field('q1', '7 + 6 = ____'),
    field('q2', '1/2 + 1/4 ='),
    field('q3', 'Explain your thinking', { type: 'long-text' }),
    field('q4', '9 + 1 =', { type: 'numeric', correctAnswer: '11', needsManualGrade: false }), // teacher chose 11 on purpose
  ]);
  const { sheet, keyed } = autoKeyWorksheet(s);
  assert.equal(keyed, 2);
  assert.equal(sheet.fields[0].correctAnswer, '13');
  assert.equal(sheet.fields[0].keySource, 'solved');
  assert.equal(sheet.fields[3].correctAnswer, '11');
  assert.equal(sheet.hasManualFields, true); // q3 still needs the teacher
  const grade = autoGradeWorksheet(sheet, { q1: '13', q2: '0.75', q4: '11' });
  assert.equal(grade.score, 3);
});

test('numberish parsing handles fractions, mixed numbers and thousands', () => {
  assert.equal(parseNumberish('3/4'), 0.75);
  assert.equal(parseNumberish('1 1/2'), 1.5);
  assert.equal(parseNumberish('2,400'), 2400);
  assert.equal(parseNumberish('−3'), -3);
  assert.ok(Number.isNaN(parseNumberish('seven')));
  assert.ok(answerMatches(field('a', 'x', { type: 'numeric', correctAnswer: '3/2' }), '1 1/2'));
  assert.ok(answerMatches(field('b', 'x', { type: 'true-false', correctAnswer: 'true' }), 'T'));
  assert.ok(answerMatches(field('c', 'x', { type: 'multiple-choice', choices: ['red', 'blue', 'green'], correctAnswer: 'blue' }), 'B'));
});

test('answer-key scan sets keys; shaky reads are flagged, not trusted', () => {
  const s = sheetOf([
    field('q1', 'Capital of France'),
    field('q2', 'Pick one', { type: 'multiple-choice', choices: ['cat', 'dog'] }),
    field('q3', '6 x 7 =', { type: 'numeric' }),
  ]);
  const r = applyAnswerKeyReading(s, { answers: { q1: 'Paris', q2: 'b', q3: 'forty' }, confidence: { q1: .9, q2: .8, q3: .9 } });
  assert.deepEqual(r.applied, ['q1', 'q2']);
  assert.equal(r.sheet.fields[1].correctAnswer, 'dog');
  assert.ok(r.review.includes('q3'));
});

test('registration moves boxes onto a shifted, scaled photo of the same page', () => {
  const s = sheetOf([
    field('q1', '1. Seven plus six equals', { box: { x: 60, y: 20, width: 20, height: 5 } }),
    field('q2', '2. Eight plus nine equals', { box: { x: 60, y: 40, width: 20, height: 5 } }),
    field('q3', '3. Five plus five equals', { box: { x: 60, y: 60, width: 20, height: 5 } }),
  ], {
    segments: [
      { id: 's1', kind: 'question', box: { x: 10, y: 20, width: 45, height: 5 }, text: '', fieldIds: ['q1'], confidence: 1 },
      { id: 's2', kind: 'question', box: { x: 10, y: 40, width: 45, height: 5 }, text: '', fieldIds: ['q2'], confidence: 1 },
      { id: 's3', kind: 'question', box: { x: 10, y: 60, width: 45, height: 5 }, text: '', fieldIds: ['q3'], confidence: 1 },
    ],
  });
  // Student photo: page shrunk to 90% and shifted down/right by 5.
  const t = (v: number) => v * 0.9 + 5;
  const lines = [
    { text: 'Addition Practice', box: { x: 30, y: 5, width: 40, height: 4 } },
    { text: '1. Seven plus sx equals 13', box: { x: t(10), y: t(20), width: 40, height: 4.5 } }, // OCR typo + student writing
    { text: '2. Eight plus nine equals', box: { x: t(10), y: t(40), width: 40, height: 4.5 } },
    { text: '3. Five plus five equals', box: { x: t(10), y: t(60), width: 40, height: 4.5 } },
  ];
  const reg = registerFieldsToScan(s, lines);
  assert.equal(reg.matched, 3);
  assert.ok(Math.abs(reg.sheet.fields[1].box.y - t(40)) < 1, `y ${reg.sheet.fields[1].box.y}`);
  assert.ok(Math.abs(reg.sheet.fields[1].box.x - t(60)) < 1, `x ${reg.sheet.fields[1].box.x}`);
});

test('registration leaves the sheet alone when it cannot find anchors', () => {
  const s = sheetOf([field('q1', 'Seven plus six'), field('q2', 'Eight plus nine')]);
  const reg = registerFieldsToScan(s, [{ text: 'totally different page', box: { x: 0, y: 0, width: 50, height: 5 } }]);
  assert.equal(reg.matched, 0);
  assert.equal(reg.sheet, s);
});

test('a student scan finds the right assignment, and ambiguity asks', () => {
  const add = sheetOf([field('q1', 'Seven plus six'), field('q2', 'Eight plus nine')], { title: 'Addition Practice' });
  const frac = sheetOf([field('q1', 'Shade one half of the circle'), field('q2', 'Which fraction is larger')], { title: 'Fractions Check' });
  const ranked = rankAssignmentsForScan('Addition Practice\nName ______\n1. Seven plus six = 13\n2. Eight plus nine = 17', [
    { id: 'a', sheet: frac }, { id: 'b', sheet: add },
  ]);
  assert.equal(ranked[0].id, 'b');
  assert.equal(confidentMatch(ranked)?.id, 'b');
  assert.equal(confidentMatch(rankAssignmentsForScan('a blurry photo of a desk', [{ id: 'a', sheet: frac }, { id: 'b', sheet: add }])), null);
});

test('self-check flags retries with hints and never reveals the key', () => {
  const s = sheetOf([
    field('q1', '7 + 6 =', { type: 'numeric', correctAnswer: '13', needsManualGrade: false }),
    field('q2', '9 + 4 =', { type: 'numeric', correctAnswer: '13', needsManualGrade: false }),
    field('q3', '12 × 2 =', { type: 'numeric', correctAnswer: '24', needsManualGrade: false }),
    field('q4', 'Why?', { type: 'long-text' }),
    field('q5', '5 + 5 =', { type: 'numeric', correctAnswer: '10', needsManualGrade: false }),
  ]);
  const r = selfCheckWorksheet(s, { q1: '13', q2: '5', q3: '23', q4: 'because' , q5: '10' }, { q5: .3 });
  assert.equal(r.perField.q1.status, 'looks-good');
  assert.equal(r.perField.q2.status, 'try-again');
  assert.match(r.perField.q2.message, /sign/);
  assert.match(r.perField.q3.message, /close/);
  assert.equal(r.perField.q4.status, 'teacher-reviews');
  assert.equal(r.perField.q5.status, 'check-read');
  assert.equal(r.ready, false);
  for (const f of Object.values(r.perField)) assert.doesNotMatch(f.message, /\b(13|24)\b/);
});

test('classifies worksheets vs flyers', () => {
  assert.equal(classifyScan('Name: ______\nDirections: solve each problem\n1. 7 + 6 = ___\n2. 8 + 9 = ___\n3. 5 + 5 = ___').kind, 'worksheet');
  assert.equal(classifyScan('FALL BOOK FAIR\nJoin us Monday, November 10 - 14\nLibrary 8:00 AM - 3:30 PM\nFamilies welcome!').kind, 'flyer');
});

test('flyer parsing makes events, deadlines, ranges and notes', () => {
  const now = new Date(2026, 9, 23, 9, 0); // Oct 23 2026
  const p = parseFlyer([
    'Maple Elementary',
    'FALL FESTIVAL',
    'Friday, November 7th',
    '6:00 - 8:00 PM',
    'Location: School Gym',
    'Bring a canned food item for the food drive',
    'Permission slips due Oct 30',
    'Book Fair Nov 10 - 14',
    'Questions? pta@maple.org',
  ].join('\n'), now);
  const fest = p.events.find(e => !e.allDay)!;
  assert.ok(fest, 'timed event');
  const fs = new Date(fest.start);
  assert.equal(fs.getMonth(), 10); assert.equal(fs.getDate(), 7); assert.equal(fs.getHours(), 18);
  assert.equal(new Date(fest.end).getHours(), 20);
  assert.equal(fest.location, 'School Gym');
  const due = p.events.find(e => e.kind === 'deadline')!;
  assert.equal(new Date(due.start).getDate(), 30);
  assert.match(due.title, /Permission slips/i);
  const fair = p.events.find(e => /Book Fair/i.test(e.title))!;
  assert.ok(fair.allDay);
  assert.equal(Math.round((fair.end - fair.start) / 86_400_000), 5);
  assert.ok(p.notes.some(n => /canned food/.test(n)));
  assert.deepEqual(p.contacts, ['pta@maple.org']);
});

test('flyer dates long past roll to next year; weekday-only lines resolve forward', () => {
  const now = new Date(2026, 11, 1);
  const p = parseFlyer('Spring Concert\nMarch 3 at 7:00 pm', now);
  assert.equal(new Date(p.events[0].start).getFullYear(), 2027);
  const w = parseFlyer('Early dismissal this Friday', new Date(2026, 9, 21)); // Wed
  assert.equal(new Date(w.events[0].start).getDate(), 23);
});

test('text similarity tolerates OCR noise', () => {
  assert.ok(textSimilarity('Seven plus six equals', 'Sevcn plus slx equals') > 0.6);
  assert.ok(textSimilarity('Seven plus six', 'Shade one half') < 0.4);
});

import { classifyPlusOrDivide, findAnswerBlank, splitOrdinals, pickHeadline, type GrayImage } from '../services/worksheetScanCore';

function canvas(w: number, h: number): GrayImage & { fill: (x0: number, y0: number, x1: number, y1: number) => void } {
  const data = new Uint8Array(w * h).fill(255);
  return { data, width: w, height: h, fill(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * w + x] = 0; } };
}

test('tells a printed plus from a division sign by its centre stroke', () => {
  const plus = canvas(40, 40); plus.fill(10, 18, 30, 20); plus.fill(19, 9, 21, 29);
  assert.equal(classifyPlusOrDivide(plus, { x0: 10, y0: 9, x1: 30, y1: 29 }, 5, 34), '+');
  const div = canvas(40, 40); div.fill(10, 18, 30, 20); div.fill(19, 11, 21, 14); div.fill(19, 24, 21, 27); // 3-px gaps, dots
  assert.equal(classifyPlusOrDivide(div, { x0: 10, y0: 11, x1: 30, y1: 27 }, 5, 34), '÷');
  const tight = canvas(40, 40); tight.fill(10, 18, 30, 20); tight.fill(19, 13, 21, 16); tight.fill(19, 22, 21, 25); // 1-px gaps
  assert.equal(classifyPlusOrDivide(tight, { x0: 10, y0: 13, x1: 30, y1: 25 }, 5, 34), '÷');
});

test('finds the printed answer blank to the right of the prompt', () => {
  const img = canvas(400, 60);
  img.fill(20, 20, 120, 40);   // the printed prompt (a word box)
  img.fill(150, 40, 300, 41);  // the underline blank
  const blank = findAnswerBlank(img, { x0: 20, y0: 20, x1: 120, y1: 40 }, [{ x0: 20, y0: 20, x1: 120, y1: 40 }]);
  assert.ok(blank);
  assert.ok(Math.abs(blank!.x0 - 150) <= 1 && Math.abs(blank!.x1 - 300) <= 1, JSON.stringify(blank));
  assert.ok(blank!.y0 < 40 && blank!.y1 >= 41);
  assert.equal(findAnswerBlank(canvas(400, 60), { x0: 20, y0: 20, x1: 120, y1: 40 }, []), null);
});

test('splits question numbers only when they are really question numbers', () => {
  const out = splitOrdinals(['1. 7+6=', '2.8+9=', '3.12-5=', 'Directions: solve', 'a) red or blue']);
  assert.deepEqual(out.slice(0, 3).map(o => [o.ordinal, o.text]), [['1.', '7+6='], ['2.', '8+9='], ['3.', '12-5=']]);
  assert.equal(out[3].ordinal, undefined);
  assert.equal(out[4].ordinal, 'a.');
  // A lone decimal problem is not split.
  assert.equal(splitOrdinals(['2.8 + 9 =']) [0].ordinal, undefined);
});

test('flyer headline is the biggest line near the top', () => {
  const b = (y: number, h: number) => ({ x: 10, y, width: 50, height: h });
  assert.equal(pickHeadline([{ text: 'Maple Elementary PTA', box: b(5, 3) }, { text: 'FALL FESTIVAL', box: b(10, 6) }, { text: 'Friday, November 6th', box: b(20, 3) }]), 'FALL FESTIVAL');
  assert.equal(solveArithmetic('48 ÷ 6 =')?.answer, '8');
});
