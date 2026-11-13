/**
 * Tela PDF — Smart Fill.
 *
 * Reads what each form field is asking for and answers it from the person's fill profile.
 * Works on three signals, strongest first:
 *   1. the words printed next to the field on the page (the label a person reads),
 *   2. the field's tooltip (/TU) — many forms put the real question there,
 *   3. the field's internal name ("Applicant.ZipCode[0]").
 * Cryptic names like "Text12" are common, so the printed label usually decides.
 *
 * ── What is never filled ─────────────────────────────────────────────────────
 *  - Signatures, initials, signing dates, certifications and attestations: legal acts only the
 *    person can do (they can place their own signature with the Sign tool).
 *  - Government and financial identifiers (SSN, tax ID, passport, licence, bank, card numbers,
 *    passwords, PINs). The profile cannot hold them at all, so they can never leak into a form,
 *    a sync, or a model prompt. The person types them each time.
 *  - Yes/no and choice questions (checkboxes, radios) unless the person answered that exact
 *    question before (remembered answers) — a tick is a statement of fact.
 *
 * The AI step (services/tela/pdf/client.ts → POST /api/tela/pdf/map) only ever sees field labels
 * and the NAMES of profile keys, never a value. Values are joined on the device.
 */

// ─── Fields as the reader sees them ────────────────────────────────────────────

export type PdfFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'signature' | 'button';

export interface PdfField {
  /** Fully-qualified AcroForm name — the key we write back with. */
  name: string;
  /** pdf.js annotation id of this widget (used to save into encrypted PDFs through pdf.js). */
  annotId?: string;
  type: PdfFieldType;
  /** 0-based page index of the (first) widget. */
  page: number;
  /** Widget rectangle in PDF user space [x1, y1, x2, y2] (origin bottom-left). */
  rect: [number, number, number, number];
  /** Tooltip / alternate name. */
  tooltip?: string;
  /** Label read from the printed page next to the widget (see labelFor). */
  label?: string;
  options?: string[];
  value?: string | boolean;
  /** Radio/checkbox "on" export value of this widget. */
  exportValue?: string;
  multiline?: boolean;
  maxLen?: number;
  comb?: boolean;
  readOnly?: boolean;
  required?: boolean;
}

/** A positioned run of text from pdf.js getTextContent, in PDF user space. */
export interface TextRun { str: string; x: number; y: number; w: number; h: number }

// ─── The fill profile ─────────────────────────────────────────────────────────

export type ProfileKey =
  | 'fullName' | 'firstName' | 'middleName' | 'lastName' | 'prefix' | 'suffix' | 'preferredName'
  | 'email' | 'phone' | 'mobilePhone' | 'workPhone'
  | 'street' | 'street2' | 'city' | 'state' | 'zip' | 'county' | 'country'
  | 'dob' | 'gender' | 'pronouns'
  | 'company' | 'jobTitle' | 'department' | 'website'
  | 'emergencyName' | 'emergencyPhone' | 'emergencyRelation';

export interface ProfileField { key: ProfileKey; label: string; group: 'Name' | 'Contact' | 'Address' | 'About you' | 'Work' | 'Emergency contact'; kind?: 'date' | 'email' | 'phone' | 'state' }

export const PROFILE_FIELDS: ProfileField[] = [
  { key: 'fullName', label: 'Full name', group: 'Name' },
  { key: 'prefix', label: 'Title (Mr, Ms, Dr…)', group: 'Name' },
  { key: 'firstName', label: 'First name', group: 'Name' },
  { key: 'middleName', label: 'Middle name', group: 'Name' },
  { key: 'lastName', label: 'Last name', group: 'Name' },
  { key: 'suffix', label: 'Suffix (Jr, III…)', group: 'Name' },
  { key: 'preferredName', label: 'Preferred name', group: 'Name' },
  { key: 'email', label: 'Email', group: 'Contact', kind: 'email' },
  { key: 'phone', label: 'Phone', group: 'Contact', kind: 'phone' },
  { key: 'mobilePhone', label: 'Mobile phone', group: 'Contact', kind: 'phone' },
  { key: 'workPhone', label: 'Work phone', group: 'Contact', kind: 'phone' },
  { key: 'street', label: 'Street address', group: 'Address' },
  { key: 'street2', label: 'Apt / suite / unit', group: 'Address' },
  { key: 'city', label: 'City', group: 'Address' },
  { key: 'state', label: 'State', group: 'Address', kind: 'state' },
  { key: 'zip', label: 'ZIP / postal code', group: 'Address' },
  { key: 'county', label: 'County', group: 'Address' },
  { key: 'country', label: 'Country', group: 'Address' },
  { key: 'dob', label: 'Date of birth', group: 'About you', kind: 'date' },
  { key: 'gender', label: 'Gender', group: 'About you' },
  { key: 'pronouns', label: 'Pronouns', group: 'About you' },
  { key: 'company', label: 'Organization / employer', group: 'Work' },
  { key: 'jobTitle', label: 'Job title', group: 'Work' },
  { key: 'department', label: 'Department', group: 'Work' },
  { key: 'website', label: 'Website', group: 'Work' },
  { key: 'emergencyName', label: 'Emergency contact name', group: 'Emergency contact' },
  { key: 'emergencyPhone', label: 'Emergency contact phone', group: 'Emergency contact', kind: 'phone' },
  { key: 'emergencyRelation', label: 'Relationship', group: 'Emergency contact' },
];
export const PROFILE_KEYS = new Set<string>(PROFILE_FIELDS.map(f => f.key));

