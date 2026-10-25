// Vote-to-schedule — fans pick what airs in a FAST channel time slot.
//
// A channel declares VOTE SLOTS (a wall-clock time on the station's timezone, the days it runs, how
// many choices, when voting closes). For each airing the server opens a LIVE POLL with that night's
// choices; when voting closes it tallies, locks the winner, and writes it into that day's schedule so
// playout and the guide pick it up like any other programme. Nothing here touches Firebase — the same
// functions run on the server (scheduling + locking) and in the browser (countdowns, results), so the
// two can never disagree about when a vote closes or who won.
//
// Timing model: a channel that hosts vote slots is MIDNIGHT-ANCHORED on its own timezone, so the
// day's slots start at 00:00 station time and each one has a fixed wall-clock start. The day is laid
// out so the vote block begins exactly on its slot time, and the block is RESERVED at the longest
// choice's running time — whatever wins, nothing after it moves. A shorter winner is followed by
// intermission filler up to the end of the block.

import type { FastChannelSlot } from '../../types';
import { zonedParts } from '../platformClock';

export const DAY_SEC = 86400;
export const MAX_VOTE_OPTIONS = 8;
export const MIN_VOTE_OPTIONS = 2;
export const MIN_CUTOFF_MIN = 15;
export const MAX_CUTOFF_MIN = 240;
/** Default: voting closes an hour before air, so the lock, the guide refresh and every player's
 *  prefetch all land well ahead of the slot. */
export const DEFAULT_CUTOFF_MIN = 60;

/** Something a fan can vote for — a programme with a known running time. */
export interface VoteOption {
  videoId: string;
  title: string;
  videoUrl: string;
  durationSec: number;
  thumbnail?: string;
  year?: string;
  /** Always airs without ad breaks during it (e.g. a creator's own film licensed ad-free). */
  commercialFree?: boolean;
}

/** A slot whose programme is decided by a fan vote. */
export interface VoteSlotConfig {
  id: string;
  label: string;
  /** Wall-clock start on the station's timezone, 'HH:MM' (24h). */
  localTime: string;
  /** Weekdays it runs, 0=Sun … 6=Sat. */
  days: number[];
  /** How many choices go on each night's ballot (2–8). */
  optionCount: number;
  /** Never offer what won this slot on its previous airing. */
  excludePreviousWinner: boolean;
  /** Minutes before air that voting closes (15–240). */
  cutoffMinutes: number;
  /** Hours before air that the ballot opens. */
  opensHoursBefore: number;
}

/** One airing's ballot, as stored in livePolls/{id} when kind === 'SCHEDULE'. */
export interface ScheduleVoteInfo {
  channelId: string;
  slotId: string;
  /** Station-local calendar date of the airing, 'YYYY-MM-DD'. */
  date: string;
  timezone: string;
  airAtMs: number;
  opensAtMs: number;
  closesAtMs: number;
  /** Length of the block reserved in the day's schedule for whichever choice wins. */
  reservedSec: number;
}

export interface LivePollOption {
  label: string;
  emoji?: string;
  /** SCHEDULE polls: the programme behind this choice. */
  programme?: VoteOption;
}

export type LivePollStatus = 'OPEN' | 'LOCKED';

export interface LivePoll {
  id: string;
  roomId: string;
  kind: 'COMMUNITY' | 'SCHEDULE';
  question: string;
  subtitle?: string;
  options: LivePollOption[];
  /** Vote counts keyed by option index (as strings — Firestore map keys). */
  counts: Record<string, number>;
  status: LivePollStatus;
  /** Listed in its room. Old ballots are retired so a room shows tonight's and last night's only. */
  active: boolean;
  createdAt: number;
  /** COMMUNITY polls may close too; SCHEDULE polls always do. */
  closesAtMs?: number;
  schedule?: ScheduleVoteInfo;
  winnerIdx?: number;
  /** How the winner was decided — shown to fans so a lock is never a mystery. */
  winnerReason?: 'MOST_VOTES' | 'TIE_FIRST_TO_REACH' | 'NO_VOTES_RANDOM';
  lockedAt?: number;
}

