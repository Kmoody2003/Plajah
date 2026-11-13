import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoSchedule, canTurnIn, effectiveDue, endOfDay, isLate, turnInState, visibleTo, DUE_GRACE_MS } from '../services/edu/assignmentPolicy';

const DAY = 86_400_000;
const now = new Date('2026-11-13T12:00').getTime();

test('work scheduled ahead is hidden from students until it opens, never from its teacher', () => {
  const a = { opensAt: now + DAY, dueAt: now + 3 * DAY, assignedByUid: 'teach' };
  assert.equal(visibleTo(a, 'kid', now), false);
  assert.equal(visibleTo(a, 'teach', now), true);
  assert.equal(turnInState(a, null, now).kind, 'not_open');
  assert.equal(visibleTo(a, 'kid', now + DAY), true);
});

test('before the due date a student can turn in; after it the default is locked', () => {
  const a = { dueAt: now + DAY };
  assert.equal(turnInState(a, null, now).kind, 'open');
  assert.equal(canTurnIn(turnInState(a, null, now)), true);
  const after = now + DAY + DUE_GRACE_MS + 1;
  const s = turnInState(a, null, after);
  assert.equal(s.kind, 'locked');
  assert.equal(canTurnIn(s), false);
});

test('a few minutes of grace at the deadline', () => {
  const a = { dueAt: now };
  assert.equal(canTurnIn(turnInState(a, null, now + DUE_GRACE_MS)), true);
});

test('a requested or denied extension does not unlock; a granted one moves the deadline', () => {
  const a = { dueAt: now - DAY };
  assert.deepEqual(turnInState(a, { status: 'requested' }, now), { kind: 'locked', dueAt: now - DAY, extension: 'requested' });
  assert.equal(canTurnIn(turnInState(a, { status: 'denied', extendedUntil: now + DAY }, now)), false);
  const granted = { status: 'granted' as const, extendedUntil: now + DAY };
  assert.equal(turnInState(a, granted, now).kind, 'extended');
  assert.equal(effectiveDue(a, granted), now + DAY);
  assert.equal(isLate(a, granted, now), false);
  assert.equal(canTurnIn(turnInState(a, granted, now + 2 * DAY)), false);
});

test('accept_late takes work after the due date and marks it late', () => {
  const a = { dueAt: now - DAY, afterDue: 'accept_late' as const };
  assert.equal(turnInState(a, null, now).kind, 'late_allowed');
  assert.equal(isLate(a, null, now), true);
});

test('auto-schedule puts one lesson on each Sunday after the last scheduled one', () => {
  const lastSunday = new Date('2026-11-15T09:00').getTime(); // a Sunday already taken
  const slots = autoSchedule(3, { meetingSchedule: 'Sundays · 9:15 AM', taken: [lastSunday], leadDays: 3, dueAfterDays: 0 }, now);
  assert.deepEqual(slots.map(s => new Date(s.scheduledFor).toDateString()), [
    new Date('2026-11-22T09:00').toDateString(),
    new Date('2026-11-29T09:00').toDateString(),
    new Date('2026-12-06T09:00').toDateString(),
  ]);
  for (const s of slots) {
    assert.equal(new Date(s.scheduledFor).getDay(), 0);
    assert.equal(s.dueAt, endOfDay(s.scheduledFor));
    assert.equal(s.opensAt, s.scheduledFor - 3 * DAY);
    assert.equal(s.afterDue, 'lock');
  }
});

test('auto-schedule skips class dates that already have work, and sets the due offset', () => {
  const nov22 = new Date('2026-11-22T09:00').getTime();
  const slots = autoSchedule(2, { meetingSchedule: 'Sundays', taken: [nov22, new Date('2026-11-08T09:00').getTime()], from: new Date('2026-11-14'), leadDays: 0, dueAfterDays: 7 }, now);
  // Starts after the latest taken date (Nov 22).
  assert.equal(new Date(slots[0].scheduledFor).toDateString(), new Date('2026-11-29T09:00').toDateString());
  assert.equal(slots[0].opensAt, null);
  assert.equal(slots[0].dueAt, endOfDay(slots[0].scheduledFor + 7 * DAY));
});

test('an opening time already past is left off (it is open now)', () => {
  const slots = autoSchedule(1, { meetingSchedule: 'Sundays', taken: [], leadDays: 30, dueAfterDays: 0 }, now);
  assert.equal(slots[0].opensAt, null);
});
