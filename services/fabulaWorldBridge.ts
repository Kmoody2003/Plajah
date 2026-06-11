// ─── FABULA ↔ Worlds bridge ──────────────────────────────────────────────────
// Connects a FABULA production to a Plajah IPWorld and populates the world from
// the production's knowledge layer. The default direction is FABULA → World:
// once linked, the production's cast and world knowledge flow into the world as
// PRIVATE entries (isPublished:false) — visible to the author, hidden from the
// public — until the author explicitly publishes them.
//
// Privacy is enforced by the existing read paths: fetchWorldCharacters/
// fetchWorldLore default to onlyPublished=true, so the general public only ever
// sees published entries. The owner's world view passes onlyPublished=false.
//
// Natural mapping points (inferred from both data models):
//   FABULA cast            → Plajah Character (name, bio←visual_lock+arc, role)
//   FABULA worldCats.places→ LoreEntry type LOCATION
//   FABULA .sets           → LoreEntry type LOCATION
//   FABULA .environments   → LoreEntry type ENVIRONMENT
//   FABULA .props          → LoreEntry type ITEM
//   FABULA .lore           → LoreEntry type BACKSTORY
//   FABULA .logic          → LoreEntry type FACTION (world rules/systems)
// Bidirectional character support: characters already in the world can be
// pulled back into the production (see worldCharactersForProduction).

import {
  createCharacter, updateCharacter, fetchWorldCharacters,
  createLore, updateLore, fetchWorldLore,
} from './backendService';
import type { Character, LoreEntry } from '../types';

// FABULA's worldCat category id → Plajah LoreEntry.type
const CAT_TO_LORE_TYPE: Record<string, LoreEntry['type']> = {
  places: 'LOCATION',
  sets: 'LOCATION',
  environments: 'ENVIRONMENT',
  props: 'ITEM',
  lore: 'BACKSTORY',
  logic: 'FACTION',
};

// ── Shapes coming from FABULA (loose — it's a .jsx artifact) ──────────────────
export interface FabulaCastMember {
  id?: string;
  name?: string;
  visual_lock?: string; ref?: string;
  voice_profile?: string; voice?: string;
  arc_in_scene?: string; role?: string;
  imageUrl?: string;
}
export interface FabulaWorldItem {
  id?: string;
  name?: string;
  content?: string; notes?: string; textContent?: string;
  tags?: string[];
  imageUrl?: string;
}
export interface FabulaProductionSnapshot {
  id: string;
  title?: string;
  cast?: FabulaCastMember[];
  worldCats?: Record<string, FabulaWorldItem[]>;
}

export interface SyncReport {
  charactersCreated: number;
  charactersUpdated: number;
  loreCreated: number;
  loreUpdated: number;
  total: number;
}

const refOf = (prodId: string, kind: string, item: { id?: string; name?: string }) =>
  `${kind}:${item.id || (item.name || '').toLowerCase().replace(/\s+/g, '-')}`;

const characterBio = (c: FabulaCastMember): string =>
  [c.visual_lock || c.ref, c.arc_in_scene && `Arc: ${c.arc_in_scene}`, (c.voice_profile || c.voice) && `Voice: ${c.voice_profile || c.voice}`]
    .filter(Boolean).join('\n\n');

/**
 * Sync a FABULA production into a world as PRIVATE entries. Idempotent: entries
 * are matched back via fabulaRefId so re-running updates in place. Never flips
 * an already-published entry back to private.
 */