export interface FillProfile {
  values: Partial<Record<ProfileKey, string>>;
  /** Answers the person gave to questions outside the standard keys, keyed by normalised label. */
  remembered: Record<string, string>;
  updatedAt: number;
}

export const emptyFillProfile = (): FillProfile => ({ values: {}, remembered: {}, updatedAt: 0 });

// ─── Never-fill rules ─────────────────────────────────────────────────────────

/** A person must act: signatures, initials, signing dates, certifications. */
export const HUMAN_ONLY = /\bsign(ature|ed|ing)?\b|sign here|signer|(?<!middle )\binitials?\b|date signed|signing date|certif|attest|i agree|i certify|i understand|acknowledg|under penalt|perjury|affirm/;
/** Identifiers that must never be stored or auto-filled. */
export const SENSITIVE = /\bssn\b|social security|\bsocial sec|tax ?id|\btin\b|\bein\b|\bitin\b|passport|driver'?s? ?licen[cs]e|\bdl ?(no|num|#)|licen[cs]e (no|num|#)|state id|alien|\ba ?number\b|\buscis\b|bank|routing|\baba\b|account (no|num|#)|acct|iban|swift|credit card|debit card|card (no|num|#)|\bcvv\b|\bcvc\b|expir|password|passcode|\bpin\b|medicare|medicaid|member id|policy (no|num|#)|mother'?s maiden/;

/** True when a value looks like an identifier even if the label didn't say so (9-digit SSN shape, 13-19 digit card). */
export function looksSensitiveValue(v: string): boolean {
  const d = v.replace(/[\s-]/g, '');
  return /^\d{3}-?\d{2}-?\d{4}$/.test(v.trim()) || /^\d{13,19}$/.test(d);
}

// ─── Words ───────────────────────────────────────────────────────────────────

