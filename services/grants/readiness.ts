/**
 * Grants — readiness: what this application needs, what we already have, what is missing.
 *
 * This is how Aria is proactive. Instead of waiting to be asked, she opens an application by
 * (1) pulling everything the platform already knows, (2) comparing it with what a federal
 * application of this kind needs, and (3) asking for the gaps one at a time, longest lead time
 * first — because the thing that kills most first-time applications is a SAM.gov registration
 * started two weeks before the deadline.
 *
 * Deterministic on purpose: no model call decides what is missing, so it is testable and cheap.
 */

import type { ApplicantKind, OpportunityDetail } from '../dataCommons/grants';
import { FIELD_BY_KEY, displayValue, type Profile } from './profile';

export type Need = {
  key: string;
  /** Why this application wants it, in one sentence. */
  why: string;
  /** Registrations and letters that take calendar time to obtain. */
  leadTimeDays?: number;
  /** Cannot submit without it. */
  blocking?: boolean;
};

export type GapStatus = 'have' | 'confirm' | 'missing';
export interface Gap {
  key: string;
  label: string;
  status: GapStatus;
  /** Current value (display form) when there is one — shown as "we have: …". */
  value?: string;
  source?: string;
  why: string;
  hint: string;
  leadTimeDays?: number;
  blocking: boolean;
}

export interface Document {
  id: string;
  label: string;
  /** What it is and where it comes from — the "how do I get this" for each attachment. */
  how: string;
  /** True when we can generate a first draft on the platform. */
  weCanDraft?: boolean;
}

export interface ReadinessReport {
  gaps: Gap[];
  documents: Document[];
  /** 0–100: share of needs that are confirmed or platform-supplied. */
  percentReady: number;
  blockingMissing: number;
  daysLeft: number | null;
  warnings: string[];
}

const BASE: Need[] = [
  { key: 'legalName', why: 'Printed on the cover form and must match SAM.gov exactly.', blocking: true },
  { key: 'entityType', why: 'Decides which opportunities you may apply to (SF-424 item 9).', blocking: true },
  { key: 'ein', why: 'Required on the cover form (SF-424 item 8b).', blocking: true },
  { key: 'uei', why: 'Required: federal agencies identify applicants by UEI (SF-424 item 8c).', leadTimeDays: 28, blocking: true },
  { key: 'samStatus', why: 'You must hold an active SAM.gov registration at the time you apply and while you hold an award.', leadTimeDays: 28, blocking: true },
  { key: 'street', why: 'Applicant address (SF-424 item 8d).', blocking: true },
  { key: 'city', why: 'Applicant address.', blocking: true },
  { key: 'state', why: 'Applicant address.', blocking: true },
  { key: 'zip', why: 'Applicant address.', blocking: true },
  { key: 'congressionalDistrict', why: 'SF-424 item 16 asks for the applicant\'s and the project\'s congressional districts.' },
  { key: 'repName', why: 'Only your Authorized Organization Representative can submit and certify.', blocking: true, leadTimeDays: 7 },
  { key: 'repTitle', why: 'Printed beside the representative\'s name on the cover form.' },
  { key: 'repEmail', why: 'The representative needs a Login.gov account and the AOR role in Grants.gov.', blocking: true },
  { key: 'contactName', why: 'The agency\'s contact for questions about this application (SF-424 item 8f).' },
  { key: 'contactEmail', why: 'How the agency reaches you.' },
  { key: 'contactPhone', why: 'How the agency reaches you.' },
  { key: 'mission', why: 'Reviewers read your mission first; it frames every answer after it.' },
  { key: 'annualBudget', why: 'Shows your capacity to manage the award size.' },
  { key: 'delinquentFederalDebt', why: 'SF-424 item 20 — only your organization can answer this.', blocking: true },
];

const NONPROFIT_EXTRA: Need[] = [
  { key: 'taxExempt', why: 'Many notices are limited to 501(c)(3) organizations.' },
  { key: 'determinationLetter', why: 'Funders often ask for your IRS determination letter.', leadTimeDays: 14 },
  { key: 'boardSize', why: 'Nonprofit applications usually include a board list.' },
  { key: 'auditLevel', why: 'Funders look at your most recent financial review; $1M+ in federal spending triggers a Single Audit.' },
  { key: 'peopleServed', why: 'Reviewers compare the people you serve to your budget.' },
  { key: 'serviceArea', why: 'Many notices limit funding to specific places.' },
];

