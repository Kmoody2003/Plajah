// Gated sanctuary files. Objects under sanctuaries/{ownerUid}/ have no client read rule and no public URL. A record
// stores `gated:<objectPath>`, and viewers get a short signed link after the server checks the same access the
// Firestore rules check. Revoking a membership therefore stops the file, not just the listing.

export const GATED_PREFIX = 'gated:';
export const isGatedRef = (url: unknown): url is string => typeof url === 'string' && url.startsWith(GATED_PREFIX);
export const gatedPathOf = (ref: string): string => ref.slice(GATED_PREFIX.length);
export const gatedRef = (path: string): string => GATED_PREFIX + path;

/** The collections a gated file can hang off, and which field names the sanctuary owner. */
export const SANCTUARY_ITEM_OWNER: Record<string, string> = { sanctuaryGallery: 'sanctuaryId', sanctuaryPosts: 'sanctuaryId', sanctuaryContent: 'creatorId' };

export const sanctuaryItemOwner = (col: string, item: Record<string, any> | null | undefined): string => {
  const field = SANCTUARY_ITEM_OWNER[col];
  return field && item ? String(item[field] || '') : '';
};

/** Same decision as the sanctuaryContent / Posts / Gallery rules. */
export function canOpenSanctuaryItem(item: Record<string, any>, uid: string, owner: string, membershipStatus: string | null | undefined, unlocked: boolean): boolean {
  if (!uid || !owner) return false;
  return owner === uid || (item.accessType || 'TIER') === 'FREE' || membershipStatus === 'ACTIVE' || unlocked;
}

/** A record is written by its owner, so it may only hand out objects inside that owner's own gated folder. */
export function itemNamesGatedPath(item: Record<string, any>, owner: string, path: string): boolean {
  if (!owner || !path || path.includes('..') || !path.startsWith(`sanctuaries/${owner}/`)) return false;
  const refs = [item.url, item.contentUrl, ...(Array.isArray(item.attachments) ? item.attachments.map((a: any) => a?.url) : [])];
  return refs.some(r => isGatedRef(r) && gatedPathOf(r) === path);
}
