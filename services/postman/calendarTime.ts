/**
 * The Post Man — calendar time engine.
 *
 * Pure functions, no Firestore, no React: date math for the grid, recurrence
 * expansion, a natural-language quick-add parser, and ICS read/write. Kept pure
 * so the server's ICS feed and the client calendar format time identically.
 *
 * Every instant is stored as epoch milliseconds (UTC). Rendering converts to the
 * viewer's zone; an event also remembers the zone it was created in (`tz`) so a
 * creator in Lagos announcing "8pm" reads as 8pm Lagos everywhere, with the
 * viewer's local time beside it. That one detail removes the most common
 * calendar frustration on a global creator platform: "8pm WHOSE time?".
 */

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

/* ── Grid math ─────────────────────────────────────────────────────────────── */

export const startOfDay = (t: number | Date): Date => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const addDays = (d: Date, n: number): Date => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};

export const addMonths = (d: Date, n: number): Date => {
  const out = new Date(d);
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  // Jan 31 + 1 month is Feb 28/29, not Mar 3.
  const last = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, last));
  return out;
};

/** Monday-first week start. */
export const startOfWeek = (t: number | Date, weekStartsOn = 1): Date => {
  const d = startOfDay(t);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  return addDays(d, -diff);
};

export const sameDay = (a: number | Date, b: number | Date): boolean =>
  startOfDay(a).getTime() === startOfDay(b).getTime();

/** Six full weeks covering a month — the grid never changes height between months. */
export function monthGrid(anchor: Date, weekStartsOn = 1): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const dayKey = (t: number | Date): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/* ── Recurrence ────────────────────────────────────────────────────────────── */

export interface Occurrable {
  id: string;
  start: number;
  end: number;
  recurrence?: Recurrence;
  /** Last instant an occurrence may START (inclusive). */
  until?: number;
  /** Occurrence starts the user deleted individually. */
  exdates?: number[];
}

function step(d: Date, r: Recurrence): Date {
  switch (r) {
    case 'daily': return addDays(d, 1);
    case 'weekdays': {
      let n = addDays(d, 1);
      while (n.getDay() === 0 || n.getDay() === 6) n = addDays(n, 1);
      return n;
    }
    case 'weekly': return addDays(d, 7);
    case 'monthly': return addMonths(d, 1);
    case 'yearly': return addMonths(d, 12);
    default: return new Date(8.64e15);
  }
}

/**
 * Occurrences of `ev` that overlap [from, to). Each copy keeps the series id and
 * gets `occurrenceStart` so an edit/delete can target one instance. Capped so a
 * malformed "daily since 1970" can never lock the tab.
 */
export function expandOccurrences<T extends Occurrable>(
  ev: T, from: number, to: number,
): Array<T & { occurrenceStart: number }> {
  const r = ev.recurrence ?? 'none';
  const dur = Math.max(0, ev.end - ev.start);
  if (r === 'none') {
    return ev.start < to && ev.end > from ? [{ ...ev, occurrenceStart: ev.start }] : [];
  }
  const out: Array<T & { occurrenceStart: number }> = [];
  const ex = new Set(ev.exdates ?? []);
  const origin = new Date(ev.start);
  let cur = new Date(ev.start);
  for (let i = 0; i < 2000; i++) {
    // Months and years are computed from the ORIGIN, never by stepping the last
    // occurrence: stepping turns Jan 31 → Feb 28 → Mar 28 and the drift is permanent.
    if (r === 'monthly') cur = addMonths(origin, i);
    else if (r === 'yearly') cur = addMonths(origin, i * 12);
    const s = cur.getTime();
    if (s >= to || (ev.until && s > ev.until)) break;
    if (s + dur > from && !ex.has(s)) out.push({ ...ev, start: s, end: s + dur, occurrenceStart: s });
    if (r !== 'monthly' && r !== 'yearly') cur = step(cur, r);
  }
  return out;
}

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: 'Does not repeat',
  daily: 'Every day',
  weekdays: 'Every weekday',
  weekly: 'Every week',
  monthly: 'Every month',
  yearly: 'Every year',
};

