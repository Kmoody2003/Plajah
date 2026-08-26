// Tests for the Penna handwriting form-scoring engine.
//
// The engine's whole job is to distinguish correct letter formation from incorrect — a silent
// mistake here means the game rewards speed-scribbling instead of form, which is the exact failure
// mode the design is built to avoid. So these assert the four graded dimensions independently:
// a faithful trace passes everything; a backwards stroke fails DIRECTION; a wrong start fails
// START; the wrong stroke of a multi-stroke letter fails SEQUENCE; and the strictness dial actually
// widens/narrows the corridor. Geometry helpers (resample) get their own invariants.
//
//   npx tsx --test tests/handwritingFormEngine.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resample, pathLength, distance, toleranceFor, scoreStroke, nearestStrokeStart,
  autoStrictness, effectiveStrictness, levelForStrictness, TUNING_LEVELS, DEFAULT_STRICTNESS,
  line, arc, type Pt, type LetterModel,
} from '../services/handwritingFormEngine';
import { HANDWRITING_LETTERS, letterByKey } from '../data/handwritingLetters';

// A dense trace of a stroke model = a near-perfect attempt. jitter() nudges each point to
// simulate a real (imperfect but in-corridor) hand.
function trace(points: Pt[], jitter = 0): Pt[] {
  const dense = resample(points, 50);
  if (!jitter) return dense;
  // deterministic pseudo-jitter (no Math.random — keeps the test reproducible)
  return dense.map((p, i) => ({
    x: p.x + Math.sin(i * 1.7) * jitter,
    y: p.y + Math.cos(i * 2.3) * jitter,
  }));
}

const DOWN = letterByKey('down')!;
const A = letterByKey('A')!;
const C = letterByKey('C')!;

// ── geometry ──────────────────────────────────────────────────────────────────────

test('resample returns exactly n points and preserves the endpoints', () => {
  const pts = trace(line(50, 15, 50, 125).points);
  const r = resample(pts, 64);
  assert.equal(r.length, 64);
  assert.ok(distance(r[0], { x: 50, y: 15 }) < 0.001);
  assert.ok(distance(r[63], { x: 50, y: 125 }) < 0.5);
});

test('resample spaces points evenly by arc length', () => {
  const r = resample(line(0, 0, 100, 0).points, 11);
  const gaps: number[] = [];
  for (let i = 1; i < r.length; i++) gaps.push(distance(r[i - 1], r[i]));
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  for (const g of gaps) assert.ok(Math.abs(g - avg) < 0.001, `gap ${g} vs ${avg}`);
});

test('a degenerate single-point path does not throw', () => {
  const r = resample([{ x: 5, y: 5 }], 8);
  assert.equal(r.length, 8);
});

// ── the happy path ──────────────────────────────────────────────────────────────────

test('a faithful trace passes all four checks', () => {
  const res = scoreStroke(trace(DOWN.strokes[0].points, 1.2), DOWN, 0, 0.4);
  assert.equal(res.pass, true);
  assert.equal(res.startOk, true);
  assert.equal(res.directionOk, true);
  assert.equal(res.sequenceOk, true);
  assert.equal(res.corridorOk, true);
  assert.ok(res.score >= 80, `expected a high score, got ${res.score}`);
});

test('a faithful curved trace (C) also passes', () => {
  const res = scoreStroke(trace(C.strokes[0].points, 1.0), C, 0, 0.4);
  assert.equal(res.pass, true);
  assert.ok(res.score >= 75, `score ${res.score}`);
});

// ── the four failure modes ────────────────────────────────────────────────────────

test('DIRECTION: a backwards stroke is flagged reversed and fails direction', () => {
  const backwards = trace(DOWN.strokes[0].points).reverse();
  const res = scoreStroke(backwards, DOWN, 0, 0.4);
  assert.equal(res.reversed, true);
  assert.equal(res.directionOk, false);
  assert.equal(res.pass, false);
});

test('START: beginning far from the dot fails the start check', () => {
  // trace the right shape but shifted far from the intended start region
  const shifted = trace(DOWN.strokes[0].points).map(p => ({ x: p.x + 40, y: p.y }));
  const res = scoreStroke(shifted, DOWN, 0, 0.4);
  assert.equal(res.startOk, false);
  assert.equal(res.pass, false);
});

