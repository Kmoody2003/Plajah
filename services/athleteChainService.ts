/**
 * Plajah Athlete Chain Service
 *
 * TypeScript integration layer for AthleteRegistry.sol.
 * Bridges the sports broadcast layer (sportscastService) with the blockchain,
 * creating a permanent, verifiable career record for every athlete.
 *
 * WHAT THIS SERVICE DOES
 * ─────────────────────
 * 1. registerAthleteOnChain()  — Creates on-chain profile when athlete enables Sports mode
 * 2. openGameOnChain()         — Opens a game record tied to the live feed ID
 * 3. recordHighlightOnChain()  — Writes verified stat event (called on highlight push)
 * 4. mintHighlightNFT()        — Mints limited edition NFT from a highlight event
 * 5. createNILDeal()           — Brand posts performance-conditional USDC escrow
 * 6. pledgeScholarFund()       — Community pledges toward athlete milestone fund
 * 7. mintPlajMilestoneReward() — Awards PLAJ tokens for career achievements
 * 8. purchaseStatLicense()     — Scout/college pays for full verified stat package
 * 9. getChainCareerStats()     — Reads on-chain career record
 * 10. getAthleteHighlightNFTs() — Returns all minted highlight NFTs
 *
 * MONEY FLOWS (all USDC on Polygon)
 * ───────────────────────────────────
 * Highlight NFT sale:   70% athlete | 20% school program | 10% Plajah
 * NIL deal completion:  90% athlete | 5% school | 5% Plajah (auto-released by contract)
 * Stat license sale:    80% athlete | 10% school | 10% Plajah (via LicenseRegistry.sol)
 * Scholar fund release: 100% athlete (when platform verifies milestone)
 * Secondary NFT sales:  7.5% royalty → athlete (ERC-2981)
 */

import { db } from './firebase';
import { doc, setDoc, getDoc, collection, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { HighlightEvent, GameState } from './sportscastService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AthleteChainProfile {
  plajahUserId: string;
  walletAddress: string;
  schoolWalletAddress: string;
  sport: string;
  graduatingClass: number;
  name: string;
  schoolName: string;
  chainRegistered: boolean;
  registrationTxHash?: string;
  registeredAt?: number;
}

export interface ChainStatEvent {
  eventId: string;           // keccak256-style hex (built from feedId+timestamp+type)
  gameId: string;
  athleteUserId: string;
  statType: AthleteStatType;
  value: number;
  videoIpfsCid: string;
  txHash?: string;
  blockTimestamp?: number;
  verified: boolean;
}

export interface HighlightNFTMeta {
  tokenId: string;
  eventId: string;
  athleteUserId: string;
  maxEditions: number;
  priceUsdc: number;         // in cents — $25.00 = 2500
  metadataIpfsCid: string;
  txHash: string;
  mintedAt: number;
  sport: string;
  statType: string;
  clipIpfsCid: string;
}

export interface NILDealConfig {
  dealId: string;
  athleteUserId: string;
  brandName: string;
  brandWallet: string;
  amountUsdc: number;        // in cents
  statType: AthleteStatType;
  threshold: number;         // stat value to trigger release
  windowEndDate: Date;
  conditionsText: string;    // full legal description
}

export interface ScholarFundPledge {
  fundId: string;
  athleteUserId: string;
  pledgerUserId: string;
  amountUsdc: number;
  milestoneDescription: string;
}

// Mirrors AthleteRegistry.sol StatEventType enum
export enum AthleteStatType {
  TOUCHDOWN        = 0,
  FIELD_GOAL       = 1,
  SAFETY           = 2,
  TWO_POINT        = 3,
  RUSHING_YARDS    = 4,
  PASSING_YARDS    = 5,
  RECEIVING_YARDS  = 6,
  INTERCEPTION     = 7,
  BASKET_2PT       = 8,
  BASKET_3PT       = 9,
  FREE_THROW       = 10,
  REBOUND          = 11,
  ASSIST           = 12,
  STEAL            = 13,
  BLOCK            = 14,
  GOAL             = 15,
  ASSIST_SOCCER    = 16,
  SAVE             = 17,
  HOME_RUN         = 18,
  RBI              = 19,
  HIT              = 20,
  STRIKEOUT        = 21,
  GOAL_HOCKEY      = 22,
  ASSIST_HOCKEY    = 23,
  SAVE_HOCKEY      = 24,
  MILESTONE        = 25,
}

