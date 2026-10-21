/**
 * hostEventsService — events run by an organization or a business, from both event systems:
 *   ticketed  plajahEvents  GET /api/events/host/:kind/:id   (server.ts)
 *   RSVP      evites        GET /api/evite/host/:kind/:id    (services/evite/eviteServer.ts)
 * Both routes are public (published / live only) and add drafts, cancelled and counts when the caller manages the host.
 *
 * Also the pure planner `buildEventPlan`: an ops-preset EventPlaybook (services/opsPresets) laid onto a real date.
 * No Firebase import at module scope, so the planner is unit-testable (tests/hostEvents.test.ts).
 */
import type { EventPlaybook, PromoChannel } from './opsPresets/types';

export type HostKind = 'org' | 'business';
export interface HostRef { kind: HostKind; id: string; name?: string }

/** Where an item opens. Ticketed events go to the in-app event page; evites to their guest page (/i/:id). */
export type HostEventTarget =
  | { kind: 'event'; eventId: string }
  | { kind: 'evite'; inviteId: string; path: string };

/** Lifecycle bucket for lists: live/upcoming, draft, past (incl. completed), cancelled. */
export type HostEventPhase = 'upcoming' | 'draft' | 'past' | 'cancelled';

export interface HostEventItem {
  id: string;
  source: 'ticketed' | 'evite';
  title: string;
  startAt: number;
  endAt?: number;
  place?: string;
  coverUrl?: string;
  /** Raw status from its system: ticketed DRAFT|PUBLISHED|ON_SALE|SOLD_OUT|CANCELLED|COMPLETED, evite draft|live|closed|cancelled. */
  status: string;
  statusLabel: string;
  phase: HostEventPhase;
  ticketed: boolean;
  /** Lowest visible ticket price, in cents (ticketed only). */
  priceFrom?: number;
  sold?: number;
  capacity?: number;
  /** RSVP counts (evites, host team only). */
  rsvp?: { yes: number; maybe: number; no: number; waitlist: number; headcount: number; spotsLeft: number | null };
  playbookKey?: string;
  photoPoolId?: string;
  /** For evites linked to a ticketed event. */
  linkedEventId?: string;
  target: HostEventTarget;
  /** Opens the item (dispatches the app's navigation, or opens the guest page). */
  open: () => void;
}

export interface HostEventsResult { items: HostEventItem[]; canManage: boolean }

// ── Navigation (App.tsx listens for NAVIGATE {target, params}) ────────────────

export function navigateApp(target: string, params?: Record<string, any>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('NAVIGATE', { detail: { target, params } }));
}

export function openHostEventTarget(t: HostEventTarget) {
  if (typeof window === 'undefined') return;
  if (t.kind === 'event') navigateApp('EVENT_DETAIL', { eventId: t.eventId });
  // The evite guest page is its own light entry (index.tsx), so it opens as a page, not an in-app view.
  else window.open(t.path, '_blank', 'noopener');
}

// ── Fetch ────────────────────────────────────────────────────────────────────

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const { auth } = await import('./firebase');
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

const TICKET_LABEL: Record<string, string> = {
  DRAFT: 'Draft', PUBLISHED: 'Published', ON_SALE: 'On sale', SOLD_OUT: 'Sold out', CANCELLED: 'Cancelled', COMPLETED: 'Completed',
};
const EVITE_LABEL: Record<string, string> = { draft: 'Draft', live: 'RSVP open', closed: 'RSVP closed', cancelled: 'Cancelled' };

export function phaseFor(source: 'ticketed' | 'evite', status: string, startAt: number, endAt: number | undefined, now = Date.now()): HostEventPhase {
  const s = String(status || '').toUpperCase();
  if (s === 'CANCELLED') return 'cancelled';
  if (s === 'DRAFT') return 'draft';
  if (s === 'COMPLETED') return 'past';
  return (endAt || startAt) < now ? 'past' : 'upcoming';
}

const joinPlace = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(', ') || undefined;