/** Slots written into a day's schedule carry their ballot id, so a lock can find its block. */
export type VoteAwareSlot = FastChannelSlot & {
  voteRoundId?: string;
  /** True until the vote locks: the block is airing a provisional choice. */
  votePending?: boolean;
  commercialFree?: boolean;
};

// ── Time on the station's clock ────────────────────────────────────────────────────────────────

/** 'YYYY-MM-DD' of `atMs` on `tz`'s calendar. */
export function zonedDateKey(atMs: number, tz: string): string {
  const p = zonedParts(atMs, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Calendar arithmetic on a 'YYYY-MM-DD' key (no timezone involved). */
export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Weekday (0=Sun) of a 'YYYY-MM-DD' key. */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The instant a wall-clock time happens on `tz`'s calendar. Iterates on the zone's offset instead of
 * assuming one, so 9 PM is 9 PM on either side of a daylight-saving change.
 */
export function zonedWallTimeToMs(dateKey: string, hhmm: string, tz: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, tz);
    const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const diff = seen - wanted;
    if (diff === 0) break;
    guess -= diff;
  }
  return guess;
}

export function hhmmToSec(hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 3600 + mm * 60;
}

/** The airing's open / close / air instants for a slot on a given station date. */
export function airingTimes(slot: Pick<VoteSlotConfig, 'localTime' | 'cutoffMinutes' | 'opensHoursBefore'>, dateKey: string, tz: string) {
  const airAtMs = zonedWallTimeToMs(dateKey, slot.localTime, tz);
  const cutoff = clampCutoff(slot.cutoffMinutes);
  return {
    airAtMs,
    closesAtMs: airAtMs - cutoff * 60_000,
    opensAtMs: airAtMs - Math.max(1, slot.opensHoursBefore) * 3_600_000,
  };
}

export function clampCutoff(min: number): number {
  return Math.min(MAX_CUTOFF_MIN, Math.max(MIN_CUTOFF_MIN, Math.round(Number(min) || DEFAULT_CUTOFF_MIN)));
}

export function clampOptionCount(n: number): number {
  return Math.min(MAX_VOTE_OPTIONS, Math.max(MIN_VOTE_OPTIONS, Math.round(Number(n) || 4)));
}

export function scheduleRoundId(channelId: string, slotId: string, dateKey: string): string {
  return `sched__${channelId}__${slotId}__${dateKey}`;
}

// ── Deterministic choice ───────────────────────────────────────────────────────────────────────

/** Small seeded PRNG (mulberry32) — the same seed always yields the same ballot and day. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = items.slice();
  const rnd = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Tonight's ballot: `count` choices from the pool, never including `excludeIds` (e.g. what won
 *  this slot last night). Falls back to allowing excluded items only if the pool is too small. */
export function pickBallot(pool: readonly VoteOption[], count: number, excludeIds: readonly string[], seed: string): VoteOption[] {
  const n = clampOptionCount(count);
  const fresh = pool.filter(p => !excludeIds.includes(p.videoId));
  const shuffled = seededShuffle(fresh.length >= n ? fresh : pool, seed);
  return shuffled.slice(0, n);
}

/** Block length for a ballot: the longest choice, rounded up to the next 5 minutes. */
export function reservedSecFor(options: readonly VoteOption[]): number {
  const longest = Math.max(0, ...options.map(o => Math.ceil(o.durationSec)));
  return Math.ceil(longest / 300) * 300;
}

// ── Results ────────────────────────────────────────────────────────────────────────────────────

export function countsToArray(counts: Record<string, number> | undefined, n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.max(0, Number(counts?.[String(i)]) || 0));
}

export function totalVotes(counts: Record<string, number> | undefined, n: number): number {
  return countsToArray(counts, n).reduce((a, b) => a + b, 0);
}

/** Whole-number percentages that always add up to 100 (largest-remainder), so a result card
 *  never shows 33 / 33 / 33. All zeros when nobody has voted. */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map(c => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, rem: r - floors[i] })).sort((a, b) => b.rem - a.rem);
  for (const { i } of order) { if (left <= 0) break; floors[i]++; left--; }
  return floors;
}

/**
 * Decide a ballot. Most votes wins; a tie goes to the choice that reached the winning count first
 * (`reachedAt[i]` = when option i got its latest vote, which for tied leaders is when it reached
 * the tie); nobody voting picks one at random from the seed, so a quiet night still airs something.
 */
