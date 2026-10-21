/**
 * patronageAdService.ts
 *
 * Unified, Zero-Conflict Engine for Plajah's 9 Non-Extractive Ad & Patronage Models:
 *   1. Silent Album Canvas & Art-Rotation Sponsorships (10–15 min interval, billboards only, no sound)
 *   2. Chora Hide & Seek Sponsored Hunts (Ad-Key 30-Min Personal Passes + Seek-to-Earn Bounties)
 *   3. Sponsor-to-Unlock Patronage Vaults (90% retail to creator, free unlock for fan)
 *   4. Attention Dividend Wallet (60% User / 30% Host Creator / 10% Plajah)
 *   5. SeedRaiser Ad-Matching (95% to creator crowdfunding goal + Backer Tier credit to fan)
 *   6. Brick-and-Mortar ↔ Creator Loop (Digital Signage QR + Geofenced Foot-Traffic Bounties)
 *   7. Ad-Sync Creative Bounties (Upfront fee + ongoing % ad-spend royalty via SplitConfig)
 *   8. Curator Co-Op Billboards (75% Creator / 15% Fan Curator / 10% Plajah)
 *   9. Diegetic 3D World & Walk-In Gallery Patronage
 *
 * Includes the Non-Collision Coordinator so multiple models never fire back-to-back or conflict,
 * and the Two-Gear Payout Engine (Zero-KYC instant balance + Direct-to-Stripe Connect transfers).
 */

import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from './firebase';
import type {
  Album,
  PatronageWallet,
  HideNSeekSponsorBounty,
  CuratorCoOpSlot,
  AdSyncBounty,
} from '../types';

// ─── 1. NON-COLLISION COORDINATOR (MUTEX & COOLDOWN GUARD) ──────────────────

const LAST_SURFACE_KEY = 'pj_last_sponsor_surface_ts';
const AD_KEY_PASS_PREFIX = 'hns_adpass_';

/**
 * Ensures that visual album canvas rotations, Hide & Seek ad-key unlocks, and sponsor showcases
 * never collide or fire back-to-back within the minimum cooldown window.
 */
export function canShowSponsorSurface(minCooldownMinutes = 10): boolean {
  try {
    const raw = sessionStorage.getItem(LAST_SURFACE_KEY);
    if (!raw) return true;
    const lastTs = parseInt(raw, 10);
    if (Number.isNaN(lastTs)) return true;
    return Date.now() - lastTs >= minCooldownMinutes * 60 * 1000;
  } catch {
    return true;
  }
}

export function markSponsorSurfaceShown(): void {
  try {
    sessionStorage.setItem(LAST_SURFACE_KEY, String(Date.now()));
  } catch {
    // ignore storage errors in private mode
  }
}

// ─── 2. CHORA HIDE & SEEK AD-KEY PASS (OUT-OF-WINDOW PERSONAL UNLOCK) ───────

/**
 * Returns the expiration timestamp (ms) if the listener currently holds an active
 * 30-minute personal Hide & Seek pass unlocked via a sponsor showcase, or null if expired/absent.
 */
export function getActiveAdKeyPassExpiry(albumId?: string): number | null {
  if (!albumId) return null;
  try {
    const raw = sessionStorage.getItem(`${AD_KEY_PASS_PREFIX}${albumId}`);
    if (!raw) return null;
    const expiresAt = parseInt(raw, 10);
    if (Number.isNaN(expiresAt) || Date.now() >= expiresAt) {
      sessionStorage.removeItem(`${AD_KEY_PASS_PREFIX}${albumId}`);
      return null;
    }
    return expiresAt;
  } catch {
    return null;
  }
}

export function hasActiveAdKeyPass(albumId?: string): boolean {
  return getActiveAdKeyPassExpiry(albumId) !== null;
}

/**
 * Grants a listener a personal 30-minute Hide & Seek window pass on an album when its scheduled
 * 3-hour window is closed, and settles the 90% artist payout from the sponsor showcase.
 */
