import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEventPlan, shiftDays, clockOnDay, stepUrgency, phaseFor, ticketedToItem, eviteToItem, sortHostItems, playbookTierDrafts,
} from '../services/hostEventsService';
import type { EventPlaybook } from '../services/opsPresets/types';
import { ALL_ORG_PRESETS, ALL_BUSINESS_PRESETS } from '../services/opsPresets';

const PB: EventPlaybook = {
  key: 'gala', label: 'Gala', emoji: '🎉', blurb: 'A night', format: 'IN_PERSON', durationMin: 180, capacity: 120,
  tiers: [{ name: 'Seat', price: 50, qty: 100 }, { name: 'Table', price: 500 }],
  runOfShow: [{ t: '19:30', what: 'Dinner', owner: 'Chef' }, { t: '18:00', what: 'Doors', owner: 'Host' }, { t: 'late', what: 'Afterparty', owner: 'DJ' }],
  checklist: [{ daysBefore: 30, task: 'Book band', owner: 'Lead' }, { daysBefore: 0, task: 'Set up', owner: 'Crew' }, { daysBefore: -1, task: 'Thank-you notes', owner: 'Lead' }, { daysBefore: 30, task: 'Book band', owner: 'Lead' }],
  promo: [{ daysBefore: 14, channel: 'email', copy: 'Two weeks out' }, { daysBefore: 28, channel: 'social', copy: 'Save the date' }, { daysBefore: 0, channel: 'push', copy: 'Tonight' }],
};
const EVENT = new Date(2026, 11, 12, 18, 0, 0, 0).getTime(); // Sat 12 Dec 2026, 6 pm local

describe('buildEventPlan', () => {
  const plan = buildEventPlan(PB, EVENT);

  test('every checklist task and promo beat gets an absolute due date at the event clock time', () => {
    assert.equal(plan.tasks.length, 4);
    assert.equal(plan.promo.length, 3);
    for (const s of plan.steps) {
      const d = new Date(s.dueAt), e = new Date(EVENT);
      assert.equal(d.getHours(), e.getHours());
      assert.equal(d.getMinutes(), e.getMinutes());
      const days = Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
      assert.equal(days, s.daysBefore, s.title);
    }
  });

  test('tasks and promo are sorted by due date; after-event tasks land after the event', () => {
    assert.deepEqual(plan.promo.map(p => p.daysBefore), [28, 14, 0]);
    assert.deepEqual(plan.tasks.map(p => p.daysBefore), [30, 30, 0, -1]);
    const thanks = plan.tasks.find(t => t.daysBefore === -1)!;
    assert.ok(thanks.dueAt > EVENT);
    for (let i = 1; i < plan.steps.length; i++) assert.ok(plan.steps[i - 1].dueAt <= plan.steps[i].dueAt);
  });

  test('on the same instant a task sorts before a promo beat', () => {
    const sameDay = plan.steps.filter(s => s.daysBefore === 0);
    assert.deepEqual(sameDay.map(s => s.kind), ['task', 'promo']);
  });

  test('step ids are unique and stable across rebuilds (checkbox state survives)', () => {
    const ids = plan.steps.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(buildEventPlan(PB, EVENT).steps.map(s => s.id), ids);
    assert.deepEqual(buildEventPlan(PB, EVENT + 7 * 864e5).steps.map(s => s.id).sort(), [...ids].sort());
  });

  test('promo beats keep their channel; run of show is placed on the event day and sorted', () => {
    assert.equal(plan.promo[0].channel, 'social');
    assert.deepEqual(plan.runOfShow.map(r => r.what), ['Doors', 'Afterparty', 'Dinner']);
    const dinner = new Date(plan.runOfShow.find(r => r.what === 'Dinner')!.at);
    assert.equal(dinner.getHours(), 19); assert.equal(dinner.getMinutes(), 30); assert.equal(dinner.getDate(), 12);
    assert.equal(plan.runOfShow.find(r => r.what === 'Afterparty')!.at, EVENT); // unparseable → event start
  });

  test('empty playbook sections produce empty plans, not crashes', () => {
    const p = buildEventPlan({ ...PB, checklist: [], promo: [], runOfShow: [] }, EVENT);
    assert.equal(p.steps.length, 0); assert.equal(p.runOfShow.length, 0);
  });

  test('every shipped preset playbook builds a plan with unique ids', () => {
    let n = 0;
    for (const preset of [...Object.values(ALL_ORG_PRESETS as any), ...Object.values(ALL_BUSINESS_PRESETS as any)] as any[]) {
      for (const pb of (preset?.events || []) as EventPlaybook[]) {
        const p = buildEventPlan(pb, EVENT);
        assert.equal(new Set(p.steps.map(s => s.id)).size, p.steps.length, `${preset.id}/${pb.key}`);
        assert.equal(p.steps.length, (pb.checklist?.length || 0) + (pb.promo?.length || 0));
        n++;
      }
    }
    assert.ok(n > 0);
  });
});

