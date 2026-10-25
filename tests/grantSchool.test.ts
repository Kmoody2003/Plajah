import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GRANT_SCHOOL } from '../data/grantSchoolCurriculum';
import { GRANT_BANK } from '../data/practice/grant-school';
import { TOPICS } from '../services/dataCommons/grants';

const lessons = GRANT_SCHOOL.tracks.flatMap(t => t.lessons);

test('every lesson has a unique id, a real body and an assignment', () => {
  assert.equal(new Set(lessons.map(l => l.id)).size, lessons.length);
  for (const l of lessons) {
    assert.ok((l.body || '').length > 400, `${l.id} body too thin`);
    assert.ok(l.assignment?.prompt, `${l.id} has no assignment`);
    assert.ok(l.asOf, `${l.id} has no asOf`);
  }
});

test('every practice question points at a real lesson and has a valid answer', () => {
  const ids = new Set(lessons.map(l => l.id));
  const qids = new Set<string>();
  for (const q of GRANT_BANK.questions) {
    assert.ok(ids.has(q.lessonId), `${q.id} -> unknown lesson ${q.lessonId}`);
    assert.ok(!qids.has(q.id), `duplicate ${q.id}`);
    qids.add(q.id);
    assert.ok(q.choices && q.answer >= 0 && q.answer < q.choices.length, `${q.id} answer out of range`);
    assert.equal(new Set(q.choices).size, q.choices!.length, `${q.id} has duplicate choices`);
    assert.ok(q.explanation.length > 20);
  }
  for (const l of lessons) assert.ok(GRANT_BANK.questions.some(q => q.lessonId === l.id), `${l.id} has no practice`);
});

test('the answers do not all sit in one position', () => {
  const counts = [0, 0, 0, 0];
  for (const q of GRANT_BANK.questions) counts[q.answer]++;
  for (const c of counts) assert.ok(c > GRANT_BANK.questions.length * 0.1);
});

test('the course states the legal guardrails it depends on', () => {
  const all = lessons.map(l => l.body).join('\n');
  assert.match(all, /never complete a signature/);
  assert.match(all, /\$1,000,000/);
  assert.match(all, /15%/);
  assert.match(all, /explicitly religious activities/);
  assert.ok(GRANT_SCHOOL.reviewNote);
});

test('matcher topics all carry a category and phrase', () => {
  for (const [k, t] of Object.entries(TOPICS)) { assert.ok(t.category && t.phrase && t.label, k); }
});
