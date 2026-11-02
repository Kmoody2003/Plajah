// Creator split payments: config rules and the payout ledger (services/splitPayouts.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRecipients, allocateSplits, checkSplitConfig, createCreatorPayouts, CREATOR_EARNINGS, isDefiniteRejection, retryDue, splitsOwedByEarning, SPLIT_PAYOUTS } from '../services/splitPayouts';

const HOUR = 3_600_000;

/** In-memory Firestore + a Stripe that, like the real one, replays a result for a repeated idempotency key. */
function harness(users: Record<string, any> = {}) {
  const docs = new Map<string, Record<string, any>>();
  for (const [uid, u] of Object.entries(users)) docs.set(`users/${uid}`, u);
  const state = {
    clock: 1_000_000 * 1000,
    transfers: [] as any[],
    createCalls: [] as any[],
    reversals: [] as string[],
    reversalKeys: [] as string[],
    failReversalOnce: false,
    replay: new Map<string, any>(),
    nextCreate: [] as any[],      // errors to raise; `afterCharge` also creates the transfer first
    failPatchOnce: false,
    createOnceError: false,
    notified: [] as string[],
  };
  const stripe = {
    paymentIntents: { retrieve: async (_id: string, opts?: any) => ({ latest_charge: opts?.expand ? { transfer: 'tr_direct' } : 'ch_1' }) },
    transfers: {
      list: async (q: any) => ({ data: state.transfers.filter(t => t.destination === q.destination && t.created >= q.created.gte), has_more: false }),
      create: async (params: any, opts: any) => {
        state.createCalls.push({ params, key: opts.idempotencyKey });
        if (state.replay.has(opts.idempotencyKey)) {
          const prior = state.replay.get(opts.idempotencyKey);
          if (prior instanceof Error) throw prior;
          return prior;
        }
        const planned = state.nextCreate.shift();
        if (planned && !planned.afterCharge) {
          if (isDefiniteRejection(planned)) state.replay.set(opts.idempotencyKey, planned);
          throw planned;
        }
        const t = { id: `tr_${state.transfers.length + 1}`, amount: params.amount, destination: params.destination, metadata: params.metadata, created: Math.floor(state.clock / 1000) };
        state.transfers.push(t);
        state.replay.set(opts.idempotencyKey, t);
        if (planned?.afterCharge) throw planned;
        return t;
      },
      retrieve: async (id: string) => state.transfers.find(t => t.id === id),
      createReversal: async (id: string, params: any, opts: any) => {
        state.reversalKeys.push(opts.idempotencyKey);
        if (state.failReversalOnce) { state.failReversalOnce = false; throw new Error('balance too low'); }
        const t = state.transfers.find(x => x.id === id);
        t.amount_reversed = (t.amount_reversed || 0) + params.amount;
        state.reversals.push(id);
        return { id: `rv_${id}` };
      },
    },
  };
  const engine = createCreatorPayouts({
    read: async (c, id) => docs.get(`${c}/${id}`) ?? null,
    createOnce: async (c, id, data) => {
      if (state.createOnceError) return 'error';
      if (docs.has(`${c}/${id}`)) return 'exists';
      docs.set(`${c}/${id}`, { ...data });
      return 'created';
    },
    patch: async (c, id, data) => {
      if (state.failPatchOnce && data.status === 'paid_out') { state.failPatchOnce = false; throw new Error('firestore down'); }
      docs.set(`${c}/${id}`, { ...(docs.get(`${c}/${id}`) ?? {}), ...data });
    },
    query: async (c, filters) => [...docs.entries()]
      .filter(([k, d]) => k.startsWith(`${c}/`) && filters.every(f => d[f.field] === f.value))
      .map(([k, d]) => ({ id: k.slice(c.length + 1), data: d })),
    getStripe: () => stripe,
    notifyAwaitingConnect: async uid => { state.notified.push(uid); },
    now: () => state.clock,
  });
  const row = (uid: string) => docs.get(`${SPLIT_PAYOUTS}/cs_1_${uid}`)!;
  return { docs, state, engine, row };
}

