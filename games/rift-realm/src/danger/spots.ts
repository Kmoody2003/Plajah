// Where the world is dangerous: predator territories (dens) and environment hazards, as plain data in world metres
// (x, z; the ground height is found at run time). Shared with the forest-map session (world/*): it reads
// `dangerClearings()` to keep trees and props off hazard footprints and may dress round them (thorn brakes, scorched
// ground by vents, dead trees round toxic pools). Moving an entry here moves it in the game; nothing else to edit.
//
// Elderwood Hollow (the CF-24 arena, |x|,|z| < 76) gets a few small hazards at its edges — never on the A/B/C routes.
// The Wilds (world/layout.ts PLACES) get the rest, themed to each place: the Mangrove Mire is toxic, Glowcap Hollow
// and Glowcap Stream crackle with electrified fungi, the Gorge and the escarpment shed rocks, the Sunken Ruins pit is a
// magma rift with vents, the Violet Vale is thick with spore pods. Night opens extra dens (`night: true`).

export type PredatorKind = 'wolf' | 'mantis' | 'wasp' | 'bat' | 'stalker';
import type { Herd } from './prey';
export type { Herd };

export type HazardKind = 'thorns' | 'spores' | 'toxic' | 'lava' | 'vent' | 'rockfall' | 'fungi' | 'deep';

export interface Den {
  id: string;
  kind: PredatorKind;
  x: number; z: number;
  /** Territory radius (m): they patrol inside it, give up a chase well beyond it. */
  r: number;
  /** How many live here (a wolf pack 3–4, the rest alone or in pairs). */
  n: number;
  /** Only at night (and one more member at night for every den). */
  night?: boolean;
}

export interface Hazard {
  id: string;
  kind: HazardKind;
  x: number; z: number;
  /** Footprint radius (m). Rockfall: the zone rocks land in. Deep: the pool. */
  r: number;
  /** Deep water: the surface height (default: the ground + 2.5). Rockfall: how high the rocks drop from (default 22). */
  y?: number;
  /** Periodic hazards (vents, rockfall, fungi, spores): seconds between triggers (fungi: beats between discharges). */
  every?: number;
}

// ── predators ───────────────────────────────────────────────────────────────────────────────────────────────────
export const DENS: Den[] = [
  // the hollow's edge: a pack that comes in off the Mossy Floor (three-way fights with the rift's creatures)
  { id: 'mossy-pack', kind: 'wolf', x: -58, z: -40, r: 26, n: 3 },
  // High Canopy
  { id: 'ruins-pack', kind: 'wolf', x: -40, z: -200, r: 45, n: 4 },
  { id: 'seedpod-wasps', kind: 'wasp', x: 118, z: -250, r: 30, n: 2 },
  { id: 'canopy-mantis', kind: 'mantis', x: 60, z: -150, r: 22, n: 1 },
  // Westwood
  { id: 'settlement-pack', kind: 'wolf', x: -300, z: -40, r: 50, n: 3 },
  { id: 'village-mantis', kind: 'mantis', x: -300, z: -150, r: 24, n: 2 },
  { id: 'glowcap-wasps', kind: 'wasp', x: -400, z: 190, r: 34, n: 2 },
  { id: 'titan-bats', kind: 'bat', x: -150, z: 300, r: 40, n: 3 },
  // the river and the Gorge
  { id: 'stream-mantis', kind: 'mantis', x: 225, z: 150, r: 22, n: 2 },
  { id: 'gorge-pack', kind: 'wolf', x: 170, z: 420, r: 50, n: 4 },
  { id: 'falls-bats', kind: 'bat', x: 250, z: 360, r: 35, n: 3 },
  // the Violet Vale and the Mire
  { id: 'mire-mantis', kind: 'mantis', x: -300, z: 600, r: 30, n: 2 },
  { id: 'vale-wasps', kind: 'wasp', x: 40, z: 580, r: 40, n: 3 },
  // the Redwood Ruins
  { id: 'plaza-pack', kind: 'wolf', x: 440, z: -60, r: 50, n: 3 },
  { id: 'cathedral-mantis', kind: 'mantis', x: 250, z: -390, r: 26, n: 2 },
  { id: 'zone10-wasps', kind: 'wasp', x: 450, z: -360, r: 34, n: 2 },
  // night only: Lumen Stalkers prowl alone, bats swarm, the big packs come down from the ridges
  { id: 'stalker-hollow', kind: 'stalker', x: 70, z: -70, r: 60, n: 1, night: true },
  { id: 'stalker-west', kind: 'stalker', x: -220, z: 80, r: 70, n: 1, night: true },
  { id: 'stalker-east', kind: 'stalker', x: 320, z: -180, r: 70, n: 1, night: true },
  { id: 'stalker-vale', kind: 'stalker', x: -100, z: 520, r: 80, n: 2, night: true },
  { id: 'night-pack-n', kind: 'wolf', x: 0, z: -110, r: 60, n: 4, night: true },
  { id: 'night-bats-ruins', kind: 'bat', x: 380, z: -150, r: 45, n: 3, night: true },
];

