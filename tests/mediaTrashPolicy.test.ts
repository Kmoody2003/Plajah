import test from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_TRASH_DAYS, mediaTrashId, objectBelongsTo, stillUsed, storagePathsIn } from '../services/mediaTrashPolicy';

const B = 'my-bucket.firebasestorage.app';
const url = (p: string) => `https://firebasestorage.googleapis.com/v0/b/${B}/o/${encodeURIComponent(p)}?alt=media&token=abc`;

test('finds every stored file, nested and encoded', () => {
  const doc = { coverImage: url('uploads/u1/cover art.png'), tracks: [{ audioUrl: url('uploads/u1/a.mp3') }, { audioUrl: `https://storage.googleapis.com/${B}/uploads/u1/b.mp3` }], raw: `gs://${B}/uploads/u1/c.wav` };
  assert.deepEqual(storagePathsIn(doc, B).sort(), ['uploads/u1/a.mp3', 'uploads/u1/b.mp3', 'uploads/u1/c.wav', 'uploads/u1/cover art.png']);
});

test('another bucket, an outside link, a traversal and private HQ files are never targets', () => {
  const doc = {
    a: `https://firebasestorage.googleapis.com/v0/b/other-bucket/o/${encodeURIComponent('x/y.png')}`,
    b: 'https://example.com/photo.png',
    c: url('uploads/../secrets/x'),
    d: url('protected-hq/org/org1/f/plan.pdf'),
  };
  assert.deepEqual(storagePathsIn(doc, B), []);
});

test("a forged URL can't delete someone else's object", () => {
  assert.equal(objectBelongsTo('attacker', 'uploads/victim/a.mp3', 'victim'), false);
  assert.equal(objectBelongsTo('attacker', 'uploads/attacker/a.mp3', 'victim'), false);
  assert.equal(objectBelongsTo('attacker', 'uploads/victim/a.mp3', undefined), false);
  assert.equal(objectBelongsTo('', 'uploads//a.mp3', undefined), false);
});

test('the owner stamp or the owner folder proves it', () => {
  assert.equal(objectBelongsTo('me', 'anywhere/a.mp3', 'me'), true);
  assert.equal(objectBelongsTo('me', 'uploads/me/a.mp3', undefined), true);
});

test('a file the owner still uses elsewhere stays', () => {
  assert.equal(stillUsed('uploads/me/a.png', [{ coverImage: url('uploads/me/a.png') }], B), true);
  assert.equal(stillUsed('uploads/me/a.png', [{ coverImage: url('uploads/me/b.png') }], B), false);
});

test('trash ids cannot collide across kinds and the window is 30 days', () => {
  assert.notEqual(mediaTrashId('album', 'x'), mediaTrashId('photo', 'x'));
  assert.equal(MEDIA_TRASH_DAYS, 30);
});
