// Game Project: the one document every Plajah game is made from (docs/game-studio-unified-plan.md §3).
// First-party games and creator games use the same file. Everything is objects with parameters, never
// a baked mesh, so whatever Aria or a template made stays editable by hand.
//
// Phase 0 shape: a level points at a level module (the game's own builder, e.g. Rift Realm's Shrine
// Arena) and holds the author's gameplay data on top of it: markers, zones, look, rules. A marker kind
// the project leaves empty falls back to the module's defaults; once the author has any marker of a
// kind, the project's list is the truth for that kind. Later phases add instances, terrain and splines
// so the module itself becomes hand-editable pieces.

export const GAME_PROJECT_KIND = 'plajah.game';
export const GAME_PROJECT_VERSION = 1;

export type Vec3 = [number, number, number];

/** Genre templates (plan §5.2). Each one bundles behaviours, rules, a camera and a HUD. */
export type TemplateId = 'arena-shooter' | 'racer' | 'fighter' | 'platformer' | 'adventure' | 'picture-walk' | 'party';

export type MarkerKind = 'spawn' | 'enemySpot' | 'controlPoint' | 'pickup' | 'camera';
export const MARKER_KINDS: MarkerKind[] = ['spawn', 'enemySpot', 'controlPoint', 'pickup', 'camera'];

export interface Marker {
  id: string;
  kind: MarkerKind;
  name?: string;
  /** Spawns: which side starts here. */
  team?: 'a' | 'b';
  pos: Vec3;
  /** Facing, radians, around +Y. */
  yaw?: number;
  /** Control points and pickups: capture/collect radius in metres. */
  radius?: number;
}

export type ZoneKind = 'hazardBelow' | 'trigger';
export interface Zone {
  id: string;
  kind: ZoneKind;
  name?: string;
  /** hazardBelow: falling under this height hurts. */
  y?: number;
  /** trigger: an axis-aligned box. */
  box?: { center: Vec3; size: Vec3 };
}

/** A placed prefab (prop kit piece, Plajah 3D model). Phase 1 makes these editable in the World room. */
export interface Instance {
  id: string;
  prefab: string;
  pos: Vec3;
  /** Euler degrees, XYZ. */
  rot: Vec3;
  scale: Vec3;
  params?: Record<string, ParamValue>;
}

export interface Look {
  /** Tone-mapping exposure. */
  exposure?: number;
  /** Camera far plane in metres. */
  far?: number;
  /** Named mood preset (plan §4 Look room). */
  preset?: string;
}

export type ParamValue = number | string | boolean | Vec3;

// ── Rules: game logic as data, shown as sentences (plan §5.1). Phase 2 runs them; Phase 0 fixes the shape. ──
export interface RuleWhen { event: string; [k: string]: ParamValue | undefined }
export interface RuleCond { var: string; op: '==' | '!=' | '<' | '<=' | '>' | '>='; value: ParamValue }
export interface RuleAction { action: string; [k: string]: ParamValue | undefined }
export interface Rule { id: string; enabled: boolean; when: RuleWhen; if: RuleCond[]; do: RuleAction[] }

export interface LevelModule {
  /** Registered module id, `<game>.<level>`, e.g. `rift-realm.shrine`. */
  id: string;
  params: Record<string, ParamValue>;
}

export interface GameLevel {
  id: string;
  name: string;
  module: LevelModule;
  markers: Marker[];
  zones: Zone[];
  instances: Instance[];
  look: Look;
  rules: Rule[];
}

export interface AssetRef {
  id: string;
  kind: 'texture' | 'model' | 'audio' | 'material' | 'motion';
  url: string;
  /** Rights: licence id (CC0, CC-BY-4.0, owner) and where it came from. */
  license?: string;
  source?: string;
}

export interface GameProject {
  kind: typeof GAME_PROJECT_KIND;
  version: typeof GAME_PROJECT_VERSION;
  id: string;
  name: string;
  template: TemplateId;
  /** Which playkit runtime plays it. Phase 0: an existing game shell. */
  runtime: { game: string };
  startLevel: string;
  levels: GameLevel[];
  assets: AssetRef[];
  /** Project-wide rules (per-level rules live on the level). */
  rules: Rule[];
  createdAt: number;
  updatedAt: number;
}

/** What a running game reports about a level module's own defaults (before project overrides). */
export interface LevelDefaults {
  module: string;
  name: string;
  markers: Marker[];
  zones: Zone[];
  look: Look;
}

export function emptyLevel(id: string, name: string, moduleId: string): GameLevel {
  return { id, name, module: { id: moduleId, params: {} }, markers: [], zones: [], instances: [], look: {}, rules: [] };
}

/** Markers that take effect for a kind: the project's if it has any of that kind, else the module's. */
export function effectiveMarkers(level: GameLevel, defaults?: LevelDefaults | null): Marker[] {
  const out: Marker[] = [];
  for (const kind of MARKER_KINDS) {
    const own = level.markers.filter(m => m.kind === kind);
    out.push(...(own.length ? own : (defaults?.markers ?? []).filter(m => m.kind === kind)));
  }
  return out;
}

/** True when the project, not the module, decides this marker kind. */
export const ownsKind = (level: GameLevel, kind: MarkerKind) => level.markers.some(m => m.kind === kind);

export function effectiveZones(level: GameLevel, defaults?: LevelDefaults | null): Zone[] {
  const kinds = new Set(level.zones.map(z => z.kind));
  return [...level.zones, ...(defaults?.zones ?? []).filter(z => !kinds.has(z.kind))];
}

export const effectiveLook = (level: GameLevel, defaults?: LevelDefaults | null): Look => ({ ...(defaults?.look ?? {}), ...level.look });