// ── hazards ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const HAZARDS: Hazard[] = [
  // Elderwood Hollow — edges only
  { id: 'hollow-thorns-w', kind: 'thorns', x: -50, z: -30, r: 3.2 },
  { id: 'hollow-thorns-e', kind: 'thorns', x: 64, z: -26, r: 2.8 },
  { id: 'hollow-spores-sw', kind: 'spores', x: -62, z: 38, r: 3.5, every: 7 },
  { id: 'hollow-fungi-mossy', kind: 'fungi', x: -38, z: -30, r: 3.2, every: 4 },
  { id: 'hollow-fungi-tower', kind: 'fungi', x: -22, z: 56, r: 3, every: 8 },

  // High Canopy: the Sunken Ruins pit is a magma rift — lava pools on the floor, vents round them
  // (the old pit tower stands at the centre, -92,-276, r ≈ 5.5 m: everything here keeps 8 m+ off it)
  { id: 'ruins-lava-1', kind: 'lava', x: -80, z: -288, r: 6 },
  { id: 'ruins-lava-2', kind: 'lava', x: -104, z: -290, r: 4 },
  { id: 'ruins-vent-1', kind: 'vent', x: -106, z: -266, r: 2.6, every: 6 },
  { id: 'ruins-vent-2', kind: 'vent', x: -78, z: -270, r: 2.6, every: 7.5 },
  { id: 'ruins-vent-3', kind: 'vent', x: -96, z: -298, r: 2.6, every: 9 },
  { id: 'ruins-rocks', kind: 'rockfall', x: -92, z: -276, r: 14, every: 5 },
  { id: 'canopy-thorns', kind: 'thorns', x: -40, z: -190, r: 5 },

  // Westwood
  { id: 'glowcap-fungi-1', kind: 'fungi', x: -405, z: 200, r: 4, every: 4 },
  { id: 'glowcap-fungi-2', kind: 'fungi', x: -436, z: 222, r: 4, every: 4 },
  { id: 'glowcap-fungi-3', kind: 'fungi', x: -420, z: 186, r: 3.5, every: 8 },
  { id: 'settlement-thorns', kind: 'thorns', x: -360, z: -80, r: 5 },
  { id: 'west-spores', kind: 'spores', x: -250, z: 30, r: 4, every: 8 },
  { id: 'titan-rocks', kind: 'rockfall', x: -120, z: 320, r: 12, every: 6 },

  // the river: electrified fungi on the ravine ledges, a deep plunge pool under the Glowcap falls
  { id: 'stream-fungi-1', kind: 'fungi', x: 232, z: 160, r: 3.5, every: 4 },
  { id: 'stream-fungi-2', kind: 'fungi', x: 246, z: 182, r: 3.5, every: 8 },
  { id: 'stream-deep', kind: 'deep', x: 238, z: 170, r: 6 },

  // the Gorge: rocks off both walls, a deep pool at the Great Falls' foot
  { id: 'gorge-rocks-w', kind: 'rockfall', x: 172, z: 400, r: 10, every: 6 },
  { id: 'gorge-rocks-e', kind: 'rockfall', x: 238, z: 430, r: 10, every: 7 },
  { id: 'escarp-rocks-w', kind: 'rockfall', x: -40, z: 336, r: 12, every: 7 },
  { id: 'escarp-rocks-e', kind: 'rockfall', x: 80, z: 340, r: 12, every: 8 },
  { id: 'falls-deep', kind: 'deep', x: 250, z: 350, r: 9 },

  // the Mangrove Mire: toxic water between the boardwalks, spore pods and thorns on the banks
  { id: 'mire-toxic-1', kind: 'toxic', x: -330, z: 640, r: 14 },
  { id: 'mire-toxic-2', kind: 'toxic', x: -300, z: 600, r: 10 },
  { id: 'mire-toxic-3', kind: 'toxic', x: -362, z: 606, r: 9 },
  { id: 'mire-spores-1', kind: 'spores', x: -312, z: 626, r: 4, every: 6 },
  { id: 'mire-spores-2', kind: 'spores', x: -350, z: 586, r: 4, every: 7 },
  { id: 'mire-thorns', kind: 'thorns', x: -280, z: 640, r: 5 },

  // the Violet Vale: spore pods in the undergrowth, a toxic slough
  { id: 'vale-spores-1', kind: 'spores', x: 10, z: 590, r: 4, every: 6 },
  { id: 'vale-spores-2', kind: 'spores', x: 50, z: 610, r: 4, every: 8 },
  { id: 'vale-spores-3', kind: 'spores', x: -30, z: 620, r: 4, every: 7 },
  { id: 'vale-toxic', kind: 'toxic', x: 90, z: 640, r: 12 },

  // the Redwood Ruins: thorns choking the court, fungi in the dark grove, a vent cracked open by the shrine
  { id: 'court-thorns', kind: 'thorns', x: 312, z: -280, r: 4 },
  { id: 'zone10-fungi', kind: 'fungi', x: 430, z: -400, r: 4, every: 4 },
  { id: 'cathedral-thorns', kind: 'thorns', x: 215, z: -440, r: 5 },
  { id: 'shrine-vent', kind: 'vent', x: 580, z: -220, r: 2.6, every: 8 },
  { id: 'shrine-lava', kind: 'lava', x: 588, z: -212, r: 3.5 },
];