const sale = (uids = ['bob']) => ({
  earningId: 'cs_1', fromCreatorUid: 'amy', category: 'digital_sale', title: 'Sale', paymentIntentId: 'pi_1',
  lines: uids.map(u => ({ creatorUid: u, displayName: u, amountCents: 500, percentage: 25 })),
});
const CONNECTED = { bob: { stripeConnectAccountId: 'acct_bob' } };
const stripeError = (statusCode: number, message = 'refused') => Object.assign(new Error(message), { statusCode, type: 'StripeInvalidRequestError' });

test('a sale pays the recipient once, tied to the buyer charge, and marks the row', async () => {
  const { engine, state, row } = harness(CONNECTED);
  assert.deepEqual(await engine.recordAndPay(sale()), { ok: true });
  assert.equal(state.transfers.length, 1);
  assert.equal(state.createCalls[0].params.source_transaction, 'ch_1');
  assert.equal(state.createCalls[0].key, 'split_cs_1_bob_0');
  assert.equal(row('bob').status, 'paid_out');
  assert.equal(row('bob').transferId, 'tr_1');
});

test('a re-fired webhook cannot pay twice', async () => {
  const { engine, state } = harness(CONNECTED);
  await engine.recordAndPay(sale());
  await engine.recordAndPay(sale());
  await engine.retryFailed();
  await engine.payPendingFor('bob');
  assert.equal(state.transfers.length, 1);
});

test('a recipient without Connect is recorded, told once per sale, and paid when they connect', async () => {
  const { engine, state, row, docs } = harness();
  await engine.recordAndPay(sale());
  assert.equal(state.transfers.length, 0);
  assert.equal(row('bob').status, 'awaiting_connect');
  assert.deepEqual(state.notified, ['bob']);

  assert.deepEqual(await engine.payPendingFor('bob'), { paid: 0, waiting: 1 });
  docs.set('users/bob', CONNECTED.bob);
  assert.deepEqual(await engine.payPendingFor('bob'), { paid: 1, waiting: 0 });
  assert.equal(row('bob').status, 'paid_out');
  await engine.payPendingFor('bob');
  assert.equal(state.transfers.length, 1, 'repeat status polls do not pay again');
});

test('the retry job pays a recipient who connected without the status check running', async () => {
  const { engine, state, row, docs } = harness();
  await engine.recordAndPay(sale());
  docs.set('users/bob', CONNECTED.bob);
  assert.deepEqual(await engine.retryFailed(), { paid: 1, waiting: 0 });
  assert.equal(row('bob').status, 'paid_out');
  assert.equal(state.transfers.length, 1);
});

test('a refused transfer stays retryable, and only the retry after a refusal gets a new key', async () => {
  const { engine, state, row } = harness(CONNECTED);
  state.nextCreate.push(stripeError(400, 'insufficient funds'));
  await engine.recordAndPay(sale());
  assert.equal(row('bob').status, 'pending');
  assert.equal(row('bob').attempts, 1);
  assert.equal(row('bob').rejections, 1);
  assert.match(row('bob').lastPayoutError, /insufficient/);

  assert.deepEqual(await engine.retryFailed(), { paid: 0, waiting: 1 }, 'backing off: too soon to retry');
  state.clock += 16 * 60_000;
  assert.deepEqual(await engine.retryFailed(), { paid: 1, waiting: 0 });
  assert.equal(state.createCalls[1].key, 'split_cs_1_bob_1');
  assert.equal(state.transfers.length, 1);
});

