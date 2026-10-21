/**
 * HostEventsPanel — the ops / staff side of an organization's or business's events.
 *
 *   Lists      Upcoming · Drafts · Past, ticketed (plajahEvents) and RSVP (evites) merged (services/hostEventsService).
 *   Start      the host's ops-preset playbooks (services/opsPresets) → an RSVP invite (Evite studio, host preset)
 *              or a ticketed event (EventCreationWizard with host + playbook, full-screen overlay).
 *   Workflow   a selected event's dated checklist + promo beats (buildEventPlan), run of show and jump-offs to
 *              ticketing, door ops, photo pool and marketing ("Promote" → `plajah:opsPromoteEvent`).
 *
 * v1: checklist ticks are kept in this browser's localStorage, keyed by host + event (see planKey). They are not
 * shared between staff devices yet; move them to the event doc (or the evite's planDone) when that matters.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarPlus, Camera, Check, ChevronRight, Clock, DoorOpen, ExternalLink, Megaphone,
  PencilLine, RefreshCw, Ticket, Users, X,
} from 'lucide-react';
import type { EventPlaybook } from '../../services/opsPresets/types';
import {
  buildEventPlan, fetchHostEventItems, navigateApp, stepUrgency,
  type HostEventItem, type HostKind, type PlanStep,
} from '../../services/hostEventsService';
import { openCreateEvent } from './CreateEventButton';

const EventCreationWizard = React.lazy(() => import('../EventCreationWizard'));

export interface HostEventsPanelProps {
  host: { kind: HostKind; id: string; name: string };
  currentUser: any;
  playbooks: EventPlaybook[];
  /** The host's brand colour (quiet accent). Orange stays the action colour. */
  accent?: string;
  canManage: boolean;
}

const C = {
  chrome: '#0D0B10', panel: '#17141C', raised: '#211C28', line: 'rgba(255,255,255,0.08)', lineStrong: 'rgba(255,255,255,0.14)',
  ink: '#F4F0F7', ink2: '#D9D3E0', muted: '#A39BAE', purple: '#6B0099', magenta: '#D40055', orange: '#FF8C00',
  success: '#06D6A0', warn: '#F59E0B', danger: '#EF4444', grad: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)',
};
const DISPLAY = "'Bricolage Grotesque', Inter, system-ui, sans-serif";
const UI = 'Inter, system-ui, sans-serif';

type Tab = 'upcoming' | 'drafts' | 'past';

const money = (cents?: number) => cents === undefined ? '' : cents === 0 ? 'Free' : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: cents % 100 ? 2 : 0 })}`;
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const hoursLabel = (min: number) => min >= 60 ? `${Math.round(min / 6) / 10} h` : `${min} min`;
const FORMAT_LABEL: Record<EventPlaybook['format'], string> = { IN_PERSON: 'In person', VIRTUAL: 'Virtual', HYBRID: 'Hybrid' };
const CHANNEL_LABEL: Record<string, string> = { social: 'Social', email: 'Email', push: 'Push', signage: 'Signage', mail: 'Direct mail', billboard: 'Billboard', evite: 'Invitations' };

/** localStorage key for one event's checklist ticks (v1, per device). */
export const planKey = (host: { kind: string; id: string }, item: Pick<HostEventItem, 'source' | 'id'>) => `plajah.hostEventPlan.${host.kind}:${host.id}:${item.source}:${item.id}`;
const readJson = <T,>(k: string, fb: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : fb; } catch { return fb; } };
const writeJson = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

function tiersSummary(pb: EventPlaybook): string {
  if (!pb.tiers.length) return 'Free · RSVP';
  const prices = pb.tiers.map(t => t.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return `${pb.tiers.length} tier${pb.tiers.length > 1 ? 's' : ''} · ${lo === hi ? `$${lo}` : `$${lo}–$${hi}`}`;
}

// ── Small primitives ─────────────────────────────────────────────────────────

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'action' | 'quiet' | 'ghost'; icon?: React.ReactNode }> = ({ tone = 'quiet', icon, children, style, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 font-semibold transition-[filter,background] hover:brightness-110 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${rest.className || ''}`}
    style={{
      minHeight: 44, fontSize: 14, fontFamily: UI,
      ...(tone === 'action' ? { background: C.orange, color: '#1A0F00' }
        : tone === 'ghost' ? { background: 'transparent', color: C.ink2, border: `1px solid ${C.line}` }
        : { background: C.raised, color: C.ink, border: `1px solid ${C.lineStrong}` }),
      ...style,
    }}
  >{icon}{children}</button>
);

