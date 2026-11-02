// Sales go straight to the people being paid: services/payments/directRoute.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSaleRoute, feesFromMeta, fixedCutBreakdown, paymentRouting, saleMeta, subscriptionRouting } from '../services/payments/directRoute';
import { plajahPlusBreakdown, saleBreakdown } from '../services/payments/saleFees';

const accounts: Record<string, string> = { amy: 'acct_amy', bob: 'acct_bob', cal: 'acct_cal' };
const deps = {
  accountOf: async (uid: string) => accounts[uid],
  canReceive: async (account: string) => account !== 'acct_cal',
};

test('a seller who can be paid gets a direct route', async () => {
  assert.deepEqual(await checkSaleRoute(deps, 'amy', []), { ok: true, route: 'direct', destination: 'acct_amy' });
});

test('collaborators make it a split route, only if every one of them can be paid', async () => {
  assert.equal((await checkSaleRoute(deps, 'amy', [{ creatorUid: 'bob' }]) as any).route, 'split');
  assert.equal((await checkSaleRoute(deps, 'amy', [{ creatorUid: 'bob' }, { creatorUid: 'nobody' }])).ok, false);
  assert.equal((await checkSaleRoute(deps, 'amy', [{ creatorUid: 'cal' }])).ok, false);
});

test('no sale is taken for a seller who is unconnected or cannot take payouts', async () => {
  assert.equal((await checkSaleRoute(deps, 'nobody', [])).ok, false);
  assert.equal((await checkSaleRoute(deps, 'cal', [])).ok, false);
});

test('a direct charge withholds only the fee and processing', () => {
  const route = { route: 'direct' as const, destination: 'acct_amy' };
  const fees = saleBreakdown(1000, false);
  assert.equal(fees.platformFeeCents, 50);
  assert.equal(fees.processingCents, 59);
  assert.deepEqual(paymentRouting(route, fees), { transfer_data: { destination: 'acct_amy' }, application_fee_amount: 109 });
  assert.equal(fees.sellerCents, 891);
});

test('Plajah+ holders pay no Plajah fee, only processing', () => {
  const fees = saleBreakdown(1000, true);
  assert.equal(fees.platformFeeCents, 0);
  assert.equal(fees.applicationFeeCents, 59);
});

test('a zero fee sends no application fee, which Stripe would refuse', () => {
  const route = { route: 'direct' as const, destination: 'acct_amy' };
  assert.deepEqual(paymentRouting(route, fixedCutBreakdown(1000, 0)), { transfer_data: { destination: 'acct_amy' } });
});

test('a split sale has no destination, because its transfers follow the charge', () => {
  const route = { route: 'split' as const, destination: 'acct_amy' };
  assert.deepEqual(paymentRouting(route, saleBreakdown(1000, false)), {});
  assert.deepEqual(subscriptionRouting(route, 1000, saleBreakdown(1000, false)), {});
});

test('a subscription withholds the same share as a percentage', () => {
  const route = { route: 'direct' as const, destination: 'acct_amy' };
  assert.deepEqual(subscriptionRouting(route, 1000, saleBreakdown(1000, false)), { transfer_data: { destination: 'acct_amy' }, application_fee_percent: 10.9 });
  // $4.99 Plajah+: the creator keeps $2.99, so Plajah withholds $2.00.
  const plus = subscriptionRouting(route, 499, plajahPlusBreakdown(499, 1)) as any;
  assert.equal(plus.application_fee_percent, 40.08);
  assert.equal(Math.round(499 * (1 - plus.application_fee_percent / 100)), 299);
});

test('the webhook records exactly what the checkout stamped', () => {
  const route = { route: 'direct' as const, destination: 'acct_amy' };
  const fees = saleBreakdown(1000, false);
  const read = feesFromMeta(saleMeta(route, fees))!;
  assert.equal(read.platformFeeCents, fees.platformFeeCents);
  assert.equal(read.processingCents, fees.processingCents);
  assert.equal(read.feePct, fees.feePct);
  assert.equal(feesFromMeta({}), null);
});

test('a book keeps its published cut with no processing added', () => {
  assert.deepEqual(fixedCutBreakdown(1000, 30), { feePct: 30, platformFeeCents: 300, processingCents: 0, sellerCents: 700, applicationFeeCents: 300 });
});
