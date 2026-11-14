// routes/worksheetGrading.ts over HTTP with fake auth + Firestore, plus services/worksheetKeys.ts:
// the student copy has no key, checks never reveal it, and /grade scores from the server-held key.
//   npx tsx --test tests/worksheetGradingRoute.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createWorksheetGradingRouter, type WorksheetGradingDeps } from '../routes/worksheetGrading';
import { hasEmbeddedKeys, splitWorksheetKeys, withWorksheetKeys } from '../services/worksheetKeys';
import type { DigitalWorksheet } from '../services/worksheetDigitizer';

type Doc = Record<string, any>;
const FULL = {
  id: 'w1', title: 'Addition', subject: 'Math', createdBy: 'teacher', accessUids: ['student'], createdAt: 1,
  fields: [
    { id: 'q1', label: '7 + 6 =', type: 'numeric', box: { x: 0, y: 0, width: 1, height: 1 }, correctAnswer: '13', points: 1, standardIds: ['S1'] },
    { id: 'q2', label: 'Capital of France', type: 'short-text', box: { x: 0, y: 0, width: 1, height: 1 }, correctAnswer: 'Paris', points: 1 },
    { id: 'q3', label: 'Explain', type: 'long-text', box: { x: 0, y: 0, width: 1, height: 1 }, points: 2, needsManualGrade: true },
  ],
} as unknown as DigitalWorksheet;

function world(sub?: Doc) {
  const { publicSheet, keys } = splitWorksheetKeys(FULL);
  const { id: _i, ...pub } = publicSheet;
  const docs = new Map<string, Doc>([
    ['digital_worksheets/w1', pub],
    ['digital_worksheet_keys/w1', { worksheetId: 'w1', createdBy: 'teacher', keys }],
  ]);
  if (sub) docs.set('worksheet_submissions/w1_student', sub);
  const patches: Array<{ path: string; data: Doc }> = [];
  const deps: WorksheetGradingDeps = {
    verify: async (t: string) => (t ? { uid: t, isAnonymous: t === 'anon' } : null),
    get: async (p: string) => docs.get(p) || null,
    patch: async (p: string, d: Doc) => { patches.push({ path: p, data: d }); return true; },
  };
  return { deps, patches };
}