export function ticketedToItem(e: any, now = Date.now()): HostEventItem {
  const target: HostEventTarget = { kind: 'event', eventId: String(e.id) };
  const startAt = Number(e.startDate) || 0;
  const endAt = Number(e.endDate) || undefined;
  return {
    id: String(e.id), source: 'ticketed', title: e.title || 'Untitled event', startAt, endAt,
    place: joinPlace(e.venueName, e.city), coverUrl: e.coverImage || undefined,
    status: e.status || 'DRAFT', statusLabel: TICKET_LABEL[e.status] || e.status || 'Draft',
    phase: phaseFor('ticketed', e.status, startAt, endAt, now), ticketed: true,
    priceFrom: typeof e.priceFromCents === 'number' ? e.priceFromCents : undefined,
    sold: Number(e.totalSold) || 0, capacity: Number(e.totalCapacity) || undefined,
    playbookKey: e.playbookKey || undefined, photoPoolId: e.photoPoolId || undefined,
    target, open: () => openHostEventTarget(target),
  };
}

export function eviteToItem(v: any, now = Date.now()): HostEventItem {
  const target: HostEventTarget = { kind: 'evite', inviteId: String(v.id), path: v.rsvpPath || `/i/${v.id}` };
  const startAt = Number(v.startsAt) || 0;
  const endAt = Number(v.endsAt) || undefined;
  return {
    id: String(v.id), source: 'evite', title: v.title || 'Invitation', startAt, endAt,
    place: joinPlace(v.venueName, v.address), coverUrl: v.coverUrl || undefined,
    status: v.status || 'live', statusLabel: EVITE_LABEL[v.status] || v.status || 'RSVP',
    phase: phaseFor('evite', v.status, startAt, endAt, now), ticketed: false,
    capacity: Number(v.capacity) || undefined, rsvp: v.counts || undefined,
    photoPoolId: v.photoPoolId || undefined, linkedEventId: v.eventId || undefined,
    target, open: () => openHostEventTarget(target),
  };
}

export interface HostFetchOptions { /** Public view only (no drafts / unlisted), even for the host's team. Sends no token. */ publicOnly?: boolean }

