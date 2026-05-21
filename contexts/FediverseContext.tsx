import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../services/firebase';
import type {
  FediverseAccount, FediversePost, FediverseNotification,
  FediverseProtocol, CreatePostOptions,
} from '../services/fediverse/types';
import {
  loadFediverseAccounts, removeFediverseAccount,
  connectMastodon, connectBluesky, connectThreads,
  getUnifiedTimeline, crossPost as svcCrossPost,
  likePost as svcLike, unlikePost as svcUnlike,
  repost as svcRepost, unrepost as svcUnrepost,
  getUnifiedNotifications,
  type FediverseFeedResult, type CrossPostResult,
} from '../services/fediverse/service';

// ─── Context shape ────────────────────────────────────────────────────────────

interface FediverseContextValue {
  // State
  accounts: FediverseAccount[];
  feed: FediversePost[];
  notifications: FediverseNotification[];
  feedErrors: FediverseFeedResult['errors'];
  isLoadingAccounts: boolean;
  isLoadingFeed: boolean;
  isCrossPosting: boolean;

  // Account management
  connectMastodonAccount: (instanceUrl: string, token: string) => Promise<FediverseAccount>;
  connectBlueskyAccount: (handle: string, appPassword: string) => Promise<FediverseAccount>;
  connectThreadsAccount: (token: string) => Promise<FediverseAccount>;
  disconnectAccount: (accountId: string) => Promise<void>;

  // Feed
  refreshFeed: () => Promise<void>;
  refreshNotifications: () => Promise<void>;

  // Post actions
  crossPost: (
    content: string,
    options?: CreatePostOptions,
    targetAccountIds?: string[],
  ) => Promise<CrossPostResult>;

  toggleLike: (post: FediversePost) => Promise<void>;
  toggleRepost: (post: FediversePost) => Promise<void>;

  // Helpers
  accountsByProtocol: (protocol: FediverseProtocol) => FediverseAccount[];
  hasProtocol: (protocol: FediverseProtocol) => boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const FediverseContext = createContext<FediverseContextValue | undefined>(undefined);

export const FediverseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [uid, setUid]                 = useState<string | null>(null);
  const [accounts, setAccounts]       = useState<FediverseAccount[]>([]);
  const [feed, setFeed]               = useState<FediversePost[]>([]);
  const [feedErrors, setFeedErrors]   = useState<FediverseFeedResult['errors']>([]);
  const [notifications, setNotifications] = useState<FediverseNotification[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isLoadingFeed,     setIsLoadingFeed]     = useState(false);
  const [isCrossPosting,    setIsCrossPosting]    = useState(false);

  // Prevent duplicate feed refreshes
  const feedRefreshRef = useRef(false);

