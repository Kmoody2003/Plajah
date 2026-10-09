import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AnimPreset } from '../services/living/contracts';
import { ALL_PRESETS, IDLE_LOOPS, compileAnim, easingFor, isEntrancePreset, sampleClosedPath, type AnimCtx } from '../services/living/runtime/anim';

const ctx = (over: Partial<AnimCtx> = {}): AnimCtx => ({ box: { x: 100, y: 100, w: 40, h: 40 }, pageW: 400, pageH: 600, reduced: false, seed: 7, ...over });
const SPECIAL: AnimPreset[] = ['draw-on', 'type-on', 'parallax'];

describe('animation presets compile', () => {
  it('knows all 35 contract presets', () => assert.equal(new Set(ALL_PRESETS).size, 35));

  for (const p of ALL_PRESETS) {
    it(`preset ${p}: valid keyframes, deterministic, within strength limits`, () => {
      const c = compileAnim({ preset: p }, ctx());
      if (SPECIAL.includes(p)) { assert.ok(c.special, 'special presets are handled by the engine'); return; }
      assert.ok(Object.keys(c.channels).length > 0, 'has at least one animated property');
      for (const [ch, frames] of Object.entries(c.channels)) {
        assert.ok(['transform', 'opacity', 'filter'].includes(ch), `only compositor properties are animated (${ch})`);
        let last = -1;
        for (const f of frames!) { assert.ok(f.offset >= 0 && f.offset <= 1, 'offset in 0..1'); assert.ok(f.offset >= last, 'offsets ascend'); last = f.offset; }
        if (ch === 'transform') { const shape = (v: string) => v.replace(/-?\d+(\.\d+)?/g, '#'); const first = shape(String(frames![0].value)); assert.ok(frames!.every(f => shape(String(f.value)) === first), 'same transform function list in every frame (smooth interpolation)'); }
      }
      assert.ok(c.durationMs > 0);
      assert.deepEqual(compileAnim({ preset: p }, ctx()), c, 'same inputs, same output');
      assert.ok(!JSON.stringify(c).includes('NaN'));
    });
  }

  it('the brief\'s ambient loops default to infinite and desync deterministically', () => {
    for (const p of IDLE_LOOPS) {
      const c = compileAnim({ preset: p }, ctx());
      assert.equal(c.ambient, true, `${p} loops by default`);
      assert.equal(c.iterations, Infinity);
      if (p !== 'orbit') assert.ok(c.delayMs <= 0, 'negative delay desynchronises loops');
    }
    const a = compileAnim({ preset: 'twinkle' }, ctx({ seed: 1 })), b = compileAnim({ preset: 'twinkle' }, ctx({ seed: 2 }));
    assert.notEqual(a.delayMs, b.delayMs, 'a row of stars does not twinkle in lockstep');
    assert.equal(compileAnim({ preset: 'twinkle', seed: 5 }, ctx({ seed: 1 })).delayMs, compileAnim({ preset: 'twinkle', seed: 5 }, ctx({ seed: 99 })).delayMs, 'explicit seed wins');
  });

  it('one-shot presets run once and `loop` overrides', () => {
    assert.equal(compileAnim({ preset: 'wiggle' }, ctx()).iterations, 1);
    assert.equal(compileAnim({ preset: 'wiggle', loop: 3 }, ctx()).iterations, 3);
    assert.equal(compileAnim({ preset: 'float', loop: 2 }, ctx()).iterations, 2);
    assert.equal(compileAnim({ preset: 'wiggle', loop: 'infinite' }, ctx()).ambient, true);
  });

  it('amount scales strength; 0 is still; clamped to 2', () => {
    const y = (a?: number) => { const f = compileAnim({ preset: 'bounce', amount: a }, ctx()).channels.transform!; return Math.min(...f.map(k => Number(/translate\([^,]+, (-?[\d.]+)px/.exec(String(k.value))![1]))); };
    assert.ok(y(2) < y(1) && y(1) < y(0.5) && y(0.5) < 0, 'bigger amount, bigger jump (more negative y)');
    assert.equal(y(0), 0);
    assert.equal(y(9), y(2), 'amount is clamped');
  });

  it('direction, delay, duration, easing and origin pass through', () => {
    const c = compileAnim({ preset: 'spin', durationMs: 900, delayMs: 120, easing: 'spring', direction: 'reverse', origin: { x: 0.5, y: 1 } }, ctx());
    assert.equal(c.durationMs, 900); assert.equal(c.delayMs, 120); assert.equal(c.direction, 'reverse'); assert.equal(c.origin, '50% 100%');
    assert.match(c.easing, /cubic-bezier/);
    assert.equal(easingFor('linear'), 'linear'); assert.equal(easingFor(undefined, 'ease-in'), 'ease-in');
    assert.equal(compileAnim({ preset: 'float' }, ctx()).direction, 'alternate', 'ping-pong presets alternate');
  });

  it('flicker never changes faster than ~3 times a second and stays low contrast', () => {
    for (const dur of [400, 1200, 2400, 6000]) {
      const c = compileAnim({ preset: 'flicker', durationMs: dur, seed: 3 }, ctx());
      const n = c.channels.opacity!.length - 1; const perSec = n / (c.durationMs / 1000);
      assert.ok(perSec <= 3 + 1e-6 || n <= 4, `flicker rate ${perSec.toFixed(2)}/s with ${n} steps over ${dur}ms`);
      const ops = c.channels.opacity!.map(f => Number(f.value)); assert.ok(Math.min(...ops) >= 0.6, 'never goes near dark');
    }
  });

  it('orbit follows a page-space path relative to the object centre', () => {
    const c = compileAnim({ preset: 'orbit', path: [200, 120, 260, 180, 200, 240, 140, 180] }, ctx());
    const first = String(c.channels.transform![0].value);
    assert.match(first, /translate\(/);
    const xs = c.channels.transform!.map(f => Number(/translate\((-?[\d.]+)px/.exec(String(f.value))![1]));
    assert.ok(Math.max(...xs) >= 130 && Math.min(...xs) <= 30, 'x offsets span the path 140..260 minus the centre 120');
    const closed = sampleClosedPath([0, 0, 10, 0, 10, 10, 0, 10], 4); assert.equal(closed.length, 4 * 4 * 2);
  });

  it('explicit keyframes compile to channels', () => {
    const c = compileAnim({ keyframes: [{ at: 0, x: 0, opacity: 0 }, { at: 1, x: 30, opacity: 1, rotate: 10 }], durationMs: 500 }, ctx());
    assert.equal(c.channels.transform!.length, 2); assert.equal(c.channels.opacity!.length, 2);
    assert.match(String(c.channels.transform![1].value), /translate\(30px, 0px\) rotate\(10deg\)/);
  });

  it('easing var:<name> makes the animation scrubbed by a variable', () => {
    const c = compileAnim({ preset: 'slide-in', easing: 'var:reveal', durationMs: 1000 }, ctx());
    assert.equal(c.scrubVar, 'reveal'); assert.equal(c.easing, 'linear');
  });

  it('state presets carry a commit so the page ends in the right state', () => {
    assert.deepEqual(compileAnim({ preset: 'fade-out' }, ctx()).commit, { opacity: 0, visible: false });
    assert.deepEqual(compileAnim({ preset: 'pop-in' }, ctx()).commit, { opacity: 1, visible: true });
    assert.equal(compileAnim({ preset: 'grow', amount: 1 }, ctx()).commit!.scaleMul, 1.5);
    assert.equal(compileAnim({ preset: 'wiggle' }, ctx()).commit, undefined, 'returning presets leave no residue');
    assert.ok(isEntrancePreset('pop-in') && !isEntrancePreset('wiggle'));
  });
});

describe('reduced-motion twin', () => {
  it('motion presets and ambient loops become stills', () => {
    for (const p of ['float', 'breathe', 'wiggle', 'spin', 'orbit', 'flutter', 'bounce', 'shake', 'pulse', 'heartbeat', 'twinkle', 'flicker', 'glow', 'shimmer', 'blink', 'drift', 'swim', 'wave', 'sway', 'bob', 'jelly', 'squash'] as AnimPreset[]) {
      const c = compileAnim({ preset: p, loop: 'infinite' }, ctx({ reduced: true }));
      assert.equal(c.skipped, 'reduced', p); assert.deepEqual(c.channels, {}); assert.equal(c.ambient, false);
    }
  });
  it('entrances and exits survive as opacity-only fades with the same end state', () => {
    for (const p of ['fade-in', 'fade-out', 'pop-in', 'pop-out', 'slide-in', 'slide-out'] as AnimPreset[]) {
      const c = compileAnim({ preset: p }, ctx({ reduced: true }));
      assert.deepEqual(Object.keys(c.channels), ['opacity'], `${p} keeps only opacity`);
      assert.ok(c.durationMs >= 200 && c.durationMs <= 500);
      assert.deepEqual(c.commit, compileAnim({ preset: p }, ctx()).commit);
      assert.equal(c.iterations, 1);
    }
  });
  it('state-moving presets keep their commit so the result is still shown', () => {
    const c = compileAnim({ preset: 'grow' }, ctx({ reduced: true }));
    assert.equal(c.skipped, 'reduced'); assert.equal(c.commit!.scaleMul, 1.5);
  });
  it('draw-on and type-on finish instantly', () => {
    for (const p of ['draw-on', 'type-on'] as AnimPreset[]) { const c = compileAnim({ preset: p }, ctx({ reduced: true })); assert.equal(c.durationMs, 0); assert.equal(c.special, p); }
  });
});
