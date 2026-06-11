// ─── World Hub ────────────────────────────────────────────────────────────────
// Worlds is the shared data hub. Lorea (book + script writing), FABULA, and the
// Worlds editor all read/write the same world entities (Characters, LoreEntry),
// each tagged with a sourceApp. This module is the source-agnostic backbone:
//
//   • upsertEntities()  — any tool syncs characters/lore into a world as PRIVATE
//                         (isPublished:false). Idempotent per (sourceApp, ref).
//   • detectDuplicates()— groups live entries by normalized name → clusters the
//                         UI can offer to merge/choose between.
//   • mergeEntries()    — pick a winner; losers are NEVER deleted — they are
//                         flagged discarded ("merged_into:<id>") and moved to the
//                         Discarded folder.
//   • discard/restore   — non-destructive remove/undo.
//   • publishSource()   — flip a tool's private entries public.
//
// Privacy: the existing read paths (fetchWorldCharacters/fetchWorldLore) default
// to onlyPublished=true, so the public only sees published, non-discarded
// entries; the author passes onlyPublished=false and also sees private ones.

import {
  createCharacter, updateCharacter, fetchWorldCharacters,
  createLore, updateLore, fetchWorldLore,
} from './backendService';
import type { Character, LoreEntry, WorldSourceApp } from '../types';

export type WorldEntityKind = 'character' | 'lore';

export interface IncomingCharacter {
  refId: string;            // stable id within the source project
  name: string;
  bio?: string;
  role?: string;
  imageUrl?: string;
  tags?: string[];
}
export interface IncomingLore {
  refId: string;
  title: string;
  content?: string;
  type: LoreEntry['type'];
  tags?: string[];
  imageUrl?: string;
}

export interface SyncSource {
  app: WorldSourceApp;
  projectId: string;
}

