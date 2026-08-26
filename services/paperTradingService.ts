/**
 * paperTradingService — the practice portfolio behind the School of Money (Strand 3, Saving &
 * Investing) and the School of Economics (Markets & Prices).
 *
 * A learner is given virtual cash, buys and sells at REAL live prices via the existing
 * stockQuoteService proxy, and every trade is journalled with the reason they gave for it. The
 * reason is not decoration — reviewing your own past reasoning is the actual pedagogy, and it is
 * the thing a brokerage app will never make you do.
 *
 * DESIGN DECISIONS, all deliberate:
 *  - **No real money, ever.** There is no deposit path and no brokerage integration. This is a
 *    teaching instrument, not a gateway to a funded account.
 *  - **Every trade requires a written reason.** Enforced in `placeOrder`, not merely encouraged.
 *  - **Training wheels for younger bands.** `TRAINING_WHEELS` restricts the instrument list to
 *    broad index funds so a middle-schooler cannot learn "investing" by picking a meme stock and
 *    getting lucky. Educators can lift it per band.
 *  - **Honest returns.** Performance is reported against a benchmark held over the same period, so
 *    a learner in a rising market cannot mistake the tide for skill. This is the single most
 *    important thing a paper-trading tool can teach and most omit it.
 *  - **Persistence mirrors the platform pattern** (Praxis/ventures): localStorage first so guests
 *    and offline learners keep their place, Firestore mirror for signed-in users, reconciled by
 *    updatedAt. Never throws — a storage failure must not lose a learner's session.
 *
 * NOT ADVICE. Nothing here recommends an investment. Prices are delayed/indicative and sourced
 * from the same keyless proxy the rest of the app uses.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { fetchStockQuotes, type StockQuote } from './stockQuoteService';

const COLLECTION = 'paperPortfolios';
const LS_KEY = (uid: string) => `plajah_paper_portfolio_${uid}`;

/** Starting virtual cash. Round, memorable, and large enough to diversify. */
export const STARTING_CASH = 10_000;

/** The benchmark every portfolio is measured against. */
export const BENCHMARK = 'VOO';

/**
 * Broad, diversified instruments only — the "training wheels" list for younger learners.
 * Deliberately excludes single stocks: the lesson at this band is diversification and time, not
 * stock-picking.
 */
export const TRAINING_WHEELS: { symbol: string; label: string; note: string }[] = [
  { symbol: 'VOO', label: 'S&P 500 index fund', note: 'The 500 largest US companies, in one holding.' },
  { symbol: 'VTI', label: 'Total US market', note: 'Essentially the whole US stock market.' },
  { symbol: 'VXUS', label: 'International markets', note: 'Companies outside the United States.' },
  { symbol: 'BND', label: 'Total bond market', note: 'Lending rather than owning — steadier, lower expected return.' },
  { symbol: 'VT', label: 'Whole world', note: 'Global stocks in a single fund.' },
];

export interface PaperTrade {
  id: string;
  at: number;
  side: 'BUY' | 'SELL';
  symbol: string;
  shares: number;
  price: number;          // execution price at the time
  /** Why the learner made this trade. Required — this is the pedagogy. */
  reason: string;
  /** Optional review the learner writes later, looking back at the reason. */
  review?: string;
}

export interface PaperPortfolio {
  ownerUid: string;
  cash: number;
  /** symbol → shares held */
  holdings: Record<string, number>;
  trades: PaperTrade[];
  /** Snapshot of the benchmark price when the portfolio opened, for honest comparison. */
  benchmarkStart?: number;
  startedAt: number;
  updatedAt: number;
  /** When true, only TRAINING_WHEELS instruments may be traded. */
  trainingWheels: boolean;
}

export function newPortfolio(uid: string, trainingWheels = true): PaperPortfolio {
  const now = Date.now();
  return { ownerUid: uid, cash: STARTING_CASH, holdings: {}, trades: [], startedAt: now, updatedAt: now, trainingWheels };
}

