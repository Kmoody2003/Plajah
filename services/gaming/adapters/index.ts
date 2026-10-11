import { GamingPlatform, PlatformCredentials, UnifiedGameRecord } from '../../../types/gaming';
import { steamAdapter, SteamAdapter } from './steamAdapter';
import { xboxAdapter, XboxAdapter } from './xboxAdapter';
import { psnAdapter, PsnAdapter, calculateRawTrophyPoints } from './psnAdapter';

export { steamAdapter, SteamAdapter, xboxAdapter, XboxAdapter, psnAdapter, PsnAdapter };

export interface SyncedPlatformResult {
  credentials: PlatformCredentials;
  games: UnifiedGameRecord[];
  rawNativeScore: number;
}

/**
 * Universal Ecosystem Sync Dispatcher
 * Dispatches to the appropriate adapter based on platform
 */
export async function syncPlatformData(
  platform: GamingPlatform,
  accountIdentifier: string
): Promise<SyncedPlatformResult> {
  const now = Date.now();

  switch (platform) {
    case 'STEAM': {
      const profile = await steamAdapter.getProfile(accountIdentifier);
      const games = await steamAdapter.getOwnedGames(accountIdentifier);
      const totalScore = games.reduce((sum, g) => sum + g.earnedScore, 0);

      return {
        credentials: {
          platform: 'STEAM',
          accountId: profile.steamId,
          accountHandle: profile.personaname,
          avatarUrl: profile.avatarfull,
          profileUrl: profile.profileurl,
          isVerified: true,
          verificationMethod: 'OPENID',
          linkedAt: now,
          lastSyncedAt: now,
        },
        games,
        rawNativeScore: totalScore,
      };
    }

    case 'XBOX': {
      const profile = await xboxAdapter.getProfile(accountIdentifier);
      const games = await xboxAdapter.getTitleHistory(profile.xuid);

      return {
        credentials: {
          platform: 'XBOX',
          accountId: profile.xuid,
          accountHandle: profile.gamertag,
          avatarUrl: profile.gamerpic,
          isVerified: true,
          verificationMethod: 'OAUTH',
          linkedAt: now,
          lastSyncedAt: now,
        },
        games,
        rawNativeScore: profile.gamerscore,
      };
    }

    case 'PLAYSTATION': {
      const profile = await psnAdapter.getProfile(accountIdentifier);
      const games = await psnAdapter.getTitles(profile.accountId);
      const rawPoints = calculateRawTrophyPoints(profile.trophies);

      return {
        credentials: {
          platform: 'PLAYSTATION',
          accountId: profile.accountId,
          accountHandle: profile.onlineId,
          avatarUrl: profile.avatarUrl,
          isVerified: true,
          verificationMethod: 'BIO_TAG',
          linkedAt: now,
          lastSyncedAt: now,
        },
        games,
        rawNativeScore: rawPoints,
      };
    }

    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}
