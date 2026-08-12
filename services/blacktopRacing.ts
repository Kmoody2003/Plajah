// blacktopRacing — optional Orange Cat Blacktop motorsport data source.
//
// A cleaner, purpose-built REST source for IndyCar (and F1/NASCAR) — schedules, results,
// driver/team standings, profiles — used as a FALLBACK/enrichment behind the unofficial ESPN
// feed (which has no SLA and can change shape). Normalizes into the SAME racing types the UI
// already consumes (RacingStanding / RacingDriver / RaceEvent), so nothing downstream changes.
//
// ⚠️ TERMS: Blacktop's FREE tier is personal / non-commercial only; commercial use (Plajah in
// production) requires their paid plan. So this is strictly OPT-IN via an env key the operator
// supplies under whatever plan they've licensed. With no key set, every function no-ops and the
// app falls back to ESPN exactly as before — nothing here activates on its own.

import type { RacingStanding, RacingDriver, RaceEvent } from './sportsService';

const BASE = 'https://api.ocblacktop.com/v1';

// Series slug per app tab. (Blacktop covers more, but we only wire the ones the UI shows.)
const SERIES: Record<string, string> = { INDYCAR: 'indycar', F1: 'f1', NASCAR: 'nascar' };

function apiKey(): string | undefined {
  const env: any = (import.meta as any).env || {};
  return env.VITE_OCBLACKTOP_KEY || undefined;
}

/** True when a licensed key is present AND this tab is a Blacktop-supported series. */
export function blacktopAvailable(tab: string): boolean {
  return !!apiKey() && !!SERIES[tab];
}

async function bt(tab: string, path: string): Promise<any | null> {
  const key = apiKey();
  const series = SERIES[tab];
  if (!key || !series) return null;
  try {
    const res = await fetch(`${BASE}/${series}${path}`, { headers: { 'x-api-key': key } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const str = (v: any): string => (v == null ? '' : typeof v === 'string' ? v : typeof v === 'number' ? String(v) : (v.name ?? v.displayName ?? v.fullName ?? ''));
const num = (v: any): number => (typeof v === 'number' ? v : parseFloat(v) || 0);

/** Driver championship standings, newest season. Returns [] when unavailable (key/series/network). */
export async function fetchBlacktopStandings(tab: string): Promise<RacingStanding[]> {
  const data = await bt(tab, '/standings/drivers');
  const rows: any[] = data?.standings ?? data?.drivers ?? data?.entries ?? (Array.isArray(data) ? data : []);
  return rows.slice(0, 30).map((r: any, i: number): RacingStanding => ({
    rank: num(r.position ?? r.rank ?? r.pos ?? i + 1) || i + 1,
    driverName: str(r.driver ?? r.name ?? r.driverName) || `Driver ${i + 1}`,
    teamName: str(r.team ?? r.teamName ?? r.entrant),
    driverLogo: str(r.headshot ?? r.photo ?? r.image),
    points: num(r.points ?? r.pts),
    wins: num(r.wins),
  }));
}

/** Driver profiles (grid). Returns [] when unavailable. */
export async function fetchBlacktopDrivers(tab: string): Promise<RacingDriver[]> {
  const data = await bt(tab, '/drivers');
  const rows: any[] = data?.drivers ?? data?.data ?? (Array.isArray(data) ? data : []);
  return rows.slice(0, 40).map((d: any, i: number): RacingDriver => ({
    id: str(d.id ?? d.slug ?? i),
    name: str(d.name ?? d.fullName ?? d.driver) || `Driver ${i + 1}`,
    number: str(d.number ?? d.carNumber ?? d.no),
    teamName: str(d.team ?? d.teamName ?? d.entrant),
    manufacturer: str(d.manufacturer ?? d.engine ?? d.make),
    nationality: str(d.nationality ?? d.country?.name ?? d.country),
    headshot: str(d.headshot ?? d.photo ?? d.image),
    teamColor: str(d.teamColor ?? d.color) || '#FF8C00',
    teamLogo: str(d.teamLogo ?? d.logo),
  }));
}

/** Schedule/results (events). Returns [] when unavailable. */
export async function fetchBlacktopSchedule(tab: string): Promise<RaceEvent[]> {
  const data = await bt(tab, '/events');
  const raw: any[] = [
    ...(data?.upcoming ?? []),
    ...(data?.recent ?? data?.results ?? []),
    ...(Array.isArray(data?.events) ? data.events : []),
    ...(Array.isArray(data) ? data : []),
  ];
  return raw.slice(0, 24).map((e: any): RaceEvent => {
    const loc = e.location ?? {};
    const started = (e.status ?? '').toLowerCase();
    return {
      id: str(e.id ?? e.slug ?? e.round),
      name: str(e.name ?? e.title) || 'Race',
      shortName: str(e.shortName ?? e.name) || 'Race',
      date: str(e.dateStart ?? e.date ?? e.start),
      venue: str(loc.name ?? e.circuit ?? e.venue),
      city: [str(loc.city), str(loc.country?.name ?? loc.country)].filter(Boolean).join(', '),
      status: started.includes('final') || started.includes('post') ? 'post' : started.includes('live') || started.includes('in') ? 'in' : 'pre',
      results: [],
    };
  });
}
