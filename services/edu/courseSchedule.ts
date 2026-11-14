// Laying lesson-library items out on a course calendar: which days the class meets, how a batch of
// items spreads over them, and the month grid the Lesson Library's Schedule step and Course calendar draw.
// Pure (no Firebase), so the tests and both Christian Ed and Academia can use it.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_MS = 86_400_000;

/** First weekday named in the schedule text ("Sundays · 9:15 AM"), or -1. */
export function scheduleWeekday(schedule?: string): number {
  const s = (schedule || '').toLowerCase();
  let best = -1;
  let at = Infinity;
  DAYS.forEach((d, i) => {
    const k = s.indexOf(d);
    if (k >= 0 && k < at) {
      at = k;
      best = i;
    }
  });
  return best;
}

/** Next occurrence (today counts) of a weekday at 9:00 local. */
export function nextWeekday(day: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(9, 0, 0, 0);
  const diff = (day - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d;
}

/** yyyy-mm-dd in local time (what <input type="date"> reads and writes). */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 9:00 local on a yyyy-mm-dd day. */
export const fromIsoDay = (s: string) => new Date(`${s}T09:00`);
export const sameDay = (a: Date, b: Date) => isoDay(a) === isoDay(b);

export type Cadence = 'meetings' | 'weekly' | 'daily' | 'same';

export const CADENCE_LABEL: Record<Cadence, string> = {
  meetings: 'One per class meeting',
  weekly: 'One a week',
  daily: 'One a day',
  same: 'All on one day',
};

/**
 * Due dates for `count` items starting on `start`:
 *   meetings → the class's meeting weekday (from its schedule text), every week from the first one on/after start;
 *   weekly   → start, start + 7 days, …;   daily → start, start + 1 day, …;   same → all on start.
 * A class with no weekday in its schedule falls back to weekly.
 */
export function spreadDates(count: number, start: Date, cadence: Cadence, meetingSchedule?: string): Date[] {
  const s = new Date(start);
  s.setHours(9, 0, 0, 0);
  const day = scheduleWeekday(meetingSchedule);
  const first = cadence === 'meetings' && day >= 0 ? nextWeekday(day, s) : s;
  const step = cadence === 'daily' ? 1 : cadence === 'same' ? 0 : 7;
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i * step);
    return d;
  });
}

/** When students first see an item due on `due`: `lead` days before it (0 = straight away). */
export function opensBefore(due: Date, leadDays: number): Date | null {
  if (!leadDays) return null;
  const d = new Date(due);
  d.setDate(d.getDate() - leadDays);
  return d;
}

export interface MonthCell {
  date: Date;
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  isMeeting: boolean;
}

/** Six weeks of days (Sunday first) covering the month that holds `anchor`. */
export function monthGrid(anchor: Date, meetingSchedule?: string, today = new Date()): MonthCell[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 9);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const day = scheduleWeekday(meetingSchedule);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { date: d, iso: isoDay(d), inMonth: d.getMonth() === anchor.getMonth(), isToday: sameDay(d, today), isMeeting: day >= 0 && d.getDay() === day };
  });
}

export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1, 9);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);
