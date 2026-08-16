// Arp + theory verification. Pure functions, so this runs headlessly and fast:
//   npx tsx --test tests/melosArp.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  arpStep, defaultArpPatch, defaultStep, euclidean, orderNotes, type ArpPatch,
} from '../services/melos/arp';
import {
  buildChord, diatonicDegrees, identifyChord, realiseProgression, PROGRESSIONS,
  scalePitchClasses, snapToScale,
} from '../services/melos/theory';

const Cmaj = [60, 64, 67];

function patch(over: Partial<ArpPatch> = {}): ArpPatch {
  return { ...defaultArpPatch(), enabled: true, ...over };
}

// ── Theory ───────────────────────────────────────────────────────────────────

test('scale membership is correct for C major', () => {
  const inScale = scalePitchClasses(0, 'major');
  // C D E F G A B present; C#/D#/F#/G#/A# absent.
  [0, 2, 4, 5, 7, 9, 11].forEach((pc) => assert.ok(inScale[pc], `${pc} should be in C major`));
  [1, 3, 6, 8, 10].forEach((pc) => assert.ok(!inScale[pc], `${pc} should not be in C major`));
});

test('snapToScale never returns an out-of-key note, and leaves in-key notes alone', () => {
  for (let n = 48; n < 84; n++) {
    const snapped = snapToScale(n, 0, 'major', 'nearest');
    const pc = ((snapped % 12) + 12) % 12;
    assert.ok([0, 2, 4, 5, 7, 9, 11].includes(pc), `${n} snapped to ${snapped} which is out of key`);
    assert.ok(Math.abs(snapped - n) <= 1, 'nearest snap should move at most a semitone');
  }
  assert.equal(snapToScale(60, 0, 'major', 'nearest'), 60, 'C is already in C major');
  assert.equal(snapToScale(61, 0, 'major', 'up'), 62, 'up-snap from C# lands on D');
  assert.equal(snapToScale(61, 0, 'major', 'down'), 60, 'down-snap from C# lands on C');
  assert.equal(snapToScale(61, 0, 'major', 'off'), 61, 'guard off changes nothing');
});

