/**
 * Civic Desk — the pure core of Terra Civic's government CRM.
 *
 * A government CRM is casework, not a sales pipeline: people and organizations ask for things
 * (a pothole fixed, a permit question answered, a code complaint investigated), the request is
 * routed to the department that owns it, worked against a response-time target, and closed with
 * an answer the person can see. This module holds every rule that decides those things, so the
 * rules are testable and identical in the browser and on the server.
 *
 * ── Rules this module enforces ───────────────────────────────────────────────
 * - Routing, due dates and status changes are deterministic code. ARIA may draft a reply or a
 *   summary elsewhere; it never decides where a case goes or whether it's closed.
 * - Public views never carry a person's name, email, phone or exact address (redactCase).
 * - Status changes follow one state machine (canTransition); every change is a timeline entry.
 *
 * No Firebase, no DOM. Reuses the business CRM's matching helpers (services/crm/crmCore).
 */

import { normEmail, phoneDigits } from '../../../crm/crmCore';

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;

// ── Types ────────────────────────────────────────────────────────────────────

export type ConstituentKind = 'person' | 'business' | 'organization';
export type Channel = 'web' | 'phone' | 'email' | 'walk_in' | 'app' | 'sms' | 'meeting' | 'social';
export type Priority = 'urgent' | 'high' | 'normal' | 'low';
export type CaseStatus = 'new' | 'triaged' | 'in_progress' | 'waiting_on_resident' | 'resolved' | 'closed' | 'duplicate';

export interface Address { line1: string; city?: string; postal?: string; lat?: number; lng?: number; parcelId?: string; ward?: string }

export interface Constituent {
  id: string;
  kind: ConstituentKind;
  /** Person: "First Last". Business/organization: legal or trade name. */
  name: string;
  email?: string;
  phone?: string;
  address?: Address;
  /** Preferred language (BCP-47, e.g. "en", "es", "ar"). Replies go out in this language. */
  language?: string;
  preferredChannel?: Channel;
  /** Business/org only: licence or registration ids, and Terra's business-licence match if any. */
  licenseIds?: string[];
  /** People who act for an organization (constituent ids). */
  contacts?: string[];
  tags?: string[];
  /** Consent to be contacted for updates beyond the case itself (newsletters, alerts). */
  updatesOptIn?: boolean;
  createdAt: number;
}

export interface Department {
  id: string;
  name: string;
  /** Shown to residents ("Public Works"). */
  publicName?: string;
  email?: string;
}

export interface ServiceType {
  id: string;
  name: string;
  /** Plain-language description shown on the resident form. */
  description: string;
  category: string;
  departmentId: string;
  /** Response target in business hours or calendar days (see dueAt). */
  sla: { amount: number; unit: 'hours' | 'days' };
  priority: Priority;
  /** Questions asked on intake, beyond description and location. */
  fields?: { key: string; label: string; required?: boolean }[];
  needsLocation: boolean;
  /** Law Library citations explaining the rule behind the service (e.g. "mcl-554.602"). */
  lawRefs?: string[];
  /** Ward- or area-specific routing overrides. */
  routeByWard?: Record<string, string>;
  /** Accept anonymous reports (no contact details). */
  allowAnonymous?: boolean;
}

export interface TimelineEntry {
  at: number;
  by: string;           // staff uid, constituent id, or 'system'
  kind: 'created' | 'status' | 'assigned' | 'note' | 'reply' | 'inbound' | 'merged' | 'routed' | 'priority';
  text?: string;
  /** Internal notes are never shown to the resident or in public views. */
  internal?: boolean;
  from?: string;
  to?: string;
}

export interface Case {
  id: string;
  /** Short reference residents can quote: "TC-24-001234". */
  ref: string;
  serviceTypeId: string;
  constituentId?: string;  // absent for anonymous reports
  onBehalfOf?: string;     // organization constituent id, when a person files for a business
  channel: Channel;
  title: string;
  description: string;
  answers?: Record<string, string>;
  location?: Address;
  departmentId: string;
  assignee?: string;
  priority: Priority;
  status: CaseStatus;
  createdAt: number;
  dueAt: number;
  firstResponseAt?: number;
  resolvedAt?: number;
  duplicateOf?: string;
  timeline: TimelineEntry[];
  tags?: string[];
}

// ── Status machine ───────────────────────────────────────────────────────────