const SCHOOL_EXTRA: Need[] = [
  { key: 'peopleServed', why: 'Enrollment is the first number reviewers look for.' },
  { key: 'serviceArea', why: 'District or attendance area.' },
  { key: 'priorFederalAwards', why: 'Districts with federal funding history are usually treated as experienced.' },
];

const BUSINESS_EXTRA: Need[] = [
  { key: 'foundedYear', why: 'SBA and research programs ask how long you have operated.' },
  { key: 'staffCount', why: 'Size standards (small-business status) depend on employees and revenue.' },
];

export function needsFor(kind: ApplicantKind): Need[] {
  const extra =
    ['church', 'nonprofit', 'charity', 'cultural', 'homeschool-coop', 'private-school', 'charter-school'].includes(kind) ? NONPROFIT_EXTRA
    : ['school-district', 'public-school', 'college'].includes(kind) ? SCHOOL_EXTRA
    : ['small-business', 'business'].includes(kind) ? BUSINESS_EXTRA
    : [];
  const seen = new Set<string>();
  return [...BASE, ...extra].filter(n => !seen.has(n.key) && !!seen.add(n.key));
}

/** Extra needs implied by the notice's own eligibility text. Conservative: keyword cues only. */
export function noticeNeeds(detail?: Pick<OpportunityDetail, 'eligibilityText' | 'summary' | 'costSharing'>): Need[] {
  const t = `${detail?.eligibilityText || ''} ${detail?.summary || ''}`.toLowerCase();
  const out: Need[] = [];
  if (/501\(c\)\(3\)|tax-exempt|tax exempt/.test(t)) out.push({ key: 'determinationLetter', why: 'This notice mentions tax-exempt status.', leadTimeDays: 14 });
  if (/single audit|a-133|audit/.test(t)) out.push({ key: 'auditLevel', why: 'This notice mentions audits.' });
  if (/indirect|negotiated rate|de minimis/.test(t)) out.push({ key: 'indirectRate', why: 'This notice mentions indirect costs.' });
  if (/prior federal|experience managing federal|past performance/.test(t)) out.push({ key: 'priorFederalAwards', why: 'This notice weighs federal award experience.' });
  return out;
}

/** The attachments federal applications typically require, with where each comes from. */
export function documentsFor(kind: ApplicantKind, detail?: Pick<OpportunityDetail, 'costSharing'>): Document[] {
  const docs: Document[] = [
    { id: 'narrative', label: 'Project narrative', how: 'The heart of the application. The notice lists the exact sections and page limit.', weCanDraft: true },
    { id: 'budget', label: 'Budget (SF-424A or the notice\'s template)', how: 'Line-item costs by category. Use the notice\'s own template if it gives one.' },
    { id: 'budgetNarrative', label: 'Budget justification', how: 'One or two sentences per line explaining why each cost is needed and how you priced it.', weCanDraft: true },
    { id: 'sam', label: 'SAM.gov registration confirmation', how: 'Print the "Active" status from your SAM.gov entity record.' },
    { id: 'support', label: 'Letters of support or commitment', how: 'Ask partners 3 weeks early. Give them a one-page summary and a deadline; each letter should state what the partner will do.' },
  ];
  if (['church', 'nonprofit', 'charity', 'cultural', 'homeschool-coop', 'private-school', 'charter-school'].includes(kind)) {
    docs.push(
      { id: 'irs', label: 'IRS determination letter', how: 'The IRS letter recognizing your tax-exempt status. Churches may attach a statement instead; check the notice.' },
      { id: 'board', label: 'Board of directors list', how: 'Names, titles and affiliations. Conflict-of-interest policy goes with it if asked.' },
      { id: 'financials', label: 'Most recent financial statements', how: 'Income statement and balance sheet; an audit or CPA review if you have one.' },
      { id: 'orgchart', label: 'Organization chart / staffing plan', how: 'Who does what on this project, including your fiscal manager.', weCanDraft: true },
    );
  }
  if (['small-business', 'business'].includes(kind)) {
    docs.push(
      { id: 'bizplan', label: 'Business summary and financials', how: 'A short company profile plus two years of statements or tax returns.' },
      { id: 'ip', label: 'Ownership and size documentation', how: 'Some programs require proof of ownership percentages and employee counts.' },
    );
  }
  if (detail?.costSharing) docs.push({ id: 'match', label: 'Match / cost-share documentation', how: 'Show where your share comes from — cash, staff time, donated space — and keep records for each.' });
  docs.push({ id: 'indirect', label: 'Indirect cost rate agreement (if you have one)', how: 'No negotiated rate? You may use the 15% de minimis rate; say so in the budget.' });
  return docs;
}

