// Series VIII · Sanctuary Light — 24 works for church ministries.
// See sanctuary/prelude.ts for the brief, the council and the Lighting
// Director's house rules. Each director's four works live in their own file.

import { sanctuarySource, SANCTUARY_PARAMS, type SanctuaryWorkDef, type SanctuaryEnergy } from './sanctuary/prelude';
import { CLASSICAL_WORKS } from './sanctuary/worksClassical';
import { REBEL_WORKS } from './sanctuary/worksRebel';
import { FUTURIST_WORKS } from './sanctuary/worksFuturist';
import { WORLD_WORKS } from './sanctuary/worksWorld';
import { BAROQUE_WORKS } from './sanctuary/worksBaroque';
import { MINIMAL_WORKS } from './sanctuary/worksMinimal';

export type { SanctuaryEnergy } from './sanctuary/prelude';

export interface SanctuaryWork extends Omit<SanctuaryWorkDef, 'glsl'> {
  series: 'VIII';
  setTitle: 'Sanctuary Light';
  src: string;
  params: { name: string; def: number }[];
  reacts: [string, string][];
}

const ALL_DEFS: SanctuaryWorkDef[] = [
  ...CLASSICAL_WORKS, ...REBEL_WORKS, ...FUTURIST_WORKS,
  ...WORLD_WORKS, ...BAROQUE_WORKS, ...MINIMAL_WORKS,
];

export const SANCTUARY_WORKS: SanctuaryWork[] = ALL_DEFS.map(({ glsl, ...w }) => ({
  ...w,
  series: 'VIII',
  setTitle: 'Sanctuary Light',
  src: sanctuarySource({ glsl }),
  params: SANCTUARY_PARAMS.map(p => ({ ...p })),
  reacts: [
    ['LEVEL / BASS', 'the light breathes with the room — swells, never strobes'],
    ['C–B chroma', 'the chord gently tints the key light'],
  ],
}));

export const sanctuaryEnergyOf = (src: string): SanctuaryEnergy | undefined => SANCTUARY_WORKS.find(w => w.src === src)?.energy;
