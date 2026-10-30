// extractGoogleForm reads a form the way it is printed. Fixture = the structure of Great Faith's
// "Revelations II - Exam 1" (item titles and types as Google serves them, 2026-10-29).
//   npx tsx --test tests/googleFormImport.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { countQuestions, extractGoogleForm, isDetailField, parseCurriculumAndBuildUnit } from '../services/curriculumIngestionService';
import { pdfLinesToLayoutText } from '../services/documentLayout';

const TF = [['True'], ['False']];
const row = (text: string) => [1, TF, 0, [text]];
const q = (title: string, type: number, rows: any[] = [[1, null, 1]]) => [Math.floor(Math.random() * 1e9), title, null, type, rows];
const items = [
  q('NAME:', 0), q('COUNSELOR:', 0), q('DATE:', 9),
  q('1. List the Five (5) Ministry Gifts that Jesus gave the Church in Ephesians 4:11', 1),
  q('2. According to 1 Corinthians 12:27-28, what are six of the eight gifts God set in the church?', 1),
  q('3. What are the two (2) ways God may move to confirm a Divine call?', 1),
  q('4. The purpose of the Ministry Gifts are for the...', 1),
  q('5. Name three (3) ways you can tell a Divine call.', 1),
  q('6. True/False: Select True or False for each statement.', 7, [row('a. It is scriptural for man or groups to call or set people in the church.'), row('b. Ministry gifts are people.'), row('c. It is possible for a person to stand in the office of a Pastor and an Evangelist.')]),
  [2, '7. Fill in the Blanks:', null, 6, null],
  q('a. Jesus gave the Ministry Gifts when He...', 0),
  q('b. Whomever God calls He...', 0),
  q('c. The ultimate goal in all Ministry is to ___ and ___', 0),
  q('8. Write John 16:7-11:', 1),
  [3, '9. Give a brief explanation on how each of the Five (5) Ministry Gifts functions within the Body of Christ:', null, 6, null],
  q('a) Ministry Gift & Function/Explanation:', 1),
  q('b) Ministry Gift & Function/Explanation:', 1),
];
const html = `<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, ['', items, null, null, null, null, null, null, 'Revelations II - Exam 1'], null, 'Exam 1'])};</script>`;

test('numbers come from the form, parts stay under their question, the header is not a question', async () => {
  const f = await extractGoogleForm(html);
  assert.equal(f.title, 'Revelations II - Exam 1');
  assert.deepEqual(f.detailFields, ['NAME', 'COUNSELOR', 'DATE']);
  assert.equal(countQuestions(f.structuredQuestions.map(x => ({ number: x.number! }))), 9);
  assert.deepEqual(f.structuredQuestions.map(x => x.label || String(x.number)), ['1', '2', '3', '4', '5', '6a', '6b', '6c', '7a', '7b', '7c', '8', '9a', '9b']);
  const p6 = f.structuredQuestions.find(x => x.label === '6b')!;
  assert.equal(p6.prompt, 'Ministry gifts are people.');
  assert.equal(p6.type, 'true-false');
  assert.equal(p6.group, 'True/False: Select True or False for each statement.');
  assert.equal(f.structuredQuestions.find(x => x.label === '7a')!.group, 'Fill in the Blanks:');
  assert.equal(f.structuredQuestions[0].prompt, 'List the Five (5) Ministry Gifts that Jesus gave the Church in Ephesians 4:11');
  // The reading is the form's own text only; no question is repeated in it.
  assert.ok(!/Ministry Gifts/.test(f.readingText));
});

test('detail fields', () => {
  for (const t of ['NAME:', 'Name', 'Student Name:', 'COUNSELOR:', 'Date', 'Class:', 'Teacher', 'Email']) assert.ok(isDetailField(t), t);
  for (const t of ['Name three (3) ways you can tell a Divine call.', '5. Name the books', 'Date the letter was written?']) assert.ok(!isDetailField(t), t);
});

test('a grid keeps its columns, and rows share one grid', async () => {
  const f = await extractGoogleForm(html);
  const rows = f.structuredQuestions.filter(x => x.number === 6);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.grid && r.grid.id === rows[0].grid!.id));
  assert.deepEqual(rows[0].grid!.columns, ['True', 'False']);
  assert.ok(!rows[0].labelGenerated, 'the form printed a., b., c.');
});

test('layout grids in a document become grid questions under their numbered question', () => {
  const text = ['# Exam', '5. Name three ways you can tell a Divine call.', '6. TRUE/FALSE', '@@GRID True | False', 'There are no Apostles today.', 'Tongues is a sign to them that believe', '@@END', '7. Write John 16:7-11.'].join('\n');
  const { unit } = parseCurriculumAndBuildUnit({ orgId: 'o', rawCurriculumText: text, sourceKind: 'PDF_DOCUMENT', sourceLabel: 'x.pdf' });
  const six = unit.questions.filter(q => q.number === 6);
  assert.equal(six.length, 2);
  assert.equal(six[0].group, 'TRUE/FALSE');
  assert.deepEqual(six[0].grid!.columns, ['True', 'False']);
  assert.equal(six[0].type, 'true-false');
  assert.equal(countQuestions(unit.questions), 3);
  assert.ok(!unit.pointsAssigned, 'no points on the original');
});

test('points show only when the original gives them', () => {
  const { unit } = parseCurriculumAndBuildUnit({ orgId: 'o', rawCurriculumText: '1. What is grace? [5 pts]\n2. Who wrote Romans?', sourceKind: 'PDF_DOCUMENT', sourceLabel: 'x.pdf' });
  assert.equal(unit.pointsAssigned, true);
});

test('a PDF header of answer columns over left-side rows is read as a grid', () => {
  const L = (y: number, items: Array<[string, number]>) => ({ y, pageWidth: 600, items: items.map(([s, x]) => ({ s, x, y, w: 10 })) });
  const text = pdfLinesToLayoutText([
    L(10, [['6. TRUE/FALSE', 40]]),
    L(30, [['True', 330], ['False', 480]]),
    L(50, [['Because I can prophecy that makes me a Prophet', 40]]),
    L(64, [['(The Office)', 40]]),
    L(80, [['There are no Apostles today.', 40]]),
    L(130, [['7. Write John 16:7-11', 40]]),
  ]);
  assert.match(text, /@@GRID True \| False\nBecause I can prophecy that makes me a Prophet \(The Office\)\nThere are no Apostles today\.\n@@END/);
});
