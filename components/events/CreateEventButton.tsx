/**
 * CreateEventButton — "Create an event" from anywhere on Plajah: your profile, an organization, a business, a school
 * or a classroom. It opens the Evite studio with the right host already set (App listens for `plajah:createEvent`).
 */
import React from 'react';
import { CalendarPlus } from 'lucide-react';
import type { EviteHost } from '../../services/evite/eviteTypes';

export function openCreateEvent(detail: { host?: EviteHost; plateId?: string; editId?: string } = {}) {
  window.dispatchEvent(new CustomEvent('plajah:createEvent', { detail }));
}

/** Sensible first design for each kind of host. */
const START: Record<EviteHost['kind'], string> = { user: 'kids_boy/dino', org: 'general/stringlights', business: 'adult/champagne', school: 'kids_everyone/circus', teacher: 'kids_everyone/mad-science' };

export default function CreateEventButton({ host, label = 'Create an event', compact, className }: { host: EviteHost; label?: string; compact?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openCreateEvent({ host, plateId: START[host.kind] })}
      className={className || `inline-flex items-center gap-2 rounded-full font-black uppercase tracking-widest text-white ${compact ? 'h-9 px-3.5 text-[10px]' : 'h-10 px-5 text-xs'}`}
      style={className ? undefined : { background: 'linear-gradient(135deg,#6B0099,#D40055 55%,#FF8C00)' }}
      aria-label={host.label ? `${label} as ${host.label}` : label}
    >
      <CalendarPlus size={compact ? 13 : 15} aria-hidden="true" />{label}
    </button>
  );
}
