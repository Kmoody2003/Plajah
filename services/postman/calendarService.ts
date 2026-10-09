/**
 * The Post Man — calendar service.
 *
 * Three kinds of time, one calendar:
 *
 *   MINE      users/{uid}/calendar_events — what the person wrote down, plus
 *             anything from the platform they chose to "keep".
 *   PLAJAH    computed, never stored. Releases from people you follow, the
 *             tickets you bought, events you RSVP'd to, premieres you asked to be
 *             reminded about, classes you are enrolled in, homework due, your
 *             teams' games, your church's service times. Read from the same
 *             collections the rest of the app already queries, with the same
 *             query shapes, so no new indexes are needed and nothing can drift:
 *             if a creator moves a release date, the calendar moves with it.
 *   GOOGLE    the person's own Google Calendar, through the Post Man's existing
 *             server-held OAuth connection (routes/postman.ts).
 *
 * Computing the Plajah layer on read rather than fanning out writes is the
 * point: a creator with 200k followers rescheduling an album would otherwise
 * mean 200k calendar writes, and an unfollow would leave ghosts behind.
 *
 * Every source is independently fault-tolerant. A missing index or a rule
 * denial on one collection drops that layer for this load and never blanks
 * the calendar.
 */

import {
  collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, where,
} from 'firebase/firestore';
import { onSnapshot } from '../safeSnapshot';
import { auth, db } from '../firebase';
import { fetchFollowingIds, fetchMyTickets, fetchPublicEvents } from '../backendService';
import { releaseMs } from '../releases/visibility';
import { DAY, HOUR, MIN, addDays, localZone, startOfDay, type Recurrence } from './calendarTime';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export type CalLayer =
  | 'mine' | 'releases' | 'events' | 'live' | 'learning' | 'sports' | 'worship' | 'letters' | 'google';

export const CAL_LAYERS: { id: CalLayer; label: string; color: string; hint: string }[] = [
  { id: 'mine',     label: 'My calendar',   color: 'var(--pj-orange)', hint: 'What you wrote down and what you kept.' },
  { id: 'releases', label: 'Releases',      color: '#c084fc',          hint: 'Albums, books, films and chapters from people you follow.' },
  { id: 'events',   label: 'Events & tickets', color: '#38bdf8',       hint: 'Tickets you hold, events you RSVP\'d to, club and Sanctuary events.' },
  { id: 'live',     label: 'Premieres & live', color: '#f43f5e',       hint: 'Premieres and pay-per-view from people you follow.' },
  { id: 'learning', label: 'Learning',      color: '#34d399',          hint: 'Live classes and homework due.' },
  { id: 'sports',   label: 'Your teams',    color: '#facc15',          hint: 'Games for the teams you follow.' },
  { id: 'worship',  label: 'Worship',       color: '#a3e635',          hint: 'Service times at churches you follow.' },
  { id: 'letters',  label: 'Letters',       color: '#fb923c',          hint: 'Sealed letters opening and letters in transit.' },
  { id: 'google',   label: 'Google',        color: '#60a5fa',          hint: 'Your connected Google Calendar.' },
];
export const layerColor = (l: CalLayer) => CAL_LAYERS.find((x) => x.id === l)?.color ?? 'var(--pj-orange)';

export type CalSource = 'manual' | 'platform' | 'google' | 'letter' | 'import';

