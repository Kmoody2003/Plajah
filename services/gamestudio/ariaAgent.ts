// services/gamestudio/ariaAgent.ts
//
// Aria Studio Production Agent — the unified creator-extensible orchestrator skill
// connecting Plajah's 3D/2D/Parlor pipelines, CAD/BIM architecture knowledge,
// Vegetation library, Argilla organics, Ray-Traced Studio Light Baker, and Canon QA Gates.
//
// Every production run:
//   1) Classifies the brief/image semantically (never falls back to flat projected boxes)
//   2) Dispatches to the matching specialized pipeline or creator-registered Aria Skill
//   3) Compiles LODs, PBR material substitutions, physics colliders/joints, and GI probes
//   4) Enforces Ravencrest Canon budgets & playability QA (e.g. door walkability, colliders)
//   5) Registers the resulting prefab into PlaykitRegistry AND emits undoable GameProject Ops!

import type { QualityTier } from '../../playkit/core/engine';
import { PlaykitRegistry, type GameDimension } from '../../playkit/core/registry';
import { STAGE_VISUAL_PRESETS } from '../../playkit/render/pipeline';
import type { Op } from './ops';
import type { Vec3 } from './schema';
import {
  PREFAB_MANIFEST_KIND,
  PREFAB_MANIFEST_VERSION,
  validatePrefabBudget,
  type AssetPipelineKind,
  type CompiledPrefabManifest,
  type IndexedTriMesh,
  type PrefabBudgetReport,
} from './compiler/schema';
import type { CadModel } from '../cad/model';
import type { TreeSpecies } from '../vegetation/species';
import type { TreeSkeleton } from '../vegetation/trees/grow';
import { bakeIrradianceProbes, type BakedIrradianceProbe, type ParallaxReflectionBox } from './compiler/lightBaker';
import { compileOrganicAsset, STANDARD_PROP_CLASSES } from './pipelines/organicPipeline';
import { compileVegetationSpecies, VEGETATION_SPECIES_CATALOG } from './pipelines/vegetationPipeline';
import {
  compileBuildingWithInteriors,
  compileHardSurfaceAssembly,
  type ArchitectureStyle,
  type BuildingProgram,
  type HardSurfaceBrief,
} from './pipelines/architecturePipeline';
import { polyMeshToIndexedTriMesh, subdivideCatmullClark } from '../argilla/poly/subd';

export interface AriaProductionBrief {
  prompt: string;
  id?: string;
  name?: string;
  /** Optional explicit pipeline override; otherwise Aria classifies semantically. */
  pipelineHint?: AssetPipelineKind;
  targetTier?: QualityTier;
  targetLevelId?: string;
  placeAt?: Vec3;
  authorUid?: string;
  /** Optional structured params from an image-understanding pass or creator UI form. */
  params?: Record<string, unknown>;
}

export interface AriaQaReport {
  pass: boolean;
  budget: PrefabBudgetReport;
  impliedGeometryVerified: boolean;
  walkabilityPass: boolean;
  notes: string[];
}

export interface AriaProductionResult {
  pipeline: AssetPipelineKind;
  manifest: CompiledPrefabManifest;
  qa: AriaQaReport;
  probes: BakedIrradianceProbe[];
  reflectionBoxes: ParallaxReflectionBox[];
  /** Compiled LOD0 geometry for live 3D WebGPU Studio preview & runtime instancing. */
  previewMesh?: IndexedTriMesh;
  /** Real IFC-tagged BIM 3D model when produced by the Architecture or Parlor Stage pipeline. */
  bim3d?: CadModel;
  /** Real space-colonized TreeSkeleton + TreeSpecies from `services/vegetation/` for live 3D rendering. */
  treeSkeleton?: TreeSkeleton;
  treeSpecies?: TreeSpecies;
  /** Undoable Game Studio batch op placing the compiled prefab (if targetLevelId provided). */
  projectOp: Op | null;
  summarySentence: string;
}

export interface AriaSkillHandler {
  id: string;
  pipeline: AssetPipelineKind;
  description: string;
  execute(brief: AriaProductionBrief, agent: AriaStudioAgent): AriaProductionResult;
}

