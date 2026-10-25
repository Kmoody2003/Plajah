// Pure party-engagement math — polls/surveys, the auto "how was that song?" poll, vote tallies and
// the per-song energy series. No Firebase, no DOM: the client (PartyChatPanel / partyService) and
// the server rollup (services/musicIntel/audience.ts) share it.
//
//   npx tsx --test tests/partyEngagement.test.ts
//
// Firestore shapes (written by services/partyService.ts):
//   parties/{id}/polls/{pollId}           PartyPoll   — host / co-host only
//   parties/{id}/polls/{pollId}/votes/{uid}  PartyVote   — one per listener, own uid
//   parties/{id}/chat/{id}                chat message, optionally kind emote|gif + atSec/trackId
//   parties/{id}/reactions/{id}           emoji / emote reaction + atSec/trackId

export type PollKind = 'choice' | 'rating' | 'text';

export interface PollOption { id: string; label: string }

export interface PartyPoll {
  id: string;
  kind: PollKind;
  question: string;
  /** choice polls: 2–6 options. rating polls use 1..RATING_MAX. text polls have none. */
  options?: PollOption[];
  /** generated near the end of a song (rate / mood), as opposed to host-authored. */
  auto?: boolean;
  trackId?: string;
  trackTitle?: string;
  trackIndex?: number;
  /** the song that follows `trackId` — the poll stays up into its first `keepSec`. */
  nextTrackId?: string;
  /** auto polls: playhead (sec) at which the poll first opens on `trackId`. */
  fromSec?: number;
  /** auto polls: how far into the next song the poll stays up. */
  keepSec?: number;
  createdBy: string;
  createdAt: number;
  /** host closed it (or it was replaced). */
  closed?: boolean;
  /** hard stop in epoch ms (auto polls on the last track, timed host polls). Undefined = host closes it. */
  expiresAt?: number;
}

export interface PartyVote {
  uid: string;
  name?: string;
  /** option id (choice) | 1..RATING_MAX (rating) | short answer (text) */
  value: string | number;
  atSec?: number;
  trackId?: string;
  at?: any;
}

export const RATING_MAX = 5;
export const POLL_QUESTION_MAX = 140;
export const POLL_OPTION_MAX = 48;
export const POLL_TEXT_ANSWER_MAX = 140;
/** the auto poll opens this many seconds before a song ends… */
export const AUTO_POLL_LEAD_SEC = 25;
/** …and stays up this long into the next one, so slow responders still land. */
export const AUTO_POLL_KEEP_SEC = 45;
/** a song must have played this long before we ask about it. */
export const AUTO_POLL_MIN_LISTEN_SEC = 20;

/** Energy buckets are this wide. */
export const ENERGY_BUCKET_SEC = 5;

// ── Poll visibility ───────────────────────────────────────────────────────────────────────────────

export interface PollMoment { contentId?: string; positionSec: number }

/**
 * Is this poll on screen right now? Host-authored polls stay until closed/expired. An auto poll shows
 * on the song it asks about (once the playhead reaches `fromSec`) and for the first `keepSec` of the
 * next song — every listener evaluates this against the host's playback, so they all agree.
 */
export function pollVisible(p: PartyPoll, now: PollMoment, nowMs: number = Date.now()): boolean {
  if (p.closed) return false;
  if (p.expiresAt && nowMs > p.expiresAt) return false;
  if (!p.auto) return true;
  const cur = now.contentId;
  if (cur && cur === p.trackId) return now.positionSec >= (p.fromSec ?? 0);
  if (cur && p.nextTrackId && cur === p.nextTrackId) return now.positionSec <= (p.keepSec ?? AUTO_POLL_KEEP_SEC);
  return false;
}

// ── Auto poll ─────────────────────────────────────────────────────────────────────────────────────

