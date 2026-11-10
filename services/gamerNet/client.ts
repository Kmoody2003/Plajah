// Plajah Gamer Network — browser client for /api/gamer (routes/gamerNet.ts). Non-throwing: every call
// resolves to { ok, ... } so a flaky connection shows a message instead of breaking the board.

import { auth } from '../firebase';
import type { MatchDoc } from './match';
import type { GamerEntry } from './ledger';
import type { ScoreCard, GameStats } from './score';

const base = () => `${(import.meta as any).env?.VITE_APP_URL ?? window.location.origin}/api/gamer`;

export interface GamerProfile {
  uid: string; name: string; photo: string; score: number; scoreCard: ScoreCard;
  games: Record<string, GameStats>; achievements: string[]; platforms: string[]; externalHours: number; localPlays: number;
  ledger: { length: number; head: string }; since?: number;
}
export interface MatchView { match: MatchDoc; you: number; serverNow: number }
export interface LeaderRow { rank: number; uid: string; name: string; photo: string; score: number; rating?: number; wins?: number; losses?: number; draws?: number }

export interface LinkView {
  platform: string; accountId: string; name: string; avatar: string; profileUrl: string;
  linkedAt: number; lastSyncAt: number; pending: boolean; error: string; games: number; hours: number; achievements: number;
}
export interface PlatformInfo { id: string; name: string; state: 'live' | 'planned' | 'partner-only'; proof: string; imports: string; available: boolean }
export interface SyncResult { imported: number; checked: number; hours: number; achievements: number; more: boolean; link: LinkView }

export interface Fail { ok: false; error: string; httpStatus: number }
export type Res<T> = ({ ok: true } & T) | Fail;
/** Type guard (the app compiles without strictNullChecks, where `!r.ok` does not narrow the union). */
export const failed = <T,>(r: Res<T>): r is Fail => r.ok === false;

export const isSignedIn = () => !!auth.currentUser;

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

export const gamer = {
  me: () => call<{ profile: GamerProfile; public: boolean }>('GET', '/me'),
  profile: (uid: string) => call<{ profile: GamerProfile }>('GET', `/profile/${encodeURIComponent(uid)}`),
  history: (uid: string, limit = 30) => call<{ entries: GamerEntry[] }>('GET', `/history/${encodeURIComponent(uid)}?limit=${limit}`),
  verify: (uid: string) => call<{ chain: { ok: boolean; length: number; problem?: string }; scoreMatches: boolean; recomputed: ScoreCard }>('GET', `/verify/${encodeURIComponent(uid)}`),
  leaderboard: (game: string = 'all', limit = 25) => call<{ players: LeaderRow[] }>('GET', `/leaderboard?game=${encodeURIComponent(game)}&limit=${limit}`),
  local: (game: string, result: 'win' | 'loss' | 'draw' | undefined, vs: 'cpu' | 'local', level?: string) => call<{}>('POST', '/local', { game, result, vs, level }),
  queue: (game: string) => call<{ status: 'waiting' | 'matched'; matchId?: string }>('POST', '/queue', { game }),
  pollQueue: (game: string) => call<{ status: 'idle' | 'waiting' | 'matched'; matchId?: string; waitedMs?: number }>('GET', `/queue?game=${encodeURIComponent(game)}`),
  leaveQueue: (game: string) => call<{ status: string; matchId?: string }>('DELETE', `/queue?game=${encodeURIComponent(game)}`),
  invite: (game: string) => call<{ matchId: string; code: string }>('POST', '/private', { game }),
  join: (code: string) => call<{ matchId: string }>('POST', '/join', { code }),
  match: (id: string) => call<MatchView>('GET', `/match/${encodeURIComponent(id)}`),
  move: (id: string, move: unknown, v: number) => call<MatchView>('POST', `/match/${encodeURIComponent(id)}/move`, { move, v }),
  resign: (id: string) => call<MatchView>('POST', `/match/${encodeURIComponent(id)}/resign`),
  rematch: (id: string) => call<MatchView>('POST', `/match/${encodeURIComponent(id)}/rematch`),
  links: () => call<{ links: LinkView[]; platforms: PlatformInfo[] }>('GET', '/links'),
  /** Returns Steam's sign-in URL; the caller navigates there and Steam redirects back to returnPath. */
  startSteamLink: (returnPath: string) => call<{ url: string }>('POST', '/links/steam/start', { returnPath }),
  syncSteam: () => call<SyncResult>('POST', '/links/steam/sync'),
  unlinkSteam: () => call<{ ok: boolean }>('DELETE', '/links/steam'),
};
