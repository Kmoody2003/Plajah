// services/iframeGameBridge.ts
//
// Generic bridge for iframe games embedded in GamePlayerView.
//
// Protocol (game -> parent, via window.postMessage):
//   { type: 'plajah.xp',          eventId, gameId, mode, xp, level }
//   { type: 'plajah.achievement', eventId, gameId, mode, trigger }
//
// Trust model — the game is untrusted input:
//  - Origin: only messages whose event.origin matches the game's URL origin
//    are accepted. A game hosted anywhere else cannot impersonate it.
//  - Identity: the message must carry this game's id.
//  - Dedupe: every event must carry a unique eventId; repeats are dropped.
//  - Scope: 2-player local mode ('2p') earns nothing — it is trivially
//    farmable. Achievement triggers must start with the game's configured
//    prefix, so a game cannot unlock arbitrary achievements.
//  - Caps: XP credit is capped per game per calendar day. Enforced
//    client-side (localStorage + in-memory); server-side enforcement is a
//    follow-up, not a prerequisite.
//  - Amounts: XP is floored to an integer and clamped to the remaining cap.
//    Achievement point bonuses are paid only on FRESH unlocks (existing
//    progress is checked first), because the server unlock endpoint does not
//    credit rewards.pointsBonus anywhere.
import { addPoints } from './pointsService';
import {
  BASE_ACHIEVEMENTS,
  fetchAllAchievements,
  fetchUserAchievementProgress,
  unlockAchievementByTrigger,
} from './achievementService';
import type { Achievement, Game } from '../types';
import {
  FIRST_PARTY_BRIDGE_CONFIGS,
  type IframeGameBridgeConfig,
} from '../packages/first-party-games/games/era-clash/registry';

interface AttachArgs {
  game: Game;
  userId: string;
  config: IframeGameBridgeConfig;
}

const DAY_KEY = (gameId: string, day: string) => `plajah:game-xp:${gameId}:${day}`;
const todayKey = () => new Date().toISOString().slice(0, 10);

function readDailyCredited(gameId: string): number {
  try {
    const raw = window.localStorage.getItem(DAY_KEY(gameId, todayKey()));
    const n = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeDailyCredited(gameId: string, value: number): void {
  try {
    window.localStorage.setItem(DAY_KEY(gameId, todayKey()), String(value));
  } catch {
    /* localStorage unavailable — cap degrades to in-memory only */
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Attach the bridge for one embedded game. Returns a detach function.
 * Call it from GamePlayerView when the game mounts (or the game/user
 * changes); call the returned detach on unmount.
 */
export function attachIframeGameBridge({ game, userId, config }: AttachArgs): () => void {
  const seenEventIds = new Set<string>();
  let gameOrigin: string | null = null;
  try {
    gameOrigin = new URL(game.url).origin;
  } catch {
    gameOrigin = null; // Unparseable URL: fail closed, accept nothing.
  }

  const onMessage = async (event: MessageEvent) => {
    if (!gameOrigin || event.origin !== gameOrigin) return;
    if (!isRecord(event.data)) return;
    const data = event.data;
    if (data.gameId !== game.id) return;
    if (typeof data.eventId !== 'string' || data.eventId.length === 0) return;
    if (seenEventIds.has(data.eventId)) return;
    // 2-player local mode earns nothing.
    if (data.mode === '2p') return;

    if (data.type === 'plajah.xp') {
      if (typeof data.xp !== 'number' || !Number.isFinite(data.xp) || data.xp <= 0) return;
      seenEventIds.add(data.eventId);
      const credited = readDailyCredited(game.id);
      const remaining = config.dailyXpCap - credited;
      if (remaining <= 0) return;
      const award = Math.min(Math.floor(data.xp), remaining);
      if (award <= 0) return;
      const ok = await addPoints(userId, award, 'REWARD', game.title, data.eventId);
      if (ok) writeDailyCredited(game.id, credited + award);
      return;
    }

    if (data.type === 'plajah.achievement') {
      if (typeof data.trigger !== 'string' || !data.trigger.startsWith(config.achievementPrefix)) return;
      seenEventIds.add(data.eventId);
      try {
        // Freshness: only pay the bonus on a first-time unlock.
        const catalog = await fetchAllAchievements();
        const target = catalog.find((a) => a.triggerType === data.trigger);
        let fresh = !target;
        if (target?.id) {
          const progress = await fetchUserAchievementProgress(userId, target.id);
          fresh = !progress?.unlockedAt;
        }
        const unlocked = await unlockAchievementByTrigger(
          userId,
          data.trigger as Achievement['triggerType'],
        );
        if (unlocked && fresh) {
          const base = BASE_ACHIEVEMENTS.find((a) => a.triggerType === data.trigger);
          const bonus = target?.pointsValue ?? base?.pointsValue ?? 0;
          if (bonus > 0) {
            await addPoints(userId, bonus, 'ACHIEVEMENT_UNLOCK', game.title, `achievement:${data.trigger}`);
          }
        }
      } catch (error) {
        console.error('Error handling game achievement event:', error);
      }
      return;
    }
  };

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/** Bridge config lookup for GamePlayerView. Undefined = no bridge for this game. */
export function bridgeConfigFor(gameId: string): IframeGameBridgeConfig | undefined {
  return FIRST_PARTY_BRIDGE_CONFIGS[gameId];
}
