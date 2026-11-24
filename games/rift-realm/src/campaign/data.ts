// Vesselbound campaigns: one per playable vessel. A chapter = one map + an ordered list of steps, bracketed by intro and
// outro card beats (docs/rift-realm-campaign.md).
//
// CANON: Vesselbound sits in Kenne's Legend of Elohim universe. No story text here is canon. Every line marked PH is an
// empty slot waiting for Kenne's words, and the game shows it as a placeholder. Chapter titles are working titles
// (proposed). Never write Void / Elohim lore into this file without Kenne's text.
import type { VesselId } from '../vessels';

export type CampaignId = 'aegis' | 'stalker' | 'seraph' | 'lumen' | 'sylva' | 'pyre' | 'nyx';
export type Archetype = 'rusher' | 'caster' | 'brute' | 'boss';

export interface Card {
  speaker: string;
  lines: string[];
  /** true: the text is a stand-in until Kenne writes it (drawn with the placeholder tag). */
  ph?: boolean;
  /** optional still behind the card (an asset URL) */
  still?: string;
}

/** Where a step points on the map, resolved through modes/arena.ts describeArena(): */
export type Spot =
  | 'far'                 // the anchor farthest from the player's spawn
  | 'spawnB'              // the other team's spawn
  | 'center'              // the objective spot nearest the middle of the map (the shrine's monolith pit)
  | { objective: number } // the level's control point / objective spot i
  | { anchor: number };   // spread anchor i (0 = the spawn itself)

export type Step =
  | { kind: 'reach'; at: Spot; label: string; radius?: number }
  | { kind: 'clear'; count: number; mix?: Archetype[]; label: string }
  | { kind: 'survive'; seconds: number; label: string }
  | { kind: 'trials'; rounds: number; label: string }
  | { kind: 'boss'; label: string }
  | { kind: 'explore'; seconds: number; label: string; at?: Spot }
  | { kind: 'card'; cards: Card[] };

export interface Chapter {
  n: number;
  /** working title (proposed) */
  title: string;
  /** level param (studio/levelModules.ts) */
  level: string;
  /** one line for the chapter select */
  summary: string;
  /** downs allowed before the chapter is lost */
  lives: number;
  intro: Card[];
  steps: Step[];
  outro: Card[];
  /** a stub: the steps are a draft, not tuned or tested */
  stub?: boolean;
}

export interface Campaign {
  id: CampaignId;
  name: string;
  title: string;
  /** the vessel you play; null = the vessel is still being built (campaign locked) */
  vessel: VesselId | null;
  hex: string;
  chapters: Chapter[];
}

// ── placeholder helpers: clearly marked empty slots, never invented story ──
const PH = (speaker: string, what: string): Card => ({ speaker, ph: true, lines: [`[Placeholder: ${what}. Story by Kenne.]`] });
const NARR = 'Narrator';

/** A stub chapter: map + steps drafted from the doc, story slots empty. */
function stub(n: number, title: string, level: string, summary: string, steps: Step[], who: string): Chapter {
  return {
    n, title, level, summary, lives: 3, stub: true,
    intro: [PH(NARR, `${who}, chapter ${n} intro`)],
    steps,
    outro: [PH(NARR, `${who}, chapter ${n} outro`)],
  };
}
const R = (at: Spot, label: string): Step => ({ kind: 'reach', at, label });
const C = (count: number, label: string, mix?: Archetype[]): Step => ({ kind: 'clear', count, label, mix });
const S = (seconds: number, label: string): Step => ({ kind: 'survive', seconds, label });
const T = (rounds: number, label: string): Step => ({ kind: 'trials', rounds, label });
const B = (label: string): Step => ({ kind: 'boss', label });
const E = (seconds: number, label: string, at?: Spot): Step => ({ kind: 'explore', seconds, label, at });

/** The four vessels Antigravity is building: five placeholder chapters each, locked until the body and VesselId land. */
function forge(id: CampaignId, name: string, title: string, hex: string, maps: string[]): Campaign {
  return {
    id, name, title, vessel: null, hex,
    chapters: maps.map((level, i) => stub(i + 1, `Chapter ${i + 1}`, level, '[Placeholder: map and objectives to be designed]', [C(4, 'Clear the area')], name)),
  };
}