/** Where tapping an item should take you. */
export type CalOpen =
  | { kind: 'profile'; uid: string }
  | { kind: 'navigate'; target: string; params?: Record<string, unknown> }
  | { kind: 'url'; href: string }
  | { kind: 'letter'; correspondenceId: string };

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  /** Zone the event was authored in — shown beside the viewer's local time when they differ. */
  tz?: string;
  location?: string;
  notes?: string;
  layer: CalLayer;
  source: CalSource;
  recurrence?: Recurrence;
  until?: number;
  exdates?: number[];
  /** Minutes before start. */
  reminders?: number[];
  /** Platform items: who it is from. */
  byName?: string;
  byPhoto?: string;
  byUid?: string;
  image?: string;
  kindLabel?: string;
  open?: CalOpen;
  /** Stable key of the platform item this was kept from, so "keep" is idempotent. */
  sourceKey?: string;
  readOnly?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface CalendarPrefs {
  hiddenLayers: CalLayer[];
  /** Platform items the person dismissed ("not for me"). */
  hiddenKeys: string[];
  /** Creators whose releases the person never wants on the calendar. */
  mutedCreators: string[];
  weekStartsOn: 0 | 1;
  defaultView: 'month' | 'week' | 'agenda';
  updatedAt: number;
}

export const DEFAULT_CAL_PREFS: CalendarPrefs = {
  hiddenLayers: [],
  hiddenKeys: [],
  mutedCreators: [],
  weekStartsOn: 1,
  defaultView: 'month',
  updatedAt: 0,
};

/* ── Mine: CRUD ────────────────────────────────────────────────────────────── */

const eventsCol = (uid: string) => collection(db, 'users', uid, 'calendar_events');
const prefsDoc = (uid: string) => doc(db, 'users', uid, 'calendar_prefs', 'settings');

/** Firestore throws on undefined values; strip them before every write. */
function clean<T extends object>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = v;
  return out;
}

export function listenMyEvents(cb: (events: CalendarEvent[]) => void): () => void {
  const uid = auth.currentUser?.uid;
  if (!uid) { cb([]); return () => {}; }
  return onSnapshot(
    query(eventsCol(uid), limit(2000)),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as CalendarEvent), id: d.id }))),
    (err) => { console.warn('[Calendar] events listener failed:', err); cb([]); },
  );
}

