// laundryCore - PURE laundromat (wash-and-fold) rules that ride on the generic ticket engine:
// bag tags + rack tracking, business-hours due times with a rush flag, unclaimed-order reminders,
// pickup/delivery stops + printable route list, and the customer status-page extras.
// Everything is stored in the ticket's `subject` field bag (declared in LAUNDRY_TICKET.subjectFields), so no
// shared ticket server code changes are needed. No Firebase / DOM / node imports. Tests: npm run test:laundry.

import type { Ticket, TicketConfig, PublicExtras } from './ticketCore';
import { stageById, stageKind } from './ticketCore';

const S = (v: any): string => (v === undefined || v === null ? '' : Array.isArray(v) ? v.join(',') : String(v));
const arr = (v: any): string[] => (Array.isArray(v) ? v.map(String) : S(v).split(/[,\s]+/).filter(Boolean));
export const escapeHtml = (s: any): string => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

// ── Bag tags ──────────────────────────────────────────────────────────────────────────────────────
/** Tag code = `<ticket number>-<n>`, e.g. WF-217-2. Human readable, scans as Code 128 or QR, wedge-scanner friendly. */
export const tagCode = (ticketNumber: string, n: number): string => `${ticketNumber}-${n}`;
export const makeTagCodes = (ticketNumber: string, count: number): string[] =>
  Array.from({ length: Math.max(0, Math.min(40, Math.floor(count) || 0)) }, (_, i) => tagCode(ticketNumber, i + 1));
export function parseTagCode(input: string): { ticketNumber: string; n: number; code: string } | null {
  const s = String(input ?? '').trim().toUpperCase().replace(/\s+/g, '');
  const m = /^([A-Z]{1,4}-\d{1,9})-(\d{1,2})$/.exec(s);
  return m ? { ticketNumber: m[1], n: Number(m[2]), code: s } : null;
}
/** Accept a tag code OR a bare ticket number (WF-217) OR digits only (217, using the ticket prefix). */
export function parseScan(input: string, prefix = 'WF'): { ticketNumber: string; n?: number } | null {
  const tag = parseTagCode(input); if (tag) return { ticketNumber: tag.ticketNumber, n: tag.n };
  const s = String(input ?? '').trim().toUpperCase();
  if (/^[A-Z]{1,4}-\d{1,9}$/.test(s)) return { ticketNumber: s };
  if (/^\d{1,9}$/.test(s)) return { ticketNumber: `${prefix}-${Number(s)}` };
  return null;
}

export type TagState = 'IN_STORE' | 'PICKED_UP' | 'MISSING';
export interface TagRow { code: string; n: number; state: TagState }
/** Per-bag state from the ticket subject (tags / picked_tags / missing_tags). */
export function tagRows(subject: Ticket['subject']): TagRow[] {
  const picked = new Set(arr(subject.picked_tags)), missing = new Set(arr(subject.missing_tags));
  return arr(subject.tags).map((code, i) => ({ code, n: i + 1, state: picked.has(code) ? 'PICKED_UP' : missing.has(code) ? 'MISSING' : 'IN_STORE' }));
}
const uniq = (a: string[]) => [...new Set(a)];
/** Mark bags picked up (partial pickup). Unknown codes are ignored and reported. */
export function pickUpTags(subject: Ticket['subject'], codes: string[]): { subject: Ticket['subject']; picked: string[]; unknown: string[]; allPicked: boolean } {
  const known = new Set(arr(subject.tags)); const picked = codes.map(c => c.toUpperCase()).filter(c => known.has(c)); const unknown = codes.map(c => c.toUpperCase()).filter(c => !known.has(c));
  const nextPicked = uniq([...arr(subject.picked_tags), ...picked]);
  const nextMissing = arr(subject.missing_tags).filter(c => !nextPicked.includes(c));
  const out: Ticket['subject'] = { ...subject }; if (nextPicked.length) out.picked_tags = nextPicked; else delete out.picked_tags;
  if (nextMissing.length) out.missing_tags = nextMissing; else delete out.missing_tags;
  return { subject: out, picked, unknown, allPicked: known.size > 0 && [...known].every(c => nextPicked.includes(c)) };
}
export function setBagMissing(subject: Ticket['subject'], code: string, missing: boolean): Ticket['subject'] {
  const c = code.toUpperCase(); if (!arr(subject.tags).includes(c)) return subject;
  const cur = arr(subject.missing_tags).filter(x => x !== c); const next = missing ? [...cur, c] : cur;
  const out = { ...subject }; if (next.length) out.missing_tags = next; else delete out.missing_tags; return out;
}
export const bagsOutstanding = (subject: Ticket['subject']): number => tagRows(subject).filter(r => r.state !== 'PICKED_UP').length;