export interface UpsertReport {
  charactersCreated: number; charactersUpdated: number;
  loreCreated: number; loreUpdated: number;
  total: number;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const live = <T extends { discarded?: boolean }>(arr: T[]) => arr.filter(e => !e.discarded);

/**
 * Sync incoming characters/lore from any tool into a world as PRIVATE entries.
 * Idempotent: matches on (sourceApp, sourceRefId) so re-syncing updates in place.
 */
export async function upsertEntities(
  worldId: string,
  source: SyncSource,
  incoming: { characters?: IncomingCharacter[]; lore?: IncomingLore[] },
): Promise<UpsertReport> {
  const report: UpsertReport = { charactersCreated: 0, charactersUpdated: 0, loreCreated: 0, loreUpdated: 0, total: 0 };

  const [chars, lore] = await Promise.all([
    fetchWorldCharacters(worldId, false),
    fetchWorldLore(worldId, false),
  ]);
  const keyOf = (app: string, ref: string) => `${app}::${ref}`;
  const charByKey = new Map(chars.filter(c => c.sourceRefId).map(c => [keyOf(c.sourceApp || '', c.sourceRefId!), c]));
  const loreByKey = new Map(lore.filter(l => l.sourceRefId).map(l => [keyOf(l.sourceApp || '', l.sourceRefId!), l]));

  for (const inc of incoming.characters ?? []) {
    if (!inc.name?.trim()) continue;
    const existing = charByKey.get(keyOf(source.app, inc.refId));
    const fields: Partial<Character> = {
      worldId, name: inc.name.trim(), bio: inc.bio || existing?.bio || '',
      role: inc.role || existing?.role || 'Character', imageUrl: inc.imageUrl || existing?.imageUrl || '',
      sourceApp: source.app, sourceProjectId: source.projectId, sourceRefId: inc.refId,
    };
    if (existing) { await updateCharacter(existing.id, fields); report.charactersUpdated++; }
    else { await createCharacter({ ...fields, tags: inc.tags || ['imported'], isPublished: false }); report.charactersCreated++; }
  }

  for (const inc of incoming.lore ?? []) {
    if (!inc.title?.trim()) continue;
    const existing = loreByKey.get(keyOf(source.app, inc.refId));
    const fields: Partial<LoreEntry> = {
      worldId, title: inc.title.trim(), content: inc.content || existing?.content || '',
      type: inc.type, tags: inc.tags || ['imported'],
      sourceApp: source.app, sourceProjectId: source.projectId, sourceRefId: inc.refId,
    };
    if (existing) { await updateLore(existing.id, fields); report.loreUpdated++; }
    else { await createLore({ ...fields, conflictsDetected: [], isPublished: false }); report.loreCreated++; }
  }

  report.total = report.charactersCreated + report.charactersUpdated + report.loreCreated + report.loreUpdated;
  return report;
}

// ── Duplicate detection ───────────────────────────────────────────────────────

export interface DuplicateCluster {
  kind: WorldEntityKind;
  name: string;
  entries: Array<{ id: string; name: string; sourceApp?: WorldSourceApp; isPublished?: boolean; summary: string }>;
}

/** Group live (non-discarded) entries by normalized name; return clusters with
 *  more than one entry — candidate duplicates for the merge/choose UI. */
export async function detectDuplicates(worldId: string): Promise<DuplicateCluster[]> {
  const [chars, lore] = await Promise.all([
    fetchWorldCharacters(worldId, false),
    fetchWorldLore(worldId, false),
  ]);
  const clusters: DuplicateCluster[] = [];

  const groupChars = new Map<string, Character[]>();
  for (const c of live(chars)) {
    const k = norm(c.name);
    (groupChars.get(k) ?? groupChars.set(k, []).get(k)!).push(c);
  }
  for (const [, group] of groupChars) {
    if (group.length > 1) clusters.push({
      kind: 'character', name: group[0].name,
      entries: group.map(c => ({ id: c.id, name: c.name, sourceApp: c.sourceApp, isPublished: c.isPublished, summary: (c.bio || '').slice(0, 120) })),
    });
  }

  const groupLore = new Map<string, LoreEntry[]>();
  for (const l of live(lore)) {
    const k = norm(l.title);
    (groupLore.get(k) ?? groupLore.set(k, []).get(k)!).push(l);
  }
  for (const [, group] of groupLore) {
    if (group.length > 1) clusters.push({
      kind: 'lore', name: group[0].title,
      entries: group.map(l => ({ id: l.id, name: l.title, sourceApp: l.sourceApp, isPublished: l.isPublished, summary: (l.content || '').slice(0, 120) })),
    });
  }
  return clusters;
}

// ── Non-destructive merge / discard ──────────────────────────────────────────

/**
 * Merge a duplicate cluster: keep `winnerId`, move every `loserId` to the
 * Discarded folder (discarded:true, reason "merged_into:<winner>"). The loser
 * docs are never deleted — they remain restorable.
 */
export async function mergeEntries(
  worldId: string, kind: WorldEntityKind, winnerId: string, loserIds: string[],
): Promise<void> {
  const patch = kind === 'character' ? updateCharacter : updateLore;
  for (const id of loserIds) {
    if (id === winnerId) continue;
    await patch(id, { worldId, discarded: true, discardedAt: Date.now(), discardedReason: `merged_into:${winnerId}` } as any);
  }
}

export async function discardEntry(worldId: string, kind: WorldEntityKind, id: string, reason = 'discarded'): Promise<void> {
  const patch = kind === 'character' ? updateCharacter : updateLore;
  await patch(id, { worldId, discarded: true, discardedAt: Date.now(), discardedReason: reason } as any);
}

export async function restoreEntry(worldId: string, kind: WorldEntityKind, id: string): Promise<void> {
  const patch = kind === 'character' ? updateCharacter : updateLore;
  await patch(id, { worldId, discarded: false, discardedReason: '' } as any);
}

/** Everything in the Discarded folder for a world. */
export async function listDiscarded(worldId: string): Promise<{ characters: Character[]; lore: LoreEntry[] }> {
  const [chars, lore] = await Promise.all([
    fetchWorldCharacters(worldId, false),
    fetchWorldLore(worldId, false),
  ]);
  return { characters: chars.filter(c => c.discarded), lore: lore.filter(l => l.discarded) };
}

// ── Publishing (private → public) ─────────────────────────────────────────────

/** Publish a tool's private, non-discarded entries for a project. */
export async function publishSource(worldId: string, app: WorldSourceApp, projectId: string): Promise<number> {
  const [chars, lore] = await Promise.all([
    fetchWorldCharacters(worldId, false),
    fetchWorldLore(worldId, false),
  ]);
  let n = 0;
  for (const c of chars.filter(c => c.sourceApp === app && c.sourceProjectId === projectId && !c.discarded && c.isPublished === false)) {
    await updateCharacter(c.id, { worldId, isPublished: true }); n++;
  }
  for (const l of lore.filter(l => l.sourceApp === app && l.sourceProjectId === projectId && !l.discarded && l.isPublished === false)) {
    await updateLore(l.id, { worldId, isPublished: true }); n++;
  }
  return n;
}

/** Live (non-discarded) world characters in a generic shape for a tool to pull
 *  in — the reverse direction (e.g. FABULA reads Lorea-created characters). */
export async function worldCharactersForImport(worldId: string): Promise<Array<{ id: string; name: string; bio: string; role: string; imageUrl: string; sourceApp?: WorldSourceApp }>> {
  const chars = await fetchWorldCharacters(worldId, false);
  return live(chars).map(c => ({ id: c.id, name: c.name, bio: c.bio, role: c.role, imageUrl: c.imageUrl, sourceApp: c.sourceApp }));
}
