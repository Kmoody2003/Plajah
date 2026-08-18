/** Pure ranking utilities shared by the side-pillar and future platform search surfaces. */
export function normalizePublicSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

export function publicSearchFieldScore(field: string | undefined, query: string): number {
  const value = normalizePublicSearchQuery(field || '');
  const normalizedQuery = normalizePublicSearchQuery(query);
  if (!value || !normalizedQuery) return 0;
  if (value === normalizedQuery) return 3;
  if (value.startsWith(normalizedQuery)) return 2;
  if (value.includes(normalizedQuery)) return 1;
  const words = normalizedQuery.split(' ');
  return words.length > 1 && words.every(word => value.includes(word)) ? 0.75 : 0;
}

export function maxPublicSearchScore(fields: Array<string | undefined>, query: string): number {
  return Math.max(0, ...fields.map(field => publicSearchFieldScore(field, query)));
}

/** Prevents one large catalog (usually tracks) from hiding every other result type. */
export function diversifyPublicSearchResults<T extends { type: string; _score: number }>(rows: T[], typeOrder: Record<string, number>, limit = 20, perType = 4): T[] {
  const counts = new Map<string, number>();
  return [...rows]
    .sort((a, b) => b._score - a._score || (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99))
    .filter(row => {
      const count = counts.get(row.type) || 0;
      if (count >= perType) return false;
      counts.set(row.type, count + 1);
      return true;
    })
    .slice(0, limit);
}