const NEXT: Record<CaseStatus, CaseStatus[]> = {
  new: ['triaged', 'in_progress', 'duplicate', 'closed'],
  triaged: ['in_progress', 'waiting_on_resident', 'resolved', 'duplicate', 'closed'],
  in_progress: ['waiting_on_resident', 'resolved', 'duplicate'],
  waiting_on_resident: ['in_progress', 'resolved', 'closed'],
  resolved: ['closed', 'in_progress'], // reopen if the resident says it isn't fixed
  closed: ['in_progress'],             // reopen
  duplicate: ['triaged'],              // un-merge
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return NEXT[from]?.includes(to) ?? false;
}

export const STATUS_LABEL: Record<CaseStatus, string> = {
  new: 'New', triaged: 'Triaged', in_progress: 'In progress', waiting_on_resident: 'Waiting on resident',
  resolved: 'Resolved', closed: 'Closed', duplicate: 'Duplicate',
};

export const OPEN: ReadonlySet<CaseStatus> = new Set(['new', 'triaged', 'in_progress', 'waiting_on_resident']);
export const isOpen = (c: Pick<Case, 'status'>) => OPEN.has(c.status);

// ── Due dates ────────────────────────────────────────────────────────────────

/** Business hours: Mon–Fri, 8:00–17:00 local (the government's own timezone offset, in minutes). */
export function addBusinessHours(start: number, hours: number, tzOffsetMin = 0): number {
  let t = start + tzOffsetMin * 60_000; // shift into "local" wall time, work in UTC fields
  let left = hours * 60; // minutes
  const OPEN_H = 8, CLOSE_H = 17;
  for (let guard = 0; left > 0 && guard < 10_000; guard++) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    const h = d.getUTCHours() + d.getUTCMinutes() / 60;
    if (dow === 0 || dow === 6 || h >= CLOSE_H) {
      // jump to next weekday 08:00
      const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, OPEN_H));
      t = n.getTime();
      continue;
    }
    if (h < OPEN_H) { t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), OPEN_H); continue; }
    const untilClose = (CLOSE_H - h) * 60;
    const step = Math.min(left, untilClose);
    t += step * 60_000;
    left -= step;
  }
  return t - tzOffsetMin * 60_000;
}

export function dueAt(created: number, sla: ServiceType['sla'], tzOffsetMin = 0): number {
  return sla.unit === 'days' ? created + sla.amount * DAY_MS : addBusinessHours(created, sla.amount, tzOffsetMin);
}

export type SlaState = 'on_track' | 'due_soon' | 'overdue' | 'met' | 'missed';

/** Where a case stands against its target. "Due soon" = within 20% of the window, or 4 hours. */
export function slaState(c: Pick<Case, 'createdAt' | 'dueAt' | 'status' | 'resolvedAt'>, now: number): SlaState {
  if (!isOpen(c as Case)) {
    const done = c.resolvedAt ?? now;
    return done <= c.dueAt ? 'met' : 'missed';
  }
  if (now > c.dueAt) return 'overdue';
  const window = c.dueAt - c.createdAt;
  return c.dueAt - now <= Math.max(4 * HOUR_MS, window * 0.2) ? 'due_soon' : 'on_track';
}

// ── Routing ──────────────────────────────────────────────────────────────────

export function routeCase(type: ServiceType, location?: Address): { departmentId: string; reason: string } {
  const ward = location?.ward;
  if (ward && type.routeByWard?.[ward]) return { departmentId: type.routeByWard[ward], reason: `${type.name} in ward ${ward}` };
  return { departmentId: type.departmentId, reason: type.name };
}

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Raise priority for hazard words in the description. Never lowers a priority. */
export function triagePriority(base: Priority, description: string): { priority: Priority; reason?: string } {
  const hazard = /\b(gas leak|smell(s)? gas|downed (power )?line|live wire|flood(ing)?|sinkhole|no heat|carbon monoxide|exposed wir|collapse|fire hazard)\b/i.exec(description);
  if (hazard && PRIORITY_RANK[base] > PRIORITY_RANK.urgent) return { priority: 'urgent', reason: `Mentions “${hazard[0]}”` };
  return { priority: base };
}

// ── Intake ───────────────────────────────────────────────────────────────────

export interface IntakeInput {
  serviceType: ServiceType;
  description: string;
  channel: Channel;
  constituentId?: string;
  onBehalfOf?: string;
  location?: Address;
  answers?: Record<string, string>;
  by: string;
  now: number;
  seq: number;          // next sequence number for the ref
  tzOffsetMin?: number;
}