/* ── Formatting ────────────────────────────────────────────────────────────── */

export const localZone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export function fmtTime(t: number, tz?: string): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

export function fmtRange(start: number, end: number, allDay?: boolean): string {
  if (allDay) {
    const days = Math.round((startOfDay(end - 1).getTime() - startOfDay(start).getTime()) / DAY) + 1;
    return days > 1 ? `All day · ${days} days` : 'All day';
  }
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

/** Short zone label for a time in a given zone, e.g. "GMT+1" or "PDT". */
export function zoneAbbrev(t: number, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(t));
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz;
  } catch { return tz; }
}

/** "in 3 days", "tomorrow", "in 40 min" — the countdown column on release cards. */
export function relativeWhen(t: number, now = Date.now()): string {
  const diff = t - now;
  const abs = Math.abs(diff);
  const past = diff < 0;
  if (abs < MIN) return 'now';
  if (abs < HOUR) { const m = Math.round(abs / MIN); return past ? `${m} min ago` : `in ${m} min`; }
  if (sameDay(t, now)) { const h = Math.round(abs / HOUR); return past ? `${h}h ago` : `in ${h}h`; }
  const days = Math.round((startOfDay(t).getTime() - startOfDay(now).getTime()) / DAY);
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  if (days > 1 && days < 7) return `in ${days} days`;
  if (days < -1 && days > -7) return `${-days} days ago`;
  if (days >= 7 && days < 60) return `in ${Math.round(days / 7)} wk`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ── Natural-language quick add ────────────────────────────────────────────── */

export interface ParsedQuickAdd {
  title: string;
  start: number;
  end: number;
  allDay: boolean;
  recurrence: Recurrence;
  location?: string;
  /** True when the parser found an explicit date or time. */
  confident: boolean;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

const monthIndex = (w: string): number => {
  const s = w.toLowerCase().slice(0, 3);
  return MONTHS.findIndex((m) => m.startsWith(s));
};

/**
 * "Lunch with Ana friday 1pm at Café Nuit", "standup every weekday 9:30",
 * "Mom's birthday may 4", "dentist tomorrow 3-4pm", "call in 2 hours".
 *
 * Deliberately local and deterministic — no model call, no network. It runs on
 * every keystroke to preview the result, so it must be instant and it must
 * never invent something the user did not type. Anything it does not
 * recognise stays in the title.
 */
export function parseQuickAdd(input: string, now = new Date()): ParsedQuickAdd {
  // Sentence punctuation would hide "Oct 30." from the patterns below; commas stay
  // because "Oct 4, 2026" uses them.
  let text = ` ${input.trim().replace(/[.!?]+(?=\s|$)/g, '')} `;
  let date: Date | null = null;
  let hour: number | null = null;
  let minute = 0;
  let endHour: number | null = null;
  let endMinute = 0;
  let durationMin: number | null = null;
  // Widened on purpose: it is assigned inside the take() callbacks, which TS does not track.
  let recurrence = 'none' as Recurrence;
  let location: string | undefined;
  let confident = false;
  /** "fri 7pm" said on a Friday afternoon means tonight; "fri 1pm" said then means next week. */
  let weekdayIsToday = false;

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) { fn(m); text = text.replace(m[0], ' '); return true; }
    return false;
  };

  // Recurrence first — "every friday" also implies the date.
  take(/\s(every\s+weekday|weekdays)\s/i, () => { recurrence = 'weekdays'; });
  take(/\s(every\s+day|daily)\s/i, () => { recurrence = 'daily'; });
  take(/\s(every\s+month|monthly)\s/i, () => { recurrence = 'monthly'; });
  take(/\s(every\s+year|yearly|annually)\s/i, () => { recurrence = 'yearly'; });
  take(/\s(?:every|each)\s+(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s/i, (m) => {
    recurrence = 'weekly';
    const idx = WEEKDAY_SHORT.indexOf(m[1].toLowerCase());
    const d = startOfDay(now);
    date = addDays(d, (idx - d.getDay() + 7) % 7);
  });
  take(/\s(every\s+week|weekly)\s/i, () => { recurrence = 'weekly'; });

  // Location: trailing "at <Place>" / "@ <Place>" where the place is not a time.
  take(/\s(?:@|at)\s+(?!\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b)(?!noon\b|midnight\b)([A-Z][^@]*?)\s*$/, (m) => { location = m[1].trim(); });

  // Relative offsets.
  take(/\sin\s+(\d+)\s*(min(?:ute)?s?|h(?:ou)?rs?|days?|weeks?)\s/i, (m) => {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const base = new Date(now);
    if (unit.startsWith('m')) { base.setMinutes(base.getMinutes() + n); hour = base.getHours(); minute = base.getMinutes(); date = startOfDay(base); }
    else if (unit.startsWith('h')) { base.setHours(base.getHours() + n); hour = base.getHours(); minute = base.getMinutes(); date = startOfDay(base); }
    else if (unit.startsWith('d')) date = addDays(startOfDay(now), n);
    else date = addDays(startOfDay(now), n * 7);
    confident = true;
  });

  // Named days.
  take(/\s(today|tonight)\s/i, (m) => { date = startOfDay(now); if (m[1].toLowerCase() === 'tonight' && hour === null) hour = 19; confident = true; });
  take(/\s(tomorrow|tmrw|tmr)\s/i, () => { date = addDays(startOfDay(now), 1); confident = true; });
  take(/\s(?:(next)\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s/i, (m) => {
    const idx = WEEKDAY_SHORT.indexOf(m[2].toLowerCase());
    const d = startOfDay(now);
    let diff = (idx - d.getDay() + 7) % 7;
    if (diff === 0 && !m[1]) weekdayIsToday = true;
    if (diff === 0 && m[1]) diff = 7;
    else if (m[1] && diff < 7) diff += 7;
    date = addDays(d, diff);
    confident = true;
  });
  take(/\snext\s+week\s/i, () => { date = addDays(startOfWeek(now), 7); confident = true; });

  // Absolute dates: "may 4", "4 may", "5/14", "2026-11-02".
  take(/\s(\d{4})-(\d{1,2})-(\d{1,2})\s/, (m) => { date = new Date(+m[1], +m[2] - 1, +m[3]); confident = true; });
  take(/\s(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\s/i, (m) => {
    date = new Date(m[3] ? +m[3] : now.getFullYear(), monthIndex(m[1]), +m[2]);
    if (!m[3] && date.getTime() < startOfDay(now).getTime()) date.setFullYear(date.getFullYear() + 1);
    confident = true;
  });
  take(/\s(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\s/i, (m) => {
    date = new Date(m[3] ? +m[3] : now.getFullYear(), monthIndex(m[2]), +m[1]);
    if (!m[3] && date.getTime() < startOfDay(now).getTime()) date.setFullYear(date.getFullYear() + 1);
    confident = true;
  });
  take(/\s(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m) => {
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    date = new Date(y, +m[1] - 1, +m[2]);
    if (!m[3] && date.getTime() < startOfDay(now).getTime()) date.setFullYear(date.getFullYear() + 1);
    confident = true;
  });

  // Times: "3-4pm", "9:30", "1pm", "noon", "for 2 hours".
  const to24 = (h: number, ap?: string) => {
    const a = ap?.toLowerCase();
    if (a === 'pm' && h < 12) return h + 12;
    if (a === 'am' && h === 12) return 0;
    return h;
  };
  take(/\s(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s/i, (m) => {
    const ap1 = m[3] ?? m[6];
    hour = to24(+m[1], ap1); minute = m[2] ? +m[2] : 0;
    endHour = to24(+m[4], m[6]); endMinute = m[5] ? +m[5] : 0;
    confident = true;
  });
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s/i, (m) => { hour = to24(+m[1], m[3]); minute = m[2] ? +m[2] : 0; confident = true; });
  take(/\s(?:at\s+)?(\d{1,2}):(\d{2})\s/, (m) => { hour = +m[1]; minute = +m[2]; confident = true; });
  take(/\s(?:at\s+)?noon\s/i, () => { hour = 12; minute = 0; confident = true; });
  take(/\s(?:at\s+)?midnight\s/i, () => { hour = 0; minute = 0; confident = true; });
  take(/\s(morning)\s/i, () => { if (hour === null) hour = 9; });
  take(/\s(afternoon)\s/i, () => { if (hour === null) hour = 14; });
  take(/\s(evening)\s/i, () => { if (hour === null) hour = 18; });
  take(/\sfor\s+(\d+(?:\.\d+)?)\s*(h(?:ou)?rs?|min(?:ute)?s?)\s/i, (m) => {
    durationMin = m[2].toLowerCase().startsWith('h') ? Math.round(+m[1] * 60) : +m[1];
  });
  take(/\sall\s+day\s/i, () => { hour = null; });

  // "Birthday" and "anniversary" repeat yearly unless told otherwise.
  if (recurrence === 'none' && /\b(birthday|anniversary)\b/i.test(text)) recurrence = 'yearly';

  let day: Date = date ?? startOfDay(now);
  // Weekday-only series never start on a weekend.
  if (recurrence === 'weekdays') while (day.getDay() === 0 || day.getDay() === 6) day = addDays(day, 1);
  const allDay = hour === null;
  let start: number;
  let end: number;
  if (allDay) {
    start = day.getTime();
    end = addDays(day, 1).getTime();
  } else {
    const s = new Date(day);
    s.setHours(hour as unknown as number, minute, 0, 0);
    // A bare time that has already passed today means tomorrow ("call at 9am" at 3pm);
    // a weekday that is today but already past means next week.
    if (s.getTime() < now.getTime()) {
      if (!date) s.setDate(s.getDate() + (recurrence === 'weekdays' && (s.getDay() === 5) ? 3 : 1));
      else if (weekdayIsToday) s.setDate(s.getDate() + 7);
    }
    start = s.getTime();
    if (endHour !== null) {
      const e = new Date(s);
      e.setHours(endHour, endMinute, 0, 0);
      end = e.getTime() > start ? e.getTime() : start + HOUR;
    } else {
      end = start + (durationMin ?? 60) * MIN;
    }
  }

  const title = text.replace(/\s+/g, ' ').replace(/\s+(on|at|@)\s*$/i, '').trim();
  return { title: title || 'New event', start, end, allDay, recurrence, location, confident };
}

/**
 * Finds date-like phrases in a block of text — mail bodies, letters — so the
 * reader can offer "Add to calendar" without the user retyping anything.
 * Returns at most a few candidates, each with the sentence it came from.
 */
export function findDatesInText(body: string, now = new Date()): Array<{ phrase: string; parsed: ParsedQuickAdd }> {
  const sentences = body.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 80);
  const out: Array<{ phrase: string; parsed: ParsedQuickAdd }> = [];
  const hint = /\b(today|tonight|tomorrow|mon|tue|wed|thu|fri|sat|sun|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}(:\d{2})?\s*(am|pm)\b|\d{1,2}\/\d{1,2}/i;
  for (const s of sentences) {
    if (s.length > 220 || !hint.test(s)) continue;
    const parsed = parseQuickAdd(s, now);
    if (!parsed.confident || parsed.start < now.getTime() - DAY) continue;
    const title = parsed.title.length > 70 ? `${parsed.title.slice(0, 67)}…` : parsed.title;
    out.push({ phrase: s.trim(), parsed: { ...parsed, title } });
    if (out.length >= 3) break;
  }
  return out;
}

/* ── ICS ───────────────────────────────────────────────────────────────────── */

export interface IcsEvent {
  uid: string;
  title: string;
  start: number;
  end: number;
  allDay?: boolean;
  location?: string;
  description?: string;
  url?: string;
  recurrence?: Recurrence;
  until?: number;
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const icsStamp = (t: number) => new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDate = (t: number) => dayKey(t).replace(/-/g, '');

/** RFC 5545 line folding: 75 octets, continuation lines start with a space. */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? ' ' : '') + line.slice(i, i + 73));
  return parts.join('\r\n');
}

const RRULE: Partial<Record<Recurrence, string>> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
};