// Maps sportscastService HighlightType to on-chain StatEventType
const HIGHLIGHT_TO_STAT: Record<string, AthleteStatType> = {
  TOUCHDOWN:    AthleteStatType.TOUCHDOWN,
  GOAL:         AthleteStatType.GOAL,
  THREE_POINTER:AthleteStatType.BASKET_3PT,
  HOME_RUN:     AthleteStatType.HOME_RUN,
  INTERCEPTION: AthleteStatType.INTERCEPTION,
  SAVE:         AthleteStatType.SAVE,
  BIG_PLAY:     AthleteStatType.MILESTONE,
  CUSTOM:       AthleteStatType.MILESTONE,
};

// PLAJ token rewards by milestone (in PLAJ units, 18 decimals applied by contract)
const PLAJ_REWARDS: Record<string, number> = {
  TOUCHDOWN:    200,
  GOAL:         200,
  THREE_POINTER:100,
  HOME_RUN:     200,
  INTERCEPTION: 150,
  SAVE:         100,
  BIG_PLAY:     75,
  MILESTONE:    50,
};

// ─── Contract addresses ───────────────────────────────────────────────────────

const CONTRACTS = {
  ATHLETE_REGISTRY: () => import.meta.env.VITE_CONTRACT_ATHLETE_REGISTRY ?? '',
  PLAJ_TOKEN:       () => import.meta.env.VITE_CONTRACT_PLAJ_TOKEN ?? '',
  LICENSE_REGISTRY: () => import.meta.env.VITE_CONTRACT_LICENSE_REGISTRY ?? '',
};

const POLYGON_RPC = import.meta.env.PROD
  ? (import.meta.env.VITE_POLYGON_RPC_URL ?? 'https://polygon-rpc.com')
  : 'https://rpc-mumbai.maticvigil.com';

const EXPLORER = import.meta.env.PROD
  ? 'https://polygonscan.com/tx/'
  : 'https://mumbai.polygonscan.com/tx/';

// ─── ABI fragments (minimal — only what we call) ─────────────────────────────

const REGISTRY_ABI = [
  'function registerAthlete(address,string,string,string,address,uint8,uint16) external',
  'function openGame(bytes32,string,string,uint8) external',
  'function verifyGame(bytes32) external',
  'function recordStatEvent(bytes32,bytes32,address,uint8,uint16,bytes32,string) external',
  'function mintHighlightNFT(bytes32,uint256,uint256,string) external returns (uint256)',
  'function purchaseHighlightNFT(uint256,uint256) external',
  'function createNILDeal(bytes32,address,uint256,uint8,uint16,uint256,string) external',
  'function pledgeToScholarFund(bytes32,address,uint256,string) external',
  'function releaseScholarFund(bytes32) external',
  'function getCareerStat(address,uint8) external view returns (uint32)',
  'function getAthleteEventIds(address) external view returns (bytes32[])',
  'function athletes(address) external view returns (address,string,string,string,address,uint8,uint16,bool,uint256,uint256,uint256)',
  'event StatRecorded(bytes32 indexed,bytes32 indexed,address indexed,uint8,uint16)',
  'event HighlightNFTMinted(uint256 indexed,bytes32 indexed,address indexed,uint256,uint256)',
  'event NILDealFulfilled(bytes32 indexed,address indexed,uint256)',
];

const PLAJ_ABI = [
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address) external view returns (uint256)',
];

// ─── Ethers provider factory ──────────────────────────────────────────────────

