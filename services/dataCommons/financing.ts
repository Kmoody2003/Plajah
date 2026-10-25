/**
 * Data Commons — SBA financing guide (Business).
 *
 * Most federal money for ordinary small businesses is a LOAN, not a grant. This is a curated,
 * source-linked guide to the programs, ranked against what the owner says they need. It is static on
 * purpose: SBA publishes no program-eligibility API, and the facts here change slowly.
 *
 * Every figure is the one stated on sba.gov at `ASOF`. Where SBA's own pages disagree with themselves
 * (the 504 page gives both "$5 million" and "$5.5 million"), we show the figure as a range and send the
 * reader to confirm with the lender. Nothing here is a credit decision, a guarantee or advice.
 */

export const FINANCING_ASOF = '2026-10';

export type FinancePurpose = 'working-capital' | 'equipment' | 'real-estate' | 'refinance' | 'startup' | 'ownership-change';

export interface FinanceProgram {
  id: '7a' | '504' | 'microloan' | 'disaster';
  name: string;
  /** What SBA says it is, in one line. */
  summary: string;
  /** Max as stated on sba.gov (display text, never used for arithmetic beyond `maxAmount`). */
  maxText: string;
  /** Numeric ceiling for ranking; the lowest figure SBA states. */
  maxAmount: number;
  uses: string[];
  /** What it cannot be used for, where SBA says so. */
  notFor?: string[];
  /** Who you actually apply through — you never apply to SBA directly for these. */
  applyThrough: string;
  steps: string[];
  links: { label: string; url: string }[];
}

export const PROGRAMS: FinanceProgram[] = [
  {
    id: '7a', name: 'SBA 7(a) loan',
    summary: 'SBA\'s main long-term loan program: a lender makes the loan and SBA guarantees part of it.',
    maxText: 'Up to $5 million', maxAmount: 5_000_000,
    uses: ['Working capital', 'Buying, refinancing or improving real estate', 'Machinery, equipment, furniture and fixtures', 'Refinancing business debt', 'Buying or partly buying a business (change of ownership)'],
    applyThrough: 'An SBA-participating lender (bank or credit union). SBA\'s Lender Match tool connects you to lenders.',
    steps: ['Gather two years of business and personal financial statements, tax returns and a business plan', 'Use Lender Match to find participating lenders', 'Apply to the lender; they decide, and SBA guarantees'],
    links: [{ label: 'SBA — 7(a) loans', url: 'https://www.sba.gov/funding-programs/loans/7a-loans' }, { label: 'SBA — Lender Match', url: 'https://www.sba.gov/funding-programs/loans/lender-match' }],
  },
  {
    id: '504', name: 'SBA 504 loan',
    summary: 'Long-term, fixed-rate financing for major fixed assets, delivered with a Certified Development Company (CDC).',
    maxText: '$5 million to $5.5 million (SBA\'s pages state both; confirm with a CDC)', maxAmount: 5_000_000,
    uses: ['Buying, building or renovating land and buildings', 'Long-term machinery and equipment (useful life of 10 years or more)', 'Refinancing qualifying debt'],
    notFor: ['Working capital or inventory', 'Speculation or investment in rental real estate'],
    applyThrough: 'A Certified Development Company (CDC), a community nonprofit, working with a lender.',
    steps: ['Find your local CDC from SBA\'s list', 'Bring your project cost estimate and financials', 'The CDC structures the financing with a lender'],
    links: [{ label: 'SBA — 504 loans', url: 'https://www.sba.gov/funding-programs/loans/504-loans' }, { label: 'SBA — Certified Development Companies', url: 'https://www.sba.gov/funding-programs/loans/504-loans/list-of-certified-development-companies' }],
  },
  {
    id: 'microloan', name: 'SBA Microloan',
    summary: 'Small loans for small improvements and startups, made through nonprofit intermediary lenders.',
    maxText: '$50,000 or less', maxAmount: 50_000,
    uses: ['Working capital', 'Supplies and inventory', 'Equipment and furniture'],
    applyThrough: 'An SBA intermediary lender (a community-based nonprofit microlender), who often also gives training and coaching.',
    steps: ['Find a microlender in your area from SBA\'s list', 'Expect a short application and a business plan', 'Ask about the free training that often comes with it'],
    links: [{ label: 'SBA — Microloans', url: 'https://www.sba.gov/funding-programs/loans/microloans' }, { label: 'SBA — Microlenders', url: 'https://www.sba.gov/funding-programs/loans/microloans/list-of-microlenders' }],
  },
  {
    id: 'disaster', name: 'SBA disaster loans',
    summary: 'Low-interest loans for businesses harmed by a declared disaster. Available only after a declaration.',
    maxText: 'Set per declaration', maxAmount: 0,
    uses: ['Repairing or replacing damaged property', 'Working capital to recover'],
    applyThrough: 'SBA directly, after a disaster declaration covering your county.',
    steps: ['Check whether your county has an active declaration', 'Apply through SBA\'s disaster assistance site'],
    links: [{ label: 'SBA — Disaster assistance', url: 'https://www.sba.gov/funding-programs/disaster-assistance' }],
  },
];

