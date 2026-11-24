import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createAdPlatformRouter } from '../routes/adPlatform';
import { createAdminPlatformRouter } from '../routes/adminPlatform';

const NOW = Date.UTC(2026, 10, 23, 12);
const pass: express.RequestHandler = (req: any, _res, next) => { req.uid = 'admin1'; next(); };
const deny: express.RequestHandler = (_req, res) => { res.status(403).json({ error: 'Platform admin access required' }); };

async function serve(app: express.Express) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>(r => server.close(() => r())) };
}

test('ad events are validated and counted per day, per ad', async () => {
  const bumps: Array<{ path: string; set: any; inc: any }> = [];
  const app = express();
  app.use(createAdPlatformRouter({
    authMiddleware: pass, requireAdmin: pass, now: () => NOW,
    get: async () => ({ exists: true }),
    bump: async (path, set, inc) => { bumps.push({ path, set, inc }); return true; },
  }));
  const s = await serve(app);
  const post = (body: unknown) => fetch(s.base + '/api/ads/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await post({ adId: 'ad_1', kind: 'impression', sourceKind: 'config' })).status, 204);
  assert.equal((await post({ adId: 'ad_1', kind: 'click', sourceKind: 'config' })).status, 204);
  assert.equal((await post({ adId: '../x', kind: 'impression' })).status, 400, 'path-like ids are refused');
  assert.equal((await post({ adId: 'ad_1', kind: 'purchase' })).status, 400, 'only impression and click exist');

  const daily = bumps.filter(b => b.path === 'adMetrics/2026-11-23__ad_1');
  assert.equal(daily.length, 2);
  assert.deepEqual(daily[0].inc, { impressions: 1 });
  assert.deepEqual(daily[1].inc, { clicks: 1 });
  // A site placement also bumps its own counters, which the admin cards already read.
  assert.equal(bumps.filter(b => b.path === 'ads/ad_1').length, 2);
  await s.close();
});

test('a non-config placement never touches the ads collection', async () => {
  const bumps: string[] = [];
  const app = express();
  app.use(createAdPlatformRouter({ authMiddleware: pass, requireAdmin: pass, now: () => NOW, get: async () => ({}), bump: async p => { bumps.push(p); return true; } }));
  const s = await serve(app);
  await fetch(s.base + '/api/ads/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adId: 'promo-1', kind: 'impression', sourceKind: 'promo' }) });
  assert.deepEqual(bumps, ['adMetrics/2026-11-23__promo-1']);
  await s.close();
});

test('workflow actions validate input, write through the server and are audited', async () => {
  const patches: any[] = []; const audits: any[] = [];
  const app = express();
  app.use(createAdPlatformRouter({
    authMiddleware: pass, requireAdmin: pass, now: () => NOW,
    get: async p => (p.endsWith('/missing') ? null : { ok: true }),
    patch: async (path, data) => { patches.push({ path, data }); return true; },
    audit: async (actor, action, target, detail) => { audits.push({ actor, action, target, detail }); },
  }));
  const s = await serve(app);
  const post = (path: string, body: unknown) => fetch(s.base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  assert.equal((await post('/api/admin/ads/off-platform/op1/status', { status: 'SCHEDULED', note: 'Tues slot' })).status, 200);
  assert.equal((await post('/api/admin/ads/off-platform/op1/status', { status: 'PAID' })).status, 400, 'unknown status is refused');
  assert.equal((await post('/api/admin/ads/off-platform/missing/status', { status: 'LIVE' })).status, 404);
  assert.equal((await post('/api/admin/ads/campaigns/c1/status', { status: 'PAUSED' })).status, 200);
  assert.equal((await post('/api/admin/ads/packages/p1/active', { isActive: 'no' })).status, 400);

  assert.deepEqual(patches[0].data.status, 'SCHEDULED');
  assert.equal(patches[0].data.adminNote, 'Tues slot');
  assert.equal(patches[1].data.isActive, false, 'pausing a campaign also clears isActive');
  assert.equal(audits.length, 2);
  assert.equal(audits[0].actor, 'admin1');
  await s.close();
});

test('admin ad routes sit behind the admin gate', async () => {
  const app = express();
  app.use(createAdPlatformRouter({ authMiddleware: pass, requireAdmin: deny }));
  app.use('/api/admin/platform', createAdminPlatformRouter({ authMiddleware: pass, requireAdmin: deny }));
  const s = await serve(app);
  assert.equal((await fetch(s.base + '/api/admin/ads/overview')).status, 403);
  assert.equal((await fetch(s.base + '/api/admin/platform/overview')).status, 403);
  assert.equal((await fetch(s.base + '/api/admin/ads/campaigns/c1/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"status":"ACTIVE"}' })).status, 403);
  await s.close();
});

test('platform overview reports a failed count as null, never zero', async () => {
  const app = express();
  app.use('/api/admin/platform', createAdminPlatformRouter({
    authMiddleware: pass, requireAdmin: pass, now: () => NOW,
    count: async c => (c === 'users' ? 128 : c === 'albums' ? null : 0),
    list: async () => [{ id: 'a', data: { price: 9.99, createdAt: NOW - 86_400_000 } }, { id: 'b', data: { price: 20, createdAt: NOW - 90 * 86_400_000 } }],
  }));
  const s = await serve(app);
  const j: any = await (await fetch(s.base + '/api/admin/platform/overview')).json();
  assert.equal(j.people.total, 128);
  assert.equal(j.content.albums, null);
  assert.equal(j.content.videos, 0);
  assert.equal(j.signups.length, 6);
  assert.equal(j.ads.packageRevenue30d, 9.99);
  assert.equal(j.ads.packageRevenueAllTime, 29.99);
  await s.close();
});