export function caseRef(now: number, seq: number, prefix = 'TC'): string {
  const yy = String(new Date(now).getUTCFullYear()).slice(2);
  return `${prefix}-${yy}-${String(seq).padStart(6, '0')}`;
}

export interface IntakeResult { case: Case; problems: string[] }

/** Validate and build a new case. Problems are returned, never thrown, so forms can show them. */
export function openCase(input: IntakeInput, id: string): IntakeResult {
  const t = input.serviceType;
  const problems: string[] = [];
  if (!input.description.trim() || input.description.trim().length < 5) problems.push('Describe the issue in a few words.');
  if (t.needsLocation && !input.location?.line1?.trim()) problems.push('Add the address or nearest intersection.');
  if (!input.constituentId && !t.allowAnonymous) problems.push('This request needs contact details so staff can follow up.');
  for (const f of t.fields ?? []) if (f.required && !input.answers?.[f.key]?.trim()) problems.push(`Answer “${f.label}”.`);
  const route = routeCase(t, input.location);
  const tri = triagePriority(t.priority, input.description);
  const timeline: TimelineEntry[] = [
    { at: input.now, by: input.by, kind: 'created', text: `Received by ${input.channel.replace('_', ' ')}` },
    { at: input.now, by: 'system', kind: 'routed', to: route.departmentId, text: `Routed: ${route.reason}`, internal: true },
  ];
  if (tri.reason) timeline.push({ at: input.now, by: 'system', kind: 'priority', from: t.priority, to: tri.priority, text: tri.reason, internal: true });
  const c: Case = {
    id,
    ref: caseRef(input.now, input.seq),
    serviceTypeId: t.id,
    constituentId: input.constituentId,
    onBehalfOf: input.onBehalfOf,
    channel: input.channel,
    title: t.name + (input.location?.line1 ? ` · ${input.location.line1}` : ''),
    description: input.description.trim(),
    answers: input.answers,
    location: input.location,
    departmentId: route.departmentId,
    priority: tri.priority,
    status: 'new',
    createdAt: input.now,
    dueAt: dueAt(input.now, t.sla, input.tzOffsetMin),
    timeline,
  };
  return { case: c, problems };
}

// ── Changes (each returns a new case with a timeline entry) ──────────────────

export function setStatus(c: Case, to: CaseStatus, by: string, now: number, text?: string): Case {
  if (!canTransition(c.status, to)) throw new Error(`Can't move a case from ${STATUS_LABEL[c.status]} to ${STATUS_LABEL[to]}`);
  const reopened = (c.status === 'resolved' || c.status === 'closed') && to === 'in_progress';
  return {
    ...c,
    status: to,
    resolvedAt: to === 'resolved' || to === 'closed' ? c.resolvedAt ?? now : reopened ? undefined : c.resolvedAt,
    timeline: [...c.timeline, { at: now, by, kind: 'status', from: c.status, to, text: text ?? (reopened ? 'Reopened' : undefined) }],
  };
}

export function assign(c: Case, assignee: string, by: string, now: number): Case {
  return { ...c, assignee, timeline: [...c.timeline, { at: now, by, kind: 'assigned', from: c.assignee, to: assignee, internal: true }] };
}

export function transfer(c: Case, departmentId: string, by: string, now: number, reason: string): Case {
  return { ...c, departmentId, assignee: undefined, timeline: [...c.timeline, { at: now, by, kind: 'routed', from: c.departmentId, to: departmentId, text: reason, internal: true }] };
}

export function addNote(c: Case, text: string, by: string, now: number, internal = true): Case {
  return { ...c, timeline: [...c.timeline, { at: now, by, kind: 'note', text, internal }] };
}

/** A public reply to the resident. The first one stamps firstResponseAt. */
export function reply(c: Case, text: string, by: string, now: number): Case {
  return {
    ...c,
    firstResponseAt: c.firstResponseAt ?? now,
    status: c.status === 'new' ? 'triaged' : c.status,
    timeline: [...c.timeline, { at: now, by, kind: 'reply', text }],
  };
}

/** Mark `dup` as a duplicate of `primary`; the primary gains a timeline note and the reporter link. */
export function mergeDuplicate(primary: Case, dup: Case, by: string, now: number): { primary: Case; dup: Case } {
  return {
    dup: { ...dup, status: 'duplicate', duplicateOf: primary.id, timeline: [...dup.timeline, { at: now, by, kind: 'merged', to: primary.ref, text: `Merged into ${primary.ref}. You'll get updates from that case.` }] },
    primary: { ...primary, timeline: [...primary.timeline, { at: now, by, kind: 'merged', from: dup.ref, text: `Another report merged in (${dup.ref})`, internal: true }] },
  };
}

