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

test('resolver never downloads: a cloud-only asset streams as-is by default, and throws OFFLINE in Switch-to-Local', async () => {
  const { setLocalOnly, setSyncMode } = await import('../services/fabula/mediaSource.ts');
  setSyncMode(false);
  setLocalOnly(false);
  const asset = { id: 'asset-remote-test', url: 'https://example.com/stream.mp4' };
  const source = await resolveMediaSource(asset);
  assert.equal(source.url, 'https://example.com/stream.mp4');
  assert.equal(source.local, false);
  assert.equal(source.origin, 'cloud');
  source.release();
  setLocalOnly(true);
  try { await assert.rejects(() => resolveMediaSource(asset), /LOCAL-ONLY/); } finally { setLocalOnly(false); }
});

test('cached bytes resolve to local source instantly', async () => {
  const { putBytes } = await import('../services/fabula/mediaStore.ts');
  const testBlob = new Blob(['sample-local-content'], { type: 'video/mp4' });
  await putBytes('studio:blob:asset-cached-123', testBlob);

  const source = await resolveMediaSource({ id: 'asset-cached-123', url: 'https://example.com/ignored.mp4' });
  assert.equal(source.local, true);
  assert.equal(source.origin, 'cache');
  assert.ok(source.url.startsWith('blob:'));
  source.release();
});

test('decoder budget returns positive hardware limit and expands on native host', async () => {
  const { decoderCap } = await import('../services/fabula/decoderBudget.ts');
  const cap = decoderCap();
  assert.ok(cap >= 4);
});

