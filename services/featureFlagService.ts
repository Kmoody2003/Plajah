/**
 * Plajah Feature Flag Service — Web3 / Blockchain Features
 *
 * All Web3 features are OFF by default for all users.
 * Admins can enable features for preview via AdminWeb3Dashboard.
 * Each flag has a rollout percentage: 0 = admin-only, 100 = all users.
 *
 * Flags are persisted in Firebase under:
 *   /config/featureFlags/{flagName}
 *
 * Never expose this to frontend users directly.
 * Use isFeatureEnabled(flagName, userId) at the point of rendering.
 */

import { db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { onSnapshot } from './safeSnapshot';

// ─── Flag Names ────────────────────────────────────────────────────────────────

export type Web3FlagName =
  | 'WEB3_CREATION_CERTIFICATES'   // Phase 1: Bitcoin Ordinal inscriptions
  | 'WEB3_MUSIC_NFTS'              // Phase 1: Music ownership NFT minting
  | 'WEB3_CONTENT_NFTS'           // Phase 1: Film/Book/TV/IP NFT minting
  | 'WEB3_CUSTODIAL_WALLETS'      // Phase 1: Auto-create wallets at signup
  | 'WEB3_LICENSING_MUSIC'        // Phase 2: On-chain sync licensing for music
  | 'WEB3_LICENSING_FILM'         // Phase 2: On-chain film distribution licensing
  | 'WEB3_LICENSING_BOOKS'        // Phase 2: On-chain translation/adaptation rights
  | 'WEB3_LICENSING_IPWORLDS'     // Phase 2: IP World character/universe licensing
  | 'WEB3_FRACTIONAL_MUSIC'       // Phase 3: Fan investment in track royalties
  | 'WEB3_FRACTIONAL_FILM'        // Phase 3: Film production investment shares
  | 'WEB3_FRACTIONAL_BOOKS'       // Phase 3: Book rights fractionalization
  | 'WEB3_LIGHTNING_TIPS'         // Phase 4: Micropayments while streaming
  | 'WEB3_COLLAB_CONTRACTS'       // Phase 3: Multi-creator revenue splits
  | 'WEB3_DEFI_ADVANCES'          // Phase 5: Creator advances against royalties
  | 'WEB3_PLAJ_TOKEN'             // Phase 5: PLAJ utility token
  | 'WEB3_DECENTRALIZED_NODES'    // Phase 5: User IPFS nodes
  | 'WEB3_ADMIN_DASHBOARD';       // Always admin-only: the control panel itself

export type FeaturePhase = 0 | 1 | 2 | 3 | 4 | 5;

export interface FeatureFlag {
  name: Web3FlagName;
  enabled: boolean;
  adminOnly: boolean;
  rolloutPercentage: number;     // 0–100; 0 = admin preview, 100 = all users
  phase: FeaturePhase;
  vertical: 'MUSIC' | 'FILM' | 'BOOKS' | 'JOURNALISM' | 'TALEO' | 'RELLO' | 'LOREA' | 'IPWORLDS' | 'ALL';
  label: string;
  description: string;
  updatedAt?: Date;
  updatedBy?: string;
}

// ─── Default Flag Configurations ──────────────────────────────────────────────
// All disabled, all admin-only at launch.

export const DEFAULT_FLAGS: Record<Web3FlagName, FeatureFlag> = {
  WEB3_ADMIN_DASHBOARD: {
    name: 'WEB3_ADMIN_DASHBOARD',
    enabled: true,            // admin dashboard always on for admins
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 0,
    vertical: 'ALL',
    label: 'Web3 Admin Dashboard',
    description: 'Admin control panel for all Web3 features. Always admin-only.',
  },
  WEB3_CUSTODIAL_WALLETS: {
    name: 'WEB3_CUSTODIAL_WALLETS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 1,
    vertical: 'ALL',
    label: 'Custodial Wallets',
    description: 'Auto-create Polygon wallets for new users at signup.',
  },
  WEB3_CREATION_CERTIFICATES: {
    name: 'WEB3_CREATION_CERTIFICATES',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 1,
    vertical: 'ALL',
    label: 'Creation Certificates',
    description: 'Inscribe creative work hashes on Bitcoin Ordinals for permanent authorship proof.',
  },
  WEB3_MUSIC_NFTS: {
    name: 'WEB3_MUSIC_NFTS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 1,
    vertical: 'MUSIC',
    label: 'Music Ownership NFTs',
    description: 'Mint ERC-1155 NFTs for music tracks on Polygon.',
  },
  WEB3_CONTENT_NFTS: {
    name: 'WEB3_CONTENT_NFTS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 1,
    vertical: 'ALL',
    label: 'Content Ownership NFTs',
    description: 'Mint ownership NFTs for Film, Books, TV Series, IP Worlds.',
  },
  WEB3_LICENSING_MUSIC: {
    name: 'WEB3_LICENSING_MUSIC',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 2,
    vertical: 'MUSIC',
    label: 'Music On-Chain Licensing',
    description: 'Smart contract sync/commercial/performance licensing for music.',
  },
  WEB3_LICENSING_FILM: {
    name: 'WEB3_LICENSING_FILM',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 2,
    vertical: 'FILM',
    label: 'Film Distribution Licensing',
    description: 'On-chain broadcast, streaming, and international distribution licensing.',
  },
  WEB3_LICENSING_BOOKS: {
    name: 'WEB3_LICENSING_BOOKS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 2,
    vertical: 'BOOKS',
    label: 'Book Rights Licensing',
    description: 'On-chain translation, adaptation, and audiobook rights.',
  },
  WEB3_LICENSING_IPWORLDS: {
    name: 'WEB3_LICENSING_IPWORLDS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 2,
    vertical: 'IPWORLDS',
    label: 'IP Worlds Licensing',
    description: 'Character and universe licensing for games, merch, and cross-platform use.',
  },
  WEB3_FRACTIONAL_MUSIC: {
    name: 'WEB3_FRACTIONAL_MUSIC',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 3,
    vertical: 'MUSIC',
    label: 'Music Fan Investment',
    description: 'Fractional track royalty ownership sold to fans via smart contract.',
  },
  WEB3_FRACTIONAL_FILM: {
    name: 'WEB3_FRACTIONAL_FILM',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 3,
    vertical: 'FILM',
    label: 'Film Investment Shares',
    description: 'Pre-production fractional investment for independent films.',
  },
  WEB3_FRACTIONAL_BOOKS: {
    name: 'WEB3_FRACTIONAL_BOOKS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 3,
    vertical: 'BOOKS',
    label: 'Book Rights Investment',
    description: 'Fractional ownership of book rights for fans and investors.',
  },
  WEB3_COLLAB_CONTRACTS: {
    name: 'WEB3_COLLAB_CONTRACTS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 3,
    vertical: 'ALL',
    label: 'Collaborative Ownership Contracts',
    description: 'Multi-creator smart contracts with automatic revenue splitting.',
  },
  WEB3_LIGHTNING_TIPS: {
    name: 'WEB3_LIGHTNING_TIPS',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 4,
    vertical: 'ALL',
    label: 'Lightning Micropayments',
    description: 'Real-time Bitcoin Lightning tips to creators while consuming content.',
  },
  WEB3_DEFI_ADVANCES: {
    name: 'WEB3_DEFI_ADVANCES',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 5,
    vertical: 'ALL',
    label: 'Creator DeFi Advances',
    description: 'Creator advances against verified royalty history, repaid via smart contract.',
  },
  WEB3_PLAJ_TOKEN: {
    name: 'WEB3_PLAJ_TOKEN',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 5,
    vertical: 'ALL',
    label: 'PLAJ Utility Token',
    description: 'Platform utility token: earn for contributing, spend across verticals.',
  },
  WEB3_DECENTRALIZED_NODES: {
    name: 'WEB3_DECENTRALIZED_NODES',
    enabled: false,
    adminOnly: true,
    rolloutPercentage: 0,
    phase: 5,
    vertical: 'ALL',
    label: 'Decentralized Node Network',
    description: 'User IPFS nodes for content delivery. Earn PLAJ for bandwidth/storage.',
  },
};

// ─── In-memory cache (updated via Firestore listener) ─────────────────────────

let _flagCache: Record<Web3FlagName, FeatureFlag> = { ...DEFAULT_FLAGS };
let _cacheInitialized = false;

export function initFeatureFlagListener(): () => void {
  const flagsRef = doc(db, 'config', 'featureFlags');
  const unsubscribe = onSnapshot(flagsRef, (snap) => {
    if (snap.exists()) {
      const data = snap.data() as Record<string, Partial<FeatureFlag>>;
      for (const key of Object.keys(DEFAULT_FLAGS) as Web3FlagName[]) {
        if (data[key]) {
          _flagCache[key] = { ...DEFAULT_FLAGS[key], ...data[key] };
        }
      }
    }
    _cacheInitialized = true;
  });
  return unsubscribe;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a Web3 feature is visible to a given user.
 * Admins see everything with rolloutPercentage >= 0.
 * Regular users only see features that are enabled and past their rollout %.
 */
export function isFeatureEnabled(
  flagName: Web3FlagName,
  userId: string,
  isAdmin: boolean,
): boolean {
  const flag = _flagCache[flagName] ?? DEFAULT_FLAGS[flagName];
  if (!flag.enabled) return false;
  if (flag.adminOnly) return isAdmin;
  if (isAdmin) return true;
  // Deterministic rollout: hash userId to a stable 0–99 bucket
  const bucket = deterministicBucket(userId);
  return bucket < flag.rolloutPercentage;
}

export function getFlag(flagName: Web3FlagName): FeatureFlag {
  return _flagCache[flagName] ?? DEFAULT_FLAGS[flagName];
}

export function getAllFlags(): FeatureFlag[] {
  return Object.values(_flagCache);
}

export function getFlagsByPhase(phase: FeaturePhase): FeatureFlag[] {
  return getAllFlags().filter(f => f.phase === phase);
}

/**
 * Update a flag — admin only (enforce in your API route).
 * Merges the update into Firestore; listener propagates to all instances.
 */
export async function updateFlag(
  flagName: Web3FlagName,
  update: Partial<Pick<FeatureFlag, 'enabled' | 'adminOnly' | 'rolloutPercentage'>>,
  adminId: string,
): Promise<void> {
  const flagsRef = doc(db, 'config', 'featureFlags');
  const existing = (await getDoc(flagsRef)).data() ?? {};
  await setDoc(flagsRef, {
    ...existing,
    [flagName]: {
      ...(existing[flagName] ?? DEFAULT_FLAGS[flagName]),
      ...update,
      updatedAt: serverTimestamp(),
      updatedBy: adminId,
    },
  });
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function deterministicBucket(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash % 100;
}