export const norm = (s: string) => s.toLowerCase().replace(/[_\-.\[\]:#()/\\*]+/g, ' ').replace(/\s+/g, ' ').trim();

/** "Applicant.ZipPostalCode[0]" → "applicant zip postal code 0". */
export function nameWords(name: string): string {
  return norm(name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/\[\d+\]/g, ' '));
}

/** Field names that carry no meaning ("Text1", "Check Box 12", "fill_3", "undefined_2"). */
export const CRYPTIC = /^(text|txt|field|fill|check ?box|cb|radio|combo ?box|list ?box|dropdown|undefined|untitled|topmostsubform|page\d*|form\d*|f\d+|t\d+|\d+|[a-z])[\s\d.]*$/i;

/** What a person would read as the field's question: printed label, then tooltip, then a meaningful name. */
export function fieldWords(f: Pick<PdfField, 'name' | 'tooltip' | 'label'>): string {
  const leaf = f.name.split('.').pop() || f.name;
  const nm = CRYPTIC.test(nameWords(leaf)) ? '' : nameWords(leaf);
  return norm([f.label, f.tooltip, nm].filter(Boolean).join(' '));
}

// ─── Finding the printed label ────────────────────────────────────────────────

/**
 * The label is the text a person reads as this field's question: to the LEFT on the same line,
 * else directly ABOVE (stacked forms), else directly BELOW (under-the-line captions like
 * "Signature ____ / (print name)"). Distances are in PDF points.
 */
export function labelFor(rect: PdfField['rect'], runs: TextRun[], opts: { box?: boolean } = {}): string {
  const [x1, y1, x2, y2] = [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])];
  const cy = (y1 + y2) / 2, h = Math.max(6, y2 - y1);
  const clean = (s: string) => s.replace(/_{2,}|\.{4,}/g, ' ').replace(/\s+/g, ' ').trim();
  const usable = runs.filter(r => clean(r.str).length > 0 && !/^[_.\s:]+$/.test(r.str));

  // Checkboxes and radios are usually labelled on the RIGHT ("☐ I certify…"), so look there first.
  if (opts.box) {
    const right = usable.filter(r => Math.abs((r.y + r.h / 2) - cy) <= Math.max(h * 0.8, 6) && r.x >= x2 - 2 && r.x - x2 < 30).sort((a, b) => a.x - b.x);
    if (right.length) {
      const parts: TextRun[] = [right[0]];
      for (const r of usable.filter(r => Math.abs((r.y + r.h / 2) - cy) <= Math.max(h * 0.8, 6) && r.x > right[0].x).sort((a, b) => a.x - b.x)) {
        const prev = parts[parts.length - 1]; if (r.x - (prev.x + prev.w) < 14) parts.push(r); else break;
      }
      const text = clean(parts.map(r => r.str).join(' '));
      if (/[a-z]{2,}/i.test(text)) return text.slice(0, 90);
    }
  }
  // Same line, to the left. Gather the nearest run and its neighbours on that line (labels often split into runs).
  const sameLine = usable.filter(r => Math.abs((r.y + r.h / 2) - cy) <= Math.max(h * 0.6, 6) && r.x + r.w <= x1 + 4 && x1 - (r.x + r.w) < 220);
  if (sameLine.length) {
    sameLine.sort((a, b) => b.x - a.x);
    const parts: TextRun[] = [sameLine[0]];
    for (const r of sameLine.slice(1)) { const prev = parts[parts.length - 1]; if (prev.x - (r.x + r.w) < 14) parts.push(r); else break; }
    const text = clean(parts.reverse().map(r => r.str).join(' '));
    // A label that's only a bullet or number isn't a label.
    if (/[a-z]{2,}/i.test(text)) return text.slice(-90);
  }
  // Above: text whose baseline sits just over the top of the box, horizontally overlapping it.
  const above = usable.filter(r => r.y >= y2 - 2 && r.y - y2 < 26 && r.x < x2 && r.x + r.w > x1 - 8).sort((a, b) => (a.y - y2) - (b.y - y2) || a.x - b.x);
  if (above.length) {
    const lineY = above[0].y;
    const text = clean(above.filter(r => Math.abs(r.y - lineY) < 3).sort((a, b) => a.x - b.x).map(r => r.str).join(' '));
    if (/[a-z]{2,}/i.test(text)) return text.slice(0, 90);
  }
  // Below: caption under a line.
  const below = usable.filter(r => r.y + r.h <= y1 + 3 && y1 - (r.y + r.h) < 16 && r.x < x2 && r.x + r.w > x1 - 8).sort((a, b) => (b.y - a.y) || a.x - b.x);
  if (below.length) {
    const lineY = below[0].y;
    const text = clean(below.filter(r => Math.abs(r.y - lineY) < 3).sort((a, b) => a.x - b.x).map(r => r.str).join(' '));
    if (/[a-z]{2,}/i.test(text)) return text.slice(0, 90);
  }
  return '';
}

// ─── Classification ───────────────────────────────────────────────────────────

export interface Match { key: ProfileKey | 'today' | 'cityStateZip' | 'fullAddress'; confidence: number; why: string }