test('CORRIDOR: a stroke bowing outside the path fails the corridor check', () => {
  // A smooth bow: on the start/end dots but bulging ~30 units sideways in the middle.
  const base = trace(DOWN.strokes[0].points);
  const wander = base.map((p, i) => ({ x: p.x + Math.sin(Math.PI * i / (base.length - 1)) * 30, y: p.y }));
  const res = scoreStroke(wander, DOWN, 0, 0.5);
  assert.equal(res.corridorOk, false);
  assert.equal(res.pass, false);
});

test('SEQUENCE: drawing A\'s crossbar first (as stroke 0) fails sequence', () => {
  // The learner draws the crossbar (really stroke index 2) while stroke 0 is expected.
  const crossbar = trace(A.strokes[2].points, 1.0);
  const res = scoreStroke(crossbar, A, 0, 0.4);
  assert.equal(res.sequenceOk, false);
  assert.equal(res.pass, false);
});

test('nearestStrokeStart identifies which stroke a touch begins', () => {
  // Use H — its three strokes have distinct starts. (A's two legs deliberately share the apex,
  // so they can't be told apart by start point, which is correct letterform.)
  const H = letterByKey('H')!;
  assert.equal(nearestStrokeStart(H, H.strokes[1].points[0]), 1);
  assert.equal(nearestStrokeStart(H, H.strokes[2].points[0]), 2);
});

// ── the strictness dial (the product decision) ──────────────────────────────────────

test('tolerance narrows monotonically as strictness rises', () => {
  const forgiving = toleranceFor(0);
  const strict = toleranceFor(1);
  assert.ok(strict.start < forgiving.start);
  assert.ok(strict.corridor < forgiving.corridor);
  assert.ok(strict.end < forgiving.end);
});

test('a sloppy-but-close trace passes when Forgiving and fails when Strict', () => {
  const sloppy = trace(DOWN.strokes[0].points).map((p, i) => ({ x: p.x + Math.sin(i * 0.9) * 16, y: p.y }));
  const forgiving = scoreStroke(sloppy, DOWN, 0, 0.05);
  const strict = scoreStroke(sloppy, DOWN, 0, 0.95);
  assert.equal(forgiving.corridorOk, true, 'should pass corridor when forgiving');
  assert.equal(strict.corridorOk, false, 'should fail corridor when strict');
});

// ── adult tuning (parent/teacher) + skill progression ───────────────────────────────

test('auto strictness ramps up with mastered letters and is capped', () => {
  const start = autoStrictness('early', 0);
  const some = autoStrictness('early', 5);
  const lots = autoStrictness('early', 100);
  assert.equal(start, DEFAULT_STRICTNESS.early);
  assert.ok(some > start, 'more mastery → stricter');
  assert.ok(lots <= DEFAULT_STRICTNESS.early + 0.35 + 1e-9, 'capped at +0.35');
  assert.ok(lots <= 1);
});

test('a manual adult override wins over the auto ramp', () => {
  const auto = effectiveStrictness('early', { mode: 'auto', manual: 0.9 }, 3);
  const manual = effectiveStrictness('early', { mode: 'manual', manual: 0.9 }, 3);
  assert.equal(auto, autoStrictness('early', 3));   // manual value ignored in auto mode
  assert.equal(manual, 0.9);                        // pinned by the adult
});

test('effective strictness falls back to auto when no tuning is set', () => {
  assert.equal(effectiveStrictness('middle', null, 0), autoStrictness('middle', 0));
});

test('levelForStrictness snaps to the nearest named level', () => {
  assert.equal(levelForStrictness(0.15).key, 'emerging');
  assert.equal(levelForStrictness(0.85).key, 'advanced');
  assert.equal(levelForStrictness(0.63).key, 'proficient');
});

test('tuning levels are ordered by increasing strictness', () => {
  for (let i = 1; i < TUNING_LEVELS.length; i++) {
    assert.ok(TUNING_LEVELS[i].strictness > TUNING_LEVELS[i - 1].strictness);
  }
});

// ── data integrity ──────────────────────────────────────────────────────────────────

test('every letter model has at least one stroke with >= 2 points, inside the box', () => {
  for (const L of HANDWRITING_LETTERS) {
    assert.ok(L.strokes.length >= 1, `${L.key} has no strokes`);
    for (const st of L.strokes) {
      assert.ok(st.points.length >= 2, `${L.key} stroke too short`);
      for (const p of st.points) {
        assert.ok(p.x >= -5 && p.x <= 105 && p.y >= -5 && p.y <= 155, `${L.key} point out of box: ${p.x},${p.y}`);
      }
    }
  }
});

test('letter keys are unique', () => {
  const keys = HANDWRITING_LETTERS.map(l => l.key);
  assert.equal(new Set(keys).size, keys.length);
});
