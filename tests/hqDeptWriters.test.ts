import test from 'node:test';
import assert from 'node:assert/strict';
import { hqRecordForClient, hqWriteUidsFor } from '../services/hqAccessPolicy';

const org = {
  admins: ['adm'], staffUids: ['st'], seniorPastorUids: ['sp'], financeUids: ['fin'], accountingUids: ['acc'], departmentUids: { y: ['dm'] },
  ministries: [{ id: 'y', name: 'Youth', headUids: ['head'] }, { id: 'f', name: 'Finance' }, { id: 'e', name: 'Great Faith Education' }],
};
const members = [{ userId: 'm1', status: 'ACTIVE', ministryIds: ['y'] }, { userId: 'gone', status: 'REMOVED', ministryIds: ['y'] }, { userId: 'other', status: 'ACTIVE', ministryIds: ['f'] }];

test('a department file lists its people and admins, not other staff or former members', () => {
  assert.deepEqual(hqWriteUidsFor({ departmentId: 'y' }, org, members), ['adm', 'dm', 'head', 'm1']);
});
test('a Finance file leaves org admins out', () => {
  const list = hqWriteUidsFor({ folder: 'Finance' }, org, members)!;
  assert.ok(list.includes('fin') && list.includes('sp') && list.includes('other'));
  assert.ok(!list.includes('adm') && !list.includes('st'));
});
test('no department, education and restricted files carry no marker', () => {
  assert.equal(hqWriteUidsFor({ folder: 'Random' }, org, members), null);
  assert.equal(hqWriteUidsFor({ departmentId: 'e' }, org, members), null);
  assert.equal(hqWriteUidsFor({ departmentId: 'y', access: 'restricted' }, org, members), null);
});
test('the marker never reaches a client', () => {
  assert.deepEqual(hqRecordForClient({ id: 'a', hqWriteUids: ['x'] }), { id: 'a' });
});