/** "Where is it": rack/shelf plus bag states. */
export function whereIs(t: Ticket, cfg: TicketConfig): { number: string; customer: string; stage: string; rack: string; bags: TagRow[]; summary: string } {
  const rack = S(t.subject.rack); const rows = tagRows(t.subject); const st = stageById(cfg, t.stage)?.label || t.stage;
  const miss = rows.filter(r => r.state === 'MISSING').length, out = rows.filter(r => r.state === 'PICKED_UP').length;
  const summary = [`${t.number} for ${t.customer.name}: ${st}`, rack ? `rack ${rack}` : 'no rack assigned', rows.length ? `${rows.length - out - miss} of ${rows.length} bags in store` : '', miss ? `${miss} bag(s) reported missing` : ''].filter(Boolean).join(' · ');
  return { number: t.number, customer: t.customer.name, stage: st, rack, bags: rows, summary };
}
export const cleanRack = (s: string): string => String(s ?? '').toUpperCase().replace(/[^A-Z0-9\- ]/g, '').trim().slice(0, 12);
/** First free rack slot like R1..R40 not used by an active ticket (suggestion only). */
export function suggestRack(active: Pick<Ticket, 'subject'>[], o: { prefix?: string; slots?: number } = {}): string {
  const used = new Set(active.map(t => S(t.subject.rack).toUpperCase()).filter(Boolean)); const p = o.prefix ?? 'R';
  for (let i = 1; i <= (o.slots ?? 60); i++) if (!used.has(`${p}${i}`)) return `${p}${i}`;
  return '';
}

export interface TagLabel { code: string; n: number; of: number; number: string; customer: string; dueText: string; rack: string; rush: boolean; care: string }
export function tagLabels(t: Pick<Ticket, 'number' | 'customer' | 'subject'>, codes: string[], dueText = ''): TagLabel[] {
  return codes.map((code, i) => ({ code, n: i + 1, of: codes.length, number: t.number, customer: t.customer.name.slice(0, 24), dueText, rack: S(t.subject.rack), rush: S(t.subject.rush) === 'Rush', care: S(t.subject.care).slice(0, 40) }));
}

// ── Business hours + due times ────────────────────────────────────────────────────────────────────
export interface DayHoursLite { open: string; close: string; closed?: boolean }
export type WeekHours = Record<string, DayHoursLite>;
const DAYNAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const hm = (s: string): number => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Math.min(24, +m[1]) * 60 + Math.min(59, +m[2]) : 0; };
const MIN = 60_000, DAY = 86_400_000;
/** Minutes-since-epoch helpers run in the business's LOCAL clock: shift by tzOffsetMin (minutes east of UTC) and use UTC getters. */
const local = (ms: number, tz: number) => ms + tz * MIN;
const startOfLocalDay = (ms: number, tz: number) => Math.floor(local(ms, tz) / DAY) * DAY - tz * MIN;

