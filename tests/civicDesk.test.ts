import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addBusinessHours, canTransition, dueAt, slaState, openCase, setStatus, reply, mergeDuplicate, likelyDuplicates,
  findMatches, queue, metrics, redactCase, residentView, fillTemplate, triagePriority, routeCase, normAddress,
  DAY_MS, HOUR_MS, type ServiceType, type Constituent, type Case,
} from '../services/terra/civic/desk/deskCore';

const POTHOLE: ServiceType = {
  id: 'pothole', name: 'Pothole', description: 'A hole in the road', category: 'Streets', departmentId: 'dpw',
  sla: { amount: 5, unit: 'days' }, priority: 'normal', needsLocation: true, allowAnonymous: true,
  routeByWard: { '7': 'dpw-west' },
};
const PERMIT_Q: ServiceType = {
  id: 'permit-q', name: 'Permit question', description: 'Ask about a permit', category: 'Buildings', departmentId: 'bseed',
  sla: { amount: 16, unit: 'hours' }, priority: 'normal', needsLocation: false,
  fields: [{ key: 'permitType', label: 'Permit type', required: true }],
};
// Monday 10 Nov 2025 15:00 UTC
const MON_3PM = Date.UTC(2025, 10, 10, 15);

test('status machine allows real moves and blocks skipping', () => {
  assert.equal(canTransition('new', 'triaged'), true);
  assert.equal(canTransition('resolved', 'in_progress'), true); // reopen
  assert.equal(canTransition('new', 'resolved'), false);
  assert.equal(canTransition('duplicate', 'resolved'), false);
});

test('business hours skip nights and weekends', () => {
  // Friday 16:00 + 3 business hours = Monday 10:00
  const fri4 = Date.UTC(2025, 10, 14, 16);
  assert.equal(new Date(addBusinessHours(fri4, 3)).toISOString(), '2025-11-17T10:00:00.000Z');
  // 16 business hours from Monday 15:00 = Wednesday 13:00 (2h Mon + 9h Tue + 5h Wed)
  assert.equal(new Date(dueAt(MON_3PM, PERMIT_Q.sla)).toISOString(), '2025-11-12T13:00:00.000Z');
  assert.equal(dueAt(MON_3PM, POTHOLE.sla), MON_3PM + 5 * DAY_MS);
});

test('intake validates, routes by ward, and raises priority for hazards', () => {
  const bad = openCase({ serviceType: PERMIT_Q, description: 'hi', channel: 'web', by: 'u1', now: MON_3PM, seq: 1 }, 'c0');
  assert.deepEqual(bad.problems, ['Describe the issue in a few words.', 'This request needs contact details so staff can follow up.', 'Answer “Permit type”.']);

  const r = openCase({
    serviceType: POTHOLE, description: 'Deep hole, water main flooding the street', channel: 'app', by: 'anon', now: MON_3PM, seq: 42,
    location: { line1: '1234 W Grand Blvd', ward: '7' },
  }, 'c1');
  assert.deepEqual(r.problems, []);
  assert.equal(r.case.ref, 'TC-25-000042');
  assert.equal(r.case.departmentId, 'dpw-west');
  assert.equal(r.case.priority, 'urgent');
  assert.equal(r.case.status, 'new');
  assert.ok(r.case.timeline.some((t) => t.kind === 'priority' && t.internal));
  assert.equal(routeCase(POTHOLE, { line1: 'x', ward: '2' }).departmentId, 'dpw');
  assert.deepEqual(triagePriority('low', 'there is a pothole'), { priority: 'low' });
});

function mk(over: Partial<Case> = {}): Case {
  const base = openCase({ serviceType: POTHOLE, description: 'Pothole near the bus stop', channel: 'web', by: 'p1', constituentId: 'p1', now: MON_3PM, seq: 1, location: { line1: '1234 West Grand Boulevard', lat: 42.36, lng: -83.08 } }, 'a').case;
  return { ...base, ...over };
}