type Rule = [RegExp, Match['key'], number];
// Order matters within a tier: specific before generic. Confidence 0..1.
const RULES: Rule[] = [
  // Emergency contact before plain name/phone.
  [/emergency.*(phone|tel|number|cell)|(phone|tel).*emergency/, 'emergencyPhone', 0.9],
  [/emergency.*relation|relationship/, 'emergencyRelation', 0.85],
  [/emergency.*(contact|name)|in case of emergency|\bice\b/, 'emergencyName', 0.85],
  // Names.
  [/first ?name|given ?name|forename|\bfname\b/, 'firstName', 0.95],
  [/last ?name|surname|family ?name|\blname\b/, 'lastName', 0.95],
  [/middle ?(name|initial)|\bmi\b|\bm i\b/, 'middleName', 0.9],
  [/preferred ?name|nickname|goes by/, 'preferredName', 0.9],
  [/\bsuffix\b|jr sr/, 'suffix', 0.85],
  [/\b(prefix|salutation)\b|^title mr|mr ?mrs/, 'prefix', 0.8],
  [/full ?name|your name|applicant ?name|name of applicant|print(ed)? name|patient ?name|student ?name|employee ?name|name \(print|legal name|^name$|^name\b(?!.*(company|organi|business|employer|school|agency|bank|street|city|county|parent|guardian|spouse|child|doctor|physician))/, 'fullName', 0.8],
  // Contact.
  [/e ?-?mail/, 'email', 0.97],
  [/(cell|mobile)( ?phone| number)?/, 'mobilePhone', 0.9],
  [/(work|office|business|daytime) ?(phone|tel)/, 'workPhone', 0.85],
  [/phone|telephone|\btel\b|contact number/, 'phone', 0.9],
  // Address.
  [/city.*state.*zip|city state/, 'cityStateZip', 0.9],
  [/\b(apt|apartment|suite|unit|ste)\b|address ?(line )?2|address2/, 'street2', 0.85],
  [/\bzip\b|postal ?code|post ?code|zip ?code/, 'zip', 0.95],
  [/\bcity\b|\btown\b|municipality/, 'city', 0.9],
  [/\bcounty\b|parish/, 'county', 0.85],
  [/\bcountry\b|nation(ality)?(?! ?id)/, 'country', 0.8],
  [/\bstate\b(?! (of|license|id))|province|\bst\b/, 'state', 0.8],
  [/street|address ?(line )?1|mailing address|home address|residen(ce|tial) address|^address$|\baddress\b/, 'street', 0.8],
  // About you.
  [/date of birth|birth ?date|\bdob\b|born on|birthday/, 'dob', 0.95],
  [/\bgender\b|\bsex\b/, 'gender', 0.7],
  [/pronoun/, 'pronouns', 0.9],
  // Work.
  [/employer|company|organi[sz]ation|business name|firm|agency name|school name/, 'company', 0.8],
  [/job ?title|position|occupation|\btitle\b/, 'jobTitle', 0.7],
  [/department|\bdept\b/, 'department', 0.8],
  [/website|\burl\b|web ?site|homepage/, 'website', 0.9],
  // Plain date (today), last: only suggested, never auto-filled.
  [/^date\b|\bdate$|today'?s date|date completed/, 'today', 0.6],
];

export type Classified =
  | { kind: 'human'; why: string }
  | { kind: 'sensitive'; why: string }
  | { kind: 'match'; match: Match }
  | { kind: 'unknown' };

export function classify(f: Pick<PdfField, 'name' | 'tooltip' | 'label' | 'type'>): Classified {
  if (f.type === 'signature') return { kind: 'human', why: 'Signature field' };
  if (f.type === 'button') return { kind: 'unknown' };
  const w = fieldWords(f);
  if (!w) return { kind: 'unknown' };
  if (SENSITIVE.test(w)) return { kind: 'sensitive', why: 'Identifier or financial number' };
  if (HUMAN_ONLY.test(w)) return { kind: 'human', why: 'Signature, initials, signing date or a certification' };
  for (const [re, key, confidence] of RULES) if (re.test(w)) return { kind: 'match', match: { key, confidence, why: `“${w.slice(0, 60)}”` } };
  return { kind: 'unknown' };
}

// ─── Values shaped to the field ───────────────────────────────────────────────

const STATES: Array<[string, string]> = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'],
  ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
  ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['PR', 'Puerto Rico'], ['GU', 'Guam'], ['VI', 'U.S. Virgin Islands'],
];
export const stateAbbr = (v: string) => { const t = v.trim().toLowerCase(); return STATES.find(([a, n]) => a.toLowerCase() === t || n.toLowerCase() === t)?.[0]; };
export const stateName = (v: string) => { const a = stateAbbr(v); return STATES.find(s => s[0] === a)?.[1]; };

/** Split "Dr. Maya J. Okafor Jr." into parts. Used when the profile has a full name but not the parts. */
export function splitFullName(full: string): { prefix?: string; first?: string; middle?: string; last?: string; suffix?: string } {
  let parts = full.trim().split(/\s+/).filter(Boolean);
  const out: ReturnType<typeof splitFullName> = {};
  if (parts.length && /^(mr|mrs|ms|mx|dr|rev|prof|pastor|fr|sr)\.?$/i.test(parts[0]) && parts.length > 2) out.prefix = parts.shift();
  if (parts.length > 2 && /^(jr|sr|ii|iii|iv|v|phd|md|esq)\.?,?$/i.test(parts[parts.length - 1])) out.suffix = parts.pop()!.replace(/,$/, '');
  if (parts.length) out.first = parts.shift();
  if (parts.length) out.last = parts.pop();
  if (parts.length) out.middle = parts.join(' ');
  return out;
}

/** Derived values fill gaps: full name ↔ parts, phone fallbacks. */
export function resolved(profile: FillProfile): Partial<Record<ProfileKey, string>> {
  const v: Partial<Record<ProfileKey, string>> = {};
  for (const [k, val] of Object.entries(profile.values)) if (typeof val === 'string' && val.trim()) v[k as ProfileKey] = val.trim();
  if (v.fullName) {
    const s = splitFullName(v.fullName);
    v.firstName ??= s.first; v.lastName ??= s.last; v.middleName ??= s.middle; v.prefix ??= s.prefix; v.suffix ??= s.suffix;
  } else if (v.firstName || v.lastName) {
    v.fullName = [v.firstName, v.middleName, v.lastName, v.suffix].filter(Boolean).join(' ');
  }
  v.phone ??= v.mobilePhone ?? v.workPhone;
  return v;
}

/** Date format a field expects, from its label ("mm/dd/yyyy", "YYYY-MM-DD", "DD/MM/YYYY") or its max length. */
export function dateFormatFor(words: string, maxLen?: number): 'mdy' | 'ymd' | 'dmy' | 'mdy2' {
  if (/yyyy[\s\-/.]*mm[\s\-/.]*dd/.test(words)) return 'ymd';
  if (/dd[\s\-/.]*mm[\s\-/.]*yy/.test(words)) return 'dmy';
  if (/mm[\s\-/.]*dd[\s\-/.]*yy(?!yy)/.test(words) || maxLen === 8) return 'mdy2';
  return 'mdy';
}

/** Parse what a person typed for a date (ISO, US, or written out). */
export function parseDate(v: string): Date | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) { const y = +m[3] < 100 ? 1900 + +m[3] + (+m[3] < 30 ? 100 : 0) : +m[3]; return new Date(Date.UTC(y, +m[1] - 1, +m[2])); }
  const t = Date.parse(s); return Number.isFinite(t) ? new Date(t) : null;
}