export async function syncProductionToWorld(
  worldId: string,
  prod: FabulaProductionSnapshot,
): Promise<SyncReport> {
  const report: SyncReport = { charactersCreated: 0, charactersUpdated: 0, loreCreated: 0, loreUpdated: 0, total: 0 };

  // Pull existing entries (all, incl. private) so we can upsert.
  const [existingChars, existingLore] = await Promise.all([
    fetchWorldCharacters(worldId, false),
    fetchWorldLore(worldId, false),
  ]);
  const charByRef = new Map(existingChars.filter(c => c.fabulaRefId).map(c => [c.fabulaRefId!, c]));
  const loreByRef = new Map(existingLore.filter(l => l.fabulaRefId).map(l => [l.fabulaRefId!, l]));

  // ── Cast → Characters ──
  for (const c of prod.cast ?? []) {
    if (!c.name?.trim()) continue;
    const ref = refOf(prod.id, 'cast', c);
    const existing = charByRef.get(ref);
    const fields: Partial<Character> = {
      worldId, name: c.name.trim(), bio: characterBio(c),
      role: c.role || 'Character', imageUrl: c.imageUrl || existing?.imageUrl || '',
      fabulaProductionId: prod.id, fabulaRefId: ref,
    };
    if (existing) {
      await updateCharacter(existing.id, fields);
      report.charactersUpdated++;
    } else {
      await createCharacter({ ...fields, tags: ['fabula'], isPublished: false });
      report.charactersCreated++;
    }
  }

  // ── World knowledge → Lore ──
  for (const [catId, items] of Object.entries(prod.worldCats ?? {})) {
    const loreType = CAT_TO_LORE_TYPE[catId] ?? 'BACKSTORY';
    for (const item of items ?? []) {
      if (!item.name?.trim()) continue;
      const ref = refOf(prod.id, catId, item);
      const existing = loreByRef.get(ref);
      const fields: Partial<LoreEntry> = {
        worldId, title: item.name.trim(),
        content: item.content || item.notes || item.textContent || '',
        type: loreType, tags: item.tags || ['fabula'],
        fabulaProductionId: prod.id, fabulaRefId: ref,
      };
      if (existing) {
        await updateLore(existing.id, fields);
        report.loreUpdated++;
      } else {
        await createLore({ ...fields, conflictsDetected: [], isPublished: false });
        report.loreCreated++;
      }
    }
  }

  report.total = report.charactersCreated + report.charactersUpdated + report.loreCreated + report.loreUpdated;
  return report;
}

// ── Publishing (private → public) ─────────────────────────────────────────────

/** Publish every FABULA-synced entry for a production (private → public). */
export async function publishProductionEntries(worldId: string, productionId: string): Promise<number> {
  const [chars, lore] = await Promise.all([
    fetchWorldCharacters(worldId, false),
    fetchWorldLore(worldId, false),
  ]);
  let published = 0;
  for (const c of chars.filter(c => c.fabulaProductionId === productionId && c.isPublished === false)) {
    await updateCharacter(c.id, { worldId, isPublished: true });
    published++;
  }
  for (const l of lore.filter(l => l.fabulaProductionId === productionId && l.isPublished === false)) {
    await updateLore(l.id, { worldId, isPublished: true });
    published++;
  }
  return published;
}

export async function publishCharacter(worldId: string, id: string): Promise<void> {
  await updateCharacter(id, { worldId, isPublished: true });
}
export async function publishLore(worldId: string, id: string): Promise<void> {
  await updateLore(id, { worldId, isPublished: true });
}

// ── Bidirectional: world → production ─────────────────────────────────────────

/** Characters already in a world, mapped to FABULA cast shape, so a production
 *  linked to the world can pull them in (the reverse direction). */
export async function worldCharactersForProduction(worldId: string): Promise<FabulaCastMember[]> {
  const chars = await fetchWorldCharacters(worldId, false);
  return chars.map(c => ({
    id: c.fabulaRefId || c.id,
    name: c.name,
    visual_lock: c.bio,
    role: c.role,
    imageUrl: c.imageUrl,
  }));
}

/** Count of unpublished (private/preview) entries for a production. */
export async function previewCounts(worldId: string, productionId: string): Promise<{ characters: number; lore: number }> {
  const [chars, lore] = await Promise.all([
    fetchWorldCharacters(worldId, false),
    fetchWorldLore(worldId, false),
  ]);
  return {
    characters: chars.filter(c => c.fabulaProductionId === productionId && c.isPublished === false).length,
    lore: lore.filter(l => l.fabulaProductionId === productionId && l.isPublished === false).length,
  };
}
