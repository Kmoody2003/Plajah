/**
 * Business Compliance — permits, inspections, and licence renewals for a
 * storefront, off the same public-record spine as the rest of Terra.
 *
 * A business address IS a parcel, so its permits, inspections and violations
 * come from the civic records Terra already ingests. What Terra adds is the
 * thing the city doesn't give you: a renewal calendar that tells you what's due
 * and deep-links you to the right portal to file.
 *
 * ── Honesty ──────────────────────────────────────────────────────────────────
 *  · No municipality offers a filing API. We track what's due and hand you to
 *    the city's own portal — we never claim to submit for you.
 *  · Locally there's no ingested civic data, so items here are demo/derived and
 *    labelled. Real items derive from `terraCivic` once a business address is
 *    matched to a Detroit parcel.
 *  · Detroit only, for now — mirrors the rest of the layer's coverage.
 */

export type ComplianceKind = 'LICENSE' | 'INSPECTION' | 'PERMIT' | 'REGISTRATION';
export type ComplianceState = 'CURRENT' | 'DUE_SOON' | 'OVERDUE' | 'ON_FILE';
export type ComplianceSource = 'demo' | 'derived';

export interface ComplianceItem {
  id: string;
  title: string;
  authority: string;
  kind: ComplianceKind;
  state: ComplianceState;
  /** ms epoch when it's next due. Absent for one-time / on-file items. */
  dueAt?: number;
  /** Days until due — derived, positive = future, negative = overdue. */
  daysUntil?: number;
  note?: string;
  portalUrl?: string;
  portalLabel?: string;
  source: ComplianceSource;
}

/** Known Detroit filing portals. Deep links only — we don't file for you. */
export const DETROIT_PORTALS: { id: string; label: string; url: string }[] = [
  { id: 'accela', label: 'Detroit permits & licences (Accela)', url: 'https://aca-prod.accela.com/DETROIT/' },
  { id: 'bseed', label: 'City of Detroit — BSEED', url: 'https://detroitmi.gov/departments/buildings-safety-engineering-and-environmental-department-bseed' },
  { id: 'wayne-health', label: 'Wayne County — food & health', url: 'https://www.waynecounty.com/elected/executive/health-veterans-community-wellness.aspx' },
  { id: 'fire', label: 'Detroit Fire Marshal — inspections', url: 'https://detroitmi.gov/departments/detroit-fire-department' },
];

const DAY = 24 * 60 * 60 * 1000;

function stateFor(dueAt: number | undefined, now: number): { state: ComplianceState; daysUntil?: number } {
  if (dueAt === undefined) return { state: 'ON_FILE' };
  const daysUntil = Math.round((dueAt - now) / DAY);
  if (daysUntil < 0) return { state: 'OVERDUE', daysUntil };
  if (daysUntil <= 30) return { state: 'DUE_SOON', daysUntil };
  return { state: 'CURRENT', daysUntil };
}

/**
 * A representative compliance set for a physical storefront. `now` is passed in
 * (never `Date.now()` at module scope) so due dates are stable per render/test.
 * Restaurant-flavoured because that's where compliance bites hardest; the shape
 * is the same for any storefront.
 */
export function demoComplianceItems(businessName: string, now: number): ComplianceItem[] {
  const mk = (
    id: string, title: string, authority: string, kind: ComplianceKind,
    dueInDays: number | null, portalId?: string, note?: string,
  ): ComplianceItem => {
    const dueAt = dueInDays === null ? undefined : now + dueInDays * DAY;
    const { state, daysUntil } = stateFor(dueAt, now);
    const portal = DETROIT_PORTALS.find(p => p.id === portalId);
    return { id, title, authority, kind, state, dueAt, daysUntil, note, portalUrl: portal?.url, portalLabel: portal?.label, source: 'demo' };
  };

  return [
    mk('food-license', 'Food service establishment licence', 'Wayne County Health', 'LICENSE', 18, 'wayne-health', 'Renews annually'),
    mk('fire', 'Fire safety inspection', 'Detroit Fire Marshal', 'INSPECTION', 64, 'fire'),
    mk('biz-license', 'Business licence renewal', 'City of Detroit · BSEED', 'LICENSE', 214, 'bseed'),
    mk('sign-permit', 'Projecting sign permit', 'City of Detroit · BSEED', 'PERMIT', null, 'accela', 'One-time · on file'),
  ];
}

/** Sort for the "coming due" list: overdue first, then soonest. On-file last. */
export function sortByUrgency(items: ComplianceItem[]): ComplianceItem[] {
  return [...items].sort((a, b) => {
    const av = a.dueAt ?? Infinity, bv = b.dueAt ?? Infinity;
    return av - bv;
  });
}

export const STATE_STYLE: Record<ComplianceState, { text: string; label: string }> = {
  OVERDUE:  { text: '#FF6B5E', label: 'Overdue' },
  DUE_SOON: { text: '#E8B33D', label: 'Due soon' },
  CURRENT:  { text: '#3DD68C', label: 'Current' },
  ON_FILE:  { text: '#6F7689', label: 'On file' },
};
