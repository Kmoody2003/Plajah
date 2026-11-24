import React from 'react';
import { createRoot } from 'react-dom/client';
import '/index.css';
import { auth } from './services/firebase';
import { ADMIN_NAV } from './components/AdminDashboard';
import AdminOverview from './components/admin/AdminOverview';
import AdminAdPlatform from './components/admin/AdminAdPlatform';

// PREVIEW ONLY. Sample data for the System Admin UI so it can be looked at without an admin login.
// Nothing here touches the database: /api/admin/* and /api/ads/* are answered in the browser.
try { Object.defineProperty(auth, 'currentUser', { value: { uid: 'lab-admin', getIdToken: async () => 'lab', _stopProactiveRefresh() {}, _startProactiveRefresh() {} }, configurable: true }); } catch { /* */ }

const DAY = 86_400_000, now = Date.now();
const series = Array.from({ length: 30 }, (_, i) => { const impressions = 400 + Math.round(180 * Math.sin(i / 3) + i * 14); return { day: new Date(now - (29 - i) * DAY).toISOString().slice(0, 10), impressions, clicks: Math.round(impressions * 0.031) }; });
const overview = {
  generatedAt: now,
  people: { total: 1284, new24h: 11, new7d: 73, new30d: 296, healthReporting24h: 142 },
  content: { albums: 612, videos: 1480, posts: 9210, articles: 134, games: 41, photos: 3302, worlds: 27, follows: 18840, liveFeed: 19 },
  signups: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map((label, i) => ({ label, count: [88, 120, 174, 211, 268, 296][i] })),
  attention: { openContentReports: 4, errors24h: 17, offPlatformAwaitingScheduling: 2, promoBookingsPending: 3, adBountiesOpen: 1 },
  ads: { activeUserAds: 38, packageRevenue30d: 164.89, packageRevenueAllTime: 612.4, packagesSold30d: 12 },
};
const ads = {
  generatedAt: now,
  tracking: { eventsRecorded30d: series.reduce((s, d) => s + d.impressions + d.clicks, 0), impressions30d: series.reduce((s, d) => s + d.impressions, 0), clicks30d: series.reduce((s, d) => s + d.clicks, 0), ctr30d: 0.031 },
  series,
  configs: [
    { id: 'ad_1', title: 'Holiday Vinyl Drop', placement: 'SIDEBAR', isActive: true, impressions: 5120, clicks: 163, imageUrl: '' },
    { id: 'ad_2', title: 'Plajah+ Founders', placement: 'BANNER', isActive: false, impressions: 880, clicks: 12, imageUrl: '' },
  ],
  campaigns: [
    { id: 'c1', title: 'Winter Sampler', type: 'USER_PROMOTION', budget: 250, probability: 0.6, status: 'ACTIVE', recorded: { impressions: 2210, clicks: 71 } },
    { id: 'c2', title: 'Partner: Detroit Jazz Fest', type: 'PARTNER', budget: 500, probability: 0.3, status: 'PAUSED', recorded: { impressions: 940, clicks: 22 } },
  ],
  topPlacements: [{ id: 'ad_1', impressions: 5120, clicks: 163, sourceKind: 'config' }, { id: 'horror-classics-30s', impressions: 3010, clicks: 44, sourceKind: 'promo' }, { id: 'onair-show', impressions: 2480, clicks: 90, sourceKind: 'onair' }],
  packages: { active: 5, sold30d: 12, revenue30d: 164.89, revenueAllTime: 612.4, byType: { BASIC: 21, FEATURED: 9, PREMIUM: 4, MAXIMUM: 2 }, recent: [
    { id: 'p1', userId: 'u_8f2a91c3d4', packageType: 'PREMIUM', price: 14.99, createdAt: now - 2 * DAY, expiresAt: now + 19 * DAY, isActive: true },
    { id: 'p2', userId: 'u_11be77aa02', packageType: 'BASIC', price: 4.99, createdAt: now - 9 * DAY, expiresAt: now - 2 * DAY, isActive: true },
  ] },
  offPlatform: { revenueAllTime: 298, byStatus: { PAID_AWAITING_SCHEDULING: 2, SCHEDULED: 1, LIVE: 1 }, items: [
    { id: 'o1', tier: 'PREMIUM', price: 100, status: 'PAID_AWAITING_SCHEDULING', createdAt: now - DAY, userId: 'u_c0ffee1234' },
    { id: 'o2', tier: 'STANDARD', price: 49, status: 'SCHEDULED', createdAt: now - 4 * DAY, userId: 'u_5522aabb99', adminNote: 'Starts Dec 1' },
  ] },
  bookings: { byStatus: { PENDING: 3, ACCEPTED: 4, PAID: 2, DECLINED: 1 }, byKind: { RADIO_AD: 4, FAST_AD: 3, CROSS_PROMO: 3 }, grossAccepted: 410, recent: [
    { id: 'b1', createdAt: now - DAY, businessName: 'Motor City Coffee', creatorName: 'DJ Hollis', kind: 'RADIO_AD', rate: 60, status: 'PENDING' },
  ] },
  bounties: { byStatus: { OPEN: 1, IN_PROGRESS: 1 }, items: [{ id: 'bn1', title: 'Sync our spring spot', sponsorName: 'Eastside Bikes', upfrontBountyCents: 25000, adSpendRoyaltyPct: 10, status: 'OPEN', createdAt: now - 3 * DAY }] },
  patronage: { wallets: 19, pendingCents: 8420, lifetimeDirectCents: 61200, lifetimeEarnedCents: 69620 },
  boost: { profiles: 64, avgScore: 22.4, top: [{ id: 'u_8f2a91c3d4aa', totalBoostScore: 71.2, subscriptionTierBoost: 30, activeAdPackageBoost: 4, activityScore: 88 }] },
};
const audit = { entries: [
  { id: 'a1', actorUid: 'lab-admin', action: 'ads.offPlatformPromotions.update', target: 'offPlatformPromotions/o2', detail: '{}', at: now - 3_600_000 },
  { id: 'a2', actorUid: 'lab-admin', action: 'ads.ad_campaigns.update', target: 'ad_campaigns/c2', detail: '{}', at: now - 9_000_000 },
] };
const realFetch = window.fetch.bind(window);
window.fetch = ((input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  if (url.startsWith('/api/admin/platform/overview')) return json(overview);
  if (url.startsWith('/api/admin/platform/audit')) return json(audit);
  if (url.startsWith('/api/admin/ads/overview')) return json(ads);
  if (url.startsWith('/api/admin/ads/')) return json({ ok: true });
  if (url.startsWith('/api/admin/key-rotation')) return json({ keys: [], worst: 'ok' });
  return realFetch(input, init);
}) as typeof fetch;

