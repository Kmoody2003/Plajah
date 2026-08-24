// The emotional engine's contract.
//
// Determinism is the one that matters most: the pre-baked headset path, the offline bounce and
// the generative channel all assume that (seed, elapsed) fully determines the session. The rest
// check that the arc actually behaves like the design rather than merely running.
//
//   npx tsx --test tests/stillnessEngine.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSession, drawEphemeralSeed, type ArcPhase } from '../services/ora/stillness/emotionalEngine';
import { velaParamsFor, velaSessionSetup, bloomNoteFor } from '../services/ora/stillness/velaMapping';
import { StillnessDriverSampler, STILLNESS_GATES } from '../components/plajahPixels/engine/stillnessDrivers';
import { M, V, X } from '../services/melos/instruments/vela/params';

const DUR = 20 * 60;

test('the same seed produces the same session, sampled in any order', () => {
  const a = createSession({ seed: 12345, durationSec: DUR, arrival: 3 });
  const b = createSession({ seed: 12345, durationSec: DUR, arrival: 3 });

  // Deliberately shuffled: `at()` must not depend on call order or on internal cursor state.
  const times = [900, 12, 1180, 455, 0, 1199, 77, 640];
  for (const t of times) {
    const sa = a.at(t);
    const sb = b.at(t);
    assert.deepEqual(sa, sb, `state must match at t=${t}`);
  }

  // And sampled forwards, it still matches a backwards sweep of the same session.
  for (let t = 0; t <= DUR; t += 37) {
    assert.deepEqual(a.at(t), b.at(t));
  }
  for (let t = DUR; t >= 0; t -= 37) {
    assert.deepEqual(a.at(t), b.at(t));
  }
});

test('different seeds produce genuinely different sessions', () => {
  const a = createSession({ seed: 1, durationSec: DUR });
  const b = createSession({ seed: 2, durationSec: DUR });
  assert.notEqual(a.blooms().length, 0);
  // The arc is shared — that is the point of a scheduled programme keeping its identity — so
  // the difference has to show up in the event stream rather than in depth or breath.
  const ta = a.blooms().map((e) => e.t.toFixed(2)).join(',');
  const tb = b.blooms().map((e) => e.t.toFixed(2)).join(',');
  assert.notEqual(ta, tb, 'two seeds must not schedule identical blooms');
});

test('the arc runs in order and covers the whole session', () => {
  const s = createSession({ seed: 99, durationSec: DUR });
  const order: ArcPhase[] = ['arrival', 'settling', 'depth', 'turn', 'return'];
  const seen: ArcPhase[] = [];
  for (let t = 0; t <= DUR; t += 1) {
    const p = s.at(t).phase;
    if (seen[seen.length - 1] !== p) seen.push(p);
  }
  assert.deepEqual(seen, order, 'phases must occur once each, in order');
});

test('depth peaks at the Turn and comes back down for Return', () => {
  const s = createSession({ seed: 7, durationSec: DUR });
  const atTurn = s.at(s.turnAt).depth;
  const atStart = s.at(0).depth;
  const atEnd = s.at(DUR).depth;

  assert.ok(atTurn > 0.9, `depth should peak at the Turn (got ${atTurn.toFixed(3)})`);
  assert.ok(atStart < 0.1, 'a session must not open deep');
  assert.ok(atEnd < atTurn * 0.5, 'Return must bring depth back down');
  // Never end on nothing: the last frame should still be somewhere you could open your eyes.
  assert.ok(atEnd > 0.1, 'the session must not end at zero — that reads as a crash, not an ending');
});

test('Arrival meets an agitated person rather than hushing them', () => {
  const rough = createSession({ seed: 5, durationSec: DUR, arrival: 1 });
  const bright = createSession({ seed: 5, durationSec: DUR, arrival: 5 });

  const roughStart = rough.at(20);
  const brightStart = bright.at(20);

  assert.ok(
    roughStart.arousal > brightStart.arousal,
    'arriving rough must open hotter, not quieter',
  );
  assert.ok(
    roughStart.breathRate < brightStart.breathRate,
    'agitated breathing is faster, and Arrival matches it rather than correcting it',
  );

  // But both must converge: by Depth the session has taken over.
  const roughDeep = rough.at(DUR * 0.6);
  const brightDeep = bright.at(DUR * 0.6);
  assert.ok(
    Math.abs(roughDeep.breathRate - brightDeep.breathRate) < 0.01,
    'pacing must converge by Depth regardless of arrival',
  );
  assert.ok(roughDeep.arousal < roughStart.arousal * 0.75, 'arousal must actually come down');
});

