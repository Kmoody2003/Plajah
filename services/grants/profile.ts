/**
 * Grants — the applicant profile.
 *
 * Almost every grant application asks the same questions: who you are, where you are, who can sign,
 * how big you are, what you do. This module is the one canonical record of those answers, so a
 * learner or an org answers each once and every form, copy sheet and PDF is filled from it.
 *
 * ── Provenance on every value ────────────────────────────────────────────────
 * A value is `platform` (read from the org/business page), `derived` (computed, e.g. the
 * congressional district from the street address), `you` (typed or confirmed by a person) or
 * `suggested` (an inference awaiting confirmation). Prefill uses `platform`/`derived`/`suggested`
 * values as drafts — the UI shows them as "confirm", never silently as final.
 *
 * ── Legal lines this module will not cross ───────────────────────────────────
 * - It never holds or fills a signature, a signing date, or any certification/attestation. Those
 *   belong to the organization's Authorized Organization Representative (AOR).
 * - It never invents a value. A field with no answer is reported missing and asked for.
 * - It never stores bank details, passwords or SAM.gov credentials.
 *
 * Pure and isomorphic: used by the server routes and the browser.
 */

import type { ApplicantKind } from '../dataCommons/grants';

export type FieldSource = 'platform' | 'derived' | 'you' | 'suggested';
export type FieldKind = 'text' | 'longtext' | 'number' | 'money' | 'bool' | 'choice' | 'date';
export type FieldGroup = 'identity' | 'registration' | 'address' | 'people' | 'capacity';

export interface FieldDef {
  key: string;
  label: string;
  group: FieldGroup;
  kind: FieldKind;
  choices?: { value: string; label: string }[];
  /** Plain-language "where do I find / get this". Shown beside the question. */
  hint: string;
  /** Personal or financial enough that the UI should say it stays private to the org's admins. */
  sensitive?: boolean;
  /** Regexes tested against a PDF field's name + tooltip to decide this field answers it. */
  match: RegExp[];
}

const yn = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];