async function getPlatformSigner() {
  const { ethers } = await import('ethers');
  const privateKey = import.meta.env.VITE_PLATFORM_SIGNER_KEY;
  if (!privateKey) throw new Error('[AthleteChain] VITE_PLATFORM_SIGNER_KEY not set');
  const provider = new ethers.JsonRpcProvider(POLYGON_RPC);
  return new ethers.Wallet(privateKey, provider);
}

async function getRegistryContract() {
  const { ethers } = await import('ethers');
  const signer = await getPlatformSigner();
  return new ethers.Contract(CONTRACTS.ATHLETE_REGISTRY(), REGISTRY_ABI, signer);
}

async function getPlajContract() {
  const { ethers } = await import('ethers');
  const signer = await getPlatformSigner();
  return new ethers.Contract(CONTRACTS.PLAJ_TOKEN(), PLAJ_ABI, signer);
}

// ─── ID helpers ──────────────────────────────────────────────────────────────

function buildEventId(feedId: string, timestamp: number, statType: string): string {
  // Simple deterministic ID — in production use ethers.keccak256
  const raw = `${feedId}:${timestamp}:${statType}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
}

function buildGameId(feedId: string): string {
  const raw = `game:${feedId}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

const athleteChainRef = (uid: string) =>
  doc(db, 'athlete_chain_profiles', uid);

const chainStatRef = (eventId: string) =>
  doc(db, 'chain_stat_events', eventId);

const nftRef = () => collection(db, 'athlete_highlight_nfts');

const nilDealRef = (dealId: string) =>
  doc(db, 'nil_deals', dealId);

const scholarFundRef = (fundId: string) =>
  doc(db, 'scholar_funds', fundId);

// ─── 1. Athlete Registration ──────────────────────────────────────────────────

/**
 * Register an athlete on-chain and in Firestore.
 * Called when athlete enables Sports Profile in their settings.
 */
export async function registerAthleteOnChain(config: {
  plajahUserId: string;
  walletAddress: string;
  schoolWalletAddress: string;
  name: string;
  schoolName: string;
  sport: number;           // AthleteRegistry.Sport enum value
  graduatingClass: number;
}): Promise<{ txHash: string; explorerUrl: string }> {
  const registry = await getRegistryContract();

  const tx = await registry.registerAthlete(
    config.walletAddress,
    config.plajahUserId,
    config.name,
    config.schoolName,
    config.schoolWalletAddress,
    config.sport,
    config.graduatingClass,
  );
  const receipt = await tx.wait();

  // Mirror in Firestore
  await setDoc(athleteChainRef(config.plajahUserId), {
    ...config,
    chainRegistered: true,
    registrationTxHash: receipt.hash,
    registeredAt: Date.now(),
    updatedAt: serverTimestamp(),
  });

  return { txHash: receipt.hash, explorerUrl: `${EXPLORER}${receipt.hash}` };
}

// ─── 2. Game Session ─────────────────────────────────────────────────────────

export async function openGameOnChain(feedId: string, opponentName: string, sportEnum: number) {
  const registry = await getRegistryContract();
  const gameId   = buildGameId(feedId);
  const tx = await registry.openGame(gameId, feedId, opponentName, sportEnum);
  await tx.wait();
  return { gameId, txHash: tx.hash };
}

export async function verifyGameOnChain(feedId: string) {
  const registry = await getRegistryContract();
  const gameId   = buildGameId(feedId);
  const tx = await registry.verifyGame(gameId);
  const receipt = await tx.wait();
  return { txHash: receipt.hash };
}

// ─── 3. Stat Event Recording ──────────────────────────────────────────────────

/**
 * Record a highlight stat event on-chain.
 * Called automatically when producer pushes a highlight in SportsProducerPanel.
 *
 * @param feedId         Plajah live feed doc ID
 * @param athleteUserId  Plajah UID of the athlete
 * @param highlight      HighlightEvent from sportscastService
 * @param gameState      Current game state (for context)
 * @param videoIpfsCid   IPFS CID of the highlight clip (if archived)
 */
export async function recordHighlightOnChain(
  feedId: string,
  athleteUserId: string,
  highlight: HighlightEvent,
  gameState: GameState,
  videoIpfsCid = ''
): Promise<ChainStatEvent | null> {
  // Look up athlete's wallet
  const profileSnap = await getDoc(athleteChainRef(athleteUserId));
  if (!profileSnap.exists()) return null;
  const profile = profileSnap.data() as AthleteChainProfile;
  if (!profile.chainRegistered) return null;

  const statType   = HIGHLIGHT_TO_STAT[highlight.type] ?? AthleteStatType.MILESTONE;
  const gameId     = buildGameId(feedId);
  const eventId    = buildEventId(feedId, highlight.timestamp, highlight.type);
  const clipHash   = videoIpfsCid
    ? `0x${Array.from(new TextEncoder().encode(videoIpfsCid))
        .map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 64).padStart(64, '0')}`
    : `0x${'0'.repeat(64)}`;

  const registry = await getRegistryContract();
  const tx = await registry.recordStatEvent(
    eventId,
    gameId,
    profile.walletAddress,
    statType,
    1,              // default value 1 per event (compound events pass actual value separately)
    clipHash,
    videoIpfsCid,
  );
  const receipt = await tx.wait();

  const statEvent: ChainStatEvent = {
    eventId,
    gameId,
    athleteUserId,
    statType,
    value: 1,
    videoIpfsCid,
    txHash: receipt.hash,
    blockTimestamp: Date.now(),
    verified: true,
  };

  // Persist to Firestore (fast lookup without querying chain)
  await setDoc(chainStatRef(eventId), {
    ...statEvent,
    explorerUrl: `${EXPLORER}${receipt.hash}`,
    highlightType: highlight.type,
    feedId,
    sport: gameState.sport,
    createdAt: serverTimestamp(),
  });

  // Award PLAJ milestone tokens
  const plajAmount = PLAJ_REWARDS[highlight.type] ?? 50;
  mintPlajMilestoneReward(profile.walletAddress, plajAmount).catch(() => {});

  return statEvent;
}

// ─── 4. Highlight NFT Minting ─────────────────────────────────────────────────

export interface MintNFTConfig {
  eventId: string;
  athleteUserId: string;
  maxEditions: number;      // Recommend: 25 (rare) to 250 (common)
  priceUsd: number;         // e.g. 9.99
  metadataIpfsCid: string;  // Assembled off-chain by platform
  clipIpfsCid: string;
  sport: string;
  statType: string;
}

export async function mintHighlightNFT(config: MintNFTConfig): Promise<HighlightNFTMeta> {
  const registry   = await getRegistryContract();
  const priceUsdc  = BigInt(Math.round(config.priceUsd * 1_000_000)); // 6 decimals
  const maxEditions = BigInt(config.maxEditions);

  const tx = await registry.mintHighlightNFT(
    config.eventId,
    maxEditions,
    priceUsdc,
    config.metadataIpfsCid,
  );
  const receipt  = await tx.wait();

  // Extract tokenId from HighlightNFTMinted event
  const { ethers } = await import('ethers');
  const iface = new ethers.Interface(REGISTRY_ABI);
  let tokenId = '0';
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === 'HighlightNFTMinted') {
        tokenId = parsed.args[0].toString();
        break;
      }
    } catch {}
  }

  const nftMeta: HighlightNFTMeta = {
    tokenId,
    eventId:       config.eventId,
    athleteUserId: config.athleteUserId,
    maxEditions:   config.maxEditions,
    priceUsdc:     config.priceUsd * 100,  // cents for display
    metadataIpfsCid: config.metadataIpfsCid,
    clipIpfsCid:   config.clipIpfsCid,
    txHash:        receipt.hash,
    mintedAt:      Date.now(),
    sport:         config.sport,
    statType:      config.statType,
  };

  // Store in Firestore so the UI can fetch without querying the chain
  await addDoc(nftRef(), {
    ...nftMeta,
    explorerUrl: `${EXPLORER}${receipt.hash}`,
    createdAt: serverTimestamp(),
  });

  return nftMeta;
}

