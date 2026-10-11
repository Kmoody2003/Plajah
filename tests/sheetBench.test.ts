import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runBench } from './sheetBench';

// Budgets are loose (CI machines, tsx transpile overhead); docs/tela/SHEET_ENGINE.md has the measured numbers.
describe('sheet engine performance', () => {
  it('recalculates 100k formula cells well under a second', () => {
    const rows = runBench(100_000);
    console.table(rows);
    const byName = (s: string) => rows.find(r => r.scenario.includes(s))!;
    assert.ok(byName('row formulas').recalcAllMs < 1000, 'full recalc of 100k row formulas');
    assert.ok(byName('running total').recalcAllMs < 1000, 'full recalc of a 100k chain');
    assert.ok(byName('row formulas').editMs < 500, 'single edit on a 300k-cell sheet');
    assert.equal(byName('row formulas').computedOnEdit, 1);
    assert.ok(byName('VLOOKUP').recalcAllMs < 1000);
  });
});
