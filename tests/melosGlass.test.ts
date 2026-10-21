// Melos Beats phase 4: Glass channel-rack operations, step-row tools, per-channel swing, channel
// solo and the per-step graph lanes reaching the voice. Pure — tsx --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGrooveDoc, type GrooveDoc } from '../services/melos/beats/grooveDoc';
import {
  cloneChannel, deleteChannel, fillEvery, invertRow, moveChannel, randomizeRow, rotateRow, sendRowToPitchRoll, swapPads,
} from '../services/melos/beats/channelOps';
import { StepScheduler } from '../services/melos/beats/engine/scheduler';
import { cutoffHz, tailMul, type StepMods } from '../services/melos/beats/engine/stepMods';

const steps = (doc: GrooveDoc, pad: number) => Object.keys(doc.patterns[0].steps[pad] ?? {}).map(Number).sort((a, b) => a - b);

test('swap / move carry steps, pitch-roll notes and clip pad lengths with the pad', () => {
  const doc = newGrooveDoc('u');
  const p = doc.patterns[0];
  p.steps[0] = { 0: { v: 100 } };
  p.melo = { 0: { 2: [{ semi: 3, v: 90, len: 1 }] } };
  doc.arrangement[0].clips[0].padLens = { 0: 8 };
  const kick = doc.kit[0].id;
  swapPads(doc, 0, 1);
  assert.equal(doc.kit[1].id, kick);
  assert.deepEqual(steps(doc, 1), [0]);
  assert.equal(p.melo[1][2][0].semi, 3);
  assert.equal(doc.arrangement[0].clips[0].padLens![1], 8);
  // Move down skips placeholders and lands on the next sounding pad.
  doc.kit[2].empty = true;
  assert.equal(moveChannel(doc, 1, 1), 3);
  assert.equal(doc.kit[3].id, kick);
  assert.equal(moveChannel(doc, 0, -1), 0); // top of the Group: nowhere to go
});

test('clone into the Group\'s first empty pad (with or without steps); delete clears everywhere', () => {
  const doc = newGrooveDoc('u');
  doc.patterns[0].steps[4] = { 0: { v: 100 }, 8: { v: 90 } };
  doc.kit[15].empty = true;
  const plain = cloneChannel(doc, 4, false);
  assert.equal(plain, 15);
  assert.equal(doc.kit[15].name, 'Snare 2');
  assert.equal(doc.patterns[0].steps[15], undefined);
  const withSteps = cloneChannel(doc, 4, true); // Group full → a new Group
  assert.equal(withSteps, 16);
  assert.deepEqual(steps(doc, 16), [0, 8]);
  deleteChannel(doc, 4);
  assert.ok(doc.kit[4].empty);
  assert.equal(doc.patterns[0].steps[4], undefined);
});

test('row tools: fill each N, rotate, invert, randomize (seeded), send to pitch roll', () => {
  const doc = newGrooveDoc('u');
  const p = doc.patterns[0];
  fillEvery(p, 0, 4);
  assert.deepEqual(steps(doc, 0), [0, 4, 8, 12]);
  rotateRow(p, 0, 1);
  assert.deepEqual(steps(doc, 0), [1, 5, 9, 13]);
  rotateRow(p, 0, -2);
  assert.deepEqual(steps(doc, 0), [3, 7, 11, 15]);
  invertRow(p, 0);
  assert.equal(steps(doc, 0).length, 12);
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  randomizeRow(p, 1, 0.4, 100, rng);
  const first = steps(doc, 1);
  seed = 1;
  randomizeRow(p, 1, 0.4, 100, rng);
  assert.deepEqual(steps(doc, 1), first); // same seed, same row
  p.steps[2] = { 0: { v: 100, pitch: 5 }, 6: { v: 80 } };
  assert.equal(sendRowToPitchRoll(p, 2), 2);
  assert.equal(p.steps[2], undefined);
  assert.deepEqual(p.melo![2][0], [{ semi: 5, v: 100, len: 1 }]);
});

function run(doc: GrooveDoc) {
  const hits: { pad: number; beat: number; semi?: number; mods?: StepMods }[] = [];
  const s = new StepScheduler({
    doc: () => doc,
    toTime: (b) => b,
    secBetween: (a, b) => b - a,
    rng: () => 0,
    trigger: (pad, _v, when, _g, semi, _pan, _fx, _sc, mods) => { hits.push({ pad, beat: when, semi, mods }); },
    startAudioClip: () => {},
    startInstrumentNote: () => {},
  });
  s.start('pattern', 0, [doc.patterns[0].id]);
  s.onTick(3.9);
  return hits;
}

test('per-channel swing overrides the song swing; solo silences the others', () => {
  const doc = newGrooveDoc('u');
  doc.swing = 0;
  doc.patterns[0].steps[0] = { 1: { v: 100 } };
  doc.patterns[0].steps[4] = { 1: { v: 100 } };
  doc.kit[4].swing = 0.5;
  const hits = run(doc);
  assert.equal(hits.find((h) => h.pad === 0)!.beat, 0.25);
  assert.equal(hits.find((h) => h.pad === 4)!.beat, 0.25 + 0.5 * 0.5 * 0.25);
  doc.kit[4].solo = true;
  assert.deepEqual(run(doc).map((h) => h.pad), [4]);
});

test('graph lanes reach the voice: fine cents in the pitch, cutoff/res/tail as mods', () => {
  const doc = newGrooveDoc('u');
  doc.patterns[0].steps[0] = { 0: { v: 100, pitch: 2, fine: 50, cut: 0.5, res: 0.2, rel: 1 }, 4: { v: 100 } };
  const hits = run(doc);
  assert.equal(hits[0].semi, 2.5);
  assert.deepEqual(hits[0].mods, { cut: 0.5, res: 0.2, rel: 1 });
  assert.equal(hits[1].mods, undefined); // a plain step carries no mods
  assert.ok(Math.abs(cutoffHz(0.5) - 40 * Math.pow(2, 4.5)) < 1e-6);
  assert.equal(tailMul(0.5), 1); assert.equal(tailMul(1), 4); assert.equal(tailMul(0), 0.25);
});
