import test from 'node:test';
import assert from 'node:assert/strict';
import { courseStats } from '../services/creatorCourses';

test('a viewer without the roster sees the public seat count', () => {
  assert.equal(courseStats({ price: 0, enrolledStudents: [], ownerId: 'o', capacity: 5, enrolledCount: 3 }).seatsLeft, 2);
});
test('the roster wins for the teacher, leaving the owner out', () => {
  const s = courseStats({ price: 0, enrolledStudents: ['o', 'a'], ownerId: 'o', capacity: 5, enrolledCount: 2 });
  assert.equal(s.seatsLeft, 4);
});