const daysUntil = (iso?: string, now = Date.now()): number | null => {
  if (!iso) return null;
  const t = Date.parse(`${iso}T23:59:59Z`);
  return Number.isFinite(t) ? Math.ceil((t - now) / 86_400_000) : null;
};

/** Turn needs into gaps against a profile. A SAM.gov status other than "active" is a blocker even with a value. */
function gapsFrom(profile: Profile, needs: Need[]): Gap[] {
  return needs.map(n => {
    const f = FIELD_BY_KEY[n.key];
    const v = profile[n.key];
    const samBad = n.key === 'samStatus' && v && v.value !== 'active';
    const status: GapStatus = !v || samBad ? 'missing' : v.confirmed ? 'have' : 'confirm';
    return {
      key: n.key, label: f?.label || n.key, status,
      value: v ? displayValue(n.key, v.value) : undefined,
      source: v?.source, why: n.why, hint: f?.hint || '', leadTimeDays: n.leadTimeDays, blocking: !!n.blocking,
    };
  });
}

const rankGap = (g: Gap) => (g.status === 'missing' ? 0 : g.status === 'confirm' ? 1 : 2);
const orderGaps = (gaps: Gap[]) => gaps.sort((a, b) => rankGap(a) - rankGap(b) || (b.leadTimeDays || 0) - (a.leadTimeDays || 0) || Number(b.blocking) - Number(a.blocking));

export function buildReadiness(
  profile: Profile,
  opts: { kind: ApplicantKind; closeDate?: string; detail?: Pick<OpportunityDetail, 'eligibilityText' | 'summary' | 'costSharing'>; now?: number },
): ReadinessReport {
  const now = opts.now ?? Date.now();
  const needs = [...needsFor(opts.kind)];
  for (const n of noticeNeeds(opts.detail)) if (!needs.some(x => x.key === n.key)) needs.push(n);

  const gaps: Gap[] = gapsFrom(profile, needs);

  // Longest lead time first, then blockers, so Aria raises the slow things on day one.
  orderGaps(gaps);

  const done = gaps.filter(g => g.status !== 'missing').length;
  const blockingMissing = gaps.filter(g => g.blocking && g.status === 'missing').length;
  const daysLeft = daysUntil(opts.closeDate, now);

  const warnings: string[] = [];
  const slowOpen = gaps.filter(g => g.status === 'missing' && g.leadTimeDays);
  if (daysLeft !== null && daysLeft < 0) warnings.push('This notice has closed. Use it as practice and watch for the next cycle.');
  else if (daysLeft !== null) {
    const longest = Math.max(0, ...slowOpen.map(g => g.leadTimeDays || 0));
    if (longest > daysLeft) {
      warnings.push(`Only ${daysLeft} day${daysLeft === 1 ? '' : 's'} remain, and ${slowOpen.map(g => g.label).join(' / ')} can take about ${longest} days. `
        + 'Start it today; if it cannot finish in time, treat this as practice and aim for the next cycle.');
    } else if (daysLeft < 14) warnings.push(`Closes in ${daysLeft} days — submit at least 48 hours early; Grants.gov rejections need time to fix.`);
  }
  if (profile.samStatus && profile.samStatus.value !== 'active') warnings.push('Your SAM.gov registration is not active. Federal applications cannot be submitted without it.');

  return {
    gaps, documents: documentsFor(opts.kind, opts.detail),
    percentReady: gaps.length ? Math.round((done / gaps.length) * 100) : 100,
    blockingMissing, daysLeft, warnings,
  };
}

// ─── Aria's interview ────────────────────────────────────────────────────────

export interface Question { key: string; text: string; choices?: { value: string; label: string }[]; confirm?: string }

/**
 * The next thing Aria asks. Confirmations come before blanks (cheap to answer, and they catch stale
 * platform data), and blanks follow the gap order (slow things first). Returns null when done.
 */