/** Time to ask? True once the playhead is inside the closing stretch of a song that's been heard a while. */
export function autoPollDue(positionSec: number, durationSec: number, leadSec: number = AUTO_POLL_LEAD_SEC): boolean {
  if (!(durationSec > 0) || !Number.isFinite(positionSec)) return false;
  if (positionSec < Math.min(AUTO_POLL_MIN_LISTEN_SEC, durationSec * 0.5)) return false;
  return positionSec >= Math.max(durationSec * 0.7, durationSec - leadSec) && positionSec < durationSec + 1;
}

/** Deterministic id → the host re-writing it (reconnect, second tab) never makes a duplicate. */
export const autoPollId = (trackId: string) => `auto_${String(trackId).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}`;

const MOOD_OPTIONS: PollOption[] = [
  { id: 'hyped', label: '🔥 Hyped' },
  { id: 'calm', label: '🌙 Calm' },
  { id: 'nostalgic', label: '🥹 Nostalgic' },
  { id: 'moved', label: '💜 Moved' },
];
const VERDICT_OPTIONS: PollOption[] = [
  { id: 'love', label: '😍 Love it' },
  { id: 'good', label: '👍 Good' },
  { id: 'meh', label: '😐 Okay' },
  { id: 'skip', label: '👎 Not for me' },
];

/** Rotates rate → mood → verdict by track position so a long album doesn't ask the same thing twelve times. */
export function buildAutoPoll(
  track: { id: string; title?: string },
  trackIndex: number,
  next: { id: string } | null,
  createdBy: string,
  positionSec: number,
  nowMs: number = Date.now(),
): PartyPoll {
  const title = (track.title || 'that song').slice(0, 60);
  const flavor = ((trackIndex % 3) + 3) % 3;
  const base = {
    id: autoPollId(track.id),
    auto: true as const,
    trackId: track.id,
    trackTitle: track.title || undefined,
    trackIndex,
    nextTrackId: next?.id,
    fromSec: Math.max(0, Math.floor(positionSec) - 2),
    keepSec: AUTO_POLL_KEEP_SEC,
    createdBy,
    createdAt: nowMs,
    // the last song has no "next" to carry it — give it a wall-clock window instead
    ...(next ? {} : { expiresAt: nowMs + (AUTO_POLL_LEAD_SEC + AUTO_POLL_KEEP_SEC) * 1000 }),
  };
  if (flavor === 0) return { ...base, kind: 'rating', question: `Rate “${title}”` };
  if (flavor === 1) return { ...base, kind: 'choice', question: `How did “${title}” make you feel?`, options: MOOD_OPTIONS };
  return { ...base, kind: 'choice', question: `What did you think of “${title}”?`, options: VERDICT_OPTIONS };
}

// ── Authoring + validation ────────────────────────────────────────────────────────────────────────

export interface PollDraft { kind: PollKind; question: string; options?: string[]; expiresInSec?: number }

/** Trim/clamp a host's draft into a poll body, or null if it isn't askable (blank question, <2 options). */
export function normalizePollDraft(d: PollDraft): { kind: PollKind; question: string; options?: PollOption[]; expiresInSec?: number } | null {
  const question = String(d.question || '').trim().slice(0, POLL_QUESTION_MAX);
  if (!question) return null;
  if (d.kind === 'choice') {
    const labels = (d.options || []).map(o => String(o || '').trim().slice(0, POLL_OPTION_MAX)).filter(Boolean);
    const uniq = Array.from(new Set(labels)).slice(0, 6);
    if (uniq.length < 2) return null;
    return { kind: 'choice', question, options: uniq.map((label, i) => ({ id: `o${i + 1}`, label })), expiresInSec: clampExpiry(d.expiresInSec) };
  }
  return { kind: d.kind === 'text' ? 'text' : 'rating', question, expiresInSec: clampExpiry(d.expiresInSec) };
}
const clampExpiry = (s?: number) => (typeof s === 'number' && s > 0 ? Math.min(Math.round(s), 3600) : undefined);

