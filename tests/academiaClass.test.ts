// routes/academiaClass.ts over HTTP with fake auth + Firestore: only a class's own teacher reads its mastery
// or records assessments, and only for enrolled students.
//   npx tsx --test tests/academiaClass.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAcademiaClassRouter, type AcademiaClassDeps } from '../routes/academiaClass';

type Doc = Record<string, any>;
function world() {
  const docs = new Map<string, Doc>([
    ['classrooms/c1', { ownerId: 'teacher', enrolledStudents: ['s1', 's2'] }],
    ['learnerProficiency/s1', { byStandard: { 'CCSS.MATH.2.OA.B.2': 80 } }],
  ]);
  const writes: Array<{ path: string; data: Doc }> = [];
  const deps: AcademiaClassDeps = {
    verify: async (t: string) => (t ? { uid: t, isAnonymous: t === 'anon' } : null),
    get: async (p: string) => docs.get(p) || null,
    patch: async (p: string, d: Doc) => { writes.push({ path: p, data: d }); docs.set(p, { ...(docs.get(p) || {}), ...d }); return true; },
    create: async (c: string, d: Doc) => { writes.push({ path: c, data: d }); return 'r1'; },
  };
  return { deps, writes };
}
async function call(deps: AcademiaClassDeps, path: string, uid: string | null, body: Doc) {
  const app = express();
  app.use('/c', express.json(), createAcademiaClassRouter(deps));
  const server = app.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/c/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as Doc };
  } finally { server.close(); }
}

test('the teacher reads their class mastery; students with no evidence come back empty', async () => {
  const r = await call(world().deps, 'mastery', 'teacher', { classId: 'c1' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.students, [{ id: 's1', byStandard: { 'CCSS.MATH.2.OA.B.2': 80 } }, { id: 's2', byStandard: {} }]);
});

test('nobody else reads it', async () => {
  for (const who of ['s1', 'stranger', 'anon', null]) assert.equal((await call(world().deps, 'mastery', who, { classId: 'c1' })).status, 403);
  assert.equal((await call(world().deps, 'mastery', 'teacher', { classId: 'nope' })).status, 403);
});

test('recording an assessment appends a ledger record and merges proficiency (dotted standard ids kept whole)', async () => {
  const w = world();
  const r = await call(w.deps, 'assess', 'teacher', { classId: 'c1', studentId: 's1', standardId: 'CCSS.ELA.RL.3.2', framework: 'CCSS_ELA', mastery: 75, evidence: 'Song about themes' });
  assert.equal(r.status, 200);
  assert.equal(w.writes[0].path, 'learningLedger/s1/records');
  assert.equal(w.writes[0].data.byUid, 'teacher');
  assert.deepEqual(w.writes[1].data.byStandard, { 'CCSS.MATH.2.OA.B.2': 80, 'CCSS.ELA.RL.3.2': 75 });
});

test('assessments only for enrolled students, sane scores, by the teacher', async () => {
  const base = { classId: 'c1', studentId: 's1', standardId: 'X.1', framework: 'CCSS_ELA', mastery: 75 };
  assert.equal((await call(world().deps, 'assess', 'teacher', { ...base, studentId: 'outsider' })).status, 400);
  assert.equal((await call(world().deps, 'assess', 'teacher', { ...base, mastery: 140 })).status, 400);
  assert.equal((await call(world().deps, 'assess', 's2', base)).status, 403);
});
