// Every named place in Otsu-no-ura, for the map (worldMap.ts) and the gazetteer doc it writes. When a new place is
// built, add it here in the same change, so the map stays a true map of the game.
import * as THREE from 'three/webgpu';
import type { Place } from './worldMap';
import { CANAL, CHANNEL, HILL, roadX } from './chapter1';
import { OTSU } from './otsu';
import { COAST_DZ, type River } from './river';

type V = THREE.Vector3;
export interface PlaceSources {
  beach: V; gate: V; plaza: V; strongbox: V; broker: V;
  boats: { boat: V; pier: V }[];
  magistrate: { gate: V; yard: V };
  otemon: V; forecourt: V;
  hill: { temple: V; templeGate: V; lookout: V; lookoutFoot: V; mother: V };
  landings: { canal: { p: V }[]; channel: { p: V }[] };
  rafts: { p: V }[];
  bridges: { canal: number[]; channel: number[] };
  river: River;
}

export function cityPlaces(s: PlaceSources): Place[] {
  const P = (id: string, name: string, kind: Place['kind'], x: number, z: number, note?: string, stills?: number[], label = true): Place => ({ id, name, kind, x, z, note, stills, label });
  const hx = (HILL.x0 + HILL.x1) / 2;
  return [
    // districts (big labels)
    P('harbour', "Fisherman's Harbour", 'district', -12, -98 + COAST_DZ, 'The beach landing, three piers with moored boats, fish racks. The chapter starts here.', [6, 7, 9, 15, 29]),
    P('forest', 'The Forest Road', 'district', -95, -300, 'A quarter mile of dense mixed forest between the harbour and the Outer Wall, the road through it, the river across it.'),
    P('fields', 'Fields before the wall', 'district', -110, -58, 'Open ground between the forest and the Outer Wall.', undefined, true),
    P('merchant', 'Merchant Quarter', 'district', -105, -8, 'Shop streets and the Maze of Alleyways west of the road, between the Outer Wall and the canal.', [3, 5, 12, 17]),
    P('hill', 'Residential Hill', 'district', hx, 82, 'Five stone-walled terraces with stepped lanes, board fences and small houses.', [21, 24, 27]),
    P('samurai', 'Samurai District', 'district', roadX(80), 80, 'Four walled compounds either side of the avenue, behind the Samurai District gate.', [1, 23]),
    P('castle', 'Castle', 'district', roadX(140), 145, 'The masugata and the forecourt under the keep: the finale.', [8, 18, 19, 26, 31]),
    // landmarks
    P('beach', 'Beach landing', 'landmark', s.beach.x, s.beach.z, "Where Haru's warband comes ashore.", [15, 29]),
    P('market', 'Grand Marketplace', 'landmark', s.plaza.x, s.plaza.z, 'The square on the road: stalls, the broker, the first fight inside the wall.', [25]),
    P('watchtower', 'Watchtower and bell', 'landmark', roadX(36) + 6, 36, 'The alarm bell where the road meets the canal.', [14]),
    P('strongbox', "Sōbei's shop (proposed)", 'landmark', s.strongbox.x, s.strongbox.z, "The broker's raided shop: The Broker's Strongbox.", [12], false),
    P('magistrate', "Magistrate Kuroda's compound (proposed)", 'landmark', s.magistrate.yard.x, s.magistrate.yard.z, 'Where the seal for the castle gate is given.'),
    P('temple', 'Hill temple and pagoda', 'landmark', s.hill.temple.x, s.hill.temple.z, 'Hall, bell house and five-storey pagoda on the crown of the hill. The children shelter here.', [4, 10]),
    P('lookout', 'Rooftop lookout', 'landmark', s.hill.lookout.x, s.hill.lookout.z, 'A yagura over the roofs (deck 6 m up). Fire from the Roofs is fought here.', [20]),
    P('oyone', "Oyone's house (proposed)", 'landmark', s.hill.mother.x, s.hill.mother.z, 'The mother of the hidden children, at the foot of the hill lanes.', [27], false),
    P('forecourt', 'Forecourt under the keep', 'landmark', s.forecourt.x, s.forecourt.z, 'The last fight.', [19]),
    ...s.boats.map((b, i) => P(`pier${i}`, `Pier ${i + 1}`, 'landmark', b.pier.x, b.pier.z, 'A burning boat to douse (The Burning Boats).', [16, 28], false)),
    P('roadBridge', 'River bridge', 'landmark', s.river.bridge.x, s.river.bridge.z, 'The road crosses the river halfway through the forest on a timber bridge.'),
    // gates and walls
    P('outerGate', 'Outer Wall gatehouse', 'gate', s.gate.x, s.gate.z, 'The town gate on the forest road (z −36).', [14]),
    P('waterGate', 'Water gate (mizumon)', 'gate', CHANNEL.x, OTSU.wallZ, 'The channel passes under the Outer Wall: a raft or a swim into town that skips the gatehouse.'),
    P('samuraiGate', 'Samurai District gate', 'gate', roadX(OTSU.samuraiGateZ), OTSU.samuraiGateZ, 'Gate across the avenue at z 50.'),
    P('otemon', 'Ōtemon (main castle gate)', 'gate', s.otemon.x, s.otemon.z, "Barred until the magistrate's seal is shown.", [18, 26, 31]),
    // water
    P('canal', 'The canal', 'water', -140, CANAL.z, `Stone banks and arched bridges along z ${CANAL.z}, about 1.35 m deep: swim or raft.`, [2], true),
    P('channel', 'The channel', 'water', CHANNEL.x, -12, 'South from the canal between the merchant streets to the water gate, where it becomes the river.', undefined, true),
    P('river', 'The river', 'water', -62, -150, 'From the water gate it winds south through the forest to the sea: swim it, or raft from the canal to the sea.', undefined, true),
    ...s.bridges.canal.map((x, i) => P(`cbridge${i}`, `Canal bridge ${i + 1}`, 'water', x, CANAL.z, 'Arched bridge over the canal.', undefined, false)),
    ...s.bridges.channel.map((z, i) => P(`hbridge${i}`, `Channel bridge ${i + 1}`, 'water', CHANNEL.x, z, 'Arched plank bridge over the channel.', undefined, false)),
    // landings and rafts
    ...s.landings.canal.map((l, i) => P(`cland${i}`, `Canal landing ${i + 1}`, 'travel', l.p.x, l.p.z, 'Steps down to a stone stage: climb out here.', undefined, false)),
    ...s.landings.channel.map((l, i) => P(`hland${i}`, `Channel landing ${i + 1}`, 'travel', l.p.x, l.p.z, 'Steps down to a stone stage: climb out here.', undefined, false)),
    ...s.rafts.map((r, i) => P(`raft${i}`, `Raft ${i + 1} (start)`, 'travel', r.p.x, r.p.z, ['Tied up at a canal landing.', 'Tied up at a channel landing.', 'Drawn up in the sea west of the harbour.'][i] ?? 'A log raft.', undefined, false)),
  ];
}

/** The parts of the city plan not built yet (docs/era-clash-3d-city-plan.md), listed under the map. */
export const PLANNED = [
  'West shore: the sea-wall promenade with its lanterns, the long piers and the waterfront street (stills 11, 16, 28, 30).',
  'The castle keep on its moated stone base, the ramparts over the harbour (still 8).',
  'Shop interiors you can step into in the merchant streets.',
  'Canal boats moving on the water; the Petals on the Water escort.',
];
