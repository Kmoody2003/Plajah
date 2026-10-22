import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNALISM_SCHOOL } from '../data/journalismCurriculum';
import { JOURNALISM_BANK } from '../data/practice/journalism-school';
import { STANDARDS } from '../data/educationStandards';
import { SEED_KIT, STORY_KITS, kitById, kitForLesson } from '../services/journalismSchool/storyKits';
import { TEMPLATE_SEEDS } from '../data/assignmentTemplates';
import {
  advance, applyTeacherReview, canAdvance, channelGate, coach, fileCorrection, fromSnapshot, frontPageHtml, markTurnedIn, newSource, newStory, safetyReview, signOff, toSnapshot, type StudentStory,
} from '../services/journalismSchool/studentDesk';

const lessons = JOURNALISM_SCHOOL.tracks.flatMap(t => t.lessons);
const lessonIds = new Set(lessons.map(l => l.id));
const author = { id: 'kid-1', name: 'Ava' };
const minor = { authorIsMinor: true };

const story = (kitId: string, patch: Partial<StudentStory> = {}): StudentStory => ({ ...newStory(kitById(kitId)!, kitById(kitId)!.bands[0], author, 1), ...patch });

test('curriculum: unique lesson ids, every band present, every standard exists', () => {
  assert.equal(lessonIds.size, lessons.length);
  const std = new Set(STANDARDS.map(s => s.id));
  for (const l of lessons) for (const s of l.standardIds || []) assert.ok(std.has(s), `${l.id} cites missing standard ${s}`);
  for (const id of ['noticers', 'cub', 'school-newsroom', 'hs-press', 'j-school', 'distribute']) assert.ok(JOURNALISM_SCHOOL.tracks.some(t => t.id === id), id);
  assert.ok(lessons.length >= 30);
});

test('practice bank: every question points at a real lesson; every lesson has practice', () => {
  for (const q of JOURNALISM_BANK.questions) assert.ok(lessonIds.has(q.lessonId), q.id);
  for (const l of lessons) assert.ok(JOURNALISM_BANK.questions.filter(q => q.lessonId === l.id).length >= 2, `${l.id} needs practice`);
  assert.equal(new Set(JOURNALISM_BANK.questions.map(q => q.id)).size, JOURNALISM_BANK.questions.length);
});

test('kits: every kit teaches from a real lesson; newsroom assignments resolve to a kit or the press room', () => {
  for (const k of STORY_KITS) assert.ok(lessonIds.has(k.lessonId), k.id);
  for (const l of lessons.filter(l => l.assignment?.tool === 'NEWSROOM')) {
    assert.ok(kitForLesson(l.id) || ['jr-cub-6', 'jr-hs-7', 'jr-pub-1'].includes(l.id), `${l.id} has no kit`);
  }
});

test('coach: PreK hears a few friendly prompts, university hears the style desk', () => {
  const young = story('kit-picture-news');
  assert.ok(coach(young).length <= 3);
  const uni = { ...story('kit-news-story'), band: 'university' as const, headline: 'Council votes', lede: 'The council voted 5 to 4 on Tuesday.', body: 'The mayor claimed the budget was balanced. It was approved by the council.' };
  const notes = coach(uni);
  assert.ok(notes.some(n => n.rule === 'attribution'), 'flags "claimed"');
  assert.ok(notes.some(n => n.rule === 'numbers'), 'AP number rule surfaces at university');
});

test('safety: minors cannot publish contact details or students’ full names, and need consent', () => {
  const s = story('kit-news-brief', { headline: 'Bake sale', lede: 'Call 555-123-4567 to order.', sources: [{ ...newSource(), name: 'Maya Lopez', isMinor: true, consent: false }] });
  const f = safetyReview(s, minor).map(x => x.text).join(' ');
  assert.match(f, /phone/i);
  assert.match(f, /first names only/i);
  assert.match(f, /Can I put you in the news/);
  assert.equal(canAdvance(s, minor).ok, false);
});

