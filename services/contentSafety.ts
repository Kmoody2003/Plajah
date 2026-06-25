// contentSafety.ts — the single chokepoint for age-appropriate content. Every surface
// that lists content for a viewer (Feed, Movies, Music, search, …) runs items through
// here. Child accounts get safe-by-default treatment that the child cannot turn off:
// the adult filter is forced ON and the maturity ceiling is capped. It reads the content
// flags that already exist on items (isExplicit / isNSFW / ageRestriction) plus an
// optional explicit maturity rating, so existing content is covered without re-tagging.

import type { UserProfile, ParentalControls, MaturityRating } from '../types';

const RANK: Record<MaturityRating, number> = { G: 0, PG: 1, PG13: 2, TEEN: 3, MATURE: 4 };

/** Safe defaults applied to a CHILD account (and used as the floor — a child can never
 *  be less restricted than this, regardless of what's stored). */
export const CHILD_DEFAULTS: ParentalControls = {
  adultFilter: true,
  maxMaturity: 'PG',
  hideAdultPosts: true,
  kidsMode: true,
};

/** Defaults for a normal adult account (no restrictions). */
export const ADULT_DEFAULTS: ParentalControls = {
  adultFilter: false,
  maxMaturity: 'MATURE',
  hideAdultPosts: false,
  kidsMode: false,
};

export function isChildAccount(p?: UserProfile | null): boolean {
  return !!(p && (p.isChild || p.accountType === 'CHILD'));
}

/**
 * The EFFECTIVE controls for a viewer. For a child we start from their guardian's saved
 * controls but clamp every dimension to be at least as strict as CHILD_DEFAULTS — so a
 * stale/looser stored value (or tampering) can never expose a child to adult content.
 */
export function resolveControls(p?: UserProfile | null): ParentalControls {
  if (!p) return { ...ADULT_DEFAULTS };
  const stored = p.parentalControls;
  if (isChildAccount(p)) {
    return {
      ...CHILD_DEFAULTS,
      ...stored,
      adultFilter: true,                                   // forced
      hideAdultPosts: stored?.hideAdultPosts !== false,    // default true
      // maturity can be loosened by the guardian, but never above TEEN for a child
      maxMaturity: clampMaturity(stored?.maxMaturity ?? 'PG', 'TEEN'),
      kidsMode: stored?.kidsMode !== false,                // default true
    };
  }
  return { ...ADULT_DEFAULTS, ...stored };
}

function clampMaturity(want: MaturityRating, ceiling: MaturityRating): MaturityRating {
  return RANK[want] > RANK[ceiling] ? ceiling : want;
}

/** Infer an item's maturity from whatever flags it carries. Conservative: any adult
 *  signal lifts it to MATURE so the filter catches legacy/untagged-but-flagged items. */
export function getItemMaturity(item: any): MaturityRating {
  if (!item) return 'G';
  if (item.isAdult || item.isNSFW || item.nsfw || item.isExplicit || item.explicit) return 'MATURE';
  const r = String(item.maturity || item.maturityRating || item.contentRating || item.rating || '').toUpperCase();
  if (['MATURE', 'M', 'R', 'NC-17', 'X', '18', '18+'].some(x => r === x)) return 'MATURE';
  if (['TEEN', 'T', 'MA', 'TV-MA'].some(x => r === x)) return 'TEEN';
  if (['PG13', 'PG-13', 'TV-14', '13', '13+'].some(x => r === x)) return 'PG13';
  if (['PG', 'TV-PG', 'TV-Y7', '7+'].some(x => r === x)) return 'PG';
  if (['G', 'TV-Y', 'TV-G', 'E', 'ALL'].some(x => r === x)) return 'G';
  // ageRestriction like "18+", "16+", "13+"
  const age = parseInt(String(item.ageRestriction || '').replace(/\D/g, ''), 10);
  if (!isNaN(age)) { if (age >= 17) return 'MATURE'; if (age >= 13) return 'PG13'; if (age >= 7) return 'PG'; }
  return 'G';
}

/** Does the item carry an explicit "adult" signal (independent of the numeric ceiling)? */
export function isAdultContent(item: any): boolean {
  return !!(item && (item.isAdult || item.isNSFW || item.nsfw || item.isExplicit || item.explicit));
}

/** Is this single item allowed for this viewer? */
export function isContentAllowed(item: any, viewer?: UserProfile | null): boolean {
  const c = resolveControls(viewer);
  if (c.adultFilter && isAdultContent(item)) return false;
  return RANK[getItemMaturity(item)] <= RANK[c.maxMaturity];
}

/** Filter a list of items for a viewer (the primary API surfaces call). */
export function filterForViewer<T>(items: T[], viewer?: UserProfile | null): T[] {
  const c = resolveControls(viewer);
  if (!c.adultFilter && c.maxMaturity === 'MATURE') return items; // unrestricted adult — no work
  return items.filter(it => isContentAllowed(it, viewer));
}

/** Filter social posts (respects hideAdultPosts specifically, then maturity). */
export function filterPostsForViewer<T>(posts: T[], viewer?: UserProfile | null): T[] {
  const c = resolveControls(viewer);
  if (!c.hideAdultPosts && !c.adultFilter && c.maxMaturity === 'MATURE') return posts;
  return posts.filter(p => {
    if (c.hideAdultPosts && isAdultContent(p)) return false;
    return isContentAllowed(p, viewer);
  });
}

/** True if the viewer should see the kids-mode skin. */
export function isKidsMode(viewer?: UserProfile | null): boolean {
  return resolveControls(viewer).kidsMode === true;
}