  // ─── Auth listener ──────────────────────────────────────────────────────────

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        setUid(user.uid);
        setIsLoadingAccounts(true);
        loadFediverseAccounts(user.uid)
          .then(setAccounts)
          .catch(console.error)
          .finally(() => setIsLoadingAccounts(false));
      } else {
        setUid(null);
        setAccounts([]);
        setFeed([]);
        setNotifications([]);
        setIsLoadingAccounts(false);
      }
    });
    return unsub;
  }, []);

  // ─── Auto-refresh feed when accounts change ─────────────────────────────────

  useEffect(() => {
    if (!accounts.length) return;
    refreshFeed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.map(a => a.id).join(',')]);

  // ─── Feed ────────────────────────────────────────────────────────────────────

  const refreshFeed = useCallback(async () => {
    if (feedRefreshRef.current || !accounts.length) return;
    feedRefreshRef.current = true;
    setIsLoadingFeed(true);
    try {
      const { posts, errors } = await getUnifiedTimeline(accounts);
      setFeed(posts);
      setFeedErrors(errors);
    } catch (err) {
      console.error('[Fediverse] Feed refresh failed:', err);
    } finally {
      setIsLoadingFeed(false);
      feedRefreshRef.current = false;
    }
  }, [accounts]);

  const refreshNotifications = useCallback(async () => {
    if (!accounts.length) return;
    try {
      const notifs = await getUnifiedNotifications(accounts);
      setNotifications(notifs);
    } catch (err) {
      console.error('[Fediverse] Notification refresh failed:', err);
    }
  }, [accounts]);

  // ─── Account management ───────────────────────────────────────────────────

  const connectMastodonAccount = useCallback(async (instanceUrl: string, token: string) => {
    if (!uid) throw new Error('Not authenticated');
    const account = await connectMastodon(uid, instanceUrl, token);
    setAccounts(prev => [...prev, account]);
    return account;
  }, [uid]);

  const connectBlueskyAccount = useCallback(async (handle: string, appPassword: string) => {
    if (!uid) throw new Error('Not authenticated');
    const account = await connectBluesky(uid, handle, appPassword);
    setAccounts(prev => [...prev, account]);
    return account;
  }, [uid]);

  const connectThreadsAccount = useCallback(async (token: string) => {
    if (!uid) throw new Error('Not authenticated');
    const account = await connectThreads(uid, token);
    setAccounts(prev => [...prev, account]);
    return account;
  }, [uid]);

  const disconnectAccount = useCallback(async (accountId: string) => {
    if (!uid) return;
    await removeFediverseAccount(uid, accountId);
    setAccounts(prev => prev.filter(a => a.id !== accountId));
    setFeed(prev => prev.filter(p => p.accountId !== accountId));
  }, [uid]);

  // ─── Post actions ─────────────────────────────────────────────────────────

  const crossPost = useCallback(async (
    content: string,
    options?: CreatePostOptions,
    targetAccountIds?: string[],
  ): Promise<CrossPostResult> => {
    setIsCrossPosting(true);
    try {
      const result = await svcCrossPost(accounts, content, options, targetAccountIds);
      // Prepend succeeded posts to local feed
      if (result.succeeded.length) {
        setFeed(prev => [...result.succeeded.map(s => s.post), ...prev]);
      }
      return result;
    } finally {
      setIsCrossPosting(false);
    }
  }, [accounts]);

  const toggleLike = useCallback(async (post: FediversePost) => {
    // Optimistic update
    setFeed(prev => prev.map(p => {
      if (p.id !== post.id || p.protocol !== post.protocol) return p;
      return { ...p, isLiked: !p.isLiked, likeCount: p.likeCount + (p.isLiked ? -1 : 1) };
    }));
    try {
      if (post.isLiked) {
        await svcUnlike(accounts, post);
      } else {
        const update = await svcLike(accounts, post);
        setFeed(prev => prev.map(p =>
          p.id === post.id && p.protocol === post.protocol ? { ...p, ...update } : p
        ));
      }
    } catch (err) {
      // Revert optimistic update
      setFeed(prev => prev.map(p =>
        p.id === post.id && p.protocol === post.protocol ? post : p
      ));
      throw err;
    }
  }, [accounts]);

  const toggleRepost = useCallback(async (post: FediversePost) => {
    setFeed(prev => prev.map(p => {
      if (p.id !== post.id || p.protocol !== post.protocol) return p;
      return { ...p, isReposted: !p.isReposted, repostCount: p.repostCount + (p.isReposted ? -1 : 1) };
    }));
    try {
      if (post.isReposted) {
        await svcUnrepost(accounts, post);
      } else {
        const update = await svcRepost(accounts, post);
        setFeed(prev => prev.map(p =>
          p.id === post.id && p.protocol === post.protocol ? { ...p, ...update } : p
        ));
      }
    } catch (err) {
      setFeed(prev => prev.map(p =>
        p.id === post.id && p.protocol === post.protocol ? post : p
      ));
      throw err;
    }
  }, [accounts]);

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const accountsByProtocol = useCallback((protocol: FediverseProtocol) =>
    accounts.filter(a => a.protocol === protocol), [accounts]);

  const hasProtocol = useCallback((protocol: FediverseProtocol) =>
    accounts.some(a => a.protocol === protocol && a.isActive), [accounts]);

  // ─── Value ────────────────────────────────────────────────────────────────

  const value: FediverseContextValue = {
    accounts, feed, notifications, feedErrors,
    isLoadingAccounts, isLoadingFeed, isCrossPosting,
    connectMastodonAccount, connectBlueskyAccount, connectThreadsAccount, disconnectAccount,
    refreshFeed, refreshNotifications,
    crossPost, toggleLike, toggleRepost,
    accountsByProtocol, hasProtocol,
  };

  return (
    <FediverseContext.Provider value={value}>
      {children}
    </FediverseContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFediverse(): FediverseContextValue {
  const ctx = useContext(FediverseContext);
  if (!ctx) throw new Error('useFediverse must be used inside <FediverseProvider>');
  return ctx;
}

export type { FediverseContextValue };
