import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enginePlayable, registerLiveVideo, unregisterLiveVideo, syncLiveVideos } from '../services/fabula/playbackEngine.ts';
import { resolveMediaSource } from '../services/fabula/mediaSource.ts';

test('pending or unknown sources never claim fallback audio', () => {
  assert.equal(enginePlayable('blob:pending', 'clip'), false);
  assert.equal(enginePlayable('blob:pending'), false);
});

test('local object URL is resolved without fetching cloud media', async () => {
  const old = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('unexpected network request'); }) as any;
  try {
    const source = await resolveMediaSource({ id: 'disk', url: 'blob:disk', cloudUrl: 'https://example.com/original.mp4' });
    assert.equal(source.url, 'blob:disk'); assert.equal(source.local, true); source.release();
  } finally { globalThis.fetch = old; }
});

test('video sync leaves an in-flight seek alone and clamps negative source offsets', async () => {
  const video = { readyState: 4, seeking: true, currentTime: 1, duration: 20, paused: false, playbackRate: 1, play: async () => {}, pause() {} };
  registerLiveVideo('seek', { el: video as any, clipStart: 10, offset: -2 });
  try {
    syncLiveVideos(0, 1); assert.equal(video.currentTime, 1);
    video.seeking = false;
    await new Promise((r) => setTimeout(r, 170));
    syncLiveVideos(0, 1); assert.ok(video.currentTime >= 0);
  } finally { unregisterLiveVideo('seek'); }
});

test('source end freezes rather than restarting playback', async () => {
  let plays = 0, pauses = 0;
  const video = { readyState: 4, seeking: false, currentTime: 4, duration: 5, paused: false, playbackRate: 1, play: async () => { plays++; }, pause() { pauses++; } };
  registerLiveVideo('end', { el: video as any, clipStart: 0, offset: 0 });
  try {
    await new Promise((r) => setTimeout(r, 170)); syncLiveVideos(8, 1);
    assert.equal(plays, 0); assert.equal(pauses, 1); assert.equal(video.currentTime, 4.95);
  } finally { unregisterLiveVideo('end'); }
});
