// Registry of council-directed disc templates (one Design per concept in concepts.ts).
import type { Design } from './kit';
import { proscenium } from './proscenium';
import { lightSlit } from './lightSlit';
import { shelf } from './shelf';
import { stageRig } from './stageRig';
import { programme } from './programme';
import { slate } from './slate';
import { archive } from './archive';
import { storybook } from './storybook';
import { midnight } from './midnight';

export const DESIGNS: Record<string, Design> = {
  feature: proscenium,
  collector4k: lightSlit,
  boxset: shelf,
  concert: stageRig,
  arthouse: programme,
  screener: slate,
  documentary: archive,
  family: storybook,
  genre: midnight,
};
