// taxCore + ebtCore + tenderCore + refundCore tests. Run with: npm run test:tax
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeTax, rateBpsFor, parseTaxSettings, allocateProportional } from '../services/taxCore';
import { snapEligibleSubtotal, ebtGuidance } from '../services/ebtCore';
import { validateTenders, parseTenders } from '../services/tenderCore';
import { planRefund } from '../services/refundCore';

const S = { defaultRateBps: 825, rates: { GROCERY_FOOD: 0, PREPARED_FOOD: 1000 } };

describe('rates', () => {
  test('standard / exempt / class / unknown class', () => {
    assert.equal(rateBpsFor(S, 'STANDARD'), 825);
    assert.equal(rateBpsFor(S, 'EXEMPT'), 0);
    assert.equal(rateBpsFor(S, 'grocery_food'), 0);
    assert.equal(rateBpsFor(S, 'PREPARED_FOOD'), 1000);
    assert.equal(rateBpsFor(S, 'CUSTOM'), 825);
  });
  test('parseTaxSettings clamps garbage', () => {
    assert.deepEqual(parseTaxSettings({ defaultRateBps: 99999, rates: { exempt: 5, x: -3 } }), { defaultRateBps: 3000, inclusive: false, rates: { X: 0 } });
    assert.equal(parseTaxSettings(null).defaultRateBps, 0);
  });
});

describe('computeTax', () => {
  test('exclusive single line', () => {
    const r = computeTax([{ grossCents: 1000 }], S);
    assert.equal(r.taxCents, 83); assert.equal(r.totalCents, 1083);
  });
  test('per-ticket rounding: line taxes sum to ticket tax', () => {
    const lines = [{ grossCents: 333 }, { grossCents: 333 }, { grossCents: 333 }];
    const r = computeTax(lines, S);
    assert.equal(r.lines.reduce((s, l) => s + l.taxCents, 0), r.taxCents);
    assert.equal(r.taxCents, Math.round(999 * 0.0825));
    assert.equal(r.lines.reduce((s, l) => s + l.chargeCents, 0), r.totalCents);
  });
  test('exempt + grocery lines untaxed', () => {
    const r = computeTax([{ grossCents: 500, taxClass: 'EXEMPT' }, { grossCents: 500, taxClass: 'GROCERY_FOOD' }, { grossCents: 1000 }], S);
    assert.equal(r.taxCents, 83);
  });
  test('discount reduces the taxable base proportionally', () => {
    const r = computeTax([{ grossCents: 1000 }, { grossCents: 1000, taxClass: 'EXEMPT' }], S, { discountCents: 400 });
    assert.deepEqual(r.lines.map(l => l.discountCents), [200, 200]);
    assert.equal(r.taxCents, Math.round(800 * 0.0825));
    assert.equal(r.totalCents, 1600 + r.taxCents);
  });
  test('discount is capped at subtotal', () => {
    const r = computeTax([{ grossCents: 100 }], S, { discountCents: 999 });
    assert.equal(r.totalCents, 0); assert.equal(r.taxCents, 0);
  });
  test('inclusive: total stays shelf price, tax extracted', () => {
    const r = computeTax([{ grossCents: 1080 }], { defaultRateBps: 800, inclusive: true });
    assert.equal(r.totalCents, 1080); assert.equal(r.taxCents, 80);
  });
  test('SNAP: eligible items covered by SNAP are untaxed, non-eligible taxed', () => {
    const lines = [{ grossCents: 1000, snapEligible: true, taxClass: 'STANDARD' }, { grossCents: 1000 }];
    const noSnap = computeTax(lines, S);
    assert.equal(noSnap.taxCents, Math.round(2000 * 0.0825));
    const snap = computeTax(lines, S, { snapCents: 1000 });
    assert.equal(snap.taxCents, Math.round(1000 * 0.0825));
    assert.equal(snap.totalCents, 2000 + snap.taxCents);
    assert.equal(snap.snapCoveredCents, 1000);
  });
  test('SNAP request above eligible is capped', () => {
    const r = computeTax([{ grossCents: 700, snapEligible: true }, { grossCents: 300 }], S, { snapCents: 5000 });
    assert.equal(r.snapCoveredCents, 700);
  });
  test('partial SNAP leaves proportional tax on the remainder', () => {
    const r = computeTax([{ grossCents: 1000, snapEligible: true }], S, { snapCents: 400 });
    assert.equal(r.taxCents, Math.round(600 * 0.0825));
  });
  test('inclusive + SNAP strips embedded tax from the covered part', () => {
    const r = computeTax([{ grossCents: 1080, snapEligible: true }], { defaultRateBps: 800, inclusive: true }, { snapCents: 1000 });
    assert.equal(r.snapCoveredCents, 1000); assert.equal(r.taxCents, 0); assert.equal(r.totalCents, 1000);
  });
});

