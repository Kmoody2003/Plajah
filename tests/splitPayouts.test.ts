// Creator split payments: config rules and the payout ledger (services/splitPayouts.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeRecipients, allocateSplits, checkSplitConfig, createSplitPayouts, isDefiniteRejection, retryDue, splitsOwedByEarning, unmatchedLegacySplits, SPLIT_PAYOUTS } from '../services/splitPayouts';

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
    replay: new Map<string, any>(),
    nextCreate: [] as any[],      // errors to raise; `afterCharge` also creates the transfer first
    failPatchOnce: false,
    createOnceError: false,
    notified: [] as string[],
  };
  const stripe = {
    paymentIntents: { retrieve: async () => ({ latest_charge: 'ch_1' }) },
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
      createReversal: async (id: string) => { state.reversals.push(id); return { id: `rv_${id}` }; },
    },
  };
  const engine = createSplitPayouts({
    read: async (c, id) => docs.get(`${c}/${id}`) ?? null,
    createOnce: async (c, id, data) => {
      if (state.createOnceError) return 'error';
      if (docs.has(`${c}/${id}`)) return 'exists';
      docs.set(`${c}/${id}`, { ...data });
      return 'created';
    },
    patch: async (c, id, data) => {
      if (state.failPatchOnce) { state.failPatchOnce = false; throw new Error('firestore down'); }
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
  assert.deepEqual(await engine.reverseForPaymentIntent('pi_1'), { ok: true });
  assert.deepEqual(state.reversals, ['tr_1']);
  assert.equal(row('bob').status, 'refunded');
  assert.equal(row('dee').status, 'refunded');
  docs.set('users/dee', { stripeConnectAccountId: 'acct_dee' });
  await engine.payPendingFor('dee');
  await engine.payOne('cs_1_dee');
  assert.equal(state.transfers.length, 1);
  await engine.reverseForPaymentIntent('pi_1');
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
  }
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

test('legacy audit finds lines no old transfer covers, and spends each transfer once', () => {
  const line = (creatorUid: string, amountCents: number) => ({ creatorUid, displayName: '', amountCents, percentage: 10 });
  const earning = { creatorUid: 'amy', category: 'digital_sale', timestamp: 1000 * 1000, splits: [line('bob', 100), line('bob', 100), line('cal', 50)] };
  const meta = { type: 'split', fromCreatorUid: 'amy', toCreatorUid: 'bob', category: 'digital_sale' };
  const missing = unmatchedLegacySplits(earning, [{ id: 'tr_1', amount: 100, created: 1001, metadata: meta }], new Set());
  assert.deepEqual(missing.map(l => l.creatorUid), ['bob', 'cal']);
  assert.equal(unmatchedLegacySplits(earning, [{ id: 'tr_1', amount: 100, created: 9_000_000, metadata: meta }], new Set()).length, 3, 'outside the window');
});
