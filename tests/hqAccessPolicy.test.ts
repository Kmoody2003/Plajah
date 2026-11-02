import test from 'node:test';
import assert from 'node:assert/strict';
import { canSeeOrgFile, hqObjectPathInScope } from '../services/hqAccessPolicy';

const org = {
  creatorId: 'owner', admins: ['admin'], itAdminUids: ['it'], staffUids: ['staffMedia'], seniorPastorUids: ['senior'], financeUids: ['treasurer'],
  ministries: [{ id: 'fin', name: 'Finance' }, { id: 'media', name: 'Media', headUids: ['mediaHead'] }, { id: 'music', name: 'Music' }, { id: 'edu', name: 'Grace Education' }],
};
const seat = (...ministryIds: string[]) => ({ status: 'ACTIVE', ministryIds });
const file = (folder?: string, extra: Record<string, unknown> = {}) => ({ scopeKind: 'org', scopeId: 'o1', folder, uploadedByUid: 'someone', ...extra });

test('an outsider sees nothing, whatever the file', () => {
  for (const f of [file(), file('Media'), file('Finance'), file('Grace Education')]) assert.equal(canSeeOrgFile('outsider', f, org, null), false);
});

test('a former member loses the org files, even ones they uploaded', () => {
  assert.equal(canSeeOrgFile('left', file('Media', { uploadedByUid: 'left' }), org, { status: 'REMOVED' }), false);
  assert.equal(canSeeOrgFile('left', file('Media', { uploadedByUid: 'left', access: 'restricted' }), org, { status: 'REMOVED' }), false);
});

test('a department file reaches only that department', () => {
  assert.equal(canSeeOrgFile('m', file('Media'), org, seat('media')), true);
  assert.equal(canSeeOrgFile('mus', file('Media'), org, seat('music')), false);
  assert.equal(canSeeOrgFile('mediaHead', file('Media'), org, seat()), true);
  assert.equal(canSeeOrgFile('staffMedia', file('Music'), org, seat('media')), false);
});

test('org admins see all but Finance; owner, IT Admin and finance see Finance', () => {
  assert.equal(canSeeOrgFile('admin', file('Music'), org, seat()), true);
  assert.equal(canSeeOrgFile('admin', file('Finance'), org, seat()), false);
  for (const uid of ['owner', 'it', 'senior', 'treasurer']) assert.equal(canSeeOrgFile(uid, file('Finance'), org, seat()), true, uid);
  assert.equal(canSeeOrgFile('m', file('Finance'), org, seat('media')), false);
  assert.equal(canSeeOrgFile('f', file('Finance'), org, seat('fin')), true);
});

test('students reach class files but never answer keys', () => {
  assert.equal(canSeeOrgFile('student', file('Grace Education'), org, seat()), true);
  assert.equal(canSeeOrgFile('student', file('Grace Education', { assetVariant: 'ANSWER_KEY' }), org, seat()), false);
  assert.equal(canSeeOrgFile('teacher', file('Grace Education', { assetVariant: 'ANSWER_KEY' }), org, seat('edu')), true);
});

test('a restricted file reaches its grantees, including someone outside the org', () => {
  const locked = file('Media', { access: 'restricted', accessUids: ['guest'] });
  assert.equal(canSeeOrgFile('guest', locked, org, null), true);
  assert.equal(canSeeOrgFile('admin', locked, org, seat()), false);
  assert.equal(canSeeOrgFile('m', locked, org, seat('media')), false);
  assert.equal(canSeeOrgFile('it', locked, org, seat()), true);
});

test('a revoked file reaches no grantee', () => {
  assert.equal(canSeeOrgFile('guest', file('Media', { access: 'revoked', accessUids: [] }), org, null), false);
});

test('no org record means no access', () => {
  assert.equal(canSeeOrgFile('owner', file(), null, seat()), false);
});

test('a record cannot point at a stored object outside its own space', () => {
  const mine = { scopeKind: 'user', scopeId: 'attacker' };
  assert.equal(hqObjectPathInScope(mine, 'protected-hq/user/attacker/a/x.pdf'), true);
  assert.equal(hqObjectPathInScope(mine, 'protected-hq/org/victim/secret/x.pdf'), false);
  assert.equal(hqObjectPathInScope(mine, 'protected-hq/user/attacker/../../org/victim/x.pdf'), false);
  assert.equal(hqObjectPathInScope(mine, 'books/classics/x.txt'), false);
  assert.equal(hqObjectPathInScope(mine, undefined), false);
  assert.equal(hqObjectPathInScope(null, 'protected-hq/user/attacker/x'), false);
});
