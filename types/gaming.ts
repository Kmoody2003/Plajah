/**
 * Universal Gaming Identity & Cross-Platform Gamer Score Types
 * For Plajah Games Decentralized Gaming Service
 */

export type GamingPlatform = 'STEAM' | 'XBOX' | 'PLAYSTATION' | 'RETRO_ACHIEVEMENTS' | 'NINTENDO';

export type GamerTier = 
  | 'BRONZE_NOMAD'       // 0 - 4,999
  | 'SILVER_EXPLORER'    // 5,000 - 19,999
  | 'GOLD_CHAMPION'      // 20,000 - 49,999
  | 'PLATINUM_VANGUARD'  // 50,000 - 99,999
  | 'DIAMOND_PARAGON'    // 100,000 - 249,999
  | 'PLAJAH_SOVEREIGN';   // 250,000+

export interface PlatformCredentials {
  platform: GamingPlatform;
  accountId: string;          // e.g. SteamID64, Xbox XUID, PSN AccountId/OnlineID
  accountHandle: string;      // e.g. Gamertag, PSN Online ID, Steam Persona Name
  avatarUrl?: string;
  profileUrl?: string;
  isVerified: boolean;
  verificationMethod: 'OAUTH' | 'OPENID' | 'BIO_TAG' | 'ZK_PROOF';
  linkedAt: number;
  lastSyncedAt: number;
}

// ── STEAM TYPES ─────────────────────────────────────────────────────────────

export interface SteamProfileSummary {
  steamId: string;
  personaname: string;
  profileurl: string;
  avatarfull: string;
  communityvisibilitystate: number; // 3 = public
  timecreated?: number;
}

export interface SteamGameStat {
  appId: number;
  name: string;
  playtimeMinutes: number;
  imgIconUrl?: string;
  totalAchievements: number;
  unlockedAchievements: number;
  completionPercentage: number;
}

// ── XBOX LIVE TYPES ─────────────────────────────────────────────────────────

export interface XboxProfileSummary {
  xuid: string;
  gamertag: string;
  gamerscore: number;
  gamerpic: string;
  accountTier: string; // Gold / Silver
  tenureYears?: number;
}

export interface XboxGameTitle {
  titleId: string;
  name: string;
  currentGamerscore: number;
  maxGamerscore: number;
  currentAchievements: number;
  totalAchievements: number;
  lastPlayed?: number;
}

// ── PLAYSTATION TYPES ───────────────────────────────────────────────────────

export interface PsnTrophyCount {
  bronze: number;
  silver: number;
  gold: number;
  platinum: number;
}

export interface PsnProfileSummary {
  onlineId: string;
  accountId: string;
  trophyLevel: number;
  trophies: PsnTrophyCount;
  avatarUrl?: string;
  isPlusMember?: boolean;
}

export interface PsnGameTitle {
  titleId: string;
  name: string;
  platform: string; // PS4, PS5, etc.
  trophiesEarned: PsnTrophyCount;
  totalTrophies: PsnTrophyCount;
  progressPercentage: number;
  hasPlatinum: boolean;
}

// ── UNIFIED CROSS-PLATFORM ENTITIES ─────────────────────────────────────────

export interface UnifiedGameRecord {
  id: string; // e.g. steam_730, xbox_12345
  platform: GamingPlatform;
  titleName: string;
  platformTitleId: string;
  playtimeMinutes: number;
  earnedScore: number;       // Native score (GamerScore, Trophy points, or Steam unlocked count)
  maxAvailableScore: number;
  completionPercentage: number;
  is100PercentCompleted: boolean;
  unlockedAchievementsCount: number;
  totalAchievementsCount: number;
  lastPlayedAt?: number;
  rareAchievementsCount: number; // Unlock rate < 10%
}

export interface PlatformScoreBreakdown {
  platform: GamingPlatform;
  accountHandle: string;
  rawNativeScore: number;     // e.g. 52,000 Xbox Gamerscore, or 4,300 Trophy pts
  normalizedBaseScore: number; // Translated into Plajah Base Points
  completionBonus: number;    // Bonus for 100% completions
  rarityBonus: number;        // Bonus for ultra rare achievements
  totalPlatformScore: number;
  totalGamesTracked: number;
  completedGamesCount: number;
  totalAchievementsUnlocked: number;
}

export interface PlajahCombinedGamerScore {
  totalCombinedScore: number;
  tier: GamerTier;
  tierProgressPercentage: number;
  nextTierThreshold: number;
  baseScoreSum: number;
  crossPlatformHarmonyBonus: number; // Reward for active multi-ecosystem presence
  platformBreakdowns: Record<GamingPlatform, PlatformScoreBreakdown | undefined>;
  totalGamesAcrossPlatforms: number;
  total100PercentCompletions: number;
  totalAchievementsAcrossPlatforms: number;
  calculatedAt: number;
}

// ── DECENTRALIZED IDENTITY & PASSPORT ───────────────────────────────────────

export interface DecentralizedAttestationPayload {
  version: 'plajah-did-v1';
  issuer: string;              // Plajah Identity Authority DID or Smart Contract
  subjectDid: string;          // User's Sovereign Identity (e.g. did:plajah:0x... or did:key:...)
  plajahScore: number;
  gamerTier: GamerTier;
  platformsLinked: GamingPlatform[];
  verificationHashes: {
    platform: GamingPlatform;
    accountHash: string;       // SHA256 of account identifier
    scoreHash: string;
    verifiedAt: number;
  }[];
  issuedAt: number;
  expiresAt: number;           // Usually refreshed every 30 days
  signatureScheme: 'ECDSA_SECP256K1' | 'ED25519' | 'EAS_ON_CHAIN';
  proofSignature?: string;
}

export interface UniversalGamerPassport {
  id: string;                  // Plajah User ID
  userId: string;
  username: string;
  avatarUrl?: string;
  did?: string;                // Decentralized Identifier
  connectedAccounts: PlatformCredentials[];
  combinedScore: PlajahCombinedGamerScore;
  topGamesShowcase: UnifiedGameRecord[];
  featuredAchievements: {
    id: string;
    platform: GamingPlatform;
    gameTitle: string;
    title: string;
    description: string;
    iconUrl?: string;
    unlockedAt: number;
    rarityPercentage?: number;
  }[];
  latestAttestation?: DecentralizedAttestationPayload;
  updatedAt: number;
}
