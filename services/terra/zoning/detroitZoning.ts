/**
 * Detroit — hand-encoded dimensional standards.
 *
 * ⚠️ Read before trusting or extending.
 *
 * There is NO machine-readable source for dimensional standards anywhere in SE
 * Michigan — the city's zoning GIS layer carries a district CODE only. These
 * rules are transcribed by hand from the city's published summary table and the
 * zoning ordinance (Chapter 50, Article XIII of the 2019 Detroit City Code).
 *
 * Discipline this file holds to:
 *   · Only encode rows we can cite. Districts/uses not below return
 *     NO_RULE_ENCODED — the tool says "not encoded yet" rather than guessing.
 *   · Standards are keyed by (district × USE), not district alone — one district
 *     has many use rows with different envelopes.
 *   · Some values are expressions, not scalars: "4 ft min / 14 ft combined"
 *     sides, and setbacks driven by a length+height formula.
 *   · Every rule carries an effectiveDate. Detroit's "Let's Build More Housing"
 *     reform is pending in council and would move the residential numbers — when
 *     it passes, add new rules with a later effectiveDate; don't edit these.
 *
 * VERIFIED numbers below come from the city's "Summary Table of Zoning Intensity
 * and Dimensional Standards including setbacks" (footer dated 30 Aug 2018, posted
 * Apr 2019 — pre-recodification, so it uses old Ch.61 section numbers). Where the
 * table gave a row, it's marked VERIFIED; nothing else is invented.
 */

import type { ZoningRule } from '../terraTypes';

const CITE = 'Detroit Zoning Ordinance summary table (2018) · verify against Municode Ch. 50 Art. XIII before design';
const EFFECTIVE = '2018-08-30';

function src() {
  return [{
    system: 'detroit-zoning-ordinance:summary-table-2018',
    label: 'Detroit Zoning Ordinance (hand-encoded)',
    url: 'https://library.municode.com/mi/detroit/codes/code_of_ordinances',
    retrievedAt: Date.parse('2026-07-30'),
    observed: 'observed' as const,
    attribution: 'Dimensional standards transcribed from the City of Detroit Zoning Ordinance',
  }];
}

/**
 * The encoded rule set. Keyed `detroit:<district>:<useKey>`.
 * Currently: R2 (single- and multiple-family) and R4 (townhouse) — the rows the
 * summary table gave explicitly. Everything else → NO_RULE_ENCODED, honestly.
 */
export const DETROIT_ZONING_RULES: ZoningRule[] = [
  {
    id: 'detroit:R2:single_family',
    jurisdiction: 'detroit',
    district: 'R2',
    useKey: 'single_family',
    useLabel: 'Single-family dwelling',
    minLotSqFt: 5000,
    minLotWidthFt: 50,
    frontSetback: { kind: 'fixed', feet: 20 },
    // "4 ft minimum / 14 ft combined" — the classic expression-valued side.
    sideSetback: { each: { kind: 'fixed', feet: 4 }, combinedMinFeet: 14 },
    rearSetback: { kind: 'fixed', feet: 30 },
    maxHeightFt: 35,
    maxLotCoveragePct: 35,
    // No FAR row for R2 single-family in the table.
    additionalRegulations: ['Accessory building & corner-lot rules may apply (separate table)'],
    citation: CITE,
    effectiveDate: EFFECTIVE,
    sources: src(),
  },
  {
    id: 'detroit:R2:multiple_family',
    jurisdiction: 'detroit',
    district: 'R2',
    useKey: 'multiple_family',
    useLabel: 'Multiple-family dwelling',
    minLotSqFt: 7000,
    minLotWidthFt: 70,
    frontSetback: { kind: 'fixed', feet: 20 },
    sideSetback: { each: { kind: 'fixed', feet: 10 } },
    rearSetback: { kind: 'fixed', feet: 30 },
    maxHeightFt: 35,
    maxLotCoveragePct: 40,
    maxFar: 0.5,
    citation: CITE,
    effectiveDate: EFFECTIVE,
    sources: src(),
  },
  {
    id: 'detroit:R4:townhouse',
    jurisdiction: 'detroit',
    district: 'R4',
    useKey: 'townhouse',
    useLabel: 'Townhouse',
    minLotSqFt: 7000,
    minLotWidthFt: 70,
    frontSetback: { kind: 'fixed', feet: 20 },
    // Formula A = (length + 2·height) / 15, per the table's footnote.
    sideSetback: { each: { kind: 'formula', lengthCoeff: 1, heightCoeff: 2, divisor: 15, minFeet: 5 } },
    rearSetback: { kind: 'fixed', feet: 30 },
    maxHeightFt: 35,
    maxFar: 1.0,
    citation: CITE,
    effectiveDate: EFFECTIVE,
    sources: src(),
  },
];

/** Uses offered per district in the UI. Only uses we've encoded appear here. */
export const DETROIT_USES_BY_DISTRICT: Record<string, { key: string; label: string }[]> = {
  R2: [
    { key: 'single_family', label: 'Single-family dwelling' },
    { key: 'multiple_family', label: 'Multiple-family dwelling' },
  ],
  R4: [
    { key: 'townhouse', label: 'Townhouse' },
  ],
};

const BY_ID = new Map(DETROIT_ZONING_RULES.map(r => [r.id, r]));

/** Look up a rule. Returns null when the (district × use) pair isn't encoded. */
export function findDetroitRule(district?: string, useKey?: string): ZoningRule | null {
  if (!district || !useKey) return null;
  return BY_ID.get(`detroit:${district.toUpperCase()}:${useKey}`) ?? null;
}

/** Encoded uses for a district, or [] if the district has no rules yet. */
export function detroitUsesFor(district?: string): { key: string; label: string }[] {
  if (!district) return [];
  return DETROIT_USES_BY_DISTRICT[district.toUpperCase()] ?? [];
}
