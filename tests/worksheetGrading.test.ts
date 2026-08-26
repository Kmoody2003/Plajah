import assert from 'node:assert/strict';
import test from 'node:test';
import { preAssessWorksheet, buildTurnInBrief, simulateTurnIns } from '../services/worksheetGrading';
import type { DigitalWorksheet } from '../services/worksheetDigitizer';

function sheet(): DigitalWorksheet {
  return {
    id: 'ws', title: 'Addition check', subject: 'Math', objective: 'Add within 20', standardIds: [],
    createdBy: 'teacher', createdAt: 1, status: 'draft', hasManualFields: true,
    fields: [
      { id: 'q1', label: '3 + 4 =', type: 'numeric', box: { x: 10, y: 10, width: 20, height: 6 }, points: 1, correctAnswer: '7', tolerance: 0 },
      { id: 'q2', label: '9 + 8 =', type: 'numeric', box: { x: 10, y: 20, width: 20, height: 6 }, points: 1, correctAnswer: '17', tolerance: 0 },
      { id: 'q3', label: 'The capital of France', type: 'short-text', box: { x: 10, y: 30, width: 40, height: 6 }, points: 1, correctAnswer: 'Paris' },
      { id: 'q4', label: 'Explain why you like math', type: 'long-text', box: { x: 10, y: 40, width: 60, height: 10 }, points: 2, needsManualGrade: true },
    ],
  };
}

test('pre-assessment scores keyed fields, routes open + illegible to review, flags blanks', () => {
  const a = preAssessWorksheet(sheet(), {
    answers: { q1: '7', q2: '18', q3: 'paris', q4: 'because it is fun' },
    confidence: { q1: .9, q2: .9, q3: .85, q4: .8 },
  }, { id: 's1', name: 'Ada' }, 1000);

  assert.equal(a.perField.find(f => f.fieldId === 'q1')!.status, 'correct');
  assert.equal(a.perField.find(f => f.fieldId === 'q2')!.status, 'incorrect'); // 18 ≠ 17
  assert.equal(a.perField.find(f => f.fieldId === 'q3')!.status, 'correct');   // case-insensitive
  assert.equal(a.perField.find(f => f.fieldId === 'q4')!.status, 'needs_review'); // open response
  assert.equal(a.correctCount, 2);
  assert.equal(a.incorrectCount, 1);
  assert.equal(a.autoGradableCount, 3);
  assert.equal(a.estimatedScorePct, 67); // 2 of 3 auto-gradable points
  assert.equal(a.completionPct, 100);
  assert.equal(a.recommendation, 'needs_review'); // q4 needs a human
  assert.ok(a.flags.includes('teacher_review_needed'));
});

test('low read confidence is never auto-scored — it is routed to the teacher', () => {
  const a = preAssessWorksheet(sheet(), {
    answers: { q1: '1', q2: '17' }, // q1 mis-read
    confidence: { q1: .3, q2: .9 }, // q1 read confidence below trust
  }, { id: 's2', name: 'Ben' }, 1000);
  const q1 = a.perField.find(f => f.fieldId === 'q1')!;
  assert.equal(q1.status, 'needs_review'); // even though '1' ≠ '7', we don't call it wrong on a bad read
  assert.equal(q1.suggestedCorrect, false); // but the teacher sees the tentative key-match to confirm
  assert.equal(a.perField.find(f => f.fieldId === 'q2')!.status, 'correct');
  assert.ok(a.needsReviewCount >= 1);
});

test('a blank submission is flagged and recommended as mostly_blank', () => {
  const a = preAssessWorksheet(sheet(), { answers: {} }, { id: 's3', name: 'Cy' }, 1000);
  assert.equal(a.answeredCount, 0);
  assert.equal(a.completionPct, 0);
  assert.equal(a.recommendation, 'mostly_blank');
  assert.ok(a.flags.includes('blank_submission'));
  assert.ok(a.perField.every(f => f.status === 'blank'));
});

test('turn-in brief aggregates class stats, review queue, distribution, and hardest fields', () => {
  const ws = sheet();
  const roster = [{ id: 's1', name: 'Ada' }, { id: 's2', name: 'Ben' }, { id: 's3', name: 'Cy' }, { id: 's4', name: 'Dot' }];
  const assessments = [
    preAssessWorksheet(ws, { answers: { q1: '7', q2: '17', q3: 'Paris', q4: 'fun' }, confidence: { q1: .9, q2: .9, q3: .9, q4: .9 } }, roster[0], 1),
    preAssessWorksheet(ws, { answers: { q1: '7', q2: '18', q3: 'London', q4: 'ok' }, confidence: { q1: .9, q2: .9, q3: .9, q4: .9 } }, roster[1], 1),
    preAssessWorksheet(ws, { answers: { q1: '2', q2: '3' }, confidence: { q1: .9, q2: .9 } }, roster[2], 1),
    // roster[3] (Dot) never turned in
  ];
  const brief = buildTurnInBrief(ws.title, assessments, roster, 2000);

  assert.equal(brief.rosterSize, 4);
  assert.equal(brief.turnedIn, 3);
  assert.equal(brief.notTurnedIn, 1);
  assert.equal(brief.rows.find(r => r.studentId === 's4')!.status, 'not_turned_in');
  assert.ok(brief.averageScorePct !== null);
  // every turned-in student needs a look (open q4 unanswered/needs review or low completion)
  assert.ok(brief.needsReviewQueue.length >= 1);
  // q2 and q3 were each missed once → they surface as hardest fields
  const hardIds = brief.hardestFields.map(f => f.fieldId);
  assert.ok(hardIds.includes('q2') || hardIds.includes('q3'));
  assert.equal(brief.distribution.reduce((s, d) => s + d.count, 0), 3); // all 3 turned-in are scored
});

test('simulateTurnIns is deterministic and produces a usable class brief', () => {
  const ws = sheet();
  const roster = Array.from({ length: 6 }, (_, i) => ({ id: `s${i + 1}`, name: `Student ${i + 1}` }));
  const a1 = simulateTurnIns(ws, roster, 1);
  const a2 = simulateTurnIns(ws, roster, 1);
  assert.deepEqual(a1.map(a => a.studentId), a2.map(a => a.studentId)); // deterministic
  assert.ok(a1.length >= 1 && a1.length <= 6);
  const brief = buildTurnInBrief(ws.title, a1, roster, 2);
  assert.equal(brief.rosterSize, 6);
  assert.equal(brief.turnedIn, a1.length);
  assert.equal(brief.turnedIn + brief.notTurnedIn, 6);
  assert.equal(brief.rows.length, 6);
});
