// Rift Realm level modules + the Game Project adapter (docs/game-studio-unified-plan.md Phase 0).
//
// A level module is the game's own builder for an arena plus what it needs before it builds (texture
// sets) and its default look. The Studio's World view and (once hooked) the game's boot both read this
// table, so there's one list of levels instead of an if-chain per page.
//
// exportDefaults() turns what a builder placed into Game Project markers/zones/look (sent to the Studio
// so it can show and take them over). applyProjectLevel() writes a project level's overrides back onto
// the built Level before the game starts, so a hand edit in the Studio changes where the game spawns you.

import * as THREE from 'three/webgpu';
import { buildShrine, type Level, type Tier } from '../shrine';
import { buildGlacial } from '../glacial';
import { buildVolcanic } from '../volcanic';
import { buildMarsh } from '../marsh';
import { buildCelestial } from '../celestial';
import { buildElderwood } from '../elderwood';
import { buildSanctum } from '../sanctum';
import { preloadWildsTerrain } from '../world/terrain';
import type { GameLevel, LevelDefaults, Look, Marker, Zone } from '../../../../services/gamestudio/schema';
import { effectiveLook, effectiveMarkers, effectiveZones } from '../../../../services/gamestudio/schema';
import { buildInstances } from './prefabs';

export interface LevelModule {
  id: string;
  /** ?level= value */
  param: string;
  build: (scene: THREE.Scene, tier: Tier) => Level;
  sets: string[];
  /** Async work before build() (baked terrain layers…). */
  preload?: () => Promise<void>;
  look: Required<Pick<Look, 'exposure' | 'far'>>;
}

export const LEVEL_MODULES: LevelModule[] = [
  // Level 1: Elderwood Hollow (the Cyber Forest, laid out from the CF-24 tactical map) is the default level
  { id: 'rift-realm.elderwood', param: 'elderwood', build: buildElderwood, preload: () => preloadWildsTerrain(), sets: ['marsh-wood', 'glacial-brick', 'volc-rock'], look: { exposure: 1.1, far: 320 } },
  { id: 'rift-realm.shrine', param: 'shrine', build: buildShrine, sets: ['volc-basalt', 'glacial-brick', 'marsh-mud', 'volc-steel'], look: { exposure: 1.15, far: 260 } },
  { id: 'rift-realm.glacial', param: 'glacial', build: buildGlacial, sets: ['glacial-ground', 'glacial-brick', 'celestial-obsidian', 'glacial-ice', 'volc-steel'], look: { exposure: 0.78, far: 700 } },
  { id: 'rift-realm.volcanic', param: 'volcanic', build: buildVolcanic, sets: ['volc-basalt', 'volc-rock', 'volc-ash', 'volc-steel', 'volc-lava'], look: { exposure: 1.25, far: 900 } },
  { id: 'rift-realm.marsh', param: 'marsh', build: buildMarsh, sets: ['marsh-mud', 'marsh-wood', 'marsh-water', 'glacial-brick'], look: { exposure: 1.1, far: 500 } },
  { id: 'rift-realm.celestial', param: 'celestial', build: buildCelestial, sets: ['celestial-marble', 'celestial-obsidian', 'glacial-brick'], look: { exposure: 1.0, far: 900 } },
  // the Void Sanctum Arena: the tournament hub (map portals + the Trials)
  { id: 'rift-realm.sanctum', param: 'sanctum', build: buildSanctum, sets: ['celestial-obsidian'], look: { exposure: 1.05, far: 600 } },
];

export const moduleByParam = (param: string | null | undefined) => LEVEL_MODULES.find(m => m.param === param) ?? LEVEL_MODULES[0];

const v3 = (v: THREE.Vector3): [number, number, number] => [round(v.x), round(v.y), round(v.z)];
const round = (n: number) => Math.round(n * 1000) / 1000;

/** What the builder placed, as project data. Ids are stable so a take-over keeps matching the module. */
export function exportDefaults(mod: LevelModule, level: Level): LevelDefaults {
  const markers: Marker[] = [
    { id: 'spawn-a', kind: 'spawn', team: 'a', pos: v3(level.spawns.a.pos), yaw: round(level.spawns.a.yaw) },
    { id: 'spawn-b', kind: 'spawn', team: 'b', pos: v3(level.spawns.b.pos), yaw: round(level.spawns.b.yaw) },
    ...level.enemySpots.map((p, i): Marker => ({ id: `enemy-${i}`, kind: 'enemySpot', pos: v3(p) })),
    ...(level.controlPoints ?? []).map((c): Marker => ({ id: `cp-${c.id}`, kind: 'controlPoint', name: c.name, pos: v3(c.pos), radius: c.radius })),
  ];
  const zones: Zone[] = level.hazardBelow !== undefined ? [{ id: 'hazard', kind: 'hazardBelow', name: 'Hazard floor', y: round(level.hazardBelow) }] : [];
  return { module: mod.id, name: level.info.name, markers, zones, look: { ...mod.look } };
}

/**
 * Write a project level onto a built Level (spawns, enemy spots, control points, hazard height) and
 * return the look to use. Marker kinds the project doesn't own keep the builder's values.
 */
export function applyProjectLevel(mod: LevelModule, level: Level, project: GameLevel): Required<Pick<Look, 'exposure' | 'far'>> {
  const defaults = exportDefaults(mod, level);
  const markers = effectiveMarkers(project, defaults);
  const vec = (p: [number, number, number]) => new THREE.Vector3(p[0], p[1], p[2]);
  const spawns = markers.filter(m => m.kind === 'spawn');
  const a = spawns.find(m => m.team !== 'b');
  const b = spawns.find(m => m.team === 'b');
  if (a) level.spawns.a = { pos: vec(a.pos), yaw: a.yaw ?? 0 };
  if (b) level.spawns.b = { pos: vec(b.pos), yaw: b.yaw ?? 0 };
  const enemies = markers.filter(m => m.kind === 'enemySpot');
  level.enemySpots.length = 0;
  for (const m of enemies) level.enemySpots.push(vec(m.pos));
  const cps = markers.filter(m => m.kind === 'controlPoint');
  level.controlPoints = cps.length ? cps.map(m => ({ id: m.id.replace(/^cp-/, ''), name: m.name ?? m.id, pos: vec(m.pos), radius: m.radius ?? 4 })) : undefined;
  const hazard = effectiveZones(project, defaults).find(z => z.kind === 'hazardBelow');
  level.hazardBelow = hazard?.y;
  // placed props join the level group before the game builds collision from it
  buildInstances(level.group, project.instances);
  const look = effectiveLook(project, defaults);
  return { exposure: look.exposure ?? mod.look.exposure, far: look.far ?? mod.look.far };
}
