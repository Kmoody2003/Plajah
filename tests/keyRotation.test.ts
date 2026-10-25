import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { keyStatus, parseRotationDate, worstState, TRACKED_KEYS, SOON_DAYS, URGENT_DAYS } from '../services/keyRotation';
import { createAdminKeysRouter } from '../routes/adminKeys';
import { searchContracts } from '../services/dataCommons/contracts';
import { clearDataCommonsCache } from '../services/dataCommons/core';

const DAY = 86_400_000;
const NOW = Date.parse('2026-10-25T12:00:00Z');

test('countdown: 90 days from rotation, with warning stages at 14 and 3 days', () => {
  assert.equal(keyStatus(undefined, 90, NOW).state, 'unknown');
  const fresh = keyStatus(NOW, 90, NOW);
  assert.equal(fresh.state, 'ok'); assert.equal(fresh.daysLeft, 90);
  assert.equal(keyStatus(NOW - 75 * DAY, 90, NOW).state, 'ok');                 // 15 days left
  assert.equal(keyStatus(NOW - (90 - SOON_DAYS) * DAY, 90, NOW).state, 'soon'); // 14 days left
  assert.equal(keyStatus(NOW - (90 - URGENT_DAYS) * DAY, 90, NOW).state, 'urgent');
  assert.equal(keyStatus(NOW - 90 * DAY, 90, NOW).state, 'urgent');             // due today is urgent, not yet expired
  const late = keyStatus(NOW - 93 * DAY, 90, NOW);
  assert.equal(late.state, 'overdue'); assert.equal(late.daysLeft, -3);
});

test('rotation dates: default now, never the future, never a year back, junk refused', () => {
  assert.equal(parseRotationDate(undefined, NOW), NOW);
  assert.equal(parseRotationDate('', NOW), NOW);
  assert.equal(parseRotationDate('2026-10-01', NOW), Date.parse('2026-10-01'));
  assert.equal(parseRotationDate('2026-12-01', NOW), null);   // a future date would silently extend the countdown
  assert.equal(parseRotationDate('2025-01-01', NOW), null);
  assert.equal(parseRotationDate('last tuesday', NOW), null);
  assert.ok(parseRotationDate(new Date(NOW + 3_600_000).toISOString(), NOW)! <= NOW); // timezone slack is clamped
});

test('worst state ordering and the registry', () => {
  assert.equal(worstState(['ok', 'soon', 'overdue']), 'overdue');
  assert.equal(worstState(['ok', 'unknown']), 'unknown');
  assert.equal(worstState(['ok']), 'ok');
  const sam = TRACKED_KEYS.find(k => k.id === 'sam_gov')!;
  assert.equal(sam.intervalDays, 90);
  assert.equal(sam.envVar, 'SAM_GOV_API_KEY');
});

async function withRouter(opts: { admin: boolean }, run: (base: string, db: Map<string, any>) => Promise<void>) {
  const db = new Map<string, any>();
  const app = express();
  app.use('/api/admin/key-rotation', createAdminKeysRouter({
    authMiddleware: (req: any, res, next) => { if (req.headers.authorization !== 'Bearer t') return res.status(401).json({ error: 'Unauthorized' }); req.uid = 'admin1'; next(); },
    requireAdmin: (_req, res, next) => (opts.admin ? next() : res.status(403).json({ error: 'Platform admin access required' })),
    get: async p => db.get(p) ?? null,
    set: async (p, d) => { db.set(p, d); return true; },
    env: { SAM_GOV_API_KEY: 'super-secret-value' } as any,
    now: () => NOW,
  }));
  const server = app.listen(0);
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/key-rotation`, db); } finally { server.close(); }
}
const H = { Authorization: 'Bearer t', 'Content-Type': 'application/json' };

test('router: admin only', async () => {
  await withRouter({ admin: false }, async base => {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(base, { headers: H })).status, 403);
    assert.equal((await fetch(`${base}/sam_gov/rotated`, { method: 'POST', headers: H, body: '{}' })).status, 403);
  });
});

test('router: untracked at first, then rotating starts the 90-day countdown; the key value is never returned', async () => {
  await withRouter({ admin: true }, async (base, db) => {
    const first: any = await (await fetch(base, { headers: H })).json();
    assert.equal(first.worst, 'unknown');
    assert.equal(first.keys[0].configured, true);
    assert.ok(!JSON.stringify(first).includes('super-secret-value'));

    const r: any = await (await fetch(`${base}/sam_gov/rotated`, { method: 'POST', headers: H, body: '{}' })).json();
    assert.equal(r.status.daysLeft, 90);
    assert.equal(db.get('adminKeyRotations/sam_gov').rotatedBy, 'admin1');

    // Rotating again keeps the previous date in history.
    await fetch(`${base}/sam_gov/rotated`, { method: 'POST', headers: H, body: JSON.stringify({ rotatedAt: '2026-10-20' }) });
    const after: any = await (await fetch(base, { headers: H })).json();
    assert.equal(after.keys[0].status.daysLeft, 85);
    assert.equal(after.keys[0].history.length, 1);
    assert.equal(after.worst, 'ok');
  });
});

test('router: bad input is refused', async () => {
  await withRouter({ admin: true }, async base => {
    assert.equal((await fetch(`${base}/nope/rotated`, { method: 'POST', headers: H, body: '{}' })).status, 404);
    assert.equal((await fetch(`${base}/sam_gov/rotated`, { method: 'POST', headers: H, body: JSON.stringify({ rotatedAt: '2030-01-01' }) })).status, 400);
    assert.equal((await fetch(`${base}/sam_gov/rotated`, { method: 'POST', headers: H, body: JSON.stringify({ rotatedAt: 'soon' }) })).status, 400);
  });
});

test('an expired key is told apart from throttling, so the admin hears about it', async () => {
  const real = globalThis.fetch;
  try {
    clearDataCommonsCache();
    globalThis.fetch = (async () => new Response('{"error":{"code":"API_KEY_INVALID"}}', { status: 403 })) as typeof fetch;
    const bad = await searchContracts('MI', {}, { apiKey: 'k' });
    assert.equal(bad.status, 'key-problem');
    assert.ok(!/key|expired|403/i.test(bad.message!.replace('renew our SAM.gov access', '')), 'users are not shown credential details');
    clearDataCommonsCache();
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    assert.equal((await searchContracts('MI', {}, { apiKey: 'k' })).status, 'rate-limited');
  } finally { globalThis.fetch = real; clearDataCommonsCache(); }
});
