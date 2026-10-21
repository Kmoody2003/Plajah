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

// ── Phase 2: key editing, camera, onion skin ────────────────────────────────

import { copyKeys, type KeyRef } from '../services/anima/document';
import { apply, cameraView, invert, layerMatrix, mul } from '../services/anima/affine';
import { onionGhosts } from '../services/anima/onion';
import { makeCameraLayer } from '../services/anima/templates';

function keyed(frames: number[], path = 'transform.x') {
  let p = blankAnimaProject();
  const id = p.layers[0].id;
  frames.forEach((f, i) => (p = applyAnimaAction(p, { type: 'setValue', layerId: id, path, frame: f, value: i * 10, autoKey: true })));
  const keys = p.layers[0].channels[path].keyframes;
  const refs: KeyRef[] = keys.map((k) => ({ layerId: id, path, keyId: k.id }));
  return { p, id, keys, refs };
}
const framesOf = (p: ReturnType<typeof blankAnimaProject>, path = 'transform.x') => p.layers[0].channels[path].keyframes.map((k) => Math.round(k.t * p.fps) + 1);

test('dragging keys moves them by whole frames, clamped to the clip, replacing what they land on', () => {
  const { p, refs } = keyed([1, 10, 20]);
  assert.deepEqual(framesOf(applyAnimaAction(p, { type: 'moveKeys', refs: [refs[1]], deltaFrames: 5 })), [1, 15, 20]);
  // Selection keeps its shape: can't push the first key before frame 1.
  assert.deepEqual(framesOf(applyAnimaAction(p, { type: 'moveKeys', refs: [refs[0], refs[1]], deltaFrames: -4 })), [1, 10, 20]);
  // Landing on an unselected key replaces it.
  const landed = applyAnimaAction(p, { type: 'moveKeys', refs: [refs[1]], deltaFrames: 10 });
  assert.deepEqual(framesOf(landed), [1, 20]);
  assert.equal(landed.layers[0].channels['transform.x'].keyframes[1].v, 10);
});

test('deleting keys; deleting all leaves the property at the last value', () => {
  const { p, refs } = keyed([1, 10]);
  assert.deepEqual(framesOf(applyAnimaAction(p, { type: 'deleteKeys', refs: [refs[0]] })), [10]);
  const gone = applyAnimaAction(p, { type: 'deleteKeys', refs });
  assert.equal(gone.layers[0].channels['transform.x'], undefined);
  assert.equal(gone.layers[0].transform.x, 10);
});

test('copy / paste keeps spacing, values and eases, onto another layer too', () => {
  const { p, id, refs } = keyed([5, 9]);
  const p1 = applyAnimaAction(p, { type: 'setKeyEase', layerId: id, path: 'transform.x', keyId: refs[0].keyId, ease: 'bounce' });
  const clip = copyKeys(p1, refs);
  assert.deepEqual(clip.map((c) => [c.offsetFrames, c.v, c.ease]), [[0, 0, 'bounce'], [4, 10, 'smooth']]);
  const other = makeLayer('cel', 'Other');
  let q = applyAnimaAction(p1, { type: 'addLayer', layer: other });
  q = applyAnimaAction(q, { type: 'pasteKeys', keys: clip, atFrame: 30, targetLayerId: other.id });
  const pasted = q.layers[0].channels['transform.x'].keyframes;
  assert.deepEqual(pasted.map((k) => [Math.round(k.t * q.fps) + 1, k.v, k.ease]), [[30, 0, 'bounce'], [34, 10, 'smooth']]);
});

test('graph edits: value, handles, and time that lands on another key', () => {
  const { p, refs } = keyed([1, 10, 20]);
  let q = applyAnimaAction(p, { type: 'updateKey', ref: refs[1], patch: { v: 99, outHandle: { dx: 0.1, dy: 5 }, ease: 'bezier' } });
  const k = q.layers[0].channels['transform.x'].keyframes[1];
  assert.deepEqual([k.v, k.ease, k.outHandle], [99, 'bezier', { dx: 0.1, dy: 5 }]);
  q = applyAnimaAction(q, { type: 'updateKey', ref: refs[1], patch: { t: 19 / 24 } });
  assert.deepEqual(framesOf(q), [1, 20]);
});

test('matrices: layers transform around their pivot; the camera view inverts its move', () => {
  const p = blankAnimaProject();
  const layer = { ...p.layers[0], origin: { x: 100, y: 100 } };
  const st = { layerId: layer.id, name: '', type: layer.type, visible: true, opacity: 1, activeDrawingId: null, channels: {}, transform: { x: 10, y: 0, z: 0, rotationZ: 90, scaleX: 2, scaleY: 2 } };
  const m = layerMatrix(layer, st);
  const pivot = apply(m, 100, 100);
  near(pivot.x, 110);
  near(pivot.y, 100);
  const right = apply(m, 101, 100); // one pixel right of the pivot → rotated 90° and doubled
  near(right.x, 110);
  near(right.y, 102);
  const back = apply(invert(m), right.x, right.y);
  near(back.x, 101);
  near(back.y, 100);

  const cam = makeCameraLayer();
  const camSt = { ...st, layerId: cam.id, type: 'camera' as const, transform: { x: 100, y: 0, z: 0, rotationZ: 0, scaleX: 2, scaleY: 2 } };
  const view = cameraView(p, cam, camSt);
  const centre = apply(view, 640 + 100, 360); // what the camera points at lands mid-frame
  near(centre.x, 640);
  near(centre.y, 360);
  near(apply(view, 740 + 10, 360).x, 660); // and is zoomed 2×
  near(apply(mul(view, invert(view)), 5, 7).x, 5);
});

test('onion skin walks to neighbouring drawings, not frames', () => {
  const layer = makeLayer('cel', 'D');
  layer.celTrack = {
    id: 'c', name: 'c', layerId: layer.id, stepRate: 2,
    exposures: [
      { startFrame: 1, durationFrames: 2, drawingId: 'a' },
      { startFrame: 3, durationFrames: 2, drawingId: 'b' },
      { startFrame: 5, durationFrames: 2, drawingId: 'c' },
      { startFrame: 7, durationFrames: 2, drawingId: 'd' },
    ],
  };
  assert.deepEqual(onionGhosts(layer, 6, 2, 1), [
    { drawingId: 'b', step: -1, frame: 3 },
    { drawingId: 'a', step: -2, frame: 1 },
    { drawingId: 'd', step: 1, frame: 7 },
  ]);
  assert.deepEqual(onionGhosts(layer, 1, 2, 0), []);
  // Past the end: the last drawings are "previous".
  assert.deepEqual(onionGhosts(layer, 20, 1, 1).map((g) => g.drawingId), ['d']);
});
