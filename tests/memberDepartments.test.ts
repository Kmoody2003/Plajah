import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memberDepartments, myClassRoles, educationDepartment } from '../services/memberDepartments';
import type { Organization, OrgMembership } from '../types';
import type { ChurchProgram } from '../services/churchEducationService';

const org = {
  id: 'org1',
  name: 'Test Church',
  ministries: [
    { id: 'youth', name: 'Youth' },
    { id: 'media', name: 'Media', headUids: ['head1'] },
    { id: 'edu', name: 'Christian Education', templateKey: 'education' },
    { id: 'choir', name: 'Choir' },
  ],
  departmentUids: { choir: ['indexed1'] },
} as unknown as Organization;

const cls = (id: string, extra: Partial<ChurchProgram>) => ({ id, orgId: 'org1', name: id, createdBy: 'creator', students: [], ...extra }) as unknown as ChurchProgram;
const programs = [
  cls('revI', { teacherUids: ['teach1'], students: [{ id: 's', uid: 'kid1', name: 'Kid', addedAt: 0 }], studentUids: ['kid1'] }),
  cls('revII', { assignedTeam: [{ uid: 'teach2', name: 'T2', roleKey: 'INSTRUCTOR' }] }),
];

test('no membership means no departments — never a fallback list', () => {
  assert.deepEqual(memberDepartments(org, null, 'nobody', { programs }), []);
});

test('roster ids, ministry roles, head lists and the department index all count', () => {
  const m = { ministryIds: ['youth'], ministryRoles: [{ ministryId: 'choir', roleKey: 'MEMBER' }] } as unknown as OrgMembership;
  assert.deepEqual(memberDepartments(org, m, 'x').map(d => d.id), ['youth', 'choir']);
  assert.deepEqual(memberDepartments(org, null, 'head1').map(d => d.id), ['media']);
  assert.deepEqual(memberDepartments(org, null, 'indexed1').map(d => d.id), ['choir']);
});

test('teaching or being enrolled in a class puts Christian Ed in the tab row', () => {
  assert.deepEqual(memberDepartments(org, null, 'kid1', { programs }).map(d => d.id), ['edu']);
  assert.deepEqual(memberDepartments(org, null, 'teach2', { programs }).map(d => d.id), ['edu']);
  assert.deepEqual(memberDepartments(org, null, 'admin', { programs, runsChristianEd: true }).map(d => d.id), ['edu']);
  assert.deepEqual(memberDepartments(org, null, 'admin', { programs: [], runsChristianEd: true }), []);
});

test('a student is enrolled only in their own class; teachers include the assigned team', () => {
  assert.deepEqual(myClassRoles(programs, 'kid1').enrolled.map(p => p.id), ['revI']);
  assert.deepEqual(myClassRoles(programs, 'kid1').teaching, []);
  assert.deepEqual(myClassRoles(programs, 'teach1').teaching.map(p => p.id), ['revI']);
  assert.deepEqual(myClassRoles(programs, 'creator').teaching.map(p => p.id), ['revI', 'revII']);
  assert.equal(educationDepartment(org)?.id, 'edu');
});

test('the member task panel carries no hard-coded sample tasks or device-only storage', () => {
  const src = readFileSync('components/elevate/MyOrgTasksAndDepartments.tsx', 'utf8');
  assert.doesNotMatch(src, /localStorage|getDefaultTasksForOrg|task_seed_|SATB vocal stems/);
});
