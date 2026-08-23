// The handoff, and the rules around the burst.
//
// This is the piece that is most likely to embarrass the channel: everything else degrades
// gracefully, a mistimed crossfade does not. So it gets built and tested before anything
// cosmetic, and the tests here are about the properties that make it seamless rather than about
// whether the functions return numbers.
//
//   npx tsx --test tests/solaHandoff.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONVERGE_SEC, CROSSFADE_SEC, NOTICE_RETIRE_AFTER, SOLA_COPY, TIER_POLICY,
  blendPhase, converge, convergenceAmount, crossfadeGains, noticeOpacity, planBurst,
  shouldShowNotice,
} from '../services/fast/sola';
import { createSession } from '../services/ora/stillness/emotionalEngine';

const ARC = 20 * 60;

test('a burst is one complete arc, never a slice of one', () => {
  const plan = planBurst(TIER_POLICY.burst, ARC, 99999);
  assert.equal(plan.allowed, true);
  assert.equal(plan.durationSec, ARC, 'the burst takes the arc length, not the nominal budget');

  // An arc longer than the thermal budget is declined outright rather than started and cut.
  const long = planBurst(TIER_POLICY.burst, 45 * 60, 99999);
  assert.equal(long.allowed, false);
  assert.match(long.reason, /thermal budget/);
});

test('the cooldown is respected, and Stream tier never bursts', () => {
  const cooling = planBurst(TIER_POLICY.burst, ARC, 60);
  assert.equal(cooling.allowed, false);
  assert.ok(cooling.cooldownSec > 0, 'should report how long is left');

  const stream = planBurst(TIER_POLICY.stream, ARC, 99999);
  assert.equal(stream.allowed, false);

  // Continuous tier has no reason to watch the shared feed at all.
  const cont = planBurst(TIER_POLICY.continuous, ARC, 0);
  assert.equal(cont.allowed, true);
  assert.equal(cont.cooldownSec, 0);
});

test('convergence starts at zero and reaches one exactly at the handoff', () => {
  assert.equal(convergenceAmount(CONVERGE_SEC + 10), 0, 'no steering before the window');
  assert.equal(convergenceAmount(CONVERGE_SEC), 0);
  assert.equal(convergenceAmount(0), 1, 'fully converged at the handoff');

  // Monotonic, and eased rather than linear — a linear steer is a lurch.
  let prev = -1;
  for (let s = CONVERGE_SEC; s >= 0; s -= 1) {
    const k = convergenceAmount(s);
    assert.ok(k >= prev, `convergence must not go backwards at ${s}s`);
    prev = k;
  }
  // Eased, not linear: in the first half of the window the steer lags a straight ramp. (At the
  // exact midpoint smoothstep equals the linear value, so measuring there proves nothing.)
  const quarterIn = convergenceAmount(CONVERGE_SEC * 0.75);
  assert.ok(quarterIn < 0.25, `easing should start gently (got ${quarterIn.toFixed(3)} vs linear 0.25)`);
});

test('the crossfade is equal-power, so the middle does not dip', () => {
  for (let s = CROSSFADE_SEC; s >= 0; s -= 0.5) {
    const { local, stream } = crossfadeGains(s);
    const power = local * local + stream * stream;
    assert.ok(Math.abs(power - 1) < 1e-6, `power must stay at unity (got ${power.toFixed(6)} at ${s}s)`);
  }
  assert.deepEqual(crossfadeGains(CROSSFADE_SEC + 5), { local: 1, stream: 0 });
  assert.deepEqual(crossfadeGains(0), { local: 0, stream: 1 });
});

test('breath phase blends the short way round the circle', () => {
  // 0.95 → 0.05 must go forward through the wrap, not backwards across the whole cycle.
  const mid = blendPhase(0.95, 0.05, 0.5);
  assert.ok(mid > 0.95 || mid < 0.05, `expected a wrap-crossing blend, got ${mid}`);

  // And the result always stays in range.
  for (const [a, b] of [[0.9, 0.1], [0.1, 0.9], [0.5, 0.5], [0.0, 0.99]]) {
    for (let k = 0; k <= 1; k += 0.1) {
      const v = blendPhase(a, b, k);
      assert.ok(v >= 0 && v < 1, `phase out of range: ${v}`);
    }
  }
  assert.equal(blendPhase(0.3, 0.7, 0), 0.3, 'k=0 is a no-op');
  assert.ok(Math.abs(blendPhase(0.3, 0.7, 1) - 0.7) < 1e-9, 'k=1 lands on the target');
  assert.equal(blendPhase(0.42, 0.9, 0), 0.42, 'k=0 must be exact, not merely close');
});

