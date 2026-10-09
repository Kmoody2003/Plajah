// Pricing + royalty maths. Pure.
//
// Platform cut on direct sales: 5% (the older "90/10" figure is stale).
// Payment processing: Stripe's published fees depend on country, card type, currency conversion and your
// agreement, so the numbers below are an ESTIMATE using the commonly published US-card list rate
// (2.9% + 30 cents). The UI labels them as an estimate; real figures are in the Stripe dashboard.
// Assumption stated to the author: both the processing fee and Plajah's 5% are taken out of the sale price
// (the 5% is computed on the list price, before the processing fee).

export const PLATFORM_CUT_PCT = 5;
export const STRIPE_ESTIMATE = { pct: 2.9, fixed: 0.30, fixedCurrency: 'USD', label: 'estimate' } as const;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'NGN', 'GHS', 'KES', 'ZAR', 'INR', 'BRL', 'MXN', 'JPY'] as const;
const ZERO_DECIMAL = new Set(['JPY']);

export const PRICE_FLOOR = 0.99;       // below this (but > 0) is rejected: processing fees would eat the sale
export const PRICE_CEILING = 200;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RoyaltyBreakdown {
  currency: string;
  listPrice: number;
  platformCut: number;
  processingFee: number;
  processingIsApprox: boolean;   // true when the fixed fee was applied in a non-USD currency without conversion
  authorTakeHome: number;
  takeHomePct: number;
  per100Sales: number;
}

export function royaltyBreakdown(listPrice: number, currency = 'USD', discountPct = 0): RoyaltyBreakdown {
  const sale = Math.max(0, listPrice * (1 - Math.min(100, Math.max(0, discountPct)) / 100));
  if (sale <= 0) return { currency, listPrice: sale, platformCut: 0, processingFee: 0, processingIsApprox: false, authorTakeHome: 0, takeHomePct: 0, per100Sales: 0 };
  const platformCut = sale * PLATFORM_CUT_PCT / 100;
  const approx = currency !== STRIPE_ESTIMATE.fixedCurrency;
  const processingFee = sale * STRIPE_ESTIMATE.pct / 100 + STRIPE_ESTIMATE.fixed;
  const take = Math.max(0, sale - platformCut - processingFee);
  const dp = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const r = (n: number) => dp === 0 ? Math.round(n) : round2(n);
  return {
    currency, listPrice: r(sale), platformCut: r(platformCut), processingFee: r(processingFee), processingIsApprox: approx,
    authorTakeHome: r(take), takeHomePct: Math.round((take / sale) * 1000) / 10, per100Sales: r(take * 100),
  };
}

export interface PriceSuggestion { low: number; suggested: number; high: number; basis: string }

/** A heuristic starting point, NOT market data. Bands by word count, nudged by genre. */
export function suggestPrice(wordCount: number, genre = ''): PriceSuggestion {
  const bands: [number, number, number, number][] = [ // upTo words, low, suggested, high
    [8_000, 0.99, 0.99, 1.99],
    [25_000, 0.99, 1.99, 2.99],
    [50_000, 1.99, 2.99, 3.99],
    [80_000, 2.99, 3.99, 5.99],
    [120_000, 3.99, 4.99, 6.99],
    [Infinity, 4.99, 5.99, 8.99],
  ];
  const b = bands.find(x => wordCount <= x[0])!;
  let [, low, sug, high] = b;
  const g = genre.toLowerCase();
  if (/textbook|academic|reference|business|self-help|non-?fiction/.test(g)) { low += 1; sug += 2; high += 4; }
  else if (/romance|fantasy|sci|thriller|mystery|horror/.test(g)) { /* genre fiction: price competitively */ }
  const r2 = round2;
  return {
    low: r2(low), suggested: r2(sug), high: r2(high),
    basis: `Typical independent ebook range for about ${Math.round(wordCount / 1000)}k words${g ? ` in ${genre}` : ''}. A starting point — check comparable titles in your genre.`,
  };
}

export interface SampleSplit { freeIds: string[]; paidIds: string[]; freeWords: number; freePct: number }

/** Which chapters are free: the first N chapters, plus enough more to reach the sample %. */
export function sampleSplit(chapters: { id: string; wordCount: number }[], freePct: number, freeFirstChapters: number): SampleSplit {
  const total = chapters.reduce((s, c) => s + c.wordCount, 0) || 1;
  const target = total * Math.min(50, Math.max(0, freePct)) / 100;
  const free: string[] = []; let words = 0;
  chapters.forEach((c, i) => {
    if (i < freeFirstChapters || words < target) { free.push(c.id); words += c.wordCount; }
  });
  if (free.length === chapters.length && chapters.length > 1 && freeFirstChapters < chapters.length) free.pop(); // never give the whole book away via the % rule
  const freeWords = chapters.filter(c => free.includes(c.id)).reduce((s, c) => s + c.wordCount, 0);
  return { freeIds: free, paidIds: chapters.filter(c => !free.includes(c.id)).map(c => c.id), freeWords, freePct: Math.round((freeWords / total) * 100) };
}

export function bundlePrice(prices: number[], discountPct: number): { sum: number; bundle: number; saves: number } {
  const sum = round2(prices.reduce((s, p) => s + p, 0));
  const bundle = round2(sum * (1 - Math.min(90, Math.max(0, discountPct)) / 100));
  return { sum, bundle, saves: round2(sum - bundle) };
}

export function formatMoney(n: number, currency: string): string {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: ZERO_DECIMAL.has(currency) ? 0 : 2 }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
}