async function getJson(url: string, opts: HostFetchOptions = {}): Promise<any> {
  const res = await fetch(opts.publicOnly ? `${url}?public=1` : url, { headers: opts.publicOnly ? {} : await authHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Request failed (${res.status})`);
  return res.json();
}

export async function fetchHostEvents(kind: HostKind, id: string, opts: HostFetchOptions = {}): Promise<HostEventsResult> {
  const d = await getJson(`/api/events/host/${kind}/${encodeURIComponent(id)}`, opts);
  return { items: (d.events || []).map((e: any) => ticketedToItem(e)), canManage: !!d.canManage };
}

export async function fetchHostEvites(kind: HostKind, id: string, opts: HostFetchOptions = {}): Promise<HostEventsResult> {
  const d = await getJson(`/api/evite/host/${kind}/${encodeURIComponent(id)}`, opts);
  return { items: (d.items || []).map((v: any) => eviteToItem(v)), canManage: !!d.canManage };
}

/** Upcoming soonest-first, then everything else most-recent-first. */
export function sortHostItems(items: HostEventItem[]): HostEventItem[] {
  const up = items.filter(i => i.phase === 'upcoming').sort((a, b) => a.startAt - b.startAt);
  const rest = items.filter(i => i.phase !== 'upcoming').sort((a, b) => b.startAt - a.startAt);
  return [...up, ...rest];
}

/** Ticketed + RSVP merged. One side failing does not hide the other; both failing throws. */
export async function fetchHostEventItems(kind: HostKind, id: string, opts: HostFetchOptions = {}): Promise<HostEventsResult> {
  const [t, e] = await Promise.allSettled([fetchHostEvents(kind, id, opts), fetchHostEvites(kind, id, opts)]);
  if (t.status === 'rejected' && e.status === 'rejected') throw t.reason;
  const ok = [t, e].filter((r): r is PromiseFulfilledResult<HostEventsResult> => r.status === 'fulfilled').map(r => r.value);
  return { items: sortHostItems(ok.flatMap(r => r.items)), canManage: ok.some(r => r.canManage) };
}

// ── Planner (pure) ───────────────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  kind: 'task' | 'promo';
  /** Days before the event (negative = after it). */
  daysBefore: number;
  /** Absolute due time (ms): the event's clock time on that calendar day. */
  dueAt: number;
  title: string;
  owner?: string;
  channel?: PromoChannel;
}

export interface RunOfShowStep { id: string; t: string; what: string; owner: string; at: number }

export interface EventPlan {
  eventDate: number;
  /** Tasks and promo beats merged, by due time (tasks before promo on the same instant). */
  steps: PlanStep[];
  tasks: PlanStep[];
  promo: PlanStep[];
  runOfShow: RunOfShowStep[];
}

/** Same local clock time, `days` calendar days earlier (DST-safe: not a fixed 24 h multiple). */
export function shiftDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() - days);
  return d.getTime();
}

/** "HH:MM" on the event's calendar day (local). Unparseable times fall back to the event start. */
export function clockOnDay(eventDate: number, hhmm: string): number {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(hhmm || '');
  if (!m) return eventDate;
  const d = new Date(eventDate);
  d.setHours(Math.min(23, Number(m[1])), Math.min(59, Number(m[2])), 0, 0);
  return d.getTime();
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);

export function buildEventPlan(playbook: EventPlaybook, eventDate: number): EventPlan {
  const seen = new Set<string>();
  const uniq = (base: string) => { let id = base, n = 2; while (seen.has(id)) id = `${base}-${n++}`; seen.add(id); return id; };
  const tasks: PlanStep[] = (playbook.checklist || []).map(c => ({
    id: uniq(`task:${c.daysBefore}:${slug(c.task)}`), kind: 'task' as const, daysBefore: c.daysBefore,
    dueAt: shiftDays(eventDate, c.daysBefore), title: c.task, owner: c.owner,
  }));
  const promo: PlanStep[] = (playbook.promo || []).map(p => ({
    id: uniq(`promo:${p.daysBefore}:${p.channel}:${slug(p.copy)}`), kind: 'promo' as const, daysBefore: p.daysBefore,
    dueAt: shiftDays(eventDate, p.daysBefore), title: p.copy, channel: p.channel,
  }));
  const byDue = (a: PlanStep, b: PlanStep) => a.dueAt - b.dueAt || (a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1);
  tasks.sort(byDue); promo.sort(byDue);
  const runOfShow = (playbook.runOfShow || []).map((r, i) => ({ id: `ros:${i}`, t: r.t, what: r.what, owner: r.owner, at: clockOnDay(eventDate, r.t) }))
    .sort((a, b) => a.at - b.at);
  return { eventDate, steps: [...tasks, ...promo].sort(byDue), tasks, promo, runOfShow };
}

/** Where a step stands right now. */
export function stepUrgency(step: Pick<PlanStep, 'dueAt'>, done: boolean, now = Date.now()): 'done' | 'overdue' | 'this_week' | 'later' {
  if (done) return 'done';
  if (step.dueAt < now) return 'overdue';
  return step.dueAt - now <= 7 * 864e5 ? 'this_week' : 'later';
}

/** Ticket tiers for EventCreationWizard from a playbook (dollars → cents). Free playbooks get one free tier. */
export function playbookTierDrafts(playbook: EventPlaybook): Array<{ name: string; priceCents: number; quantity: number; perks?: string }> {
  const fallbackQty = playbook.capacity || 100;
  if (!playbook.tiers?.length) return [{ name: 'Free admission', priceCents: 0, quantity: fallbackQty }];
  return playbook.tiers.map(t => ({ name: t.name, priceCents: Math.max(0, Math.round((Number(t.price) || 0) * 100)), quantity: t.qty || fallbackQty, perks: t.perks }));
}
