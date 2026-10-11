import {
  GamingPlatform,
  GamerTier,
  UnifiedGameRecord,
  PlatformScoreBreakdown,
  PlajahCombinedGamerScore,
  DecentralizedAttestationPayload,
} from '../../types/gaming';

// ── TIER THRESHOLDS ──────────────────────────────────────────────────────────

export const TIER_CONFIG: { tier: GamerTier; minScore: number; maxScore: number; label: string }[] = [
  { tier: 'BRONZE_NOMAD', minScore: 0, maxScore: 4999, label: 'Bronze Nomad' },
  { tier: 'SILVER_EXPLORER', minScore: 5000, maxScore: 19999, label: 'Silver Explorer' },
  { tier: 'GOLD_CHAMPION', minScore: 20000, maxScore: 49999, label: 'Gold Champion' },
  { tier: 'PLATINUM_VANGUARD', minScore: 50000, maxScore: 99999, label: 'Platinum Vanguard' },
  { tier: 'DIAMOND_PARAGON', minScore: 100000, maxScore: 249999, label: 'Diamond Paragon' },
  { tier: 'PLAJAH_SOVEREIGN', minScore: 250000, maxScore: Infinity, label: 'Plajah Sovereign' },
];

/**
 * Plajah Combined Gamer Score Engine
 * Translates and normalizes multi-ecosystem achievements into a sovereign unified score.
 */
export class PlajahScoreEngine {
  /**
   * Determine Gamer Tier from total combined score
   */
  public static calculateTier(score: number): {
    tier: GamerTier;
    nextThreshold: number;
    progressPercentage: number;
  } {
    for (let i = 0; i < TIER_CONFIG.length; i++) {
      const config = TIER_CONFIG[i];
      if (score >= config.minScore && score <= config.maxScore) {
        const nextThreshold = config.maxScore === Infinity ? config.minScore : config.maxScore + 1;
        const range = config.maxScore === Infinity ? 100000 : (config.maxScore - config.minScore);
        const currentProgress = score - config.minScore;
        const progressPercentage = Math.min(100, Math.max(0, Math.round((currentProgress / range) * 100)));

        return {
          tier: config.tier,
          nextThreshold,
          progressPercentage,
        };
      }
    }

    return {
      tier: 'BRONZE_NOMAD',
      nextThreshold: 5000,
      progressPercentage: 0,
    };
  }

  /**
   * Calculate score breakdown for a specific platform's game library
   */
  public static calculatePlatformBreakdown(
    platform: GamingPlatform,
    accountHandle: string,
    rawNativeScore: number,
    games: UnifiedGameRecord[]
  ): PlatformScoreBreakdown {
    let normalizedBaseScore = 0;
    let completionBonus = 0;
    let rarityBonus = 0;
    let totalAchievements = 0;
    let completedGamesCount = 0;

    for (const game of games) {
      // 1. Shovelware Filter: If a game claims > 100 achievements with under 30 mins playtime, damp it
      const isShovelwareSuspicious = game.totalAchievementsCount > 100 && game.playtimeMinutes < 30;
      const dampener = isShovelwareSuspicious ? 0.2 : 1.0;

      // 2. Base score normalisation per platform
      let gameBase = 0;
      if (platform === 'STEAM') {
        // Steam games capped at 1,000 standard base points per game
        const cappedScore = Math.min(1000, game.earnedScore);
        gameBase = Math.round(cappedScore * dampener);
      } else if (platform === 'XBOX') {
        // 1 Gamerscore = 1 Plajah base point
        gameBase = Math.round(game.earnedScore * dampener);
      } else if (platform === 'PLAYSTATION') {
        // Native PSN trophy points translate directly
        gameBase = Math.round(game.earnedScore * dampener);
      } else {
        gameBase = Math.round(game.earnedScore * dampener);
      }

      normalizedBaseScore += gameBase;

      // 3. 100% Completionist Bonus (250 flat bonus points for fully mastering a title)
      if (game.is100PercentCompleted || game.completionPercentage >= 100) {
        completedGamesCount += 1;
        completionBonus += 250;
      }

      // 4. Rarity Multiplier: 50 bonus points per rare/ultra-rare achievement
      if (game.rareAchievementsCount > 0) {
        rarityBonus += game.rareAchievementsCount * 50;
      }

      totalAchievements += game.unlockedAchievementsCount;
    }

    // If native score is higher than tracked top titles (e.g. legacy titles not in recent list),
    // ensure base score at least meets the raw native points
    if (rawNativeScore > normalizedBaseScore) {
      normalizedBaseScore = rawNativeScore;
    }

    const totalPlatformScore = normalizedBaseScore + completionBonus + rarityBonus;

    return {
      platform,
      accountHandle,
      rawNativeScore,
      normalizedBaseScore,
      completionBonus,
      rarityBonus,
      totalPlatformScore,
      totalGamesTracked: games.length,
      completedGamesCount,
      totalAchievementsUnlocked: totalAchievements,
    };
  }

