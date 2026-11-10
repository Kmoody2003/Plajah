// Plajah Gamer Network × Social — the pure half. Games shared to the Social timeline, the "who's on the
// timeline right now" lobby, challenges sent from a post / profile / chat, and the share text for a finished
// match. The server (routes/gamerSocial.ts) changes lobby and challenge docs only through these functions;
// the feed card (components/games/social/GameEmbedCard.tsx) renders a post's `gameEmbed` through
// sanitizeGameEmbed, so a hand-written post can't inject anything but ids the server then checks.
//
// A post never carries a result the server didn't referee: a 'result' embed holds only the match id, and the
// card reads the real board and winner from /api/gamer/match/:id.

import { gameRules } from './registry';
import type { MatchDoc } from './match';
import * as ttt from './games/ticTacToe';

// ───────────────────────────────────────────── post embed
export type GameEmbedKind = 'play' | 'challenge' | 'result' | 'live';
export interface GameEmbed {
  v: 1;
  game: string;
  kind: GameEmbedKind;
  matchId?: string;
  challengeId?: string;
  /** challenge posts: who was called out (display only — the challenge doc is the truth). */
  toUid?: string;
  toName?: string;
  /** live posts: the `streams/{id}` broadcast of this match. */
  streamId?: string;
}

const ID = /^[A-Za-z0-9_-]{1,128}$/;
const idOr = (v: unknown): string | undefined => (typeof v === 'string' && ID.test(v) ? v : undefined);

/** Validate an embed read from an untrusted post. Null when it isn't a playable game embed. */
export function sanitizeGameEmbed(x: unknown): GameEmbed | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!gameRules(o.game)) return null;
  const kind = (['play', 'challenge', 'result', 'live'] as const).find(k => k === o.kind);
  if (!kind) return null;
  const e: GameEmbed = { v: 1, game: o.game as string, kind };
  const matchId = idOr(o.matchId), challengeId = idOr(o.challengeId), toUid = idOr(o.toUid), streamId = idOr(o.streamId);
  if (matchId) e.matchId = matchId;
  if (challengeId) e.challengeId = challengeId;
  if (toUid) e.toUid = toUid;
  if (typeof o.toName === 'string' && o.toName.trim()) e.toName = o.toName.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
  if (streamId) e.streamId = streamId;
  if (kind === 'result' && !e.matchId) return null;
  if (kind === 'challenge' && !e.challengeId) return null;
  return e;
}

// ───────────────────────────────────────────── timeline lobby (presence)
/** One person who has a game card on screen. Refreshed by a heartbeat while the card is visible. */
export interface LobbyRow {
  uid: string;
  game: string;
  name: string;
  photo?: string;
  rating: number;
  seenAt: number;
  /** Tapped "Find a match" on the card: wants to be paired with someone else on the timeline. */
  seeking: boolean;
  seekingSince?: number;
  status: 'here' | 'matched' | 'left';
  matchId?: string;
  isChild?: boolean;
}

export const LOBBY_STALE_MS = 40_000;
export const LOBBY_HEARTBEAT_MS = 15_000;
export const LOBBY_SHOW = 12;

export interface LobbyPerson { uid: string; name: string; photo: string; rating: number; seeking: boolean }

/**
 * Who else is on the timeline with this game right now: fresh heartbeats only, never me, never anyone I've
 * blocked, children shown as "Player" with no photo. Seekers first (they want a game now), then most recent.
 */
export function lobbyView(rows: ReadonlyArray<LobbyRow>, me: string | null, now: number, blocked: ReadonlySet<string> = new Set()): { count: number; people: LobbyPerson[] } {
  const seen = new Set<string>();
  const fresh = rows.filter(r => {
    if (!r || r.uid === me || blocked.has(r.uid) || r.status !== 'here' || now - r.seenAt > LOBBY_STALE_MS || seen.has(r.uid)) return false;
    seen.add(r.uid); return true;
  });
  fresh.sort((a, b) => (Number(b.seeking) - Number(a.seeking)) || (b.seenAt - a.seenAt));
  return {
    count: fresh.length,
    people: fresh.slice(0, LOBBY_SHOW).map(r => ({ uid: r.uid, name: r.isChild ? 'Player' : r.name || 'Player', photo: r.isChild ? '' : r.photo || '', rating: r.rating, seeking: r.seeking })),
  };
}