// ─── 5. NIL Deal Creation ─────────────────────────────────────────────────────

export async function createNILDeal(config: NILDealConfig): Promise<{ txHash: string }> {
  const profileSnap = await getDoc(athleteChainRef(config.athleteUserId));
  if (!profileSnap.exists()) throw new Error('Athlete not registered on chain');

  const profile = profileSnap.data() as AthleteChainProfile;
  const registry = await getRegistryContract();
  const amountUsdc = BigInt(Math.round(config.amountUsdc * 10_000)); // cents → 6 decimals

  const tx = await registry.createNILDeal(
    `0x${config.dealId.replace(/-/g, '').padStart(64, '0')}`,
    profile.walletAddress,
    amountUsdc,
    config.statType,
    config.threshold,
    Math.floor(config.windowEndDate.getTime() / 1000),
    config.conditionsText,
  );
  const receipt = await tx.wait();

  await setDoc(nilDealRef(config.dealId), {
    ...config,
    status: 'ACTIVE',
    txHash: receipt.hash,
    explorerUrl: `${EXPLORER}${receipt.hash}`,
    createdAt: serverTimestamp(),
  });

  return { txHash: receipt.hash };
}

// ─── 6. Scholar Fund ──────────────────────────────────────────────────────────

export async function pledgeToScholarFund(config: ScholarFundPledge): Promise<{ txHash: string }> {
  const profileSnap = await getDoc(athleteChainRef(config.athleteUserId));
  if (!profileSnap.exists()) throw new Error('Athlete not registered on chain');

  const profile  = profileSnap.data() as AthleteChainProfile;
  const registry = await getRegistryContract();
  const amountUsdc = BigInt(Math.round(config.amountUsdc * 10_000));

  const tx = await registry.pledgeToScholarFund(
    `0x${config.fundId.replace(/-/g, '').padStart(64, '0')}`,
    profile.walletAddress,
    amountUsdc,
    config.milestoneDescription,
  );
  const receipt = await tx.wait();

  const fundRef = scholarFundRef(config.fundId);
  const existing = await getDoc(fundRef);
  if (existing.exists()) {
    await updateDoc(fundRef, { totalPledged: existing.data().totalPledged + config.amountUsdc });
  } else {
    await setDoc(fundRef, {
      ...config,
      totalPledged: config.amountUsdc,
      status: 'ACTIVE',
      txHash: receipt.hash,
      createdAt: serverTimestamp(),
    });
  }

  return { txHash: receipt.hash };
}

