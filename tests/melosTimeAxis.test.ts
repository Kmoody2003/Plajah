// Melos Beats time axis: tempo map (steps + ramps), meter map (odd meters, changes), snap grid,
// and the shared clip split. Pure math — runs under `tsx --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MeterMap, TempoMap } from '../services/melos/beats/tempoMap';
import { DEFAULT_GRID, gridLines, gridStep, snapBeat, type GridSettings } from '../services/melos/beats/snapGrid';
import { newGrooveDoc } from '../services/melos/beats/grooveDoc';
import { audioSourceSecToBeat, splitClipAt } from '../services/melos/beats/clipEdit';
import { keyLabel, parseKey } from '../services/melos/beats/songKey';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('constant tempo is beats × 60/bpm, and inverts', () => {
  const t = TempoMap.fromDoc({ bpm: 120 });
  assert.ok(t.isConstant);
  near(t.beatToSec(8), 4);
  near(t.secToBeat(4), 8);
  near(t.beatToSec(-2), -1); // count-in extrapolates
});

test('tempo step change: seconds accumulate per segment', () => {
  const t = TempoMap.fromDoc({ bpm: 120, tempoMap: [{ beat: 8, bpm: 60 }] });
  near(t.beatToSec(8), 4);          // 8 beats @120
  near(t.beatToSec(12), 4 + 4);     // +4 beats @60
  near(t.secToBeat(6), 10);
  near(t.bpmAt(9), 60);
  near(t.secBetween(6, 10), 1 + 2); // straddles the change
});

test('tempo ramp is linear in beats and round-trips', () => {
  const t = TempoMap.fromDoc({ bpm: 60, tempoMap: [{ beat: 4, bpm: 60, ramp: true }, { beat: 8, bpm: 120 }] });
  near(t.bpmAt(6), 90);
  // ∫ 60/(60+15x) dx over 0..4 = 4·ln(2)
  near(t.beatToSec(8) - t.beatToSec(4), 4 * Math.log(2));
  for (const b of [4.5, 5, 6.25, 7.9]) near(t.secToBeat(t.beatToSec(b)), b, 1e-9);
});

test('meter: 4/4 default, 6/8 bars are 3 beats, changes keyed by bar', () => {
  const m = MeterMap.fromDoc({ meter: [{ bar: 0, num: 6, den: 8 }, { bar: 2, num: 4, den: 4 }] });
  near(m.barToBeat(1), 3);
  near(m.barToBeat(2), 6);
  near(m.barToBeat(3), 10);
  const b = m.at(7);
  assert.equal(b.bar, 2); assert.equal(b.num, 4); near(b.beatInBar, 1);
  assert.equal(m.at(1).unitBeats, 0.5);
  assert.equal(m.formatPosition(1.5), '1.4.1'); // 6/8 counts eighths: beat 1.5 = 4th eighth
  assert.ok(MeterMap.fromDoc({}).isConstant);
});

test('snap: fixed 1/4 in 7/8 restarts at every bar line', () => {
  const m = MeterMap.fromDoc({ meter: [{ bar: 0, num: 7, den: 8 }] }); // bar = 3.5 beats
  const g: GridSettings = { mode: 'fixed', div: '1/4', triplet: false };
  near(snapBeat(3.4, g, m, 20), 3.5);   // next bar line beats the 3.0 grid line
  near(snapBeat(4.4, g, m, 20), 4.5);   // bar 2 grid: 3.5, 4.5, 5.5…
  near(snapBeat(3.4, g, m, 20, { bypass: true }), 3.4);
  near(snapBeat(4.9, g, m, 20, { how: 'floor' }), 4.5);
});

test('snap: triplets and bar mode', () => {
  const m = MeterMap.fromDoc({});
  near(snapBeat(0.7, { mode: 'fixed', div: '1/8', triplet: true }, m, 20), 2 / 3);
  near(snapBeat(5.9, { mode: 'fixed', div: 'bar', triplet: false }, m, 20), 4);
  near(snapBeat(6.1, { mode: 'fixed', div: 'bar', triplet: false }, m, 20), 8);
  near(snapBeat(1.234, { mode: 'off', div: 'bar', triplet: false }, m, 20), 1.234);
});

test('adaptive grid gets finer as you zoom in', () => {
  const coarse = gridStep(DEFAULT_GRID, 2);
  const fine = gridStep(DEFAULT_GRID, 200);
  assert.equal(coarse.kind, 'bar');
  assert.ok(fine.kind === 'beats' && fine.beats <= 0.125);
});

test('grid lines follow the meter', () => {
  const m = MeterMap.fromDoc({ meter: [{ bar: 1, num: 3, den: 4 }] });
  const l = gridLines(m, 0, 10, 30, { mode: 'fixed', div: '1/4', triplet: false });
  assert.deepEqual(l.bars.map((b) => b.beat), [0, 4, 7]);
  assert.ok(l.bars[1].sigChange && !l.bars[2].sigChange);
});

test('splitClipAt: notes partition, audio offset follows tempo + stretch', () => {
  const doc = newGrooveDoc('u');
  doc.bpm = 120;
  doc.arrangement.push({
    id: 'a', kind: 'audio', name: 'A', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0,
    clips: [{ id: 'c', startBeats: 4, lengthBeats: 8, audio: { sampleKey: 'k', name: 'x', offsetSec: 1, gainDb: 0, durationSec: 10, stretch: 2 } }],
  });
  doc.arrangement.push({
    id: 'm', kind: 'instrument', name: 'M', color: '#fff', mute: false, solo: false, gainDb: 0, pan: 0,
    clips: [{ id: 'n', startBeats: 0, lengthBeats: 4, notes: [
      { id: '1', startBeats: 0, lengthBeats: 3, key: 60, vel: 100 },
      { id: '2', startBeats: 2.5, lengthBeats: 1, key: 62, vel: 100 },
    ] }],
  });
  const rid = splitClipAt(doc, 'a', 'c', 6)!;
  const right = doc.arrangement[1].clips.find((c) => c.id === rid)!;
  near(right.audio!.offsetSec, 1 + 1 * 2); // 2 beats @120 = 1s of timeline × rate 2
  near(doc.arrangement[1].clips[0].lengthBeats, 2);
  const rid2 = splitClipAt(doc, 'm', 'n', 2)!;
  const mc = doc.arrangement[2].clips;
  assert.deepEqual(mc[0].notes!.map((n) => [n.id, n.lengthBeats]), [['1', 2]]);
  assert.equal(mc.find((c) => c.id === rid2)!.notes![0].startBeats, 0.5);
  assert.equal(splitClipAt(doc, 'm', 'n', 0), null);
  // Source-file seconds → timeline beat (inverse of the offset math above).
  near(audioSourceSecToBeat(doc, doc.arrangement[1].clips[0], 2)!, 5);
});

test('parseKey / keyLabel', () => {
  assert.deepEqual(parseKey('D Minor'), { tonic: 2, scale: 'minor' });
  assert.deepEqual(parseKey('f#m'), { tonic: 6, scale: 'minor' });
  assert.deepEqual(parseKey('Bb'), { tonic: 10, scale: 'major' });
  assert.deepEqual(parseKey('E dorian'), { tonic: 4, scale: 'dorian' });
  assert.equal(keyLabel({ tonic: 10, scale: 'major' }), 'Bb major');
  assert.equal(parseKey('nonsense'), null);
});
