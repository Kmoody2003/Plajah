// Pumpkin Patch cast encounters, ported from the classic exhibition (SPARSE_ENCOUNTERS in
// components/taleo/HauntedCastleExhibition.tsx): each fires once where it happens in the
// film's world, shows its comic panel + script line, and stages the cast in 3D.
export interface Encounter {
  id: string;
  title: string;
  subtitle: string;
  portrait: string;
  panel: string;
  quote: string;
  sfx: string;
  scene: string;
  timecode: string;
  color: string;
  /** What the engine stages when it fires (combat.ts). */
  stage: 'tank' | 'miriam' | 'blades' | 'stitch' | 'crane' | 'boo';
}

const C = '/generated/comics/pumpkin_patch_v4/';
export const ENCOUNTERS: Encounter[] = [
  {
    id: 'pumpkin_patch_tank', stage: 'tank',
    title: "Pumpkin Patch's Armored Tank Assault",
    subtitle: 'Heavy armor backup — Melvin, Tepes & Lil’ Boo turret salvo',
    portrait: `${C}char_1_portrait.jpg`, panel: `${C}panel_195.jpg`,
    quote: '"I already told you... I don\'t work for government stooges. Lil\' Boo—light up those monsters on the road!"',
    sfx: 'VRROOOM-CRUNCH! BOOM-BOOM-BOOM!',
    scene: 'Act II — Armored tank escape from District 13 & turret barrage', timecode: '37:21', color: '#f97316',
  },
  {
    id: 'miriam_monkeys', stage: 'miriam',
    title: 'Wicked Witch Miriam & Her Flying Monkey Army',
    subtitle: 'Aerial witch flyover',
    portrait: `${C}char_3_portrait.jpg`, panel: `${C}panel_042.jpg`,
    quote: '"Fly, my winged legions! Tear open the Hexagon portal before Pumpkin Patch reaches the Castle Keep!"',
    sfx: 'KRA-KOOOM! HAHAHAHA!',
    scene: 'Act I — Miriam marshals her legions', timecode: '10:30', color: '#10b981',
  },
  {
    id: 'pumpkin_patch_blades', stage: 'blades',
    title: 'Pumpkin Patch Materializes with Dual Plasma Blades',
    subtitle: 'He fights at your side for a while',
    portrait: `${C}char_1_portrait.jpg`, panel: `${C}panel_155.jpg`,
    quote: '"Looks like you could use a hand on this road. Stand back—my blades burn hotter than Hell!"',
    sfx: 'FSHHH-CRACKLE! SLASH!',
    scene: 'Act III — Plasma blades awaken', timecode: '55:21', color: '#fb923c',
  },
  {
    id: 'stitch_scarecrow', stage: 'stitch',
    title: 'Stitch the Scarecrow Stalks the Castle',
    subtitle: 'Miriam’s enforcer blocks the viaduct',
    portrait: `${C}char_4_portrait.jpg`, panel: `${C}panel_096.jpg`,
    quote: '"No traveler passes the Lonesome Crossroads without paying the Scarecrow’s toll..."',
    sfx: 'SKRRTCH-RUSTLE!',
    scene: 'Act II — Stitch patrols the outer perimeter', timecode: '28:15', color: '#eab308',
  },
  {
    id: 'katrina_crane_patrol', stage: 'crane',
    title: 'Agent Katrina & Commander Crane (Robo-Bones) Recon',
    subtitle: 'District 13 tactical sweep of the Great Hall',
    portrait: `${C}char_2_portrait.jpg`, panel: `${C}panel_122.jpg`,
    quote: '"Scanner locked on dimensional signatures at the Castle Foyer. Keep your tactical beam steady, Katrina."',
    sfx: 'WHIRRR-CLANK!',
    scene: 'Act I — District 13 containment briefing', timecode: '04:30', color: '#38bdf8',
  },
  {
    id: 'lil_boo_jar', stage: 'boo',
    title: 'Lil’ Boo Spectral Recon Drift',
    subtitle: 'A friendly ghost lights your way',
    portrait: `${C}char_6_portrait.jpg`, panel: `${C}panel_148.jpg`,
    quote: '"Follow the glowing paintings inside the castle—each frame holds a portal into the Vault!"',
    sfx: 'WHOOO-GLIMMER!',
    scene: 'Act II — Lil’ Boo’s recon', timecode: '25:40', color: '#a855f7',
  },
];
