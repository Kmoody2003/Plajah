/**
 * Grants — forms: PDF prefill and the copy sheet.
 *
 * Two ways to cut retyping:
 *  1. PDF prefill: take a fillable PDF the person uploaded (an agency's form, a state application),
 *     match each form field to a profile field, and fill what we confidently know. The file never
 *     leaves the browser. We fill only EMPTY fields and never flatten, so the person reviews and
 *     edits it in any PDF viewer.
 *  2. Copy sheet: for web forms and XFA PDFs (older Grants.gov forms are XFA, which PDF libraries
 *     cannot fill), a field-by-field list in the form's own order with one-click copy.
 *
 * ── What is never prefilled ──────────────────────────────────────────────────
 * Signatures, signing dates, initials, and every certification / assurance / attestation checkbox.
 * Those are legal acts of the organization's Authorized Organization Representative, so they are
 * reported as "needs a person" and left blank. The same goes for representations only the
 * applicant can make (SF-424 item 20, delinquent federal debt) unless the profile holds an
 * answer a person already gave.
 */

import { PDFCheckBox, PDFDocument, PDFDropdown, PDFName, PDFOptionList, PDFRadioGroup, PDFTextField } from 'pdf-lib';
import { FIELDS, SF424_APPLICANT_CODE, displayValue, type Profile } from './profile';

/** Field text that means a human must act. Tested against name + tooltip. */
export const HUMAN_ONLY = /signature|signed|sign\s?here|date.?signed|initials?|certif|assurance|attest|i\s+agree|i\s+certify|acknowledg|authori[sz]ed.?representative.*(sign|date)|under.?penalt/i;

export type Outcome = 'filled' | 'needs-you' | 'no-data' | 'unmatched' | 'skipped-nonempty';
export interface FieldReport {
  name: string;
  outcome: Outcome;
  /** Profile key used, when matched. */
  key?: string;
  value?: string;
  source?: string;
  /** True when the value is a draft the person should confirm (platform/derived/suggested, not typed by them). */
  confirm?: boolean;
  note?: string;
}

export interface PrefillResult {
  bytes?: Uint8Array;
  fields: FieldReport[];
  xfa: boolean;
  /** Short plain-language verdict for the UI. */
  summary: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[_\-.\[\]:]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A field name like "SF424_4_0:Applicant:ZipPostalCode[0]" → words a human would read. */
export function words(name: string, tooltip = ''): string {
  const camel = `${name} ${tooltip}`.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return norm(camel);
}

const NAME_PARTS: [RegExp, 'first' | 'last' | 'middle' | 'prefix' | 'suffix'][] = [
  [/first.?name/, 'first'], [/last.?name|surname|family/, 'last'], [/middle/, 'middle'], [/prefix|salutation/, 'prefix'], [/suffix/, 'suffix'],
];

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.length > 1 ? parts[parts.length - 1] : '' };
}

/**
 * Decide which profile field answers a form field. Returns null when nothing matches confidently.
 * Contact-vs-representative is decided by context words in the field name; the plain "phone"/"email"
 * fields belong to the application contact.
 */
export function matchField(name: string, tooltip = ''): { key: string; part?: 'first' | 'last' | 'middle' | 'prefix' | 'suffix' } | null {
  const w = words(name, tooltip);
  if (!w) return null;
  const rep = /authori[sz]ed|\baor\b|representative/.test(w);
  const contact = /contact|person to be contacted/.test(w);

  // Person-name parts: which person depends on context words; default to the application contact.
  const part = NAME_PARTS.find(([re]) => re.test(w))?.[1];
  if (part) {
    if (part === 'prefix' || part === 'suffix' || part === 'middle') return null; // we hold no such data; leave blank
    return { key: rep && !contact ? 'repName' : 'contactName', part };
  }

  // Context-specific beats generic: "authorized representative email" before bare "email".
  if (rep && /e ?mail/.test(w)) return { key: 'repEmail' };
  if (rep && /(phone|telephone|\btel\b)/.test(w)) return { key: 'repPhone' };
  if (rep && /title/.test(w)) return { key: 'repTitle' };
  if (rep && /name/.test(w)) return { key: 'repName' };
  if (contact && /title/.test(w)) return { key: 'contactTitle' };

  // Bare email/phone always means the application contact — and must not fall through to "address".
  if (/e ?mail/.test(w)) return { key: 'contactEmail' };
  if (/(phone|telephone|tel)/.test(w)) return { key: 'contactPhone' };

  let best: { key: string; score: number } | null = null;
  for (const f of FIELDS) {
    for (const re of f.match) {
      if (re.test(w)) {
        // Longer, more specific patterns win over short generic ones.
        const score = re.source.length;
        if (!best || score > best.score) best = { key: f.key, score };
      }
    }
  }
  return best ? { key: best.key } : null;
}