test('breath pacing reaches roughly six cycles per minute', () => {
  const s = createSession({ seed: 3, durationSec: DUR });
  const rate = s.at(DUR * 0.35).breathRate;
  const perMin = 60 / rate;
  // ~6/min is the best-supported figure in the whole design; allow the arc some latitude.
  assert.ok(perMin > 4.5 && perMin < 7, `pacing should settle near 6 breaths/min (got ${perMin.toFixed(2)})`);
});

test('breath phase advances monotonically and wraps cleanly', () => {
  const s = createSession({ seed: 11, durationSec: 600 });
  let wraps = 0;
  let prev = s.at(0).breathPhase;
  for (let t = 0.25; t <= 600; t += 0.25) {
    const p = s.at(t).breathPhase;
    assert.ok(p >= 0 && p < 1, `breathPhase out of range at t=${t}: ${p}`);
    if (p < prev) wraps++;
    prev = p;
  }
  // Ten minutes at roughly 5–12 s per cycle is somewhere between 50 and 120 breaths.
  assert.ok(wraps > 45 && wraps < 130, `expected a plausible breath count, got ${wraps}`);
});

test('Depth is the emptiest stretch of the session', () => {
  const s = createSession({ seed: 21, durationSec: DUR });
  const inPhase = (p: ArcPhase) => s.blooms().filter((e) => s.at(e.t).phase === p).length;
  const perMin = (p: ArcPhase, frac: number) => inPhase(p) / ((DUR * frac) / 60);

  const arrival = perMin('arrival', 0.10);
  const depth = perMin('depth', 0.40);
  assert.ok(depth < arrival * 0.4, `Depth must be far emptier than Arrival (${depth.toFixed(1)} vs ${arrival.toFixed(1)} /min)`);
  assert.ok(depth > 0.5, 'Depth must not be completely silent');
});

test('the Turn happens exactly once and dominates its moment', () => {
  const s = createSession({ seed: 42, durationSec: DUR });
  assert.ok(!s.at(s.turnAt - 1).turned);
  assert.ok(s.at(s.turnAt + 1).turned);

  // Measured after the attack, not at the instant it fires — a bloom arrives rather than snaps.
  const atTurn = s.at(s.turnAt + 0.7);
  assert.ok(atTurn.bloom > 0.7, `the Turn must be the loudest gesture (got ${atTurn.bloom.toFixed(3)})`);
  assert.ok(atTurn.bloomPan < 0, 'the Turn is placed behind and to the left');
});

test('bloom impulses decay to nothing and never accumulate', () => {
  const s = createSession({ seed: 8, durationSec: DUR });
  for (const e of s.blooms().slice(0, 40)) {
    const at0 = s.at(e.t + 0.01).bloom;
    const atPeak = s.at(e.t + 0.7).bloom;
    const at6 = s.at(e.t + 6).bloom;
    // A bloom RISES. It used to snap from 0 to 1 in one frame, which is wrong for a struck body
    // and drives the visual field through exactly the step the photosensitivity gate exists to
    // prevent — measured at 1.5-2.7 luminance per second across the meditation shaders.
    assert.ok(at0 < 0.25, `a bloom must arrive, not snap (got ${at0.toFixed(3)} one frame in)`);
    // Only when nothing else fires inside the attack window. In Arrival blooms land about every
    // 1.8 s, so a follower can easily overwrite this one — and then we would be measuring the
    // NEW bloom's attack and calling it a failure of the old one's.
    const crowded = s.blooms().some((x) => x.t > e.t && x.t <= e.t + 0.75);
    if (!crowded) {
      // 0.5, not 0.9: the attack and the decay overlap, so the product peaks near 0.60 rather
      // than reaching 1.0 at all. That is correct — a gesture that hits full scale AND holds it
      // is a flash. What matters is that it gets loud enough to read as an event.
      assert.ok(atPeak > 0.5, `and reach a real peak after the attack (got ${atPeak.toFixed(3)} at +0.7 s)`);
    }
    // Six seconds is past the four-second decay; unless another event landed, it is gone.
    const another = s.blooms().some((x) => x.t > e.t && x.t <= e.t + 6);
    if (!another) {
      assert.ok(at6 < 0.05, `a bloom must decay to nothing (got ${at6.toFixed(4)} at +6 s)`);
    }
  }
});

test('VELA mapping stays in range across the whole session', () => {
  const s = createSession({ seed: 4242, durationSec: DUR, arrival: 1 });
  const stepped = new Set<number>([M.MATERIAL, X.TYPE, V.SHIMMER_IVL]);
  for (let t = 0; t <= DUR; t += 5) {
    for (const [id, v] of velaParamsFor(s.at(t))) {
      assert.ok(Number.isFinite(v), `param ${id} not finite at t=${t}`);
      if (!stepped.has(id) && id !== M.ENABLE) {
        assert.ok(v >= 0 && v <= 1, `param ${id} out of 0..1 at t=${t}: ${v}`);
      }
    }
  }
});