const Lab: React.FC = () => {
  const [tab, setTab] = React.useState(new URLSearchParams(location.search).get('tab') || 'OVERVIEW');
  const [filter, setFilter] = React.useState('');
  return (
    <div className="h-screen bg-[var(--bg-color)] text-white flex flex-row overflow-hidden">
      <aside className="w-72 shrink-0 border-r border-white/5 flex flex-col min-h-0 p-6 bg-black/40">
        <div className="mb-6"><h2 className="text-lg font-black uppercase text-white">System Admin</h2><p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-500">Root Access</p></div>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a section…" className="mb-4 w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[11px] text-white placeholder-white/30 outline-none" />
        <nav className="flex-1 min-h-0 overflow-y-auto space-y-5">
          {ADMIN_NAV.map(g => { const items = filter ? g.items.filter(i => i.label.toLowerCase().includes(filter.toLowerCase())) : g.items; if (!items.length) return null; return (
            <div key={g.title} className="space-y-1"><p className="px-4 pb-1 text-[9px] font-black uppercase tracking-[0.3em] text-white/25">{g.title}</p>
              {items.map(it => <button key={it.id} onClick={() => setTab(it.id)} className={'w-full flex items-center gap-3 px-4 py-3 rounded-2xl ' + (tab === it.id ? 'bg-white text-black' : 'text-white/40 hover:text-white hover:bg-white/5')}><it.icon size={16} /><span className="text-[10px] font-black uppercase tracking-widest text-left">{it.label}</span></button>)}
            </div>); })}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto p-8 lg:p-12"><div className="max-w-6xl mx-auto">
        <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-amber-400">Preview with sample data. Not connected to the database.</p>
        {tab === 'OVERVIEW' && <AdminOverview onNavigate={setTab} />}
        {tab === 'ADS' && <AdminAdPlatform />}
        {tab !== 'OVERVIEW' && tab !== 'ADS' && <p className="text-white/40 text-sm">This section is unchanged and not part of the preview.</p>}
      </div></main>
    </div>
  );
};
createRoot(document.getElementById('root')!).render(<Lab />);