export function buildIcs(events: IcsEvent[], calName = 'Plajah'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plajah//The Post Man//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calName)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  const stamp = icsStamp(Date.now());
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@plajah.com`, `DTSTAMP:${stamp}`);
    if (e.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(e.end)}`);
    } else {
      lines.push(`DTSTART:${icsStamp(e.start)}`, `DTEND:${icsStamp(e.end)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    const rr = e.recurrence && RRULE[e.recurrence];
    if (rr) lines.push(`RRULE:${rr}${e.until ? `;UNTIL=${icsStamp(e.until)}` : ''}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Downloads a single-event .ics — "Add to Apple/Outlook calendar". */
export function downloadIcs(event: IcsEvent): void {
  const blob = new Blob([buildIcs([event], event.title)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${event.title.replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'event'}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Google Calendar "template" link — opens a pre-filled event, no OAuth needed. */
export function googleCalendarLink(e: IcsEvent): string {
  const fmt = (t: number) => (e.allDay ? icsDate(t) : icsStamp(t));
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${fmt(e.start)}/${fmt(e.end)}`,
  });
  if (e.description) p.set('details', e.description.slice(0, 1500));
  if (e.location) p.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Minimal ICS reader for importing a .ics file the user drops in. */
export function parseIcs(text: string): IcsEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const out: IcsEvent[] = [];
  const blocks = unfolded.split('BEGIN:VEVENT').slice(1);
  const parseStamp = (v: string): { t: number; allDay: boolean } => {
    const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
    if (!m) return { t: NaN, allDay: false };
    if (!m[4]) return { t: new Date(+m[1], +m[2] - 1, +m[3]).getTime(), allDay: true };
    const args = [+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]] as const;
    return { t: m[7] ? Date.UTC(...args) : new Date(...args).getTime(), allDay: false };
  };
  const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  for (const b of blocks.slice(0, 2000)) {
    const get = (key: string) => {
      const m = b.match(new RegExp(`^${key}(?:;[^:\\r\\n]*)?:(.*)$`, 'm'));
      return m ? m[1].trim() : undefined;
    };
    const s = get('DTSTART');
    if (!s) continue;
    const start = parseStamp(s);
    const e = get('DTEND');
    const end = e ? parseStamp(e) : { t: start.t + (start.allDay ? DAY : HOUR), allDay: start.allDay };
    if (Number.isNaN(start.t)) continue;
    const rr = get('RRULE') ?? '';
    const freq = rr.match(/FREQ=(\w+)/)?.[1];
    const recurrence: Recurrence =
      freq === 'DAILY' ? 'daily'
      : freq === 'WEEKLY' ? (/BYDAY=MO,TU,WE,TH,FR/.test(rr) ? 'weekdays' : 'weekly')
      : freq === 'MONTHLY' ? 'monthly'
      : freq === 'YEARLY' ? 'yearly' : 'none';
    out.push({
      uid: get('UID') ?? `ics-${out.length}-${start.t}`,
      title: unesc(get('SUMMARY') ?? 'Untitled'),
      start: start.t,
      end: Number.isNaN(end.t) ? start.t + HOUR : end.t,
      allDay: start.allDay,
      location: get('LOCATION') ? unesc(get('LOCATION')!) : undefined,
      description: get('DESCRIPTION') ? unesc(get('DESCRIPTION')!) : undefined,
      recurrence,
    });
  }
  return out;
}
