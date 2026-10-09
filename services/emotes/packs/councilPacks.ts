// councilPacks — six collections, one per Council of Art Directors lens.
//
// Each collection is one director's lens applied in full (see the header of each file for the
// director's question, the collection's rule, and how it bends the shared light plot in
// services/emotes/emoteRig.ts). All six stay under the lighting designer's one rig — key top-left,
// coloured rim lower-right, something on the floor beneath — so they read as one family on stream.
import type { EmotePack } from '../emoteTypes';
import { NEON_PACK } from './council/neon';
import { RISO_PACK } from './council/riso';
import { GILDED_PACK } from './council/gilded';
import { SPOTLIGHT_PACK } from './council/spotlight';
import { ONELINE_PACK } from './council/oneline';
import { ATLAS_PACK } from './council/atlas';

export const COUNCIL_PACKS: EmotePack[] = [NEON_PACK, RISO_PACK, GILDED_PACK, SPOTLIGHT_PACK, ONELINE_PACK, ATLAS_PACK];
