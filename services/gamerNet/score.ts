// Plajah Gamer Score — a pure fold over a player's ledger. The server applies one event at a time
// (applyEvent) as matches finish; recalculate() replays the whole chain from genesis and must land on
// the same numbers. Change the formula here and every profile can be recomputed from its own history.
//
//   play         5 per finished match, +10 a win, +4 a draw — counted for at most 5 matches per opponent
//                per UTC day, so two friends can't farm each other
//   achievements catalog points (first-party) or imported points, × source trust
//   external     playtime and achievements from other platforms, × source trust (self-reported = 0).
//                Playtime scores 4·√(total hours) per game, so an import tagged with externalGameId adds
//                only the step from the game's previous total: syncing daily or once a year lands on the
//                same number (√ is concave — summing √ of each delta would reward frequent syncs).
//   skill        (rating − 1200) × 0.5 for each game above the starting rating, best 5 games
//   live         live party games (LIVE_GAME): the entry's points (≤ 50 each, set by liveGames/core gamerPointsFor),
//                × source trust, counted for at most LIVE_DAILY_CAP games per UTC day
//
// LOCAL_PLAY (same device, vs CPU) is history only: nobody refereed it, so it never moves the score.

import type { GamerEntry, GamerSource } from './ledger';
import { START_RATING } from './rating';

export const SOURCE_TRUST: Readonly<Record<GamerSource, number>> = { 'first-party': 1, partner: 0.8, linked: 0.6, self: 0 };
export const PAIR_DAILY_CAP = 5;
export const LIVE_DAILY_CAP = 5;

export interface GameStats { rating: number; rated: number; wins: number; losses: number; draws: number; streak: number; best: number }
export interface GamerFold {
  events: number;
  play: number;
  achievements: number;
  external: number;
  games: Record<string, GameStats>;
  /** `<game>|<opponent>|<utc day>` → counted matches; only the latest day is kept. */
  pairDay: Record<string, number>;
  pairDayKey: string;
  achievementIds: string[];
  localPlays: number;
  externalHours: number;
  platforms: string[];
  /** `<source>:<platform>:<externalGameId>` → cumulative imported hours (the √ base for the next import). */
  extGames?: Record<string, number>;
  /** Live party games: points so far, and games counted on the latest UTC day (anti-farming cap). */
  live?: number;
  liveDayKey?: string;
  liveDayCount?: number;
  livePlays?: number;
}

export const emptyFold = (): GamerFold => ({ events: 0, play: 0, achievements: 0, external: 0, games: {}, pairDay: {}, pairDayKey: '', achievementIds: [], localPlays: 0, externalHours: 0, platforms: [], extGames: {} });
export const emptyStats = (): GameStats => ({ rating: START_RATING, rated: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: 0 });
const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

