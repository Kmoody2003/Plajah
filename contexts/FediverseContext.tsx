import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged, getIdToken } from 'firebase/auth';
import { auth } from '../services/firebase';
import type {
  FediverseAccount, FediversePost, FediverseNotification,
  FediverseProtocol, CreatePostOptions,
} from '../services/fediverse/types';
import {
  removeFediverseAccount,
  connectThreads,
  getUnifiedNotifications,
  type FediverseFeedResult, type CrossPostResult,
} from '../services/fediverse/service';
import type { BroadcastPayload, BroadcastResult } from '../services/fediverse/broadcast';

// ─── Server fetch helper ───────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return getIdToken(user);
}

async function serverFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function serverJson<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await serverFetch(path, token, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error: string };
    throw new Error(err.error);
  }
  return res.json() as Promise<T>;
}

// ─── Context shape ─────────────────────────────────────────────────────────────

interface FediverseContextValue {
  accounts: FediverseAccount[];
  feed: FediversePost[];
  notifications: FediverseNotification[];
  feedErrors: FediverseFeedResult['errors'];
  isLoadingAccounts: boolean;
  isLoadingFeed: boolean;
  isCrossPosting: boolean;

  connectMastodonOAuth: (instanceUrl: string) => Promise<void>;
  connectMastodonToken: (instanceUrl: string, token: string) => Promise<FediverseAccount>;
  connectBlueskyAccount: (handle: string, appPassword: string) => Promise<FediverseAccount>;
  connectThreadsAccount: (token: string) => Promise<FediverseAccount>;
  disconnectAccount: (accountId: string) => Promise<void>;

  refreshFeed: () => Promise<void>;
  refreshNotifications: () => Promise<void>;

  crossPost: (content: string, options?: CreatePostOptions, targetAccountIds?: string[]) => Promise<CrossPostResult>;
  broadcast: (payload: BroadcastPayload, targetAccountIds?: string[]) => Promise<BroadcastResult>;
  toggleLike: (post: FediversePost) => Promise<void>;
  toggleRepost: (post: FediversePost) => Promise<void>;

  accountsByProtocol: (protocol: FediverseProtocol) => FediverseAccount[];
  hasProtocol: (protocol: FediverseProtocol) => boolean;
}

