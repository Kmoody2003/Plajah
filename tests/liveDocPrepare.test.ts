//   npx tsx --test tests/liveDocPrepare.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { audienceMayApply, deviceTakesInput, mayInteract, prepareLiveDoc, watcherMayTouch } from '../services/liveDocPrepare';

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

test('the audience can work on shared text and data, but nothing is turned in', () => {
  for (const type of ['SET_GRID_CELL', 'WRITER_EDIT']) assert.ok(audienceMayApply({ type }), type);
  for (const type of ['ADD_BASE_ROW', 'SET_BASE_CELL', 'DELETE_BASE_ROW', 'DELETE_VECTOR_OBJECT', 'SET_LOCKED', 'UPDATE_BASE_FIELD']) assert.ok(!audienceMayApply({ type }), type);
  assert.ok(!audienceMayApply(null));
});

test('following is read only; own copy and together take input', () => {
  assert.ok(!deviceTakesInput('FORM', 'FOLLOW'));
  assert.ok(!deviceTakesInput('FORM', 'OWN_COPY'));
  assert.ok(deviceTakesInput('GRID', 'OWN_COPY'));
  assert.ok(deviceTakesInput('WRITER', 'TOGETHER'));
  assert.ok(!deviceTakesInput('VECTOR', 'TOGETHER'));
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