// ───────────────────────────────────────────── challenges
export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
export type ChallengeSource = 'post' | 'profile' | 'chat' | 'feed';

export interface ChallengeDoc {
  id: string;
  game: string;
  from: string;
  fromName: string;
  fromPhoto?: string;
  to: string;
  toName: string;
  status: ChallengeStatus;
  source: ChallengeSource;
  postId?: string;
  createdAt: number;
  expiresAt: number;
  respondedAt?: number;
  matchId?: string;
}

/** A challenge is a live call-out ("I'm here now"), so it doesn't sit around for days. */
export const CHALLENGE_TTL_MS = 15 * 60_000;
export const MAX_PENDING_OUT = 5;
export const MAX_PER_HOUR = 20;

export type ChallengeCheck = { ok: true } | { ok: false; error: string; status: number };

/** Can `from` send a new challenge to `to`, given their recent outgoing challenges? */
export function canChallenge(from: string, to: string, recentOut: ReadonlyArray<ChallengeDoc>, now: number): ChallengeCheck {
  if (!to || to === from) return { ok: false, error: 'Pick someone else to challenge', status: 400 };
  const live = recentOut.filter(c => c.status === 'pending' && c.expiresAt > now);
  if (live.some(c => c.to === to)) return { ok: false, error: 'You already challenged them — waiting on their answer', status: 409 };
  if (live.length >= MAX_PENDING_OUT) return { ok: false, error: `You have ${MAX_PENDING_OUT} challenges waiting. Let some land first.`, status: 429 };
  if (recentOut.filter(c => now - c.createdAt < 3600_000).length >= MAX_PER_HOUR) return { ok: false, error: 'That is a lot of challenges for one hour — try again a little later', status: 429 };
  return { ok: true };
}

export function newChallenge(p: { id: string; game: string; from: { uid: string; name: string; photo?: string }; to: { uid: string; name: string }; source: ChallengeSource; postId?: string; now: number }): ChallengeDoc | null {
  if (!gameRules(p.game) || !p.from.uid || !p.to.uid || p.from.uid === p.to.uid) return null;
  return {
    id: p.id, game: p.game, from: p.from.uid, fromName: p.from.name || 'Player', ...(p.from.photo ? { fromPhoto: p.from.photo } : {}),
    to: p.to.uid, toName: p.to.name || 'Player', status: 'pending', source: p.source, ...(p.postId ? { postId: p.postId } : {}),
    createdAt: p.now, expiresAt: p.now + CHALLENGE_TTL_MS,
  };
}

export type ChallengeAction = 'accept' | 'decline' | 'cancel';
export type ChallengeStep = { ok: true; doc: ChallengeDoc } | { ok: false; error: string; status: number };

/** Pending → accepted/declined (by the person challenged) or cancelled (by the challenger). Expiry wins over everything. */
export function respond(doc: ChallengeDoc, uid: string, action: ChallengeAction, now: number, matchId?: string): ChallengeStep {
  if (doc.status === 'pending' && now > doc.expiresAt) return { ok: false, error: 'That challenge expired', status: 410 };
  if (doc.status !== 'pending') return { ok: false, error: doc.status === 'accepted' ? 'Already accepted' : `That challenge was ${doc.status}`, status: 409 };
  if (action === 'cancel') {
    if (uid !== doc.from) return { ok: false, error: 'Only the challenger can cancel', status: 403 };
    return { ok: true, doc: { ...doc, status: 'cancelled', respondedAt: now } };
  }
  if (uid !== doc.to) return { ok: false, error: 'This challenge is for someone else', status: 403 };
  if (action === 'decline') return { ok: true, doc: { ...doc, status: 'declined', respondedAt: now } };
  if (!matchId) return { ok: false, error: 'No match to start', status: 500 };
  return { ok: true, doc: { ...doc, status: 'accepted', respondedAt: now, matchId } };
}

/** The status a reader should see (a pending doc past its deadline reads as expired without a write). */
export const effectiveStatus = (doc: ChallengeDoc, now: number): ChallengeStatus => (doc.status === 'pending' && now > doc.expiresAt ? 'expired' : doc.status);

