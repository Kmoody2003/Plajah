import test from 'node:test';
import { onlyRowsInScope, resolveHqReadScope } from '../services/hqScopeWall';
import assert from 'node:assert/strict';
import { canReviewHqSecurity, canSeeHqFile, canUseOrgShare, canWriteHqFile, hqRecordForClient, hqRecordForOrgShare, isOrgShareable, reviewerCandidates } from '../services/hqAccessPolicy';

const org = { creatorId: 'owner', admins: ['admin'], itAdminUids: ['it'], staffUids: ['staff'], ministries: [{ id: 'fin', name: 'Finance' }, { id: 'media', name: 'Media' }] };
const file = (folder: string, extra: Record<string, unknown> = {}) => ({ scopeKind: 'org', scopeId: 'o', folder, uploadedByUid: 'someone', ...extra });

test('a record never leaves the server with its text', () => {
  const out = hqRecordForClient({ id: 'a', name: 'x', rawContentText: 'secret lesson' });
  assert.equal('rawContentText' in out, false);
  assert.equal(out.hasText, true);
  assert.equal(hqRecordForClient({ id: 'b', hasText: true }).hasText, true);
  assert.equal('hasText' in hqRecordForClient({ id: 'c' }), false);
});

test('the text route check honors the department, for staff who could once read by exact id', () => {
  assert.equal(canSeeHqFile('staff', file('Media'), org, { status: 'ACTIVE', ministryIds: ['music'] }), false);
  assert.equal(canSeeHqFile('staff', file('Media'), org, { status: 'ACTIVE', ministryIds: ['media'] }), true);
  assert.equal(canSeeHqFile('admin', file('Finance'), org, { status: 'ACTIVE' }), false);
  assert.equal(canSeeHqFile('stranger', file('Media'), org, null), false);
});

test("a person's file is theirs alone, and a record of an unknown kind is nobody's", () => {
  assert.equal(canSeeHqFile('me', { scopeKind: 'user', scopeId: 'me' }, null, null), true);
  assert.equal(canSeeHqFile('you', { scopeKind: 'user', scopeId: 'me' }, null, null), false);
  assert.equal(canSeeHqFile('owner', { scopeKind: 'mystery', scopeId: 'o' }, org, null), false);
});

const page = { ownerId: 'boss', staffUids: ['mgr', 'clerk'], staffSeats: { mgr: { role: 'MANAGER' }, clerk: { role: 'STAFF' } } };
const biz = (extra: Record<string, unknown> = {}) => ({ scopeKind: 'business', scopeId: 'p1', uploadedByUid: 'mgr', ...extra });

test("a business's files reach its owner and staff seats, nobody else", () => {
  for (const uid of ['boss', 'mgr', 'clerk']) assert.equal(canSeeHqFile(uid, biz(), page, null), true, uid);
  for (const uid of ['customer', 'gone', '']) assert.equal(canSeeHqFile(uid, biz(), page, null), false, uid);
  assert.equal(canSeeHqFile('boss', biz(), null, null), false);
});

test('a seat that ended takes the files with it, even ones they uploaded', () => {
  assert.equal(canSeeHqFile('gone', biz({ uploadedByUid: 'gone' }), page, null), false);
  assert.equal(canSeeHqFile('gone', biz({ uploadedByUid: 'gone', access: 'restricted' }), page, null), false);
});

test('managers write a business file; other staff only read', () => {
  assert.equal(canWriteHqFile('boss', biz(), page), true);
  assert.equal(canWriteHqFile('mgr', biz(), page), true);
  assert.equal(canWriteHqFile('clerk', biz(), page), false);
  assert.equal(canWriteHqFile('gone', biz(), { ...page, staffSeats: { gone: { role: 'MANAGER' } } }), false);
});

test("only a business's owner reads its security log", () => {
  assert.equal(canReviewHqSecurity('boss', 'business', page), true);
  assert.equal(canReviewHqSecurity('mgr', 'business', page), false);
});

