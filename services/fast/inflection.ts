// Inflection Points — real songs that surface on The Endless Hour, and the mark they leave.
//
// The channel is otherwise entirely generative: everything on it is made at playback from a seed
// (see generativeChannel.ts / endlessHour.ts). An Inflection Point is the one exception — an actual
// SONG, drawn from a platform-curated pool, that crossfades in over the generative bed, plays, and
// crossfades back out. It is called an inflection because it does not just interrupt the soundscape:
// once it has passed, the procedural engine is BENT by it — transposed toward the song's key, tinted
// by its brightness and energy — and then relaxes back over the following arcs. The soundscape
// "remembers" the song for a while.
//
// TWO REGISTERS, SAME AS THE REST OF THE CHANNEL
//
//   shared  — the broadcast. Which song plays when is a DETERMINISTIC function of the clock and the
//             pool, so every viewer in the world hears the same song at the same second and at the
//             same position, and is left with the same inflection afterward. `sharedSongAt` and
//             `sharedInflectionAt` are that function. Nothing here reads a database at call time; the
//             pool + policy are passed in, resolved once from config.
//
//   sola    — the private burst. A capable device occasionally stops receiving and starts making, and
//             a burst may surface a song too — but drawn from the burst's own entropy, so it is that
//             one listener's, unrepeatable. `pickSolaSong` is the entropy-seeded chooser; the burst
//             owns the timing.
//
// WHY THE SCHEDULE IS A PURE FUNCTION OF THE DAY
//
// The same reason the generative programme is: a deterministic schedule is a schedule with no server,
// no drift, and no way for two devices to disagree about what is on. The day's song timeline is
// generated once from the UTC date + the pool, walked with seeded gaps so it never feels like a grid,
// and re-derivable by anyone. The viewer never controls it — the platform (the pool + policy an admin
// edits) shapes it, and the clock runs it.

// ── Types (co-located, not in types.ts, to stay clear of concurrent edits there) ──────────────

/** A song in the pool. `id` doubles as its Chora track id so the same entry powers the global
 *  "Inflection Points" playlist. The inflection fields are what it leaves behind. */
export interface InflectionSong {
  id: string;
  title: string;
  artist: string;
  /** The playable audio URL (a Track.url). */
  audioUrl: string;
  coverUrl?: string;
  durationSec: number;

  // ── the mark it leaves on the procedural engine afterward ──
  /** Pitch class 0..11 (0 = C). The engine transposes toward this. */
  key: number;
  mode?: 'major' | 'minor' | 'dorian' | 'phrygian' | 'aeolian' | 'lydian' | 'mixolydian';
  /** 0..1 — biases the procedural tone/veil brightness and arousal upward. */
  brightness: number;
  /** 0..1 — biases breath pace and how present the muted pulse is. */
  energy: number;

  /** Off = kept in the pool but never scheduled and never in the playlist. */
  enabled: boolean;
  /** Relative selection weight (default 1). */
  weight?: number;
}

/** How songs are scheduled on the shared stream, and how their inflection decays. */
export interface InflectionPolicy {
  /** Master switch — off means the channel is purely generative (no songs at all). */
  enabled: boolean;
  /** Shared-stream gap between songs, seconds. The actual gap is drawn seeded from [min,max], so
   *  songs are spaced like a channel's music rotation rather than on a fixed clock. */
  minGapSec: number;
  maxGapSec: number;
  /** Audio crossfade between the generative bed and the song, each side, seconds. */
  crossfadeSec: number;
  /** After a song ends, the inflection strength decays from 1 to 0 over this many seconds — a few
   *  arcs, so the soundscape carries the colour and then lets it go. */
  inflectionDecaySec: number;
  /** 0..1 ceiling on how far the inflection may bend the engine at full strength. */
  inflectionStrength: number;
  /** Probability [0..1] that a given Sola burst surfaces a song at all. */
  solaSongChance: number;
}

export const DEFAULT_INFLECTION_POLICY: InflectionPolicy = {
  enabled: true,
  minGapSec: 22 * 60,
  maxGapSec: 48 * 60,
  crossfadeSec: 8,
  inflectionDecaySec: 25 * 60,
  inflectionStrength: 0.6,
  solaSongChance: 0.35,
};

/** The full config an admin edits, stored at systemConfig/endlessHour. */
export interface EndlessHourConfig {
  pool: InflectionSong[];
  policy: InflectionPolicy;
}

export const EMPTY_ENDLESS_HOUR_CONFIG: EndlessHourConfig = { pool: [], policy: DEFAULT_INFLECTION_POLICY };

