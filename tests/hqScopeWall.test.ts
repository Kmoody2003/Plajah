import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adoptFromSharedDesk, deskAssignmentsKey, hqCacheKey, isSeededDeskAssignment, onlyRowsInScope, ownUnitStorageIds, resolveHqReadScope } from '../services/hqScopeWall';

test('no signed-in person or no scope means no files, never a default org', () => {
  assert.equal(resolveHqReadScope({ kind: 'org', id: 'org1' }, null), null);
  assert.equal(resolveHqReadScope(null, 'alice'), null);
  assert.equal(resolveHqReadScope({ kind: 'org', id: '' }, 'alice'), null);
});

test('a person can only ever read their own personal scope', () => {
  assert.deepEqual(resolveHqReadScope({ kind: 'user', id: 'alice' }, 'alice'), { kind: 'user', id: 'alice', teacher: false });
  assert.deepEqual(resolveHqReadScope({ kind: 'user', id: 'teacher-alice' }, 'alice'), { kind: 'user', id: 'alice', teacher: true });
  assert.equal(resolveHqReadScope({ kind: 'user', id: 'bob' }, 'alice'), null);
  assert.equal(resolveHqReadScope({ kind: 'user', id: 'teacher-bob' }, 'alice'), null);
  assert.equal(resolveHqReadScope({ kind: 'org', id: 'teacher-bob' }, 'alice'), null);
});

test('the old shared browser buckets can no longer be opened by anyone', () => {
  for (const id of ['great-faith-ministries', 'teacher-personal-hq', 'unscoped']) {
    assert.equal(resolveHqReadScope({ kind: 'org', id }, 'alice'), null, id);
    assert.equal(resolveHqReadScope({ kind: 'user', id }, 'alice'), null, id);
  }
});

test('rows from another org or another person are dropped from a list', () => {
  const read = resolveHqReadScope({ kind: 'org', id: 'org1' }, 'alice')!;
  const rows = [
    { id: 'mine', scopeKind: 'org', scopeId: 'org1' },
    { id: 'other-org', scopeKind: 'org', scopeId: 'great-faith' },
    { id: 'person', scopeKind: 'user', scopeId: 'org1' },
    { id: 'no-scope' },
  ];
  assert.deepEqual(onlyRowsInScope(rows, read).map(r => r.id), ['mine']);
});

test('device caches and desks are per account', () => {
  assert.notEqual(hqCacheKey('alice', 'org1'), hqCacheKey('bob', 'org1'));
  assert.notEqual(deskAssignmentsKey('alice'), deskAssignmentsKey('bob'));
  assert.deepEqual(ownUnitStorageIds({ kind: 'org', id: 'org1', teacher: false }), ['org1']);
  assert.deepEqual(ownUnitStorageIds({ kind: 'user', id: 'alice', teacher: false }), ['alice', 'teacher-alice']);
});

test('seeded desk work is dropped and only your own assignments move to your desk', () => {
  assert.ok(isSeededDeskAssignment({ assignedByUid: 'instructor_great_faith' }));
  assert.ok(isSeededDeskAssignment({ assignedByUid: 'teacher_academia' }));
  assert.ok(isSeededDeskAssignment({ assignedByUid: 'x', orgId: 'great-faith-ministries' }));
  const { mine, rest } = adoptFromSharedDesk([
    { assignedByUid: 'alice', orgId: 'org1' },
    { assignedByUid: 'bob', orgId: 'org2' },
    { assignedByUid: 'instructor_great_faith', orgId: 'org1' },
  ], 'alice');
  assert.equal(mine.length, 1);
  assert.equal(rest.length, 1);
  assert.equal(rest[0].assignedByUid, 'bob');
});

test('no code falls back to one org: the old defaults stay gone', () => {
  const banned = /GREAT_FAITH_MINISTRIES|resolveGreatFaithMinistriesOrg|great-faith-admin|instructor_great_faith'?,\s*$|ensureUniversalStudentDeskSeeded/m;
  for (const file of [
    'services/orgAssets.ts', 'services/universalStudentDeskService.ts', 'components/ContentHQ.tsx',
    'components/desk/UniversalStudentDesk.tsx', 'components/desk/AssignToClassModal.tsx',
    'components/elevate/MyOrgTasksAndDepartments.tsx', 'components/church/TelaDocumentPreviewModal.tsx',
    'services/curriculumIngestionService.ts',
  ]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), banned, file);
  }
});
