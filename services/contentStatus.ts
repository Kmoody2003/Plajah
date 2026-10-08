/**
 * Content status: the honest "is this ready?" label shown on learner-facing surfaces.
 * Single source of truth is the registry that owns each item (Course.status in courseCatalog,
 * SystemEntry.status in machineAtlas/registry). Items with no status are LIVE.
 *  - LIVE: authored; shown without a badge.
 *  - UNDER_REVIEW: authored, but accuracy has not been expert-verified yet.
 *  - COMING_SOON: not authored yet; must not navigate into an empty page.
 */
export type ContentStatus = 'LIVE' | 'UNDER_REVIEW' | 'COMING_SOON';

export const CONTENT_STATUS_META: Record<Exclude<ContentStatus, 'LIVE'>, { label: string; detail: string }> = {
  UNDER_REVIEW: { label: 'Under review', detail: 'Under review: this content is being checked for accuracy.' },
  COMING_SOON: { label: 'Coming soon', detail: 'Coming soon: this is still being written.' },
};

export const contentStatusOf = (x?: { status?: ContentStatus } | null): ContentStatus => x?.status ?? 'LIVE';
export const isComingSoon = (x?: { status?: ContentStatus } | null): boolean => contentStatusOf(x) === 'COMING_SOON';
export const isUnderReview = (x?: { status?: ContentStatus } | null): boolean => contentStatusOf(x) === 'UNDER_REVIEW';
