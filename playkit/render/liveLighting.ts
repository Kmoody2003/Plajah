// playkit/render/liveLighting.ts
//
// Live Playkit WebGPU Lighting, Baked L2 SH9 GI Probes, Clustered Forward+ Light Binning,
// Froxel Volumetric Fog State, and TSL Micro-Detail / Bounce Material Enhancer.
//
// Shared across ALL Plajah games & creator worlds (zero `isFirstParty` branches):
// - Replaces small hardcoded 3–7 PointLight pools with 256-light Clustered Forward+ frustum
//   binning + hysteresis-faded active lights + TSL SH9 irradiance bounce!
// - Enhances any existing `MeshStandardNodeMaterial` in-place with distance-blended micro-detail
//   surface grain + emerald canopy / warm interior SH9 GI bounce without breaking existing nodes.

import * as THREE from 'three/webgpu';
import {
  dot, float, max, mix, mx_fractal_noise_float, normalWorld, positionView, positionWorld,
  pow, smoothstep, uniform, vec3,
} from 'three/tsl';
import { ClusteredLightManager, type ClusterBinningResult, type DynamicLight } from './clusteredLights';
import { IrradianceProbeVolume } from './probesGi';
import { FROXEL_TIER_CONFIGS, type FroxelGridConfig } from './froxelFog';
import { bakeIrradianceProbes, type BakedIrradianceProbe } from '../../services/gamestudio/compiler/lightBaker';
import type { IndexedTriMesh } from '../../services/gamestudio/compiler/schema';
import type { Vec3 } from '../physics/runtime';

export interface WorldLightSpec {
  id?: string;
  x: number;
  y: number;
  z: number;
  /** RGB hex color (e.g. 0xffb050). */
  colorHex: number;
  intensity: number;
  range: number;
  /** Optional rhythm beat reactivity multiplier (default 0.25). */
  beatScale?: number;
}

export interface WorldProbeSite {
  x: number;
  y: number;
  z: number;
  kind: 'canopy' | 'interior' | 'clearing' | 'water';
}

export type LocalLookPreset =
  | 'cathedral-blue'
  | 'crystal-vault'
  | 'rift-sanctum'
  | 'titan-bunker'
  | 'canopy-hearth'
  | 'custom';

/**
 * Per-place spatial GI & mood look volume (e.g. cool sapphire Cathedral interior,
 * bioluminescent cyan Crystal Vault, deep indigo-gold Rift Sanctum, or warm hearth).
 */
export interface LocalLookVolume {
  id: string;
  name?: string;
  center: Vec3;
  radiusM: number;
  /** Soft transition band outside `radiusM` (default 8 m). */
  featherM?: number;
  preset?: LocalLookPreset;
  upperBounceHex?: number;
  lowerBounceHex?: number;
  interiorMix?: number;
}

const LOOK_VOLUME_PRESETS: Record<Exclude<LocalLookPreset, 'custom'>, { upper: number; lower: number; interiorMix: number }> = {
  'cathedral-blue': { upper: 0x2a5698, lower: 0x162c52, interiorMix: 0.18 },
  'crystal-vault':  { upper: 0x2692b4, lower: 0x0e3c4c, interiorMix: 0.12 },
  'rift-sanctum':   { upper: 0x3b3a8c, lower: 0x5c4218, interiorMix: 0.35 },
  'titan-bunker':   { upper: 0x1e5c34, lower: 0x0e2a18, interiorMix: 0.22 },
  'canopy-hearth':  { upper: 0x6b4420, lower: 0x3c2210, interiorMix: 0.85 },
};

export interface PlaykitGiUniforms {
  /** Sky/canopy upper hemisphere GI bounce (RGB linear). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uGiUpper: any;
  /** Shaded underside / forest-floor GI bounce (RGB linear). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uGiLower: any;
  /** Interior warm hearth GI factor [0..1] when player stands inside a treehouse/building. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uGiInteriorMix: any;
  /** Shared distance-fade scale (1 on high tier, 0.55 on low tier). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uDetailStrength: any;
}

export interface PlaykitLightingOptions {
  /** Max simultaneously active Three.js PointLights driven from the 256-light clustered grid. */
  activePointLights?: number;
  /** Low-tier device flag (reduces active pool & micro-detail budget automatically). */
  lowTier?: boolean;
  /** Max cull distance for clustered lights (m). */
  maxLightDistanceM?: number;
  /** Sky/biome palette used when baking L2 SH9 irradiance probes. */
  palette?: {
    skyColor?: Vec3;
    canopyBounceColor?: Vec3;
    groundColor?: Vec3;
    interiorWarmColor?: Vec3;
    sunColor?: Vec3;
    sunDir?: Vec3;
  };
}

