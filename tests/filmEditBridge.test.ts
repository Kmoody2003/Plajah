import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickSelect, planAssembly, orderScenes } from '../services/filmEditBridge.ts';

const scene = (id: string, n: string, day = 1, extra: any = {}) => ({ id, sceneNum: n, shootDay: day, order: 0, set: 'Set ' + n, status: 'PENDING', ...extra }) as any;
const take = (id: string, sceneId: string, n: number, extra: any = {}) => ({ id, sceneId, sceneNum: '1', takeNumber: n, status: 'GOOD', proxyUrl: 'https://x/' + id, duration: 10, createdAt: 0, ...extra }) as any;

test('the director circle always beats the story-aware pick', () => {
  const t = [take('a', 's1', 1, { matchScore: 95 }), take('b', 's1', 2, { circled: true, matchScore: 10 })];
  const p = pickSelect('s1', t)!;
  assert.equal(p.take.id, 'b'); assert.equal(p.reason, 'circled');
});

test('with no circle, the best script reading wins, then rating, then earliest take', () => {
  assert.equal(pickSelect('s1', [take('a', 's1', 1, { matchScore: 40 }), take('b', 's1', 2, { matchScore: 88 })])!.reason, 'best-reading');
  assert.equal(pickSelect('s1', [take('a', 's1', 1, { rating: 2 }), take('b', 's1', 2, { rating: 5 })])!.take.id, 'b');
  const f = pickSelect('s1', [take('b', 's1', 2), take('a', 's1', 1)])!;
  assert.equal(f.take.id, 'a'); assert.equal(f.reason, 'first-take');
});

test('NG takes and takes without a proxy are never selected', () => {
  assert.equal(pickSelect('s1', [take('a', 's1', 1, { status: 'NG', circled: true }), take('b', 's1', 2, { proxyUrl: undefined })]), undefined);
});

test('assembly reads in shoot-day then numeric scene order, lays selects end-to-end, flags gaps', () => {
  const scenes = [scene('s10', '10', 1), scene('s2', '2', 1), scene('s3', '3', 2)];
  const takes = [take('t10', 's10', 1, { duration: 4 }), take('t3', 's3', 1, { duration: 6 })];
  assert.deepEqual(orderScenes(scenes).map(s => s.sceneNum), ['2', '10', '3']);
  const plan = planAssembly(scenes, takes);
  assert.deepEqual(plan.rows.map(r => [r.scene.sceneNum, r.start, r.duration]), [['2', 0, 0], ['10', 0, 4], ['3', 4, 6]]);
  assert.equal(plan.runtime, 10); assert.equal(plan.covered, 2); assert.deepEqual(plan.gaps.map(s => s.sceneNum), ['2']);
});

test('omitted scenes are not part of the film: never cut in, never a gap', () => {
  const plan = planAssembly([scene('s1', '1'), scene('s2', '2', 1, { status: 'OMIT' })], [take('t1', 's1', 1), take('t2', 's2', 1)]);
  assert.equal(plan.total, 1); assert.equal(plan.gaps.length, 0); assert.equal(plan.runtime, 10);
});