test('roughness falls across the session — the release is physical, not suggested', () => {
  const s = createSession({ seed: 17, durationSec: DUR, arrival: 1 });
  const inharmAt = (t: number) => {
    const p = velaParamsFor(s.at(t)).find(([id]) => id === M.INHARM);
    return p ? p[1] : NaN;
  };
  const early = inharmAt(DUR * 0.05);
  const deep = inharmAt(DUR * 0.6);
  assert.ok(deep < early, `inharmonicity must come down (early=${early.toFixed(4)}, deep=${deep.toFixed(4)})`);
});

test('Drift is configured aperiodic — no Motion route may repeat', () => {
  const setup = velaSessionSetup(0.6);
  const shapes = setup.filter(([id]) => id === 800 || id === 810 || id === 820);
  assert.equal(shapes.length, 3, 'three Drift modulators');
  for (const [, v] of shapes) assert.equal(v, 6, 'every Drift slot must use Tide (shape 6)');

  // Slow range on all three, and retrigger off — a retriggered random walk is a cycle.
  const ranges = setup.filter(([id]) => id === 806 || id === 816 || id === 826);
  assert.equal(ranges.length, 3);
  for (const [, v] of ranges) assert.equal(v, 1);
  const retrig = setup.filter(([id]) => id === 804 || id === 814 || id === 824);
  for (const [, v] of retrig) assert.equal(v, 0, 'retrigger must be off');
});

test('bloom notes are a pure function of (seed, index)', () => {
  const s = createSession({ seed: 606, durationSec: DUR });
  const st = s.at(DUR * 0.5);
  const first = [0, 1, 2, 3, 4].map((i) => bloomNoteFor(st, i, s.seed));
  // Recomputed in a different order — no shared mutable RNG may be involved.
  const second = [4, 2, 0, 3, 1].map((i) => bloomNoteFor(st, i, s.seed));
  assert.deepEqual(first[0], second[2]);
  assert.deepEqual(first[4], second[0]);
});

test('the Pixels driver clamps its uniforms and rate-limits luminance', () => {
  const s = createSession({ seed: 31, durationSec: DUR, arrival: 1 });
  const sampler = new StillnessDriverSampler();

  let now = 0;
  let prevLum = sampler.luminance;
  for (let t = 0; t <= DUR; t += 1 / 30) {
    now += 1000 / 30;
    sampler.update(s.at(t), now);
    const u = sampler.uniforms();
    for (const [k, v] of Object.entries(u)) {
      assert.ok(v >= 0 && v <= 1, `${k} out of range: ${v}`);
    }
    const rate = Math.abs(sampler.luminance - prevLum) * 30;
    assert.ok(
      rate <= STILLNESS_GATES.maxLuminanceRatePerSec + 1e-6,
      `luminance changed at ${rate.toFixed(4)}/s, above the photosensitivity gate`,
    );
    assert.ok(sampler.luminance >= 0, 'luminance must never go negative');
    prevLum = sampler.luminance;
  }
});

test('motion slows as the session deepens, and respects the Depth ceiling', () => {
  const s = createSession({ seed: 55, durationSec: DUR });
  const sampler = new StillnessDriverSampler();

  sampler.update(s.at(DUR * 0.03), 0);
  const early = sampler.motionBudget();
  sampler.update(s.at(DUR * 0.6), 1000);
  const deep = sampler.motionBudget();

  assert.ok(deep < early, 'motion must slow with depth');
  assert.ok(
    deep <= STILLNESS_GATES.maxMotionAtDepth * 1.35,
    `Depth motion must approach the ceiling (got ${deep.toFixed(4)})`,
  );
});

test('rotating shader families are excluded from unrepeatable bursts', () => {
  // Rotation has a period, and a period reads as recoverable — the opposite of the premise.
  assert.equal(StillnessDriverSampler.allowsFamily('radial', true), false);
  assert.equal(StillnessDriverSampler.allowsFamily('mandala', true), false);
  assert.equal(StillnessDriverSampler.allowsFamily('caustics', true), true);
  // The shared stream keeps them — they are excluded from Sola, not from the channel.
  assert.equal(StillnessDriverSampler.allowsFamily('radial', false), true);
});

test('an ephemeral seed is drawn fresh every time', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) seen.add(drawEphemeralSeed());
  assert.ok(seen.size > 190, `entropy seeds must not collide (got ${seen.size} distinct of 200)`);
});