const Chip: React.FC<{ color: string; children: React.ReactNode }> = ({ color, children }) => (
  <span className="inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold whitespace-nowrap" style={{ fontSize: 12, color, background: `${color}1f`, border: `1px solid ${color}40` }}>{children}</span>
);

const statusColor = (it: HostEventItem) =>
  it.phase === 'cancelled' ? C.danger : it.phase === 'draft' ? C.muted : it.phase === 'past' ? C.muted
  : it.status === 'SOLD_OUT' ? C.magenta : C.success;

const DateBlock: React.FC<{ ms: number; accent: string }> = ({ ms, accent }) => {
  const d = new Date(ms);
  return (
    <div className="shrink-0 w-14 rounded-xl text-center py-1.5 tabular-nums" style={{ background: C.raised, border: `1px solid ${C.line}` }} aria-hidden="true">
      <div style={{ fontSize: 12, color: accent, fontWeight: 700 }}>{d.toLocaleDateString(undefined, { month: 'short' })}</div>
      <div style={{ fontSize: 22, lineHeight: 1.05, fontFamily: DISPLAY, fontWeight: 700, color: C.ink }}>{d.getDate()}</div>
      <div style={{ fontSize: 11, color: C.muted }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
    </div>
  );
};

// ── Panel ────────────────────────────────────────────────────────────────────

export default function HostEventsPanel({ host, currentUser, playbooks, accent = C.magenta, canManage }: HostEventsPanelProps) {
  const [items, setItems] = useState<HostEventItem[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>('upcoming');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ playbook?: EventPlaybook } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setItems((await fetchHostEventItems(host.kind, host.id)).items); }
    catch (e: any) { setError(e?.message || 'Could not load events.'); setItems(prev => prev ?? []); }
    finally { setLoading(false); }
  }, [host.kind, host.id]);
  useEffect(() => { void load(); }, [load]);

  const lists = useMemo(() => {
    const all = items || [];
    return {
      upcoming: all.filter(i => i.phase === 'upcoming'),
      drafts: all.filter(i => i.phase === 'draft'),
      past: all.filter(i => i.phase === 'past' || i.phase === 'cancelled'),
    };
  }, [items]);
  const selected = useMemo(() => (items || []).find(i => `${i.source}:${i.id}` === selectedId) || null, [items, selectedId]);

  const startRsvp = (_pb?: EventPlaybook) => openCreateEvent({ host: { kind: host.kind, id: host.id, label: host.name } });
  const startTicketed = (pb?: EventPlaybook) => setWizard({ playbook: pb });

  if (selected) {
    return (
      <EventWorkflow
        host={host} item={selected} playbooks={playbooks} accent={accent} canManage={canManage}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  const TABS: { k: Tab; label: string; n: number }[] = [
    { k: 'upcoming', label: 'Upcoming', n: lists.upcoming.length },
    ...(canManage ? [{ k: 'drafts' as Tab, label: 'Drafts', n: lists.drafts.length }] : []),
    { k: 'past', label: 'Past', n: lists.past.length },
  ];
  const shown = lists[tab];

  return (
    <section className="rounded-3xl p-4 sm:p-6 space-y-6" style={{ background: C.chrome, color: C.ink, fontFamily: UI, border: `1px solid ${C.line}` }} aria-label={`${host.name} events`}>
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, lineHeight: 1.1 }}>Events</h2>
          <p style={{ fontSize: 14, color: C.muted }}>Everything {host.name} is hosting: tickets, RSVPs and the work to get there.</p>
        </div>
        <Btn tone="ghost" onClick={() => void load()} disabled={loading} aria-label="Refresh events" icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}>Refresh</Btn>
        {canManage && <>
          <Btn onClick={() => startRsvp()} icon={<CalendarPlus size={16} />}>RSVP invite</Btn>
          <Btn tone="action" onClick={() => startTicketed()} icon={<Ticket size={16} />}>Ticketed event</Btn>
        </>}
      </header>

      <div role="tablist" aria-label="Event lists" className="flex gap-1 rounded-2xl p-1 w-fit" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
        {TABS.map(t => (
          <button
            key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}
            className="rounded-xl px-4 font-semibold tabular-nums"
            style={{ minHeight: 44, fontSize: 14, color: tab === t.k ? C.ink : C.muted, background: tab === t.k ? C.raised : 'transparent', boxShadow: tab === t.k ? `inset 0 -2px 0 ${accent}` : undefined }}
          >{t.label} <span style={{ color: C.muted, fontWeight: 500 }}>{t.n}</span></button>
        ))}
      </div>

      {error && <p role="alert" style={{ fontSize: 14, color: C.danger }}>{error}</p>}

      <div className="space-y-2">
        {items === null && <p style={{ fontSize: 14, color: C.muted }}>Loading events…</p>}
        {items !== null && shown.length === 0 && (
          <div className="rounded-2xl p-5" style={{ background: C.panel, border: `1px dashed ${C.lineStrong}` }}>
            <p style={{ fontSize: 15, color: C.ink2 }}>
              {tab === 'upcoming' ? 'Nothing on the calendar yet.' : tab === 'drafts' ? 'No drafts.' : 'No past events yet.'}
            </p>
            {canManage && tab === 'upcoming' && playbooks.length > 0 && <p style={{ fontSize: 14, color: C.muted }}>Start from one of the playbooks below.</p>}
          </div>
        )}
        {shown.map(it => (
          <EventRow key={`${it.source}:${it.id}`} item={it} accent={accent} canManage={canManage} onSelect={() => setSelectedId(`${it.source}:${it.id}`)} />
        ))}
      </div>

      {canManage && playbooks.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 700 }}>Start from a playbook</h3>
            <p style={{ fontSize: 14, color: C.muted }}>Each comes with a run of show, a dated checklist and a promotion plan.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {playbooks.map(pb => (
              <article key={pb.key} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <div className="flex items-start gap-3">
                  <span aria-hidden="true" className="shrink-0 grid place-items-center rounded-xl" style={{ width: 44, height: 44, fontSize: 24, background: C.raised }}>{pb.emoji}</span>
                  <div className="min-w-0">
                    <h4 style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{pb.label}</h4>
                    <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.4 }}>{pb.blurb}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 tabular-nums" style={{ fontSize: 12, color: C.ink2 }}>
                  <Chip color={C.muted}>{FORMAT_LABEL[pb.format]}</Chip>
                  <Chip color={C.muted}>{hoursLabel(pb.durationMin)}</Chip>
                  <Chip color={pb.tiers.length ? C.orange : C.success}>{tiersSummary(pb)}</Chip>
                  {pb.capacity ? <Chip color={C.muted}>{pb.capacity} people</Chip> : null}
                </div>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Btn onClick={() => startRsvp(pb)} icon={<Users size={15} />} aria-label={`${pb.label} as an RSVP invite`}>RSVP</Btn>
                  <Btn tone={pb.tiers.length ? 'action' : 'quiet'} onClick={() => startTicketed(pb)} icon={<Ticket size={15} />} aria-label={`${pb.label} as a ticketed event`}>Ticketed</Btn>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {wizard && (
        <div className="fixed inset-0 z-[90] overflow-y-auto" style={{ background: '#08060B' }} role="dialog" aria-modal="true" aria-label="Create a ticketed event">
          <Suspense fallback={<p className="p-8" style={{ color: C.muted, fontSize: 14 }}>Opening the event builder…</p>}>
            <EventCreationWizard
              currentUser={currentUser}
              host={{ kind: host.kind, id: host.id, name: host.name }}
              playbook={wizard.playbook}
              onBack={() => { setWizard(null); void load(); }}
              onSaved={id => { setWizard(null); void load().then(() => setSelectedId(`ticketed:${id}`)); }}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function EventRow({ item: it, accent, canManage, onSelect }: { item: HostEventItem; accent: string; canManage: boolean; onSelect: () => void }) {
  const meta = it.ticketed
    ? `${it.sold ?? 0}${it.capacity ? ` / ${it.capacity}` : ''} sold${it.priceFrom !== undefined ? ` · from ${money(it.priceFrom)}` : ''}`
    : it.rsvp ? `${it.rsvp.yes} going · ${it.rsvp.headcount} people${it.rsvp.maybe ? ` · ${it.rsvp.maybe} maybe` : ''}${it.capacity ? ` of ${it.capacity}` : ''}` : 'RSVP';
  return (
    <div className="rounded-2xl p-3 flex flex-wrap sm:flex-nowrap items-center gap-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <DateBlock ms={it.startAt} accent={accent} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="truncate" style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 700 }}>{it.title}</h4>
          <Chip color={statusColor(it)}>{it.statusLabel}</Chip>
          <Chip color={it.ticketed ? C.orange : '#A78BFA'}>{it.ticketed ? 'Tickets' : 'RSVP'}</Chip>
        </div>
        <p className="tabular-nums" style={{ fontSize: 13, color: C.muted }}>
          {timeLabel(it.startAt)}{it.place ? ` · ${it.place}` : ''}
        </p>
        <p className="tabular-nums" style={{ fontSize: 13, color: C.ink2 }}>{meta}</p>
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <Btn tone="ghost" onClick={it.open} icon={<ExternalLink size={15} />} aria-label={`Open ${it.title}`}>Open</Btn>
        {canManage && <Btn onClick={onSelect} icon={<ChevronRight size={15} />} aria-label={`Workflow for ${it.title}`}>Workflow</Btn>}
      </div>
    </div>
  );
}

// ── Workflow ─────────────────────────────────────────────────────────────────

function EventWorkflow({ host, item, playbooks, accent, canManage, onBack }: {
  host: HostEventsPanelProps['host']; item: HostEventItem; playbooks: EventPlaybook[]; accent: string; canManage: boolean; onBack: () => void;
}) {
  const key = planKey(host, item);
  const [state, setState] = useState<{ done: string[]; playbookKey?: string }>(() => readJson(key, { done: [] as string[] }));
  useEffect(() => { setState(readJson(key, { done: [] as string[] })); }, [key]);
  const save = (next: typeof state) => { setState(next); writeJson(key, next); };

  const pbKey = item.playbookKey || state.playbookKey;
  const playbook = playbooks.find(p => p.key === pbKey);
  const plan = useMemo(() => playbook ? buildEventPlan(playbook, item.startAt) : null, [playbook, item.startAt]);
  const done = new Set(state.done);
  const toggle = (id: string) => save({ ...state, done: done.has(id) ? state.done.filter(x => x !== id) : [...state.done, id] });
  const now = Date.now();
  const total = plan ? plan.steps.length : 0;
  const finished = plan ? plan.steps.filter(s => done.has(s.id)).length : 0;
  const eventId = item.source === 'ticketed' ? item.id : item.linkedEventId;

  const promote = () => window.dispatchEvent(new CustomEvent('plajah:opsPromoteEvent', {
    detail: { host: { kind: host.kind, id: host.id, name: host.name }, eventId: item.id, source: item.source, title: item.title, startAt: item.startAt },
  }));

  return (
    <section className="rounded-3xl p-4 sm:p-6 space-y-6" style={{ background: C.chrome, color: C.ink, fontFamily: UI, border: `1px solid ${C.line}` }} aria-label={`${item.title} workflow`}>
      <header className="flex flex-wrap items-start gap-3">
        <Btn tone="ghost" onClick={onBack} icon={<ArrowLeft size={16} />} aria-label="Back to events">Events</Btn>
        <DateBlock ms={item.startAt} accent={accent} />
        <div className="min-w-0 flex-1">
          <h2 style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700, lineHeight: 1.15 }}>{item.title}</h2>
          <p className="tabular-nums" style={{ fontSize: 14, color: C.muted }}>
            {dayLabel(item.startAt)} · {timeLabel(item.startAt)}{item.place ? ` · ${item.place}` : ''}
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            <Chip color={statusColor(item)}>{item.statusLabel}</Chip>
            <Chip color={item.ticketed ? C.orange : '#A78BFA'}>{item.ticketed ? 'Tickets' : 'RSVP'}</Chip>
            {item.ticketed && <Chip color={C.ink2}>{item.sold ?? 0}{item.capacity ? ` / ${item.capacity}` : ''} sold</Chip>}
            {item.rsvp && <Chip color={C.ink2}>{item.rsvp.headcount} coming</Chip>}
          </div>
        </div>
      </header>

      {/* Jump-offs */}
      <nav aria-label="Event tools" className="flex flex-wrap gap-2">
        <Btn onClick={item.open} icon={<ExternalLink size={16} />}>{item.ticketed ? 'Event page' : 'Guest page'}</Btn>
        {item.source === 'evite' && canManage && <Btn onClick={() => openCreateEvent({ editId: item.id, host: { kind: host.kind, id: host.id, label: host.name } })} icon={<PencilLine size={16} />}>Edit invite</Btn>}
        {eventId && <Btn onClick={() => navigateApp('EVENT_DASHBOARD')} icon={<Ticket size={16} />}>Ticketing dashboard</Btn>}
        {eventId && <Btn onClick={() => navigateApp('EVENT_KIOSK', { eventId })} icon={<DoorOpen size={16} />}>Door ops</Btn>}
        {/* The photo pool opens from the event page (App has no direct pool target yet). */}
        {eventId && <Btn onClick={() => navigateApp('EVENT_DETAIL', { eventId })} icon={<Camera size={16} />}>Photo pool</Btn>}
        <Btn tone="action" onClick={promote} icon={<Megaphone size={16} />}>Promote</Btn>
      </nav>

      {!playbook && (
        <div className="rounded-2xl p-4 space-y-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
          <p style={{ fontSize: 15, color: C.ink2 }}>Pick a playbook to lay a checklist and promotion plan onto this date.</p>
          {playbooks.length ? (
            <label className="flex flex-wrap items-center gap-2" style={{ fontSize: 14, color: C.muted }}>
              Playbook
              <select
                value="" onChange={e => e.target.value && save({ ...state, playbookKey: e.target.value })}
                className="rounded-xl px-3" style={{ minHeight: 44, fontSize: 14, background: C.raised, color: C.ink, border: `1px solid ${C.lineStrong}` }}
              >
                <option value="">Choose…</option>
                {playbooks.map(p => <option key={p.key} value={p.key}>{p.emoji} {p.label}</option>)}
              </select>
            </label>
          ) : <p style={{ fontSize: 14, color: C.muted }}>This host has no playbooks yet.</p>}
        </div>
      )}

      {plan && playbook && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p style={{ fontSize: 14, color: C.muted }}>
              {playbook.emoji} {playbook.label} playbook · <span className="tabular-nums">{finished} of {total} done</span>
            </p>
            <div className="h-2 flex-1 min-w-[120px] rounded-full overflow-hidden" style={{ background: C.raised }} aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${total ? (finished / total) * 100 : 0}%`, background: C.grad }} />
            </div>
            {!item.playbookKey && state.playbookKey && (
              <Btn tone="ghost" onClick={() => save({ ...state, playbookKey: undefined })} icon={<X size={15} />}>Change playbook</Btn>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PlanList title="Checklist" steps={plan.tasks} done={done} onToggle={toggle} now={now} canManage={canManage} />
            <PlanList title="Promotion" steps={plan.promo} done={done} onToggle={toggle} now={now} canManage={canManage} />
          </div>

          {plan.runOfShow.length > 0 && (
            <div className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <h3 className="mb-2" style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700 }}>Run of show</h3>
              <ol className="space-y-1">
                {plan.runOfShow.map(r => (
                  <li key={r.id} className="flex gap-3 items-baseline py-1.5" style={{ borderTop: `1px solid ${C.line}` }}>
                    <span className="tabular-nums shrink-0 w-20" style={{ fontSize: 14, color: accent, fontWeight: 700 }}>{timeLabel(r.at)}</span>
                    <span className="flex-1" style={{ fontSize: 14, color: C.ink }}>{r.what}</span>
                    <span style={{ fontSize: 13, color: C.muted }}>{r.owner}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p style={{ fontSize: 12, color: C.muted }}>Checklist ticks are saved on this device.</p>
        </>
      )}
    </section>
  );
}

function PlanList({ title, steps, done, onToggle, now, canManage }: {
  title: string; steps: PlanStep[]; done: Set<string>; onToggle: (id: string) => void; now: number; canManage: boolean;
}) {
  const URG = { overdue: { label: 'Overdue', color: C.danger }, this_week: { label: 'This week', color: C.warn }, later: { label: '', color: C.muted }, done: { label: 'Done', color: C.success } } as const;
  return (
    <div className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
      <h3 className="mb-2" style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700 }}>{title}</h3>
      {steps.length === 0 && <p style={{ fontSize: 14, color: C.muted }}>Nothing in this playbook.</p>}
      <ul className="space-y-1">
        {steps.map(s => {
          const isDone = done.has(s.id);
          const u = URG[stepUrgency(s, isDone, now)];
          return (
            <li key={s.id}>
              <label className="flex items-start gap-3 rounded-xl px-2 py-2 cursor-pointer hover:bg-white/[0.03]" style={{ minHeight: 44 }}>
                <input
                  type="checkbox" checked={isDone} disabled={!canManage} onChange={() => onToggle(s.id)}
                  className="mt-0.5 shrink-0" style={{ width: 22, height: 22, accentColor: C.orange }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block" style={{ fontSize: 14, color: isDone ? C.muted : C.ink, textDecoration: isDone ? 'line-through' : undefined }}>{s.title}</span>
                  <span className="flex flex-wrap items-center gap-2 tabular-nums" style={{ fontSize: 12, color: C.muted }}>
                    <span className="inline-flex items-center gap-1"><Clock size={12} aria-hidden="true" />{dayLabel(s.dueAt)}</span>
                    <span>{s.daysBefore > 0 ? `${s.daysBefore} d before` : s.daysBefore === 0 ? 'Day of' : `${-s.daysBefore} d after`}</span>
                    {s.owner && <span>· {s.owner}</span>}
                    {s.channel && <span>· {CHANNEL_LABEL[s.channel] || s.channel}</span>}
                    {u.label && <span style={{ color: u.color, fontWeight: 600 }}>{u.label === 'Done' ? <Check size={12} aria-label="Done" /> : u.label}</span>}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