export function formatDate(d: Date, f: ReturnType<typeof dateFormatFor>): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const y = d.getUTCFullYear(), mo = p(d.getUTCMonth() + 1), da = p(d.getUTCDate());
  return f === 'ymd' ? `${y}-${mo}-${da}` : f === 'dmy' ? `${da}/${mo}/${y}` : f === 'mdy2' ? `${mo}/${da}/${String(y).slice(2)}` : `${mo}/${da}/${y}`;
}

/** Format a US-ish phone to match the field: digits-only for comb/short fields, (313) 555-0142 otherwise. */
export function formatPhone(v: string, maxLen?: number, comb?: boolean): string {
  const d = v.replace(/\D/g, '');
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
  if (ten.length !== 10) return v;
  if (comb || (maxLen && maxLen <= 10)) return ten;
  if (maxLen && maxLen < 14) return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Pick a list option that means the same as the value (state names vs codes, case, "United States" vs "USA"). */
export function pickOption(options: string[], value: string, key?: string): string | undefined {
  const v = value.trim().toLowerCase(); if (!v) return undefined;
  const exact = options.find(o => o.trim().toLowerCase() === v); if (exact) return exact;
  if (key === 'state') {
    const a = stateAbbr(value), n = stateName(value)?.toLowerCase();
    return options.find(o => { const t = o.trim().toLowerCase(); return t === a?.toLowerCase() || t === n || t.startsWith(`${a?.toLowerCase()} `) || t.endsWith(` ${a?.toLowerCase()}`) || (n ? t.includes(n) : false); });
  }
  if (key === 'country' && /^(us|usa|united states|united states of america|u s a?)$/.test(v.replace(/\./g, ''))) {
    return options.find(o => /^(us|usa|united states( of america)?|u\.s\.a?\.?)$/i.test(o.trim()));
  }
  return options.find(o => o.trim().toLowerCase().startsWith(v)) ?? options.find(o => v.startsWith(o.trim().toLowerCase()) && o.trim().length > 2);
}

// ─── The plan ─────────────────────────────────────────────────────────────────

export type PlanOutcome =
  | 'fill'        // confident: will be written
  | 'suggest'     // a likely answer the person confirms (low confidence, today's date, AI-mapped)
  | 'keep'        // already has an answer
  | 'human'       // signature / certification: the person does it
  | 'sensitive'   // identifier: the person types it
  | 'choice'      // checkbox / radio without a remembered answer
  | 'no-data'     // we know what it asks but the profile has no answer
  | 'unknown';    // couldn't tell what it asks

export interface PlanRow {
  name: string;
  page: number;
  question: string;
  outcome: PlanOutcome;
  value?: string | boolean;
  key?: string;
  confidence?: number;
  note?: string;
}

export interface PlanOptions {
  /** Field name → profile key the AI step proposed. Used only for fields rules could not place. */
  aiMap?: Record<string, string>;
  /** Overwrite fields that already have text. Off by default. */
  overwrite?: boolean;
  now?: Date;
}

const MIN_AUTO = 0.75;

export const rememberKey = (question: string) => norm(question).replace(/\b(please|enter|your|the|a|an|of)\b/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

function shapeText(f: PdfField, key: string, raw: string, words: string): string {
  let v = raw;
  const kind = PROFILE_FIELDS.find(p => p.key === key)?.kind;
  if (kind === 'phone') v = formatPhone(v, f.maxLen, f.comb);
  if (kind === 'state' && (f.maxLen === 2 || /\b(abbr|2 letter|code)\b/.test(words) || (f.rect && Math.abs(f.rect[2] - f.rect[0]) < 40))) v = stateAbbr(v) ?? v;
  if (kind === 'date' || key === 'today') { const d = parseDate(v); if (d) v = formatDate(d, dateFormatFor(words, f.maxLen)); }
  if (key === 'zip' && f.maxLen === 5) v = v.replace(/\D/g, '').slice(0, 5);
  if (/\b(block letters|capital letters|print in caps|all caps|uppercase)\b/.test(words)) v = v.toUpperCase();
  if (f.comb && f.maxLen) v = v.replace(/[\s-]/g, '');
  if (f.maxLen && v.length > f.maxLen) v = v.slice(0, f.maxLen);
  return v;
}

function valueFor(key: Match['key'], v: Partial<Record<ProfileKey, string>>, now: Date): string | undefined {
  if (key === 'today') return now.toISOString().slice(0, 10);
  if (key === 'cityStateZip') return [v.city, [v.state && (stateAbbr(v.state) ?? v.state), v.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') || undefined;
  if (key === 'fullAddress') return [v.street, v.street2, v.city, v.state, v.zip].filter(Boolean).join(', ') || undefined;
  return v[key];
}

/** Decide what to do with every field. Pure: no PDF library, no network. */
export function planFill(fields: PdfField[], profile: FillProfile, opts: PlanOptions = {}): PlanRow[] {
  const now = opts.now ?? new Date();
  const v = resolved(profile);
  const rows: PlanRow[] = [];
  // Radio groups share a name across widgets; plan each group once.
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.name)) continue; seen.add(f.name);
    if (f.readOnly || f.type === 'button') continue;
    const words = fieldWords(f);
    const question = f.label || f.tooltip || (CRYPTIC.test(nameWords(f.name.split('.').pop() || '')) ? '' : nameWords(f.name)) || f.name;
    const base = { name: f.name, page: f.page, question };
    const has = typeof f.value === 'boolean' ? f.value : !!(f.value && String(f.value).trim() && String(f.value) !== 'Off');
    const c = classify(f);

    if (c.kind === 'human') { rows.push({ ...base, outcome: 'human', note: f.type === 'signature' ? 'Sign it yourself with the Sign tool.' : 'Signatures, initials, signing dates and certifications are yours to complete.' }); continue; }
    if (c.kind === 'sensitive') { rows.push({ ...base, outcome: 'sensitive', note: 'Plajah never stores ID or account numbers. Type it yourself.' }); continue; }
    if (has && !opts.overwrite) { rows.push({ ...base, outcome: 'keep', value: f.value, note: 'Already answered.' }); continue; }

    // Remembered answer to this exact question beats everything for non-standard questions and choices.
    const rk = rememberKey(question);
    const remembered = rk ? profile.remembered[rk] : undefined;

    if (f.type === 'checkbox' || f.type === 'radio') {
      if (remembered !== undefined) {
        const on = f.type === 'checkbox' ? /^(yes|true|on|1|x|checked)$/i.test(remembered) : remembered;
        rows.push({ ...base, outcome: 'suggest', value: on, key: 'remembered', confidence: 0.7, note: 'You answered this before. Check it still holds.' });
      } else rows.push({ ...base, outcome: 'choice', note: 'Yes/no and choice questions are yours to answer.' });
      continue;
    }

    let key: Match['key'] | undefined; let confidence = 0; let via = '';
    if (c.kind === 'match') { key = c.match.key; confidence = c.match.confidence; via = 'rules'; }
    else if (opts.aiMap?.[f.name] && (PROFILE_KEYS.has(opts.aiMap[f.name]) || opts.aiMap[f.name] === 'today')) { key = opts.aiMap[f.name] as Match['key']; confidence = 0.6; via = 'ai'; }

    // A narrow box next to "Name" on a line with first/last boxes is still a name; the rules handle it. Remembered answers fill the rest.
    if (!key) {
      if (remembered) rows.push({ ...base, outcome: confidenceOutcome(0.8), value: shapeFree(f, remembered), key: 'remembered', confidence: 0.8, note: 'From an answer you gave on another form.' });
      else rows.push({ ...base, outcome: 'unknown' });
      continue;
    }
    const raw = valueFor(key, v, now) ?? remembered;
    if (!raw) { rows.push({ ...base, outcome: 'no-data', key, confidence, note: 'Add this to your fill profile once and it fills everywhere.' }); continue; }

    if (f.type === 'dropdown' || f.type === 'list') {
      const opt = pickOption(f.options ?? [], raw, key);
      if (!opt) { rows.push({ ...base, outcome: 'no-data', key, note: 'None of the choices match your profile.' }); continue; }
      rows.push({ ...base, outcome: key === 'today' || via === 'ai' ? 'suggest' : confidenceOutcome(confidence), value: opt, key, confidence });
      continue;
    }
    const text = shapeText(f, key, raw, words);
    const outcome: PlanOutcome = key === 'today' ? 'suggest' : via === 'ai' ? 'suggest' : confidenceOutcome(confidence);
    rows.push({ ...base, outcome, value: text, key, confidence, note: key === 'today' ? 'Today’s date — confirm this isn’t a date only you should write.' : via === 'ai' ? 'Matched by Aria. Check it.' : undefined });
  }
  return rows;
}

const confidenceOutcome = (c: number): PlanOutcome => (c >= MIN_AUTO ? 'fill' : 'suggest');
function shapeFree(f: PdfField, v: string) { return f.maxLen && v.length > f.maxLen ? v.slice(0, f.maxLen) : v; }

/** Values to write: confident fills plus the suggestions the person accepted. */
export function valuesToWrite(rows: PlanRow[], accepted: Set<string>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const r of rows) if (r.value !== undefined && (r.outcome === 'fill' || (r.outcome === 'suggest' && accepted.has(r.name)))) out[r.name] = r.value;
  return out;
}