function dayWindow(hours: WeekHours, dayStartMs: number, tz: number): [number, number] | null {
  const dow = new Date(local(dayStartMs, tz)).getUTCDay();
  const h = hours[DAYNAMES[dow]]; if (!h || h.closed) return null;
  const o = hm(h.open), c = hm(h.close); if (c <= o) return null;
  return [dayStartMs + o * MIN, dayStartMs + c * MIN];
}
export const isOpenAt = (ms: number, hours: WeekHours, tz = 0): boolean => { const w = dayWindow(hours, startOfLocalDay(ms, tz), tz); return !!w && ms >= w[0] && ms < w[1]; };
/** Next moment the shop is open at or after `ms` (ms itself if open now). null if never open in 14 days. */
export function nextOpenAt(ms: number, hours: WeekHours, tz = 0): number | null {
  const d0 = startOfLocalDay(ms, tz);
  for (let i = 0; i < 14; i++) { const w = dayWindow(hours, d0 + i * DAY, tz); if (!w) continue; if (ms < w[0]) return w[0]; if (ms < w[1]) return ms; }
  return null;
}
/** Add `minutes` of OPEN time to `startMs`. Falls back to elapsed time if the shop has no hours. */
export function addBusinessMinutes(startMs: number, minutes: number, hours: WeekHours, tz = 0): number {
  let left = Math.max(0, Math.round(minutes)); let cur = nextOpenAt(startMs, hours, tz);
  if (cur === null) return startMs + left * MIN;
  for (let guard = 0; guard < 400; guard++) {
    const w = dayWindow(hours, startOfLocalDay(cur, tz), tz); if (!w) { cur = nextOpenAt(startOfLocalDay(cur, tz) + DAY, hours, tz); if (cur === null) break; continue; }
    const avail = Math.max(0, Math.floor((w[1] - cur) / MIN));
    if (left <= avail) return cur + left * MIN;
    left -= avail; cur = nextOpenAt(w[1], hours, tz); if (cur === null) break;
  }
  return startMs + minutes * MIN;
}

export interface TurnaroundRules {
  /** Open-hours of work for a standard order (default 24) and a rush order (default 6). */
  standardHours: number; rushHours: number;
  /** Rush needs drop-off before this local time (HH:MM). Later drop-offs are not eligible for same-day. */
  rushCutoff?: string;
  /** Extra open-hours for bulky items (comforters etc). */
  bulkyExtraHours?: number;
}
export const DEFAULT_TURNAROUND: TurnaroundRules = { standardHours: 24, rushHours: 6, rushCutoff: '10:00', bulkyExtraHours: 0 };

export function rushEligible(receivedAt: number, rules: TurnaroundRules, hours: WeekHours, tz = 0): { ok: boolean; reason?: string } {
  if (nextOpenAt(receivedAt, hours, tz) === null) return { ok: false, reason: 'No opening hours are set, so rush cannot be promised.' };
  if (rules.rushCutoff) {
    const l = new Date(local(receivedAt, tz)); const mins = l.getUTCHours() * 60 + l.getUTCMinutes();
    if (mins > hm(rules.rushCutoff)) return { ok: false, reason: `Rush needs drop-off by ${rules.rushCutoff}. This will run on the standard schedule.` };
  }
  return { ok: true };
}
/** Ready-by time. Rush that misses the cutoff silently uses the standard schedule (the caller can show `rush.reason`). */
export function computeDueAt(a: { receivedAt: number; rush?: boolean; bulky?: boolean; rules?: TurnaroundRules; hours: WeekHours; tzOffsetMin?: number }): { dueAt: number; rushApplied: boolean; rushReason?: string } {
  const r = a.rules || DEFAULT_TURNAROUND; const tz = a.tzOffsetMin ?? 0;
  const el = a.rush ? rushEligible(a.receivedAt, r, a.hours, tz) : { ok: false };
  const rushApplied = !!a.rush && el.ok;
  const h = (rushApplied ? r.rushHours : r.standardHours) + (a.bulky ? r.bulkyExtraHours || 0 : 0);
  return { dueAt: addBusinessMinutes(a.receivedAt, h * 60, a.hours, tz), rushApplied, ...(a.rush && !el.ok && (el as any).reason ? { rushReason: (el as any).reason } : {}) };
}
export const isOverdue = (dueAt: number | undefined, now: number): boolean => !!dueAt && now > dueAt;
export const dueAtOf = (t: Pick<Ticket, 'subject'>): number | undefined => { const n = Date.parse(S(t.subject.due_at)); return Number.isFinite(n) ? n : undefined; };

