// visibility — the ONE visibility model for everything a creator uploads or shares.
//
//   PUBLIC    listed everywhere: feeds, search, profiles, recommendations, TV, federation.
//   UNLISTED  "anyone with the link": opens by id from any share link, never listed anywhere,
//             never federated, never indexed (the /share card carries noindex).
//   PRIVATE   the owner (and admins) only.
//
// Legacy docs only carry isPrivate / isPublic / isDraft / unlisted, so `visibility` is written
// alongside them and every reader goes through visibilityOf(). How UNLISTED maps onto the
// legacy flags differs by collection, on purpose:
//
//   videos           isPrivate: true. Every browse query already asks isPrivate == false and the
//                    rules' `list` refuses anything else, so an unlisted video can't be listed
//                    even by a hand-written query; the rules' `get` lets it open by id.
//   albums (Chora,   isPrivate: false, isPublic: false. isPrivate on an album means "locker"
//   Cinema, mixes,   (private stream collection, owner-only playback), which would break link
//   books)           playback, so browse helpers drop unlisted albums explicitly (isListed).
//   video_playlists  isPublic: false, unlisted: true. Rules split get/list the same way as videos.

export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
export type VisibilityKind = 'video' | 'album' | 'playlist';

type Flags = {
  visibility?: unknown; isPrivate?: unknown; isPublic?: unknown; isDraft?: unknown; unlisted?: unknown;
};

const isVis = (v: unknown): v is Visibility => v === 'PUBLIC' || v === 'UNLISTED' || v === 'PRIVATE';

/** The effective visibility of any doc, new field first, legacy flags after. A draft is private. */
export function visibilityOf(doc: Flags | null | undefined): Visibility {
  if (!doc) return 'PRIVATE';
  if (doc.isDraft === true) return 'PRIVATE';
  if (isVis(doc.visibility)) return doc.visibility;
  if (doc.unlisted === true && doc.isPrivate !== true) return 'UNLISTED';
  if (doc.isPrivate === true || doc.isPublic === false) return 'PRIVATE';
  return 'PUBLIC';
}

/** Explicitly unlisted. Album browse uses this rather than isListed(): legacy uploads often carry
 *  isPublic: false without being private, and those must stay on the shelves. */
export const isUnlisted = (doc: Flags | null | undefined): boolean =>
  !!doc && (doc.visibility === 'UNLISTED' || (doc.unlisted === true && doc.visibility !== 'PUBLIC' && doc.visibility !== 'PRIVATE'));

/** Should this show up in a feed, search, shelf, profile, rail or recommendation? */
export const isListed = (doc: Flags | null | undefined): boolean => visibilityOf(doc) === 'PUBLIC';

/** May a viewer who has the link open it? */
export function canOpenByLink(doc: (Flags & { ownerId?: unknown }) | null | undefined, viewerUid?: string | null): boolean {
  if (!doc) return false;
  if (viewerUid && doc.ownerId === viewerUid) return true;
  return visibilityOf(doc) !== 'PRIVATE';
}

/** The legacy flags to write next to `visibility` for a given collection. */
export function visibilityFields(v: Visibility, kind: VisibilityKind): {
  visibility: Visibility; isPrivate?: boolean; isPublic?: boolean; unlisted: boolean;
} {
  const unlisted = v === 'UNLISTED';
  switch (kind) {
    case 'video':    return { visibility: v, isPrivate: v !== 'PUBLIC', unlisted };
    case 'album':    return { visibility: v, isPrivate: v === 'PRIVATE', isPublic: v === 'PUBLIC', unlisted };
    case 'playlist': return { visibility: v, isPrivate: v === 'PRIVATE', isPublic: v === 'PUBLIC', unlisted };
  }
}

export const VISIBILITY_COPY: Record<Visibility, { label: string; hint: string }> = {
  PUBLIC:   { label: 'Public',   hint: 'Anyone can find it on Plajah: feeds, search, your profile' },
  UNLISTED: { label: 'Unlisted', hint: 'Only people with the link can watch. Not in feeds, search or your profile' },
  PRIVATE:  { label: 'Private',  hint: 'Only you can see it' },
};
