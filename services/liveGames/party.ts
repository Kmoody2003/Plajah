// Live party games, part two: the "answer" games that run in the same live room as Sketch Rush.
//
//   Brain Rush      trivia, four choices, faster right answers score more.
//   Crowd Says      everyone answers a survey prompt; the crowd's own answers become the board, and you score
//                   by how many people said what you said.
//   Impostor Night  everyone gets the secret word except the impostors (category only). Everyone gives a
//                   one-word clue, the room votes, impostors win by not getting caught.
//
// Pure rules only (no IO); routes/liveParty.ts referees and stores. The public game doc lives in the same
// `liveGames` collection as Sketch Rush, so the feed card, Live now strip and realtime listeners serve both.

import { normalizeAnswer, judgeGuess, publicGuessText, topRows, type TopRow } from './core';

export type PartyKind = 'trivia' | 'crowd' | 'impostor';
export const PARTY_KINDS: ReadonlyArray<PartyKind> = ['trivia', 'crowd', 'impostor'];
export type PartyStatus = 'lobby' | 'answer' | 'vote' | 'reveal' | 'ended';

export const PARTY_TITLES: Record<PartyKind, string> = { trivia: 'Brain Rush', crowd: 'Crowd Says', impostor: 'Impostor Night' };

export interface PartySettings { rounds: number; answerMs: number; voteMs: number; revealMs: number; pack: string }
const DEFAULTS: Record<PartyKind, PartySettings> = {
  trivia: { rounds: 10, answerMs: 12_000, voteMs: 0, revealMs: 5_000, pack: 'general' },
  crowd: { rounds: 6, answerMs: 25_000, voteMs: 0, revealMs: 9_000, pack: 'everyday' },
  impostor: { rounds: 4, answerMs: 40_000, voteMs: 30_000, revealMs: 9_000, pack: 'everyday' },
};
export function clampPartySettings(kind: PartyKind, s: Partial<PartySettings> | undefined): PartySettings {
  const d = DEFAULTS[kind], n = (v: unknown, lo: number, hi: number, dv: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Math.round(Number(v)))) : dv);
  return {
    rounds: n(s?.rounds, 1, 20, d.rounds),
    answerMs: n(s?.answerMs, kind === 'trivia' ? 6_000 : 15_000, 90_000, d.answerMs),
    voteMs: kind === 'impostor' ? n(s?.voteMs, 15_000, 90_000, d.voteMs) : 0,
    revealMs: n(s?.revealMs, 3_000, 20_000, d.revealMs),
    pack: typeof s?.pack === 'string' && /^[a-z]{2,20}$/.test(s.pack) ? s.pack : d.pack,
  };
}

export interface BoardRow { text: string; count: number }
export interface ClueRow { uid: string; name: string; text: string }

/** Public doc. Holds nothing secret while a round is open: trivia's answer index, the impostor word and
 *  the impostor list only appear in `reveal`, which is written when the round closes. */
export interface PartyGameDoc {
  id: string; kind: PartyKind; title: string;
  hostUid: string; hostName: string; hostPhoto: string; streamId: string;
  settings: PartySettings;
  status: PartyStatus; round: number; phaseEndsAt: number; phaseStartedAt: number;
  /** Trivia question / crowd prompt / impostor category. */
  prompt: string;
  options: string[];
  answered: number;
  /** Impostor: the clues everyone can vote on (written when voting opens). */
  clues: ClueRow[];
  reveal: { correct?: number; counts?: number[]; board?: BoardRow[]; word?: string; impostors?: Array<{ uid: string; name: string }>; caught?: boolean; votes?: Array<{ uid: string; name: string; votes: number }> } | null;
  top: TopRow[]; players: number;
  createdAt: number; updatedAt: number; hostSeenAt: number; endedAt: number;
}

/** Server-only per game. */
export interface PartySecret { used: number[]; answer: number; word: string; impostors: string[] }

// ───────────────────────────────────────────── scoring
/** Brain Rush: 100 for right, plus up to 400 for speed. */
export function triviaPoints(elapsedMs: number, answerMs: number): number {
  const left = Math.max(0, Math.min(1, 1 - elapsedMs / Math.max(1, answerMs)));
  return 100 + Math.round(400 * left);
}

/** Group answers the way the crowd means them: "Pizza!", "pizzas" and "a pizza" are one answer. */
export function crowdKey(text: string): string {
  let k = normalizeAnswer(text).replace(/^(a|an|the|some|my)\s+/, '');
  if (k.length > 3 && k.endsWith('es') && /(s|x|z|ch|sh)es$/.test(k)) k = k.slice(0, -2);
  else if (k.length > 3 && k.endsWith('s') && !k.endsWith('ss')) k = k.slice(0, -1);
  return k;
}