const FediverseContext = createContext<FediverseContextValue | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const FediverseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [uid, setUid]                     = useState<string | null>(null);
  const [accounts, setAccounts]           = useState<FediverseAccount[]>([]);
  const [feed, setFeed]                   = useState<FediversePost[]>([]);
  const [feedErrors, setFeedErrors]       = useState<FediverseFeedResult['errors']>([]);
  const [notifications, setNotifications] = useState<FediverseNotification[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingFeed, setIsLoadingFeed]         = useState(false);
  const [isCrossPosting, setIsCrossPosting]       = useState(false);
  const feedRefreshRef = useRef(false);

  // ─── Load accounts via server (handles encrypted credentials) ───────────────

  const loadAccounts = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    setIsLoadingAccounts(true);
    try {
      const data = await serverJson<{ accounts: FediverseAccount[] }>('/api/fediverse/accounts', token);
      setAccounts(data.accounts);
    } catch (err) {
      console.error('[Fediverse] Failed to load accounts:', err);
      setAccounts([]);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  // ─── Auth listener ──────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        setUid(user.uid);
        loadAccounts();
      } else {
        setUid(null);
        setAccounts([]);
        setFeed([]);
        setNotifications([]);
        setIsLoadingAccounts(false);
      }
    });
    return unsub;
  }, [loadAccounts]);

  // ─── Auto-refresh feed when accounts change ─────────────────────────────────

  useEffect(() => {
    if (!accounts.length) return;
    refreshFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map(a => a.id).join(',')]);

  // ─── Timeline via server (server decrypts credentials and fetches) ───────────

  const refreshFeed = useCallback(async () => {
    if (feedRefreshRef.current) return;
    const token = await getToken();
    if (!token) return;
    feedRefreshRef.current = true;
    setIsLoadingFeed(true);
    try {
      const data = await serverJson<{ posts: FediversePost[]; errors: FediverseFeedResult['errors'] }>(
        '/api/fediverse/timeline', token
      );
      setFeed(data.posts ?? []);
      setFeedErrors(data.errors ?? []);
    } catch (err) {
      console.error('[Fediverse] Timeline fetch failed:', err);
    } finally {
      setIsLoadingFeed(false);
      feedRefreshRef.current = false;
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!accounts.length) return;
    try {
      const notifs = await getUnifiedNotifications(accounts);
      setNotifications(notifs);
    } catch (err) {
      console.error('[Fediverse] Notifications failed:', err);
    }
  }, [accounts]);

  // ─── Connect accounts ────────────────────────────────────────────────────────

  const connectMastodonOAuth = useCallback(async (instanceUrl: string) => {
    if (!uid) throw new Error('Not authenticated');
    const token = await getToken();
    if (!token) throw new Error('No Firebase token');

    const { authUrl, state } = await serverJson<{ authUrl: string; state: string }>(
      '/api/fediverse/mastodon/authorize', token,
      { method: 'POST', body: JSON.stringify({ instanceUrl }) }
    );

    await new Promise<void>((resolve, reject) => {
      const popup = window.open(authUrl, 'mastodon-auth', 'width=620,height=760,resizable=yes');
      if (!popup) { reject(new Error('Popup blocked — allow popups for this site')); return; }

      const timeout = setTimeout(() => { reject(new Error('OAuth timed out')); cleanup(); }, 3 * 60 * 1000);

      function cleanup() {
        clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
      }

      async function onMessage(e: MessageEvent) {
        if (e.origin !== window.location.origin) return;
        if (e.data?.type === 'FEDIVERSE_AUTH_SUCCESS') {
          cleanup();
          try {
            const { account } = await serverJson<{ account: FediverseAccount }>(
              '/api/fediverse/mastodon/connect', token,
              { method: 'POST', body: JSON.stringify({ code: e.data.code, state: e.data.state, instanceUrl }) }
            );
            setAccounts(prev => prev.some(a => a.id === account.id) ? prev.map(a => a.id === account.id ? account : a) : [...prev, account]);
            resolve();
          } catch (err) { reject(err); }
        } else if (e.data?.type === 'FEDIVERSE_AUTH_ERROR') {
          cleanup();
          reject(new Error(String(e.data.error ?? 'OAuth failed')));
        }
      }

      window.addEventListener('message', onMessage);
    });
  }, [uid]);

  const connectMastodonToken = useCallback(async (instanceUrl: string, accessToken: string) => {
    if (!uid) throw new Error('Not authenticated');
    const { connectMastodon } = await import('../services/fediverse/service');
    const account = await connectMastodon(uid, instanceUrl, accessToken);
    setAccounts(prev => [...prev, account]);
    return account;
  }, [uid]);

  const connectBlueskyAccount = useCallback(async (handle: string, appPassword: string) => {
    if (!uid) throw new Error('Not authenticated');
    const token = await getToken();
    if (!token) throw new Error('No Firebase token');
    const { account } = await serverJson<{ account: FediverseAccount }>(
      '/api/fediverse/bluesky/connect', token,
      { method: 'POST', body: JSON.stringify({ handle, appPassword }) }
    );
    setAccounts(prev => [...prev, account]);
    return account;
  }, [uid]);

  const connectThreadsAccount = useCallback(async (tkn: string) => {
    if (!uid) throw new Error('Not authenticated');
    const account = await connectThreads(uid, tkn);
    setAccounts(prev => [...prev, account]);
    return account;
  }, [uid]);

  const disconnectAccount = useCallback(async (accountId: string) => {
    if (!uid) return;
    const token = await getToken();
    if (token) {
      try {
        await serverFetch(`/api/fediverse/accounts/${accountId}`, token, { method: 'DELETE' });
      } catch {
        await removeFediverseAccount(uid, accountId);
      }
    } else {
      await removeFediverseAccount(uid, accountId);
    }
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    setFeed(prev => prev.filter(p => p.accountId !== accountId));
  }, [uid]);

  // ─── Post actions (routed through server — credentials stay server-side) ─────

  const crossPost = useCallback(async (
    content: string,
    options?: CreatePostOptions,
    targetAccountIds?: string[],
  ): Promise<CrossPostResult> => {
    setIsCrossPosting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      const result = await serverJson<CrossPostResult>(
        '/api/fediverse/broadcast', token,
        { method: 'POST', body: JSON.stringify({ text: content, targetAccountIds }) }
      );
      if (result.succeeded.length) {
        // Refresh feed to show newly created posts
        setTimeout(refreshFeed, 2000);
      }
      return result;
    } finally {
      setIsCrossPosting(false);
    }
  }, [refreshFeed]);

  const broadcast = useCallback(async (payload: BroadcastPayload, targetAccountIds?: string[]): Promise<BroadcastResult> => {
    setIsCrossPosting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      return serverJson<BroadcastResult>('/api/fediverse/broadcast', token, {
        method: 'POST',
        body: JSON.stringify({ ...payload, targetAccountIds }),
      });
    } finally {
      setIsCrossPosting(false);
    }
  }, []);

  const toggleLike = useCallback(async (post: FediversePost) => {
    const optimistic = (p: FediversePost) => p.id === post.id && p.protocol === post.protocol
      ? { ...p, isLiked: !p.isLiked, likeCount: p.likeCount + (p.isLiked ? -1 : 1) }
      : p;
    setFeed(prev => prev.map(optimistic));
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await serverJson('/api/fediverse/posts/action', token, {
        method: 'POST',
        body: JSON.stringify({
          action: post.isLiked ? 'unlike' : 'like',
          post,
          accountId: post.accountId,
        }),
      });
    } catch (err) {
      setFeed(prev => prev.map(p => p.id === post.id && p.protocol === post.protocol ? post : p));
      throw err;
    }
  }, []);

  const toggleRepost = useCallback(async (post: FediversePost) => {
    const optimistic = (p: FediversePost) => p.id === post.id && p.protocol === post.protocol
      ? { ...p, isReposted: !p.isReposted, repostCount: p.repostCount + (p.isReposted ? -1 : 1) }
      : p;
    setFeed(prev => prev.map(optimistic));
    try {
      const token = await getToken();
      if (!token) throw new Error('Not authenticated');
      await serverJson('/api/fediverse/posts/action', token, {
        method: 'POST',
        body: JSON.stringify({
          action: post.isReposted ? 'unrepost' : 'repost',
          post,
          accountId: post.accountId,
        }),
      });
    } catch (err) {
      setFeed(prev => prev.map(p => p.id === post.id && p.protocol === post.protocol ? post : p));
      throw err;
    }
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const accountsByProtocol = useCallback((protocol: FediverseProtocol) =>
    accounts.filter(a => a.protocol === protocol), [accounts]);

  const hasProtocol = useCallback((protocol: FediverseProtocol) =>
    accounts.some(a => a.protocol === protocol && a.isActive), [accounts]);

  const value: FediverseContextValue = {
    accounts, feed, notifications, feedErrors,
    isLoadingAccounts, isLoadingFeed, isCrossPosting,
    connectMastodonOAuth, connectMastodonToken,
    connectBlueskyAccount, connectThreadsAccount, disconnectAccount,
    refreshFeed, refreshNotifications,
    crossPost, broadcast, toggleLike, toggleRepost,
    accountsByProtocol, hasProtocol,
  };

  return (
    <FediverseContext.Provider value={value}>
      {children}
    </FediverseContext.Provider>
  );
};

export function useFediverse(): FediverseContextValue {
  const ctx = useContext(FediverseContext);
  if (!ctx) throw new Error('useFediverse must be used inside <FediverseProvider>');
  return ctx;
}

export type { FediverseContextValue };
