import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planHelloCounter, helloCounterFields, HL_MAX_PER_WINDOW, HL_WINDOW_MS, HL_MIN_GAP_MS } from '../services/sayHiCore';

const now = 1_700_000_000_000;

test('first hello opens a window', () => {
  assert.deepEqual(planHelloCounter(null, now), { ok: true, resetWindow: true, nextCount: 1 });
});
test('min gap enforced', () => {
  const r = planHelloCounter({ hlCount: 1, hlWindowStartMs: now - 10_000, lastHelloAtMs: now - 1000 }, now);
  assert.deepEqual(r, { ok: false, retryAfterMs: HL_MIN_GAP_MS - 1000 });
});
test('increments inside window', () => {
  assert.deepEqual(planHelloCounter({ hlCount: 4, hlWindowStartMs: now - 60_000, lastHelloAtMs: now - HL_MIN_GAP_MS }, now), { ok: true, resetWindow: false, nextCount: 5 });
});
test('cap reached -> retry after window end', () => {
  const r = planHelloCounter({ hlCount: HL_MAX_PER_WINDOW, hlWindowStartMs: now - 1000, lastHelloAtMs: now - 10_000 }, now);
  assert.deepEqual(r, { ok: false, retryAfterMs: HL_WINDOW_MS - 1000 });
});
test('expired window resets', () => {
  assert.deepEqual(planHelloCounter({ hlCount: HL_MAX_PER_WINDOW, hlWindowStartMs: now - HL_WINDOW_MS, lastHelloAtMs: now - HL_WINDOW_MS }, now), { ok: true, resetWindow: true, nextCount: 1 });
});
test('counter fields match rules shape', () => {
  assert.deepEqual(helloCounterFields({ ok: true, resetWindow: true, nextCount: 1 }, 'TS'), { hlCount: 1, hlWindowStart: 'TS', lastHelloAt: 'TS' });
  assert.deepEqual(helloCounterFields({ ok: true, resetWindow: false, nextCount: 7 }, 'TS'), { hlCount: 7, lastHelloAt: 'TS' });
});