/**
 * Seats for an accepted challenge: the person who accepted is right there, so they open as X and move first;
 * the challenger is notified and their open card jumps into the match.
 */
export const challengeSeats = (doc: ChallengeDoc): { seat0: string; seat1: string } => ({ seat0: doc.to, seat1: doc.from });

/** The first move gets a longer clock so the challenger has time to get from the notification to the board. */
export const OPENING_GRACE_MS = 90_000;
export const withOpeningGrace = (m: MatchDoc, now: number): MatchDoc => ({ ...m, moveDeadline: Math.max(m.moveDeadline, now + OPENING_GRACE_MS) });

// ───────────────────────────────────────────── sharing a finished match
export interface MatchSummary {
  game: string;
  title: string;
  you: string;
  opponent: string;
  outcome: 'win' | 'loss' | 'draw';
  reason?: string;
  rated: boolean;
  moves: number;
}

export function summarizeMatch(m: MatchDoc, seat: number): MatchSummary | null {
  if (m.status !== 'done' || m.endReason === 'abandoned' || seat < 0 || seat > 1 || m.cards.length < 2) return null;
  const outcome = m.winnerSeat === null || m.winnerSeat === undefined ? 'draw' : m.winnerSeat === seat ? 'win' : 'loss';
  return {
    game: m.game, title: gameRules(m.game)?.title ?? m.game, you: m.cards[seat]?.name || 'Player', opponent: m.cards[1 - seat]?.name || 'Player',
    outcome, reason: m.endReason, rated: m.rated, moves: m.moves,
  };
}

/** Tic Tac Toe board as three emoji rows, readable anywhere (Bluesky included). */
export function boardEmoji(state: string): string {
  if (!ttt.isBoard(state)) return '';
  const cell = (c: string) => (c === 'X' ? '❌' : c === 'O' ? '⭕' : '⬛');
  return [0, 3, 6].map(i => [...state.slice(i, i + 3)].map(cell).join('')).join('\n');
}

const REASON: Record<string, string> = { timeout: ' on the clock', resign: ' by resignation' };

/** The headline for a finished match, from one player's side. */
export function resultLine(s: MatchSummary): string {
  const why = REASON[s.reason ?? ''] ?? '';
  if (s.outcome === 'win') return `I beat ${s.opponent} at ${s.title}${why}`;
  if (s.outcome === 'loss') return `${s.opponent} got me at ${s.title}${why}. Rematch incoming`;
  return `${s.opponent} and I drew at ${s.title}. Nobody blinked`;
}

/**
 * Post text for a finished match. Bluesky keeps the first 300 graphemes and the crosspost appends the Plajah
 * link, so this stays well under that: headline, the board, and one hashtag.
 */
export function matchShareText(m: MatchDoc, seat: number, opts: { live?: boolean } = {}): string {
  const s = summarizeMatch(m, seat);
  if (!s) return '';
  const board = m.game === 'ttt' && m.moves > 0 ? boardEmoji(m.state) : '';
  const tag = s.rated ? ' · rated' : '';
  return [`${resultLine(s)} 🎮${tag}`, board, opts.live ? 'Played live on Plajah.' : 'Play me right in the Plajah timeline.', '#PlajahGames']
    .filter(Boolean).join('\n\n');
}

/** Text for a "play this" post: what someone scrolling past sees above the playable card. */
export function playPostText(game: string, name?: string): string {
  const title = gameRules(game)?.title ?? 'a game';
  return name ? `${name} wants a game of ${title}. Tap the board to play, or find a match with someone on the timeline right now.`
    : `${title} — tap the board to play, or find a match with someone on the timeline right now.`;
}

export function challengePostText(game: string, toName: string): string {
  return `I'm challenging ${toName} to ${gameRules(game)?.title ?? 'a game'}. Accept it right here on the card. 🎮`;
}

/** Live title for "Go live" on a match. */
export function liveTitle(m: Pick<MatchDoc, 'game' | 'cards'>, seat: number): string {
  const title = gameRules(m.game)?.title ?? 'Live match';
  const me = m.cards[seat]?.name, opp = m.cards[1 - seat]?.name;
  return me && opp ? `${title}: ${me} vs ${opp}` : `${title} live`;
}
