/**
 * Terra Law Library — search over the lightweight index rows (citation, catchline, act title).
 *
 * Deterministic and dependency-free so it runs the same in the browser and the server.
 * Matching is token-prefix based ("licen" matches "license", "licenses", "licensing") with a
 * small synonym map for the plain-language words business owners actually type.
 */

import type { LawSearchRow } from './lawTypes';

const SYNONYMS: Record<string, string[]> = {
  wage: ['wage', 'wages', 'pay'],
  liquor: ['liquor', 'alcohol', 'alcoholic'],
  alcohol: ['alcohol', 'liquor', 'alcoholic'],
  restaurant: ['restaurant', 'food', 'establishment'],
  rent: ['rent', 'rental', 'lease', 'landlord', 'tenant'],
  landlord: ['landlord', 'tenant', 'rental', 'lease'],
  employee: ['employee', 'employer', 'employment', 'worker'],
  hiring: ['employment', 'employee', 'employer', 'hire'],
  tax: ['tax', 'taxes', 'taxation'],
  permit: ['permit', 'license', 'licence'],
  license: ['license', 'licensing', 'licensed', 'licensee', 'permit'],
  marijuana: ['marihuana', 'marijuana', 'cannabis'],
  cannabis: ['marihuana', 'marijuana', 'cannabis'],
};

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'for', 'on', 'my', 'is', 'do', 'i', 'how', 'what', 'law', 'laws', 'mcl', 'michigan']);

export function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9.\s]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
}

/** Rank rows for a query. Returns rows best-first (max `limit`). */
export function searchLaw(rows: LawSearchRow[], query: string, limit = 60): LawSearchRow[] {
  const q = query.trim();
  if (!q) return [];
  const cite = /(\d{1,3}[a-z]?\.\d+[a-z]?)/i.exec(q)?.[1];
  const qTokens = tokens(q).filter((t) => !/^\d+[a-z]?\.\d/.test(t));
  const groups = qTokens.map((t) => SYNONYMS[t] ?? [t]);

  const scored: { r: LawSearchRow; s: number }[] = [];
  for (const r of rows) {
    let s = 0;
    if (cite) {
      if (r[1] === cite) s += 1000;
      else if (r[1].startsWith(cite)) s += 300;
    }
    if (groups.length) {
      const catchWords = tokens(r[2]);
      const ctxWords = tokens(r[3]);
      let matched = 0;
      for (const g of groups) {
        const inCatch = catchWords.some((w) => g.some((t) => w.startsWith(t)));
        const inCtx = ctxWords.some((w) => g.some((t) => w.startsWith(t)));
        if (inCatch || inCtx) matched++;
        if (inCatch) s += 10;
        if (inCtx) s += 6;
      }
      if (matched < groups.length) s = cite && s >= 300 ? s : 0; // every word must match somewhere
      else s += matched === groups.length ? 20 : 0;
    }
    if (s > 0) scored.push({ r, s });
  }
  scored.sort((a, b) => b.s - a.s || a.r[1].localeCompare(b.r[1], undefined, { numeric: true }));
  return scored.slice(0, limit).map((x) => x.r);
}