export const CAMPAIGNS: Campaign[] = [
  {
    id: 'aegis', name: 'Aegis', title: 'The Oathbound Bulwark', vessel: 'aegis', hex: '#fbbf24',
    chapters: [
      {
        n: 1, title: 'First Oath', level: 'shrine', lives: 3,
        summary: 'Reach the monolith, break the first wave, hold the ring, then face the champion.',
        intro: [
          PH(NARR, 'opening narration: where and when this begins'),
          PH('Aegis', "Aegis's first line: who they are, why they are here"),
          PH('[Speaker]', 'who sends Aegis into the shrine, and why'),
        ],
        steps: [
          R('center', 'Reach the monolith'),
          { kind: 'card', cards: [PH('Aegis', 'a line on arriving at the monolith')] },
          C(4, 'Break the first wave', ['rusher', 'rusher', 'caster', 'rusher']),
          S(45, 'Hold the ring'),
          { kind: 'card', cards: [PH('[Speaker]', 'the champion is announced')] },
          B('Defeat the champion'),
        ],
        outro: [
          PH('Aegis', 'a line after the champion falls'),
          PH(NARR, 'chapter close and the hook into chapter 2'),
        ],
      },
      stub(2, 'Hold the Line', 'glacial', 'Take the battlement and hold it.', [R('far', 'Reach the battlement'), S(90, 'Hold the battlement'), C(6, 'Clear the yard')], 'Aegis'),
      stub(3, 'Ember Wall', 'volcanic', 'Three trials, the forge hall, then the champion.', [T(3, 'Trials of the forge'), R({ objective: 1 }, 'Reach the forge hall'), B('Defeat the champion')], 'Aegis'),
      stub(4, 'Drowned Vigil', 'marsh', 'Find the sunken shrine and keep watch.', [E(40, 'Search the marsh'), R({ objective: 0 }, 'Reach the sunken shrine'), S(120, 'Keep the vigil')], 'Aegis'),
      stub(5, 'The Last Bulwark', 'celestial', 'Five trials and a final duel.', [T(5, 'Climb the citadel'), B('[Placeholder: the final rival]')], 'Aegis'),
    ],
  },
  {
    id: 'stalker', name: 'Void Stalker', title: 'Shadow-Beast Frame', vessel: 'stalker', hex: '#e879f9',
    chapters: [
      stub(1, 'Into the Hollow', 'elderwood', 'Explore the Hollow, reach the Great Oak, clear the deck.', [E(45, 'Find the way into the Hollow', { objective: 0 }), R({ objective: 0 }, 'Reach the Great Oak'), C(5, 'Clear the deck')], 'Void Stalker'),
      stub(2, 'Night Hunt', 'marsh', 'Four trials through the stilt village.', [T(4, 'The night hunt')], 'Void Stalker'),
      stub(3, 'Glass and Ice', 'glacial', 'Find the ice cave and its champion.', [R('far', 'Reach the ice cave'), B('Defeat the champion')], 'Void Stalker'),
      stub(4, 'Ash Run', 'volcanic', 'Survive the trenches, reach the throne hall.', [S(90, 'Survive the trenches'), R('far', 'Reach the throne hall')], 'Void Stalker'),
      stub(5, 'Edge of the Rift', 'celestial', 'Clear the islands, then the final duel.', [C(8, 'Clear the islands'), B('[Placeholder: the final rival]')], 'Void Stalker'),
    ],
  },
  {
    id: 'seraph', name: 'Seraph-9', title: 'Fallen-Tech Cherub', vessel: 'seraph', hex: '#93c5fd',
    chapters: [
      stub(1, 'Fall', 'celestial', 'Reach the far island and clear it.', [R('far', 'Reach the far island'), C(4, 'Clear the island')], 'Seraph-9'),
      stub(2, 'Signal', 'shrine', 'Hold, then reach the node.', [S(60, 'Hold the ring'), R({ objective: 1 }, 'Reach the power node')], 'Seraph-9'),
      stub(3, 'Frost Choir', 'glacial', 'Four trials, then the champion.', [T(4, 'The frost choir'), B('Defeat the champion')], 'Seraph-9'),
      stub(4, 'Canopy', 'elderwood', 'Explore the canopy and visit three spots.', [E(40, 'Explore the canopy'), R({ objective: 0 }, 'Reach the first spot'), R({ objective: 1 }, 'Reach the second spot'), R({ objective: 2 }, 'Reach the third spot')], 'Seraph-9'),
      stub(5, 'Sanctum', 'sanctum', 'Five trials and a final duel in the hub.', [T(5, 'The sanctum trials'), B('[Placeholder: the final rival]')], 'Seraph-9'),
    ],
  },
  // map leanings for the forge vessels are guesses from the names alone (proposed): Kenne decides
  forge('lumen', 'Lumen', '[Placeholder: title]', '#fde68a', ['celestial', 'shrine', 'glacial', 'celestial', 'sanctum']),
  forge('sylva', 'Sylva', '[Placeholder: title]', '#86efac', ['elderwood', 'elderwood', 'marsh', 'shrine', 'elderwood']),
  forge('pyre', 'Pyre', '[Placeholder: title]', '#fb923c', ['volcanic', 'volcanic', 'shrine', 'glacial', 'volcanic']),
  forge('nyx', 'Nyx', '[Placeholder: title]', '#a78bfa', ['marsh', 'sanctum', 'celestial', 'marsh', 'sanctum']),
];

export const campaignById = (id: string | null | undefined) => CAMPAIGNS.find((c) => c.id === id);
export const chapterKey = (id: string, n: number) => `${id}/${n}`;

/** The chapter to run: the menu's pick, else ?campaign=<id>&chapter=<n> (chapter 1 by default). Null when locked / unknown. */
export function resolveCampaign(pick?: { id: string; chapter: number } | null): { campaign: Campaign; chapter: Chapter } | null {
  const q = new URLSearchParams(location.search);
  const id = pick?.id ?? q.get('campaign');
  const c = campaignById(id);
  if (!c || !c.vessel) return null;
  const n = pick?.chapter ?? (Number(q.get('chapter')) || 1);
  const ch = c.chapters.find((x) => x.n === n) ?? c.chapters[0];
  return { campaign: c, chapter: ch };
}
