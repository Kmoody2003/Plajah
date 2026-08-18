import test from 'node:test';
import assert from 'node:assert/strict';
import type { CallSheet, Production, ProductionMember, ProductionScene } from '../services/filmProductionService';
import { deriveProductionChannels, productionRoomId } from '../services/productionChatService';

const production: Production = { id: 'film-1', ownerUid: 'producer', title: 'Night Run', format: 'Feature', memberUids: ['producer', 'camera'], authority: {}, totalDays: 1, createdAt: 1, updatedAt: 1 };
const members: ProductionMember[] = [
  { id: 'producer', uid: 'producer', name: 'Pat', role: 'Producer', dept: 'PRODUCTION', status: 'ACTIVE', createdAt: 1 },
  { id: 'camera', uid: 'camera', name: 'Cam', role: 'DP', dept: 'CAMERA', status: 'ACTIVE', createdAt: 1 },
];
const scenes: ProductionScene[] = [
  { id: 's1', sceneNum: '1', intExt: 'EXT', dayNight: 'NIGHT', set: 'ALLEY', synopsis: 'A car chase ends in a fight.', characters: [], pages: 2, shootDay: 1, status: 'NOT_SHOT' },
  { id: 's2', sceneNum: '2', intExt: 'INT', dayNight: 'DAY', set: 'GARAGE', synopsis: 'They regroup.', characters: [], pages: 1, shootDay: 1, status: 'NOT_SHOT' },
];
const callSheet = { id: 'cs1', prodId: 'film-1', shootDay: 1, dayOf: 1, totalDays: 1, date: '2026-08-20', generalCall: '07:00', locationName: 'Alley', deptCalls: [], castRows: [], sceneRows: [], meals: [], version: 1, status: 'PUBLISHED', createdAt: 1, updatedAt: 1 } as CallSheet;

test('every production begins with the universal communication structure', () => {
  const rows = deriveProductionChannels(production, [], [], []);
  assert.deepEqual(rows.slice(0, 5).map(row => row.key), ['announcements', 'general', 'schedule-calls', 'safety', 'crew-help']);
  assert.equal(rows.find(row => row.key === 'announcements')?.postingPolicy, 'PRODUCTION_LEADS');
});

test('the channel blueprint grows from roster, scene risk, locations, and shoot days', () => {
  const rows = deriveProductionChannels(production, members, scenes, [callSheet]);
  assert.ok(rows.some(row => row.key === 'dept-camera' && row.radioChannel === 2));
  assert.ok(rows.some(row => row.key === 'dept-stunts_sfx'));
  assert.ok(rows.some(row => row.key === 'dept-locations'));
  assert.ok(rows.some(row => row.key === 'dept-transport'));
  assert.ok(rows.some(row => row.key === 'shoot-day-1' && row.description.includes('07:00')));
});

test('production room ids are deterministic and safe for Firestore documents', () => {
  assert.equal(productionRoomId('Film / One', 'Schedule & Calls'), 'prodchat_film_one_schedule_calls');
  assert.equal(productionRoomId('Film / One', 'Schedule & Calls'), productionRoomId('Film / One', 'Schedule & Calls'));
});