export function planSummary(rows: PlanRow[]): string {
  const n = (o: PlanOutcome) => rows.filter(r => r.outcome === o).length;
  const parts = [`${n('fill')} ready to fill`];
  if (n('suggest')) parts.push(`${n('suggest')} to confirm`);
  if (n('human') + n('sensitive') + n('choice')) parts.push(`${n('human') + n('sensitive') + n('choice')} for you`);
  if (n('no-data')) parts.push(`${n('no-data')} missing from your profile`);
  if (n('unknown')) parts.push(`${n('unknown')} unclear`);
  return parts.join(' · ');
}

// ─── Learning from what the person typed ─────────────────────────────────────

/**
 * After the person fills a form by hand, offer to remember answers so the next form fills itself.
 * Standard questions update profile keys; others become remembered answers. Never learns
 * identifiers, signatures, or anything that looks like an ID/card number.
 */
export function learnFrom(fields: PdfField[], typed: Record<string, string | boolean>, profile: FillProfile): Array<{ question: string; key?: ProfileKey; remember?: string; value: string }> {
  const out: Array<{ question: string; key?: ProfileKey; remember?: string; value: string }> = [];
  const have = resolved(profile);
  for (const f of fields) {
    const val = typed[f.name]; if (val === undefined || val === '') continue;
    const value = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val).trim();
    if (!value || looksSensitiveValue(value)) continue;
    const c = classify(f);
    if (c.kind === 'human' || c.kind === 'sensitive') continue;
    const question = f.label || f.tooltip || nameWords(f.name);
    if (c.kind === 'match' && PROFILE_KEYS.has(c.match.key) && f.type !== 'checkbox' && f.type !== 'radio') {
      const key = c.match.key as ProfileKey;
      if ((have[key] ?? '').trim().toLowerCase() !== value.toLowerCase()) out.push({ question, key, value });
    } else {
      const rk = rememberKey(question);
      if (rk && rk.length >= 3 && !CRYPTIC.test(rk) && profile.remembered[rk] !== value) out.push({ question, remember: rk, value });
    }
  }
  return out.slice(0, 40);
}