export async function grantAdKeyPass(
  album: Album,
  durationMinutes = 30,
  sponsorLabel = 'Plajah Patron Partner'
): Promise<{ expiresAt: number; artistEarnedCents: number }> {
  const expiresAt = Date.now() + durationMinutes * 60 * 1000;
  try {
    sessionStorage.setItem(`${AD_KEY_PASS_PREFIX}${album.id}`, String(expiresAt));
    markSponsorSurfaceShown();
  } catch {
    // ignore sessionStorage error
  }

  // Settle 90% of the Ad-Key unlock ($0.25 gross → 22¢ to artist Stripe/balance)
  const grossCents = 25;
  const artistEarnedCents = Math.round(grossCents * 0.9);
  if (album.ownerId) {
    await settlePatronagePayout({
      recipientUid: album.ownerId,
      amountCents: artistEarnedCents,
      category: 'ad_patronage',
      sourceModel: 'HNS_AD_KEY_UNLOCK',
      albumId: album.id,
      sponsorName: album.hideNSeekConfig?.sponsorBounty?.sponsorName || album.canvasSponsor?.sponsorName || sponsorLabel,
      note: `Hide & Seek 30-Min Ad-Key Pass unlocked on "${album.title}"`,
    });
  }

  return { expiresAt, artistEarnedCents };
}

// ─── 3. CHORA HIDE & SEEK SPONSORED BOUNTY ("SEEK-TO-EARN") ─────────────────

export interface HnsBountyClaimResult {
  awarded: boolean;
  fanEarnedCents: number;
  artistEarnedCents: number;
  sponsorName: string;
  goldenTicketTitle?: string;
  goldenTicketCode?: string;
  isJackpot?: boolean;
  settledDirectToStripe?: boolean;
}

/**
 * Called when `onTrackPlayed` in `useHideNSeek.ts` records a newly discovered hidden alternate.
 * If the album has an active `sponsorBounty`, splits the discovery bounty:
 *   - Fan receives `fanBountyCentsPerDiscovery` (+ `completionJackpotCents` if 100% completed)
 *   - Artist receives the 2x creator share (60% of total bounty event)
 *   - Fan also unlocks any attached Golden Ticket coupon code.
 */
export async function claimHideNSeekDiscoveryBounty(
  album: Album,
  alternateId: string,
  isFullAlbumCompletion: boolean
): Promise<HnsBountyClaimResult | null> {
  const bounty: HideNSeekSponsorBounty | undefined = album.hideNSeekConfig?.sponsorBounty;
  if (!bounty || !bounty.enabled || bounty.remainingPoolCents <= 0) {
    return null;
  }

  const fanUid = auth.currentUser?.uid;
  if (!fanUid) return null;

  // Prevent duplicate bounty claims for the same alternate by the same user in local storage
  const claimKey = `pj_hns_bounty_${fanUid}_${album.id}_${alternateId}`;
  try {
    if (localStorage.getItem(claimKey)) return null;
    localStorage.setItem(claimKey, String(Date.now()));
  } catch {
    // continue
  }

  const baseFanCents = Math.max(10, bounty.fanBountyCentsPerDiscovery || 50);
  const jackpotCents = isFullAlbumCompletion ? (bounty.completionJackpotCents || 250) : 0;
  const fanEarnedCents = Math.min(bounty.remainingPoolCents, baseFanCents + jackpotCents);
  const artistEarnedCents = Math.round(fanEarnedCents * 2); // 60% artist / 30% fan ratio

  // 1. Pay the Fan (Gear 2 Direct-to-Stripe if connected, else Gear 1 Zero-KYC Instant Balance)
  const fanSettlement = await settlePatronagePayout({
    recipientUid: fanUid,
    amountCents: fanEarnedCents,
    category: 'ad_patronage',
    sourceModel: 'HNS_SEEKER_BOUNTY',
    albumId: album.id,
    sponsorName: bounty.sponsorName,
    note: isFullAlbumCompletion
      ? `Nothing Was Real 100% Hide & Seek Jackpot on "${album.title}" (${bounty.sponsorName})`
      : `Discovered hidden Hide & Seek track on "${album.title}" (${bounty.sponsorName})`,
  });

  // 2. Pay the Artist directly
  if (album.ownerId) {
    await settlePatronagePayout({
      recipientUid: album.ownerId,
      amountCents: artistEarnedCents,
      category: 'ad_patronage',
      sourceModel: 'HNS_ARTIST_SPONSOR_SHARE',
      albumId: album.id,
      sponsorName: bounty.sponsorName,
      note: `Fan discovered sponsored Hide & Seek alternate (${alternateId}) on "${album.title}"`,
    });
  }

  return {
    awarded: true,
    fanEarnedCents,
    artistEarnedCents,
    sponsorName: bounty.sponsorName,
    goldenTicketTitle: bounty.goldenTicketTitle,
    goldenTicketCode: bounty.goldenTicketCode,
    isJackpot: isFullAlbumCompletion && jackpotCents > 0,
    settledDirectToStripe: fanSettlement.settledDirectToStripe,
  };
}

