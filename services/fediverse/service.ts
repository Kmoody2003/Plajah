// ─── FediverseService ──────────────────────────────────────────────────────────
// Orchestrates multiple connected accounts across all supported protocols.
// Persists accounts to Firestore: users/{uid}/fediverseAccounts/{accountId}
// Credentials are stored encrypted at rest by Firestore — no plaintext exposure
// beyond the user's own authenticated session.

import {
  collection, doc, getDocs, setDoc, deleteDoc, Timestamp,
} from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../firebase';
import { mastodonAdapter } from './mastodon';
import { blueskyadapter, bskyCreateSession } from './bluesky';
import { threadsAdapter } from './threads';
import type {
  FediverseProtocol, FediverseAccount, FediverseAccountDoc,
  FediverseAdapter, FediverseCredentials, FediversePost,
  FediverseNotification, FediverseProfile, CreatePostOptions, FediverseError,
} from './types';

// ─── Registry ─────────────────────────────────────────────────────────────────

const ADAPTERS: Record<FediverseProtocol, FediverseAdapter> = {
  mastodon: mastodonAdapter,
  bluesky:  blueskyadapter,
  threads:  threadsAdapter,
};

function accountsRef(uid: string) {
  return collection(db, 'users', uid, 'fediverseAccounts');
}

// ─── Firestore persistence ────────────────────────────────────────────────────

export async function loadFediverseAccounts(uid: string): Promise<FediverseAccount[]> {
  const snap = await getDocs(accountsRef(uid));
  return snap.docs.map(d => {
    const raw = d.data() as FediverseAccountDoc;
    return {
      id: raw.id,
      protocol: raw.protocol,
      handle: raw.handle,
      displayName: raw.displayName,
      avatarUrl: raw.avatarUrl || undefined,
      instanceUrl: raw.instanceUrl || undefined,
      credentials: raw.credentials,
      connectedAt: raw.connectedAt,
      isActive: raw.isActive,
      profileUrl: raw.profileUrl,
    } satisfies FediverseAccount;
  });
}

async function saveAccount(uid: string, account: FediverseAccount): Promise<void> {
  const docData: FediverseAccountDoc = {
    id: account.id,
    protocol: account.protocol,
    handle: account.handle,
    displayName: account.displayName,
    avatarUrl: account.avatarUrl ?? '',
    instanceUrl: account.instanceUrl ?? '',
    profileUrl: account.profileUrl,
    credentials: account.credentials,
    connectedAt: account.connectedAt,
    isActive: account.isActive,
  };
  await setDoc(doc(accountsRef(uid), account.id), docData);
}

export async function removeFediverseAccount(uid: string, accountId: string): Promise<void> {
  await deleteDoc(doc(accountsRef(uid), accountId));
}

// ─── Connect helpers ──────────────────────────────────────────────────────────

/** Connect a Mastodon account using a personal access token. */
export async function connectMastodon(
  uid: string,
  instanceUrl: string,
  accessToken: string,
): Promise<FediverseAccount> {
  const normalised = instanceUrl.trim().replace(/\/$/, '');
  const creds: FediverseCredentials = { accessToken, instanceUrl: normalised };
  const profile = await mastodonAdapter.verifyCredentials(creds);
  const account: FediverseAccount = {
    id: uuidv4(),
    protocol: 'mastodon',
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    instanceUrl: normalised,
    credentials: creds,
    connectedAt: Date.now(),
    isActive: true,
    profileUrl: profile.url,
  };
  await saveAccount(uid, account);
  return account;
}

/** Connect a Bluesky account using a handle and app password. */
export async function connectBluesky(
  uid: string,
  handle: string,
  appPassword: string,
): Promise<FediverseAccount> {
  const cleanHandle = handle.trim().replace(/^@/, '');
  const creds = await bskyCreateSession(cleanHandle, appPassword);
  const profile = await blueskyadapter.verifyCredentials(creds);
  const account: FediverseAccount = {
    id: uuidv4(),
    protocol: 'bluesky',
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    credentials: creds,
    connectedAt: Date.now(),
    isActive: true,
    profileUrl: profile.url,
  };
  await saveAccount(uid, account);
  return account;
}

/** Connect a Threads account using a long-lived access token. */
export async function connectThreads(
  uid: string,
  accessToken: string,
): Promise<FediverseAccount> {
  const creds: FediverseCredentials = { accessToken };
  const profile = await threadsAdapter.verifyCredentials(creds);
  const account: FediverseAccount = {
    id: uuidv4(),
    protocol: 'threads',
    handle: profile.handle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    credentials: creds,
    connectedAt: Date.now(),
    isActive: true,
    profileUrl: profile.url,
  };
  await saveAccount(uid, account);
  return account;
}

// ─── Feed operations ──────────────────────────────────────────────────────────

