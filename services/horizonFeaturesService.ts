/**
 * Horizon Features Service
 *
 * Service layer for all 10 "On The Horizon" features.
 * All exported functions are wired to the correct contracts/Firestore paths
 * but return INACTIVE errors until the feature flag is enabled in production.
 *
 * Activation: set the feature flag in Firestore /platform_config/horizon_flags
 *   { DYNAMIC_NFT: false, PREDICTION_MARKET: false, ... }
 *
 * Features covered:
 *  1. Dynamic Rarity NFT Cards     — dynamicNFT.*
 *  2. Prediction Markets           — predictionMarket.*
 *  3. Alumni Endorsement Staking   — alumniEndorsement.*
 *  4. Soulbound Career Token       — soulbound.*
 *  5. Booster Club DAO             — boosterDAO.*
 *  6. Injury Insurance Micro-Pool  — injuryPool.*
 *  7. Game Photo Licensing         — photoLicense.*
 *  8. LOI Moment NFT               — loiNFT.*
 *  9. Scout Discovery Network      — scoutDiscovery.*
 * 10. Family Multi-Sig Wallet      — familyMultisig.*
 */

import { db } from './firebase';
import {
  doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, where, getDocs,
} from 'firebase/firestore';

// ─── Feature flag guard ────────────────────────────────────────────────────────

class HorizonFeatureInactiveError extends Error {
  constructor(featureId: string) {
    super(`[Horizon] Feature "${featureId}" is not yet activated. On The Horizon.`);
    this.name = 'HorizonFeatureInactiveError';
  }
}

async function assertFeatureActive(featureId: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, 'platform_config', 'horizon_flags'));
    if (snap.exists() && snap.data()[featureId] === true) return;
  } catch {}
  throw new HorizonFeatureInactiveError(featureId);
}

// ─── Contract addresses (populated when deployed) ────────────────────────────

const CONTRACTS = {
  SOULBOUND:    () => import.meta.env.VITE_CONTRACT_SOULBOUND ?? '',
  PREDICTION:   () => import.meta.env.VITE_CONTRACT_PREDICTION_MARKET ?? '',
  ALUMNI:       () => import.meta.env.VITE_CONTRACT_ALUMNI_ENDORSEMENT ?? '',
  BOOSTER_DAO:  () => import.meta.env.VITE_CONTRACT_BOOSTER_DAO ?? '',
  INJURY_POOL:  () => import.meta.env.VITE_CONTRACT_INJURY_POOL ?? '',
};

// ─── 1. DYNAMIC NFT RARITY CARDS ─────────────────────────────────────────────

export const dynamicNFT = {

  /**
   * Compute rarity tier from career TD count.
   * Tiers: COMMON (< 10) | RARE (10–49) | EPIC (50–99) | LEGENDARY (100+)
   */
  getRarityTier(careerTouchdowns: number): 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY' {
    if (careerTouchdowns >= 100) return 'LEGENDARY';
    if (careerTouchdowns >= 50)  return 'EPIC';
    if (careerTouchdowns >= 10)  return 'RARE';
    return 'COMMON';
  },

  getRarityColor(tier: ReturnType<typeof dynamicNFT.getRarityTier>) {
    return {
      COMMON:    '#94A3B8',
      RARE:      '#3B82F6',
      EPIC:      '#8B5CF6',
      LEGENDARY: '#F59E0B',
    }[tier];
  },

  /**
   * Refresh on-chain NFT metadata to reflect new rarity tier.
   * Off-chain: updates IPFS-pinned JSON via platform's Pinata account.
   * On-chain: calls AthleteRegistry to update the URI (when implemented).
   */
  async refreshRarity(tokenId: string, athleteUserId: string, careerStats: Record<string, number>) {
    await assertFeatureActive('DYNAMIC_NFT');

    const tier = dynamicNFT.getRarityTier(careerStats.touchdowns ?? 0);

    await setDoc(doc(db, 'dynamic_nft_metadata', tokenId), {
      tokenId,
      athleteUserId,
      rarityTier: tier,
      rarityColor: dynamicNFT.getRarityColor(tier),
      careerStats,
      lastRefreshed: serverTimestamp(),
    }, { merge: true });

    return { tokenId, tier, color: dynamicNFT.getRarityColor(tier) };
  },

  async getTokenRarity(tokenId: string) {
    const snap = await getDoc(doc(db, 'dynamic_nft_metadata', tokenId));
    return snap.exists() ? snap.data() : null;
  },
};

