import test from 'node:test';
import assert from 'node:assert/strict';
import { belongsToOrg, canPostAsOrg } from '../services/identityPowers';

const org = { creatorId: 'owner', admins: ['admin'], staffUids: ['staff'], itAdminUids: ['it'] } as any;
const seat = (over: Record<string, unknown>) => ({ status: 'ACTIVE', role: 'MEMBER', ...over }) as any;

test('an ordinary member can switch into the account', () => {
  assert.equal(belongsToOrg('m', org, seat({})), true);
});

test('switching in gives an ordinary member nothing to speak with', () => {
  assert.equal(canPostAsOrg('m', org, seat({})), false);
  assert.equal(canPostAsOrg('m', org, seat({ role: 'MODERATOR' })), false);
});

test('people who run the org keep posting as it, seat row or not', () => {
  for (const uid of ['owner', 'admin', 'staff', 'it']) {
    assert.equal(belongsToOrg(uid, org, null), true, uid);
    assert.equal(canPostAsOrg(uid, org, null), true, uid);
  }
});

test('staff seats and employees keep the power they already had', () => {
  assert.equal(canPostAsOrg('s', org, seat({ role: 'STAFF' })), true);
  assert.equal(canPostAsOrg('e', org, seat({ isEmployee: true })), true);
  assert.equal(canPostAsOrg('p', org, seat({ permissions: ['POST_AS_ORG'] })), true);
});

test('a pending or ended seat, or none, is outside', () => {
  for (const status of ['PENDING', 'REMOVED']) {
    assert.equal(belongsToOrg('x', org, seat({ status })), false, status);
    assert.equal(canPostAsOrg('x', org, seat({ status, role: 'STAFF' })), false, status);
  }
  assert.equal(belongsToOrg('x', org, null), false);
  assert.equal(belongsToOrg(null, org, seat({})), false);
  assert.equal(belongsToOrg('x', null, seat({})), false);
});
