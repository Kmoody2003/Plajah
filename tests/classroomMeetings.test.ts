import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compiled = ts.transpileModule(fs.readFileSync(new URL('../services/classroomMeetings.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function harness(uid = 'teacher') {
  const records = new Map<string, any>([['classrooms/school', { ownerId: 'teacher', enrolledStudents: ['student', 'student'] }]]);
  const snapshot = (path: string) => ({ exists: () => records.has(path), data: () => records.get(path) });
  const firestore = {
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (db: any, ...path: string[]) => path.length ? { path: path.join('/'), id: path.at(-1) } : { path: db.path + '/session', id: 'session' },
    getDoc: async (ref: any) => snapshot(ref.path),
    writeBatch: () => { const pending: any[] = []; return { set: (ref: any, data: any) => pending.push([ref.path, data]), commit: async () => pending.forEach(([path, data]) => records.set(path, data)) }; },
    runTransaction: async (_db: unknown, work: Function) => { const pending: any[] = []; const result = await work({ get: async (ref: any) => snapshot(ref.path), update: (ref: any, data: any) => pending.push([ref.path, data]) }); pending.forEach(([path, data]) => records.set(path, { ...records.get(path), ...data })); return result; },
  };
  const module = { exports: {} as any };
  vm.runInNewContext(compiled, { module, exports: module.exports, Date, require: (name: string) => {
    if (name === './firebase') return { auth: { currentUser: { uid } }, db: {} };
    if (name === 'firebase/firestore') return firestore;
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return { api: module.exports, records };
}
const form = { title: 'Biology', scheduledAt: 1000, durationMinutes: 60 };
test('native scheduling atomically creates a class session and an exact deduplicated teacher/student roster', async () => {
  const { api, records } = harness(); await api.scheduleClassroomMeeting('school', form);
  const room = records.get('chat_rooms/class_meeting_session');
  assert.deepEqual(Array.from(room.participants), ['teacher', 'student']);
  assert.equal(room.workspaceType, 'CLASSROOM_MEETING'); assert.equal(room.liveClassSessionId, 'session');
  const session = records.get('liveClassSessions/session');
  assert.equal(session.status, 'SCHEDULED'); assert.ok(!('meetingUrl' in session));
  assert.ok(Object.values(session).every(value => value !== undefined));
});
test('external sessions preserve HTTPS links without creating native room data', async () => {
  const { api, records } = harness(); await api.scheduleClassroomMeeting('school', { ...form, meetingUrl: 'https://example.com/meeting' });
  assert.equal(records.size, 2); assert.equal(records.get('liveClassSessions/session').meetingUrl, 'https://example.com/meeting');
});
test('students cannot schedule and malformed scheduling data is rejected', async () => {
  await assert.rejects(harness('student').api.scheduleClassroomMeeting('school', form));
  const h = harness();
  await assert.rejects(h.api.scheduleClassroomMeeting('school', { ...form, durationMinutes: NaN }));
  await assert.rejects(h.api.scheduleClassroomMeeting('school', { ...form, meetingUrl: 'javascript:alert(1)' }));
  assert.equal(h.records.size, 1);
});
test('only teacher starts native meeting; enrollment and ended state gate joining', async () => {
  const teacher = harness(); await teacher.api.scheduleClassroomMeeting('school', form);
  const student = harness('student'); teacher.records.forEach((value, key) => student.records.set(key, value));
  await assert.rejects(student.api.joinClassroomMeeting('session'), /not started/);
  const room = await teacher.api.joinClassroomMeeting('session'); assert.equal(room.id, 'class_meeting_session');
  teacher.records.forEach((value, key) => student.records.set(key, value));
  assert.equal((await student.api.joinClassroomMeeting('session')).id, room.id);
  await assert.rejects(student.api.endClassroomMeeting('session'), /Only the host/);
  student.records.set('classrooms/school', { ownerId: 'teacher', enrolledStudents: [] });
  await assert.rejects(student.api.joinClassroomMeeting('session'), /enrolled/);
  await teacher.api.endClassroomMeeting('session');
  await assert.rejects(teacher.api.joinClassroomMeeting('session'), /unavailable/);
});