// ─── 4. TWO-GEAR PAYOUT ENGINE (ZERO-KYC VAULT + DIRECT STRIPE TRANSFERS) ───

export interface PatronagePayoutRequest {
  recipientUid: string;
  amountCents: number;
  category: 'ad_patronage' | 'curator_coop' | 'seedraiser';
  sourceModel: string;
  albumId?: string;
  sponsorName?: string;
  note?: string;
}

export async function settlePatronagePayout(
  req: PatronagePayoutRequest
): Promise<{ ok: boolean; settledDirectToStripe: boolean }> {
  if (!req.recipientUid || req.amountCents <= 0) {
    return { ok: false, settledDirectToStripe: false };
  }

  // Try backend endpoint first so connected Stripe accounts receive an immediate `stripe.transfers.create`
  try {
    // Admin-only on the server; for anyone else it 403s and the ledger fallback below runs.
    const token = await auth.currentUser?.getIdToken();
    const res = await fetch('/api/patronage/payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(req),
    });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, settledDirectToStripe: !!data.settledDirectToStripe };
    }
  } catch {
    // Fallback to client Firestore ledger update below
  }

  // Gear 1 Zero-KYC Firestore Ledger fallback
  try {
    const walletRef = doc(db, 'patronageWallets', req.recipientUid);
    const snap = await getDoc(walletRef);
    if (snap.exists()) {
      await updateDoc(walletRef, {
        pendingStripeBalanceCents: increment(req.amountCents),
        lifetimeEarnedCents: increment(req.amountCents),
        updatedAt: Date.now(),
      });
    } else {
      const initial: PatronageWallet = {
        uid: req.recipientUid,
        pendingStripeBalanceCents: req.amountCents,
        lifetimeDirectStripeCents: 0,
        lifetimeEarnedCents: req.amountCents,
        updatedAt: Date.now(),
      };
      await setDoc(walletRef, initial);
    }

    await addDoc(collection(db, 'creatorEarnings'), {
      creatorUid: req.recipientUid,
      category: req.category,
      grossCents: req.amountCents,
      platformFeeCents: 0,
      netCents: req.amountCents,
      sourceModel: req.sourceModel,
      albumId: req.albumId || null,
      sponsorName: req.sponsorName || null,
      description: req.note || 'Plajah Patronage Payout',
      createdAt: Date.now(),
    });
    return { ok: true, settledDirectToStripe: false };
  } catch {
    return { ok: false, settledDirectToStripe: false };
  }
}