/** Footprints to keep trees, props and spawns off: [x, z, radius, noGrass?] (rockfall and deep water are not included — they
 *  are zones on cliffs and in water, not something on the ground). */
export type Clearing = [number, number, number] | [number, number, number, number];
export function dangerClearings(): Clearing[] {
  return [
    // 4th value 1 = no grass either (lava, vents, toxic pools); forage and herd glades stay grassy
    ...HAZARDS.filter((h) => h.kind !== 'rockfall' && h.kind !== 'deep').map((h): Clearing => [h.x, h.z, h.r + (h.kind === 'vent' ? 2 : 0.5), h.kind === 'lava' || h.kind === 'vent' || h.kind === 'toxic' ? 1 : 0]),
    ...FORAGE.map((f): [number, number, number] => [f.x, f.z, f.r + 0.5]),
    ...HERDS.map((h): [number, number, number] => [h.x, h.z, 6]),               // a small open glade at each herd's centre
  ];
}

/** Is the (x, z) spot inside the classic arena (Elderwood Hollow alone, ?classic)? */
export const inHollow = (x: number, z: number) => Math.abs(x) < 76 && Math.abs(z) < 76;

// ── forage: fungi, berries and fruit (kinds in danger/forageTable.ts). Each patch mixes a good kind with its lookalike
// so you have to look closer. `n` items scattered within `r`. Fruit patches also draw predators on patrol.
// The forest-map session can later hand over its own vegetation instances (see danger/forage.ts `addSites`).
export interface ForagePatch { id: string; x: number; z: number; r: number; n: number; kinds: string[] }
export const FORAGE: ForagePatch[] = [
  // the hollow: a little help at the edges of the fight, and a trap beside it
  { id: 'hollow-caps-w', x: -46, z: -10, r: 3, n: 4, kinds: ['lumencap', 'lumencap', 'mimicap', 'chargecap'] },
  { id: 'hollow-berries-s', x: 14, z: 66, r: 3, n: 4, kinds: ['emberberry', 'ashberry'] },
  { id: 'hollow-pulse-e', x: 66, z: 4, r: 2.5, n: 3, kinds: ['pulsecap', 'dreamcap'] },
  // High Canopy / ruins
  { id: 'canopy-pulse', x: 30, z: -170, r: 4, n: 5, kinds: ['pulsecap', 'pulsecap', 'dreamcap', 'chargecap'] },
  { id: 'ruins-shell', x: -70, z: -240, r: 4, n: 3, kinds: ['shellfruit', 'muskpod'] },
  // Westwood
  { id: 'glowcap-caps', x: -412, z: 230, r: 6, n: 8, kinds: ['lumencap', 'mimicap', 'mimicap', 'lumencap', 'pulsecap', 'chargecap', 'chargecap'] },
  { id: 'settlement-berries', x: -380, z: -30, r: 5, n: 6, kinds: ['emberberry', 'emberberry', 'ashberry'] },
  { id: 'village-fruit', x: -300, z: -170, r: 5, n: 5, kinds: ['swiftpod', 'muskpod'] },
  // river, Gorge
  { id: 'stream-caps', x: 220, z: 140, r: 5, n: 6, kinds: ['lumencap', 'mimicap', 'chargecap'] },
  { id: 'gorge-shell', x: 190, z: 470, r: 5, n: 4, kinds: ['shellfruit', 'shellfruit', 'muskpod'] },
  // Mire, Vale
  { id: 'mire-berries', x: -290, z: 660, r: 6, n: 6, kinds: ['emberberry', 'ashberry', 'ashberry'] },
  { id: 'vale-fruit', x: 0, z: 560, r: 6, n: 6, kinds: ['swiftpod', 'swiftpod', 'muskpod'] },
  // the Redwood Ruins
  { id: 'plaza-fury', x: 420, z: -90, r: 5, n: 5, kinds: ['furyberry', 'bloodberry'] },
  { id: 'cathedral-fury', x: 250, z: -405, r: 4, n: 4, kinds: ['furyberry', 'bloodberry', 'bloodberry'] },
  { id: 'zone10-caps', x: 455, z: -370, r: 4, n: 4, kinds: ['pulsecap', 'dreamcap', 'lumencap', 'chargecap'] },
];

