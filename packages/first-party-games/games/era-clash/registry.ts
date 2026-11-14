// packages/first-party-games/games/era-clash/registry.ts
//
// Era Clash — first-party Plajah Original. Single source of truth for the
// Games library (GamesView) and the Apps library (AppsView). Both views
// render from these entries; the GamePlayerView bridge reads the bridge
// config by game id. Badge as data — no privileged code paths.
import type { Game, WebApp } from '../../../../types';

/** Public play URL — the published Era Clash artifact. Fill in at push time. */
export const ERA_CLASH_URL =
  'https://muse.ai/s/2d-fighting-game-xuxq6iexlfbxtx0xm/q3Ba-IuaSYCX0IdCrcH6UnjGND_EmU-gPmHW-lLzWHQ';

/** Thumbnail for library cards — the Era Clash title screen, uploaded to Plajah Storage. */
export const ERA_CLASH_THUMBNAIL_URL =
  'https://firebasestorage.googleapis.com/v0/b/gen-lang-client-0665118474.firebasestorage.app/o/games%2Fera-clash%2Fthumbnail.png?alt=media&token=13d4b1bd-7443-4578-a7b7-e27d81821a88';

export const ERA_CLASH_GAME: Game = {
  id: 'era-clash',
  // First-party sentinel: the Originals rail does not resolve owners for
  // first-party entries (it renders its own "By Plajah" attribution).
  ownerId: 'plajah',
  title: 'Era Clash',
  description:
    'Plajah Original. Six warriors from across history — samurai, Viking, knight, Mexica jaguar warrior, Shaolin monk, gladiator — clash in fast arcade combat. Versus CPU, local two-player, online duels, and the Tales of the Ages campaign.',
  url: ERA_CLASH_URL,
  thumbnailUrl: ERA_CLASH_THUMBNAIL_URL,
  playCount: 0,
  timestamp: Date.now(),
  tags: ['fighting', '2d', 'plajah-original'],
};

export const ERA_CLASH_WEB_APP: WebApp = {
  id: 'era-clash',
  ownerId: 'plajah',
  developerName: 'Plajah',
  title: 'Era Clash',
  description:
    'Plajah Original. Six warriors from across history clash in fast arcade combat. Versus CPU, local two-player, online duels, and the Tales of the Ages campaign.',
  url: ERA_CLASH_URL,
  thumbnailUrl: ERA_CLASH_THUMBNAIL_URL,
  screenshots: [],
  category: 'Games',
  version: '1.0',
  size: 'Web',
  rating: 0,
  reviewCount: 0,
  installCount: 0,
  timestamp: Date.now(),
  tags: ['fighting', '2d', 'plajah-original'],
  state: 'PUBLISHED',
};

export interface IframeGameBridgeConfig {
  /** Only achievement triggers with this prefix are accepted from this game. */
  achievementPrefix: string;
  /** Max XP-points credited per calendar day for this game. */
  dailyXpCap: number;
}

/** Bridge configs by game id. GamePlayerView looks its game up here. */
export const FIRST_PARTY_BRIDGE_CONFIGS: Record<string, IframeGameBridgeConfig> = {
  'era-clash': {
    achievementPrefix: 'ERACLASH_',
    dailyXpCap: 500,
  },
};
