/**
 * feedPreferencesCore — PURE feed-preference model (no Firebase). Re-exported by
 * services/feedPreferencesService.ts, which adds persistence (`users/{uid}/prefs/feed`) and the
 * `useFeedPreferences()` hook. Kept separate so ranking + tests can import it without booting Firebase.
 *
 * Model
 *  - HARD controls: mutedTopics, mutedContentTypes, mutedCardKinds  → `applyFeedPreferences` removes items.
 *  - SOFT controls: "show less / more like this" weights per author / topic / type in [-1, 1],
 *    each stamped with the time it was set and decayed with a 14-day half-life, so a one-off tap
 *    fades instead of permanently shaping the feed. `preferenceMultiplier` feeds the ranker.
 */

export type FeedContentType =
  | 'TEXT' | 'PHOTO' | 'VIDEO' | 'AUDIO' | 'ALBUM' | 'LINK' | 'GIF' | 'MODEL3D' | 'POLL' | 'LIVE' | 'DATAVIZ';

export const ALL_CONTENT_TYPES: FeedContentType[] = [
  'TEXT', 'PHOTO', 'VIDEO', 'AUDIO', 'ALBUM', 'LINK', 'GIF', 'MODEL3D', 'POLL', 'LIVE', 'DATAVIZ',
];

export const CONTENT_TYPE_LABELS: Record<FeedContentType, string> = {
  TEXT: 'Text posts', PHOTO: 'Photos', VIDEO: 'Videos', AUDIO: 'Audio & music', ALBUM: 'Albums & releases',
  LINK: 'Links', GIF: 'GIFs & stickers', MODEL3D: '3D models', POLL: 'Polls', LIVE: 'Live rooms', DATAVIZ: 'Data visualisations',
};

export type FeedDefaultTab = 'FOR_YOU' | 'FOLLOWING';

/** A decaying signed weight. `w` > 0 = show more, < 0 = show less. `at` = ms when last bumped. */
export interface WeightEntry { w: number; at: number }

export interface FeedPreferences {
  version: 1;
  mutedTopics: string[];
  mutedContentTypes: FeedContentType[];
  /** Card kinds (services/feedCardsCore FeedCardKind) the viewer never wants inline. */
  mutedCardKinds: string[];
  weights: {
    authors: Record<string, WeightEntry>;
    topics: Record<string, WeightEntry>;
    types: Record<string, WeightEntry>;
  };
  defaultTab: FeedDefaultTab;
  updatedAt: number;
}

export const PREF_HALF_LIFE_MS = 14 * 24 * 3_600_000;
const MAX_MAP_ENTRIES = 200;     // keep the doc small — oldest/weakest entries are pruned
const MIN_KEEP = 0.05;           // |decayed weight| under this is dropped

export const defaultFeedPreferences = (): FeedPreferences => ({
  version: 1,
  mutedTopics: [],
  mutedContentTypes: [],
  mutedCardKinds: [],
  weights: { authors: {}, topics: {}, types: {} },
  defaultTab: 'FOR_YOU',
  updatedAt: 0,
});

// ─── Normalisation / extraction ───────────────────────────────────────────────