// ── Persistence ───────────────────────────────────────────────────────────────
function readLocal(uid: string): PaperPortfolio | null {
  try { const raw = localStorage.getItem(LS_KEY(uid)); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeLocal(p: PaperPortfolio): void {
  try { localStorage.setItem(LS_KEY(p.ownerUid), JSON.stringify(p)); } catch { /* quota — non-fatal */ }
}

/** Save locally always; mirror to Firestore for signed-in learners. Never throws. */
export function savePortfolio(p: PaperPortfolio): PaperPortfolio {
  const next = { ...p, updatedAt: Date.now() };
  writeLocal(next);
  if (next.ownerUid && next.ownerUid !== 'guest') {
    // Fire-and-forget: JSON round-trip strips undefined (see plajah-firestore-gotchas).
    void setDoc(doc(db, COLLECTION, next.ownerUid), JSON.parse(JSON.stringify(next)), { merge: true }).catch(() => {});
  }
  return next;
}

/** Load, reconciling cloud and local by updatedAt. Never throws. */
export async function loadPortfolio(uid: string): Promise<PaperPortfolio | null> {
  const local = readLocal(uid);
  if (!uid || uid === 'guest') return local;
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    const remote = snap.exists() ? (snap.data() as PaperPortfolio) : null;
    if (!remote) return local;
    if (!local) { writeLocal(remote); return remote; }
    return (remote.updatedAt || 0) > (local.updatedAt || 0) ? (writeLocal(remote), remote) : local;
  } catch { return local; }
}

// ── Trading ───────────────────────────────────────────────────────────────────
export interface OrderResult { ok: boolean; error?: string; portfolio: PaperPortfolio }

/**
 * Place a virtual order at the given (live) price.
 * Rejects — with a learner-readable reason — when the reason is missing, the instrument is not
 * permitted at this band, cash is insufficient, or shares are not held.
 */
export function placeOrder(
  p: PaperPortfolio,
  side: 'BUY' | 'SELL',
  symbol: string,
  shares: number,
  price: number,
  reason: string,
): OrderResult {
  const sym = String(symbol || '').trim().toUpperCase();
  const qty = Math.floor(Number(shares));

  if (!sym) return { ok: false, error: 'Choose an instrument first.', portfolio: p };
  if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: 'Enter a whole number of shares greater than zero.', portfolio: p };
  if (!Number.isFinite(price) || price <= 0) return { ok: false, error: 'No live price available for that symbol right now.', portfolio: p };
  if (!reason || reason.trim().length < 12) {
    return { ok: false, error: 'Write why you are making this trade (at least a sentence). Reviewing your own reasoning later is the point of this exercise.', portfolio: p };
  }
  if (p.trainingWheels && !TRAINING_WHEELS.some(t => t.symbol === sym)) {
    return { ok: false, error: `While training wheels are on you can only trade broad funds: ${TRAINING_WHEELS.map(t => t.symbol).join(', ')}.`, portfolio: p };
  }

  const cost = qty * price;
  const held = p.holdings[sym] || 0;

  if (side === 'BUY' && cost > p.cash) {
    return { ok: false, error: `That costs ${fmtMoney(cost)} and you have ${fmtMoney(p.cash)}. Buy fewer shares.`, portfolio: p };
  }
  if (side === 'SELL' && qty > held) {
    return { ok: false, error: `You hold ${held} share${held === 1 ? '' : 's'} of ${sym}. You cannot sell more than you own — short selling is out of scope here.`, portfolio: p };
  }

  const holdings = { ...p.holdings };
  holdings[sym] = side === 'BUY' ? held + qty : held - qty;
  if (holdings[sym] === 0) delete holdings[sym];

  const trade: PaperTrade = {
    id: `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    at: Date.now(), side, symbol: sym, shares: qty, price, reason: reason.trim(),
  };

  const next = savePortfolio({
    ...p,
    cash: side === 'BUY' ? p.cash - cost : p.cash + cost,
    holdings,
    trades: [trade, ...p.trades],
  });
  return { ok: true, portfolio: next };
}

/** Attach a later reflection to a past trade — the review loop that makes this a lesson. */
export function reviewTrade(p: PaperPortfolio, tradeId: string, review: string): PaperPortfolio {
  return savePortfolio({ ...p, trades: p.trades.map(t => (t.id === tradeId ? { ...t, review: review.trim() } : t)) });
}

// ── Valuation ─────────────────────────────────────────────────────────────────
export interface PortfolioValuation {
  cash: number;
  positions: { symbol: string; shares: number; price: number; value: number; changePct: number }[];
  holdingsValue: number;
  total: number;
  /** Total return since opening, in percent. */
  returnPct: number;
  /** The benchmark's return over the same period, or null when unavailable. */
  benchmarkPct: number | null;
  /** Your return minus the benchmark's. Negative means the market did better without you. */
  vsBenchmarkPct: number | null;
}

/**
 * Value the portfolio at live prices and compare it honestly against the benchmark.
 * Returns cash-only figures if quotes are unavailable, rather than failing.
 */
export async function valuePortfolio(p: PaperPortfolio): Promise<PortfolioValuation> {
  const symbols = Object.keys(p.holdings);
  const want = Array.from(new Set([...symbols, BENCHMARK]));
  let quotes: StockQuote[] = [];
  try { quotes = await fetchStockQuotes(want); } catch { quotes = []; }
  const bySymbol = Object.fromEntries(quotes.map(q => [q.symbol, q]));

  const positions = symbols.map(s => {
    const q = bySymbol[s];
    const price = q?.price ?? 0;
    const shares = p.holdings[s];
    return { symbol: s, shares, price, value: shares * price, changePct: q?.changePct ?? 0 };
  });

  const holdingsValue = positions.reduce((n, x) => n + x.value, 0);
  const total = p.cash + holdingsValue;
  const returnPct = ((total - STARTING_CASH) / STARTING_CASH) * 100;

  const benchNow = bySymbol[BENCHMARK]?.price ?? null;
  const benchmarkPct = benchNow && p.benchmarkStart ? ((benchNow - p.benchmarkStart) / p.benchmarkStart) * 100 : null;

  return {
    cash: p.cash,
    positions,
    holdingsValue,
    total,
    returnPct: round2(returnPct),
    benchmarkPct: benchmarkPct === null ? null : round2(benchmarkPct),
    vsBenchmarkPct: benchmarkPct === null ? null : round2(returnPct - benchmarkPct),
  };
}

/**
 * Stamp the benchmark's opening price so later comparison is meaningful. Call once, when a
 * portfolio is first created — without it there is nothing honest to compare against.
 */
export async function stampBenchmarkStart(p: PaperPortfolio): Promise<PaperPortfolio> {
  if (p.benchmarkStart) return p;
  try {
    const [q] = await fetchStockQuotes([BENCHMARK]);
    if (q?.price) return savePortfolio({ ...p, benchmarkStart: q.price });
  } catch { /* leave unstamped; comparison degrades to null rather than lying */ }
  return p;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;
export const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

// ── Educator view ─────────────────────────────────────────────────────────────
/**
 * Read one learner's portfolio from the CLOUD ONLY.
 *
 * Deliberately does not touch localStorage: `loadPortfolio` falls back to the local cache, which
 * on a teacher's device holds the TEACHER's portfolio. Using it to read a student would silently
 * show the teacher their own trades under the student's name — the kind of bug that destroys trust
 * in a gradebook. This function returns null when there is nothing in Firestore, which is the
 * honest answer for a student who has not opened a portfolio yet.
 */
export async function loadPortfolioCloud(uid: string): Promise<PaperPortfolio | null> {
  if (!uid || uid === 'guest') return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    return snap.exists() ? (snap.data() as PaperPortfolio) : null;
  } catch { return null; }
}

/** What a teacher needs to see for one learner, without opening eight tabs. */
export interface ClassPortfolioRow {
  uid: string;
  /** Null when the learner has never opened a portfolio — shown as such, never as zero. */
  portfolio: PaperPortfolio | null;
  trades: number;
  /** Trades the learner has gone back and reviewed. The reflection loop is the actual lesson. */
  reviewed: number;
  /** Median characters of reasoning per trade — a rough but honest signal of effort. */
  medianReasonChars: number;
  /** Cash + holdings at the quoted prices passed in. */
  total: number | null;
  returnPct: number | null;
  /** Distinct symbols held. One holding across a whole term is a teachable pattern. */
  distinctHoldings: number;
}

/**
 * Build the class table in ONE quote fetch rather than one per student.
 *
 * Returns a row for every uid asked for, including learners with no portfolio, so a teacher sees
 * who has not started rather than a silently shorter list.
 */
export async function loadClassPortfolios(uids: string[]): Promise<{ rows: ClassPortfolioRow[]; benchmarkPct: number | null }> {
  const list = Array.from(new Set(uids.filter(Boolean)));
  const portfolios = await Promise.all(list.map(u => loadPortfolioCloud(u).catch(() => null)));

  const symbols = Array.from(new Set(portfolios.flatMap(p => (p ? Object.keys(p.holdings) : [])).concat(BENCHMARK)));
  let quotes: StockQuote[] = [];
  try { quotes = await fetchStockQuotes(symbols); } catch { quotes = []; }
  const price = Object.fromEntries(quotes.map(q => [q.symbol, q.price]));

  const rows: ClassPortfolioRow[] = list.map((uid, i) => {
    const p = portfolios[i];
    if (!p) {
      return { uid, portfolio: null, trades: 0, reviewed: 0, medianReasonChars: 0, total: null, returnPct: null, distinctHoldings: 0 };
    }
    const holdingsValue = Object.entries(p.holdings).reduce((n, [s, sh]) => n + sh * (price[s] ?? 0), 0);
    const total = p.cash + holdingsValue;
    const lens = p.trades.map(t => t.reason.trim().length).sort((a, b) => a - b);
    return {
      uid,
      portfolio: p,
      trades: p.trades.length,
      reviewed: p.trades.filter(t => t.review && t.review.trim().length > 0).length,
      medianReasonChars: lens.length ? lens[Math.floor(lens.length / 2)] : 0,
      total: round2(total),
      returnPct: round2(((total - STARTING_CASH) / STARTING_CASH) * 100),
      distinctHoldings: Object.keys(p.holdings).length,
    };
  });

  // One benchmark figure for the whole class, using the earliest stamped start among those who
  // have one. Null rather than a guess when nobody has opened a portfolio.
  const starts = portfolios.filter((p): p is PaperPortfolio => !!p?.benchmarkStart).map(p => p.benchmarkStart!);
  const benchNow = price[BENCHMARK] ?? null;
  const earliest = starts.length ? starts[0] : null;
  const benchmarkPct = benchNow && earliest ? round2(((benchNow - earliest) / earliest) * 100) : null;

  return { rows, benchmarkPct };
}
