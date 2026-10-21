/**
 * HostEventsPublic — an org's or business's upcoming events on its public page: ticketed events (→ the event
 * landing page, App NAVIGATE EVENT_DETAIL) and live RSVP invitations (→ the guest page /i/:id).
 * Public data only: GET /api/events/host/* and /api/evite/host/* return published / live, listable items.
 */
import React, { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Ticket, Users } from 'lucide-react';
import { fetchHostEventItems, type HostEventItem, type HostKind } from '../../services/hostEventsService';

export interface HostEventsPublicProps {
  host: { kind: HostKind; id: string; name?: string };
  accent?: string;
  theme?: 'dark' | 'vellum';
  /** Shown instead of the list when nothing is coming up. Pass '' to render nothing at all. */
  emptyText?: string;
  limit?: number;
  /** Override what a card does; defaults to the item's own target (event page or RSVP page). */
  onOpenEvent?: (item: HostEventItem) => void;
}

const DISPLAY = "'Bricolage Grotesque', Inter, system-ui, sans-serif";
const THEMES = {
  dark: { bg: '#17141C', card: '#211C28', line: 'rgba(255,255,255,0.10)', ink: '#F4F0F7', muted: '#A39BAE' },
  vellum: { bg: 'transparent', card: '#FFFDF9', line: 'rgba(29,25,34,0.12)', ink: '#1D1922', muted: '#6A6170' },
} as const;

const priceLabel = (it: HostEventItem) =>
  it.priceFrom === undefined ? '' : it.priceFrom === 0 ? 'Free' : `From $${(it.priceFrom / 100).toLocaleString(undefined, { maximumFractionDigits: it.priceFrom % 100 ? 2 : 0 })}`;

function ctaFor(it: HostEventItem): { label: string; disabled?: boolean } {
  if (!it.ticketed) return { label: it.status === 'closed' ? 'See invitation' : 'RSVP' };
  if (it.status === 'SOLD_OUT') return { label: 'Sold out' };
  if (it.status === 'PUBLISHED') return { label: 'See event' };
  return { label: it.priceFrom === 0 ? 'Get free tickets' : 'Get tickets' };
}

export default function HostEventsPublic({ host, accent = '#D40055', theme = 'dark', emptyText = 'No upcoming events right now.', limit = 6, onOpenEvent }: HostEventsPublicProps) {
  const [items, setItems] = useState<HostEventItem[] | null>(null);
  const t = THEMES[theme];

  useEffect(() => {
    let live = true;
    setItems(null);
    fetchHostEventItems(host.kind, host.id, { publicOnly: true })
      .then(r => { if (live) setItems(r.items.filter(i => i.phase === 'upcoming')); })
      .catch(() => { if (live) setItems([]); });
    return () => { live = false; };
  }, [host.kind, host.id]);

  if (items === null) {
    return <div aria-busy="true" className="rounded-2xl animate-pulse" style={{ height: 120, background: t.card, border: `1px solid ${t.line}` }} />;
  }
  if (!items.length) {
    return emptyText ? <p style={{ fontSize: 15, color: t.muted }}>{emptyText}</p> : null;
  }

  const open = (it: HostEventItem) => (onOpenEvent ? onOpenEvent(it) : it.open());

  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label={host.name ? `Upcoming events from ${host.name}` : 'Upcoming events'}>
      {items.slice(0, limit).map(it => {
        const d = new Date(it.startAt);
        const cta = ctaFor(it);
        const price = priceLabel(it);
        return (
          <li key={`${it.source}:${it.id}`} className="rounded-2xl overflow-hidden flex flex-col" style={{ background: t.card, border: `1px solid ${t.line}`, color: t.ink }}>
            {it.coverUrl && <img src={it.coverUrl} alt="" loading="lazy" className="w-full object-cover" style={{ aspectRatio: '16 / 7' }} />}
            <div className="p-4 flex gap-3 flex-1">
              <div className="shrink-0 w-14 text-center rounded-xl py-1.5 tabular-nums" style={{ border: `1px solid ${t.line}` }} aria-hidden="true">
                <div style={{ fontSize: 12, fontWeight: 700, color: accent }}>{d.toLocaleDateString(undefined, { month: 'short' })}</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 700, lineHeight: 1.05 }}>{d.getDate()}</div>
                <div style={{ fontSize: 11, color: t.muted }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              </div>
              <div className="min-w-0 flex-1 flex flex-col gap-1">
                <h3 style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>{it.title}</h3>
                <p className="flex items-center gap-1.5 tabular-nums" style={{ fontSize: 13, color: t.muted }}>
                  <CalendarDays size={14} aria-hidden="true" />
                  {d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </p>
                {it.place && <p className="flex items-center gap-1.5" style={{ fontSize: 13, color: t.muted }}><MapPin size={14} aria-hidden="true" />{it.place}</p>}
                <div className="mt-auto pt-2 flex items-center gap-3">
                  <button
                    type="button" onClick={() => open(it)} disabled={cta.disabled}
                    className="inline-flex items-center gap-2 rounded-xl px-4 font-semibold hover:brightness-110 disabled:opacity-50"
                    style={{ minHeight: 44, fontSize: 14, background: '#FF8C00', color: '#1A0F00' }}
                    aria-label={`${cta.label}: ${it.title}`}
                  >
                    {it.ticketed ? <Ticket size={15} aria-hidden="true" /> : <Users size={15} aria-hidden="true" />}{cta.label}
                  </button>
                  {price && <span className="tabular-nums" style={{ fontSize: 13, color: t.muted }}>{price}</span>}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