test('a converging session actually arrives at the stream state', () => {
  // Two genuinely different sessions: a unique burst and the shared stream.
  const local = createSession({ seed: 0xabcdef, durationSec: ARC, arrival: 1 });
  const shared = createSession({ seed: 0x123456, durationSec: 60 * 60, arrival: 3 });

  const handoffAt = ARC;
  const target = shared.at(1800);

  let maxGapAtEnd = 0;
  for (let s = CONVERGE_SEC; s >= 0; s -= 1) {
    const k = convergenceAmount(s);
    const blended = converge(local.at(handoffAt - s), target, k);
    if (s === 0) {
      maxGapAtEnd = Math.max(
        Math.abs(blended.depth - target.depth),
        Math.abs(blended.arousal - target.arousal),
        Math.abs(blended.breathRate - target.breathRate),
        Math.abs(blended.breathPhase - target.breathPhase),
      );
    }
  }
  assert.ok(maxGapAtEnd < 1e-6, `the local session must land on the stream state (gap ${maxGapAtEnd})`);
});

test('convergence never moves a value backwards through a discontinuity', () => {
  const local = createSession({ seed: 7, durationSec: ARC, arrival: 1 });
  const shared = createSession({ seed: 8, durationSec: 60 * 60, arrival: 5 });
  const handoffAt = ARC;

  let prev: number | null = null;
  for (let s = CONVERGE_SEC; s >= 0; s -= 0.5) {
    const k = convergenceAmount(s);
    const t = handoffAt - s;
    const b = converge(local.at(t), shared.at(1800 - s), k);
    assert.ok(Number.isFinite(b.depth) && b.depth >= 0 && b.depth <= 1);
    assert.ok(b.breathPhase >= 0 && b.breathPhase < 1);
    assert.ok(b.breathRate > 1 && b.breathRate < 30, `breath rate must stay plausible: ${b.breathRate}`);
    if (prev !== null) {
      // Breath rate is a continuous physical quantity; a jump would be audible as the pacing
      // suddenly changing under someone.
      assert.ok(Math.abs(b.breathRate - prev) < 0.6, `breath rate jumped by ${Math.abs(b.breathRate - prev).toFixed(3)}`);
    }
    prev = b.breathRate;
  }
});

test('blooms are not blended — two gestures must not smear into one', () => {
  const local = createSession({ seed: 11, durationSec: ARC });
  const shared = createSession({ seed: 12, durationSec: 60 * 60 });
  const a = local.at(ARC - 5);
  const b = shared.at(1795);
  const merged = converge(a, b, 0.9);
  assert.equal(merged.bloom, a.bloom, 'bloom must come from the local session only');
  assert.equal(merged.bloomPan, a.bloomPan);
});

test('the notice fades rather than appears, and never exceeds 80%', () => {
  let peak = 0;
  let prev = 0;
  let maxStep = 0;
  for (let t = 0; t < 120; t += 1 / 30) {
    const o = noticeOpacity(t);
    assert.ok(o >= 0 && o <= 0.8 + 1e-9, `opacity out of range: ${o}`);
    peak = Math.max(peak, o);
    maxStep = Math.max(maxStep, Math.abs(o - prev) * 30);
    prev = o;
  }
  assert.ok(Math.abs(peak - 0.8) < 1e-6, 'should reach exactly 80%');
  // Fading in over four seconds means a rate of 0.2/s, well under anything abrupt.
  assert.ok(maxStep < 0.25, `the notice must fade, not appear (rate ${maxStep.toFixed(3)}/s)`);
  assert.equal(noticeOpacity(0), 0, 'nothing before the session is underway');
});

test('the opening notice retires itself after three sessions', () => {
  const base = { inSola: true, noticesEnabled: true };
  for (let n = 0; n < NOTICE_RETIRE_AFTER; n++) {
    assert.equal(shouldShowNotice({ ...base, solaSessionsSeen: n }), true);
  }
  assert.equal(shouldShowNotice({ ...base, solaSessionsSeen: NOTICE_RETIRE_AFTER }), false);
  assert.equal(shouldShowNotice({ ...base, solaSessionsSeen: 99 }), false);

  // Off means Sola still happens, unannounced.
  assert.equal(shouldShowNotice({ inSola: true, noticesEnabled: false, solaSessionsSeen: 0 }), false);
  // And it never shows outside a burst — which is how the tier is never surfaced.
  assert.equal(shouldShowNotice({ inSola: false, noticesEnabled: true, solaSessionsSeen: 0 }), false);
});

test('the copy points at the making, not at the ending', () => {
  for (const register of Object.values(SOLA_COPY)) {
    assert.ok(register.open.length <= 24, 'the opening line stays short');
    assert.ok(
      register.close.length < register.open.length + register.sub.length,
      'the closing line must be shorter than the opening',
    );
    // The rejected version. It is true and it is wrong: it puts a countdown in someone's head
    // at the start of something designed to remove countdowns.
    const all = `${register.open} ${register.sub} ${register.close}`.toLowerCase();
    assert.ok(!all.includes("it's gone"), 'loss framing must not be the default copy');
    assert.ok(!all.includes('will be lost'));
  }
});
