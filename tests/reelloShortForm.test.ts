import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isShortForm, videoShape, videoSeconds, aspectLabel, MAX_SHORT_SEC } from '../services/reello/shortForm.ts';
import { muxStillCandidates } from '../services/reello/videoStudio.ts';

const tb = (w: number, h: number, secs: number) => ({ timebase: { width: w, height: h, durationSec: secs } });

test('a full-length upload is not a Short just because it is on Reello', () => {
  // The old rule: isRello === true meant "short", so every Upload Studio video landed in Shorts.
  assert.equal(isShortForm({ isRello: true, ...tb(1920, 1080, 1800) }), false);
  assert.equal(isShortForm({ isRello: true }), false); // nothing recorded about it: not a Short
  assert.equal(isShortForm({ isRello: true, duration: 45 }), false); // short but landscape-or-unknown
});

test('vertical or square and at most 3 minutes is a Short', () => {
  assert.equal(isShortForm(tb(1080, 1920, 30)), true);
  assert.equal(isShortForm(tb(1080, 1080, 60)), true);
  assert.equal(isShortForm({ aspectRatio: 'VERTICAL', duration: MAX_SHORT_SEC }), true);
  assert.equal(isShortForm({ aspectRatio: 'VERTICAL', duration: MAX_SHORT_SEC + 1 }), false);
  assert.equal(isShortForm({ aspectRatio: 'HORIZONTAL', duration: 20 }), false);
  assert.equal(isShortForm({ verticalVideoUrl: 'x' }), true);
});

test('Story Intelligence clips are Shorts; replays and cinema never are', () => {
  assert.equal(isShortForm({ format: 'short', shortOf: 'v1', duration: 25 }), true);
  assert.equal(isShortForm({ muxClip: { sourcePlaybackId: 'p', startSec: 10, endSec: 40 } }), true); // older posted clips
  assert.equal(isShortForm({ fromVideoIntel: { videoId: 'v1' }, duration: 20 }), true);
  assert.equal(isShortForm({ isLiveRecording: true, ...tb(1080, 1920, 30) }), false);
  assert.equal(isShortForm({ genre: 'Trailer', ...tb(1080, 1920, 30) }), false);
});

test("the creator's own call wins", () => {
  assert.equal(isShortForm({ format: 'long', ...tb(1080, 1920, 30) }), false);
  assert.equal(isShortForm({ format: 'short', ...tb(1920, 1080, 30) }), true);
});

test('shape and length helpers', () => {
  assert.equal(videoShape(tb(720, 1280, 1)), 'VERTICAL');
  assert.equal(videoShape(tb(1000, 1050, 1)), 'SQUARE');
  assert.equal(videoShape(tb(1280, 720, 1)), 'HORIZONTAL');
  assert.equal(videoShape({ aspectRatio: 'LANDSCAPE' }), 'HORIZONTAL');
  assert.equal(videoShape({}), 'UNKNOWN');
  assert.equal(videoSeconds({ muxClip: { startSec: 10, endSec: 32 } }), 22);
  assert.equal(aspectLabel(1080, 1920), 'VERTICAL');
  assert.equal(aspectLabel(1920, 1080), 'HORIZONTAL');
  assert.equal(aspectLabel(0, 1080), undefined);
});

test('thumbnail frames for a published video come from Mux, spread through the video', () => {
  assert.deepEqual(muxStillCandidates(undefined, 100), []);
  const s = muxStillCandidates('pid', 100);
  assert.equal(s.length, 4);
  assert.match(s[0], /image\.mux\.com\/pid\/thumbnail\.jpg\?width=640&time=20$/);
  assert.match(s[3], /time=80$/);
});