// ─── 7. PLAJ Token Milestone Rewards ─────────────────────────────────────────

export async function mintPlajMilestoneReward(
  athleteWalletAddress: string,
  plajAmount: number
): Promise<void> {
  const { ethers } = await import('ethers');
  const plaj = await getPlajContract();
  const amount = ethers.parseEther(plajAmount.toString());
  const tx = await plaj.mint(athleteWalletAddress, amount);
  await tx.wait();
}

// ─── 8. Stat License Purchase (Scout Access) ─────────────────────────────────

export interface StatLicenseResult {
  licenseId: string;
  athleteUserId: string;
  purchaserUserId: string;
  amountUsd: number;
  accessType: 'SEASON_STATS' | 'CAREER_STATS' | 'HIGHLIGHT_REEL' | 'FULL_PROFILE';
  txHash: string;
  expiresAt: Date;
}

/**
 * Scout or college coach purchases access to an athlete's verified stat package.
 * Revenue: 80% athlete | 10% school | 10% Plajah
 * Uses LicenseRegistry.sol (already deployed) with a new license type "ATHLETE_STATS".
 */
export async function purchaseStatLicense(config: {
  athleteUserId: string;
  purchaserUserId: string;
  accessType: StatLicenseResult['accessType'];
  amountUsd: number;
}): Promise<StatLicenseResult> {
  const profileSnap = await getDoc(athleteChainRef(config.athleteUserId));
  if (!profileSnap.exists()) throw new Error('Athlete not registered on chain');

  // In production: call LicenseRegistry.sol executeLicense()
  // For now: mirror in Firestore pending full contract integration
  const licenseId = `lic_${Date.now()}_${config.athleteUserId}`;
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  const result: StatLicenseResult = {
    licenseId,
    athleteUserId: config.athleteUserId,
    purchaserUserId: config.purchaserUserId,
    amountUsd: config.amountUsd,
    accessType: config.accessType,
    txHash: 'pending',
    expiresAt,
  };

  await addDoc(collection(db, 'stat_licenses'), {
    ...result,
    createdAt: serverTimestamp(),
  });

  return result;
}

