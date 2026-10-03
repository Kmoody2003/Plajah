import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSE_STATUS, FLAGGED } from '../data/practice/verificationData';
import { loadAllCourses } from '../scripts/content/lib';

/**
 * The integrity gate. These tests encode the platform's accuracy principle so it cannot be
 * violated by accident: labels must be honest, withheld items must exist, and no content may claim
 * more verification than the record supports.
 */
test('verification labels are honest', () => {
  for (const [id, v] of Object.entries(COURSE_STATUS)) {
    if (v.status === 'draft') continue;
    assert.ok(v.checkedAt || v.authoredBy === 'computed', `${id}: a verified status needs a check date`);
    assert.ok(v.method, `${id}: a verified status must say how it was checked`);
    if (v.authoredBy !== 'computed') {
      assert.ok(v.coverage, `${id}: a verified status needs coverage numbers`);
      assert.ok(v.coverage!.agreed / v.coverage!.questions >= 0.98 || v.status === 'disputed', `${id}: fewer than 98% of questions agreed, yet marked ${v.status}`);
    }
    if (v.status === 'educator-reviewed') assert.ok((v.reviewers || []).length >= 2, `${id}: educator-reviewed needs two named reviewers`);
    if (v.status === 'sourced') assert.ok((v.coverage?.claims || 0) > 0, `${id}: sourced needs checked claims`);
  }
});

test('every flagged id refers to a real question or lesson, and every question is well-formed', async () => {
  const courses = await loadAllCourses();
  const ids = new Set<string>();
  for (const c of courses) {
    for (const t of c.curriculum.tracks) for (const l of t.lessons) ids.add(l.id);
    const seen = new Set<string>();
    for (const q of c.questions) {
      ids.add(q.id);
      assert.ok(!seen.has(q.id), `duplicate question id ${q.id}`); seen.add(q.id);
      assert.ok(q.explanation && q.explanation.length > 10, `${q.id} needs an explanation`);
      const n = q.kind === 'tf' ? 2 : (q.choices?.length || 0);
      assert.ok(q.answer >= 0 && q.answer < n, `${q.id} answer out of range`);
      if (q.kind === 'mcq') assert.equal(new Set(q.choices).size, n, `${q.id} has duplicate choices`);
    }
  }
  for (const id of Object.keys(FLAGGED)) assert.ok(ids.has(id), `flagged id ${id} does not exist (stale record)`);
});

test('every course with questions has a status entry or is honestly treated as draft', async () => {
  // Draft is the default and is shown as such; this only guards against a typo'd status key.
  const courses = new Set((await loadAllCourses()).map(c => c.id).concat(['math-generated', 'context-math']));
  for (const id of Object.keys(COURSE_STATUS)) assert.ok(courses.has(id), `status entry '${id}' matches no course`);
});
