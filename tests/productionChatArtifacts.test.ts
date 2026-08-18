import test from 'node:test';
import assert from 'node:assert/strict';
import type { Production } from '../services/filmProductionService';
import { canEditProductionEntity } from '../services/productionChatArtifacts';

const production: Production = {
  id: 'film-1', ownerUid: 'owner', title: 'Night Run', format: 'Feature',
  memberUids: ['owner', 'ad', 'art', 'crew'], totalDays: 1, createdAt: 1, updatedAt: 1,
  authority: {
    ad: { roleKey: 'FIRST_AD', position: '1st AD', department: 'DIRECTION', permissions: ['MANAGE_SCHEDULE', 'MANAGE_TASKS'], assignedBy: 'owner', assignedAt: 1 },
    art: { roleKey: 'DEPARTMENT_HEAD', position: 'Art Director', department: 'ART', permissions: ['MANAGE_DEPARTMENT_BREAKDOWN'], assignedBy: 'owner', assignedAt: 1 },
    crew: { roleKey: 'CREW', position: 'PA', department: 'PRODUCTION', permissions: [], assignedBy: 'owner', assignedAt: 1 },
  },
};

test('canonical production objects respect production authority', () => {
  assert.equal(canEditProductionEntity(production, 'owner', 'CALL_SHEET', { id: 'cs1' }), true);
  assert.equal(canEditProductionEntity(production, 'ad', 'TASK', { id: 'task1' }), true);
  assert.equal(canEditProductionEntity(production, 'ad', 'SCHEDULE', { id: 'plan1' }), true);
  assert.equal(canEditProductionEntity(production, 'crew', 'TASK', { id: 'task1' }), false);
});

test('department heads can update only their own department breakdown', () => {
  assert.equal(canEditProductionEntity(production, 'art', 'BREAKDOWN', { id: 'prop1', department: 'ART' }), true);
  assert.equal(canEditProductionEntity(production, 'art', 'BREAKDOWN', { id: 'mic1', department: 'SOUND' }), false);
});

test('decision and alert authors retain edit authority without gaining broader production powers', () => {
  assert.equal(canEditProductionEntity(production, 'crew', 'DECISION', { id: 'd1', authorUid: 'crew' }), true);
  assert.equal(canEditProductionEntity(production, 'crew', 'ALERT', { id: 'a1', authorUid: 'someone-else' }), false);
});
