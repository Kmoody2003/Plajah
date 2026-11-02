import test from 'node:test';
import assert from 'node:assert/strict';
import { overQuota, quotaKey } from '../services/usageQuota';
import { ownerAfterPublish } from '../services/passportCore';
import { newShortId } from '../services/evite/eviteCore';

test('quota keys hide the subject and roll daily', () => {
  const a = quotaKey('veo', 'someone@example.com', Date.UTC(2026, 10, 1));
  assert.ok(!a.includes('someone') && a.startsWith('veo_') && a.endsWith('_2026-11-01'));
  assert.notEqual(a, quotaKey('veo', 'someone@example.com', Date.UTC(2026, 10, 2)));
});
test('the limit itself is allowed, one over is not, and no count is no verdict', () => {
  assert.equal(overQuota(10, 10), false);
  assert.equal(overQuota(11, 10), true);
  assert.equal(overQuota(null, 10), false);
});
test('a self-claim loses to the shop customer and never collects history', () => {
  assert.deepEqual(ownerAfterPublish({ ownerUid: 'squatter', selfClaimed: true }, 'real', () => 'C'), { ownerUid: 'real', selfClaimed: false, claimCode: '' });
  assert.deepEqual(ownerAfterPublish({ ownerUid: 'squatter', selfClaimed: true }, undefined, () => 'C'), { ownerUid: '', selfClaimed: false, claimCode: 'C' });
  assert.equal(ownerAfterPublish({ ownerUid: 'squatter', selfClaimed: true }, 'squatter', () => 'C').ownerUid, 'squatter');
});
test('a confirmed owner never changes from a ticket', () => {
  assert.deepEqual(ownerAfterPublish({ ownerUid: 'amy' }, 'other', () => 'C'), { ownerUid: 'amy', selfClaimed: false });
});
test('evite ids come from the crypto source and fit the format', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newShortId(8)));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[a-z2-9]{8}$/);
  assert.equal(newShortId(3, () => 0), 'aaa');
});