describe('allocateProportional', () => {
  test('sums exactly', () => {
    const a = allocateProportional(100, [1, 1, 1]); assert.equal(a.reduce((x, y) => x + y, 0), 100);
    assert.deepEqual(allocateProportional(0, [1, 2]), [0, 0]);
    assert.deepEqual(allocateProportional(10, [0, 0]), [0, 0]);
  });
});

describe('EBT eligible subtotal + guidance', () => {
  const lines = [{ grossCents: 600, snapEligible: true }, { grossCents: 400, snapEligible: true }, { grossCents: 500 }];
  test('sums eligible lines only', () => assert.equal(snapEligibleSubtotal(lines), 1000));
  test('basket discount shrinks the eligible part proportionally', () => {
    assert.equal(snapEligibleSubtotal(lines, 150), 900);     // 1000/1500 of 150 = 100 off
  });
  test('no eligible items -> no guidance', () => {
    const g = ebtGuidance([{ grossCents: 500 }], S); assert.equal(g.hasEligible, false); assert.equal(g.message, '');
  });
  test('guidance names SNAP amount and the taxed remainder', () => {
    const g = ebtGuidance(lines, S);
    assert.equal(g.snapMaxCents, 1000);
    assert.equal(g.remainderCents, 500 + Math.round(500 * 0.0825));
    assert.match(g.message, /Put \$10\.00 on EBT SNAP \/ \$5\.41 remains for cash or card/);
  });
  test('all-eligible ticket leaves nothing', () => {
    const g = ebtGuidance([{ grossCents: 300, snapEligible: true }], S);
    assert.equal(g.remainderCents, 0); assert.match(g.message, /nothing remains/);
  });
});

