// MEKA Sampler: take recording (threshold / immediate / sync, pre-roll, limits), slicing
// (transients, grid, split, manual) and slices → pads + pattern.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TakeRecorder, trimSilence } from '../services/melos/beats/sampler/takeRecorder';
import { gridSlices, loopBpm, normalizeCuts, regions, slicesToPads, slicesToPattern, splitSlices, transientSlices } from '../services/melos/beats/sampler/slices';
import { newGrooveDoc, type SampleRef } from '../services/melos/beats/grooveDoc';

const SR = 48000;
const block = (v: number, n = 128) => [new Float32Array(n).fill(v), new Float32Array(n).fill(v)];

test('threshold take: waits for signal, keeps a short pre-roll, stops at the limit', () => {
  const r = new TakeRecorder({ mode: 'threshold', sampleRate: SR, channels: 2, thresholdDb: -20, preRollSec: 128 / SR, maxSec: 1024 / SR });
  for (let i = 0; i < 10; i++) r.push(block(0.01));      // -40 dB: under the threshold
  assert.equal(r.state, 'armed');
  assert.equal(r.seconds, 0);
  r.push(block(0.5));                                     // -6 dB: crosses it
  assert.equal(r.state, 'recording');
  const t = r.result()!;
  assert.equal(t.length, 256, 'one pre-roll block + the loud block');
  assert.equal(t.channels[0][0], Math.fround(0.01));
  assert.equal(t.channels[0][200], 0.5);
  for (let i = 0; i < 20; i++) r.push(block(0.5));
  assert.equal(r.state, 'done');
  assert.equal(r.result()!.length, 1024);
});

test('immediate and sync takes', () => {
  const now = new TakeRecorder({ mode: 'immediate', sampleRate: SR, channels: 1 });
  now.push(block(0));
  assert.equal(now.state, 'recording');
  const sync = new TakeRecorder({ mode: 'sync', sampleRate: SR, channels: 2, lengthSec: 256 / SR });
  sync.push(block(0.9));
  assert.equal(sync.state, 'armed', 'loud input alone does not start a sync take');
  sync.transportStarted();
  sync.push(block(0.9)); sync.push(block(0.9)); sync.push(block(0.9));
  assert.equal(sync.state, 'done');
  assert.equal(sync.result()!.length, 256, 'stops at the bar length');
});

test('trimSilence keeps a margin', () => {
  const ch = new Float32Array(1000); ch.fill(0.5, 300, 600);
  const r = trimSilence({ channels: [ch], sampleRate: 1000, length: 1000 }, -60, 0.01);
  assert.deepEqual(r, { start: 290, end: 610 });
});

test('transient slicing finds the hits in a drum loop', () => {
  // Four decaying "hits" at 0, 0.25, 0.5, 0.75 s, over a quiet floor.
  const x = new Float32Array(SR);
  for (const at of [0, 0.25, 0.5, 0.75]) {
    const s = Math.round(at * SR);
    for (let i = 0; i < SR * 0.12; i++) x[s + i] += Math.sin(i * 0.3) * Math.exp(-i / (SR * 0.03));
  }
  for (let i = 0; i < x.length; i++) x[i] += (Math.random() - 0.5) * 1e-4;
  const cuts = transientSlices(x, SR, 0.5);
  assert.equal(cuts.length, 4, `cuts: ${cuts.map((c) => (c / SR).toFixed(3))}`);
  cuts.slice(1).forEach((c, i) => assert.ok(Math.abs(c / SR - (i + 1) * 0.25) < 0.015, `cut ${i + 1} at ${(c / SR).toFixed(3)}s`));
  assert.ok(transientSlices(x, SR, 0).length <= 4, 'low sensitivity never adds more');
});

test('grid, split, manual cuts and regions', () => {
  assert.deepEqual(gridSlices(SR * 2, SR, 120, 1), [0, SR / 2, SR, SR * 1.5]);
  assert.deepEqual(splitSlices(100, 4), [0, 25, 50, 75]);
  assert.deepEqual(normalizeCuts([50, 10, 50, 200], 100), [0, 10, 50, 99]);
  assert.deepEqual(regions([0, 40], 100), [{ start: 0, end: 40 }, { start: 40, end: 100 }]);
  assert.equal(loopBpm(SR * 2, SR, 1), 120);   // a 2 s bar = 120 bpm
  assert.equal(loopBpm(SR * 8, SR, 1), 120);   // a long take folds into range
});

test('slices land on pads from the selected one, and a pattern replays them', () => {
  const doc = newGrooveDoc('u');
  const refs: SampleRef[] = [0, 1, 2].map((k) => ({ key: `s${k}`, name: `s${k}`, durationSec: 0.25 }));
  const pads = slicesToPads(doc, 0, 14, refs, 'Break', '#fff');
  assert.deepEqual(pads, [14, 15], 'only what fits in the Group');
  assert.equal(doc.kit[14].name, 'Break 1');
  assert.equal(doc.kit[15].sample?.key, 's1');
  assert.equal(doc.kit[14].env.holdMs, 250);
  const pat = doc.patterns[0];
  pat.steps[5] = { 9: { v: 80 } };                            // an old hit on a slice pad
  slicesToPattern(pat, [4, 5, 6], [0, 0.5, 3], 120);        // 16th = 0.125 s
  assert.equal(pat.steps[5][9], undefined, 'old hits on the slice pads are cleared');
  assert.deepEqual([pat.steps[4]?.[0]?.v, pat.steps[5]?.[4]?.v, pat.steps[6]?.[24]?.v], [100, 100, 100]);
  assert.equal(pat.length, 32, 'grew to fit the last slice');
});
