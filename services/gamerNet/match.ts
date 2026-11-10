// Online match state machine — pure. The server stores one doc per match and only ever changes it
// through these functions inside a compare-and-swap, so two requests can't both move, and a finished
// match can't be finished twice.

import { gameRules, type GameRules } from './registry';

export type MatchStatus = 'waiting' | 'active' | 'done';
export type EndReason = 'line' | 'draw' | 'timeout' | 'resign' | 'abandoned';

export interface PlayerCard { uid: string; name: string; photo?: string; rating: number }

export interface MatchDoc {
  id: string;
  game: string;
  rated: boolean;
  status: MatchStatus;
  /** seat 0, seat 1 (seat 1 is empty while a private invite waits). */
  players: string[];
  cards: PlayerCard[];
  state: string;
  moves: number;
  v: number;
  createdAt: number;
  updatedAt: number;
  moveDeadline: number;
  code?: string;
  winnerSeat?: number | null;
  endReason?: EndReason;
  detail?: unknown;
  settled?: boolean;
  rematchVotes?: string[];
  nextMatchId?: string;
}

export type Step = { ok: true; doc: MatchDoc; finished: boolean } | { ok: false; error: string; status: number };

const rulesFor = (doc: MatchDoc): GameRules | null => gameRules(doc.game);

export function newMatch(p: { id: string; game: string; rated: boolean; now: number; seat0: PlayerCard; seat1?: PlayerCard; code?: string }): MatchDoc | null {
  const rules = gameRules(p.game); if (!rules) return null;
  const active = !!p.seat1;
  return {
    id: p.id, game: p.game, rated: p.rated, status: active ? 'active' : 'waiting',
    players: active ? [p.seat0.uid, p.seat1!.uid] : [p.seat0.uid], cards: active ? [p.seat0, p.seat1!] : [p.seat0],
    state: rules.initial(), moves: 0, v: 1, createdAt: p.now, updatedAt: p.now,
    moveDeadline: active ? p.now + rules.moveTimeMs : 0, ...(p.code ? { code: p.code } : {}),
  };
}

export function join(doc: MatchDoc, card: PlayerCard, now: number): Step {
  const rules = rulesFor(doc); if (!rules) return { ok: false, error: 'Unknown game', status: 400 };
  if (doc.status !== 'waiting') return { ok: false, error: 'That match already started', status: 409 };
  if (doc.players[0] === card.uid) return { ok: false, error: 'Share the code with a friend — you are already in this match', status: 409 };
  return { ok: true, finished: false, doc: { ...doc, status: 'active', players: [doc.players[0], card.uid], cards: [doc.cards[0], card], moveDeadline: now + rules.moveTimeMs, v: doc.v + 1, updatedAt: now } };
}

const finish = (doc: MatchDoc, winnerSeat: number | null, endReason: EndReason, now: number, detail?: unknown): MatchDoc =>
  ({ ...doc, status: 'done', winnerSeat, endReason, ...(detail !== undefined ? { detail } : {}), moveDeadline: 0, v: doc.v + 1, updatedAt: now });

export function move(doc: MatchDoc, uid: string, mv: unknown, expectedV: number | undefined, now: number): Step {
  const rules = rulesFor(doc); if (!rules) return { ok: false, error: 'Unknown game', status: 400 };
  if (doc.status !== 'active') return { ok: false, error: 'This match is not in play', status: 409 };
  const seat = doc.players.indexOf(uid);
  if (seat < 0) return { ok: false, error: 'You are not in this match', status: 403 };
  if (expectedV !== undefined && expectedV !== doc.v) return { ok: false, error: 'The board changed — refreshing', status: 409 };
  if (now > doc.moveDeadline) return { ok: false, error: 'Time ran out', status: 409 };
  if (rules.seatToMove(doc.state) !== seat) return { ok: false, error: 'Not your turn', status: 409 };
  const next = rules.apply(doc.state, seat as 0 | 1, mv);
  if (next === null) return { ok: false, error: 'Illegal move', status: 400 };
  const moved: MatchDoc = { ...doc, state: next, moves: doc.moves + 1, v: doc.v + 1, updatedAt: now, moveDeadline: now + rules.moveTimeMs };
  const o = rules.outcome(next);
  if (!o) return { ok: true, finished: false, doc: moved };
  return { ok: true, finished: true, doc: finish(moved, o.draw ? null : o.winnerSeat, o.draw ? 'draw' : 'line', now, o.detail) };
}

export function resign(doc: MatchDoc, uid: string, now: number): Step {
  const seat = doc.players.indexOf(uid);
  if (seat < 0) return { ok: false, error: 'You are not in this match', status: 403 };
  if (doc.status === 'waiting') return { ok: true, finished: false, doc: { ...finish(doc, null, 'abandoned', now) } };
  if (doc.status !== 'active') return { ok: false, error: 'This match is over', status: 409 };
  return { ok: true, finished: true, doc: finish(doc, seat === 0 ? 1 : 0, 'resign', now) };
}

/** The player to move ran out of clock → they lose. Null when nothing is due. */
export function timeout(doc: MatchDoc, now: number): Step | null {
  const rules = rulesFor(doc);
  if (!rules || doc.status !== 'active' || now <= doc.moveDeadline) return null;
  const late = rules.seatToMove(doc.state);
  return { ok: true, finished: true, doc: finish(doc, late === 0 ? 1 : 0, 'timeout', now) };
}

/** 'win' | 'loss' | 'draw' for a seat of a finished match. */
export const resultFor = (doc: MatchDoc, seat: number): 'win' | 'loss' | 'draw' =>
  doc.winnerSeat === null || doc.winnerSeat === undefined ? 'draw' : doc.winnerSeat === seat ? 'win' : 'loss';
