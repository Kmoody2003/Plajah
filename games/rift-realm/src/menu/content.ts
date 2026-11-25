// Rift Realm menus — what the map and character screens show. Map facts come from docs/rift-realm-levels.md and
// docs/rift-realm-open-world.md; character facts from vessels.ts / weapons.ts (the real game numbers) and the Void
// Sanctum package README (void-sanctum-complete/void-sanctum/README.md, the roster's class and design lines).
//
// CANON: backstories are NOT written here. Kenne's Legend of Elohim canon (the Void, the timelines) has no repo source,
// so every origin line is a clearly marked placeholder until Kenne supplies it. See CANON_GAPS.
import { VESSELS, type VesselId } from '../vessels';
import { WEAPONS } from '../weapons';

const M = '/games/rift-realm/assets/menu/';

export interface MapCard {
  param: string; name: string; mode: string; size: string; blurb: string;
  /** shot-sequence loop (aerial, orbit, fly-through) + its poster */
  video: string; poster: string;
  accent: string;
}

export const MAPS: MapCard[] = [
  { param: 'elderwood', name: 'Elderwood Hollow', mode: 'Domination · A / B / C', size: 'Open world · 2 km × 2 km',
    blurb: 'The Great Oak deck, rope bridges to four oak platforms and mossy ruins far below, at the heart of a wild forest with a river gorge, a Titan Tree and the Redwood Ruins.',
    video: M + 'maps/elderwood.mp4', poster: M + 'maps/elderwood.webp', accent: '#24e8ff' },
  { param: 'shrine', name: 'Cyber-Forest Shrine', mode: '3v3 Skirmish · 6v6 outer ring', size: 'Compact · ≈ 44 m octagon',
    blurb: 'Spawn alcoves east and west, a raised ring with four stairways, and a sunken pit holding the crystal monolith and the power node.',
    video: M + 'maps/shrine.mp4', poster: M + 'maps/shrine.webp', accent: '#a78bfa' },
  { param: 'glacial', name: 'Glacial Citadel', mode: '6v6 Team Arena · 12v12 Battleground', size: 'Large · ≈ 140 × 200 m',
    blurb: 'Battlements 12 m above the yard, an ice cave to the west, hard-light bridges over the chasm and the Void Shrine cathedral to the north.',
    video: M + 'maps/glacial.mp4', poster: M + 'maps/glacial.webp', accent: '#7dd3fc' },
  { param: 'volcanic', name: 'Obsidian Volcanic Compound', mode: '6v6 Team Arena · 12v12 Battleground', size: 'Battleground · 160–240 m',
    blurb: 'Lava trenches with catwalks and a dash gap, a gated fortress, the forge hall under the castle tier and the throne hall inside the gothic keep.',
    video: M + 'maps/volcanic.mp4', poster: M + 'maps/volcanic.webp', accent: '#fb923c' },
  { param: 'marsh', name: 'Sunken Marshland Village', mode: '6v6 Team Arena · 12v12 Battleground', size: 'Battleground · 160–240 m',
    blurb: 'A drowned manor with a grand stair into the water, green-lit causeways, a stilt village under a 46 m cypress, the sunken shrine and the swamp docks.',
    video: M + 'maps/marsh.mp4', poster: M + 'maps/marsh.webp', accent: '#4ade80' },
  { param: 'celestial', name: 'Celestial Void Citadel', mode: '6v6 Team Arena · 12v12 Battleground', size: 'Battleground · six islands',
    blurb: 'Weathered citadels on inverted mountains, joined by hard-light bridges, under lit moons, drifting asteroids and the void beam.',
    video: M + 'maps/celestial.mp4', poster: M + 'maps/celestial.webp', accent: '#c4b5fd' },
];

export interface CharCard {
  id: VesselId; name: string; title: string; role: string;
  /** which in-engine model stands on the pedestal */
  model: 'stalker' | 'paladin' | 'seraph' | 'sylva' | 'pyre';
  turn: string; turnPoster: string; combat: string; combatPoster: string;
  /** canon facts we have (design lines from the Void Sanctum roster); empty where there is none */
  design: string;
  /** shown under the pedestal when the 3D model is another vessel's body standing in */
  standIn?: string;
  /** null = canon missing: the screen shows a marked placeholder */
  backstory: string | null;
  abilities: { name: string; key: string; text: string }[];
}

const SHARED = [
  { name: 'Soul Surge', key: 'Q', text: 'Spend 1.0× resonance (needs 2.0×): a shock ring hits and launches everything within 8.5 m.' },
  { name: 'Soul-Rend', key: 'F', text: 'Finish a staggered foe with an execution strike.' },
];

