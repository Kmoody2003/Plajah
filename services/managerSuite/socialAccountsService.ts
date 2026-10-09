// ─── Manager Suite — commercial social accounts (Meta / X / LinkedIn) ────────
// Client for routes/socialConnect.ts. Credentials never reach the browser: this
// only lists account METADATA, opens the OAuth popup, and asks the server to publish.

import { getAuth } from 'firebase/auth';
import type { SuiteNetwork } from './networks';

export type SocialProvider = 'meta' | 'x' | 'linkedin';

export interface SocialAccount {
  id: string;
  network: SuiteNetwork;
  provider: SocialProvider;
  handle: string;
  displayName: string;
  avatarUrl?: string;
  profileUrl?: string;
  connectedAt: number;
  status: 'ok' | 'reauth';
}

/** Which identity's credential store to use. Omitted = the signed-in user's own (CREATOR). */
export interface SocialScope { kind: 'CREATOR' | 'BUSINESS' | 'ORG'; id: string }
const qs = (scope?: SocialScope) =>
  scope && scope.kind !== 'CREATOR' && scope.id ? `scopeKind=${scope.kind}&scopeId=${encodeURIComponent(scope.id)}` : '';

export interface PostInsight { id: string; text: string; url?: string; createdAt: number; likes: number; comments: number; shares: number; views?: number; reach?: number }
export interface HistoryPoint { day: string; followers?: number; reach?: number; views?: number }
export interface AccountInsights {
  accountId: string; network: string; handle: string;
  followers?: number; following?: number; postCount?: number;
  reach7d?: number; views7d?: number; engaged7d?: number;
  reachStatus?: 'ok' | 'needs_permission' | 'unavailable'; reachNote?: string;
  history?: HistoryPoint[];
  recent: PostInsight[];
  totals: { likes: number; comments: number; shares: number; views: number; reach: number };
  growth?: { delta: number; days: number };
  fetchedAt: number;
  unavailable?: string;
  error?: string;
}

export interface SocialPublishResult {
  succeeded: { accountId: string; network: SuiteNetwork; postUrl: string }[];
  failed: { accountId: string; network: string; error: string }[];
}

/** StudioView platform ids → connect provider. Meta covers Instagram + Facebook in one login. */
export const PROVIDER_FOR_PLATFORM: Record<string, SocialProvider> = {
  twitter: 'x', x: 'x', facebook: 'meta', instagram: 'meta', linkedin: 'linkedin',
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Sign in first.');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json as T;
}

export const listSocialAccounts = async (scope?: SocialScope): Promise<SocialAccount[]> =>
  (await call<{ accounts: SocialAccount[] }>(`/api/social/accounts?${qs(scope)}`)).accounts;

/** Same list plus what the caller may do with it (connect/disconnect needs owner/admin; staff can publish). */
export const listSocialAccountsWithAccess = (scope?: SocialScope) =>
  call<{ accounts: SocialAccount[]; canManage: boolean; canPost: boolean }>(`/api/social/accounts?${qs(scope)}`);

export const disconnectSocialAccount = (id: string, scope?: SocialScope) =>
  call<{ ok: true }>(`/api/social/accounts/${encodeURIComponent(id)}?${qs(scope)}`, { method: 'DELETE' });

export const publishToSocial = (body: { accountIds: string[]; text: string; mediaUrls?: string[]; linkUri?: string; title?: string }, scope?: SocialScope) =>
  call<SocialPublishResult>('/api/social/publish', {
    method: 'POST',
    body: JSON.stringify({ ...body, ...(scope && scope.kind !== 'CREATOR' ? { scopeKind: scope.kind, scopeId: scope.id } : {}) }),
  });

