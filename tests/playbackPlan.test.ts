import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPlayback, effectiveTrack } from '../services/fabula/playbackEngine.ts';

const POOL = [
  { id: 'song', type: 'audio', url: 'blob:song' },
  { id: 'vidA', type: 'video', url: 'blob:vidA' },
  { id: 'vidB', type: 'video', url: 'blob:vidB' },
  { id: 'img', type: 'image', url: 'blob:img' },
];

test('plans a-track audio and v-track embedded audio, skips images/disabled/linked', () => {
  const clips = [
    { id: 'a1', trackId: 'a1', assetId: 'song', start: 0, duration: 10 },
    { id: 'v1', trackId: 'v1', assetId: 'vidA', start: 0, duration: 5 },            // embedded audio → planned
    { id: 'v2', trackId: 'v1', assetId: 'vidB', start: 5, duration: 5, av: 'x' },   // linked → its a-clip plays it
    { id: 'v3', trackId: 'v2', assetId: 'img', start: 0, duration: 5 },             // image → no audio
    { id: 'a2', trackId: 'a2', assetId: 'song', start: 0, duration: 4, disabled: true },
  ];
  const plan = planPlayback(clips, POOL, 0);
  assert.deepEqual(plan.map((p) => p.clipId).sort(), ['a1', 'v1']);
});

test('joining mid-clip pushes source offset forward and shortens duration', () => {
  const clips = [{ id: 'a', trackId: 'a1', assetId: 'song', start: 10, duration: 20, srcIn: 3 }];
  const [e] = planPlayback(clips, POOL, 15);           // playhead 5s into the clip
  assert.equal(e.when, 0);
  assert.equal(e.offset, 8);                            // srcIn 3 + 5 skipped
  assert.equal(e.dur, 15);
  // and a clip fully behind the playhead is dropped
  assert.equal(planPlayback(clips, POOL, 31).length, 0);
});

test('future clips carry their delay in `when`', () => {
  const clips = [{ id: 'a', trackId: 'a1', assetId: 'song', start: 42, duration: 8, srcIn: 1 }];
  const [e] = planPlayback(clips, POOL, 40);
  assert.equal(e.when, 2);
  assert.equal(e.offset, 1);
  assert.equal(e.dur, 8);
});

test('mid-fade join computes the partial fade-in envelope', () => {
  const clips = [{ id: 'a', trackId: 'a1', assetId: 'song', start: 0, duration: 10, fx: { fadeIn: 2, fadeOut: 1 } }];
  const [e] = planPlayback(clips, POOL, 1);            // 1s into a 2s fade-in
  assert.equal(e.fadeIn, 1);                            // 1s of fade left
  assert.equal(e.fadeInFrom, 0.5);                      // starting at half gain
  assert.equal(e.fadeOut, 1);
});

test('multicam clips resolve the active angle and add its offset', () => {
  const pool = [
    { id: 'mc', type: 'multicam', angles: [{ assetId: 'vidA', offset: 0 }, { assetId: 'vidB', offset: 2.5 }] },
    ...POOL,
  ];
  const clips = [{ id: 'm', trackId: 'v1', assetId: 'mc', start: 0, duration: 5, angle: 1, srcIn: 1 }];
  const [e] = planPlayback(clips, pool, 0);
  assert.equal(e.url, 'blob:vidB');
  assert.equal(e.offset, 3.5);                          // srcIn 1 + angle offset 2.5
});

test('solo on any track mutes the non-soloed tracks', () => {
  const ts = { a1: { vol: 1, solo: true }, a2: { vol: 0.8 }, a3: { mute: false } };
  assert.ok(!effectiveTrack('a1', ts).mute);
  assert.ok(effectiveTrack('a2', ts).mute);
  assert.ok(effectiveTrack('a3', ts).mute);
  // no solo anywhere → settings pass through untouched
  const plain = { a1: { vol: 1 }, a2: { mute: true } };
  assert.ok(!effectiveTrack('a1', plain).mute);
  assert.ok(effectiveTrack('a2', plain).mute);
});