export const CHARS: CharCard[] = [
  { id: 'aegis', name: 'Aegis', title: 'The Oathbound Bulwark', role: 'Tank · Vanguard', model: 'paladin',
    turn: M + 'chars/aegis-turn.mp4', turnPoster: M + 'chars/aegis-turn.webp', combat: M + 'chars/aegis-combat.mp4', combatPoster: M + 'chars/aegis-combat.webp',
    design: 'Stone-and-gold golem knight with a tower shield, a lance beam and a cyan soul core.',
    backstory: null,
    abilities: [
      { name: 'Halo Lance', key: 'LMB', text: 'One precise beam per beat: the hardest single hit in the roster.' },
      { name: 'Bulwark Frame', key: '—', text: 'The heaviest vessel: most integrity, steady footing.' },
      ...SHARED,
    ] },
  { id: 'stalker', name: 'Void Stalker', title: 'Shadow-Beast Frame', role: 'Assassin · Rushdown', model: 'stalker',
    turn: M + 'chars/stalker-turn.mp4', turnPoster: M + 'chars/stalker-turn.webp', combat: M + 'chars/stalker-combat.mp4', combatPoster: M + 'chars/stalker-combat.webp',
    design: 'Hooded shadow assassin with wing-cloak and twin rift blades; magenta void light.',
    backstory: null,
    abilities: [
      { name: 'Rift Scatter', key: 'LMB', text: 'Five pellets per pull: devastating up close, falls off with range.' },
      { name: 'Hunter’s Pace', key: 'Shift', text: 'The fastest vessel and the longest dash in the roster.' },
      ...SHARED,
    ] },
  { id: 'seraph', name: 'Seraph-9', title: 'Fallen-Tech Cherub', role: 'Support · Aerial', model: 'seraph',
    turn: M + 'chars/seraph-turn.mp4', turnPoster: M + 'chars/seraph-turn.webp', combat: M + 'chars/seraph-combat.mp4', combatPoster: M + 'chars/seraph-combat.webp',
    design: 'Armored white-and-gold tech-cherub with a crystal prism core head, floating golden crystal wing-blades and a halo energy emitter.',
    backstory: null,
    abilities: [
      { name: 'Chord Repeater', key: 'LMB', text: 'A three-round burst on every beat from three cycling barrels.' },
      { name: 'Light Frame', key: 'Space', text: 'Lighter gravity: longer jumps and hang time.' },
      ...SHARED,
    ] },
  { id: 'sylva', name: 'Sylva', title: 'The Rootwarden', role: 'Grappler · Control', model: 'sylva',
    turn: M + 'maps/elderwood.mp4', turnPoster: M + 'maps/elderwood.webp', combat: M + 'maps/elderwood.mp4', combatPoster: M + 'maps/elderwood.webp',
    design: 'Living treant warrior with glowing antler branches, amber sap veins, vine-wrapped arms and coiled root greaves.',
    backstory: null,
    abilities: [
      { name: 'Briar Spore-Cannon', key: 'LMB', text: 'Tri-bolt amber sap volley with crisp midrange control and fast heat bleed.' },
      { name: 'Living Bark', key: '—', text: 'High spirit regeneration and durable treant frame.' },
      ...SHARED,
    ] },
  { id: 'pyre', name: 'Pyre', title: 'The Cinder Smith', role: 'Brawler · Power', model: 'pyre',
    turn: M + 'maps/volcanic.mp4', turnPoster: M + 'maps/volcanic.webp', combat: M + 'maps/volcanic.mp4', combatPoster: M + 'maps/volcanic.webp',
    design: 'Obsidian-and-iron forge golem laced with molten lava cracks, carved cyan runes and a shoulder-slung ember warhammer.',
    backstory: null,
    abilities: [
      { name: 'Ember Slag-Breaker', key: 'LMB', text: 'Heavy molten scatter blast built for close-range armor breaking.' },
      { name: 'Crucible Bulk', key: '—', text: 'Highest integrity in the roster (155 HP) for frontline brawls.' },
      ...SHARED,
    ] },
];

/** Stat bars, from the real vessel and weapon tables (0…1 against the roster's best). */
export function statsFor(id: VesselId) {
  const v = VESSELS[id], w = WEAPONS[id];
  const burst = (x: VesselId) => VESSELS[x].dmgPerfect * VESSELS[x].pellets * VESSELS[x].burstCount;
  const ids = Object.keys(VESSELS) as VesselId[];
  const max = (f: (x: VesselId) => number) => Math.max(...ids.map(f));
  return [
    { label: 'Integrity', value: `${v.maxHp}`, f: v.maxHp / max((x) => VESSELS[x].maxHp) },
    { label: 'Speed', value: `${v.moveSpeed} m/s`, f: v.moveSpeed / max((x) => VESSELS[x].moveSpeed) },
    { label: 'Dash', value: `${v.dashSpeed} m/s`, f: v.dashSpeed / max((x) => VESSELS[x].dashSpeed) },
    { label: 'Perfect hit', value: `${burst(id)}`, f: burst(id) / max(burst) },
    { label: 'Magazine', value: `${w.magSize}`, f: w.magSize / max((x) => WEAPONS[x].magSize) },
    { label: 'Reload', value: `${w.reloadSec.toFixed(2)} s`, f: Math.min(...ids.map((x) => WEAPONS[x].reloadSec)) / w.reloadSec },
  ];
}

/** Placeholders the screens show until Kenne supplies canon. */
export const CANON_GAPS = [
  'Aegis — origin: whose soul inhabits the Bulwark vessel, and its oath',
  'Void Stalker — origin and how it came to the Void Tournament',
  'Seraph-9 — origin, and what the “9” means',
  'How the Void Tournament relates to the Void of Legend of Elohim (and the Banished Archangel)',
];

export const TIPS = [
  'Shots on the beat hit harder. PERFECT timing builds Soul Resonance fastest.',
  'At 2.0× resonance press Q (Y on a controller) for a Soul Surge.',
  'Dash just before a strike lands: the i-frames carry you through it.',
  'Stagger a foe, then press F for a Soul-Rend execution.',
  'Hold the right mouse button (LT) to aim down sights; the spread tightens.',
  'Tab (LT on a controller) locks on, so you can run and gun. Middle mouse or 5 puts the gun away for hand-to-hand.',
  'Hold A, B and C to win Domination in Elderwood Hollow.',
  'Press V to switch between first and third person.',
];