function readTooltip(field: any): string {
  try {
    const tu = field.acroField?.dict?.get(PDFName.of('TU'));
    return tu && typeof tu.decodeText === 'function' ? tu.decodeText() : '';
  } catch { return ''; }
}

function hasXfa(doc: PDFDocument): boolean {
  try {
    const acro: any = doc.catalog.lookup(PDFName.of('AcroForm'));
    return !!acro?.get?.(PDFName.of('XFA'));
  } catch { return false; }
}

function valueFor(profile: Profile, key: string, part?: string): { value: string; source: string; confirm: boolean } | null {
  const v = profile[key];
  if (!v) return null;
  let value = v.value;
  if (part) {
    const n = splitName(value);
    value = part === 'first' ? n.first : part === 'last' ? n.last : '';
    if (!value) return null;
  } else if (FIELDS.find(f => f.key === key)?.kind === 'money') value = Number(v.value).toLocaleString('en-US');
  return { value, source: v.source, confirm: !v.confirmed };
}

/** Fill a fillable PDF from the profile. Never throws on odd fields; each outcome is reported. */
export async function prefillPdf(input: Uint8Array | ArrayBuffer, profile: Profile): Promise<PrefillResult> {
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(input, { ignoreEncryption: true, updateMetadata: false }); }
  catch { return { fields: [], xfa: false, summary: 'That file could not be opened as a PDF.' }; }

  const xfa = hasXfa(doc);
  const form = doc.getForm();
  const all = form.getFields();
  const reports: FieldReport[] = [];

  for (const field of all) {
    const name = field.getName();
    const tip = readTooltip(field);
    const w = words(name, tip);

    if (HUMAN_ONLY.test(w)) {
      reports.push({ name, outcome: 'needs-you', note: 'Signature, date or certification — only your authorized representative can complete this.' });
      continue;
    }
    const m = matchField(name, tip);
    if (!m) { reports.push({ name, outcome: 'unmatched' }); continue; }

    // Checkboxes / radios / lists answer yes-no or choice questions; handle the safe, common cases only.
    if (field instanceof PDFTextField) {
      if (field.getText()) { reports.push({ name, outcome: 'skipped-nonempty', key: m.key, note: 'Already has an answer — left as is.' }); continue; }
      const val = valueFor(profile, m.key, m.part);
      if (!val) { reports.push({ name, outcome: 'no-data', key: m.key }); continue; }
      let text = val.value;
      const max = field.getMaxLength();
      if (max && text.length > max) text = text.slice(0, max);
      try { field.setText(text); } catch { reports.push({ name, outcome: 'unmatched', note: 'Could not write this field.' }); continue; }
      reports.push({ name, outcome: 'filled', key: m.key, value: text, source: val.source, confirm: val.confirm });
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      const val = valueFor(profile, m.key);
      if (!val) { reports.push({ name, outcome: 'no-data', key: m.key }); continue; }
      const display = displayValue(m.key, val.value).toLowerCase();
      const opt = field.getOptions().find(o => o.toLowerCase() === display || o.toLowerCase() === val.value.toLowerCase()
        || (m.key === 'state' && o.toLowerCase().startsWith(val.value.toLowerCase())));
      if (!opt) { reports.push({ name, outcome: 'unmatched', key: m.key, note: 'No matching option in the list.' }); continue; }
      field.select(opt);
      reports.push({ name, outcome: 'filled', key: m.key, value: opt, source: val.source, confirm: val.confirm });
    } else if (field instanceof PDFCheckBox || field instanceof PDFRadioGroup) {
      // Yes/no representations (delinquent debt, prior awards) are only ticked from a person's own answer.
      reports.push({ name, outcome: 'needs-you', key: m.key, note: 'Choice question — answer it yourself so it reflects your records.' });
    } else {
      reports.push({ name, outcome: 'unmatched' });
    }
  }

  const filled = reports.filter(r => r.outcome === 'filled').length;
  const needs = reports.filter(r => r.outcome === 'needs-you').length;
  const noData = reports.filter(r => r.outcome === 'no-data').length;
  let summary: string;
  if (!all.length) {
    summary = xfa
      ? 'This is an XFA form (the older Grants.gov format). PDF tools cannot fill those, so use the copy sheet below and paste into the form.'
      : 'This PDF has no fillable fields. Use the copy sheet below, or print it and fill by hand.';
  } else {
    summary = `Filled ${filled} of ${all.length} fields. ${needs} need a person (signatures, dates, certifications, yes/no answers)`
      + `${noData ? `, and ${noData} we have no answer for yet — Aria can collect those` : ''}.`;
  }

  // Keep form fields live: no flatten, so the person edits freely. Mark appearances so viewers show values.
  try { form.updateFieldAppearances(); } catch { /* some fonts lack glyphs; values are still set */ }
  const bytes = filled ? await doc.save({ updateFieldAppearances: false }) : undefined;
  return { bytes, fields: reports, xfa, summary };
}

