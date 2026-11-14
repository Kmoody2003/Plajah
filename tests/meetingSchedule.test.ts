import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  joinState, nextOccurrence, currentOccurrence, validateSchedule, meetingLink, isMeetingId, calendarEvent,
  outlookCalendarUrl, cleanGuestName, activeHuddlers, huddleLabel, meetingEnd, EARLY_JOIN_MS, LATE_JOIN_MS,
  type ScheduledMeeting,
} from '../services/meetings/scheduleCore';
import { buildIcs } from '../services/postman/calendarTime';

const T = Date.UTC(2026, 10, 3, 19, 0); // Tue Nov 3 2026 19:00 UTC
const M: ScheduledMeeting = {
  id: 'Abc23Def45Ghi67Jkl89Mn', roomId: 'r1', title: 'Board meeting', startsAt: T, durationMin: 60,
  guestsAllowed: true, createdBy: 'u1', createdByName: 'Kenne', createdAt: T - 86_400_000,
};

test('join window: upcoming, open 10 min early, live through an hour after, ended, canceled', () => {
  assert.equal(joinState(M, T - EARLY_JOIN_MS - 1), 'upcoming');
  assert.equal(joinState(M, T - 5 * 60_000), 'open');
  assert.equal(joinState(M, T + 30 * 60_000), 'live');
  assert.equal(joinState(M, meetingEnd(M) + LATE_JOIN_MS), 'live');
  assert.equal(joinState(M, meetingEnd(M) + LATE_JOIN_MS + 1), 'ended');
  assert.equal(joinState({ ...M, canceledAt: T - 1 }, T), 'canceled');
});

test('recurring meetings roll forward to the current or next occurrence', () => {
  const weekly = { ...M, recurrence: 'weekly' as const };
  assert.equal(nextOccurrence(weekly, T - 1000), T);
  assert.equal(nextOccurrence(weekly, T + 30 * 60_000), T); // still running
  const nextWeek = nextOccurrence(weekly, T + 3 * 86_400_000);
  assert.equal(new Date(nextWeek).getUTCDate(), 10);
  assert.equal(currentOccurrence(M, T + 9e9).startsAt, T); // one-off never moves
  // Weekdays: a Friday meeting's next occurrence skips the weekend.
  const fri = Date.UTC(2026, 10, 6, 15, 0);
  const wk = nextOccurrence({ ...M, startsAt: fri, recurrence: 'weekdays' }, fri + 3 * 3600_000);
  assert.equal(new Date(wk).getUTCDay(), 1);
});

test('schedule validation', () => {
  assert.equal(validateSchedule({ title: 'Sync', startsAt: T, durationMin: 30 }, T - 1000), null);
  assert.match(validateSchedule({ title: ' ', startsAt: T, durationMin: 30 }, T)!, /name/);
  assert.match(validateSchedule({ title: 'Sync', startsAt: T - 3600_000, durationMin: 30 }, T)!, /passed/);
  assert.match(validateSchedule({ title: 'Sync', startsAt: T, durationMin: 37 }, T)!, /length/);
});

test('links, ids and calendar invites', () => {
  assert.equal(meetingLink('https://plajah.com/', M.id), `https://plajah.com/?meet=${M.id}`);
  assert.equal(isMeetingId(M.id), true);
  assert.equal(isMeetingId('short'), false);
  assert.equal(isMeetingId('../../etc/passwd/aaaaaaaaaaaa'), false);
  const ev = calendarEvent({ ...M, agenda: 'Budget; vote', recurrence: 'weekly' }, meetingLink('https://plajah.com', M.id));
  const ics = buildIcs([ev]);
  assert.match(ics, /DTSTART:20261103T190000Z/);
  assert.match(ics, /DTEND:20261103T200000Z/);
  assert.match(ics, /RRULE:FREQ=WEEKLY/);
  assert.match(ics, /Budget\\; vote/);
  const outlook = new URL(outlookCalendarUrl(ev));
  assert.equal(outlook.searchParams.get('subject'), 'Board meeting');
  assert.equal(outlook.searchParams.get('startdt'), '2026-11-03T19:00:00.000Z');
});

test('guest names and huddle presence', () => {
  assert.equal(cleanGuestName('  Pat   <b>Lee</b> '), 'Pat bLee/b');
  assert.equal(cleanGuestName('x'), null);
  const now = 1_000_000;
  const live = activeHuddlers([
    { id: 'a', name: 'Dana', lastSeen: now - 10_000 },
    { id: 'b', name: 'Sam', lastSeen: now - 90_000 },
    { id: 'c', name: 'Old', lastSeen: null },
  ], now);
  assert.deepEqual(live.map(p => p.id), ['a']);
  assert.equal(huddleLabel(['Dana']), 'Dana');
  assert.equal(huddleLabel(['Dana', 'Sam']), 'Dana and Sam');
  assert.equal(huddleLabel(['Dana', 'Sam', 'Kenne']), 'Dana, Sam and 1 other');
  assert.equal(huddleLabel(['Dana', 'Sam', 'Kenne', 'Pat']), 'Dana, Sam and 2 others');
});