test('workflow: draft → edit → review needs a sign-off by someone other than the author', () => {
  let s = story('kit-news-brief', { headline: 'Room 12 raises $340', lede: 'Room 12 raised $340 for the shelter.' });
  s = advance(s, minor); assert.equal(s.stage, 'EDITING');
  assert.equal(advance(s, minor).stage, 'EDITING', 'checklist must be ticked');
  s = { ...s, checklist: Object.fromEntries(kitById(s.kitId)!.checklist.map(c => [c, true])) };
  s = advance(s, minor); assert.equal(s.stage, 'REVIEW');
  assert.equal(signOff(s, { id: author.id, name: 'Ava', role: 'teacher' }).stage, 'REVIEW', 'no self-approval');
  const deskSigned = signOff(s, { id: 'teacher-1', name: 'Ms. Ana', role: 'teacher' });
  assert.equal(deskSigned.stage, 'APPROVED');
  assert.equal(channelGate(deskSigned, 'print', { ...minor, isChildAccount: true }).allowed, false, 'a minor needs approval from the teacher account');
  assert.equal(channelGate(deskSigned, 'print', { authorIsMinor: false, isChildAccount: false }).allowed, true, 'adults may use a desk sign-off');

  s = markTurnedIn(s, { id: 'sub-1', assignmentId: 'as-1', title: 'News story', className: 'Room 12' }, 10);
  assert.equal(s.stage, 'REVIEW');
  s = applyTeacherReview(s, { id: 'sub-1', review: { decision: 'approved', note: '', byUid: 'teacher-1', byName: 'Ms. Ana', at: 20 } });
  assert.equal(s.stage, 'APPROVED');
  assert.equal(s.approval?.byUid, 'teacher-1');
  assert.equal(channelGate(s, 'print', { ...minor, isChildAccount: true }).allowed, true);
  assert.equal(channelGate(s, 'classWall', { ...minor, isChildAccount: true }).allowed, false, 'child accounts never post to the feed');
  assert.equal(channelGate(s, 'journalistDesk', { ...minor, isChildAccount: false }).allowed, false);
});

test('teacher review: send-back returns the story to drafting once, and a stale submission is ignored', () => {
  let s = markTurnedIn(story('kit-news-brief', { headline: 'H', lede: 'L' }), { id: 'sub-1', assignmentId: 'as-1', title: 'T', className: 'C' }, 1);
  const back = { id: 'sub-1', review: { decision: 'changes' as const, note: 'Add a second source.', byUid: 't', byName: 'Ms. Ana', at: 5 } };
  s = applyTeacherReview(s, back);
  assert.equal(s.stage, 'DRAFT');
  assert.equal(s.submission, undefined);
  assert.equal(s.assignmentId, 'as-1', 'resubmission preselects the same assignment');
  assert.equal(s.notes.at(-1)?.text, 'Add a second source.');
  assert.equal(applyTeacherReview(s, back), s, 'no submission → nothing to apply');
  const t = markTurnedIn(s, { id: 'sub-2', assignmentId: 'as-1', title: 'T', className: 'C' }, 9);
  assert.equal(applyTeacherReview(t, back), t, 'old submission’s decision does not touch the new one');
});

test('snapshot round-trips for the teacher preview; seeds map to real kits', () => {
  const s = story('kit-news-story', { headline: 'Robotics team takes second', body: 'Body.' });
  const back = fromSnapshot(toSnapshot(s), author);
  assert.equal(back.headline, s.headline);
  assert.equal(back.id, s.id);
  for (const [seed, kit] of Object.entries(SEED_KIT)) {
    assert.ok(TEMPLATE_SEEDS.some(t => t.id === seed), seed);
    assert.ok(kitById(kit), kit);
  }
});

test('front page escapes story text and prints corrections', () => {
  const s = fileCorrection(story('kit-news-brief', { headline: '<script>x</script>', lede: 'Fine.', stage: 'PUBLISHED' }), 'The captain is Priya.');
  const html = frontPageHtml({ masthead: 'The Daily Notice', edition: 'No. 1', audience: 'families', stories: [s] });
  assert.ok(!html.includes('<script>x'));
  assert.match(html, /Correction: The captain is Priya\./);
});
