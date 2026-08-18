import test from 'node:test';
import assert from 'node:assert/strict';
import type { Production } from '../services/filmProductionService';
import {
  breakdownElementToTask, buildDepartmentBreakdownPacket, canManageBreakdown, classifyBreakdownAttachment,
  mapDraftElementsToScenes, normalizeTextRange,
  parseBreakdownSuggestions, stableBreakdownElementId, stableBreakdownOccurrenceId, type BreakdownElement,
} from '../services/productionBreakdownService';

const production: Production = {
  id: 'prod-1', ownerUid: 'owner', title: 'Night Shift', memberUids: ['owner', 'art-head', 'camera-head'],
  authority: {
    'art-head': { roleKey: 'DEPARTMENT_HEAD', position: 'Production Designer', department: 'ART', permissions: ['MANAGE_DEPARTMENT_BREAKDOWN'], assignedBy: 'owner', assignedAt: 1 },
    'camera-head': { roleKey: 'DEPARTMENT_HEAD', position: 'DP', department: 'CAMERA', permissions: ['MANAGE_DEPARTMENT_BREAKDOWN'], assignedBy: 'owner', assignedAt: 1 },
  },
  totalDays: 3, createdAt: 1, updatedAt: 1,
};

test('breakdown element IDs are stable across harmless name formatting changes', () => {
  assert.equal(
    stableBreakdownElementId('prod-1', 'PROPS', 'Evidence Box'),
    stableBreakdownElementId('prod-1', 'PROPS', ' evidence--box '),
  );
  assert.notEqual(
    stableBreakdownElementId('prod-1', 'PROPS', 'Evidence Box'),
    stableBreakdownElementId('prod-1', 'WARDROBE', 'Evidence Box'),
  );
});

test('text selections are trimmed, clamped, and retain precise approved-script offsets', () => {
  assert.deepEqual(normalizeTextRange('She opens the red case.', 3, 20), {
    startOffset: 4, endOffset: 20, quote: 'opens the red ca',
  });
  assert.deepEqual(normalizeTextRange('  red case  ', 0, 99), {
    startOffset: 2, endOffset: 10, quote: 'red case',
  });
  assert.equal(normalizeTextRange('text', 2, 2), null);
});

test('draft elements map to stable production scenes until the next heading', () => {
  const map = mapDraftElementsToScenes([
    { id: 'title', type: 'NOTE', text: 'Draft' },
    { id: 'heading-1', type: 'SCENE_HEADING', text: 'INT. OFFICE - DAY' },
    { id: 'action-1', type: 'ACTION', text: 'A red case sits on the desk.' },
    { id: 'heading-2', type: 'SCENE_HEADING', text: 'EXT. STREET - NIGHT' },
    { id: 'action-2', type: 'ACTION', text: 'Rain falls.' },
  ], [{ id: 'scene-1', sourceElementId: 'heading-1' }, { id: 'scene-2', sourceElementId: 'heading-2' }]);
  assert.equal(map.has('title'), false);
  assert.equal(map.get('action-1'), 'scene-1');
  assert.equal(map.get('action-2'), 'scene-2');
});

test('separate text ranges create separate stable occurrences in one scene', () => {
  const first = stableBreakdownOccurrenceId('bd-1', 'scene-1', 'action-1', 4, 12);
  assert.equal(first, stableBreakdownOccurrenceId('bd-1', 'scene-1', 'action-1', 4, 12));
  assert.notEqual(first, stableBreakdownOccurrenceId('bd-1', 'scene-1', 'action-1', 20, 28));
});

test('Pokee suggestions retain only grounded occurrences from known scenes', () => {
  const suggestions = parseBreakdownSuggestions({ suggestions: [{
    name: 'Evidence Box', category: 'PROPS', department: 'ART', quantity: 2,
    confidence: 1.7, occurrences: [
      { sceneId: 'scene-1', sceneNum: '1', quote: 'She opens the evidence box.', quantity: 2 },
      { sceneId: 'invented-scene', sceneNum: '99', quote: 'Unsupported', quantity: 1 },
    ],
  }, { name: '', category: 'CAST', occurrences: [{ sceneId: 'scene-1' }] }] }, new Set(['scene-1']));
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].occurrences.length, 1);
  assert.equal(suggestions[0].occurrences[0].sceneId, 'scene-1');
  assert.equal(suggestions[0].confidence, 1);
});

test('department authority is scoped and cannot overwrite another department', () => {
  assert.equal(canManageBreakdown(production, 'owner', 'CAMERA'), true);
  assert.equal(canManageBreakdown(production, 'art-head', 'ART'), true);
  assert.equal(canManageBreakdown(production, 'art-head', 'CAMERA'), false);
  assert.equal(canManageBreakdown(production, 'camera-head', 'ART'), false);
});

test('approved breakdown elements project into department-owned tasks', () => {
  const element: BreakdownElement = {
    id: 'bd-1', productionId: 'prod-1', name: 'Evidence Box', category: 'PROPS', department: 'ART',
    status: 'BLOCKED', occurrences: [], quantity: 1, source: 'MANUAL', createdBy: 'owner', createdAt: 1, updatedAt: 1,
  };
  const task = breakdownElementToTask(element, { id: 'member-1', name: 'Alex', role: 'Props Master', dept: 'ART', status: 'ACTIVE', createdAt: 1 });
  assert.equal(task.dept, 'ART');
  assert.equal(task.assigneeMemberId, 'member-1');
  assert.equal(task.priority, 'URGENT');
});

test('breakdown attachments enforce production-safe file types and a 25 MB client limit', () => {
  assert.equal(classifyBreakdownAttachment({ name: 'reference.jpg', type: 'image/jpeg', size: 1024 }), 'MEDIA');
  assert.equal(classifyBreakdownAttachment({ name: 'permit.pdf', type: 'application/pdf', size: 1024 }), 'DOCUMENT');
  assert.equal(classifyBreakdownAttachment({ name: 'vendor.xlsx', type: '', size: 1024 }), 'DOCUMENT');
  assert.throws(() => classifyBreakdownAttachment({ name: 'payload.exe', type: 'application/octet-stream', size: 1024 }));
  assert.throws(() => classifyBreakdownAttachment({ name: 'huge.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 }));
});

test('department packets omit other departments and omitted elements', () => {
  const base: BreakdownElement = {
    id: 'bd-art', productionId: 'prod-1', name: 'Evidence Box', category: 'PROPS', department: 'ART',
    status: 'READY', occurrences: [{ id: 'occ-1', sceneId: 'scene-1', sceneNum: '1', quantity: 2, quote: 'The red evidence box.' }],
    quantity: 2, source: 'MANUAL', createdBy: 'owner', createdAt: 1, updatedAt: 1, estimatedCost: 125,
  };
  const packet = buildDepartmentBreakdownPacket(production, 'ART', [
    base,
    { ...base, id: 'bd-omitted', name: 'Old Lamp', status: 'OMITTED' },
    { ...base, id: 'bd-camera', name: 'Anamorphic Lens', category: 'EQUIPMENT', department: 'CAMERA' },
  ], [{ id: 'scene-1', sceneNum: '1', intExt: 'INT', dayNight: 'DAY', set: 'OFFICE', synopsis: '', characters: [], pages: 1, shootDay: 0, status: 'NOT_SHOT' }], 99);
  assert.equal(packet.department, 'ART');
  assert.equal(packet.summary.total, 1);
  assert.equal(packet.summary.ready, 1);
  assert.equal(packet.summary.estimatedCost, 125);
  assert.deepEqual(packet.scenes[0].elements.map(element => element.name), ['Evidence Box']);
});