export function nextQuestion(report: ReadinessReport, skipped: string[] = []): Question | null {
  const open = report.gaps.filter(g => g.status !== 'have' && !skipped.includes(g.key));
  const g = open.find(x => x.status === 'confirm') || open[0];
  if (!g) return null;
  const f = FIELD_BY_KEY[g.key];
  if (g.status === 'confirm' && g.value) {
    return { key: g.key, confirm: g.value, choices: [{ value: 'yes', label: 'Yes, that is right' }, { value: 'no', label: 'No — change it' }],
      text: `I have your ${g.label.toLowerCase()} as "${g.value}"${g.source === 'platform' ? ' from your page' : g.source === 'derived' ? ' from your address' : ''}. Is that right?` };
  }
  const lead = g.leadTimeDays ? ` This one takes about ${g.leadTimeDays >= 14 ? `${Math.round(g.leadTimeDays / 7)} weeks` : `${g.leadTimeDays} days`}, so it is worth starting now.` : '';
  return { key: g.key, choices: f?.kind === 'choice' ? f.choices : undefined,
    text: `${f?.label || g.label}? ${g.why}${lead}${g.hint ? ` ${g.hint}` : ''}` };
}

// ─── Contracts (selling to the government) ──────────────────────────────────

const CONTRACT_NEEDS: Need[] = [
  { key: 'legalName', why: 'Must match your SAM.gov registration exactly.', blocking: true },
  { key: 'ein', why: 'SAM.gov registration asks for your tax ID.', blocking: true },
  { key: 'uei', why: 'You cannot bid without a Unique Entity ID, issued when you register at SAM.gov (free).', leadTimeDays: 28, blocking: true },
  { key: 'samStatus', why: 'Contract awards require an active SAM.gov registration, renewed every year. It also assigns your CAGE code.', leadTimeDays: 28, blocking: true },
  { key: 'naics', why: 'Federal buyers search by NAICS code, and your registration lists the codes you serve.', blocking: true },
  { key: 'certifications', why: 'Set-asides are reserved for certified businesses. Say which you hold so we only show ones you can bid on.' },
  { key: 'street', why: 'Part of your registration and proposals.' },
  { key: 'city', why: '' }, { key: 'state', why: 'We search for work near you.' }, { key: 'zip', why: '' },
  { key: 'contactName', why: 'The person the contracting officer calls.' },
  { key: 'contactEmail', why: 'Where bid notices and questions reach you.' },
  { key: 'contactPhone', why: '' },
  { key: 'mission', why: 'The first line of your capability statement.' },
  { key: 'foundedYear', why: 'Buyers ask how long you have operated.' },
  { key: 'staffCount', why: 'Size standards (small-business status) depend on employees and revenue.' },
];

export const CONTRACT_DOCUMENTS: Document[] = [
  { id: 'capability', label: 'Capability statement', how: 'One page: what you do, NAICS codes, certifications, past performance and contact details. Contracting officers keep these on file.', weCanDraft: true },
  { id: 'past', label: 'Past performance list', how: 'Three to five customers (public or private) with what you delivered, when, and a reference contact. New businesses can use commercial customers.' },
  { id: 'sam', label: 'SAM.gov registration confirmation', how: 'Your active registration and CAGE code.' },
  { id: 'certs', label: 'Certification proof (if you hold one)', how: 'SBA certifies WOSB, EDWOSB, HUBZone and 8(a) through its own portals; veteran status is verified through the VA. Keep the current letters.' },
  { id: 'insurance', label: 'Insurance, licenses and bonding', how: 'Many solicitations require general liability coverage, trade licenses and, for construction, bonding. Ask your agent early.' },
  { id: 'pricing', label: 'Price list or rate sheet', how: 'Know your labor rates and overhead before you quote; government pricing is scrutinized.' },
];

export function buildContractReadiness(profile: Profile): ReadinessReport {
  const gaps = orderGaps(gapsFrom(profile, CONTRACT_NEEDS));
  const done = gaps.filter(g => g.status !== 'missing').length;
  const warnings: string[] = [];
  if (profile.samStatus && profile.samStatus.value !== 'active') warnings.push('Your SAM.gov registration is not active. You cannot be awarded a federal contract without it.');
  return {
    gaps, documents: CONTRACT_DOCUMENTS,
    percentReady: gaps.length ? Math.round((done / gaps.length) * 100) : 100,
    blockingMissing: gaps.filter(g => g.blocking && g.status === 'missing').length,
    daysLeft: null, warnings,
  };
}