export interface InboxItem {
  id: string; accountId: string; network: 'facebook' | 'instagram'; handle: string;
  postId: string; postText: string; postUrl?: string;
  author: string; text: string; createdAt: number; likes: number;
  replies: { author: string; text: string; createdAt: number }[];
}
export interface InboxAccountStatus { accountId: string; network: string; handle: string; status: string; note?: string }
export interface ApprovalPost {
  id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; text: string; mediaUrls: string[]; targetAccountIds: string[];
  alsoPostToPlajah?: boolean; shareToX?: boolean; scheduledAt?: number; submittedBy: string; submittedAt: number; note?: string;
}
export type SubmittablePost = {
  text: string; mediaUrls?: string[]; targetAccountIds: string[]; alsoPostToPlajah?: boolean; shareToX?: boolean;
  linkUri?: string; linkTitle?: string; linkDescription?: string; scheduledAt?: number; timezone?: string;
};
const body = (scope: SocialScope | undefined, extra: object) => JSON.stringify({ ...extra, ...(scope && scope.kind !== 'CREATOR' ? { scopeKind: scope.kind, scopeId: scope.id } : {}) });

export const fetchInbox = (scope?: SocialScope) => call<{ items: InboxItem[]; accounts: InboxAccountStatus[] }>(`/api/social/inbox?${qs(scope)}`);
export const replyToComment = (accountId: string, commentId: string, text: string, scope?: SocialScope) =>
  call<{ ok: true }>('/api/social/inbox/reply', { method: 'POST', body: body(scope, { accountId, commentId, text }) });

export const fetchApprovalSettings = (scope?: SocialScope) => call<{ requireApproval: boolean; canManage: boolean }>(`/api/social/approvals/settings?${qs(scope)}`);
export const saveApprovalSettings = (requireApproval: boolean, scope?: SocialScope) =>
  call<{ requireApproval: boolean }>('/api/social/approvals/settings', { method: 'PUT', body: body(scope, { requireApproval }) });
export const submitForApproval = (post: SubmittablePost, scope?: SocialScope) =>
  call<{ id: string; status: string }>('/api/social/approvals/submit', { method: 'POST', body: body(scope, { post }) });
export const listApprovals = (scope?: SocialScope) => call<{ approvals: ApprovalPost[]; canManage: boolean }>(`/api/social/approvals?${qs(scope)}`);
export const decideApproval = (id: string, decision: 'approve' | 'reject', note: string | undefined, scope?: SocialScope) =>
  call<{ status: string }>(`/api/social/approvals/${encodeURIComponent(id)}/decide`, { method: 'POST', body: body(scope, { decision, note }) });

export const fetchSocialAnalytics = (scope?: SocialScope, force = false) =>
  call<{ accounts: AccountInsights[]; fetchedAt: number }>(`/api/social/analytics?${[qs(scope), force ? 'force=1' : ''].filter(Boolean).join('&')}`);

/**
 * Open the provider's consent screen in a popup and resolve with how many accounts were linked.
 * The popup is opened synchronously (inside the click) and pointed at the URL afterwards, so
 * popup blockers don't eat it.
 */
export async function connectSocialProvider(provider: SocialProvider, scope?: SocialScope): Promise<number> {
  const popup = window.open('about:blank', 'plajah-social-connect', 'width=560,height=720');
  if (!popup) throw new Error('Allow pop-ups for Plajah to connect an account.');
  let url: string;
  try {
    ({ url } = await call<{ url: string }>(`/api/social/connect/${provider}/url?${qs(scope)}`));
  } catch (e) {
    popup.close();
    throw e;
  }
  popup.location.href = url;
  return new Promise<number>((resolve, reject) => {
    const done = (fn: () => void) => { window.removeEventListener('message', onMsg); clearInterval(poll); fn(); };
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.data?.type !== 'plajah-social-connect') return;
      done(() => ev.data.ok ? resolve(Number(ev.data.count) || 1) : reject(new Error(ev.data.error || 'Connection failed.')));
    };
    window.addEventListener('message', onMsg);
    const poll = setInterval(() => { if (popup.closed) done(() => reject(new Error('Connection window was closed.'))); }, 800);
  });
}