export const newEventId = () => `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export async function saveEvent(ev: CalendarEvent): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in to save to your calendar.');
  const now = Date.now();
  const { readOnly: _r, ...rest } = ev;
  await setDoc(doc(eventsCol(uid), ev.id), clean({
    ...rest,
    tz: ev.tz ?? localZone(),
    layer: ev.layer === 'google' ? 'mine' : ev.layer,
    createdAt: ev.createdAt ?? now,
    updatedAt: now,
  }));
}

export async function deleteEvent(id: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await deleteDoc(doc(eventsCol(uid), id));
}

/** Remove one occurrence of a repeating event without touching the rest of the series. */
export async function skipOccurrence(ev: CalendarEvent, occurrenceStart: number): Promise<void> {
  await saveEvent({ ...ev, exdates: [...(ev.exdates ?? []), occurrenceStart] });
}

/**
 * Keep a platform item: copies it into My calendar so it survives an unfollow,
 * gets reminders, and appears in the ICS subscription. Idempotent by sourceKey.
 */
export async function keepPlatformItem(ev: CalendarEvent): Promise<void> {
  const key = ev.sourceKey ?? ev.id;
  const id = `kept_${key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)}`;
  await saveEvent({ ...ev, id, source: 'platform', sourceKey: key, readOnly: undefined, reminders: ev.reminders ?? [60] });
}

/* ── Prefs ─────────────────────────────────────────────────────────────────── */

export async function loadCalendarPrefs(): Promise<CalendarPrefs> {
  const uid = auth.currentUser?.uid;
  if (!uid) return DEFAULT_CAL_PREFS;
  try {
    const snap = await getDoc(prefsDoc(uid));
    return snap.exists() ? { ...DEFAULT_CAL_PREFS, ...(snap.data() as Partial<CalendarPrefs>) } : DEFAULT_CAL_PREFS;
  } catch {
    return DEFAULT_CAL_PREFS;
  }
}

export async function saveCalendarPrefs(patch: Partial<Omit<CalendarPrefs, 'updatedAt'>>): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await setDoc(prefsDoc(uid), clean({ ...patch, updatedAt: Date.now() }), { merge: true });
  } catch (err) {
    console.warn('[Calendar] prefs save failed:', err);
  }
}

/* ── Plajah layer: the auto-populated feed ─────────────────────────────────── */

const chunk = <T,>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch (err) { console.warn(`[Calendar] ${label} unavailable:`, (err as Error)?.message ?? err); return fallback; }
}

interface Person { name: string; photo?: string }
const peopleCache = new Map<string, Person>();
async function people(uids: string[]): Promise<Map<string, Person>> {
  const missing = [...new Set(uids)].filter((u) => u && !peopleCache.has(u)).slice(0, 60);
  await Promise.all(missing.map(async (u) => {
    try {
      const s = await getDoc(doc(db, 'users', u));
      const d = s.exists() ? (s.data() as { displayName?: string; photoURL?: string }) : {};
      peopleCache.set(u, { name: d.displayName || 'A creator', photo: d.photoURL || undefined });
    } catch { peopleCache.set(u, { name: 'A creator' }); }
  }));
  return peopleCache;
}

const KIND_LABEL: Record<string, string> = {
  MUSIC: 'Album release', BOOK: 'Book release', MOVIE: 'Film release', VIDEO: 'Video release', PODCAST: 'Podcast release',
};

const WEEKDAY_INDEX: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

/** "10:00 AM" / "18:30" → minutes after midnight. */
function clockMinutes(s: string): number | null {
  const m = String(s).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = +m[1];
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + (m[2] ? +m[2] : 0);
}

let feedCache: { uid: string; at: number; from: number; to: number; items: CalendarEvent[] } | null = null;

/**
 * Everything the platform knows is on the person's calendar between from and to.
 * Cached for five minutes per range; pass force to refetch.
 */
export async function fetchPlatformFeed(from: number, to: number, force = false): Promise<CalendarEvent[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  if (!force && feedCache && feedCache.uid === uid && Date.now() - feedCache.at < 5 * MIN && feedCache.from <= from && feedCache.to >= to) {
    return feedCache.items.filter((e) => e.end > from && e.start < to);
  }
  // Fetch a generous window so paging a month either way is instant.
  const wFrom = Math.min(from, Date.now() - 45 * DAY);
  const wTo = Math.max(to, Date.now() + 120 * DAY);

  const following = await safe('follows', fetchFollowingIds(uid, 500), [] as string[]);
  const authorChunks = chunk(following.slice(0, 300), 10);
  const inRange = (t: number) => t >= wFrom && t <= wTo;
  const now = Date.now();

  const [releases, premieres, ppv, clubEvents, sanctuary, tickets, publicEvents, classes, due, worship, sports] = await Promise.all([
    // Releases from followed creators — albums carry music, books and films alike.
    safe('releases', Promise.all(authorChunks.map((a) =>
      getDocs(query(collection(db, 'albums'), where('ownerId', 'in', a), where('isScheduled', '==', true), limit(40)))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) })))),
    ).then((r) => r.flat()), [] as Record<string, any>[]),
    // Premieres the person asked to be reminded about, plus followed creators' premieres.
    safe('premieres', Promise.all([
      getDocs(query(collection(db, 'videos'), where('premiereConfig.remindUserIds', 'array-contains', uid), limit(40))),
      ...authorChunks.slice(0, 6).map((a) => getDocs(query(collection(db, 'videos'), where('ownerId', 'in', a), where('premiereConfig.status', '==', 'SCHEDULED'), limit(20)))),
    ]).then((snaps) => snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) })))), [] as Record<string, any>[]),
    // Pay-per-view: bought, or upcoming from people you follow (same shape as the feed cards).
    safe('ppv', Promise.all([
      getDocs(query(collection(db, 'ppv_events'), where('purchasedBy', 'array-contains', uid), limit(40))),
      ...authorChunks.slice(0, 6).map((a) => getDocs(query(collection(db, 'ppv_events'), where('ownerId', 'in', a), where('status', '==', 'UPCOMING'), limit(10)))),
    ]).then((snaps) => snaps.flatMap((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) })))), [] as Record<string, any>[]),
    safe('clubEvents', getDocs(query(collection(db, 'clubEvents'), where('attendeeIds', 'array-contains', uid), limit(80)))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))), [] as Record<string, any>[]),
    safe('sanctuaryEvents', getDocs(query(collection(db, 'sanctuaryEvents'), where('attendeeIds', 'array-contains', uid), limit(80)))
      .then((s) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, any>) }))), [] as Record<string, any>[]),
    safe('tickets', fetchMyTickets(), [] as any[]),
    safe('publicEvents', fetchPublicEvents(), [] as any[]),
    safe('classes', (async () => {
      const rooms = await getDocs(query(collection(db, 'classrooms'), where('enrolledStudents', 'array-contains', uid), limit(30)));
      const names = new Map(rooms.docs.map((d) => [d.id, String(d.data().title ?? 'Class')]));
      const sessions = await Promise.all(chunk([...names.keys()], 10).map((ids) =>
        getDocs(query(collection(db, 'liveClassSessions'), where('classroomId', 'in', ids), limit(60)))));
      return sessions.flatMap((s) => s.docs.map((d) => ({ id: d.id, className: names.get(String(d.data().classroomId)) ?? 'Class', ...(d.data() as Record<string, any>) })));
    })(), [] as Record<string, any>[]),
    safe('due', import('../assignmentTemplateService').then((m) => m.fetchStudentDueWork(uid, 40)), [] as any[]),
    safe('worship', (async () => {
      const follows = await getDocs(query(collection(db, 'orgFollowers'), where('userId', '==', uid), limit(20)));
      const orgIds = [...new Set(follows.docs.map((d) => String(d.data().orgId ?? '')).filter(Boolean))].slice(0, 10);
      const orgs = await Promise.all(orgIds.map((id) => getDoc(doc(db, 'organizations', id))));
      return orgs.filter((o) => o.exists()).map((o) => ({ id: o.id, ...(o.data() as Record<string, any>) }));
    })(), [] as Record<string, any>[]),
    safe('sports', (async () => {
      const [{ loadFollowedTeams }, { fetchFollowedSchedule }] = await Promise.all([
        import('../sportsPersonalization'), import('../followedTeamSchedule'),
      ]);
      const teams = loadFollowedTeams(localStorage, uid);
      if (!teams.length) return [];
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 8000);
      try { return (await fetchFollowedSchedule(teams, ctl.signal)).games; } finally { clearTimeout(t); }
    })(), [] as any[]),
  ]);

  const ownerUids = [
    ...releases.map((r) => String(r.ownerId ?? '')),
    ...premieres.map((r) => String(r.ownerId ?? r.uploaderId ?? '')),
    ...ppv.map((r) => String(r.ownerId ?? '')),
  ];
  const who = await people(ownerUids);
  const items: CalendarEvent[] = [];
  const push = (e: CalendarEvent) => { if (inRange(e.start) || (e.recurrence && e.recurrence !== 'none')) items.push(e); };

  for (const a of releases) {
    if (a.isPrivate === true) continue;
    const t = releaseMs(a.releaseDate);
    if (!t) continue;
    const by = who.get(String(a.ownerId));
    push({
      id: `p:release:${a.id}`, sourceKey: `release:${a.id}`, title: String(a.title ?? 'New release'),
      start: t, end: t + 30 * MIN, allDay: false, layer: 'releases', source: 'platform', readOnly: true,
      kindLabel: KIND_LABEL[String(a.type)] ?? 'Release', byName: by?.name, byPhoto: by?.photo, byUid: a.ownerId,
      image: a.coverUrl || a.coverImage || a.artworkUrl || undefined,
      open: a.ownerId ? { kind: 'profile', uid: String(a.ownerId) } : undefined,
    });
    // Serial chapters — each drop is its own moment.
    for (const ch of Array.isArray(a.chapterSchedule) ? a.chapterSchedule.slice(0, 40) : []) {
      const ct = releaseMs(ch?.releaseAt);
      if (!ct) continue;
      push({
        id: `p:chapter:${a.id}:${ct}`, sourceKey: `chapter:${a.id}:${ct}`, title: `${a.title ?? 'Serial'} — ${ch.title ?? 'new chapter'}`,
        start: ct, end: ct + 30 * MIN, allDay: false, layer: 'releases', source: 'platform', readOnly: true,
        kindLabel: 'Chapter drop', byName: by?.name, byPhoto: by?.photo, byUid: a.ownerId,
        open: a.ownerId ? { kind: 'profile', uid: String(a.ownerId) } : undefined,
      });
    }
  }

  const seenVideo = new Set<string>();
  for (const v of premieres) {
    if (seenVideo.has(v.id)) continue;
    seenVideo.add(v.id);
    const t = releaseMs(v.premiereStartTime ?? v.releaseDate);
    if (!t) continue;
    const owner = String(v.ownerId ?? v.uploaderId ?? '');
    const by = who.get(owner);
    const dur = Number(v.duration) > 0 ? Number(v.duration) * 1000 : HOUR;
    push({
      id: `p:premiere:${v.id}`, sourceKey: `premiere:${v.id}`, title: `Premiere: ${v.title ?? 'New video'}`,
      start: t, end: t + Math.min(dur, 4 * HOUR), allDay: false, layer: 'live', source: 'platform', readOnly: true,
      kindLabel: 'Premiere', byName: by?.name, byPhoto: by?.photo, byUid: owner, image: v.thumbnailUrl || undefined,
      open: owner ? { kind: 'profile', uid: owner } : undefined,
    });
  }

  const seenPpv = new Set<string>();
  for (const p of ppv) {
    if (seenPpv.has(p.id)) continue;
    seenPpv.add(p.id);
    const t = releaseMs(p.startTime);
    if (!t) continue;
    const bought = Array.isArray(p.purchasedBy) && p.purchasedBy.includes(uid);
    const by = who.get(String(p.ownerId));
    push({
      id: `p:ppv:${p.id}`, sourceKey: `ppv:${p.id}`, title: String(p.title ?? 'Live event'),
      start: t, end: t + 2 * HOUR, allDay: false, layer: bought ? 'events' : 'live', source: 'platform', readOnly: true,
      kindLabel: bought ? 'Your ticket · pay-per-view' : 'Pay-per-view', byName: by?.name, byPhoto: by?.photo, byUid: p.ownerId,
      image: p.thumbnailUrl || p.coverUrl || undefined,
      open: p.ownerId ? { kind: 'profile', uid: String(p.ownerId) } : undefined,
    });
  }

  for (const e of clubEvents) {
    const t = releaseMs(e.scheduledAt);
    if (!t) continue;
    const film = String(e.clubId ?? '').startsWith('film_');
    push({
      id: `p:club:${e.id}`, sourceKey: `club:${e.id}`, title: String(e.title ?? 'Club event'),
      start: t, end: t + (Number(e.durationMinutes) || 90) * MIN, allDay: false, layer: 'events', source: 'platform', readOnly: true,
      kindLabel: film ? 'Film premiere · you\'re going' : e.type === 'WATCH_PARTY' ? 'Watch party · you\'re going' : e.type === 'LIVE_TALK' ? 'Live Talk · you\'re going' : 'Club event · you\'re going',
      location: e.location || undefined,
    });
  }
  for (const e of sanctuary) {
    const t = releaseMs(e.scheduledAt);
    if (!t) continue;
    push({
      id: `p:sanctuary:${e.id}`, sourceKey: `sanctuary:${e.id}`, title: String(e.title ?? 'Sanctuary event'),
      start: t, end: t + (Number(e.durationMinutes) || 60) * MIN, allDay: false, layer: 'events', source: 'platform', readOnly: true,
      kindLabel: 'Sanctuary · you\'re going', open: { kind: 'navigate', target: 'SANCTUARY_HUB' },
    });
  }

  // Tickets carry no date of their own — join them to the public event they admit you to.
  const evById = new Map<string, any>(publicEvents.map((e: any) => [String(e.id ?? e.eventId ?? ''), e]));
  const ticketEventIds = new Set<string>();
  for (const tk of tickets) {
    const ev = evById.get(String(tk.eventId ?? ''));
    if (!ev || ticketEventIds.has(String(tk.eventId))) continue;
    ticketEventIds.add(String(tk.eventId));
    const t = releaseMs(ev.startDate);
    if (!t) continue;
    push({
      id: `p:ticket:${tk.eventId}`, sourceKey: `event:${tk.eventId}`, title: String(ev.title ?? 'Event'),
      start: t, end: releaseMs(ev.endDate) || t + 3 * HOUR, allDay: false, tz: ev.timezone || undefined,
      layer: 'events', source: 'platform', readOnly: true, kindLabel: 'You have a ticket',
      location: [ev.venueName, ev.city].filter(Boolean).join(', ') || undefined, image: ev.coverImage || ev.imageUrl || undefined,
      open: ev.creatorUid ? { kind: 'profile', uid: String(ev.creatorUid) } : undefined,
    });
  }
  // Public events from people you follow, even before you buy.
  const followSet = new Set(following);
  for (const ev of publicEvents) {
    const id = String(ev.id ?? '');
    if (!id || ticketEventIds.has(id) || !followSet.has(String(ev.creatorUid ?? ''))) continue;
    const t = releaseMs(ev.startDate);
    if (!t) continue;
    push({
      id: `p:event:${id}`, sourceKey: `event:${id}`, title: String(ev.title ?? 'Event'),
      start: t, end: releaseMs(ev.endDate) || t + 3 * HOUR, allDay: false, tz: ev.timezone || undefined,
      layer: 'events', source: 'platform', readOnly: true, kindLabel: 'On sale · from someone you follow',
      location: [ev.venueName, ev.city].filter(Boolean).join(', ') || undefined, image: ev.coverImage || ev.imageUrl || undefined,
      open: ev.creatorUid ? { kind: 'profile', uid: String(ev.creatorUid) } : undefined,
    });
  }

  for (const s of classes) {
    if (s.status === 'ENDED') continue;
    const t = releaseMs(s.scheduledAt);
    if (!t) continue;
    push({
      id: `p:class:${s.id}`, sourceKey: `class:${s.id}`, title: String(s.title ?? s.className),
      start: t, end: t + (Number(s.durationMinutes) || 60) * MIN, allDay: false, layer: 'learning', source: 'platform', readOnly: true,
      kindLabel: `Live class · ${s.className}`, open: { kind: 'navigate', target: 'ACADEMIA_COURSES' },
    });
  }
  for (const d of due) {
    if (!d?.dueDate) continue;
    push({
      id: `p:due:${d.assignmentId}`, sourceKey: `due:${d.assignmentId}`, title: `Due: ${d.title}`,
      start: d.dueDate, end: d.dueDate + 30 * MIN, allDay: false, layer: 'learning', source: 'platform', readOnly: true,
      kindLabel: d.overdue ? `Overdue · ${d.className}` : `Homework · ${d.className}`, open: { kind: 'navigate', target: 'ACADEMIA_HOME' },
    });
  }

  // Church service times are weekly wall-clock strings — expand them as repeating events.
  for (const org of worship) {
    for (const st of Array.isArray(org.serviceTimes) ? org.serviceTimes.slice(0, 8) : []) {
      const wd = WEEKDAY_INDEX[String(st.day ?? '').toLowerCase()];
      const mins = clockMinutes(String(st.time ?? ''));
      if (wd === undefined || mins === null) continue;
      const base = startOfDay(now);
      const first = addDays(base, (wd - base.getDay() + 7) % 7);
      first.setMinutes(mins);
      items.push({
        id: `p:worship:${org.id}:${st.id ?? wd}`, sourceKey: `worship:${org.id}:${st.id ?? wd}`,
        title: `${st.label || 'Service'} · ${org.name ?? 'Church'}`, start: first.getTime(), end: first.getTime() + 90 * MIN,
        allDay: false, recurrence: 'weekly', layer: 'worship', source: 'platform', readOnly: true,
        kindLabel: st.isOnline ? 'Service · online' : 'Service', location: org.address || org.city || undefined,
      });
    }
  }

  for (const g of sports) {
    const t = Date.parse(g?.event?.date ?? '');
    if (!Number.isFinite(t)) continue;
    push({
      id: `p:game:${g.id}`, sourceKey: `game:${g.id}`, title: String(g.event?.shortName || g.event?.name || 'Game'),
      start: t, end: t + 3 * HOUR, allDay: false, layer: 'sports', source: 'platform', readOnly: true,
      kindLabel: g.league, open: g.detailUrl ? { kind: 'url', href: g.detailUrl } : undefined,
    });
  }

  feedCache = { uid, at: Date.now(), from: wFrom, to: wTo, items };
  return items.filter((e) => (e.recurrence && e.recurrence !== 'none') || (e.end > from && e.start < to));
}

export function invalidatePlatformFeed(): void { feedCache = null; }

/* ── Google layer ──────────────────────────────────────────────────────────── */

async function authedFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken(!retry);
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && retry) return authedFetch(path, init, false);
  return res;
}

export interface GoogleCalendarState {
  events: CalendarEvent[];
  /** Accounts connected before calendar access existed need one more consent. */
  needsCalendarConsent: string[];
  configured: boolean;
}

export async function fetchGoogleEvents(from: number, to: number): Promise<GoogleCalendarState> {
  try {
    const res = await authedFetch(`/api/postman/calendar/events?from=${from}&to=${to}`);
    if (res.status === 503) return { events: [], needsCalendarConsent: [], configured: false };
    if (!res.ok) return { events: [], needsCalendarConsent: [], configured: true };
    const body = await res.json() as { events?: CalendarEvent[]; needsCalendarConsent?: string[] };
    return {
      events: (body.events ?? []).map((e) => ({ ...e, layer: 'google' as const, source: 'google' as const, readOnly: true })),
      needsCalendarConsent: body.needsCalendarConsent ?? [],
      configured: true,
    };
  } catch {
    return { events: [], needsCalendarConsent: [], configured: false };
  }
}

/** Writes an event into the person's primary Google Calendar. */
export async function pushToGoogle(ev: CalendarEvent, accountId?: string): Promise<void> {
  const res = await authedFetch('/api/postman/calendar/events', {
    method: 'POST',
    body: JSON.stringify({
      accountId, title: ev.title, start: ev.start, end: ev.end, allDay: ev.allDay,
      location: ev.location, notes: ev.notes, tz: ev.tz ?? localZone(), recurrence: ev.recurrence ?? 'none',
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || 'Google Calendar did not accept that event.');
  }
}

/** The person's private ICS subscription URL (Apple Calendar, Outlook, Google "From URL"). */
export async function fetchFeedUrl(): Promise<{ url: string | null; reason?: string }> {
  try {
    const res = await authedFetch('/api/postman/calendar/feed-url');
    const body = await res.json().catch(() => null) as { url?: string; error?: string } | null;
    if (!res.ok || !body?.url) return { url: null, reason: body?.error || 'Calendar subscriptions are not set up on this server.' };
    return { url: body.url };
  } catch {
    return { url: null, reason: 'Could not reach the server.' };
  }
}
