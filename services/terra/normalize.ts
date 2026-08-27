/**
 * Terra — normalisation keys for equality lookups.
 *
 * Firestore can only match a stored value exactly, so anything a human types
 * (an address, a business name) has to be reduced to a canonical key at WRITE
 * time and reduced the same way at READ time. These functions are the contract
 * between those two moments: change one and you must re-ingest, or lookups
 * silently return nothing.
 *
 * Deliberately conservative. Aggressive normalisation collapses genuinely
 * different records together — "123 Main St N" and "123 Main St S" must not
 * become one key — so we standardise punctuation, spacing and the common
 * street/company suffixes, and stop there.
 */

/** Street-type synonyms → a single canonical token. */
const STREET_TYPES: Record<string, string> = {
  street: 'st', st: 'st',
  avenue: 'ave', ave: 'ave', av: 'ave',
  boulevard: 'blvd', blvd: 'blvd',
  road: 'rd', rd: 'rd',
  drive: 'dr', dr: 'dr',
  court: 'ct', ct: 'ct',
  lane: 'ln', ln: 'ln',
  place: 'pl', pl: 'pl',
  terrace: 'ter', ter: 'ter',
  parkway: 'pkwy', pkwy: 'pkwy',
  highway: 'hwy', hwy: 'hwy',
  circle: 'cir', cir: 'cir',
  square: 'sq', sq: 'sq',
  trail: 'trl', trl: 'trl',
};

/** Directionals are MEANINGFUL — normalise the spelling, never drop them. */
const DIRECTIONS: Record<string, string> = {
  north: 'n', n: 'n',
  south: 's', s: 's',
  east: 'e', e: 'e',
  west: 'w', w: 'w',
  northeast: 'ne', ne: 'ne',
  northwest: 'nw', nw: 'nw',
  southeast: 'se', se: 'se',
  southwest: 'sw', sw: 'sw',
};

/**
 * Canonical form of a street address, e.g.
 * `8156 Normile St.` and `8156 NORMILE STREET` → `8156 normile st`.
 *
 * Unit/suite designators are dropped: the city's compliance and licence records
 * key to the BUILDING, so "Apt 3" would prevent a tenant's own address from
 * matching their building's record.
 */
export function addressKey(raw?: string | null): string {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  // Everything from a unit designator onward describes a unit, not a building.
  s = s.replace(/\b(apt|apartment|unit|ste|suite|fl|floor|rm|room|#)\b.*$/i, ' ');
  s = s.replace(/[.,]/g, ' ').replace(/[^a-z0-9\s-]/g, ' ');
  const tokens = s.split(/\s+/).filter(Boolean).map(t => DIRECTIONS[t] ?? STREET_TYPES[t] ?? t);
  return tokens.join(' ').trim();
}

/** Company-form suffixes that vary between filings for the same business. */
const COMPANY_SUFFIXES = new Set([
  'llc', 'l l c', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company',
  'ltd', 'limited', 'lp', 'llp', 'plc', 'pc', 'pllc', 'dba',
]);

/**
 * Canonical form of a business name, e.g.
 * `VISION TRANSPORTATION OF MI, LLC` → `vision transportation of mi`.
 *
 * The company suffix is stripped because a business rarely types its own legal
 * suffix the way the licence register recorded it. Everything else is kept —
 * two businesses whose names differ only in a middle word are different
 * businesses, and a verification check must not conflate them.
 */
export function businessNameKey(raw?: string | null): string {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  s = s.replace(/&/g, ' and ');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  const tokens = s.split(/\s+/).filter(Boolean);
  // Strip suffixes only from the END — "Co" inside "Co-op Market" is not a suffix.
  while (tokens.length > 1 && COMPANY_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(' ').trim();
}
