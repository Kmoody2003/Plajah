// services/creativeCloud/history.ts — when autosave becomes a version, and which versions
// to thin out. Pure, so the retention policy is tested in isolation.
//
// Every cloud sync writes a new immutable revision. A version is a pointer to an older
// revision, so history costs no extra uploads. Autosave checkpoints thin out over time;
// named, restore, conflict and publish versions are pinned and never pruned.

export type VersionReason =
  | 'checkpoint' // periodic autosave snapshot
  | 'named' // the author named it
  | 'before-restore' // the state just before a restore
  | 'other-device' // edits from another device kept when this device saved over them
  | 'publish' // a published / locked edition
  | 'import';

export interface VersionStub {
  id: string;
  createdAt: number;
  reason: VersionReason;
  pinned?: boolean;
}

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Keep at most one autosave checkpoint per this interval while editing. */
export const CHECKPOINT_INTERVAL_MS = 10 * MIN;

export function isPinned(v: VersionStub): boolean {
  return !!v.pinned || v.reason !== 'checkpoint';
}

/** Should the head being replaced become a checkpoint version? */
export function shouldCheckpoint(lastVersionAt: number | undefined, now: number): boolean {
  return lastVersionAt == null || now - lastVersionAt >= CHECKPOINT_INTERVAL_MS;
}

/**
 * Checkpoints to delete: keep every checkpoint from the last 2 hours, the newest per hour
 * up to 2 days, the newest per day up to 30 days, and the newest per week beyond that.
 * The newest checkpoint overall is always kept.
 */
export function versionsToPrune(versions: VersionStub[], now: number): string[] {
  const checkpoints = versions.filter((v) => !isPinned(v)).sort((a, b) => b.createdAt - a.createdAt);
  const keepBucket = new Set<string>();
  const prune: string[] = [];
  checkpoints.forEach((v, i) => {
    if (i === 0) return; // newest always kept
    const age = now - v.createdAt;
    if (age < 2 * HOUR) return;
    const bucket =
      age < 2 * DAY
        ? `h${Math.floor(v.createdAt / HOUR)}`
        : age < 30 * DAY
        ? `d${Math.floor(v.createdAt / DAY)}`
        : `w${Math.floor(v.createdAt / (7 * DAY))}`;
    if (keepBucket.has(bucket)) prune.push(v.id);
    else keepBucket.add(bucket);
  });
  return prune;
}

export function describeReason(reason: VersionReason): string {
  switch (reason) {
    case 'named':
      return 'Named version';
    case 'before-restore':
      return 'Before restore';
    case 'other-device':
      return 'Edits from another device';
    case 'publish':
      return 'Published';
    case 'import':
      return 'Imported';
    default:
      return 'Autosave';
  }
}
