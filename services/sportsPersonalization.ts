import { ALL_TEAMS } from '../data/leagueTeams';

export interface FollowedTeam {
  name: string;
  league: string;
  logo?: string;
  espnId?: string;
  abbreviation?: string;
}

const normalized = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** Resolve old name-only preferences without fuzzy matching cities or nicknames. */
export function normalizeFollowedTeams(value: unknown): FollowedTeam[] {
  if (!Array.isArray(value)) return [];
  const result = new Map<string, FollowedTeam>();
  for (const item of value) {
    const name = typeof item === 'string' ? item : item?.name;
    if (typeof name !== 'string' || !name.trim()) continue;
    const league = typeof item?.league === 'string' ? item.league.toUpperCase() : '';
    const matches = ALL_TEAMS.filter(t => (!league || t.league === league) &&
      [t.name, t.id, t.abbreviation].some(alias => normalized(alias) === normalized(name)));
    const team = matches.length === 1 ? matches[0] : undefined;
    if (!team && !league) continue; // An ambiguous profile preference must not select the wrong team.
    const favorite: FollowedTeam = {
      name: team?.name || name.trim(), league: team?.league || league,
      logo: team?.logo || (typeof item?.logo === 'string' ? item.logo : undefined),
      espnId: team?.espnId || (typeof item?.espnId === 'string' ? item.espnId : undefined),
      abbreviation: team?.abbreviation || (typeof item?.abbreviation === 'string' ? item.abbreviation : undefined),
    };
    result.set(`${favorite.league}:${normalized(favorite.name)}`, favorite);
  }
  return [...result.values()].slice(0, 16);
}

export function favoriteStorageKey(uid?: string | null): string {
  return `plajah_sports_favorites_v3:${uid || 'guest'}`;
}

export function loadFollowedTeams(storage: Pick<Storage, 'getItem'>, uid?: string | null, profile?: unknown): FollowedTeam[] {
  try {
    const saved = storage.getItem(favoriteStorageKey(uid));
    if (saved !== null) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return normalizeFollowedTeams(parsed);
    }
    // Only migrate the anonymous list into the anonymous account.
    if (!uid) {
      const legacy = storage.getItem('vibestream_favorite_teams_v2');
      if (legacy) return normalizeFollowedTeams(JSON.parse(legacy));
    }
  } catch { /* Disabled/corrupt storage must not break Sports. */ }
  return normalizeFollowedTeams(profile);
}

export interface FollowedGame {
  id: string;
  league: string;
  event: any;
  fetchedAt: number;
  sourceUrl: string;
  detailUrl?: string;
}

export function gameStatus(game: FollowedGame): any {
  return game.event.competitions?.[0]?.status?.type ?? game.event.status?.type ?? {};
}

export function teamPlays(game: FollowedGame, favorite: FollowedTeam): boolean {
  if (game.league !== favorite.league) return false;
  return (game.event.competitions?.[0]?.competitors || []).some((competitor: any) => {
    const team = competitor.team;
    if (!team) return false;
    return (favorite.espnId && normalized(team.id) === normalized(favorite.espnId)) ||
      (favorite.abbreviation && normalized(team.abbreviation) === normalized(favorite.abbreviation)) ||
      normalized(team.displayName) === normalized(favorite.name);
  });
}

export const SCHEDULE_FRESH_MS = 90_000;
export const localDayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
const gameTime = (game: FollowedGame) => Date.parse(game.event.date || game.event.competitions?.[0]?.date || '');
const inactive = (game: FollowedGame) => /postpon|cancel|suspend|delay/i.test(`${gameStatus(game).name || ''} ${gameStatus(game).detail || ''} ${gameStatus(game).shortDetail || ''}`);

export function selectSportsLanding(games: FollowedGame[], favorites: FollowedTeam[], now = Date.now()) {
  const followed = games.filter(game => favorites.some(team => teamPlays(game, team)));
  const fresh = followed.filter(game => now >= game.fetchedAt && now - game.fetchedAt <= SCHEDULE_FRESH_MS);
  const today = fresh.filter(game => {
    const status = gameStatus(game);
    const time = gameTime(game);
    if (!Number.isFinite(time) || inactive(game) || !['pre', 'in', 'post'].includes(status.state)) return false;
    // A game that crosses local midnight remains featured while actually in progress.
    return localDayKey(new Date(time)) === localDayKey(new Date(now)) ||
      (status.state === 'in' && time <= now && now - time < 18 * 60 * 60 * 1000);
  }).sort((a, b) => {
    const rank = (game: FollowedGame) => ({ in: 0, pre: 1, post: 2 }[gameStatus(game).state as 'in' | 'pre' | 'post'] ?? 3);
    return rank(a) - rank(b) || gameTime(a) - gameTime(b);
  });
  const next = favorites.flatMap(team => {
    const game = fresh.filter(game => teamPlays(game, team) && gameStatus(game).state === 'pre' && !inactive(game) && gameTime(game) > now)
      .sort((a, b) => gameTime(a) - gameTime(b))[0];
    return game ? [{ team, game }] : [];
  });
  return { mode: today.length ? 'gameday' as const : 'hub' as const, today, next };
}
