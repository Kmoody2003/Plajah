// Pure: turn a realtime room's standings into one MATCH_RESULT ledger body per player.
//
// Rating: multiplayer Elo — each player's change is the average of their pairwise results against
// everyone else in the field (ahead = 1, behind = 0). With two players this is exactly
// services/gamerNet/rating.ts nextRating, so a 1v1 race and a Tic Tac Toe game move ratings the same way.
//
// Anti-farming: every entry names one opponent (1v1: the other player; a field: the winner names the
// runner-up, everyone else names the player directly ahead), so score.ts's per-opponent cap
// (PAIR_DAILY_CAP matches per opponent per UTC day) applies unchanged.

import type { GamerEventBody } from '../gamerNet/ledger';
import { expected, nextRating } from '../gamerNet/rating';

export interface SettleStanding { uid: string; place: number; timeMs: number | null; dnf: boolean }
export interface SettleStats { rating: number; rated: number }

export function settlementPlan(p: {
  matchId: string; game: string; rated: boolean; at: number;
  standings: ReadonlyArray<SettleStanding>;
  stats: Readonly<Record<string, SettleStats>>;
}): GamerEventBody[] {
  const field = [...p.standings].sort((a, b) => a.place - b.place);
  const n = field.length;
  if (n < 2) return [];
  return field.map((me, i) => {
    const st = p.stats[me.uid] ?? { rating: 1200, rated: 0 };
    let after = st.rating;
    if (p.rated) {
      if (n === 2) {
        const opp = field[1 - i];
        after = nextRating(st.rating, (p.stats[opp.uid] ?? { rating: 1200 }).rating, i === 0 ? 1 : 0, st.rated);
      } else {
        const k = st.rated < 20 ? 40 : 24;
        let sum = 0;
        for (const o of field) if (o !== me) sum += (me.place < o.place ? 1 : me.place > o.place ? 0 : 0.5) - expected(st.rating, (p.stats[o.uid] ?? { rating: 1200 }).rating);
        after = Math.round(st.rating + (k * sum) / (n - 1));
      }
    }
    const opponent = i === 0 ? field[1] : field[i - 1];
    const time = me.timeMs !== null ? ` · ${fmt(me.timeMs)}` : me.dnf ? ' · DNF' : '';
    return {
      event: 'MATCH_RESULT', uid: me.uid, at: p.at, key: `rt:${p.matchId}`, source: 'first-party', game: p.game, matchId: p.matchId,
      opponentUid: opponent.uid, result: i === 0 ? 'win' : 'loss', rated: p.rated, ratingBefore: st.rating, ratingAfter: after,
      rank: i + 1, players: n, note: `P${i + 1}/${n}${time}`,
    } satisfies GamerEventBody;
  });
}

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(2).padStart(5, '0')}`;
