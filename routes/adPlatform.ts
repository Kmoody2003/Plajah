// Ad platform — event recording (public) and the admin read model + workflow actions.
//
// POST /api/ads/event                      { adId, kind: 'impression'|'click', sourceKind?, surface? }
//        Public and rate-limited. Counts into adMetrics/{day}__{adId}; for an `ads/{id}` placement
//        it also bumps the impressions/clicks fields the admin cards already read. Before this
//        existed nothing in the product recorded an ad view at all.
// GET  /api/admin/ads/overview             everything the Ad Platform console shows, from the database
// POST /api/admin/ads/configs/:id/active   { isActive }
// POST /api/admin/ads/campaigns/:id/status { status: ACTIVE|PAUSED|COMPLETED }
// POST /api/admin/ads/packages/:id/active  { isActive }
// POST /api/admin/ads/off-platform/:id/status { status, note? }
// POST /api/admin/ads/bounties/:id/status  { status: OPEN|IN_PROGRESS|COMPLETED }
//
// Admin routes: platform admins only, and every change is written to the admin audit log.
// No route here moves money. Off-platform refunds and bounty payouts stay in Stripe.
import express from 'express';
import { fsGet, fsList, fsIncrementFields, fsPatch, fsQueryRange } from '../services/firebaseAdminRest';
import { recordAdminAudit } from './adminPlatform';

export interface AdPlatformDeps {
  authMiddleware: express.RequestHandler;
  requireAdmin: express.RequestHandler;
  /** Limiter for the public event endpoint. */
  eventLimiter?: express.RequestHandler;
  limiter?: express.RequestHandler;
  get?: typeof fsGet;
  list?: typeof fsList;
  patch?: typeof fsPatch;
  bump?: typeof fsIncrementFields;
  query?: typeof fsQueryRange;
  audit?: typeof recordAdminAudit;
  now?: () => number;
}

export const OFF_PLATFORM_STATUSES = ['PAID_AWAITING_SCHEDULING', 'SCHEDULED', 'LIVE', 'COMPLETED', 'REFUND_DUE'] as const;
export const CAMPAIGN_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;
export const BOUNTY_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED'] as const;

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const SOURCE_KINDS = new Set(['config', 'userAd', 'album', 'promo', 'onair', 'store', 'product', 'live', 'profile', 'plus', 'other']);

