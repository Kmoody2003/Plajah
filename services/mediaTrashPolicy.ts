// Which Storage objects a trashed album, video or photo may take with it. Pure, so tests hold it.
//
// A record is written by its owner, so a URL inside it proves nothing: an attacker could put someone else's file in
// their own album and then delete the album. An object goes only if it is provably the owner's, and only if none of
// their other work still uses it.

export const MEDIA_TRASH_DAYS = 30;
export const MEDIA_TRASH_MS = MEDIA_TRASH_DAYS * 86400000;

export type MediaKind = 'album' | 'video' | 'photo';
export const MEDIA_COLLECTION: Record<MediaKind, string> = { album: 'albums', video: 'videos', photo: 'photos' };

export const mediaTrashId = (kind: MediaKind, id: string) => `${kind}_${id}`;

/** Every object in this bucket named anywhere in a stored value. Content HQ's private space is never included. */
export function storagePathsIn(value: unknown, bucket: string): string[] {
  const out = new Set<string>();
  const add = (raw: string) => {
    let path: string;
    try { path = decodeURIComponent(raw); } catch { return; }
    if (!path || path.includes('..') || path.startsWith('protected-hq/')) return;
    out.add(path);
  };
  const escaped = bucket.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`firebasestorage\\.googleapis\\.com/v0/b/${escaped}/o/([^?"'\\s\\\\]+)`, 'g'),
    new RegExp(`storage\\.googleapis\\.com/${escaped}/([^?"'\\s\\\\]+)`, 'g'),
    new RegExp(`gs://${escaped}/([^?"'\\s\\\\]+)`, 'g'),
  ];
  const text = JSON.stringify(value ?? null);
  for (const re of patterns) for (const m of text.matchAll(re)) add(m[1]);
  return Array.from(out);
}

/** The stamp on the object decides. Without one, only a path with the owner's own folder in it counts. */
export function objectBelongsTo(ownerUid: string, path: string, metadataOwner: unknown): boolean {
  if (!ownerUid) return false;
  if (typeof metadataOwner === 'string' && metadataOwner) return metadataOwner === ownerUid;
  return path.split('/').includes(ownerUid);
}

/** Where a trashed object waits. Storage rules give this prefix no client read, and moving it kills the old URL and token. */
export const trashObjectPath = (trashId: string, path: string) => `media-trash/${trashId}/${path}`;

/** Is this object still named by something the owner kept? */
export function stillUsed(path: string, keptRecords: unknown[], bucket: string): boolean {
  return keptRecords.some(r => storagePathsIn(r, bucket).includes(path));
}
