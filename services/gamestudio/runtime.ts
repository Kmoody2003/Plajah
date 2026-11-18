// Runtimes the Studio can open, the message protocol between the Studio and a running game, and the
// starter projects. Phase 0 runtime: Rift Realm (the pilot, plan §7). As playkit grows, other games and
// creator templates register here the same way.

import { emptyLevel, GAME_PROJECT_KIND, GAME_PROJECT_VERSION, type GameLevel, type GameProject, type LevelDefaults, type Marker, type MarkerKind, type TemplateId } from './schema';
import type { Op } from './ops';

export interface RuntimeLevel { module: string; /** what the game's ?level= expects */ param: string; name: string }
export interface Runtime {
  id: string;
  name: string;
  template: TemplateId;
  levels: RuntimeLevel[];
  /** Dev server origin (the game's own vite) and the shipped path under /public. */
  devOrigin: string;
  prodBase: string;
  /** World view (edit) page and the game itself. */
  studioPage: string;
  playPage: string;
}

export const RUNTIMES: Record<string, Runtime> = {
  'rift-realm': {
    id: 'rift-realm',
    name: 'Rift Realm',
    template: 'arena-shooter',
    levels: [
      { module: 'rift-realm.shrine', param: 'shrine', name: 'Cyber-Forest Shrine' },
      { module: 'rift-realm.glacial', param: 'glacial', name: 'Glacial Citadel' },
      { module: 'rift-realm.volcanic', param: 'volcanic', name: 'Obsidian Volcanic Compound' },
      { module: 'rift-realm.marsh', param: 'marsh', name: 'Sunken Marshland Village' },
      { module: 'rift-realm.celestial', param: 'celestial', name: 'Celestial Void Citadel' },
    ],
    devOrigin: 'http://localhost:4332',
    prodBase: '/games/rift-realm/play/',
    studioPage: 'studio.html',
    playPage: 'index.html',
  },
};

export const runtimeLevel = (rt: Runtime, moduleId: string) => rt.levels.find(l => l.module === moduleId);

/** URL of a runtime page; `origin` overrides where the game is served (dev server, lab). */
export function runtimeUrl(rt: Runtime, page: 'studio' | 'play', level: RuntimeLevel, opts: { dev?: boolean; origin?: string } = {}): string {
  const base = opts.origin ? opts.origin.replace(/\/$/, '') + '/' : opts.dev ? rt.devOrigin + '/' : rt.prodBase;
  const file = page === 'studio' ? rt.studioPage : rt.playPage;
  return `${base}${file}?level=${encodeURIComponent(level.param)}&studio=1`;
}

let seq = 0;
const uid = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function newProjectFor(runtimeId: string, name?: string, now = Date.now()): GameProject {
  const rt = RUNTIMES[runtimeId];
  if (!rt) throw new Error(`No runtime "${runtimeId}".`);
  const levels: GameLevel[] = rt.levels.map(l => emptyLevel(l.param, l.name, l.module));
  return {
    kind: GAME_PROJECT_KIND, version: GAME_PROJECT_VERSION, id: uid('game'), name: name ?? rt.name,
    template: rt.template, runtime: { game: rt.id }, startLevel: levels[0].id, levels, assets: [], rules: [],
    createdAt: now, updatedAt: now,
  };
}

/** A project opened after its game gained levels gets the new ones appended (empty, so nothing changes in play). */
export function withRuntimeLevels(p: GameProject): GameProject {
  const rt = RUNTIMES[p.runtime.game];
  if (!rt) return p;
  const have = new Set(p.levels.map(l => l.module.id));
  const ids = new Set(p.levels.map(l => l.id));
  const add = rt.levels.filter(l => !have.has(l.module)).map(l => emptyLevel(ids.has(l.param) ? `${l.param}-${p.levels.length}` : l.param, l.name, l.module));
  return add.length ? { ...p, levels: [...p.levels, ...add] } : p;
}

/**
 * The op that makes the project own a marker kind, copying the level module's current markers of that
 * kind. The Studio sends it the first time the author edits a marker the module placed, so the edit has
 * a home and every other marker of that kind stays where it was.
 */
export function takeOverOp(level: GameLevel, defaults: LevelDefaults | null | undefined, kind: MarkerKind): Op | null {
  if (level.markers.some(m => m.kind === kind)) return null;
  const from = (defaults?.markers ?? []).filter(m => m.kind === kind);
  if (!from.length) return null;
  return { op: 'setMarkersOfKind', levelId: level.id, kind, markers: from.map(m => ({ ...m, pos: [...m.pos] as Marker['pos'] })) };
}

// ── Studio ⇄ game messages (window.postMessage; the game runs in an iframe) ──

export const STUDIO_SOURCE = 'plajah-studio';
export const GAME_SOURCE = 'plajah-studio-game';

/** Ids are unique across a level's markers and instances, so one `id` field selects either. */
export type StudioToGame =
  | { source: typeof STUDIO_SOURCE; type: 'level'; level: GameLevel }
  | { source: typeof STUDIO_SOURCE; type: 'select'; id: string | null }
  | { source: typeof STUDIO_SOURCE; type: 'frame'; id: string }
  /** Next click in the view drops this prefab (null cancels). */
  | { source: typeof STUDIO_SOURCE; type: 'arm'; prefab: string | null }
  /** Transform handle mode for the selected instance. */
  | { source: typeof STUDIO_SOURCE; type: 'tool'; tool: 'move' | 'turn' };

export type GameToStudio =
  | { source: typeof GAME_SOURCE; type: 'ready'; defaults: LevelDefaults }
  | { source: typeof GAME_SOURCE; type: 'select'; id: string | null }
  | { source: typeof GAME_SOURCE; type: 'move'; markerId: string; pos: [number, number, number] }
  | { source: typeof GAME_SOURCE; type: 'placed'; prefab: string; pos: [number, number, number] }
  /** A drag of the transform handle: position and yaw (degrees). `done` marks the release. */
  | { source: typeof GAME_SOURCE; type: 'transform'; instanceId: string; pos: [number, number, number]; yaw: number; done: boolean }
  | { source: typeof GAME_SOURCE; type: 'stats'; frameMs: number; draws: number; triangles: number };

export function isGameMessage(data: unknown): data is GameToStudio {
  return !!data && typeof data === 'object' && (data as any).source === GAME_SOURCE && typeof (data as any).type === 'string';
}
export function isStudioMessage(data: unknown): data is StudioToGame {
  return !!data && typeof data === 'object' && (data as any).source === STUDIO_SOURCE && typeof (data as any).type === 'string';
}