// ─── 9. Read: Chain Career Stats ─────────────────────────────────────────────

export interface CareerStatSummary {
  touchdowns:       number;
  rushingYards:     number;
  passingYards:     number;
  receivingYards:   number;
  interceptions:    number;
  goals:            number;
  assists:          number;
  points2pt:        number;
  points3pt:        number;
  rebounds:         number;
  homeRuns:         number;
  totalNftRevenue:  string;   // USDC formatted
  totalNilEarned:   string;
  verified:         boolean;
  lastUpdated:      number;
}

export async function getChainCareerStats(athleteUserId: string): Promise<CareerStatSummary | null> {
  const profileSnap = await getDoc(athleteChainRef(athleteUserId));
  if (!profileSnap.exists()) return null;

  const profile = profileSnap.data() as AthleteChainProfile;
  if (!profile.walletAddress) return null;

  try {
    const registry = await getRegistryContract();
    const addr     = profile.walletAddress;

    const [td, rYards, pYards, recYards, int_, goals, assists, pts2, pts3, reb, hr] = await Promise.all([
      registry.getCareerStat(addr, AthleteStatType.TOUCHDOWN),
      registry.getCareerStat(addr, AthleteStatType.RUSHING_YARDS),
      registry.getCareerStat(addr, AthleteStatType.PASSING_YARDS),
      registry.getCareerStat(addr, AthleteStatType.RECEIVING_YARDS),
      registry.getCareerStat(addr, AthleteStatType.INTERCEPTION),
      registry.getCareerStat(addr, AthleteStatType.GOAL),
      registry.getCareerStat(addr, AthleteStatType.ASSIST),
      registry.getCareerStat(addr, AthleteStatType.BASKET_2PT),
      registry.getCareerStat(addr, AthleteStatType.BASKET_3PT),
      registry.getCareerStat(addr, AthleteStatType.REBOUND),
      registry.getCareerStat(addr, AthleteStatType.HOME_RUN),
    ]);

    const rawProfile = await registry.athletes(addr);

    return {
      touchdowns:      Number(td),
      rushingYards:    Number(rYards),
      passingYards:    Number(pYards),
      receivingYards:  Number(recYards),
      interceptions:   Number(int_),
      goals:           Number(goals),
      assists:         Number(assists),
      points2pt:       Number(pts2),
      points3pt:       Number(pts3),
      rebounds:        Number(reb),
      homeRuns:        Number(hr),
      totalNftRevenue: (Number(rawProfile[8]) / 1_000_000).toFixed(2),
      totalNilEarned:  (Number(rawProfile[9]) / 1_000_000).toFixed(2),
      verified:        true,
      lastUpdated:     Date.now(),
    };
  } catch {
    return null;
  }
}

// ─── 10. Get Athlete NFTs (Firestore fast path) ───────────────────────────────

export async function getAthleteHighlightNFTs(athleteUserId: string): Promise<HighlightNFTMeta[]> {
  const { query, where, orderBy, getDocs } = await import('firebase/firestore');
  const q = query(
    collection(db, 'athlete_highlight_nfts'),
    where('athleteUserId', '==', athleteUserId),
    orderBy('mintedAt', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as HighlightNFTMeta);
}
