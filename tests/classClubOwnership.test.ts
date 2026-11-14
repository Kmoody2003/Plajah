// npx tsx --test tests/classClubOwnership.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOrgWorker, resolveClubUploadScope } from '../services/classClubOwnership';

const org = { creatorId: 'founder', admins: ['adm'], staffUids: ['staff'], pastorUids: ['pastor'] };
const scope = (uid: string, extra: Partial<Parameters<typeof resolveClubUploadScope>[0]> = {}) =>
  resolveClubUploadScope({ uid, orgId: 'o1', isClassTeacher: false, isClassStudent: false, org, ...extra });

describe('class upload ownership', () => {
  it('a student keeps their work in their own account', () => {
    assert.deepEqual(scope('kid', { isClassStudent: true }), { kind: 'user', id: 'kid' });
  });
  it('a staff member enrolled as a student is participating, so it is theirs', () => {
    assert.deepEqual(scope('staff', { isClassStudent: true }), { kind: 'user', id: 'staff' });
  });
  it('a class teacher, admin, staff or pastor counts against the org', () => {
    assert.deepEqual(scope('volunteerTeacher', { isClassTeacher: true }), { kind: 'org', id: 'o1' });
    for (const uid of ['founder', 'adm', 'staff', 'pastor']) assert.deepEqual(scope(uid), { kind: 'org', id: 'o1' });
  });
  it('an active volunteer membership counts against the org; a plain or pending one does not', () => {
    assert.deepEqual(scope('v', { memberships: [{ status: 'ACTIVE', role: 'MEMBER', roleKeys: ['DEPARTMENT_VOLUNTEER'] }] }), { kind: 'org', id: 'o1' });
    assert.deepEqual(scope('v', { memberships: [{ status: 'PENDING', role: 'STAFF' }] }), { kind: 'user', id: 'v' });
    assert.deepEqual(scope('m', { memberships: [{ status: 'ACTIVE', role: 'MEMBER' }] }), { kind: 'user', id: 'm' });
  });
  it('a class with no org is always the uploader\'s, teacher included', () => {
    assert.deepEqual(scope('t', { orgId: null, isClassTeacher: true }), { kind: 'user', id: 't' });
  });
  it('isOrgWorker handles a missing org', () => {
    assert.equal(isOrgWorker('x', null), false);
  });
});
