import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampDrag, dragProgress, nudge, offsetForProgress, releaseTarget, snapIndex, type DragTrigger } from '../services/living/runtime/drag';
import { ProximityGate, SpeedTracker, distToBox, speedOk, type ProximityTrigger } from '../services/living/runtime/proximity';
import { spawn, step, addParticles, MAX_PARTICLES, MAX_BURST, BURST_KINDS } from '../services/living/runtime/particles';

const drag = (o: Partial<DragTrigger> = {}): DragTrigger => ({ type: 'drag', ...o });

describe('drag math', () => {
  it('respects the axis lock and bounds', () => {
    assert.deepEqual(clampDrag({ x: 50, y: 80 }, drag({ axis: 'x' })), { x: 50, y: 0 });
    assert.deepEqual(clampDrag({ x: 50, y: 80 }, drag({ axis: 'y' })), { x: 0, y: 80 });
    assert.deepEqual(clampDrag({ x: 500, y: -500 }, drag({ bounds: { minX: -10, maxX: 100, minY: -40, maxY: 0 } })), { x: 100, y: -40 });
  });
  it('progress is the fraction of available travel in the direction moved (0 at rest, 1 at the bound)', () => {
    const t = drag({ axis: 'y', bounds: { minY: -200, maxY: 0 } });
    assert.equal(dragProgress({ x: 0, y: 0 }, t), 0);
    assert.equal(dragProgress({ x: 0, y: -100 }, t), 0.5);
    assert.equal(dragProgress({ x: 0, y: -200 }, t), 1);
    assert.equal(dragProgress({ x: 0, y: -999 }, t), 1, 'clamped');
    const both = drag({ bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 } });
    assert.ok(Math.abs(dragProgress({ x: 50, y: 0 }, both) - 0.5) < 1e-9);
    assert.equal(dragProgress({ x: -100, y: 0 }, both), 1, 'negative direction counts too');
  });
  it('offsetForProgress is the inverse (keyboard "finish it for me")', () => {
    const t = drag({ axis: 'y', bounds: { minY: -200, maxY: 0 } });
    assert.deepEqual(offsetForProgress(1, t), { x: 0, y: -200 });
    assert.deepEqual(offsetForProgress(0.25, t), { x: 0, y: -50 });
    const x = drag({ axis: 'x', bounds: { minX: 0, maxX: 80 } }); assert.deepEqual(offsetForProgress(1, x), { x: 80, y: 0 });
    assert.equal(dragProgress(offsetForProgress(0.6, t), t), 0.6);
  });
  it('snap points: nearest within radius wins; snapBack returns to rest', () => {
    const t = drag({ snapTo: [{ x: 100, y: 0, r: 30 }, { x: 160, y: 0, r: 30 }], snapBack: true });
    assert.equal(snapIndex({ x: 90, y: 5 }, t), 0); assert.equal(snapIndex({ x: 140, y: 0 }, t), 1); assert.equal(snapIndex({ x: 20, y: 0 }, t), -1);
    assert.deepEqual(releaseTarget({ x: 95, y: 0 }, t), { to: { x: 100, y: 0 }, snapped: 0, back: false });
    assert.deepEqual(releaseTarget({ x: 20, y: 0 }, t), { to: { x: 0, y: 0 }, snapped: -1, back: true });
    assert.deepEqual(releaseTarget({ x: 20, y: 0 }, drag()), { to: { x: 20, y: 0 }, snapped: -1, back: false }, 'no snapBack: stays where dropped');
  });
  it('arrow keys nudge within bounds', () => {
    const t = drag({ axis: 'x', bounds: { minX: 0, maxX: 100 } });
    let p = { x: 0, y: 0 };
    p = nudge(p, 'ArrowRight', t); assert.equal(p.x, 8);
    p = nudge(p, 'ArrowLeft', t); p = nudge(p, 'ArrowLeft', t); assert.equal(p.x, 0, 'clamped at the bound');
    assert.equal(nudge({ x: 0, y: 0 }, 'ArrowDown', t).y, 0, 'axis locked');
  });
});

