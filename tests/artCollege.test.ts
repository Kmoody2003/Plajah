import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES, PROGRAMS, validateCatalog, programCredits, courseByCode, unitKey } from '../data/artCollege';
import { ART_COLLEGE_CURRICULUM } from '../data/artCollege/curriculum';
import { audienceOf } from '../services/artCollege/audience';
import { auditProgram, meanScore, reviewPasses } from '../services/artCollege/studioStore';

test('catalog is internally sound (codes, prereqs, grading, credits, figure alts)', () => {
  assert.deepEqual(validateCatalog(), []);
});

test('every BFA/BA plans to 120 credits and starts from the foundation or looking year', () => {
  for (const p of PROGRAMS.filter(x => x.degree === 'BFA' || x.degree === 'BA')) {
    assert.equal(programCredits(p), 120, p.id);
    assert.equal(p.years.length, 4, p.id);
  }
});

test('every unit with a study ref has a looking-question and a non-empty query', () => {
  for (const c of COURSES) for (const u of c.units) for (const s of u.study ?? []) {
    assert.ok(s.query.trim().length > 3, `${c.code}/${u.id}`);
    assert.ok((s.why ?? '').length > 15, `${c.code}/${u.id} why`);
  }
});

test('curriculum flattens one lesson per unit with unique ids', () => {
  const ids = ART_COLLEGE_CURRICULUM.tracks.flatMap(t => t.lessons.map(l => l.id));
  assert.equal(ids.length, COURSES.reduce((n, c) => n + c.units.length, 0));
  assert.equal(new Set(ids).size, ids.length);
});

test('audience gate is fail-closed: unknown age, child accounts and under-18 are minors', () => {
  const now = new Date('2026-10-25');
  assert.equal(audienceOf(undefined, now), 'minor');
  assert.equal(audienceOf({}, now), 'minor');
  assert.equal(audienceOf({ accountType: 'CHILD', birthYear: 1980 }, now), 'minor');
  assert.equal(audienceOf({ isChild: true, dateOfBirth: Date.parse('1980-01-01') }, now), 'minor');
  assert.equal(audienceOf({ birthYear: 2008 }, now), 'minor');
  assert.equal(audienceOf({ birthYear: 2007 }, now), 'adult', 'born 2007 is certainly 18+ in 2026');
  assert.equal(audienceOf({ dateOfBirth: Date.parse('2008-11-01') }, now), 'minor', '17 until Nov 1');
  assert.equal(audienceOf({ dateOfBirth: Date.parse('2008-10-01') }, now), 'adult');
  assert.equal(audienceOf({ birthYear: 1990 }, now), 'adult');
  assert.equal(audienceOf({ dateOfBirth: NaN }, now), 'minor');
});

test('figure studios always carry a non-figure alternative; figure refs are flagged', () => {
  let figureUnits = 0;
  for (const c of COURSES) for (const u of c.units) if (u.studio.figure) { figureUnits++; assert.ok(u.studio.alt, `${c.code}/${u.id}`); }
  assert.ok(figureUnits >= 3);
});

test('degree audit counts only fully completed courses and finds what is available', () => {
  const p = PROGRAMS.find(x => x.id === 'bfa-graphic-design')!;
  const c101 = courseByCode('FND 101')!;
  const all101 = c101.units.map(u => unitKey(c101, u));
  const a = auditProgram(p, [all101[0]]);
  assert.equal(a.creditsEarned, 0);
  assert.ok(a.started.includes('FND 101'));
  const b = auditProgram(p, all101);
  assert.equal(b.creditsEarned, 3);
  assert.ok(b.done.includes('FND 101'));
  assert.ok(b.available.includes('FND 106'), 'FND 106 opens once FND 101 is done');
  assert.ok(!b.available.includes('GRD 202'));
});

test('portfolio review bars', () => {
  const set = (n: number) => ({ rubric: 'portfolio' as const, scores: { a: n, b: n, c: n }, at: 0 });
  assert.equal(meanScore(set(3)), 3);
  assert.equal(reviewPasses('foundation', set(2)), true);
  assert.equal(reviewPasses('foundation', set(1)), false);
  assert.equal(reviewPasses('junior', set(2.9)), false);
  assert.equal(reviewPasses('senior', { rubric: 'portfolio', scores: { a: 4, b: 4, c: 2 }, at: 0 }), false, 'min criterion 2.5');
  assert.equal(reviewPasses('senior', set(3)), true);
});