export function applyEvent(prev: GamerFold, e: GamerEntry): GamerFold {
  const f: GamerFold = { ...prev, games: { ...prev.games }, pairDay: { ...prev.pairDay }, achievementIds: [...prev.achievementIds], platforms: [...prev.platforms], extGames: { ...(prev.extGames ?? {}) }, events: prev.events + 1 };
  const trust = SOURCE_TRUST[e.source] ?? 0;
  switch (e.event) {
    case 'MATCH_RESULT': {
      if (!e.game || !e.result) break;
      const g = { ...(f.games[e.game] ?? emptyStats()) };
      if (e.result === 'win') { g.wins++; g.streak++; g.best = Math.max(g.best, g.streak); }
      else if (e.result === 'loss') { g.losses++; g.streak = 0; }
      else { g.draws++; }
      if (e.rated && typeof e.ratingAfter === 'number') { g.rating = e.ratingAfter; g.rated++; }
      f.games[e.game] = g;
      const day = utcDay(e.at);
      if (day !== f.pairDayKey) { f.pairDay = {}; f.pairDayKey = day; }
      const pk = `${e.game}|${e.opponentUid ?? '?'}|${day}`;
      const n = f.pairDay[pk] ?? 0;
      f.pairDay[pk] = n + 1;
      if (n < PAIR_DAILY_CAP) f.play += trust * (5 + (e.result === 'win' ? 10 : e.result === 'draw' ? 4 : 0));
      break;
    }
    case 'ACHIEVEMENT': {
      const id = e.achievementId; if (!id || f.achievementIds.includes(id)) break;
      f.achievementIds.push(id);
      f.achievements += trust * Math.max(0, Math.min(1000, e.points ?? 0));
      break;
    }
    case 'LOCAL_PLAY': f.localPlays++; break;
    case 'LIVE_GAME': {
      f.livePlays = (f.livePlays ?? 0) + 1;
      const day = utcDay(e.at);
      if (day !== f.liveDayKey) { f.liveDayKey = day; f.liveDayCount = 0; }
      if ((f.liveDayCount ?? 0) < LIVE_DAILY_CAP) {
        f.liveDayCount = (f.liveDayCount ?? 0) + 1;
        f.live = (f.live ?? 0) + trust * Math.max(0, Math.min(50, e.points ?? 0));
      }
      break;
    }
    case 'EXTERNAL_IMPORT': {
      const hours = Math.max(0, Math.min(10_000, e.hours ?? 0));
      const ach = Math.max(0, Math.min(10_000, e.achievementsUnlocked ?? 0));
      f.externalHours += hours;
      if (e.externalGameId && e.platform) {
        const gk = `${e.source}:${e.platform}:${e.externalGameId}`;
        const before = f.extGames![gk] ?? 0, after = Math.min(10_000, before + hours);
        f.extGames![gk] = after;
        f.external += trust * ((Math.sqrt(after) - Math.sqrt(before)) * 4 + ach * 2);
      } else {
        f.external += trust * (Math.sqrt(hours) * 4 + ach * 2);
      }
      if (e.platform && !f.platforms.includes(e.platform)) f.platforms.push(e.platform);
      break;
    }
  }
  return f;
}

export function skillPoints(f: GamerFold): number {
  return Object.values(f.games).map(g => Math.max(0, g.rating - START_RATING) * 0.5).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0);
}

export interface ScoreCard { total: number; play: number; achievements: number; external: number; skill: number; live?: number }
export function scoreOf(f: GamerFold): ScoreCard {
  const skill = skillPoints(f);
  const r = (x: number) => Math.round(x);
  const live = f.live ?? 0;
  return { total: r(f.play + f.achievements + f.external + skill + live), play: r(f.play), achievements: r(f.achievements), external: r(f.external), skill: r(skill), ...(live ? { live: r(live) } : {}) };
}

export const recalculate = (entries: ReadonlyArray<GamerEntry>): GamerFold => [...entries].sort((a, b) => a.seq - b.seq).reduce(applyEvent, emptyFold());

// ── first-party achievements, checked after every refereed match ─────────────────────────────
export interface AchievementDef { id: string; game: string; title: string; points: number; earned(g: GameStats): boolean }
export const ACHIEVEMENTS: ReadonlyArray<AchievementDef> = [
  { id: 'ttt.first-win', game: 'ttt', title: 'First Circuit', points: 25, earned: g => g.wins >= 1 },
  { id: 'ttt.streak-3', game: 'ttt', title: 'Triple Line', points: 50, earned: g => g.best >= 3 },
  { id: 'ttt.wins-10', game: 'ttt', title: 'Grid Runner', points: 75, earned: g => g.wins >= 10 },
  { id: 'ttt.rating-1400', game: 'ttt', title: 'Neon Elite', points: 150, earned: g => g.rating >= 1400 },
];
export const newlyEarned = (f: GamerFold, game: string): AchievementDef[] => {
  const g = f.games[game]; if (!g) return [];
  return ACHIEVEMENTS.filter(a => a.game === game && !f.achievementIds.includes(a.id) && a.earned(g));
};
