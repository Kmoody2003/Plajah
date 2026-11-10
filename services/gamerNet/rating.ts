// Per-game skill rating (Elo). New players move fast (K 40 for their first 20 rated games), then settle (K 24).

export const START_RATING = 1200;

export function expected(ra: number, rb: number): number { return 1 / (1 + 10 ** ((rb - ra) / 400)); }

/** New rating for A after one game. score: 1 win, 0.5 draw, 0 loss. */
export function nextRating(ra: number, rb: number, score: 0 | 0.5 | 1, gamesPlayedA: number): number {
  const k = gamesPlayedA < 20 ? 40 : 24;
  return Math.round(ra + k * (score - expected(ra, rb)));
}
