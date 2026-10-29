// Classroom behavior of desk assignments (services/universalStudentDeskService):
//   • an assignment is a copy of the lesson: changing the library original afterwards doesn't change it;
//   • every student works in their own copy (keyed by their uid) and turns in their own record;
//   • nothing a student does writes back into the assignment or the original.
//   npx tsx --test tests/classroomCopies.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
  clear: () => store.clear(),
};
(globalThis as any).window = globalThis;
(globalThis as any).window.dispatchEvent ??= () => true;
(globalThis as any).window.addEventListener ??= () => {};
(globalThis as any).window.removeEventListener ??= () => {};
(globalThis as any).document ??= { addEventListener: () => {}, removeEventListener: () => {}, visibilityState: 'visible' };
(globalThis as any).CustomEvent ??= class { constructor(public type: string, public init?: any) {} };

const desk = await import('../services/universalStudentDeskService');
const { submissionId } = await import('../services/christianEdSync');

const unit: any = {
  id: 'cur_gf_exam1', orgId: 'gf', title: 'Revelations II - Exam 1', subtitle: '', sourceKind: 'GOOGLE_FORM', sourceLabel: 'Exam 1',
  kind: 'TEST', lessonBlocks: [], masterySkills: [], syllabusWeeks: [], telaDocId: 'tela_cur_gf_exam1', worksheet: { fields: [] },
  totalPoints: 3, createdAt: 1, detailFields: ['NAME', 'COUNSELOR', 'DATE'],
  questions: [
    { id: 'q_1', number: 1, prompt: 'List the Five (5) Ministry Gifts', type: 'essay', points: 1, skillId: 's', skillTitle: 's' },
    { id: 'q_7a', number: 7, label: '7a', group: 'Fill in the Blanks:', prompt: 'Jesus gave the Ministry Gifts when He...', type: 'short-answer', points: 1, skillId: 's', skillTitle: 's' },
    { id: 'q_7b', number: 7, label: '7b', group: 'Fill in the Blanks:', prompt: 'Whomever God calls He...', type: 'short-answer', points: 1, skillId: 's', skillTitle: 's' },
  ],
};

test('each student answers their own copy; the assignment and the original stay as they were', () => {
  const a = desk.assignUnitToClassroomDesk({ unit, domain: 'CHRISTIAN_EDUCATION', orgId: 'gf', orgName: 'Great Faith', classroomId: 'rev2', classroomName: 'Revelation II', dueLabel: 'Fri' });

  // The assignment is a snapshot: later edits to the library lesson don't reach work already given out.
  unit.questions[0].prompt = 'EDITED IN THE LIBRARY';
  assert.equal(a.unitSnapshot.questions[0].prompt, 'List the Five (5) Ministry Gifts');
  assert.notEqual(a.unitSnapshot, unit);

  desk.saveStudentDeskDraft({ studentUid: 'ann', studentName: 'Ann', assignment: a, answers: { q_1: 'Apostles, prophets…', q_7a: 'ascended' } });
  desk.saveStudentDeskDraft({ studentUid: 'ben', studentName: 'Ben', assignment: a, answers: { q_1: 'Ben’s own answer' } });

  const ann = desk.getStudentDeskWorkspace('ann', a.id);
  const ben = desk.getStudentDeskWorkspace('ben', a.id);
  assert.equal(ann.answers.q_1, 'Apostles, prophets…');
  assert.equal(ann.answers.q_7a, 'ascended');
  assert.equal(ben.answers.q_1, 'Ben’s own answer');
  assert.equal(ben.answers.q_7a, undefined, 'Ben never sees Ann’s answers');
  assert.equal(desk.getStudentDeskWorkspace('cara', a.id).status, 'ASSIGNED', 'a student who hasn’t started has a blank copy');

  // Answers live only in the student's own workspace, never on the assignment.
  const stored = desk.listDeskAssignments({ classroomId: 'rev2' }).find(x => x.id === a.id)!;
  assert.ok(!JSON.stringify(stored).includes('Apostles'), 'the assignment carries no answers');

  // Turn-ins are one record per student.
  assert.notEqual(submissionId(a.id, 'ann'), submissionId(a.id, 'ben'));
});

test('work saved on another device comes back to the same student only', () => {
  const a = desk.listDeskAssignments({ classroomId: 'rev2' })[0];
  desk.applyMyDrafts('dee', [
    { id: submissionId(a.id, 'dee'), orgId: 'gf', programId: 'rev2', assignmentId: a.id, assignmentTitle: a.title, studentUid: 'dee', studentName: 'Dee', status: 'IN_PROGRESS', answers: { q_1: 'from my phone' }, earnedPoints: 0, totalPoints: 3, percentage: 0, questionScores: {}, turnedInAt: 0, updatedAt: Date.now() },
    // Someone else's record is ignored even if it arrives.
    { id: submissionId(a.id, 'ann'), orgId: 'gf', programId: 'rev2', assignmentId: a.id, assignmentTitle: a.title, studentUid: 'ann', studentName: 'Ann', status: 'IN_PROGRESS', answers: { q_1: 'Ann' }, earnedPoints: 0, totalPoints: 3, percentage: 0, questionScores: {}, turnedInAt: 0, updatedAt: Date.now() },
  ]);
  assert.equal(desk.getStudentDeskWorkspace('dee', a.id).answers.q_1, 'from my phone');
  assert.equal(desk.getStudentDeskWorkspace('ann', a.id).answers.q_1, 'Apostles, prophets…');
});
