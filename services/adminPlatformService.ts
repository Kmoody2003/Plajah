/**
 * Admin platform client — thin typed wrappers over /api/admin/platform and /api/admin/ads.
 * The server decides who is an admin; this only carries the token and the shapes.
 */
import { auth } from './firebase';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in first.');
  const send = async (force: boolean) => fetch(path, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${await user.getIdToken(force)}` },
  });
  let res = await send(false);
  if (res.status === 401) res = await send(true);
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Request failed (${res.status})`);
  return res.json() as Promise<T>;
}

/** A count the server could not take is `null`; the UI shows "—", never 0. */
export interface PlatformOverview {
  generatedAt: number;
  people: { total: number | null; new24h: number | null; new7d: number | null; new30d: number | null; healthReporting24h: number | null };
  content: Record<'albums' | 'videos' | 'posts' | 'articles' | 'games' | 'photos' | 'worlds' | 'follows' | 'liveFeed', number | null>;
  signups: Array<{ label: string; count: number | null }>;
  attention: { openContentReports: number | null; errors24h: number | null; offPlatformAwaitingScheduling: number | null; promoBookingsPending: number | null; adBountiesOpen: number | null };
  ads: { activeUserAds: number | null; packageRevenue30d: number; packageRevenueAllTime: number; packagesSold30d: number };
}
export interface AuditEntry { id: string; actorUid: string; action: string; target: string; detail: string; at: number }

export const fetchPlatformOverview = () => call<PlatformOverview>('/api/admin/platform/overview');
export const fetchAuditLog = (limit = 40) => call<{ entries: AuditEntry[] }>(`/api/admin/platform/audit?limit=${limit}`).then(r => r.entries);

type Row = Record<string, any> & { id: string };
export interface AdOverview {
  generatedAt: number;
  tracking: { eventsRecorded30d: number; impressions30d: number; clicks30d: number; ctr30d: number | null };
  series: Array<{ day: string; impressions: number; clicks: number }>;
  configs: Row[];
  campaigns: Row[];
  topPlacements: Array<{ id: string; impressions: number; clicks: number; sourceKind: string }>;
  packages: { active: number; sold30d: number; revenue30d: number; revenueAllTime: number; byType: Record<string, number>; recent: Row[] };
  offPlatform: { revenueAllTime: number; byStatus: Record<string, number>; items: Row[] };
  bookings: { byStatus: Record<string, number>; byKind: Record<string, number>; grossAccepted: number; recent: Row[] };
  bounties: { byStatus: Record<string, number>; items: Row[] };
  patronage: { wallets: number; pendingCents: number; lifetimeDirectCents: number; lifetimeEarnedCents: number };
  boost: { profiles: number; avgScore: number | null; top: Row[] };
}
export const fetchAdOverview = () => call<AdOverview>('/api/admin/ads/overview');

const post = (path: string, body: unknown) => call<{ ok: boolean }>(path, { method: 'POST', body: JSON.stringify(body) });
export const setAdConfigActive = (id: string, isActive: boolean) => post(`/api/admin/ads/configs/${id}/active`, { isActive });
export const setAdPackageActive = (id: string, isActive: boolean) => post(`/api/admin/ads/packages/${id}/active`, { isActive });
export const setCampaignStatus = (id: string, status: 'ACTIVE' | 'PAUSED' | 'COMPLETED') => post(`/api/admin/ads/campaigns/${id}/status`, { status });
export const setBountyStatus = (id: string, status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED') => post(`/api/admin/ads/bounties/${id}/status`, { status });
export const setOffPlatformStatus = (id: string, status: string, note?: string) => post(`/api/admin/ads/off-platform/${id}/status`, { status, note });