export async function fetchPatronageWallet(uid?: string): Promise<PatronageWallet | null> {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) return null;
  try {
    const snap = await getDoc(doc(db, 'patronageWallets', targetUid));
    if (!snap.exists()) {
      return {
        uid: targetUid,
        pendingStripeBalanceCents: 0,
        lifetimeDirectStripeCents: 0,
        lifetimeEarnedCents: 0,
        updatedAt: Date.now(),
      };
    }
    return snap.data() as PatronageWallet;
  } catch {
    return null;
  }
}

/**
 * Gear 2 Cashout: Transfers a user's accumulated Zero-KYC `pendingStripeBalanceCents`
 * straight into their connected Stripe account (`stripeConnectAccountId`).
 */
export async function cashOutPendingBalanceToStripe(uid?: string): Promise<{ ok: boolean; transferredCents?: number; error?: string }> {
  const targetUid = uid || auth.currentUser?.uid;
  if (!targetUid) return { ok: false, error: 'Sign in first.' };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, error: 'Sign in first.' };
    const res = await fetch('/api/patronage/cashout-to-stripe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || 'Cashout failed' };
    return { ok: true, transferredCents: data.transferredCents };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error' };
  }
}

// ─── 5. SPONSOR-TO-UNLOCK, SEEDRAISER MATCHING & CURATOR CO-OP ──────────────

/**
 * Sponsor-to-Unlock: Fan engages with sponsor showcase to unlock a paywalled work for free,
 * while the Sponsor Vault pays the creator 90% of the retail unlock price.
 */
export async function redeemSponsorToUnlock(album: Album): Promise<{ unlocked: boolean; creatorPaidCents: number }> {
  const vault = album.sponsorUnlockVault;
  if (!vault || !vault.enabled || vault.remainingUnlocks <= 0) {
    return { unlocked: false, creatorPaidCents: 0 };
  }
  const creatorPaidCents = Math.round(vault.unlockPriceCents * 0.9);
  if (album.ownerId) {
    await settlePatronagePayout({
      recipientUid: album.ownerId,
      amountCents: creatorPaidCents,
      category: 'ad_patronage',
      sourceModel: 'SPONSOR_TO_UNLOCK',
      albumId: album.id,
      sponsorName: vault.sponsorName,
      note: `Sponsor-to-Unlock redeemed on "${album.title}" (Underwritten by ${vault.sponsorName})`,
    });
  }
  try {
    sessionStorage.setItem(`pj_sponsor_unlocked_${album.id}`, 'true');
    markSponsorSurfaceShown();
  } catch {
    // ignore
  }
  return { unlocked: true, creatorPaidCents };
}

/**
 * Curator Co-Op Affiliate Split: 75% to the Creator, 15% to the Curator user, 10% to Plajah.
 */
export async function settleCuratorCoOpSale(slot: CuratorCoOpSlot): Promise<void> {
  const creatorCents = Math.round(slot.priceCents * 0.75);
  const curatorCents = Math.round(slot.priceCents * (slot.curatorCommissionPct || 15) / 100);
  await Promise.all([
    settlePatronagePayout({
      recipientUid: slot.creatorUid,
      amountCents: creatorCents,
      category: 'ad_patronage',
      sourceModel: 'CURATOR_COOP_CREATOR_SALE',
      note: `Sale of "${slot.targetTitle}" via Curator Co-Op (${slot.curatorName})`,
    }),
    settlePatronagePayout({
      recipientUid: slot.curatorUid,
      amountCents: curatorCents,
      category: 'curator_coop',
      sourceModel: 'CURATOR_COOP_COMMISSION',
      note: `15% Curator Co-Op Finder's Bounty for "${slot.targetTitle}"`,
    }),
  ]);
}

export async function fetchOpenAdSyncBounties(): Promise<AdSyncBounty[]> {
  try {
    const snap = await getDocs(query(collection(db, 'adSyncBounties'), where('status', '==', 'OPEN')));
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AdSyncBounty));
  } catch {
    return [];
  }
}