test('SLA states move from on track to due soon to overdue, and record met or missed', () => {
  const c = mk();
  assert.equal(slaState(c, MON_3PM + DAY_MS), 'on_track');
  assert.equal(slaState(c, c.dueAt - 2 * HOUR_MS), 'due_soon');
  assert.equal(slaState(c, c.dueAt + 1), 'overdue');
  const done = setStatus(setStatus(c, 'in_progress', 's1', MON_3PM + DAY_MS), 'resolved', 's1', MON_3PM + 2 * DAY_MS);
  assert.equal(slaState(done, MON_3PM + 9 * DAY_MS), 'met');
  assert.throws(() => setStatus(c, 'resolved', 's1', MON_3PM), /Can't move/);
  const reopened = setStatus(done, 'in_progress', 'p1', MON_3PM + 3 * DAY_MS);
  assert.equal(reopened.resolvedAt, undefined);
  assert.equal(reopened.timeline.at(-1)?.text, 'Reopened');
});

test('first reply stamps response time and triages a new case', () => {
  const c = reply(mk(), 'We have scheduled a crew.', 's1', MON_3PM + 3 * HOUR_MS);
  assert.equal(c.status, 'triaged');
  assert.equal(c.firstResponseAt, MON_3PM + 3 * HOUR_MS);
  const again = reply(c, 'Crew is on site.', 's1', MON_3PM + DAY_MS);
  assert.equal(again.firstResponseAt, MON_3PM + 3 * HOUR_MS);
});

test('duplicates: same type nearby or same address within two weeks', () => {
  const a = mk({ id: 'a' });
  const b = mk({ id: 'b', ref: 'TC-25-000002', location: { line1: '1234 W. Grand Blvd.', lat: 42.3601, lng: -83.0801 } });
  const far = mk({ id: 'c', location: { line1: '9000 Gratiot Ave', lat: 42.40, lng: -83.00 } });
  const old = mk({ id: 'd', createdAt: MON_3PM - 30 * DAY_MS });
  assert.deepEqual(likelyDuplicates([a, b, far, old], a).map((x) => x.id), ['b']);
  const m = mergeDuplicate(a, b, 's1', MON_3PM + HOUR_MS);
  assert.equal(m.dup.status, 'duplicate');
  assert.equal(m.dup.duplicateOf, 'a');
  assert.ok(m.primary.timeline.at(-1)?.internal);
  assert.equal(normAddress('1234 West Grand Boulevard'), normAddress('1234 W. Grand Blvd.'));
});

test('constituent matching by email, phone, or name and address', () => {
  const people: Constituent[] = [
    { id: 'p1', kind: 'person', name: 'Ana Ruiz', email: 'Ana@Example.org', phone: '(313) 555-0100', createdAt: 0 },
    { id: 'b1', kind: 'business', name: 'Corner Bakery LLC', address: { line1: '100 E Main St' }, createdAt: 0 },
  ];
  assert.equal(findMatches(people, { email: 'ana@example.org' })[0].c.id, 'p1');
  assert.equal(findMatches(people, { phone: '313-555-0100' })[0].why, 'Same phone');
  assert.equal(findMatches(people, { name: 'corner bakery llc', address: { line1: '100 East Main Street' } })[0].c.id, 'b1');
  assert.deepEqual(findMatches(people, { name: 'Someone Else' }), []);
});

test('queue puts overdue first, then priority; metrics count what matters', () => {
  const now = MON_3PM + 6 * DAY_MS;
  const overdue = mk({ id: 'o', priority: 'low' });
  const urgent = mk({ id: 'u', priority: 'urgent', createdAt: now - HOUR_MS, dueAt: now + DAY_MS });
  const normal = mk({ id: 'n', createdAt: now - HOUR_MS, dueAt: now + 2 * DAY_MS, firstResponseAt: now - 30 * 60_000 });
  const done = { ...mk({ id: 'd' }), status: 'resolved' as const, resolvedAt: MON_3PM + DAY_MS };
  assert.deepEqual(queue([normal, urgent, overdue, done], { status: 'open' }, now).map((c) => c.id), ['o', 'u', 'n']);
  const m = metrics([normal, urgent, overdue, done], now);
  assert.equal(m.open, 3);
  assert.equal(m.overdue, 1);
  assert.equal(m.onTimeRate, 1);
  assert.equal(m.medianFirstResponseH, 0.5);
});

test('public and resident views hide private details', () => {
  let c = mk();
  c = setStatus(c, 'triaged', 's1', MON_3PM + HOUR_MS);
  c = { ...c, timeline: [...c.timeline, { at: MON_3PM + 2 * HOUR_MS, by: 's1', kind: 'note', text: 'Resident is difficult', internal: true }] };
  const pub = redactCase(c, 'Pothole');
  assert.equal(pub.area, '1200 block of West Grand Boulevard');
  assert.ok(!JSON.stringify(pub).includes('p1'));
  assert.ok(!JSON.stringify(pub).includes('difficult'));
  assert.ok(!residentView(c).timeline.some((t) => t.internal));
});

test('reply templates fill in the case details', () => {
  const c = mk();
  const out = fillTemplate('Hi {{first_name}}, your {{service}} report {{ref}} at {{address}} is with {{department}}. Target: {{due_date}}. {{unknown}}', {
    constituent: { id: 'p1', kind: 'person', name: 'Ana Ruiz', createdAt: 0 }, c, service: POTHOLE, department: { id: 'dpw', name: 'DPW', publicName: 'Public Works' },
  });
  assert.equal(out, 'Hi Ana, your Pothole report TC-25-000001 at 1234 West Grand Boulevard is with Public Works. Target: November 15. {{unknown}}');
});
