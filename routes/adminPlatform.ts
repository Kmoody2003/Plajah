// Admin → platform metrics (real numbers) and the admin action log.
//
// GET /api/admin/platform/overview   true counts from the database (server-side count aggregations,
//                                    not capped client reads), work queues, ad revenue
// GET /api/admin/platform/audit      the most recent admin actions
//
// Platform admins only. Every figure is either counted from Firestore or reported as `null`
// ("could not be measured") — a failed count never shows up as 0, and nothing is simulated.
import express from 'express';
import { fsCount, fsCreate, fsQueryRange, fsList, type CountFilter } from '../services/firebaseAdminRest';

export interface AdminPlatformDeps {
  authMiddleware: express.RequestHandler;
  requireAdmin: express.RequestHandler;
  limiter?: express.RequestHandler;
  count?: (collection: string, filters?: CountFilter[]) => Promise<number | null>;
  query?: typeof fsQueryRange;
  list?: typeof fsList;
  create?: (collection: string, data: Record<string, unknown>) => Promise<string | null>;
  now?: () => number;
}

const DAY = 86_400_000;
const AUDIT = 'adminAuditLog';

/** Append one admin action to the audit log. Never throws; the action it records must not fail on it. */
export async function recordAdminAudit(
  actorUid: string,
  action: string,
  target: string,
  detail: Record<string, unknown> = {},
  create: AdminPlatformDeps['create'] = fsCreate,
  now: () => number = Date.now,
): Promise<void> {
  try {
    await create!(AUDIT, { actorUid, action, target, detail: JSON.stringify(detail).slice(0, 1500), at: now() });
  } catch { /* the log is best effort */ }
}

export function createAdminPlatformRouter(deps: AdminPlatformDeps) {
  const router = express.Router();
  const count = deps.count ?? fsCount;
  const query = deps.query ?? fsQueryRange;
  const list = deps.list ?? fsList;
  const now = deps.now ?? (() => Date.now());
  const gate = [deps.limiter ?? ((_q, _r, n) => n()), deps.authMiddleware, deps.requireAdmin];

  router.get('/overview', ...gate, async (_req, res) => {
    const t = now();
    const since = (ms: number): CountFilter[] => [{ field: 'createdAt', op: 'GREATER_THAN_OR_EQUAL', value: t - ms }];

    // Month buckets for the signup chart (last 6 calendar months, local server time is fine for bucketing).
    const months: Array<{ label: string; start: number; end: number }> = [];
    const d0 = new Date(t);
    for (let i = 5; i >= 0; i--) {
      const s = new Date(d0.getFullYear(), d0.getMonth() - i, 1);
      const e = new Date(d0.getFullYear(), d0.getMonth() - i + 1, 1);
      months.push({ label: s.toLocaleString('en-US', { month: 'short', year: '2-digit' }), start: s.getTime(), end: e.getTime() });
    }

    const [
      users, users24h, users7d, users30d,
      albums, videos, posts, articles, games, photos, worlds, follows, liveFeed,
      healthReporting24h, openReports, errors24h,
      offPlatformQueue, bookingsPending, bountiesOpen, activeUserAds,
    ] = await Promise.all([
      count('users'), count('users', since(DAY)), count('users', since(7 * DAY)), count('users', since(30 * DAY)),
      count('albums'), count('videos'), count('posts'), count('articles'), count('games'), count('photos'), count('worlds'), count('follows'), count('liveFeed'),
      count('userHealth', [{ field: 'updatedAt', op: 'GREATER_THAN_OR_EQUAL', value: t - DAY }]),
      count('content_reports', [{ field: 'status', value: 'OPEN' }]),
      count('errorReports', [{ field: 'createdAt', op: 'GREATER_THAN_OR_EQUAL', value: t - DAY }]),
      count('offPlatformPromotions', [{ field: 'status', value: 'PAID_AWAITING_SCHEDULING' }]),
      count('promoBookings', [{ field: 'status', value: 'PENDING' }]),
      count('adSyncBounties', [{ field: 'status', value: 'OPEN' }]),
      count('userAds', [{ field: 'isActive', value: true }]),
    ]);

    const signups = await Promise.all(months.map(async m => ({
      label: m.label,
      count: await count('users', [
        { field: 'createdAt', op: 'GREATER_THAN_OR_EQUAL', value: m.start },
        { field: 'createdAt', op: 'LESS_THAN', value: m.end },
      ]),
    })));

    // Ad package revenue, summed from the paid rows themselves.
    const pkgs = await list('adPackages', { maxDocs: 2000 });
    const paidSince = (ms: number) => pkgs.filter(p => (p.data.createdAt || 0) >= t - ms).reduce((s, p) => s + (Number(p.data.price) || 0), 0);

    res.json({
      generatedAt: t,
      people: { total: users, new24h: users24h, new7d: users7d, new30d: users30d, healthReporting24h },
      content: { albums, videos, posts, articles, games, photos, worlds, follows, liveFeed },
      signups,
      attention: { openContentReports: openReports, errors24h, offPlatformAwaitingScheduling: offPlatformQueue, promoBookingsPending: bookingsPending, adBountiesOpen: bountiesOpen },
      ads: { activeUserAds, packageRevenue30d: Math.round(paidSince(30 * DAY) * 100) / 100, packageRevenueAllTime: Math.round(paidSince(Number.MAX_SAFE_INTEGER / 2) * 100) / 100, packagesSold30d: pkgs.filter(p => (p.data.createdAt || 0) >= t - 30 * DAY).length },
    });
  });

  router.get('/audit', ...gate, async (req, res) => {
    const lim = Math.min(Math.max(parseInt(String(req.query.limit || '40'), 10) || 40, 1), 200);
    const rows = await query(AUDIT, [], lim, { field: 'at', direction: 'DESCENDING' });
    res.json({ entries: rows.map(r => ({ id: r.id, ...r.data })) });
  });

  return router;
}
