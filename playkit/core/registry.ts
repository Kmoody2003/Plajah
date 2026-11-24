// playkit/core/registry.ts
//
// Extensible Plajah Game Engine Registry.
// Strict platform contract (packages/first-party-games/docs/shared-primitives.md):
// NO `isFirstParty` privilege branches. First-party titles (Rift Realm, Era Clash,
// Ravencrest, Kith Party, Kith Quest, Firstlight, Live Party/Parlor) and third-party
// creator plugins register and extend the engine through the exact same public API.

export type GameDimension = '3d' | '2.5d' | '2d' | 'parlor';

export type GenreTemplateId =
  | 'arena-shooter'
  | 'racer'
  | 'fighter'
  | 'platformer-2d'
  | 'sports-3d'
  | 'adventure'
  | 'parlor-party'
  | 'picture-walk'
  | (string & {});

export interface ParamField {
  key: string;
  label: string;
  kind: 'number' | 'int' | 'bool' | 'string' | 'choice' | 'vec3' | 'color';
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  pro?: boolean;
}

export interface BehaviourDescriptor {
  id: string;
  name: string;
  category: 'movement' | 'combat' | 'ai' | 'vehicle' | 'sports' | 'parlor' | 'environment' | 'custom';
  sentenceTemplate: string;
  params: ParamField[];
  dimensions: GameDimension[];
  /** Pure factory creating runtime state/handlers for one entity instance. */
  create?: (params: Record<string, unknown>) => Record<string, unknown>;
}

export interface PrefabRegistration {
  id: string;
  name: string;
  category: string;
  dimension: GameDimension;
  tags: string[];
  params: ParamField[];
  /** Optional builder function invoked by the 3D/2D runtime when instancing. */
  build?: (params: Record<string, unknown>, context?: unknown) => unknown;
}

export interface GenreTemplateDescriptor {
  id: GenreTemplateId;
  name: string;
  dimension: GameDimension;
  fixedStepHz: 60 | 120;
  defaultBehaviours: string[];
  recommendedInput: Array<'touch' | 'gamepad' | 'keyboard-mouse'>;
  description: string;
}

export interface RenderPassExtension {
  id: string;
  stage: 'pre-opaque' | 'opaque' | 'lighting' | 'transparent' | 'post-process' | 'overlay-2d';
  order: number;
  enabledByDefault: boolean;
  minTier: 'low' | 'medium' | 'high' | 'ultra';
  execute?: (ctx: unknown) => void;
}

export interface ParlorModeDescriptor {
  id: string;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  defaultRounds: number;
  hasSecretState: boolean;
  stagePreset: string;
}

export interface PlaykitPlugin {
  id: string;
  version: string;
  author?: string;
  description?: string;
  /** Runs when the plugin is mounted onto a PlaykitRegistry instance. */
  register(registry: PlaykitRegistry): void;
  /** Optional teardown hook when a creator unloads or hot-reloads a plugin. */
  dispose?(): void;
}

export class PlaykitRegistry {
  private readonly plugins = new Map<string, PlaykitPlugin>();
  private readonly prefabs = new Map<string, PrefabRegistration>();
  private readonly behaviours = new Map<string, BehaviourDescriptor>();
  private readonly templates = new Map<string, GenreTemplateDescriptor>();
  private readonly renderPasses = new Map<string, RenderPassExtension>();
  private readonly parlorModes = new Map<string, ParlorModeDescriptor>();
  private readonly customNamespaces = new Map<string, Map<string, unknown>>();

  constructor(withBuiltInTemplates = true) {
    if (withBuiltInTemplates) {
      this.registerBuiltInTemplates();
    }
  }

