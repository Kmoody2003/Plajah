import type { ThesaCard, ThesaStashEntry } from './types';

/**
 * Pure stash logic: add / remove / annotate / merge. No IO, so it is unit-tested and shared by the
 * local cache and the Firestore sync in stashService.
 */

export const stashIdsOf = (entries: ThesaStashEntry[]): Set<string> => new Set(entries.filter(e => !e.removed).map(e => e.cardId));
export const liveEntries = (entries: ThesaStashEntry[]): ThesaStashEntry[] =>
  entries.filter(e => !e.removed).sort((a, b) => b.stashedAt - a.stashedAt);

const upsert = (entries: ThesaStashEntry[], next: ThesaStashEntry) => [...entries.filter(e => e.cardId !== next.cardId), next];

/** Save a card. Re-stashing a previously removed card revives it (keeping nothing from the old note). */
export function stash(entries: ThesaStashEntry[], card: ThesaCard, now = Date.now()): ThesaStashEntry[] {
  const prev = entries.find(e => e.cardId === card.id);
  if (prev && !prev.removed) return entries; // already saved — idempotent
  return upsert(entries, { cardId: card.id, card, stashedAt: now, updatedAt: now, collectionIds: [] });
}

/** Un-stash leaves a tombstone so a stale device cache can't bring the card back. */
export function unstash(entries: ThesaStashEntry[], cardId: string, now = Date.now()): ThesaStashEntry[] {
  const prev = entries.find(e => e.cardId === cardId);
  if (!prev || prev.removed) return entries;
  return upsert(entries, { ...prev, removed: true, note: undefined, updatedAt: now });
}

export function annotate(entries: ThesaStashEntry[], cardId: string, note: string, now = Date.now()): ThesaStashEntry[] {
  const prev = entries.find(e => e.cardId === cardId);
  if (!prev || prev.removed) return entries;
  const trimmed = note.trim().slice(0, 2000);
  return upsert(entries, { ...prev, note: trimmed || undefined, updatedAt: now });
}

/** Merge two copies of a stash (e.g. this device's cache and Firestore): newest `updatedAt` wins per card. */
export function mergeStash(a: ThesaStashEntry[], b: ThesaStashEntry[]): ThesaStashEntry[] {
  const byId = new Map<string, ThesaStashEntry>();
  for (const e of [...a, ...b]) {
    if (!e?.cardId) continue;
    const prev = byId.get(e.cardId);
    if (!prev || e.updatedAt >= prev.updatedAt) byId.set(e.cardId, e);
  }
  return [...byId.values()];
}