export function applyLearned(profile: FillProfile, learned: Array<{ key?: ProfileKey; remember?: string; value: string }>, now = Date.now()): FillProfile {
  const next: FillProfile = { values: { ...profile.values }, remembered: { ...profile.remembered }, updatedAt: now };
  for (const l of learned) { if (l.key) next.values[l.key] = l.value; else if (l.remember) next.remembered[l.remember] = l.value; }
  return sanitizeFillProfile(next);
}

/** Server and client both run this: drops unknown keys, sensitive answers and oversize strings. */
export function sanitizeFillProfile(p: unknown): FillProfile {
  const src = (p && typeof p === 'object' ? p : {}) as Partial<FillProfile>;
  const clip = (s: unknown, n: number) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const values: FillProfile['values'] = {};
  for (const [k, v] of Object.entries(src.values ?? {})) { const s = clip(v, 200); if (PROFILE_KEYS.has(k) && s && !looksSensitiveValue(s)) values[k as ProfileKey] = s; }
  const remembered: Record<string, string> = {};
  for (const [k, v] of Object.entries(src.remembered ?? {}).slice(0, 400)) {
    const key = clip(k, 80), val = clip(v, 300);
    if (key && val && !SENSITIVE.test(key) && !HUMAN_ONLY.test(key) && !looksSensitiveValue(val)) remembered[key] = val;
  }
  return { values, remembered, updatedAt: Number(src.updatedAt) || 0 };
}

/** Newer write wins per whole profile, but answers only one side has are kept. */
export function mergeFillProfiles(a: FillProfile, b: FillProfile): FillProfile {
  const [older, newer] = a.updatedAt <= b.updatedAt ? [a, b] : [b, a];
  return sanitizeFillProfile({ values: { ...older.values, ...newer.values }, remembered: { ...older.remembered, ...newer.remembered }, updatedAt: Math.max(a.updatedAt, b.updatedAt) });
}

