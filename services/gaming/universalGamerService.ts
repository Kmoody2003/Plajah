import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  GamingPlatform,
  PlatformCredentials,
  UniversalGamerPassport,
  UnifiedGameRecord,
} from '../../types/gaming';
import { syncPlatformData, SyncedPlatformResult } from './adapters';
import { PlajahScoreEngine } from './plajahScoreEngine';
import { addPoints } from '../pointsService';

const PASSPORTS_COLLECTION = 'universalGamerPassports';

export class UniversalGamerService {
  /**
   * Fetch a user's Universal Gamer Passport
   */
  async getPassport(userId: string): Promise<UniversalGamerPassport | null> {
    const isBrowser = typeof window !== 'undefined';
    if (isBrowser) {
      try {
        const snap = await getDoc(doc(db, PASSPORTS_COLLECTION, userId));
        if (snap.exists()) {
          return snap.data() as UniversalGamerPassport;
        }
      } catch (err) {
        console.warn('[UniversalGamerService] Firestore unavailable, checking local storage fallback:', err);
      }
    }

    // LocalStorage fallback for offline/preview mode
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(`plajah_passport_${userId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    return null;
  }

  /**
   * Initialize a default mock passport for previewing the multi-platform experience
   */
  async initializeDemoPassport(userId: string, username = 'GamerSovereign'): Promise<UniversalGamerPassport> {
    // Sync mock Steam, Xbox, and PSN data
    const [steamResult, xboxResult, psnResult] = await Promise.all([
      syncPlatformData('STEAM', '76561198000000000'),
      syncPlatformData('XBOX', 'MasterChief_Plajah'),
      syncPlatformData('PLAYSTATION', 'Kratos_Plajah'),
    ]);

    const platformPayloads = [
      {
        platform: 'STEAM' as const,
        accountHandle: steamResult.credentials.accountHandle,
        rawNativeScore: steamResult.rawNativeScore,
        games: steamResult.games,
      },
      {
        platform: 'XBOX' as const,
        accountHandle: xboxResult.credentials.accountHandle,
        rawNativeScore: xboxResult.rawNativeScore,
        games: xboxResult.games,
      },
      {
        platform: 'PLAYSTATION' as const,
        accountHandle: psnResult.credentials.accountHandle,
        rawNativeScore: psnResult.rawNativeScore,
        games: psnResult.games,
      },
    ];

    const combinedScore = PlajahScoreEngine.calculateCombinedScore(platformPayloads);
    const did = `did:plajah:key:0x${userId.replace(/[^a-zA-Z0-9]/g, '').padEnd(32, 'a').slice(0, 32)}`;
    const attestation = PlajahScoreEngine.generateAttestationPayload(userId, did, combinedScore);

    // Merge top games showcase
    const topGamesShowcase: UnifiedGameRecord[] = [
      ...steamResult.games.slice(0, 2),
      ...xboxResult.games.slice(0, 2),
      ...psnResult.games.slice(0, 2),
    ];

    const passport: UniversalGamerPassport = {
      id: userId,
      userId,
      username,
      avatarUrl: psnResult.credentials.avatarUrl,
      did,
      connectedAccounts: [
        steamResult.credentials,
        xboxResult.credentials,
        psnResult.credentials,
      ],
      combinedScore,
      topGamesShowcase,
      featuredAchievements: [
        {
          id: 'feat_elden_ring',
          platform: 'STEAM',
          gameTitle: 'ELDEN RING',
          title: 'Elden Lord',
          description: 'Achieved the "Elden Lord" ending.',
          unlockedAt: Date.now() - 86400000 * 20,
          rarityPercentage: 8.4,
        },
        {
          id: 'feat_gow_plat',
          platform: 'PLAYSTATION',
          gameTitle: 'God of War Ragnarök',
          title: 'The Bear and the Wolf',
          description: 'Collect all trophies.',
          unlockedAt: Date.now() - 86400000 * 45,
          rarityPercentage: 7.9,
        },
        {
          id: 'feat_halo_laso',
          platform: 'XBOX',
          gameTitle: 'Halo Infinite',
          title: 'Headmaster',
          description: 'Complete all main missions on Legendary with all Skulls active.',
          unlockedAt: Date.now() - 86400000 * 60,
          rarityPercentage: 1.8,
        },
      ],
      latestAttestation: attestation,
      updatedAt: Date.now(),
    };

    await this.savePassport(passport);
    return passport;
  }

  /**
   * Link or re-sync a specific ecosystem account
   */
  async linkPlatform(
    userId: string,
    platform: GamingPlatform,
    accountIdentifier: string
  ): Promise<UniversalGamerPassport> {
    const existing = (await this.getPassport(userId)) || (await this.initializeDemoPassport(userId));
    const syncResult: SyncedPlatformResult = await syncPlatformData(platform, accountIdentifier);

    // Update or append credentials
    const updatedCredentials = existing.connectedAccounts.filter((a) => a.platform !== platform);
    updatedCredentials.push(syncResult.credentials);

    // Re-run combined scoring
    const activePlatforms = updatedCredentials.map((c) => {
      // Find games matching this platform or use newly synced ones
      const games = c.platform === platform ? syncResult.games : existing.topGamesShowcase.filter((g) => g.platform === c.platform);
      const rawScore = c.platform === platform ? syncResult.rawNativeScore : (existing.combinedScore.platformBreakdowns[c.platform]?.rawNativeScore || 0);

      return {
        platform: c.platform,
        accountHandle: c.accountHandle,
        rawNativeScore: rawScore,
        games,
      };
    });

    const newCombinedScore = PlajahScoreEngine.calculateCombinedScore(activePlatforms);
    const did = existing.did || `did:plajah:key:0x${userId}`;
    const newAttestation = PlajahScoreEngine.generateAttestationPayload(userId, did, newCombinedScore);

    // Deduplicate & refresh top games showcase
    const otherGames = existing.topGamesShowcase.filter((g) => g.platform !== platform);
    const newTopGames = [...otherGames, ...syncResult.games.slice(0, 3)].slice(0, 10);

    const updatedPassport: UniversalGamerPassport = {
      ...existing,
      connectedAccounts: updatedCredentials,
      combinedScore: newCombinedScore,
      topGamesShowcase: newTopGames,
      latestAttestation: newAttestation,
      updatedAt: Date.now(),
    };

    await this.savePassport(updatedPassport);

    // Award Plajah In-App Points for connecting an ecosystem (e.g. 250 points)
    if (typeof window !== 'undefined') {
      try {
        await addPoints(userId, 250, 'ACHIEVEMENT_UNLOCK', `Connected ${platform} Ecosystem`);
      } catch (e) {
        console.warn('[UniversalGamerService] Could not award connection points:', e);
      }
    }

    return updatedPassport;
  }

  /**
   * Unlink a platform from user's passport
   */
  async unlinkPlatform(userId: string, platform: GamingPlatform): Promise<UniversalGamerPassport | null> {
    const existing = await this.getPassport(userId);
    if (!existing) return null;

    const remainingCredentials = existing.connectedAccounts.filter((a) => a.platform !== platform);
    const remainingGames = existing.topGamesShowcase.filter((g) => g.platform !== platform);

    const activePlatforms = remainingCredentials.map((c) => {
      const games = remainingGames.filter((g) => g.platform === c.platform);
      const rawScore = existing.combinedScore.platformBreakdowns[c.platform]?.rawNativeScore || 0;
      return {
        platform: c.platform,
        accountHandle: c.accountHandle,
        rawNativeScore: rawScore,
        games,
      };
    });

    const newCombinedScore = PlajahScoreEngine.calculateCombinedScore(activePlatforms);
    const did = existing.did || `did:plajah:key:0x${userId}`;
    const newAttestation = PlajahScoreEngine.generateAttestationPayload(userId, did, newCombinedScore);

    const updatedPassport: UniversalGamerPassport = {
      ...existing,
      connectedAccounts: remainingCredentials,
      combinedScore: newCombinedScore,
      topGamesShowcase: remainingGames,
      latestAttestation: newAttestation,
      updatedAt: Date.now(),
    };

    await this.savePassport(updatedPassport);
    return updatedPassport;
  }

  /**
   * Persist passport state to Firestore and LocalStorage
   */
  private async savePassport(passport: UniversalGamerPassport): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(`plajah_passport_${passport.userId}`, JSON.stringify(passport));
    }

    const isBrowser = typeof window !== 'undefined';
    if (isBrowser) {
      try {
        await setDoc(doc(db, PASSPORTS_COLLECTION, passport.userId), passport, { merge: true });
      } catch (err) {
        console.warn('[UniversalGamerService] Failed to persist to Firestore:', err);
      }
    }
  }
}

export const universalGamerService = new UniversalGamerService();