interface ManagedPointSlot {
  light: THREE.PointLight;
  assignedId: string | null;
  targetIntensity: number;
  currentIntensity: number;
  beatScale: number;
  range: number;
  color: THREE.Color;
}

function hexToLinearVec3(hex: number): Vec3 {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * Live WebGPU scene lighting & GI controller powered by `ClusteredLightManager` (256 lights),
 * `IrradianceProbeVolume` (L2 SH9), and `FroxelFogGrid`.
 */
export class PlaykitSceneLightingController {
  readonly clusterManager: ClusteredLightManager;
  readonly probeVolume: IrradianceProbeVolume;
  readonly froxelConfig: FroxelGridConfig;
  readonly uniforms: PlaykitGiUniforms;

  private readonly parent: THREE.Object3D;
  private readonly slots: ManagedPointSlot[] = [];
  private readonly lightMeta = new Map<string, { beatScale: number; colorHex: number }>();
  private readonly maxDistSq: number;
  private readonly palette: Required<NonNullable<PlaykitLightingOptions['palette']>>;
  private readonly interiorSites: WorldProbeSite[] = [];
  private readonly lookVolumes: LocalLookVolume[] = [];
  private _activeLookVolumeId: string | null = null;
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpCamPos = new THREE.Vector3();
  private readonly tmpCol = new THREE.Color();
  private readonly tmpVolUp = new THREE.Color();
  private readonly tmpVolDn = new THREE.Color();
  private lastBin: ClusterBinningResult | null = null;
  private binTimer = 1;
  private nextAutoId = 0;

  constructor(parent: THREE.Object3D, opts: PlaykitLightingOptions = {}) {
    this.parent = parent;
    const lo = Boolean(opts.lowTier);
    const maxDist = opts.maxLightDistanceM ?? (lo ? 65 : 115);
    this.maxDistSq = maxDist * maxDist;

    this.clusterManager = new ClusteredLightManager({
      maxTotalLights: 256,
      far: maxDist,
    });
    this.probeVolume = new IrradianceProbeVolume();
    this.froxelConfig = {
      ...(lo ? FROXEL_TIER_CONFIGS.low : FROXEL_TIER_CONFIGS.high),
      far: Math.min(180, maxDist * 1.4),
      baseDensity: 0.0042,
      heightFalloff: 0.032,
      anisotropyG: 0.58,
      fogColor: [0.16, 0.34, 0.36],
    };

    this.palette = {
      skyColor: opts.palette?.skyColor ?? [0.22, 0.38, 0.46],
      canopyBounceColor: opts.palette?.canopyBounceColor ?? [0.14, 0.34, 0.22],
      groundColor: opts.palette?.groundColor ?? [0.08, 0.20, 0.14],
      interiorWarmColor: opts.palette?.interiorWarmColor ?? [0.58, 0.36, 0.16],
      sunColor: opts.palette?.sunColor ?? [0.82, 0.92, 1.0],
      sunDir: opts.palette?.sunDir ?? [-0.42, 0.82, 0.38],
    };

    this.uniforms = {
      uGiUpper: uniform(new THREE.Color(0x284846)),
      uGiLower: uniform(new THREE.Color(0x163222)),
      uGiInteriorMix: uniform(0),
      uDetailStrength: uniform(lo ? 0.55 : 1.0),
    };

    // Create smoothly cross-faded hero PointLight slots driven by the 256-light cluster manager.
    // On high tier, 16 simultaneous local lights (vs legacy 3–7!) keeps the canopy village,
    // treehouses, crystals, and lanterns glowing continuously without light popping.
    const slotCount = opts.activePointLights ?? (lo ? 6 : 16);
    for (let i = 0; i < slotCount; i++) {
      const light = new THREE.PointLight(0xffb050, 0, 16, 2);
      light.name = `playkit-cluster-light-${i}`;
      parent.add(light);
      this.slots.push({
        light,
        assignedId: null,
        targetIntensity: 0,
        currentIntensity: 0,
        beatScale: 0.25,
        range: 16,
        color: new THREE.Color(0xffb050),
      });
    }
  }

  /** Register local dynamic lights (lanterns, hearths, crystals, glowcaps, runes) up to 256+. */
  addLights(specs: ReadonlyArray<WorldLightSpec>): number {
    let added = 0;
    for (const s of specs) {
      const id = s.id ?? `pk_l_${this.nextAutoId++}`;
      const light: DynamicLight = {
        id,
        kind: 'point',
        position: [s.x, s.y, s.z],
        color: hexToLinearVec3(s.colorHex),
        intensity: s.intensity,
        range: s.range,
      };
      this.clusterManager.upsert(light);
      this.lightMeta.set(id, { beatScale: s.beatScale ?? 0.25, colorHex: s.colorHex });
      added++;
    }
    return added;
  }

  /**
   * Bake L2 SH9 irradiance probes at canopy decks, walk-in treehouse interiors, and forest clearings
   * using Plajah's real spherical-harmonic light baker (`services/gamestudio/compiler/lightBaker.ts`).
   */
  bakeProbes(sites: ReadonlyArray<WorldProbeSite>): BakedIrradianceProbe[] {
    const baked: BakedIrradianceProbe[] = [];
    const emptyScene: IndexedTriMesh = { positions: new Float32Array(0), indices: new Uint32Array(0) };

    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (s.kind === 'interior') this.interiorSites.push(s);

      const skyCol: Vec3 =
        s.kind === 'interior' ? this.palette.interiorWarmColor :
        s.kind === 'canopy' ? this.palette.canopyBounceColor :
        s.kind === 'water' ? [0.18, 0.42, 0.48] :
        this.palette.skyColor;

      const groundCol: Vec3 =
        s.kind === 'interior' ? [0.34, 0.20, 0.10] :
        s.kind === 'water' ? [0.06, 0.24, 0.28] :
        this.palette.groundColor;

      // For walk-in interiors, include a real overhead timber roof plane so rays bounce off the ceiling
      const sceneMesh: IndexedTriMesh = s.kind === 'interior'
        ? {
            positions: new Float32Array([
              s.x - 2.4, s.y + 1.4, s.z - 2.4,
              s.x + 2.4, s.y + 1.4, s.z - 2.4,
              s.x + 2.4, s.y + 1.4, s.z + 2.4,
              s.x - 2.4, s.y + 1.4, s.z + 2.4,
            ]),
            indices: new Uint32Array([0, 2, 1, 0, 3, 2]),
          }
        : emptyScene;

      const res = bakeIrradianceProbes({
        sceneMesh,
        probePositions: [{ id: `probe_${s.kind}_${i}`, position: [s.x, s.y, s.z] }],
        lights: [
          {
            kind: 'directional',
            vec: this.palette.sunDir,
            color: s.kind === 'interior' ? [0.45, 0.28, 0.12] : this.palette.sunColor,
            intensity: s.kind === 'interior' ? 0.65 : 1.0,
          },
          ...(s.kind === 'interior'
            ? [{ kind: 'point' as const, vec: [s.x, s.y + 0.6, s.z] as Vec3, color: [1.0, 0.66, 0.32] as Vec3, intensity: 1.8, range: 6 }]
            : []),
        ],
        skyColor: skyCol,
        groundColor: groundCol,
        surfaceAlbedo: s.kind === 'interior' ? [0.42, 0.28, 0.16] : [0.22, 0.36, 0.24],
        raysPerProbe: 24,
      });
      for (const probe of res.probes) {
        this.probeVolume.addProbe(probe);
        baked.push(probe);
      }
    }
    return baked;
  }

  /** Latest frustum cluster binning result (for telemetry / optional WebGPU compute upload). */
  get latestClusterBinning(): ClusterBinningResult | null {
    return this.lastBin;
  }

  get activeLightPoolSize(): number {
    return this.slots.length;
  }

  get totalRegisteredLights(): number {
    return this.clusterManager.count;
  }

  /**
   * Update frustum-clustered lights, smooth light transitions, and SH9 GI probe uniforms.
   * Call once per frame from the level's `update(dt, ...)`.
   */
  update(
    dt: number,
    camera: THREE.Camera | null,
    focusPos: THREE.Vector3,
    beatPulse = 0,
    dayFactor = 0.65,
  ): void {
    const camPos = this.tmpCamPos;
    if (camera) {
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(this.tmpForward);
      this.tmpUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      this.tmpRight.crossVectors(this.tmpForward, this.tmpUp).normalize();
    } else {
      camPos.copy(focusPos);
      this.tmpForward.set(0, 0, -1);
      this.tmpUp.set(0, 1, 0);
      this.tmpRight.set(1, 0, 0);
    }

    // Re-bin clustered lights at ~8 Hz (every 0.12 s) to keep CPU negligible while staying super responsive
    this.binTimer += dt;
    if (this.binTimer >= 0.12) {
      this.binTimer = 0;
      const fovRad = (camera as THREE.PerspectiveCamera | null)?.isPerspectiveCamera
        ? ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180
        : Math.PI * 0.4;
      const aspect = (camera as THREE.PerspectiveCamera | null)?.isPerspectiveCamera
        ? (camera as THREE.PerspectiveCamera).aspect
        : 16 / 9;

      this.lastBin = this.clusterManager.binForCamera(
        [camPos.x, camPos.y, camPos.z],
        [this.tmpForward.x, this.tmpForward.y, this.tmpForward.z],
        [this.tmpRight.x, this.tmpRight.y, this.tmpRight.z],
        [this.tmpUp.x, this.tmpUp.y, this.tmpUp.z],
        fovRad,
        aspect,
      );

      // Select the highest-importance nearby frustum lights for our smooth PointLight slots
      const candidates: Array<{
        id: string;
        x: number; y: number; z: number;
        range: number; intensity: number;
        colorHex: number; beatScale: number;
        score: number;
      }> = [];

      const buf = this.lastBin.gpuLightBuffer;
      const count = this.lastBin.activeLightCount;
      // Map registered lights via iterator matching clusterManager order
      let idx = 0;
      for (const [id, meta] of this.lightMeta) {
        if (idx >= count) break;
        const o = idx * 8;
        const lx = buf[o], ly = buf[o + 1], lz = buf[o + 2], range = buf[o + 3], intensity = buf[o + 7];
        idx++;
        const dx = lx - focusPos.x, dy = ly - focusPos.y, dz = lz - focusPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > this.maxDistSq) continue;
        // Weight lights in front of camera higher so visible canopy lanterns get priority
        const toCamX = lx - camPos.x, toCamY = ly - camPos.y, toCamZ = lz - camPos.z;
        const invD = 1 / Math.max(0.5, Math.hypot(toCamX, toCamY, toCamZ));
        const forwardDot = (toCamX * this.tmpForward.x + toCamY * this.tmpForward.y + toCamZ * this.tmpForward.z) * invD;
        const viewBias = forwardDot > -0.15 ? 1.0 : 0.42;
        const score = (intensity * range * viewBias) / (12 + d2);
        candidates.push({ id, x: lx, y: ly, z: lz, range, intensity, colorHex: meta.colorHex, beatScale: meta.beatScale, score });
      }
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates.slice(0, this.slots.length);
      const chosenById = new Map(chosen.map((c) => [c.id, c]));

      // Sticky slot assignment: preserve already-assigned visible lights to eliminate popping!
      const usedSlots = new Set<number>();
      for (let i = 0; i < this.slots.length; i++) {
        const slot = this.slots[i];
        if (slot.assignedId && chosenById.has(slot.assignedId)) {
          const c = chosenById.get(slot.assignedId)!;
          slot.targetIntensity = c.intensity;
          slot.range = c.range;
          slot.beatScale = c.beatScale;
          chosenById.delete(slot.assignedId);
          usedSlots.add(i);
        }
      }
      const unassigned = [...chosenById.values()];
      let uIdx = 0;
      for (let i = 0; i < this.slots.length; i++) {
        if (usedSlots.has(i)) continue;
        const slot = this.slots[i];
        const next = unassigned[uIdx++];
        if (next) {
          slot.assignedId = next.id;
          slot.light.position.set(next.x, next.y, next.z);
          slot.color.setHex(next.colorHex);
          slot.light.color.copy(slot.color);
          slot.light.distance = next.range;
          slot.range = next.range;
          slot.targetIntensity = next.intensity;
          slot.beatScale = next.beatScale;
        } else {
          slot.assignedId = null;
          slot.targetIntensity = 0;
        }
      }
    }

    // Smooth per-frame cross-fade & rhythm pulse on all active PointLight slots
    const fadeAlpha = Math.min(1, dt * 7.5);
    for (const slot of this.slots) {
      slot.currentIntensity += (slot.targetIntensity - slot.currentIntensity) * fadeAlpha;
      slot.light.intensity = slot.currentIntensity > 0.05
        ? slot.currentIntensity * (1 + beatPulse * slot.beatScale)
        : 0;
    }

    // Evaluate baked L2 SH9 GI probes at player position for live TSL bounce lighting!
    const giScale = 0.55 + 0.45 * Math.max(0, Math.min(1, dayFactor));
    const lerpRate = Math.min(1, dt * 4);
    if (this.probeVolume.count > 0) {
      const upIrr = this.probeVolume.sampleIrradiance([focusPos.x, focusPos.y + 1.2, focusPos.z], [0, 1, 0]);
      const dnIrr = this.probeVolume.sampleIrradiance([focusPos.x, focusPos.y + 1.2, focusPos.z], [0, -1, 0]);
      this.tmpCol.setRGB(
        Math.min(1, upIrr[0] * giScale),
        Math.min(1, upIrr[1] * giScale),
        Math.min(1, upIrr[2] * giScale),
      );
      this.uniforms.uGiUpper.value.lerp(this.tmpCol, lerpRate);
      this.tmpCol.setRGB(
        Math.min(1, dnIrr[0] * giScale),
        Math.min(1, dnIrr[1] * giScale),
        Math.min(1, dnIrr[2] * giScale),
      );
      this.uniforms.uGiLower.value.lerp(this.tmpCol, lerpRate);
    }

    // Detect if the player stepped inside a walk-in CAD/BIM treehouse/shelter for cozy interior bounce
    let interiorMix = 0;
    for (const site of this.interiorSites) {
      const d = Math.hypot(focusPos.x - site.x, (focusPos.y - site.y) * 1.4, focusPos.z - site.z);
      if (d < 3.6) {
        interiorMix = Math.max(interiorMix, Math.max(0, 1 - d / 3.6));
      }
    }

    // Evaluate per-place Local Look & GI Volumes (Cathedral cool-blue, Crystal Vault cyan, Rift Sanctum, Titan Bunker)
    let bestVolId: string | null = null;
    let bestVolWeight = 0;
    for (const v of this.lookVolumes) {
      const d = Math.hypot(focusPos.x - v.center[0], (focusPos.y - v.center[1]) * 1.15, focusPos.z - v.center[2]);
      const feather = Math.max(1, v.featherM ?? 8);
      if (d >= v.radiusM + feather) continue;
      const t = d <= v.radiusM ? 1 : 1 - (d - v.radiusM) / feather;
      const w = t * t * (3 - 2 * t);
      if (w > bestVolWeight) {
        bestVolWeight = w;
        bestVolId = v.id;
        const pDef = v.preset && v.preset !== 'custom' ? LOOK_VOLUME_PRESETS[v.preset] : null;
        this.tmpVolUp.setHex(v.upperBounceHex ?? pDef?.upper ?? 0x2a5698);
        this.tmpVolDn.setHex(v.lowerBounceHex ?? pDef?.lower ?? 0x162c52);
        const volInt = v.interiorMix ?? pDef?.interiorMix ?? 0.2;
        interiorMix = Math.max(interiorMix, volInt * w);
      }
    }
    this._activeLookVolumeId = bestVolWeight > 0.1 ? bestVolId : null;
    if (bestVolWeight > 0.001) {
      this.uniforms.uGiUpper.value.lerp(this.tmpVolUp, Math.min(1, bestVolWeight * lerpRate * 1.6));
      this.uniforms.uGiLower.value.lerp(this.tmpVolDn, Math.min(1, bestVolWeight * lerpRate * 1.6));
    }

    this.uniforms.uGiInteriorMix.value += (interiorMix - this.uniforms.uGiInteriorMix.value) * Math.min(1, dt * 5);
  }

  /** Register per-place local GI & mood look volumes (e.g., cool blue Cathedral, Crystal Vault, Rift Sanctum). */
  addLookVolumes(volumes: ReadonlyArray<LocalLookVolume>): number {
    for (const v of volumes) this.lookVolumes.push(v);
    return this.lookVolumes.length;
  }

  get activeLookVolumeId(): string | null {
    return this._activeLookVolumeId;
  }

  dispose(): void {
    for (const slot of this.slots) this.parent.remove(slot.light);
    this.slots.length = 0;
    this.clusterManager.clear();
  }
}

