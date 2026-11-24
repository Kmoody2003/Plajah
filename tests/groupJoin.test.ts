import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isGroupLeader } from '../routes/elevateGroups';

import { isPublicGroup, isInGroup } from '../services/groupMembership';

const org = { creatorId: 'owner', admins: ['admin1'], accountUid: 'acct' };
const youth = { id: 'youth', headUids: ['head1'] };

describe('group leaders (who may approve join requests)', () => {
  it('org owner, linked account and org admins lead every group', () => {
    for (const uid of ['owner', 'acct', 'admin1']) assert.equal(isGroupLeader(org, youth, uid, null), true, uid);
  });
  it('the group’s heads lead it', () => {
    assert.equal(isGroupLeader(org, youth, 'head1', null), true);
  });
  it('pastors and org-role admins lead every group', () => {
    assert.equal(isGroupLeader(org, youth, 'p', { role: 'MEMBER', roleKey: 'SENIOR_PASTOR' }), true);
    assert.equal(isGroupLeader(org, youth, 'a', { role: 'ADMIN' }), true);
  });
  it('a lead role in THIS group counts; in another group it does not', () => {
    assert.equal(isGroupLeader(org, youth, 'x', { role: 'MEMBER', ministryRoles: [{ ministryId: 'youth', roleKey: 'DEPARTMENT_HEAD' }] }), true);
    assert.equal(isGroupLeader(org, youth, 'x', { role: 'MEMBER', ministryRoles: [{ ministryId: 'choir', roleKey: 'DEPARTMENT_HEAD' }] }), false);
  });
  it('plain members and volunteers in the group are not leaders', () => {
    assert.equal(isGroupLeader(org, youth, 'm', { role: 'MEMBER', ministryIds: ['youth'] }), false);
    assert.equal(isGroupLeader(org, youth, 'v', { role: 'MEMBER', ministryRoles: [{ ministryId: 'youth', roleKey: 'VOLUNTEER' }] }), false);
    assert.equal(isGroupLeader(org, youth, 'stranger', null), false);
  });
});

describe('Join vs Follow', () => {
  it('public groups are followed; private ones are requested', () => {
    assert.equal(isPublicGroup({ allowFollowers: true }), true);
    assert.equal(isPublicGroup({ threadAudience: 'PUBLIC' }), true);
    assert.equal(isPublicGroup({ threadAudience: 'DEPARTMENT' }), false);
    assert.equal(isPublicGroup({}), false);
  });
  it('already in the group as head, member or role holder', () => {
    assert.equal(isInGroup(youth, null, 'head1'), true);
    assert.equal(isInGroup(youth, { ministryIds: ['youth'] }, 'm'), true);
    assert.equal(isInGroup(youth, { ministryRoles: [{ ministryId: 'youth' }] }, 'r'), true);
    assert.equal(isInGroup(youth, { ministryIds: ['choir'] }, 'm'), false);
    assert.equal(isInGroup(youth, null, undefined), false);
  });
});
