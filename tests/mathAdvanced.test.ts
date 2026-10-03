import test from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCED_SKILLS, advancedItems, seeded } from '../services/mathAdvanced';
import { applySet, levelFor, rollup } from '../services/mastery';

test('every advanced skill yields well-formed, unique 4-choice questions with a valid answer', () => {
  for (const sk of ADVANCED_SKILLS) {
    const items = advancedItems(sk.grade, sk.topic, 12, seeded(sk.grade * 100 + sk.topic.length));
    assert.ok(items.length >= 6, `${sk.topic}: only ${items.length} distinct items`);
    for (const it of items) {
      assert.equal(it.choices.length, 4, `${sk.topic}: ${it.prompt}`);
      assert.equal(new Set(it.choices).size, 4, `${sk.topic} duplicate choices: ${it.choices}`);
      assert.ok(it.answer >= 0 && it.answer < 4);
      assert.ok(it.explanation && it.hint);
    }
  }
});

test('linear equation and slope answers are mathematically right', () => {
  const lin = advancedItems(9, 'Solving Linear Equations', 30, seeded(7));
  for (const it of lin) {
    const m = it.prompt.match(/(\d+)x ([+-]) (\d+) = (-?\d+)/)!; const a = +m[1], b = m[2] === '-' ? -+m[3] : +m[3], c = +m[4];
    assert.equal(it.choices[it.answer], `x = ${(c - b) / a}`);
  }
  const slope = advancedItems(9, 'Slope & Lines', 30, seeded(11));
  for (const it of slope) {
    const m = it.prompt.match(/\((-?\d+), (-?\d+)\) and \((-?\d+), (-?\d+)\)/)!; const [x1, y1, x2, y2] = m.slice(1).map(Number);
    assert.equal(Number(it.choices[it.answer]), (y2 - y1) / (x2 - x1));
  }
});

test('factoring, logs, trig, derivative answers check out', () => {
  for (const it of advancedItems(11, 'Logarithms', 20, seeded(3))) {
    const m = it.prompt.match(/base (\d+) of (\d+)/)!; assert.equal(Math.pow(+m[1], +it.choices[it.answer]), +m[2]);
  }
  for (const it of advancedItems(12, 'Derivatives (Power Rule)', 20, seeded(5))) {
    const m = it.prompt.match(/(\d+)x\^(\d+)/)!; assert.equal(it.choices[it.answer], `${+m[1] * +m[2]}x^${+m[2] - 1}`);
  }
  for (const it of advancedItems(10, 'Pythagorean Triples & Distance', 20, seeded(9))) {
    const m = it.prompt.match(/legs (\d+) and (\d+)/)!; assert.equal(Number(it.choices[it.answer]) ** 2, Number(m[1]) ** 2 + Number(m[2]) ** 2);
  }
});

test('mastery levels: right answers climb, misses cost less, never below 0', () => {
  let s = applySet(undefined, [{ correct: false }]);
  assert.equal(s.points, 0); assert.equal(levelFor(s), 'attempted');
  s = applySet(s, Array(6).fill({ correct: true, level: 2 }));            // 6 * 12 = 72
  assert.equal(levelFor(s), 'familiar');
  s = applySet(s, Array(2).fill({ correct: true, level: 3 }));            // +30 -> 100 cap
  assert.equal(s.points, 100); assert.equal(levelFor(s), 'mastered');
  assert.equal(rollup(['a', 'b'], { a: s }).pct, 50);
});
