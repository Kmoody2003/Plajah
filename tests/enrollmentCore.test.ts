import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRoster, enrollmentId, newEnrollment, programRoster, ENROLLED_STUDENT } from '../services/enrollmentCore';
import { canManageProgram } from '../services/enrollmentServer';

const course = { kind: 'christian_ed' as const, courseId: 'p1', courseTitle: 'Revelation 2', orgId: 'o1', source: 'class_roster' };

test('a new record is an active Enrolled Student with a stable id', () => {
  const e = newEnrollment({ uid: 'u1', ...course }, 100);
  assert.equal(e.id, 'christian_ed_p1_u1');
  assert.equal(e.id, enrollmentId('christian_ed', 'p1', 'u1'));
  assert.equal(e.role, ENROLLED_STUDENT);
  assert.equal(e.status, 'active');
  assert.equal(e.enrolledAt, 100);
});

test('roster diff enrolls the new, ends the departed, leaves the rest', () => {
  const existing = [
    { uid: 'stay', status: 'active' as const, courseTitle: 'Revelation 2', orgId: 'o1' },
    { uid: 'left', status: 'active' as const, courseTitle: 'Revelation 2', orgId: 'o1' },
    { uid: 'back', status: 'ended' as const, courseTitle: 'Revelation 2', orgId: 'o1' },
  ];
  const d = diffRoster(['stay', 'new', 'back'], existing, course);
  assert.deepEqual(d.enroll.map(e => e.uid).sort(), ['back', 'new']);
  assert.deepEqual(d.end, ['left']);
  assert.deepEqual(d.retitle, []);
});

test('a renamed class updates its students without re-enrolling them', () => {
  const d = diffRoster(['a'], [{ uid: 'a', status: 'active', courseTitle: 'Old name', orgId: 'o1' }], course);
  assert.deepEqual(d.enroll, []);
  assert.deepEqual(d.end, []);
  assert.deepEqual(d.retitle, ['a']);
});

test('only real account ids are enrolled (paper-only kids and junk are skipped)', () => {
  const d = diffRoster(['ok', '', null, 'a/b', 42], [], course);
  assert.deepEqual(d.enroll.map(e => e.uid), ['ok']);
});

test('the roster is studentUids plus roster rows that have an account', () => {
  assert.deepEqual(programRoster({ studentUids: ['a'], students: [{ uid: 'b' }, { uid: 'a' }, { name: 'Paper kid' }] }).sort(), ['a', 'b']);
  assert.deepEqual(programRoster(null), []);
});

test('only the class staff and org leaders may sync a roster', () => {
  const program = { createdBy: 'creator', teacherUids: ['teach'], orgId: 'o1' };
  const org = { creatorId: 'owner', admins: ['adm'], pastorUids: ['pas'], eduTeacherUids: ['edu'], staffUids: [], itAdminUids: [] };
  for (const uid of ['creator', 'teach', 'owner', 'adm', 'pas', 'edu']) assert.equal(canManageProgram(uid, program, org), true, uid);
  assert.equal(canManageProgram('student', program, org), false);
  assert.equal(canManageProgram('owner', null, org), false);
});