test('an in-doubt failure retries the same key, so a transfer Stripe did make is not repeated', async () => {
  const { engine, state, row } = harness(CONNECTED);
  state.nextCreate.push(Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError', afterCharge: true }));
  await engine.recordAndPay(sale());
  assert.equal(row('bob').status, 'pending');
  assert.equal(row('bob').rejections, 0, 'not a definite refusal');
  state.clock += 16 * 60_000;
  await engine.retryFailed();
  assert.equal(state.transfers.length, 1);
  assert.equal(row('bob').status, 'paid_out');
});

test('a transfer whose row update was lost is found by metadata even after the idempotency key expires', async () => {
  const { engine, state, row } = harness(CONNECTED);
  state.failPatchOnce = true;
  await engine.recordAndPay(sale());
  assert.equal(state.transfers.length, 1);
  assert.equal(row('bob').status, 'pending');
  state.replay.clear();            // Stripe forgot the key
  state.clock += 3 * 24 * HOUR;
  await engine.retryFailed();
  assert.equal(state.transfers.length, 1, 'no second transfer');
  assert.equal(row('bob').status, 'paid_out');
  assert.equal(row('bob').transferId, 'tr_1');
});

test('a ledger write failure asks for the webhook to be re-sent', async () => {
  const { engine, state } = harness(CONNECTED);
  state.createOnceError = true;
  assert.deepEqual(await engine.recordAndPay(sale()), { ok: false });
  assert.equal(state.transfers.length, 0);
  state.createOnceError = false;
  assert.deepEqual(await engine.recordAndPay(sale()), { ok: true });
  assert.equal(state.transfers.length, 1);
});

test('one recipient failing does not stop the others', async () => {
  const { engine, state, row } = harness({ ...CONNECTED, cal: { stripeConnectAccountId: 'acct_cal' } });
  state.nextCreate.push(stripeError(400));
  await engine.recordAndPay(sale(['bob', 'cal', 'dee']));
  assert.equal(row('bob').status, 'pending');
  assert.equal(row('cal').status, 'paid_out');
  assert.equal(row('dee').status, 'awaiting_connect');
});

test('a full refund cancels unpaid rows, reverses paid ones, and stops later payment', async () => {
  const { engine, state, row, docs } = harness(CONNECTED);
  await engine.recordAndPay(sale(['bob', 'dee']));
  await engine.applyRefund('pi_1', 2000, 2000);
  assert.deepEqual(state.reversals, ['tr_1']);
  assert.equal(row('bob').status, 'refunded');
  assert.equal(row('dee').status, 'refunded');
  docs.set('users/dee', { stripeConnectAccountId: 'acct_dee' });
  await engine.payPendingFor('dee');
  await engine.paySplit('cs_1_dee');
  assert.equal(state.transfers.length, 1);
  await engine.applyRefund('pi_1', 2000, 2000);
  assert.equal(state.reversals.length, 1, 'a re-fired refund does not reverse twice');
});

test('config: one shape, and shares can not be used to drain the platform', () => {
  const r = (creatorUid: string, percentage: any) => ({ creatorUid, displayName: creatorUid, percentage });
  assert.equal(checkSplitConfig([r('bob', 500), r('cal', -450)], [], 'amy').ok, false, 'a negative share can not offset a huge one');
  assert.equal(checkSplitConfig([r('bob', '50')], [], 'amy').ok, false);
  assert.equal(checkSplitConfig([r('bob', 60), r('cal', 40)], [], 'amy').ok, false, 'creator must keep something');
  assert.equal(checkSplitConfig([r('amy', 10)], [], 'amy').ok, false, 'not to yourself');
  assert.equal(checkSplitConfig([r('bob', 10), r('bob', 10)], [], 'amy').ok, false);
  assert.equal(checkSplitConfig([r('a/b', 10)], [], 'amy').ok, false);
  assert.equal(checkSplitConfig({ creatorId: 'amy', splits: [] }, [], 'amy').ok, false, 'the old CreatorSplit shape is not accepted');
  const good = checkSplitConfig([{ ...r('bob', 12.5), extra: 'dropped' }], undefined, 'amy');
  assert.ok(good.ok);
  if (good.ok) {
    assert.deepEqual(good.recipients, [r('bob', 12.5)]);
    assert.ok(good.appliesTo.includes('digital_sale'));
    assert.ok(!good.appliesTo.includes('tip'));
  }
  const tipsOnly = checkSplitConfig([], ['tip', 'store_order', 'club'], 'amy');
  assert.ok(tipsOnly.ok && tipsOnly.appliesTo.join() === 'club', 'destination charges can not be split');
  const stored = JSON.stringify([r('bob', 10)]);
  assert.equal(activeRecipients(stored, '["digital_sale"]', 'amy', 'digital_sale').length, 1);
  assert.equal(activeRecipients(stored, '["sanctuary"]', 'amy', 'digital_sale').length, 0);
  assert.equal(activeRecipients(JSON.stringify([r('bob', 900)]), '["digital_sale"]', 'amy', 'digital_sale').length, 0, 'a bad stored doc pays nothing');
  assert.equal(activeRecipients('not json', '[]', 'amy', 'digital_sale').length, 0);
});

test('allocation never exceeds the net, and drops shares under a cent', () => {
  const r = (creatorUid: string, percentage: number) => ({ creatorUid, displayName: '', percentage });
  const a = allocateSplits(101, [r('b', 33.5), r('c', 33.5), r('d', 32.5)]);
  assert.equal(a.lines.reduce((s, l) => s + l.amountCents, a.creatorNetCents), 101);
  assert.ok(a.creatorNetCents > 0);
  assert.deepEqual(allocateSplits(10, [r('b', 5)]).lines, []);
  assert.equal(allocateSplits(10, [r('b', 5)]).creatorNetCents, 10);
});

test('re-fired events only recover earnings written with the ledger, since older ones may already be paid', () => {
  const lines = [{ creatorUid: 'bob', displayName: 'b', amountCents: 5, percentage: 5 }];
  const splits = JSON.stringify(lines);
  assert.deepEqual(splitsOwedByEarning({ splits, splitLedger: true, status: 'pending' }), lines);
  assert.deepEqual(splitsOwedByEarning({ splits, status: 'paid_out' }), [], 'legacy row');
  assert.deepEqual(splitsOwedByEarning({ splits, splitLedger: true, status: 'refunded' }), []);
  assert.deepEqual(splitsOwedByEarning(null), []);
});

test('retry rules', () => {
  assert.equal(isDefiniteRejection({ statusCode: 400 }), true);
  assert.equal(isDefiniteRejection({ statusCode: 500 }), false);
  assert.equal(isDefiniteRejection({ statusCode: 429 }), false);
  assert.equal(isDefiniteRejection({}), false);
  assert.equal(isDefiniteRejection({ statusCode: 400, type: 'StripeIdempotencyError' }), false);
  assert.equal(retryDue({ attempts: 0 }, 0), true);
  assert.equal(retryDue({ attempts: 2, lastPayoutAttemptAt: 0 }, 29 * 60_000), false);
  assert.equal(retryDue({ attempts: 2, lastPayoutAttemptAt: 0 }, 30 * 60_000), true);
  assert.equal(retryDue({ attempts: 40, lastPayoutAttemptAt: 0 }, 24 * HOUR), true, 'capped at a day');
});

const earningRow = (over: Record<string, any> = {}) => ({ creatorUid: 'amy', category: 'digital_sale', creatorNetCents: 1000, status: 'pending', payeeVerified: true, timestamp: 1_000_000 * 1000, stripePaymentIntentId: 'pi_1', ...over });
const AMY = { amy: { stripeConnectAccountId: 'acct_amy' } };

test('creator earnings: paid once, keeping the original key, and found again after the key expires', async () => {
  const { engine, state, docs } = harness(AMY);
  docs.set(`${CREATOR_EARNINGS}/cs_1`, earningRow());
  state.failPatchOnce = false;
  assert.equal(await engine.payEarning('cs_1', true), 'paid');
  assert.equal(state.createCalls[0].key, 'earning_cs_1');
  assert.equal(state.createCalls[0].params.source_transaction, 'ch_1');
  docs.set(`${CREATOR_EARNINGS}/cs_1`, { ...docs.get(`${CREATOR_EARNINGS}/cs_1`), status: 'pending' }); // the write was lost
  state.replay.clear();
  await engine.retryFailed();
  assert.equal(state.transfers.length, 1);
  assert.equal(docs.get(`${CREATOR_EARNINGS}/cs_1`).status, 'paid_out');
});

test('creator earnings: the retry job retries failures, and old buyer-named rows are never paid', async () => {
  const { engine, state, docs } = harness(AMY);
  docs.set(`${CREATOR_EARNINGS}/cs_1`, earningRow());
  docs.set(`${CREATOR_EARNINGS}/cs_old`, earningRow({ category: 'club', payeeVerified: undefined }));
  state.nextCreate.push(stripeError(400));
  await engine.retryFailed();
  assert.equal(docs.get(`${CREATOR_EARNINGS}/cs_1`).payoutFailing, true);
  state.clock += 16 * 60_000;
  await engine.retryFailed();
  assert.equal(docs.get(`${CREATOR_EARNINGS}/cs_1`).status, 'paid_out');
  assert.equal(state.createCalls.at(-1).key, 'earning_cs_1_1');
  assert.equal(docs.get(`${CREATOR_EARNINGS}/cs_old`).status, 'pending');
  assert.equal(state.transfers.length, 1);
});

test('renewal earnings are payable like first payments', async () => {
  const { engine, state, docs } = harness(AMY);
  docs.set(`${CREATOR_EARNINGS}/inv_1`, earningRow({ category: 'sanctuary' }));
  assert.equal(await engine.payEarning('inv_1', true), 'paid');
  assert.equal(state.transfers.length, 1);
});

test('partial refunds take back the same fraction from everyone, cumulatively and only once', async () => {
  const { engine, state, row, docs } = harness({ ...CONNECTED, ...AMY });
  docs.set(`${CREATOR_EARNINGS}/cs_1`, earningRow());
  await engine.payEarning('cs_1', true);
  await engine.recordAndPay(sale());
  const amyTransfer = state.transfers[0], bobTransfer = state.transfers[1];

  await engine.applyRefund('pi_1', 500, 2000);      // 25%
  assert.equal(amyTransfer.amount_reversed, 250);
  assert.equal(bobTransfer.amount_reversed, 125);
  await engine.applyRefund('pi_1', 500, 2000);      // the same event again
  assert.equal(amyTransfer.amount_reversed, 250);
  assert.equal(row('bob').status, 'paid_out');

  await engine.applyRefund('pi_1', 1000, 2000);     // a second refund: 50% in total
  assert.equal(amyTransfer.amount_reversed, 500);
  await engine.applyRefund('pi_1', 2000, 2000);     // the rest
  assert.equal(amyTransfer.amount_reversed, 1000);
  assert.equal(row('bob').status, 'refunded');
  assert.equal(docs.get(`${CREATOR_EARNINGS}/cs_1`).status, 'refunded');
});

test('a partial refund before payment reduces what is paid later', async () => {
  const { engine, state, row, docs } = harness();
  await engine.recordAndPay(sale());
  await engine.applyRefund('pi_1', 500, 2000);
  assert.equal(row('bob').status, 'awaiting_connect');
  docs.set('users/bob', CONNECTED.bob);
  await engine.payPendingFor('bob');
  assert.equal(state.transfers[0].amount, 375);
  assert.match(state.createCalls[0].key, /_c125$/);
});

test('a failed reversal is kept and retried, and a transfer found late is corrected', async () => {
  const { engine, state, row } = harness(CONNECTED);
  await engine.recordAndPay(sale());
  state.failReversalOnce = true;
  await engine.applyRefund('pi_1', 2000, 2000);
  assert.equal(row('bob').reversalDue, true);
  assert.equal(row('bob').status, 'paid_out');
  assert.equal(await engine.retryReversals(), 1);
  assert.equal(row('bob').status, 'refunded');
  assert.equal(state.reversals.length, 1);

  const late = harness(CONNECTED);
  late.state.failPatchOnce = true;
  await late.engine.recordAndPay(sale());           // paid, but the row still says pending
  await late.engine.applyRefund('pi_1', 500, 2000);
  await late.engine.retryFailed();
  assert.equal(late.state.transfers.length, 1, 'no second transfer');
  assert.equal(late.state.transfers[0].amount_reversed, 125);
});

test('disputes: unpaid shares wait, a win releases them, a loss takes back paid ones', async () => {
  const held = harness();
  await held.engine.recordAndPay(sale());
  await held.engine.applyDispute('pi_1', 'needs_response', 2000, 2000);
  held.docs.set('users/bob', CONNECTED.bob);
  await held.engine.payPendingFor('bob');
  await held.engine.retryFailed();
  assert.equal(held.state.transfers.length, 0, 'held while open');
  await held.engine.applyDispute('pi_1', 'won', 2000, 2000);
  assert.equal(held.state.transfers.length, 1, 'released on a win');
  assert.equal(held.row('bob').status, 'paid_out');

  const lost = harness(CONNECTED);
  await lost.engine.recordAndPay(sale());
  await lost.engine.applyDispute('pi_1', 'needs_response', 2000, 2000);
  assert.equal(lost.state.reversals.length, 0, 'paid shares stay out during the dispute');
  await lost.engine.applyDispute('pi_1', 'lost', 2000, 2000);
  assert.equal(lost.state.transfers[0].amount_reversed, 500);
  assert.equal(lost.row('bob').status, 'refunded');
  assert.equal(lost.row('bob').disputeHold, false);
});

test('a destination charge pays nothing here, but a refund or lost dispute reverses the charge transfer', async () => {
  const { docs, state, engine } = harness();
  state.transfers.push({ id: 'tr_direct', amount: 1000, destination: 'acct_amy', created: 0, metadata: {} });
  const earning = { creatorUid: 'amy', category: 'content_purchase', creatorNetCents: 800, status: 'paid_direct', stripePaymentIntentId: 'pi_1', timestamp: 0 };
  docs.set(`${CREATOR_EARNINGS}/cs_1`, { ...earning });
  assert.equal(await engine.payEarning('cs_1'), 'skipped');
  assert.equal(state.createCalls.length, 0);
  await engine.applyRefund('pi_1', 500, 1000);
  assert.equal(state.transfers[0].amount_reversed, 400);
  await engine.applyDispute('pi_1', 'lost', 1000, 1000);
  assert.equal(state.transfers[0].amount_reversed, 800);
  assert.equal(docs.get(`${CREATOR_EARNINGS}/cs_1`)!.status, 'refunded');
});

test('a refund Stripe already reversed on the charge is not taken twice', async () => {
  const { docs, state, engine } = harness();
  state.transfers.push({ id: 'tr_direct', amount: 1000, amount_reversed: 500, destination: 'acct_amy', created: 0, metadata: {} });
  docs.set(`${CREATOR_EARNINGS}/cs_1`, { creatorUid: 'amy', category: 'content_purchase', creatorNetCents: 800, status: 'paid_direct', stripePaymentIntentId: 'pi_1', timestamp: 0 });
  await engine.applyRefund('pi_1', 500, 1000);
  assert.equal(state.reversals.length, 0);
});

test('a share paid reduced after a partial refund only gives back what was actually sent', async () => {
  const { docs, state, engine } = harness();
  state.transfers.push({ id: 'tr_9', amount: 900, destination: 'acct_bob', created: 0, metadata: {} });
  docs.set(`${SPLIT_PAYOUTS}/cs_1_bob`, { recipientUid: 'bob', amountCents: 1000, clawbackCents: 100, status: 'paid_out', transferId: 'tr_9', stripePaymentIntentId: 'pi_1', createdAt: 0 });
  await engine.applyRefund('pi_1', 100, 1000);
  assert.equal(state.reversals.length, 0, 'a repeat of the same refund takes nothing more');
  await engine.applyRefund('pi_1', 200, 1000);
  assert.equal(state.transfers[0].amount_reversed, 100);
  await engine.applyRefund('pi_1', 1000, 1000);
  assert.equal(state.transfers[0].amount_reversed, 900, 'a full refund never exceeds the transfer');
});
