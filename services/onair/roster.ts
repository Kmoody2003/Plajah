// The on-air roster: every virtual persona, lookups, and "who is on Plajah FM right now".

import { HOSTS } from './hosts';
import { ARTISTS } from './artists';
import { validatePersona, type PersonaSheet } from './types';

export const ALL_PERSONAS: PersonaSheet[] = [...HOSTS, ...ARTISTS];

const BY_ID = new Map(ALL_PERSONAS.map((p) => [p.id, p]));

export function getPersona(id: string): PersonaSheet | undefined {
  return BY_ID.get(id);
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Which host is on air at a station-local day and hour. A show that runs past midnight
 * (Low Light, 22–2) belongs to the day it started on, so 1 a.m. Tuesday is Monday's show.
 * Returns null for an unhosted slot — the station then runs music with idents only.
 */
export function hostOnAir(dayIndex: number, hour: number, hosts: PersonaSheet[] = HOSTS): PersonaSheet | null {
  const today = DAY_KEYS[((dayIndex % 7) + 7) % 7];
  const yesterday = DAY_KEYS[(((dayIndex - 1) % 7) + 7) % 7];
  for (const h of hosts) {
    const s = h.show;
    if (!s) continue;
    const [a, b] = s.hours;
    if (a < b) {
      if (hour >= a && hour < b && s.days.includes(today)) return h;
    } else {
      if (hour >= a && s.days.includes(today)) return h;          // before midnight
      if (hour < b && s.days.includes(yesterday)) return h;       // after midnight, started yesterday
    }
  }
  return null;
}

/** The weekly grid, hour by hour — used by the schedule UI and to spot overlaps or gaps. */
export function weeklyGrid(hosts: PersonaSheet[] = HOSTS): (string | null)[][] {
  return Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => hostOnAir(d, h, hosts)?.id ?? null));
}

/** Overlapping shows (two hosts claiming one hour). Should always be empty. */
export function findOverlaps(hosts: PersonaSheet[] = HOSTS): string[] {
  const out: string[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const on = hosts.filter((x) => hostOnAir(d, h, [x]));
      if (on.length > 1) out.push(`${DAY_KEYS[d]} ${h}:00 → ${on.map((x) => x.id).join(', ')}`);
    }
  }
  return out;
}

/** Validates every sheet and the roster as a whole (unique ids and handles). */
export function validateRoster(list: PersonaSheet[] = ALL_PERSONAS): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const handles = new Set<string>();
  for (const p of list) {
    for (const e of validatePersona(p)) out.push(`${p.id}: ${e}`);
    if (ids.has(p.id)) out.push(`duplicate id ${p.id}`);
    if (handles.has(p.account.handle)) out.push(`duplicate handle ${p.account.handle}`);
    ids.add(p.id); handles.add(p.account.handle);
    for (const r of p.relationships) if (!BY_ID.has(r.with)) out.push(`${p.id}: relationship with unknown persona ${r.with}`);
  }
  return out;
}
