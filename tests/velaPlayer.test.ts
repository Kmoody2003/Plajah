// The player's contract.
//
// The musical rules matter as much as the mechanical ones here: a leading tone or a cadence
// would undo the thing the session is for, and those are properties worth asserting rather than
// hoping for.
//
//   npx tsx --test tests/velaPlayer.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSession } from '../services/ora/stillness/emotionalEngine';
import { createPlayer, presetForPhase } from '../services/ora/stillness/velaPlayer';
import { VELA_PRESETS } from '../services/melos/instruments/vela/presets';

const DUR = 20 * 60;
const mk = (seed = 4242, arrival: 1 | 3 | 5 = 3) => {
  const session = createSession({ seed, durationSec: DUR, arrival });
  return { session, player: createPlayer(seed, DUR, (t) => session.at(t)) };
};

test('the performance is deterministic and ordered', () => {
  const a = mk();
  const b = mk();
  assert.deepEqual(a.player.events(), b.player.events());

  let prev = -1;
  for (const e of a.player.events()) {
    assert.ok(e.at > prev, `events must advance in time (${e.at} after ${prev})`);
    prev = e.at;
    assert.ok(e.at <= DUR);
  }
  assert.ok(a.player.events().length > 8, 'a twenty-minute session should have something in it');
});

test('the collection never contains a leading tone against its reference', () => {
  // A semitone below the reference is the strongest pull toward resolution in Western hearing.
  // Its absence is most of why this reads as suspended rather than unfinished.
  for (const seed of [1, 77, 4242, 90210]) {
    const { player } = mk(seed);
    for (let t = 0; t <= DUR; t += 20) {
      const set = player.setAt(t);
      assert.ok(!set.includes(1), `pitch class 1 must never appear (t=${t}, set=${set})`);
      assert.ok(!set.includes(6), `pitch class 6 must never appear (t=${t}, set=${set})`);
    }
  }
});

test('the collection mutates one note at a time, never wholesale', () => {
  const { player } = mk(31);
  let prev = player.setAt(0);
  let changed = 0;
  for (let t = 0; t <= DUR; t += 5) {
    const set = player.setAt(t);
    if (set !== prev) {
      const removed = prev.filter((p) => !set.includes(p)).length;
      const added = set.filter((p) => !prev.includes(p)).length;
      assert.ok(removed <= 1, `at most one note leaves at a time (t=${t}: -${removed})`);
      assert.ok(added <= 1, `at most one note arrives at a time (t=${t}: +${added})`);
      changed++;
      prev = set;
    }
  }
  assert.ok(changed >= 3, `the harmony must actually move (${changed} mutations)`);
});

test('Depth is the emptiest stretch — gaps get long on purpose', () => {
  const { session, player } = mk(9);
  const ev = player.events();
  const gapsIn = (phase: string) => {
    const g: number[] = [];
    for (let i = 1; i < ev.length; i++) {
      if (session.at(ev[i].at).phase === phase) g.push(ev[i].at - ev[i - 1].at);
    }
    return g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0;
  };
  const arrival = gapsIn('arrival');
  const depth = gapsIn('depth');
  assert.ok(depth > arrival * 1.8, `Depth gaps must be far longer (${depth.toFixed(1)}s vs ${arrival.toFixed(1)}s)`);
  assert.ok(depth > 20, `Depth should be genuinely spacious, got ${depth.toFixed(1)}s`);
});

test('voicings thin out and drop in register as the session deepens', () => {
  const { session, player } = mk(55);
  const ev = player.events();
  const early = ev.filter((e) => session.at(e.at).depth < 0.25);
  const deep = ev.filter((e) => session.at(e.at).depth > 0.8);
  assert.ok(early.length && deep.length, 'need events at both ends to compare');

  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(
    avg(deep.map((e) => e.voicing.notes.length)) < avg(early.map((e) => e.voicing.notes.length)),
    'fewer notes sounding deep in',
  );
  assert.ok(
    avg(deep.map((e) => Math.min(...e.voicing.notes))) < avg(early.map((e) => Math.min(...e.voicing.notes))),
    'register drops as the session deepens',
  );
  assert.ok(
    avg(deep.map((e) => e.voicing.velocity)) < avg(early.map((e) => e.voicing.velocity)),
    'and it gets quieter',
  );
});

test('an agitated arrival is met with more, not less', () => {
  const rough = mk(12, 1);
  const bright = mk(12, 5);
  const firstMinute = (p: ReturnType<typeof mk>) =>
    p.player.events().filter((e) => e.at < 90).length;
  assert.ok(
    firstMinute(rough) >= firstMinute(bright),
    `Rough should get at least as many events early (${firstMinute(rough)} vs ${firstMinute(bright)})`,
  );
  assert.ok(
    rough.player.setAt(0).length > bright.player.setAt(0).length,
    'and a denser collection to arrive into',
  );
});

test('notes stay in a playable range and voicings never collide', () => {
  for (const seed of [3, 500, 7777]) {
    const { player } = mk(seed);
    for (const e of player.events()) {
      assert.ok(e.voicing.notes.length > 0, 'a voicing must sound something');
      assert.equal(new Set(e.voicing.notes).size, e.voicing.notes.length, 'no doubled notes');
      for (const n of e.voicing.notes) {
        assert.ok(n >= 24 && n <= 96, `note ${n} out of a sane range`);
      }
      assert.ok(e.voicing.holdSec > 1 && e.voicing.holdSec < 40);
      assert.ok(e.voicing.pan >= -1 && e.voicing.pan <= 1);
      assert.ok(e.voicing.velocity > 0 && e.voicing.velocity <= 1);
    }
  }
});

test('every phase maps to a preset that actually exists', () => {
  const { session } = mk();
  const ids = new Set(VELA_PRESETS.map((p) => p.id));
  const seen = new Set<string>();
  for (let t = 0; t <= DUR; t += 10) {
    const { presetId, blendToStruck } = presetForPhase(session.at(t));
    assert.ok(ids.has(presetId), `phase maps to unknown preset "${presetId}"`);
    seen.add(presetId);
    if (blendToStruck) {
      assert.equal(session.at(t).phase, 'turn', 'only the Turn is a struck gesture');
    }
  }
  assert.ok(seen.size >= 4, `the session should not sit on one patch (used ${seen.size})`);
});

test('the Turn is the only struck moment in the session', () => {
  const { session } = mk();
  let struck = 0;
  for (let t = 0; t <= DUR; t += 2) if (presetForPhase(session.at(t)).blendToStruck) struck++;
  assert.ok(struck > 0, 'the Turn must happen');
  // The turn phase is 20% of the session, so at 2 s steps that is ~120 samples of it and
  // nothing else.
  assert.ok(struck < DUR / 2 * 0.25, 'nothing outside the Turn may be struck');
});
