// The composer's contract.
//
// The melody must be reproducible, stay in its register, phrase (not run continuously), and above
// all be CONSONANT with the harmony — it draws from the same pitch collection, so every note has to
// reduce to a member of that set over the same root the harmony uses.
//
//   npx tsx --test tests/composer.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { composeMelody } from '../services/ora/stillness/composer';
import type { SessionState } from '../services/ora/stillness/emotionalEngine';

const DUR = 20 * 60;
const SET = [0, 2, 4, 7, 9]; // a fixed collection to check consonance against
const DEPTH = 0.5;
const ROOT = Math.round(43 - DEPTH * 8); // must mirror composer.ts

const stateAt = (t: number): SessionState => ({
  t, phase: 'settling', phaseProgress: 0.5,
  depth: DEPTH, breathPhase: 0, breathRate: 10, arousal: 0.4, openness: 0.5,
  bloom: 0, bloomPan: 0, turned: false, pacing: false,
});
const setAt = () => SET;

const mk = (seed: number) => composeMelody({ seed, durationSec: DUR, stateAt, setAt });

test('the melody is deterministic', () => {
  assert.deepEqual(mk(4242), mk(4242));
  assert.notDeepEqual(mk(1).map((m) => m.note), mk(2).map((m) => m.note));
});

test('it actually writes something, and it phrases (does not run continuously)', () => {
  const m = mk(4242);
  assert.ok(m.length > 12, `a 20-minute arc should have a real melody, got ${m.length}`);
  // Ordered in time.
  for (let i = 1; i < m.length; i++) assert.ok(m[i].at >= m[i - 1].at);
  // Phrasing: the total sounding time is well under the arc — there are real rests.
  const sounding = m.reduce((a, n) => a + Math.min(n.holdSec, 6), 0);
  assert.ok(sounding < DUR * 0.8, 'the melody must leave silence, not play wall-to-wall');
});

test('every note stays in the melody register', () => {
  for (const seed of [1, 77, 4242, 90210]) {
    for (const n of mk(seed)) {
      assert.ok(n.note >= 52 && n.note <= 74, `note ${n.note} out of the melody register`);
    }
  }
});

test('every note is consonant with the harmony collection', () => {
  for (const seed of [1, 77, 4242, 90210]) {
    for (const n of mk(seed)) {
      const degree = (((n.note - ROOT) % 12) + 12) % 12;
      assert.ok(SET.includes(degree), `note ${n.note} (degree ${degree}) is not in the collection ${SET}`);
    }
  }
});

test('velocities and holds are sane and gentle', () => {
  for (const n of mk(4242)) {
    assert.ok(n.velocity > 0 && n.velocity <= 0.6, `velocity ${n.velocity} out of range`);
    assert.ok(n.holdSec > 0 && n.holdSec < 30);
  }
});

test('Depth is left far sparser than Settling', () => {
  const settling = (t: number): SessionState => ({ ...stateAt(t), phase: 'settling', depth: 0.4 });
  const deep = (t: number): SessionState => ({ ...stateAt(t), phase: 'depth', depth: 0.85 });
  const s = composeMelody({ seed: 9, durationSec: DUR, stateAt: settling, setAt });
  const d = composeMelody({ seed: 9, durationSec: DUR, stateAt: deep, setAt });
  assert.ok(d.length < s.length, `Depth (${d.length}) must be sparser than Settling (${s.length})`);
});
