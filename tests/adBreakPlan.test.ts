// Ad-break timeline: no overlap, whole spots only, exact end, FM fills the odd time.
//   npx tsx --test tests/adBreakPlan.test.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { planBreak, fmGainAt, segHasFm } from '../services/fast/breakPlan';

const spot = (u: string, d: number) => ({ url: u, title: u, durSec: d });
const seeded = (s = 7) => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('back to back, ends exactly at total, nothing truncated', () => {
  for (const total of [20, 37, 60, 90, 117.5, 180]) {
    const spots = [spot('a', 30), spot('b', 15), spot('c', 12.4), spot('d', 22), spot('e', 8)];
    const plan = planBreak({ totalSec: total, spots, hasUpNext: true, rng: seeded(total | 0) });
    let t = 0;
    for (const s of plan) { assert.ok(Math.abs(s.startSec - t) < 0.002, `gap/overlap at ${s.id}`); t = s.startSec + s.durSec; }
    assert.ok(Math.abs(t - total) < 0.002, `ends at ${t} not ${total}`);
    for (const s of plan.filter(x => x.kind === 'spot')) assert.equal(s.durSec, spots.find(p => p.url === s.url)!.durSec);
    assert.ok(plan.some(s => segHasFm(s.kind)), 'FM always comes up');
  }
});

test('FM is silent under spots and fades at run edges', () => {
  const plan = planBreak({ totalSec: 90, spots: [spot('a', 30), spot('b', 30)], hasUpNext: true, rng: seeded() });
  for (const s of plan) {
    const mid = s.startSec + s.durSec / 2;
    if (!segHasFm(s.kind)) assert.equal(fmGainAt(plan, mid), 0);
  }
  assert.equal(fmGainAt(plan, 0), 0);
  assert.ok(fmGainAt(plan, 0.6) > 0 && fmGainAt(plan, 0.6) < 1);
});

test('no spots → all FM with the card; short break never schedules a spot that does not fit', () => {
  const p = planBreak({ totalSec: 14, spots: [spot('a', 30)], hasUpNext: true });
  assert.ok(p.every(s => segHasFm(s.kind)));
});