// ── Unclaimed reminders ───────────────────────────────────────────────────────────────────────────
/** When did this ticket become READY? Last transition into a READY-kind stage, else undefined. */
export function readyAtOf(t: Ticket, cfg: TicketConfig): number | undefined {
  for (let i = t.audit.length - 1; i >= 0; i--) { const e = t.audit[i]; if ((e.type === 'TRANSITION' || e.type === 'OVERRIDE') && e.to && stageKind(cfg, e.to) === 'READY') return e.at; }
  return undefined;
}
export interface UnclaimedRules { remindDays: number[]; disposalDays: number; warnDaysBefore: number }
export const DEFAULT_UNCLAIMED: UnclaimedRules = { remindDays: [3, 7], disposalDays: 30, warnDaysBefore: 5 };
export type ReminderKind = 'REMINDER' | 'DISPOSAL_WARNING' | 'DISPOSAL_ELIGIBLE';
export interface ReminderAction { ticketId: string; number: string; kind: ReminderKind; day: number; daysReady: number; text: string }

/**
 * Which reminders are due now? `sent` maps ticketId -> day thresholds already sent. Only the LATEST due, unsent
 * threshold is returned per ticket (no catch-up spam); the caller records `day` (and all earlier days) as sent.
 * DISPOSAL_ELIGIBLE is information for the owner only: nothing in the platform discards a customer's items.
 */
export function unclaimedActions(tickets: Ticket[], cfg: TicketConfig, now: number, sent: Record<string, number[]> = {}, rules: UnclaimedRules = DEFAULT_UNCLAIMED): ReminderAction[] {
  const out: ReminderAction[] = [];
  const warnDay = Math.max(1, rules.disposalDays - rules.warnDaysBefore);
  for (const t of tickets) {
    if (stageKind(cfg, t.stage) !== 'READY' || t.saleOrderId) continue;
    const ra = readyAtOf(t, cfg); if (!ra) continue;
    const days = Math.floor((now - ra) / DAY); if (days < 1) continue;
    const done = new Set(sent[t.id] || []);
    const steps = [...rules.remindDays.map(d => ({ day: d, kind: 'REMINDER' as ReminderKind })), { day: warnDay, kind: 'DISPOSAL_WARNING' as ReminderKind }, { day: rules.disposalDays, kind: 'DISPOSAL_ELIGIBLE' as ReminderKind }]
      .filter(s => s.day <= days && !done.has(s.day)).sort((a, b) => a.day - b.day);
    const last = steps[steps.length - 1]; if (!last) continue;
    const text = last.kind === 'REMINDER' ? `${t.number} has been ready for ${days} day${days === 1 ? '' : 's'}. Please pick it up when you can.`
      : last.kind === 'DISPOSAL_WARNING' ? `${t.number} is still waiting. Items not collected within ${rules.disposalDays} days may be donated, so please pick it up soon.`
      : `${t.number} has passed ${rules.disposalDays} days uncollected (owner review).`;
    out.push({ ticketId: t.id, number: t.number, kind: last.kind, day: last.day, daysReady: days, text });
  }
  return out;
}
/** All thresholds a returned action covers (so earlier days are not sent later). */
export const coveredDays = (a: ReminderAction, rules: UnclaimedRules = DEFAULT_UNCLAIMED): number[] =>
  [...rules.remindDays, Math.max(1, rules.disposalDays - rules.warnDaysBefore), rules.disposalDays].filter(d => d <= a.day);