/** Is this value a legal vote for the poll? (the rules re-check shape; this guards the UI) */
export function validVote(p: PartyPoll, value: unknown): value is string | number {
  if (p.kind === 'rating') return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= RATING_MAX;
  if (p.kind === 'choice') return typeof value === 'string' && !!p.options?.some(o => o.id === value);
  return typeof value === 'string' && value.trim().length > 0 && value.length <= POLL_TEXT_ANSWER_MAX;
}

// ── Tally ─────────────────────────────────────────────────────────────────────────────────────────

export interface PollTally {
  total: number;
  /** choice: option id → votes; rating: '1'..'5' → votes */
  counts: Record<string, number>;
  /** rating polls only */
  avg?: number;
  /** text polls only — newest first */
  answers?: string[];
}

export function tallyPoll(p: Pick<PartyPoll, 'kind' | 'options'>, votes: Pick<PartyVote, 'value'>[]): PollTally {
  const counts: Record<string, number> = {};
  if (p.kind === 'choice') for (const o of p.options || []) counts[o.id] = 0;
  if (p.kind === 'rating') for (let i = 1; i <= RATING_MAX; i++) counts[String(i)] = 0;
  let total = 0, sum = 0;
  const answers: string[] = [];
  for (const v of votes) {
    if (p.kind === 'text') {
      const t = String(v.value ?? '').trim();
      if (t) { answers.push(t.slice(0, POLL_TEXT_ANSWER_MAX)); total++; }
      continue;
    }
    const key = String(v.value);
    if (!(key in counts)) continue;
    counts[key]++; total++;
    if (p.kind === 'rating') sum += Number(v.value);
  }
  const out: PollTally = { total, counts };
  if (p.kind === 'rating') out.avg = total ? Math.round((sum / total) * 100) / 100 : 0;
  if (p.kind === 'text') out.answers = answers.reverse();
  return out;
}

// ── Energy ────────────────────────────────────────────────────────────────────────────────────────

export interface EnergyEvent { trackId?: string; atSec?: number; w?: number }

/** Weight of one engagement, so a deliberate act (a vote, a GIF) outweighs a tap. */
export const ENERGY_WEIGHT = { reaction: 1, emote: 1, text: 1.2, gif: 1.6, vote: 1.5 } as const;

/**
 * Engagement per `bucketSec` of one song, lightly smoothed (a 3-tap blend keeps a single burst from
 * reading as a spike-and-silence). `durationSec` fixes the length so every party for a song lines up.
 */
export function bucketEnergy(events: EnergyEvent[], trackId: string, durationSec: number, bucketSec: number = ENERGY_BUCKET_SEC): number[] {
  const n = Math.max(1, Math.ceil(Math.max(0, durationSec) / bucketSec));
  const raw = new Array<number>(n).fill(0);
  for (const e of events) {
    if (e.trackId !== trackId || typeof e.atSec !== 'number' || !Number.isFinite(e.atSec) || e.atSec < 0) continue;
    raw[Math.min(n - 1, Math.floor(e.atSec / bucketSec))] += e.w ?? 1;
  }
  return raw.map((v, i) => {
    const l = raw[i - 1] ?? v, r = raw[i + 1] ?? v;
    return Math.round((l * 0.25 + v * 0.5 + r * 0.25) * 100) / 100;
  });
}

/** Highest bucket → its start second and score. Null when the song drew nothing. */
export function energyPeak(series: number[], bucketSec: number = ENERGY_BUCKET_SEC): { atSec: number; score: number } | null {
  let best = -1, at = 0;
  series.forEach((v, i) => { if (v > best) { best = v; at = i; } });
  return best > 0 ? { atSec: at * bucketSec, score: best } : null;
}

/** 0..1 scale for drawing, relative to the loudest bucket across the songs being compared. */
export function normalizeEnergy(series: number[], ceiling: number): number[] {
  const c = ceiling > 0 ? ceiling : 1;
  return series.map(v => Math.min(1, v / c));
}

export function formatMoment(sec: number | undefined): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '';
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