// ── Matching ─────────────────────────────────────────────────────────────────

export function normAddress(a?: string): string {
  return (a || '').toLowerCase()
    .replace(/\b(street|st)\b\.?/g, 'st').replace(/\b(avenue|ave)\b\.?/g, 'ave').replace(/\b(boulevard|blvd)\b\.?/g, 'blvd')
    .replace(/\b(road|rd)\b\.?/g, 'rd').replace(/\b(drive|dr)\b\.?/g, 'dr').replace(/\b(east|e)\b\.?/g, 'e').replace(/\b(west|w)\b\.?/g, 'w')
    .replace(/\b(north|n)\b\.?/g, 'n').replace(/\b(south|s)\b\.?/g, 's')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Existing constituents that look like the same person or organization. */
export function findMatches(cands: Constituent[], probe: Partial<Constituent>): { c: Constituent; why: string }[] {
  const email = normEmail(probe.email), phone = phoneDigits(probe.phone);
  const name = (probe.name || '').trim().toLowerCase(), addr = normAddress(probe.address?.line1);
  const out: { c: Constituent; why: string }[] = [];
  for (const c of cands) {
    if (email && normEmail(c.email) === email) { out.push({ c, why: 'Same email' }); continue; }
    if (phone && phone.length >= 10 && phoneDigits(c.phone) === phone) { out.push({ c, why: 'Same phone' }); continue; }
    if (name && addr && c.name.trim().toLowerCase() === name && normAddress(c.address?.line1) === addr) out.push({ c, why: 'Same name and address' });
  }
  return out;
}

function distanceM(a: Address, b: Address): number | null {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return null;
  const R = 6_371_000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Open cases of the same service type at the same place (same parcel, same normalized address, or
 * within `radiusM`) filed in the last `withinDays`: likely duplicates to offer staff for merging.
 */
export function likelyDuplicates(all: Case[], probe: Case, radiusM = 60, withinDays = 14): Case[] {
  if (!probe.location) return [];
  return all.filter((c) => {
    if (c.id === probe.id || c.serviceTypeId !== probe.serviceTypeId || !isOpen(c) || !c.location) return false;
    if (Math.abs(c.createdAt - probe.createdAt) > withinDays * DAY_MS) return false;
    if (probe.location!.parcelId && c.location.parcelId === probe.location!.parcelId) return true;
    if (normAddress(c.location.line1) === normAddress(probe.location!.line1)) return true;
    const d = distanceM(c.location, probe.location!);
    return d != null && d <= radiusM;
  });
}

// ── Queues and metrics ───────────────────────────────────────────────────────

export interface QueueFilter { departmentId?: string; status?: 'open' | CaseStatus | 'all'; assignee?: string; sla?: SlaState; q?: string; serviceTypeId?: string }

export function queue(cases: Case[], f: QueueFilter, now: number): Case[] {
  const q = (f.q || '').trim().toLowerCase();
  return cases
    .filter((c) => (f.departmentId ? c.departmentId === f.departmentId : true))
    .filter((c) => (!f.status || f.status === 'all' ? true : f.status === 'open' ? isOpen(c) : c.status === f.status))
    .filter((c) => (f.assignee ? c.assignee === f.assignee : true))
    .filter((c) => (f.serviceTypeId ? c.serviceTypeId === f.serviceTypeId : true))
    .filter((c) => (f.sla ? slaState(c, now) === f.sla : true))
    .filter((c) => (q ? (c.ref + ' ' + c.title + ' ' + c.description + ' ' + (c.location?.line1 ?? '')).toLowerCase().includes(q) : true))
    .sort((a, b) => {
      // overdue first, then priority, then soonest due
      const oa = slaState(a, now) === 'overdue' ? 0 : 1, ob = slaState(b, now) === 'overdue' ? 0 : 1;
      return oa - ob || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.dueAt - b.dueAt;
    });
}

export interface DeskMetrics {
  open: number;
  overdue: number;
  dueSoon: number;
  newToday: number;
  resolved30: number;
  /** Share of cases resolved in the last 30 days that met their target. */
  onTimeRate: number | null;
  /** Median hours to first public reply, over cases created in the last 30 days that have one. */
  medianFirstResponseH: number | null;
  byDepartment: { departmentId: string; open: number; overdue: number }[];
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function metrics(cases: Case[], now: number): DeskMetrics {
  const startOfDay = now - (now % DAY_MS);
  const open = cases.filter(isOpen);
  const resolved30 = cases.filter((c) => c.resolvedAt && now - c.resolvedAt <= 30 * DAY_MS);
  const recent = cases.filter((c) => now - c.createdAt <= 30 * DAY_MS && c.firstResponseAt);
  const depts = new Map<string, { open: number; overdue: number }>();
  for (const c of open) {
    const d = depts.get(c.departmentId) ?? { open: 0, overdue: 0 };
    d.open++; if (slaState(c, now) === 'overdue') d.overdue++;
    depts.set(c.departmentId, d);
  }
  return {
    open: open.length,
    overdue: open.filter((c) => slaState(c, now) === 'overdue').length,
    dueSoon: open.filter((c) => slaState(c, now) === 'due_soon').length,
    newToday: cases.filter((c) => c.createdAt >= startOfDay).length,
    resolved30: resolved30.length,
    onTimeRate: resolved30.length ? resolved30.filter((c) => (c.resolvedAt as number) <= c.dueAt).length / resolved30.length : null,
    medianFirstResponseH: median(recent.map((c) => ((c.firstResponseAt as number) - c.createdAt) / HOUR_MS)),
    byDepartment: [...depts.entries()].map(([departmentId, v]) => ({ departmentId, ...v })).sort((a, b) => b.open - a.open),
  };
}

// ── Constituent 360 ──────────────────────────────────────────────────────────

export function constituentSummary(c: Constituent, cases: Case[], now: number) {
  const mine = cases.filter((x) => x.constituentId === c.id || x.onBehalfOf === c.id);
  const open = mine.filter(isOpen);
  const last = mine.reduce((m, x) => Math.max(m, x.timeline[x.timeline.length - 1]?.at ?? x.createdAt), 0);
  return {
    total: mine.length,
    open: open.length,
    overdue: open.filter((x) => slaState(x, now) === 'overdue').length,
    lastContactAt: last || null,
    cases: [...mine].sort((a, b) => b.createdAt - a.createdAt),
  };
}

// ── Public view & records ────────────────────────────────────────────────────

/** What a case looks like on the public map/status page: no names, contacts or exact address. */
export function redactCase(c: Case, typeName: string) {
  const block = c.location?.line1 ? c.location.line1.replace(/^\s*(\d+)/, (_m, n: string) => `${Math.floor(Number(n) / 100) * 100} block of`) : undefined;
  return {
    ref: c.ref,
    type: typeName,
    status: STATUS_LABEL[c.status],
    area: block,
    ward: c.location?.ward,
    openedOn: new Date(c.createdAt).toISOString().slice(0, 10),
    resolvedOn: c.resolvedAt ? new Date(c.resolvedAt).toISOString().slice(0, 10) : undefined,
    updates: c.timeline.filter((t) => !t.internal && (t.kind === 'reply' || t.kind === 'status')).map((t) => ({ at: new Date(t.at).toISOString().slice(0, 10), text: t.kind === 'status' ? `Status: ${STATUS_LABEL[t.to as CaseStatus] ?? t.to}` : 'Staff replied' })),
  };
}

/** What the resident sees on their own case: everything except internal entries. */
export function residentView(c: Case): Case {
  return { ...c, assignee: undefined, timeline: c.timeline.filter((t) => !t.internal) };
}

// ── Replies ──────────────────────────────────────────────────────────────────

export interface ReplyTemplate { id: string; name: string; body: string; serviceTypeIds?: string[] }

/** Fill {{first_name}}, {{ref}}, {{service}}, {{address}}, {{department}}, {{due_date}} in a template. */
export function fillTemplate(body: string, ctx: { constituent?: Constituent; c: Case; service: ServiceType; department?: Department }): string {
  const first = ctx.constituent?.kind === 'person' ? ctx.constituent.name.split(/\s+/)[0] : ctx.constituent?.name;
  const vals: Record<string, string> = {
    first_name: first || 'there',
    ref: ctx.c.ref,
    service: ctx.service.name,
    address: ctx.c.location?.line1 || 'the location you gave',
    department: ctx.department?.publicName || ctx.department?.name || 'the department',
    due_date: new Date(ctx.c.dueAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
  };
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => vals[k] ?? m);
}
