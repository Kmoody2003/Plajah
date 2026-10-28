import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { presignUrl } from '../services/objectStore/sigv4';
import { collabDecision, collabKey, meetingDecision, meetingSegmentKey, parseObjectKey } from '../services/objectStore/objectKeys';
import { createObjectStoreRouter, objectStoreConfigFromEnv } from '../routes/objectStore';

test('presigned GET matches the AWS documentation example', () => {
  const url = presignUrl({
    method: 'GET', endpoint: 'https://s3.amazonaws.com', bucket: 'examplebucket', key: 'test.txt', region: 'us-east-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    expiresSec: 86400, now: new Date('2013-05-24T00:00:00Z'), virtualHost: true,
  });
  const u = new URL(url);
  assert.equal(u.host, 'examplebucket.s3.amazonaws.com');
  assert.equal(u.searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});

test('path-style links and signed upload headers', () => {
  const url = new URL(presignUrl({
    method: 'PUT', endpoint: 'https://s3.us-east-005.backblazeb2.com', bucket: 'plajah-dev', key: 'collab/p 1/u/a/master.wav', region: 'us-east-005',
    accessKeyId: 'id', secretAccessKey: 'secret', expiresSec: 900, headers: { 'content-type': 'audio/wav', 'content-length': '10' },
  }));
  assert.equal(url.pathname, '/plajah-dev/collab/p%201/u/a/master.wav');
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-length;content-type;host');
});

const A = 'a' + '0123456789abcdef'.repeat(2);

test('collab keys: built, parsed, and anything odd refused', () => {
  const k = collabKey('chora__p1', 'u1', A, 'master', 'wav');
  assert.deepEqual(parseObjectKey(k), { area: 'collab', projectId: 'chora__p1', uid: 'u1', assetId: A, tier: 'master' });
  for (const bad of [`collab/../u1/${A}/master.wav`, `collab/p/u1/${A}/master.exe`, `collab/p/u1/xyz/master.wav`, `meetings/r/x`, `collab/p/u1/${A}/master.wav/extra`, 7])
    assert.equal(parseObjectKey(bad), null, String(bad));
});

test('who may get, put and delete project media', () => {
  const k = parseObjectKey(collabKey('p', 'u1', A, 'proxy', 'webm'))!;
  const proj = { members: { u1: 'editor', own: 'owner', v: 'viewer' } };
  assert.equal(collabDecision('put', k, 'u1', proj), null);
  assert.match(collabDecision('put', k, 'own', proj)!, /own folder/);
  assert.match(collabDecision('put', parseObjectKey(collabKey('p', 'v', A, 'proxy', 'webm'))!, 'v', proj)!, /Viewers/);
  assert.equal(collabDecision('get', k, 'v', proj), null);
  assert.match(collabDecision('get', k, 'stranger', proj)!, /Only people/);
  assert.match(collabDecision('get', k, 'u1', null)!, /Only people/);
  assert.equal(collabDecision('delete', k, 'own', proj), null);
  assert.notEqual(collabDecision('delete', k, 'v', proj), null);
});

test('meeting segment keys and who may upload, play and delete them', () => {
  const key = meetingSegmentKey('free', 'room1', 'rec1', 7);
  assert.equal(key, 'meetings/free/room1/rec1/seg_00007.webm');
  assert.deepEqual(parseObjectKey(key), { area: 'meetings', plan: 'free', roomId: 'room1', recId: 'rec1', seg: 7 });
  for (const bad of ['meetings/gold/r/x/seg_00001.webm', 'meetings/free/r/x/seg_1.webm', 'meetings/free/r/../seg_00001.webm', 'meetings/r/x/seg_00001.webm'])
    assert.equal(parseObjectKey(bad), null, bad);
  const k = parseObjectKey(key) as any;
  const plus = parseObjectKey(meetingSegmentKey('plus', 'room1', 'rec1', 0)) as any;
  const room = { participants: ['host', 'mem'] };
  const live = { hostUid: 'host', mode: 'CLOUD', status: 'RECORDING' };
  assert.equal(meetingDecision('put', k, 'host', { room, recording: live, paid: false }), null);
  assert.match(meetingDecision('put', plus, 'host', { room, recording: live, paid: false })!, /Plajah Plus/);
  assert.equal(meetingDecision('put', plus, 'host', { room, recording: live, paid: true }), null);
  assert.match(meetingDecision('put', k, 'mem', { room, recording: live, paid: true })!, /person who recorded/);
  assert.match(meetingDecision('put', k, 'host', { room, recording: { ...live, status: 'ENDED' }, paid: false })!, /isn’t uploading/);
  assert.match(meetingDecision('put', k, 'host', { room, recording: { ...live, mode: 'LOCAL' }, paid: false })!, /isn’t uploading/);
  assert.equal(meetingDecision('get', k, 'mem', { room, recording: null, paid: false }), null);
  assert.match(meetingDecision('get', k, 'outsider', { room, recording: null, paid: false })!, /Only people in this chat/);
  assert.equal(meetingDecision('delete', k, 'host', { room, recording: { ...live, status: 'ENDED' }, paid: false }), null);
  assert.notEqual(meetingDecision('delete', k, 'mem', { room, recording: live, paid: false }), null);
});

test('config from env reads the region from a B2 endpoint', () => {
  assert.equal(objectStoreConfigFromEnv({}), null);
  const c = objectStoreConfigFromEnv({ OBJECT_STORE_ENDPOINT: 's3.us-east-005.backblazeb2.com', OBJECT_STORE_BUCKET: 'b', OBJECT_STORE_KEY_ID: 'i', OBJECT_STORE_APP_KEY: 'k' });
  assert.equal(c?.endpoint, 'https://s3.us-east-005.backblazeb2.com');
  assert.equal(c?.region, 'us-east-005');
});

test('sign route: checks the caller and the project before signing', async () => {
  const app = express();
  const cfg = { endpoint: 'https://s3.us-east-005.backblazeb2.com', region: 'us-east-005', bucket: 'b', keyId: 'i', appKey: 'k' };
  let configured = true;
  app.use(express.json(), createObjectStoreRouter({
    verify: async (t: string) => (t === 'anon' ? { uid: 'g', isAnonymous: true } : t ? { uid: t, isAnonymous: false } : null) as any,
    get: async (p: string) => (p === 'coedit/p' ? { members: { u1: 'editor', v: 'viewer' } }
      : p === 'chat_rooms/r1' ? { participants: ['u1', 'v'] }
      : p === 'chat_rooms/r1/recordings/x1' ? { hostUid: 'u1', mode: 'CLOUD', status: 'RECORDING' } : null),
    isPaid: async () => false,
    config: () => (configured ? cfg : null),
  }));
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const call = (token: string, body: object) => fetch(`http://127.0.0.1:${port}/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  try {
    const key = collabKey('p', 'u1', A, 'master', 'wav');
    const ok = await call('u1', { op: 'put', key, size: 100, contentType: 'audio/wav' });
    assert.equal(ok.status, 200);
    const j = await ok.json();
    assert.match(j.url, /^https:\/\/s3\.us-east-005\.backblazeb2\.com\/b\/collab\/p\/u1\//);
    assert.deepEqual(j.headers, { 'Content-Type': 'audio/wav' });
    assert.equal((await call('v', { op: 'get', key })).status, 200);
    assert.equal((await call('stranger', { op: 'get', key })).status, 403);
    assert.equal((await call('anon', { op: 'get', key })).status, 401);
    assert.equal((await call('u1', { op: 'put', key, size: 3 * 1024 ** 3, contentType: 'audio/wav' })).status, 400);
    assert.equal((await call('u1', { op: 'put', key: 'collab/../x', size: 1, contentType: 'audio/wav' })).status, 400);
    // recordings: segment upload, a free host refused the 365-day folder, batch playback for members
    const seg = meetingSegmentKey('free', 'r1', 'x1', 0);
    assert.equal((await call('u1', { op: 'put', key: seg, size: 1000, contentType: 'video/webm' })).status, 200);
    assert.equal((await call('u1', { op: 'put', key: meetingSegmentKey('plus', 'r1', 'x1', 0), size: 1000, contentType: 'video/webm' })).status, 403);
    assert.equal((await call('u1', { op: 'put', key: seg, size: 200 * 1024 * 1024, contentType: 'video/webm' })).status, 400);
    assert.equal((await call('v', { op: 'put', key: seg, size: 1000, contentType: 'video/webm' })).status, 403);
    const batch = await call('v', { op: 'get', keys: [0, 1, 2].map((i) => meetingSegmentKey('free', 'r1', 'x1', i)) });
    assert.equal(batch.status, 200);
    assert.equal((await batch.json()).urls.length, 3);
    assert.equal((await call('stranger', { op: 'get', keys: [seg] })).status, 403);
    assert.equal((await call('v', { op: 'get', keys: [seg, meetingSegmentKey('free', 'r1', 'other', 0)] })).status, 400);
    assert.equal((await call('u1', { op: 'get', keys: [key] })).status, 400); // collab keys don't batch
    assert.equal((await call('v', { op: 'delete', keys: [seg] })).status, 403);
    assert.equal((await call('u1', { op: 'put', keys: [seg] })).status, 400);
    configured = false;
    const off = await call('u1', { op: 'get', key });
    assert.equal(off.status, 503);
    assert.equal((await off.json()).code, 'not_configured');
  } finally {
    server.close();
  }
});