async function call(deps: WorksheetGradingDeps, path: string, uid: string | null, body: Doc) {
  const app = express();
  app.use('/w', express.json(), createWorksheetGradingRouter(deps));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const r = await fetch(`http://127.0.0.1:${port}/w/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(uid ? { Authorization: `Bearer ${uid}` } : {}) }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as Doc };
  } finally { server.close(); }
}

test('the student copy carries no key; the teacher copy gets it back', () => {
  const { publicSheet, keys } = splitWorksheetKeys(FULL);
  assert.equal(hasEmbeddedKeys(publicSheet), false);
  assert.equal(publicSheet.answerKeyWithheld, true);
  assert.ok(!JSON.stringify(publicSheet).includes('Paris'));
  assert.deepEqual(keys, { q1: '13', q2: 'Paris' });
  assert.equal(withWorksheetKeys(publicSheet, keys).fields[1].correctAnswer, 'Paris');
});

test('check: looks-good / try-again without ever sending the answer', async () => {
  const { deps } = world();
  const r = await call(deps, 'check', 'student', { worksheetId: 'w1', answers: { q1: '13', q2: 'London', q3: 'because' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.perField.q1.status, 'looks-good');
  assert.equal(r.body.perField.q2.status, 'try-again');
  assert.equal(r.body.perField.q3.status, 'teacher-reviews');
  assert.ok(!JSON.stringify(r.body).includes('Paris'), 'the key must not appear in a check');
});

test('check: only people the worksheet is shared with', async () => {
  const { deps } = world();
  assert.equal((await call(deps, 'check', 'stranger', { worksheetId: 'w1', answers: {} })).status, 404);
  assert.equal((await call(deps, 'check', null, { worksheetId: 'w1', answers: {} })).status, 401);
  assert.equal((await call(deps, 'check', 'anon', { worksheetId: 'w1', answers: {} })).status, 401);
  assert.equal((await call(deps, 'check', 'student', { worksheetId: '../admins/x', answers: {} })).status, 404);
});

test('grade: scores the saved answers with the server-held key and stores no key', async () => {
  const { deps, patches } = world({ worksheetId: 'w1', studentId: 'student', studentName: 'Sam', status: 'turned-in', answers: { q1: '13', q2: 'paris ', q3: 'x' }, turnedInAt: 5 });
  const r = await call(deps, 'grade', 'student', { worksheetId: 'w1' });
  assert.equal(r.status, 200);
  assert.equal(r.body.grade.score, 2);
  assert.equal(r.body.grade.maxScore, 2);
  assert.equal(r.body.grade.needsManualReview, true);
  assert.equal(patches.length, 1);
  assert.equal(patches[0].path, 'worksheet_submissions/w1_student');
  assert.equal(patches[0].data.percent, 100);
  assert.ok(!JSON.stringify(patches[0].data).includes('Paris'), 'the pre-assessment on the submission must not carry the key');
});

test('grade: needs a turned-in submission of your own', async () => {
  assert.equal((await call(world().deps, 'grade', 'student', { worksheetId: 'w1' })).status, 409);
  const opened = world({ worksheetId: 'w1', studentId: 'student', status: 'opened', answers: {} });
  assert.equal((await call(opened.deps, 'grade', 'student', { worksheetId: 'w1' })).status, 409);
  assert.equal(opened.patches.length, 0);
});

test('legacy split: strips keys from old worksheets once, keeping each key teacher-side', async () => {
  const { splitLegacyWorksheetKeys } = await import('../routes/worksheetGrading');
  const docs = new Map<string, Doc>([
    ['digital_worksheets/old1', { title: 'Old', createdBy: 'teacher', fields: [{ id: 'q1', type: 'numeric', correctAnswer: '13', points: 1 }] }],
    ['digital_worksheets/new1', { title: 'New', createdBy: 'teacher', answerKeyWithheld: true, fields: [{ id: 'q1', type: 'numeric', points: 1 }] }],
    ['digital_worksheet_keys/old1', { keys: { q0: 'kept' } }],
  ]);
  let patches = 0;
  const deps = {
    get: async (p: string) => docs.get(p) || null,
    set: async (p: string, d: Doc) => { docs.set(p, d); return true; },
    patch: async (p: string, d: Doc) => { patches++; docs.set(p, { ...(docs.get(p) || {}), ...d }); return true; },
    list: async (c: string) => [...docs].filter(([k]) => k.startsWith(c + '/')).map(([k, data]) => ({ id: k.split('/')[1], data })),
  };
  const r = await splitLegacyWorksheetKeys(deps as never);
  assert.deepEqual(r, { scanned: 2, split: 1 });
  assert.ok(!JSON.stringify(docs.get('digital_worksheets/old1')).includes('13'));
  assert.equal(docs.get('digital_worksheets/old1')!.answerKeyWithheld, true);
  assert.deepEqual(docs.get('digital_worksheet_keys/old1')!.keys, { q0: 'kept', q1: '13' });
  assert.equal(patches, 1, 'already-split worksheets are left alone');
  assert.deepEqual(await splitLegacyWorksheetKeys(deps as never), { scanned: 0, split: 0, skipped: true });
});

test('legacy split: a worksheet stays keyed if its key could not be stored', async () => {
  const { splitLegacyWorksheetKeys } = await import('../routes/worksheetGrading');
  const docs = new Map<string, Doc>([['digital_worksheets/w', { createdBy: 't', fields: [{ id: 'q1', type: 'short-text', correctAnswer: 'Paris', points: 1 }] }]]);
  const deps = {
    get: async (p: string) => docs.get(p) || null,
    set: async (p: string, d: Doc) => { if (p.startsWith('digital_worksheet_keys/')) return false; docs.set(p, d); return true; },
    patch: async () => { throw new Error('must not strip without a stored key'); },
    list: async () => [{ id: 'w', data: docs.get('digital_worksheets/w')! }],
  };
  assert.deepEqual(await splitLegacyWorksheetKeys(deps as never), { scanned: 1, split: 0 });
});
