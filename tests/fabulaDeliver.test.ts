import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DELIVER, DELIVER_PRESETS, applyPreset, normalize, planDelivery, spansFor, masterBitrate, containerChoices } from '../services/fabula/deliver.ts';

const TL = { w: 1920, h: 1080, fps: 23.976 };

test('H.264 MP4 renders directly at the chosen size and rate', () => {
  const s = { ...DEFAULT_DELIVER, resolution: '3840x2160', fps: '30000/1001', quality: 'high' as const };
  const p = planDelivery(s, TL);
  assert.equal(p.transcode, null);
  assert.deepEqual([p.render.w, p.render.h], [3840, 2160]);
  assert.ok(Math.abs(p.render.fps - 29.97) < 0.01);
  assert.equal(p.ext, 'mp4');
  assert.match(p.summary, /3840×2160 · 29\.97/);
});

test('timeline size/rate are kept unless changed; custom sizes are made even', () => {
  const p = planDelivery(DEFAULT_DELIVER, TL);
  assert.deepEqual([p.render.w, p.render.h, p.render.fps], [1920, 1080, 23.976]);
  const c = planDelivery({ ...DEFAULT_DELIVER, resolution: 'custom' }, TL, { w: 1001, h: 563 });
  assert.deepEqual([c.render.w, c.render.h], [1002, 564]);
});

test('ProRes / DNxHR / HEVC plan a high-quality master plus an ffmpeg transcode', () => {
  const pr = planDelivery(applyPreset(DEFAULT_DELIVER, 'prores-hq'), TL);
  assert.ok(pr.transcode && pr.transcode.type === 'recipe');
  const r = (pr.transcode as any).recipe;
  assert.deepEqual([r.containerId, r.videoCodecId, r.audioCodecId, r.proresProfile], ['mov', 'prores', 'pcm_s24le', '3']);
  assert.equal(pr.ext, 'mov');
  assert.equal(pr.render.quality, true);
  assert.equal(pr.render.bitrate, masterBitrate(1920, 1080, 23.976));
  assert.match(pr.summary, /ProRes 422 HQ/);
  assert.equal(planDelivery(applyPreset(DEFAULT_DELIVER, 'hevc-small'), TL).desktopOnly, true);
  assert.equal(planDelivery(applyPreset(DEFAULT_DELIVER, 'dnxhr-hqx-mxf'), TL).ext, 'mxf');
});

test('broadcast MPEG-2 presets own the raster and snap the rate to the spec', () => {
  const s = applyPreset(DEFAULT_DELIVER, 'm2:xdcam-hd422');
  const p = planDelivery({ ...s, fps: 'timeline' }, TL);
  assert.equal(p.transcode?.type, 'mpeg2');
  assert.ok(Math.abs(p.render.fps - 23.976) < 0.01, '23.98 timeline → XDCAM 1080p23.98');
  assert.match(p.summary, /1920×1080p · 23\.976/);
  const atsc = planDelivery(applyPreset(DEFAULT_DELIVER, 'm2:ts-hd'), TL);
  assert.ok(Math.abs(atsc.render.fps - 29.97) < 0.01, 'ATSC 1080i is 29.97 only');
  assert.match(atsc.summary, /1920×1080i/);
  const hdv = planDelivery(applyPreset(DEFAULT_DELIVER, 'm2:hdv-1080i'), TL);
  assert.deepEqual([hdv.render.w, hdv.render.h], [1920, 1080], 'anamorphic specs render a square 16:9 master');
  assert.equal(hdv.ext, 'm2t');
});

test('audio-only presets plan an audio transcode', () => {
  const p = planDelivery(applyPreset(DEFAULT_DELIVER, 'wav-24'), TL);
  assert.ok(p.transcode && p.transcode.type === 'recipe' && p.transcode.kind === 'audio');
  assert.equal(p.ext, 'wav');
});

test('changing the container keeps codecs valid', () => {
  const n = normalize({ ...DEFAULT_DELIVER, container: 'webm', videoCodec: 'h264', audioCodec: 'aac' });
  assert.ok(['vp9', 'av1'].includes(n.videoCodec));
  assert.ok(['opus', 'vorbis'].includes(n.audioCodec));
  assert.ok(containerChoices('video').some((c) => c.id === 'mxf'));
  assert.ok(!containerChoices('video').some((c) => c.id === 'gif'));
});

test('every preset plans without throwing', () => {
  for (const p of DELIVER_PRESETS) {
    const plan = planDelivery(applyPreset(DEFAULT_DELIVER, p.id), TL);
    assert.ok(plan.ext && plan.summary && plan.render.w > 0, p.id);
  }
});

test('ranges: whole, in→out, per marker', () => {
  assert.deepEqual(spansFor('all', 10), [{ t0: 0, t1: 10, tag: 'ALL' }]);
  assert.deepEqual(spansFor('inout', 10, 2, 5), [{ t0: 2, t1: 5, tag: 'IN→OUT' }]);
  assert.deepEqual(spansFor('markers', 10, null, null, [{ t: 4 }, { t: 7 }]).map((s) => s.tag), ['SEG 1', 'SEG 2', 'SEG 3']);
  assert.deepEqual(spansFor('inout', 10, null, null), [{ t0: 0, t1: 10, tag: 'ALL' }]);
});