export function createAdPlatformRouter(deps: AdPlatformDeps) {
  const router = express.Router();
  const get = deps.get ?? fsGet;
  const list = deps.list ?? fsList;
  const patch = deps.patch ?? fsPatch;
  const bump = deps.bump ?? fsIncrementFields;
  const query = deps.query ?? fsQueryRange;
  const audit = deps.audit ?? recordAdminAudit;
  const now = deps.now ?? (() => Date.now());
  const gate = [deps.limiter ?? ((_q, _r, n) => n()), deps.authMiddleware, deps.requireAdmin];

  router.post('/api/ads/event', deps.eventLimiter ?? ((_q, _r, n) => n()), express.json({ limit: '1kb' }), async (req, res) => {
    const adId = String(req.body?.adId || '');
    const kind = req.body?.kind;
    const sourceKind = SOURCE_KINDS.has(String(req.body?.sourceKind)) ? String(req.body.sourceKind) : 'other';
    if (!ID.test(adId) || (kind !== 'impression' && kind !== 'click')) return res.status(400).json({ error: 'adId and kind are required' });
    const field = kind === 'impression' ? 'impressions' : 'clicks';
    const t = now();
    const ok = await bump(`adMetrics/${dayKey(t)}__${adId}`, { adId, day: dayKey(t), sourceKind, at: t }, { [field]: 1 });
    if (sourceKind === 'config' && (await get(`ads/${adId}`))) await bump(`ads/${adId}`, {}, { [field]: 1 });
    res.status(ok ? 204 : 202).end();
  });

  router.get('/api/admin/ads/overview', ...gate, async (_req, res) => {
    const t = now();
    const since30 = dayKey(t - 30 * 86_400_000);
    const [configs, campaigns, packages, offPlatform, bookings, bounties, wallets, boostProfiles, metrics] = await Promise.all([
      list('ads', { maxDocs: 500 }),
      list('ad_campaigns', { maxDocs: 500 }),
      list('adPackages', { maxDocs: 2000 }),
      list('offPlatformPromotions', { maxDocs: 500 }),
      list('promoBookings', { maxDocs: 1000 }),
      list('adSyncBounties', { maxDocs: 500 }),
      list('patronageWallets', { maxDocs: 2000 }),
      list('adBoostProfiles', { maxDocs: 2000 }),
      query('adMetrics', [{ field: 'day', op: 'GREATER_THAN_OR_EQUAL', value: since30 }], 5000),
    ]);

    // Daily series + per-ad rollup, from recorded events only.
    const byDay = new Map<string, { impressions: number; clicks: number }>();
    const byAd = new Map<string, { impressions: number; clicks: number; sourceKind: string }>();
    for (const m of metrics) {
      const d = byDay.get(m.data.day) || { impressions: 0, clicks: 0 };
      d.impressions += m.data.impressions || 0; d.clicks += m.data.clicks || 0; byDay.set(m.data.day, d);
      const a = byAd.get(m.data.adId) || { impressions: 0, clicks: 0, sourceKind: m.data.sourceKind || 'other' };
      a.impressions += m.data.impressions || 0; a.clicks += m.data.clicks || 0; byAd.set(m.data.adId, a);
    }
    const series: Array<{ day: string; impressions: number; clicks: number }> = [];
    for (let i = 29; i >= 0; i--) { const k = dayKey(t - i * 86_400_000); series.push({ day: k, ...(byDay.get(k) || { impressions: 0, clicks: 0 }) }); }

    const activePkgs = packages.filter(p => p.data.isActive && (p.data.expiresAt || 0) > t);
    const pkgRevenue = (ms: number) => packages.filter(p => (p.data.createdAt || 0) >= t - ms).reduce((s, p) => s + (Number(p.data.price) || 0), 0);
    const offRevenue = offPlatform.reduce((s, o) => s + (Number(o.data.price) || 0), 0);
    const walletTotals = wallets.reduce((a, w) => ({
      pendingCents: a.pendingCents + (w.data.pendingStripeBalanceCents || 0),
      lifetimeDirectCents: a.lifetimeDirectCents + (w.data.lifetimeDirectStripeCents || 0),
      lifetimeEarnedCents: a.lifetimeEarnedCents + (w.data.lifetimeEarnedCents || 0),
    }), { pendingCents: 0, lifetimeDirectCents: 0, lifetimeEarnedCents: 0 });
    const tally = (rows: Array<{ data: Record<string, any> }>, key: string) => rows.reduce<Record<string, number>>((o, r) => { const k = String(r.data[key] ?? 'UNKNOWN'); o[k] = (o[k] || 0) + 1; return o; }, {});
    const totalImpr = series.reduce((s, d) => s + d.impressions, 0);
    const totalClicks = series.reduce((s, d) => s + d.clicks, 0);

    res.json({
      generatedAt: t,
      tracking: { eventsRecorded30d: totalImpr + totalClicks, impressions30d: totalImpr, clicks30d: totalClicks, ctr30d: totalImpr ? totalClicks / totalImpr : null },
      series,
      configs: configs.map(c => ({ id: c.id, ...c.data, recorded: byAd.get(c.id) || null })),
      campaigns: campaigns.map(c => ({ id: c.id, ...c.data, recorded: byAd.get(c.id) || null })),
      topPlacements: [...byAd.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.impressions - a.impressions).slice(0, 12),
      packages: {
        active: activePkgs.length, sold30d: packages.filter(p => (p.data.createdAt || 0) >= t - 30 * 86_400_000).length,
        revenue30d: Math.round(pkgRevenue(30 * 86_400_000) * 100) / 100, revenueAllTime: Math.round(pkgRevenue(Number.MAX_SAFE_INTEGER / 2) * 100) / 100,
        byType: tally(packages, 'packageType'),
        recent: packages.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0)).slice(0, 40).map(p => ({ id: p.id, ...p.data })),
      },
      offPlatform: { revenueAllTime: Math.round(offRevenue * 100) / 100, byStatus: tally(offPlatform, 'status'), items: offPlatform.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0)).map(o => ({ id: o.id, ...o.data })) },
      bookings: { byStatus: tally(bookings, 'status'), byKind: tally(bookings, 'kind'), grossAccepted: bookings.filter(b => b.data.status === 'ACCEPTED' || b.data.status === 'PAID').reduce((s, b) => s + (Number(b.data.rate) || 0), 0), recent: bookings.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0)).slice(0, 60).map(b => ({ id: b.id, ...b.data })) },
      bounties: { byStatus: tally(bounties, 'status'), items: bounties.sort((a, b) => (b.data.createdAt || 0) - (a.data.createdAt || 0)).map(b => ({ id: b.id, ...b.data })) },
      patronage: { wallets: wallets.length, ...walletTotals },
      boost: { profiles: boostProfiles.length, avgScore: boostProfiles.length ? boostProfiles.reduce((s, b) => s + (b.data.totalBoostScore || 0), 0) / boostProfiles.length : null, top: boostProfiles.sort((a, b) => (b.data.totalBoostScore || 0) - (a.data.totalBoostScore || 0)).slice(0, 10).map(b => ({ id: b.id, ...b.data })) },
    });
  });

  // One guarded writer for every workflow action: validate, patch, audit.
  const act = (path: string, collection: string, build: (body: any) => Record<string, unknown> | string) =>
    router.post(path, ...gate, express.json({ limit: '2kb' }), async (req: any, res) => {
      const id = String(req.params.id || '');
      if (!ID.test(id)) return res.status(400).json({ error: 'bad id' });
      const fields = build(req.body || {});
      if (typeof fields === 'string') return res.status(400).json({ error: fields });
      if (!(await get(`${collection}/${id}`))) return res.status(404).json({ error: 'not found' });
      const ok = await patch(`${collection}/${id}`, { ...fields, updatedAt: now() });
      if (!ok) return res.status(502).json({ error: 'write failed' });
      await audit(req.uid, `ads.${collection}.update`, `${collection}/${id}`, fields as Record<string, unknown>);
      res.json({ ok: true });
    });

  act('/api/admin/ads/configs/:id/active', 'ads', b => typeof b.isActive === 'boolean' ? { isActive: b.isActive } : 'isActive must be true or false');
  act('/api/admin/ads/packages/:id/active', 'adPackages', b => typeof b.isActive === 'boolean' ? { isActive: b.isActive } : 'isActive must be true or false');
  act('/api/admin/ads/campaigns/:id/status', 'ad_campaigns', b => (CAMPAIGN_STATUSES as readonly string[]).includes(b.status) ? { status: b.status, isActive: b.status === 'ACTIVE' } : 'bad status');
  act('/api/admin/ads/bounties/:id/status', 'adSyncBounties', b => (BOUNTY_STATUSES as readonly string[]).includes(b.status) ? { status: b.status } : 'bad status');
  act('/api/admin/ads/off-platform/:id/status', 'offPlatformPromotions', b => (OFF_PLATFORM_STATUSES as readonly string[]).includes(b.status)
    ? { status: b.status, ...(typeof b.note === 'string' ? { adminNote: b.note.slice(0, 500) } : {}) } : 'bad status');

  return router;
}