export const FREE_HELP = [
  { name: 'Small Business Development Centers (SBDCs)', what: 'Free or low-cost one-on-one advising on plans, financing and growth, hosted at universities and colleges.', url: 'https://www.sba.gov/local-assistance/find' },
  { name: 'SCORE mentors', what: 'Free mentoring from experienced business owners, online or in person.', url: 'https://www.score.org/' },
  { name: 'Women\'s Business Centers and Veterans Business Outreach Centers', what: 'Training and counseling aimed at women and veteran entrepreneurs.', url: 'https://www.sba.gov/local-assistance/find' },
];

export type Fit = 'strong' | 'possible' | 'poor';
export interface Recommendation { program: FinanceProgram; fit: Fit; why: string }

/**
 * Rank programs for a stated need. Deterministic and explainable: each result says why. The disaster
 * program only appears when the owner says a disaster is the cause.
 */
export function recommendFinancing(opts: { purpose: FinancePurpose; amount?: number; disaster?: boolean }): Recommendation[] {
  const { purpose, amount, disaster } = opts;
  const out: Recommendation[] = [];
  const by = (id: FinanceProgram['id']) => PROGRAMS.find(p => p.id === id)!;
  const big = amount !== undefined && amount > 50_000;
  const overCap = amount !== undefined && amount > 5_500_000;
  // Microloans fit these purposes; refinancing and buying a business are not what SBA lists them for.
  const tiny = amount !== undefined && amount <= 50_000 && ['working-capital', 'startup', 'equipment'].includes(purpose);
  const fixedAssetLarge = (purpose === 'equipment' || purpose === 'real-estate') && amount !== undefined && amount >= 125_000;

  if (overCap) {
    return [{ program: by('7a'), fit: 'poor', why: 'This is above the $5 million 7(a) limit. A commercial lender may structure it, sometimes pairing a 504 loan with a bank loan; start with an SBDC adviser.' }];
  }

  // 7(a): covers nearly every purpose.
  out.push({
    program: by('7a'),
    // For large fixed-asset purchases the 504 is purpose-built, so 7(a) drops to "possible".
    fit: fixedAssetLarge || tiny ? 'possible' : 'strong',
    why: tiny ? '7(a) works too, but very small loans are often easier to get through a microlender, who also coaches you.'
      : purpose === 'working-capital' ? '7(a) is SBA\'s main program for working capital.'
      : purpose === 'startup' ? '7(a) can finance a startup if you have a plan and some owner investment; lenders look hard at new businesses.'
      : purpose === 'ownership-change' ? '7(a) can fund a full or partial change of ownership.'
      : purpose === 'refinance' ? '7(a) can refinance business debt.'
      : fixedAssetLarge ? '7(a) can also finance this and is more flexible, but the 504 is built for large fixed assets, so compare both.'
      : '7(a) covers equipment, fixtures and real estate, and is the most flexible option.',
  });

  const fixedAsset = purpose === 'equipment' || purpose === 'real-estate';
  out.push({
    program: by('504'),
    fit: fixedAsset && (amount === undefined || amount >= 125_000) ? 'strong' : purpose === 'refinance' ? 'possible' : 'poor',
    why: fixedAsset ? '504 is built for major fixed assets like buildings and long-lived equipment, with fixed-rate long-term financing.'
      : purpose === 'refinance' ? '504 can refinance only qualifying debt; ask a CDC whether yours qualifies.'
      : '504 cannot be used for working capital or inventory.',
  });

  out.push({
    program: by('microloan'),
    fit: !big && (purpose === 'working-capital' || purpose === 'startup' || purpose === 'equipment') ? 'strong' : big ? 'poor' : 'possible',
    why: big ? 'Microloans stop at $50,000, below the amount you need.' : 'Microloans fit smaller needs and come from nonprofit lenders who often coach you too.',
  });

  if (disaster) out.push({ program: by('disaster'), fit: 'strong', why: 'You said a disaster caused the need. Check whether your county has an active declaration.' });

  const rank: Record<Fit, number> = { strong: 0, possible: 1, poor: 2 };
  return out.sort((a, b) => rank[a.fit] - rank[b.fit]);
}
