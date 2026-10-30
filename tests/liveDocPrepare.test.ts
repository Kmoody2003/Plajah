//   npx tsx --test tests/liveDocPrepare.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceMayApply, deviceTakesInput, gradeLiveResponse, mayInteract, prepareLiveDoc, watcherMayTouch } from '../services/liveDocPrepare';

const doc: any = {
  id: 'd', ownerId: 'o', title: 'T', frames: [{ id: 'f', deviceIds: ['b', 'm', 'n'] }],
  devices: {
    b: { id: 'b', type: 'BASE', fields: [{ id: 'a', name: 'Q', correctAnswer: 'SECRET', acceptedAnswers: ['SECRET2'], explanation: 'WHY' }], rows: [] },
    m: { id: 'm', type: 'MEDIA', kind: 'VIDEO', src: 'blob:http://x/1', sessionOnly: true },
    v: { id: 'v', type: 'MEDIA', kind: 'VIDEO', src: 'https://x/y.mp4' },
    n: { id: 'n', type: 'NOTES', body: 'PRIVATE', domainBinding: { encryptedAtRest: true } },
  },
};

test('the audience copy has no answer keys and no private Notes', () => {
  const json = JSON.stringify(prepareLiveDoc(doc).doc);
  for (const s of ['SECRET', 'WHY', 'PRIVATE']) assert.ok(!json.includes(s), s);
  assert.ok(json.includes('https://x/y.mp4'), 'real media stays');
});

test('files only the presenter can open are counted, so they can be warned', () => {
  assert.equal(prepareLiveDoc(doc).deadMedia, 1);
});

test('the audience can answer but cannot restructure the lesson', () => {
  for (const type of ['ADD_BASE_ROW', 'SET_BASE_CELL', 'SET_GRID_CELL', 'WRITER_EDIT']) assert.ok(audienceMayApply({ type }), type);
  for (const type of ['DELETE_BASE_ROW', 'DELETE_VECTOR_OBJECT', 'SET_LOCKED', 'UPDATE_BASE_FIELD']) assert.ok(!audienceMayApply({ type }), type);
  assert.ok(!audienceMayApply(null));
});

test('following is read only; own copy and together take input', () => {
  assert.ok(!deviceTakesInput('FORM', 'FOLLOW'));
  assert.ok(deviceTakesInput('FORM', 'OWN_COPY'));
  assert.ok(deviceTakesInput('WRITER', 'TOGETHER'));
  assert.ok(!deviceTakesInput('VECTOR', 'TOGETHER'));
});

const quiz: any = {
  id: 'q', frames: [], devices: {
    b: { id: 'b', type: 'BASE', rows: [], fields: [
      { id: 'a', name: 'A', type: 'TEXT', interaction: { kind: 'QUESTION', prompt: 'Capital of France?', responseType: 'SHORT_TEXT', required: true, points: 2, correctAnswer: 'Paris' } },
      { id: 'b', name: 'B', type: 'TEXT', interaction: { kind: 'QUESTION', prompt: 'Why?', responseType: 'LONG_TEXT', required: true, points: 3 } },
    ] },
  },
};
const answer = (a: string, b: string) => JSON.stringify({ type: 'ADD_BASE_ROW', deviceId: 'b', row: { id: 'r', values: { a, b } } });

test('a submission is marked against the original keys, which the audience copy lacks', () => {
  const g = gradeLiveResponse(quiz, answer('Paris', 'Because'))!;
  assert.equal(g.fields[0].status, 'CORRECT');
  assert.equal(g.fields[0].earned, 2);
  assert.equal(g.fields[1].status, 'MANUAL_REVIEW');
  assert.equal(g.needsReview, true);
  const stripped = gradeLiveResponse(prepareLiveDoc(quiz).doc, answer('Paris', 'Because'))!;
  assert.notEqual(stripped.fields[0].status, 'CORRECT');
});

test('hand marks override the automatic mark and clear the review flag', () => {
  const g = gradeLiveResponse(quiz, answer('Rome', 'Because'), { b: 'CORRECT' })!;
  assert.equal(g.fields[0].earned, 0);
  assert.equal(g.fields[1].earned, 3);
  assert.equal(g.earned, 3);
  assert.equal(g.percent, 60);
  assert.equal(g.needsReview, false);
});

test('anything but a form submission is not marked', () => {
  assert.equal(gradeLiveResponse(quiz, '{"type":"SET_LOCKED"}'), null);
  assert.equal(gradeLiveResponse(quiz, 'not json'), null);
});

test('interacting is invite only and needs a real sign-in', () => {
  const src = { hostUid: 'h', invitedUids: ['in'] };
  assert.ok(mayInteract(src, { uid: 'h' }));
  assert.ok(mayInteract(src, { uid: 'in' }));
  assert.ok(!mayInteract(src, { uid: 'watcher' }));
  assert.ok(!mayInteract(src, { uid: 'in', isAnonymous: true }));
  assert.ok(!mayInteract(src, null));
  assert.ok(!mayInteract(null, { uid: 'h' }));
});

test('a watcher keeps only their own play and volume', () => {
  assert.ok(watcherMayTouch({ type: 'MEDIA', kind: 'VIDEO' }));
  assert.ok(!watcherMayTouch({ type: 'MEDIA', kind: 'MODEL_3D' }));
  assert.ok(!watcherMayTouch({ type: 'FIGURE' }));
  assert.ok(!watcherMayTouch({ type: 'FORM' }));
});
