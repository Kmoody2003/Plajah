/**
 * comparativeCivics.test.ts — integrity of Civics Hall Strand VI, "The World's Promises".
 *
 * The failure mode this guards against is silent: a lesson tagged with a standard id that does not
 * exist in data/educationStandards.ts still renders perfectly and simply never writes a usable
 * Learner Ledger record. Nothing in the UI reveals it. So the tags are checked here instead.
 *
 * It also holds the two editorial commitments the strand makes to a teacher — that every nation is
 * carried at the same depth, and that the reader dataset and the graded lessons stay in sync.
 *
 * Run: npm run test:civics
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CIVICS_HALL } from '../data/civicsCurriculum';
import { COMPARATIVE_STRAND } from '../data/comparativeCivicsLessons';
import { NATION_MODULES, US_ANCHOR } from '../data/comparativeCivics';
import { STANDARDS } from '../data/educationStandards';

const strand = CIVICS_HALL.tracks.find(t => t.id === 'comparative');

test('the comparative strand is actually mounted in Civics Hall', () => {
  assert.ok(strand, 'Strand VI must be a track on CIVICS_HALL, not an orphan file');
  assert.equal(strand!.lessons.length, COMPARATIVE_STRAND.lessons.length);
});

test('every standard tag in Civics Hall resolves to a seeded standard', () => {
  const ids = new Set(STANDARDS.map(s => s.id));
  const unresolved: string[] = [];
  for (const t of CIVICS_HALL.tracks) {
    for (const l of t.lessons) {
      for (const s of l.standardIds || []) if (!ids.has(s)) unresolved.push(`${t.id}/${l.id} -> ${s}`);
    }
  }
  assert.deepEqual(unresolved, [], 'an unresolved tag writes no usable ledger record');
});

test('every lesson in the curriculum carries standards, a body and an assignment', () => {
  for (const t of CIVICS_HALL.tracks) {
    for (const l of t.lessons) {
      assert.ok(l.standardIds?.length, `${l.id} has no standard tags`);
      assert.ok((l.body || '').length > 700, `${l.id} is too thin to teach from`);
      assert.ok(l.assignment?.prompt, `${l.id} has no assignment`);
    }
  }
});

test('lesson ids are unique across the whole curriculum', () => {
  const all = CIVICS_HALL.tracks.flatMap(t => t.lessons.map(l => l.id));
  assert.deepEqual(all.filter((x, i) => all.indexOf(x) !== i), [], 'duplicate ids collide in the progress ledger');
});

test('the strand teaches one lesson per nation, plus a method lesson and a capstone', () => {
  const ids = strand!.lessons.map(l => l.id);
  assert.equal(ids[0], 'civ-comp-method', 'the method must come first or students produce a ranking');
  assert.equal(ids[ids.length - 1], 'civ-comp-capstone');
  for (const n of NATION_MODULES) {
    assert.ok(ids.includes(`civ-comp-${n.id}`), `${n.nation} is in the reader but has no lesson`);
  }
  assert.equal(ids.length, NATION_MODULES.length + 2, 'no nation carried at a different depth from the rest');
});

test('every nation is carried at comparable depth — no token entries', () => {
  const nationLessons = strand!.lessons.filter(l => l.id !== 'civ-comp-method' && l.id !== 'civ-comp-capstone');
  for (const l of nationLessons) {
    assert.ok((l.body || '').length > 2200, `${l.id} is shallower than the others`);
    assert.ok((l.minutes || 0) >= 20, `${l.id} is scheduled shorter than the others`);
  }
});

test('the reader dataset gives every nation a real speech clause against the US anchor', () => {
  assert.match(US_ANCHOR.text, /Congress shall make no law/);
  for (const n of NATION_MODULES) {
    assert.ok(n.speechClause.text.length > 80, `${n.nation} has no substantive speech clause`);
    assert.ok(n.speechClause.probe.includes('?'), `${n.nation}'s probe must be a question, not a verdict`);
    // The capstone must set an OPEN task — a question, or a directive to argue, investigate or
    // take a position. A flat declarative sentence would be handing the student a verdict, which
    // is the one thing this strand promises not to do.
    assert.match(
      n.capstone,
      /\?|argue|investigate|ask what|take a position|say which/i,
      `${n.nation}'s capstone must set an open task rather than hand down a verdict`,
    );
    assert.ok(n.foundingTexts.length > 0 && n.foundingTexts.every(t => t.source.url.startsWith('http')));
  }
});

test('licence posture survives: non-hostable texts are flagged so the UI can badge them', () => {
  const germany = NATION_MODULES.find(n => n.id === 'germany')!;
  assert.ok(germany.foundingTexts.some(t => !t.hostable), 'the Basic Law translation is link-only');
});
