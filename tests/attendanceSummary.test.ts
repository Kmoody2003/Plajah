import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAttendance, dayKey, type AttendanceRecord, type AttendanceStatus } from '../services/attendanceService';

const rec = (date: string, status: AttendanceStatus, classId = 'c1'): AttendanceRecord => ({
  id: `${classId}_${date}_s`, classId, className: 'Class', teacherUid: 't', studentId: 's', guardianUids: [], date, status, markedAt: 0,
});

test('no marks means no rate', () => {
  const s = summarizeAttendance([]);
  assert.equal(s.days, 0);
  assert.equal(s.rate, null);
  assert.deepEqual(s.recent, []);
});

test('rate counts present and tardy as in class', () => {
  const s = summarizeAttendance([rec('2026-10-19', 'present'), rec('2026-10-20', 'tardy'), rec('2026-10-21', 'absent'), rec('2026-10-22', 'excused')]);
  assert.equal(s.days, 4);
  assert.deepEqual(s.counts, { present: 1, tardy: 1, absent: 1, excused: 1 });
  assert.equal(s.rate, 50);
});

test('several classes on one day collapse to the worst mark', () => {
  const s = summarizeAttendance([rec('2026-10-20', 'present', 'math'), rec('2026-10-20', 'absent', 'ela'), rec('2026-10-20', 'tardy', 'sci')]);
  assert.equal(s.days, 1);
  assert.deepEqual(s.recent, [{ date: '2026-10-20', status: 'absent' }]);
});

test('recent is oldest first and capped', () => {
  const recs = Array.from({ length: 25 }, (_, i) => rec(`2026-09-${String(i + 1).padStart(2, '0')}`, 'present'));
  const s = summarizeAttendance(recs.reverse(), 20);
  assert.equal(s.recent.length, 20);
  assert.equal(s.recent[0].date, '2026-09-06');
  assert.equal(s.recent[19].date, '2026-09-25');
});

test('dayKey uses the local calendar day', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 7, 55)), '2026-01-05');
});
