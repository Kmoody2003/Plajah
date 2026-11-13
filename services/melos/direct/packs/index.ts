// Chora Direct — extra style packs.
//
// New and deeper packs are added here (one file per family beside this one, e.g. `electronic.ts`),
// then listed in EXTRA_PACKS. They are appended to the core packs in styleKnowledge.ts, so a pack
// here with a more specific `match` wins over a core pack for the tags it names.
//
// Rules for a pack are in docs/chora/CHORA_DIRECT.md ("Writing a style pack"). Types only may be
// imported from '../styleKnowledge' (a value import would be circular).

import type { StylePack } from '../styleKnowledge';

export const EXTRA_PACKS: StylePack[] = [];
