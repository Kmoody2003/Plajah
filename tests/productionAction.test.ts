import test from 'node:test';
import assert from 'node:assert/strict';
import type { CallSheet, Production, ProductionMember, ProductionScene } from '../services/filmProductionService';
import type { SchedulePlan } from '../services/productionScheduleService';
import { analyzeCallSheetImpact, analyzeScheduleImpact, buildProductionWorkItems, canPublishProductionAction, makeProductionAction } from '../services/productionActionService';

const production: Production = { id: 'film-1', ownerUid: 'producer', title: 'Night Run', format: 'Feature', memberUids: ['producer', 'camera'], authority: {}, totalDays: 1, createdAt: 1, updatedAt: 1 };
const members: ProductionMember[] = [
  { id: 'm1', uid: 'producer', name: 'Pat', role: 'Producer', dept: 'PRODUCTION', status: 'ACTIVE', createdAt: 1 },
  { id: 'm2', uid: 'camera', name: 'Cam', role: 'DP', dept: 'CAMERA', status: 'ACTIVE', createdAt: 1 },
];
const scenes: ProductionScene[] = [{ id: 's1', sceneNum: '1', intExt: 'EXT', dayNight: 'NIGHT', set: 'ALLEY', synopsis: 'A stunt car crash.', characters: [], pages: 2, shootDay: 0, status: 'NOT_SHOT' }];
const plan = { id: 'plan1', productionId: 'film-1', label: 'Primary', version: 1, status: 'DRAFT', days: [{ id: 'day1', dayNumber: 1, date: '2026-08-20', label: 'Day 1', generalCall: '07:00', unit: 'MAIN' }], strips: [{ id: 'strip1', type: 'SCENE', dayId: 'day1', order: 0, sceneId: 's1', estimatedMinutes: 60 }], createdBy: 'producer', createdAt: 1, updatedAt: 1 } as SchedulePlan;

test('schedule impact identifies downstream people, departments, scenes, and safety review', () => {
  const impact = analyzeScheduleImpact(production, plan, scenes, members);
  assert.deepEqual(impact.affectedUids.sort(), ['camera', 'producer']);
  assert.deepEqual(impact.affectedSceneIds, ['s1']);
  assert.ok(impact.affectedDepartments.includes('CAMERA'));
  assert.ok(impact.risks.some(risk => risk.includes('Safety')));
});

test('call sheet impact routes only called active people and flags missing safety data', () => {
  const sheet = { id: 'cs1', prodId: 'film-1', shootDay: 1, dayOf: 1, totalDays: 1, date: '2026-08-20', generalCall: '07:00', locationName: 'Alley', deptCalls: [], castRows: [], sceneRows: [{ sceneId: 's1', sceneNum: '1', intExt: 'EXT', dayNight: 'NIGHT', set: 'ALLEY', synopsis: '', pages: 2, characters: [] }], meals: [], version: 1, status: 'DRAFT', createdAt: 1, updatedAt: 1 } as CallSheet;
  const impact = analyzeCallSheetImpact(sheet, members);
  assert.deepEqual(impact.affectedUids.sort(), ['camera', 'producer']);
  assert.ok(impact.risks.includes('Nearest hospital is missing.'));
});

test('work inbox requires a fresh acknowledgement for each governed action revision', () => {
  const action = makeProductionAction({ productionId: 'film-1', trigger: 'CALLSHEET_REPUBLISHED', title: 'Day 1 revision', summary: 'Call moved', entity: { productionId: 'film-1', entityType: 'CALL_SHEET', entityId: 'cs1' }, impact: analyzeScheduleImpact(production, plan, scenes, members), routeChannelKeys: ['schedule-calls'], targetUids: ['camera'], requiredAcknowledgementUids: ['camera'], requiredPermission: 'MANAGE_CALL_SHEETS', severity: 'IMPORTANT', actorUid: 'producer', actorName: 'Pat' }, 100);
  action.status = 'PUBLISHED';
  const base = { productionId: 'film-1', uid: 'camera', member: members[1], actions: [action], tasks: [], deliveries: [], canPublish: () => false };
  assert.equal(buildProductionWorkItems({ ...base, acknowledgements: [] }, 200).filter(item => item.kind === 'ACKNOWLEDGEMENT').length, 1);
  assert.equal(buildProductionWorkItems({ ...base, acknowledgements: [{ id: 'old', productionId: 'film-1', entityType: 'CALL_SHEET', entityId: 'cs1', actionId: 'older-action', uid: 'camera', state: 'ACKNOWLEDGED', updatedAt: 1 }] }, 200).filter(item => item.kind === 'ACKNOWLEDGEMENT').length, 1);
  assert.equal(buildProductionWorkItems({ ...base, acknowledgements: [{ id: 'new', productionId: 'film-1', entityType: 'CALL_SHEET', entityId: 'cs1', actionId: action.id, uid: 'camera', state: 'ACKNOWLEDGED', updatedAt: 1 }] }, 200).filter(item => item.kind === 'ACKNOWLEDGEMENT').length, 0);
});

test('action publishing honors member safety, self-enrollment, and department authority boundaries', () => {
  const scoped: Production = { ...production, memberUids: [...production.memberUids, 'art-head'], authority: { 'art-head': { roleKey: 'DEPARTMENT_HEAD', position: 'Art Director', department: 'ART', permissions: ['MANAGE_DEPARTMENT_BREAKDOWN'], assignedBy: 'producer', assignedAt: 1 } } };
  const base = { productionId: scoped.id, title: 'Change', summary: 'Changed', impact: { headline: 'Changed', affectedDepartments: [], affectedUids: [], affectedSceneIds: [], consequences: [], risks: [] }, routeChannelKeys: ['general'], targetUids: [], requiredAcknowledgementUids: [], severity: 'ROUTINE' as const, actorName: 'Crew' };
  const safety = makeProductionAction({ ...base, trigger: 'SAFETY_ALERT', entity: { productionId: scoped.id, entityType: 'ALERT', entityId: 'alert1' }, requiredPermission: 'MANAGE_ROSTER', actorUid: 'camera' });
  const joined = makeProductionAction({ ...base, trigger: 'MEMBER_JOINED', entity: { productionId: scoped.id, entityType: 'MEMBER', entityId: 'camera' }, requiredPermission: 'MANAGE_ROSTER', actorUid: 'camera' });
  const artBlocker = makeProductionAction({ ...base, trigger: 'BREAKDOWN_BLOCKED', entity: { productionId: scoped.id, entityType: 'BREAKDOWN', entityId: 'prop1' }, requiredPermission: 'EDIT_SCRIPT_BREAKDOWN', actorUid: 'art-head', department: 'ART' });
  const cameraBlocker = { ...artBlocker, department: 'CAMERA' as const };
  assert.equal(canPublishProductionAction(scoped, 'camera', safety), true);
  assert.equal(canPublishProductionAction(scoped, 'camera', joined), true);
  assert.equal(canPublishProductionAction(scoped, 'art-head', artBlocker), true);
  assert.equal(canPublishProductionAction(scoped, 'art-head', cameraBlocker), false);
});
