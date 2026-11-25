// playkit/render/webglLighting.ts
//
// Shared Playkit WebGL2 Live Lighting, Baked L2 SH9 GI Probes, Clustered Forward+ Light Binning,
// and Per-District Local Look Volume Controller.
//
// Architecture note:
//   This is the WebGL2 sibling of `playkit/render/liveLighting.ts` (WebGPU/TSL).
//   It shares the exact same `ClusteredLightManager`, `IrradianceProbeVolume`,
//   `bakeIrradianceProbes`, `WorldLightSpec`, `WorldProbeSite`, and `LocalLookVolume`
//   contracts so worlds authored for WebGL2 games (e.g. Plajah Motorsport: Apex) transfer
//   1:1 to WebGPU/TSL with zero re-authoring.

import * as THREE from 'three';
import { ClusteredLightManager, type ClusterBinningResult, type DynamicLight } from './clusteredLights';
import { IrradianceProbeVolume } from './probesGi';
import { FROXEL_TIER_CONFIGS, type FroxelGridConfig } from './froxelFog';
import {
  bakeIrradianceProbes,
  type BakedIrradianceProbe,
  type BakeLightSource,
} from '../../services/gamestudio/compiler/lightBaker';
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
  /** Optional rhythm beat reactivity multiplier (default 0). */
  beatScale?: number;
  /** If true, light scales down during bright daytime and glows at dusk/night/rain (e.g. streetlamps). */
  nightOnly?: boolean;
  /** Optional category tag ('street' | 'tunnel' | 'harbor' | 'plaza' | 'vehicle'). */
  tag?: string;
}

export interface WorldProbeSite {
  x: number;
  y: number;
  z: number;
  kind: 'canopy' | 'interior' | 'clearing' | 'water' | 'urban' | 'industrial' | 'alpine' | 'tunnel';
  /** Optional overrides for site-specific SH9 bake radiance. */
  skyColor?: Vec3;
  groundColor?: Vec3;
  surfaceAlbedo?: Vec3;
}

export type LocalLookPreset =
  | 'cathedral-blue'
  | 'crystal-vault'
  | 'rift-sanctum'
  | 'titan-bunker'
  | 'canopy-hearth'
  | 'urban-canyon'
  | 'harbor-maritime'
  | 'industrial-foundry'
  | 'pinewood-canopy'
  | 'wine-valley'
  | 'alpine-glacier'
  | 'road-tunnel'
  | 'custom';

/**
 * Per-place spatial GI & atmospheric mood look volume (compatible superset of
 * `playkit/render/liveLighting.ts`'s `LocalLookVolume`).
 */
export interface LocalLookVolume {
  id: string;
  name?: string;
  center: Vec3;
  radiusM: number;
  /** Soft transition band outside `radiusM` (default 80 m for open-world driving / 8 m for arenas). */
  featherM?: number;
  preset?: LocalLookPreset;
  upperBounceHex?: number;
  lowerBounceHex?: number;
  horizonBounceHex?: number;
  interiorMix?: number;
  /** Optional subtle atmospheric fog color tint & density multiplier inside this zone. */
  fogTintHex?: number;
  fogTintWeight?: number;
  fogDensityMul?: number;
}

export const WEBGL_LOOK_VOLUME_PRESETS: Record<
  Exclude<LocalLookPreset, 'custom'>,
  { upper: number; lower: number; horizon: number; interiorMix: number; fogTint?: number; fogWeight?: number; fogDensityMul?: number }
> = {
  'cathedral-blue':     { upper: 0x2a5698, lower: 0x162c52, horizon: 0x2e4e7a, interiorMix: 0.18 },
  'crystal-vault':      { upper: 0x2692b4, lower: 0x0e3c4c, horizon: 0x1f6e86, interiorMix: 0.12 },
  'rift-sanctum':       { upper: 0x3b3a8c, lower: 0x5c4218, horizon: 0x4b3f66, interiorMix: 0.35 },
  'titan-bunker':       { upper: 0x1e5c34, lower: 0x0e2a18, horizon: 0x1a4228, interiorMix: 0.22 },
  'canopy-hearth':      { upper: 0x6b4420, lower: 0x3c2210, horizon: 0x56361a, interiorMix: 0.85 },
  'urban-canyon':       { upper: 0x5e8ec2, lower: 0x5a5046, horizon: 0x7a8ca0, interiorMix: 0.10, fogTint: 0xaec2d8, fogWeight: 0.22, fogDensityMul: 1.05 },
  'harbor-maritime':    { upper: 0x6aa0cc, lower: 0x2b5868, horizon: 0x628ea4, interiorMix: 0.04, fogTint: 0x9ec0d4, fogWeight: 0.30, fogDensityMul: 1.18 },
  'industrial-foundry': { upper: 0x6c7c8c, lower: 0x5e4532, horizon: 0x7c6854, interiorMix: 0.12, fogTint: 0xb6a89c, fogWeight: 0.26, fogDensityMul: 1.15 },
  'pinewood-canopy':    { upper: 0x4d8262, lower: 0x2d4628, horizon: 0x4a6e4a, interiorMix: 0.16, fogTint: 0x9ab8a8, fogWeight: 0.22, fogDensityMul: 1.10 },
  'wine-valley':        { upper: 0x82aae0, lower: 0x685a3a, horizon: 0x928a70, interiorMix: 0.02, fogTint: 0xc8c2b2, fogWeight: 0.20, fogDensityMul: 0.95 },
  'alpine-glacier':     { upper: 0x7cb6f0, lower: 0x7e94ae, horizon: 0x94b8dc, interiorMix: 0.0,  fogTint: 0xb8d4f0, fogWeight: 0.28, fogDensityMul: 0.82 },
  'road-tunnel':        { upper: 0x8a6436, lower: 0x463420, horizon: 0x9c6e34, interiorMix: 0.92, fogTint: 0x5c462e, fogWeight: 0.55, fogDensityMul: 1.85 },
};