export const FIELDS: FieldDef[] = [
  { key: 'legalName', label: 'Legal name of the organization', group: 'identity', kind: 'text',
    hint: 'Exactly as it appears on your IRS letter or state filing — it must match your SAM.gov registration.',
    match: [/legal.?name/, /applicant.?name/, /organi[sz]ation.?name/, /name.?of.?(applicant|organi[sz]ation)/] },
  { key: 'dbaName', label: 'Also known as (DBA)', group: 'identity', kind: 'text',
    hint: 'The name people know you by, if it differs from the legal name.', match: [/\bdba\b/, /doing.?business.?as/, /also.?known/] },
  { key: 'entityType', label: 'Type of applicant', group: 'identity', kind: 'choice',
    choices: [
      { value: 'nonprofit-501c3', label: 'Nonprofit with 501(c)(3) status' },
      { value: 'nonprofit-other', label: 'Nonprofit without 501(c)(3) status' },
      { value: 'church', label: 'Church / house of worship' },
      { value: 'school-district', label: 'School district' },
      { value: 'higher-ed-public', label: 'Public college / university' },
      { value: 'higher-ed-private', label: 'Private college / university' },
      { value: 'small-business', label: 'Small business' },
      { value: 'for-profit', label: 'For-profit (not a small business)' },
      { value: 'city', label: 'City / township government' },
      { value: 'county', label: 'County government' },
      { value: 'state', label: 'State government' },
      { value: 'tribal', label: 'Tribal government' },
      { value: 'housing-authority', label: 'Housing authority' },
      { value: 'individual', label: 'Individual' },
      { value: 'other', label: 'Other' },
    ],
    hint: 'Pick the closest match; the notice\'s eligibility section says which types may apply.', match: [/type.?of.?applicant/, /applicant.?type/] },
  { key: 'ein', label: 'EIN (Employer Identification Number)', group: 'registration', kind: 'text',
    hint: 'Nine digits, on your IRS determination letter or any IRS notice (format 12-3456789).',
    match: [/\bein\b/, /\btin\b/, /taxpayer.?id/, /employer.?(id|tax)/, /tax.?id/] },
  { key: 'uei', label: 'UEI (Unique Entity ID)', group: 'registration', kind: 'text',
    hint: 'A 12-character ID you get when you register at SAM.gov (free). It replaced the old DUNS number.',
    match: [/\buei\b/, /unique.?entity/, /\bduns\b/, /entity.?identifier/, /organi[sz]ational.?duns/] },
  { key: 'samStatus', label: 'SAM.gov registration', group: 'registration', kind: 'choice',
    choices: [
      { value: 'active', label: 'Active' }, { value: 'in-progress', label: 'Started, not active yet' },
      { value: 'expired', label: 'Expired' }, { value: 'none', label: 'Not registered' },
    ],
    hint: 'Federal grants require an active SAM.gov registration, renewed every year. It can take weeks to be approved — start early.',
    match: [] },
  { key: 'samExpires', label: 'SAM.gov registration expires', group: 'registration', kind: 'date',
    hint: 'Shown on your SAM.gov entity record. Renew before it lapses or you cannot submit.', match: [] },
  { key: 'taxExempt', label: 'Do you hold IRS 501(c)(3) status?', group: 'registration', kind: 'choice', choices: yn,
    hint: 'Churches are tax-exempt automatically but many funders still want the IRS letter or a statement.', match: [] },
  { key: 'determinationLetter', label: 'Do you have your IRS determination letter?', group: 'registration', kind: 'choice', choices: yn,
    hint: 'Request a copy from the IRS (Form 8940 is not needed — call or use the IRS Tax Exempt Organization Search).', match: [] },
  { key: 'street', label: 'Street address', group: 'address', kind: 'text', hint: 'Physical address of the organization.',
    match: [/street/, /address.?line/, /^address\b/, /mailing.?address/, /\baddress.?1\b/] },
  { key: 'city', label: 'City', group: 'address', kind: 'text', hint: '', match: [/\bcity\b/] },
  { key: 'state', label: 'State', group: 'address', kind: 'text', hint: 'Two-letter code, e.g. MI.', match: [/\bstate\b(?!.*(legislat|application|identifier))/, /province/] },
  { key: 'zip', label: 'ZIP code', group: 'address', kind: 'text', hint: '5 or 9 digits.', match: [/\bzip\b/, /postal/] },
  { key: 'county', label: 'County', group: 'address', kind: 'text', hint: 'Filled from your address when possible.', match: [/\bcounty\b/, /parish/] },
  { key: 'congressionalDistrict', label: 'U.S. congressional district', group: 'address', kind: 'text',
    hint: 'SF-424 asks for this. We look it up from your address (format MI-013).', match: [/congressional/, /district.?of.?applicant/] },
  { key: 'website', label: 'Website', group: 'address', kind: 'text', hint: '', match: [/\bwebsite\b/, /\burl\b/, /web.?address/] },
  { key: 'repName', label: 'Authorized representative (name)', group: 'people', kind: 'text', sensitive: true,
    hint: 'The person with legal authority to sign for the organization — often the executive director, board chair or owner. They must hold the AOR role in Grants.gov.',
    match: [/authori[sz]ed.?rep.*name/, /\baor\b.*name/] },
  { key: 'repTitle', label: 'Authorized representative (title)', group: 'people', kind: 'text', hint: '', match: [/authori[sz]ed.?rep.*title/] },
  { key: 'repEmail', label: 'Authorized representative (email)', group: 'people', kind: 'text', sensitive: true, hint: '', match: [/authori[sz]ed.?rep.*e-?mail/] },
  { key: 'repPhone', label: 'Authorized representative (phone)', group: 'people', kind: 'text', sensitive: true, hint: '', match: [/authori[sz]ed.?rep.*(phone|tel)/] },
  { key: 'contactName', label: 'Contact person for this application', group: 'people', kind: 'text',
    hint: 'Who the agency should call with questions — can be the same person.', match: [/contact.?(person|name)/, /person.?to.?be.?contacted/, /\bname\b.*contact/] },
  { key: 'contactTitle', label: 'Contact person title', group: 'people', kind: 'text', hint: '', match: [/contact.*title/] },
  { key: 'contactEmail', label: 'Contact email', group: 'people', kind: 'text', sensitive: true, hint: '', match: [/e-?mail/] },
  { key: 'contactPhone', label: 'Contact phone', group: 'people', kind: 'text', sensitive: true, hint: '', match: [/phone/, /telephone/, /\btel\b/] },
  { key: 'mission', label: 'Mission statement', group: 'capacity', kind: 'longtext', hint: 'One or two sentences on what you do and for whom.', match: [/mission/, /organi[sz]ation.?(description|overview)/] },
  { key: 'naics', label: 'NAICS code(s)', group: 'capacity', kind: 'text',
    hint: 'Six-digit industry codes for what you sell (for example 722320 for caterers). Look yours up at census.gov/naics. Federal buyers search by NAICS, and your SAM.gov registration lists them.',
    match: [/naics/] },
  { key: 'certifications', label: 'Business certifications', group: 'capacity', kind: 'text',
    hint: 'Any of: small, wosb, edwosb, sdvosb, vosb, hubzone, 8a — comma-separated. Only list a certification you actually hold and could document.',
    match: [] },
  { key: 'foundedYear', label: 'Year founded', group: 'capacity', kind: 'number', hint: '', match: [/year.?(founded|established|incorporated)/] },
  { key: 'annualBudget', label: 'Annual operating budget (USD)', group: 'capacity', kind: 'money', sensitive: true,
    hint: 'Your most recent full-year total expenses. Reviewers read this as organizational capacity.', match: [/annual.?(operating)?.?budget/, /total.?(annual)?.?expenses/] },
  { key: 'staffCount', label: 'Paid staff (full-time equivalents)', group: 'capacity', kind: 'number', hint: '', match: [/(number|no\.?).?of.?(paid)?.?(staff|employees)/, /\bfte\b/] },
  { key: 'volunteerCount', label: 'Active volunteers', group: 'capacity', kind: 'number', hint: '', match: [/volunteers/] },
  { key: 'boardSize', label: 'Board members', group: 'capacity', kind: 'number', hint: 'Nonprofits are usually asked for a board list.', match: [/board.?(members|size)/] },
  { key: 'peopleServed', label: 'People served per year', group: 'capacity', kind: 'number', hint: 'Your best honest count; funders compare it to your budget.', match: [/(people|individuals|clients|participants).?served/] },
  { key: 'serviceArea', label: 'Area you serve', group: 'capacity', kind: 'text', hint: 'Neighborhoods, city, county or region.', match: [/service.?area/, /areas?.?affected/, /geographic/] },
  { key: 'fiscalYearEnd', label: 'Fiscal year ends', group: 'capacity', kind: 'text', hint: 'Month and day, e.g. 12-31.', match: [/fiscal.?year/] },
  { key: 'auditLevel', label: 'Most recent financial review', group: 'capacity', kind: 'choice',
    choices: [
      { value: 'single-audit', label: 'Single Audit (federal)' }, { value: 'audit', label: 'Independent audit' },
      { value: 'review', label: 'CPA review' }, { value: 'compilation', label: 'Compilation / bookkeeper statements' },
      { value: 'none', label: 'None yet' },
    ],
    hint: 'Organizations spending $1,000,000 or more in federal awards in a year need a Single Audit.', match: [] },
  { key: 'priorFederalAwards', label: 'Have you managed a federal award before?', group: 'capacity', kind: 'choice', choices: yn,
    hint: 'Experience managing federal money counts in your favor — and affects how much reporting help you will want.', match: [] },
  { key: 'indirectRate', label: 'Indirect cost rate', group: 'capacity', kind: 'choice',
    choices: [
      { value: 'de-minimis', label: 'De minimis (15%)' }, { value: 'negotiated', label: 'Negotiated with a federal agency' },
      { value: 'none', label: 'None / not claiming' },
    ],
    hint: 'Organizations without a negotiated rate may charge a flat de minimis rate of up to 15% of modified direct costs.', match: [] },
  { key: 'delinquentFederalDebt', label: 'Is the organization delinquent on any federal debt?', group: 'capacity', kind: 'choice', choices: yn,
    hint: 'SF-424 item 20. This is a representation only your organization can make — we never assume an answer.', match: [/delinquent/] },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(FIELDS.map(f => [f.key, f]));

// ─── Profile model ───────────────────────────────────────────────────────────

export interface ProfileValue { value: string; source: FieldSource; confirmed: boolean; at: number }
export type Profile = Record<string, ProfileValue>;
/** What is persisted: only values a person entered or confirmed. Platform data is re-read each time. */
export type StoredProfile = Record<string, { value: string; at: number }>;

/** Structural subset of `Organization` this module reads (kept loose so tests need no full org). */
export interface OrgLike {
  id?: string; name?: string; legalName?: string; ein?: string; orgType?: string; tagline?: string; about?: string;
  denomination?: string;
  location?: { address?: string; city?: string; phone?: string; email?: string; website?: string };
  socialLinks?: { website?: string };
}

export interface DerivedGeo {
  state?: string; county?: string; congressionalDistrict?: string; city?: string; zip?: string; street?: string;
}

const put = (p: Profile, key: string, value: unknown, source: FieldSource, confirmed = false, at = 0) => {
  const v = String(value ?? '').trim();
  if (v) p[key] = { value: v, source, confirmed, at };
};

export function applicantKindForOrg(org: OrgLike): ApplicantKind {
  switch (org.orgType) {
    case 'CHURCH': case 'RELIGIOUS': return 'church';
    case 'CULTURAL': return 'cultural';
    case 'BUSINESS': case 'RESTAURANT': case 'STUDIO': case 'PUBLISHER': case 'REALTY': case 'CLUB': return 'small-business';
    default: return 'nonprofit';
  }
}

export function entityTypeForOrg(org: OrgLike): string {
  switch (org.orgType) {
    case 'CHURCH': case 'RELIGIOUS': return 'church';
    case 'CULTURAL': case 'NONPROFIT': return 'nonprofit-501c3';
    case 'BUSINESS': case 'RESTAURANT': case 'STUDIO': case 'PUBLISHER': case 'REALTY': case 'CLUB': return 'small-business';
    default: return '';
  }
}

/** Split "123 Main St, Detroit, MI 48201" style strings; falls back to the whole string as the street. */
export function splitAddress(raw?: string): { street?: string; city?: string; state?: string; zip?: string } {
  const s = (raw || '').trim();
  if (!s) return {};
  const m = /^(.*?),\s*([^,]+?),\s*([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?$/.exec(s);
  return m ? { street: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), zip: m[4] } : { street: s };
}

/**
 * Build the working profile. Order of precedence, lowest to highest:
 * platform org data → derived (geo) → previously stored answers (a person said so).
 */
export function buildProfile(org: OrgLike, stored: StoredProfile = {}, geo: DerivedGeo = {}): Profile {
  const p: Profile = {};
  const addr = splitAddress(org.location?.address);
  put(p, 'legalName', org.legalName || org.name, 'platform');
  if (org.legalName && org.name && org.legalName !== org.name) put(p, 'dbaName', org.name, 'platform');
  put(p, 'ein', org.ein, 'platform');
  put(p, 'entityType', entityTypeForOrg(org), 'suggested');
  put(p, 'street', addr.street, 'platform');
  put(p, 'city', addr.city || org.location?.city, 'platform');
  put(p, 'state', addr.state, 'platform');
  put(p, 'zip', addr.zip, 'platform');
  put(p, 'website', org.location?.website || org.socialLinks?.website, 'platform');
  put(p, 'contactEmail', org.location?.email, 'platform');
  put(p, 'contactPhone', org.location?.phone, 'platform');
  put(p, 'mission', (org.tagline || org.about || '').slice(0, 500), 'suggested');

  // Geography comes from the Census geocoder; it fills blanks and never overrides a platform value.
  put(p, 'state', p.state ? '' : geo.state, 'derived');
  put(p, 'county', geo.county, 'derived');
  put(p, 'congressionalDistrict', geo.congressionalDistrict, 'derived');
  put(p, 'zip', p.zip ? '' : geo.zip, 'derived');
  put(p, 'serviceArea', geo.county ? `${geo.city || addr.city || ''}${geo.city || addr.city ? ', ' : ''}${geo.county}` : '', 'suggested');

  for (const [key, s] of Object.entries(stored)) {
    if (FIELD_BY_KEY[key] && String(s?.value ?? '').trim()) p[key] = { value: String(s.value).trim(), source: 'you', confirmed: true, at: s.at || 0 };
  }
  return p;
}

// ─── Validation and answer parsing ───────────────────────────────────────────

export function validateValue(key: string, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const f = FIELD_BY_KEY[key];
  const v = raw.trim();
  if (!f) return { ok: false, error: 'unknown field' };
  if (!v) return { ok: false, error: 'empty' };
  if (key === 'ein') {
    const d = v.replace(/\D/g, '');
    return d.length === 9 ? { ok: true, value: `${d.slice(0, 2)}-${d.slice(2)}` } : { ok: false, error: 'An EIN has 9 digits, like 12-3456789.' };
  }
  if (key === 'uei') {
    const u = v.toUpperCase().replace(/\s/g, '');
    // SAM.gov UEIs are 12 characters; letters O and I are never used, and the first character is not 0.
    return /^[A-HJ-NP-Z1-9][A-HJ-NP-Z0-9]{11}$/.test(u) && !/\d{9}/.test(u)
      ? { ok: true, value: u } : { ok: false, error: 'A UEI is 12 letters and numbers (no O or I). Find it on your SAM.gov entity record.' };
  }
  if (key === 'state') return /^[A-Za-z]{2}$/.test(v) ? { ok: true, value: v.toUpperCase() } : { ok: false, error: 'Use the two-letter state code, like MI.' };
  if (key === 'zip') return /^\d{5}(-\d{4})?$/.test(v) ? { ok: true, value: v } : { ok: false, error: 'ZIP codes are 5 digits (or ZIP+4).' };
  if (/Email$/.test(key)) return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? { ok: true, value: v } : { ok: false, error: 'That does not look like an email address.' };
  if (key === 'naics') {
    const codes = v.split(/[\s,;]+/).filter(Boolean);
    return codes.length && codes.length <= 12 && codes.every(c => /^\d{2,6}$/.test(c))
      ? { ok: true, value: codes.join(', ') } : { ok: false, error: 'Enter NAICS codes of 2 to 6 digits, separated by commas, like 722320, 722330.' };
  }
  if (key === 'certifications') {
    const allowed = ['small', 'wosb', 'edwosb', 'sdvosb', 'vosb', 'hubzone', '8a'];
    const items = v.toLowerCase().split(/[\s,;]+/).filter(Boolean);
    return items.length && items.every(i => allowed.includes(i))
      ? { ok: true, value: [...new Set(items)].join(', ') } : { ok: false, error: `Use only: ${allowed.join(', ')}.` };
  }
  if (f.kind === 'money') {
    const n = parseMoney(v);
    return n == null ? { ok: false, error: 'Enter a dollar amount, like 250000 or $250k.' } : { ok: true, value: String(n) };
  }
  if (f.kind === 'number') {
    const n = parseMoney(v);
    return n == null || n < 0 ? { ok: false, error: 'Enter a number.' } : { ok: true, value: String(n) };
  }
  if (f.kind === 'choice' && f.choices) {
    const hit = f.choices.find(c => c.value === v) || f.choices.find(c => c.label.toLowerCase() === v.toLowerCase());
    if (hit) return { ok: true, value: hit.value };
    if (f.choices.some(c => c.value === 'yes') && f.choices.some(c => c.value === 'no')) {
      if (/^(y|yes|yep|yeah|true)\b/i.test(v)) return { ok: true, value: 'yes' };
      if (/^(n|no|nope|false)\b/i.test(v)) return { ok: true, value: 'no' };
    }
    return { ok: false, error: `Pick one: ${f.choices.map(c => c.label).join(', ')}.` };
  }
  if (f.kind === 'date') return Number.isFinite(Date.parse(v)) ? { ok: true, value: new Date(v).toISOString().slice(0, 10) } : { ok: false, error: 'Enter a date, like 2027-03-31.' };
  return { ok: true, value: v.slice(0, f.kind === 'longtext' ? 1500 : 300) };
}

/** "$250k" → 250000, "1.2M" → 1200000, "3,400" → 3400. */
export function parseMoney(raw: string): number | null {
  const m = /^\$?\s*([\d,]*\.?\d+)\s*([kKmM])?$/.exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult = m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1;
  return Math.round(n * mult);
}

/** SF-424 item 9 letter for an entity type, or undefined where a person must choose. */
export const SF424_APPLICANT_CODE: Record<string, string> = {
  state: 'A', county: 'B', city: 'C', 'school-district': 'G', 'higher-ed-public': 'H', tribal: 'I',
  'housing-authority': 'L', 'nonprofit-501c3': 'M', church: 'M', 'nonprofit-other': 'N', 'higher-ed-private': 'O',
  individual: 'P', 'for-profit': 'Q', 'small-business': 'R', other: 'X',
};

export function displayValue(key: string, value: string): string {
  const f = FIELD_BY_KEY[key];
  if (!f) return value;
  if (f.kind === 'money') return `$${Number(value).toLocaleString('en-US')}`;
  if (f.kind === 'choice' && f.choices) return f.choices.find(c => c.value === value)?.label || value;
  return value;
}

export function fieldsOf(group?: FieldGroup): FieldDef[] {
  return group ? FIELDS.filter(f => f.group === group) : FIELDS;
}
