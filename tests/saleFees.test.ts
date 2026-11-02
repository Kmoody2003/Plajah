import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateSplits, estimateProcessingCents, plajahPlusBreakdown, saleBreakdown } from '../services/payments/saleFees';

test('a $10 sale without Plajah+ takes 5% plus processing', () => {
  assert.deepEqual(saleBreakdown(1000, false), { feePct: 5, platformFeeCents: 50, processingCents: 59, sellerCents: 891, applicationFeeCents: 109 });
});

test('a $10 sale with Plajah+ takes processing only', () => {
  assert.deepEqual(saleBreakdown(1000, true), { feePct: 0, platformFeeCents: 0, processingCents: 59, sellerCents: 941, applicationFeeCents: 59 });
});

test('the parts of a sale always add up to the gross', () => {
  for (const gross of [100, 137, 999, 1000, 4999, 123456]) {
    for (const plus of [true, false]) {
      const s = saleBreakdown(gross, plus);
      assert.equal(s.platformFeeCents + s.processingCents + s.sellerCents, gross);
      assert.ok(s.sellerCents >= 0);
    }
  }
});

test('a sale too small to cover processing never goes negative', () => {
  const s = saleBreakdown(20, false);
  assert.equal(s.sellerCents, 0);
  assert.equal(s.applicationFeeCents, 20);
});

test('nothing is charged on nothing', () => {
  assert.equal(estimateProcessingCents(0), 0);
  assert.equal(saleBreakdown(0, false).applicationFeeCents, 0);
});

test('a bound creator gets the Money Map amount for each Plajah+ tier', () => {
  assert.equal(plajahPlusBreakdown(499, 1).sellerCents, 299);
  assert.equal(plajahPlusBreakdown(999, 2).sellerCents, 599);
  assert.equal(plajahPlusBreakdown(1499, 3).sellerCents, 999);
  assert.equal(plajahPlusBreakdown(1499, 3).platformFeeCents, 500);
  assert.equal(plajahPlusBreakdown(1499, 3).processingCents, 0);
});

test('a discounted Plajah+ charge never pays out more than it collected', () => {
  assert.equal(plajahPlusBreakdown(100, 3).sellerCents, 100);
  assert.equal(plajahPlusBreakdown(100, 3).platformFeeCents, 0);
  assert.equal(plajahPlusBreakdown(0, 1).sellerCents, 0);
});

test('an unknown Plajah+ tier pays the lowest amount', () => {
  assert.equal(plajahPlusBreakdown(1499, 9).sellerCents, 299);
});

test('splits round down and the seller keeps the remainder', () => {
  const { sellerCents, splits } = allocateSplits(891, [
    { creatorUid: 'a', displayName: 'A', percentage: 33.33 },
    { creatorUid: 'b', displayName: 'B', percentage: 33.33 },
  ]);
  assert.deepEqual(splits.map((s) => s.amountCents), [296, 296]);
  assert.equal(sellerCents, 299);
  assert.equal(sellerCents + splits[0].amountCents + splits[1].amountCents, 891);
});

test('splits cannot overpay, whatever was saved', () => {
  const { sellerCents, splits } = allocateSplits(1000, [
    { creatorUid: 'a', percentage: 80 },
    { creatorUid: 'b', percentage: 80 },
    { creatorUid: 'c', percentage: 10 },
  ]);
  assert.deepEqual(splits.map((s) => [s.creatorUid, s.percentage]), [['a', 80], ['b', 19]]);
  assert.equal(sellerCents, 10);
});

test('bad recipients are ignored', () => {
  const { sellerCents, splits } = allocateSplits(1000, [
    { percentage: 50 }, { creatorUid: '  ', percentage: 50 }, { creatorUid: 'a', percentage: 0 }, { creatorUid: 'b', percentage: 'x' },
  ]);
  assert.equal(splits.length, 0);
  assert.equal(sellerCents, 1000);
});
