import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_SKILLS, contextItems, seededRng } from '../services/mathInContext';

test('every context skill yields well-formed, distinct 4-choice questions with an explanation and a connection', () => {
  for (const sk of CONTEXT_SKILLS) {
    const items = contextItems(sk.id, 10, seededRng(sk.id.length * 31 + 7));
    assert.ok(items.length >= 5, `${sk.id}: only ${items.length} distinct`);
    for (const it of items) {
      assert.equal(it.choices.length, 4, `${sk.id} ${it.prompt}`);
      assert.equal(new Set(it.choices).size, 4, `${sk.id} dup choices ${it.choices}`);
      assert.ok(it.answer >= 0 && it.answer < 4);
      assert.ok(it.explanation && it.hint && it.connect?.view, sk.id);
    }
  }
});

const num = (s: string) => Number(s.replace(/[$,%¢ Hz]/g, ''));

test('arithmetic is right: totals, profit, break-even, tempo, frames, ratios, compound growth', () => {
  for (const it of contextItems('md-total', 25, seededRng(1))) {
    const m = it.prompt.match(/cost \$(\d+) each\. How much do (\d+)/)!; assert.equal(num(it.choices[it.answer]), +m[1] * +m[2]);
  }
  for (const it of contextItems('md-profit', 25, seededRng(2))) {
    const m = it.prompt.match(/sell (\d+) .* for \$(\d+) each\. The supplies cost you \$(\d+)/)!; assert.equal(num(it.choices[it.answer]), +m[1] * +m[2] - +m[3]);
  }
  for (const it of contextItems('bm-breakeven', 25, seededRng(3))) {
    const m = it.prompt.match(/spend \$(\d+) .* costs \$(\d+) to make and sells for \$(\d+)/)!; assert.equal(+it.choices[it.answer], +m[1] / (+m[3] - +m[2]));
  }
  for (const it of contextItems('bm-bpm', 20, seededRng(4))) {
    const m = it.prompt.match(/at (\d+) beats per minute\. How many beats are in a (\d+)-minute/)!; assert.equal(+it.choices[it.answer], +m[1] * +m[2]);
  }
  for (const it of contextItems('bm-frames', 20, seededRng(5))) {
    const m = it.prompt.match(/runs at (\d+) frames per second\. How many frames are in a (\d+)-second/)!; assert.equal(+it.choices[it.answer], +m[1] * +m[2]);
  }
  for (const it of contextItems('bm-ratio', 30, seededRng(6))) {
    const oct = it.prompt.match(/vibrates at (\d+) Hz/); const fifth = it.prompt.match(/fifth above a (\d+) Hz/);
    if (oct) assert.equal(num(it.choices[it.answer]), +oct[1] * 2); else assert.equal(num(it.choices[it.answer]), (+fifth![1] * 3) / 2);
  }
  for (const it of contextItems('vm-compound', 20, seededRng(8))) {
    const m = it.prompt.match(/invest \$(\d+) at (\d+)% .* after (\d+) years/)!; assert.ok(Math.abs(num(it.choices[it.answer]) - +m[1] * Math.pow(1 + +m[2] / 100, +m[3])) < 0.01);
  }
  for (const it of contextItems('vm-aspect', 10, seededRng(9))) {
    const h = +it.prompt.match(/is (\d+) pixels tall/)![1]; assert.equal(+it.choices[it.answer], (h * 16) / 9);
  }
  for (const it of contextItems('vm-budget', 20, seededRng(10))) {
    const m = it.prompt.match(/\$(\d+) in fixed costs plus \$(\d+) per shoot day\. The budget is \$(\d+)/)!; assert.equal(+it.choices[it.answer], (+m[3] - +m[1]) / +m[2]);
  }
});
