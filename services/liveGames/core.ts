// Live party games — the pure half of the shared "live game room" engine. A host runs a game on their live
// stream; anyone watching (or scrolling past the post in their feed) plays along by typing. The server is the
// referee: it alone holds the secret prompt, judges every answer, and awards points, so nothing a client sends
// can reveal the answer or invent a score. Sketch Rush (draw-and-guess) is the first game; trivia, crowd
// survey and impostor games plug into the same room (rounds, timers, judged answers, scoreboard, feed join).
//
// No Firebase / IO here — routes/liveGames.ts does storage; tests/liveGames.test.ts covers every rule.

import { PROFANITY_SET, normalizeForMatch } from '../profanityLexicon';

export type LiveGameKind = 'sketch';
export type LiveGameStatus = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'ended';
/** Who holds the pen each round: always the host, or pass it to the previous round's fastest guesser. */
export type PenMode = 'host' | 'top-guesser';

export interface LiveGameSettings { rounds: number; roundMs: number; chooseMs: number; revealMs: number; pack: string; penMode: PenMode }
export const DEFAULT_SETTINGS: LiveGameSettings = { rounds: 6, roundMs: 75_000, chooseMs: 12_000, revealMs: 6_000, pack: 'everyday', penMode: 'host' };

export interface TopRow { uid: string; name: string; photo: string; score: number }

/** The public game doc — every viewer reads this. It never holds the word while a round is live. */
export interface LiveGameDoc {
  id: string;
  kind: LiveGameKind;
  title: string;
  hostUid: string;
  hostName: string;
  hostPhoto: string;
  /** The host's live stream / post, so a feed card can open the full broadcast. */
  streamId: string;
  settings: LiveGameSettings;
  status: LiveGameStatus;
  round: number;
  /** When the current phase (choosing / drawing / reveal) ends. */
  phaseEndsAt: number;
  roundStartedAt: number;
  drawerUid: string;
  drawerName: string;
  /** "_ _ a _ _" — underscores for unrevealed letters; spaces and punctuation show. */
  hint: string;
  wordLen: number;
  solvedCount: number;
  /** The answer, only during 'reveal' and after the game. */
  revealWord: string;
  top: TopRow[];
  players: number;
  createdAt: number;
  updatedAt: number;
  /** Host heartbeat; a game whose host went quiet drops out of discovery and ends itself. */
  hostSeenAt: number;
  endedAt: number;
}

/** Server-only: the word, the choices, and which words were already used. Never sent to viewers. */
export interface LiveGameSecret { word: string; choices: string[]; used: string[]; aliases: string[] }

export interface PlayerDoc {
  gid: string; uid: string; name: string; photo: string;
  score: number;
  /** Round number this player last solved (one solve per round). */
  solvedRound: number;
  solvedAtMs: number;
  lastPoints: number;
  guesses: number;
  lastGuessAt: number;
  joinedAt: number;
  seenAt: number;
  /** Rounds whose drawer award was already paid to this player (idempotent round end). */
  drewRounds: number[];
  isGuest: boolean;
}