/** '#Lo-Fi Beats' → 'lo-fibeats'. Safe as a Firestore map key (no '.', '/', '__x__'). */
export function normalizeTopic(raw: string): string {
  return String(raw ?? '').toLowerCase().replace(/^#+/, '').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 40).replace(/^_+|_+$/g, '');
}

export interface PrefPostLike {
  id?: string;
  authorId?: string;
  text?: string;
  content?: string;
  tags?: string[];
  theme?: string;
  type?: string;
  media?: { type?: string }[];
  poll?: unknown;
  dataViz?: unknown;
  liveStreamId?: string;
  isLiveNow?: boolean;
  roomId?: string;
}

/** Topics of a post: explicit tags + #hashtags in the text (normalised, deduped, max 8). */
export function postTopics(p: PrefPostLike): string[] {
  const out = new Set<string>();
  for (const t of p.tags ?? []) { const n = normalizeTopic(t); if (n) out.add(n); }
  const text = `${p.text ?? ''} ${p.content ?? ''}`;
  for (const m of text.matchAll(/#([\p{L}\p{N}_-]{2,40})/gu)) { const n = normalizeTopic(m[1]); if (n) out.add(n); }
  return [...out].slice(0, 8);
}

/** The single content type a post is filed under for type-level controls. */
export function primaryContentType(p: PrefPostLike): FeedContentType {
  if (p.isLiveNow || p.liveStreamId || p.roomId) return 'LIVE';
  if (p.poll) return 'POLL';
  if (p.dataViz) return 'DATAVIZ';
  const m = p.media?.[0]?.type;
  switch (m) {
    case 'PHOTO': return 'PHOTO';
    case 'VIDEO': return 'VIDEO';
    case 'AUDIO': return 'AUDIO';
    case 'ALBUM': return 'ALBUM';
    case 'LINK': return 'LINK';
    case 'GIF': case 'STICKER': return 'GIF';
    case 'MODEL3D': return 'MODEL3D';
  }
  // FeedItem-style `type` for legacy `feed` docs.
  switch (p.type) {
    case 'PICTURE': return 'PHOTO';
    case 'VIDEO': return 'VIDEO';
    case 'SONG': return 'AUDIO';
  }
  return 'TEXT';
}

// ─── Weights ──────────────────────────────────────────────────────────────────

export function decayedWeight(e: WeightEntry | undefined, now: number): number {
  if (!e || !Number.isFinite(e.w) || !Number.isFinite(e.at)) return 0;
  const age = Math.max(0, now - e.at);
  return e.w * Math.pow(0.5, age / PREF_HALF_LIFE_MS);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function bump(map: Record<string, WeightEntry>, key: string, delta: number, now: number): Record<string, WeightEntry> {
  if (!key) return map;
  const next = { ...map };
  const w = clamp(decayedWeight(map[key], now) + delta, -1, 1);
  if (Math.abs(w) < MIN_KEEP) delete next[key]; else next[key] = { w: Math.round(w * 1000) / 1000, at: now };
  // prune: drop faded entries first, then the weakest if still too big
  const keys = Object.keys(next);
  if (keys.length > MAX_MAP_ENTRIES) {
    keys
      .map(k => [k, Math.abs(decayedWeight(next[k], now))] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, keys.length - MAX_MAP_ENTRIES)
      .forEach(([k]) => delete next[k]);
  }
  return next;
}

const SHOW_LESS = { author: -0.5, topic: -0.4, type: -0.25 };

function shiftWeights(prefs: FeedPreferences, post: PrefPostLike, sign: 1 | -1, now: number): FeedPreferences {
  // sign -1 = show less (use the negative base deltas as-is), +1 = show more (mirror them, a bit gentler)
  const k = sign === -1 ? 1 : -0.8;
  let { authors, topics, types } = prefs.weights;
  if (post.authorId) authors = bump(authors, post.authorId, SHOW_LESS.author * k, now);
  for (const t of postTopics(post).slice(0, 3)) topics = bump(topics, t, SHOW_LESS.topic * k, now);
  types = bump(types, primaryContentType(post), SHOW_LESS.type * k, now);
  return { ...prefs, weights: { authors, topics, types }, updatedAt: now };
}

/** "Show less like this" — nudges author, up to 3 topics and the content type down. */
export const showLessLikeThis = (prefs: FeedPreferences, post: PrefPostLike, now = Date.now()) => shiftWeights(prefs, post, -1, now);
/** "Show more like this" — the mirror image (slightly gentler). */
export const showMoreLikeThis = (prefs: FeedPreferences, post: PrefPostLike, now = Date.now()) => shiftWeights(prefs, post, 1, now);

export function muteTopic(prefs: FeedPreferences, topic: string, now = Date.now()): FeedPreferences {
  const t = normalizeTopic(topic);
  if (!t || prefs.mutedTopics.includes(t)) return prefs;
  return { ...prefs, mutedTopics: [...prefs.mutedTopics, t].slice(-100), updatedAt: now };
}
export function unmuteTopic(prefs: FeedPreferences, topic: string, now = Date.now()): FeedPreferences {
  const t = normalizeTopic(topic);
  return { ...prefs, mutedTopics: prefs.mutedTopics.filter(x => x !== t), updatedAt: now };
}
export function toggleContentType(prefs: FeedPreferences, type: FeedContentType, now = Date.now()): FeedPreferences {
  const has = prefs.mutedContentTypes.includes(type);
  return { ...prefs, mutedContentTypes: has ? prefs.mutedContentTypes.filter(t => t !== type) : [...prefs.mutedContentTypes, type], updatedAt: now };
}
export function toggleCardKind(prefs: FeedPreferences, kind: string, now = Date.now()): FeedPreferences {
  const has = prefs.mutedCardKinds.includes(kind);
  return { ...prefs, mutedCardKinds: has ? prefs.mutedCardKinds.filter(k => k !== kind) : [...prefs.mutedCardKinds, kind], updatedAt: now };
}
export const resetFeedPreferences = (now = Date.now()): FeedPreferences => ({ ...defaultFeedPreferences(), updatedAt: now });

// ─── Applying ─────────────────────────────────────────────────────────────────

/** An author the viewer has pushed down this far is hidden outright (still reversible via Reset). */
export const AUTHOR_HARD_HIDE = -0.9;

export interface ApplyOptions {
  /** The viewer's own posts are never filtered. */
  viewerId?: string;
  now?: number;
}

/** True when the HARD controls hide this item. */
export function isHiddenByPreferences(p: PrefPostLike, prefs: FeedPreferences, opts: ApplyOptions = {}): boolean {
  if (opts.viewerId && p.authorId === opts.viewerId) return false;
  if (prefs.mutedContentTypes.length && prefs.mutedContentTypes.includes(primaryContentType(p))) return true;
  if (prefs.mutedTopics.length) {
    const topics = postTopics(p);
    if (topics.some(t => prefs.mutedTopics.includes(t))) return true;
  }
  const now = opts.now ?? Date.now();
  if (p.authorId && decayedWeight(prefs.weights.authors[p.authorId], now) <= AUTHOR_HARD_HIDE) return true;
  return false;
}

/** Pure filter: drops items hidden by muted topics / content types / hard "show less" authors. Keeps order. */
export function applyFeedPreferences<T extends PrefPostLike>(items: T[], prefs: FeedPreferences | null | undefined, opts: ApplyOptions = {}): T[] {
  if (!prefs) return items;
  const nothing = !prefs.mutedContentTypes.length && !prefs.mutedTopics.length && !Object.keys(prefs.weights.authors).length;
  if (nothing) return items;
  return items.filter(p => !isHiddenByPreferences(p, prefs, opts));
}

/**
 * Soft ranking multiplier in [0.15, 2]: 1 = neutral. Author counts most, then topics (mean of the
 * three strongest), then type. Used by services/forYouRanker.
 */
export function preferenceMultiplier(p: PrefPostLike, prefs: FeedPreferences | null | undefined, now = Date.now()): number {
  if (!prefs) return 1;
  const a = decayedWeight(p.authorId ? prefs.weights.authors[p.authorId] : undefined, now);
  const ts = postTopics(p).map(t => decayedWeight(prefs.weights.topics[t], now)).filter(w => w !== 0);
  const t = ts.length ? ts.reduce((s, w) => s + w, 0) / ts.length : 0;
  const ty = decayedWeight(prefs.weights.types[primaryContentType(p)], now);
  return clamp(1 + a * 0.9 + t * 0.6 + ty * 0.4, 0.15, 2);
}

// ─── Persistence shape ────────────────────────────────────────────────────────

const sanitizeMap = (raw: any): Record<string, WeightEntry> => {
  const out: Record<string, WeightEntry> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw)) {
    const e = v as any;
    if (k && e && Number.isFinite(e.w) && Number.isFinite(e.at)) out[k] = { w: clamp(e.w, -1, 1), at: e.at };
  }
  return out;
};

/** Defensive parse of whatever Firestore returns. Unknown/invalid fields fall back to defaults. */
export function sanitizeFeedPreferences(raw: any): FeedPreferences {
  const d = defaultFeedPreferences();
  if (!raw || typeof raw !== 'object') return d;
  const arr = (x: any) => (Array.isArray(x) ? x.filter(s => typeof s === 'string') : []);
  return {
    version: 1,
    mutedTopics: arr(raw.mutedTopics).map(normalizeTopic).filter(Boolean).slice(0, 100),
    mutedContentTypes: arr(raw.mutedContentTypes).filter(t => (ALL_CONTENT_TYPES as string[]).includes(t)) as FeedContentType[],
    mutedCardKinds: arr(raw.mutedCardKinds).slice(0, 20),
    weights: {
      authors: sanitizeMap(raw.weights?.authors),
      topics: sanitizeMap(raw.weights?.topics),
      types: sanitizeMap(raw.weights?.types),
    },
    defaultTab: raw.defaultTab === 'FOLLOWING' ? 'FOLLOWING' : 'FOR_YOU',
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
  };
}