describe('date helpers', () => {
  test('shiftDays keeps the local clock time across a DST change', () => {
    const after = new Date(2026, 10, 8, 10, 0).getTime(); // early November
    const before = new Date(shiftDays(after, 14));
    assert.equal(before.getHours(), 10);
    assert.equal(before.getDate(), 25);
  });
  test('clockOnDay sets HH:MM on the event day', () => {
    const t = new Date(clockOnDay(EVENT, '07:05'));
    assert.equal(t.getHours(), 7); assert.equal(t.getMinutes(), 5); assert.equal(t.getDate(), 12);
  });
  test('stepUrgency', () => {
    const now = EVENT;
    assert.equal(stepUrgency({ dueAt: now - 1 }, false, now), 'overdue');
    assert.equal(stepUrgency({ dueAt: now - 1 }, true, now), 'done');
    assert.equal(stepUrgency({ dueAt: now + 3 * 864e5 }, false, now), 'this_week');
    assert.equal(stepUrgency({ dueAt: now + 30 * 864e5 }, false, now), 'later');
  });
});

describe('host event items', () => {
  const now = EVENT;
  test('phaseFor buckets both systems', () => {
    assert.equal(phaseFor('ticketed', 'DRAFT', now + 1, undefined, now), 'draft');
    assert.equal(phaseFor('ticketed', 'ON_SALE', now + 1, undefined, now), 'upcoming');
    assert.equal(phaseFor('ticketed', 'ON_SALE', now - 10, now + 5, now), 'upcoming'); // in progress
    assert.equal(phaseFor('ticketed', 'COMPLETED', now + 1, undefined, now), 'past');
    assert.equal(phaseFor('evite', 'live', now - 10, undefined, now), 'past');
    assert.equal(phaseFor('evite', 'cancelled', now + 10, undefined, now), 'cancelled');
    assert.equal(phaseFor('evite', 'draft', now + 10, undefined, now), 'draft');
  });
  test('mappers carry targets, prices and places', () => {
    const t = ticketedToItem({ id: 'e1', title: 'Gala', status: 'ON_SALE', startDate: now + 1000, venueName: 'Hall', city: 'Austin', priceFromCents: 5000, totalSold: 3, totalCapacity: 100 }, now);
    assert.equal(t.source, 'ticketed'); assert.equal(t.place, 'Hall, Austin'); assert.equal(t.priceFrom, 5000);
    assert.deepEqual(t.target, { kind: 'event', eventId: 'e1' }); assert.equal(t.statusLabel, 'On sale');
    const v = eviteToItem({ id: 'abc12345', title: 'Picnic', status: 'live', startsAt: now + 1000, venueName: 'Park', rsvpPath: '/i/abc12345' }, now);
    assert.equal(v.ticketed, false); assert.deepEqual(v.target, { kind: 'evite', inviteId: 'abc12345', path: '/i/abc12345' });
    assert.equal(typeof v.open, 'function');
  });
  test('sortHostItems: upcoming soonest first, then the rest most recent first', () => {
    const mk = (id: string, start: number, status = 'ON_SALE') => ticketedToItem({ id, status, startDate: start }, now);
    const out = sortHostItems([mk('past1', now - 5e6), mk('up2', now + 9e6), mk('up1', now + 1e6), mk('past2', now - 1e6), mk('d', now + 2e6, 'DRAFT')]);
    assert.deepEqual(out.map(i => i.id), ['up1', 'up2', 'd', 'past2', 'past1']);
  });
  test('playbookTierDrafts converts dollars to cents and defaults quantities', () => {
    assert.deepEqual(playbookTierDrafts(PB), [{ name: 'Seat', priceCents: 5000, quantity: 100, perks: undefined }, { name: 'Table', priceCents: 50000, quantity: 120, perks: undefined }]);
    assert.deepEqual(playbookTierDrafts({ ...PB, tiers: [] }), [{ name: 'Free admission', priceCents: 0, quantity: 120 }]);
  });
});
