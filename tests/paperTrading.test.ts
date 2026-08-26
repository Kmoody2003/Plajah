/**
 * paperTrading.test.ts — the guardrails of the practice portfolio.
 *
 * Two halves:
 *  • The LEARNER rules in placeOrder. These are the promises the School of Money makes to a
 *    teacher: a trade cannot be placed without a written reason, training wheels actually restrict
 *    the instrument list, and you cannot sell what you do not own.
 *  • The EDUCATOR rows in loadClassPortfolios. The rule that matters most here is that a teacher's
 *    read never falls back to the local cache — that bug would show a teacher their own trades
 *    under a student's name.
 *
 * Run: npm run test:paper
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// localStorage shim — the service persists locally first and must never throw without one.
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};

// Fake cloud for the educator half. 'dee' deliberately has no document at all.
const CLOUD: Record<string, any> = {
  ada: {
    ownerUid: 'ada', cash: 8591.82, holdings: { VOO: 2 }, startedAt: 1, updatedAt: 2,
    trainingWheels: true, benchmarkStart: 700,
    trades: [{
      id: 't1', at: 1, side: 'BUY', symbol: 'VOO', shares: 2, price: 704.09,
      reason: 'Buying the broad index because I want to own the whole market and hold it for years.',
      review: 'Six months on: the reason still holds, and I did not touch it once.',
    }],
  },
  bo: {
    ownerUid: 'bo', cash: 9000, holdings: { VTI: 2 }, startedAt: 1, updatedAt: 2, trainingWheels: true,
    trades: [
      { id: 't2', at: 1, side: 'BUY', symbol: 'VTI', shares: 2, price: 500, reason: 'seemed good ok' },
      { id: 't3', at: 2, side: 'BUY', symbol: 'VTI', shares: 0, price: 500, reason: 'idk why not' },
      { id: 't4', at: 3, side: 'BUY', symbol: 'VTI', shares: 0, price: 500, reason: 'x' },
    ],
  },
  cleo: { ownerUid: 'cleo', cash: 10000, holdings: {}, startedAt: 1, updatedAt: 2, trainingWheels: true, trades: [] },
};

mock.module('firebase/firestore', {
  namedExports: {
    doc: (_db: unknown, _c: string, uid: string) => ({ uid }),
    getDoc: async (ref: { uid: string }) => ({ exists: () => !!CLOUD[ref.uid], data: () => CLOUD[ref.uid] }),
    setDoc: async () => {},
  },
});
mock.module('../services/firebase', { namedExports: { db: {}, auth: {} } });
mock.module('../services/stockQuoteService', {
  namedExports: {
    fetchStockQuotes: async (syms: string[]) => {
      const P: Record<string, number> = { VOO: 710, VTI: 505 };
      return syms.filter(s => P[s] != null).map(s => ({ symbol: s, price: P[s], changePct: 0 }));
    },
  },
});

const {
  newPortfolio, placeOrder, reviewTrade, loadClassPortfolios, loadPortfolioCloud,
  STARTING_CASH, TRAINING_WHEELS,
} = await import('../services/paperTradingService');

const GOOD_REASON = 'Buying the broad index because I want to own the whole market for years.';
const fresh = () => newPortfolio('guest');

// ── Learner rules ─────────────────────────────────────────────────────────────
test('a new portfolio starts with the stated virtual cash and training wheels on', () => {
  const p = fresh();
  assert.equal(p.cash, STARTING_CASH);
  assert.equal(p.trainingWheels, true);
  assert.deepEqual(p.holdings, {});
});

test('a trade without a real written reason is refused', () => {
  const r = placeOrder(fresh(), 'BUY', 'VOO', 1, 700, 'idk');
  assert.equal(r.ok, false);
  assert.match(r.error!, /at least a sentence/i);
});

test('training wheels actually restrict the instrument list', () => {
  const r = placeOrder(fresh(), 'BUY', 'TSLA', 1, 250, GOOD_REASON);
  assert.equal(r.ok, false);
  assert.match(r.error!, /broad funds/i);
  // ...and the permitted list is the one the UI offers.
  assert.ok(TRAINING_WHEELS.every(t => placeOrder(fresh(), 'BUY', t.symbol, 1, 100, GOOD_REASON).ok));
});

test('a learner cannot spend cash they do not have', () => {
  const r = placeOrder(fresh(), 'BUY', 'VOO', 100, 700, GOOD_REASON);
  assert.equal(r.ok, false);
  assert.match(r.error!, /Buy fewer shares/);
});

test('zero and negative share counts are refused', () => {
  assert.equal(placeOrder(fresh(), 'BUY', 'VOO', 0, 700, GOOD_REASON).ok, false);
  assert.equal(placeOrder(fresh(), 'BUY', 'VOO', -5, 700, GOOD_REASON).ok, false);
});

test('a valid buy moves cash, records the holding, and journals the reason', () => {
  const r = placeOrder(fresh(), 'BUY', 'VOO', 2, 704.09, GOOD_REASON);
  assert.equal(r.ok, true);
  assert.equal(r.portfolio.cash, STARTING_CASH - 2 * 704.09);
  assert.equal(r.portfolio.holdings.VOO, 2);
  assert.equal(r.portfolio.trades[0].reason, GOOD_REASON);
});

test('short selling is out of scope — you cannot sell more than you hold', () => {
  const bought = placeOrder(fresh(), 'BUY', 'VOO', 2, 700, GOOD_REASON).portfolio;
  const r = placeOrder(bought, 'SELL', 'VOO', 5, 700, 'Selling more than I own to see what happens.');
  assert.equal(r.ok, false);
  assert.match(r.error!, /cannot sell more than you own/i);
});

test('selling everything returns the cash and removes the position entirely', () => {
  const bought = placeOrder(fresh(), 'BUY', 'VOO', 2, 700, GOOD_REASON).portfolio;
  const sold = placeOrder(bought, 'SELL', 'VOO', 2, 750, 'Taking the gain because my thesis has played out.').portfolio;
  assert.equal(sold.cash, STARTING_CASH - 1400 + 1500);
  assert.equal('VOO' in sold.holdings, false);
});

test('a reflection attaches to the trade it reviews and leaves the others alone', () => {
  const p = placeOrder(fresh(), 'BUY', 'VOO', 1, 700, GOOD_REASON).portfolio;
  const reviewed = reviewTrade(p, p.trades[0].id, 'Looking back, I bought for the right reason.');
  assert.match(reviewed.trades[0].review!, /right reason/);
  assert.equal(reviewTrade(p, 'no-such-trade', 'x').trades[0].review, undefined);
});

// ── Educator rows ─────────────────────────────────────────────────────────────
test('a teacher read never falls back to the local cache', async () => {
  // The local cache holds the TEACHER's own portfolio. Reading a student must ignore it.
  store.set('plajah_paper_portfolio_dee', JSON.stringify({ ownerUid: 'TEACHER_OWN', cash: 1, holdings: {}, trades: [{ reason: 'LEAKED' }] }));
  assert.equal(await loadPortfolioCloud('dee'), null);
  assert.equal(await loadPortfolioCloud('guest'), null);
});

test('every enrolled learner gets a row, including the one who never started', async () => {
  const { rows } = await loadClassPortfolios(['ada', 'bo', 'cleo', 'dee', 'ada']);
  assert.equal(rows.length, 4, 'duplicate uids are collapsed');
  assert.deepEqual(rows.map(r => r.uid).sort(), ['ada', 'bo', 'cleo', 'dee']);

  const dee = rows.find(r => r.uid === 'dee')!;
  assert.equal(dee.portfolio, null, 'never opened — null, never a zero');
  assert.equal(dee.total, null);
  assert.equal(dee.returnPct, null);

  const cleo = rows.find(r => r.uid === 'cleo')!;
  assert.notEqual(cleo.portfolio, null, 'opened but idle is a different state from never opened');
  assert.equal(cleo.trades, 0);
  assert.equal(cleo.total, STARTING_CASH);
});

test('rows value holdings at live prices and report return off the 10k start', async () => {
  const { rows } = await loadClassPortfolios(['ada']);
  const ada = rows[0];
  assert.equal(ada.total, 8591.82 + 2 * 710);
  assert.equal(ada.returnPct, Math.round(((ada.total! - STARTING_CASH) / STARTING_CASH) * 10000) / 100);
});

test('reflection and reasoning-depth signals are what a teacher can sort on', async () => {
  const { rows } = await loadClassPortfolios(['ada', 'bo']);
  const ada = rows.find(r => r.uid === 'ada')!;
  const bo = rows.find(r => r.uid === 'bo')!;
  assert.equal(ada.reviewed, 1);
  assert.equal(bo.reviewed, 0);
  assert.ok(ada.medianReasonChars > 60, 'a real thesis reads long');
  assert.equal(bo.medianReasonChars, 11, 'median of 1 / 11 / 14 characters');
});

test('the class benchmark comes from a stamped start, or is null rather than guessed', async () => {
  const withStamp = await loadClassPortfolios(['ada']);
  assert.equal(withStamp.benchmarkPct, Math.round(((710 - 700) / 700) * 10000) / 100);

  const withoutStamp = await loadClassPortfolios(['bo', 'cleo']);
  assert.equal(withoutStamp.benchmarkPct, null, 'no stamped start means no comparison, not a fake one');
});
