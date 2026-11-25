// packages/first-party-games/games/apex-elohim/registry.ts
//
// Apex Elohim: first-party Plajah Original racing game. Same shape as the Era Clash registry: the Games library and the Apps
// library render from these entries, and the game player bridge reads the bridge config by game id.
import type { Game, WebApp } from '../../../../types';
import type { IframeGameBridgeConfig } from '../era-clash/registry';

export const APEX_ELOHIM_URL = '/games/apex/play/region.html';
export const APEX_ELOHIM_THUMBNAIL_URL = '/games/apex/screenshots/rain-chase.jpg';

export const APEX_ELOHIM_GAME: Game = {
  id: 'apex-elohim',
  ownerId: 'plajah',
  title: 'Plajah Motorsport: Apex',
  description:
    'Plajah Original. Open-world racing through downtown Ironport and along the Great Lakes coast, with dynamic weather, a full vehicle model and broadcast replays.',
  url: APEX_ELOHIM_URL,
  thumbnailUrl: APEX_ELOHIM_THUMBNAIL_URL,
  playCount: 0,
  timestamp: Date.now(),
  tags: ['racing', '3d', 'open-world', 'plajah-original'],
};

export const APEX_ELOHIM_WEB_APP: WebApp = {
  id: 'apex-elohim',
  ownerId: 'plajah',
  developerName: 'Plajah',
  title: 'Plajah Motorsport: Apex',
  description: 'Plajah Original. Open-world racing with dynamic weather, a full vehicle model and broadcast replays.',
  url: APEX_ELOHIM_URL,
  thumbnailUrl: APEX_ELOHIM_THUMBNAIL_URL,
  screenshots: [],
  category: 'Games',
  version: '1.0',
  size: 'Web',
  rating: 0,
  reviewCount: 0,
  installCount: 0,
  timestamp: Date.now(),
  tags: ['racing', '3d', 'plajah-original'],
  state: 'PUBLISHED',
};

export const APEX_ELOHIM_BRIDGE: IframeGameBridgeConfig = {
  achievementPrefix: 'APEX_',
  dailyXpCap: 500,
};
