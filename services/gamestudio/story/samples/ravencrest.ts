// Ravencrest: The Liberation Campaign, as a Game Story. Transcribed from docs/ravencrest-campaign.md
// (design draft v0.2): 4 acts, 13 levels, ~60 minutes. Names marked "(proposed)" in the draft keep that
// mark. Beats and intensities are this breakdown's reading of the draft, editable on the Story tab.
// No place has a module yet: Ravencrest's own runtime isn't registered in the Studio, so building it into
// a project uses stand-in arenas.

import { GAME_STORY_KIND, GAME_STORY_VERSION, type GameStory } from '../schema';

export const RAVENCREST_STORY: GameStory = {
  kind: GAME_STORY_KIND,
  version: GAME_STORY_VERSION,
  id: 'story-ravencrest',
  title: 'Ravencrest: The Liberation Campaign',
  logline: 'Two deputies downed inside the Hex break its Hexstones region by region, bring the Count to his knees, and find the woman who wove the Hex.',
  source: { kind: 'doc', ref: 'docs/ravencrest-campaign.md' },
  template: 'adventure',
  templateWhy: 'A journey through haunted places with puzzles, dread and fights: survival horror, action adventure and hack and slash mixed per level, so the adventure template carries it.',
  cast: [
    { id: 'jack', name: 'Jack Thorne', role: 'hero', blurb: 'Deputy, blade fighter.' },
    { id: 'elise', name: 'Elise', role: 'hero', blurb: 'Deputy, crossbow, flasks, lantern (proposed).' },
    { id: 'sante', name: 'Cardinal Oriel Sante (proposed)', role: 'npc', blurb: 'Radio handler in Rome.' },
    { id: 'angel', name: 'The guardian angel', role: 'ally', blurb: 'Limited intervention power.' },
    { id: 'host', name: 'The host of angels', role: 'ally', blurb: 'Drawbridge rescue; returns in the finale.' },
    { id: 'dracula', name: 'Dracula', role: 'boss', blurb: 'Act II boss; returns in III and IV.' },
    { id: 'vesper', name: 'Vesper Calloway, the Hexmother (proposed)', role: 'boss', blurb: 'The real villain; final boss.' },
    { id: 'dead', name: 'The dead', role: 'enemy', blurb: 'Zombies, ghosts, wolves, werewolves, vampires.' },
    { id: 'bellwright', name: 'The Bellwright', role: 'boss', blurb: 'Hex-warden: a giant built from the town\'s clockwork.' },
    { id: 'abbot', name: 'The Abbot Hollow', role: 'boss', blurb: 'Hex-warden wearing the silence like a shroud.' },
    { id: 'troll', name: 'The troll', role: 'boss' },
    { id: 'kraken', name: 'The kraken', role: 'boss' },
    { id: 'choir', name: 'The Drowned Choir', role: 'enemy', blurb: 'Stalker: can be driven off, not killed until the end.' },
    { id: 'mirror', name: 'Your reflection', role: 'boss', blurb: 'A duel against your own move list.' },
    { id: 'shades', name: 'Lance shades', role: 'enemy' },
    { id: 'daughter', name: 'The bell-ringer\'s daughter', role: 'npc' },
    { id: 'keeper', name: 'The lighthouse keeper', role: 'npc' },
  ],
  places: [
    { id: 'office', name: 'The Lantern Office', mood: 'candlelit' },
    { id: 'pines', name: 'Hollow Pines', mood: 'burning forest' },
    { id: 'road', name: 'the road out of the pines' },
    { id: 'ashmoor', name: 'Ashmoor Crossing', mood: 'looping dusk' },
    { id: 'tower', name: 'Ashmoor bell tower' },
    { id: 'brennan', name: 'Saint Brennan\'s Mission', mood: 'silent snow' },
    { id: 'deadroad', name: 'The Dead Road', mood: 'storm' },
    { id: 'drawbridge', name: 'The Drawbridge', mood: 'storm' },
    { id: 'castle', name: 'Courtyard, Grand Hall, Upper Wing', mood: 'dread' },
    { id: 'undercroft', name: 'The Undercroft', mood: 'upward rain' },
    { id: 'hollowmere', name: 'Hollowmere, the Mirror Town', mood: 'mirror lake' },
    { id: 'tehom', name: 'Tehom Station', mood: 'hell light' },
    { id: 'cathedral', name: 'The Thorn Cathedral', mood: 'red under-realm' },
  ],
  items: [
    { id: 'relics', name: 'The Office relics' },
    { id: 'lantern', name: 'The Lantern of Brennan', blurb: 'Shows sound as light.' },
    { id: 'hexstone', name: 'Hexstone', blurb: 'One per region; break one and morning returns.' },
    { id: 'rosary', name: 'The Rosary Chain' },
    { id: 'seal', name: 'The Unbroken Seal' },
  ],
  chapters: [
    {
      id: 'act1', title: 'The Fissure Line', act: 1, levels: [
        { id: 'prologue', title: 'Prologue: The Lantern Office', beat: 'teach', place: 'office', goal: { kind: 'explore' }, story: 'Cardinal Sante shows them footage from Ravencrest and swears them in. Ends on the aircraft over Forth America.', verb: 'climb and fight (the training hall drill)', cast: [{ castId: 'sante', as: 'npc' }], item: 'relics', tellBy: ['dialogue', 'play'], minutes: 2, intensity: 1 },
        { id: 'downing', title: 'The Downing at Hollow Pines', beat: 'hook', place: 'pines', goal: { kind: 'reach', target: 'road' }, story: 'The Hex takes the aircraft. Jack and Elise are separated in a burning pine forest and reunite at the road.', verb: 'climb hanging debris', cast: [{ castId: 'dead', as: 'enemy', count: 4 }], tellBy: ['play', 'environment'], minutes: 5, intensity: 3 },
        { id: 'ashmoor', title: 'Ashmoor Crossing', beat: 'test', place: 'ashmoor', goal: { kind: 'reach', target: 'tower' }, story: 'A town stuck in a ten-second loop whenever its bell rings. Solve your way to the bell tower and ring it yourself to break it.', verb: 'use the time loop', cast: [{ castId: 'dead', as: 'enemy', count: 6 }, { castId: 'daughter', as: 'npc' }, { castId: 'bellwright', as: 'boss' }], tellBy: ['environment', 'play'], minutes: 6, intensity: 3 },
        { id: 'brennan', title: 'Saint Brennan\'s Mission', beat: 'climax', place: 'brennan', goal: { kind: 'collect', target: 'hexstone', count: 1 }, story: 'Elise alone in a dome of silence where the dead hunt by sound. A crypt puzzle leads to the first Hexstone and a small daybreak.', verb: 'move by sound (Elise alone)', cast: [{ castId: 'dead', as: 'enemy', count: 5 }, { castId: 'abbot', as: 'boss' }], item: 'lantern', tellBy: ['environment', 'play'], minutes: 5, intensity: 4 },
      ],
    },
    {
      id: 'act2', title: 'The Count\'s Road', act: 2, levels: [
        { id: 'deadroad', title: 'The Dead Road', beat: 'test', place: 'deadroad', goal: { kind: 'survive', seconds: 240 }, story: 'Storm, the dead on the road, the bus wreck. Survive the hordes with the blade, the terrain and the angel.', cast: [{ castId: 'dead', as: 'enemy', count: 14 }, { castId: 'angel', as: 'ally' }], tellBy: ['environment', 'play'], minutes: 4, intensity: 3 },
        { id: 'drawbridge', title: 'The Drawbridge', beat: 'twist', place: 'drawbridge', goal: { kind: 'defeat', target: 'troll' }, story: 'The troll and the kraken. The storm parts and a host of angels dives in: "Heaven answers."', cast: [{ castId: 'troll', as: 'boss' }, { castId: 'kraken', as: 'enemy', count: 1 }, { castId: 'host', as: 'ally' }], tellBy: ['play', 'cutscene'], minutes: 4, intensity: 4 },
        { id: 'castle', title: 'Courtyard, Grand Hall, Upper Wing', beat: 'breather', place: 'castle', goal: { kind: 'explore' }, story: 'Slower and stranger: locked wings, crests, a woman\'s portrait with its face burned out. A Hexstone pulses in the Grand Hall.', cast: [{ castId: 'dead', as: 'enemy', count: 4 }], tellBy: ['environment', 'lore'], minutes: 4, intensity: 2 },
        { id: 'countsnight', title: 'The Count\'s Night', beat: 'climax', place: 'castle', goal: { kind: 'defeat', target: 'dracula' }, story: 'Dracula drops to one knee, then chains of hex light drag him into the storm: "Not yet, Count." Daybreak over the fortress only. "Ravencrest is not free."', cast: [{ castId: 'dracula', as: 'boss' }], tellBy: ['play', 'cutscene'], minutes: 3, intensity: 5 },
      ],
    },
    {
      id: 'act3', title: 'The Hexmother\'s Reach', act: 3, levels: [
        { id: 'undercroft', title: 'The Undercroft', beat: 'breather', place: 'undercroft', goal: { kind: 'explore' }, story: 'Under Dracula\'s coffin, a laboratory and her name: Vesper Calloway. The Hex is hers, not his.', verb: 'climb and swim through upward rain', cast: [{ castId: 'choir', as: 'enemy', count: 1 }], item: 'rosary', tellBy: ['environment', 'lore'], minutes: 6, intensity: 3 },
        { id: 'hollowmere', title: 'Hollowmere, the Mirror Town', beat: 'twist', place: 'hollowmere', goal: { kind: 'defeat', target: 'mirror' }, story: 'Reflections climb out. Dracula returns, hunted himself: "She wants it to open."', verb: 'cross the mirror town', cast: [{ castId: 'mirror', as: 'boss' }, { castId: 'keeper', as: 'npc' }, { castId: 'dracula', as: 'npc' }], tellBy: ['environment', 'play', 'dialogue'], minutes: 6, intensity: 4 },
        { id: 'tehom', title: 'Tehom Station', beat: 'climax', place: 'tehom', goal: { kind: 'clear' }, story: 'Gravity flips around the weapon\'s core. Disable the Lance in three stages; morning moves north across the south of the province.', verb: 'flip gravity room by room', cast: [{ castId: 'shades', as: 'enemy', count: 8 }], tellBy: ['play', 'environment'], minutes: 6, intensity: 5 },
      ],
    },
    {
      id: 'act4', title: 'The Unbroken', act: 4, levels: [
        { id: 'cathedral', title: 'The Thorn Cathedral', beat: 'test', place: 'cathedral', goal: { kind: 'reach', target: 'cathedral' }, story: 'A long climb up the outside of the spire while Hell leaks in. The survivors you saved hold the doors.', cast: [{ castId: 'dead', as: 'enemy', count: 8 }], item: 'seal', tellBy: ['play', 'environment'], minutes: 5, intensity: 4 },
        { id: 'hexmother', title: 'The Hexmother, and the first sunrise', beat: 'climax', place: 'cathedral', goal: { kind: 'defeat', target: 'vesper' }, story: 'Every curse cast back at you, the fall into the red realm, the angels holding the seam, and the Seal. The first full sunrise; an epilogue in the Lantern Office.', cast: [{ castId: 'vesper', as: 'boss' }, { castId: 'host', as: 'ally' }, { castId: 'dracula', as: 'npc' }], tellBy: ['play', 'cutscene'], minutes: 4, intensity: 5 },
      ],
    },
  ],
  createdAt: 0,
  updatedAt: 0,
};
