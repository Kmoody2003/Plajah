/**
 * crmCore — the pure half of the business CRM (no Firebase, no DOM).
 *
 * Segments, pipeline math (count / value / weighted value / stale), merge fields for correspondence,
 * template suggestions, de-duplication, CSV in/out and mailing rows for print-and-mail hand-offs.
 * Everything here is deterministic given `now`, so it is unit-tested in tests/crmCore.test.ts.
 */
import type { CrmContact } from '../../types';
import type {
  CorrespondenceChannel, CorrespondenceTemplate, CrmPipeline, CrmPreset, CrmStage, SegmentRule,
} from '../opsPresets/types';

export const DAY_MS = 86_400_000;

// ── Small helpers ────────────────────────────────────────────────────────

export function fullName(c: Pick<CrmContact, 'name' | 'firstName' | 'lastName'>): string {
  const fl = [c.firstName, c.lastName].map(s => (s || '').trim()).filter(Boolean).join(' ');
  return (c.name || '').trim() || fl;
}

export function firstNameOf(c: Pick<CrmContact, 'name' | 'firstName'>): string {
  const f = (c.firstName || '').trim();
  if (f) return f;
  const n = (c.name || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

export function formatCents(cents: number | undefined, opts: { compact?: boolean } = {}): string {
  const v = (cents || 0) / 100;
  if (opts.compact && Math.abs(v) >= 10_000) {
    return `$${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
  }
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: v % 1 ? 2 : 0 });
}

export function hasMailingAddress(c: Pick<CrmContact, 'address'>): boolean {
  const a = c.address;
  return !!(a && (a.line1 || '').trim() && (a.city || '').trim() && (a.region || '').trim() && (a.postal || '').trim());
}

/** Most recent touch: visit, contact, or (failing both) creation. */
export function lastTouchAt(c: CrmContact): number {
  return Math.max(c.lastVisit || 0, c.lastContactAt || 0) || c.createdAt || 0;
}

// ── Segments ─────────────────────────────────────────────────────────────

export function segmentMatches(c: CrmContact, rule: SegmentRule, now: number): boolean {
  if (rule.tagsAny?.length) {
    const mine = new Set((c.tags || []).map(t => t.toLowerCase()));
    if (!rule.tagsAny.some(t => mine.has(t.toLowerCase()))) return false;
  }
  if (rule.pipelineId && c.pipelineId !== rule.pipelineId) return false;
  if (rule.stageIn?.length && !(c.stageId && rule.stageIn.includes(c.stageId))) return false;
  if (rule.minSpend != null && (c.totalSpend || 0) < rule.minSpend) return false;
  if (rule.minVisits != null && (c.visitCount || 0) < rule.minVisits) return false;
  if (rule.inactiveDays != null && now - lastTouchAt(c) < rule.inactiveDays * DAY_MS) return false;
  if (rule.newWithinDays != null && now - (c.createdAt || 0) > rule.newWithinDays * DAY_MS) return false;
  if (rule.sourceIn?.length && !(c.source && rule.sourceIn.includes(c.source))) return false;
  if (rule.optedIn && !c.marketingOptIn) return false;
  if (rule.hasAddress && !hasMailingAddress(c)) return false;
  return true;
}

export function applySegment(contacts: CrmContact[], rule: SegmentRule, now: number): CrmContact[] {
  return contacts.filter(c => segmentMatches(c, rule, now));
}

// ── Pipeline ─────────────────────────────────────────────────────────────

/** The contact's stage inside a pipeline. A contact on this pipeline with an unknown stage lands in the first stage. */
export function stageOf(c: CrmContact, pipeline: CrmPipeline): CrmStage | undefined {
  if (c.pipelineId !== pipeline.id) return undefined;
  return pipeline.stages.find(s => s.id === c.stageId) || pipeline.stages[0];
}

export function stageEnteredAt(c: CrmContact): number {
  return c.stageEnteredAt || c.updatedAt || c.createdAt || 0;
}

export function daysInStage(c: CrmContact, now: number): number {
  return Math.max(0, Math.floor((now - stageEnteredAt(c)) / DAY_MS));
}

/** Open stage with an SLA and the contact has sat past it. Won/lost stages are never stale. */
export function isStale(c: CrmContact, stage: CrmStage | undefined, now: number): boolean {
  if (!stage || stage.kind !== 'open' || !stage.slaDays) return false;
  return now - stageEnteredAt(c) > stage.slaDays * DAY_MS;
}

export interface StageSummary {
  stage: CrmStage;
  count: number;
  valueCents: number;
  weightedCents: number;
  staleCount: number;
  contactIds: string[];
}

export interface PipelineSummary {
  pipelineId: string;
  stages: StageSummary[];
  count: number;
  /** Open-stage totals (the live pipeline). */
  openCount: number;
  openValueCents: number;
  weightedCents: number;
  wonCount: number;
  wonValueCents: number;
  lostCount: number;
  staleCount: number;
}

export function pipelineSummary(contacts: CrmContact[], pipeline: CrmPipeline, now: number = Date.now()): PipelineSummary {
  const byStage = new Map<string, StageSummary>(pipeline.stages.map(s => [s.id, {
    stage: s, count: 0, valueCents: 0, weightedCents: 0, staleCount: 0, contactIds: [],
  }]));
  const out: PipelineSummary = {
    pipelineId: pipeline.id, stages: [], count: 0, openCount: 0, openValueCents: 0, weightedCents: 0,
    wonCount: 0, wonValueCents: 0, lostCount: 0, staleCount: 0,
  };
  for (const c of contacts) {
    const stage = stageOf(c, pipeline);
    if (!stage) continue;
    const row = byStage.get(stage.id)!;
    const value = Math.max(0, c.dealValueCents || 0);
    const prob = stage.kind === 'lost' ? 0 : stage.kind === 'won' ? 100 : Math.min(100, Math.max(0, stage.probability || 0));
    const weighted = Math.round((value * prob) / 100);
    const stale = isStale(c, stage, now);
    row.count++; row.valueCents += value; row.weightedCents += weighted; row.contactIds.push(c.id);
    if (stale) { row.staleCount++; out.staleCount++; }
    out.count++;
    if (stage.kind === 'open') { out.openCount++; out.openValueCents += value; out.weightedCents += weighted; }
    else if (stage.kind === 'won') { out.wonCount++; out.wonValueCents += value; }
    else out.lostCount++;
  }
  out.stages = pipeline.stages.map(s => byStage.get(s.id)!);
  return out;
}

// ── Merge fields ─────────────────────────────────────────────────────────

export interface MergeContext {
  contact?: Partial<CrmContact>;
  business?: { name?: string; phone?: string; address?: string };
  pipeline?: CrmPipeline;
  stageLabel?: string;
  eventTitle?: string;
  eventDate?: string;
  senderName?: string;
}

export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'name', label: 'Full name' },
  { key: 'business_name', label: 'Business' },
  { key: 'business_phone', label: 'Business phone' },
  { key: 'business_address', label: 'Business address' },
  { key: 'stage', label: 'Stage' },
  { key: 'next_action', label: 'Next action' },
  { key: 'deal', label: 'Deal value' },
  { key: 'event_title', label: 'Event title' },
  { key: 'event_date', label: 'Event date' },
  { key: 'sender_name', label: 'Your name' },
];

export function mergeValue(key: string, ctx: MergeContext): string {
  const c = ctx.contact || {};
  if (key.startsWith('custom.')) return (c.custom?.[key.slice(7)] || '').trim();
  switch (key) {
    case 'first_name': return firstNameOf({ name: c.name || '', firstName: c.firstName }) || 'there';
    case 'last_name': return (c.lastName || '').trim();
    case 'name': return fullName({ name: c.name || '', firstName: c.firstName, lastName: c.lastName }) || 'there';
    case 'company': return (c.company || '').trim();
    case 'business_name': return (ctx.business?.name || '').trim() || 'our team';
    case 'business_phone': return (ctx.business?.phone || '').trim();
    case 'business_address': return (ctx.business?.address || '').trim();
    case 'stage': {
      if (ctx.stageLabel) return ctx.stageLabel;
      const st = ctx.pipeline?.stages.find(s => s.id === c.stageId);
      return st?.label || '';
    }
    case 'next_action': return (c.nextAction || '').trim() || 'our next step';
    case 'deal': return c.dealValueCents ? formatCents(c.dealValueCents) : '';
    case 'event_title': return (ctx.eventTitle || '').trim() || 'our upcoming event';
    case 'event_date': return (ctx.eventDate || '').trim() || 'soon';
    case 'sender_name': return (ctx.senderName || '').trim() || (ctx.business?.name || '').trim() || 'The team';
    default: return '';
  }
}

export function mergeText(text: string, ctx: MergeContext): string {
  return (text || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => mergeValue(key, ctx));
}

export function mergeFields(
  template: Pick<CorrespondenceTemplate, 'subject' | 'body'>,
  ctx: MergeContext,
): { subject: string; body: string } {
  return { subject: mergeText(template.subject || '', ctx).trim(), body: mergeText(template.body, ctx) };
}

// ── Channel reach + consent gate ─────────────────────────────────────────

export function canReach(c: CrmContact, channel: CorrespondenceChannel): boolean {
  switch (channel) {
    case 'email': return !!(c.email || '').trim();
    case 'push': return !!c.userId;
    case 'letter':
    case 'postcard': return !c.mailOptOut && hasMailingAddress(c);
  }
}

export interface GateResult {
  ok: CrmContact[];
  noConsent: CrmContact[];
  unreachable: CrmContact[];
}

/** Promotional sends drop contacts without marketing consent; every send drops contacts the channel can't reach. */
export function gateRecipients(
  contacts: CrmContact[],
  t: Pick<CorrespondenceTemplate, 'channel' | 'promotional'>,
): GateResult {
  const out: GateResult = { ok: [], noConsent: [], unreachable: [] };
  for (const c of contacts) {
    if (t.promotional && !c.marketingOptIn) out.noConsent.push(c);
    else if (!canReach(c, t.channel)) out.unreachable.push(c);
    else out.ok.push(c);
  }
  return out;
}

// ── Template suggestions ─────────────────────────────────────────────────

export type SuggestEvent =
  | { on: 'stage_enter'; pipelineId?: string; stageId: string }
  | { on: 'new_contact' }
  | { on: 'inactive_days'; days: number }
  | { on: 'birthday' }
  | { on: 'after_purchase' };

/**
 * Templates worth offering for this contact + event. A stage's own `templateId` leads; templates the
 * contact can't receive (no email / address / app account) or isn't consented for (promotional) are dropped.
 */
export function suggestedTemplates(
  c: CrmContact,
  preset: { crm: CrmPreset; correspondence: CorrespondenceTemplate[] },
  event: SuggestEvent,
): CorrespondenceTemplate[] {
  const all = preset.correspondence || [];
  const picked: CorrespondenceTemplate[] = [];
  const add = (t?: CorrespondenceTemplate) => { if (t && !picked.includes(t)) picked.push(t); };

  if (event.on === 'stage_enter') {
    const pipe = preset.crm.pipelines.find(p => p.id === (event.pipelineId || c.pipelineId)) || preset.crm.pipelines[0];
    const stage = pipe?.stages.find(s => s.id === event.stageId);
    if (stage?.templateId) add(all.find(t => t.id === stage.templateId));
    all.filter(t => t.trigger?.on === 'stage_enter' && t.trigger.stageId === event.stageId).forEach(add);
  } else if (event.on === 'inactive_days') {
    all.filter(t => t.trigger?.on === 'inactive_days' && (t.trigger.days ?? 0) <= event.days)
      .sort((a, b) => (b.trigger?.days ?? 0) - (a.trigger?.days ?? 0)).forEach(add);
  } else {
    all.filter(t => t.trigger?.on === event.on).forEach(add);
  }
  return picked.filter(t => (!t.promotional || c.marketingOptIn) && canReach(c, t.channel));
}

/** Birthday stored as YYYY-MM-DD or MM-DD; true when it falls within `withinDays` from `now` (inclusive). */
export function birthdaySoon(birthday: string | undefined, now: number, withinDays = 0): boolean {
  if (!birthday) return false;
  const m = birthday.match(/(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const month = Number(m[1]) - 1, day = Number(m[2]);
  const today = new Date(now);
  for (let i = 0; i <= withinDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (d.getMonth() === month && d.getDate() === day) return true;
  }
  return false;
}

export interface FollowUp {
  contact: CrmContact;
  reason: 'overdue' | 'due_today' | 'stale' | 'birthday' | 'new';
  label: string;
}

/** The "who needs me today" list: overdue / due next actions, stale cards, birthdays this week, brand-new contacts. */
export function followUps(contacts: CrmContact[], preset: CrmPreset, now: number): FollowUp[] {
  const out: FollowUp[] = [];
  const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
  for (const c of contacts) {
    if (c.nextActionAt && c.nextActionAt < now - DAY_MS / 24) {
      out.push({ contact: c, reason: 'overdue', label: c.nextAction || 'Follow up' });
      continue;
    }
    if (c.nextActionAt && c.nextActionAt <= endOfDay.getTime()) {
      out.push({ contact: c, reason: 'due_today', label: c.nextAction || 'Follow up' });
      continue;
    }
    const pipe = preset.pipelines.find(p => p.id === c.pipelineId);
    const stage = pipe && stageOf(c, pipe);
    if (stage && isStale(c, stage, now)) {
      out.push({ contact: c, reason: 'stale', label: `${daysInStage(c, now)} days in ${stage.label}` });
      continue;
    }
    if (birthdaySoon(c.birthday, now, 6)) { out.push({ contact: c, reason: 'birthday', label: 'Birthday this week' }); continue; }
    if (now - (c.createdAt || 0) < 2 * DAY_MS && !c.lastContactAt) out.push({ contact: c, reason: 'new', label: 'New — say hello' });
  }
  const rank = { overdue: 0, due_today: 1, stale: 2, birthday: 3, new: 4 };
  return out.sort((a, b) => rank[a.reason] - rank[b.reason]);
}

// ── De-duplication + import planning ─────────────────────────────────────

export function normEmail(e?: string): string { return (e || '').trim().toLowerCase(); }
export function phoneDigits(p?: string): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
}

/** Every identity key a contact can be matched on (email first, then phone). */
export function dedupeKeys(c: Partial<CrmContact>): string[] {
  const keys: string[] = [];
  const e = normEmail(c.email);
  if (e) keys.push(`e:${e}`);
  const p = phoneDigits(c.phone);
  if (p.length >= 7) keys.push(`p:${p}`);
  return keys;
}

/** Primary key: lower-cased email, else phone digits; null when the contact has neither. */
export function dedupeKey(c: Partial<CrmContact>): string | null {
  return dedupeKeys(c)[0] ?? null;
}

export interface ImportPlan {
  creates: Partial<CrmContact>[];
  /** Existing contacts that matched; patch only fills blanks and unions tags. */
  updates: { id: string; patch: Partial<CrmContact> }[];
  duplicatesInFile: number;
  unchanged: number;
}

/** Fill-only merge: never overwrites a value the business already has. */
export function fillBlanks(existing: CrmContact, incoming: Partial<CrmContact>): Partial<CrmContact> {
  const patch: Partial<CrmContact> = {};
  const keys: (keyof CrmContact)[] = ['name', 'firstName', 'lastName', 'email', 'phone', 'company', 'birthday'];
  for (const k of keys) {
    const v = incoming[k];
    if (v && !existing[k]) (patch as any)[k] = v;
  }
  if (incoming.address && !hasMailingAddress(existing) && hasMailingAddress(incoming)) patch.address = incoming.address;
  if (incoming.notes && !(existing.notes || '').includes(incoming.notes)) {
    patch.notes = existing.notes ? `${existing.notes}\n${incoming.notes}` : incoming.notes;
  }
  const tags = new Set(existing.tags || []);
  const before = tags.size;
  (incoming.tags || []).forEach(t => tags.add(t));
  if (tags.size !== before) patch.tags = [...tags];
  return patch;
}

export function planImport(existing: CrmContact[], rows: Partial<CrmContact>[]): ImportPlan {
  const index = new Map<string, CrmContact>();
  for (const c of existing) for (const k of dedupeKeys(c)) if (!index.has(k)) index.set(k, c);
  const seenInFile = new Map<string, Partial<CrmContact>>();
  const plan: ImportPlan = { creates: [], updates: [], duplicatesInFile: 0, unchanged: 0 };
  const updateById = new Map<string, Partial<CrmContact>>();

  for (const row of rows) {
    const keys = dedupeKeys(row);
    const hit = keys.map(k => index.get(k)).find(Boolean);
    if (hit) {
      const merged = { ...hit, ...(updateById.get(hit.id) || {}) } as CrmContact;
      const patch = fillBlanks(merged, row);
      if (Object.keys(patch).length) updateById.set(hit.id, { ...(updateById.get(hit.id) || {}), ...patch });
      else if (!updateById.has(hit.id)) plan.unchanged++;
      continue;
    }
    const dup = keys.map(k => seenInFile.get(k)).find(Boolean);
    if (dup) {
      plan.duplicatesInFile++;
      Object.assign(dup, fillBlanks({ ...(dup as CrmContact), tags: dup.tags || [] }, row));
      continue;
    }
    const copy = { ...row, tags: [...(row.tags || [])] };
    plan.creates.push(copy);
    for (const k of keys) seenInFile.set(k, copy);
  }
  plan.updates = [...updateById.entries()].map(([id, patch]) => ({ id, patch }));
  return plan;
}

// ── CSV ──────────────────────────────────────────────────────────────────

/** RFC-4180-ish parser: quoted fields, doubled quotes, commas and newlines inside quotes, CRLF. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQ = false;
  const src = (text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['name', 'fullname', 'contact', 'contactname', 'customer', 'customername'],
  first: ['first', 'firstname', 'givenname', 'fname'],
  last: ['last', 'lastname', 'surname', 'familyname', 'lname'],
  email: ['email', 'emailaddress', 'mail'],
  phone: ['phone', 'phonenumber', 'mobile', 'cell', 'tel', 'telephone'],
  company: ['company', 'organization', 'organisation', 'business', 'employer'],
  tags: ['tags', 'tag', 'labels', 'groups'],
  address: ['address', 'address1', 'addressline1', 'street', 'streetaddress', 'line1'],
  address2: ['address2', 'addressline2', 'line2', 'apt', 'suite', 'unit'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'region', 'province', 'st'],
  zip: ['zip', 'zipcode', 'postal', 'postalcode', 'postcode'],
  notes: ['notes', 'note', 'comments', 'comment'],
  birthday: ['birthday', 'birthdate', 'dob', 'dateofbirth'],
  optin: ['marketingoptin', 'optin', 'emailoptin', 'acceptsmarketing', 'acceptsemailmarketing'],
};

function canonicalHeader(h: string): string | null {
  const k = h.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [canon, aliases] of Object.entries(HEADER_ALIASES)) if (aliases.includes(k)) return canon;
  return null;
}

export interface CsvParseResult {
  rows: Partial<CrmContact>[];
  errors: string[];
  /** Original header → recognized field (null when ignored). */
  columns: { header: string; field: string | null }[];
}

const truthy = (v: string) => /^(y|yes|true|1|subscribed|opted.?in)$/i.test(v.trim());

export function parseContactsCsv(text: string): CsvParseResult {
  const raw = parseCsvRows(text);
  const out: CsvParseResult = { rows: [], errors: [], columns: [] };
  if (!raw.length) { out.errors.push('The file is empty.'); return out; }
  const header = raw[0];
  out.columns = header.map(h => ({ header: h.trim(), field: canonicalHeader(h) }));
  if (!out.columns.some(c => c.field)) {
    out.errors.push('No recognizable columns. Use headers like name, email, phone, address, city, state, zip.');
    return out;
  }
  for (let r = 1; r < raw.length; r++) {
    const rec: Record<string, string> = {};
    out.columns.forEach((c, i) => { if (c.field && raw[r][i] != null && rec[c.field] == null) rec[c.field] = raw[r][i].trim(); });
    const first = rec.first || '';
    const last = rec.last || '';
    const name = rec.name || [first, last].filter(Boolean).join(' ');
    const email = rec.email || '';
    const phone = rec.phone || '';
    if (!name && !email && !phone) { out.errors.push(`Row ${r + 1}: no name, email or phone — skipped.`); continue; }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.errors.push(`Row ${r + 1}: "${email}" doesn't look like an email.`);
    const c: Partial<CrmContact> = {
      name: name || email || phone,
      tags: rec.tags ? rec.tags.split(/[;|,]/).map(t => t.trim()).filter(Boolean) : [],
      notes: rec.notes || '',
      source: 'import',
    };
    if (first) c.firstName = first;
    if (last) c.lastName = last;
    if (email) c.email = email;
    if (phone) c.phone = phone;
    if (rec.company) c.company = rec.company;
    if (rec.birthday) c.birthday = rec.birthday;
    if (rec.optin) c.marketingOptIn = truthy(rec.optin);
    if (rec.address || rec.city || rec.state || rec.zip) {
      c.address = {
        ...(rec.address ? { line1: rec.address } : {}),
        ...(rec.address2 ? { line2: rec.address2 } : {}),
        ...(rec.city ? { city: rec.city } : {}),
        ...(rec.state ? { region: rec.state } : {}),
        ...(rec.zip ? { postal: rec.zip } : {}),
      };
    }
    out.rows.push(c);
  }
  return out;
}

export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsvText(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

const CSV_HEADER = ['name', 'first', 'last', 'email', 'phone', 'company', 'tags', 'address', 'address2', 'city', 'state', 'zip',
  'notes', 'birthday', 'marketing_opt_in', 'pipeline', 'stage', 'deal_value', 'total_spend', 'visits', 'last_visit', 'created'];

export function toCsv(contacts: CrmContact[]): string {
  const iso = (t?: number) => (t ? new Date(t).toISOString().slice(0, 10) : '');
  return toCsvText(CSV_HEADER, contacts.map(c => [
    fullName(c), c.firstName || '', c.lastName || '', c.email || '', c.phone || '', c.company || '',
    (c.tags || []).join('; '), c.address?.line1 || '', c.address?.line2 || '', c.address?.city || '',
    c.address?.region || '', c.address?.postal || '', c.notes || '', c.birthday || '',
    c.marketingOptIn ? 'yes' : 'no', c.pipelineId || '', c.stageId || '',
    c.dealValueCents ? (c.dealValueCents / 100).toFixed(2) : '', c.totalSpend ?? 0, c.visitCount ?? 0,
    iso(c.lastVisit), iso(c.createdAt),
  ]));
}

// ── Mailing rows (labels, letters, print-and-mail hand-off) ──────────────

export interface MailingRow {
  contactId: string;
  name: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  zip: string;
}

/** One row per deliverable contact: skips mail opt-outs and incomplete addresses, collapses exact duplicates. */
export function mailingRows(contacts: CrmContact[]): MailingRow[] {
  const seen = new Set<string>();
  const out: MailingRow[] = [];
  for (const c of contacts) {
    if (c.mailOptOut || !hasMailingAddress(c)) continue;
    const a = c.address!;
    const row: MailingRow = {
      contactId: c.id,
      name: fullName(c),
      address1: (a.line1 || '').trim(),
      address2: (a.line2 || '').trim(),
      city: (a.city || '').trim(),
      state: (a.region || '').trim().toUpperCase(),
      zip: (a.postal || '').trim(),
    };
    const key = [row.name, row.address1, row.address2, row.zip].join('|').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function mailingCsv(rows: MailingRow[]): string {
  return toCsvText(['name', 'address1', 'address2', 'city', 'state', 'zip'],
    rows.map(r => [r.name, r.address1, r.address2, r.city, r.state, r.zip]));
}

/** Free-text search across the fields people actually type into a search box. */
export function contactMatchesQuery(c: CrmContact, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const digits = needle.replace(/\D/g, '');
  const hay = [fullName(c), c.email, c.company, c.notes, ...(c.tags || []), c.address?.city].join(' ').toLowerCase();
  return hay.includes(needle) || (digits.length >= 3 && phoneDigits(c.phone).includes(digits));
}
