// Browser client for games in the Social timeline (/api/gamer/social, routes/gamerSocial.ts) plus the helpers that
// put a game on the timeline. Non-throwing like services/gamerNet/client.ts: every call resolves to { ok, ... }.

import { auth } from '../firebase';
import type { ChallengeDoc, ChallengeSource, GameEmbed, LobbyPerson } from './social';
import { playPostText, challengePostText } from './social';
import type { Res } from './client';

const base = () => `${(import.meta as any).env?.VITE_APP_URL ?? window.location.origin}/api/gamer/social`;

async function call<T>(method: string, path: string, body?: object): Promise<Res<T>> {
  try {
    const token = await auth.currentUser?.getIdToken().catch(() => null);
    const res = await fetch(`${base()}${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.error || `Request failed (${res.status})`, httpStatus: res.status };
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, error: 'Connection lost — retrying', httpStatus: 0 };
  }
}

export interface LobbyState { count: number; people: LobbyPerson[]; status?: 'here' | 'seeking' | 'matched'; matchId?: string }
export type ChallengeView = ChallengeDoc;

export const gamerSocial = {
  heartbeat: (game: string, seeking: boolean) => call<LobbyState>('POST', '/lobby', { game, seeking }),
  lobby: (game: string) => call<LobbyState>('GET', `/lobby?game=${encodeURIComponent(game)}`),
  leave: (game: string) => call<{ status: string; matchId?: string }>('DELETE', `/lobby?game=${encodeURIComponent(game)}`),
  challenge: (game: string, to: string, source: ChallengeSource, postId?: string) => call<{ challenge: ChallengeView }>('POST', '/challenge', { game, to, source, postId }),
  challenges: () => call<{ incoming: ChallengeView[]; outgoing: ChallengeView[] }>('GET', '/challenges'),
  getChallenge: (id: string) => call<{ challenge: ChallengeView }>('GET', `/challenge/${encodeURIComponent(id)}`),
  respond: (id: string, action: 'accept' | 'decline' | 'cancel') => call<{ challenge: ChallengeView; matchId?: string }>('POST', `/challenge/${encodeURIComponent(id)}/${action}`),
  setLive: (matchId: string, streamId: string) => call<{ ok: boolean }>('POST', '/live', { matchId, streamId }),
  live: (matchId: string) => call<{ streamId?: string; uid?: string }>('GET', `/live/${encodeURIComponent(matchId)}`),
};

// ───────────────────────────────────────────── posting games to the timeline
/** Publish a Plajah post that carries a playable game card. Returns the new post id, or null. */
export async function postGame(embed: Omit<GameEmbed, 'v'>, text: string): Promise<string | null> {
  const user = auth.currentUser; if (!user) return null;
  const { createPost } = await import('../backendService');
  const id = await createPost({
    text, authorId: user.uid, authorName: user.displayName || 'Player', authorPhoto: user.photoURL || '',
    likesCount: 0, commentsCount: 0, timestamp: Date.now(), isPublic: true, tags: ['PlajahGames'],
    gameEmbed: { v: 1, ...embed },
  } as any).catch(() => null);
  return typeof id === 'string' ? id : (id as any)?.id ?? null;
}

export const postPlayableGame = (game = 'ttt') => postGame({ game, kind: 'play' }, playPostText(game, auth.currentUser?.displayName || undefined));
export const postChallenge = (game: string, challengeId: string, toUid: string, toName: string) =>
  postGame({ game, kind: 'challenge', challengeId, toUid, toName }, challengePostText(game, toName));
export const postResult = (game: string, matchId: string, text: string) => postGame({ game, kind: 'result', matchId }, text);
export const postLiveMatch = (game: string, matchId: string, streamId: string, text: string) => postGame({ game, kind: 'live', matchId, streamId }, text);

// ───────────────────────────────────────────── overlay (opened from notifications, profiles, chat)
export type OverlayTarget = { challengeId: string } | { matchId: string } | { challengeTo: { uid: string; name: string; source: ChallengeSource } };
export const OPEN_GAME_EVENT = 'plajah:open-game';

/** Open the game overlay anywhere in the app. It mounts itself on first use, so no host has to be placed. */
export async function openGameOverlay(target: OverlayTarget): Promise<void> {
  const { showGameOverlay } = await import('../../components/games/social/GameOverlay');
  showGameOverlay(target);
}

/** Notification deep links written by routes/gamerSocial.ts: `game-challenge:<id>` and `game-match:<id>`. */
export function openGameLink(link: string): boolean {
  if (link.startsWith('game-challenge:')) { void openGameOverlay({ challengeId: link.slice('game-challenge:'.length) }); return true; }
  if (link.startsWith('game-match:')) { void openGameOverlay({ matchId: link.slice('game-match:'.length) }); return true; }
  return false;
}
