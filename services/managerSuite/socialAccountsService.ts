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

export const listSocialAccounts = async (): Promise<SocialAccount[]> =>
  (await call<{ accounts: SocialAccount[] }>('/api/social/accounts')).accounts;

export const disconnectSocialAccount = (id: string) =>
  call<{ ok: true }>(`/api/social/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const publishToSocial = (body: { accountIds: string[]; text: string; mediaUrls?: string[]; linkUri?: string; title?: string }) =>
  call<SocialPublishResult>('/api/social/publish', { method: 'POST', body: JSON.stringify(body) });

/**
 * Open the provider's consent screen in a popup and resolve with how many accounts were linked.
 * The popup is opened synchronously (inside the click) and pointed at the URL afterwards, so
 * popup blockers don't eat it.
 */
export async function connectSocialProvider(provider: SocialProvider): Promise<number> {
  const popup = window.open('about:blank', 'plajah-social-connect', 'width=560,height=720');
  if (!popup) throw new Error('Allow pop-ups for Plajah to connect an account.');
  let url: string;
  try {
    ({ url } = await call<{ url: string }>(`/api/social/connect/${provider}/url`));
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