export interface SurfaceEnhanceOptions {
  /** Micro-detail procedural tiling frequency (cycles per metre). */
  detailTiling?: number;
  /** Strength of close-up micro-detail albedo/roughness variation [0..1]. */
  detailStrength?: number;
  /** Distance range (m) where micro-detail fades out cleanly to zero aliasing. */
  fadeStartM?: number;
  fadeEndM?: number;
  /** SH9 GI ambient bounce intensity (fills shaded canopy undersides & interiors). */
  giBounceStrength?: number;
  /** Optional subtle translucent edge rim (moss/foliage/organic SSS). */
  sssColorHex?: number;
  sssStrength?: number;
}

/**
 * Enhance any existing `THREE.MeshStandardNodeMaterial` in-place with Playkit's:
 *   1. Distance-blended TSL micro-detail relief (crisp bark/timber/stone/moss up close)
 *   2. Baked L2 SH9 GI upper/lower hemisphere bounce (emerald forest undersides + warm treehouse interiors)
 *   3. Optional subsurface rim glow
 * Safe to apply to shared level materials — composes cleanly with existing `emissiveNode` & `roughnessNode`!
 */
export function enhanceMaterialWithPlaykitGi(
  mat: THREE.MeshStandardNodeMaterial,
  gi: PlaykitGiUniforms,
  opts: SurfaceEnhanceOptions = {},
): THREE.MeshStandardNodeMaterial {
  if (mat.userData.__playkitGiEnhanced) return mat;
  mat.userData.__playkitGiEnhanced = true;

  const tiling = opts.detailTiling ?? 7.5;
  const dStrength = opts.detailStrength ?? 0.24;
  const fadeStart = opts.fadeStartM ?? 4.0;
  const fadeEnd = opts.fadeEndM ?? 24.0;
  const giStrength = opts.giBounceStrength ?? 0.22;

  // 1) Distance-blended micro-detail roughness & subtle relief breakup
  if (dStrength > 0.001) {
    const camDist = positionView.length();
    const fade = float(1.0).sub(smoothstep(float(fadeStart), float(fadeEnd), camDist)).mul(gi.uDetailStrength);
    const grain = mx_fractal_noise_float(positionWorld.mul(tiling), 2, 2.0, 0.5).sub(0.5);
    const mod = grain.mul(float(dStrength)).mul(fade);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const baseRough: any = mat.roughnessNode ?? float(mat.roughness ?? 0.85);
    mat.roughnessNode = baseRough.add(mod.mul(0.32)).clamp(0.08, 0.98);
  }

  // 2) Energy-conserving L2 SH9 GI Bounce: modulate by surface albedo (matching WebGL2 diffuseColor.rgb * pkFinalGi)
  //    so shaded undersides receive warm/cool bounce WITHOUT ever washing dark foliage, bark, asphalt, or brick milky-grey!
  //    CRITICAL: hoist `mat.colorNode` into a single WGSL local variable via `.toVar()` so referencing it in `emissiveNode`
  //    NEVER duplicates the entire albedo shader graph (terrain noise/biomes, facade parallax, foliage textures) twice per pixel!
  const upT = normalWorld.y.mul(0.5).add(0.5).clamp(0.0, 1.0);
  const hemiGi = mix(gi.uGiLower.rgb, gi.uGiUpper.rgb, upT);
  const warmInt = vec3(0.55, 0.34, 0.14);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let surfAlb: any;
  if (mat.colorNode) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cachedCol: any = (mat.colorNode as any).toVar();
    mat.colorNode = cachedCol;
    surfAlb = cachedCol.rgb;
  } else {
    surfAlb = vec3(mat.color.r, mat.color.g, mat.color.b);
  }
  const giBounce = mix(hemiGi, warmInt, gi.uGiInteriorMix.mul(0.65)).mul(surfAlb).mul(float(giStrength));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let emissive: any = mat.emissiveNode ? (mat.emissiveNode as any).add(giBounce) : giBounce;

  // 3) Optional subtle subsurface / mossy edge translucency
  if (opts.sssColorHex != null && (opts.sssStrength ?? 0) > 0) {
    const sc = new THREE.Color(opts.sssColorHex);
    const viewDir = positionView.negate().normalize();
    const rim = pow(float(1.0).sub(max(float(0.0), dot(normalWorld, viewDir))), float(2.8));
    emissive = emissive.add(vec3(sc.r, sc.g, sc.b).mul(rim).mul(float(opts.sssStrength!)));
  }

  mat.emissiveNode = emissive;
  return mat;
}
