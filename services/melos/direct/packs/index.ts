// Chora Direct — extra style packs.
//
// New and deeper packs are added here (one file per family beside this one, e.g. `electronic.ts`),
// then listed in EXTRA_PACKS. They are appended to the core packs in styleKnowledge.ts, so a pack
// here with a more specific `match` wins over a core pack for the tags it names.
//
// Rules for a pack are in docs/chora/CHORA_DIRECT.md ("Writing a style pack"). Types only may be
// imported from '../styleKnowledge' (a value import would be circular).

import type { StylePack } from '../styleKnowledge';
import { CINEMATIC_EXTRA_PACKS } from './cinematic';
import { CLASSICAL_EXTRA_PACKS } from './classical';
import { JAZZ_EXTRA_PACKS } from './jazz';
import { ELECTRONIC_EXTRA_PACKS } from './electronic';
import { HIPHOP_EXTRA_PACKS } from './hiphop';

export const EXTRA_PACKS: StylePack[] = [
  ...CINEMATIC_EXTRA_PACKS,
  ...CLASSICAL_EXTRA_PACKS,
  ...JAZZ_EXTRA_PACKS,
  ...ELECTRONIC_EXTRA_PACKS,
  ...HIPHOP_EXTRA_PACKS,
];
