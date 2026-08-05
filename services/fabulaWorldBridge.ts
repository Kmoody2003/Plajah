// ─── FABULA → World mapper ───────────────────────────────────────────────────
// Thin adapter: maps a FABULA production's knowledge layer into the generic
// World Hub payload, then delegates to worldHub (which all tools share). Privacy
// (private-until-published), idempotent sync, dedup, and the Discarded folder
// all live in worldHub — this file only knows FABULA's shapes and the mapping.
//
// Natural mapping (inferred from both data models):
//   cast              → Characters
//   worldCats.places  → LOCATION    worldCats.sets        → LOCATION
//   worldCats.environments → ENVIRONMENT
//   worldCats.props   → ITEM        worldCats.lore        → BACKSTORY
//   worldCats.logic   → FACTION

import {
  upsertEntities, publishSource, worldCharactersForImport,
  type IncomingCharacter, type IncomingLore, type UpsertReport,
} from './worldHub';
import type { LoreEntry } from '../types';

const CAT_TO_LORE_TYPE: Record<string, LoreEntry['type']> = {
  places: 'LOCATION', sets: 'LOCATION', environments: 'ENVIRONMENT',
  props: 'ITEM', lore: 'BACKSTORY', logic: 'FACTION',
};

export interface FabulaCastMember {
  id?: string; name?: string;
  visual_lock?: string; ref?: string;
  voice_profile?: string; voice?: string;
  arc_in_scene?: string; role?: string; imageUrl?: string;
}
export interface FabulaWorldItem {
  id?: string; name?: string;
  content?: string; notes?: string; textContent?: string;
  tags?: string[]; imageUrl?: string;
}
export interface FabulaProductionSnapshot {
  id: string; title?: string;
  cast?: FabulaCastMember[];
  worldCats?: Record<string, FabulaWorldItem[]>;
}

const refOf = (kind: string, item: { id?: string; name?: string }) =>
  `${kind}:${item.id || (item.name || '').toLowerCase().replace(/\s+/g, '-')}`;

const castBio = (c: FabulaCastMember): string =>
  [c.visual_lock || c.ref, c.arc_in_scene && `Arc: ${c.arc_in_scene}`, (c.voice_profile || c.voice) && `Voice: ${c.voice_profile || c.voice}`]
    .filter(Boolean).join('\n\n');

/** Sync a FABULA production into a world as PRIVATE entries (via the hub). */
export async function syncProductionToWorld(worldId: string, prod: FabulaProductionSnapshot): Promise<UpsertReport> {
  const characters: IncomingCharacter[] = (prod.cast ?? [])
    .filter(c => c.name?.trim())
    .map(c => ({ refId: refOf('cast', c), name: c.name!.trim(), bio: castBio(c), role: c.role || 'Character', imageUrl: c.imageUrl, tags: ['fabula'] }));

  const lore: IncomingLore[] = [];
  for (const [catId, items] of Object.entries(prod.worldCats ?? {})) {
    for (const item of items ?? []) {
      if (!item.name?.trim()) continue;
      lore.push({
        refId: refOf(catId, item), title: item.name!.trim(),
        content: item.content || item.notes || item.textContent || '',
        type: CAT_TO_LORE_TYPE[catId] ?? 'BACKSTORY', tags: item.tags || ['fabula'], imageUrl: item.imageUrl,
      });
    }
  }

  return upsertEntities(worldId, { app: 'FABULA', projectId: prod.id }, { characters, lore });
}

/** Publish all of a production's private entries to the public world. */
export const publishProductionEntries = (worldId: string, productionId: string) =>
  publishSource(worldId, 'FABULA', productionId);

/** Reverse direction: a world's characters in FABULA cast shape, so a linked
 *  production can pull in characters created elsewhere (Lorea, Worlds). */
export async function worldCharactersForProduction(worldId: string): Promise<FabulaCastMember[]> {
  const chars = await worldCharactersForImport(worldId);
  return chars.map(c => ({ id: c.id, name: c.name, visual_lock: c.bio, role: c.role, imageUrl: c.imageUrl }));
}