test('diatonic degrees carry the right romans and functions', () => {
  const d = diatonicDegrees(0, 'major');
  assert.equal(d.length, 7);
  assert.deepEqual(d.map((x) => x.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
  assert.deepEqual(d.map((x) => x.rootName), ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  assert.equal(d[0].fn, 'tonic');
  assert.equal(d[4].fn, 'dominant', 'the fifth degree is the dominant');
  assert.ok(d[4].role.length > 0, 'every degree explains itself for the lesson overlay');
});

test('chords build and identify round-trip', () => {
  assert.deepEqual(buildChord(60, 'maj'), [60, 64, 67]);
  assert.deepEqual(buildChord(60, 'min7'), [60, 63, 67, 70]);
  // First inversion of C major is E G C.
  assert.deepEqual(buildChord(60, 'maj', 1), [64, 67, 72]);
  assert.equal(identifyChord([60, 64, 67])?.symbol, 'C');
  assert.equal(identifyChord([60, 63, 67])?.symbol, 'Cm');
  assert.equal(identifyChord([62, 65, 69, 72])?.symbol, 'Dm7');
});

test('progressions realise into real chords in the chosen key', () => {
  const pop = PROGRESSIONS.find((p) => p.id === 'pop')!;
  const chords = realiseProgression(pop, 0); // C major: I V vi IV
  assert.deepEqual(chords.map((c) => c.symbol), ['C', 'G', 'Am', 'F']);
});

// ── Arp ──────────────────────────────────────────────────────────────────────

test('note ordering matches each mode', () => {
  assert.deepEqual(orderNotes(Cmaj, [], 'up', 1), [60, 64, 67]);
  assert.deepEqual(orderNotes(Cmaj, [], 'down', 1), [67, 64, 60]);
  assert.deepEqual(orderNotes(Cmaj, [], 'updown', 1), [60, 64, 67, 64]);
  assert.deepEqual(orderNotes(Cmaj, [], 'upDownInclusive', 1), [60, 64, 67, 67, 64, 60]);
  assert.deepEqual(orderNotes(Cmaj, [67, 60, 64], 'played', 1), [67, 60, 64]);
  assert.deepEqual(orderNotes(Cmaj, [], 'spiral', 1), [60, 67, 64]);
  assert.deepEqual(orderNotes(Cmaj, [], 'up', 2), [60, 64, 67, 72, 76, 79], 'two octaves stacks the sequence');
});

test('a held chord arpeggiates in order, one note per step', () => {
  const p = patch({ order: 'up' });
  const keys = [0, 1, 2, 3].map((i) => arpStep(p, Cmaj, [], i).notes.map((n) => n.key));
  assert.deepEqual(keys, [[60], [64], [67], [60]], 'walks the chord and wraps');
});

test('chord mode plays every held note together', () => {
  const r = arpStep(patch({ order: 'chord' }), Cmaj, [], 0);
  assert.deepEqual(r.notes.map((n) => n.key).sort((a, b) => a - b), [60, 64, 67]);
});

test('disabled arp and empty input produce nothing', () => {
  assert.equal(arpStep(patch({ enabled: false }), Cmaj, [], 0).notes.length, 0);
  assert.equal(arpStep(patch(), [], [], 0).notes.length, 0);
});

test('ratchets subdivide the step and taper', () => {
  const p = patch();
  p.steps[0] = { ...defaultStep(), ratchet: 4 };
  const r = arpStep(p, Cmaj, [], 0);
  assert.equal(r.notes.length, 4, 'four hits inside one step');
  const offsets = r.notes.map((n) => n.offsetBeats);
  assert.ok(offsets[1] > offsets[0] && offsets[3] > offsets[2], 'rolls advance in time');
  assert.ok(r.notes[1].velocity < r.notes[0].velocity, 'the roll tapers after the first hit');
});

test('swing pushes only the offbeat steps', () => {
  const p = patch({ swing: 0.5 });
  assert.equal(arpStep(p, Cmaj, [], 0).notes[0].offsetBeats, 0, 'downbeats stay put');
  assert.ok(arpStep(p, Cmaj, [], 1).notes[0].offsetBeats > 0, 'offbeats are pushed late');
});

test('trig conditions gate by loop, exactly like the hardware', () => {
  const p = patch({ length: 4 });
  p.steps[0] = { ...defaultStep(), condition: '1:2' };
  const fired = [0, 1, 2, 3].map((loop) => arpStep(p, Cmaj, [], loop * 4).played);
  assert.deepEqual(fired, [true, false, true, false], '1:2 plays every other loop');

  p.steps[0] = { ...defaultStep(), condition: 'first' };
  assert.equal(arpStep(p, Cmaj, [], 0).played, true);
  assert.equal(arpStep(p, Cmaj, [], 4).played, false, 'first only fires on loop 0');

  p.steps[0] = { ...defaultStep(), condition: 'fill' };
  assert.equal(arpStep(p, Cmaj, [], 0, { fill: false }).played, false);
  assert.equal(arpStep(p, Cmaj, [], 0, { fill: true }).played, true);
});

test('probability is deterministic for a given seed — a bounce reproduces the performance', () => {
  const mk = () => {
    const p = patch({ seed: 12345, length: 8 });
    for (let i = 0; i < 8; i++) p.steps[i] = { ...defaultStep(), probability: 0.5 };
    return p;
  };
  const runA = Array.from({ length: 64 }, (_, i) => arpStep(mk(), Cmaj, [], i).played);
  const runB = Array.from({ length: 64 }, (_, i) => arpStep(mk(), Cmaj, [], i).played);
  assert.deepEqual(runA, runB, 'same seed must give the same performance');
  assert.ok(runA.some(Boolean) && runA.some((x) => !x), 'and 50% should actually vary');

  const other = Array.from({ length: 64 }, (_, i) => arpStep(patch({ seed: 999, length: 8, steps: mk().steps }), Cmaj, [], i).played);
  assert.notDeepEqual(runA, other, 'a different seed gives a different performance');
});

test('the scale guard keeps transposed steps in key', () => {
  const p = patch({ scale: { rootPc: 0, scaleId: 'major', enabled: true } });
  p.steps[0] = { ...defaultStep(), transpose: 1 }; // C + 1 = C#, out of key
  const key = arpStep(p, [60], [], 0).notes[0].key;
  assert.ok([0, 2, 4, 5, 7, 9, 11].includes(((key % 12) + 12) % 12), `guard let ${key} through`);
});

test('the arp publishes Motion for every step, even silent ones', () => {
  const p = patch({ length: 4 });
  p.steps[1] = { ...defaultStep(), on: false };
  const r = arpStep(p, Cmaj, [], 1);
  assert.equal(r.notes.length, 0, 'step is off');
  assert.equal(typeof r.motion.step, 'number');
  assert.ok(r.motion.step > 0, 'but Motion still reports the position, so rhythm can shape the sound');
});

test('parameter locks travel with the note', () => {
  const p = patch();
  p.steps[0] = { ...defaultStep(), locks: [{ paramId: 503, value: 0.25 }] };
  const note = arpStep(p, Cmaj, [], 0).notes[0];
  assert.equal(note.locks.length, 1);
  assert.equal(note.locks[0].paramId, 503);
  assert.equal(note.locks[0].value, 0.25);
});

test('euclidean spreads pulses evenly', () => {
  assert.deepEqual(euclidean(8, 4), [false, true, false, true, false, true, false, true]);
  assert.equal(euclidean(16, 5).filter(Boolean).length, 5, 'asked for five pulses, got five');
  assert.equal(euclidean(8, 0).filter(Boolean).length, 0);
  assert.equal(euclidean(8, 8).filter(Boolean).length, 8);
  const rotated = euclidean(8, 3, 1);
  assert.equal(rotated.filter(Boolean).length, 3, 'rotation preserves the pulse count');
});