/** Shared uniform handles bound into standard & custom WebGL2 materials. */
export interface PlaykitWebGLGiUniforms {
  /** Sky/canopy upper hemisphere GI bounce (linear RGB). */
  uPkGiUpper: { value: THREE.Color };
  /** Shaded underside / street / water lower hemisphere GI bounce (linear RGB). */
  uPkGiLower: { value: THREE.Color };
  /** Dominant L1 directional horizon bounce (linear RGB). */
  uPkGiHorizon: { value: THREE.Color };
  /** Unit world-space direction of dominant horizontal bounce (from SH9 L1). */
  uPkGiBounceDir: { value: THREE.Vector3 };
  /** Interior / tunnel warm enclosure factor [0..1]. */
  uPkGiInteriorMix: { value: number };
  /** Global GI intensity multiplier (0 disables GI cleanly for A/B testing). */
  uPkGiStrength: { value: number };
  /** Shared micro-detail scale (1 on high tier, 0.55 on low tier). */
  uPkDetailStrength: { value: number };
}

export interface PlaykitWebGLLightingOptions {
  /** Fixed number of native Three.js PointLight slots created once at startup (default 4 on mid/high, 2 on low). */
  activePointLights?: number;
  /** Low-tier GPU flag (reduces active pool & micro-detail budget). */
  lowTier?: boolean;
  /** Max cull distance for clustered dynamic lights (m). */
  maxLightDistanceM?: number;
  /** Optional externally owned ClusteredLightManager (reused for window.__apexPlaykit). */
  clusterManager?: ClusteredLightManager;
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

export interface PlaykitLookFogMod {
  tintColor: THREE.Color;
  tintWeight: number;
  densityMul: number;
  activeVolumeId: string | null;
  activeVolumeName: string | null;
  interiorMix: number;
}

interface StoredLight extends WorldLightSpec {
  id: string;
  colorLinear: Vec3;
  isDynamic: boolean;
}

interface ManagedPointSlot {
  light: THREE.PointLight;
  assignedId: string | null;
  targetIntensity: number;
  currentIntensity: number;
  targetRange: number;
  beatScale: number;
  color: THREE.Color;
}

function hexToLinearVec3(hex: number): Vec3 {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

let pointLightSkipPatched = false;
/**
 * Guard Three.js's WebGL2 `NUM_POINT_LIGHTS` loop with `if ( directLight.visible )` so pixels
 * outside a streetlamp's cutoff radius skip the full GGX specular/diffuse BRDF!
 * Safe to call repeatedly (also re-checked after CSM replaces `lights_fragment_begin`).
 */
export function patchPointLightVisibilitySkip(): void {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  if (!src) return;
  const ptIdx = src.indexOf('NUM_POINT_LIGHTS');
  if (ptIdx < 0) return;
  const spotIdx = src.indexOf('NUM_SPOT_LIGHTS', ptIdx);
  const head = src.slice(0, ptIdx);
  const block = spotIdx > ptIdx ? src.slice(ptIdx, spotIdx) : src.slice(ptIdx);
  const tail = spotIdx > ptIdx ? src.slice(spotIdx) : '';
  const needle = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
  if (block.includes('if ( directLight.visible ) ' + needle)) {
    pointLightSkipPatched = true;
    return;
  }
  if (block.includes(needle)) {
    THREE.ShaderChunk.lights_fragment_begin =
      head + block.replace(needle, 'if ( directLight.visible ) ' + needle) + tail;
    pointLightSkipPatched = true;
  }
  void pointLightSkipPatched;
}

/**
 * Shared GLSL declarations for WebGL2 materials receiving Playkit L2 SH9 GI bounce.
 * Keep in sync with `PK_WEBGL_GI_INJECT`.
 */
export const PK_WEBGL_GI_PARS = /* glsl */ `
uniform vec3 uPkGiUpper;
uniform vec3 uPkGiLower;
uniform vec3 uPkGiHorizon;
uniform vec3 uPkGiBounceDir;
uniform float uPkGiInteriorMix;
uniform float uPkGiStrength;
`;

/**
 * Physically-modulated Playkit L2 SH9 hemisphere + L1 directional bounce injection.
 * Placed right before `#include <lights_fragment_end>` (or inside `#include <lights_fragment_end>`
 * BEFORE `#include <aomap_fragment>`) so Three.js multiplies it by `diffuseColor.rgb` AND
 * ambient occlusion — crevices stay crisp & grounded while undersides and facades receive
 * authentic sky, street, water, foliage, and tunnel bounce!
 */
export function buildPlaykitGiInjectGlsl(scaleExpr = '1.0'): string {
  return /* glsl */ `
{
  float pkStr = uPkGiStrength * (${scaleExpr});
  if (pkStr > 0.001) {
    vec3 pkWn = normalize(inverseTransformDirection(geometryNormal, viewMatrix));
    float pkUp = clamp(pkWn.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 pkHemi = mix(uPkGiLower, uPkGiUpper, pkUp);
    float pkSide = clamp(dot(pkWn, uPkGiBounceDir) * 0.5 + 0.5, 0.0, 1.0);
    vec3 pkBounce = mix(pkHemi, uPkGiHorizon, pkSide * 0.34);
    vec3 pkInterior = mix(vec3(0.46, 0.31, 0.16), vec3(0.72, 0.50, 0.24), pkUp);
    vec3 pkFinalGi = mix(pkBounce, pkInterior, clamp(uPkGiInteriorMix * 0.72, 0.0, 0.85));
    // Energy-conserving diffuse GI (dielectrics get full bounce, bare metals stay clean)
    vec3 pkDiffAlb = diffuseColor.rgb * (1.0 - metalnessFactor * 0.75);
    reflectedLight.indirectDiffuse += pkFinalGi * pkDiffAlb * pkStr;
  }
}
`;
}

/**
 * WebGL2 Live Scene Lighting & SH9 GI Controller.
 * Drop-in architectural sibling of `PlaykitSceneLightingController` (`liveLighting.ts`):
 *   1. Manages thousands of world lights (streetlamps, tunnels, harbor floods, vehicle headlights)
 *      through Playkit's `ClusteredLightManager` (256 active frustum window) and smoothly cross-fades
 *      a constant-size native `THREE.PointLight` pool (zero mid-game WebGL shader recompiles!).
 *   2. Bakes and evaluates real L2 SH9 irradiance probes (`IrradianceProbeVolume` + `bakeIrradianceProbes`).
 *   3. Smoothly blends per-district `LocalLookVolume` GI bounce & atmospheric fog moods.
 */
export class PlaykitWebGLLightingController {
  readonly clusterManager: ClusteredLightManager;
  readonly probeVolume: IrradianceProbeVolume;
  readonly froxelConfig: FroxelGridConfig;
  readonly uniforms: PlaykitWebGLGiUniforms;
  readonly fogMod: PlaykitLookFogMod = {
    tintColor: new THREE.Color(0xbcd0e2),
    tintWeight: 0,
    densityMul: 1,
    activeVolumeId: null,
    activeVolumeName: null,
    interiorMix: 0,
  };

  private readonly parent: THREE.Object3D;
  private readonly slots: ManagedPointSlot[] = [];
  private readonly worldLights = new Map<string, StoredLight>();
  private readonly maxDistSq: number;
  private readonly palette: Required<NonNullable<PlaykitWebGLLightingOptions['palette']>>;
  private readonly interiorSites: WorldProbeSite[] = [];
  private readonly lookVolumes: LocalLookVolume[] = [];
  private _activeLookVolumeId: string | null = null;
  private _activeLookVolumeName: string | null = null;
  private _enabled = true;
  private _giScale = 0.24;

  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpUp = new THREE.Vector3();
  private readonly tmpCamPos = new THREE.Vector3();
  private readonly tmpCol = new THREE.Color();
  private readonly tmpVolUp = new THREE.Color();
  private readonly tmpVolDn = new THREE.Color();
  private readonly tmpVolHz = new THREE.Color();
  private readonly tmpFogTint = new THREE.Color();
  private readonly tmpNightLo = new THREE.Color(0x52341a);
  private readonly tmpNightHi = new THREE.Color(0x0c1830);
  private readonly tmpBounceDir = new THREE.Vector3(0.4, 0.2, 0.8).normalize();
  private lastBin: ClusterBinningResult | null = null;
  private binTimer = 1;
  private nextAutoId = 0;
  private poolVisible = false;

  constructor(parent: THREE.Object3D, opts: PlaykitWebGLLightingOptions = {}) {
    this.parent = parent;
    const lo = Boolean(opts.lowTier);
    const maxDist = opts.maxLightDistanceM ?? (lo ? 140 : 240);
    this.maxDistSq = maxDist * maxDist;

    // Fast-skip GGX PBR BRDF per pixel for out-of-range PointLights in WebGL2 (stock Three.js ignores directLight.visible!)
    patchPointLightVisibilitySkip();

    this.clusterManager = opts.clusterManager ?? new ClusteredLightManager({
      maxTotalLights: 256,
      far: maxDist,
    });
    this.probeVolume = new IrradianceProbeVolume();
    this.froxelConfig = {
      ...(lo ? FROXEL_TIER_CONFIGS.low : FROXEL_TIER_CONFIGS.high),
      far: Math.min(260, maxDist * 1.1),
      baseDensity: 0.00018,
      heightFalloff: 0.0032,
      anisotropyG: 0.62,
      fogColor: [0.62, 0.72, 0.84],
    };

    this.palette = {
      skyColor: opts.palette?.skyColor ?? [0.42, 0.64, 0.92],
      canopyBounceColor: opts.palette?.canopyBounceColor ?? [0.24, 0.44, 0.28],
      groundColor: opts.palette?.groundColor ?? [0.24, 0.22, 0.19],
      interiorWarmColor: opts.palette?.interiorWarmColor ?? [0.68, 0.46, 0.22],
      sunColor: opts.palette?.sunColor ?? [1.0, 0.88, 0.70],
      sunDir: opts.palette?.sunDir ?? [-0.65, 0.52, -0.35],
    };

    this.uniforms = {
      uPkGiUpper: { value: new THREE.Color(0x6c96c8) },
      uPkGiLower: { value: new THREE.Color(0x4a443c) },
      uPkGiHorizon: { value: new THREE.Color(0x7c8692) },
      uPkGiBounceDir: { value: new THREE.Vector3(-0.6, 0.15, -0.3).normalize() },
      uPkGiInteriorMix: { value: 0 },
      uPkGiStrength: { value: this._giScale },
      uPkDetailStrength: { value: lo ? 0.55 : 1.0 },
    };

    // Constant-size native PointLight pool created once; binary-toggled visible=false during clear daytime
    // so NUM_POINT_LIGHTS=0 in daylight (0.0 ms overhead), and visible=true as a fixed pool at dusk/night/tunnel.
    const slotCount = opts.activePointLights ?? (lo ? 2 : 4);
    for (let i = 0; i < slotCount; i++) {
      const light = new THREE.PointLight(0xffb866, 0, 0.001, 1.8);
      light.name = `playkit-webgl-cluster-light-${i}`;
      light.position.set(0, -10000, 0);
      light.visible = false;
      parent.add(light);
      this.slots.push({
        light,
        assignedId: null,
        targetIntensity: 0,
        currentIntensity: 0,
        targetRange: 28,
        beatScale: 0,
        color: new THREE.Color(0xffb866),
      });
    }
  }

  /** Enable/disable Playkit GI & clustered lights at runtime (for Settings / A/B testing). */
  setEnabled(on: boolean): void {
    this._enabled = on;
    this.uniforms.uPkGiStrength.value = on ? this._giScale : 0;
    if (!on) {
      this.poolVisible = false;
      for (const s of this.slots) {
        s.targetIntensity = 0;
        s.currentIntensity = 0;
        s.light.intensity = 0;
        s.light.distance = 0.001;
        s.light.visible = false;
      }
      this.fogMod.tintWeight = 0;
      this.fogMod.densityMul = 1;
    }
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** Set global GI bounce strength multiplier (default 0.24). */
  setGiStrength(strength: number): void {
    this._giScale = Math.max(0, Math.min(1.0, strength));
    if (this._enabled) this.uniforms.uPkGiStrength.value = this._giScale;
  }

  /** Register static world lights (streetlamps, tunnels, harbor floodlights, plaza fixtures). */
  addLights(specs: ReadonlyArray<WorldLightSpec>): number {
    let added = 0;
    for (const s of specs) {
      const id = s.id ?? `pk_wl_${this.nextAutoId++}`;
      const stored: StoredLight = {
        ...s,
        id,
        colorLinear: hexToLinearVec3(s.colorHex),
        isDynamic: false,
      };
      this.worldLights.set(id, stored);
      added++;
    }
    return added;
  }

  /** Upsert a live dynamic light (e.g. car headlight bounce, brake glow, police beacon). */
  upsertDynamicLight(spec: WorldLightSpec & { id: string }): void {
    const existing = this.worldLights.get(spec.id);
    if (existing) {
      existing.x = spec.x;
      existing.y = spec.y;
      existing.z = spec.z;
      existing.intensity = spec.intensity;
      existing.range = spec.range;
      if (existing.colorHex !== spec.colorHex) {
        existing.colorHex = spec.colorHex;
        existing.colorLinear = hexToLinearVec3(spec.colorHex);
      }
      existing.nightOnly = spec.nightOnly;
      existing.tag = spec.tag;
    } else {
      this.worldLights.set(spec.id, {
        ...spec,
        colorLinear: hexToLinearVec3(spec.colorHex),
        isDynamic: true,
      });
    }
  }

  removeLight(id: string): boolean {
    this.clusterManager.remove(id);
    return this.worldLights.delete(id);
  }

  clearStaticLights(tag?: string): void {
    for (const [id, l] of this.worldLights) {
      if (l.isDynamic) continue;
      if (!tag || l.tag === tag) {
        this.worldLights.delete(id);
        this.clusterManager.remove(id);
      }
    }
  }

  /**
   * Bake L2 SH9 irradiance probes using Plajah's real spherical-harmonic light baker
   * (`services/gamestudio/compiler/lightBaker.ts`), including synthetic canyon/tunnel
   * enclosure proxy geometry for urban streets and tunnels so 1-bounce occlusion is authentic.
   */
  bakeProbes(sites: ReadonlyArray<WorldProbeSite>): BakedIrradianceProbe[] {
    const baked: BakedIrradianceProbe[] = [];
    const emptyScene: IndexedTriMesh = { positions: new Float32Array(0), indices: new Uint32Array(0) };

    for (let i = 0; i < sites.length; i++) {
      const s = sites[i];
      if (s.kind === 'interior' || s.kind === 'tunnel') this.interiorSites.push(s);

      const skyCol: Vec3 = s.skyColor ?? (
        s.kind === 'tunnel' || s.kind === 'interior' ? this.palette.interiorWarmColor :
        s.kind === 'canopy' ? this.palette.canopyBounceColor :
        s.kind === 'water' ? [0.36, 0.60, 0.80] :
        s.kind === 'urban' ? [0.40, 0.62, 0.88] :
        s.kind === 'industrial' ? [0.44, 0.50, 0.58] :
        s.kind === 'alpine' ? [0.54, 0.76, 1.0] :
        this.palette.skyColor
      );

      const groundCol: Vec3 = s.groundColor ?? (
        s.kind === 'tunnel' || s.kind === 'interior' ? [0.34, 0.22, 0.12] :
        s.kind === 'water' ? [0.14, 0.34, 0.42] :
        s.kind === 'urban' ? [0.28, 0.25, 0.22] :
        s.kind === 'industrial' ? [0.32, 0.23, 0.17] :
        s.kind === 'alpine' ? [0.46, 0.54, 0.66] :
        s.kind === 'canopy' ? [0.14, 0.24, 0.13] :
        this.palette.groundColor
      );

      const albedo: Vec3 = s.surfaceAlbedo ?? (
        s.kind === 'tunnel' ? [0.44, 0.36, 0.26] :
        s.kind === 'urban' ? [0.46, 0.44, 0.42] :
        s.kind === 'industrial' ? [0.42, 0.34, 0.28] :
        s.kind === 'alpine' ? [0.68, 0.72, 0.78] :
        s.kind === 'canopy' ? [0.22, 0.38, 0.20] :
        [0.42, 0.40, 0.36]
      );

      // Build lightweight proxy bounce geometry for tunnels (ceiling + twin walls) & urban canyons (twin facades)
      let sceneMesh: IndexedTriMesh = emptyScene;
      if (s.kind === 'tunnel' || s.kind === 'interior') {
        const w = 8, h = 6.5, l = 24;
        sceneMesh = {
          positions: new Float32Array([
            // Ceiling
            s.x - w, s.y + h, s.z - l,  s.x + w, s.y + h, s.z - l,
            s.x + w, s.y + h, s.z + l,  s.x - w, s.y + h, s.z + l,
            // Left wall
            s.x - w, s.y - 1, s.z - l,  s.x - w, s.y + h, s.z - l,
            s.x - w, s.y + h, s.z + l,  s.x - w, s.y - 1, s.z + l,
            // Right wall
            s.x + w, s.y - 1, s.z - l,  s.x + w, s.y + h, s.z - l,
            s.x + w, s.y + h, s.z + l,  s.x + w, s.y - 1, s.z + l,
          ]),
          indices: new Uint32Array([
            0, 2, 1, 0, 3, 2,
            4, 5, 6, 4, 6, 7,
            8, 10, 9, 8, 11, 10,
          ]),
        };
      } else if (s.kind === 'urban') {
        // Flanking tall canyon walls for realistic side-bounce SH9 L1 asymmetry
        const w = 18, h = 42, l = 36;
        sceneMesh = {
          positions: new Float32Array([
            s.x - w, s.y, s.z - l,  s.x - w, s.y + h, s.z - l,
            s.x - w, s.y + h, s.z + l,  s.x - w, s.y, s.z + l,
            s.x + w, s.y, s.z - l,  s.x + w, s.y + h, s.z - l,
            s.x + w, s.y + h, s.z + l,  s.x + w, s.y, s.z + l,
          ]),
          indices: new Uint32Array([
            0, 1, 2, 0, 2, 3,
            4, 6, 5, 4, 7, 6,
          ]),
        };
      }

      const lights: BakeLightSource[] = [
        {
          kind: 'directional',
          vec: this.palette.sunDir,
          color: s.kind === 'tunnel' ? [0.40, 0.28, 0.14] : this.palette.sunColor,
          intensity: s.kind === 'tunnel' ? 0.35 : 1.05,
        },
      ];
      if (s.kind === 'tunnel' || s.kind === 'interior') {
        lights.push({
          kind: 'point',
          vec: [s.x, s.y + 4.8, s.z],
          color: [1.0, 0.72, 0.34],
          intensity: 14.0,
          range: 24,
        });
      }

      const res = bakeIrradianceProbes({
        sceneMesh,
        probePositions: [{ id: `probe_${s.kind}_${i}`, position: [s.x, s.y, s.z] }],
        lights,
        skyColor: skyCol,
        groundColor: groundCol,
        surfaceAlbedo: albedo,
        raysPerProbe: 24,
      });
      for (const probe of res.probes) {
        this.probeVolume.addProbe(probe);
        baked.push(probe);
      }
    }
    return baked;
  }

  addLookVolumes(volumes: ReadonlyArray<LocalLookVolume>): number {
    for (const v of volumes) this.lookVolumes.push(v);
    return this.lookVolumes.length;
  }

  get activeLookVolumeId(): string | null {
    return this._activeLookVolumeId;
  }

  get activeLookVolumeName(): string | null {
    return this._activeLookVolumeName;
  }

  get latestClusterBinning(): ClusterBinningResult | null {
    return this.lastBin;
  }

  get activeLightPoolSize(): number {
    return this.slots.length;
  }

  get totalRegisteredLights(): number {
    return this.worldLights.size;
  }

  /**
   * Update frustum-clustered lights, smooth PointLight slot cross-fading, baked L2 SH9 GI
   * uniforms, and per-district LocalLookVolume atmosphere modulation.
   *
   * @param dt           Frame delta time (seconds).
   * @param camera       Active PerspectiveCamera.
   * @param focusPos     Player / car / look-target world position.
   * @param nightFactor  0 = bright noon, 0.55 = dusk, 1.0 = night.
   * @param weatherDim   0 = clear sky, 1 = heavy storm/overcast.
   * @param sunDir       Current world-space unit sun direction (drives directional warm bounce).
   * @param mapMode      True when in high overview map mode (mutes street point lights).
   */
  update(
    dt: number,
    camera: THREE.Camera | null,
    focusPos: THREE.Vector3,
    nightFactor = 0,
    weatherDim = 0,
    sunDir?: THREE.Vector3,
    mapMode = false,
  ): void {
    if (!this._enabled) return;

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

    // Effective streetlamp glow factor (0 in bright clear day, rises smoothly at dusk/night/storm)
    const lampFactor = mapMode
      ? 0
      : Math.max(0, Math.min(1, nightFactor * 1.15 + weatherDim * 0.42));

    // Re-bin nearby world lights into ClusteredLightManager at ~8 Hz (negligible CPU)
    this.binTimer += dt;
    if (this.binTimer >= 0.12) {
      this.binTimer = 0;

      const candidates: Array<{
        l: StoredLight;
        effIntensity: number;
        score: number;
      }> = [];

      const maxD2 = this.maxDistSq;
      for (const l of this.worldLights.values()) {
        const effScale = l.nightOnly ? lampFactor : (mapMode ? 0 : 1);
        const effIntensity = l.intensity * effScale;
        if (effIntensity <= 0.05) continue;

        const dx = l.x - focusPos.x;
        const dy = l.y - focusPos.y;
        const dz = l.z - focusPos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > maxD2) continue;

        const toCamX = l.x - camPos.x;
        const toCamY = l.y - camPos.y;
        const toCamZ = l.z - camPos.z;
        const invD = 1 / Math.max(0.5, Math.hypot(toCamX, toCamY, toCamZ));
        const forwardDot =
          (toCamX * this.tmpForward.x + toCamY * this.tmpForward.y + toCamZ * this.tmpForward.z) * invD;
        const viewBias = l.isDynamic ? 1.85 : forwardDot > -0.15 ? 1.0 : 0.35;
        const score = (effIntensity * l.range * viewBias) / (18 + d2);
        candidates.push({ l, effIntensity, score });
      }

      candidates.sort((a, b) => b.score - a.score);

      // Populate ClusteredLightManager with the top 256 active nearby lights for frustum cluster binning
      this.clusterManager.clear();
      const clusterCap = Math.min(candidates.length, this.clusterManager.config.maxTotalLights);
      for (let i = 0; i < clusterCap; i++) {
        const c = candidates[i];
        const dl: DynamicLight = {
          id: c.l.id,
          kind: 'point',
          position: [c.l.x, c.l.y, c.l.z],
          color: c.l.colorLinear,
          intensity: c.effIntensity,
          range: c.l.range,
        };
        this.clusterManager.upsert(dl);
      }

      if (clusterCap > 0) {
        const persp = camera as THREE.PerspectiveCamera | null;
        const fovRad = persp?.isPerspectiveCamera ? (persp.fov * Math.PI) / 180 : Math.PI * 0.36;
        const aspect = persp?.isPerspectiveCamera ? persp.aspect : 16 / 9;
        this.lastBin = this.clusterManager.binForCamera(
          [camPos.x, camPos.y, camPos.z],
          [this.tmpForward.x, this.tmpForward.y, this.tmpForward.z],
          [this.tmpRight.x, this.tmpRight.y, this.tmpRight.z],
          [this.tmpUp.x, this.tmpUp.y, this.tmpUp.z],
          fovRad,
          aspect,
        );
      } else {
        this.lastBin = null;
      }

      // Sticky hysteresis assignment to our fixed WebGL2 PointLight slots (zero light popping)
      const chosen = candidates.slice(0, this.slots.length);
      const chosenById = new Map(chosen.map((c) => [c.l.id, c]));
      const usedSlots = new Set<number>();

      for (let i = 0; i < this.slots.length; i++) {
        const slot = this.slots[i];
        if (slot.assignedId && chosenById.has(slot.assignedId)) {
          const c = chosenById.get(slot.assignedId)!;
          slot.targetIntensity = c.effIntensity;
          slot.targetRange = c.l.range;
          slot.beatScale = c.l.beatScale ?? 0;
          if (c.l.isDynamic) {
            slot.light.position.set(c.l.x, c.l.y, c.l.z);
            slot.color.setHex(c.l.colorHex);
            slot.light.color.copy(slot.color);
          }
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
          slot.assignedId = next.l.id;
          slot.light.position.set(next.l.x, next.l.y, next.l.z);
          slot.color.setHex(next.l.colorHex);
          slot.light.color.copy(slot.color);
          slot.targetRange = next.l.range;
          slot.targetIntensity = next.effIntensity;
          slot.beatScale = next.l.beatScale ?? 0;
        } else {
          slot.assignedId = null;
          slot.targetIntensity = 0;
        }
      }
    }

    // Keep dynamic vehicle/moving slots tracking smoothly at 60 Hz between cluster re-bins
    const fadeAlpha = Math.min(1, dt * 8.0);
    let anySlotLit = false;
    for (const slot of this.slots) {
      if (slot.assignedId) {
        const live = this.worldLights.get(slot.assignedId);
        if (live?.isDynamic) {
          slot.light.position.set(live.x, live.y, live.z);
          const effScale = live.nightOnly ? lampFactor : (mapMode ? 0 : 1);
          slot.targetIntensity = live.intensity * effScale;
        }
      }
      slot.currentIntensity += (slot.targetIntensity - slot.currentIntensity) * fadeAlpha;
      if (slot.currentIntensity > 0.04) {
        slot.light.intensity = slot.currentIntensity;
        slot.light.distance = slot.targetRange;
        anySlotLit = true;
      } else {
        slot.light.intensity = 0;
        slot.light.distance = 0.001;
        if (slot.targetIntensity > 0.04) anySlotLit = true;
      }
    }
    // Binary toggle ALL slots together (0 in bright daytime outdoor -> fixed pool size at dusk/night/tunnel)
    if (anySlotLit !== this.poolVisible) {
      this.poolVisible = anySlotLit;
      for (const slot of this.slots) slot.light.visible = anySlotLit;
    }

    // ── Evaluate Baked L2 SH9 GI Probe Volume at focusPos ────────────────────────
    const dayScale = Math.max(0.22, (1 - nightFactor * 0.72) * (1 - weatherDim * 0.28));
    const lerpRate = Math.min(1, dt * 3.5);

    if (this.probeVolume.count > 0) {
      const px = focusPos.x, py = focusPos.y + 1.8, pz = focusPos.z;
      const upIrr = this.probeVolume.sampleIrradiance([px, py, pz], [0, 1, 0], 4);
      const dnIrr = this.probeVolume.sampleIrradiance([px, py, pz], [0, -1, 0], 4);

      // Evaluate opposite horizontal directions toward & away from sun for warm/cool canyon bounce
      const bDir = this.tmpBounceDir;
      if (sunDir) bDir.set(-sunDir.x, 0.15, -sunDir.z).normalize();
      const hzIrr = this.probeVolume.sampleIrradiance([px, py, pz], [bDir.x, bDir.y, bDir.z], 4);

      this.tmpCol.setRGB(
        Math.min(1.2, upIrr[0] * dayScale),
        Math.min(1.2, upIrr[1] * dayScale),
        Math.min(1.2, upIrr[2] * dayScale),
      );
      if (nightFactor > 0.05) this.tmpCol.lerp(this.tmpNightHi, nightFactor * 0.75);
      this.uniforms.uPkGiUpper.value.lerp(this.tmpCol, lerpRate);

      this.tmpCol.setRGB(
        Math.min(1.2, dnIrr[0] * dayScale),
        Math.min(1.2, dnIrr[1] * dayScale),
        Math.min(1.2, dnIrr[2] * dayScale),
      );
      // Warm sodium-amber urban street bounce from below at dusk/night!
      if (nightFactor > 0.05) this.tmpCol.lerp(this.tmpNightLo, nightFactor * 0.65);
      this.uniforms.uPkGiLower.value.lerp(this.tmpCol, lerpRate);

      this.tmpCol.setRGB(
        Math.min(1.2, hzIrr[0] * dayScale),
        Math.min(1.2, hzIrr[1] * dayScale),
        Math.min(1.2, hzIrr[2] * dayScale),
      );
      if (nightFactor > 0.05) this.tmpCol.lerp(this.tmpNightLo, nightFactor * 0.45);
      this.uniforms.uPkGiHorizon.value.lerp(this.tmpCol, lerpRate);
      this.uniforms.uPkGiBounceDir.value.lerp(bDir, lerpRate).normalize();
    }

    // ── Evaluate Per-District Local Look Volumes ─────────────────────────────────
    let interiorMix = 0;
    for (const site of this.interiorSites) {
      const d = Math.hypot(focusPos.x - site.x, (focusPos.y - site.y) * 1.5, focusPos.z - site.z);
      if (d < 22) interiorMix = Math.max(interiorMix, Math.max(0, 1 - d / 22));
    }

    let bestVolId: string | null = null;
    let bestVolName: string | null = null;
    let bestVolWeight = 0;
    let targetFogWeight = 0;
    let targetFogDensityMul = 1;

    for (const v of this.lookVolumes) {
      const dx = focusPos.x - v.center[0];
      const dz = focusPos.z - v.center[2];
      const dy = (focusPos.y - v.center[1]) * 0.35;
      const d = Math.hypot(dx, dy, dz);
      const feather = Math.max(4, v.featherM ?? 80);
      if (d >= v.radiusM + feather) continue;
      const t = d <= v.radiusM ? 1 : 1 - (d - v.radiusM) / feather;
      const w = t * t * (3 - 2 * t);
      if (w > bestVolWeight) {
        bestVolWeight = w;
        bestVolId = v.id;
        bestVolName = v.name ?? v.id;
        const pDef = v.preset && v.preset !== 'custom' ? WEBGL_LOOK_VOLUME_PRESETS[v.preset] : null;
        this.tmpVolUp.setHex(v.upperBounceHex ?? pDef?.upper ?? 0x5e8ec2);
        this.tmpVolDn.setHex(v.lowerBounceHex ?? pDef?.lower ?? 0x4e463e);
        this.tmpVolHz.setHex(v.horizonBounceHex ?? pDef?.horizon ?? 0x748498);
        if (nightFactor > 0.05 && (v.interiorMix ?? pDef?.interiorMix ?? 0) < 0.5) {
          this.tmpVolUp.lerp(this.tmpNightHi, nightFactor * 0.72);
          this.tmpVolDn.lerp(this.tmpNightLo, nightFactor * 0.58);
          this.tmpVolHz.lerp(this.tmpNightLo, nightFactor * 0.42);
        }
        const volInt = v.interiorMix ?? pDef?.interiorMix ?? 0.05;
        interiorMix = Math.max(interiorMix, volInt * w);

        const ftHex = v.fogTintHex ?? pDef?.fogTint;
        if (ftHex !== undefined) {
          this.tmpFogTint.setHex(ftHex);
          targetFogWeight = (v.fogTintWeight ?? pDef?.fogWeight ?? 0.22) * w * (1 - nightFactor * 0.55);
        }
        targetFogDensityMul = 1 + ((v.fogDensityMul ?? pDef?.fogDensityMul ?? 1) - 1) * w;
      }
    }

    this._activeLookVolumeId = bestVolWeight > 0.08 ? bestVolId : null;
    this._activeLookVolumeName = bestVolWeight > 0.08 ? bestVolName : null;

    if (bestVolWeight > 0.001) {
      const volAlpha = Math.min(1, bestVolWeight * lerpRate * 1.45);
      this.uniforms.uPkGiUpper.value.lerp(this.tmpVolUp, volAlpha);
      this.uniforms.uPkGiLower.value.lerp(this.tmpVolDn, volAlpha);
      this.uniforms.uPkGiHorizon.value.lerp(this.tmpVolHz, volAlpha);
    }

    this.uniforms.uPkGiInteriorMix.value +=
      (interiorMix - this.uniforms.uPkGiInteriorMix.value) * Math.min(1, dt * 4.5);

    this.fogMod.tintColor.lerp(this.tmpFogTint, Math.min(1, dt * 3));
    this.fogMod.tintWeight += (targetFogWeight - this.fogMod.tintWeight) * Math.min(1, dt * 3);
    this.fogMod.densityMul += (targetFogDensityMul - this.fogMod.densityMul) * Math.min(1, dt * 3);
    this.fogMod.activeVolumeId = this._activeLookVolumeId;
    this.fogMod.activeVolumeName = this._activeLookVolumeName;
    this.fogMod.interiorMix = this.uniforms.uPkGiInteriorMix.value;
  }

  dispose(): void {
    for (const slot of this.slots) this.parent.remove(slot.light);
    this.slots.length = 0;
    this.worldLights.clear();
    this.clusterManager.clear();
  }
}

export interface WebGLGiMaterialOptions {
  /** Multiplier on top of controller's global GI bounce strength (default 1.0). */
  giScale?: number;
}

/**
 * Enhance any standard WebGL2 `MeshStandardMaterial` / `MeshPhysicalMaterial` in-place
 * with Playkit's L2 SH9 GI bounce. Chains safely onto existing `onBeforeCompile` and
 * preserves `customProgramCacheKey` so shader caches stay deduplicated.
 */
export function enhanceStandardMaterialWithPlaykitGi(
  mat: THREE.MeshStandardMaterial,
  gi: PlaykitWebGLGiUniforms,
  opts: WebGLGiMaterialOptions = {},
): THREE.MeshStandardMaterial {
  if (mat.userData.__playkitWebglGi) return mat;
  mat.userData.__playkitWebglGi = true;

  const scale = opts.giScale ?? 1.0;
  const scaleTag = scale.toFixed(2);
  const prevCompile = mat.onBeforeCompile;
  const prevKeyFn = mat.customProgramCacheKey.bind(mat);
  const isDefaultKey = mat.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey;
  const baseKey = isDefaultKey ? prevKeyFn() : '';

  mat.onBeforeCompile = (shader, renderer) => {
    prevCompile?.call(mat, shader, renderer);
    if (shader.fragmentShader.includes('uPkGiUpper')) return;
    Object.assign(shader.uniforms, gi);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${PK_WEBGL_GI_PARS}`)
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>\n${buildPlaykitGiInjectGlsl(scaleTag)}`,
      );
  };
  mat.customProgramCacheKey = () => `${isDefaultKey ? baseKey : prevKeyFn()}|pk-gi-v1-${scaleTag}`;
  mat.needsUpdate = true;
  return mat;
}