test('a business scope reads as itself and its rows stay apart from a person with the same id', () => {
  const read = resolveHqReadScope({ kind: 'business', id: 'same' }, 'me')!;
  assert.deepEqual(read, { kind: 'business', id: 'same', teacher: false });
  assert.deepEqual(onlyRowsInScope([{ scopeKind: 'user', scopeId: 'same' }, { scopeKind: 'business', scopeId: 'same' }], read), [{ scopeKind: 'business', scopeId: 'same' }]);
  assert.equal(resolveHqReadScope({ kind: 'business', id: 'x' }, null), null);
});

test('a shared file reaches the people who run the receiving org, not its ordinary members', () => {
  const target = { creatorId: 'tOwner', admins: ['tAdmin'], itAdminUids: ['tIt'], staffUids: ['tStaff'] };
  for (const uid of ['tOwner', 'tAdmin', 'tIt', 'tStaff']) assert.equal(canUseOrgShare(uid, target), true, uid);
  assert.equal(canUseOrgShare('tMember', target), false);
  assert.equal(canUseOrgShare('tOwner', null), false);
});

test('restricted, revoked, trashed or non-org files never go to another org', () => {
  assert.equal(isOrgShareable({ scopeKind: 'org' }), true);
  assert.equal(isOrgShareable({ scopeKind: 'org', access: 'restricted' }), false);
  assert.equal(isOrgShareable({ scopeKind: 'org', access: 'revoked' }), false);
  assert.equal(isOrgShareable({ scopeKind: 'org', deletedAt: 5 }), false);
  assert.equal(isOrgShareable({ scopeKind: 'user' }), false);
  assert.equal(isOrgShareable({ scopeKind: 'business' }), false);
});

test('the receiving org learns nothing about the giver beyond the file', () => {
  const out = hqRecordForOrgShare({ id: 'a', name: 'x', rawContentText: 't', storagePath: 'p', sharedOrgIds: ['o2', 'o3'], accessUids: ['u'], accessSpec: {}, uploadedByUid: 'u', folder: 'Finance', departmentId: 'fin', departmentName: 'Finance' });
  assert.deepEqual(out, { id: 'a', name: 'x', hasText: true });
});

test('the reviewer list holds only people in this org who can open this file', () => {
  const seat = (userId: string, extra: Record<string, unknown> = {}) => ({ userId, status: 'ACTIVE', displayName: userId, ministryIds: [], ...extra });
  const members = [seat('owner'), seat('admin'), seat('inMedia', { ministryIds: ['media'] }), seat('inMusic', { ministryIds: ['music'] }), seat('left', { status: 'REMOVED', ministryIds: ['media'] }), seat('emp_x', { ministryIds: ['media'] })];
  assert.deepEqual(reviewerCandidates(file('Media'), org, members, 'admin').map(p => p.uid).sort(), ['inMedia', 'owner']);
  assert.deepEqual(reviewerCandidates(file('Finance'), org, members, 'owner'), []);
});

test("a business's reviewers are its owner and seats, and a person's own files have none", () => {
  assert.deepEqual(reviewerCandidates(biz(), page, [], 'mgr').map(p => p.uid).sort(), ['boss', 'clerk']);
  assert.deepEqual(reviewerCandidates({ scopeKind: 'user', scopeId: 'me' }, org, [{ userId: 'x', status: 'ACTIVE' }], 'me'), []);
  assert.deepEqual(reviewerCandidates(biz(), null, [], 'mgr'), []);
});

test('only writers can set the text', () => {
  assert.equal(canWriteHqFile('owner', file('Media'), org), true);
  assert.equal(canWriteHqFile('staff', file('Media'), org), true);
  assert.equal(canWriteHqFile('someone', file('Media'), org), true);
  assert.equal(canWriteHqFile('member', file('Media'), org), false);
  const locked = file('Media', { access: 'restricted', accessUids: ['grantee'] });
  assert.equal(canWriteHqFile('grantee', locked, org), false);
  assert.equal(canWriteHqFile('staff', locked, org), false);
  assert.equal(canWriteHqFile('it', locked, org), true);
});