// ─── The AI step's payload (no values, ever) ─────────────────────────────────

export interface MapRequest { fields: Array<{ id: string; question: string; type: PdfFieldType; options?: string[] }>; keys: Array<{ key: string; label: string }> }

/** Only fields the rules could not place, and only their questions. */
export function mapRequest(fields: PdfField[], rows: PlanRow[]): MapRequest {
  const unknown = new Set(rows.filter(r => r.outcome === 'unknown').map(r => r.name));
  const list = fields.filter(f => unknown.has(f.name) && (f.type === 'text' || f.type === 'dropdown' || f.type === 'list'))
    .filter((f, i, a) => a.findIndex(g => g.name === f.name) === i)
    .map(f => ({ id: f.name.slice(0, 200), question: (f.label || f.tooltip || nameWords(f.name)).slice(0, 140), type: f.type, options: f.options?.slice(0, 12).map(o => o.slice(0, 40)) }))
    .filter(f => f.question.length > 1 && !SENSITIVE.test(norm(f.question)) && !HUMAN_ONLY.test(norm(f.question)))
    .slice(0, 120);
  return { fields: list, keys: [...PROFILE_FIELDS.map(p => ({ key: p.key, label: p.label })), { key: 'today', label: "Today's date" }] };
}

/** Validate the model's answer: only known keys, only fields we asked about, nothing sensitive. */
export function cleanAiMap(answer: unknown, req: MapRequest): Record<string, string> {
  const out: Record<string, string> = {};
  const asked = new Map(req.fields.map(f => [f.id, f]));
  const obj = (answer && typeof answer === 'object' ? (answer as any).map ?? answer : {}) as Record<string, unknown>;
  for (const [id, key] of Object.entries(obj)) {
    const f = asked.get(id); const k = String(key ?? '');
    if (!f || !(PROFILE_KEYS.has(k) || k === 'today')) continue;
    out[id] = k;
  }
  return out;
}

// ─── Flat (non-fillable) forms ────────────────────────────────────────────────

export interface DetectedBlank { page: number; rect: PdfField['rect']; label: string; type: 'text' | 'checkbox' }

/**
 * Find the blanks on a form that has no fields: underscore runs ("Name ________") and empty
 * box glyphs (☐ □ ❏). Each becomes a field the reader can create, so flat forms fill too.
 */
export function detectBlanks(page: number, runs: TextRun[]): DetectedBlank[] {
  const out: DetectedBlank[] = [];
  for (const r of runs) {
    // Underscore runs, possibly several in one run: "Name ______ Date _____".
    const re = /_{4,}/g; let m: RegExpExecArray | null;
    const cw = r.str.length ? r.w / r.str.length : 0;
    while ((m = re.exec(r.str))) {
      const x1 = r.x + m.index * cw, x2 = x1 + m[0].length * cw;
      if (x2 - x1 < 24) continue;
      const before = r.str.slice(0, m.index).replace(/_{2,}/g, ' ').trim();
      const rect: PdfField['rect'] = [x1, r.y - 1, x2, r.y + Math.max(10, r.h)];
      const label = /[a-z]{2,}/i.test(before) ? before.split(/\s{2,}|\t/).pop()!.trim() : labelFor(rect, runs.filter(o => o !== r));
      out.push({ page, rect, label: label.slice(-90), type: 'text' });
    }
    const box = /[☐□❏▢◻]/g;
    while ((m = box.exec(r.str))) {
      const x1 = r.x + m.index * cw, s = Math.max(8, Math.min(14, r.h));
      const after = r.str.slice(m.index + 1).split(/[☐□❏▢◻]/)[0].trim();
      out.push({ page, rect: [x1, r.y - 1, x1 + s, r.y - 1 + s], label: after.slice(0, 90), type: 'checkbox' });
    }
  }
  return out;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export interface SearchHit { page: number; runIndex: number; start: number; end: number; snippet: string }

/** Case/diacritic-insensitive search across pages of runs. Whole-word optional. */
export function searchRuns(pages: TextRun[][], query: string, wholeWord = false): SearchHit[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = fold(query.trim()); if (!q) return [];
  const hits: SearchHit[] = [];
  pages.forEach((runs, page) => runs.forEach((r, runIndex) => {
    const s = fold(r.str); let i = s.indexOf(q);
    while (i >= 0) {
      const okL = !wholeWord || i === 0 || !/\w/.test(s[i - 1]); const okR = !wholeWord || i + q.length >= s.length || !/\w/.test(s[i + q.length]);
      if (okL && okR) hits.push({ page, runIndex, start: i, end: i + q.length, snippet: r.str.slice(Math.max(0, i - 30), i + q.length + 40).trim() });
      i = s.indexOf(q, i + Math.max(1, q.length));
    }
  }));
  return hits;
}
