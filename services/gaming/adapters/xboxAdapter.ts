import {
  XboxProfileSummary,
  UnifiedGameRecord,
} from '../../../types/gaming';

/**
 * Xbox Live Ecosystem Adapter
 * Interfaces with Xbox Live REST endpoints / OpenXBL Gateway
 */
export class XboxAdapter {
  private apiKey: string;
  private proxyUrl: string;

  constructor(apiKey?: string, proxyUrl?: string) {
    this.apiKey = apiKey || (typeof process !== 'undefined' ? process.env?.VITE_OPENXBL_API_KEY || '' : '');
    this.proxyUrl = proxyUrl || '';
  }

  /**
   * Fetch Xbox user profile & Gamerscore
   */
  async getProfile(gamertagOrXuid: string): Promise<XboxProfileSummary> {
    if (!this.apiKey) {
      return this.getMockXboxProfile(gamertagOrXuid);
    }

    try {
      // Query OpenXBL player summary
      const url = `${this.proxyUrl}https://xbl.io/api/v2/search/${encodeURIComponent(gamertagOrXuid)}`;
      const response = await fetch(url, {
        headers: {
          'X-Authorization': this.apiKey,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) throw new Error(`Xbox API error: ${response.status}`);
      const data = await response.json();
      const profile = data.profileUsers?.[0];

      if (!profile) throw new Error('Xbox Gamertag not found');

      const settings = (profile.settings || []).reduce((acc: any, curr: any) => {
        acc[curr.id] = curr.value;
        return acc;
      }, {});

      return {
        xuid: profile.id,
        gamertag: settings.Gamertag || gamertagOrXuid,
        gamerscore: parseInt(settings.Gamerscore || '0', 10),
        gamerpic: settings.GameDisplayPicRaw || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=150',
        accountTier: settings.AccountTier || 'Gold',
        tenureYears: parseInt(settings.TenureLevel || '5', 10),
      };
    } catch (err) {
      console.warn('[XboxAdapter] Falling back to mock Xbox profile:', err);
      return this.getMockXboxProfile(gamertagOrXuid);
    }
  }

  /**
   * Fetch titles history and achievement breakdown
   */
  async getTitleHistory(xuid: string): Promise<UnifiedGameRecord[]> {
    if (!this.apiKey) {
      return this.getMockXboxGames();
    }

    try {
      const url = `${this.proxyUrl}https://xbl.io/api/v2/achievements/xuid/${xuid}`;
      const response = await fetch(url, {
        headers: {
          'X-Authorization': this.apiKey,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) throw new Error(`Xbox achievements error: ${response.status}`);
      const data = await response.json();
      const titles = data.titles || [];

      return titles.slice(0, 50).map((title: any) => {
        const earned = title.currentGamerscore || 0;
        const max = title.maxGamerscore || 1000;
        const pct = max > 0 ? Math.round((earned / max) * 100) : 0;
        const currentAch = title.currentAchievements || 0;
        const totalAch = title.totalAchievements || 50;

        return {
          id: `xbox_${title.titleId}`,
          platform: 'XBOX' as const,
          titleName: title.name,
          platformTitleId: String(title.titleId),
          playtimeMinutes: (title.playtime || 1200),
          earnedScore: earned,
          maxAvailableScore: max,
          completionPercentage: pct,
          is100PercentCompleted: pct >= 100,
          unlockedAchievementsCount: currentAch,
          totalAchievementsCount: totalAch,
          rareAchievementsCount: Math.floor(currentAch * 0.12),
        };
      });
    } catch (err) {
      console.warn('[XboxAdapter] Falling back to mock Xbox titles:', err);
      return this.getMockXboxGames();
    }
  }

  // ── MOCK DATA ─────────────────────────────────────────────────────────────

  private getMockXboxProfile(gamertag: string): XboxProfileSummary {
    return {
      xuid: '2533274987654321',
      gamertag: gamertag || 'MasterChief_Plajah',
      gamerscore: 48320,
      gamerpic: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
      accountTier: 'Gold',
      tenureYears: 8,
    };
  }

  private getMockXboxGames(): UnifiedGameRecord[] {
    return [
      {
        id: 'xbox_halo_infinite',
        platform: 'XBOX',
        titleName: 'Halo Infinite',
        platformTitleId: '19827364',
        playtimeMinutes: 9800,
        earnedScore: 1000,
        maxAvailableScore: 1000,
        completionPercentage: 100,
        is100PercentCompleted: true,
        unlockedAchievementsCount: 50,
        totalAchievementsCount: 50,
        rareAchievementsCount: 15,
      },
      {
        id: 'xbox_forza_horizon_5',
        platform: 'XBOX',
        titleName: 'Forza Horizon 5',
        platformTitleId: '98765432',
        playtimeMinutes: 14200,
        earnedScore: 920,
        maxAvailableScore: 1000,
        completionPercentage: 92,
        is100PercentCompleted: false,
        unlockedAchievementsCount: 68,
        totalAchievementsCount: 75,
        rareAchievementsCount: 9,
      },
      {
        id: 'xbox_gears_5',
        platform: 'XBOX',
        titleName: 'Gears 5',
        platformTitleId: '54321678',
        playtimeMinutes: 6500,
        earnedScore: 780,
        maxAvailableScore: 1000,
        completionPercentage: 78,
        is100PercentCompleted: false,
        unlockedAchievementsCount: 45,
        totalAchievementsCount: 60,
        rareAchievementsCount: 7,
      },
      {
        id: 'xbox_starfield',
        platform: 'XBOX',
        titleName: 'Starfield',
        platformTitleId: '11223344',
        playtimeMinutes: 18400,
        earnedScore: 1000,
        maxAvailableScore: 1000,
        completionPercentage: 100,
        is100PercentCompleted: true,
        unlockedAchievementsCount: 50,
        totalAchievementsCount: 50,
        rareAchievementsCount: 18,
      },
    ];
  }
}

export const xboxAdapter = new XboxAdapter();
