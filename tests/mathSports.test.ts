import test from 'node:test';
import assert from 'node:assert/strict';
import { contextItems, seededRng, CONTEXT_SKILLS } from '../services/mathInContext';

const num = (s: string) => Number(s.replace(/[$,%¢ ]|Hz|km|m²|m|s/g, ''));

test('every sports skill yields distinct 4-choice questions with an explanation and a link', () => {
  const sports = CONTEXT_SKILLS.filter(s => s.topic === 'sports');
  assert.ok(sports.length >= 12);
  for (const sk of sports) {
    const items = contextItems(sk.id, 10, seededRng(sk.id.length * 17 + 3));
    assert.ok(items.length >= 4, `${sk.id}: only ${items.length}`);
    for (const it of items) {
      assert.equal(new Set(it.choices).size, 4, `${sk.id} duplicate choices ${it.choices}`);
      assert.ok(it.answer >= 0 && it.answer < 4 && it.explanation && it.hint && it.connect?.view === 'PLAJAH_SPORTS');
    }
  }
});

test('sports arithmetic is right', () => {
  for (const it of contextItems('sp-points', 25, seededRng(21))) {
    const m = it.prompt.match(/makes (\d+) two-point baskets, (\d+) three-pointers and (\d+) free/)!; assert.equal(+it.choices[it.answer], 2 * +m[1] + 3 * +m[2] + +m[3]);
  }
  for (const it of contextItems('sp-field', 30, seededRng(22))) {
    const m = it.prompt.match(/is (\d+) m long and (\d+) m wide/)!; const area = it.prompt.includes('area'), L = +m[1], W = +m[2];
    assert.equal(num(it.choices[it.answer]), area ? L * W : 2 * (L + W));
  }
  for (const it of contextItems('sp-half', 20, seededRng(23))) {
    const m = it.prompt.match(/plays (\d+)\/(\d+) of the match/)!; assert.equal(+it.choices[it.answer], (90 * +m[1]) / +m[2]);
  }
  for (const it of contextItems('sp-average', 20, seededRng(24))) {
    const m = it.prompt.match(/scored (\d+) goals in (\d+) games/)!; assert.equal(+it.choices[it.answer], +m[1] / +m[2]);
  }
  for (const it of contextItems('sp-percent', 20, seededRng(25))) {
    const m = it.prompt.match(/made (\d+) of (\d+) shots/)!; assert.equal(num(it.choices[it.answer]), Math.round((+m[1] / +m[2]) * 100));
  }
  for (const it of contextItems('sp-speed', 20, seededRng(26))) {
    const m = it.prompt.match(/at (\d+) metres per second for (\d+) seconds/)!; assert.equal(num(it.choices[it.answer]), +m[1] * +m[2]);
  }
  for (const it of contextItems('sp-marathon', 20, seededRng(27))) {
    const m = it.prompt.match(/finished (\d+) km/)!; assert.ok(Math.abs(Number(it.choices[it.answer].replace(' km', '')) - (42.195 - +m[1])) < 0.0011);
  }
  for (const it of contextItems('sp-probability', 10, seededRng(28))) {
    const p = +it.prompt.match(/makes (\d+)% of free throws/)![1]; assert.equal(num(it.choices[it.answer]), Math.round((p * p) / 100));
  }
  for (const it of contextItems('sp-expected', 12, seededRng(29))) {
    const m = it.prompt.match(/makes (\d+)% of two-point shots and (\d+)% of three-point/)!; const e2 = 2 * +m[1], e3 = 3 * +m[2];
    assert.notEqual(e2, e3);
    assert.equal(it.choices[it.answer], e3 > e2 ? 'the three-pointer' : 'the two-pointer');
  }
  for (const it of contextItems('sp-projectile', 10, seededRng(30))) {
    const v = +it.prompt.match(/-5t² \+ (\d+)t/)![1]; assert.equal(num(it.choices[it.answer]), v / 5);
  }
});