/** The board: the six most common answers, with the text most people used for each. */
export function crowdBoard(answers: ReadonlyArray<string>, size = 6): BoardRow[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const raw of answers) {
    const shown = publicGuessText(raw); if (!shown) continue;
    const key = crowdKey(shown); if (!key) continue;
    const g = groups.get(key) ?? { count: 0, spellings: new Map() };
    g.count++; g.spellings.set(shown.toLowerCase(), (g.spellings.get(shown.toLowerCase()) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, count: g.count, text: [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, size).map(({ text, count }) => ({ text, count }));
}

/** Crowd Says points: on the board pays by popularity (100–500); off the board pays nothing. */
export function crowdPoints(myAnswer: string, board: ReadonlyArray<BoardRow>): number {
  if (!board.length) return 0;
  const k = crowdKey(myAnswer), top = board[0].count;
  const row = board.find(b => crowdKey(b.text) === k);
  return row ? 100 + Math.round(400 * (row.count / Math.max(1, top))) : 0;
}

/** How many impostors for this many players: 1, then one more per 7 players, at most 4. */
export const impostorCount = (players: number) => Math.max(1, Math.min(4, Math.floor(players / 7)));

export function pickImpostors(uids: ReadonlyArray<string>, rand: () => number = Math.random): string[] {
  const pool = [...uids];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, impostorCount(uids.length));
}

/** A clue is one or two words and may not give the word away. */
export function cleanClue(raw: string, word: string): { ok: true; text: string } | { ok: false; error: string } {
  const shown = publicGuessText(raw);
  if (!shown) return { ok: false, error: 'Keep it clean and short' };
  if (shown.split(/\s+/).length > 2) return { ok: false, error: 'One or two words only' };
  if (word && judgeGuess(shown, word) !== 'wrong') return { ok: false, error: 'Too close to the word!' };
  return { ok: true, text: shown };
}

export const IMPOSTOR_CREW_CATCH = 200;   // crew who voted for an impostor
export const IMPOSTOR_ESCAPE = 400;       // impostor not among the most-voted
export const IMPOSTOR_CLUE = 50;          // anyone who gave a clue (keeps people playing)

/** Tally votes. Caught = an impostor got the most votes (ties count as caught only if every top pick is an impostor). */
export function tallyImpostor(votes: ReadonlyArray<{ voter: string; target: string }>, impostors: ReadonlyArray<string>) {
  const counts = new Map<string, number>();
  for (const v of votes) if (v.target && v.target !== v.voter) counts.set(v.target, (counts.get(v.target) ?? 0) + 1);
  const max = Math.max(0, ...counts.values());
  const topIds = max > 0 ? [...counts.entries()].filter(([, n]) => n === max).map(([u]) => u) : [];
  const caughtIds = new Set(topIds.length && topIds.every(u => impostors.includes(u)) ? topIds : []);
  return { counts, topIds, caught: impostors.length > 0 && impostors.every(u => caughtIds.has(u)), caughtIds };
}

export type PartyTick = { kind: 'none' } | { kind: 'close' } | { kind: 'toVote' } | { kind: 'next' } | { kind: 'endGame'; reason: 'done' | 'host-gone' };
export function partyTick(g: Pick<PartyGameDoc, 'kind' | 'status' | 'round' | 'phaseEndsAt' | 'hostSeenAt' | 'settings'>, now: number, hostGoneMs = 90_000): PartyTick {
  if (g.status === 'ended') return { kind: 'none' };
  if (now - g.hostSeenAt > hostGoneMs) return { kind: 'endGame', reason: 'host-gone' };
  if (g.status === 'lobby' || now < g.phaseEndsAt) return { kind: 'none' };
  if (g.status === 'answer') return g.kind === 'impostor' ? { kind: 'toVote' } : { kind: 'close' };
  if (g.status === 'vote') return { kind: 'close' };
  return g.round >= g.settings.rounds ? { kind: 'endGame', reason: 'done' } : { kind: 'next' };
}

/** Pick an unused index; once all are used, start over. */
export function pickIndex(size: number, used: ReadonlyArray<number>, rand: () => number = Math.random): number {
  const free = Array.from({ length: size }, (_, i) => i).filter(i => !used.includes(i));
  const pool = free.length ? free : Array.from({ length: size }, (_, i) => i);
  return pool[Math.floor(rand() * pool.length)];
}

export { topRows };