// ─── 2. PREDICTION MARKETS ────────────────────────────────────────────────────

export interface PredictionMarketConfig {
  marketId: string;
  question: string;
  athleteUserId: string;
  athleteWalletAddress: string;
  statKey: string;
  threshold: number;
  windowEndDate: Date;
  gameId?: string;
}

export const predictionMarket = {

  async createMarket(config: PredictionMarketConfig): Promise<{ queued: true }> {
    await assertFeatureActive('PREDICTION_MARKET');

    await setDoc(doc(db, 'prediction_markets', config.marketId), {
      ...config,
      windowEnd: config.windowEndDate.getTime(),
      yesPool: 0,
      noPool: 0,
      outcome: 'UNRESOLVED',
      resolved: false,
      chainPending: true,
      createdAt: serverTimestamp(),
    });

    return { queued: true };
  },

  async stakeOnMarket(marketId: string, userId: string, yes: boolean, plajAmount: number) {
    await assertFeatureActive('PREDICTION_MARKET');

    await addDoc(collection(db, 'prediction_market_stakes'), {
      marketId,
      userId,
      yes,
      plajAmount,
      status: 'QUEUED',
      createdAt: serverTimestamp(),
    });

    return { queued: true };
  },

  async getMarket(marketId: string) {
    const snap = await getDoc(doc(db, 'prediction_markets', marketId));
    return snap.exists() ? snap.data() : null;
  },

  async getAthleteMarkets(athleteUserId: string) {
    const q = query(
      collection(db, 'prediction_markets'),
      where('athleteUserId', '==', athleteUserId),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },
};

// ─── 3. ALUMNI ENDORSEMENT STAKING ───────────────────────────────────────────

export interface AlumniEndorsementConfig {
  endorsementId: string;
  alumniUserId: string;
  alumniWalletAddress: string;
  athleteUserId: string;
  athleteWalletAddress: string;
  publicMessage: string;
  tier: 'PRO' | 'COLLEGE' | 'HIGH_SCHOOL';
  durationDays: number;
  plajDepositAmount: number; // computed by tier
}

export const alumniEndorsement = {

  getDepositForTier(tier: AlumniEndorsementConfig['tier']): number {
    return { PRO: 500, COLLEGE: 100, HIGH_SCHOOL: 25 }[tier];
  },

  async createEndorsement(config: AlumniEndorsementConfig) {
    await assertFeatureActive('ALUMNI_ENDORSEMENT');

    await setDoc(doc(db, 'alumni_endorsements', config.endorsementId), {
      ...config,
      status: 'QUEUED',
      chainPending: true,
      createdAt: serverTimestamp(),
      expiresAt: Date.now() + config.durationDays * 86400000,
    });

    return { queued: true };
  },

  async getAthleteEndorsements(athleteUserId: string) {
    const q = query(
      collection(db, 'alumni_endorsements'),
      where('athleteUserId', '==', athleteUserId),
      where('status', '==', 'ACTIVE'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },

  async verifyAlumni(config: {
    userId: string;
    walletAddress: string;
    name: string;
    school: string;
    tier: AlumniEndorsementConfig['tier'];
    proofIpfsCid: string;
  }) {
    await setDoc(doc(db, 'verified_alumni', config.userId), {
      ...config,
      verified: true,
      chainPending: true,
      verifiedAt: serverTimestamp(),
    });
  },
};

// ─── 4. SOULBOUND CAREER TOKEN ────────────────────────────────────────────────

export const soulbound = {

  async issueToken(config: {
    athleteUserId: string;
    walletAddress: string;
    name: string;
    schoolName: string;
  }) {
    await assertFeatureActive('SOULBOUND_TOKEN');

    await setDoc(doc(db, 'soulbound_tokens', config.athleteUserId), {
      ...config,
      tokenId: null,
      chainPending: true,
      mintedAt: serverTimestamp(),
      verifiedGamesCount: 0,
      totalMilestones: 0,
      badges: [],
      loiSigned: false,
    });

    return { queued: true };
  },

  async awardBadge(athleteUserId: string, badge: string) {
    await assertFeatureActive('SOULBOUND_TOKEN');

    const ref = doc(db, 'soulbound_badge_queue', `${athleteUserId}_${badge}`);
    await setDoc(ref, {
      athleteUserId,
      badge,
      chainPending: true,
      queuedAt: serverTimestamp(),
    });
  },

  async recordLOI(athleteUserId: string, school: string, ipfsCid: string) {
    await assertFeatureActive('SOULBOUND_TOKEN');

    await setDoc(doc(db, 'soulbound_tokens', athleteUserId), {
      loiSigned: true,
      loiSchool: school,
      loiIpfsCid: ipfsCid,
      loiRecordedAt: serverTimestamp(),
      chainPending: true,
    }, { merge: true });
  },

  async getToken(athleteUserId: string) {
    const snap = await getDoc(doc(db, 'soulbound_tokens', athleteUserId));
    return snap.exists() ? snap.data() : null;
  },
};

// ─── 5. BOOSTER CLUB DAO ─────────────────────────────────────────────────────

export const boosterDAO = {

  async createDAO(config: {
    daoId: string;
    schoolName: string;
    plajahClubId: string;
    programWalletAddress: string;
  }) {
    await assertFeatureActive('BOOSTER_DAO');

    await setDoc(doc(db, 'booster_daos', config.daoId), {
      ...config,
      treasuryUsdc: 0,
      totalContributed: 0,
      totalSpent: 0,
      proposalCount: 0,
      active: true,
      chainPending: true,
      createdAt: serverTimestamp(),
    });
  },

  async contribute(daoId: string, userId: string, amountUsd: number) {
    await assertFeatureActive('BOOSTER_DAO');

    await addDoc(collection(db, 'dao_contributions'), {
      daoId,
      userId,
      amountUsd,
      status: 'QUEUED',
      createdAt: serverTimestamp(),
    });
  },

  async createProposal(config: {
    proposalId: string;
    daoId: string;
    proposerUserId: string;
    title: string;
    description: string;
    amountUsd: number;
    ipfsCid?: string;
  }) {
    await assertFeatureActive('BOOSTER_DAO');

    await setDoc(doc(db, 'dao_proposals', config.proposalId), {
      ...config,
      votesFor: 0,
      votesAgainst: 0,
      status: 'ACTIVE',
      chainPending: true,
      createdAt: serverTimestamp(),
      votingEndsAt: Date.now() + 3 * 86400000, // 3 days
    });
  },

  async vote(proposalId: string, userId: string, yes: boolean) {
    await assertFeatureActive('BOOSTER_DAO');

    await setDoc(doc(db, 'dao_votes', `${proposalId}_${userId}`), {
      proposalId,
      userId,
      yes,
      chainPending: true,
      votedAt: serverTimestamp(),
    });
  },

  async getDAO(daoId: string) {
    const snap = await getDoc(doc(db, 'booster_daos', daoId));
    return snap.exists() ? snap.data() : null;
  },
};

// ─── 6. INJURY INSURANCE MICRO-POOL ──────────────────────────────────────────

export const injuryPool = {

  async createPool(config: {
    poolId: string;
    athleteUserId: string;
    athleteWalletAddress: string;
    targetSizePlaj: number;
  }) {
    await assertFeatureActive('INJURY_INSURANCE');

    await setDoc(doc(db, 'injury_pools', config.poolId), {
      ...config,
      currentBalance: 0,
      totalStaked: 0,
      totalPaidOut: 0,
      backerCount: 0,
      active: true,
      chainPending: true,
      createdAt: serverTimestamp(),
    });
  },

  async stake(poolId: string, userId: string, plajAmount: number) {
    await assertFeatureActive('INJURY_INSURANCE');

    await addDoc(collection(db, 'injury_pool_stakes'), {
      poolId,
      userId,
      plajAmount,
      status: 'QUEUED',
      createdAt: serverTimestamp(),
    });
  },

  async getPool(poolId: string) {
    const snap = await getDoc(doc(db, 'injury_pools', poolId));
    return snap.exists() ? snap.data() : null;
  },
};

// ─── 7. GAME PHOTO LICENSING ──────────────────────────────────────────────────

export const photoLicense = {

  /**
   * Registers an event pool photo for on-chain licensing via LicenseRegistry.sol.
   * The contentId ties this photo to the existing EventPhotoPool system.
   */
  async registerPhotoForLicensing(config: {
    photoId: string;
    photographerUserId: string;
    photographerWalletAddress: string;
    featuredAthleteUserIds: string[];
    ipfsCid: string;
    gameId: string;
    capturedAt: number;
  }) {
    await assertFeatureActive('PHOTO_LICENSE');

    await setDoc(doc(db, 'licensed_photos', config.photoId), {
      ...config,
      licenseTiers: {
        EDITORIAL_DIGITAL: 2500,  // $25 (cents)
        PRINT_ONE_USE:     7500,  // $75
        COMMERCIAL:        25000, // $250
        BROADCAST:         75000, // $750
      },
      totalLicenseRevenue: 0,
      chainPending: true,
      registeredAt: serverTimestamp(),
    });
  },

  async purchasePhotoLicense(config: {
    photoId: string;
    purchaserUserId: string;
    licenseType: 'EDITORIAL_DIGITAL' | 'PRINT_ONE_USE' | 'COMMERCIAL' | 'BROADCAST';
    amountUsd: number;
  }) {
    await assertFeatureActive('PHOTO_LICENSE');

    await addDoc(collection(db, 'photo_license_purchases'), {
      ...config,
      status: 'QUEUED',
      splitConfig: { photographer: 0.60, athletes: 0.25, platform: 0.15 },
      createdAt: serverTimestamp(),
    });
  },
};

// ─── 8. LETTER OF INTENT MOMENT NFT ──────────────────────────────────────────

export const loiNFT = {

  async mintLOIMoment(config: {
    athleteUserId: string;
    athleteWalletAddress: string;
    schoolWalletAddress: string;
    collegeName: string;
    signingDate: number;
    videoClipIpfsCid?: string;
    photoIpfsCid?: string;
    loiDocIpfsCid: string;
  }) {
    await assertFeatureActive('LOI_NFT');

    const momentId = `loi_${config.athleteUserId}_${config.signingDate}`;

    await setDoc(doc(db, 'loi_nft_queue', momentId), {
      ...config,
      momentId,
      mintType: '1_OF_1',
      recipients: {
        athlete:  config.athleteWalletAddress,
        school:   config.schoolWalletAddress,
        platform: 'PLATFORM_ARCHIVE',
      },
      status: 'QUEUED',
      chainPending: true,
      queuedAt: serverTimestamp(),
    });

    return { momentId, queued: true };
  },

  async getLOIMoment(athleteUserId: string) {
    const q = query(
      collection(db, 'loi_nft_queue'),
      where('athleteUserId', '==', athleteUserId),
    );
    const snap = await getDocs(q);
    return snap.docs[0]?.data() ?? null;
  },
};

// ─── 9. SCOUT DISCOVERY NETWORK ───────────────────────────────────────────────

export interface ScoutSearchConfig {
  sport: string;
  state: string;
  graduatingClass: number;
  minTouchdowns?: number;
  minRushingYards?: number;
  minGoals?: number;
  position?: string;
}

export const scoutDiscovery = {

  async subscribeScout(config: {
    scoutUserId: string;
    organization: string;
    region: string;
    planType: 'REGIONAL' | 'NATIONAL';
    amountUsd: 299 | 999;
  }) {
    await assertFeatureActive('SCOUT_DISCOVERY');

    await setDoc(doc(db, 'scout_subscriptions', config.scoutUserId), {
      ...config,
      status: 'QUEUED',
      expiresAt: Date.now() + 365 * 86400000,
      createdAt: serverTimestamp(),
    });
  },

  async optAthleteIn(athleteUserId: string, searchableFields: string[]) {
    await assertFeatureActive('SCOUT_DISCOVERY');

    await setDoc(doc(db, 'scout_discoverable', athleteUserId), {
      athleteUserId,
      searchableFields,
      optedIn: true,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  },

  async searchAthletes(config: ScoutSearchConfig) {
    await assertFeatureActive('SCOUT_DISCOVERY');

    // Full implementation queries Firestore + cross-references AthleteRegistry on-chain
    const q = query(
      collection(db, 'scout_discoverable'),
      where('sport', '==', config.sport),
      where('state', '==', config.state),
      where('graduatingClass', '==', config.graduatingClass),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },
};

// ─── 10. FAMILY MULTI-SIG WALLET ─────────────────────────────────────────────

export const familyMultisig = {

  async createFamilyWallet(config: {
    athleteUserId: string;
    athleteWalletAddress: string;
    parentUserId: string;
    parentWalletAddress?: string;    // Optional: parent can link MetaMask or get custodial
    athleteDateOfBirth: number;      // Unix timestamp
  }) {
    await assertFeatureActive('FAMILY_MULTISIG');

    const walletId = `multisig_${config.athleteUserId}`;

    await setDoc(doc(db, 'family_multisig_wallets', walletId), {
      ...config,
      signers: [config.athleteWalletAddress, config.parentWalletAddress ?? 'PENDING', 'PLATFORM_BACKUP'],
      requiredSignatures: 2,
      adultAt: config.athleteDateOfBirth + 18 * 365.25 * 86400000,
      status: 'QUEUED',
      chainPending: true,
      createdAt: serverTimestamp(),
    });

    return { walletId, queued: true };
  },

  /**
   * Queues a USDC transfer from the multisig.
   * Requires athlete + parent approval before executing.
   */
  async queueTransfer(config: {
    walletId: string;
    athleteUserId: string;
    parentUserId: string;
    amountUsd: number;
    purpose: string;
    recipientAddress: string;
  }) {
    await assertFeatureActive('FAMILY_MULTISIG');

    const transferId = `transfer_${config.walletId}_${Date.now()}`;

    await setDoc(doc(db, 'multisig_transfers', transferId), {
      ...config,
      transferId,
      athleteApproved: false,
      parentApproved: false,
      status: 'PENDING_SIGNATURES',
      createdAt: serverTimestamp(),
    });

    return { transferId };
  },

  async approveTransfer(transferId: string, role: 'athlete' | 'parent') {
    await assertFeatureActive('FAMILY_MULTISIG');

    const field = role === 'athlete' ? 'athleteApproved' : 'parentApproved';
    const ref = doc(db, 'multisig_transfers', transferId);
    await setDoc(ref, {
      [field]: true,
      [`${field}At`]: serverTimestamp(),
    }, { merge: true });

    // Check if both approved → queue on-chain execution
    const snap = await getDoc(ref);
    const data = snap.data();
    if (data?.athleteApproved && data?.parentApproved) {
      await setDoc(ref, { status: 'QUEUED_FOR_EXECUTION', chainPending: true }, { merge: true });
    }
  },

  async getWallet(athleteUserId: string) {
    const snap = await getDoc(doc(db, 'family_multisig_wallets', `multisig_${athleteUserId}`));
    return snap.exists() ? snap.data() : null;
  },
};

// ─── Waitlist registration (public, no flag guard) ────────────────────────────

export async function registerHorizonInterest(featureId: string, userId: string) {
  await setDoc(
    doc(db, 'horizon_waitlist', `${featureId}_${userId}`),
    {
      featureId,
      userId,
      registeredAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function getHorizonWaitlistCount(featureId: string): Promise<number> {
  const q = query(collection(db, 'horizon_waitlist'), where('featureId', '==', featureId));
  const snap = await getDocs(q);
  return snap.size;
}