/** Semantic classifier routing prompts & image concepts to the right specialized pipeline. */
export function classifyProductionBrief(brief: AriaProductionBrief): AssetPipelineKind {
  if (brief.pipelineHint) return brief.pipelineHint;
  const text = brief.prompt.toLowerCase();

  if (/\b(parlor|trivia|impostor|crowd says|sketch rush|game show|broadcast stage|evite)\b/.test(text)) {
    return 'parlor-stage';
  }
  if (/\b(2d sprite|pixel art|side-scroller|kith quest|tilemap|platformer sprite)\b/.test(text)) {
    return '2d-sprite';
  }
  if (/\b(tree|oak|pine|spruce|cypress|willow|birch|maple|palm|olive|forest|foliage|bush|grove|vegetation)\b/.test(text)) {
    return 'vegetation';
  }
  if (/\b(building|tavern|cathedral|house|cottage|castle|bunker|workshop|stadium|concourse|hall|interior|room|temple|citadel|shrine|tower|facade|ruin|ruins|keep|fortress|palace|manor)\b/.test(text)) {
    return 'architecture';
  }
  if (/\b(car|kart|vehicle|truck|machine|engine|furniture|chair|table|chest|door|tool|weapon|rifle|lance|katana|racket|helmet)\b/.test(text)) {
    return 'hard-surface';
  }
  return 'organic';
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'asset';
}

export class AriaStudioAgent {
  readonly registry: PlaykitRegistry;
  private readonly skills = new Map<string, AriaSkillHandler>();
  private seq = 0;

  constructor(registry = new PlaykitRegistry()) {
    this.registry = registry;
    this.registerDefaultSkills();
  }

  /** Creators and first-party teams register new Aria skills through this exact API. */
  registerSkill(skill: AriaSkillHandler): void {
    this.skills.set(skill.id, skill);
  }

