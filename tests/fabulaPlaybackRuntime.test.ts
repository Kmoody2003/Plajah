import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enginePlayable, registerLiveVideo, unregisterLiveVideo, syncLiveVideos } from '../services/fabula/playbackEngine.ts';
import { resolveMediaSource } from '../services/fabula/mediaSource.ts';

test('pending or unknown sources never claim fallback audio', () => {
  assert.equal(enginePlayable('blob:pending', 'clip'), false);
  assert.equal(enginePlayable('blob:pending'), false);
});

test('readable local object URL precedes its cloud copy, including recovery', async () => {
  const url=URL.createObjectURL(new Blob(['local bytes']));
  try {
    for(const recover of [false,true]) {
      const source=await resolveMediaSource({url,cloudUrl:'https://invalid.example/video'},recover);
      assert.equal(source.local,true);assert.equal(await source.blob?.text(),'local bytes');source.release();
    }
  } finally {URL.revokeObjectURL(url);}
});

test('expired local URL uses cloud only when local bytes are unavailable', async () => {
  const url=URL.createObjectURL(new Blob(['gone']));URL.revokeObjectURL(url);
  const source=await resolveMediaSource({url,cloudUrl:'https://example.com/backup.wav'});
  assert.equal(source.local,false);assert.equal(source.origin,'cloud');assert.equal(source.url,'https://example.com/backup.wav');
});

test('missing local bytes without backup are reported offline, not decode failure', async () => {
  await assert.rejects(resolveMediaSource({url:'blob:expired'}),/MEDIA OFFLINE/);
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
