import test from 'node:test';
import assert from 'node:assert/strict';
import type { Production, ProductionMember, ProductionScene } from '../services/filmProductionService';
import type { BreakdownElement } from '../services/productionBreakdownService';
import {
  addScheduleMarker, analyzeSchedule, applyCallSheetTemplate, callSheetTemplateFromSheet,
  cloneSchedulePlan, createSchedulePlan, moveScheduleStrip,
  recipientDeliveryId, type ScheduleConstraint,
} from '../services/productionScheduleService';
import { generateCallSheet } from '../services/filmProductionService';

const production: Production = {
  id: 'prod-1', ownerUid: 'owner', title: 'Night Shift', memberUids: ['owner', 'actor'], totalDays: 2,
  authority: {}, currentDraftId: 'draft-1', createdAt: 1, updatedAt: 1,
};
const scenes: ProductionScene[] = [
  { id: 'scene-1', sceneNum: '1', intExt: 'INT', dayNight: 'DAY', set: 'OFFICE', synopsis: 'Evidence is found.', characters: ['MAYA'], pages: 5, shootDay: 1, status: 'NOT_SHOT' },
  { id: 'scene-2', sceneNum: '2', intExt: 'EXT', dayNight: 'NIGHT', set: 'ALLEY', synopsis: 'Maya runs.', characters: ['MAYA'], pages: 4, shootDay: 1, status: 'NOT_SHOT' },
];
const members: ProductionMember[] = [{ id: 'actor', uid: 'actor', name: 'Alex', role: 'Maya', character: 'MAYA', dept: 'CAST', isCast: true, status: 'ACTIVE', createdAt: 1 }];

test('schedule plans preserve stable scenes and can be rearranged without editing scene records', () => {
  const plan = createSchedulePlan(production, scenes, 'owner', 'Board A', 10);
  assert.deepEqual(plan.strips.map(strip => strip.sceneId), ['scene-1', 'scene-2']);
  const withDay = { ...plan, days: [...plan.days, { id: 'day-2', dayNumber: 2, date: '', label: 'Day 2', generalCall: '07:00', unit: 'MAIN' }] };
  const moved = moveScheduleStrip(withDay, 'strip_scene-2', 'day-2', 0);
  assert.equal(moved.strips.find(strip => strip.sceneId === 'scene-2')?.dayId, 'day-2');
  assert.equal(scenes[1].shootDay, 1);
});

test('alternate plans are new draft versions and never mutate the approved source', () => {
  const source = { ...createSchedulePlan(production, scenes, 'owner', 'Board A', 10), status: 'APPROVED' as const, approvedBy: 'owner', approvedAt: 11 };
  const alternate = cloneSchedulePlan(source, 'owner', 'Weather Alternate', 20);
  assert.notEqual(alternate.id, source.id);
  assert.equal(alternate.version, source.version + 1);
  assert.equal(alternate.status, 'DRAFT');
  assert.equal(source.status, 'APPROVED');
});

test('conflict engine catches availability, blocked elements, workload, and missing company moves', () => {
  let plan = createSchedulePlan(production, scenes, 'owner', 'Board A', 10);
  plan = { ...plan, days: plan.days.map(day => ({ ...day, dayNumber: 1, date: '2026-08-20' })) };
  const constraints: ScheduleConstraint[] = [{ id: 'constraint-1', productionId: production.id, type: 'MEMBER_UNAVAILABLE', label: 'Alex unavailable', memberId: 'actor', date: '2026-08-20', severity: 'HARD', createdBy: 'owner', createdAt: 1 }];
  const blocked: BreakdownElement = { id: 'bd-1', productionId: production.id, name: 'Hero prop', category: 'PROPS', department: 'ART', status: 'BLOCKED', occurrences: [{ id: 'occ-1', sceneId: 'scene-1', sceneNum: '1', quantity: 1 }], quantity: 1, source: 'MANUAL', createdBy: 'owner', createdAt: 1, updatedAt: 1 };
  const conflicts = analyzeSchedule(plan, production, scenes, members, [], [blocked], constraints);
  assert.ok(conflicts.some(conflict => conflict.type === 'CAST' && conflict.severity === 'ERROR'));
  assert.ok(conflicts.some(conflict => conflict.type === 'BREAKDOWN'));
  assert.ok(conflicts.some(conflict => conflict.type === 'WORKLOAD'));
  assert.ok(conflicts.some(conflict => conflict.type === 'COMPANY_MOVE'));
  const marked = addScheduleMarker(plan, plan.days[0].id, 'COMPANY_MOVE', 'Move to alley');
  const marker = marked.strips.find(strip => strip.type === 'COMPANY_MOVE')!;
  const between = moveScheduleStrip(marked, marker.id, plan.days[0].id, 1);
  assert.equal(analyzeSchedule(between, production, scenes, members, [], [blocked], constraints).some(conflict => conflict.type === 'COMPANY_MOVE'), false);
});

test('recipient delivery IDs isolate simultaneous people and republished versions', () => {
  assert.notEqual(recipientDeliveryId('cs-1', 1, 'member-a'), recipientDeliveryId('cs-1', 1, 'member-b'));
  assert.notEqual(recipientDeliveryId('cs-1', 1, 'member-a'), recipientDeliveryId('cs-1', 2, 'member-a'));
  assert.equal(recipientDeliveryId('cs-1', 2, 'member-a'), 'cs-1_v2_member-a');
});

test('call-sheet templates retain relative timing while moving the production call', () => {
  const source = generateCallSheet(production, scenes, members, 1, { generalCall: '07:00' });
  source.meals = [{ label: 'Lunch', time: '13:00', note: 'Six hours after call' }];
  source.safetyNotes = 'Wet exterior after dark.';
  const template = callSheetTemplateFromSheet(production.id, source, 'owner', 'Night exterior', 20);
  assert.equal(template.meals[0].offsetMinutes, 360);

  const target = generateCallSheet(production, scenes, members, 1, { generalCall: '09:00' });
  const applied = applyCallSheetTemplate(target, { ...template, generalCall: '18:00' });
  assert.equal(applied.generalCall, '18:00');
  assert.equal(applied.shootingCall, '18:30');
  assert.equal(applied.castRows[0].onSet, '18:00');
  assert.equal(applied.meals[0].time, '00:00');
  assert.equal(applied.safetyNotes, 'Wet exterior after dark.');
});
