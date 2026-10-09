// ─── Client-side fediverse account helpers ────────────────────────────────────
// The browser only needs to remove an account and link a Threads token. These used to live in service.ts, which
// statically imports every protocol adapter — importing it from the app-wide FediverseContext dragged the whole
// AT Protocol SDK into the main bundle. Everything privileged (timelines, posting, notifications, DMs) goes
// through /api/fediverse/*, so the SDK stays server-side.

import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../firebase';
import { threadsAdapter } from './threads';
import type { FediverseAccount, FediverseAccountDoc, FediverseCredentials } from './types';

const accountsRef = (uid: string) => collection(db, 'users', uid, 'fediverseAccounts');

export async function removeFediverseAccount(uid: string, accountId: string): Promise<void> {
  await deleteDoc(doc(accountsRef(uid), accountId));
}

/** Connect a Threads account using a long-lived access token. */
export async function connectThreads(uid: string, accessToken: string): Promise<FediverseAccount> {
  const creds: FediverseCredentials = { accessToken };
  const profile = await threadsAdapter.verifyCredentials(creds);
  const account: FediverseAccount = {
    id: uuidv4(), protocol: 'threads', handle: profile.handle, displayName: profile.displayName,
    avatarUrl: profile.avatarUrl, credentials: creds, connectedAt: Date.now(), isActive: true, profileUrl: profile.url,
  };
  const docData: FediverseAccountDoc = {
    id: account.id, protocol: account.protocol, handle: account.handle, displayName: account.displayName,
    avatarUrl: account.avatarUrl ?? '', instanceUrl: '', profileUrl: account.profileUrl,
    credentials: account.credentials, connectedAt: account.connectedAt, isActive: account.isActive,
  };
  await setDoc(doc(accountsRef(uid), account.id), docData);
  return account;
}
