// trustClient — wires the pure trust tiers (trustCore) into the web client.
//
//   installTrustSignals()        once at startup: feeds live signals (email verified, OAuth
//                                provider, custom-claim creator verification, follower counts)
//                                into services/socialRateLimit so every tryConsume() is tiered.
//   currentTrust()               the signed-in account's TrustResult (sync, best effort).
//   composerSpamOptions()        { newAccount, maxLinks, maxMentions } for assessPostSpam.
//   enforceChatCreateTrust(...)  called by createChatRoom before creating a NEW room: caps group
//                                size by tier and meters cold DMs (to people who don't follow you).
//
// Client-side = courtesy layer; a hostile client can skip it. The Firestore rules group-size cap
// (docs/rules-patches/anti-abuse.rules.snippet) and the server routes are the enforcement points.
// Profile fields a user can write themselves (followerCount, isVerified…) are only used to LIFT
// the follower-graph signal, never to grant VERIFIED_CREATOR — that comes from a server-set
// custom claim (`verifiedCreator: true`).

import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { computeTrust, TRUST_LIMIT_COPY, type TrustResult, type TrustSignals } from './trustCore';
import { registerTrustSignalProvider, tryConsume } from '../socialRateLimit';

type ProfileSignals = Pick<TrustSignals, 'followerCount' | 'mutualFollowCount'>;
let profileCache: { uid: string; at: number; data: ProfileSignals } | null = null;
let claimCache: { uid: string; at: number; verifiedCreator: boolean; sanctioned: boolean } | null = null;
const PROFILE_TTL = 10 * 60_000;

function refreshProfile(uid: string): void {
  if (profileCache?.uid === uid && Date.now() - profileCache.at < PROFILE_TTL) return;
  profileCache = { uid, at: Date.now(), data: profileCache?.uid === uid ? profileCache.data : {} };
  void getDoc(doc(db, 'users', uid)).then(snap => {
    const d: any = snap.exists() ? snap.data() : {};
    profileCache = { uid, at: Date.now(), data: { followerCount: Number(d.followerCount) || 0 } };
  }).catch(() => {});
  void auth.currentUser?.getIdTokenResult().then(r => {
    const c: any = r?.claims || {};
    claimCache = { uid, at: Date.now(), verifiedCreator: c.verifiedCreator === true, sanctioned: c.sanctioned === true || c.restricted === true };
  }).catch(() => {});
}

/** Live signals for the signed-in user (synchronous; async enrichments fill in over time). */
export function currentSignals(): TrustSignals | null {
  const u = auth.currentUser;
  if (!u) return null;
  refreshProfile(u.uid);
  const created = Date.parse(u.metadata?.creationTime || '');
  return {
    accountAgeMs: Number.isFinite(created) ? Date.now() - created : null,
    emailVerified: u.emailVerified,
    providers: u.providerData.map(p => p?.providerId).filter(Boolean) as string[],
    isAnonymous: u.isAnonymous,
    ...(profileCache?.uid === u.uid ? profileCache.data : {}),
    verifiedCreator: claimCache?.uid === u.uid ? claimCache.verifiedCreator : false,
    activeSanction: claimCache?.uid === u.uid ? claimCache.sanctioned : false,
  };
}

export function currentTrust(): TrustResult | null {
  const s = currentSignals();
  if (!s) return null;
  // Unknown creation time → don't punish (treat as established-age).
  return computeTrust({ ...s, accountAgeMs: s.accountAgeMs ?? 100 * 365 * 86_400_000 });
}

let installed = false;
export function installTrustSignals(): void {
  if (installed) return;
  installed = true;
  registerTrustSignalProvider(uid => {
    const u = auth.currentUser;
    if (!u || (uid && uid !== u.uid)) return null;
    const s = currentSignals();
    if (!s) return null;
    const { accountAgeMs: _ignored, ...rest } = s; // tryConsume supplies age itself
    return rest;
  });
}

export function composerSpamOptions(): { newAccount: boolean; maxLinks?: number; maxMentions?: number } {
  const t = currentTrust();
  if (!t) return { newAccount: false };
  return { newAccount: t.tier === 'NEW', maxLinks: t.limits.linksPerPost, maxMentions: t.limits.mentionsPerPost };
}

/**
 * Throws a friendly Error when a NEW chat room would exceed this account's tier. Only call for
 * rooms that don't exist yet (createChatRoom does the existing-room lookup first).
 */
export async function enforceChatCreateTrust(participants: readonly string[], type: string): Promise<void> {
  const u = auth.currentUser;
  if (!u) return;
  installTrustSignals();
  const t = currentTrust();
  if (!t) return;
  const others = participants.filter(p => p && p !== u.uid);

  if (type === 'GROUP') {
    if (!t.limits.canCreateGroups) throw new Error(TRUST_LIMIT_COPY.groupBlocked);
    if (participants.length > t.limits.maxGroupSize) throw new Error(TRUST_LIMIT_COPY.group(t.limits.maxGroupSize));
    return;
  }

  if (type === 'PRIVATE' && others.length === 1) {
    // Does the other person follow me? Then it isn't a cold DM — never metered.
    let followsMe = false;
    try { followsMe = (await getDoc(doc(db, 'follows', `${others[0]}_${u.uid}`))).exists(); } catch { followsMe = true; /* unknown → don't punish */ }
    if (followsMe) return;
    const created = Date.parse(u.metadata?.creationTime || '');
    const r = tryConsume(u.uid, 'dm_cold', Number.isFinite(created) ? created : null);
    if (!r.ok) throw new Error(TRUST_LIMIT_COPY.dm);
  }
}