export interface FediverseFeedResult {
  posts: FediversePost[];
  errors: { accountId: string; protocol: FediverseProtocol; error: string }[];
}

/** Fetch home timelines from all active accounts and merge by recency. */
export async function getUnifiedTimeline(
  accounts: FediverseAccount[],
): Promise<FediverseFeedResult> {
  const active = accounts.filter(a => a.isActive);
  const results = await Promise.allSettled(
    active.map(acc =>
      ADAPTERS[acc.protocol]
        .getHomeTimeline(acc.credentials)
        .then(r => r.posts)
        .catch(async (err: FediverseError) => {
          // Bluesky: try public/discover feed as fallback when home fails
          if (acc.protocol === 'bluesky') {
            const r = await ADAPTERS['bluesky'].getPublicTimeline(acc.credentials);
            return r.posts;
          }
          throw err;
        })
    )
  );

  const posts: FediversePost[] = [];
  const errors: FediverseFeedResult['errors'] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      posts.push(...r.value);
    } else {
      errors.push({
        accountId: active[i].id,
        protocol: active[i].protocol,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  posts.sort((a, b) => b.createdAt - a.createdAt);
  return { posts, errors };
}

// ─── Cross-post ───────────────────────────────────────────────────────────────

export interface CrossPostResult {
  succeeded: { accountId: string; protocol: FediverseProtocol; post: FediversePost }[];
  failed:    { accountId: string; protocol: FediverseProtocol; error: string }[];
}

/**
 * Publish content to one or more accounts simultaneously.
 * Pass `targetAccountIds` to publish to a subset; omit/empty to post to all active accounts.
 */
export async function crossPost(
  accounts: FediverseAccount[],
  content: string,
  options?: CreatePostOptions,
  targetAccountIds?: string[],
): Promise<CrossPostResult> {
  const targets = accounts.filter(a =>
    a.isActive && (!targetAccountIds?.length || targetAccountIds.includes(a.id))
  );

  const results = await Promise.allSettled(
    targets.map(acc =>
      ADAPTERS[acc.protocol].createPost(acc.credentials, content, options)
    )
  );

  const succeeded: CrossPostResult['succeeded'] = [];
  const failed:    CrossPostResult['failed']    = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      succeeded.push({ accountId: targets[i].id, protocol: targets[i].protocol, post: r.value });
    } else {
      failed.push({
        accountId: targets[i].id,
        protocol:  targets[i].protocol,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }
  return { succeeded, failed };
}

// ─── Per-post actions ─────────────────────────────────────────────────────────

function accountForPost(accounts: FediverseAccount[], post: FediversePost): FediverseAccount | undefined {
  return accounts.find(a => a.id === post.accountId && a.protocol === post.protocol);
}

export async function likePost(
  accounts: FediverseAccount[],
  post: FediversePost,
): Promise<Partial<FediversePost>> {
  const acc = accountForPost(accounts, post);
  if (!acc) throw new Error('No account found for this post');
  return ADAPTERS[acc.protocol].likePost(acc.credentials, post);
}

export async function unlikePost(accounts: FediverseAccount[], post: FediversePost): Promise<void> {
  const acc = accountForPost(accounts, post);
  if (!acc) throw new Error('No account found for this post');
  await ADAPTERS[acc.protocol].unlikePost(acc.credentials, post);
}

export async function repost(
  accounts: FediverseAccount[],
  post: FediversePost,
): Promise<Partial<FediversePost>> {
  const acc = accountForPost(accounts, post);
  if (!acc) throw new Error('No account found for this post');
  return ADAPTERS[acc.protocol].repost(acc.credentials, post);
}

export async function unrepost(accounts: FediverseAccount[], post: FediversePost): Promise<void> {
  const acc = accountForPost(accounts, post);
  if (!acc) throw new Error('No account found for this post');
  await ADAPTERS[acc.protocol].unrepost(acc.credentials, post);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getUnifiedNotifications(
  accounts: FediverseAccount[],
): Promise<FediverseNotification[]> {
  const results = await Promise.allSettled(
    accounts
      .filter(a => a.isActive && a.protocol !== 'threads') // threads has no notif API
      .map(acc => ADAPTERS[acc.protocol].getNotifications(acc.credentials))
  );
  const notifs: FediverseNotification[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') notifs.push(...r.value);
  }
  return notifs.sort((a, b) => b.createdAt - a.createdAt);
}

// ─── Profile lookup ───────────────────────────────────────────────────────────

export async function lookupProfile(
  accounts: FediverseAccount[],
  protocol: FediverseProtocol,
  handleOrId: string,
): Promise<FediverseProfile> {
  const acc = accounts.find(a => a.protocol === protocol && a.isActive);
  if (!acc) throw new Error(`No active ${protocol} account`);
  return ADAPTERS[protocol].lookupProfile(acc.credentials, handleOrId);
}
