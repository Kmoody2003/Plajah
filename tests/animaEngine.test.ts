import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExpression } from '../services/anima/expression';
import { evaluateChannel, frameToTime, sampleKeyframeTrack, timeToFrame, evaluateProjectAtFrame } from '../services/anima/evaluator';
import { animaHistoryReducer, applyAnimaAction, initHistory, valueAt, keyAtFrame } from '../services/anima/document';
import { blankAnimaProject, makeLayer } from '../services/anima/templates';
import type { AnimaChannel, Keyframe } from '../services/anima/types';

const near = (a: number, b: number, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('frame 1 is time 0, both ways', () => {
  assert.equal(frameToTime(1, 24), 0);
  assert.equal(frameToTime(25, 24), 1);
  assert.equal(timeToFrame(0, 24), 1);
  assert.equal(timeToFrame(1, 24), 25);
});

test('bezier segments follow their handles', () => {
  const a: Keyframe<number> = { id: 'a', t: 0, v: 0, ease: 'bezier', outHandle: { dx: 1 / 3, dy: 0 } };
  const b: Keyframe<number> = { id: 'b', t: 1, v: 100, inHandle: { dx: -1 / 3, dy: 0 } };
  near(sampleKeyframeTrack([a, b], 0.5, 0), 50, 0.5); // symmetric S-curve passes the midpoint
  assert.ok(sampleKeyframeTrack([a, b], 0.2, 0) < 20); // and eases out of the first key
  // A flat segment with an overshoot handle bulges instead of staying at 0 (linear would).
  const bulge = sampleKeyframeTrack([{ ...a, v: 0, outHandle: { dx: 0.3, dy: 60 } }, { ...b, v: 0, inHandle: { dx: -0.3, dy: 60 } }], 0.5, 0);
  assert.ok(bulge > 30, `bulge ${bulge}`);
});

test('expressions run safely and reject anything else', () => {
  const ch = (code: string): AnimaChannel<number> => ({ id: 'c', name: 'c', defaultValue: 10, keyframes: [], expression: { enabled: true, code } });
  near(evaluateChannel(ch('value * 2 + 1'), 0), 21);
  near(evaluateChannel(ch('Math.sin(time * PI / 2) * 20'), 1), 20); // legacy Math. prefix
  const w = evaluateChannel(ch('wiggle(4, 15)'), 0.37);
  assert.ok(Math.abs(w - 10) <= 15, 'wiggle adds to the keyed value');
  // Not code: unknown names / globals never run, the keyed value stands.
  for (const bad of ['alert(1)', 'constructor', 'globalThis.x', 'value; fetch()', '(() => 1)()']) {
    assert.equal(compileExpression(bad), null, bad);
    near(evaluateChannel(ch(bad), 0), 10);
  }
});

test('evaluated layers expose every channel by path', () => {
  const p = blankAnimaProject();
  const layer = { ...p.layers[0], channels: { 'face.jaw': { id: 'j', name: 'jaw', defaultValue: 0, keyframes: [{ id: 'k', t: 0, v: 0.7 }] } } };
  const [state] = evaluateProjectAtFrame({ ...p, layers: [layer] }, 1);
  near(state.channels['face.jaw'], 0.7);
});

test('editing a static property sets its base; autoKey or an animated one keys it', () => {
  let p = blankAnimaProject();
  const id = p.layers[0].id;
  p = applyAnimaAction(p, { type: 'setValue', layerId: id, path: 'transform.x', frame: 10, value: 40, autoKey: false });
  assert.equal(p.layers[0].transform.x, 40);
  assert.equal(p.layers[0].channels['transform.x'], undefined);
  p = applyAnimaAction(p, { type: 'setValue', layerId: id, path: 'transform.x', frame: 25, value: 100, autoKey: true });
  assert.equal(p.layers[0].channels['transform.x'].keyframes.length, 1);
  // Now animated: further edits key without autoKey.
  p = applyAnimaAction(p, { type: 'setValue', layerId: id, path: 'transform.x', frame: 49, value: 0, autoKey: false });
  assert.equal(p.layers[0].channels['transform.x'].keyframes.length, 2);
  near(valueAt(p, p.layers[0], 'transform.x', 37), 50);
});

test('a new key records the value on screen, and removing the last key keeps it', () => {
  let p = blankAnimaProject();
  const id = p.layers[0].id;
  p = applyAnimaAction(p, { type: 'setValue', layerId: id, path: 'opacity', frame: 1, value: 0, autoKey: true });
  p = applyAnimaAction(p, { type: 'setValue', layerId: id, path: 'opacity', frame: 25, value: 1, autoKey: true });
  p = applyAnimaAction(p, { type: 'toggleKey', layerId: id, path: 'opacity', frame: 13 });
  near(keyAtFrame(p, p.layers[0], 'opacity', 13)!.v, 0.5, 0.05);
  for (const f of [1, 13, 25]) p = applyAnimaAction(p, { type: 'toggleKey', layerId: id, path: 'opacity', frame: f });
  assert.equal(p.layers[0].channels.opacity, undefined);
  near(p.layers[0].opacity, 1); // value at the last removed key
});

test('drawing on an empty frame starts a held drawing; drawing again adds to it', () => {
  let p = blankAnimaProject();
  const id = p.layers[0].id;
  const stroke = { id: 's', points: [{ x: 1, y: 1 }, { x: 5, y: 5 }], color: '#fff', width: 3, opacity: 1 };
  p = applyAnimaAction(p, { type: 'addStroke', layerId: id, frame: 5, stroke, newDrawingId: 'd1' });
  assert.deepEqual(p.layers[0].celTrack!.exposures, [{ startFrame: 5, durationFrames: 2, drawingId: 'd1' }]);
  p = applyAnimaAction(p, { type: 'addStroke', layerId: id, frame: 6, stroke: { ...stroke, id: 's2' }, newDrawingId: 'd2' });
  assert.equal(p.drawingBank.d1.strokes.length, 2);
  assert.equal(p.drawingBank.d2, undefined);
  // A capture exposed over part of it trims the existing exposure.
  p = applyAnimaAction(p, { type: 'exposeDrawing', layerId: id, frame: 6, hold: 2, drawing: { id: 'cap', name: 'c', strokes: [], width: 1, height: 1, createdAt: 0 } });
  assert.deepEqual(p.layers[0].celTrack!.exposures.map((e) => [e.startFrame, e.durationFrames, e.drawingId]), [[5, 1, 'd1'], [6, 2, 'cap']]);
});

test('undo, redo, and coalesced drags', () => {
  const p = blankAnimaProject();
  const id = p.layers[0].id;
  let h = initHistory(p);
  for (let i = 1; i <= 5; i++) h = animaHistoryReducer(h, { type: 'do', action: { type: 'setValue', layerId: id, path: 'transform.y', frame: 1, value: i, autoKey: false }, coalesceKey: 'drag', at: 1000 + i * 50 });
  assert.equal(h.past.length, 1, 'one drag = one undo step');
  h = animaHistoryReducer(h, { type: 'do', action: { type: 'rename', name: 'Walk' } });
  h = animaHistoryReducer(h, { type: 'undo' });
  assert.equal(h.present.name, p.name);
  assert.equal(h.present.layers[0].transform.y, 5);
  h = animaHistoryReducer(h, { type: 'undo' });
  assert.equal(h.present.layers[0].transform.y, 0);
  h = animaHistoryReducer(h, { type: 'redo' });
  assert.equal(h.present.layers[0].transform.y, 5);
});

test('layers add, reorder and remove', () => {
  let p = blankAnimaProject();
  const extra = makeLayer('effect', 'Rain');
  p = applyAnimaAction(p, { type: 'addLayer', layer: extra });
  assert.equal(p.layers[0].id, extra.id);
  p = applyAnimaAction(p, { type: 'moveLayer', id: extra.id, toIndex: 1 });
  assert.equal(p.layers[1].id, extra.id);
  p = applyAnimaAction(p, { type: 'removeLayer', id: extra.id });
  assert.equal(p.layers.length, 1);
});
