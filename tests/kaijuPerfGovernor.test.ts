// Tests for the Kaiju stages' quality governor: it must settle on a level that holds the target frame rate,
// not flap, and ignore tab-hidden hitches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerfGovernor, STAGE2D_LEVELS, STAGE3D_LEVELS, startLevel } from '../components/kaiju/kaijuPerfGovernor';

/** Feed `sec` seconds of frames at `ms` each; returns the levels visited. */
function feed(g: PerfGovernor, sec: number, ms: number) {
  const seen: number[] = [];
  for (let t = 0; t < sec * 1000; t += ms) { const c = g.push(ms); if (c !== null) seen.push(c); }
  return seen;
}

test('a stage that holds 60 fps stays at the top level, then never degrades', () => {
  const g = new PerfGovernor({ levels: 6, warmupSeconds: 0 });
  assert.deepEqual(feed(g, 30, 16.7), []);
  assert.equal(g.level, 0);
});

test('a slow GPU is walked down until the target holds', () => {
  // frame time falls with level: 40 ms at level 0, 8 ms less per level (so 16 ms at level 3)
  const g = new PerfGovernor({ levels: 6, warmupSeconds: 0 });
  for (let i = 0; i < 4000 && g.level < 3; i++) g.push(40 - g.level * 8);
  assert.ok(g.level >= 3, `should have degraded to hold 60 fps, at ${g.level}`);
  const before = g.level;
  for (let i = 0; i < 300; i++) g.push(40 - g.level * 8);   // < the 9 s probe window
  assert.equal(g.level, before, 'once it holds the target it stays put');
});

test('far below the floor drops two levels in one step', () => {
  const g = new PerfGovernor({ levels: 6, floor: 30, warmupSeconds: 0 });
  const seen = feed(g, 2, 50);   // 20 fps
  assert.equal(seen[0], 2);
});

test('upgrades only after a sustained good stretch, and a failed probe is blacklisted', () => {
  const g = new PerfGovernor({ levels: 4, start: 2, warmupSeconds: 0, probeSeconds: 8, blacklistSeconds: 60, retrySeconds: 6 });
  assert.deepEqual(feed(g, 7, 16.6), []);                    // not yet
  assert.deepEqual(feed(g, 3, 16.6), [1]);                    // probe up after ~8 s
  const failed = feed(g, 1, 30);                              // level 1 is too heavy → straight back down
  assert.equal(failed[0], 2);
  g.level = 2; g.push(1000);                                  // (pretend it settled at 2; a hitch clears the window)
  // level 1 is now blacklisted: 30 s of perfect frames must not retry it
  assert.deepEqual(feed(g, 30, 16.6), []);
  assert.equal(g.level, 2);
});

test('hidden-tab hitches are ignored', () => {
  const g = new PerfGovernor({ levels: 6, warmupSeconds: 0 });
  feed(g, 3, 16.7);
  for (let i = 0; i < 20; i++) assert.equal(g.push(2000), null);
  assert.equal(g.level, 0);
});

test('startLevel maps the quality prop onto the ladder', () => {
  assert.equal(startLevel('high', STAGE3D_LEVELS.length), 0);
  assert.equal(startLevel('low', STAGE3D_LEVELS.length), STAGE3D_LEVELS.length - 2);
  assert.ok(startLevel('medium', STAGE2D_LEVELS.length) > 0);
  // ladders only ever get cheaper
  for (let i = 1; i < STAGE3D_LEVELS.length; i++) assert.ok(STAGE3D_LEVELS[i].dpr <= STAGE3D_LEVELS[i - 1].dpr && STAGE3D_LEVELS[i].msaa <= STAGE3D_LEVELS[i - 1].msaa);
  for (let i = 1; i < STAGE2D_LEVELS.length; i++) assert.ok(STAGE2D_LEVELS[i].dpr <= STAGE2D_LEVELS[i - 1].dpr);
});
test('warm-up frames are observed but never acted on', () => {
  const g = new PerfGovernor({ levels: 6, warmupSeconds: 5 });
  assert.deepEqual(feed(g, 4.5, 50), []);   // awful frames while assets bake: ignored
  assert.equal(g.level, 0);
  assert.ok(feed(g, 3, 50).length > 0);      // …but sustained slowness after warm-up is acted on
});