  /**
   * Calculate the Unified Plajah Combined Gamer Score across all connected platforms
   */
  public static calculateCombinedScore(
    platformData: {
      platform: GamingPlatform;
      accountHandle: string;
      rawNativeScore: number;
      games: UnifiedGameRecord[];
    }[]
  ): PlajahCombinedGamerScore {
    const platformBreakdowns: Record<GamingPlatform, PlatformScoreBreakdown | undefined> = {
      STEAM: undefined,
      XBOX: undefined,
      PLAYSTATION: undefined,
      RETRO_ACHIEVEMENTS: undefined,
      NINTENDO: undefined,
    };

    let baseScoreSum = 0;
    let totalGamesAcrossPlatforms = 0;
    let total100PercentCompletions = 0;
    let totalAchievementsAcrossPlatforms = 0;
    let activePlatformsCount = 0;

    for (const data of platformData) {
      const breakdown = this.calculatePlatformBreakdown(
        data.platform,
        data.accountHandle,
        data.rawNativeScore,
        data.games
      );

      platformBreakdowns[data.platform] = breakdown;
      baseScoreSum += breakdown.totalPlatformScore;
      totalGamesAcrossPlatforms += breakdown.totalGamesTracked;
      total100PercentCompletions += breakdown.completedGamesCount;
      totalAchievementsAcrossPlatforms += breakdown.totalAchievementsUnlocked;

      if (breakdown.totalPlatformScore > 0) {
        activePlatformsCount += 1;
      }
    }

    // ── CROSS-PLATFORM HARMONY BONUS ──────────────────────────────────────────
    // Reward players who embrace gaming across multiple ecosystems
    // 2 platforms: +15% bonus on base score
    // 3+ platforms: +25% bonus on base score
    let harmonyMultiplier = 0;
    if (activePlatformsCount === 2) {
      harmonyMultiplier = 0.15;
    } else if (activePlatformsCount >= 3) {
      harmonyMultiplier = 0.25;
    }

    const crossPlatformHarmonyBonus = Math.round(baseScoreSum * harmonyMultiplier);
    const totalCombinedScore = baseScoreSum + crossPlatformHarmonyBonus;

    const { tier, nextThreshold, progressPercentage } = this.calculateTier(totalCombinedScore);

    return {
      totalCombinedScore,
      tier,
      tierProgressPercentage: progressPercentage,
      nextTierThreshold: nextThreshold,
      baseScoreSum,
      crossPlatformHarmonyBonus,
      platformBreakdowns,
      totalGamesAcrossPlatforms,
      total100PercentCompletions,
      totalAchievementsAcrossPlatforms,
      calculatedAt: Date.now(),
    };
  }

  /**
   * Generate a Decentrailized Attestation Payload for on-chain or DID passport export
   */
  public static generateAttestationPayload(
    userId: string,
    userDid: string,
    combinedScore: PlajahCombinedGamerScore
  ): DecentralizedAttestationPayload {
    const now = Date.now();
    const expiresAt = now + 30 * 24 * 60 * 60 * 1000; // 30-day validity before sync re-attestation

    const linkedPlatforms: GamingPlatform[] = [];
    const verificationHashes = [];

    for (const [key, breakdown] of Object.entries(combinedScore.platformBreakdowns)) {
      if (breakdown) {
        const plat = key as GamingPlatform;
        linkedPlatforms.push(plat);

        // Simple mock deterministic hash for verification
        const hashSeed = `${plat}:${breakdown.accountHandle}:${breakdown.totalPlatformScore}`;
        const simulatedHash = '0x' + Array.from(hashSeed)
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
          .padEnd(64, '0')
          .slice(0, 64);

        verificationHashes.push({
          platform: plat,
          accountHash: simulatedHash,
          scoreHash: simulatedHash,
          verifiedAt: now,
        });
      }
    }

    return {
      version: 'plajah-did-v1',
      issuer: 'did:plajah:authority-mainnet',
      subjectDid: userDid || `did:plajah:user:${userId}`,
      plajahScore: combinedScore.totalCombinedScore,
      gamerTier: combinedScore.tier,
      platformsLinked: linkedPlatforms,
      verificationHashes,
      issuedAt: now,
      expiresAt,
      signatureScheme: 'EAS_ON_CHAIN',
      proofSignature: `sig_plajah_${Math.random().toString(36).substring(2, 15)}_${now}`,
    };
  }
}
