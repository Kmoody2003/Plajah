// Pure helpers for the follow graph (no Firebase imports — unit-testable).
// Firestore `in` accepts at most 10 values (30 on newer SDKs, but we stay conservative),
// so any "authors I follow" query must be chunked, run in parallel and merged.

export const IN_QUERY_CHUNK = 10;

export function chunkArray<T>(items: readonly T[], size: number = IN_QUERY_CHUNK): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

/** Merge several already-fetched lists: dedupe by id (first wins), newest first, cap overall. */
export function mergeByTimestamp<T extends { id: string; timestamp: number }>(
  lists: readonly (readonly T[])[],
  cap: number,
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return cap > 0 ? merged.slice(0, cap) : merged;
}

/** Dedupe + drop falsy ids, preserving order. */
export function uniqueIds(ids: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
