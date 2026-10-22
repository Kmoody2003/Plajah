import test from 'node:test';
import assert from 'node:assert/strict';
import { autoFlatplan, buildIssueTelaDoc, issueReadiness, newIssue, readyToPublish, validIssn, fromStudentStory } from '../services/publication/issueLogic';
import { newStory } from '../services/journalismSchool/studentDesk';
import { kitById } from '../services/journalismSchool/storyKits';
import type { IssueStory, Periodical } from '../services/publication/types';

const pub = (over: Partial<Periodical> = {}): Periodical => ({
  id: 'pub1', ownerId: 'u1', name: 'The Daily Notice', slug: 'daily-notice', sections: ['News'], editors: [], access: 'FREE', createdAt: 0, updatedAt: 0,
  kind: 'newspaper', tier: 'pro', staff: [{ uid: 'u1', name: 'Ava', role: 'editor-in-chief' }], ...over,
});
const story = (id: string, section: string, n: number, priority = 0): IssueStory => ({
  id, source: 'article', headline: `Story ${id}`, byline: 'Sam', body: Array.from({ length: n }, (_, i) => `word${i}`).join(' '), section, approved: true, priority,
});

test('ISSN check digit', () => {
  assert.ok(validIssn('0317-8471'));
  assert.ok(validIssn('2049-3630'));
  assert.ok(!validIssn('0317-8472'));
  assert.ok(!validIssn('12345'));
});

test('flatplan: front first, sections grouped, padded to a multiple of 4 with a staff page', () => {
  const stories = [story('a', 'News', 400, 9), story('b', 'Sports', 300, 5), story('c', 'Opinion', 500), story('d', 'News', 900)];
  const plan = autoFlatplan(stories, [11, 17]);
  assert.equal(plan[0].kind, 'front');
  assert.equal(plan.length % 4, 0);
  assert.ok(plan.some(p => p.section === 'Staff'));
  const order = plan.slice(1).map(p => p.section).filter(s => s !== 'Staff' && s !== 'House');
  assert.deepEqual(order, [...order].sort((x, y) => ['News', 'Opinion', 'Features', 'Arts', 'Sports'].indexOf(x) - ['News', 'Opinion', 'Features', 'Arts', 'Sports'].indexOf(y)));
  for (const s of stories) assert.ok(plan.some(p => p.storyIds.includes(s.id)), s.id);
});

test('readiness: student issues need the adviser’s own approval; pro issues need an imprint', () => {
  const student = pub({ tier: 'student', adviserUid: 'teacher-1' });
  const issue = { ...newIssue(student, 'u1', null, 0), stories: [story('a', 'News', 200)], tier: 'student' as const };
  issue.flatplan = autoFlatplan(issue.stories, [11, 17]);
  let checks = issueReadiness(student, issue);
  assert.equal(readyToPublish(checks), false);
  assert.ok(checks.find(c => c.id === 'adviser-approval' && !c.ok));
  issue.adviserApproval = { uid: 'someone-else', name: 'X', at: 1 };
  assert.ok(!issueReadiness(student, issue).find(c => c.id === 'adviser-approval')!.ok, 'only the adviser on file counts');
  issue.adviserApproval = { uid: 'teacher-1', name: 'Ms. Ana', at: 2 };
  checks = issueReadiness(student, issue);
  assert.ok(readyToPublish(checks), JSON.stringify(checks.filter(c => !c.ok && c.level === 'required')));

  const pro = pub({ issn: '0317-8472' });
  const pIssue = { ...newIssue(pro, 'u1', null, 0), stories: [story('a', 'News', 200)] };
  pIssue.flatplan = autoFlatplan(pIssue.stories, [11, 17]);
  const pc = issueReadiness(pro, pIssue);
  for (const id of ['publisher', 'address', 'eic-approval', 'corrections']) assert.ok(pc.find(c => c.id === id && !c.ok), id);
  assert.ok(pc.find(c => c.id === 'issn' && !c.ok && c.level === 'required'), 'bad ISSN blocks');
});

test('student stories need a teacher-account approval to count as approved', () => {
  const s = { ...newStory(kitById('kit-news-story')!, 'middle', { id: 'k', name: 'Ava' }), headline: 'H', lede: 'L', stage: 'APPROVED' as const };
  assert.equal(fromStudentStory({ ...s, approval: { by: 'Ms. Ana', role: 'teacher', at: 1, byUid: 't1' } }).approved, true);
});

test('issue doc: one page frame per flatplan slot, print spec and issue stamped, front page has the nameplate', () => {
  const p = pub();
  const issue = { ...newIssue(p, 'u1', null, 0), stories: [story('a', 'News', 400, 9), story('b', 'Opinion', 300)] };
  issue.flatplan = autoFlatplan(issue.stories, [11, 17]);
  const doc = buildIssueTelaDoc(p, issue, { ownerId: 'u1', now: 0 });
  assert.equal(doc.frames.length, issue.flatplan.length);
  assert.equal(doc.frames[0].w, 11 * 96);
  assert.equal(doc.print?.pageFrameIds.length, doc.frames.length);
  assert.equal(doc.issue?.number, 1);
  const front = doc.devices[doc.frames[0].deviceIds[0]];
  assert.ok(front.type === 'VECTOR' && front.objects.some(o => o.text === 'The Daily Notice'));
  const inside = Object.values(doc.devices).filter(d => d.type === 'WRITER');
  assert.ok(inside.some(d => d.type === 'WRITER' && d.blocks.some(b => b.text.includes('continued from page 1'))));
});