// ───────────────────────────────────────────────────────── timing + limits
export const HOST_GONE_MS = 90_000;
export const GUESS_GAP_MS = 700;
export const GUESS_MAX_CHARS = 40;
export const LATE_GUESS_GRACE_MS = 800;
export const clampSettings = (s: Partial<LiveGameSettings> | undefined): LiveGameSettings => {
  const n = (v: unknown, lo: number, hi: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  return {
    rounds: n(s?.rounds, 1, 20, DEFAULT_SETTINGS.rounds),
    roundMs: n(s?.roundMs, 30_000, 180_000, DEFAULT_SETTINGS.roundMs),
    chooseMs: DEFAULT_SETTINGS.chooseMs,
    revealMs: DEFAULT_SETTINGS.revealMs,
    pack: typeof s?.pack === 'string' && s.pack ? s.pack.slice(0, 32) : DEFAULT_SETTINGS.pack,
    penMode: s?.penMode === 'top-guesser' ? 'top-guesser' : 'host',
  };
};

// ───────────────────────────────────────────────────────── words + judging
/** Lowercase, strip accents and punctuation, collapse spaces. "Ice-Cream!" → "ice cream". */
export function normalizeAnswer(s: string): string {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const squash = (s: string) => normalizeAnswer(s).replace(/ /g, '');
const singular = (w: string) => (w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);

export function levenshtein(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

export type Verdict = 'correct' | 'close' | 'wrong';

/** Judge a guess against the answer (and its aliases). Accepts plurals, spacing ("icecream"), and the answer
 *  said inside a sentence ("is it a cat?"). Near-misses are 'close' — told privately, never shown to others. */
export function judgeGuess(guess: string, answer: string, aliases: ReadonlyArray<string> = []): Verdict {
  const g = normalizeAnswer(guess); if (!g) return 'wrong';
  const targets = [answer, ...aliases].map(normalizeAnswer).filter(Boolean);
  for (const t of targets) {
    if (g === t || squash(g) === squash(t) || singular(g) === singular(t)) return 'correct';
    // The whole answer appears as words inside the guess.
    if (` ${g} `.includes(` ${t} `) || ` ${g} `.includes(` ${singular(t)} `)) return 'correct';
  }
  for (const t of targets) {
    const a = squash(g), b = squash(t);
    const allow = b.length >= 8 ? 2 : b.length >= 4 ? 1 : 0;
    if (allow && levenshtein(a, b, allow) <= allow) return 'close';
  }
  return 'wrong';
}

/** True when a wrong guess would spoil it if shown in the public feed (a near-miss or contains the answer). */
export const spoils = (guess: string, answer: string, aliases: ReadonlyArray<string> = []) => judgeGuess(guess, answer, aliases) !== 'wrong';

export function hasProfanity(text: string): boolean {
  return String(text).split(/[\s.,!?;:'"()\-_/]+/).some(w => w && PROFANITY_SET.has(normalizeForMatch(w)));
}

/** Clean a guess for the public feed: control chars out, length cap, profanity → null (not shown). */
export function publicGuessText(raw: string): string | null {
  const t = String(raw ?? '').replace(/[\u0000-\u001f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, GUESS_MAX_CHARS);
  if (!t || hasProfanity(t) || /https?:|www\.|@\w/.test(t)) return null;
  return t;
}

// ───────────────────────────────────────────────────────── hints
const letterIdx = (word: string) => [...word].map((c, i) => (/[a-z0-9]/i.test(c) ? i : -1)).filter(i => i >= 0);
function hashStr(s: string): number { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Letters revealed at this point of the round: none before half time, then up to ~1/3 of the letters
 *  (never all of them), spread over the second half. Order is fixed per word so every viewer agrees. */
export function revealedCount(word: string, elapsed: number, roundMs: number): number {
  const n = letterIdx(word).length; if (n < 3) return 0;
  const max = Math.max(1, Math.min(n - 2, Math.floor(n / 3)));
  const f = elapsed / roundMs; if (f < 0.5) return 0;
  return Math.min(max, 1 + Math.floor(((f - 0.5) / 0.5) * max));
}

export function hintFor(word: string, revealed: number): string {
  const idx = letterIdx(word);
  const order = [...idx].sort((a, b) => hashStr(`${word}:${a}`) - hashStr(`${word}:${b}`)).slice(0, revealed);
  return [...word].map((c, i) => (c === ' ' ? ' ' : !/[a-z0-9]/i.test(c) ? c : order.includes(i) ? c.toLowerCase() : '_')).join('');
}

// ───────────────────────────────────────────────────────── scoring
/** Points for a correct guess: 100–500 by time left, plus a podium bonus for the first three. */
export function guessPoints(elapsedMs: number, roundMs: number, solvePlace: number): number {
  const left = Math.max(0, Math.min(1, 1 - elapsedMs / roundMs));
  const bonus = solvePlace === 1 ? 100 : solvePlace === 2 ? 50 : solvePlace === 3 ? 25 : 0;
  return Math.round(100 + 400 * left) + bonus;
}
export const DRAWER_PER_SOLVER = 60;
export const DRAWER_CAP = 600;
export const drawerPoints = (solvers: number) => Math.min(DRAWER_CAP, solvers * DRAWER_PER_SOLVER);

/** Gamer-score points a live game adds to a player's universal score (score.ts LIVE_GAME, capped per day). */
export function gamerPointsFor(gamePoints: number, rank: number, players: number): number {
  const base = Math.min(40, 5 + Math.floor(Math.max(0, gamePoints) / 50));
  return base + (rank === 1 && players >= 5 ? 10 : 0);
}

export function topRows(players: ReadonlyArray<Pick<PlayerDoc, 'uid' | 'name' | 'photo' | 'score' | 'joinedAt'>>, n = 10): TopRow[] {
  return [...players].filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .slice(0, n).map(p => ({ uid: p.uid, name: p.name, photo: p.photo, score: p.score }));
}

/** Next drawer: the host, or (top-guesser mode) the fastest solver of the round just finished who is still here. */
export function nextDrawer(game: Pick<LiveGameDoc, 'hostUid' | 'hostName' | 'settings' | 'round'>, players: ReadonlyArray<PlayerDoc>, now: number): { uid: string; name: string } {
  if (game.settings.penMode === 'top-guesser') {
    const fast = players.filter(p => p.solvedRound === game.round && now - p.seenAt < 30_000 && !p.isGuest)
      .sort((a, b) => a.solvedAtMs - b.solvedAtMs)[0];
    if (fast) return { uid: fast.uid, name: fast.name };
  }
  return { uid: game.hostUid, name: game.hostName };
}

// ───────────────────────────────────────────────────────── strokes
// The drawing travels as small batches of vector ops, not video, so a viewer sees each line within a few
// hundred ms (a live video feed runs 10–20 s behind, which would make guesses race a stale picture).
// Canvas space is 1000 × 750 integer units; renderers scale to any size.
export const CANVAS_W = 1000, CANVAS_H = 750;
export const PALETTE = ['#111111', '#ffffff', '#7a7a7a', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#f06292', '#6d4c41', '#00bcd4'] as const;
export const WIDTHS = [4, 9, 18, 36] as const;
export const MAX_OPS_PER_BATCH = 60;
export const MAX_POINTS_PER_BATCH = 600;
export const MAX_BATCHES_PER_ROUND = 1500;

/** s = stroke (or its continuation, same id), c = clear canvas, u = undo stroke id. */
export type StrokeOp =
  | { t: 's'; id: number; c: string; w: number; p: number[] }
  | { t: 'c' }
  | { t: 'u'; id: number };

export interface StrokeBatch { gid: string; round: number; seq: number; ops: StrokeOp[]; at: number }

/** Validate a client batch; returns the cleaned ops or null when anything is off. */
export function cleanOps(raw: unknown): StrokeOp[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_OPS_PER_BATCH) return null;
  let points = 0; const out: StrokeOp[] = [];
  for (const o of raw as any[]) {
    if (!o || typeof o !== 'object') return null;
    if (o.t === 'c') { out.push({ t: 'c' }); continue; }
    const id = Number(o.id); if (!Number.isInteger(id) || id < 0 || id > 1e9) return null;
    if (o.t === 'u') { out.push({ t: 'u', id }); continue; }
    if (o.t !== 's' || !(PALETTE as readonly string[]).includes(o.c) || !(WIDTHS as readonly number[]).includes(o.w)) return null;
    if (!Array.isArray(o.p) || o.p.length < 2 || o.p.length % 2) return null;
    const p: number[] = [];
    for (let i = 0; i < o.p.length; i += 2) {
      const x = Math.round(Number(o.p[i])), y = Math.round(Number(o.p[i + 1]));
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      p.push(Math.min(CANVAS_W, Math.max(0, x)), Math.min(CANVAS_H, Math.max(0, y)));
    }
    points += p.length / 2; if (points > MAX_POINTS_PER_BATCH) return null;
    out.push({ t: 's', id, c: o.c, w: o.w, p });
  }
  return out;
}

/** Fold batches (in seq order) into the strokes currently on the canvas — what a late joiner should see. */
export function foldStrokes(batches: ReadonlyArray<Pick<StrokeBatch, 'seq' | 'ops'>>): Array<{ id: number; c: string; w: number; p: number[] }> {
  const strokes = new Map<number, { id: number; c: string; w: number; p: number[] }>();
  for (const b of [...batches].sort((a, z) => a.seq - z.seq)) for (const o of b.ops) {
    if (o.t === 'c') strokes.clear();
    else if (o.t === 'u') strokes.delete(o.id);
    else { const s = strokes.get(o.id); if (s) s.p.push(...o.p); else strokes.set(o.id, { id: o.id, c: o.c, w: o.w, p: [...o.p] }); }
  }
  return [...strokes.values()];
}

// ───────────────────────────────────────────────────────── phase machine
/** What should happen to a game at `now` with no input: the timer-driven transitions. The route applies the
 *  returned step inside a compare-and-swap, so two callers ticking at once advance a game exactly once. */
export type Tick = { kind: 'none' } | { kind: 'autoChoose' } | { kind: 'endRound' } | { kind: 'nextRound' } | { kind: 'endGame'; reason: 'done' | 'host-gone' } | { kind: 'hint'; hint: string };

export function tick(game: LiveGameDoc, secretWord: string, now: number): Tick {
  if (game.status === 'ended') return { kind: 'none' };
  if (game.status !== 'lobby' && now - game.hostSeenAt > HOST_GONE_MS) return { kind: 'endGame', reason: 'host-gone' };
  if (game.status === 'choosing' && now >= game.phaseEndsAt) return { kind: 'autoChoose' };
  if (game.status === 'drawing') {
    if (now >= game.phaseEndsAt) return { kind: 'endRound' };
    if (secretWord) {
      const h = hintFor(secretWord, revealedCount(secretWord, now - game.roundStartedAt, game.settings.roundMs));
      if (h !== game.hint) return { kind: 'hint', hint: h };
    }
  }
  if (game.status === 'reveal' && now >= game.phaseEndsAt) return game.round >= game.settings.rounds ? { kind: 'endGame', reason: 'done' } : { kind: 'nextRound' };
  return { kind: 'none' };
}

/** Pick three distinct, unused words for the drawer to choose from. `rand` is injectable for tests. */
export function pickChoices(pool: ReadonlyArray<string>, used: ReadonlyArray<string>, rand: () => number = Math.random): string[] {
  const usedSet = new Set(used);
  let fresh = pool.filter(w => !usedSet.has(w));
  if (fresh.length < 3) fresh = [...pool];
  const out: string[] = [];
  while (out.length < 3 && fresh.length) out.push(fresh.splice(Math.floor(rand() * fresh.length), 1)[0]);
  return out;
}
