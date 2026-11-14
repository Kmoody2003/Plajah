//   npx tsx --test tests/lectureLessonStage.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonAssembler, lessonChunks, liveLessonCopy } from '../services/lectureLesson';

const unit: any = {
  id: 'u1',
  title: 'Ephesus',
  lessonBlocks: [],
  rawCurriculumText: 'TEACHER RAW',
  rawAnswerKeyText: 'RAW KEY',
  sacredLibrarySupplements: [{ title: 'Background' }],
  questions: Array.from({ length: 400 }, (_, i) => ({ id: `q${i}`, prompt: `Question ${i} ${'x'.repeat(200)}`, correctAnswer: 'SECRET', explanation: 'WHY' })),
};

test('never carries answer keys or the raw source to students', () => {
  const json = JSON.stringify(liveLessonCopy(unit));
  for (const t of ['SECRET', 'WHY', 'RAW KEY', 'TEACHER RAW', 'Background']) assert.ok(!json.includes(t), t);
  assert.ok(!JSON.stringify(lessonChunks(unit)).includes('SECRET'));
});

test('fits the data channel and rebuilds from pieces in any order, repeats included', () => {
  const chunks = lessonChunks(unit);
  assert.ok(chunks.length > 1);
  chunks.forEach(c => assert.ok(JSON.stringify(c).length < 64_000));
  const add = lessonAssembler();
  const reversed = [...chunks].reverse();
  reversed.slice(0, -1).forEach(c => assert.equal(add(c), null));
  assert.equal(add(reversed[0]), null);
  const done = add(reversed[reversed.length - 1]);
  assert.equal(done?.questions.length, 400);
  assert.ok(done?.questions[399].prompt.includes('Question 399'));
});

test('starts over when the teacher changes lesson mid-transfer', () => {
  const add = lessonAssembler();
  add(lessonChunks(unit)[0]);
  const other: any = { ...unit, id: 'u2', title: 'Smyrna', questions: [] };
  assert.equal(add(lessonChunks(other)[0])?.title, 'Smyrna');
});

test('ignores a malformed piece', () => {
  assert.equal(lessonAssembler()({ id: 'x', i: 5, n: 2, data: 'a' }), null);
});