export function decideWinner(
  counts: number[],
  reachedAt: Array<number | undefined>,
  seed: string,
): { winnerIdx: number; reason: NonNullable<LivePoll['winnerReason']> } {
  const top = Math.max(0, ...counts);
  if (top === 0) {
    return { winnerIdx: Math.floor(seededRandom(seed)() * counts.length), reason: 'NO_VOTES_RANDOM' };
  }
  const leaders = counts.map((c, i) => (c === top ? i : -1)).filter(i => i >= 0);
  if (leaders.length === 1) return { winnerIdx: leaders[0], reason: 'MOST_VOTES' };
  const first = leaders.slice().sort((a, b) => (reachedAt[a] ?? Infinity) - (reachedAt[b] ?? Infinity))[0];
  return { winnerIdx: first, reason: 'TIE_FIRST_TO_REACH' };
}

// ── Laying out a day ───────────────────────────────────────────────────────────────────────────

export interface DayLayoutOptions {
  /** Station date being built (also seeds the programme order). */
  dateKey: string;
  channelId: string;
  /** Everything the channel can air. */
  pool: readonly VoteOption[];
  /** The vote block, if this day has one. */
  vote?: { roundId: string; startSec: number; reservedSec: number; airing: VoteOption; pending: boolean };
  /** Seconds of ad break placed between programmes (0 = commercial-free channel). */
  adBreakSec: number;
  /** Shortest programme allowed to fill a gap (keeps shorts out of prime time if desired). */
  minFillSec?: number;
}

function programmeSlot(p: VoteOption, id: string): VoteAwareSlot {
  return {
    id, type: 'PUBLIC_DOMAIN', order: 0,
    videoId: p.videoId, videoUrl: p.videoUrl, videoTitle: p.title, videoThumbnail: p.thumbnail,
    videoDurationSeconds: Math.ceil(p.durationSec), isPublicDomain: !p.commercialFree,
    ...(p.commercialFree ? { commercialFree: true } : {}),
  };
}

function adSlot(id: string, sec: number): VoteAwareSlot {
  return { id, type: 'AD_BREAK', order: 0, adDurationSeconds: sec };
}

function intermissionSlot(id: string, sec: number): VoteAwareSlot {
  return { id, type: 'FM_BLOCK', order: 0, videoTitle: 'Intermission · Plajah FM', videoDurationSeconds: sec };
}

/**
 * Fill `lenSec` with programmes (each followed by an ad break), best-fit so the leftover is small,
 * then pad the remainder with intermission so the span is EXACTLY `lenSec` — the next fixed-time
 * block depends on it. Programmes rotate through `order` so a day doesn't repeat until it must.
 */
function fillSpan(lenSec: number, order: VoteOption[], cursor: { i: number; used?: Map<string, number> }, adBreakSec: number, idPrefix: string, minFillSec: number): VoteAwareSlot[] {
  const out: VoteAwareSlot[] = [];
  let left = lenSec;
  let n = 0;
  const used = (cursor.used ??= new Map());
  const cost = (p: VoteOption) => Math.ceil(p.durationSec) + adBreakSec;
  // Among programmes that fit: the one shown least today, then the longest (smallest leftover).
  const bestFit = (cands: VoteOption[]) => cands.sort((a, b) => (used.get(a.videoId) || 0) - (used.get(b.videoId) || 0) || b.durationSec - a.durationSec)[0];
  while (left > 0 && order.length) {
    // Next in rotation if it fits; otherwise the best fit.
    let pick: VoteOption | undefined = order[cursor.i % order.length];
    if (cost(pick) > left || pick.durationSec < minFillSec) {
      pick = bestFit(order.filter(p => cost(p) <= left && p.durationSec >= minFillSec))
        ?? bestFit(order.filter(p => cost(p) <= left));
    } else {
      cursor.i++;
    }
    if (!pick) break;
    used.set(pick.videoId, (used.get(pick.videoId) || 0) + 1);
    out.push(programmeSlot(pick, `${idPrefix}_p${n}`));
    if (adBreakSec > 0) out.push(adSlot(`${idPrefix}_a${n}`, adBreakSec));
    left -= cost(pick);
    n++;
  }
  if (left > 0) out.push(intermissionSlot(`${idPrefix}_fill`, left));
  return out;
}