// ─── Copy sheet ──────────────────────────────────────────────────────────────

export interface CopyRow {
  item: string;
  label: string;
  value?: string;
  /** What the person should do when there is no value. */
  action?: 'you-decide' | 'missing' | 'per-notice';
  source?: string;
  confirm?: boolean;
  note?: string;
}

/** SF-424 (Application for Federal Assistance), in the form's own item order. Opportunity-specific items come from the notice. */
export function sf424CopySheet(profile: Profile, notice?: { agency?: string; number?: string; title?: string }): CopyRow[] {
  // Value fields only: callers spread this AFTER item/label, so it must not carry those keys.
  const p = (key: string): Pick<CopyRow, 'value' | 'source' | 'confirm' | 'action'> => {
    const v = profile[key];
    return v ? { value: v.value, source: v.source, confirm: !v.confirmed } : { action: 'missing' };
  };
  const row = (item: string, label: string, key: string, note?: string): CopyRow => ({ item, label, ...p(key), note });
  const entity = profile.entityType?.value;
  const code = entity ? SF424_APPLICANT_CODE[entity] : undefined;
  const addr = ['street', 'city', 'state', 'zip'].map(k => profile[k]?.value).filter(Boolean).join(', ');

  const rows: CopyRow[] = [
    { item: '1', label: 'Type of submission', action: 'you-decide', note: 'Usually "Application". Pre-application only if the notice asks for one.' },
    { item: '2', label: 'Type of application', action: 'you-decide', note: 'New, Continuation or Revision — a first-time application is "New".' },
    row('8a', 'Legal name', 'legalName'),
    row('8b', 'Employer / Taxpayer Identification Number (EIN/TIN)', 'ein'),
    row('8c', 'Unique Entity Identifier (UEI)', 'uei'),
    { item: '8d', label: 'Address', value: addr || undefined, action: addr ? undefined : 'missing', source: 'platform', confirm: true },
    { item: '8d', label: 'County / Parish', ...p('county'), note: undefined },
    row('8f', 'Name and contact information of person to be contacted', 'contactName'),
    { item: '8f', label: 'Contact email', ...p('contactEmail') },
    { item: '8f', label: 'Contact phone', ...p('contactPhone') },
    { item: '9', label: 'Type of applicant', value: code ? `${code} — ${displayValue('entityType', entity!)}` : undefined, action: code ? undefined : 'missing', source: 'suggested', confirm: true, note: 'Letter code from the form\'s drop-down.' },
    { item: '10', label: 'Name of federal agency', value: notice?.agency, action: notice?.agency ? undefined : 'per-notice' },
    { item: '12', label: 'Funding opportunity number', value: notice?.number, action: notice?.number ? undefined : 'per-notice' },
    { item: '12', label: 'Funding opportunity title', value: notice?.title, action: notice?.title ? undefined : 'per-notice' },
    { item: '14', label: 'Areas affected by funding', ...p('serviceArea'), note: 'Cities, counties or states your project reaches.' },
    { item: '15', label: 'Descriptive title of applicant\'s project', action: 'you-decide', note: 'Aria can help you write a clear one.' },
    { item: '16a', label: 'Congressional district of applicant', ...p('congressionalDistrict'), note: 'Found from your address. Item 16b is where the project happens.' },
    { item: '17', label: 'Proposed project start and end dates', action: 'you-decide', note: 'The notice states the earliest start and the period of performance.' },
    { item: '18', label: 'Estimated funding (federal / applicant / other)', action: 'you-decide', note: 'From your budget; the match amount comes from the notice\'s cost-share rule.' },
    { item: '19', label: 'Subject to review by state under Executive Order 12372?', action: 'per-notice', note: 'Depends on the program; the notice or agency contact tells you.' },
    { item: '20', label: 'Is the applicant delinquent on any federal debt?', ...p('delinquentFederalDebt'), note: 'Only your organization can answer this.' },
    { item: '21', label: 'Certification, signature, title and date', action: 'you-decide', note: 'Completed by your Authorized Organization Representative at submission. We never fill this.' },
  ];
  return rows;
}