describe('proximity with pointer speed', () => {
  const slowFast = (o: Partial<ProximityTrigger> = {}): ProximityTrigger => ({ type: 'proximity', radius: 100, ...o });
  it('SpeedTracker measures px/s from timestamps', () => {
    const s = new SpeedTracker(); s.push(0, 0, 0);
    let v = 0; for (let i = 1; i <= 20; i++) v = s.push(i * 10, 0, i * 16);   // 10px per 16ms = 625px/s
    assert.ok(v > 560 && v < 640, `steady 625px/s, got ${v.toFixed(0)}`);
    const slow = new SpeedTracker(); slow.push(0, 0, 0); let w = 0; for (let i = 1; i <= 20; i++) w = slow.push(i * 1, 0, i * 16);
    assert.ok(w > 50 && w < 75, `steady 62px/s, got ${w.toFixed(0)}`);
    const rest = new SpeedTracker(); rest.push(0, 0, 0); assert.ok(rest.push(30, 0, 1000) < 40, 'the first move after a long pause starts from rest');
  });
  it('speedOk honours slowBelow and fastAbove', () => {
    assert.equal(speedOk(slowFast({ slowBelow: 200 }), 100), true); assert.equal(speedOk(slowFast({ slowBelow: 200 }), 300), false);
    assert.equal(speedOk(slowFast({ fastAbove: 600 }), 300), false); assert.equal(speedOk(slowFast({ fastAbove: 600 }), 900), true);
    assert.equal(speedOk(slowFast(), 12345), true);
  });
  it('Mars: peeks for a slow approach, hides when rushed; fires once per approach; re-arms on leaving', () => {
    const peek = slowFast({ slowBelow: 200 }), hide = slowFast({ fastAbove: 600 });
    const gp = new ProximityGate(), gh = new ProximityGate();
    // slow approach
    assert.equal(gp.update(peek, 250, 80), false, 'outside the radius');
    assert.equal(gp.update(peek, 90, 80), true, 'slow entry peeks');
    assert.equal(gp.update(peek, 60, 80), false, 'only once per approach');
    assert.equal(gh.update(hide, 90, 80), false, 'slow entry does not hide');
    // leave and rush in
    gp.update(peek, 300, 0); gh.update(hide, 300, 0);
    assert.equal(gp.update(peek, 90, 900), false, 'rushed entry does not peek');
    assert.equal(gh.update(hide, 90, 900), true, 'rushed entry hides');
  });
  it('distToBox is zero inside and Euclidean outside', () => {
    const b = { x: 100, y: 100, w: 50, h: 50 };
    assert.equal(distToBox(120, 120, b), 0); assert.equal(distToBox(100, 60, b), 40); assert.equal(distToBox(153, 154, b), 5);
  });
});

describe('particles', () => {
  it('every burst kind spawns, is seeded, and is capped', () => {
    for (const k of BURST_KINDS) { const a = spawn(k, 10, 10, 12, 5), b = spawn(k, 10, 10, 12, 5); assert.equal(a.length, 12); assert.deepEqual(a, b, `${k} is deterministic`); }
    assert.equal(spawn('confetti', 0, 0, 9999, 1).length, MAX_BURST);
    let ps = spawn('stars', 0, 0, 48, 1); for (let i = 0; i < 10; i++) ps = addParticles(ps, spawn('stars', 0, 0, 48, i));
    assert.equal(ps.length, MAX_PARTICLES, 'total cap');
  });
  it('particles age out so nothing leaks', () => {
    let ps = spawn('sparkles', 50, 50, 20, 9); for (let t = 0; t < 40; t++) ps = step(ps, 100);
    assert.equal(ps.length, 0, 'all gone after 4s');
    let q = spawn('bubbles', 0, 0, 5, 2); q = step(q, 100); assert.ok(q.every(p => p.y < 5 + 1), 'bubbles rise');
  });
});