  listSkills(): AriaSkillHandler[] {
    return [...this.skills.values()];
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  private registerDefaultSkills(): void {
    this.registerSkill({
      id: 'aria.skill.organic',
      pipeline: 'organic',
      description: 'Builds rigged organic characters/creatures with muscle morphs, cloth, hair, and Prop Classes.',
      execute: (brief) => {
        const text = brief.prompt.toLowerCase();
        const id = brief.id ?? slugify(brief.name ?? brief.prompt);
        const archetype =
          /angel|wing|seraph|dragon/.test(text) ? 'winged' :
          /wolf|panther|hound|beast|quadruped/.test(text) ? 'quadruped' :
          /robot|automaton|golem|construct|vessel/.test(text) ? 'construct-hybrid' : 'humanoid';
        const build =
          /giant|heavy|golem|paladin|lineman/.test(text) ? 'heavy' :
          /monster|hydra|troll/.test(text) ? 'monstrous' :
          /assassin|stalker|agile|slender/.test(text) ? 'slender' : 'athletic';

        const pkg = compileOrganicAsset({
          id,
          name: brief.name ?? brief.prompt.slice(0, 48),
          archetype,
          heightM: Number(brief.params?.heightM ?? (build === 'monstrous' ? 2.6 : 1.85)),
          build,
          skinMaterial: archetype === 'construct-hybrid' ? 'brushed-steel' : 'skin',
          garmentMaterial: /cloak|robe|jersey|armor|coat/.test(text) ? 'linen' : undefined,
          hairStyle: archetype === 'construct-hybrid' ? 'none' : 'long-flow',
          defaultProps: /football|quarterback|firstlight/.test(text)
            ? [STANDARD_PROP_CLASSES.firstlight_helmet, STANDARD_PROP_CLASSES.firstlight_football]
            : /tennis|kith/.test(text)
              ? [STANDARD_PROP_CLASSES.kith_racket]
              : [STANDARD_PROP_CLASSES.halo_lance],
          authorUid: brief.authorUid,
        });

        const budget = validatePrefabBudget(pkg.manifest, brief.targetTier ?? 'medium');
        const h = Number(brief.params?.heightM ?? (build === 'monstrous' ? 2.6 : 1.85));
        const hw = build === 'heavy' ? 0.32 : build === 'monstrous' ? 0.36 : 0.24;
        const previewMesh = polyMeshToIndexedTriMesh(subdivideCatmullClark({
          verts: [
            [-hw * 0.75, 0, -hw * 0.5], [hw * 0.75, 0, -hw * 0.5], [hw * 0.75, 0, hw * 0.5], [-hw * 0.75, 0, hw * 0.5],
            [-hw, h * 0.52, -hw * 0.6], [hw, h * 0.52, -hw * 0.6], [hw, h * 0.52, hw * 0.6], [-hw, h * 0.52, hw * 0.6],
            [-hw * 0.75, h, -hw * 0.5], [hw * 0.75, h, -hw * 0.5], [hw * 0.75, h, hw * 0.5], [-hw * 0.75, h, hw * 0.5],
          ],
          faces: [
            [0, 3, 2, 1], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
            [4, 5, 9, 8], [5, 6, 10, 9], [6, 7, 11, 10], [7, 4, 8, 11], [8, 9, 10, 11],
          ],
        }, 2).mesh);
        return this.finalizeResult('organic', pkg.manifest, budget, true, [], [], brief, [
          `Muscle morph drivers: ${pkg.simProfile.muscleRules.length}, cloth solver: ${pkg.garmentSpec.solver}, prop sockets: ${pkg.manifest.sockets.length}.`,
        ], previewMesh);
      },
    });

    this.registerSkill({
      id: 'aria.skill.vegetation',
      pipeline: 'vegetation',
      description: 'Generates multi-biome realistic trees with crown normal-transfer, wind vertex weights, and impostor LODs.',
      execute: (brief) => {
        const text = brief.prompt.toLowerCase();
        const matched = Object.keys(VEGETATION_SPECIES_CATALOG).find((k) =>
          text.includes(k.split('-').pop()!) || text.includes(VEGETATION_SPECIES_CATALOG[k].biome.split('-')[0]),
        ) ?? 'fable-ancient-oak';
        const pkg = compileVegetationSpecies(matched, Number(brief.params?.seed ?? 7));
        const budget = validatePrefabBudget(pkg.manifest, brief.targetTier ?? 'medium');
        return this.finalizeResult('vegetation', pkg.manifest, budget, true, [], [], brief, [
          `Species: ${pkg.species.name} (${pkg.biome}), grown via real space-colonization (${pkg.skeleton.nodes.length} branch nodes, ${pkg.skeleton.leaves.length} leaf clusters), octahedral impostor at ${pkg.impostorSpec.switchDistanceM} m.`,
        ], pkg.lod0Mesh, undefined, pkg.skeleton, pkg.species);
      },
    });

    this.registerSkill({
      id: 'aria.skill.architecture',
      pipeline: 'architecture',
      description: 'Builds CAD/BIM architecture WITH walkable multi-room interiors, furniture sockets, and baked room GI/reflection probes.',
      execute: (brief) => {
        const text = brief.prompt.toLowerCase();
        const id = brief.id ?? slugify(brief.name ?? brief.prompt);
        const program: BuildingProgram =
          /tavern|inn|pub/.test(text) ? 'tavern' :
          /cathedral|chapel|church|temple|shrine/.test(text) ? 'cathedral' :
          /stadium|concourse|suite/.test(text) ? 'stadium-suite' :
          /workshop|forge|smithy/.test(text) ? 'workshop' :
          /bunker|compound|fort/.test(text) ? 'bunker' : 'cottage';
        const style: ArchitectureStyle =
          /cyber|citadel|neon|sci/.test(text) ? 'cyber-citadel' :
          /stadium|modern|arena/.test(text) ? 'modern-arena' :
          /gothic|stone|cathedral|ruin/.test(text) ? 'gothic-stone' : 'fable-timber';

        const pkg = compileBuildingWithInteriors({
          id,
          name: brief.name ?? brief.prompt.slice(0, 48),
          program,
          style,
          footprintWidthM: Number(brief.params?.widthM ?? 12),
          footprintDepthM: Number(brief.params?.depthM ?? 10),
          stories: Number(brief.params?.stories ?? 2),
          authorUid: brief.authorUid,
        });

        // Bake interior SH9 irradiance probes inside every generated room!
        const firstMesh = pkg.bim3d.meshes[0];
        const baked = bakeIrradianceProbes({
          sceneMesh: firstMesh
            ? { positions: firstMesh.positions, indices: firstMesh.indices }
            : { positions: new Float32Array(0), indices: new Uint32Array(0) },
          probePositions: pkg.rooms.map((r) => ({
            id: `probe_${r.id}`,
            roomId: r.id,
            position: [
              (r.boundsMin[0] + r.boundsMax[0]) * 0.5,
              (r.boundsMin[1] + r.boundsMax[1]) * 0.5,
              (r.boundsMin[2] + r.boundsMax[2]) * 0.5,
            ],
          })),
          lights: [{ kind: 'directional', vec: [0.4, 0.85, 0.3], color: [1, 0.92, 0.8], intensity: 2.0 }],
          raysPerProbe: 24,
        });

        const budget = validatePrefabBudget(pkg.manifest, brief.targetTier ?? 'medium');
        return this.finalizeResult('architecture', pkg.manifest, budget, pkg.walkabilityPass, baked.probes, pkg.reflectionBoxes, brief, [
          `BIM interiors: ${pkg.rooms.length} rooms, ${pkg.bim3d.elements.length} IFC elements, ${baked.probes.length} SH9 GI probes, ${pkg.reflectionBoxes.length} box reflection probes.`,
        ], undefined, pkg.bim3d);
      },
    });

    this.registerSkill({
      id: 'aria.skill.hard_surface',
      pipeline: 'hard-surface',
      description: 'Builds NURBS-tessellated vehicles, machines, tools, and furniture with physics joint assemblies.',
      execute: (brief) => {
        const text = brief.prompt.toLowerCase();
        const id = brief.id ?? slugify(brief.name ?? brief.prompt);
        const kind: HardSurfaceBrief['kind'] =
          /car|kart|vehicle|truck/.test(text) ? 'vehicle' :
          /chair|table|chest|desk|cabinet|furniture/.test(text) ? 'furniture' :
          /machine|engine|turret|generator/.test(text) ? 'machine' : 'tool';

        const pkg = compileHardSurfaceAssembly({
          id,
          name: brief.name ?? brief.prompt.slice(0, 48),
          kind,
          material: kind === 'furniture' ? 'wood' : 'brushed-steel',
          accentMaterial: 'forged-gold',
          dimensionsM: kind === 'vehicle' ? [2.1, 1.4, 4.4] : [1.2, 1.1, 1.2],
          authorUid: brief.authorUid,
        });
        const budget = validatePrefabBudget(pkg.manifest, brief.targetTier ?? 'medium');
        return this.finalizeResult('hard-surface', pkg.manifest, budget, true, [], [], brief, [
          `Articulated ${kind} with ${pkg.subAssemblies.length} sub-assemblies and ${pkg.manifest.physics.joints?.length ?? 0} physics joints.`,
        ], pkg.mesh);
      },
    });

    this.registerSkill({
      id: 'aria.skill.parlor_stage',
      pipeline: 'parlor-stage',
      description: 'Generates a 3D animated broadcast or tavern stage upgrade for Plajah Party & Parlor games.',
      execute: (brief) => {
        const text = brief.prompt.toLowerCase();
        const preset = /tavern|fable|fantasy/.test(text)
          ? STAGE_VISUAL_PRESETS['parlor-fable-tavern-3d']
          : STAGE_VISUAL_PRESETS['parlor-broadcast-studio-3d'];
        const bldg = compileBuildingWithInteriors({
          id: brief.id ?? slugify(brief.name ?? 'parlor_stage'),
          name: brief.name ?? `${preset.name} Venue`,
          program: /tavern|fable/.test(text) ? 'tavern' : 'stadium-suite',
          style: /tavern|fable/.test(text) ? 'fable-timber' : 'modern-arena',
          footprintWidthM: 14,
          footprintDepthM: 12,
          stories: 1,
          authorUid: brief.authorUid,
        });
        const manifest: CompiledPrefabManifest = {
          ...bldg.manifest,
          pipeline: 'parlor-stage',
          id: `prefab.parlor.${slugify(brief.id ?? preset.id)}`,
        };
        const budget = validatePrefabBudget(manifest, brief.targetTier ?? 'medium');
        return this.finalizeResult('parlor-stage', manifest, budget, bldg.walkabilityPass, [], bldg.reflectionBoxes, brief, [
          `Parlor 3D stage "${preset.name}" ready for Trivia, Crowd Says, Impostor Night & Sketch Rush with ${bldg.rooms.length} lit room zones.`,
        ], undefined, bldg.bim3d);
      },
    });

    this.registerSkill({
      id: 'aria.skill.2d_sprite',
      pipeline: '2d-sprite',
      description: 'Compiles 2D sprite & tile assets for Kith Quest, Evite Play Gates, and 2D creator games.',
      execute: (brief) => {
        const id = brief.id ?? slugify(brief.name ?? brief.prompt);
        const manifest: CompiledPrefabManifest = {
          kind: PREFAB_MANIFEST_KIND,
          version: PREFAB_MANIFEST_VERSION,
          id: `prefab.sprite2d.${id}`,
          name: brief.name ?? brief.prompt.slice(0, 48),
          pipeline: '2d-sprite',
          refs: { authorUid: brief.authorUid, license: 'plajah-creator' },
          boundsMeters: { min: [-0.5, 0, 0], max: [0.5, 1, 0] },
          lods: [{ level: 0, screenCoverageMin: 0.01, vertexCount: 4, triangleCount: 2, meshoptQuantized: false }],
          maps: { ktx2Compressed: true, texelDensityPxPerM: 256, resolutionPx: 512 },
          materialZones: [],
          physics: { bodyKind: 'kinematic', massKg: 1, surfaceTag: 'sprite', colliders: [] },
          sockets: [],
          impliedGeometryVerified: true,
          createdAt: Date.now(),
        };
        const budget = validatePrefabBudget(manifest, brief.targetTier ?? 'medium');
        return this.finalizeResult('2d-sprite', manifest, budget, true, [], [], brief, [
          '2D sprite prefab ready for Scene2D + Motion Council spring(320,28) juice & ≥44px touch targets.',
        ]);
      },
    });
  }

  private finalizeResult(
    pipeline: AssetPipelineKind,
    manifest: CompiledPrefabManifest,
    budget: PrefabBudgetReport,
    walkabilityPass: boolean,
    probes: BakedIrradianceProbe[],
    reflectionBoxes: ParallaxReflectionBox[],
    brief: AriaProductionBrief,
    notes: string[],
    previewMesh?: IndexedTriMesh,
    bim3d?: CadModel,
    treeSkeleton?: TreeSkeleton,
    treeSpecies?: TreeSpecies,
  ): AriaProductionResult {
    const dim: GameDimension =
      pipeline === '2d-sprite' ? '2d' :
      pipeline === 'parlor-stage' ? 'parlor' : '3d';

    // Register into PlaykitRegistry so any game or creator tool can spawn this prefab immediately
    this.registry.registerPrefab({
      id: manifest.id,
      name: manifest.name,
      category: pipeline,
      dimension: dim,
      tags: [pipeline, 'aria-compiled', ...(manifest.materialZones.map((m) => m.semanticMaterial))],
      params: [],
    });

    let projectOp: Op | null = null;
    if (brief.targetLevelId) {
      const instId = this.nextId('inst');
      const pos: Vec3 = brief.placeAt ?? [0, 0, 0];
      projectOp = {
        op: 'batch',
        label: `Aria built ${manifest.name} (${pipeline})`,
        ops: [
          {
            op: 'putInstance',
            levelId: brief.targetLevelId,
            instance: {
              id: instId,
              prefab: manifest.id,
              pos,
              rot: [0, 0, 0],
              scale: [1, 1, 1],
              params: {
                pipeline,
                prompt: brief.prompt,
                ariaName: manifest.name,
                ...(typeof brief.params?.seed === 'number' ? { seed: brief.params.seed } : {}),
                ...(typeof brief.params?.stories === 'number' ? { stories: brief.params.stories } : {}),
                ...(typeof brief.params?.widthM === 'number' ? { widthM: brief.params.widthM } : {}),
                ...(typeof brief.params?.depthM === 'number' ? { depthM: brief.params.depthM } : {}),
              },
            },
          },
        ],
      };
    }

    const qa: AriaQaReport = {
      pass: budget.pass && manifest.impliedGeometryVerified && walkabilityPass,
      budget,
      impliedGeometryVerified: manifest.impliedGeometryVerified,
      walkabilityPass,
      notes,
    };

    const summarySentence = `Aria compiled "${manifest.name}" via the ${pipeline} pipeline (${manifest.lods[0]?.triangleCount ?? 0} tris LOD0, ${manifest.lods.length} LODs, QA ${qa.pass ? 'PASS' : 'NEEDS FIX'}).`;

    return {
      pipeline,
      manifest,
      qa,
      probes,
      reflectionBoxes,
      previewMesh,
      bim3d,
      treeSkeleton,
      treeSpecies,
      projectOp,
      summarySentence,
    };
  }

  /** Run Aria's full semantic routing + compilation + QA + GameProject Op pipeline. */
  produce(brief: AriaProductionBrief): AriaProductionResult {
    const pipeline = classifyProductionBrief(brief);
    const skill = [...this.skills.values()].find((s) => s.pipeline === pipeline);
    if (!skill) {
      throw new Error(`No Aria skill registered for pipeline "${pipeline}".`);
    }
    return skill.execute(brief, this);
  }
}