// ── Pickup & delivery (light v1: no maps, no routing optimisation) ────────────────────────────────
export type Service = 'In-store' | 'Pickup' | 'Delivery' | 'Pickup & delivery';
export const SERVICES: Service[] = ['In-store', 'Pickup', 'Delivery', 'Pickup & delivery'];
export interface DeliveryRules { flatFeeCents: number; freeOverCents?: number; pickupFeeCents?: number; bothLegsDiscountCents?: number }
export const DEFAULT_DELIVERY: DeliveryRules = { flatFeeCents: 500, freeOverCents: 6000, pickupFeeCents: 0 };
/** Fee for the legs on a ticket given the pre-delivery subtotal. */
export function deliveryFeeCents(service: Service, subtotalCents: number, r: DeliveryRules = DEFAULT_DELIVERY): number {
  const legs = service === 'Pickup & delivery' ? 2 : service === 'In-store' ? 0 : 1;
  if (!legs) return 0;
  if (r.freeOverCents && subtotalCents >= r.freeOverCents) return 0;
  const del = service === 'Pickup' ? 0 : r.flatFeeCents, pu = service === 'Delivery' ? 0 : (r.pickupFeeCents ?? r.flatFeeCents);
  return Math.max(0, del + pu - (legs === 2 ? r.bothLegsDiscountCents || 0 : 0));
}
export interface RouteStop { ticketId: string; number: string; kind: 'PICKUP' | 'DELIVERY'; customer: string; phone: string; address: string; addressNote: string; date: string; start: string; end: string; driverId: string; driverName: string; bags: string; balanceNote: string }
/** Stops for `date` (YYYY-MM-DD), sorted by window start then ticket number. Optionally one driver. */
export function routeStops(tickets: Ticket[], date: string, o: { driverId?: string; balanceCents?: (t: Ticket) => number } = {}): RouteStop[] {
  const stops: RouteStop[] = [];
  for (const t of tickets) {
    const svc = S(t.subject.svc) as Service; if (!svc || svc === 'In-store') continue;
    const base = { ticketId: t.id, number: t.number, customer: t.customer.name, phone: t.customer.phone || '', address: S(t.subject.addr), addressNote: S(t.subject.addr_note), driverId: t.assignedTo?.id || '', driverName: t.assignedTo?.name || '' };
    if (o.driverId && base.driverId !== o.driverId) continue;
    const bags = `${S(t.subject.bags) || '?'} bag(s)`;
    if ((svc === 'Pickup' || svc === 'Pickup & delivery') && S(t.subject.pu_date) === date) stops.push({ ...base, kind: 'PICKUP', date, start: S(t.subject.pu_start), end: S(t.subject.pu_end), bags, balanceNote: '' });
    if ((svc === 'Delivery' || svc === 'Pickup & delivery') && S(t.subject.dl_date) === date) {
      const bal = o.balanceCents ? o.balanceCents(t) : 0;
      stops.push({ ...base, kind: 'DELIVERY', date, start: S(t.subject.dl_start), end: S(t.subject.dl_end), bags, balanceNote: bal > 0 ? `Collect $${(bal / 100).toFixed(2)}` : '' });
    }
  }
  return stops.sort((a, b) => (a.start || '99').localeCompare(b.start || '99') || a.number.localeCompare(b.number, undefined, { numeric: true }));
}
/** Printable day sheet (self-contained HTML, no maps). Group by driver when more than one is present. */
export function routeListHtml(stops: RouteStop[], o: { title?: string; date: string; businessName?: string }): string {
  const groups = new Map<string, RouteStop[]>(); for (const s of stops) groups.set(s.driverName || 'Unassigned', [...(groups.get(s.driverName || 'Unassigned') || []), s]);
  const body = [...groups.entries()].map(([d, rows]) => `<h2>${escapeHtml(d)} (${rows.length})</h2><table><tr><th>Window</th><th>Type</th><th>Ticket</th><th>Customer</th><th>Address</th><th>Notes</th><th>Done</th></tr>${rows.map(r =>
    `<tr><td>${escapeHtml([r.start, r.end].filter(Boolean).join(' - ') || 'Anytime')}</td><td>${r.kind === 'PICKUP' ? 'Pick up' : 'Deliver'}</td><td>${escapeHtml(r.number)}<br>${escapeHtml(r.bags)}</td><td>${escapeHtml(r.customer)}<br>${escapeHtml(r.phone)}</td><td>${escapeHtml(r.address || 'No address')}</td><td>${escapeHtml([r.addressNote, r.balanceNote].filter(Boolean).join(' · '))}</td><td class="box"></td></tr>`).join('')}</table>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(o.title || 'Route list')}</title><style>body{font:13px system-ui,sans-serif;margin:16px;color:#111}h1{font-size:20px;margin:0}h2{font-size:15px;margin:16px 0 4px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:5px 6px;text-align:left;vertical-align:top}th{background:#eee;font-size:11px;text-transform:uppercase}.box{width:36px}@media print{body{margin:6mm}}</style></head><body><h1>${escapeHtml(o.title || 'Route list')} - ${escapeHtml(o.date)}</h1><div>${escapeHtml(o.businessName || '')} - ${stops.length} stop(s). Sorted by time window; no map routing.</div>${body || '<p>No stops scheduled.</p>'}</body></html>`;
}

// ── Customer status page extras (plugged into toPublicView via cfg.hooks.publicExtras) ────────────
const STAGE_BLURB: Record<string, string> = {
  received: 'We have your laundry and it is in the queue.', washing: 'Your laundry is in the wash.', drying: 'Your laundry is in the dryer.',
  folded: 'Your laundry is being folded.', ready: 'Your laundry is ready. Come pick it up.', picked_up: 'All done. Thank you!',
};
export function laundryPublicExtras(t: Ticket, cfg: TicketConfig): PublicExtras | undefined {
  const flow = cfg.stages.filter(s => s.kind !== 'CANCELLED');
  const idx = flow.findIndex(s => s.id === t.stage);
  if (idx < 0) return { banner: stageById(cfg, t.stage)?.label };
  const dueAt = dueAtOf(t); const kind = stageKind(cfg, t.stage);
  const rows = tagRows(t.subject); const out = rows.filter(r => r.state === 'PICKED_UP').length;
  const facts: { label: string; value: string }[] = [];
  if (S(t.subject.rush) === 'Rush') facts.push({ label: 'Service', value: 'Rush' });
  if (kind === 'READY' && S(t.subject.rack)) facts.push({ label: 'Pickup shelf', value: S(t.subject.rack) });
  if (rows.length && out > 0) facts.push({ label: 'Bags picked up', value: `${out} of ${rows.length}` });
  const svc = S(t.subject.svc);
  if (svc === 'Delivery' || svc === 'Pickup & delivery') { if (S(t.subject.dl_date)) facts.push({ label: 'Delivery', value: [S(t.subject.dl_date), [S(t.subject.dl_start), S(t.subject.dl_end)].filter(Boolean).join(' - ')].filter(Boolean).join(' ') }); }
  return {
    progress: flow.map((s, i) => ({ label: s.label, state: i < idx || kind === 'DONE' ? 'done' as const : i === idx ? 'current' as const : 'todo' as const })),
    ...(dueAt && kind !== 'READY' && kind !== 'DONE' ? { readyByAt: dueAt } : {}),
    ...(STAGE_BLURB[t.stage] ? { banner: STAGE_BLURB[t.stage] } : {}),
    ...(facts.length ? { facts } : {}),
  };
}

/** Bulky detection from ticket lines (comforters, sleeping bags...) for due-time padding. */
export const hasBulkyLines = (t: Pick<Ticket, 'lines'>): boolean => t.lines.some(l => /comforter|duvet|sleeping bag|blanket|rug|pillow/i.test(l.description));