// the forest map reads this when it builds its forest mask (world/index.ts): main.ts imports danger/ at the top, so
// this runs before the level builds
(globalThis as unknown as { __wildsClearings?: () => Clearing[] }).__wildsClearings = dangerClearings;

/** `?dangerdemo`: one of every hazard and forage kind, and a small herd, on the open Mossy Floor west of the Great Oak
 *  (x -70…-30, z -50…-5), to try them all in one place (and for screenshots in the light ?classic level). */
export const DEMO_HAZARDS: Hazard[] = [
  { id: 'demo-lava', kind: 'lava', x: -64, z: -24, r: 3.5 },
  { id: 'demo-vent', kind: 'vent', x: -66, z: -10, r: 2.4, every: 6 },
  { id: 'demo-toxic', kind: 'toxic', x: -50, z: -46, r: 4.5 },
  { id: 'demo-rocks', kind: 'rockfall', x: -64, z: -40, r: 4, every: 5 },
  { id: 'demo-spores', kind: 'spores', x: -52, z: -8, r: 3, every: 6 },
];
export const DEMO_FORAGE: ForagePatch[] = [
  { id: 'demo-caps', x: -44, z: -14, r: 1.6, n: 4, kinds: ['lumencap', 'mimicap', 'pulsecap', 'dreamcap'] },
  { id: 'demo-berries', x: -40, z: -8, r: 1.6, n: 4, kinds: ['emberberry', 'ashberry', 'furyberry', 'bloodberry'] },
  { id: 'demo-fruit', x: -48, z: -18, r: 1.6, n: 3, kinds: ['swiftpod', 'muskpod', 'shellfruit'] },
  { id: 'demo-charge', x: -36, z: -20, r: 1.2, n: 2, kinds: ['chargecap'] },
  // a lone Lumencap across the floor for the mycelium's guidance, and Mimic Caps by the path for its warnings
  { id: 'demo-guide', x: -62, z: -48, r: 0.5, n: 1, kinds: ['lumencap'] },
  { id: 'demo-warn', x: -34, z: -30, r: 1.4, n: 3, kinds: ['mimicap', 'dreamcap', 'mimicap'] },
];
export const DEMO_HERDS: Herd[] = [{ id: 'demo-herd', kind: 'deer', x: -56, z: -30, r: 10, n: 3 }];

// ── prey herds (danger/prey.ts): open glades and riverbanks, away from the hazards ──
export const HERDS: Herd[] = [
  { id: 'canopy-deer', kind: 'deer', x: -10, z: -150, r: 30, n: 4 },
  { id: 'west-deer', kind: 'deer', x: -250, z: -100, r: 35, n: 5 },
  { id: 'glowcap-stags', kind: 'stag', x: -380, z: 120, r: 35, n: 3 },
  { id: 'river-deer', kind: 'deer', x: 160, z: 120, r: 30, n: 4 },
  { id: 'vale-stags', kind: 'stag', x: -120, z: 600, r: 45, n: 3 },
  { id: 'vale-deer', kind: 'deer', x: 80, z: 520, r: 40, n: 5 },
  { id: 'plaza-deer', kind: 'deer', x: 360, z: -40, r: 30, n: 4 },
  { id: 'cathedral-stags', kind: 'stag', x: 300, z: -340, r: 35, n: 2 },
];
