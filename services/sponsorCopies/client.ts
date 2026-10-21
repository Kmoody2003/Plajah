// Browser side of sponsored + gift copies (server: routes/sponsorCopies.ts).
import { auth } from '../backendService';
import type { PoolMode, PoolRecipient, SponsorAs } from './model';

export interface PublicPool {
  poolId: string; bookId: string; title: string; author: string; cover: string;
  sponsorName: string; sponsorKind: 'self' | 'org' | 'business'; message: string;
  mode: PoolMode; quantity: number; claimed: number; left: number;
  status: 'PENDING_PAYMENT' | 'ACTIVE' | 'EXHAUSTED' | 'CLOSED'; line: string;
  /** Sponsor only. */
  sponsor?: {
    codes: Array<{ code: string; link: string; claimed: boolean; recipient: PoolRecipient | null }>;
    shareLink: string; unitPriceCents: number; refundableCents: number;
  };
  /** DIRECT pools: true when the signed-in viewer is one of the named recipients. */
  forYou?: boolean;
  /** Code preview only. */
  code?: string; codeUsed?: boolean;
}

async function call<T>(path: string, init: RequestInit & { auth?: 'required' | 'optional' } = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  if (init.auth === 'required' && !token) throw Object.assign(new Error('Sign in to continue'), { code: 'SIGN_IN' });
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data?.error || `Request failed (HTTP ${res.status})`), { data, status: res.status });
  return data as T;
}

/** Start a sponsor purchase. Redirects to Stripe; the author's own book activates at once and returns the pool. */
export async function sponsorCopies(req: { bookId: string; mode: PoolMode; quantity: number; recipients?: PoolRecipient[]; message?: string; as?: SponsorAs; showOnBookPage?: boolean }): Promise<{ poolId: string; activated?: boolean }> {
  const r = await call<{ url?: string; poolId: string; activated?: boolean }>('/api/copies/checkout', { method: 'POST', body: JSON.stringify(req), auth: 'required' });
  if (r.url) { window.location.href = r.url; }
  return r;
}

export const fetchPool = (poolId: string) => call<PublicPool>(`/api/copies/pool/${encodeURIComponent(poolId)}`);
export const previewCode = (code: string) => call<PublicPool>(`/api/copies/code/${encodeURIComponent(code)}`);
export const claimCopy = (by: { code?: string; poolId?: string }) =>
  call<{ ok: true; bookId: string; title: string; from: string }>('/api/copies/claim', { method: 'POST', body: JSON.stringify(by), auth: 'required' });
export const cancelPool = (poolId: string) =>
  call<{ ok: true; refundedSeats: number; refundedCents: number }>(`/api/copies/pool/${encodeURIComponent(poolId)}/cancel`, { method: 'POST', body: '{}', auth: 'required' });
export const fetchMyPools = () => call<{ pools: PublicPool[] }>('/api/copies/mine', { auth: 'required' }).then(r => r.pools);
export const fetchBookGiveaways = (bookId: string) => call<{ pools: PublicPool[] }>(`/api/copies/book/${encodeURIComponent(bookId)}`).then(r => r.pools);

/** Opens the claim screen from anywhere (deep links, notifications, book pages). */
export const OPEN_CLAIM_EVENT = 'OPEN_COPY_CLAIM';
export const openClaim = (detail: { code?: string; poolId?: string }) => window.dispatchEvent(new CustomEvent(OPEN_CLAIM_EVENT, { detail }));
/** Opens the sponsor dialog for a book. */
export const OPEN_SPONSOR_EVENT = 'OPEN_SPONSOR_COPIES';
export const openSponsor = (detail: { book: { id: string; title: string; price?: number; ownerId?: string; coverImage?: string; artist?: string } }) => window.dispatchEvent(new CustomEvent(OPEN_SPONSOR_EVENT, { detail }));
/** Opens "My gifts" (pools I sponsored). */
export const OPEN_MY_GIFTS_EVENT = 'OPEN_MY_GIFTS';
