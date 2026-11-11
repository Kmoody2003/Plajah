// The Plajah FM station clock: which host is on air right now, and the song facts they may speak.
//
// Show hours in the host sheets are station time (US Eastern, the same clock the FAST schedule uses),
// so every listener hears the same host at the same moment, wherever they are.

import { hostOnAir } from './roster';
import type { PersonaSheet } from './types';
import type { SongFacts } from './segments';
import { isPersonaUid } from './accounts';

export const STATION_TZ = 'America/New_York';

const DAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Station-local weekday (Sun=0) and hour for an instant. */
export function stationClock(now: number = Date.now(), tz: string = STATION_TZ): { dayIndex: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(now));
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hr = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  return { dayIndex: DAY_INDEX[wd] ?? 0, hour: hr % 24 };
}

/** The host on Plajah FM right now, or null when the hour is unhosted (music and idents only). */
export function onAirNow(now: number = Date.now()): PersonaSheet | null {
  const { dayIndex, hour } = stationClock(now);
  return hostOnAir(dayIndex, hour);
}

/** The next host to come on, and how many whole hours until their show starts (up to a week ahead). */
export function nextOnAir(now: number = Date.now()): { host: PersonaSheet; inHours: number } | null {
  const { dayIndex, hour } = stationClock(now);
  const current = hostOnAir(dayIndex, hour);
  for (let k = 1; k <= 24 * 7; k++) {
    const t = hour + k;
    const h = hostOnAir(dayIndex + Math.floor(t / 24), t % 24);
    if (h && h.id !== current?.id) return { host: h, inHours: k };
  }
  return null;
}

const hr12 = (h: number) => {
  const x = ((h % 24) + 24) % 24;
  return `${x % 12 === 0 ? 12 : x % 12}${x < 12 ? 'am' : 'pm'}`;
};

/** "6am–10am ET" for a show's hours. */
export function showHoursLabel(p: PersonaSheet): string {
  if (!p.show) return '';
  const [a, b] = p.show.hours;
  return `${hr12(a)}–${hr12(b)} ET`;
}

/** The track fields a host may speak. Only real stored values go in; nothing is estimated. */
export interface TrackLike {
  id: string;
  title?: string;
  artist?: string;
  artistId?: string;
  playCount?: number;
}

export function songFactsFromTrack(t: TrackLike | null | undefined): SongFacts | null {
  if (!t || !t.title) return null;
  const persona = !!t.artistId && isPersonaUid(t.artistId);
  return {
    id: t.id,
    title: t.title,
    artist: t.artist || 'a Plajah artist',
    plajahCreator: !!t.artistId && !persona,
    plays: typeof t.playCount === 'number' && Number.isFinite(t.playCount) ? t.playCount : undefined,
    isPersonaArtist: persona,
  };
}