// ── Deterministic helpers (identical maths to the rest of the channel) ─────────────────────────

/** FNV-1a — the same stable hash generativeChannel.ts keys programmes with. */
function hashStr(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** A deterministic 0..1 from an integer state — mulberry-ish, one step. */
function unit(state: number): number {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

/** UTC date key — the anchor a day's song timeline is seeded from, so it is the same everywhere. */
export function dayKey(atMs: number): string {
  const d = new Date(atMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** UTC midnight (ms) for the day containing atMs. */
function utcMidnight(atMs: number): number {
  const d = new Date(atMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0);
}

const DAY_SEC = 24 * 60 * 60;

/** The enabled, weighted pool as a flat pick-table position → weighting is handled at pick time. */
function enabledPool(pool: InflectionSong[]): InflectionSong[] {
  return pool.filter((s) => s.enabled && s.audioUrl && s.durationSec > 0);
}

/** Weighted deterministic pick from the pool. `r` is a 0..1 draw. */
function pickWeighted(pool: InflectionSong[], r: number): InflectionSong {
  const total = pool.reduce((a, s) => a + Math.max(0.0001, s.weight ?? 1), 0);
  let x = r * total;
  for (const s of pool) {
    x -= Math.max(0.0001, s.weight ?? 1);
    if (x <= 0) return s;
  }
  return pool[pool.length - 1];
}

// ── The shared song timeline ───────────────────────────────────────────────────────────────────

export interface ScheduledSong {
  song: InflectionSong;
  /** Seconds into the UTC day when the song starts (crossfade begins). */
  startSec: number;
  /** Seconds into the UTC day when it ends (after which the inflection begins to decay). */
  endSec: number;
}

/**
 * The whole day's songs, generated once and deterministically.
 *
 * Walk from a seeded first gap, place a song, wait a seeded gap, place the next — until the day is
 * full. Every viewer computes the identical list because it is a pure function of (dayKey, pool,
 * policy). The first slot is offset by a seeded fraction of a gap so midnight is not a landmark.
 */
export function songTimelineForDay(atMs: number, config: EndlessHourConfig): ScheduledSong[] {
  const { policy } = config;
  const pool = enabledPool(config.pool);
  if (!policy.enabled || pool.length === 0) return [];

  const key = dayKey(atMs);
  const baseSeed = hashStr(`${key}:inflection`);
  const gapSpan = Math.max(0, policy.maxGapSec - policy.minGapSec);

  const out: ScheduledSong[] = [];
  let t = policy.minGapSec * (0.4 + 0.6 * unit(baseSeed)); // seeded lead-in, not on the hour
  let i = 0;
  let guard = 0;
  while (t < DAY_SEC && guard++ < 2000) {
    const rGap = unit(baseSeed ^ (i * 2654435761));
    const rPick = unit(baseSeed ^ (i * 40503 + 7));
    const song = pickWeighted(pool, rPick);
    const startSec = t;
    const endSec = t + song.durationSec;
    if (endSec >= DAY_SEC) break; // do not straddle midnight — the next day owns its own timeline
    out.push({ song, startSec, endSec });
    t = endSec + policy.minGapSec + gapSpan * rGap;
    i++;
  }
  return out;
}

export interface SharedSongState {
  song: InflectionSong;
  /** Seconds into the song right now — what a joining device seeks to, so all viewers are aligned. */
  offsetSec: number;
  /** 0 at the edges of the crossfade, 1 in the body — the song's own gain envelope. */
  songGain: number;
  /** The complementary bed gain (full crossfade out): 1 - songGain. */
  bedGain: number;
}

/**
 * Is a song playing on the shared stream right now, and where in it?
 *
 * Returns null when the channel is on its generative bed. The crossfade is equal-ish: the bed fades
 * out entirely (per the channel's chosen behaviour) as the song fades in, and back at the end.
 */
export function sharedSongAt(atMs: number, config: EndlessHourConfig): SharedSongState | null {
  const timeline = songTimelineForDay(atMs, config);
  if (!timeline.length) return null;
  const secOfDay = (atMs - utcMidnight(atMs)) / 1000;
  const xf = Math.max(0.5, config.policy.crossfadeSec);

  for (const s of timeline) {
    if (secOfDay < s.startSec || secOfDay >= s.endSec) continue;
    const into = secOfDay - s.startSec;
    const remain = s.endSec - secOfDay;
    // Raised-cosine fade in/out so nothing arrives or leaves suddenly — the channel's whole ethos.
    const fadeIn = into < xf ? 0.5 - 0.5 * Math.cos((Math.PI * into) / xf) : 1;
    const fadeOut = remain < xf ? 0.5 - 0.5 * Math.cos((Math.PI * remain) / xf) : 1;
    const songGain = Math.max(0, Math.min(1, Math.min(fadeIn, fadeOut)));
    return { song: s.song, offsetSec: into, songGain, bedGain: 1 - songGain };
  }
  return null;
}

// ── The inflection the procedural engine carries ────────────────────────────────────────────────

export interface Inflection {
  song: InflectionSong;
  /** 0..1, already multiplied by policy.inflectionStrength — apply directly. */
  strength: number;
  /** Semitones to transpose the procedural harmony/drone toward the song's key. */
  transpose: number;
  /** -1..1 brightness bias for tone/veil/arousal (0 = neutral). */
  brightnessBias: number;
  /** -1..1 energy bias for breath pace and pulse presence. */
  energyBias: number;
}

/** Turn a song + a raw 0..1 decay into the concrete biases the runner applies. */
function inflectionFrom(song: InflectionSong, decay: number, policy: InflectionPolicy): Inflection {
  const strength = Math.max(0, Math.min(1, decay)) * policy.inflectionStrength;
  // Transpose the drone root toward the song's key by the shortest signed distance, in [-6, +5].
  let d = ((song.key % 12) + 12) % 12;
  if (d > 6) d -= 12;
  return {
    song,
    strength,
    transpose: Math.round(d * strength),
    brightnessBias: (song.brightness * 2 - 1) * strength,
    energyBias: (song.energy * 2 - 1) * strength,
  };
}

/**
 * The inflection in force on the SHARED stream at this moment.
 *
 * The most recently ENDED song's colour, decaying to nothing over `inflectionDecaySec`. While a song
 * is actually playing there is no inflection to apply (the song itself is what you hear); the bend
 * begins the instant it ends. Returns null when there is nothing recent enough to matter.
 */
export function sharedInflectionAt(atMs: number, config: EndlessHourConfig): Inflection | null {
  const { policy } = config;
  if (!policy.enabled) return null;
  // Look at today's timeline and, for the earliest part of the day, yesterday's tail.
  const today = songTimelineForDay(atMs, config);
  const secOfDay = (atMs - utcMidnight(atMs)) / 1000;

  let best: { song: InflectionSong; endedAgo: number } | null = null;
  const consider = (endSec: number, song: InflectionSong, dayShift: number) => {
    const endedAgo = secOfDay + dayShift - endSec;
    if (endedAgo <= 0 || endedAgo > policy.inflectionDecaySec) return;
    if (!best || endedAgo < best.endedAgo) best = { song, endedAgo };
  };
  for (const s of today) consider(s.endSec, s.song, 0);
  // Yesterday's late songs can still be decaying in the small hours.
  if (secOfDay < policy.inflectionDecaySec) {
    const yest = songTimelineForDay(atMs - DAY_SEC * 1000, config);
    for (const s of yest) consider(s.endSec, s.song, DAY_SEC);
  }
  if (!best) return null;
  const b: { song: InflectionSong; endedAgo: number } = best;
  const decay = 1 - b.endedAgo / policy.inflectionDecaySec;
  return inflectionFrom(b.song, decay, policy);
}

// ── Sola (private burst) ─────────────────────────────────────────────────────────────────────────

/**
 * Choose a song for a private Sola burst, from the burst's own entropy.
 *
 * Unlike the shared timeline this is NOT reproducible — that is the point of Sola. `rand` is the
 * burst's entropy source (0..1). Returns null if the policy declines a song for this burst or the
 * pool is empty, in which case the burst is purely generative.
 */
export function pickSolaSong(config: EndlessHourConfig, rand: () => number): InflectionSong | null {
  const pool = enabledPool(config.pool);
  if (!config.policy.enabled || pool.length === 0) return null;
  if (rand() > config.policy.solaSongChance) return null;
  return pickWeighted(pool, rand());
}

/** The inflection a burst carries after its song ended `endedAgoSec` ago. Same decay as shared. */
export function solaInflection(song: InflectionSong, endedAgoSec: number, policy: InflectionPolicy): Inflection | null {
  if (endedAgoSec <= 0 || endedAgoSec > policy.inflectionDecaySec) return null;
  return inflectionFrom(song, 1 - endedAgoSec / policy.inflectionDecaySec, policy);
}
