// services/edu/assignmentPolicy.ts — when a student can see an assignment, when they can turn it in, and
// where the auto-scheduler puts lessons on a class calendar. Pure (no Firebase): the desk, the class page,
// the calendar and the tests all read the same answers. The database rules enforce the turn-in part on
// their own (firestore.ops.rules churchEduSubmissions), so this only explains it to the person.
//
// An assignment has three dates a teacher or staff member sets:
//   opensAt      — available: students can open it and work on it from here (before the class date)
//   scheduledFor — the class date it belongs to (what the calendar shows)
//   dueAt        — the last moment to turn it in
// and a rule for after the due date (afterDue): 'lock' (the default) — no turn-in unless the teacher grants
// the student an extension they asked for — or 'accept_late', which takes it and marks it late.

import { spreadDates, scheduleWeekday, nextWeekday, type Cadence } from './courseSchedule';

export type AfterDue = 'lock' | 'accept_late';
export const AFTER_DUE_LABEL: Record<AfterDue, string> = {
  lock: 'Lock — students ask for an extension',
  accept_late: 'Accept late work (marked late)',
};

export interface PolicyDates {
  opensAt?: number;
  scheduledFor?: number;
  dueAt: number;
  afterDue?: AfterDue;
  assignedByUid?: string;
}

export type ExtensionStatus = 'requested' | 'granted' | 'denied';
export interface ExtensionLike {
  status: ExtensionStatus;
  /** For a granted extension: the new last moment to turn in. */
  extendedUntil?: number;
}

export type TurnInState =
  | { kind: 'not_open'; opensAt: number }
  | { kind: 'open'; dueAt: number }
  | { kind: 'extended'; dueAt: number }
  | { kind: 'late_allowed'; dueAt: number }
  | { kind: 'locked'; dueAt: number; extension?: ExtensionStatus };

/** A few minutes' grace so a turn-in sent at the deadline isn't refused for clock drift. Matches the rules. */
export const DUE_GRACE_MS = 5 * 60_000;

export const afterDueOf = (a: Pick<PolicyDates, 'afterDue'>): AfterDue => (a.afterDue === 'accept_late' ? 'accept_late' : 'lock');

/** The deadline that counts for this student: an extension they were granted moves it. */
export function effectiveDue(a: Pick<PolicyDates, 'dueAt'>, ext?: ExtensionLike | null): number {
  return ext?.status === 'granted' && ext.extendedUntil && ext.extendedUntil > a.dueAt ? ext.extendedUntil : a.dueAt;
}

export function turnInState(a: PolicyDates, ext?: ExtensionLike | null, now = Date.now()): TurnInState {
  if (a.opensAt && a.opensAt > now) return { kind: 'not_open', opensAt: a.opensAt };
  const due = effectiveDue(a, ext);
  if (!a.dueAt || now <= due + DUE_GRACE_MS) return due > a.dueAt ? { kind: 'extended', dueAt: due } : { kind: 'open', dueAt: due };
  if (afterDueOf(a) === 'accept_late') return { kind: 'late_allowed', dueAt: due };
  return { kind: 'locked', dueAt: due, extension: ext?.status };
}

export const canTurnIn = (s: TurnInState) => s.kind === 'open' || s.kind === 'extended' || s.kind === 'late_allowed';
export const isLate = (a: PolicyDates, ext: ExtensionLike | null | undefined, at: number) => !!a.dueAt && at > effectiveDue(a, ext) + DUE_GRACE_MS;

/** Students see work from its open time; whoever assigned it always does. */
export const visibleTo = (a: Pick<PolicyDates, 'opensAt' | 'assignedByUid'>, uid: string, now = Date.now()) =>
  !a.opensAt || a.opensAt <= now || a.assignedByUid === uid;

// ── Auto-scheduler ────────────────────────────────────────────────────────────

export interface AutoScheduleOptions {
  /** Class meeting text ("Sundays · 9:15 AM"); its weekday is where lessons land. */
  meetingSchedule?: string;
  /** Class dates already taken by assigned work, so new lessons go after them. */
  taken: readonly number[];
  /** Earliest day to use (defaults to today). */
  from?: Date;
  cadence?: Cadence;
  /** Days before the class date that students can open it (0 = only from the class date). */
  leadDays: number;
  /** Due this many days after the class date (0 = due on the class date). */
  dueAfterDays: number;
  afterDue?: AfterDue;
}

export interface Slot { scheduledFor: number; opensAt: number | null; dueAt: number; afterDue: AfterDue }

const DAY = 86_400_000;
const atNine = (t: number) => { const d = new Date(t); d.setHours(9, 0, 0, 0); return d; };
/** 11:59 PM on the day of `t`: a due date means the end of that day. */
export const endOfDay = (t: number) => { const d = new Date(t); d.setHours(23, 59, 0, 0); return d.getTime(); };

/**
 * Dates for `count` lessons, in order: each on the class's next free meeting day after the last scheduled
 * one (or after `from`), one per meeting by default. Each opens `leadDays` before its class date and is due
 * `dueAfterDays` after it. A class with no meeting weekday is scheduled weekly from `from`.
 */
export function autoSchedule(count: number, o: AutoScheduleOptions, now = Date.now()): Slot[] {
  const fromDay = atNine((o.from || new Date(now)).getTime());
  const lastTaken = o.taken.length ? Math.max(...o.taken) : 0;
  let start = fromDay;
  if (lastTaken >= fromDay.getTime()) start = atNine(lastTaken + DAY);
  const cadence = o.cadence || 'meetings';
  const wd = scheduleWeekday(o.meetingSchedule);
  if (cadence === 'meetings' && wd >= 0) start = nextWeekday(wd, start);
  const takenDays = new Set(o.taken.map(t => atNine(t).getTime()));
  const out: Slot[] = [];
  let cursor = start;
  while (out.length < count) {
    // Never double up on a class date that already has work, unless every lesson is meant for one day.
    const need = count - out.length;
    for (const d of spreadDates(need, cursor, cadence, o.meetingSchedule)) {
      if (cadence !== 'same' && takenDays.has(d.getTime())) continue;
      const scheduledFor = d.getTime();
      const opens = o.leadDays > 0 ? scheduledFor - o.leadDays * DAY : null;
      out.push({ scheduledFor, opensAt: opens && opens > now ? opens : null, dueAt: endOfDay(scheduledFor + Math.max(0, o.dueAfterDays) * DAY), afterDue: o.afterDue || 'lock' });
      takenDays.add(scheduledFor);
      if (out.length >= count) break;
    }
    cursor = new Date(cursor.getTime() + (cadence === 'daily' ? 1 : 7) * DAY * Math.max(1, need));
  }
  return out;
}

/** The next free class date (for "schedule this one" from a right-click). */
export const nextFreeSlot = (o: AutoScheduleOptions, now = Date.now()): Slot => autoSchedule(1, o, now)[0];

export const fmtWhen = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const dueLabelFor = (dueAt: number) => `Due ${fmtWhen(dueAt)}`;