describe('validateTenders', () => {
  test('cash with change', () => {
    const r = validateTenders([{ type: 'CASH', amountCents: 1083, tenderedCents: 2000 }], 1083);
    assert.equal(r.ok, true); if (r.ok) assert.equal(r.changeCents, 917);
  });
  test('must sum to total', () => {
    const r = validateTenders([{ type: 'CASH', amountCents: 500 }], 1083); assert.equal(r.ok, false);
  });
  test('EBT SNAP + cash split', () => {
    const r = validateTenders([
      { type: 'EXTERNAL', kind: 'EBT_SNAP', amountCents: 1000, reference: 'AB1234', balanceCents: 4521 },
      { type: 'CASH', amountCents: 541, tenderedCents: 600 },
    ], 1541, { snapMaxCents: 1000 });
    assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.snapCents, 1000); assert.equal(r.tenders[0].balanceCents, 4521); assert.equal(r.changeCents, 59); }
  });
  test('EBT SNAP + card split', () => {
    const r = validateTenders([{ type: 'EXTERNAL', kind: 'EBT_SNAP', amountCents: 800, reference: '77889' }, { type: 'CARD', amountCents: 200 }], 1000, { snapMaxCents: 800 });
    assert.equal(r.ok, true);
  });
  test('SNAP over eligible is rejected', () => {
    const r = validateTenders([{ type: 'EXTERNAL', kind: 'EBT_SNAP', amountCents: 1100, reference: 'AB1234' }], 1100, { snapMaxCents: 1000 });
    assert.equal(r.ok, false);
  });
  test('EBT requires an approval reference', () => {
    assert.equal(validateTenders([{ type: 'EXTERNAL', kind: 'EBT_SNAP', amountCents: 100 }], 100, { snapMaxCents: 100 }).ok, false);
    assert.equal(validateTenders([{ type: 'EXTERNAL', kind: 'EBT_CASH', amountCents: 100 }], 100).ok, false);
  });
  test('EBT cash can pay non-eligible items; check needs no reference', () => {
    assert.equal(validateTenders([{ type: 'EXTERNAL', kind: 'EBT_CASH', amountCents: 100, reference: 'ZZ99' }], 100).ok, true);
    assert.equal(validateTenders([{ type: 'EXTERNAL', kind: 'CHECK', amountCents: 100 }], 100).ok, true);
  });
  test('gift/store credit rejected until enabled; bad amounts rejected', () => {
    assert.equal(validateTenders([{ type: 'GIFT', amountCents: 100 }], 100).ok, false);
    assert.equal(validateTenders([{ type: 'CASH', amountCents: -5 }], 100).ok, false);
    assert.equal(validateTenders([{ type: 'CASH', amountCents: 100, tenderedCents: 50 }], 100).ok, false);
    assert.equal(validateTenders([], 100).ok, false);
  });
  test('legacy order tender parses', () => {
    assert.deepEqual(parseTenders(undefined, 'CASH', 500), [{ type: 'CASH', amountCents: 500 }]);
  });
});

describe('planRefund', () => {
  const order = {
    lines: [
      { productId: 'a', title: 'A', qty: 3, chargeCents: 1000, taxCents: 100 },
      { productId: 'b', title: 'B', qty: 1, chargeCents: 500, taxCents: 0 },
    ],
    tenders: [{ type: 'EXTERNAL' as const, kind: 'EBT_SNAP' as const, amountCents: 500 }, { type: 'CASH' as const, amountCents: 1000 }],
  };
  test('partial then final unit sums exactly to the line', () => {
    const p1 = planRefund(order, [], { lines: [{ index: 0, qty: 1, restock: true }], method: 'ORIGINAL' });
    assert.equal(p1.ok, true); if (!p1.ok) return;
    assert.equal(p1.plan.lines[0].amountCents, 333);
    const p2 = planRefund(order, [{ lines: p1.plan.lines, allocations: p1.plan.allocations }], { lines: [{ index: 0, qty: 2 }], method: 'ORIGINAL' });
    assert.equal(p2.ok, true); if (p2.ok) assert.equal(p2.plan.lines[0].amountCents, 667);
  });
  test('cannot refund more qty than remains', () => {
    assert.equal(planRefund(order, [{ lines: [{ index: 0, qty: 3, amountCents: 1000, taxCents: 100 }], allocations: [] }], { lines: [{ index: 0, qty: 1 }], method: 'ORIGINAL' }).ok, false);
  });
  test('cash refund blocked when it would exceed non-SNAP money', () => {
    assert.equal(planRefund(order, [], { lines: [{ index: 1, qty: 1 }], method: 'ORIGINAL' }).ok, true);
    const r = planRefund(order, [], { lines: [{ index: 0, qty: 3 }, { index: 1, qty: 1 }], method: 'CASH' });
    assert.equal(r.ok, false);
  });
  test('original allocation never exceeds each tender', () => {
    const r = planRefund(order, [], { lines: [{ index: 0, qty: 3 }, { index: 1, qty: 1 }], method: 'ORIGINAL' });
    assert.equal(r.ok, true);
    if (r.ok) { assert.equal(r.plan.allocations.reduce((s, a) => s + a.amountCents, 0), 1500); r.plan.allocations.forEach(a => assert.ok(a.amountCents <= (a.type === 'CASH' ? 1000 : 500))); }
  });
});
