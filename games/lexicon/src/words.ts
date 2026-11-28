// Word bank: every word is a living thing the Unwriting wants to erase.
// power = what the word does when sung on the Lyre.
export type Power = 'light' | 'time' | 'grow' | 'water' | 'open' | 'mend' | 'none';
export interface WordDef { w: string; def: string; power: Power; tier: 1 | 2 | 3 }

export const WORDS: WordDef[] = [
  // power words (the Songs)
  { w: 'LIGHT', def: 'what chases the dark and wakes ancient mirrors', power: 'light', tier: 1 },
  { w: 'TIME', def: 'the river that carries every day and slows swinging blades', power: 'time', tier: 1 },
  { w: 'GROW', def: 'to reach up from a seed', power: 'grow', tier: 1 },
  { w: 'RAIN', def: 'water falling from clouds to turn great wheels', power: 'water', tier: 1 },
  { w: 'OPEN', def: 'the opposite of shut', power: 'open', tier: 1 },
  { w: 'MEND', def: 'to heal what was torn and repaint the unwritten', power: 'mend', tier: 2 },
  // everyday & village craft words (tier 1)
  { w: 'HOME', def: 'where you are known', power: 'none', tier: 1 },
  { w: 'FORGE', def: 'fire and anvil shaping iron with runes', power: 'none', tier: 1 },
  { w: 'BREAD', def: 'baked from flour and patience', power: 'none', tier: 1 },
  { w: 'RIVER', def: 'a road made of water', power: 'none', tier: 1 },
  { w: 'STAR', def: 'a far sun, small with distance', power: 'none', tier: 1 },
  { w: 'SONG', def: 'words that learned to fly', power: 'none', tier: 1 },
  { w: 'FRIEND', def: 'someone who stays', power: 'none', tier: 1 },
  { w: 'SCROLL', def: 'a memory rolled tight for safekeeping', power: 'none', tier: 1 },
  { w: 'HERB', def: 'a green leaf carrying quiet medicine', power: 'none', tier: 1 },
  { w: 'WEAVE', def: 'crossing threads until a story holds', power: 'none', tier: 1 },
  { w: 'SHIELD', def: 'wood and iron standing between harm and home', power: 'none', tier: 1 },
  { w: 'INK', def: 'dark pigment meant to write, not erase', power: 'none', tier: 1 },
  { w: 'LETTER', def: 'a small mark sent across distance', power: 'none', tier: 1 },
  // cavern, wilderness & academia words (tier 2)
  { w: 'GARDEN', def: 'a place planned by hope', power: 'none', tier: 2 },
  { w: 'BRIDGE', def: 'it joins what distance split', power: 'none', tier: 2 },
  { w: 'MEMORY', def: 'the past, kept in the mind', power: 'none', tier: 2 },
  { w: 'WINTER', def: 'the cold, quiet season', power: 'none', tier: 2 },
  { w: 'LANTERN', def: 'a caged flame you can carry', power: 'none', tier: 2 },
  { w: 'MIRROR', def: 'it bends light at equal angles', power: 'none', tier: 2 },
  { w: 'THUNDER', def: 'the sound lightning leaves behind', power: 'none', tier: 2 },
  { w: 'COMPASS', def: 'it always knows north', power: 'none', tier: 2 },
  { w: 'JOURNEY', def: 'travel with a purpose', power: 'none', tier: 2 },
  { w: 'CRYSTAL', def: 'stone that remembers light underground', power: 'none', tier: 2 },
  { w: 'PRISM', def: 'glass that splits one beam into a spectrum', power: 'none', tier: 2 },
  { w: 'RATIO', def: 'how two turning wheels measure each other', power: 'none', tier: 2 },
  { w: 'TORQUE', def: 'force turning across a lever arm', power: 'none', tier: 2 },
  { w: 'RAPIDS', def: 'white water racing through a stone gorge', power: 'none', tier: 2 },
  { w: 'ANTLER', def: 'a crown of living light in the deep woods', power: 'none', tier: 2 },
  { w: 'CANOPY', def: 'the high green roof of an ancient forest', power: 'none', tier: 2 },
  { w: 'JUSTICE', def: 'scales weighed level without favour', power: 'none', tier: 2 },
  // deep lore words (tier 3)
  { w: 'WISDOM', def: 'knowledge that learned manners', power: 'none', tier: 3 },
  { w: 'COURAGE', def: 'fear that kept walking', power: 'none', tier: 3 },
  { w: 'HARMONY', def: 'many notes, one agreement', power: 'none', tier: 3 },
  { w: 'LIBRARY', def: "a house of other people's minds", power: 'none', tier: 3 },
  { w: 'PHOENIX', def: 'a bird that rises from its own ashes', power: 'none', tier: 3 },
  { w: 'SILENCE', def: 'the sound of no words', power: 'none', tier: 3 },
  { w: 'TOMORROW', def: 'the day that has not yet been written', power: 'none', tier: 3 },
  { w: 'WILDWOOD', def: 'the untamed forest where old guardians walk', power: 'none', tier: 3 },
  { w: 'ELOQUENT', def: 'speaking with grace and force', power: 'none', tier: 3 },
  { w: 'LANGUAGE', def: 'the thing you are inside of right now', power: 'none', tier: 3 },
];

export const wordByText = (w: string) => WORDS.find((x) => x.w === w);

export const POWER_LABEL: Record<Power, string> = {
  light: 'Song of Light', time: 'Song of Time', grow: 'Song of Growing',
  water: 'Song of Rain', open: 'Song of Opening', mend: 'Song of Mending', none: 'Remembered',
};