/**
 * One station day (00:00 → 24:00, exactly 86,400 s) for a channel with an optional vote block.
 * Deterministic for a given date, so rebuilding a day reproduces it.
 */
export function layoutDay(opts: DayLayoutOptions): VoteAwareSlot[] {
  const { dateKey, channelId, pool, vote, adBreakSec } = opts;
  const minFill = opts.minFillSec ?? 0;
  const order = seededShuffle(pool, `${channelId}:${dateKey}`);
  const cursor = { i: 0 };
  const slots: VoteAwareSlot[] = [];
  if (vote) {
    const beforeLen = vote.startSec;
    const afterLen = DAY_SEC - vote.startSec - vote.reservedSec;
    slots.push(...fillSpan(beforeLen, order, cursor, adBreakSec, `${dateKey}_am`, minFill));
    slots.push(...voteBlockSlots(vote.roundId, vote.airing, vote.reservedSec, vote.pending, pool, adBreakSec));
    if (afterLen > 0) slots.push(...fillSpan(afterLen, order, cursor, adBreakSec, `${dateKey}_pm`, minFill));
  } else {
    slots.push(...fillSpan(DAY_SEC, order, cursor, adBreakSec, `${dateKey}_all`, minFill));
  }
  return slots.map((s, i) => ({ ...s, order: i }));
}

/**
 * The vote block: the airing programme, then the rest of the reserved length — short programmes
 * from `fillPool` where they fit (a short winner shouldn't leave 45 minutes of radio), intermission
 * for whatever is left. Every slot carries the ballot id so a lock can replace the whole block.
 */
export function voteBlockSlots(
  roundId: string, airing: VoteOption, reservedSec: number, pending: boolean,
  fillPool: readonly VoteOption[] = [], adBreakSec = 0,
): VoteAwareSlot[] {
  const prog: VoteAwareSlot = {
    ...programmeSlot(airing, `vote_${roundId}`),
    voteRoundId: roundId,
    votePending: pending,
    bugLabel: pending ? undefined : 'FAN PICK',
  };
  // Until the lock the block holds a provisional choice (so playout never has nothing), but the
  // guide says what it really is: undecided.
  if (pending) prog.videoTitle = 'Fan Vote · Tonight’s Pick';
  const left = reservedSec - Math.ceil(airing.durationSec);
  const out: VoteAwareSlot[] = [prog];
  if (left > 0) {
    const others = fillPool.filter(p => p.videoId !== airing.videoId).slice().sort((a, b) => a.durationSec - b.durationSec);
    const rest = others.length
      ? fillSpan(left, others, { i: 0 }, adBreakSec, `vote_${roundId}_x`, 0)
      : [intermissionSlot(`vote_${roundId}_fill`, left)];
    out.push(...rest.map(s => ({ ...s, voteRoundId: roundId })));
  }
  return out;
}

/** Swap a locked winner into a laid-out day without moving anything else. */
export function applyWinnerToDay(
  day: VoteAwareSlot[], roundId: string, winner: VoteOption, reservedSec: number,
  fillPool: readonly VoteOption[] = [], adBreakSec = 0,
): VoteAwareSlot[] {
  const first = day.findIndex(s => s.voteRoundId === roundId);
  if (first < 0) return day;
  let last = first;
  while (last + 1 < day.length && day[last + 1].voteRoundId === roundId) last++;
  const block = voteBlockSlots(roundId, winner, reservedSec, false, fillPool, adBreakSec);
  const next = [...day.slice(0, first), ...block, ...day.slice(last + 1)];
  return next.map((s, i) => ({ ...s, order: i }));
}

/** Total seconds of a laid-out day (must be DAY_SEC for a midnight-anchored channel). */
export function daySeconds(day: readonly VoteAwareSlot[]): number {
  return day.reduce((a, s) => a + (Number(s.videoDurationSeconds ?? s.adDurationSeconds ?? s.bumperDurationSeconds) || 0), 0);
}

/** Firestore rejects `undefined`; strip it before a write. */
export function dropUndefined<T>(slots: T[]): T[] {
  return slots.map(s => Object.fromEntries(Object.entries(s as any).filter(([, v]) => v !== undefined)) as T);
}
