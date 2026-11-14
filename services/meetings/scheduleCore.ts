/**
 * scheduleCore — pure rules for huddles and scheduled meetings (no Firebase).
 *
 * Huddle = the room's own call session (chat_rooms/{room}/meeting_rtc/main) joined audio-only from a
 * small floating bar. Anyone already in the full call is in the same huddle, and the reverse.
 *
 * Scheduled meeting = chat_rooms/{room}/scheduled_meetings/{id}, announced in the chat with a
 * pinned invite card. With guests allowed, a public stub public_meetings/{id} (the id is the
 * capability) lets people without an account knock; the host admits them from a waiting room
 * (public_meetings/{id}/lobby/{guestUid}) and everyone meets on public_meetings/{id}/rtc/main.
 */
import { googleCalendarLink, type IcsEvent, type Recurrence } from '../postman/calendarTime';

export interface ScheduledMeeting {
  id: string;
  roomId: string;
  title: string;
  startsAt: number;
  durationMin: number;
  agenda?: string;
  recurrence?: Recurrence;
  /** People outside the chat may join from a link, after the host lets them in. */
  guestsAllowed: boolean;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  canceledAt?: number | null;
}

/** What someone with only the guest link can see. */
export interface PublicMeeting {
  roomId: string;
  title: string;
  startsAt: number;
  durationMin: number;
  hostUid: string;
  hostName: string;
  canceledAt?: number | null;
}

export type LobbyStatus = 'WAITING' | 'ADMITTED' | 'DENIED';
export interface LobbyEntry { uid: string; name: string; status: LobbyStatus; requestedAt: number }

export const DURATIONS = [15, 30, 45, 60, 90, 120];
/** Join opens this long before the start. */
export const EARLY_JOIN_MS = 10 * 60_000;
/** …and stays open this long after the scheduled end. */
export const LATE_JOIN_MS = 60 * 60_000;

export function meetingEnd(m: Pick<ScheduledMeeting, 'startsAt' | 'durationMin'>): number {
  return m.startsAt + m.durationMin * 60_000;
}

export type JoinState = 'canceled' | 'upcoming' | 'open' | 'live' | 'ended';

/** Where the meeting is in its life, ignoring recurrence (see nextOccurrence). */
export function joinState(m: Pick<ScheduledMeeting, 'startsAt' | 'durationMin' | 'canceledAt'>, now = Date.now()): JoinState {
  if (m.canceledAt) return 'canceled';
  if (now < m.startsAt - EARLY_JOIN_MS) return 'upcoming';
  if (now < m.startsAt) return 'open';
  if (now <= meetingEnd(m) + LATE_JOIN_MS) return 'live';
  return 'ended';
}

const STEP: Partial<Record<Recurrence, (d: Date) => void>> = {
  daily: d => d.setDate(d.getDate() + 1),
  weekly: d => d.setDate(d.getDate() + 7),
  monthly: d => d.setMonth(d.getMonth() + 1),
  yearly: d => d.setFullYear(d.getFullYear() + 1),
  weekdays: d => { do d.setDate(d.getDate() + 1); while (d.getDay() === 0 || d.getDay() === 6); },
};

/** The start of the occurrence that is current or next (recurring meetings roll forward). */
export function nextOccurrence(m: Pick<ScheduledMeeting, 'startsAt' | 'durationMin' | 'recurrence'>, now = Date.now()): number {
  const step = m.recurrence && STEP[m.recurrence];
  if (!step) return m.startsAt;
  const d = new Date(m.startsAt);
  for (let i = 0; i < 2000 && d.getTime() + m.durationMin * 60_000 + LATE_JOIN_MS < now; i++) step(d);
  return d.getTime();
}

/** The meeting as it stands now: a recurring one is moved to its current/next occurrence. */
export function currentOccurrence<T extends ScheduledMeeting>(m: T, now = Date.now()): T {
  return m.recurrence && m.recurrence !== 'none' ? { ...m, startsAt: nextOccurrence(m, now) } : m;
}

/** Problems with a schedule form, or null when it can be saved. */
export function validateSchedule(input: { title: string; startsAt: number; durationMin: number }, now = Date.now()): string | null {
  if (!input.title.trim()) return 'Give the meeting a name.';
  if (input.title.trim().length > 120) return 'Keep the name under 120 characters.';
  if (!Number.isFinite(input.startsAt)) return 'Pick a date and time.';
  if (input.startsAt < now - 5 * 60_000) return 'That time has already passed.';
  if (!DURATIONS.includes(input.durationMin)) return 'Pick a length from the list.';
  return null;
}

/** "Today · 7:00 PM", "Tomorrow · 9:30 AM", "Tue, Nov 4 · 7:00 PM". */
export function describeWhen(t: number, now = Date.now(), tz?: string): string {
  const day = (x: number) => new Date(x).toLocaleDateString('en-CA', { timeZone: tz });
  const time = new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
  const today = day(now), tomorrow = day(now + 86_400_000);
  const d = day(t);
  const label = d === today ? 'Today' : d === tomorrow ? 'Tomorrow'
    : new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
  return `${label} · ${time}`;
}

/** Link that opens the meeting for anyone (guests knock; members go straight in). */
export function meetingLink(origin: string, meetingId: string): string {
  return `${origin.replace(/\/+$/, '')}/?meet=${encodeURIComponent(meetingId)}`;
}

export function isMeetingId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9]{20,40}$/.test(id);
}

export function calendarEvent(m: ScheduledMeeting, link: string): IcsEvent {
  return {
    uid: `meeting-${m.id}`,
    title: m.title,
    start: m.startsAt,
    end: meetingEnd(m),
    url: link,
    location: link,
    description: `${m.agenda ? `${m.agenda}\n\n` : ''}Join on Plajah: ${link}`,
    recurrence: m.recurrence && m.recurrence !== 'none' ? m.recurrence : undefined,
  };
}

export const googleCalendarUrl = (e: IcsEvent) => googleCalendarLink(e);

export function outlookCalendarUrl(e: IcsEvent): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose', rru: 'addevent', subject: e.title,
    startdt: new Date(e.start).toISOString(), enddt: new Date(e.end).toISOString(),
    body: (e.description || '').slice(0, 1500), location: e.location || '',
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}

/** A guest's display name: trimmed, 2–60 characters, no angle brackets. */
export function cleanGuestName(name: string): string | null {
  const n = name.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return n.length >= 2 && n.length <= 60 ? n : null;
}

// ── Huddles ──────────────────────────────────────────────────────────────────

export interface HuddlePresence { id: string; name: string; lastSeen?: number | null }

/** Who is really in the room's call right now: heart-beat within the stale window. */
export function activeHuddlers(list: HuddlePresence[], now = Date.now(), staleMs = 60_000): HuddlePresence[] {
  return list.filter(p => typeof p.lastSeen === 'number' && now - p.lastSeen < staleMs);
}

/** "Dana", "Dana and Sam", "Dana, Sam and 3 others". */
export function huddleLabel(names: string[]): string {
  const n = names.filter(Boolean);
  if (!n.length) return '';
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n[0]}, ${n[1]} and ${n.length - 2} other${n.length - 2 === 1 ? '' : 's'}`;
}
