// videoTasteScoring — the pure math behind the "% Match" badge.
//
// Deliberately split from services/videoTasteService, which owns the Firestore reads and writes.
// Everything here is a pure function of (video, vector): no auth, no db, no network. That is what
// makes the policy — the family weights, the confidence gate, the decision to return null —
// testable on its own (tests/videoTaste.test.ts) instead of only observable through a signed-in
// browser session.
//
// videoTasteService re-exports these, so callers keep importing from one place.

import type { Video } from '../types';

export type VideoSignal = 'UP' | 'DOWN' | 'LOVE';

/** Affinity weights per facet value. Positive = drawn to it, negative = avoids it. */
export interface VideoTasteVector {
  genres: Record<string, number>;
  categories: Record<string, number>;
  creators: Record<string, number>;
  worlds: Record<string, number>;
  tags: Record<string, number>;
  /** videoIds the user thumbed down — recommenders should exclude these outright. */
  disliked: string[];
  /** How many distinct signals (explicit + implicit) built this vector. */
  count: number;
  /** How many of those were deliberate reactions rather than inferred from watching. */
  explicitCount: number;
}

export interface MatchResult {
  /** 0-100. Higher means closer to what this user reaches for. */
  score: number;
  /** Which facet values actually drove it, strongest first — for an honest tooltip. */
  basis: { family: string; value: string; affinity: number }[];
}

// Matches services/tasteService so the two models weigh a thumb the same way.
export const WEIGHT: Record<VideoSignal, number> = { LOVE: 3, UP: 1, DOWN: -2 };

// Implicit weights are deliberately smaller than any explicit one. Finishing something is good
// evidence; it is not as good as saying so.
export const WEIGHT_COMPLETED = 0.8;
export const WEIGHT_ABANDONED = -0.4;
/** Below this share watched, starting and leaving reads as a negative signal. */
export const ABANDON_RATIO = 0.25;
/** Above this share, count it as finished. Mirrors COMPLETE_RATIO in watchHistoryService. */
export const COMPLETE_RATIO = 0.92;

/**
 * How much each facet family counts toward a match, relative to the others.
 *
 * Creator and world lead because they are the strongest predictors in practice: following a
 * filmmaker or a universe says more than sharing a broad genre label. Tags are noisy and
 * numerous, so they are averaged within the family before this weight applies — otherwise a
 * title with twelve tags would drown out its own genre.
 */
export const FAMILY_WEIGHT = {
  creators: 1.3,
  worlds: 1.2,
  genres: 1.0,
  categories: 0.7,
  tags: 0.6,
} as const;

/**
 * Below this many signals the vector is too thin to score against, and matchScore() returns null.
 *
 * Five is a judgment call, not a derived constant: it is roughly where a vector stops being one
 * evening's viewing. Raising it delays the badge for new users; lowering it risks a confident
 * number built on two data points.
 */
export const MIN_SIGNALS = 5;

export const emptyVector = (): VideoTasteVector => ({
  genres: {}, categories: {}, creators: {}, worlds: {}, tags: {},
  disliked: [], count: 0, explicitCount: 0,
});

/** Pull the facets a video contributes, skipping anything absent. */
export function facetsOf(video: Partial<Video> | null | undefined) {
  if (!video) {
    return { genre: undefined, category: undefined, creatorId: undefined, worldId: undefined, tags: [] as string[] };
  }
  return {
    genre: video.genre || undefined,
    category: video.category || undefined,
    creatorId: video.ownerId || undefined,
    worldId: video.worldId || undefined,
    tags: Array.isArray(video.tags) ? video.tags.filter(Boolean).slice(0, 12) : [],
  };
}

export function addWeight(rec: Record<string, number>, key: string | undefined, w: number): void {
  if (!key) return;
  rec[key] = (rec[key] || 0) + w;
}

/** Largest absolute weight in a family, used to normalize affinities into [-1, 1]. */
function maxAbs(rec: Record<string, number>): number {
  let m = 0;
  for (const v of Object.values(rec)) m = Math.max(m, Math.abs(v));
  return m;
}

/**
 * Score how well a video matches this user's taste, or null when we cannot honestly say.
 *
 * Returns null in two cases, and both matter:
 *   1. The vector is thinner than MIN_SIGNALS — we do not know the user yet.
 *   2. The video shares no facet the user has any history with — we know the user, but nothing
 *      about this title. A neutral 50% here would be a guess wearing a number's clothes.
 *
 * Only families where the user has a non-zero affinity contribute. An unrecognized genre is not
 * evidence of anything, so it neither raises nor lowers the score; it simply is not counted.
 * Affinities are normalized per family against that family's strongest weight, so a user with
 * hundreds of reactions and one with a dozen both produce scores on the same scale.
 */
export function matchScore(
  video: Partial<Video> | null | undefined,
  vec: VideoTasteVector,
): MatchResult | null {
  if (!video || !vec || vec.count < MIN_SIGNALS) return null;

  const f = facetsOf(video);
  const norms = {
    creators: maxAbs(vec.creators),
    worlds: maxAbs(vec.worlds),
    genres: maxAbs(vec.genres),
    categories: maxAbs(vec.categories),
    tags: maxAbs(vec.tags),
  };

  let weighted = 0;
  let totalWeight = 0;
  const basis: MatchResult['basis'] = [];

  const consider = (family: keyof typeof FAMILY_WEIGHT, value: string | undefined) => {
    if (!value) return;
    const raw = (vec[family] as Record<string, number>)[value];
    if (!raw) return;                                   // no history with this value — not evidence
    const affinity = Math.max(-1, Math.min(1, raw / (norms[family] || 1)));
    weighted += FAMILY_WEIGHT[family] * affinity;
    totalWeight += FAMILY_WEIGHT[family];
    basis.push({ family, value, affinity });
  };

  consider('creators', f.creatorId);
  consider('worlds', f.worldId);
  consider('genres', f.genre);
  consider('categories', f.category);

  // Tags are averaged among themselves first, so the family counts once however many match.
  const tagHits = f.tags
    .map(t => ({ t, raw: vec.tags[t] }))
    .filter(x => !!x.raw) as { t: string; raw: number }[];
  if (tagHits.length) {
    const avg = tagHits.reduce((a, x) => a + Math.max(-1, Math.min(1, x.raw / (norms.tags || 1))), 0) / tagHits.length;
    weighted += FAMILY_WEIGHT.tags * avg;
    totalWeight += FAMILY_WEIGHT.tags;
    basis.push({ family: 'tags', value: tagHits.map(x => x.t).join(', '), affinity: avg });
  }

  if (totalWeight === 0) return null;                   // nothing in common — say nothing

  // weighted/totalWeight is in [-1, 1]; map it straight onto 0-100. No floor is applied: a title
  // in a genre this user consistently thumbs down SHOULD read low.
  const score = Math.round(((weighted / totalWeight) + 1) * 50);
  basis.sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity));
  return { score: Math.max(0, Math.min(100, score)), basis };
}

/** Top-weighted facet values (positive only), strongest first — seeds for recommendation rails. */
export function topVideoAffinities(vec: VideoTasteVector): {
  genres: string[]; creators: string[]; worlds: string[]; tags: string[];
} {
  const pos = (rec: Record<string, number>) =>
    Object.entries(rec).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { genres: pos(vec.genres), creators: pos(vec.creators), worlds: pos(vec.worlds), tags: pos(vec.tags) };
}