  private registerBuiltInTemplates(): void {
    const builtins: GenreTemplateDescriptor[] = [
      {
        id: 'arena-shooter',
        name: '1st/3rd-Person Rhythm & Arena Shooter',
        dimension: '3d',
        fixedStepHz: 60,
        defaultBehaviours: ['capsule-mover', 'rhythm-fire', 'soul-surge', 'wave-spawner'],
        recommendedInput: ['touch', 'gamepad', 'keyboard-mouse'],
        description: 'Shifting arenas, hitscan/projectile combat, beat-synced mechanics, melee finishers.',
      },
      {
        id: 'racer',
        name: 'Arcade & Circuit 3D Racer',
        dimension: '3d',
        fixedStepHz: 60,
        defaultBehaviours: ['raycast-vehicle-4w', 'drift-boost', 'lap-tracker', 'item-pickup'],
        recommendedInput: ['touch', 'gamepad', 'keyboard-mouse'],
        description: '4-wheel suspension vehicles, drift stages, track splines, and shortcuts (Kith Racing / Apex).',
      },
      {
        id: 'fighter',
        name: '2.5D / 3D Action Fighter',
        dimension: '2.5d',
        fixedStepHz: 60,
        defaultBehaviours: ['combo-chain', 'hitstop-feedback', 'parry-guard', 'finisher-window'],
        recommendedInput: ['gamepad', 'touch', 'keyboard-mouse'],
        description: 'Frame-tight combat, hitstop, stances, and expressive character rigs (Era Clash / Kith Kombat).',
      },
      {
        id: 'platformer-2d',
        name: 'Deterministic 2D / 2.5D Side-Scroller',
        dimension: '2d',
        fixedStepHz: 120,
        defaultBehaviours: ['platformer-2d-mover', 'coyote-jump', 'wall-slide', 'lantern-bash'],
        recommendedInput: ['gamepad', 'touch', 'keyboard-mouse'],
        description: '120 Hz fixed-step movement with slopes, coyote time, jump buffer, and air dash (Kith Quest).',
      },
      {
        id: 'sports-3d',
        name: '3D Field & Court Sports',
        dimension: '3d',
        fixedStepHz: 120,
        defaultBehaviours: ['ballistic-spin-projectile', 'route-runner', 'tackle-impulse', 'scoreboard-clock'],
        recommendedInput: ['gamepad', 'touch', 'keyboard-mouse'],
        description: 'Magnus-spin ball trajectories, playbooks, stadium architecture, and crowd instancing (Firstlight / Kith Tennis).',
      },
      {
        id: 'adventure',
        name: '3D Exploration & Atmospheric Adventure',
        dimension: '3d',
        fixedStepHz: 60,
        defaultBehaviours: ['capsule-mover', 'interactive-door', 'dialogue-trigger', 'checkpoint-save'],
        recommendedInput: ['gamepad', 'keyboard-mouse', 'touch'],
        description: 'Enterable CAD/BIM interiors, dynamic weather, baked GI probes, and narrative rules (Ravencrest).',
      },
      {
        id: 'parlor-party',
        name: 'Live Party & Parlor Game Show',
        dimension: 'parlor',
        fixedStepHz: 60,
        defaultBehaviours: ['parlor-phase-machine', 'secret-isolation', 'crowd-leaderboard', 'juice-spring'],
        recommendedInput: ['touch', 'keyboard-mouse', 'gamepad'],
        description: 'Multi-client rooms for Trivia, Crowd Says, Impostor, Sketch Rush, and Evite Play Gates with upgradeable 3D broadcast stages.',
      },
    ];
    for (const tpl of builtins) this.templates.set(tpl.id, tpl);
  }

  registerPlugin(plugin: PlaykitPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Playkit plugin "${plugin.id}" is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
    plugin.register(this);
  }

  unregisterPlugin(id: string): boolean {
    const p = this.plugins.get(id);
    if (!p) return false;
    p.dispose?.();
    this.plugins.delete(id);
    return true;
  }

  listPlugins(): PlaykitPlugin[] {
    return [...this.plugins.values()];
  }

  registerPrefab(def: PrefabRegistration): void {
    this.prefabs.set(def.id, def);
  }
  getPrefab(id: string): PrefabRegistration | undefined {
    return this.prefabs.get(id);
  }
  listPrefabs(filter?: { category?: string; dimension?: GameDimension; tag?: string }): PrefabRegistration[] {
    return [...this.prefabs.values()].filter((p) => {
      if (filter?.category && p.category !== filter.category) return false;
      if (filter?.dimension && p.dimension !== filter.dimension) return false;
      if (filter?.tag && !p.tags.includes(filter.tag)) return false;
      return true;
    });
  }

  registerBehaviour(def: BehaviourDescriptor): void {
    this.behaviours.set(def.id, def);
  }
  getBehaviour(id: string): BehaviourDescriptor | undefined {
    return this.behaviours.get(id);
  }
  listBehaviours(dimension?: GameDimension): BehaviourDescriptor[] {
    const all = [...this.behaviours.values()];
    return dimension ? all.filter((b) => b.dimensions.includes(dimension)) : all;
  }

  registerGenreTemplate(def: GenreTemplateDescriptor): void {
    this.templates.set(def.id, def);
  }
  getGenreTemplate(id: GenreTemplateId): GenreTemplateDescriptor | undefined {
    return this.templates.get(id);
  }
  listGenreTemplates(): GenreTemplateDescriptor[] {
    return [...this.templates.values()];
  }

  registerRenderPass(pass: RenderPassExtension): void {
    this.renderPasses.set(pass.id, pass);
  }
  listRenderPasses(stage?: RenderPassExtension['stage']): RenderPassExtension[] {
    const all = [...this.renderPasses.values()].sort((a, b) => a.order - b.order);
    return stage ? all.filter((p) => p.stage === stage) : all;
  }

  registerParlorMode(mode: ParlorModeDescriptor): void {
    this.parlorModes.set(mode.id, mode);
  }
  getParlorMode(id: string): ParlorModeDescriptor | undefined {
    return this.parlorModes.get(id);
  }
  listParlorModes(): ParlorModeDescriptor[] {
    return [...this.parlorModes.values()];
  }

  /** Generic creator extension namespace (e.g., custom shaders, AI planners, dialogue verbs). */
  registerExtension<T>(namespace: string, id: string, value: T): void {
    let ns = this.customNamespaces.get(namespace);
    if (!ns) {
      ns = new Map<string, unknown>();
      this.customNamespaces.set(namespace, ns);
    }
    ns.set(id, value);
  }

  getExtension<T>(namespace: string, id: string): T | undefined {
    return this.customNamespaces.get(namespace)?.get(id) as T | undefined;
  }

  listExtensions<T>(namespace: string): Array<{ id: string; value: T }> {
    const ns = this.customNamespaces.get(namespace);
    if (!ns) return [];
    return [...ns.entries()].map(([id, value]) => ({ id, value: value as T }));
  }
}
